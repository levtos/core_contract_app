import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { Workbench } from '@/Workbench';
import { ActivateDialog, RollbackDialog } from '@/features/registry/ActivationDialogs';
import { DiffView } from '@/features/registry/DiffView';
import type { Diff } from '@/lib/types';
import { installFakeApi, makeDraft, sampleConfig } from '../../test/fakeApi';
import { idleLive, wrap } from '../../test/harness';
import valid from '../../test/fixtures/validate-ok.json';

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
function app(hash: string) {
  window.location.hash = hash;
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Workbench onSetup={() => {}} live={idleLive()} /></QueryClientProvider>);
}
const revision = (n: number) => ({ revision: n, checksum: String(n).repeat(64), config: sampleConfig(), created_at: '2026-10-16T12:00:00Z' });

it('shows one global save button on the open draft page', async () => {
  installFakeApi({ drafts: [makeDraft('d1', sampleConfig())] }); app('#/changes/drafts/d1');
  await screen.findByRole('heading', { name: 'd1', level: 1 }, { timeout: 5000 });
  expect(screen.getByRole('button', { name: 'Speichern' }).closest('details')).not.toHaveAttribute('open');
  expect(screen.getAllByText('im Entwurf gespeichert')).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Übernehmen' })).toHaveLength(1);
  await userEvent.click(screen.getByLabelText('Weitere Entwurfsaktionen'));
  expect(screen.getAllByRole('button', { name: 'Speichern' })).toHaveLength(1);
  await userEvent.click(screen.getByLabelText('Weitere Entwurfsaktionen'));
  await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
  await screen.findByText('Keine Fehler gefunden');
  expect(screen.getAllByText('Keine Fehler')).toHaveLength(1); // only the global check chip
});

it('keeps the draft identifier, semantic checksum and deadline details under Erweitert', async () => {
  const user = userEvent.setup();
  const id = '12345678-1234-4567-8123-123456789abc';
  installFakeApi({ drafts: [makeDraft(id, sampleConfig(), { display_name: 'Neue Geräte' })] }); app(`#/changes/drafts/${id}`);
  await screen.findByRole('heading', { name: 'Neue Geräte', level: 1 }, { timeout: 5000 });
  await user.click(screen.getByRole('button', { name: 'Prüfen' }));
  expect(await screen.findByText('Der Entwurf ist vollständig und fehlerfrei.')).toBeVisible();
  expect(screen.queryByText(id)).not.toBeInTheDocument();
  expect(screen.queryByText('Semantik-Prüfsumme-Version')).not.toBeInTheDocument();
  expect(screen.queryByText('Fristen bleiben erhalten')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Erweitert' }));
  expect(screen.getByText(id)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Erweitert: technische Änderungen' }));
  expect(screen.getByText('Fristen bleiben erhalten')).toBeVisible();
});

it('shows time, recorded actor and note; exposes rollback only on an older version', async () => {
  installFakeApi({ revisions: [revision(1), { ...revision(2), actor: { kind: 'ingress', role: 'admin' }, note: 'Wohnzimmer ergänzt' }] }); app('#/changes/versions');
  await screen.findByText('Wohnzimmer ergänzt', {}, { timeout: 5000 });
  expect(screen.getByText('Wer: nicht bekannt', { exact: false })).toBeVisible();
  expect(screen.getByText('Administrator · App-Oberfläche', { exact: false })).toBeVisible();
  const old = screen.getByText('Version 1', { exact: true }).closest('li')!;
  const current = screen.getByText('Wohnzimmer ergänzt').closest('li')!;
  await waitFor(() => expect(within(old).getByRole('button', { name: 'Auf diese Version zurücksetzen' })).toBeEnabled());
  expect(within(current).queryByRole('button', { name: /zurücksetzen/ })).toBeNull();
  expect(within(current).getByText('aktiv', { exact: true })).toHaveClass('text-info');
  expect(current.querySelector('details[open]')).toBeNull();
  expect(screen.getByText('Wähle zwei Versionen über die Kästchen links aus.')).toBeVisible();
});

it('invalidates the confirmation when the optional note changes and sends the note with both OCC tokens', async () => {
  const user = userEvent.setup(); const draft = makeDraft('d1', sampleConfig());
  const api = installFakeApi({ drafts: [draft], revisions: [revision(4)] });
  wrap(<ActivateDialog draft={draft} open onOpenChange={() => {}} />, { live: idleLive() });
  const confirm = await screen.findByRole('checkbox', { name: /Ich habe die Auswirkungen geprüft/ });
  await user.click(confirm);
  await user.type(screen.getByLabelText('Notiz zur neuen Version (freiwillig)'), 'Temperatursensor ergänzt');
  expect(screen.getByRole('button', { name: 'Jetzt übernehmen' })).toBeDisabled();
  await user.click(confirm); await user.click(screen.getByRole('button', { name: 'Jetzt übernehmen' }));
  await screen.findByText('Version 5 ist aktiv');
  expect(api.calls.find(call => call.path.endsWith('/activate'))?.body).toEqual({ draft_version: 1, expected_active_revision: 4, note: 'Temperatursensor ergänzt' });
});

it('cannot confirm a rollback dialog opened for the current version', async () => {
  const api = installFakeApi({ revisions: [revision(4)] });
  wrap(<RollbackDialog revision={revision(4)} open onOpenChange={() => {}} />, { live: idleLive() });
  await screen.findByText('Zurücksetzen ist nur auf eine ältere Version möglich.');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByRole('button', { name: 'Zurücksetzen' })).toBeDisabled();
  expect(api.calls.some(call => call.path === 'registry/rollback')).toBe(false);
});

it('describes first activation without warning chips or invented loss of existing contexts', () => {
  const diff = structuredClone(valid.diff) as Diff;
  diff.added = ['new.contract']; diff.objects = { contracts: { added: ['new.contract'], removed: [], changed: [], fields: {}, field_paths: {}, field_paths_truncated: [] } };
  diff.fingerprint_version = { before: null, after: 2, context_migration: true };
  diff.possibly_invalidated_contexts = ['new.contract'];
  const view = wrap(<DiffView diff={diff} />);
  expect(screen.getByText(/Sie beginnen nach dem Übernehmen zum ersten Mal/)).toBeVisible();
  expect(screen.queryByText('Mögliche Neuinitialisierung')).toBeNull();
  expect(view.container.querySelector('[class*="text-warn"]')).toBeNull();
});

it('keeps the warning for an existing context affected by changed semantics', () => {
  const diff = structuredClone(valid.diff) as Diff;
  diff.added = ['new.contract']; diff.possibly_invalidated_contexts = ['new.contract', 'old.contract'];
  wrap(<DiffView diff={diff} />);
  const row = screen.getByText('Mögliche Neuinitialisierung').closest('div')!;
  expect(within(row).getByText('old.contract')).toBeVisible();
  expect(within(row).queryByText('new.contract')).toBeNull();
});

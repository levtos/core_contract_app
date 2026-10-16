import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { Workbench } from '@/Workbench';
import { installFakeApi, reply } from '../../test/fakeApi';
import { idleLive } from '../../test/harness';

function app(hash = '#/sources/devices') {
  window.location.hash = hash;
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Workbench onSetup={() => {}} live={idleLive()} /></QueryClientProvider>);
}
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

it.each([
  ['#/contracts/list/all', 'Neuer Vertrag'],
  ['#/templates/own', 'Neue Vorlage'],
])('opens creation on %s with an automatic draft and no route change', async (hash, name) => {
  const user = userEvent.setup(); const fake = installFakeApi(); app(hash);
  await user.click(await screen.findByRole('button', { name }));
  expect(await screen.findByRole('dialog', { name })).toBeVisible();
  expect(fake.drafts.size).toBe(1);
  expect(window.location.hash).toBe(hash);
});

it('makes a successful explicit check visible', async () => {
  const user = userEvent.setup(); installFakeApi(); app();
  await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
  await user.click(await screen.findByRole('button', { name: 'Prüfen' }));
  expect(await screen.findByText('Prüfung abgeschlossen: keine Fehler')).toBeVisible();
});

it('starts a named draft automatically from a creation action and stays on the source page', async () => {
  const user = userEvent.setup(); const fake = installFakeApi(); app();
  await user.click(await screen.findByRole('button', { name: 'Quelle hinzufügen' }));
  await screen.findByLabelText('Quelle-ID');
  expect(fake.drafts.size).toBe(1);
  expect([...fake.drafts.values()][0]?.display_name).toMatch(/^Änderungen vom /);
  expect(window.location.hash).toBe('#/sources/devices');
  expect(screen.getByRole('button', { name: 'Bearbeiten' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByText(/schreibgeschützte Ansicht/)).not.toBeInTheDocument();
});

it('switches to live and back while retaining unsaved edits and the current editor', async () => {
  const user = userEvent.setup(); const fake = installFakeApi(); app();
  await user.click(await screen.findByRole('button', { name: 'Quelle hinzufügen' }));
  const name = await screen.findByLabelText('Anzeigename');
  await user.type(name, 'Fenster im Zimmer');
  await user.click(screen.getByRole('button', { name: 'Live ansehen' }));
  expect(screen.getByText('Deine Änderungen bleiben im Entwurf erhalten.')).toBeVisible();
  expect(screen.queryByLabelText('Anzeigename')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Bearbeiten' }));
  expect(await screen.findByLabelText('Anzeigename')).toHaveValue('Fenster im Zimmer');
  expect(fake.drafts.size).toBe(1);
  expect(fake.revisions).toHaveLength(0);
});

it('opens the error list in place and gives visible feedback after an explicit check', async () => {
  const user = userEvent.setup(); const fake = installFakeApi();
  fake.routes.push({ match: /^registry\/validate$/, method: 'POST', respond: () => reply(200, { valid: false, issues: [{ code: 'config_incomplete', path: '/contracts', message: 'raw technical message' }] }) });
  app();
  await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
  await user.click(await screen.findByRole('button', { name: 'Prüfen' }));
  await user.click(await screen.findByRole('button', { name: '1 Fehler' }));
  expect(await screen.findByRole('dialog', { name: 'Prüfergebnis' })).toBeVisible();
  expect(window.location.hash).toBe('#/sources/devices');
});

it('saves the candidate and opens confirmation from the bar without activating or leaving the page', async () => {
  const user = userEvent.setup(); const fake = installFakeApi(); app();
  await user.click(await screen.findByRole('button', { name: 'Quelle hinzufügen' }));
  await screen.findByLabelText('Quelle-ID');
  await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
  const dialog = await screen.findByRole('dialog', { name: 'Konfiguration übernehmen' });
  await within(dialog).findByRole('checkbox', { name: /Auswirkungen geprüft/ });
  await waitFor(() => expect([...fake.drafts.values()][0]!.draft_version).toBeGreaterThan(1));
  expect(fake.revisions).toHaveLength(0);
  expect(window.location.hash).toBe('#/sources/devices');
});

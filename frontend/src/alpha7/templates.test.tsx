import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { Workbench } from '@/Workbench';
import { RuleEditor, RuleEnvProvider } from '@/editors/RuleEditor';
import { newDefinition, ruleContext, type Rule } from '@/features/authoring/model';
import { installFakeApi } from '../../test/fakeApi';
import { caps, idleLive, Stateful, wrap } from '../../test/harness';

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
function app(hash = '#/templates/own') {
  window.location.hash = hash;
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Workbench onSetup={() => {}} live={idleLive()} /></QueryClientProvider>);
}
it('opens without a red identity error, adds the prefix automatically and creates a consistent Ja/Nein template', async () => {
  const user = userEvent.setup(); const api = installFakeApi(); app();
  await user.click(await screen.findByRole('button', { name: 'Neue Vorlage' }, { timeout: 5000 }));
  const dialog = await screen.findByRole('dialog', { name: 'Neue Vorlage' });
  expect(dialog.querySelector('[aria-invalid="true"]')).toBeNull();
  expect(within(dialog).queryByLabelText('Typ-ID')).not.toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('Name (freiwillig)'), 'Fenster offen');
  await user.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
  await user.click(await screen.findByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect([...api.drafts.values()][0]!.draft_version).toBeGreaterThan(1));
  expect([...api.drafts.values()][0]!.config.definitions).toEqual([expect.objectContaining({
    type_id: 'test.fenster_offen', display_name: 'Fenster offen',
    inputs: [{ name: 'a', schema: { type: 'bool', required: true, physical_state: false } }],
    schema: { fields: { value: { type: 'bool', required: true, physical_state: false } }, available_projection: ['value'] },
    outputs: { value: { op: 'input', name: 'a' } },
  })]);
}, 15_000);

it('uses the singular Feld for built-in templates with one field', async () => {
  installFakeApi(); app('#/templates/built-in');
  await screen.findByRole('heading', { name: 'Eingebaute Vorlagen', level: 1 });
  expect((await screen.findAllByText(/1 Feld$/)).length).toBeGreaterThan(0);
  expect(screen.queryByText(/1 Felder/)).not.toBeInTheDocument();
});

function rule(initial: Rule, changed: (value: Rule) => void = () => {}) {
  wrap(<RuleEnvProvider value={{ ctx: ruleContext(newDefinition('test.einfach', 1), false), caps, locked: false }}><Stateful initial={initial} onValue={value => changed(value as Rule)}>{(value, set) => <RuleEditor value={value as Rule} onChange={set} pointer="/outputs/value" />}</Stateful></RuleEnvProvider>);
}
it('shows only a constant value until its advanced schema is opened', async () => {
  const user = userEvent.setup(); let current: Rule | null = null;
  rule({ op: 'literal', schema: { type: 'bool', required: true, physical_state: false }, value: false }, value => { current = value; });
  expect(screen.queryByLabelText('Typ')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Wert')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Erweitert: Werteart' }));
  await user.selectOptions(screen.getByLabelText('Typ'), 'number');
  expect(current).toMatchObject({ schema: { type: 'number' }, value: 0 });
});

it.each([
  ['stable_for', 'Lange genug Ja', 'Ergibt erst Ja, wenn der Eingang die ganze angegebene Zeit ohne Unterbrechung Ja war.'],
  ['dwell', 'Wartezeit bei Ja', 'Wartet die angegebene Zeit mit durchgehendem Ja ab und ergibt dann Ja.'],
  ['grace', 'Haltefrist', 'Behält bei einer erlaubten Unterbrechung den letzten gültigen Wert bis zum ursprünglichen Fristende bei.'],
  ['edge', 'Wechsel erkannt', 'Ergibt bei einem neu gemeldeten Wechsel zwischen Ja und Nein einmal Ja.'],
  ['delta', 'Differenz', 'Zieht die Vergleichszahl von der aktuellen Zahl ab und zeigt den Unterschied.'],
  ['age', 'Alter der Messung', 'Zeigt, wie viele Sekunden seit der belegten Messung vergangen sind.'],
])('names and explains %s in everyday German', (operation, label, explanation) => {
  rule({ op: 'temporal', id: 'zeitregel', operation, duration_s: 10, args: [{ op: 'input', name: 'a' }, ...(operation === 'delta' ? [{ op: 'input', name: 'a' }] : [])] });
  expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
  expect(screen.getByText(explanation)).toBeVisible();
  expect(screen.queryByText(operation)).not.toBeInTheDocument();
});

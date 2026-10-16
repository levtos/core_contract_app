import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { MachineRestartPanel, type RestartPreview } from '@/features/contracts/MachineRestartPanel';
import { contractState } from '@/features/contracts/presentation';
import { LiveProvider } from '@/lib/live-context';
import type { Envelope } from '@/lib/types';
import { MachineEditor } from '@/editors/MachineEditor';
import { installFakeApi, reply, sampleConfig } from '../../test/fakeApi';
import { idleLive, Stateful, wrap } from '../../test/harness';

const preview: RestartPreview = { contract_id: 'fenster', allowed: true, reason: '', initial: 'bereit', current_state: null, previous_episode: null, registry_revision: 1, state_token: 'a'.repeat(64), direct_contracts: ['direkt'], indirect_contracts: ['danach'], external_automations_known: false, server_time: '2026-10-16T10:00:00Z' };
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
function setup(next = preview) {
  const api = installFakeApi({ revisions: [{ revision: 1, created_at: next.server_time, checksum: 'sum', config: sampleConfig({ contracts: [{ contract_id: 'fenster', display_name: 'Fenster im Bad' }, { contract_id: 'direkt', display_name: 'Direkte Hilfe' }, { contract_id: 'danach', display_name: 'Weitere Hilfe' }] }) }] });
  api.routes.push({ match: /^manual-restarts\/preview\//, respond: () => reply(200, next) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter><LiveProvider store={idleLive()}><MachineRestartPanel contractId="fenster" /></LiveProvider></MemoryRouter></QueryClientProvider>);
  return { api, client, view };
}
async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Ablauf neu starten' }));
  const dialog = await screen.findByRole('dialog', { name: 'Ablauf neu starten' });
  await user.type(within(dialog).getByLabelText('Warum startest du den Ablauf neu?'), 'Gerät geprüft, gezielter Test');
  await user.click(within(dialog).getByRole('checkbox', { name: /Ich habe die Auswirkungen geprüft/ }));
  return dialog;
}

it('shows a visible reason and disables restart when the active definition did not grant permission', async () => {
  setup({ ...preview, allowed: false, reason: 'restart_not_enabled' });
  await screen.findByText(/Die laufende Ablauf-Vorlage erlaubt keinen manuellen Neustart/);
  expect(screen.getByRole('button', { name: 'Ablauf neu starten' })).toBeDisabled();
});

it('shows impact, external automation limits and an exact confirmation before sending one admin restart', async () => {
  const user = userEvent.setup(); const { api } = setup();
  api.routes.push({ match: /^manual-restarts$/, method: 'POST', respond: () => reply(200, { status: 'accepted', command_id: 'fixed', episode_id: 'new', manual_restart: true }) });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ablauf neu starten' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Ablauf neu starten' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/Der Startzustand wird manuell gesetzt und ist nicht durch Sensordaten bestätigt/, { selector: 'p' })).toBeVisible();
  expect(within(dialog).getByRole('link', { name: 'Direkte Hilfe' })).toBeVisible();
  expect(within(dialog).getByRole('link', { name: 'Weitere Hilfe' })).toBeVisible();
  expect(within(dialog).getByText(/Externe Automationen sind Terra nicht vollständig bekannt/)).toBeVisible();
  const execute = within(dialog).getByRole('button', { name: 'Jetzt manuell neu starten' });
  expect(execute).toBeDisabled();
  await user.click(within(dialog).getByRole('checkbox', { name: /Ich habe die Auswirkungen geprüft/ }));
  expect(execute).toBeDisabled();
  await user.type(within(dialog).getByLabelText('Warum startest du den Ablauf neu?'), 'Bewusst geprüft');
  await user.click(execute);
  await within(dialog).findByText(/Der Ablauf wurde manuell neu gestartet/);
  const calls = api.calls.filter(call => call.method === 'POST' && call.path === 'manual-restarts');
  expect(calls).toHaveLength(1);
  expect(calls[0]!.body).toMatchObject({ contract_id: 'fenster', confirm: true, reason: 'Bewusst geprüft', expected_registry_revision: 1, expected_state_token: preview.state_token });
  expect(calls[0]!.body).not.toHaveProperty('origin'); expect(calls[0]!.body).not.toHaveProperty('target_state');
  expect(execute).toBeDisabled();
});

it('invalidates confirmation if the checked registry or state changes', async () => {
  const user = userEvent.setup(); const { client, api } = setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ablauf neu starten' })).toBeEnabled());
  const dialog = await confirm(user);
  act(() => client.setQueriesData({ queryKey: ['manual-restart', 'fenster'] }, { ...preview, registry_revision: 2, state_token: 'b'.repeat(64) }));
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Jetzt manuell neu starten' })).toBeDisabled());
  expect(within(dialog).getByText(/Der Ablauf oder die Konfigurationsversion hat sich geändert/)).toBeVisible();
  expect(api.calls.filter(call => call.method === 'POST' && call.path === 'manual-restarts')).toHaveLength(0);
});

it('recovers a lost response with the stored command id without submitting a second restart', async () => {
  const user = userEvent.setup(); const { api } = setup();
  api.routes.push({ match: /^manual-restarts$/, respond: async () => { throw new TypeError('synthetic connection failure'); } });
  api.routes.push({ match: /^commands\//, respond: () => reply(200, { status: 'accepted', manual_restart: true }) });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ablauf neu starten' })).toBeEnabled());
  const dialog = await confirm(user);
  await user.click(within(dialog).getByRole('button', { name: 'Jetzt manuell neu starten' }));
  await within(dialog).findByText(/Es ist noch unklar, ob die Anfrage ausgeführt wurde/);
  await user.click(within(dialog).getByRole('button', { name: 'Ergebnis abfragen' }));
  await within(dialog).findByText(/Der Ablauf wurde manuell neu gestartet/);
  const posts = api.calls.filter(call => call.path === 'manual-restarts' && call.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(api.calls.some(call => call.path === `commands/${(posts[0]!.body as { command_id: string }).command_id}`)).toBe(true);
});

it('does not send after the component is unmounted while waiting for the server clock', async () => {
  const user = userEvent.setup(); const { api, view } = setup(); let finish: (() => void) | undefined;
  api.routes.push({ match: /^info$/, respond: async () => { await new Promise<void>(resolve => { finish = resolve; }); return reply(200, { server_time: preview.server_time }); } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ablauf neu starten' })).toBeEnabled());
  const dialog = await confirm(user);
  await user.click(within(dialog).getByRole('button', { name: 'Jetzt manuell neu starten' }));
  await waitFor(() => expect(finish).toBeDefined()); view.unmount();
  await act(async () => { finish!(); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(api.calls.filter(call => call.path === 'manual-restarts' && call.method === 'POST')).toHaveLength(0);
});

it('defaults the editor opt-in to off and preserves a deliberate grant; the contract chip distinguishes manual starts', async () => {
  const user = userEvent.setup(); let value = {};
  const initial = { id: 'ablauf', states: ['bereit'], initial: 'bereit', transitions: [], commands: {}, reinitialize_when: { op: 'literal', value: false, schema: { type: 'bool', required: true, physical_state: false } } };
  wrap(<Stateful initial={initial} onValue={next => { value = next; }}>{(current, set) => <MachineEditor pointer="/machine" value={current} definition={{ inputs: [] }} caps={undefined} onChange={set} locked={false} />}</Stateful>);
  const grant = screen.getByRole('checkbox', { name: 'Administratoren dürfen diesen Ablauf manuell neu starten' });
  expect(grant).not.toBeChecked(); await user.click(grant);
  expect(value).toHaveProperty('allow_manual_restart', true);
  const state = contractState({ fields: {}, state_machine: { manual_restart: true }, contract_health: 'degraded' } as unknown as Envelope, true);
  expect(state).toMatchObject({ label: 'Manuell gestartet', tone: 'info' });
});

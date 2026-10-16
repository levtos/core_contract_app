import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Workbench } from '@/Workbench';
import { contractSources, contractState, contractValue, fieldsForContract } from '@/features/contracts/presentation';
import { historyPoints } from '@/features/contracts/ContractSummary';
import type { Envelope, HaEntity } from '@/lib/types';
import { installFakeApi, reply, sampleConfig } from '../../test/fakeApi';
import { idleLive } from '../../test/harness';

const at = '2026-10-16T10:00:00Z';
const config = sampleConfig({
  sources: [{ source_id: 'source.heat', source_type: 'numeric', display_name: 'Gespeicherter Sensorname', value_schema: { type: 'number', unit: '°C' } }],
  bindings: [{ binding_id: 'binding.heat', source_id: 'source.heat', adapter: { kind: 'ha_state', ha_entity_id: 'sensor.zimmer' } }],
  contracts: [{ contract_id: 'zimmer', display_name: 'Temperatur im Zimmer', type_id: 'test.echo', type_version: 1, enabled: true, inputs: [{ name: 'a', ref: 'source.heat' }] }],
});
const field = { status: 'valid' as const, value: 21.5, quality: 'healthy' as const, reasons: [], evidence: [] };
const envelope: Envelope = { contract_id: 'zimmer', enabled: true, type: { type_id: 'test.echo', type_version: 1 }, fields: { value: { ...field, reasons: [], evidence: [] } }, contract_health: 'healthy', available: true, computed_at: at, published_at: at, publication_seq: 1, registry_revision: 1, epoch_id: 'e1' };
const entities = [{ entity_id: 'sensor.zimmer', display_name: 'Zimmerthermometer' } as HaEntity];
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

function app(hash: string, liveEnvelope = envelope) {
  window.location.hash = hash;
  const store = idleLive();
  vi.spyOn(store, 'getSnapshot').mockReturnValue({ ...store.getSnapshot(), contracts: { zimmer: liveEnvelope }, registryRevision: 1, stale: false, connection: 'open' });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Workbench onSetup={() => {}} live={store} /></QueryClientProvider>);
}
function fake() {
  const api = installFakeApi({ revisions: [{ revision: 1, config, checksum: 'sum', created_at: at }] });
  api.routes.push({ match: /^ha\/entities/, respond: () => reply(200, { items: entities, next_cursor: null, read_only: true }) });
  return api;
}

it('formats values in German without treating unknown as false', () => {
  expect(contractValue(envelope, { value: { type: 'number', unit: '°C', required: true, physical_state: false } })).toBe('21,5 °C');
  expect(contractValue({ ...envelope, fields: { value: { ...envelope.fields.value!, value: false } } }, {})).toBe('Nein');
  expect(contractValue({ ...envelope, fields: { value: { ...envelope.fields.value!, value: null, status: 'unknown' } } }, {})).toBe('unbekannt');
  expect(contractState(envelope, true, true).label).toBe('Entwurf');
  expect(contractState(envelope, false).tone).toBe('neutral');
});

it('resolves HA names through upstream inputs and protects against cycles', () => {
  const chained = { ...config, contracts: [...config.contracts as [], { contract_id: 'downstream', inputs: [{ ref: 'zimmer.value' }, { ref: 'downstream' }] }] };
  expect(contractSources('downstream', chained, entities)).toEqual([{ id: 'source.heat', name: 'Zimmerthermometer', entityId: 'sensor.zimmer', sourceIndex: 0 }]);
  expect(contractSources('zimmer', config, [])[0]?.name).toBe('Gespeicherter Sensorname');
});

it('takes units from the supplied active configuration without mutating template fields', () => {
  const types: Parameters<typeof fieldsForContract>[2] = [{ key: 'test.echo@1', type_id: 'test.echo', type_version: 1, fields: { value: { type: 'number', required: true, physical_state: false } }, origin: 'package', inputs: [], declarative: false, machine: false }];
  expect(fieldsForContract((config.contracts as any[])[0], config, types).value?.unit).toBe('°C');
  expect(types[0]!.fields.value?.unit).toBeUndefined();
});

it('shows only four list columns, a single state chip and the HA name', async () => {
  fake(); app('#/contracts/list/all');
  const table = await screen.findByRole('table', { name: 'Verträge' });
  await within(table).findByText('21,5 °C');
  expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Name', 'Wert', 'Zustand', 'Quelle']);
  expect(await within(table).findByText('Zimmerthermometer')).toBeVisible();
  expect(within(table).getAllByText('Gesund')).toHaveLength(1);
  expect(within(table).getByRole('link', { name: 'Temperatur im Zimmer' })).toHaveAttribute('title', 'zimmer');
});

it('shows now, a sentence for why, named origin and history with gaps', async () => {
  const api = fake();
  api.routes.push({ match: /^history\/query\/contracts/, respond: () => reply(200, { items: [
    { id: '1', contract_id: 'zimmer', registry_revision: 1, published_at: at, fields: { value: field } },
    { id: '2', contract_id: 'zimmer', registry_revision: 1, published_at: '2026-10-16T10:01:00Z', fields: { value: { ...field, value: null, status: 'unknown' } } },
    { id: '3', contract_id: 'zimmer', registry_revision: 1, published_at: '2026-10-16T10:02:00Z', fields: { value: { ...field, value: 22 } } },
  ], next_cursor: null }) });
  app('#/contracts/view/zimmer');
  expect(await screen.findByRole('heading', { name: 'Wert jetzt' })).toBeVisible();
  expect(screen.getByTestId('value-value')).toHaveTextContent('21,5 °C');
  expect(screen.getByRole('heading', { name: 'Warum?' })).toBeVisible();
  expect(screen.getByText('Die benötigten Angaben sind vorhanden und der Server meldet einen gesunden Wert.')).toBeVisible();
  expect(await screen.findByRole('link', { name: 'Zimmerthermometer' })).toBeVisible();
  const chart = await screen.findByRole('img', { name: 'Verlauf: Wert' });
  expect(chart.querySelectorAll('polyline')).toHaveLength(2);
  expect(screen.queryByText('publication_seq')).not.toBeInTheDocument();
});

it('starts a draft-only contract with an explicit draft state and no invented live value', async () => {
  const user = userEvent.setup(); const api = installFakeApi(); app('#/contracts/list/all');
  await user.click(await screen.findByRole('button', { name: 'Neuer Vertrag' }));
  await user.click(await screen.findByRole('button', { name: 'Ohne Gerät anlegen' }));
  await user.type(screen.getByLabelText('Vertrag-ID'), 'mein.neuer');
  await user.click(screen.getByRole('button', { name: 'Anlegen' }));
  expect(await screen.findByText('Dieser Vertrag gehört zum Entwurf. Prüfe ihn und wähle Übernehmen, damit er Werte liefern kann.')).toBeVisible();
  expect(screen.queryByTestId('value-value')).not.toBeInTheDocument();
  expect(api.revisions).toHaveLength(0);
});

it('keeps history scoped to the selected contract and retains unknown samples as gaps', () => {
  const points = historyPoints([
    { id: '1', contract_id: 'other', published_at: at, fields: { value: field } },
    { id: '2', contract_id: 'zimmer', published_at: at, fields: { value: { ...field, status: 'unknown', value: null } } },
    { id: '3', contract_id: 'zimmer', published_at: 'bad', fields: { value: field } },
  ], 'zimmer', 'value');
  expect(points).toHaveLength(1); expect(points[0]?.field?.status).toBe('unknown');
});

it('offers declared flow commands on the detail page and requires confirmation before sending', async () => {
  const user = userEvent.setup(); const api = fake();
  api.revisions[0]!.config = sampleConfig({ contracts: [{ contract_id: 'zimmer', type_id: 'test.state_machine', type_version: 2, enabled: true, inputs: [] }] });
  api.routes.push({ match: /^commands$/, method: 'POST', respond: (_path, body) => reply(200, { command_id: body.command_id, status: 'accepted' }) });
  app('#/contracts/view/zimmer', { ...envelope, type: { type_id: 'test.state_machine', type_version: 2 } });
  expect(await screen.findByRole('button', { name: 'Zustand B anfordern' })).toBeVisible();
  expect(screen.queryByLabelText('Befehl')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Befehle senden/ }));
  expect(api.calls.some(call => call.method === 'POST' && call.path === 'commands')).toBe(false);
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Senden' }));
  expect(await screen.findByText('angenommen')).toBeVisible();
  const command = api.calls.find(call => call.method === 'POST' && call.path === 'commands')!.body as Record<string, unknown>;
  expect(command.command).toBe('request_b'); expect(command.expected_registry_revision).toBe(1);
  expect(command).not.toHaveProperty('state');
});

it('does not label a value from a newer live version with the previous version unit', async () => {
  fake(); app('#/contracts/view/zimmer', { ...envelope, registry_revision: 2 });
  await screen.findByRole('heading', { name: 'Temperatur im Zimmer' });
  expect(screen.queryByTestId('value-value')).not.toBeInTheDocument();
  expect(screen.queryByText('21,5 °C')).not.toBeInTheDocument();
});

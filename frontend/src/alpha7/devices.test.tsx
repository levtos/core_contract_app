import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { Workbench } from '@/Workbench';
import { planDevice, freshnessPreset } from '@/features/sources/devicePlan';
import { isObject } from '@/lib/json';
import type { HaEntity } from '@/lib/types';
import { installFakeApi, reply, sampleConfig } from '../../test/fakeApi';
import { idleLive } from '../../test/harness';

const temperature: HaEntity = { entity_id: 'sensor.zimmer', display_name: 'Temperatur im Zimmer', unit: '°C', device_class: 'temperature', state_class: 'measurement', current_value: '21.5', area_id: 'zimmer', area_name: 'Zimmer', attributes: [] };
const contact: HaEntity = { entity_id: 'binary_sensor.fenster', display_name: 'Fensterkontakt', unit: null, device_class: 'window', state_class: null, current_value: 'off', area_id: 'flur', area_name: 'Flur', attributes: [] };
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
function fake() {
  const api = installFakeApi();
  api.routes.push({ match: /^ha\/entities/, respond: () => reply(200, { items: [temperature, contact], next_cursor: null, read_only: true }) });
  return api;
}
function app(hash = '#/contracts/list/all') {
  window.location.hash = hash;
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Workbench onSetup={() => {}} live={idleLive()} /></QueryClientProvider>);
}

it('creates and takes over a temperature contract in six clicks without entering an identifier or transformation', async () => {
  const user = userEvent.setup(); const api = fake(); app(); let clicks = 0;
  const click = async (target: HTMLElement) => { clicks++; await user.click(target); };
  // The first task page is lazy-loaded; wait for it before counting user clicks.
  await click(await screen.findByRole('button', { name: 'Neuer Vertrag' }, { timeout: 5000 }));
  const wizard = await screen.findByRole('dialog', { name: 'Neuer Vertrag' });
  expect(await within(wizard).findByText('21,5 °C · Zimmer')).toBeVisible();
  await click(within(wizard).getByRole('radio', { name: 'Temperatur im Zimmer' }));
  expect(within(wizard).getByLabelText('Gerätetyp für die Aktualität')).toHaveValue('temperature');
  expect(within(wizard).getByLabelText('Frist in Sekunden')).toHaveValue(900);
  await click(within(wizard).getByRole('button', { name: 'Vertrag anlegen' }));
  await click(await screen.findByRole('button', { name: 'Übernehmen' }));
  const confirm = await screen.findByRole('dialog', { name: 'Konfiguration übernehmen' });
  await click(await within(confirm).findByRole('checkbox', { name: /Auswirkungen geprüft/ }));
  await click(within(confirm).getByRole('button', { name: 'Jetzt übernehmen' }));
  await within(confirm).findByText('Version 1 ist aktiv');
  expect(clicks).toBe(6); expect(api.revisions).toHaveLength(1);
  const result = api.revisions[0]!.config;
  expect(result.dependencies).toHaveLength(1); expect(result.sources).toHaveLength(1); expect(result.bindings).toHaveLength(1); expect(result.contracts).toHaveLength(1);
  expect(result.bindings).toEqual([expect.objectContaining({ transform: { kind: 'type_cast', target: 'number' } })]);
  expect(api.calls.some(call => call.path === 'ha/entities?limit=200&preview=1')).toBe(true);
}, 15_000);

it('filters the guided selection by area and domain and explains contact freshness', async () => {
  const user = userEvent.setup(); fake(); app('#/sources/devices');
  await user.click(await screen.findByRole('button', { name: 'Gerät aus Home Assistant hinzufügen' }));
  const wizard = await screen.findByRole('dialog'); await within(wizard).findByRole('radio', { name: 'Fensterkontakt' });
  await user.selectOptions(within(wizard).getByLabelText('Bereich'), 'flur');
  expect(within(wizard).queryByRole('radio', { name: 'Temperatur im Zimmer' })).not.toBeInTheDocument();
  await user.selectOptions(within(wizard).getByLabelText('Geräteart'), 'binary_sensor');
  await user.click(within(wizard).getByRole('radio', { name: 'Fensterkontakt' }));
  expect(within(wizard).getByLabelText('Wann gilt der Wert als aktuell?')).toHaveValue('event_stateful');
  expect(within(wizard).getByText(/Das Alter allein ist kein Mangel/)).toBeVisible();
  expect(within(wizard).queryByLabelText('Frist in Sekunden')).not.toBeInTheDocument();
  expect(within(wizard).getByText('Nein · Flur')).toBeVisible();
});

it('adds a missing contract input through the guide and explains an incompatible device', async () => {
  const user = userEvent.setup(); const api = fake();
  const bool = { type: 'bool', required: true, physical_state: false };
  api.revisions.push({ revision: 1, created_at: '2026-10-16T10:00:00Z', checksum: 'sum', config: sampleConfig({
    definitions: [{ type_id: 'test.kontakt', type_version: 1, inputs: [{ name: 'geraet', schema: bool }], schema: { fields: { value: bool }, available_projection: ['value'] }, outputs: { value: { op: 'input', name: 'geraet' } } }],
    contracts: [{ contract_id: 'fenster', type_id: 'test.kontakt', type_version: 1, enabled: true, inputs: [] }],
  }) });
  app('#/contracts/view/fenster');
  await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
  await user.click(await screen.findByRole('tab', { name: 'Konfiguration' }));
  await user.click(screen.getByRole('button', { name: 'Quelle fehlt? Gerät hinzufügen' }));
  const wizard = await screen.findByRole('dialog', { name: 'Gerät aus Home Assistant hinzufügen' });
  await user.click(await within(wizard).findByRole('radio', { name: 'Temperatur im Zimmer' }));
  expect(within(wizard).getByRole('button', { name: 'Gerät hinzufügen' })).toBeDisabled();
  expect(within(wizard).getByText(/passt nicht zur Werteart oder Einheit/)).toBeVisible();
  await user.click(within(wizard).getByRole('radio', { name: 'Fensterkontakt' }));
  await user.click(within(wizard).getByRole('button', { name: 'Gerät hinzufügen' }));
  await user.click(await screen.findByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect([...api.drafts.values()][0]!.config.contracts).toEqual([expect.objectContaining({ inputs: [{ name: 'geraet', ref: 'source.binary_sensor_fenster' }] })]));
  expect(window.location.hash).toBe('#/contracts/view/fenster?tab=config');
});

it('authors all wiring atomically, preserves extensions and repairs imported wiring by reusing the old source', () => {
  const original = sampleConfig({ x_future: { keep: true } });
  const first = planDevice(original, temperature, { contract: 'new' });
  expect(original.sources).toEqual([]); expect(first.config.x_future).toEqual({ keep: true });
  const binding = (first.config.bindings as Record<string, unknown>[])[0]!; delete binding.transform;
  const second = planDevice(first.config, temperature, { preset: 'temperature' });
  expect(second.reused).toBe(true); expect(second.sourceId).toBe(first.sourceId);
  expect(second.config.sources).toHaveLength(1); expect(second.config.bindings).toHaveLength(1);
  expect(second.config.bindings).toEqual([expect.objectContaining({ transform: { kind: 'type_cast', target: 'number' } })]);
  expect(freshnessPreset('contact').mode).toBe('event_stateful');
  expect(freshnessPreset('motion').interval_s).toBeGreaterThan(0);
  expect(freshnessPreset('counter').mode).toBe('report_heartbeat');
});

it('never silently discards malformed imported entries or changes an existing source type', () => {
  expect(() => planDevice(sampleConfig({ sources: [null] }), temperature)).toThrow(/unvollständige Listen/);
  const first = planDevice(sampleConfig(), temperature);
  expect(() => planDevice(first.config, temperature, { fieldType: 'bool' })).toThrow(/gesperrt/);
});

it('keeps selection across source subpages and keeps the editor mounted while clearing and renaming its identifier', async () => {
  const user = userEvent.setup(); const api = fake(); app('#/sources/devices');
  await user.click(await screen.findByRole('button', { name: 'Quelle hinzufügen' }));
  await screen.findByLabelText('Name');
  await user.click(screen.getByRole('button', { name: 'Erweitert' }));
  const id = screen.getByLabelText('Quelle-ID'); await user.clear(id);
  expect(screen.getByLabelText('Quelle-ID')).toBe(id);
  await user.type(id, 'source.temperatur');
  expect(screen.getByLabelText('Quelle-ID')).toBe(id);
  await user.type(screen.getByLabelText('Name'), 'Mein Sensor');
  await user.click(screen.getByRole('link', { name: 'Verknüpfungen' }));
  await screen.findByRole('heading', { level: 1, name: 'Verknüpfungen' });
  await user.click(screen.getByRole('link', { name: 'Geräte aus Home Assistant' }));
  expect(await screen.findByLabelText('Name')).toHaveValue('Mein Sensor');
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect([...api.drafts.values()][0]!.config.sources).toEqual([expect.objectContaining({ source_id: 'source.temperatur' })]));
  expect(Object.values(sessionStorage).some(value => typeof value === 'string' && value.includes('Mein Sensor'))).toBe(false);
  expect(isObject([...api.drafts.values()][0]!.config)).toBe(true);
}, 10_000);

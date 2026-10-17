import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws'; // jsdom's global Event and Node's WebSocket are not compatible
import { IDBFactory } from 'fake-indexeddb';
import example from '../test/fixtures/example-registry.json';
import { flow } from '../test/flow';
import { exerciseCoverage } from '../test/coverage';
import type { Capabilities } from '@/lib/capabilities';
import { Workbench } from '@/Workbench';
import { LiveStore, type SocketLike } from '@/lib/live';
import type { JsonObject } from '@/lib/json';
import ux12 from '../test/fixtures/ux12-komplett.json';
import { MachineEditor } from '@/editors/MachineEditor';
import { FieldSchemaEditor } from '@/editors/FieldSchemaEditor';
import type { FieldSchema } from '@/features/authoring/model';
import { Stateful, wrap } from '../test/harness';
import { objects } from '@/features/sources/sourceMigration';

/**
 * End-to-end against the REAL API and engine in an isolated, in-memory instance
 * (`python dev/workbench_demo.py --feed --interval 1`, started fresh and empty). It
 * is skipped unless TERRA_E2E_URL points at such an instance. Never point it at an
 * installation: it creates drafts, activates registries and rolls back.
 *
 *   TERRA_E2E_URL=http://127.0.0.1:8123 npm run test:e2e
 */
const base = process.env.TERRA_E2E_URL;
vi.unmock('@/lib/request-budget');
const user = userEvent.setup();
const f = flow(user);
const registry = example as unknown as JsonObject;
const realFetch = globalThis.fetch;
const raw = async <T,>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
  const response = await realFetch(`${base}/api/v1/${path}`, init);
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) as T };
  } catch {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 80)}`);
  }
};
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** The server stores/exports its canonical form (defaults filled in), so equality is judged by the server's own diff. */
interface Verdict {
  valid: boolean;
  diff: { objects: Record<string, { added: string[]; removed: string[]; changed: string[] }>; affected_contracts: string[]; fingerprint_changes: string[] };
}
async function expectSameAsActive(document: unknown) {
  const { status, body } = await raw<Verdict>('registry/validate', json('POST', document));
  expect(status).toBe(200);
  expect(body.valid).toBe(true);
  for (const [group, change] of Object.entries(body.diff.objects)) expect({ group, added: change.added, removed: change.removed, changed: change.changed }).toEqual({ group, added: [], removed: [], changed: [] });
  expect(body.diff.affected_contracts).toEqual([]);
  expect(body.diff.fingerprint_changes).toEqual([]);
}

let store: LiveStore;

describe.skipIf(!base)('Workbench ↔ real engine (isolated instance)', () => {
  it('validates all additional GUI-authored operators, freshness modes and bindings against the real engine', async () => {
    const capabilities = (await raw<Capabilities>('capabilities')).body;
    await exerciseCoverage(async (document) => {
      const verdict = await raw<{ valid: boolean; issues: unknown[] }>('registry/validate', json('POST', document));
      expect(verdict, JSON.stringify(document)).toMatchObject({ status: 200, body: { valid: true, issues: [] } });
    }, capabilities);
  }, 120_000);
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => realFetch(typeof input === 'string' && input.startsWith('./') ? `${base}${input.slice(1)}` : input, init));
    HTMLAnchorElement.prototype.click = () => {};
    store = new LiveStore({ createSocket: () => new WebSocket(`${base!.replace(/^http/, 'ws')}/api/v1/ws`) as unknown as SocketLike });
    window.location.hash = '#/registry';
  });
  afterAll(() => {
    store?.stop();
    vi.unstubAllGlobals();
  });

  it('builds the registry by controls, validates, activates, observes it live, exports, re-imports, changes semantics, rolls back and handles a conflict', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Workbench onSetup={() => {}} live={store} />
      </QueryClientProvider>,
    );
    const empty = await raw<unknown[]>('registry/drafts');
    expect(empty.body).toEqual([]); // the instance must be fresh
    expect((await raw('registry/active')).body).toBeNull();

    // 1. Build from an empty draft — controls only — and save.
    await f.createDraft('E2E', "Leere Konfiguration");
    await f.buildExampleRegistry();
    await user.click(await f.saveButton());
    const drafts = (await waitFor(async () => {
      const list = (await raw<{ draft_id: string; draft_version: number; config: JsonObject }[]>('registry/drafts')).body;
      expect(list[0]!.draft_version).toBeGreaterThan(1);
      return list;
    }, { timeout: 15_000 }));
    const draftId = drafts[0]!.draft_id;
    expect(drafts[0]!.config).toEqual(registry); // stored by the real server exactly as built

    // 2. The real server validates what the UI produced, then the UI activates it.
    const verdict = await raw<{ valid: boolean; issues: unknown[] }>('registry/validate', json('POST', drafts[0]!.config));
    expect(verdict).toMatchObject({ status: 200, body: { valid: true, issues: [] } });
    const dialog = await f.activateOpenDraft(draftId);
    await within(dialog).findByText("Version 1 ist aktiv", {}, { timeout: 20_000 });
    await user.click(within(dialog).getAllByRole('button', { name: 'Schließen' }).at(-1)!);
    await expectSameAsActive(registry); // what the server activated is semantically the registry that was built

    // 3. The activated cascade is observed over the real WebSocket (snapshot → deltas).
    await waitFor(() => {
      const snap = store.getSnapshot();
      expect(snap.connection).toBe('open');
      expect(Object.keys(snap.contracts ?? {}).sort()).toEqual(['fixture.condition', 'fixture.either', 'fixture.flow', 'fixture.left', 'fixture.right', 'fixture.timed']);
      expect(snap.registryRevision).toBe(1);
      expect(snap.contracts!['fixture.left']!.fields.value!.status).toBe('valid');
    }, { timeout: 20_000 });
    const before = store.getSnapshot().publicationSeq!;
    await waitFor(() => expect(store.getSnapshot().publicationSeq!).toBeGreaterThan(before), { timeout: 15_000 }); // the feed keeps publishing

    // 4. Export the active registry and import it again: lossless, and the server accepts it.
    const exportedActive = (await raw<JsonObject>('registry/active/export')).body;
    await expectSameAsActive(exportedActive);
    await f.go('#/registry');
    await f.createDraft('E2E-Reimport', "Einlesen (JSON)", JSON.stringify(exportedActive));
    const reimported = (await raw<{ draft_id: string; display_name: string; config: JsonObject }[]>('registry/drafts')).body.find((d) => d.display_name === 'E2E-Reimport')!;
    expect(reimported.config).toEqual(exportedActive); // the draft keeps the imported document verbatim
    await expectSameAsActive(reimported.config);

    // 5. Semantic change through the UI: new immutable version of test.truth, migrate fixture.left.
    await f.go('#/definitions/test.truth/1');
    await screen.findByText(/Aktivierte Version – semantisch unveränderlich/);
    await user.click(screen.getByRole('button', { name: /Neue Version/ }));
    const versioning = await screen.findByRole('dialog', { name: /Neue Version von test.truth/ });
    await user.click(within(versioning).getByRole('checkbox', { name: 'fixture.right' })); // only fixture.left migrates
    await user.click(within(versioning).getByRole('button', { name: 'Version anlegen' }));
    await screen.findByRole('tab', { name: 'Allgemein' });
    await f.tab(/Ausgaben/);
    await f.setOp('/definitions/5/outputs/value', 'not'); // v2 negates its input (unlocked, never activated)
    await user.click(await f.saveButton());
    await waitFor(async () => {
      const current = (await raw<{ config: { definitions: JsonObject[] } }>(`registry/drafts/${reimported.draft_id}`)).body;
      expect(current.config.definitions).toHaveLength(6);
    }, { timeout: 15_000 });
    const second = await f.activateOpenDraft(reimported.draft_id);
    await within(second).findByText("Version 2 ist aktiv", {}, { timeout: 65_000 });
    await user.click(within(second).getAllByRole('button', { name: 'Schließen' }).at(-1)!);
    await waitFor(() => expect(store.getSnapshot().registryRevision).toBe(2), { timeout: 20_000 });

    // 6. Rollback to revision 1 through the UI: a NEW revision with the historical content.
    await f.go('#/changes/versions');
    const rev1 = (await within(screen.getByRole('main')).findByText("Version 1", {}, { timeout: 65_000 })).closest('li')!;
    const rollbackButton = await within(rev1).findByRole('button', { name: 'Auf diese Version zurücksetzen' }, { timeout: 65_000 });
    await waitFor(() => expect(rollbackButton).toBeEnabled(), { timeout: 65_000 });
    await user.click(rollbackButton);
    const rollback = await screen.findByRole('dialog', { name: /Auf Version 1 zurücksetzen/ });
    // The real shared scheduler can wait for its 61-second window after this fast scripted flow.
    await user.click(await within(rollback).findByRole('checkbox', { name: /Ich möchte Version 1 als neue Version 3/ }, { timeout: 65_000 }));
    await user.click(within(rollback).getByRole('button', { name: "Zurücksetzen" }));
    await within(rollback).findByText(/Neue Version 3 aktiv/, {}, { timeout: 20_000 });
    await user.click(within(rollback).getAllByRole('button', { name: 'Schließen' }).at(-1)!);
    await expectSameAsActive(registry); // revision 3 carries revision 1's content again
    expect((await raw<{ items: { operation: string }[] }>('history/query/activations')).body.items.map((i) => i.operation)).toEqual(['rollback', 'activate', 'activate']);
    await waitFor(() => expect(store.getSnapshot().registryRevision).toBe(3), { timeout: 20_000 });

    // 7. A concurrent change by another session is reported as a conflict and overwrites nothing.
    await f.go(`#/registry/drafts/${draftId}`);
    await waitFor(() => expect(screen.getByLabelText("Entwurf-Name")).toHaveValue('E2E'), { timeout: 65_000 });
    await f.go('#/contracts');
    await user.click(await screen.findByRole('button', { name: /Neuer Vertrag/ }));
    await user.click(await screen.findByRole('button', { name: 'Ohne Gerät anlegen' }));
    const create = await screen.findByRole('dialog', { name: "Neuer Vertrag" });
    await f.type(within(create).getByLabelText("Vertrag-ID"), 'fixture.extra');
    await user.click(within(create).getByRole('button', { name: 'Anlegen' }));
    const current = (await raw<{ draft_version: number; config: JsonObject }>(`registry/drafts/${draftId}`)).body;
    const other = await raw(`registry/drafts/${draftId}`, json('PUT', { config: { ...current.config, other_session: true }, draft_version: current.draft_version }));
    expect(other.status).toBe(200);
    await user.click(await f.saveButton());
    await screen.findByRole('dialog', { name: /Versionskonflikt/ }, { timeout: 65_000 });
    expect(((await raw<{ config: JsonObject }>(`registry/drafts/${draftId}`)).body.config as JsonObject).other_session).toBe(true); // the other session's data is intact
  }, 300_000);

  it('routes the untouched UX12 import through guided devices without manual transformations and verifies real engine values', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Workbench onSetup={() => {}} live={store} /></QueryClientProvider>);
    await f.createDraft('UX12 Geräteführung', 'Einlesen (JSON)', JSON.stringify(ux12));
    const imported = (await raw<{ draft_id: string; display_name: string }[]>('registry/drafts')).body.find(draft => draft.display_name === 'UX12 Geräteführung')!;
    await f.go('#/sources/devices');
    for (const binding of ux12.bindings) {
      await user.click(await screen.findByRole('button', { name: 'Gerät aus Home Assistant hinzufügen' }));
      const wizard = await screen.findByRole('dialog', { name: 'Gerät aus Home Assistant hinzufügen' });
      const source = ux12.sources.find(source => source.source_id === binding.source_id)!;
      await user.click(await within(wizard).findByRole('radio', { name: source.display_name }, { timeout: 65_000 }));
      await user.click(within(wizard).getByRole('button', { name: 'Gerät hinzufügen' }));
      await waitFor(() => {
        const remaining = screen.queryByRole('dialog');
        if (remaining) throw new Error(`Device picker did not close: ${remaining.textContent}`);
      }, { timeout: 65_000 });
    }
    await user.click(await f.saveButton());
    const saved = await waitFor(async () => {
      const draft = (await raw<{ config: JsonObject; draft_version: number }>(`registry/drafts/${imported.draft_id}`)).body;
      expect(draft.draft_version).toBeGreaterThan(1); return draft;
    });
    const document = saved.config;
    const sources = document.sources as JsonObject[];
    const bindings = document.bindings as JsonObject[];
    for (let index = 0; index < bindings.length; index++) {
      expect(bindings[index]!.transform).toEqual({ kind: 'type_cast', target: sources[index]!.source_type === 'boolean' ? 'bool' : 'number' });
    }
    cleanup(); store.stop();
    const definitions = document.definitions as JsonObject[];
    const machine = definitions[3]!;
    wrap(<Stateful initial={machine.machine as JsonObject} onValue={(value) => { machine.machine = value; }}>{(value, set) => <MachineEditor value={value} onChange={set} pointer="/definitions/3/machine" definition={machine} caps={undefined} locked={false} />}</Stateful>);
    expect(screen.getByText('Neustart-Bedingung fehlt')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Neustart, wenn offen Nein ist' }));
    cleanup();
    // Existing delta schema is unitless; correct the old fixture through its field control.
    const schema = definitions[2]!.schema as JsonObject;
    const fields = schema.fields as JsonObject;
    wrap(<Stateful initial={fields.differenz as JsonObject} onValue={(value) => { fields.differenz = value; }}>{(value, set) => <FieldSchemaEditor value={value as FieldSchema} onChange={set} pointer="/definitions/2/schema/fields/differenz" />}</Stateful>);
    await user.clear(screen.getByLabelText('Einheit (freiwillig)'));
    cleanup();
    const verdict = await raw<{ valid: boolean; issues: unknown[] }>('registry/validate', json('POST', document));
    expect(verdict).toMatchObject({ status: 200, body: { valid: true, issues: [] } });
    const active = (await raw<{ revision: number } | null>('registry/active')).body;
    const draft = await raw<{ draft_id: string; draft_version: number }>('registry/drafts', json('POST', { config: document, display_name: 'UX12' }));
    const result = await raw(`registry/drafts/${draft.body.draft_id}/activate`, json('POST', { draft_version: draft.body.draft_version, expected_active_revision: active?.revision ?? 0 }));
    expect(result.status).toBe(200);
    await expectSameAsActive(document);
    await waitFor(async () => {
      const state = (await raw<{ fields: { value: { value: unknown; status: string } } }>('contracts/bad.temperatur')).body;
      expect(state.fields.value).toMatchObject({ value: 21.5, status: 'valid' });
      const contact = (await raw<{ fields: { value: { value: unknown; status: string } } }>('contracts/fenster.offen')).body;
      expect(contact.fields.value).toMatchObject({ value: false, status: 'valid' });
    }, { timeout: 10_000 });
  }, 120_000);

  it('moves a guided temperature source to text through the checked dialog, versions its template and retains numeric evidence', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Workbench onSetup={() => {}} live={store} /></QueryClientProvider>);
    await f.createDraft('P8 Quellenumzug', 'Leere Konfiguration');
    await f.go('#/contracts/list/all');
    await user.click(await screen.findByRole('button', { name: 'Neuer Vertrag' }, { timeout: 65_000 }));
    const adding = await screen.findByRole('dialog', { name: 'Neuer Vertrag' });
    await user.click(await within(adding).findByRole('radio', { name: ux12.sources[0]!.display_name }, { timeout: 65_000 }));
    await f.type(within(adding).getByLabelText('Name'), 'P8 Temperatur');
    await user.click(within(adding).getByRole('button', { name: 'Vertrag anlegen' }));
    // K.01: the guided objects use the same server comparison in the bar and page.
    await user.click(await f.saveButton());
    const guided = await waitFor(async () => {
      const drafts = (await raw<{ draft_id: string; display_name: string; draft_version: number; config: JsonObject }[]>('registry/drafts')).body;
      const draft = drafts.find(item => item.display_name === 'P8 Quellenumzug')!;
      expect(draft.draft_version).toBeGreaterThan(1); return draft;
    }, { timeout: 65_000 });
    const comparison = (await raw<Verdict>('registry/validate', json('POST', guided.config))).body;
    const objectCount = Object.values(comparison.diff.objects).reduce((total, group) => total + group.added.length + group.changed.length + group.removed.length, 0);
    await f.go(`#/changes/drafts/${guided.draft_id}`);
    await user.click(await screen.findByRole('button', { name: 'Prüfen' }));
    await waitFor(() => expect(screen.getAllByLabelText('Anzahl der Änderungen').map(node => node.textContent)).toEqual([`${objectCount} Änderungen`, `${objectCount} Änderungen`]), { timeout: 65_000 });
    const takeover = async () => {
      await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
      const confirm = await screen.findByRole('dialog', { name: 'Konfiguration übernehmen' });
      const accept = await within(confirm).findByRole('checkbox', { name: /Auswirkungen geprüft/ }, { timeout: 65_000 });
      await waitFor(() => expect(accept).toBeEnabled(), { timeout: 65_000 });
      await user.click(accept);
      await user.click(within(confirm).getByRole('button', { name: 'Jetzt übernehmen' }));
      await within(confirm).findByText(/Version \d+ ist aktiv/, {}, { timeout: 65_000 });
      await user.click(within(confirm).getAllByRole('button', { name: 'Schließen' }).at(-1)!);
    };
    await takeover();
    await waitFor(() => expect(screen.getAllByLabelText('Anzahl der Änderungen').map(node => node.textContent)).toEqual(['0 Änderungen', '0 Änderungen']), { timeout: 65_000 });
    const before = (await raw<JsonObject>('registry/active/export')).body;
    const sourceId = String(objects(before.sources)[0]!.source_id); const contractId = String(objects(before.contracts)[0]!.contract_id);
    await waitFor(async () => expect((await raw<{ fields: { value: { value: unknown } } }>(`contracts/${contractId}`)).body.fields.value.value).toBe(21.5), { timeout: 65_000 });
    const history = (await raw<{ items: JsonObject[] }>(`history/query/observations?source_id=${encodeURIComponent(sourceId)}`)).body.items;
    expect(history.some(item => item.value_raw === '21.5' && item.value_normalized === 21.5 && item.normalized === true)).toBe(true);
    await f.go('#/sources/devices?item=0');
    await user.click(await screen.findByRole('button', { name: 'Quelle mit anderem Typ anlegen' }, { timeout: 65_000 }));
    const moving = await screen.findByRole('dialog', { name: 'Quelle umziehen' });
    await user.selectOptions(within(moving).getByLabelText('Neue Werteart'), 'text');
    const check = within(moving).getByRole('button', { name: 'Umzug prüfen' });
    await waitFor(() => expect(check).toBeEnabled(), { timeout: 65_000 }); await user.click(check);
    await within(moving).findByText(/Direkt umgestellte Verträge: 1/, {}, { timeout: 65_000 });
    await user.click(within(moving).getByRole('button', { name: 'In Entwurf übernehmen' }));
    await takeover();
    const after = (await raw<JsonObject>('registry/active/export')).body;
    expect(objects(after.sources)).toHaveLength(2);
    expect(objects(after.sources)[0]).toEqual(objects(before.sources)[0]);
    expect(objects(after.bindings)).toEqual([expect.objectContaining({ source_id: objects(after.sources)[1]!.source_id, transform: expect.objectContaining({ target: 'text' }) })]);
    expect(objects(after.contracts)[0]).toMatchObject({ type_version: 2, inputs: [expect.objectContaining({ ref: objects(after.sources)[1]!.source_id })] });
    await waitFor(async () => expect((await raw<{ fields: { value: { value: unknown; status: string } } }>(`contracts/${contractId}`)).body.fields.value).toMatchObject({ value: '21.5', status: 'valid' }), { timeout: 65_000 });
    const retained = (await raw<{ items: JsonObject[] }>(`history/query/observations?source_id=${encodeURIComponent(sourceId)}`)).body.items;
    expect(retained).toEqual(expect.arrayContaining(history));
    expect(retained.every(item => item.value_raw === '21.5' && item.value_normalized === 21.5 && item.normalized === true)).toBe(true);
    await expectSameAsActive(after);
  }, 240_000);

  it('restarts an opted-in machine through confirmation and observes manual and then data-confirmed state over the real WebSocket', async () => {
    const bool = { type: 'bool', required: true, physical_state: false };
    let machine: JsonObject = { id: 'neustart', states: ['bereit', 'fertig'], initial: 'bereit', commands: {}, transitions: [], reinitialize_when: { op: 'not', args: [{ op: 'input', name: 'a' }] } };
    const definition: JsonObject = { type_id: 'test.manueller_neustart', type_version: 1, inputs: [{ name: 'a', schema: bool }], schema: { fields: { value: { type: 'enum', required: true, physical_state: false, value_catalog: ['bereit', 'fertig'] } }, available_projection: ['value'] }, outputs: { value: { op: 'machine' } }, machine };
    wrap(<Stateful initial={machine} onValue={next => { machine = next; }}>{(value, set) => <MachineEditor value={value} onChange={set} pointer="/definitions/0/machine" definition={definition} caps={undefined} locked={false} />}</Stateful>);
    const grant = screen.getByRole('checkbox', { name: 'Administratoren dürfen diesen Ablauf manuell neu starten' });
    expect(grant).not.toBeChecked(); await user.click(grant); cleanup();
    const originalSource = ux12.sources.find(source => source.source_type === 'boolean')!;
    const originalBinding = ux12.bindings.find(binding => binding.source_id === originalSource.source_id)!;
    const document: JsonObject = { config_schema_version: 1, fingerprint_version: 2,
      dependencies: [{ dependency_id: 'dep.neustart', kind: 'ha', monitor: 'internal' }],
      sources: [{ source_id: 'source.neustart', source_type: 'boolean', source_origin: 'local', dependency_id: 'dep.neustart', physical_source_key: 'physical.neustart', value_schema: bool, freshness: { mode: 'event_stateful', future_tolerance_s: 1 } }],
      bindings: [{ binding_id: 'binding.neustart', source_id: 'source.neustart', adapter: { kind: 'ha_state', ha_entity_id: originalBinding.adapter.ha_entity_id }, transform: { kind: 'type_cast', target: 'bool' } }],
      definitions: [{ ...definition, machine }], catalogs: [],
      contracts: [{ contract_id: 'manueller_neustart', display_name: 'Ablauf zum Neustart prüfen', type_id: definition.type_id!, type_version: 1, enabled: true, inputs: [{ name: 'a', ref: 'source.neustart' }], parameters: {} }],
    };
    expect((await raw<{ valid: boolean }>('registry/validate', json('POST', document))).body.valid).toBe(true);
    const active = (await raw<{ revision: number } | null>('registry/active')).body;
    const draft = (await raw<{ draft_id: string; draft_version: number }>('registry/drafts', json('POST', { config: document }))).body;
    const activated = await raw<{ revision: number }>(`registry/drafts/${draft.draft_id}/activate`, json('POST', { draft_version: draft.draft_version, expected_active_revision: active?.revision ?? 0 }));
    expect(activated.status).toBe(200);
    window.location.hash = '#/contracts/view/manueller_neustart';
    const seen: boolean[] = [];
    const unsubscribe = store.subscribe(() => { const state = store.getSnapshot().contracts?.manueller_neustart?.state_machine; if (state) seen.push(state.manual_restart === true); });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Workbench onSetup={() => {}} live={store} /></QueryClientProvider>);
    const start = await screen.findByRole('button', { name: 'Ablauf neu starten' }, { timeout: 65_000 });
    await waitFor(() => expect(start).toBeEnabled(), { timeout: 65_000 }); await user.click(start);
    const confirmation = await screen.findByRole('dialog', { name: 'Ablauf neu starten' });
    expect(within(confirmation).getByText(/Externe Automationen sind Terra nicht vollständig bekannt/)).toBeVisible();
    await user.type(within(confirmation).getByLabelText('Warum startest du den Ablauf neu?'), 'Isolierter Engine-Test');
    await user.click(within(confirmation).getByRole('checkbox', { name: /Ich habe die Auswirkungen geprüft/ }));
    await user.click(within(confirmation).getByRole('button', { name: 'Jetzt manuell neu starten' }));
    await within(confirmation).findByText(/Der Ablauf wurde manuell neu gestartet/, {}, { timeout: 65_000 });
    await waitFor(() => expect(seen).toContain(true), { timeout: 65_000 });
    await waitFor(() => {
      const envelope = store.getSnapshot().contracts?.manueller_neustart;
      expect(envelope?.state_machine?.manual_restart ?? false).toBe(false);
      expect(envelope?.state_machine?.origin).toBe('automatic');
      expect(envelope?.contract_health).toBe('healthy');
    }, { timeout: 65_000 });
    const history = (await raw<{ items: JsonObject[] }>('history/query/transitions?contract_id=manueller_neustart')).body.items;
    expect(history.some(item => item.manual_restart === true && item.origin === 'manual')).toBe(true);
    const audit = (await raw<{ items: JsonObject[] }>('history/query/diagnostics')).body.items.filter(item => item.operation === 'manual_restart' && item.contract_id === 'manueller_neustart');
    expect(audit).toHaveLength(1); expect(audit[0]).toMatchObject({ reason: 'Isolierter Engine-Test', origin: 'manual', actor: { role: 'admin', kind: 'ingress' } });
    unsubscribe();
  }, 180_000);
});

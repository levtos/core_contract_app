import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ContractLiveState } from '@/components/ContractLiveState';
import { LiveProvider } from '@/lib/live-context';
import { LiveStore, type SocketLike } from '@/lib/live';
import type { Envelope } from '@/lib/types';
import { installFakeApi, reply, sampleConfig } from '../../../test/fakeApi';
import { CommandsPanel } from './CommandsPanel';
import { EvidenceTab } from './EvidenceLookup';
import { ExplainPanel } from './ExplainPanel';
import { HistoryTab } from './HistoryTab';

const user = userEvent.setup();
const wrap = (ui: React.ReactNode, live?: LiveStore) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LiveProvider store={live ?? new LiveStore({ createSocket: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, send() {}, close() {} }) as SocketLike })}>{ui}</LiveProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const unknownEnvelope: Envelope = {
  contract_id: 'c',
  type: { type_id: 'test.x', type_version: 1 },
  enabled: true,
  contract_health: 'degraded',
  available: false,
  fields: {
    value: { status: 'unknown', value: null, quality: 'degraded', reasons: [{ code: 'input_stale', input: 'a', source_id: 'source.a', since: '2026-10-12T10:00:00+00:00' }], evidence: ['ref-1'], freshness: 'stale' },
    other: { status: 'valid', value: false, quality: 'healthy', reasons: [], evidence: [] },
  },
  computed_at: '2026-10-12T10:00:00+00:00',
  published_at: '2026-10-12T10:00:00+00:00',
  publication_seq: 3,
  registry_revision: 2,
  epoch_id: 'e',
};

describe('values are shown as the server reports them', () => {
  it('shows unknown as "unbekannt" with its reasons, never as false/off, and keeps a real false', () => {
    wrap(<ContractLiveState envelope={unknownEnvelope} stale={false} />);
    expect(screen.getByTestId('value-value')).toHaveTextContent('unbekannt');
    expect(screen.getByTestId('value-value')).not.toHaveTextContent(/false|aus|off/i);
    expect(screen.getByTestId('value-other')).toHaveTextContent('Nein');
    expect(screen.getByText('Nachweis ist veraltet')).toBeInTheDocument();
    expect(screen.getByText(/Aktualität: veraltet/)).toBeInTheDocument(); // server's freshness label, not computed here
  });

  it('flags an out-of-date live view', () => {
    wrap(<ContractLiveState envelope={unknownEnvelope} stale />);
    expect(screen.getByText('Stand möglicherweise veraltet')).toBeInTheDocument();
  });
});

describe('explain shows only what was recorded', () => {
  it('says so when there is no trace instead of inventing one', () => {
    wrap(<ExplainPanel trace={null} />);
    expect(screen.getByText("Kein Erklärung-Erklärungsverlauf vorhanden")).toBeInTheDocument();
  });

  it('renders operator status, guard decisions and fusion selection from the trace', () => {
    wrap(
      <ExplainPanel
        trace={{
          at: '2026-10-12T10:00:00+00:00', origin: 'input', registry_revision: 2, epoch_id: 'e', cost: 4, truncated: false,
          steps: [
            { op: 'input', id: null, name: 'a', status: 'valid', quality: 'healthy', reasons: [], evidence: ['ev-1'] },
            { op: 'fusion_selection', strategy: 'any_true', selected_indices: [1], candidate_statuses: ['unknown', 'valid'], selection: 'engine', evidence: [] },
            { op: 'guard', source: 'idle', target: 'active', event: 'start', decision: null },
            { op: 'fusion', id: null, strategy: 'any_true', status: 'unknown', quality: 'degraded', reasons: ['partial_evidence'], evidence: [] },
          ],
        }}
      />,
    );
    expect(screen.getByText("Zusammenführung – Auswahl")).toBeInTheDocument();
    expect(screen.getByText(/Gewählt: \[1\]/)).toBeInTheDocument();
    expect(screen.getByText('unentschieden')).toBeInTheDocument(); // null decision is not "false"
    expect(screen.getByText('Nur ein Teil der Nachweise ist verwendbar')).toBeInTheDocument();
    expect(screen.getByText(/keine Historie|kein Herzschlag/)).toBeInTheDocument();
  });

  it('shows truncation explicitly', () => {
    wrap(<ExplainPanel trace={{ at: 'x', origin: 'timer', registry_revision: 1, epoch_id: 'e', cost: 9, truncated: true, steps: [] }} />);
    expect(screen.getByText(/gekürzt/)).toBeInTheDocument();
  });
});

describe('history uses opaque cursors and bound filters', () => {
  it('loads further pages with the server cursor and starts over when a filter is applied', async () => {
    const api = installFakeApi();
    const page = (n: number) => ({ items: [{ id: `row-${n}`, at: `2026-10-12T10:0${n}:00+00:00`, contract_id: `c${n}` }], next_cursor: n < 2 ? `cursor-${n}` : null, limit: 50, order: 'time_desc_key_desc' });
    api.routes.push({
      match: /^history\/query\/contracts/,
      respond: (path) => {
        const q = new URL(path, 'http://x/').searchParams;
        return reply(200, page(q.get('cursor') === 'cursor-1' ? 2 : 1));
      },
    });
    wrap(<HistoryTab />);
    await screen.findByText('c1');
    await user.click(screen.getByRole('button', { name: 'Ältere Einträge laden' }));
    await screen.findByText('c2');
    expect(api.calls.filter((c) => c.path.startsWith('history/query/contracts')).map((c) => c.path)).toEqual([
      'history/query/contracts?limit=50',
      'history/query/contracts?limit=50&cursor=cursor-1',
    ]);
    expect(screen.getByText('Ende der Historie')).toBeInTheDocument();

    await user.type(screen.getByLabelText("Vertrag-ID"), 'c2');
    await user.click(screen.getByRole('button', { name: 'Filter anwenden' }));
    await waitFor(() => expect(api.calls.at(-1)!.path).toBe('history/query/contracts?contract_id=c2&limit=50'));
  });

  it('sends time filters as UTC instants and rejects an inverted interval before asking', async () => {
    const api = installFakeApi();
    wrap(<HistoryTab />);
    await screen.findByText('Keine Einträge');
    await user.type(screen.getByLabelText('Von (lokal)'), '2026-10-12T12:00:00');
    await user.type(screen.getByLabelText('Bis (lokal)'), '2026-10-12T11:00:00');
    expect(screen.getByRole('button', { name: 'Filter anwenden' })).toBeDisabled();
    expect(screen.getByText(/Beginn liegt nach dem Ende/)).toBeInTheDocument();
    const before = api.calls.length;
    await user.clear(screen.getByLabelText('Bis (lokal)'));
    await user.type(screen.getByLabelText('Bis (lokal)'), '2026-10-12T13:00:00');
    await user.click(screen.getByRole('button', { name: 'Filter anwenden' }));
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
    const last = api.calls.at(-1)!.path;
    expect(last).toMatch(/since=2026-10-12T\d\d%3A00%3A00\.000Z/);
    expect(last).toMatch(/until=/);
  });
});

describe('evidence references are opaque and may legitimately be missing', () => {
  it('reports an explicit 404 without reconstructing anything', async () => {
    const api = installFakeApi();
    api.routes.push({ match: /^evidence\/reference\//, respond: (path) => reply(404, { error: 'evidence_not_found', reference: decodeURIComponent(path.split('/').pop()!) }) });
    wrap(<EvidenceTab />);
    await user.type(screen.getByLabelText("Nachweis-Referenz"), 'v2:e:7:ha:12:binding.a');
    await user.click(screen.getByRole('button', { name: 'Auflösen' }));
    await screen.findByText("Keine aufgezeichnete Nachweis");
    expect(api.calls.at(-1)!.path).toBe(`evidence/reference/${encodeURIComponent('v2:e:7:ha:12:binding.a')}`);
  });
});

describe('commands are typed, confirmed and idempotent', () => {
  function setup() {
    const api = installFakeApi({ revisions: [{ revision: 2, config: sampleConfig({ contracts: [{ contract_id: 'fixture.flow', type_id: 'test.flow', type_version: 1, enabled: true, inputs: [], parameters: {} }] }), checksum: 'c'.repeat(64), created_at: 'x' }] });
    // capabilities fixture has test.state_machine with commands; reuse that type for the active contract.
    api.revisions[0]!.config = sampleConfig({ contracts: [{ contract_id: 'sm', type_id: 'test.state_machine', type_version: 2, enabled: true, inputs: [], parameters: {} }] });
    return api;
  }

  it('asks for confirmation, uses the server clock and a stable command id', async () => {
    const api = setup();
    api.routes.push({ match: /^commands$/, method: 'POST', respond: (_p, body) => reply(200, { command_id: body.command_id, status: 'accepted' }) });
    const store = new LiveStore({ createSocket: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, send() {}, close() {} }) });
    wrap(<CommandsPanel contractId="sm" onContract={() => {}} />, store);
    const send = await screen.findByRole('button', { name: /Befehle senden/ });
    await user.click(send);
    expect(api.calls.some((c) => c.path === 'commands')).toBe(false); // nothing before confirmation
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Senden' }));
    await screen.findByText('angenommen');
    const body = api.calls.find((c) => c.path === 'commands')!.body as Record<string, unknown>;
    expect(body.command_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.origin).toEqual({ kind: 'workbench', actor: 'admin', client_name: 'terra-workbench' });
    const issued = Date.parse(body.issued_at as string);
    const until = Date.parse(body.valid_until as string);
    expect(until - issued).toBe(30_000);
    expect(api.calls.some((c) => c.path === 'info')).toBe(true); // server time, not the browser clock
  });

  it('after a lost response it offers to read the stored result instead of sending again', async () => {
    const api = setup();
    let posts = 0;
    api.routes.push(
      { match: /^commands$/, method: 'POST', respond: () => { posts += 1; return reply(503, { error: 'persistence_unavailable' }); } },
      { match: /^commands\/.+/, method: 'GET', respond: (path) => reply(200, { command_id: path.split('/').pop(), status: 'rejected', reason: 'guard_rejected' }) },
    );
    wrap(<CommandsPanel contractId="sm" onContract={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Befehle senden/ }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Senden' }));
    await screen.findByText('Antwort unbekannt');
    await user.click(screen.getByRole('button', { name: 'Gespeichertes Ergebnis abfragen' }));
    await screen.findByText('Bedingung ist nicht erfüllt');
    expect(posts).toBe(1);
  });
});

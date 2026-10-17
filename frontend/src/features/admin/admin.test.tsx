import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LiveProvider } from '@/lib/live-context';
import { LiveStore, type SocketLike } from '@/lib/live';
import { installFakeApi, reply } from '../../../test/fakeApi';
import AdminPage from './AdminPage';

const user = userEvent.setup();

function idleSocket(): SocketLike {
  return { onopen: null, onmessage: null, onclose: null, onerror: null, send() {}, close() {} };
}
function mount(section = 'keys') {
  const store = new LiveStore({ createSocket: idleSocket });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/settings/${section}`]}>
        <LiveProvider store={store}>
          <AdminPage />
        </LiveProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function adminApi() {
  const api = installFakeApi();
  api.routes.push(
    { match: /^tokens$/, respond: () => reply(200, { roles: ['consumer', 'admin'], tokens_visible: false }) },
    { match: /^diagnostics$/, respond: () => reply(200, { version: 'x', service: { ready: true, publication_confirmed: true, persistence: 'available', ha: 'connected', bridge: 'connected', mqtt: 'disabled', reasons: [] }, queue_size: 0, commit_duration_s: 0.01, bridge_version: 1, bridge_subscriptions: 2, ingest_overflow_count: 0, refresh_overflow_count: 0, gaps: [], dependencies: [] }) },
    { match: /^api\/v1\/setup\/bridge$|setup\/bridge/, respond: () => reply(200, { state: 'active' }) },
  );
  return api;
}

describe('token rotation is explicit, one-shot and never persisted', () => {
  it('requires acknowledgement, shows the new token once and writes nothing to browser storage', async () => {
    const api = adminApi();
    api.routes.push({ match: /^tokens\/rotate$/, method: 'POST', respond: () => reply(200, { role: 'consumer', token: 'NEW-SECRET-TOKEN', status: 'rotated', rotation_id: 'rot-1', audit_status: 'complete' }) });
    const local = vi.spyOn(Storage.prototype, 'setItem');
    mount();
    const rotate = (await screen.findAllByRole('button', { name: /Zugangsschlüssel rotieren/ }))[0]!;
    await user.click(rotate);
    const dialog = await screen.findByRole('alertdialog');
    const go = within(dialog).getByRole('button', { name: 'Jetzt rotieren' });
    expect(go).toBeDisabled();
    expect(api.calls.some((c) => c.path === 'tokens/rotate')).toBe(false);
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(go);
    await screen.findByText(/Zugangsschlüssel rotiert/);
    expect(api.calls.filter((c) => c.path === 'tokens/rotate')).toHaveLength(1);
    expect(api.calls.find((c) => c.path === 'tokens/rotate')!.body).toEqual({ role: 'consumer' });
    const field = screen.getByLabelText("Neuer Zugangsschlüssel") as HTMLInputElement;
    expect(field.type).toBe('password'); // masked until revealed
    expect(field.value).toBe('NEW-SECRET-TOKEN');
    expect(local.mock.calls.flat().join(' ')).not.toContain('NEW-SECRET-TOKEN');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('NEW-SECRET-TOKEN');
    expect(JSON.stringify({ ...localStorage })).not.toContain('NEW-SECRET-TOKEN');
    await user.click(screen.getByRole('button', { name: /ausblenden/ }));
    expect(screen.queryByLabelText("Neuer Zugangsschlüssel")).toBeNull();
  });

  it('keeps the credential visible when only the audit completion is unconfirmed', async () => {
    const api = adminApi();
    api.routes.push({ match: /^tokens\/rotate$/, method: 'POST', respond: () => reply(200, { role: 'admin', token: 'T', status: 'rotated', rotation_id: 'rot-2', audit_status: 'completion_unconfirmed' }) });
    mount();
    await user.click((await screen.findAllByRole('button', { name: /Zugangsschlüssel rotieren/ }))[1]!);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Jetzt rotieren' }));
    await screen.findByText(/Abschluss unbestätigt/);
    expect((screen.getByLabelText("Neuer Zugangsschlüssel") as HTMLInputElement).value).toBe('T');
  });

  it('never retries a failed rotation automatically and calls the outcome indeterminate', async () => {
    const api = adminApi();
    let calls = 0;
    api.routes.push({ match: /^tokens\/rotate$/, method: 'POST', respond: () => { calls += 1; return reply(503, { error: 'persistence_unavailable' }); } });
    mount();
    await user.click((await screen.findAllByRole('button', { name: /Zugangsschlüssel rotieren/ }))[0]!);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Jetzt rotieren' }));
    await screen.findByText('Rotation nicht bestätigt');
    expect(screen.getByText(/nicht automatisch wiederholen/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(calls).toBe(1);
    expect(screen.queryByLabelText("Neuer Zugangsschlüssel")).toBeNull();
  });

  it('marks a rotation request without completion as indeterminate in the audit log', async () => {
    const api = adminApi();
    api.routes.push({
      match: /^history\/query\/diagnostics/,
      respond: () => reply(200, { items: [
        { id: '1', kind: 'administrative', operation: 'token_rotation_requested', at: '2026-10-12T10:00:00+00:00', actor: { kind: 'ingress', role: 'admin' }, rotation_id: 'r-open' },
        { id: '2', kind: 'administrative', operation: 'token_rotation_requested', at: '2026-10-12T09:00:00+00:00', actor: { kind: 'ingress', role: 'admin' }, rotation_id: 'r-done' },
        { id: '3', kind: 'administrative', operation: 'token_rotated', at: '2026-10-12T09:00:01+00:00', actor: { kind: 'ingress', role: 'admin' }, rotation_id: 'r-done' },
      ], next_cursor: null, limit: 100, order: 'time_desc_key_desc' }),
    });
    mount('log');
    await screen.findByText("Protokoll-Verlauf");
    await waitFor(() => expect(screen.getAllByText('Ausgang unbestimmt')).toHaveLength(1));
    expect(screen.getAllByText('Home-Assistant-Zugriff', { exact: false }).length).toBeGreaterThan(0);
  });
});

describe('T1B-07: the one-time credential is held nowhere but the visible component state', () => {
  const dump = (client: QueryClient) => JSON.stringify([client.getMutationCache().getAll().map((m) => ({ s: m.state, o: m.options.mutationKey })), client.getQueryCache().getAll().map((q) => q.state.data)]);

  it.each([['complete'], ['completion_unconfirmed']])('no query/mutation cache holds the token (%s), neither while shown nor after hiding or unmount', async (audit) => {
    const api = adminApi();
    api.routes.push({ match: /^tokens\/rotate$/, method: 'POST', respond: () => reply(200, { role: 'consumer', token: 'SYNTHETIC-TOKEN-123', status: 'rotated', rotation_id: 'rot-9', audit_status: audit }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/settings/keys']}>
          <LiveProvider store={new LiveStore({ createSocket: idleSocket })}>
            <AdminPage />
          </LiveProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click((await screen.findAllByRole('button', { name: /Zugangsschlüssel rotieren/ }))[0]!);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Jetzt rotieren' }));
    await screen.findByLabelText("Neuer Zugangsschlüssel");
    expect((screen.getByLabelText("Neuer Zugangsschlüssel") as HTMLInputElement).value).toBe('SYNTHETIC-TOKEN-123'); // still usable for the user
    expect(dump(client)).not.toContain('SYNTHETIC-TOKEN-123');
    if (audit === 'completion_unconfirmed') expect(screen.getByText(/Abschluss unbestätigt/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ausblenden/ }));
    expect(screen.queryByLabelText("Neuer Zugangsschlüssel")).toBeNull();
    expect(document.body.textContent).not.toContain('SYNTHETIC-TOKEN-123');
    expect(dump(client)).not.toContain('SYNTHETIC-TOKEN-123');
    view.unmount();
    expect(dump(client)).not.toContain('SYNTHETIC-TOKEN-123');
  });
});

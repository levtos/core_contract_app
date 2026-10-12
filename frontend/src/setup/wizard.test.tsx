import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SetupStatus } from './setup';

vi.mock('@/Workbench', () => ({
  Workbench: ({ onSetup }: { onSetup: () => void }) => (
    <main>
      <h1>Administration</h1>
      <button onClick={onSetup}>Einrichtung prüfen</button>
    </main>
  ),
}));

import { App } from '@/App';
import { SetupWizard } from './SetupWizard';

const initial: SetupStatus = {
  phase: 'welcome',
  authority: 'unconfigured',
  database_configured: false,
  onboarding_complete: false,
  database: null,
  csrf_token: 'ephemeral-csrf',
  installation_id: null,
  error: '',
  restart_required: false,
};

function backend(status: SetupStatus = initial) {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
    new Response(
      JSON.stringify(
        url.endsWith('/status')
          ? status
          : url.endsWith('/bridge')
            ? { state: 'missing_or_restart_pending' }
            : url.endsWith('/provision')
              ? { script: 'reviewable-test-script' }
              : { accepted: true },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const clickText = (text: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(text) }));

describe('setup wizard (ported from the Alpha-1 UI, same safeguards)', () => {
  it('invalid Supervisor options are visible and cannot be imported through the wizard', async () => {
    const fetch = backend({ ...initial, phase: 'configuration_error', authority: 'supervisor', error: 'invalid_supervisor_options' });
    render(<App />);
    await screen.findByText(/Vorhandene App-Optionen sind ungültig/);
    expect(document.querySelector('input')).toBeNull();
    expect(document.body.textContent).not.toContain('Verbindung einrichten');
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/connect') || url.endsWith('/provision'))).toBe(false);
  });

  it('reload after DB initialization resumes the unfinished Bridge step', async () => {
    backend({ ...initial, phase: 'completed', authority: 'wizard', database_configured: true });
    render(<App />);
    await screen.findByRole('heading', { name: 'Home-Assistant-Bridge' });
    expect(document.querySelector('h1')?.textContent).toBe('Core Contracts einrichten');
    expect(document.body.textContent).toContain('SELF-INSTALL-01');
  });

  it('database outage is not presented as an identity rejection', async () => {
    backend({ ...initial, phase: 'connecting', authority: 'wizard', database_configured: true, error: 'database_connection_failed' });
    render(<App />);
    await screen.findByText(/PostgreSQL nicht erreichbar/);
    expect(document.body.textContent).not.toContain('Identität oder Schema abgewiesen');
  });

  it('completed onboarding opens Administration after DB recovery but manual setup stays open', async () => {
    const status = { ...initial, phase: 'connecting' as SetupStatus['phase'], authority: 'wizard', database_configured: true, onboarding_complete: true };
    backend(status);
    render(<App />);
    await screen.findByText('Core Contracts einrichten');
    status.phase = 'completed';
    // Polling performs the same recovery refresh without changing configuration.
    await screen.findByText('Administration', {}, { timeout: 5000 });
    clickText('Einrichtung prüfen');
    await screen.findByText(/Bestehende Identität wird beibehalten/);
    expect(screen.queryByText('Einrichtung prüfen')).toBeNull();
  }, 10_000);

  it('fresh installation renders guided UI before any ordinary API request', async () => {
    const fetch = backend();
    render(<App />);
    await screen.findByText('Core Contracts einrichten');
    expect(document.body.textContent).toContain('Willkommen');
    expect(fetch.mock.calls.every(([url]) => url.includes('/setup/'))).toBe(true);
  });

  it('validates connection, moves forward/back and shows the script instead of a JSON editor', async () => {
    const fetch = backend();
    render(<SetupWizard initial={initial} oncomplete={vi.fn()} />);
    clickText('Verbindung einrichten');
    const host = document.querySelectorAll<HTMLInputElement>('input')[0]!;
    fireEvent.change(host, { target: { value: 'postgres-test' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).toBeEnabled());
    clickText('^Weiter$');
    await screen.findByRole('heading', { name: 'Einrichtungsskript und geheimer Import' });
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('reviewable-test-script');
    expect(document.querySelector('input[type=password]')).not.toBeNull();
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/provision'))).toBe(true);
    // The CSRF token travels with the mutation, never a bearer token.
    const provision = fetch.mock.calls.find(([url]) => url.endsWith('/provision'))!;
    expect((provision[1] as RequestInit).headers).toMatchObject({ 'X-Setup-CSRF': 'ephemeral-csrf' });
    clickText('Zurück');
    await screen.findByRole('heading', { name: 'PostgreSQL verbinden' });
  });

  it('existing Alpha setup skips DB provisioning and exposes the honest Bridge blocker', async () => {
    const status = { ...initial, phase: 'completed' as const, authority: 'supervisor', database_configured: true, installation_id: 'existing-id' };
    const fetch = backend(status);
    render(<SetupWizard initial={status} oncomplete={vi.fn()} />);
    await screen.findByText(/Bestehende Identität wird beibehalten/);
    await act(async () => clickText('Datenbankschritte überspringen'));
    expect(document.body.textContent).toContain('Release-Blocker SELF-INSTALL-01');
    expect(document.body.textContent).toContain('Legacy-Integration vorübergehend');
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/provision') || url.endsWith('/connect'))).toBe(false);
  });

  it('finishing setup requires an active Bridge and the explicit confirmation payload', async () => {
    const status = { ...initial, phase: 'completed' as const, authority: 'wizard', database_configured: true, onboarding_complete: false, installation_id: 'id' };
    const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(url.endsWith('/status') ? status : url.endsWith('/bridge') ? { state: 'active' } : { ok: true })),
    );
    vi.stubGlobal('fetch', fetch);
    const done = vi.fn();
    render(<SetupWizard initial={status} oncomplete={done} />);
    await screen.findByText('Bridge aktiv (Protokoll 1)');
    clickText('Ergebnisse ansehen');
    const finish = await screen.findByRole('button', { name: /Einrichtung abschließen/ });
    await waitFor(() => expect(finish).toBeEnabled());
    fireEvent.click(finish);
    await waitFor(() => expect(done).toHaveBeenCalled());
    const call = fetch.mock.calls.find(([url]) => url.endsWith('/finish'))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ confirm: true });
  });
});

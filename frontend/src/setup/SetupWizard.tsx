import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Notice, Panel } from '@/components/ui/layout';
import { setupRequest, validConnection, type Connection, type SetupStatus } from './setup';

/**
 * First-run assistant. Behavior, texts and security checks are carried over from
 * the Alpha-1 wizard: Ingress-only requests, per-session CSRF token, explicit
 * confirmations, secrets never persisted in the browser, no registry activation.
 */

const PHASES = ['Willkommen', 'PostgreSQL verbinden', 'Skript und Import', 'Bridge einrichten', 'Abschluss'];

const BRIDGE_LABELS: Record<string, string> = {
  active: 'Bridge aktiv (Protokoll 1)',
  installed_not_configured: 'Bridge erkannt, Konfigurationseintrag fehlt',
  missing_or_restart_pending: 'Bridge nicht erkannt: fehlt oder HA-Neustart steht aus',
  incompatible: 'Bridge-Protokoll inkompatibel',
  unavailable: 'HA-Verbindung derzeit nicht erreichbar',
  authorization_failed: 'HA-Zugriff nicht autorisiert',
  unknown: 'Bridge wird geprüft',
};

function statusError(error: string): string {
  if (error === 'invalid_supervisor_options')
    return 'Vorhandene App-Optionen sind ungültig. Bitte in der Supervisor-Konfiguration korrigieren und anschließend nur diese App neu starten. Die bestehende Datenbankkonfiguration wird nicht vom Wizard übernommen.';
  if (error === 'database_connection_failed')
    return 'PostgreSQL nicht erreichbar oder Anmeldung/TLS fehlgeschlagen. Verbindung und Zertifikat prüfen; Einrichtung bleibt offen.';
  return 'Identität oder Schema abgewiesen. Verbindung prüfen; keine automatische Neuinitialisierung.';
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

function LabeledInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export function SetupWizard({ initial, oncomplete, automatic = false }: { initial: SetupStatus; oncomplete: () => void; automatic?: boolean }) {
  const [status, setStatus] = useState(initial);
  const [phase, setPhase] = useState(() =>
    initial.authority === 'wizard' && initial.database_configured && !initial.onboarding_complete ? 3 : 0,
  );
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [connection, setConnection] = useState<Connection>(() =>
    initial.database
      ? { ...initial.database, password: '' }
      : { host: '', port: 5432, database: 'core_contracts_app', user: 'core_contracts_app', password: '', sslmode: 'verify-full', ca: '' },
  );
  const [script, setScript] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [initialize, setInitialize] = useState(false);
  const [insecure, setInsecure] = useState(false);
  const [adopt, setAdopt] = useState('');
  const [bridge, setBridge] = useState('unknown');

  const live = useRef({ status, busy });
  live.current = { status, busy };

  const patch = (change: Partial<Connection>) => setConnection((c) => ({ ...c, ...change }));

  const action = useCallback(async (callback: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    try {
      await callback();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Einrichtung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await setupRequest<SetupStatus>('status');
    setStatus(next);
    setBridge((await setupRequest<{ state: string }>('bridge')).state);
    if (automatic && next.phase === 'completed' && next.onboarding_complete) oncomplete();
  }, [automatic, oncomplete]);

  useEffect(() => {
    void action(refresh);
    const timer = setInterval(() => {
      if (live.current.status.phase === 'connecting' && !live.current.busy) void action(refresh);
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const csrf = status.csrf_token;

  const prepare = () =>
    action(async () => {
      if (mode === 'new') {
        const result = await setupRequest<{ script: string }>('provision', { ...connection, password: undefined }, csrf);
        setScript(result.script);
      }
      setPhase(2);
    });

  const connect = () =>
    action(async () => {
      const confirmations = { confirm, allow_insecure: insecure, initialize_empty_database: initialize, adopt_installation_id: adopt };
      await setupRequest(mode === 'new' ? 'import' : 'connect', mode === 'new' ? { ...confirmations, code } : { ...confirmations, connection }, csrf);
      patch({ password: '' });
      setCode('');
      setConfirm(false);
      await refresh();
      setPhase(3);
    });

  const validNow = validConnection(connection, mode === 'existing');

  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-5 px-6 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Ersteinrichtung</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Core Contracts einrichten</h1>
        <p className="mt-1 text-sm text-muted">
          Schritt {phase + 1} von {PHASES.length}: {PHASES[phase]}
        </p>
      </header>
      <nav aria-label="Einrichtungsfortschritt">
        <ol className="flex flex-wrap gap-2">
          {PHASES.map((name, index) => (
            <li
              key={name}
              aria-current={index === phase ? 'step' : undefined}
              className={`rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm ${index === phase ? 'border-accent font-semibold text-accent' : 'border-line text-muted'}`}
            >
              {name}
              {index < phase ? ' ✓' : ''}
            </li>
          ))}
        </ol>
      </nav>
      {notice && <Notice tone="bad" role="alert">{notice}</Notice>}
      {status.error && <Notice tone="warn" role="alert">{statusError(status.error)}</Notice>}

      {status.phase === 'configuration_error' ? (
        <p className="text-sm text-muted">Der Datenbankstart bleibt gesperrt. Identität und Daten werden nicht verändert.</p>
      ) : phase === 0 ? (
        <Panel className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">Willkommen</h2>
          <p className="text-sm text-muted">
            Benötigt werden PostgreSQL 14 oder neuer in einer eigenen Datenbank sowie die Core Contracts Bridge in Home Assistant. Die Bereitstellung des PostgreSQL-LXC erfolgt separat.
          </p>
          <p className="text-sm text-muted">
            Konfigurationsquelle:{' '}
            {status.authority === 'supervisor' ? 'Vorhandene Supervisor-Optionen' : status.authority === 'wizard' ? 'Privater App-Einrichtungszustand' : 'Noch nicht konfiguriert'}.
          </p>
          {status.phase === 'completed' ? (
            <>
              <p className="text-sm text-muted">Datenbank eingerichtet. Installations-ID: {status.installation_id}. Bestehende Identität wird beibehalten.</p>
              <div><Button onClick={() => setPhase(3)}>Datenbankschritte überspringen</Button></div>
            </>
          ) : (
            status.database_configured && (
              <p className="text-sm text-muted">Vorhandene Verbindung wird geprüft. Oberfläche bleibt auch bei DB-Ausfall erreichbar.</p>
            )
          )}
          <div><Button variant="primary" onClick={() => setPhase(1)}>Verbindung {status.database_configured ? 'ausdrücklich neu konfigurieren' : 'einrichten'}</Button></div>
        </Panel>
      ) : phase === 1 ? (
        <Panel className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">PostgreSQL verbinden</h2>
          <LabeledInput label="Einrichtungsweg">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'new' | 'existing')}>
              <option value="new">Neue dedizierte Rolle und Datenbank</option>
              <option value="existing">Vorhandene Verbindung verwenden</option>
            </Select>
          </LabeledInput>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput label="Serveradresse / Hostname">
              <Input value={connection.host} onChange={(e) => patch({ host: e.target.value })} autoComplete="off" required />
            </LabeledInput>
            <LabeledInput label="Port">
              <Input type="number" value={connection.port} min={1} max={65535} onChange={(e) => patch({ port: Number(e.target.value) })} required />
            </LabeledInput>
            <LabeledInput label="Datenbank">
              <Input value={connection.database} onChange={(e) => patch({ database: e.target.value })} required />
            </LabeledInput>
            <LabeledInput label="Anwendungsrolle">
              <Input value={connection.user} onChange={(e) => patch({ user: e.target.value })} required />
            </LabeledInput>
            {mode === 'existing' && (
              <LabeledInput label="Passwort">
                <Input type="password" value={connection.password ?? ''} onChange={(e) => patch({ password: e.target.value })} autoComplete="new-password" />
              </LabeledInput>
            )}
            <LabeledInput label="TLS-Modus">
              <Select value={connection.sslmode} onChange={(e) => patch({ sslmode: e.target.value as Connection['sslmode'] })}>
                <option value="verify-full">verify-full – CA und Hostname prüfen</option>
                <option value="require">require – Verschlüsselung ohne Serverprüfung</option>
                <option value="disable">disable – unverschlüsselt</option>
              </Select>
            </LabeledInput>
            <LabeledInput label="CA-Datei unter /ssl (optional)">
              <Input value={connection.ca} onChange={(e) => patch({ ca: e.target.value })} placeholder="/ssl/postgres-ca.pem" />
            </LabeledInput>
          </div>
          <p className="text-xs text-faint">Version wird nach authentifizierter Verbindung geprüft; ohne Zugangsdaten nicht zuverlässig ermittelbar.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !validConnection(connection, false)}
              onClick={() =>
                action(async () => {
                  const result = await setupRequest<{ tls_available: boolean }>('reachability', { ...connection, password: undefined }, csrf);
                  setNotice(`PostgreSQL erreichbar. TLS ${result.tls_available ? 'angeboten' : 'nicht angeboten'}; Version und Zertifikat folgen bei Anmeldung.`);
                })
              }
            >
              Erreichbarkeit ohne Zugangsdaten prüfen
            </Button>
            <Button variant="primary" disabled={busy || !validNow} onClick={prepare}>Weiter</Button>
          </div>
          {!validNow && (
            <p role="status" className="text-xs text-warn">
              Host, Port, Namen und gegebenenfalls Passwort prüfen. Namen: Kleinbuchstaben, Ziffern, Unterstrich.
            </p>
          )}
        </Panel>
      ) : phase === 2 ? (
        <Panel className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{mode === 'new' ? 'Einrichtungsskript und geheimer Import' : 'Verbindung übernehmen'}</h2>
          {mode === 'new' && (
            <>
              <p className="text-sm text-muted">
                Skript prüfen und vollständig einmal in ein privates Terminal des PostgreSQL-LXC einfügen. Es läuft lokal als postgres; keine Datei und kein Verzeichnis müssen manuell angelegt werden. Linux, Python ab 3.10, psql und sudo erforderlich. Fremde Datenbanken/Rollen werden abgewiesen.
              </p>
              <LabeledInput label="Skript">
                <Textarea readOnly value={script} aria-label="PostgreSQL-Einrichtungsskript" className="min-h-64" />
              </LabeledInput>
              <div><Button onClick={() => action(() => navigator.clipboard.writeText(script))}>Skript kopieren</Button></div>
              <p className="text-sm text-muted">
                Importcode enthält das Passwort. Nur hier einfügen; keine URLs, Shell-Befehle, Logs oder Issues. Privater Resume-Zustand verbleibt für Wiederholung im LXC.
              </p>
              <LabeledInput label="Geheimer Importcode">
                <Input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
              </LabeledInput>
              <div><Button disabled={!code || busy} onClick={() => action(() => navigator.clipboard.writeText(code))}>Importcode kopieren (geheim)</Button></div>
            </>
          )}
          <Check checked={initialize} onChange={setInitialize}>Eigene leere Datenbank ausdrücklich initialisieren</Check>
          <LabeledInput label="Bei Wiederherstellung: vorhandene Datenbank-ID ausdrücklich übernehmen">
            <Input value={adopt} onChange={(e) => setAdopt(e.target.value)} placeholder="Vorhandene UUID; sonst leer" />
          </LabeledInput>
          {connection.sslmode !== 'verify-full' && (
            <Check checked={insecure} onChange={setInsecure}>Eingeschränkten TLS-Schutz ausdrücklich akzeptieren</Check>
          )}
          <Check checked={confirm} onChange={setConfirm}>
            Verbindung prüfen und als alleinige DB-Konfigurationsquelle der App speichern. Bei laufender Installation erst nach eigenem App-Neustart wirksam.
          </Check>
          <div>
            <Button variant="primary" disabled={busy || !confirm || (mode === 'new' && !code) || (connection.sslmode !== 'verify-full' && !insecure)} onClick={connect}>
              Prüfen und übernehmen
            </Button>
          </div>
        </Panel>
      ) : phase === 3 ? (
        <Panel className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">Home-Assistant-Bridge</h2>
          <p role="status" className="text-sm">{BRIDGE_LABELS[bridge] ?? 'Bridge-Zustand unbekannt'}</p>
          {bridge !== 'active' && (
            <>
              <Notice tone="warn">
                Offener Release-Blocker SELF-INSTALL-01: App kann unter vorhandenen Berechtigungen keine Custom-Integration-Dateien installieren. Unterstützter Weg: HACS.
              </Notice>
              <ol className="list-decimal space-y-1.5 pl-6 text-sm text-muted">
                <li>In HACS <code>Levtos/core_contract_app</code> als benutzerdefinierte Integration hinzufügen und Core Contracts Bridge installieren. Ein kompatibler veröffentlichter HACS-Stand muss verfügbar sein.</li>
                <li>HA-Core-Neustart selbst nach Prüfung des Wartungsfensters bestätigen. Er unterbricht auch die Legacy-Integration vorübergehend.</li>
                <li>In HA „Core Contracts Bridge“ hinzufügen. Domain: <code>core_contracts_bridge</code>; Legacy-Integration nicht auswählen.</li>
              </ol>
              <div>
                <a className="text-sm text-accent underline-offset-2 hover:underline" href="https://my.home-assistant.io/redirect/config_flow_start?domain=core_contracts_bridge" target="_blank" rel="noreferrer">
                  Bridge-Konfiguration in HA öffnen
                </a>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => action(refresh)}>Bridge erneut prüfen</Button>
            <Button onClick={() => setPhase(4)}>Ergebnisse ansehen</Button>
            {bridge === 'installed_not_configured' && (
              <Button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    if (window.confirm('Genau einen Core Contracts Bridge-Eintrag in HA anlegen? Die Legacy-Integration wird nicht geändert.')) {
                      await setupRequest('bridge_configure', { confirm: true }, csrf);
                      await refresh();
                    }
                  })
                }
              >
                Bridge-Konfigurationseintrag anlegen
              </Button>
            )}
          </div>
        </Panel>
      ) : (
        <Panel className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">Ergebnis</h2>
          <p className="text-sm text-muted">
            Datenbank: {status.phase === 'completed' ? 'eingerichtet' : 'Initialisierung noch ausstehend'}. Bridge: {BRIDGE_LABELS[bridge] ?? bridge}.
          </p>
          {status.restart_required && (
            <Notice tone="warn" role="alert">Neue Verbindung gespeichert. Eigener App-Neustart erforderlich. Vorher Backup und Ziel prüfen.</Notice>
          )}
          <p className="text-sm text-muted">
            Ersteinrichtung und Runtime-Readiness sind getrennt. Aktive Registry und erster Bridge-Snapshot folgen als ausdrücklich freigegebene Schritte. Keine Registry wurde aktiviert.
          </p>
          <div>
            <Button
              variant="primary"
              disabled={status.phase !== 'completed' || bridge !== 'active' || busy}
              onClick={() => action(async () => { await setupRequest('finish', { confirm: true }, csrf); oncomplete(); })}
            >
              Einrichtung abschließen und Oberfläche öffnen
            </Button>
          </div>
        </Panel>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={phase === 0 || busy} onClick={() => setPhase((p) => p - 1)}>Zurück</Button>
        {status.phase === 'completed' && <Button onClick={oncomplete}>Zur Administration (offene Einrichtung bleibt erhalten)</Button>}
      </div>
    </main>
  );
}

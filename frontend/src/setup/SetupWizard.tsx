import { t as uiText } from '@/i18n';
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

const PHASES = [uiText("setup.SetupWizard.willkommen_c4dc12"), uiText("setup.SetupWizard.postgresql_verbinden_b6e00c"), uiText("setup.SetupWizard.skript_und_import_5ad228"), uiText("setup.SetupWizard.bridge_einrichten_325458"), uiText("setup.SetupWizard.abschluss_e47280")];

export const BRIDGE_LABELS: Record<string, string> = {
  active: uiText("setup.SetupWizard.bridge_aktiv_protokoll_1_89e62f"),
  installed_not_configured: uiText("setup.SetupWizard.bridge_erkannt_konfigurationseintrag_fehlt_41dc32"),
  missing_or_restart_pending: uiText("setup.SetupWizard.bridge_nicht_erkannt_fehlt_oder_ha_neustart_steh_d102c5"),
  incompatible: uiText("setup.SetupWizard.bridge_protokoll_inkompatibel_2f4ecc"),
  unavailable: uiText("setup.SetupWizard.ha_verbindung_derzeit_nicht_erreichbar_d0026e"),
  authorization_failed: uiText("setup.SetupWizard.ha_zugriff_nicht_autorisiert_0a376b"),
  unknown: uiText("setup.SetupWizard.bridge_wird_gepruft_35a305"),
};

function statusError(error: string): string {
  if (error === 'invalid_supervisor_options')
    return uiText("setup.SetupWizard.vorhandene_app_optionen_sind_ungultig_bitte_in_d_33e2cc");
  if (error === 'database_connection_failed')
    return uiText("setup.SetupWizard.postgresql_nicht_erreichbar_oder_anmeldung_tls_f_968aed");
  return uiText("setup.SetupWizard.identitat_oder_schema_abgewiesen_verbindung_pruf_0debd0");
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
      setNotice(error instanceof Error ? error.message : uiText("setup.SetupWizard.einrichtung_fehlgeschlagen_959a79"));
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
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{uiText("setup.SetupWizard.ersteinrichtung_84c9bd")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{uiText("setup.SetupWizard.core_contracts_einrichten_c89657")}</h1>
        <p className="mt-1 text-sm text-muted">
          {uiText("setup.SetupWizard.schritt_c0f684")}{phase + 1} {uiText("setup.SetupWizard.von_16b4d3")}{PHASES.length}: {PHASES[phase]}
        </p>
      </header>
      <nav aria-label={uiText("setup.SetupWizard.einrichtungsfortschritt_b753dc")}>
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
        <p className="text-sm text-muted">{uiText("setup.SetupWizard.der_datenbankstart_bleibt_gesperrt_identitat_und_1b065e")}</p>
      ) : phase === 0 ? (
        <Panel className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{uiText("setup.SetupWizard.willkommen_c4dc12")}</h2>
          <p className="text-sm text-muted">
            {uiText("setup.SetupWizard.benotigt_werden_postgresql_14_oder_neuer_in_eine_6d642d")}</p>
          <p className="text-sm text-muted">
            {uiText("setup.SetupWizard.konfigurationsquelle_a3d30a")}{' '}
            {status.authority === 'supervisor' ? uiText("setup.SetupWizard.vorhandene_supervisor_optionen_057912") : status.authority === 'wizard' ? uiText("setup.SetupWizard.privater_app_einrichtungszustand_09ec0b") : uiText("setup.SetupWizard.noch_nicht_konfiguriert_24db6c")}.
          </p>
          {status.phase === 'completed' ? (
            <>
              <p className="text-sm text-muted">{uiText("setup.SetupWizard.datenbank_eingerichtet_installations_id_a2ec23")}{status.installation_id}{uiText("setup.SetupWizard.bestehende_identitat_wird_beibehalten_697e3e")}</p>
              <div><Button variant="primary" onClick={() => setPhase(3)}>{uiText("setup.SetupWizard.datenbankschritte_uberspringen_d4f0ab")}</Button></div>
            </>
          ) : (
            status.database_configured && (
              <p className="text-sm text-muted">{uiText("setup.SetupWizard.vorhandene_verbindung_wird_gepruft_oberflache_bl_32f31b")}</p>
            )
          )}
          <div><Button variant={status.database_configured ? 'outline' : 'primary'} onClick={() => setPhase(1)}>{uiText("setup.SetupWizard.verbindung_8ec4b6")}{status.database_configured ? uiText("setup.SetupWizard.ausdrucklich_neu_konfigurieren_8d323e") : uiText("setup.SetupWizard.einrichten_f456a9")}</Button></div>
        </Panel>
      ) : phase === 1 ? (
        <Panel className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{uiText("setup.SetupWizard.postgresql_verbinden_b6e00c")}</h2>
          <LabeledInput label={uiText("setup.SetupWizard.einrichtungsweg_d2aab1")}>
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'new' | 'existing')}>
              <option value="new">{uiText("setup.SetupWizard.neue_dedizierte_rolle_und_datenbank_f428fe")}</option>
              <option value="existing">{uiText("setup.SetupWizard.vorhandene_verbindung_verwenden_4ba967")}</option>
            </Select>
          </LabeledInput>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput label={uiText("setup.SetupWizard.serveradresse_hostname_1325fc")}>
              <Input value={connection.host} onChange={(e) => patch({ host: e.target.value })} autoComplete="off" required />
            </LabeledInput>
            <LabeledInput label={uiText("setup.SetupWizard.port_72e9a5")}>
              <Input type="number" value={connection.port} min={1} max={65535} onChange={(e) => patch({ port: Number(e.target.value) })} required />
            </LabeledInput>
            <LabeledInput label={uiText("setup.SetupWizard.datenbank_4cc807")}>
              <Input value={connection.database} onChange={(e) => patch({ database: e.target.value })} required />
            </LabeledInput>
            <LabeledInput label={uiText("setup.SetupWizard.anwendungsrolle_8e381b")}>
              <Input value={connection.user} onChange={(e) => patch({ user: e.target.value })} required />
            </LabeledInput>
            {mode === 'existing' && (
              <LabeledInput label={uiText("setup.SetupWizard.passwort_a36c10")}>
                <Input type="password" value={connection.password ?? ''} onChange={(e) => patch({ password: e.target.value })} autoComplete="new-password" />
              </LabeledInput>
            )}
            <LabeledInput label={uiText("setup.SetupWizard.tls_modus_560328")}>
              <Select value={connection.sslmode} onChange={(e) => patch({ sslmode: e.target.value as Connection['sslmode'] })}>
                <option value="verify-full">{uiText("setup.SetupWizard.verify_full_ca_und_hostname_prufen_a35ddf")}</option>
                <option value="require">{uiText("setup.SetupWizard.require_verschlusselung_ohne_serverprufung_ee62c5")}</option>
                <option value="disable">{uiText("setup.SetupWizard.disable_unverschlusselt_e678cc")}</option>
              </Select>
            </LabeledInput>
            <LabeledInput label={uiText("setup.SetupWizard.ca_datei_unter_ssl_optional_fa3385")}>
              <Input value={connection.ca} onChange={(e) => patch({ ca: e.target.value })} placeholder={uiText("setup.SetupWizard.ssl_postgres_ca_pem_72603c")} />
            </LabeledInput>
          </div>
          <p className="text-xs text-faint">{uiText("setup.SetupWizard.version_wird_nach_authentifizierter_verbindung_g_bcfd63")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !validConnection(connection, false)}
              onClick={() =>
                action(async () => {
                  const result = await setupRequest<{ tls_available: boolean }>('reachability', { ...connection, password: undefined }, csrf);
                  setNotice(uiText("setup.SetupWizard.postgresql_erreichbar_tls_v0_version_und_zertifi_e4a728", { v0: (result.tls_available ? uiText("setup.SetupWizard.angeboten_b7e201") : uiText("setup.SetupWizard.nicht_angeboten_4730a6")) }));
                })
              }
            >
              {uiText("setup.SetupWizard.erreichbarkeit_ohne_zugangsdaten_prufen_ab97c1")}</Button>
            <Button variant="primary" disabled={busy || !validNow} onClick={prepare}>{uiText("setup.SetupWizard.weiter_1e14bd")}</Button>
          </div>
          {!validNow && (
            <p role="status" className="text-xs text-warn">
              {uiText("setup.SetupWizard.host_port_namen_und_gegebenenfalls_passwort_pruf_df6e6a")}</p>
          )}
        </Panel>
      ) : phase === 2 ? (
        <Panel className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{mode === 'new' ? uiText("setup.SetupWizard.einrichtungsskript_und_geheimer_import_1c2ce9") : uiText("setup.SetupWizard.verbindung_ubernehmen_0d954e")}</h2>
          {mode === 'new' && (
            <>
              <p className="text-sm text-muted">
                {uiText("setup.SetupWizard.skript_prufen_und_vollstandig_einmal_in_ein_priv_163953")}</p>
              <LabeledInput label={uiText("setup.SetupWizard.skript_8c598d")}>
                <Textarea readOnly value={script} aria-label={uiText("setup.SetupWizard.postgresql_einrichtungsskript_7896f8")} className="min-h-64" />
              </LabeledInput>
              <div><Button onClick={() => action(() => navigator.clipboard.writeText(script))}>{uiText("setup.SetupWizard.skript_kopieren_20d48d")}</Button></div>
              <p className="text-sm text-muted">
                {uiText("setup.SetupWizard.importcode_enthalt_das_passwort_nur_hier_einfuge_27cbc8")}</p>
              <LabeledInput label={uiText("setup.SetupWizard.geheimer_importcode_3f5e14")}>
                <Input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
              </LabeledInput>
              <div><Button disabled={!code || busy} onClick={() => action(() => navigator.clipboard.writeText(code))}>{uiText("setup.SetupWizard.importcode_kopieren_geheim_ea96b8")}</Button></div>
            </>
          )}
          <Check checked={initialize} onChange={setInitialize}>{uiText("setup.SetupWizard.eigene_leere_datenbank_ausdrucklich_initialisier_780b2a")}</Check>
          <LabeledInput label={uiText("setup.SetupWizard.bei_wiederherstellung_vorhandene_datenbank_id_au_a247ee")}>
            <Input value={adopt} onChange={(e) => setAdopt(e.target.value)} placeholder={uiText("setup.SetupWizard.vorhandene_uuid_sonst_leer_479fff")} />
          </LabeledInput>
          {connection.sslmode !== 'verify-full' && (
            <Check checked={insecure} onChange={setInsecure}>{uiText("setup.SetupWizard.eingeschrankten_tls_schutz_ausdrucklich_akzeptie_6c5204")}</Check>
          )}
          <Check checked={confirm} onChange={setConfirm}>
            {uiText("setup.SetupWizard.verbindung_prufen_und_als_alleinige_db_konfigura_7c2dc2")}</Check>
          <div>
            <Button variant="primary" disabled={busy || !confirm || (mode === 'new' && !code) || (connection.sslmode !== 'verify-full' && !insecure)} onClick={connect}>
              {uiText("setup.SetupWizard.prufen_und_ubernehmen_6d85d6")}</Button>
          </div>
        </Panel>
      ) : phase === 3 ? (
        <Panel className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{uiText("setup.SetupWizard.home_assistant_bridge_47a4b2")}</h2>
          <p role="status" className="text-sm">{BRIDGE_LABELS[bridge] ?? uiText("setup.SetupWizard.bridge_zustand_unbekannt_5482dd")}</p>
          {bridge !== 'active' && (
            <>
              <Notice tone="warn">
                {uiText("setup.SetupWizard.offener_release_blocker_self_install_01_app_kann_ac9f1d")}</Notice>
              <ol className="list-decimal space-y-1.5 pl-6 text-sm text-muted">
                <li>{uiText("setup.SetupWizard.in_hacs_d237bf")}<code>{uiText("setup.SetupWizard.levtos_core_contract_app_991b3f")}</code> {uiText("setup.SetupWizard.als_benutzerdefinierte_integration_hinzufugen_un_a896fe")}</li>
                <li>{uiText("setup.SetupWizard.ha_core_neustart_selbst_nach_prufung_des_wartung_195f96")}</li>
                <li>{uiText("setup.SetupWizard.in_ha_core_contracts_bridge_hinzufugen_domain_34a2b1")}<code>{uiText("setup.SetupWizard.core_contracts_bridge_694370")}</code>{uiText("setup.SetupWizard.legacy_integration_nicht_auswahlen_3a1ea1")}</li>
              </ol>
              <div>
                <a className="text-sm text-accent underline-offset-2 hover:underline" href="https://my.home-assistant.io/redirect/config_flow_start?domain=core_contracts_bridge" target="_blank" rel="noreferrer">
                  {uiText("setup.SetupWizard.bridge_konfiguration_in_ha_offnen_473fc7")}</a>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => action(refresh)}>{uiText("setup.SetupWizard.bridge_erneut_prufen_78c8e3")}</Button>
            <Button variant="primary" onClick={() => action(async () => { await refresh(); setPhase(4); })}>{uiText("setup.SetupWizard.weiter_ergebnisse_ansehen_a99408")}</Button>
            {bridge === 'installed_not_configured' && (
              <Button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    if (window.confirm(uiText("setup.SetupWizard.genau_einen_core_contracts_bridge_eintrag_in_ha__95dd29"))) {
                      await setupRequest('bridge_configure', { confirm: true }, csrf);
                      await refresh();
                    }
                  })
                }
              >
                {uiText("setup.SetupWizard.bridge_konfigurationseintrag_anlegen_8c6e61")}</Button>
            )}
          </div>
        </Panel>
      ) : (
        <Panel className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{uiText("setup.SetupWizard.ergebnis_cd8e22")}</h2>
          <p className="text-sm text-muted">
            {uiText("setup.SetupWizard.datenbank_6fda4b")}{status.phase === 'completed' ? uiText("setup.SetupWizard.eingerichtet_68b238") : uiText("setup.SetupWizard.initialisierung_noch_ausstehend_e337ae")}{uiText("setup.SetupWizard.bridge_d2884b")}{BRIDGE_LABELS[bridge] ?? bridge}.
          </p>
          {status.restart_required && (
            <Notice tone="warn" role="alert">{uiText("setup.SetupWizard.neue_verbindung_gespeichert_eigener_app_neustart_286a9f")}</Notice>
          )}
          <p className="text-sm text-muted">
            {uiText("setup.SetupWizard.ersteinrichtung_und_runtime_readiness_sind_getre_f1f378")}{status.registry_revision ? uiText("setup.SetupWizard.konfiguration_version_v0_ist_aktiv_3f9131", { v0: (status.registry_revision) }) : status.registry_revision === 0 ? uiText("setup.SetupWizard.es_ist_noch_keine_konfiguration_ubernommen_45abe2") : uiText("setup.SetupWizard.der_aktive_konfigurationsstand_ist_noch_nicht_be_8968d0")} {uiText("setup.SetupWizard.der_assistent_selbst_ubernimmt_keine_konfigurati_867ac0")}</p>
          <div>
            <Button
              variant="primary"
              disabled={status.phase !== 'completed' || bridge !== 'active' || busy}
              onClick={() => action(async () => { await setupRequest('finish', { confirm: true }, csrf); oncomplete(); })}
            >
              {uiText("setup.SetupWizard.einrichtung_abschlie_en_und_oberflache_offnen_ba08e2")}</Button>
          </div>
        </Panel>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={phase === 0 || busy} onClick={() => setPhase((p) => p - 1)}>{uiText("setup.SetupWizard.zuruck_548611")}</Button>
        {status.phase === 'completed' && <Button onClick={oncomplete}>{uiText("setup.SetupWizard.zur_administration_offene_einrichtung_bleibt_erh_5faa3c")}</Button>}
      </div>
    </main>
  );
}

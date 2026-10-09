<script lang="ts">
  import { onMount } from 'svelte';
  import { setupRequest, validConnection, type Connection, type SetupStatus } from './setup';
  let { initial, oncomplete }: { initial: SetupStatus; oncomplete: () => void } = $props();
  const startingStatus = () => initial;
  let status = $state(startingStatus()), phase = $state(0), mode = $state('new');
  let connection = $state<Connection>({ host: '', port: 5432, database: 'core_contracts_app', user: 'core_contracts_app', password: '', sslmode: 'verify-full', ca: '' });
  let script = $state(''), code = $state(''), notice = $state(''), busy = $state(false);
  let confirm = $state(false), initialize = $state(false), insecure = $state(false), adopt = $state('');
  let bridge = $state('unknown');
  const phases = ['Willkommen', 'PostgreSQL verbinden', 'Skript und Import', 'Bridge einrichten', 'Abschluss'];
  async function refresh() { status = await setupRequest<SetupStatus>('status'); bridge = (await setupRequest<{ state: string }>('bridge')).state; }
  async function action(callback: () => Promise<void>) {
    busy = true; notice = '';
    try { await callback(); } catch (error) { notice = error instanceof Error ? error.message : 'Einrichtung fehlgeschlagen.'; }
    finally { busy = false; }
  }
  async function prepare() {
    await action(async () => {
      if (mode === 'new') script = (await setupRequest<{ script: string }>('provision', { ...connection, password: undefined }, status.csrf_token)).script;
      phase = 2;
    });
  }
  async function connect() {
    await action(async () => {
      const confirmations = { confirm, allow_insecure: insecure, initialize_empty_database: initialize, adopt_installation_id: adopt };
      await setupRequest(mode === 'new' ? 'import' : 'connect', mode === 'new' ? { ...confirmations, code } : { ...confirmations, connection }, status.csrf_token);
      connection.password = ''; code = ''; confirm = false;
      await refresh(); phase = 3;
    });
  }
  onMount(() => {
    if (initial.database) connection = { ...initial.database, password: '' };
    void action(refresh);
    const timer = setInterval(() => { if (status.phase === 'connecting' && !busy) void action(refresh); }, 3000);
    return () => clearInterval(timer);
  });
  const bridgeLabels: Record<string, string> = {
    active: 'Bridge aktiv (Protokoll 1)', installed_not_configured: 'Bridge erkannt, Konfigurationseintrag fehlt',
    missing_or_restart_pending: 'Bridge nicht erkannt: fehlt oder HA-Neustart steht aus', incompatible: 'Bridge-Protokoll inkompatibel',
    unavailable: 'HA-Verbindung derzeit nicht erreichbar', authorization_failed: 'HA-Zugriff nicht autorisiert', unknown: 'Bridge wird geprüft',
  };
</script>

<main class="wizard">
  <header><div><p class="eyebrow">ERSTEINRICHTUNG · ALPHA 1</p><h1>Core Contracts einrichten</h1><p>Schritt {phase + 1} von {phases.length}: {phases[phase]}</p></div></header>
  <nav aria-label="Einrichtungsfortschritt"><ol>{#each phases as name, index}<li aria-current={index === phase ? 'step' : undefined}>{name}{index < phase ? ' ✓' : ''}</li>{/each}</ol></nav>
  {#if notice}<p role="alert" class="notice">{notice}</p>{/if}
  {#if status.error}<p role="alert">Identität oder Schema abgewiesen. Verbindung prüfen; keine automatische Neuinitialisierung.</p>{/if}
  {#if phase === 0}
    <section><h2>Willkommen</h2><p>Benötigt werden PostgreSQL 14 oder neuer in einer eigenen Datenbank sowie die Core Contracts Bridge in Home Assistant. Die Bereitstellung des PostgreSQL-LXC erfolgt separat.</p>
      <p>Konfigurationsquelle: {status.authority === 'supervisor' ? 'Vorhandene Supervisor-Optionen' : status.authority === 'wizard' ? 'Privater App-Einrichtungszustand' : 'Noch nicht konfiguriert'}.</p>
      {#if status.phase === 'completed'}<p>Datenbank eingerichtet. Installations-ID: {status.installation_id}. Bestehende Identität wird beibehalten.</p><button onclick={() => phase = 3}>Datenbankschritte überspringen</button>{:else if status.database_configured}<p>Vorhandene Verbindung wird geprüft. Oberfläche bleibt auch bei DB-Ausfall erreichbar.</p>{/if}
      <button onclick={() => phase = 1}>Verbindung {status.database_configured ? 'ausdrücklich neu konfigurieren' : 'einrichten'}</button>
    </section>
  {:else if phase === 1}
    <section><h2>PostgreSQL verbinden</h2>
      <label>Einrichtungsweg<select bind:value={mode}><option value="new">Neue dedizierte Rolle und Datenbank</option><option value="existing">Vorhandene Verbindung verwenden</option></select></label>
      <label>Serveradresse / Hostname<input bind:value={connection.host} autocomplete="off" required/></label><label>Port<input type="number" bind:value={connection.port} min="1" max="65535" required/></label>
      <label>Datenbank<input bind:value={connection.database} required/></label><label>Anwendungsrolle<input bind:value={connection.user} required/></label>
      {#if mode === 'existing'}<label>Passwort<input type="password" bind:value={connection.password} autocomplete="new-password"/></label>{/if}
      <label>TLS-Modus<select bind:value={connection.sslmode}><option value="verify-full">verify-full – CA und Hostname prüfen</option><option value="require">require – Verschlüsselung ohne Serverprüfung</option><option value="disable">disable – unverschlüsselt</option></select></label>
      <label>CA-Datei unter /ssl (optional)<input bind:value={connection.ca} placeholder="/ssl/postgres-ca.pem"/></label>
      <p>Version wird nach authentifizierter Verbindung geprüft; ohne Zugangsdaten nicht zuverlässig ermittelbar.</p>
      <button disabled={busy || !validConnection(connection, false)} onclick={() => action(async () => { const result = await setupRequest<{tls_available:boolean}>('reachability', {...connection,password:undefined},status.csrf_token); notice = `PostgreSQL erreichbar. TLS ${result.tls_available ? 'angeboten' : 'nicht angeboten'}; Version und Zertifikat folgen bei Anmeldung.`; })}>Erreichbarkeit ohne Zugangsdaten prüfen</button>
      {#if !validConnection(connection, mode === 'existing')}<p role="status">Host, Port, Namen und gegebenenfalls Passwort prüfen. Namen: Kleinbuchstaben, Ziffern, Unterstrich.</p>{/if}
      <button disabled={busy || !validConnection(connection, mode === 'existing')} onclick={prepare}>Weiter</button>
    </section>
  {:else if phase === 2}
    <section><h2>{mode === 'new' ? 'Einrichtungsskript und geheimer Import' : 'Verbindung übernehmen'}</h2>
      {#if mode === 'new'}<p>Skript prüfen, privat als Datei im PostgreSQL-LXC speichern und mit <code>sudo -u postgres python3 /privater/pfad/setup.py</code> ausführen. Python 3 und psql erforderlich. Fremde Datenbanken/Rollen werden abgewiesen.</p>
        <label>Skript<textarea readonly value={script} aria-label="PostgreSQL-Einrichtungsskript"></textarea></label><button onclick={() => action(() => navigator.clipboard.writeText(script))}>Skript kopieren</button>
        <p>Importcode enthält das Passwort. Nur hier einfügen; keine URLs, Shell-Befehle, Logs oder Issues. Privater Resume-Zustand verbleibt für Wiederholung im LXC.</p>
        <label>Geheimer Importcode<input type="password" bind:value={code} autocomplete="off"/></label>
        <button disabled={!code || busy} onclick={() => action(() => navigator.clipboard.writeText(code))}>Importcode kopieren (geheim)</button>
      {/if}
      <label><input type="checkbox" bind:checked={initialize}/> Eigene leere Datenbank ausdrücklich initialisieren</label>
      <label>Bei Wiederherstellung: vorhandene Datenbank-ID ausdrücklich übernehmen<input bind:value={adopt} placeholder="Vorhandene UUID; sonst leer"/></label>
      {#if connection.sslmode !== 'verify-full'}<label><input type="checkbox" bind:checked={insecure}/> Eingeschränkten TLS-Schutz ausdrücklich akzeptieren</label>{/if}
      <label><input type="checkbox" bind:checked={confirm}/> Verbindung prüfen und als alleinige DB-Konfigurationsquelle der App speichern. Bei laufender Installation erst nach eigenem App-Neustart wirksam.</label>
      <button disabled={busy || !confirm || (mode === 'new' && !code) || (connection.sslmode !== 'verify-full' && !insecure)} onclick={connect}>Prüfen und übernehmen</button>
    </section>
  {:else if phase === 3}
    <section><h2>Home-Assistant-Bridge</h2><p role="status">{bridgeLabels[bridge] ?? 'Bridge-Zustand unbekannt'}</p>
      {#if bridge !== 'active'}<p class="notice">Offener Release-Blocker SELF-INSTALL-01: App kann unter vorhandenen Berechtigungen keine Custom-Integration-Dateien installieren. Unterstützter Weg: HACS.</p>
        <ol><li>In HACS <code>Levtos/core_contract_app</code> als benutzerdefinierte Integration hinzufügen und Core Contracts Bridge installieren. Ein kompatibler veröffentlichter HACS-Stand muss verfügbar sein.</li><li>HA-Core-Neustart selbst nach Prüfung des Wartungsfensters bestätigen. Er unterbricht auch die Legacy-Integration vorübergehend.</li><li>In HA „Core Contracts Bridge“ hinzufügen. Domain: <code>core_contracts_bridge</code>; Legacy-Integration nicht auswählen.</li></ol>
        <a href="https://my.home-assistant.io/redirect/config_flow_start?domain=core_contracts_bridge" target="_blank" rel="noreferrer">Bridge-Konfiguration in HA öffnen</a>
      {/if}
      <button disabled={busy} onclick={() => action(refresh)}>Bridge erneut prüfen</button><button onclick={() => phase = 4}>Ergebnisse ansehen</button>
    </section>
  {:else}
    <section><h2>Ergebnis</h2><p>Datenbank: {status.phase === 'completed' ? 'eingerichtet' : 'Initialisierung noch ausstehend'}. Bridge: {bridgeLabels[bridge] ?? bridge}.</p>
      {#if status.restart_required}<p role="alert">Neue Verbindung gespeichert. Eigener App-Neustart erforderlich. Vorher Backup und Ziel prüfen.</p>{/if}
      <p>Ersteinrichtung und Runtime-Readiness sind getrennt. Aktive Registry und erster Bridge-Snapshot folgen als ausdrücklich freigegebene Schritte. Keine Registry wurde aktiviert.</p>
      <button disabled={status.phase !== 'completed'} onclick={oncomplete}>Normale Oberfläche öffnen</button>
    </section>
  {/if}
  <div class="actions"><button disabled={phase === 0 || busy} onclick={() => phase--}>Zurück</button>{#if status.phase === 'completed'}<button onclick={oncomplete}>Zur Administration</button>{/if}</div>
</main>

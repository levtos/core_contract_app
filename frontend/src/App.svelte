<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, Database, GitBranch, Radio, RefreshCw } from '@lucide/svelte';
  import { Tabs } from 'bits-ui';
  import { request, serviceState, type Draft, type Json, type Revision, type Service, type UIState } from './api';
  let uiState=$state<UIState>('loading');
  let info=$state<Json>(null),diagnostics=$state<Json>(null),sources=$state<Json>([]),bindings=$state<Json>([]),contracts=$state<Json>({});
  let revisions=$state<Revision[]>([]),drafts=$state<Draft[]>([]),active=$state<Revision|null>(null),selected=$state<Draft|null>(null);
  let editor=$state('{}'),validation=$state<Json>(null),notice=$state(''),busy=$state(false),sourceId=$state(''),evidence=$state<Json>(null);
  let token=$state('');
  const labels:Record<UIState,string>={loading:'Lädt',ready:'Bereit',empty:'Noch keine aktive Registry',stale:'Letzter Stand unbestätigt',degraded:'Eingeschränkte Verbindung',unavailable:'Dienst nicht verfügbar',reconnecting:'Verbindung wird hergestellt',offline:'Offline',error:'Fehler',blocked:'Voraussetzungen fehlen'};
  const pretty=(value:unknown)=>JSON.stringify(value,null,2);
  async function load() {
    try {
      const [i,d,s,b,c,r,a,dr]=await Promise.all([request<Json>('info'),request<Json>('diagnostics'),request<Json>('sources'),request<Json>('bindings'),request<Json>('contracts'),request<Revision[]>('registry/revisions'),request<Revision|null>('registry/active'),request<Draft[]>('registry/drafts')]);
      info=i;diagnostics=d;sources=s;bindings=b;contracts=c;revisions=r;active=a;drafts=dr;
      uiState=!a?'empty':serviceState((d as unknown as {service:Service}).service);
    } catch(error) {uiState=navigator.onLine?'unavailable':'offline';notice=String(error);}
  }
  async function action(callback:()=>Promise<void>) {
    busy=true;notice='';
    try {await callback();await load();} catch(error) {notice=String(error);} finally {busy=false;}
  }
  function choose(draft:Draft) {selected=draft;editor=pretty(draft.config);validation=null;}
  async function save() {await action(async()=>{const config=JSON.parse(editor);selected=selected?await request<Draft>(`registry/drafts/${selected.draft_id}`,'PUT',{config,draft_version:selected.draft_version}):await request<Draft>('registry/drafts','POST',config);validation=null;});}
  async function validateDraft() {await action(async()=>{if(selected) validation=await request<Json>(`registry/drafts/${selected.draft_id}/validate`,'POST',{});});}
  async function activateDraft() {await action(async()=>{if(selected) await request(`registry/drafts/${selected.draft_id}/activate`,'POST',{draft_version:selected.draft_version,expected_active_revision:active?.revision??0});});}
  async function rollback(revision:number) {if(window.confirm(`Revision ${revision} als neue aktive Revision übernehmen?`)) await action(async()=>{await request('registry/rollback','POST',{revision,expected_active_revision:active?.revision??0});});}
  async function rotate(role:string) {if(window.confirm(`${role}-Token ersetzen? Bestehende Clients müssen danach aktualisiert werden.`)) await action(async()=>{token=(await request<{token:string}>('tokens/rotate','POST',{role})).token;});}
  onMount(()=>{
    void load();
    const socketUrl=new URL('./api/v1/ws',location.href);socketUrl.protocol=location.protocol==='https:'?'wss:':'ws:';
    let socket:WebSocket|undefined,timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
    function connect() {if(disposed)return;socket=new WebSocket(socketUrl);socket.onopen=()=>socket?.send(JSON.stringify({type:'hello',protocol_version:1}));socket.onmessage=(message)=>{const event=JSON.parse(message.data);if(event.type==='welcome')socket?.send(JSON.stringify({type:'subscribe',id:'admin'}));if(event.type==='delta'||event.type==='snapshot') contracts=event.contracts;if(event.type==='service_state')uiState=serviceState(event);if(event.type==='resync_required')socket?.send(JSON.stringify({type:'subscribe',id:'resync'}));};socket.onclose=()=>{if(!disposed){uiState=navigator.onLine?'reconnecting':'offline';timer=setTimeout(connect,2000);}};}
    connect();return()=>{disposed=true;clearTimeout(timer);socket?.close();};
  });
</script>

<main>
  <header><div><p class="eyebrow">PLATFORM FOUNDATION · ALPHA 1</p><h1>Core Contracts</h1><p>Installation, Evidenz und Registry</p></div><button onclick={load} disabled={busy}><RefreshCw size={18}/> Aktualisieren</button></header>
  <div class="status" role="status" data-state={uiState}><Activity size={18}/><strong>{labels[uiState]}</strong><span>TEST · ausschließlich synthetische Contracts</span></div>
  {#if notice}<p role="alert" class="notice">{notice}</p>{/if}
  <Tabs.Root value="status">
    <Tabs.List class="tabs"><Tabs.Trigger value="status"><Activity size={16}/> Status</Tabs.Trigger><Tabs.Trigger value="registry"><GitBranch size={16}/> Registry</Tabs.Trigger><Tabs.Trigger value="sources"><Radio size={16}/> Sources & Bindings</Tabs.Trigger><Tabs.Trigger value="contracts"><Database size={16}/> Testcontracts</Tabs.Trigger><Tabs.Trigger value="diagnostics">Diagnose & Tokens</Tabs.Trigger></Tabs.List>
    <Tabs.Content value="status"><section><h2>Installation</h2><pre>{pretty(info)}</pre></section><section><h2>Komponenten und offene Voraussetzungen</h2><pre>{pretty(diagnostics)}</pre></section></Tabs.Content>
    <Tabs.Content value="registry"><div class="grid"><section><h2>Revisionen</h2><p>Aktiv: {active?.revision??'keine'}</p>{#each revisions as revision}<article><strong>Revision {revision.revision}</strong><code>{revision.checksum.slice(0,12)}</code><button disabled={busy||revision.revision===active?.revision} onclick={()=>rollback(revision.revision)}>Als neue Revision aktivieren</button></article>{/each}<a href="./api/v1/registry/active/export" download="registry.json">Aktive Registry exportieren</a><h3>Drafts</h3>{#each drafts as draft}<button onclick={()=>choose(draft)}>{draft.draft_id.slice(0,8)} · Version {draft.draft_version}</button>{/each}<button onclick={()=>{selected=null;editor=pretty(active?.config??{});validation=null;}}>Neuer Draft</button></section><section><h2>Draft {selected?.draft_version??'neu'}</h2><label for="json">Registry JSON · Import erzeugt nur einen Draft</label><textarea id="json" bind:value={editor} spellcheck="false"></textarea><div class="actions"><button disabled={busy} onclick={save}>Speichern / importieren</button><button disabled={busy||!selected} onclick={validateDraft}>Validieren & Diff</button><button disabled={busy||!selected||!validation} onclick={activateDraft}>Gespeicherten Draft aktivieren</button></div><pre>{pretty(validation)}</pre></section></div></Tabs.Content>
    <Tabs.Content value="sources"><div class="grid"><section><h2>Sources</h2><pre>{pretty(sources)}</pre></section><section><h2>Bindings</h2><pre>{pretty(bindings)}</pre></section></div><section><h2>Evidence prüfen</h2><label for="source">Stabile Source-ID</label><input id="source" bind:value={sourceId}/><button disabled={!sourceId||busy} onclick={()=>action(async()=>{evidence=await request<Json>(`evidence/${encodeURIComponent(sourceId)}`);})}>Evidence laden</button><pre>{pretty(evidence)}</pre></section></Tabs.Content>
    <Tabs.Content value="contracts"><section><h2>TEST · synthetische Contract-Instanzen</h2><p>Feldstatus, Reasons, Evidence, Grace-Fristen und State-Machine-Kontext.</p><pre>{pretty(contracts)}</pre><h3>Konfigurierte Instanzen einschließlich deaktivierter Contracts</h3><pre>{pretty((active?.config as {contracts?:Json})?.contracts??[])}</pre></section></Tabs.Content>
    <Tabs.Content value="diagnostics"><section><h2>Diagnostics und History Gaps</h2><pre>{pretty(diagnostics)}</pre></section><section><h2>Token rotieren</h2><p>Ein neues Token wird einmal angezeigt. Danach müssen betroffene Clients aktualisiert werden.</p><div class="actions">{#each ['consumer','admin'] as role}<button disabled={busy} onclick={()=>rotate(role)}>{role} rotieren</button>{/each}</div>{#if token}<label for="new-token">Neues Token (nicht gespeichert im Browser)</label><input id="new-token" readonly value={token}/><button onclick={()=>token=''}>Ausblenden</button>{/if}</section></Tabs.Content>
  </Tabs.Root>
</main>

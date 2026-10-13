import { useMutation, useQuery } from '@tanstack/react-query';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConditionList } from '@/components/status-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/dialog';
import { KeyValue, Notice, PageHeader, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { HistoryTable, itemTime } from '@/features/diagnostics/HistoryTab';
import { api, describeError } from '@/lib/api';
import { formatTime, shortId } from '@/lib/format';
import { useLive } from '@/lib/live-context';
import { useActiveRevision, useDiagnostics, useHistory, useInfo, rotateToken } from '@/lib/queries';
import { useOpenSetup } from '@/lib/setup-context';
import { classifySystem, REASON_LABELS } from '@/lib/status';
import { BRIDGE_LABELS } from '@/setup/SetupWizard';
import { setupRequest } from '@/setup/setup';
import type { HaEntityPage, TokenRotation } from '@/lib/types';

function InstallationPanel() {
  const info = useInfo();
  const active = useActiveRevision();
  const openSetup = useOpenSetup();
  return (
    <Panel>
      <PanelHeader title="Installation & Einrichtung" aside={<Button size="sm" onClick={openSetup}>Einrichtungsassistent öffnen</Button>} />
      <div className="p-4">
        {info.isPending ? <Spinner /> : info.data ? (
          <KeyValue
            items={[
              { label: 'Version', value: info.data.version },
              { label: 'Installations-ID', value: <code className="break-all text-xs">{info.data.installation_id}</code> },
              { label: 'Bezeichnung', value: info.data.installation_label || '–' },
              { label: 'Protokolle', value: `API ${info.data.api_protocol} · Bridge ${info.data.bridge_protocol} · Schema ${info.data.config_schema_version}` },
              { label: 'Epoche', value: <code className="text-xs">{shortId(info.data.epoch_id, 16)}</code> },
              { label: 'Aktive Revision', value: active.data ? active.data.revision : 'keine' },
              { label: 'Serverzeit (UTC)', value: formatTime(info.data.server_time) },
            ]}
          />
        ) : <Notice tone="bad" title="Installationsdaten nicht lesbar" />}
        <p className="mt-3 text-xs text-muted">Der Assistent ändert nichts, bevor Sie ausdrücklich bestätigen. Er aktiviert keine Registry, installiert nichts in Home Assistant und startet nichts neu.</p>
      </div>
    </Panel>
  );
}

function ReadinessPanel() {
  const live = useLive();
  const diagnostics = useDiagnostics();
  const active = useActiveRevision();
  const service = live.service ?? diagnostics.data?.service ?? null;
  const conditions = classifySystem({ service, connection: live.connection, hasActiveRegistry: active.data === undefined ? undefined : active.data !== null, apiFailure: diagnostics.isError ? 'unavailable' : null });
  const d = diagnostics.data;
  return (
    <Panel>
      <PanelHeader title="Readiness & Komponenten" description="Bereitschaft (kann der Dienst auswerten?) ist etwas anderes als die Qualität einzelner Werte." aside={service && <Badge tone={service.ready ? 'ok' : 'warn'}>{service.ready ? 'bereit' : 'nicht bereit'}</Badge>} />
      <div className="flex flex-col gap-4 p-4">
        <ConditionList conditions={conditions} />
        {service && (
          <div className="grid gap-x-10 gap-y-2 lg:grid-cols-2">
            <KeyValue items={[
              { label: 'Persistenz', value: service.persistence === 'available' ? 'verfügbar' : 'nicht erreichbar' },
              { label: 'Home Assistant', value: service.ha },
              { label: 'Bridge', value: service.bridge },
              { label: 'MQTT', value: service.mqtt },
              { label: 'Veröffentlichung', value: service.publication_confirmed ? 'bestätigt' : 'unbestätigt' },
            ]} />
            <KeyValue items={[
              { label: 'Offene Gründe', value: service.reasons.length ? service.reasons.map((r) => REASON_LABELS[r] ?? r).join(', ') : 'keine' },
              { label: 'Queue', value: d ? d.queue_size : '–' },
              { label: 'Commit-Dauer', value: d?.commit_duration_s != null ? `${d.commit_duration_s.toFixed(3)} s` : '–' },
              { label: 'Ingest-Überläufe', value: d ? d.ingest_overflow_count : '–' },
              { label: 'Refresh-Überläufe', value: d ? d.refresh_overflow_count : '–' },
            ]} />
          </div>
        )}
        {d && d.dependencies.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Dependencies</p>
            <ul className="flex flex-wrap gap-1.5">{d.dependencies.map((dep, i) => <li key={i}><Badge>{String(dep.dependency_id)} · {String(dep.kind)}</Badge></li>)}</ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

function BridgePanel() {
  const live = useLive();
  const diagnostics = useDiagnostics(false);
  const bridge = useQuery({ queryKey: ['setup', 'bridge'], queryFn: () => setupRequest<{ state: string }>('bridge'), retry: false });
  const discovery = useMutation({ mutationFn: () => api<HaEntityPage>('ha/entities?limit=1') });
  const connection = { connecting: 'verbindet', open: 'verbunden', resyncing: 'synchronisiert', reconnecting: 'Wiederverbindung', offline: 'offline', mismatch: 'andere Installation', stopped: 'gestoppt' }[live.connection];
  return (
    <Panel>
      <PanelHeader title="Bridge & Verbindungsdiagnose" />
      <div className="flex flex-col gap-4 p-4">
        <KeyValue items={[
          { label: 'Bridge-Zustand (Einrichtung)', value: bridge.isPending ? 'wird geprüft …' : bridge.isError ? 'nicht lesbar' : BRIDGE_LABELS[bridge.data.state] ?? bridge.data.state },
          { label: 'Bridge-Version', value: String(diagnostics.data?.bridge_version ?? '–') },
          { label: 'Bridge-Abonnements', value: String(diagnostics.data?.bridge_subscriptions ?? '–') },
          { label: 'Live-WebSocket', value: <Badge tone={live.connection === 'open' ? 'ok' : live.connection === 'mismatch' ? 'bad' : 'warn'}>{connection}</Badge> },
          { label: 'Letztes Ereignis', value: live.lastEventAt ? new Date(live.lastEventAt).toLocaleTimeString('de-DE') : '–' },
          { label: 'Resyncs', value: `${live.resyncCount}×` },
        ]} />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={discovery.isPending} onClick={() => discovery.mutate()}>HA-Erkennung testen (nur lesend)</Button>
          {discovery.isSuccess && <Badge tone="ok">erreichbar</Badge>}
          {discovery.isError && <span className="text-xs text-warn">{describeError(discovery.error)}</span>}
        </div>
      </div>
    </Panel>
  );
}

function TokensPanel() {
  const roles = useQuery({ queryKey: ['tokens'], queryFn: () => api<{ roles: string[]; tokens_visible: boolean }>('tokens') });
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<unknown>(null);
  const [pending, setPending] = useState<'admin' | 'consumer' | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<TokenRotation | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  // The new credential lives in component state only: never in storage, URLs or the query cache.
  useEffect(() => () => setResult(null), []);
  useEffect(() => setAcknowledged(false), [pending]);

  const run = () => {
    const role = pending;
    if (!role) return;
    setPending(null);
    setRotating(true);
    setRotateError(null);
    // Never retried automatically; the response lives only in this component's state.
    rotateToken(role)
      .then((r) => {
        setResult(r);
        setRevealed(false);
        setCopied(false);
      })
      .catch((error: unknown) => setRotateError(error))
      .finally(() => setRotating(false));
  };
  return (
    <Panel>
      <PanelHeader title="Rollen & Tokens" description="Tokens werden nie angezeigt oder gespeichert, außer einmalig nach einer Rotation." />
      <div className="flex flex-col gap-4 p-4">
        {roles.isPending ? <Spinner /> : (
          <ul className="flex flex-col gap-2">
            {(roles.data?.roles ?? []).map((role) => (
              <li key={role} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2">
                <span className="flex items-center gap-2 text-sm"><KeyRound size={14} className="text-accent" /> <strong className="font-medium">{role === 'admin' ? 'Admin' : 'Consumer'}</strong><Badge>{role}</Badge></span>
                <Button size="sm" variant="danger" disabled={rotating} onClick={() => setPending(role as 'admin' | 'consumer')}>Token rotieren …</Button>
              </li>
            ))}
          </ul>
        )}
        {rotateError !== null && (
          <Notice tone="bad" title="Rotation nicht bestätigt">
            {describeError(rotateError)} Das Ergebnis ist unbestimmt, falls die Antwort verloren ging: die Rotation <strong>nicht automatisch wiederholen</strong>. Zugriff prüfen und ggf. über die vertrauenswürdige lokale Administration wiederherstellen.
          </Notice>
        )}
        {result && (
          <Notice tone={result.audit_status === 'complete' ? 'ok' : 'warn'} title={`${result.role}-Token rotiert`}>
            <p>Neues Token – wird nur jetzt angezeigt und nicht im Browser gespeichert. Alle Clients dieser Rolle müssen es erhalten.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input readOnly aria-label="Neues Token" type={revealed ? 'text' : 'password'} value={result.token} className="h-9 min-w-72 flex-1 rounded-[var(--radius-sm)] border border-line-strong bg-sunken px-2.5 font-mono text-xs" />
              <Button size="sm" onClick={() => setRevealed((v) => !v)}>{revealed ? <EyeOff size={13} /> : <Eye size={13} />} {revealed ? 'Verbergen' : 'Anzeigen'}</Button>
              <Button size="sm" onClick={async () => { await navigator.clipboard?.writeText(result.token); setCopied(true); }}><Copy size={13} /> {copied ? 'Kopiert' : 'Kopieren'}</Button>
            </div>
            <p className="mt-2 text-xs">Rotations-ID <code>{result.rotation_id}</code> · Audit: {result.audit_status === 'complete' ? 'vollständig' : 'Abschluss unbestätigt – Token trotzdem sichern'}</p>
            <div className="mt-2"><Button size="sm" variant="primary" onClick={() => { setResult(null); setRevealed(false); setCopied(false); }}>Ich habe das Token gesichert – ausblenden</Button></div>
          </Notice>
        )}
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={`${pending === 'admin' ? 'Admin' : 'Consumer'}-Token rotieren?`}
        description={
          <>
            Das bisherige Token wird sofort ungültig; verbundene Clients verlieren den Zugriff, bis sie das neue Token erhalten. {pending === 'admin' && 'Beim Admin-Token betrifft das alle administrativen Werkzeuge außerhalb dieser Ingress-Oberfläche. '}
            Es gibt keine automatische Wiederholung. Das neue Token wird einmalig angezeigt.
          </>
        }
        confirmLabel="Jetzt rotieren"
        tone="danger"
        confirmDisabled={!acknowledged}
        onConfirm={run}
      >
        <Checkbox checked={acknowledged} onCheckedChange={setAcknowledged} label="Ich habe verstanden, dass bestehende Clients danach aktualisiert werden müssen." />
      </ConfirmDialog>
    </Panel>
  );
}

function AuditPanel() {
  const events = useHistory('diagnostics', { limit: 100 });
  const items = useMemo(() => events.data?.pages.flatMap((p) => p.items) ?? [], [events.data]);
  // A rotation intent without a completion record is an indeterminate outcome, not proof of success.
  const completed = useMemo(() => new Set(items.filter((i) => i.operation === 'token_rotated').map((i) => String(i.rotation_id))), [items]);
  return (
    <Panel>
      <PanelHeader title="Audit-Verlauf" description="Administrative Operationen mit Rolle/Vertrauensgrenze, Objekt und Revision. Tokens und Argumente werden nie aufgezeichnet." />
      <div className="p-4">
        <HistoryTable
          kind="diagnostics"
          filters={{ limit: 100 }}
          columns={[
            { header: 'Operation', render: (i) => <span className="flex items-center gap-2"><code>{String(i.operation ?? i.kind ?? '–')}</code>{i.operation === 'token_rotation_requested' && !completed.has(String(i.rotation_id)) && <Badge tone="warn">Ausgang unbestimmt</Badge>}</span> },
            { header: 'Akteur', render: (i) => { const a = i.actor as { kind?: string; role?: string } | undefined; return a ? `${a.role ?? '–'} · ${a.kind ?? '–'}` : '–'; } },
            { header: 'Objekt', render: (i) => <code>{String(i.draft_id ?? i.rotation_id ?? (i.revision !== undefined ? `Rev. ${String(i.revision)}` : '–'))}</code> },
            { header: 'Revision', render: (i) => String(i.registry_revision ?? '–') },
          ]}
        />
        {items.some((i) => itemTime(i) === null) && <p className="mt-2 text-xs text-faint">Einträge ohne Zeitstempel stammen aus älteren Laufzeiten.</p>}
      </div>
    </Panel>
  );
}

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Administration" description="Installation und Einrichtung, Bereitschaft, Bridge-Diagnose, Rollen/Tokens und der administrative Audit-Verlauf." />
      <PanelLayout view="admin">
        <LayoutPanel id="installation" title="Installation" span={1}><InstallationPanel /></LayoutPanel>
        <LayoutPanel id="readiness" title="Readiness" span={2}><ReadinessPanel /></LayoutPanel>
        <LayoutPanel id="bridge" title="Bridge" span={1}><BridgePanel /></LayoutPanel>
        <LayoutPanel id="tokens" title="Tokens" span={2}><TokensPanel /></LayoutPanel>
        <LayoutPanel id="audit" title="Audit"><AuditPanel /></LayoutPanel>
      </PanelLayout>
    </>
  );
}

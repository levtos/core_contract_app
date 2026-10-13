import { Activity, Cable, FileCode2, FlaskConical, Network, Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { ConditionList, ContractLink, FieldStatusBadge } from '@/components/status-parts';
import { Badge } from '@/components/ui/badge';
import { Empty, KeyValue, Notice, PageHeader, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { formatTime, shortId } from '@/lib/format';
import { useLive } from '@/lib/live-context';
import { useActiveExport, useActiveRevision, useDiagnostics, useHistory, useInfo, useProblems } from '@/lib/queries';
import { classifySystem, REASON_LABELS } from '@/lib/status';
import type { ApiError } from '@/lib/api';

const ENTRIES = [
  { to: '/contracts', icon: FileCode2, title: 'Contracts & Definitionen', text: 'Instanzen und deklarative Definitionen anlegen und bearbeiten.' },
  { to: '/sources', icon: Cable, title: 'Sources & Bindings', text: 'Quellen, HA-Entitäten, MQTT-Bindings und Transformationen.' },
  { to: '/registry', icon: FlaskConical, title: 'Registry Studio', text: 'Drafts, Validierung, Diff, Aktivierung und Rollback.' },
  { to: '/graph', icon: Network, title: 'Graph', text: 'Abhängigkeiten zwischen Quellen und Contracts.' },
  { to: '/diagnostics', icon: Activity, title: 'Diagnose & Historie', text: 'Werte, Evidence, Explain, Temporal, History und Commands.' },
  { to: '/admin', icon: Settings2, title: 'Administration', text: 'Readiness, Bridge, Tokens und Audit-Verlauf.' },
];

function failureKind(error: unknown): 'network' | 'unavailable' | 'persistence' | 'other' | null {
  if (!error) return null;
  const kind = (error as ApiError).kind;
  if (kind === 'network') return 'network';
  if (kind === 'persistence') return 'persistence';
  if (kind === 'unavailable') return 'unavailable';
  return 'other';
}

export function OverviewPage() {
  const live = useLive();
  const info = useInfo();
  const diagnostics = useDiagnostics();
  const problems = useProblems();
  const active = useActiveRevision();
  const config = useActiveExport();
  const events = useHistory('diagnostics', { limit: 8 });

  const service = live.service ?? diagnostics.data?.service ?? null;
  const conditions = classifySystem({
    service,
    connection: live.connection,
    hasActiveRegistry: active.data === undefined ? undefined : active.data !== null,
    apiFailure: failureKind(diagnostics.error ?? info.error),
  });

  const envelopes = live.contracts ? Object.values(live.contracts) : [];
  const configured = (config.data?.contracts as { contract_id: string; enabled: boolean }[] | undefined) ?? [];
  const disabled = configured.filter((c) => !c.enabled).length;
  const healthy = envelopes.filter((e) => e.contract_health === 'healthy').length;
  const degraded = envelopes.length - healthy;
  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        title="Übersicht"
        description="Zustand der Installation, der aktiven Registry und der Contracts – Bereitschaft und Wertqualität werden getrennt dargestellt."
      />
      <PanelLayout view="overview">
        <LayoutPanel id="readiness" title="Systemstatus" span={2}>
        <Panel className="xl:col-span-2">
          <PanelHeader title="Systemstatus & Readiness" aside={service && <Badge tone={service.ready ? 'ok' : 'warn'}>{service.ready ? 'bereit' : 'nicht bereit'}</Badge>} />
          <div className="space-y-4 p-4">
            {!service && !diagnostics.isError ? <Spinner /> : <ConditionList conditions={conditions} />}
            {service && (
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                <KeyValue
                  items={[
                    { label: 'Persistenz', value: service.persistence === 'available' ? 'verfügbar' : 'nicht erreichbar' },
                    { label: 'Home Assistant', value: service.ha },
                    { label: 'Bridge', value: service.bridge },
                    { label: 'MQTT', value: service.mqtt },
                  ]}
                />
                <KeyValue
                  items={[
                    { label: 'Veröffentlichung', value: service.publication_confirmed ? 'bestätigt' : 'unbestätigt' },
                    {
                      label: 'Offene Gründe',
                      value: service.reasons.length ? service.reasons.map((r) => REASON_LABELS[r] ?? r).join(', ') : 'keine',
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </Panel>
        </LayoutPanel><LayoutPanel id="installation" title="Installation" span={1}><Panel>
          <PanelHeader title="Installation" />
          <div className="p-4">
            {info.isPending ? (
              <Spinner />
            ) : info.data ? (
              <KeyValue
                items={[
                  { label: 'Version', value: info.data.version },
                  { label: 'Installation', value: <code title={info.data.installation_id}>{shortId(info.data.installation_id, 13)}</code> },
                  { label: 'Epoche', value: <code>{shortId(live.epochId ?? info.data.epoch_id, 13)}</code> },
                  { label: 'Publication', value: live.publicationSeq ?? info.data.publication_seq },
                  { label: 'Bridge-Version', value: String(diagnostics.data?.bridge_version ?? '—') },
                  { label: 'Aktive Revision', value: active.data ? `${active.data.revision} · ${active.data.checksum.slice(0, 10)}` : 'keine' },
                  { label: 'Serverzeit', value: formatTime(info.data.server_time) },
                ]}
              />
            ) : (
              <Notice tone="bad" title="Installationsdaten nicht lesbar" />
            )}
          </div>
        </Panel>

        </LayoutPanel><LayoutPanel id="contracts" title="Contracts" span={1}><Panel>
          <PanelHeader title="Contracts" description="Aus dem Live-Snapshot; deaktivierte Contracts liefern keinen Zustand." />
          <div className="p-4">
            {live.contracts === null ? (
              <p className="text-sm text-muted">{live.connection === 'open' ? 'Snapshot wird erwartet …' : 'Noch kein Snapshot empfangen.'}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{envelopes.length} aktiv</Badge>
                <Badge tone="ok">{healthy} gesund</Badge>
                <Badge tone={degraded ? 'warn' : 'neutral'}>{degraded} eingeschränkt</Badge>
                <Badge tone="neutral">{disabled} deaktiviert</Badge>
                {live.stale && <Badge tone="warn">Stand möglicherweise veraltet</Badge>}
              </div>
            )}
          </div>
        </Panel>

        </LayoutPanel><LayoutPanel id="problems" title="Probleme" span={2}><Panel>
          <PanelHeader title="Probleme" description="Felder ohne verwendbaren Wert (unbekannt / ungelöst) mit den Gründen des Servers." />
          <div className="p-2">
            {problems.isPending ? (
              <Spinner />
            ) : problems.data && problems.data.problems.length > 0 ? (
              <ul className="divide-y divide-line">
                {problems.data.problems.slice(0, 10).map((p) => (
                  <li key={`${p.contract_id}.${p.field}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-sm">
                    <ContractLink id={p.contract_id} />
                    <code className="text-muted">{p.field}</code>
                    <FieldStatusBadge field={{ status: p.status as 'unknown', value: null, quality: 'degraded', reasons: [], evidence: [] }} />
                    <span className="min-w-0 text-xs text-muted">{p.reasons.map((r) => r.code).join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Keine Feldprobleme">Alle gemeldeten Felder haben einen verwendbaren Wert.</Empty>
            )}
          </div>
        </Panel>

        </LayoutPanel><LayoutPanel id="events" title="Ereignisse"><Panel>
          <PanelHeader title="Jüngste Ereignisse" description="Administrative Audit-Ereignisse und Diagnosen." />
          <div className="p-2">
            {events.isPending ? (
              <Spinner />
            ) : eventItems.length === 0 ? (
              <Empty title="Keine Ereignisse aufgezeichnet" />
            ) : (
              <ul className="divide-y divide-line">
                {eventItems.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-sm">
                    <span className="mono w-44 shrink-0 text-xs text-muted">{formatTime(String(event.at ?? ''))}</span>
                    <Badge tone="neutral">{String(event.kind ?? 'event')}</Badge>
                    <span>{String(event.operation ?? '')}</span>
                    {event.registry_revision !== undefined && <span className="text-xs text-faint">Rev. {String(event.registry_revision)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
        </LayoutPanel>
      </PanelLayout>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">Bereiche</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            className="group flex gap-3 rounded-[var(--radius-lg)] border border-line bg-panel p-4 transition-colors hover:border-accent/50 hover:bg-raised"
          >
            <entry.icon size={20} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="font-medium group-hover:text-accent">{entry.title}</p>
              <p className="mt-0.5 text-sm text-muted">{entry.text}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

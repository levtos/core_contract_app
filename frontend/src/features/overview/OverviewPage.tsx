import { codeLabel, reasonLabel } from '@/i18n/codes';
import { t as uiText } from '@/i18n';
import { Activity, Cable, FileCode2, FlaskConical, Network, Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { ConditionList, ContractLink, FieldStatusBadge } from '@/components/status-parts';
import { Badge } from '@/components/ui/badge';
import { Empty, KeyValue, Notice, PageHeader, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { formatTime, shortId } from '@/lib/format';
import { useLive } from '@/lib/live-context';
import { useActiveExport, useActiveRevision, useDiagnostics, useHistory, useInfo, useProblems } from '@/lib/queries';
import { classifySystem, connectionLabel, REASON_LABELS } from '@/lib/status';
import type { ApiError } from '@/lib/api';

const ENTRIES = [
  { to: "/contracts/list/all", icon: FileCode2, title: uiText("features.overview.OverviewPage.contracts_definitionen_499616"), text: uiText("features.overview.OverviewPage.instanzen_und_deklarative_definitionen_anlegen_u_6ed8e5") },
  { to: "/sources/devices", icon: Cable, title: uiText("features.overview.OverviewPage.sources_bindings_613cff"), text: uiText("features.overview.OverviewPage.quellen_ha_entitaten_mqtt_bindings_und_transform_9679a6") },
  { to: "/changes/drafts", icon: FlaskConical, title: uiText("features.overview.OverviewPage.registry_studio_995ef2"), text: uiText("features.overview.OverviewPage.drafts_validierung_diff_aktivierung_und_rollback_cc7809") },
  { to: "/contracts/relations/graph", icon: Network, title: uiText("features.overview.OverviewPage.graph_32ab01"), text: uiText("features.overview.OverviewPage.abhangigkeiten_zwischen_quellen_und_contracts_60e113") },
  { to: "/settings/diagnostics", icon: Activity, title: uiText("features.overview.OverviewPage.diagnose_historie_63b2ee"), text: uiText("features.overview.OverviewPage.werte_evidence_explain_temporal_history_und_comm_87c382") },
  { to: "/settings/system", icon: Settings2, title: uiText("features.overview.OverviewPage.administration_4b42c6"), text: uiText("features.overview.OverviewPage.readiness_bridge_tokens_und_audit_verlauf_629726") },
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
        title={uiText("features.overview.OverviewPage.ubersicht_4d2bb3")}
        description={uiText("features.overview.OverviewPage.zustand_der_installation_der_aktiven_registry_un_fc79c0")}
      />
      <PanelLayout view="overview">
        <LayoutPanel id="readiness" title={uiText("features.overview.OverviewPage.systemstatus_8d5cb1")} span={2}>
        <Panel className="xl:col-span-2">
          <PanelHeader title={uiText("features.overview.OverviewPage.systemstatus_readiness_d2f5a9")} aside={service && <Badge tone={service.ready ? 'ok' : 'warn'}>{service.ready ? uiText("features.overview.OverviewPage.bereit_7f2ffe") : uiText("features.overview.OverviewPage.nicht_bereit_05674c")}</Badge>} />
          <div className="space-y-4 p-4">
            {!service && !diagnostics.isError ? <Spinner /> : <ConditionList conditions={conditions} />}
            {service && (
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                <KeyValue
                  items={[
                    { label: uiText("features.overview.OverviewPage.persistenz_774960"), value: service.persistence === 'available' ? uiText("features.overview.OverviewPage.verfugbar_e5a644") : uiText("features.overview.OverviewPage.nicht_erreichbar_b129fa") },
                    { label: uiText("features.overview.OverviewPage.home_assistant_2a366a"), value: connectionLabel(service.ha) },
                    { label: uiText("features.overview.OverviewPage.bridge_3892e1"), value: connectionLabel(service.bridge) },
                    { label: uiText("features.overview.OverviewPage.mqtt_51b197"), value: connectionLabel(service.mqtt) },
                  ]}
                />
                <KeyValue
                  items={[
                    { label: uiText("features.overview.OverviewPage.veroffentlichung_cb618e"), value: service.publication_confirmed ? uiText("features.overview.OverviewPage.bestatigt_26bfc3") : uiText("features.overview.OverviewPage.unbestatigt_40dee0") },
                    {
                      label: uiText("features.overview.OverviewPage.offene_grunde_da9e40"),
                      value: service.reasons.length ? service.reasons.map((r) => REASON_LABELS[r] ?? codeLabel(r)).join(', ') : uiText("features.overview.OverviewPage.keine_db028e"),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </Panel>
        </LayoutPanel><LayoutPanel id="installation" title={uiText("features.overview.OverviewPage.installation_c3fc54")} span={1}><Panel>
          <PanelHeader title={uiText("features.overview.OverviewPage.installation_c3fc54")} />
          <div className="p-4">
            {info.isPending ? (
              <Spinner />
            ) : info.data ? (
              <KeyValue
                items={[
                  { label: uiText("features.overview.OverviewPage.version_dd1679"), value: info.data.version },
                  { label: uiText("features.overview.OverviewPage.installation_c3fc54"), value: <code title={info.data.installation_id}>{shortId(info.data.installation_id, 13)}</code> },
                  { label: uiText("features.overview.OverviewPage.epoche_8a2707"), value: <code>{shortId(live.epochId ?? info.data.epoch_id, 13)}</code> },
                  { label: uiText("features.overview.OverviewPage.publication_15fc65"), value: live.publicationSeq ?? info.data.publication_seq },
                  { label: uiText("features.overview.OverviewPage.bridge_version_12d174"), value: String(diagnostics.data?.bridge_version ?? '—') },
                  { label: uiText("features.overview.OverviewPage.aktive_revision_90097f"), value: active.data ? uiText("features.overview.OverviewPage.v0_v1_6a5b16", { v0: (active.data.revision), v1: (active.data.checksum.slice(0, 10)) }) : uiText("features.overview.OverviewPage.keine_db028e") },
                  { label: uiText("features.overview.OverviewPage.serverzeit_c77910"), value: formatTime(info.data.server_time) },
                ]}
              />
            ) : (
              <Notice tone="bad" title={uiText("features.overview.OverviewPage.installationsdaten_nicht_lesbar_5882af")} />
            )}
          </div>
        </Panel>

        </LayoutPanel><LayoutPanel id="contracts" title={uiText("features.overview.OverviewPage.contracts_0488ac")} span={1}><Panel>
          <PanelHeader title={uiText("features.overview.OverviewPage.contracts_0488ac")} description={uiText("features.overview.OverviewPage.aus_dem_live_snapshot_deaktivierte_contracts_lie_e2e8ab")} />
          <div className="p-4">
            {live.contracts === null ? (
              <p className="text-sm text-muted">{live.connection === 'open' ? uiText("features.overview.OverviewPage.snapshot_wird_erwartet_8f2bea") : uiText("features.overview.OverviewPage.noch_kein_snapshot_empfangen_1bda21")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{envelopes.length} {uiText("features.overview.OverviewPage.aktiv_3139fc")}</Badge>
                <Badge tone="ok">{healthy} {uiText("features.overview.OverviewPage.gesund_35c867")}</Badge>
                <Badge tone={degraded ? 'warn' : 'neutral'}>{degraded} {uiText("features.overview.OverviewPage.eingeschrankt_7c77f8")}</Badge>
                <Badge tone="neutral">{disabled} {uiText("features.overview.OverviewPage.deaktiviert_10f33e")}</Badge>
                {live.stale && <Badge tone="warn">{uiText("features.overview.OverviewPage.stand_moglicherweise_veraltet_42a607")}</Badge>}
              </div>
            )}
          </div>
        </Panel>

        </LayoutPanel><LayoutPanel id="problems" title={uiText("features.overview.OverviewPage.probleme_e9f99f")} span={2}><Panel>
          <PanelHeader title={uiText("features.overview.OverviewPage.probleme_e9f99f")} description={uiText("features.overview.OverviewPage.felder_ohne_verwendbaren_wert_unbekannt_ungelost_c58e9f")} />
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
                    <span className="min-w-0 text-xs text-muted">{p.reasons.map((r) => reasonLabel(r.code)).join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title={uiText("features.overview.OverviewPage.keine_feldprobleme_981959")}>{uiText("features.overview.OverviewPage.alle_gemeldeten_felder_haben_einen_verwendbaren__a643cd")}</Empty>
            )}
          </div>
        </Panel>

        </LayoutPanel><LayoutPanel id="events" title={uiText("features.overview.OverviewPage.ereignisse_39ad23")}><Panel>
          <PanelHeader title={uiText("features.overview.OverviewPage.jungste_ereignisse_0c34c7")} description={uiText("features.overview.OverviewPage.administrative_audit_ereignisse_und_diagnosen_6c9452")} />
          <div className="p-2">
            {events.isPending ? (
              <Spinner />
            ) : eventItems.length === 0 ? (
              <Empty title={uiText("features.overview.OverviewPage.keine_ereignisse_aufgezeichnet_8597dd")} />
            ) : (
              <ul className="divide-y divide-line">
                {eventItems.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-sm">
                    <span className="mono w-44 shrink-0 text-xs text-muted">{formatTime(String(event.at ?? ''))}</span>
                    <Badge tone="neutral">{codeLabel(event.kind ?? 'event')}</Badge>
                    <span>{codeLabel(event.operation ?? '')}</span>
                    {event.registry_revision !== undefined && <span className="text-xs text-faint">{uiText("features.overview.OverviewPage.rev_29dd1c")}{String(event.registry_revision)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
        </LayoutPanel>
      </PanelLayout>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">{uiText("features.overview.OverviewPage.bereiche_7b40d8")}</h2>
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

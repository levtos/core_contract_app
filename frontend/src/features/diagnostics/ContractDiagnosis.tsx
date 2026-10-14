import { t as uiText } from '@/i18n';
import { codeLabel } from '@/i18n/codes';
import { Badge } from '@/components/ui/badge';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Empty, KeyValue, Notice, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { formatTime } from '@/lib/format';
import { isObject, type Json } from '@/lib/json';
import { describeError } from '@/lib/api';
import { useContractDiagnosis } from '@/lib/queries';
import { ExplainPanel } from './ExplainPanel';
import { RecoveryDetail } from '@/components/MachineRecovery';

const START_CASES: Record<string, { label: string; text: string; tone: 'ok' | 'warn' | 'neutral' | 'bad' }> = {
  first: { label: uiText("features.diagnostics.ContractDiagnosis.erststart_c02a0d"), text: uiText("features.diagnostics.ContractDiagnosis.der_contract_war_noch_nie_aktiv_es_gibt_nichts_w_98f097"), tone: 'neutral' },
  valid: { label: uiText("features.diagnostics.ContractDiagnosis.wiederherstellung_gultig_749640"), text: uiText("features.diagnostics.ContractDiagnosis.gespeicherter_kontext_passt_zum_aktuellen_finger_d896af"), tone: 'ok' },
  stale: { label: uiText("features.diagnostics.ContractDiagnosis.veraltet_d9075b"), text: uiText("features.diagnostics.ContractDiagnosis.ein_deaktivierter_oder_entfernter_zustand_erford_d6eacd"), tone: 'warn' },
  incompatible: { label: uiText("features.diagnostics.ContractDiagnosis.inkompatibel_815c9f"), text: uiText("features.diagnostics.ContractDiagnosis.der_fingerprint_hat_sich_geandert_kontext_wurde__e8791d"), tone: 'warn' },
  partial: { label: uiText("features.diagnostics.ContractDiagnosis.unvollstandig_dc0649"), text: uiText("features.diagnostics.ContractDiagnosis.es_fehlen_teile_des_erforderlichen_kontexts_a92686"), tone: 'warn' },
  missing: { label: uiText("features.diagnostics.ContractDiagnosis.kontext_fehlt_8c5f5c"), text: uiText("features.diagnostics.ContractDiagnosis.es_war_aktiv_aber_es_liegt_kein_kontext_vor_170a8e"), tone: 'bad' },
};

const short = (v: string | null | undefined) => (v ? `${v.slice(0, 12)}…` : '–');
const scalar = (v: Json | undefined): string => (v === null || v === undefined ? '–' : typeof v === 'boolean' ? codeLabel(String(v)) : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Read-only diagnosis of one contract; reading never advances state, refreshes inputs or fires deadlines. */
export function ContractDiagnosis({ contractId }: { contractId: string }) {
  const query = useContractDiagnosis(contractId);
  if (query.isPending) return <Spinner />;
  if (query.isError) return <Notice tone="warn" title={uiText("features.diagnostics.ContractDiagnosis.keine_diagnose_verfugbar_5e4723")}>{describeError(query.error)} {uiText("features.diagnostics.ContractDiagnosis.der_contract_existiert_in_der_aktiven_registry_n_e38687")}</Notice>;
  const d = query.data;
  const start = d.start_case ? START_CASES[d.start_case] : undefined;
  const machine = d.machine;
  const current = isObject(machine?.current) ? machine!.current : null;

  return (
    <PanelLayout view="diagnostics.contract">
      <LayoutPanel id="restore" title={uiText("features.diagnostics.ContractDiagnosis.wiederherstellung_066f4c")}>
      <Panel>
        <PanelHeader title={uiText("features.diagnostics.ContractDiagnosis.identitat_wiederherstellung_c1cd99")} aside={<Badge tone={d.fingerprint_compatible ? 'ok' : 'warn'}>{d.fingerprint_compatible ? uiText("features.diagnostics.ContractDiagnosis.fingerprint_kompatibel_fffc88") : uiText("features.diagnostics.ContractDiagnosis.fingerprint_abweichend_671e2b")}</Badge>} />
        <div className="grid gap-x-10 gap-y-3 p-4 lg:grid-cols-2">
          <KeyValue
            items={[
              { label: uiText("features.diagnostics.ContractDiagnosis.registry_revision_70bc45"), value: d.registry_revision },
              { label: uiText("features.diagnostics.ContractDiagnosis.startfall_21a6b9"), value: start ? <span className="flex flex-wrap items-center gap-2"><Badge tone={start.tone}>{start.label}</Badge><span className="text-xs text-muted">{start.text}</span></span> : '–' },
              { label: uiText("features.diagnostics.ContractDiagnosis.nachste_falligkeit_8bdf5b"), value: d.next_due ? formatTime(d.next_due) : uiText("features.diagnostics.ContractDiagnosis.keine_db028e") },
            ]}
          />
          <KeyValue
            items={[
              { label: uiText("features.diagnostics.ContractDiagnosis.gespeicherter_fingerprint_0c9622"), value: <code title={d.fingerprint ?? ''}>{short(d.fingerprint)}</code> },
              { label: uiText("features.diagnostics.ContractDiagnosis.erwarteter_fingerprint_78ff3b"), value: <code title={d.expected_fingerprint}>{short(d.expected_fingerprint)}</code> },
            ]}
          />
        </div>
      </Panel>

      </LayoutPanel><LayoutPanel id="temporal" title={uiText("features.diagnostics.ContractDiagnosis.temporal_840fec")}><Panel>
        <PanelHeader title={uiText("features.diagnostics.ContractDiagnosis.temporal_kontexte_0c5527")} description={uiText("features.diagnostics.ContractDiagnosis.nur_zeit_und_identitatsfelder_vorherige_rohwerte_e154ad")} />
        {d.temporal.length === 0 ? (
          <Empty title={uiText("features.diagnostics.ContractDiagnosis.keine_temporal_kontexte_1f1c1c")}>{uiText("features.diagnostics.ContractDiagnosis.dieser_contract_hat_keine_zeit_knoten_mit_gespei_747fb8")}</Empty>
        ) : (
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">{uiText("features.diagnostics.ContractDiagnosis.temporal_kontexte_0c5527")}</caption>
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.knoten_abcd86")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.seit_b00312")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.grace_bis_1a1c13")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.grace_aktiv_c2d892")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.lucke_079b36")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.restore_a76e13")}</th></tr></thead>
              <tbody>
                {d.temporal.map((t) => (
                  <tr key={t.id} className="border-b border-line/50">
                    <td className="mono px-2 py-1.5 text-xs">{t.id}</td>
                    <td className="px-2 py-1.5 text-xs">{formatTime(scalar(t.state.since_at) === '–' ? null : String(t.state.since_at))}</td>
                    <td className="px-2 py-1.5 text-xs">{formatTime(scalar(t.state.grace_until) === '–' ? null : String(t.state.grace_until))}</td>
                    <td className="px-2 py-1.5 text-xs">{t.state.grace_armed === undefined ? '–' : t.state.grace_armed ? uiText("features.diagnostics.ContractDiagnosis.ja_3702fc") : uiText("features.diagnostics.ContractDiagnosis.nein_4d03db")}</td>
                    <td className="px-2 py-1.5 text-xs">{formatTime(scalar(t.state.gap_at) === '–' ? null : String(t.state.gap_at))}</td>
                    <td className="px-2 py-1.5 text-xs">{t.restore_pending ? <Badge tone="warn">{uiText("features.diagnostics.ContractDiagnosis.ausstehend_345f38")}</Badge> : <span className="text-faint">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      </LayoutPanel><LayoutPanel id="machine" title={uiText("features.diagnostics.ContractDiagnosis.state_machine_801376")}><Panel>
        <PanelHeader title={uiText("features.diagnostics.ContractDiagnosis.state_machine_801376")} aside={machine && current ? <Badge tone="accent">{String(current.state)}</Badge> : undefined} />
        {!machine ? (
          <Empty title={uiText("features.diagnostics.ContractDiagnosis.keine_state_machine_6f3191")}>{uiText("features.diagnostics.ContractDiagnosis.dieser_contract_verwendet_keine_state_machine_a52923")}</Empty>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <KeyValue
              items={[
                { label: uiText("features.diagnostics.ContractDiagnosis.zustande_f5ef55"), value: <span className="flex flex-wrap gap-1.5">{machine.states.map((s) => <Badge key={s} tone={current?.state === s ? 'accent' : machine.initial === s ? 'info' : 'neutral'}>{s}{machine.initial === s ? uiText("features.diagnostics.ContractDiagnosis.initial_cc8413") : ''}</Badge>)}</span> },
                { label: uiText("features.diagnostics.ContractDiagnosis.deadline_6fcb38"), value: machine.deadline_seconds ? uiText("features.diagnostics.ContractDiagnosis.v0_s_30054e", { v0: (machine.deadline_seconds) }) : uiText("features.diagnostics.ContractDiagnosis.keine_db028e") },
                { label: uiText("features.diagnostics.ContractDiagnosis.sessions_6fa3cb"), value: machine.sessions ? uiText("features.diagnostics.ContractDiagnosis.ja_3702fc") : uiText("features.diagnostics.ContractDiagnosis.nein_4d03db") },
                { label: uiText("features.diagnostics.ContractDiagnosis.befehle_23a3b7"), value: (Array.isArray(machine.commands) ? machine.commands.map(String) : Object.keys(machine.commands ?? {})).join(', ') || codeLabel('none') },
              ]}
            />
            {current ? (
              <KeyValue
                items={[
                  { label: uiText("features.diagnostics.ContractDiagnosis.aktueller_zustand_c391dc"), value: <code>{scalar(current.state)}</code> },
                  { label: uiText("features.diagnostics.ContractDiagnosis.seit_b00312"), value: formatTime(String(current.since_at ?? '')) },
                  { label: uiText("features.diagnostics.ContractDiagnosis.vorheriger_zustand_bbe7d8"), value: scalar(current.previous_state) },
                  { label: uiText("features.diagnostics.ContractDiagnosis.grund_ausloser_50d333"), value: uiText("features.diagnostics.ContractDiagnosis.v0_v1_585a47", { v0: (codeLabel(current.transition_reason)), v1: (codeLabel(current.trigger)) }) },
                  { label: uiText("features.diagnostics.ContractDiagnosis.episode_b19c45"), value: uiText("features.diagnostics.ContractDiagnosis.v0_seit_v1_v2_8d5ea5", { v0: (scalar(current.episode_id)), v1: (formatTime(String(current.episode_started_at ?? ''))), v2: (current.episode_ended_at ? uiText("features.diagnostics.ContractDiagnosis.beendet_v0_58bce5", { v0: (formatTime(String(current.episode_ended_at))) }) : '') }) },
                  { label: uiText("features.diagnostics.ContractDiagnosis.session_6959b4"), value: scalar(current.session_id) },
                  { label: uiText("features.diagnostics.ContractDiagnosis.herkunft_514fce"), value: codeLabel(current.origin) },
                ]}
              />
            ) : (
              <RecoveryDetail recovery={machine.recovery} />
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">{uiText("features.diagnostics.ContractDiagnosis.transitionen_41ef48")}</caption>
                <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.von_640e86")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.nach_0ea777")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.ereignis_af9e77")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.grund_b45f40")}</th><th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ContractDiagnosis.episode_b19c45")}</th></tr></thead>
                <tbody>
                  {machine.transitions.map((t, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="px-2 py-1.5"><code className="text-xs">{t.source}</code></td>
                      <td className="px-2 py-1.5"><code className="text-xs">{t.target}</code></td>
                      <td className="px-2 py-1.5"><code className="text-xs">{t.event}</code></td>
                      <td className="px-2 py-1.5 text-xs">{t.reason}</td>
                      <td className="px-2 py-1.5 text-xs">{[t.new_episode && 'neu', t.ends_episode && 'Ende'].filter(Boolean).join(', ') || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      </LayoutPanel><LayoutPanel id="explain" title={uiText("features.diagnostics.ContractDiagnosis.explain_3b61e4")}><ExplainPanel trace={d.trace} /></LayoutPanel>
    </PanelLayout>
  );
}

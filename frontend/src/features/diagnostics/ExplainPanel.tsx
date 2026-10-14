import { codeLabel, reasonLabel } from '@/i18n/codes';
import { t as uiText } from '@/i18n';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Notice, Panel, PanelHeader } from '@/components/ui/layout';
import { FIELD_STATUS, QUALITY } from '@/lib/status';
import { formatTime } from '@/lib/format';
import { isObject, type Json, type JsonObject } from '@/lib/json';
import type { FieldStatus } from '@/lib/types';
import { EvidenceDialog } from './EvidenceLookup';

interface Step extends JsonObject {
  op: string;
}

const OP_NAMES: Record<string, string> = {
  input: uiText("features.diagnostics.ExplainPanel.eingang_d8af5e"),
  ref: 'Interne Regel',
  literal: uiText("features.diagnostics.ExplainPanel.konstante_2e2736"),
  and: uiText("features.diagnostics.ExplainPanel.und_fd2908"),
  or: uiText("features.diagnostics.ExplainPanel.oder_43e406"),
  not: uiText("features.diagnostics.ExplainPanel.nicht_774d65"),
  compare: uiText("features.diagnostics.ExplainPanel.vergleich_79a63c"),
  map: uiText("features.diagnostics.ExplainPanel.zuordnung_750995"),
  first_match: uiText("features.diagnostics.ExplainPanel.erster_treffer_e8c4e8"),
  bucket: uiText("features.diagnostics.ExplainPanel.hysterese_221523"),
  formula: uiText("features.diagnostics.ExplainPanel.formel_244289"),
  fusion: uiText("features.diagnostics.ExplainPanel.fusion_09d751"),
  fusion_selection: uiText("features.diagnostics.ExplainPanel.fusion_auswahl_3a43a6"),
  temporal: uiText("features.diagnostics.ExplainPanel.temporal_840fec"),
  machine: uiText("features.diagnostics.ExplainPanel.state_machine_801376"),
  not_applicable: uiText("features.diagnostics.ExplainPanel.nicht_anwendbar_af8969"),
  guard: uiText("features.diagnostics.ExplainPanel.guard_c8d3fc"),
};

const text = (v: Json | undefined): string => (v === null || v === undefined ? '' : String(v));

/**
 * Shows exactly what the backend recorded for the latest relevant committed
 * evaluation: operator status, reasons, evidence references, fusion selection
 * and machine guard decisions. Raw input values are not part of the trace, and
 * nothing is invented for contracts that have no trace.
 */
export function ExplainPanel({ trace }: { trace: JsonObject | null }) {
  const [evidence, setEvidence] = useState<string | null>(null);
  if (!trace) {
    return (
      <Notice tone="info" title={uiText("features.diagnostics.ExplainPanel.kein_explain_trace_vorhanden_e15923")}>
        {uiText("features.diagnostics.ExplainPanel.paket_typen_und_noch_nicht_ausgewertete_contract_b1993f")}</Notice>
    );
  }
  const steps = (Array.isArray(trace.steps) ? trace.steps : []).filter(isObject) as Step[];
  return (
    <Panel>
      <PanelHeader
        title={uiText("features.diagnostics.ExplainPanel.explain_trace_c40389")}
        description={uiText("features.diagnostics.ExplainPanel.letzte_relevante_bestatigte_auswertung_kein_herz_703fce")}
        aside={trace.truncated === true ? <Badge tone="warn">{uiText("features.diagnostics.ExplainPanel.gekurzt_1_024_eintrage_429de4")}</Badge> : undefined}
      />
      <div className="grid gap-x-8 gap-y-1 px-4 pt-3 text-xs text-muted sm:grid-cols-4">
        <span>{uiText("features.diagnostics.ExplainPanel.zeitpunkt_606cdc")}{formatTime(text(trace.at))}</span>
        <span>{uiText("features.diagnostics.ExplainPanel.ausloser_4716db")}{text(trace.origin) || '–'}</span>
        <span>{uiText("features.diagnostics.ExplainPanel.revision_5fdcbb")}{text(trace.registry_revision)}</span>
        <span>{uiText("features.diagnostics.ExplainPanel.aufwand_a56513")}{text(trace.cost)} {uiText("features.diagnostics.ExplainPanel.schritte_4ca538")}</span>
      </div>
      <div className="overflow-x-auto p-2">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">{uiText("features.diagnostics.ExplainPanel.explain_schritte_3eeba4")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ExplainPanel.operator_291101")}</th>
              <th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ExplainPanel.bezug_e6d683")}</th>
              <th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ExplainPanel.status_920e41")}</th>
              <th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ExplainPanel.grunde_auswahl_e1f635")}</th>
              <th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.ExplainPanel.evidence_03867a")}</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => {
              const status = FIELD_STATUS[step.status as FieldStatus];
              const quality = QUALITY[step.quality as keyof typeof QUALITY];
              const reasons = Array.isArray(step.reasons) ? step.reasons.map(String) : [];
              const evidenceRefs = Array.isArray(step.evidence) ? step.evidence.map(String) : [];
              return (
                <tr key={i} className="border-b border-line/50 align-top">
                  <td className="px-2 py-1.5 text-xs text-faint">{i + 1}</td>
                  <td className="px-2 py-1.5">{OP_NAMES[step.op] ?? codeLabel(step.op)}</td>
                  <td className="mono px-2 py-1.5 text-xs">{[step.name, step.id, step.strategy, step.event && `${text(step.source)}→${text(step.target)} (${text(step.event)})`].filter(Boolean).map(text).join(' · ') || '–'}</td>
                  <td className="px-2 py-1.5">
                    {step.op === 'guard' ? (
                      <Badge tone={step.decision === true ? 'ok' : step.decision === false ? 'bad' : 'warn'}>{step.decision === true ? uiText("features.diagnostics.ExplainPanel.erlaubt_cee957") : step.decision === false ? uiText("features.diagnostics.ExplainPanel.abgelehnt_e31099") : uiText("features.diagnostics.ExplainPanel.unentschieden_ad663a")}</Badge>
                    ) : step.op === 'fusion_selection' ? (
                      <Badge tone="info">{step.selection === 'engine' ? uiText("features.diagnostics.ExplainPanel.engine_auswahl_dd7a28") : step.selection === 'strategy' ? uiText("features.diagnostics.ExplainPanel.strategie_definiert_879b24") : uiText("features.diagnostics.ExplainPanel.auswahl_nicht_aufgezeichnet_092f1a")}</Badge>
                    ) : status ? (
                      <span className="flex items-center gap-1.5"><Badge tone={status.tone}>{status.label}</Badge>{quality ? <Badge tone={quality.tone}>{quality.label}</Badge> : <span>{uiText("features.diagnostics.ExplainPanel.qualitat_nicht_aufgezeichnet_70a777")}</span>}</span>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {step.op === 'fusion_selection' ? (
                      <span>{uiText("features.diagnostics.ExplainPanel.gewahlt_3dbfa8")}{Array.isArray(step.selected_indices) ? uiText("features.diagnostics.ExplainPanel.v0_bea408", { v0: (step.selected_indices.join(', ')) }) : uiText("features.diagnostics.ExplainPanel.nicht_aufgezeichnet_716a55")} {uiText("features.diagnostics.ExplainPanel.kandidaten_021e5b")}{Array.isArray(step.candidate_statuses) ? step.candidate_statuses.map(codeLabel).join(', ') : uiText("features.diagnostics.ExplainPanel.nicht_aufgezeichnet_716a55")}</span>
                    ) : reasons.length ? (
                      <span className="flex flex-wrap gap-1">{reasons.map((r) => <Badge key={r} tone="warn">{reasonLabel(r)}</Badge>)}</span>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {evidenceRefs.length === 0 ? <span className="text-faint">–</span> : <Button size="sm" variant="ghost" onClick={() => setEvidence(evidenceRefs[0]!)}>{evidenceRefs.length} {uiText("features.diagnostics.ExplainPanel.ref_817996")}</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {steps.length === 0 && <p className="p-4 text-sm text-muted">{uiText("features.diagnostics.ExplainPanel.der_trace_enthalt_keine_schritte_95fc29")}</p>}
      </div>
      {evidence && <EvidenceDialog reference={evidence} onClose={() => setEvidence(null)} />}
    </Panel>
  );
}

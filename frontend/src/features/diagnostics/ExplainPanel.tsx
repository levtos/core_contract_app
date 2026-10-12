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
  input: 'Eingang',
  ref: 'Interne Regel',
  literal: 'Konstante',
  and: 'UND',
  or: 'ODER',
  not: 'NICHT',
  compare: 'Vergleich',
  map: 'Zuordnung',
  first_match: 'Erster Treffer',
  bucket: 'Hysterese',
  formula: 'Formel',
  fusion: 'Fusion',
  fusion_selection: 'Fusion – Auswahl',
  temporal: 'Temporal',
  machine: 'State Machine',
  not_applicable: 'Nicht anwendbar',
  guard: 'Guard',
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
      <Notice tone="info" title="Kein Explain-Trace vorhanden">
        Paket-Typen und noch nicht ausgewertete Contracts haben keinen aufgezeichneten Trace. Der Server liefert nur Traces deklarativer Definitionen.
      </Notice>
    );
  }
  const steps = (Array.isArray(trace.steps) ? trace.steps : []).filter(isObject) as Step[];
  return (
    <Panel>
      <PanelHeader
        title="Explain-Trace"
        description="Letzte relevante, bestätigte Auswertung – kein Herzschlag und keine Historie. Die Schritte stehen in Auswertungsreihenfolge (Teilausdrücke vor ihrem Operator)."
        aside={trace.truncated === true ? <Badge tone="warn">gekürzt (1 024 Einträge)</Badge> : undefined}
      />
      <div className="grid gap-x-8 gap-y-1 px-4 pt-3 text-xs text-muted sm:grid-cols-4">
        <span>Zeitpunkt: {formatTime(text(trace.at))}</span>
        <span>Auslöser: {text(trace.origin) || '–'}</span>
        <span>Revision: {text(trace.registry_revision)}</span>
        <span>Aufwand: {text(trace.cost)} Schritte</span>
      </div>
      <div className="overflow-x-auto p-2">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">Explain-Schritte</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Operator</th>
              <th className="px-2 py-1.5 font-medium">Bezug</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">Gründe / Auswahl</th>
              <th className="px-2 py-1.5 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => {
              const status = FIELD_STATUS[step.status as FieldStatus];
              const reasons = Array.isArray(step.reasons) ? step.reasons.map(String) : [];
              const evidenceRefs = Array.isArray(step.evidence) ? step.evidence.map(String) : [];
              return (
                <tr key={i} className="border-b border-line/50 align-top">
                  <td className="px-2 py-1.5 text-xs text-faint">{i + 1}</td>
                  <td className="px-2 py-1.5">{OP_NAMES[step.op] ?? step.op}</td>
                  <td className="mono px-2 py-1.5 text-xs">{[step.name, step.id, step.strategy, step.event && `${text(step.source)}→${text(step.target)} (${text(step.event)})`].filter(Boolean).map(text).join(' · ') || '–'}</td>
                  <td className="px-2 py-1.5">
                    {step.op === 'guard' ? (
                      <Badge tone={step.decision === true ? 'ok' : step.decision === false ? 'bad' : 'warn'}>{step.decision === true ? 'erlaubt' : step.decision === false ? 'abgelehnt' : 'unentschieden'}</Badge>
                    ) : step.op === 'fusion_selection' ? (
                      <Badge tone="info">{text(step.selection) === 'engine' ? 'Engine-Auswahl' : 'Strategie-definiert'}</Badge>
                    ) : status ? (
                      <span className="flex items-center gap-1.5"><Badge tone={status.tone}>{status.label}</Badge><Badge tone={QUALITY[step.quality as 'healthy'].tone}>{QUALITY[step.quality as 'healthy'].label}</Badge></span>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {step.op === 'fusion_selection' ? (
                      <span>Gewählt: [{(Array.isArray(step.selected_indices) ? step.selected_indices : []).join(', ')}] · Kandidaten: {(Array.isArray(step.candidate_statuses) ? step.candidate_statuses : []).map(String).join(', ')}</span>
                    ) : reasons.length ? (
                      <span className="flex flex-wrap gap-1">{reasons.map((r) => <Badge key={r} tone="warn">{r}</Badge>)}</span>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {evidenceRefs.length === 0 ? <span className="text-faint">–</span> : <Button size="sm" variant="ghost" onClick={() => setEvidence(evidenceRefs[0]!)}>{evidenceRefs.length} Ref.</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {steps.length === 0 && <p className="p-4 text-sm text-muted">Der Trace enthält keine Schritte.</p>}
      </div>
      {evidence && <EvidenceDialog reference={evidence} onClose={() => setEvidence(null)} />}
    </Panel>
  );
}

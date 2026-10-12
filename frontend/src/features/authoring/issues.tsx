import { createContext, useContext, useMemo } from 'react';
import type { Issue } from '@/lib/api';

/** Server findings for the document being edited, addressed by JSON Pointer. */
const IssuesContext = createContext<Issue[]>([]);
export const IssuesProvider = IssuesContext.Provider;

/** Findings addressed to exactly this pointer. */
export function useIssues(pointer: string): Issue[] {
  const all = useContext(IssuesContext);
  return useMemo(() => all.filter((issue) => issue.path === pointer), [all, pointer]);
}

/** Findings at or below a pointer, for container badges. */
export function useIssuesUnder(pointer: string): Issue[] {
  const all = useContext(IssuesContext);
  return useMemo(() => all.filter((issue) => issue.path === pointer || issue.path.startsWith(pointer + '/')), [all, pointer]);
}

export function useAllIssues(): Issue[] {
  return useContext(IssuesContext);
}

/** Display text for a server code; the code itself stays visible next to it. */
const TEXT: Record<string, string> = {
  duplicate_identity: 'Diese ID ist bereits vergeben.',
  immutable_definition_version: 'Diese Definition ist als Version bereits aktiviert gewesen und darf nicht inhaltlich geändert werden. Neue Version anlegen.',
  input_type_mismatch: 'Typ, Katalog oder Einheit passen nicht zum erwarteten Eingang.',
  input_reference: 'Die Referenz ist nicht eindeutig oder unbekannt.',
  type_reference: 'Typ und Version sind nicht registriert.',
  contract_cycle: 'Die Contracts bilden einen Zyklus.',
  source_unbound: 'Die Quelle hat kein Binding.',
  binding_source: 'Das Binding verweist auf keine vorhandene Quelle.',
  field_reference: 'Das referenzierte Feld existiert nicht.',
  fingerprint_upgrade_required: 'Deklarative Definitionen erfordern fingerprint_version 2.',
  'definition.rule_type_mismatch': 'Die Typen von Operator und Ausgabe passen nicht zusammen.',
  'definition.unknown_rule_input': 'Der Eingang ist in dieser Definition nicht deklariert.',
  'definition.unknown_internal_reference': 'Die interne Regel existiert nicht.',
  'definition.internal_cycle': 'Die benannten Regeln verweisen im Kreis aufeinander.',
  'definition.duplicate_stateful_id': 'Die ID eines Bucket-/Temporal-Knotens muss in der Definition eindeutig sein.',
  'definition.duplicate_transition_event': 'Pro Quellzustand und Ereignis ist nur eine Transition erlaubt.',
  'definition.unreachable_machine': 'Die State Machine wird von keiner Ausgabe verwendet.',
  'definition.stateful_guard_requires_contract_input': 'Guards müssen zustandslos sein; zeitliche Wahrheiten als Contract-Eingang einspeisen.',
  'definition.invalid_map_key': 'Map-Schlüssel müssen kanonische JSON-Skalare sein, die zum Eingangstyp und Katalog passen.',
  'definition.unknown_formula_version': 'Diese Formel/Version ist nicht registriert.',
  'definition.unknown_fusion_strategy': 'Diese Fusionsstrategie ist nicht registriert.',
  'definition.comparison_type_mismatch': 'Die Operanden sind nicht vergleichbar.',
  'definition.unordered_comparison': 'Ordnungsvergleiche gelten nur für Zahl, Text und Zeitpunkt.',
};
export function explain(issue: Issue): string {
  return TEXT[issue.code] ?? issue.message.replace(/_/g, ' ');
}

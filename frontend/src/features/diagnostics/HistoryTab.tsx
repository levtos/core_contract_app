import { codeLabel, fieldLabel } from '@/i18n/codes';
import { t as uiText } from '@/i18n';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState, Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Empty, Notice, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { describeError } from '@/lib/api';
import { formatTime, localInputToUtc } from '@/lib/format';
import { isObject, type Json } from '@/lib/json';
import { useCapabilities, useHistory, type HistoryFilters } from '@/lib/queries';
import type { HistoryItem } from '@/lib/types';

export const KIND_LABELS: Record<string, string> = {
  contracts: uiText("features.diagnostics.HistoryTab.contract_zustande_cbb892"),
  observations: uiText("features.diagnostics.HistoryTab.beobachtungen_0b2f38"),
  transitions: uiText("features.diagnostics.HistoryTab.machine_transitionen_29ddde"),
  episodes: uiText("features.diagnostics.HistoryTab.episoden_f859be"),
  deadlines: uiText("features.diagnostics.HistoryTab.deadlines_6aff5f"),
  commands: uiText("features.diagnostics.HistoryTab.commands_b269dc"),
  gaps: uiText("features.diagnostics.HistoryTab.historienlucken_5be036"),
  diagnostics: uiText("features.diagnostics.HistoryTab.diagnose_audit_ereignisse_46bb26"),
  revisions: uiText("features.diagnostics.HistoryTab.revisionen_e0511e"),
  activations: uiText("features.diagnostics.HistoryTab.aktivierungen_070c5d"),
};

const TIME_KEYS = ['at', 'published_at', 'received_at', 'since_at', 'created_at', 'updated_at'];
const SUMMARY_KEYS = ['contract_id', 'source_id', 'binding_id', 'kind', 'operation', 'observation_kind', 'status', 'state', 'source', 'target', 'event', 'trigger', 'reason', 'episode_id', 'revision', 'registry_revision', 'publication_seq', 'epoch_id', 'contract_health'];

export function itemTime(item: HistoryItem): string | null {
  for (const key of TIME_KEYS) if (typeof item[key] === 'string' && item[key]) return item[key] as string;
  return null;
}

function summary(item: HistoryItem): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const key of SUMMARY_KEYS) {
    const value: Json | undefined = item[key];
    if (value !== undefined && value !== null && typeof value !== 'object') out.push({ key, value: key === 'operation' && value === 'manual_restart' ? uiText('alpha7.restart.historyRequest') : typeof value === 'boolean' ? codeLabel(String(value)) : ['kind', 'operation', 'observation_kind', 'status', 'reason', 'origin', 'contract_health'].includes(key) ? codeLabel(value) : String(value) });
    if (out.length >= 6) break;
  }
  const command = item.command;
  if (isObject(command) && typeof command.contract_id === 'string') out.unshift({ key: 'contract_id', value: command.contract_id });
  if (isObject(command) && command.command === 'manual_restart') out.unshift({ key: 'origin', value: uiText('alpha7.restart.historyRequest') });
  else if (item.manual_restart === true || isObject(item.state_machine) && item.state_machine.manual_restart === true) out.unshift({ key: 'origin', value: uiText('alpha7.restart.historyManual') });
  return out;
}

/** Cursor-paged table. The cursor is opaque and bound to the filters; changing a filter starts a new traversal. */
export function HistoryTable({ kind, filters, columns }: { kind: string; filters: HistoryFilters; columns?: { header: string; render: (item: HistoryItem) => React.ReactNode }[] }) {
  const query = useHistory(kind, filters);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  if (query.isPending) return <Spinner />;
  if (query.isError) return <Notice tone="bad" title={uiText("features.diagnostics.HistoryTab.historie_nicht_lesbar_7856db")}>{describeError(query.error)}</Notice>;
  const toggle = (id: string) => setOpen((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <Empty title={uiText("features.diagnostics.HistoryTab.keine_eintrage_35719c")}>{uiText("features.diagnostics.HistoryTab.fur_diese_auswahl_liegen_keine_eintrage_vor_d256a2")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">{KIND_LABELS[kind] ?? kind}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="w-8" />
                <th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.HistoryTab.zeit_74f249")}</th>
                {columns ? columns.map((c) => <th key={c.header} className="px-2 py-1.5 font-medium">{c.header}</th>) : <th className="px-2 py-1.5 font-medium">{uiText("features.diagnostics.HistoryTab.inhalt_3cc465")}</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const expanded = open.has(item.id);
                return (
                  <Fragment key={item.id}>
                    <tr className="border-b border-line/50 align-top hover:bg-raised/60">
                      <td className="px-1 py-1.5">
                        <button type="button" aria-label={expanded ? uiText("features.diagnostics.HistoryTab.details_ausblenden_034376") : uiText("features.diagnostics.HistoryTab.details_anzeigen_cf5436")} aria-expanded={expanded} className="cursor-pointer text-muted hover:text-fg" onClick={() => toggle(item.id)}>
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="mono whitespace-nowrap px-2 py-1.5 text-xs">{formatTime(itemTime(item))}</td>
                      {columns ? (
                        columns.map((c) => <td key={c.header} className="px-2 py-1.5 text-xs">{c.render(item)}</td>)
                      ) : (
                        <td className="px-2 py-1.5">
                          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                            {summary(item).map((s) => <span key={fieldLabel(s.key)}><span className="text-faint">{fieldLabel(s.key)}</span> <span className="font-mono">{s.value}</span></span>)}
                          </span>
                        </td>
                      )}
                    </tr>
                    {expanded && (
                      <tr className="border-b border-line/50 bg-sunken/50">
                        <td />
                        <td colSpan={(columns?.length ?? 1) + 1} className="px-2 py-2"><pre className="max-h-72 overflow-auto text-xs">{JSON.stringify(item, null, 2)}</pre></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>{items.length} {uiText("features.diagnostics.HistoryTab.geladen_neueste_zuerst_6e064a")}</span>
        {query.hasNextPage && <Button size="sm" disabled={query.isFetchingNextPage} disabledReason={uiText('alpha7.copy.inProgress')} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? uiText("features.diagnostics.HistoryTab.ladt_c8ebc9") : uiText("features.diagnostics.HistoryTab.altere_eintrage_laden_f8e8e1")}</Button>}
        {!query.hasNextPage && items.length > 0 && <Badge>{uiText("features.diagnostics.HistoryTab.ende_der_historie_e37499")}</Badge>}
        <span className="text-faint">{uiText("features.diagnostics.HistoryTab.cursor_seiten_sind_kein_datenbank_snapshot_episo_66bc2a")}</span>
      </div>
    </div>
  );
}

export function HistoryTab({ initialContract = '' }: { initialContract?: string }) {
  const caps = useCapabilities();
  const kinds = caps.data?.history.kinds ?? Object.keys(KIND_LABELS);
  const [kind, setKind] = useState('contracts');
  const [contract, setContract] = useState(initialContract);
  const [source, setSource] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [applied, setApplied] = useState<HistoryFilters>({ contract_id: initialContract || undefined, limit: 50 });
  const invalid = since && until && new Date(since) > new Date(until);
  return (
    <PanelLayout view="diagnostics.history"><LayoutPanel id="filters" title={uiText("features.diagnostics.HistoryTab.historienfilter_862931")}><Panel>
      <PanelHeader title={uiText("features.diagnostics.HistoryTab.historie_4eaa80")} description={uiText("features.diagnostics.HistoryTab.admin_lesezugriff_auf_die_dauerhaft_gespeicherte_b083b5")} />
      <div className="flex flex-col gap-4 p-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid) return;
            setApplied({ contract_id: contract.trim() || undefined, source_id: source.trim() || undefined, since: localInputToUtc(since), until: localInputToUtc(until), limit: 50 });
          }}
        >
          <Field label={uiText("features.diagnostics.HistoryTab.art_75df35")} className="lg:col-span-2">
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map((k) => <option key={k} value={k}>{KIND_LABELS[k] ?? k}</option>)}
              </Select>
            )}
          </Field>
          <Field label={uiText("features.diagnostics.HistoryTab.contract_id_f9f7ff")}>{(p) => <Input {...p} className="font-mono text-xs" value={contract} onChange={(e) => setContract(e.target.value)} />}</Field>
          <Field label={uiText("features.diagnostics.HistoryTab.source_id_a3a484")}>{(p) => <Input {...p} className="font-mono text-xs" value={source} onChange={(e) => setSource(e.target.value)} />}</Field>
          <Field label={uiText("features.diagnostics.HistoryTab.von_lokal_61799d")} errors={invalid ? [{ code: 'invalid_history_interval', message: uiText("features.diagnostics.HistoryTab.beginn_liegt_nach_dem_ende_ff3c71") }] : []}>{(p) => <Input {...p} type="datetime-local" step={1} value={since} onChange={(e) => setSince(e.target.value)} />}</Field>
          <Field label={uiText("features.diagnostics.HistoryTab.bis_lokal_4d9697")}>{(p) => <Input {...p} type="datetime-local" step={1} value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
            <Button type="submit" variant="primary" disabled={!!invalid}>{uiText("features.diagnostics.HistoryTab.filter_anwenden_2ed52c")}</Button>
            <Button onClick={() => { setContract(''); setSource(''); setSince(''); setUntil(''); setApplied({ limit: 50 }); }}>{uiText("features.diagnostics.HistoryTab.zurucksetzen_1ba046")}</Button>
            <span className="text-xs text-faint">{uiText("features.diagnostics.HistoryTab.zeiten_werden_als_utc_instants_verglichen_grenze_96c2fd")}</span>
          </div>
        </form>
      </div>
    </Panel>
    </LayoutPanel><LayoutPanel id="history" title={uiText("features.diagnostics.HistoryTab.historienzeilen_ee988b")}><Panel className="p-4"><HistoryTable key={`${kind}-${JSON.stringify(applied)}`} kind={kind} filters={applied} /></Panel></LayoutPanel></PanelLayout>
  );
}

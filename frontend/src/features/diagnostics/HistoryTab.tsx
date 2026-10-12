import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState, Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Empty, Notice, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { describeError } from '@/lib/api';
import { formatTime, localInputToUtc } from '@/lib/format';
import { isObject, type Json } from '@/lib/json';
import { useCapabilities, useHistory, type HistoryFilters } from '@/lib/queries';
import type { HistoryItem } from '@/lib/types';

export const KIND_LABELS: Record<string, string> = {
  contracts: 'Contract-Zustände',
  observations: 'Beobachtungen',
  transitions: 'Machine-Transitionen',
  episodes: 'Episoden',
  deadlines: 'Deadlines',
  commands: 'Commands',
  gaps: 'Historienlücken',
  diagnostics: 'Diagnose- & Audit-Ereignisse',
  revisions: 'Revisionen',
  activations: 'Aktivierungen',
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
    if (value !== undefined && value !== null && typeof value !== 'object') out.push({ key, value: String(value) });
    if (out.length >= 6) break;
  }
  const command = item.command;
  if (isObject(command) && typeof command.contract_id === 'string') out.unshift({ key: 'contract_id', value: command.contract_id });
  return out;
}

/** Cursor-paged table. The cursor is opaque and bound to the filters; changing a filter starts a new traversal. */
export function HistoryTable({ kind, filters, columns }: { kind: string; filters: HistoryFilters; columns?: { header: string; render: (item: HistoryItem) => React.ReactNode }[] }) {
  const query = useHistory(kind, filters);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  if (query.isPending) return <Spinner />;
  if (query.isError) return <Notice tone="bad" title="Historie nicht lesbar">{describeError(query.error)}</Notice>;
  const toggle = (id: string) => setOpen((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <Empty title="Keine Einträge">Für diese Auswahl liegen keine Einträge vor.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">{KIND_LABELS[kind] ?? kind}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="w-8" />
                <th className="px-2 py-1.5 font-medium">Zeit</th>
                {columns ? columns.map((c) => <th key={c.header} className="px-2 py-1.5 font-medium">{c.header}</th>) : <th className="px-2 py-1.5 font-medium">Inhalt</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const expanded = open.has(item.id);
                return (
                  <Fragment key={item.id}>
                    <tr className="border-b border-line/50 align-top hover:bg-raised/60">
                      <td className="px-1 py-1.5">
                        <button type="button" aria-label={expanded ? 'Details ausblenden' : 'Details anzeigen'} aria-expanded={expanded} className="cursor-pointer text-muted hover:text-fg" onClick={() => toggle(item.id)}>
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="mono whitespace-nowrap px-2 py-1.5 text-xs">{formatTime(itemTime(item))}</td>
                      {columns ? (
                        columns.map((c) => <td key={c.header} className="px-2 py-1.5 text-xs">{c.render(item)}</td>)
                      ) : (
                        <td className="px-2 py-1.5">
                          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                            {summary(item).map((s) => <span key={s.key}><span className="text-faint">{s.key}</span> <span className="font-mono">{s.value}</span></span>)}
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
        <span>{items.length} geladen · neueste zuerst</span>
        {query.hasNextPage && <Button size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Lädt …' : 'Ältere Einträge laden'}</Button>}
        {!query.hasNextPage && items.length > 0 && <Badge>Ende der Historie</Badge>}
        <span className="text-faint">Cursor-Seiten sind kein Datenbank-Snapshot: Episoden/Deadlines können sich zwischen den Abrufen ändern.</span>
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
    <Panel>
      <PanelHeader title="Historie" description="Admin-Lesezugriff auf die dauerhaft gespeicherte Historie, seitenweise mit opakem Cursor." />
      <div className="flex flex-col gap-4 p-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid) return;
            setApplied({ contract_id: contract.trim() || undefined, source_id: source.trim() || undefined, since: localInputToUtc(since), until: localInputToUtc(until), limit: 50 });
          }}
        >
          <Field label="Art" className="lg:col-span-2">
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map((k) => <option key={k} value={k}>{KIND_LABELS[k] ?? k}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Contract-ID">{(p) => <Input {...p} className="font-mono text-xs" value={contract} onChange={(e) => setContract(e.target.value)} />}</Field>
          <Field label="Source-ID">{(p) => <Input {...p} className="font-mono text-xs" value={source} onChange={(e) => setSource(e.target.value)} />}</Field>
          <Field label="Von (lokal)" errors={invalid ? [{ code: 'invalid_history_interval', message: 'Beginn liegt nach dem Ende.' }] : []}>{(p) => <Input {...p} type="datetime-local" step={1} value={since} onChange={(e) => setSince(e.target.value)} />}</Field>
          <Field label="Bis (lokal)">{(p) => <Input {...p} type="datetime-local" step={1} value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
            <Button type="submit" variant="primary" disabled={!!invalid}>Filter anwenden</Button>
            <Button onClick={() => { setContract(''); setSource(''); setSince(''); setUntil(''); setApplied({ limit: 50 }); }}>Zurücksetzen</Button>
            <span className="text-xs text-faint">Zeiten werden als UTC-Instants verglichen; Grenzen sind inklusive.</span>
          </div>
        </form>
        <HistoryTable key={`${kind}-${JSON.stringify(applied)}`} kind={kind} filters={applied} />
      </div>
    </Panel>
  );
}

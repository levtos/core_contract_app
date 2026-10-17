import { Link } from 'react-router';
import { useState } from 'react';
import { t } from '@/i18n';
import { fieldLabel } from '@/i18n/codes';
import { Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { ContractLiveState } from '@/components/ContractLiveState';
import { CommandsPanel } from '@/features/diagnostics/CommandsPanel';
import { useHaCatalog } from '@/features/sources/useHaCatalog';
import { asArray, asObject, type FieldSchema } from '@/features/authoring/model';
import { isObject } from '@/lib/json';
import { formatTime } from '@/lib/format';
import { displayValue } from '@/lib/status';
import { POLL_MS, useHistory } from '@/lib/queries';
import type { Envelope, FieldValue, HistoryItem, Registry } from '@/lib/types';
import { problemAdvice } from '@/features/overview/overviewModel';
import { contractSources, contractState } from './presentation';
import { ContractStateChip } from './ContractStateChip';
import { MachineRestartPanel } from './MachineRestartPanel';

interface Point { at: string; field: FieldValue | null }
export function historyPoints(rows: HistoryItem[], contractId: string, field: string, revision?: number): Point[] {
  return rows.filter(row => row.contract_id === contractId && (revision === undefined || row.registry_revision === revision) && typeof row.published_at === 'string' && Number.isFinite(Date.parse(row.published_at)))
    .sort((a, b) => Date.parse(String(a.published_at)) - Date.parse(String(b.published_at)))
    .slice(-60).map(row => ({ at: String(row.published_at), field: isObject(asObject(row.fields)[field]) ? asObject(row.fields)[field] as unknown as FieldValue : null }));
}

/** Plots stored samples only; gaps stay gaps and no value is recomputed. */
function MiniHistory({ points, schema, name }: { points: Point[]; schema?: FieldSchema; name: string }) {
  const categories = [...new Set(points.map(point => point.field?.value).filter(value => typeof value === 'string'))];
  const ordinate = (field: FieldValue | null) => !field || !['valid', 'held'].includes(field.status) || field.value === null ? null : typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : typeof field.value === 'boolean' ? Number(field.value) : typeof field.value === 'string' ? categories.indexOf(field.value) : null;
  const values = points.map(point => ordinate(point.field)).filter((value): value is number => value !== null);
  const low = Math.min(...values); const high = Math.max(...values); const range = high - low || 1;
  const first = Date.parse(points[0]?.at ?? ''); const last = Date.parse(points.at(-1)?.at ?? '');
  const segments: string[][] = [[]];
  for (const point of points) {
    const value = ordinate(point.field);
    if (value === null) { if (segments.at(-1)!.length) segments.push([]); continue; }
    const x = 16 + (Date.parse(point.at) - first) / (last - first || 1) * 568; const y = 100 - (value - low) / range * 76;
    segments.at(-1)!.push(`${x},${y}`);
  }
  return <div className="space-y-2">
    <h3 className="text-sm font-medium">{fieldLabel(name)}</h3>
    {values.length > 0 ? <svg viewBox="0 0 600 120" role="img" aria-label={t('alpha7.contract.chart', { name: fieldLabel(name) })} className="h-28 w-full text-muted">
      <path d="M16 108H584" fill="none" stroke="currentColor" opacity="0.4" />
      {segments.filter(segment => segment.length).map((segment, index) => <g key={index}><polyline points={segment.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />{segment.map((point, n) => <circle key={n} cx={point.split(',')[0]} cy={point.split(',')[1]} r="3" fill="currentColor" />)}</g>)}
    </svg> : <p className="text-sm text-muted">{t('alpha7.contract.noHistoryValue')}</p>}
    {points.length > 0 && <div className="flex justify-between gap-4 text-xs text-muted"><time dateTime={points[0]!.at}>{formatTime(points[0]!.at)}</time><time dateTime={points.at(-1)!.at}>{formatTime(points.at(-1)!.at)}</time></div>}
    <details className="text-xs"><summary className="cursor-pointer text-muted">{t('alpha7.contract.historyTable')}</summary><table className="mt-2 w-full text-left"><caption className="sr-only">{t('alpha7.contract.historyTable')}</caption><thead><tr><th>{t('alpha7.contract.time')}</th><th>{t('alpha7.contract.value')}</th></tr></thead><tbody>{points.slice(-8).reverse().map((point, index) => <tr key={index}><td className="py-1">{formatTime(point.at)}</td><td>{point.field ? displayValue(point.field, typeof schema?.unit === 'string' ? schema.unit : undefined) : t('alpha7.contract.noValue')}</td></tr>)}</tbody></table></details>
  </div>;
}

export function ContractSummary({ envelope, stale, fields, config, machine }: { envelope: Envelope; stale: boolean; fields: Record<string, FieldSchema>; config: Registry | null; machine: boolean }) {
  const [advanced, setAdvanced] = useState(false);
  const ha = useHaCatalog(asArray(config?.bindings).filter(isObject).some(binding => isObject(binding.adapter) && String(binding.adapter.kind).startsWith('ha_')));
  const sources = contractSources(envelope.contract_id, config, ha.entities);
  const history = useHistory('contracts', { contract_id: envelope.contract_id, limit: 60 }, true, POLL_MS);
  const reasons = Object.values(envelope.fields).flatMap(field => field.reasons);
  const why = stale ? t('alpha7.contract.state.oldConnectionHelp') : reasons.length ? problemAdvice(reasons, config, envelope.contract_id).text : contractState(envelope, true).hint;
  return <div className="space-y-4">
    <Panel><PanelHeader title={t('alpha7.contract.now')} aside={<ContractStateChip envelope={envelope} enabled={envelope.enabled} stale={stale} />} />
      <div className="flex flex-wrap gap-x-12 gap-y-5 p-6">{Object.entries(envelope.fields).map(([name, field]) => <div key={name}>
        {Object.keys(envelope.fields).length > 1 && <p className="mb-1 text-sm text-muted">{fieldLabel(name)}</p>}
        <p className="text-4xl font-semibold tabular-nums" data-testid={`value-${name}`}>{displayValue(field, typeof fields[name]?.unit === 'string' ? fields[name].unit : undefined)}</p>
      </div>)}</div>
      <p className="px-6 pb-4 text-xs text-muted">{t('alpha7.contract.liveVersion', { version: envelope.registry_revision, time: formatTime(envelope.published_at) })}</p>
    </Panel>
    <Panel><PanelHeader title={t('alpha7.contract.why')} /><p className="p-5 text-sm">{why}</p></Panel>
    <Panel><PanelHeader title={t('alpha7.contract.where')} /><div className="p-5">
      {sources.length ? <ul className="space-y-3">{sources.map((source, index) => <li key={index}><Link className="font-medium hover:text-fg" to={`/sources/devices?item=${source.sourceIndex}`} title={source.id}>{source.name}</Link>{source.entityId && source.entityId !== source.name && <p className="mt-1 max-w-full truncate text-xs text-muted" title={source.entityId}>{source.entityId}</p>}</li>)}</ul> : <p className="text-sm text-muted">{t('alpha7.contract.noSource')}</p>}
      {ha.isError && <p className="mt-2 text-xs text-muted">{t('alpha7.contract.namesUnavailable')}</p>}
    </div></Panel>
    <Panel><PanelHeader title={t('alpha7.contract.history')} description={t('alpha7.contract.historyScope')} /><div className="space-y-5 p-5">
      {history.isPending ? <Spinner /> : history.isError ? <p role="alert" className="text-sm text-bad">{t('alpha7.contract.historyUnavailable')}</p> : Object.keys(envelope.fields).map(name => <MiniHistory key={name} name={name} schema={fields[name]} points={historyPoints(history.isPlaceholderData ? [] : history.data?.pages.flatMap(page => page.items) ?? [], envelope.contract_id, name, envelope.registry_revision)} />)}
    </div></Panel>
    {machine && <CommandsPanel contractId={envelope.contract_id} onContract={() => {}} fixed />}
    {machine && <MachineRestartPanel key={envelope.contract_id} contractId={envelope.contract_id} />}
    <details onToggle={event => setAdvanced(event.currentTarget.open)}><summary className="cursor-pointer py-2 text-sm text-muted">{t('alpha7.contract.advanced')}</summary>{advanced && <ContractLiveState envelope={envelope} stale={stale} fields={fields} />}</details>
  </div>;
}

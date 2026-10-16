import { Link, useNavigate } from 'react-router';
import { Plus, Upload } from 'lucide-react';
import { t } from '@/i18n';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { ReviewDraftButton } from '@/features/authoring/DraftBar';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { asArray, str } from '@/features/authoring/model';
import { isObject } from '@/lib/json';
import { useLive } from '@/lib/live-context';
import { useActiveRevision, useProblems } from '@/lib/queries';
import type { Reason } from '@/lib/types';
import { EventFeed } from './EventFeed';
import { contractCounts, contractName, problemAdvice } from './overviewModel';

export function OverviewPage() {
  const live = useLive();
  const active = useActiveRevision();
  const problems = useProblems();
  const doc = useWorkingDocument();
  const navigate = useNavigate();
  const config = active.data?.config;
  const current = !live.stale && live.registryRevision === (active.data?.revision ?? 0) ? live.contracts : null;
  const counts = contractCounts(config, current);
  const grouped = new Map<string, Reason[]>();
  for (const problem of problems.data?.problems ?? []) grouped.set(problem.contract_id, [...(grouped.get(problem.contract_id) ?? []), ...problem.reasons]);
  const enabledIds = new Set(asArray(config?.contracts).filter(isObject).filter(contract => contract.enabled !== false).map(contract => str(contract.contract_id)));
  for (const envelope of Object.values(current ?? {})) {
    if (!enabledIds.has(envelope.contract_id)) continue;
    // Counts and problem details must describe the same current server publication.
    if (envelope.contract_health === 'degraded') grouped.set(envelope.contract_id, Object.values(envelope.fields).flatMap(field => field.reasons));
    else grouped.delete(envelope.contract_id);
  }
  const entries = [...grouped].filter(([id]) => enabledIds.has(id));
  const metrics = [
    { key: 'active', filter: 'active' }, { key: 'healthy', filter: 'healthy' },
    { key: 'degraded', filter: 'degraded' }, { key: 'off', filter: 'off' },
  ] as const;
  return <>
    <PageHeader title={t('alpha7.nav.overview')} description={t('alpha7.overview.explanation')} />
    <PanelLayout view="overview.alpha7">
      <LayoutPanel id="actions" title={t('alpha7.overview.actions')}><Panel>
        <PanelHeader title={t('alpha7.overview.actions')} />
        <div className="flex flex-wrap gap-3 p-5">
          <Button variant="primary" onClick={() => navigate('/contracts/list/all?new=1')}><Plus size={16} />{t('alpha7.overview.newContract')}</Button>
          <Button onClick={() => navigate('/contracts/import/json')}><Upload size={16} />{t('alpha7.nav.contractImport')}</Button>
          {doc.draft && <ReviewDraftButton>{t('alpha7.overview.apply')}</ReviewDraftButton>}
        </div>
      </Panel></LayoutPanel>
      <LayoutPanel id="contracts" title={t('alpha7.nav.contracts')}><Panel>
        <PanelHeader title={t('alpha7.nav.contracts')} description={t('alpha7.overview.activeOnly')} />
        <div className="space-y-5 p-5">
          {active.isPending ? <Spinner /> : active.isError ? <p role="alert" className="text-sm text-bad">{t('alpha7.overview.contractsUnavailable')}</p> : <div className="grid gap-3 sm:grid-cols-4">
            {metrics.map(metric => <Link key={metric.key} to={`/contracts/list/all?filter=${metric.filter}`} onClick={() => doc.setEditing(false)} className="rounded-xl border border-line px-4 py-3 text-sm hover:border-faint focus-visible:outline-2 focus-visible:outline-accent">
              <span className="block text-2xl font-semibold tabular-nums">{counts[metric.key] ?? '–'}</span>{' '}<span className="text-muted">{t(`alpha7.overview.${metric.key}`)}</span>
            </Link>)}
          </div>}
          {current === null && <p className="text-xs text-muted">{t('alpha7.overview.waitingValues')}</p>}
          <h3 className="font-medium">{t('alpha7.overview.needHelp')}</h3>
          {problems.isPending ? <Spinner /> : problems.isError ? <p role="alert" className="text-sm text-bad">{t('alpha7.overview.problemsUnavailable')}</p> : entries.length === 0 ? <p className="text-sm text-muted">{t('alpha7.overview.noProblems')}</p> : <ul className="divide-y divide-line">
            {entries.slice(0, 8).map(([id, reasons]) => {
              const advice = problemAdvice(reasons, config, id);
              return <li key={id} className="py-4 first:pt-0">
                <Link to={`/contracts/view/${encodeURIComponent(id)}`} onClick={() => doc.setEditing(false)} className="font-medium hover:text-fg">{contractName(config, id)}</Link>
                <p className="mt-1 text-sm text-muted">{advice.text}</p>
                <details className="mt-2 text-sm"><summary className="cursor-pointer text-fg">{t('alpha7.overview.whatCanIDo')}</summary><div className="mt-2 space-y-2 border-l border-line pl-3"><p>{advice.advice}</p><Link to={advice.to} className="inline-block text-fg underline underline-offset-4">{advice.action}</Link></div></details>
              </li>;
            })}
          </ul>}
          {entries.length > 8 && <Link to="/contracts/list/all?filter=degraded" className="text-sm text-fg underline">{t('alpha7.overview.moreProblems', { count: entries.length - 8 })}</Link>}
        </div>
      </Panel></LayoutPanel>
      <LayoutPanel id="events" title={t('alpha7.overview.events')}><Panel>
        <PanelHeader title={t('alpha7.overview.events')} /><div className="p-5"><EventFeed /></div>
      </Panel></LayoutPanel>
    </PanelLayout>
  </>;
}

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { t } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Condition, ConditionKind } from '@/lib/status';

const ACTIONS: Record<ConditionKind, { to: string; message: string; label: string }> = {
  empty_configuration: { to: '/contracts/list/all?new=1', message: t('alpha7.status.empty'), label: t('alpha7.status.create') },
  setup_incomplete: { to: '/settings/installation', message: t('alpha7.status.setup'), label: t('alpha7.status.configure') },
  readiness_pending: { to: '/settings/connections', message: t('alpha7.status.snapshot'), label: t('alpha7.status.configure') },
  limited_source: { to: '/settings/connections', message: t('alpha7.status.ha'), label: t('alpha7.status.connection') },
  publication_unconfirmed: { to: '/settings/system', message: t('alpha7.status.publication'), label: t('alpha7.status.system') },
  connection_lost: { to: '/settings/connections', message: t('alpha7.status.disconnected'), label: t('alpha7.status.connection') },
  persistence_failure: { to: '/settings/connections', message: t('alpha7.status.database'), label: t('alpha7.status.connection') },
  system_fault: { to: '/settings/diagnostics', message: t('alpha7.status.fault'), label: t('alpha7.status.diagnose') },
};

export function ConditionRow({ condition }: { condition: Condition }) {
  const action = ACTIONS[condition.kind];
  return <li className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-0">
    <span className="min-w-0 text-sm">{action.message}</span>
    <Link to={action.to} className="shrink-0 text-sm font-medium text-fg underline underline-offset-4">{action.label}</Link>
  </li>;
}

/** One accessible status entry point. Hover is temporary; clicking pins it open. */
export function ReadinessBadge({ conditions, ready, revision, children }: { conditions: Condition[]; ready: boolean; revision?: number; children?: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const open = hovered || pinned;
  const waiting = !ready && conditions.length === 0;
  const complete = ready && conditions.length === 0;
  const label = complete ? t('alpha7.status.ready') : t('alpha7.status.notReady', { count: Math.max(1, conditions.length) });
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) { setHovered(false); setPinned(false); } };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = () => { setHovered(false); setPinned(false); trigger.current?.focus(); };
  return <div className="flex flex-wrap items-center gap-2">
    <div ref={wrapper} className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} className="cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent" onClick={() => { setPinned(!pinned); setHovered(false); }}>
        <Badge tone={complete ? 'ok' : waiting ? 'neutral' : conditions.some(condition => condition.tone === 'bad') ? 'bad' : 'warn'}>{label}</Badge>
      </button>
      {open && <div id={id} role="dialog" aria-label={t('alpha7.status.conditions')} className="absolute left-0 top-full z-40 w-[min(34rem,85vw)] pt-2" onFocus={() => setPinned(true)}>
        <div className="rounded-xl border border-line-strong bg-panel p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3"><p className="font-semibold">{t('alpha7.status.conditions')}</p><Button variant="ghost" size="icon" aria-label={t('alpha7.status.close')} onClick={close}><X size={15} /></Button></div>
          {conditions.length ? <ul>{conditions.map(condition => <ConditionRow key={condition.kind} condition={condition} />)}</ul> : waiting ? <p className="py-3 text-sm text-muted">{t('alpha7.status.waiting')} <Link to="/settings/connections" className="text-fg underline">{t('alpha7.status.connection')}</Link></p> : <p className="py-3 text-sm text-muted">{t('alpha7.status.allGood')}</p>}
        </div>
      </div>}
    </div>
    <Badge tone="neutral">{t('alpha7.status.version', { count: revision ?? '–' })}</Badge>
    {children}
  </div>;
}

import { t as uiText } from '@/i18n';
import {
  BookOpen,
  Cable,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileCode2,
  FlaskConical,
  LayoutDashboard,
  Settings2,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NAVIGATION } from '@/lib/navigation';
import { LayoutPreferencesProvider, useCollapsedNavigation } from './PanelLayout';
import { Link, Outlet, useLocation } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/controls';
import { DraftBar } from '@/features/authoring/DraftBar';
import { useLive } from '@/lib/live-context';
import { useActiveRevision, useInfo } from '@/lib/queries';
import { classifySystem, overallState } from '@/lib/status';
import { cn } from '@/lib/utils';
import { IssueFocus } from './IssueFocus';

const MODULE_ICONS = { contracts: FileCode2, templates: BookOpen, sources: Cable, changes: FlaskConical, settings: Settings2 };

/** Top-bar chips: readiness and connection are separate facts. */
export function StatusChips({ extra }: { extra?: ReactNode }) {
  const live = useLive();
  const active = useActiveRevision();
  const info = useInfo();
  const conditions = classifySystem({
    service: live.service,
    connection: live.connection,
    hasActiveRegistry: active.data === undefined ? undefined : active.data !== null,
    apiFailure: info.isError ? 'network' : null,
  });
  const overall = overallState(conditions, live.service);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tip label={conditions.length ? conditions.map((c) => c.title).join(' · ') : uiText("components.Shell.keine_offenen_bedingungen_4c615b")}>
        <span tabIndex={0}>
          <Badge tone={overall.tone}>{overall.label}</Badge>
        </span>
      </Tip>
      {live.connection !== 'open' && live.connection !== 'stopped' && (
        <Badge tone={live.connection === 'mismatch' ? 'bad' : 'warn'}>
          <WifiOff size={11} />
          {live.connection === 'connecting' ? uiText("components.Shell.verbinde_fed9bb") : live.connection === 'mismatch' ? uiText("components.Shell.andere_installation_616cdb") : live.connection === 'resyncing' ? uiText("components.Shell.synchronisiere_fd5034") : uiText("components.Shell.verbindung_unterbrochen_80731c")}
        </Badge>
      )}
      <Badge tone="neutral">{uiText("components.Shell.revision_e330d8")}{active.data?.revision ?? '–'}</Badge>
      {extra}
    </div>
  );
}

export function Shell(_props: { onSetup: () => void }) {
  const info = useInfo();
  const [collapsed, setCollapsed] = useCollapsedNavigation(info.data?.installation_id ?? null);
  const { pathname } = useLocation();
  const moduleId = pathname.split('/')[1] ?? '';
  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => { if (moduleId) setExpanded(previous => previous.includes(moduleId) ? previous : [...previous, moduleId]); }, [moduleId]);

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-150',
          collapsed ? 'w-14' : 'w-64',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-3.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-accent text-sm font-bold text-accent-fg">{uiText("components.Shell.t_e632b7")}</div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{uiText("components.Shell.terra_workbench_7ad523")}</p>
              <p className="truncate text-[11px] text-faint">{info.data?.installation_label || uiText("components.Shell.core_contracts_57c8c1")}</p>
            </div>
          )}
        </div>
        <nav aria-label={uiText("components.Shell.hauptnavigation_e8fc66")} className="flex-1 space-y-0.5 overflow-y-auto p-2">
          <Link to="/" aria-current={pathname === '/' ? 'page' : undefined} title={collapsed ? uiText('alpha7.nav.overview') : undefined} className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm', pathname === '/' ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-raised', collapsed && 'justify-center px-0')}>
            <LayoutDashboard size={17} /><span className={collapsed ? 'sr-only' : ''}>{uiText('alpha7.nav.overview')}</span>
          </Link>
          {NAVIGATION.map(module => {
            const Icon = MODULE_ICONS[module.id as keyof typeof MODULE_ICONS];
            const open = expanded.includes(module.id);
            return <div key={module.id}>
              <button type="button" aria-current={moduleId === module.id ? 'true' : undefined} aria-expanded={!collapsed && open} aria-controls={`nav-${module.id}`} title={collapsed ? module.label : undefined} className={cn('flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-raised', moduleId === module.id ? 'text-accent' : 'text-muted', collapsed && 'justify-center px-0')} onClick={() => {
                if (collapsed) { setCollapsed(false); setExpanded(previous => previous.includes(module.id) ? previous : [...previous, module.id]); }
                else setExpanded(previous => open ? previous.filter(id => id !== module.id) : [...previous, module.id]);
              }}>
                <Icon size={17} /><span className={cn('flex-1', collapsed && 'sr-only')}>{module.label}</span>{!collapsed && <ChevronDown size={14} className={open ? 'rotate-180' : ''} />}
              </button>
              {!collapsed && open && <ul id={`nav-${module.id}`} className="mb-2 ml-5 border-l border-line pl-2">{module.children.map(item => {
                const selected = pathname === item.to || (item.to === '/contracts/select/contract' && pathname.startsWith('/contracts/view/')) || (item.to === '/templates/own' && pathname.startsWith('/templates/details/'));
                return <li key={item.to}><Link to={item.to} aria-current={selected ? 'page' : undefined} className={cn('block rounded-md px-3 py-2 text-sm leading-snug', selected ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:bg-raised hover:text-fg')}>{item.label}</Link></li>;
              })}</ul>}
            </div>;
          })}
        </nav>
        <div className="flex items-center justify-between gap-1 border-t border-line p-2">
          <Button variant="ghost" size="icon" aria-expanded={!collapsed} aria-label={collapsed ? uiText("components.Shell.navigation_ausklappen_9adc95") : uiText("components.Shell.navigation_einklappen_6b094c")} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-panel/70 px-5 py-2 backdrop-blur">
          <StatusChips />
          <DraftBar />
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-8">
          <LayoutPreferencesProvider value={info.data?.installation_id ?? null}><Outlet /></LayoutPreferencesProvider>
          <IssueFocus />
        </main>
      </div>
    </div>
  );
}

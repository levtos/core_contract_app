import {
  Activity,
  Cable,
  ChevronsLeft,
  ChevronsRight,
  FileCode2,
  FlaskConical,
  LayoutDashboard,
  Network,
  Settings2,
  WifiOff,
} from 'lucide-react';
import { type ReactNode } from 'react';
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

const NAV = [
  { to: '/', label: 'Übersicht', icon: LayoutDashboard, end: true },
  { to: '/contracts', label: 'Contracts & Definitionen', icon: FileCode2, match: ['/contracts', '/definitions'] },
  { to: '/sources', label: 'Sources & Bindings', icon: Cable },
  { to: '/registry', label: 'Registry Studio', icon: FlaskConical },
  { to: '/graph', label: 'Graph', icon: Network },
  { to: '/diagnostics', label: 'Diagnose & Historie', icon: Activity },
  { to: '/admin', label: 'Administration', icon: Settings2 },
];

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
      <Tip label={conditions.length ? conditions.map((c) => c.title).join(' · ') : 'Keine offenen Bedingungen'}>
        <span tabIndex={0}>
          <Badge tone={overall.tone}>{overall.label}</Badge>
        </span>
      </Tip>
      {live.connection !== 'open' && live.connection !== 'stopped' && (
        <Badge tone={live.connection === 'mismatch' ? 'bad' : 'warn'}>
          <WifiOff size={11} />
          {live.connection === 'connecting' ? 'verbinde …' : live.connection === 'mismatch' ? 'andere Installation' : live.connection === 'resyncing' ? 'synchronisiere …' : 'Verbindung unterbrochen'}
        </Badge>
      )}
      <Badge tone="neutral">Revision {active.data?.revision ?? '–'}</Badge>
      {extra}
    </div>
  );
}

export function Shell({ onSetup }: { onSetup: () => void }) {
  const info = useInfo();
  const [collapsed, setCollapsed] = useCollapsedNavigation(info.data?.installation_id ?? null);
  const { pathname } = useLocation();

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-150',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-3.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-accent text-sm font-bold text-accent-fg">T</div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">Terra Workbench</p>
              <p className="truncate text-[11px] text-faint">{info.data?.installation_label || 'Core Contracts'}</p>
            </div>
          )}
        </div>
        <nav aria-label="Hauptnavigation" className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const active = item.end ? pathname === item.to : (item.match ?? [item.to]).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
            return <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                  'flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-raised hover:text-fg',
                  collapsed && 'justify-center px-0',
                )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={17} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>;
          })}
        </nav>
        <div className="flex items-center justify-between gap-1 border-t border-line p-2">
          {!collapsed && (
            <Button variant="ghost" size="sm" onClick={onSetup}>
              Einrichtung prüfen
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-expanded={!collapsed} aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'} onClick={() => setCollapsed(!collapsed)}>
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
        </main>
      </div>
    </div>
  );
}

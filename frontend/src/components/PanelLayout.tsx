import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Children, createContext, isValidElement, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Select } from './ui/form';
import { cn } from '@/lib/utils';

const Installation = createContext<string | null>(null);
export const LayoutPreferencesProvider = Installation.Provider;
export const layoutKey = (installation: string | null, view: string) => installation ? `terra.layout.v1:${encodeURIComponent(installation)}:${view}` : null;

function read(key: string | null): unknown {
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function write(key: string | null, value: unknown) {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional, current layout still works */ }
}

/** Also used by the fixed sidebar; no global preference is inherited by another installation. */
export function useCollapsedNavigation(installation: string | null) {
  const key = layoutKey(installation, 'navigation');
  const initial = useMemo(() => { const value = read(key); return typeof value === 'boolean' ? value : window.innerWidth < 900; }, [key]);
  const [state, set] = useState<{ key: string | null; value: boolean } | null>(null);
  const value = state?.key === key ? state.value : initial;
  return [value, (next: boolean) => { set({ key, value: next }); write(key, next); }] as const;
}

type Span = 1 | 2 | 3;
interface SlotProps { id: string; title: string; span?: Span; children: ReactNode }
interface Metadata { order: string[]; spans: Record<string, Span> }
export function LayoutPanel({ children }: SlotProps) { return <>{children}</>; }

function metadata(raw: unknown, slots: SlotProps[]): Metadata {
  const ids = slots.map((s) => s.id);
  const data = raw && typeof raw === 'object' ? raw as Partial<Metadata> : {};
  const order = Array.isArray(data.order) ? [...new Set(data.order.filter((id) => typeof id === 'string' && ids.includes(id)))] : [];
  return {
    order: [...order, ...ids.filter((id) => !order.includes(id))],
    spans: Object.fromEntries(slots.map((slot) => [slot.id, [1, 2, 3].includes(data.spans?.[slot.id] ?? 0) ? data.spans![slot.id]! : slot.span ?? 3])),
  };
}

/** Keyed siblings move without reparenting or remounting editor components. Only
 * whitelisted panel IDs, order and widths can enter storage. Dialogs stay outside. */
export function PanelLayout({ view, children, defaultOrder }: { view: string; children: ReactNode; defaultOrder?: string[] }) {
  const installation = useContext(Installation);
  const key = layoutKey(installation, view);
  const scope = `${useId()}:${key ?? view}`;
  const slots = Children.toArray(children).filter(isValidElement<SlotProps>).filter((child) => child.type === LayoutPanel).map((child) => child.props);
  if (defaultOrder) slots.sort((a, b) => defaultOrder.indexOf(a.id) - defaultOrder.indexOf(b.id));
  const loaded = useMemo(() => read(key), [key]);
  const [stored, setStored] = useState<{ key: string | null; data: Metadata } | null>(null);
  const current = metadata(stored?.key === key ? stored.data : loaded, slots);
  const [adjusting, setAdjusting] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const save = (next: Metadata) => { setStored({ key, data: next }); write(key, next); };
  const move = (id: string, to: number) => {
    const from = current.order.indexOf(id);
    if (from < 0 || to < 0 || to >= current.order.length || from === to) return;
    const order = current.order.slice();
    order.splice(from, 1);
    order.splice(to, 0, id);
    save({ ...current, order });
    setAnnouncement(`${slots.find((s) => s.id === id)?.title}: Position ${to + 1} von ${order.length}.`);
  };
  return <section aria-label="Funktionspanels">
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
      <Button size="sm" className="min-h-11" aria-pressed={adjusting} onClick={() => setAdjusting(!adjusting)}><SlidersHorizontal size={13} /> Layout anpassen</Button>
      {adjusting && <Button size="sm" className="min-h-11" onClick={() => { save(metadata(null, slots)); setAnnouncement('Standardlayout wiederhergestellt.'); }}><RotateCcw size={13} /> Layout zurücksetzen</Button>}
    </div>
    {adjusting && <p className="mb-3 text-xs text-muted">Panels am Griff ziehen oder mit den Pfeiltasten am Griff verschieben. Die Breite lässt sich separat wählen.</p>}
    <div className="grid items-start gap-4 xl:grid-cols-3">
      {current.order.map((id, index) => {
        const slot = slots.find((s) => s.id === id)!;
        return <MovablePanel key={id} slot={slot} span={current.spans[id]!} view={scope} index={index} count={current.order.length} adjusting={adjusting} onMove={(to) => move(id, to)} onDrop={(source, after) => {
          const from = current.order.indexOf(source);
          const destination = index + (after ? 1 : 0) - (from < index ? 1 : 0);
          move(source, destination);
        }} onSize={(span) => save({ ...current, spans: { ...current.spans, [id]: span } })} />;
      })}
    </div>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
  </section>;
}

function MovablePanel({ slot, span, view, index, count, adjusting, onMove, onDrop, onSize }: {
  slot: SlotProps; span: Span; view: string; index: number; count: number; adjusting: boolean;
  onMove: (index: number) => void; onDrop: (source: string, after: boolean) => void; onSize: (span: Span) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const latest = useRef(onDrop);
  latest.current = onDrop;
  const [over, setOver] = useState(false);
  useEffect(() => {
    const target = element.current;
    const grip = handle.current;
    if (!adjusting || !target || !grip) return;
    const drag = draggable({ element: grip, getInitialData: () => ({ panel: slot.id, view }) });
    const drop = dropTargetForElements({
      element: target,
      canDrop: ({ source }) => source.data.view === view && typeof source.data.panel === 'string' && source.data.panel !== slot.id,
      onDragEnter: () => setOver(true), onDragLeave: () => setOver(false),
      onDrop: ({ source, location }) => {
        setOver(false);
        // Only the innermost accepted target changes the layout.
        if (location.current.dropTargets[0]?.element !== target) return;
        latest.current(String(source.data.panel), location.current.input.clientY >= target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2);
      },
    });
    return () => { drag(); drop(); };
  }, [adjusting, slot.id, view]);
  return <div ref={element} data-layout-panel={slot.id} data-span={span} className={cn('min-w-0', span === 1 ? 'xl:col-span-1' : span === 2 ? 'xl:col-span-2' : 'xl:col-span-3', over && 'rounded-[var(--radius-lg)] ring-2 ring-accent')}>
    {adjusting && <div className="mb-1 flex flex-wrap items-center gap-1 rounded-[var(--radius-sm)] border border-line bg-raised p-1">
      <button ref={handle} type="button" aria-label={`Panel ${slot.title} verschieben`} className="flex min-h-11 min-w-11 cursor-grab items-center gap-1 px-2 text-xs active:cursor-grabbing" onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); onMove(index - 1); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); onMove(index + 1); }
      }}><GripVertical size={14} /><span>{slot.title}</span></button>
      <Button size="icon" className="min-h-11 min-w-11" aria-label={`${slot.title}: nach vorne`} disabled={index === 0} onClick={() => onMove(index - 1)}><ArrowUp size={13} /></Button>
      <Button size="icon" className="min-h-11 min-w-11" aria-label={`${slot.title}: nach hinten`} disabled={index === count - 1} onClick={() => onMove(index + 1)}><ArrowDown size={13} /></Button>
      <Select className="ml-auto min-h-11 w-auto min-w-32" aria-label={`${slot.title}: Panelbreite`} value={span} onChange={(e) => onSize(Number(e.target.value) as Span)}><option value="1">Schmal</option><option value="2">Mittel</option><option value="3">Ganze Zeile</option></Select>
    </div>}
    {slot.children}
  </div>;
}

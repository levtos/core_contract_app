import { Badge } from '@/components/ui/badge';
import { Empty, KeyValue, Notice, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { formatTime } from '@/lib/format';
import { isObject, type Json } from '@/lib/json';
import { describeError } from '@/lib/api';
import { useContractDiagnosis } from '@/lib/queries';
import { ExplainPanel } from './ExplainPanel';

const START_CASES: Record<string, { label: string; text: string; tone: 'ok' | 'warn' | 'neutral' | 'bad' }> = {
  first: { label: 'Erststart', text: 'Der Contract war noch nie aktiv; es gibt nichts wiederherzustellen.', tone: 'neutral' },
  valid: { label: 'Wiederherstellung gültig', text: 'Gespeicherter Kontext passt zum aktuellen Fingerprint; Fristen bleiben absolut erhalten.', tone: 'ok' },
  stale: { label: 'Veraltet', text: 'Ein deaktivierter oder entfernter Zustand erfordert Neuinitialisierung.', tone: 'warn' },
  incompatible: { label: 'Inkompatibel', text: 'Der Fingerprint hat sich geändert; Kontext wurde nicht übernommen.', tone: 'warn' },
  partial: { label: 'Unvollständig', text: 'Es fehlen Teile des erforderlichen Kontexts.', tone: 'warn' },
  missing: { label: 'Kontext fehlt', text: 'Es war aktiv, aber es liegt kein Kontext vor.', tone: 'bad' },
};

const short = (v: string | null | undefined) => (v ? `${v.slice(0, 12)}…` : '–');
const scalar = (v: Json | undefined): string => (v === null || v === undefined ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Read-only diagnosis of one contract; reading never advances state, refreshes inputs or fires deadlines. */
export function ContractDiagnosis({ contractId }: { contractId: string }) {
  const query = useContractDiagnosis(contractId);
  if (query.isPending) return <Spinner />;
  if (query.isError) return <Notice tone="warn" title="Keine Diagnose verfügbar">{describeError(query.error)} Der Contract existiert in der aktiven Registry nicht oder ist nicht konfiguriert.</Notice>;
  const d = query.data;
  const start = d.start_case ? START_CASES[d.start_case] : undefined;
  const machine = d.machine;
  const current = isObject(machine?.current) ? machine!.current : null;

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader title="Identität & Wiederherstellung" aside={<Badge tone={d.fingerprint_compatible ? 'ok' : 'warn'}>{d.fingerprint_compatible ? 'Fingerprint kompatibel' : 'Fingerprint abweichend'}</Badge>} />
        <div className="grid gap-x-10 gap-y-3 p-4 lg:grid-cols-2">
          <KeyValue
            items={[
              { label: 'Registry-Revision', value: d.registry_revision },
              { label: 'Startfall', value: start ? <span className="flex flex-wrap items-center gap-2"><Badge tone={start.tone}>{start.label}</Badge><span className="text-xs text-muted">{start.text}</span></span> : '–' },
              { label: 'Nächste Fälligkeit', value: d.next_due ? formatTime(d.next_due) : 'keine' },
            ]}
          />
          <KeyValue
            items={[
              { label: 'Gespeicherter Fingerprint', value: <code title={d.fingerprint ?? ''}>{short(d.fingerprint)}</code> },
              { label: 'Erwarteter Fingerprint', value: <code title={d.expected_fingerprint}>{short(d.expected_fingerprint)}</code> },
            ]}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Temporal-Kontexte" description="Nur Zeit- und Identitätsfelder; vorherige Rohwerte werden nicht ausgegeben." />
        {d.temporal.length === 0 ? (
          <Empty title="Keine Temporal-Kontexte">Dieser Contract hat keine Zeit-Knoten mit gespeichertem Kontext.</Empty>
        ) : (
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">Temporal-Kontexte</caption>
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-2 py-1.5 font-medium">Knoten</th><th className="px-2 py-1.5 font-medium">Seit</th><th className="px-2 py-1.5 font-medium">Grace bis</th><th className="px-2 py-1.5 font-medium">Grace aktiv</th><th className="px-2 py-1.5 font-medium">Lücke</th><th className="px-2 py-1.5 font-medium">Restore</th></tr></thead>
              <tbody>
                {d.temporal.map((t) => (
                  <tr key={t.id} className="border-b border-line/50">
                    <td className="mono px-2 py-1.5 text-xs">{t.id}</td>
                    <td className="px-2 py-1.5 text-xs">{formatTime(scalar(t.state.since_at) === '–' ? null : String(t.state.since_at))}</td>
                    <td className="px-2 py-1.5 text-xs">{formatTime(scalar(t.state.grace_until) === '–' ? null : String(t.state.grace_until))}</td>
                    <td className="px-2 py-1.5 text-xs">{t.state.grace_armed === undefined ? '–' : t.state.grace_armed ? 'ja' : 'nein'}</td>
                    <td className="px-2 py-1.5 text-xs">{formatTime(scalar(t.state.gap_at) === '–' ? null : String(t.state.gap_at))}</td>
                    <td className="px-2 py-1.5 text-xs">{t.restore_pending ? <Badge tone="warn">ausstehend</Badge> : <span className="text-faint">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="State Machine" aside={machine && current ? <Badge tone="accent">{String(current.state)}</Badge> : undefined} />
        {!machine ? (
          <Empty title="Keine State Machine">Dieser Contract verwendet keine State Machine.</Empty>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <KeyValue
              items={[
                { label: 'Zustände', value: <span className="flex flex-wrap gap-1.5">{machine.states.map((s) => <Badge key={s} tone={current?.state === s ? 'accent' : machine.initial === s ? 'info' : 'neutral'}>{s}{machine.initial === s ? ' (initial)' : ''}</Badge>)}</span> },
                { label: 'Deadline', value: machine.deadline_seconds ? `${machine.deadline_seconds} s` : 'keine' },
                { label: 'Sessions', value: machine.sessions ? 'ja' : 'nein' },
                { label: 'Befehle', value: Object.keys(machine.commands ?? {}).join(', ') || 'keine' },
              ]}
            />
            {current ? (
              <KeyValue
                items={[
                  { label: 'Aktueller Zustand', value: <code>{scalar(current.state)}</code> },
                  { label: 'Seit', value: formatTime(String(current.since_at ?? '')) },
                  { label: 'Vorheriger Zustand', value: scalar(current.previous_state) },
                  { label: 'Grund / Auslöser', value: `${scalar(current.transition_reason)} / ${scalar(current.trigger)}` },
                  { label: 'Episode', value: `${scalar(current.episode_id)} (seit ${formatTime(String(current.episode_started_at ?? ''))})${current.episode_ended_at ? ` · beendet ${formatTime(String(current.episode_ended_at))}` : ''}` },
                  { label: 'Session', value: scalar(current.session_id) },
                  { label: 'Herkunft', value: scalar(current.origin) },
                ]}
              />
            ) : (
              <p className="text-sm text-muted">Noch kein gespeicherter Maschinenzustand.</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">Transitionen</caption>
                <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-2 py-1.5 font-medium">Von</th><th className="px-2 py-1.5 font-medium">Nach</th><th className="px-2 py-1.5 font-medium">Ereignis</th><th className="px-2 py-1.5 font-medium">Grund</th><th className="px-2 py-1.5 font-medium">Episode</th></tr></thead>
                <tbody>
                  {machine.transitions.map((t, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="px-2 py-1.5"><code className="text-xs">{t.source}</code></td>
                      <td className="px-2 py-1.5"><code className="text-xs">{t.target}</code></td>
                      <td className="px-2 py-1.5"><code className="text-xs">{t.event}</code></td>
                      <td className="px-2 py-1.5 text-xs">{t.reason}</td>
                      <td className="px-2 py-1.5 text-xs">{[t.new_episode && 'neu', t.ends_episode && 'Ende'].filter(Boolean).join(', ') || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      <ExplainPanel trace={d.trace} />
    </div>
  );
}

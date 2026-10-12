import { Link } from 'react-router';
import { FieldStatusBadge, QualityBadge } from '@/components/status-parts';
import { Badge } from '@/components/ui/badge';
import { KeyValue, Notice, Panel, PanelHeader } from '@/components/ui/layout';
import { formatTime } from '@/lib/format';
import { displayValue } from '@/lib/status';
import type { Envelope } from '@/lib/types';

/** Live contract state exactly as the server reports it (status, quality, reasons, evidence). */
export function ContractLiveState({ envelope, stale }: { envelope: Envelope; stale: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {stale && <Notice tone="warn" title="Stand möglicherweise veraltet">Die Live-Verbindung ist unterbrochen oder synchronisiert; gezeigt wird der letzte bekannte Stand.</Notice>}
      <Panel>
        <PanelHeader title="Contract" aside={<><QualityBadge quality={envelope.contract_health} /><Badge tone={envelope.available ? 'ok' : 'warn'}>{envelope.available ? 'verfügbar' : 'nicht verfügbar'}</Badge></>} />
        <div className="grid gap-x-10 p-4 sm:grid-cols-2">
          <KeyValue items={[{ label: 'Berechnet', value: formatTime(envelope.computed_at) }, { label: 'Veröffentlicht', value: formatTime(envelope.published_at) }]} />
          <KeyValue items={[{ label: 'Publication', value: envelope.publication_seq }, { label: 'Revision', value: envelope.registry_revision }]} />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Felder" description="Status, Qualität und Gründe stammen unverändert vom Server." />
        <div className="divide-y divide-line">
          {Object.entries(envelope.fields).map(([name, field]) => (
            <div key={name} className="grid gap-x-6 gap-y-1 px-4 py-3 text-sm md:grid-cols-[10rem_1fr]">
              <code className="font-medium">{name}</code>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <FieldStatusBadge field={field} />
                  <QualityBadge quality={field.quality} />
                  <span className={field.status === 'valid' || field.status === 'held' ? 'font-mono' : 'text-muted'} data-testid={`value-${name}`}>{displayValue(field)}</span>
                  {field.freshness && <Badge>Frische: {field.freshness}</Badge>}
                </div>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 text-xs text-muted">
                  {field.measured_at && (<><dt>Gemessen</dt><dd>{formatTime(field.measured_at)}</dd></>)}
                  {field.since_at && (<><dt>Seit</dt><dd>{formatTime(field.since_at)}</dd></>)}
                  {field.held_until && (<><dt>Gehalten bis</dt><dd>{formatTime(field.held_until)}</dd></>)}
                </dl>
                {field.reasons.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-xs">
                    {field.reasons.map((reason, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2"><Badge tone="warn">{reason.code}</Badge><span className="text-muted">Eingang {reason.input}{reason.source_id ? ` · ${reason.source_id}` : ''}{reason.detail ? ` · ${reason.detail}` : ''} · seit {formatTime(reason.since)}</span></li>
                    ))}
                  </ul>
                )}
                {field.evidence.length > 0 && <p className="text-xs text-muted">{field.evidence.length} Evidenz-Referenz{field.evidence.length === 1 ? '' : 'en'} – in der <Link className="text-accent hover:underline" to={`/diagnostics?contract=${encodeURIComponent(envelope.contract_id)}`}>Diagnose</Link> auflösbar.</p>}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      {envelope.state_machine && (
        <Panel>
          <PanelHeader title="State Machine" />
          <pre className="max-h-72 overflow-auto p-4 text-xs">{JSON.stringify(envelope.state_machine, null, 2)}</pre>
        </Panel>
      )}
    </div>
  );
}


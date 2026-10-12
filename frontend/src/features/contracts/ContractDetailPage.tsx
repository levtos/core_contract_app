import { ArrowLeft, Stethoscope, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FieldStatusBadge, QualityBadge } from '@/components/status-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Empty, KeyValue, Notice, PageHeader, Panel, PanelHeader } from '@/components/ui/layout';
import { ContractEditor } from '@/editors/RegistryObjects';
import { ReadOnlyNotice } from '@/features/authoring/DraftBar';
import { asArray, str } from '@/features/authoring/model';
import { refOptions, typeKey } from '@/features/authoring/catalog';
import { consumersOfContract, resolveRef } from '@/features/authoring/usage';
import { useAuthoringSource } from '@/features/authoring/useAuthoringSource';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { formatTime } from '@/lib/format';
import { isObject, setAt, type JsonObject } from '@/lib/json';
import { useLive } from '@/lib/live-context';
import { displayValue } from '@/lib/status';
import type { Envelope } from '@/lib/types';

function LiveState({ envelope, stale }: { envelope: Envelope; stale: boolean }) {
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

export default function ContractDetailPage() {
  const { contractId = '' } = useParams();
  const src = useAuthoringSource();
  const doc = useWorkingDocument();
  const live = useLive();
  const navigate = useNavigate();
  const [removing, setRemoving] = useState(false);
  const list = asArray(src.config?.contracts).filter(isObject);
  const index = list.findIndex((c) => str(c.contract_id) === contractId);
  const contract = index >= 0 ? list[index]! : null;
  const envelope = live.contracts?.[contractId] ?? null;

  if (!contract) {
    return (
      <>
        <BackLink />
        <Empty title={`Contract „${contractId}“ nicht gefunden`}>
          {src.source === 'draft' ? 'Er existiert im geöffneten Draft nicht.' : 'Er existiert in der aktiven Registry nicht.'}
          {envelope && ' Der Server liefert dennoch einen Zustand dafür.'}
        </Empty>
      </>
    );
  }
  const pointer = `/contracts/${index}`;
  const refs = refOptions(src.config, src.types, contractId);
  const typeEntry = src.types.find((t) => t.key === typeKey(str(contract.type_id), Number(contract.type_version)));
  const consumers = consumersOfContract(src.config, contractId);
  const inputs = asArray(contract.inputs).filter(isObject);
  const enabled = contract.enabled !== false;

  return (
    <>
      <BackLink />
      <PageHeader
        title={<span className="font-mono">{contractId}</span>}
        description={`${str(contract.display_name) || 'Contract-Instanz'} · ${str(contract.type_id)} v${String(contract.type_version)}`}
        actions={
          <>
            <Badge tone={enabled ? 'accent' : 'neutral'}>{enabled ? 'aktiviert' : 'deaktiviert'}</Badge>
            <Button size="sm" onClick={() => navigate(`/diagnostics?contract=${encodeURIComponent(contractId)}`)}><Stethoscope size={14} /> Diagnose</Button>
            {src.editable && <Button size="sm" variant="danger" onClick={() => setRemoving(true)}><Trash2 size={14} /> Entfernen</Button>}
          </>
        }
      />
      <ReadOnlyNotice what="Contract-Konfiguration" />
      <Tabs
        items={[
          {
            value: 'state',
            label: 'Zustand',
            content: !enabled ? (
              <Empty title="Contract deaktiviert">Deaktivierte Contracts liefern keinen Zustand (der Server antwortet mit contract_disabled).</Empty>
            ) : envelope ? (
              <LiveState envelope={envelope} stale={live.stale} />
            ) : (
              <Empty title="Kein Live-Zustand">
                {live.contracts === null ? 'Es wurde noch kein Snapshot empfangen.' : 'Der aktive Stand enthält diesen Contract nicht – er existiert nur im Draft oder wurde noch nicht aktiviert.'}
              </Empty>
            ),
          },
          {
            value: 'config',
            label: 'Konfiguration',
            content: (
              <Panel className="max-w-4xl p-5">
                <fieldset disabled={!src.editable} className="min-w-0">
                  <ContractEditor value={contract} pointer={pointer} types={src.types} refs={refs} onChange={(next) => doc.edit((c) => setAt(c, pointer, next))} />
                </fieldset>
              </Panel>
            ),
          },
          {
            value: 'deps',
            label: 'Abhängigkeiten',
            content: (
              <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
                <Panel>
                  <PanelHeader title="Eingänge (hängt ab von)" />
                  <ul className="divide-y divide-line">
                    {inputs.length === 0 && <li className="px-4 py-3 text-sm text-muted">Keine Eingänge gebunden.</li>}
                    {inputs.map((input, i) => {
                      const target = resolveRef(str(input.ref), src.config);
                      return (
                        <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                          <code className="text-muted">{str(input.name)}</code>
                          <span>→</span>
                          {target?.kind === 'contract' ? <Link className="font-mono text-xs text-accent hover:underline" to={`/contracts/${encodeURIComponent(target.id)}`}>{str(input.ref)}</Link> : <code className="text-xs">{str(input.ref)}</code>}
                          <Badge tone={target?.kind === 'source' ? 'info' : target ? 'accent' : 'bad'}>{target?.kind === 'source' ? 'Quelle' : target ? 'Contract' : 'unbekannt'}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
                <Panel>
                  <PanelHeader title="Verwendet von" description="Contracts, die diesen Contract als Eingang nutzen." />
                  <ul className="divide-y divide-line">
                    {consumers.length === 0 && <li className="px-4 py-3 text-sm text-muted">Kein anderer Contract nutzt ihn.</li>}
                    {consumers.map((id) => (
                      <li key={id} className="px-4 py-2.5 text-sm"><Link className="font-mono text-xs text-accent hover:underline" to={`/contracts/${encodeURIComponent(id)}`}>{id}</Link></li>
                    ))}
                  </ul>
                </Panel>
                <Panel className="lg:col-span-2">
                  <PanelHeader title="Typ" />
                  <div className="p-4 text-sm">
                    {typeEntry?.declarative ? (
                      <>Deklarative Definition <Link className="font-mono text-accent hover:underline" to={`/definitions/${encodeURIComponent(typeEntry.type_id)}/${typeEntry.type_version}`}>{typeEntry.key}</Link></>
                    ) : (
                      <>Paket-Typ <code>{str(contract.type_id)}@{String(contract.type_version)}</code> (fest im Code, nicht über die Workbench änderbar)</>
                    )}
                  </div>
                </Panel>
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Contract entfernen?"
        description={<>„{contractId}“ wird aus dem Draft entfernt. Contracts, die ihn als Eingang nutzen, werden bei der Validierung als fehlerhaft markiert.{consumers.length > 0 && <> Betroffen: {consumers.join(', ')}.</>}</>}
        confirmLabel="Entfernen"
        tone="danger"
        onConfirm={() => {
          doc.edit((c) => setAt(c, pointer, undefined));
          setRemoving(false);
          navigate('/contracts');
        }}
      />
    </>
  );
}

function BackLink() {
  return (
    <Link to="/contracts" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
      <ArrowLeft size={13} /> Alle Contracts
    </Link>
  );
}

export type { JsonObject };

import { ArrowLeft, Stethoscope, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ContractLiveState } from '@/components/ContractLiveState';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Empty, PageHeader, Panel, PanelHeader } from '@/components/ui/layout';
import { ContractEditor } from '@/editors/RegistryObjects';
import { ReadOnlyNotice } from '@/features/authoring/DraftBar';
import { asArray, str } from '@/features/authoring/model';
import { refOptions, typeKey } from '@/features/authoring/catalog';
import { consumersOfContract, resolveRef } from '@/features/authoring/usage';
import { useAuthoringSource } from '@/features/authoring/useAuthoringSource';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { isObject, setAt, type JsonObject } from '@/lib/json';
import { useLive } from '@/lib/live-context';

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
              <ContractLiveState envelope={envelope} stale={live.stale} />
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
              <PanelLayout view="contract.dependencies"><LayoutPanel id="inputs" title="Eingänge" span={2}>
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
                </LayoutPanel><LayoutPanel id="consumers" title="Verwendet von" span={1}><Panel>
                  <PanelHeader title="Verwendet von" description="Contracts, die diesen Contract als Eingang nutzen." />
                  <ul className="divide-y divide-line">
                    {consumers.length === 0 && <li className="px-4 py-3 text-sm text-muted">Kein anderer Contract nutzt ihn.</li>}
                    {consumers.map((id) => (
                      <li key={id} className="px-4 py-2.5 text-sm"><Link className="font-mono text-xs text-accent hover:underline" to={`/contracts/${encodeURIComponent(id)}`}>{id}</Link></li>
                    ))}
                  </ul>
                </Panel>
                </LayoutPanel><LayoutPanel id="type" title="Typ"><Panel>
                  <PanelHeader title="Typ" />
                  <div className="p-4 text-sm">
                    {typeEntry?.declarative ? (
                      <>Deklarative Definition <Link className="font-mono text-accent hover:underline" to={`/definitions/${encodeURIComponent(typeEntry.type_id)}/${typeEntry.type_version}`}>{typeEntry.key}</Link></>
                    ) : (
                      <>Paket-Typ <code>{str(contract.type_id)}@{String(contract.type_version)}</code> (fest im Code, nicht über die Workbench änderbar)</>
                    )}
                  </div>
                </Panel>
                </LayoutPanel></PanelLayout>
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

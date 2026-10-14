import { t as uiText } from '@/i18n';
import { ArrowLeft, Stethoscope, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
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
  const [params, setParams] = useSearchParams();
  const [removing, setRemoving] = useState(false);
  const list = asArray(src.config?.contracts).filter(isObject);
  const index = list.findIndex((c) => str(c.contract_id) === contractId);
  const contract = index >= 0 ? list[index]! : null;
  const envelope = live.contracts?.[contractId] ?? null;

  if (!contract) {
    return (
      <>
        <BackLink />
        <Empty title={uiText("features.contracts.ContractDetailPage.contract_v0_nicht_gefunden_c09b7a", { v0: (contractId) })}>
          {src.source === 'draft' ? uiText("features.contracts.ContractDetailPage.er_existiert_im_geoffneten_draft_nicht_cb5eb3") : uiText("features.contracts.ContractDetailPage.er_existiert_in_der_aktiven_registry_nicht_25b321")}
          {envelope && uiText("features.contracts.ContractDetailPage.der_server_liefert_dennoch_einen_zustand_dafur_0cfd01")}
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
  const displayFields = { ...typeEntry?.fields };
  const definition = asArray(src.config?.definitions).filter(isObject).find((d) => d.type_id === contract.type_id && d.type_version === contract.type_version);
  if (definition && isObject(definition.outputs)) {
    for (const [name, rule] of Object.entries(definition.outputs)) {
      if (isObject(rule) && rule.op === 'temporal' && rule.operation === 'age' && displayFields[name]) displayFields[name] = { ...displayFields[name]!, unit: 's' };
    }
  }
  if (contract.type_id === 'test.echo' && displayFields.value) {
    const source = asArray(src.config?.sources).filter(isObject).find((s) => s.source_id === inputs[0]?.ref);
    if (source && isObject(source.value_schema) && source.value_schema.unit) displayFields.value = { ...displayFields.value, unit: source.value_schema.unit };
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={<span className="font-mono">{contractId}</span>}
        description={uiText("features.contracts.ContractDetailPage.v0_v1_v_v2_610089", { v0: (str(contract.display_name) || 'Contract-Instanz'), v1: (str(contract.type_id)), v2: (String(contract.type_version)) })}
        actions={
          <>
            <Badge tone={enabled ? 'accent' : 'neutral'}>{enabled ? uiText("features.contracts.ContractDetailPage.aktiviert_acb27b") : uiText("features.contracts.ContractDetailPage.deaktiviert_10f33e")}</Badge>
            <Button size="sm" onClick={() => navigate(`/diagnostics?contract=${encodeURIComponent(contractId)}`)}><Stethoscope size={14} /> {uiText("features.contracts.ContractDetailPage.diagnose_64dd65")}</Button>
            {src.editable && <Button size="sm" variant="danger" onClick={() => setRemoving(true)}><Trash2 size={14} /> {uiText("features.contracts.ContractDetailPage.entfernen_382837")}</Button>}
          </>
        }
      />
      <ReadOnlyNotice what={uiText("features.contracts.ContractDetailPage.contract_konfiguration_d1e14f")} />
      <Tabs
        value={params.get('tab') ?? 'state'}
        onValueChange={(tab) => setParams({ tab }, { replace: true })}
        items={[
          {
            value: 'state',
            label: uiText("features.contracts.ContractDetailPage.zustand_630d1a"),
            content: !enabled ? (
              <Empty title={uiText("features.contracts.ContractDetailPage.contract_deaktiviert_f0d824")}>{uiText("features.contracts.ContractDetailPage.deaktivierte_contracts_liefern_keinen_zustand_de_a31528")}</Empty>
            ) : envelope ? (
              <ContractLiveState envelope={envelope} stale={live.stale} fields={displayFields} />
            ) : (
              <Empty title={uiText("features.contracts.ContractDetailPage.kein_live_zustand_85efdc")}>
                {live.contracts === null ? uiText("features.contracts.ContractDetailPage.es_wurde_noch_kein_snapshot_empfangen_e56b2e") : uiText("features.contracts.ContractDetailPage.der_aktive_stand_enthalt_diesen_contract_nicht_e_15aef3")}
              </Empty>
            ),
          },
          {
            value: 'config',
            label: uiText("features.contracts.ContractDetailPage.konfiguration_8df29d"),
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
            label: uiText("features.contracts.ContractDetailPage.abhangigkeiten_327cb1"),
            content: (
              <PanelLayout view="contract.dependencies"><LayoutPanel id="inputs" title={uiText("features.contracts.ContractDetailPage.eingange_53fb39")} span={2}>
                <Panel>
                  <PanelHeader title={uiText("features.contracts.ContractDetailPage.eingange_hangt_ab_von_24b089")} />
                  <ul className="divide-y divide-line">
                    {inputs.length === 0 && <li className="px-4 py-3 text-sm text-muted">{uiText("features.contracts.ContractDetailPage.keine_eingange_gebunden_b03857")}</li>}
                    {inputs.map((input, i) => {
                      const target = resolveRef(str(input.ref), src.config);
                      return (
                        <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                          <code className="text-muted">{str(input.name)}</code>
                          <span>→</span>
                          {target?.kind === 'contract' ? <Link className="font-mono text-xs text-accent hover:underline" to={`/contracts/${encodeURIComponent(target.id)}`}>{str(input.ref)}</Link> : <code className="text-xs">{str(input.ref)}</code>}
                          <Badge tone={target?.kind === 'source' ? 'info' : target ? 'accent' : 'bad'}>{target?.kind === 'source' ? uiText("features.contracts.ContractDetailPage.quelle_037889") : target ? uiText("features.contracts.ContractDetailPage.contract_a6f5b0") : uiText("features.contracts.ContractDetailPage.unbekannt_a418e6")}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
                </LayoutPanel><LayoutPanel id="consumers" title={uiText("features.contracts.ContractDetailPage.verwendet_von_656221")} span={1}><Panel>
                  <PanelHeader title={uiText("features.contracts.ContractDetailPage.verwendet_von_656221")} description={uiText("features.contracts.ContractDetailPage.contracts_die_diesen_contract_als_eingang_nutzen_763bf2")} />
                  <ul className="divide-y divide-line">
                    {consumers.length === 0 && <li className="px-4 py-3 text-sm text-muted">{uiText("features.contracts.ContractDetailPage.kein_anderer_contract_nutzt_ihn_4582b8")}</li>}
                    {consumers.map((id) => (
                      <li key={id} className="px-4 py-2.5 text-sm"><Link className="font-mono text-xs text-accent hover:underline" to={`/contracts/${encodeURIComponent(id)}`}>{id}</Link></li>
                    ))}
                  </ul>
                </Panel>
                </LayoutPanel><LayoutPanel id="type" title={uiText("features.contracts.ContractDetailPage.typ_1b0241")}><Panel>
                  <PanelHeader title={uiText("features.contracts.ContractDetailPage.typ_1b0241")} />
                  <div className="p-4 text-sm">
                    {typeEntry?.declarative ? (
                      <>{uiText("features.contracts.ContractDetailPage.deklarative_definition_b0121f")}<Link className="font-mono text-accent hover:underline" to={`/definitions/${encodeURIComponent(typeEntry.type_id)}/${typeEntry.type_version}`}>{typeEntry.key}</Link></>
                    ) : (
                      <>{uiText("features.contracts.ContractDetailPage.paket_typ_44867a")}<code>{str(contract.type_id)}@{String(contract.type_version)}</code> {uiText("features.contracts.ContractDetailPage.fest_im_code_nicht_uber_die_workbench_anderbar_ee4ae9")}</>
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
        title={uiText("features.contracts.ContractDetailPage.contract_entfernen_f6bc55")}
        description={<>„{contractId}{uiText("features.contracts.ContractDetailPage.wird_aus_dem_draft_entfernt_contracts_die_ihn_al_932341")}{consumers.length > 0 && <> {uiText("features.contracts.ContractDetailPage.betroffen_c20137")}{consumers.join(', ')}.</>}</>}
        confirmLabel={uiText("features.contracts.ContractDetailPage.entfernen_382837")}
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
      <ArrowLeft size={13} /> {uiText("features.contracts.ContractDetailPage.alle_contracts_67b49f")}</Link>
  );
}

export type { JsonObject };

import { t as uiText } from '@/i18n';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { describeError } from '@/lib/api';
import { DataTable } from '@/components/DataTable';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { ID_HINT, ID_LIMIT, validIdentifier } from '@/lib/identifiers';
import { Empty, PageHeader, Panel, Spinner } from '@/components/ui/layout';
import { ReadOnlyNotice } from '@/features/authoring/DraftBar';
import { asArray, str, uniqueName } from '@/features/authoring/model';
import { typeCatalog, typeKey } from '@/features/authoring/catalog';
import { useAuthoringSource } from '@/features/authoring/useAuthoringSource';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { setAt, isObject } from '@/lib/json';
import { useLive } from '@/lib/live-context';
import type { Envelope } from '@/lib/types';
import { useActiveRevision, useCapabilities } from '@/lib/queries';
import { useHaCatalog } from '@/features/sources/useHaCatalog';
import { contractSources, contractValue, fieldsForContract } from './presentation';
import { ContractStateChip } from './ContractStateChip';
import { DeviceWizard } from '@/features/sources/DeviceWizard';

export function ContractsTabs() {
  return null;
}

interface Row {
  id: string;
  name: string;
  type: string;
  version: number;
  enabled: boolean;
  envelope: Envelope | null;
  value: string;
  source: string;
  draftOnly: boolean;
  stale: boolean;
}

const col = createColumnHelper<Row>();

export function NewContractDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [manual, setManual] = useState(false);
  const change = (next: boolean) => { if (!next) setManual(false); onOpenChange(next); };
  return <><DeviceWizard open={open && !manual} onOpenChange={change} title={uiText('alpha7.overview.newContract')} contract="new" onAdded={result => result.contractId && onCreated(result.contractId)} manualOption={<Button onClick={() => setManual(true)}>{uiText('alpha7.device.withoutDevice')}</Button>} /><ManualNewContractDialog open={open && manual} onOpenChange={change} onCreated={onCreated} /></>;
}

function ManualNewContractDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const src = useAuthoringSource();
  const doc = useWorkingDocument();
  const ids = asArray(src.config?.contracts).filter(isObject).map((c) => str(c.contract_id));
  const [id, setId] = useState('');
  const [type, setType] = useState('');
  const chosen = src.types.find((t) => t.key === type) ?? src.types[0];
  const taken = ids.includes(id.trim());
  const valid = validIdentifier(id.trim()) && !taken && !!chosen;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={uiText("features.contracts.ContractsPage.neue_contract_instanz_a62401")}
      description={uiText("features.contracts.ContractsPage.eine_instanz_bindet_einen_typ_paket_typ_oder_dek_e77e04")}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{uiText("features.contracts.ContractsPage.abbrechen_f7ff11")}</Button>
          <Button
            variant="primary"
            disabled={!valid}
            disabledReason={taken ? uiText('features.contracts.ContractsPage.diese_id_ist_bereits_vergeben_20f34e') : uiText('alpha7.copy.checkIdentifier')}
            onClick={() => {
              if (!chosen) return;
              const contractId = id.trim();
              doc.edit((c) => setAt(c, '/contracts', [...asArray(c.contracts), { contract_id: contractId, type_id: chosen.type_id, type_version: chosen.type_version, enabled: true, inputs: [], parameters: {} }]));
              onOpenChange(false);
              setId('');
              onCreated(contractId);
            }}
          >
            {uiText("features.contracts.ContractsPage.anlegen_d34c0e")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={uiText("features.contracts.ContractsPage.contract_id_f9f7ff")} hint={ID_HINT} errors={taken ? [{ code: 'duplicate_identity', message: uiText("features.contracts.ContractsPage.diese_id_ist_bereits_vergeben_20f34e") }] : id && !validIdentifier(id.trim()) ? [{ code: 'identity_invalid', message: ID_HINT }] : []}>
          {(p) => <Input {...p} autoFocus maxLength={ID_LIMIT} value={id} placeholder={uniqueName(uiText('alpha7.copy.newContractId'), ids)} onChange={(e) => setId(e.target.value)} />}
        </Field>
        <Field label={uiText("features.contracts.ContractsPage.typ_version_1b7183")}>
          {(p) => (
            <Select {...p} value={chosen?.key ?? ''} onChange={(e) => setType(e.target.value)}>
              {src.types.map((t) => (
                <option key={t.key} value={t.key}>{t.type_id} {uiText("features.contracts.ContractsPage.v_0bb917")}{t.type_version} {t.declarative ? uiText("features.contracts.ContractsPage.definition_393327") : uiText("features.contracts.ContractsPage.paket_d2cfa9")}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

export default function ContractsPage() {
  const src = useAuthoringSource();
  const doc = useWorkingDocument();
  const [params, setParams] = useSearchParams();
  const live = useLive();
  const active = useActiveRevision();
  const caps = useCapabilities();
  const ha = useHaCatalog(asArray(src.config?.bindings).filter(isObject).some(binding => isObject(binding.adapter) && String(binding.adapter.kind).startsWith('ha_')));
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const overviewFilter = params.get('filter');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'on' | 'off'>(() => ['active', 'healthy', 'degraded'].includes(overviewFilter ?? '') ? 'on' : overviewFilter === 'off' ? 'off' : 'all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'healthy' | 'degraded' | 'none'>(() => overviewFilter === 'healthy' || overviewFilter === 'degraded' ? overviewFilter : 'all');
  useEffect(() => {
    setEnabledFilter(['active', 'healthy', 'degraded'].includes(overviewFilter ?? '') ? 'on' : overviewFilter === 'off' ? 'off' : 'all');
    setHealthFilter(overviewFilter === 'healthy' || overviewFilter === 'degraded' ? overviewFilter : 'all');
  }, [overviewFilter]);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState('');
  const requested = useRef(false);
  const start = async () => {
    setCreationError('');
    try { await doc.ensureDraft(); setCreating(true); }
    catch (error) { setCreationError(describeError(error)); }
  };
  useEffect(() => {
    if (params.get('new') !== '1') { requested.current = false; return; }
    if (requested.current) return;
    requested.current = true;
    const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true });
    void start();
    // start reads the current provider; the query is consumed exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, setParams]);

  const configured = asArray(src.config?.contracts).filter(isObject);
  const activeContracts = asArray(active.data?.config?.contracts).filter(isObject);
  const activeTypes = typeCatalog(caps.data, active.data?.config);
  const rows: Row[] = configured.map((c) => {
    const id = str(c.contract_id);
    const activeContract = activeContracts.find(item => item.contract_id === id);
    const candidate = live.contracts?.[id];
    const envelope = activeContract && candidate && candidate.registry_revision === active.data?.revision ? candidate : null;
    return {
      id,
      name: str(c.display_name),
      type: str(c.type_id),
      version: Number(c.type_version),
      enabled: c.enabled !== false,
      envelope,
      value: contractValue(envelope, activeContract ? fieldsForContract(activeContract, active.data?.config ?? null, activeTypes) : {}),
      source: contractSources(id, src.config, ha.entities).map(source => source.name).join(', ') || uiText('alpha7.contract.noSource'),
      draftOnly: src.source === 'draft' && active.data !== undefined && !activeContract,
      stale: live.stale || live.registryRevision !== active.data?.revision,
    };
  });
  const typeOptions = [...new Set(rows.map((r) => r.type))].sort();
  const filtered = rows.filter(
    (r) =>
      (!typeFilter || r.type === typeFilter) &&
      (enabledFilter === 'all' || (enabledFilter === 'on') === r.enabled) &&
      (healthFilter === 'all' || (healthFilter === 'none' ? !r.envelope : r.envelope?.contract_health === healthFilter)),
  );

  const columns = [
    col.accessor(row => row.name || row.id, { id: 'name', header: uiText('alpha7.contract.name'), cell: cell => <div className="min-w-0"><Link to={`/contracts/view/${encodeURIComponent(cell.row.original.id)}`} title={cell.row.original.id} className="block truncate font-medium hover:text-fg" onClick={event => event.stopPropagation()}>{cell.getValue()}</Link>{cell.row.original.name && <span title={cell.row.original.id} className="block truncate text-xs text-muted">{cell.row.original.id}</span>}</div> }),
    col.accessor('value', { header: uiText('alpha7.contract.value'), cell: cell => <span className="tabular-nums">{cell.getValue()}</span> }),
    col.accessor(row => row.envelope?.contract_health ?? '', { id: 'state', header: uiText('alpha7.contract.state'), cell: cell => <ContractStateChip envelope={cell.row.original.envelope} enabled={cell.row.original.enabled} draftOnly={cell.row.original.draftOnly} stale={cell.row.original.stale} /> }),
    col.accessor('source', { header: uiText('alpha7.contract.source'), cell: cell => <span className="block truncate" title={cell.getValue()}>{cell.getValue()}</span> }),
  ];

  return (
    <>
      <PageHeader
        title={uiText("features.contracts.ContractsPage.contracts_definitionen_499616")}
        description={uiText("features.contracts.ContractsPage.instanzen_binden_einen_typ_an_quellen_definition_c07fc7")}
        actions={
          <Button variant="primary" disabled={doc.starting} disabledReason={uiText('alpha7.copy.inProgress')} onClick={() => void start()}>
            <Plus size={15} /> {uiText("features.contracts.ContractsPage.neue_instanz_e3e518")}</Button>
        }
      />
      {creationError && <p role="alert" className="mb-3 text-sm text-bad">{creationError}</p>}
      {doc.starting && <p role="status" className="mb-3 text-sm text-muted">{uiText('alpha7.draft.preparing')}</p>}
      <ContractsTabs />
      <ReadOnlyNotice what={uiText("features.contracts.ContractsPage.contract_instanzen_1a0c12")} />
      <PanelLayout view="contracts"><LayoutPanel id="filters" title={uiText("features.contracts.ContractsPage.filter_638e24")}><Panel>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <div className="relative min-w-56 flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <Input aria-label={uiText("features.contracts.ContractsPage.contracts_suchen_453163")} className="pl-8" placeholder={uiText("features.contracts.ContractsPage.suchen_nach_id_name_typ_43b8d8")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <details className="relative"><summary className="cursor-pointer py-2 text-sm text-muted">{uiText('alpha7.contract.advanced')}</summary><Select aria-label={uiText("features.contracts.ContractsPage.typ_1b0241")} className="w-52" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{uiText("features.contracts.ContractsPage.alle_typen_83162a")}</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select></details>
          <Select aria-label={uiText("features.contracts.ContractsPage.aktivierung_90ba1a")} className="w-40" value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value as typeof enabledFilter)}>
            <option value="all">{uiText("features.contracts.ContractsPage.alle_3801a3")}</option>
            <option value="on">{uiText("features.contracts.ContractsPage.aktiviert_acb27b")}</option>
            <option value="off">{uiText("features.contracts.ContractsPage.deaktiviert_10f33e")}</option>
          </Select>
          <Select aria-label={uiText("features.contracts.ContractsPage.gesundheit_1c7f2f")} className="w-44" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value as typeof healthFilter)}>
            <option value="all">{uiText("features.contracts.ContractsPage.jede_gesundheit_b848a7")}</option>
            <option value="healthy">{uiText("features.contracts.ContractsPage.gesund_35c867")}</option>
            <option value="degraded">{uiText("features.contracts.ContractsPage.eingeschrankt_7c77f8")}</option>
            <option value="none">{uiText("features.contracts.ContractsPage.ohne_zustand_f3605b")}</option>
          </Select>
        </div>
      </Panel></LayoutPanel><LayoutPanel id="instances" title={uiText("features.contracts.ContractsPage.contract_instanzen_1a0c12")}><Panel>
        {src.loading && configured.length === 0 ? (
          <Spinner />
        ) : (
          <DataTable
            caption={uiText("features.contracts.ContractsPage.contract_instanzen_1a0c12")}
            data={filtered}
            columns={columns}
            globalFilter={search}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/contracts/view/${encodeURIComponent(r.id)}`)}
            empty={
              <Empty title={rows.length === 0 ? uiText("features.contracts.ContractsPage.noch_keine_contract_instanzen_c7f1ae") : uiText("features.contracts.ContractsPage.keine_treffer_6df7e9")}>
                {rows.length === 0 ? uiText("features.contracts.ContractsPage.legen_sie_in_einem_draft_die_erste_instanz_an_od_1842ad") : uiText("features.contracts.ContractsPage.filter_oder_suche_anpassen_3493b0")}
              </Empty>
            }
          />
        )}
      </Panel>
      </LayoutPanel></PanelLayout>
      {live.stale && live.contracts && <p className="mt-2 text-xs text-warn">{uiText("features.contracts.ContractsPage.live_zustand_moglicherweise_veraltet_57c06a")}{live.connection}).</p>}
      <NewContractDialog open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`/contracts/view/${encodeURIComponent(id)}`)} />
    </>
  );
}

export { typeKey };

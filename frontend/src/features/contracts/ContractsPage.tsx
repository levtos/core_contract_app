import { t as uiText } from '@/i18n';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { ID_HINT, ID_LIMIT, validIdentifier } from '@/lib/identifiers';
import { Empty, PageHeader, Panel, Spinner } from '@/components/ui/layout';
import { ReadOnlyNotice } from '@/features/authoring/DraftBar';
import { useAllIssues } from '@/features/authoring/issues';
import { asArray, str, uniqueName } from '@/features/authoring/model';
import { typeKey } from '@/features/authoring/catalog';
import { useAuthoringSource } from '@/features/authoring/useAuthoringSource';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { QualityBadge } from '@/components/status-parts';
import { setAt, isObject } from '@/lib/json';
import { useLive } from '@/lib/live-context';
import type { Envelope } from '@/lib/types';

export function ContractsTabs() {
  const link = ({ isActive }: { isActive: boolean }) => `rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-raised hover:text-fg'}`;
  return (
    <nav aria-label={uiText("features.contracts.ContractsPage.contracts_und_definitionen_2304b3")} className="mb-5 flex gap-1">
      <NavLink to="/contracts" end className={link}>{uiText("features.contracts.ContractsPage.instanzen_a94c7e")}</NavLink>
      <NavLink to="/definitions" className={link}>{uiText("features.contracts.ContractsPage.definitionen_871a91")}</NavLink>
    </nav>
  );
}

interface Row {
  id: string;
  name: string;
  type: string;
  version: number;
  enabled: boolean;
  envelope: Envelope | null;
  unknownFields: number;
  inputs: number;
  errors: number;
}

const col = createColumnHelper<Row>();

export function NewContractDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
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
          {(p) => <Input {...p} autoFocus maxLength={ID_LIMIT} value={id} placeholder={uniqueName('fixture.neu', ids)} onChange={(e) => setId(e.target.value)} />}
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
  const live = useLive();
  const issues = useAllIssues();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'on' | 'off'>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'healthy' | 'degraded' | 'none'>('all');
  const [creating, setCreating] = useState(false);

  const configured = asArray(src.config?.contracts).filter(isObject);
  const rows: Row[] = configured.map((c, index) => {
    const id = str(c.contract_id);
    const envelope = live.contracts?.[id] ?? null;
    return {
      id,
      name: str(c.display_name),
      type: str(c.type_id),
      version: Number(c.type_version),
      enabled: c.enabled !== false,
      envelope,
      unknownFields: envelope ? Object.values(envelope.fields).filter((f) => f.status === 'unknown' || f.status === 'unresolved').length : 0,
      inputs: asArray(c.inputs).length,
      errors: issues.filter((i) => i.path.startsWith(`/contracts/${index}`)).length,
    };
  });
  const typeOptions = [...new Set(rows.map((r) => r.type))].sort();
  const filtered = rows.filter(
    (r) =>
      (!typeFilter || r.type === typeFilter) &&
      (enabledFilter === 'all' || (enabledFilter === 'on') === r.enabled) &&
      (healthFilter === 'all' || (healthFilter === 'none' ? !r.envelope : r.envelope?.contract_health === healthFilter)),
  );

  const columns = useMemo(
    () => [
      col.accessor('id', { header: uiText("features.contracts.ContractsPage.contract_a6f5b0"), cell: (c) => <Link to={`/contracts/${encodeURIComponent(c.getValue())}`} className="font-mono text-xs text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{c.getValue()}</Link> }),
      col.accessor('name', { header: uiText("features.contracts.ContractsPage.name_dcd1d5"), cell: (c) => c.getValue() || <span className="text-faint">—</span> }),
      col.accessor((r) => `${r.type}@${r.version}`, { id: 'type', header: uiText("features.contracts.ContractsPage.typ_1b0241"), cell: (c) => <code className="text-xs text-muted">{c.getValue()}</code> }),
      col.accessor('enabled', { header: uiText("features.contracts.ContractsPage.status_920e41"), cell: (c) => (c.getValue() ? <Badge tone="accent">{uiText("features.contracts.ContractsPage.aktiviert_acb27b")}</Badge> : <Badge>{uiText("features.contracts.ContractsPage.deaktiviert_10f33e")}</Badge>) }),
      col.accessor((r) => r.envelope?.contract_health ?? '', {
        id: 'health',
        header: uiText("features.contracts.ContractsPage.gesundheit_1c7f2f"),
        cell: (c) => (c.row.original.envelope ? <QualityBadge quality={c.row.original.envelope.contract_health} /> : <span className="text-xs text-faint">{c.row.original.enabled ? uiText("features.contracts.ContractsPage.kein_zustand_4125d1") : '—'}</span>),
      }),
      col.accessor((r) => (r.envelope ? (r.envelope.available ? 1 : 0) : -1), {
        id: 'available',
        header: uiText("features.contracts.ContractsPage.verfugbar_3aa552"),
        cell: (c) => (c.row.original.envelope ? <Badge tone={c.row.original.envelope.available ? 'ok' : 'warn'}>{c.row.original.envelope.available ? uiText("features.contracts.ContractsPage.ja_3702fc") : uiText("features.contracts.ContractsPage.nein_4d03db")}</Badge> : <span className="text-xs text-faint">—</span>),
      }),
      col.accessor('unknownFields', { header: uiText("features.contracts.ContractsPage.offene_felder_61473d"), cell: (c) => (c.getValue() ? <Badge tone="warn">{c.getValue()} {uiText("features.contracts.ContractsPage.unbekannt_a418e6")}</Badge> : <span className="text-xs text-faint">0</span>) }),
      col.accessor('inputs', { header: uiText("features.contracts.ContractsPage.eingange_53fb39") }),
      col.accessor('errors', { header: uiText("features.contracts.ContractsPage.fehler_f6cc01"), cell: (c) => (c.getValue() ? <Badge tone="bad">{c.getValue()}</Badge> : null) }),
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title={uiText("features.contracts.ContractsPage.contracts_definitionen_499616")}
        description={uiText("features.contracts.ContractsPage.instanzen_binden_einen_typ_an_quellen_definition_c07fc7")}
        actions={
          <Button variant="primary" disabled={!src.editable} onClick={() => setCreating(true)} title={src.editable ? undefined : uiText("features.contracts.ContractsPage.zuerst_einen_arbeits_draft_offnen_2a193a")}>
            <Plus size={15} /> {uiText("features.contracts.ContractsPage.neue_instanz_e3e518")}</Button>
        }
      />
      <ContractsTabs />
      <ReadOnlyNotice what={uiText("features.contracts.ContractsPage.contract_instanzen_1a0c12")} />
      <PanelLayout view="contracts"><LayoutPanel id="filters" title={uiText("features.contracts.ContractsPage.filter_638e24")}><Panel>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <div className="relative min-w-56 flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <Input aria-label={uiText("features.contracts.ContractsPage.contracts_suchen_453163")} className="pl-8" placeholder={uiText("features.contracts.ContractsPage.suchen_nach_id_name_typ_43b8d8")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label={uiText("features.contracts.ContractsPage.typ_1b0241")} className="w-52" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{uiText("features.contracts.ContractsPage.alle_typen_83162a")}</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
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
            onRowClick={(r) => navigate(`/contracts/${encodeURIComponent(r.id)}`)}
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
      <NewContractDialog open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`/contracts/${encodeURIComponent(id)}`)} />
    </>
  );
}

export { typeKey };

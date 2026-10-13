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
    <nav aria-label="Contracts und Definitionen" className="mb-5 flex gap-1">
      <NavLink to="/contracts" end className={link}>Instanzen</NavLink>
      <NavLink to="/definitions" className={link}>Definitionen</NavLink>
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
  const valid = /^[a-zA-Z][a-zA-Z0-9_.-]+$/.test(id.trim()) && !taken && !!chosen;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Neue Contract-Instanz"
      description="Eine Instanz bindet einen Typ (Paket-Typ oder deklarative Definition) an Quellen oder andere Contracts. Eingänge und Parameter werden danach im Editor festgelegt."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
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
            Anlegen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Contract-ID" hint="Buchstabe zuerst; Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich." errors={taken ? [{ code: 'duplicate_identity', message: 'Diese ID ist bereits vergeben.' }] : []}>
          {(p) => <Input {...p} autoFocus value={id} placeholder={uniqueName('fixture.neu', ids)} onChange={(e) => setId(e.target.value)} />}
        </Field>
        <Field label="Typ & Version">
          {(p) => (
            <Select {...p} value={chosen?.key ?? ''} onChange={(e) => setType(e.target.value)}>
              {src.types.map((t) => (
                <option key={t.key} value={t.key}>{t.type_id} · v{t.type_version} {t.declarative ? '(Definition)' : '(Paket)'}</option>
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
      col.accessor('id', { header: 'Contract', cell: (c) => <Link to={`/contracts/${encodeURIComponent(c.getValue())}`} className="font-mono text-xs text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{c.getValue()}</Link> }),
      col.accessor('name', { header: 'Name', cell: (c) => c.getValue() || <span className="text-faint">—</span> }),
      col.accessor((r) => `${r.type}@${r.version}`, { id: 'type', header: 'Typ', cell: (c) => <code className="text-xs text-muted">{c.getValue()}</code> }),
      col.accessor('enabled', { header: 'Status', cell: (c) => (c.getValue() ? <Badge tone="accent">aktiviert</Badge> : <Badge>deaktiviert</Badge>) }),
      col.accessor((r) => r.envelope?.contract_health ?? '', {
        id: 'health',
        header: 'Gesundheit',
        cell: (c) => (c.row.original.envelope ? <QualityBadge quality={c.row.original.envelope.contract_health} /> : <span className="text-xs text-faint">{c.row.original.enabled ? 'kein Zustand' : '—'}</span>),
      }),
      col.accessor((r) => (r.envelope ? (r.envelope.available ? 1 : 0) : -1), {
        id: 'available',
        header: 'Verfügbar',
        cell: (c) => (c.row.original.envelope ? <Badge tone={c.row.original.envelope.available ? 'ok' : 'warn'}>{c.row.original.envelope.available ? 'ja' : 'nein'}</Badge> : <span className="text-xs text-faint">—</span>),
      }),
      col.accessor('unknownFields', { header: 'Offene Felder', cell: (c) => (c.getValue() ? <Badge tone="warn">{c.getValue()} unbekannt</Badge> : <span className="text-xs text-faint">0</span>) }),
      col.accessor('inputs', { header: 'Eingänge' }),
      col.accessor('errors', { header: 'Fehler', cell: (c) => (c.getValue() ? <Badge tone="bad">{c.getValue()}</Badge> : null) }),
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Contracts & Definitionen"
        description="Instanzen binden einen Typ an Quellen; Definitionen beschreiben deklarative Typen und ihre unveränderlichen Versionen."
        actions={
          <Button variant="primary" disabled={!src.editable} onClick={() => setCreating(true)} title={src.editable ? undefined : 'Zuerst einen Arbeits-Draft öffnen'}>
            <Plus size={15} /> Neue Instanz
          </Button>
        }
      />
      <ContractsTabs />
      <ReadOnlyNotice what="Contract-Instanzen" />
      <PanelLayout view="contracts"><LayoutPanel id="filters" title="Filter"><Panel>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <div className="relative min-w-56 flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <Input aria-label="Contracts suchen" className="pl-8" placeholder="Suchen nach ID, Name, Typ …" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Typ" className="w-52" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Alle Typen</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Select aria-label="Aktivierung" className="w-40" value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value as typeof enabledFilter)}>
            <option value="all">Alle</option>
            <option value="on">aktiviert</option>
            <option value="off">deaktiviert</option>
          </Select>
          <Select aria-label="Gesundheit" className="w-44" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value as typeof healthFilter)}>
            <option value="all">Jede Gesundheit</option>
            <option value="healthy">gesund</option>
            <option value="degraded">eingeschränkt</option>
            <option value="none">ohne Zustand</option>
          </Select>
        </div>
      </Panel></LayoutPanel><LayoutPanel id="instances" title="Contract-Instanzen"><Panel>
        {src.loading && configured.length === 0 ? (
          <Spinner />
        ) : (
          <DataTable
            caption="Contract-Instanzen"
            data={filtered}
            columns={columns}
            globalFilter={search}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/contracts/${encodeURIComponent(r.id)}`)}
            empty={
              <Empty title={rows.length === 0 ? 'Noch keine Contract-Instanzen' : 'Keine Treffer'}>
                {rows.length === 0 ? 'Legen Sie in einem Draft die erste Instanz an oder importieren Sie eine Registry im Registry Studio.' : 'Filter oder Suche anpassen.'}
              </Empty>
            }
          />
        )}
      </Panel>
      </LayoutPanel></PanelLayout>
      {live.stale && live.contracts && <p className="mt-2 text-xs text-warn">Live-Zustand möglicherweise veraltet ({live.connection}).</p>}
      <NewContractDialog open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`/contracts/${encodeURIComponent(id)}`)} />
    </>
  );
}

export { typeKey };

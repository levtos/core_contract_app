import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Empty, PageHeader, Panel, PanelHeader } from '@/components/ui/layout';
import { LockBadge } from '@/editors/DefinitionEditor';
import { ReadOnlyNotice } from '@/features/authoring/DraftBar';
import { useAllIssues } from '@/features/authoring/issues';
import { asArray, asObject, definitionKey, newDefinition, str } from '@/features/authoring/model';
import { contractsUsingDefinition } from '@/features/authoring/usage';
import { useAuthoringSource } from '@/features/authoring/useAuthoringSource';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { isObject } from '@/lib/json';
import { useCapabilities } from '@/lib/queries';
import { ContractsTabs } from './ContractsPage';

interface Row {
  key: string;
  typeId: string;
  version: number;
  name: string;
  inputs: number;
  outputs: number;
  machine: boolean;
  usedBy: number;
  lockedSince: number | null;
  errors: number;
}
const col = createColumnHelper<Row>();

export default function DefinitionsPage() {
  const src = useAuthoringSource();
  const doc = useWorkingDocument();
  const caps = useCapabilities();
  const issues = useAllIssues();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [typeId, setTypeId] = useState('test.');

  const definitions = asArray(src.config?.definitions).filter(isObject);
  const rows: Row[] = definitions.map((d, index) => ({
    key: definitionKey(d),
    typeId: str(d.type_id),
    version: Number(d.type_version),
    name: str(d.display_name),
    inputs: asArray(d.inputs).length,
    outputs: Object.keys(asObject(asObject(d.schema).fields)).length,
    machine: isObject(d.machine),
    usedBy: contractsUsingDefinition(src.config, str(d.type_id), Number(d.type_version)).length,
    lockedSince: src.activatedVersions.get(definitionKey(d)) ?? null,
    errors: issues.filter((i) => i.path.startsWith(`/definitions/${index}`)).length,
  }));
  const packageTypes = (caps.data?.types ?? []).filter((t) => t.definition === undefined);

  const columns = useMemo(
    () => [
      col.accessor('typeId', { header: 'Typ-ID', cell: (c) => <code className="text-xs text-accent">{c.getValue()}</code> }),
      col.accessor('version', { header: 'Version', cell: (c) => <Badge tone="neutral">v{c.getValue()}</Badge> }),
      col.accessor('name', { header: 'Name', cell: (c) => c.getValue() || <span className="text-faint">—</span> }),
      col.accessor('inputs', { header: 'Eingänge' }),
      col.accessor('outputs', { header: 'Ausgaben' }),
      col.accessor('machine', { header: 'Machine', cell: (c) => (c.getValue() ? <Badge tone="accent">ja</Badge> : <span className="text-faint">–</span>) }),
      col.accessor('usedBy', { header: 'Instanzen' }),
      col.accessor((r) => r.lockedSince ?? 0, { id: 'status', header: 'Status', cell: (c) => (c.row.original.lockedSince !== null ? <span className="flex items-center gap-1.5"><LockBadge /><span className="text-[11px] text-faint">seit Rev. {c.row.original.lockedSince}</span></span> : <Badge tone="warn">Entwurf</Badge>) }),
      col.accessor('errors', { header: 'Fehler', cell: (c) => (c.getValue() ? <Badge tone="bad">{c.getValue()}</Badge> : null) }),
    ],
    [],
  );

  const exists = definitions.some((d) => str(d.type_id) === typeId.trim());
  const validId = /^test\.[a-zA-Z0-9_.-]+$/.test(typeId.trim());

  return (
    <>
      <PageHeader
        title="Contracts & Definitionen"
        description="Definitionen sind deklarative Typen mit unveränderlichen Versionen. Instanzen (anderer Reiter) wählen Typ und Version."
        actions={
          <Button variant="primary" disabled={!src.editable} onClick={() => setCreating(true)} title={src.editable ? undefined : 'Zuerst einen Arbeits-Draft öffnen'}>
            <Plus size={15} /> Neue Definition
          </Button>
        }
      />
      <ContractsTabs />
      <ReadOnlyNotice what="Definitionen" />
      <Panel>
        <PanelHeader title="Deklarative Definitionen" description="Aktivierte Versionen sind gesperrt; eine Logikänderung erfordert eine neue Version." />
        <DataTable
          caption="Deklarative Definitionen"
          data={rows}
          columns={columns}
          getRowId={(r) => r.key}
          onRowClick={(r) => navigate(`/definitions/${encodeURIComponent(r.typeId)}/${r.version}`)}
          empty={<Empty title="Noch keine Definitionen">Legen Sie in einem Draft die erste deklarative Definition an – ohne JSON, direkt im Editor.</Empty>}
        />
      </Panel>
      <Panel className="mt-5">
        <PanelHeader title="Paket-Typen" description="Fest im Code der App; nicht über die Workbench änderbar, aber als Typ für Instanzen verwendbar." />
        <ul className="divide-y divide-line">
          {packageTypes.map((t) => (
            <li key={`${t.type_id}@${t.type_version}`} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <code className="text-xs">{t.type_id}</code>
              <Badge>v{t.type_version}</Badge>
              <span className="text-xs text-muted">{t.producer} · {Object.keys(t.schema.fields).length} Felder</span>
            </li>
          ))}
          {packageTypes.length === 0 && <li className="px-4 py-3 text-sm text-muted">Keine Paket-Typen gemeldet.</li>}
        </ul>
      </Panel>
      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="Neue Definition"
        description="Beginnt mit einem Eingang und einem Ausgabefeld. Alles Weitere – Eingänge, Regeln, Fusion, Temporal, State Machine – wird im Editor ergänzt."
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Abbrechen</Button>
            <Button
              variant="primary"
              disabled={!validId || exists}
              onClick={() => {
                const id = typeId.trim();
                // Declarative definitions require fingerprint_version 2 (explicit in the document).
                doc.edit((c) => ({ ...c, fingerprint_version: 2, definitions: [...asArray(c.definitions), newDefinition(id, 1)] }));
                setCreating(false);
                navigate(`/definitions/${encodeURIComponent(id)}/1`);
              }}
            >
              Anlegen
            </Button>
          </>
        }
      >
        <Field label="Typ-ID" hint="Synthetischer Namensraum test.* — z. B. test.licht_logik" errors={exists ? [{ code: 'duplicate_identity', message: 'Diese Typ-ID existiert bereits. Für Änderungen eine neue Version anlegen.' }] : !validId ? [{ code: 'schema.pattern', message: 'Muss mit „test.“ beginnen; erlaubt sind Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich.' }] : []}>
          {(p) => <Input {...p} autoFocus value={typeId} onChange={(e) => setTypeId(e.target.value)} />}
        </Field>
      </Dialog>
    </>
  );
}

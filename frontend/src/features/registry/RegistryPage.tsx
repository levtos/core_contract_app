import { Copy, Download, FilePlus2, FolderOpen, GitCompare, History, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/controls';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Empty, KeyValue, Notice, PageHeader, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { CreateDraftDialog } from '@/features/authoring/CreateDraftDialog';
import { draftLabel } from '@/features/authoring/DraftBar';
import { downloadText, exportRegistry, safeFilename } from '@/features/authoring/importExport';
import { changedPaths } from '@/features/authoring/locate';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { describeError } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { canonicalJson } from '@/lib/json';
import { useActiveRevision, useDraftMutations, useDrafts, useHistory, useRevisions } from '@/lib/queries';
import type { Draft, RevisionRow } from '@/lib/types';
import { RollbackDialog } from './ActivationDialogs';

function DraftsTab() {
  const drafts = useDrafts();
  const doc = useWorkingDocument();
  const { remove } = useDraftMutations();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [copyOf, setCopyOf] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Draft | null>(null);
  const [opening, setOpening] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const list = drafts.data ?? [];

  const open = (draft: Draft) => (doc.dirty && doc.draft?.draft_id !== draft.draft_id ? setOpening(draft) : (doc.open(draft), navigate(`/registry/drafts/${encodeURIComponent(draft.draft_id)}`)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{list.length} von 100 Drafts. Drafts sind niemals live; sie dürfen unvollständig sein.</p>
        <Button variant="primary" onClick={() => setCreating(true)}><FilePlus2 size={15} /> Neuer Draft</Button>
      </div>
      {error && <Notice tone="bad" title="Aktion fehlgeschlagen">{error}</Notice>}
      <Panel>
        {drafts.isPending ? (
          <Spinner />
        ) : list.length === 0 ? (
          <Empty title="Noch keine Drafts" action={<Button variant="primary" onClick={() => setCreating(true)}>Ersten Draft anlegen</Button>}>
            Legen Sie einen leeren Draft an, kopieren Sie die aktive Registry oder importieren Sie eine JSON-Datei.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((draft) => (
              <li key={draft.draft_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <Link className="truncate hover:text-accent" to={`/registry/drafts/${encodeURIComponent(draft.draft_id)}`}>{draftLabel(draft)}</Link>
                    {doc.draft?.draft_id === draft.draft_id && <Badge tone="accent">{doc.dirty ? 'geöffnet · ungespeichert' : 'geöffnet'}</Badge>}
                  </p>
                  <p className="mono truncate text-[11px] text-faint">{draft.draft_id}</p>
                  <p className="text-xs text-muted">v{draft.draft_version} · Basis Revision {draft.base_revision ?? '–'} · erstellt {formatTime(draft.created_at)} · geändert {formatTime(draft.updated_at)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" onClick={() => open(draft)}><Pencil size={13} /> Bearbeiten</Button>
                  <Button size="sm" onClick={() => setCopyOf(draft)}><Copy size={13} /> Duplizieren</Button>
                  <Button size="sm" onClick={() => downloadText(`${safeFilename(draftLabel(draft))}.json`, exportRegistry(draft.config))}><Download size={13} /> Export</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(draft)}><Trash2 size={13} /> Löschen</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <CreateDraftDialog open={creating} onOpenChange={setCreating} onCreated={(d) => navigate(`/registry/drafts/${encodeURIComponent(d.draft_id)}`)} />
      {copyOf && <CreateDraftDialog open onOpenChange={(o) => !o && setCopyOf(null)} copyOf={{ config: copyOf.config, name: draftLabel(copyOf) }} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Draft löschen?"
        description={<>„{deleting ? draftLabel(deleting) : ''}“ wird endgültig gelöscht (Version v{deleting?.draft_version}). Die aktive Registry bleibt unberührt.</>}
        confirmLabel="Endgültig löschen"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          setError('');
          remove.mutate(target, {
            onSuccess: () => {
              if (doc.draft?.draft_id === target.draft_id) doc.close();
              setDeleting(null);
            },
            onError: (e) => {
              setError(describeError(e));
              setDeleting(null);
            },
          });
        }}
      />
      <ConfirmDialog
        open={opening !== null}
        onOpenChange={(o) => !o && setOpening(null)}
        title="Ungespeicherte Änderungen verwerfen?"
        description="Der aktuell geöffnete Draft hat ungespeicherte Änderungen."
        confirmLabel="Verwerfen und wechseln"
        tone="danger"
        onConfirm={() => {
          if (opening) {
            doc.open(opening);
            navigate(`/registry/drafts/${encodeURIComponent(opening.draft_id)}`);
          }
          setOpening(null);
        }}
      />
    </div>
  );
}

function RevisionsTab() {
  const revisions = useRevisions();
  const active = useActiveRevision();
  const activations = useHistory('activations', { limit: 200 });
  const [viewing, setViewing] = useState<RevisionRow | null>(null);
  const [rolling, setRolling] = useState<RevisionRow | null>(null);
  const [copyOf, setCopyOf] = useState<RevisionRow | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);
  const navigate = useNavigate();
  const operations = useMemo(() => new Map((activations.data?.pages.flatMap((p) => p.items) ?? []).map((a) => [Number(a.revision), String(a.operation)])), [activations.data]);
  const rows = [...(revisions.data ?? [])].sort((a, b) => b.revision - a.revision);
  const pair = selected.length === 2 ? selected.map((n) => rows.find((r) => r.revision === n)!).sort((a, b) => a.revision - b.revision) : null;

  if (revisions.isPending) return <Spinner />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Revisionen sind unveränderlich. Aktivierung und Rollback erzeugen immer eine neue Revision.</p>
        <Button disabled={selected.length !== 2} onClick={() => setComparing(true)}><GitCompare size={14} /> Zwei Revisionen vergleichen ({selected.length}/2)</Button>
      </div>
      <Panel>
        {rows.length === 0 ? (
          <Empty title="Noch keine Revision">Es wurde noch nie eine Registry aktiviert.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const isActive = active.data?.revision === row.revision;
              const op = operations.get(row.revision);
              return (
                <li key={row.revision} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <input type="checkbox" aria-label={`Revision ${row.revision} zum Vergleich wählen`} className="size-4 accent-[var(--color-accent)]" checked={selected.includes(row.revision)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, row.revision].slice(-2) : s.filter((n) => n !== row.revision)))} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      Revision {row.revision}
                      {isActive && <Badge tone="ok">aktiv</Badge>}
                      {op && <Badge tone={op === 'rollback' ? 'warn' : 'neutral'}>{op === 'rollback' ? 'Rollback' : 'Aktivierung'}</Badge>}
                    </p>
                    <p className="mono text-[11px] text-faint">{row.checksum.slice(0, 20)}…</p>
                    <p className="text-xs text-muted">{formatTime(row.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => setViewing(row)}><History size={13} /> Ansehen</Button>
                    <Button size="sm" onClick={() => downloadText(`registry-rev-${row.revision}.json`, exportRegistry(row.config))}><Download size={13} /> Export</Button>
                    <Button size="sm" onClick={() => setCopyOf(row)}><FolderOpen size={13} /> Als Draft</Button>
                    <Button size="sm" variant="danger" disabled={isActive} onClick={() => setRolling(row)}><RotateCcw size={13} /> Zurückrollen</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)} size="xl" title={`Revision ${viewing.revision}`} description={`Prüfsumme ${viewing.checksum}`}>
          <pre className="max-h-[60vh] overflow-auto rounded-[var(--radius-md)] bg-sunken p-3 text-xs">{canonicalJson(viewing.config)}</pre>
        </Dialog>
      )}
      {rolling && <RollbackDialog revision={rolling} open onOpenChange={(o) => !o && setRolling(null)} />}
      {copyOf && <CreateDraftDialog open onOpenChange={(o) => !o && setCopyOf(null)} copyOf={{ config: copyOf.config, name: `Revision ${copyOf.revision}` }} onCreated={(d) => navigate(`/registry/drafts/${encodeURIComponent(d.draft_id)}`)} />}
      {comparing && pair && (
        <Dialog open onOpenChange={(o) => !o && setComparing(false)} size="lg" title={`Revision ${pair[0]!.revision} ↔ ${pair[1]!.revision}`} description="Strukturelle Differenz der Konfigurationsdokumente (nur geänderte JSON-Pfade). Die semantische Auswirkungsanalyse liefert der Server beim Aktivieren oder Zurückrollen.">
          {(() => {
            const paths = changedPaths(pair[0]!.config, pair[1]!.config);
            return paths.length === 0 ? (
              <Notice tone="info" title="Inhaltlich identisch" />
            ) : (
              <ul className="mono max-h-[55vh] overflow-auto text-xs">
                {paths.map((p) => <li key={p} className="border-b border-line/60 py-1">{p}</li>)}
              </ul>
            );
          })()}
        </Dialog>
      )}
    </div>
  );
}

export default function RegistryPage() {
  const active = useActiveRevision();
  return (
    <>
      <PageHeader title="Registry Studio" description="Drafts bearbeiten, validieren, vergleichen und ausdrücklich aktivieren; Revisionen einsehen und kontrolliert zurückrollen." />
      <Panel className="mb-5">
        <PanelHeader
          title="Aktive Registry"
          aside={active.data && <a className="text-xs text-accent hover:underline" href="./api/v1/registry/active/export" download="registry.json">Aktive Konfiguration exportieren</a>}
        />
        <div className="p-4">
          {active.isPending ? <Spinner /> : active.data ? (
            <KeyValue items={[{ label: 'Revision', value: active.data.revision }, { label: 'Prüfsumme', value: <code>{active.data.checksum.slice(0, 24)}…</code> }, { label: 'Aktiviert', value: formatTime(active.data.created_at) }]} />
          ) : (
            <Notice tone="info" title="Noch keine Registry aktiv">Das ist ein gültiger Anfangszustand. Legen Sie einen Draft an, prüfen Sie ihn und aktivieren Sie ihn ausdrücklich.</Notice>
          )}
        </div>
      </Panel>
      <Tabs
        items={[
          { value: 'drafts', label: 'Drafts', content: <DraftsTab /> },
          { value: 'revisions', label: 'Revisionen', content: <RevisionsTab /> },
        ]}
      />
    </>
  );
}

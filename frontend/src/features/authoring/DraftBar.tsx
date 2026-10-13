import { CheckCircle2, CircleAlert, FileEdit, Loader2, Redo2, Save, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/controls';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Notice, Spinner } from '@/components/ui/layout';
import { formatTime } from '@/lib/format';
import { canonicalJson } from '@/lib/json';
import { useDrafts } from '@/lib/queries';
import type { Draft } from '@/lib/types';
import { CreateDraftDialog } from './CreateDraftDialog';
import { useWorkingDocument } from './WorkingDocument';

export const draftLabel = (draft: Pick<Draft, 'draft_id' | 'display_name'>): string => draft.display_name || draft.draft_id;

/** Choose (or create) the working draft. Opening another draft with unsaved edits asks first. */
export function DraftPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const doc = useWorkingDocument();
  const drafts = useDrafts();
  const [creating, setCreating] = useState(false);
  const pick = (draft: Draft) => {
    // Re-selecting the open draft is a no-op; another draft asks first if edits would be lost.
    doc.requestOpen(draft);
    onOpenChange(false);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title="Arbeits-Draft wählen" description="Authoring-Bereiche bearbeiten immer genau einen Draft. Drafts sind nie live." footer={<Button variant="primary" onClick={() => setCreating(true)}>Neuer Draft …</Button>}>
        {drafts.isPending ? (
          <Spinner />
        ) : (drafts.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Noch keine Drafts vorhanden.</p>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
            {drafts.data!.map((draft) => (
              <li key={draft.draft_id}>
                <button type="button" className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-raised" onClick={() => pick(draft)}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{draftLabel(draft)}</span>
                    <span className="block text-xs text-muted">v{draft.draft_version} · Basis-Revision {draft.base_revision ?? '–'} · {formatTime(draft.updated_at)}</span>
                  </span>
                  {doc.draft?.draft_id === draft.draft_id && <Badge tone="accent">{doc.dirty ? 'geöffnet · ungespeichert' : 'geöffnet'}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <CreateDraftDialog open={creating} onOpenChange={setCreating} onCreated={() => onOpenChange(false)} />
    </>
  );
}

/** Asks before unsaved changes of the open draft are dropped by opening another one. */
export function SwitchDialog() {
  const doc = useWorkingDocument();
  const target = doc.switchRequest;
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(o) => !o && doc.cancelSwitch()}
      title="Ungespeicherte Änderungen verwerfen?"
      description={<>„{doc.draft ? draftLabel({ draft_id: doc.draft.draft_id, display_name: doc.displayName }) : ''}“ hat ungespeicherte Änderungen. Beim Wechsel zu „{target ? draftLabel(target) : ''}“ gehen sie samt Rückgängig-Verlauf verloren.</>}
      confirmLabel="Verwerfen und wechseln"
      tone="danger"
      onConfirm={doc.confirmSwitch}
    />
  );
}

/** Version conflict (OCC): never overwrites silently; the user picks explicitly. */
export function ConflictDialog() {
  const doc = useWorkingDocument();
  const conflict = doc.conflict;
  const [busy, setBusy] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  useEffect(() => setConfirmOverwrite(false), [conflict]);
  if (!conflict) return null;
  const same = canonicalJson(conflict.server.config) === canonicalJson(doc.config);
  const run = async (choice: Parameters<typeof doc.resolveConflict>[0]) => {
    setBusy(true);
    try {
      await doc.resolveConflict(choice);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && void run('cancel')}
      title="Versionskonflikt beim Speichern"
      description={`Der Draft wurde seit dem Laden verändert (Server: v${conflict.server.draft_version}, lokal: v${doc.draft?.draft_version}). Nichts wurde überschrieben.`}
      footer={
        <>
          <Button disabled={busy} onClick={() => run('cancel')}>Abbrechen</Button>
          <Button disabled={busy} onClick={() => run('keep-local-as-new')}>Meine Änderungen als neuen Draft sichern</Button>
          <Button disabled={busy} onClick={() => run('take-server')}>Server-Stand übernehmen</Button>
          <Button variant="danger" disabled={busy} onClick={() => (confirmOverwrite ? void run('overwrite') : setConfirmOverwrite(true))}>
            {confirmOverwrite ? 'Wirklich überschreiben' : 'Server-Stand überschreiben …'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {same ? <Notice tone="info">Beide Stände sind inhaltlich gleich; ein Übernehmen verliert nichts.</Notice> : <Notice tone="warn" title="Die Stände unterscheiden sich">„Server-Stand übernehmen“ verwirft Ihre lokalen Änderungen. „Als neuen Draft sichern“ bewahrt sie getrennt auf. Überschreiben ersetzt die Änderungen der anderen Sitzung.</Notice>}
        {confirmOverwrite && <Notice tone="bad" title="Überschreiben bestätigen">Die zwischenzeitlichen Änderungen am Server-Draft gehen verloren. Zum Fortfahren erneut klicken.</Notice>}
      </div>
    </Dialog>
  );
}

export function ValidationChip() {
  const { validation, autoValidate } = useWorkingDocument();
  if (validation.state === 'checking') return <Badge tone="neutral"><Loader2 size={11} className="animate-spin" /> prüft …</Badge>;
  if (validation.state === 'failed') return <Tip label={validation.error ?? 'Validierung nicht möglich'}><span tabIndex={0}><Badge tone="warn"><CircleAlert size={11} /> Prüfung nicht möglich</Badge></span></Tip>;
  if (validation.state === 'idle') return <Badge tone="neutral">{autoValidate ? 'wird geprüft' : 'ungeprüft'}</Badge>;
  const count = validation.issues.length;
  if (count > 0) return <Badge tone="bad"><CircleAlert size={11} /> {count} {count === 1 ? 'Fehler' : 'Fehler'}{validation.stale ? ' (veraltet)' : ''}</Badge>;
  return <Badge tone={validation.stale ? 'neutral' : 'ok'}><CheckCircle2 size={11} /> gültig{validation.stale ? ' (veraltet)' : ''}</Badge>;
}

export function DraftBar() {
  const doc = useWorkingDocument();
  const [picker, setPicker] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && doc.draft) {
        event.preventDefault();
        if (doc.dirty && !doc.saving) void doc.save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc]);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Arbeits-Draft">
      {doc.draft ? (
        <>
          <Link to={`/registry/drafts/${encodeURIComponent(doc.draft.draft_id)}`} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-strong bg-raised px-2.5 py-1 text-xs hover:border-accent/60">
            <FileEdit size={13} className="text-accent" />
            <span className="max-w-40 truncate font-medium">{draftLabel(doc.draft)}</span>
            <span className="text-faint">v{doc.draft.draft_version}</span>
          </Link>
          {doc.dirty ? <Badge tone="warn">ungespeichert</Badge> : <Badge tone="neutral">gespeichert</Badge>}
          <ValidationChip />
          <Tip label="Rückgängig"><Button variant="ghost" size="icon" aria-label="Rückgängig" disabled={!doc.canUndo} onClick={doc.undo}><Undo2 size={15} /></Button></Tip>
          <Tip label="Wiederholen"><Button variant="ghost" size="icon" aria-label="Wiederholen" disabled={!doc.canRedo} onClick={doc.redo}><Redo2 size={15} /></Button></Tip>
          <Button size="sm" variant="primary" disabled={!doc.dirty || doc.saving} onClick={() => void doc.save()} title="Strg+S">
            {doc.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Speichern
          </Button>
          <Button size="sm" onClick={() => void doc.validateNow()} disabled={doc.validation.state === 'checking'}>Prüfen</Button>
          <Tip label="Draft schließen"><Button variant="ghost" size="icon" aria-label="Draft schließen" onClick={() => (doc.dirty ? setClosing(true) : doc.close())}><X size={15} /></Button></Tip>
        </>
      ) : (
        <Button size="sm" onClick={() => setPicker(true)}><FileEdit size={13} /> Arbeits-Draft wählen</Button>
      )}
      <DraftPicker open={picker} onOpenChange={setPicker} />
      <ConflictDialog />
      <SwitchDialog />
      <ConfirmDialog open={closing} onOpenChange={setClosing} title="Draft schließen?" description="Es gibt ungespeicherte Änderungen. Sie gehen verloren." confirmLabel="Verwerfen und schließen" tone="danger" onConfirm={() => { setClosing(false); doc.close(); }} />
      {doc.saveError && <span role="alert" className="text-xs text-bad">{doc.saveError}</span>}
    </div>
  );
}

/** Shown above authoring pages that currently display the (read-only) active registry. */
export function ReadOnlyNotice({ what }: { what: string }) {
  const doc = useWorkingDocument();
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  if (doc.config) return null;
  return (
    <>
      <Notice tone="info" title={`${what}: schreibgeschützte Ansicht der aktiven Registry`} className="mb-4">
        <p>Zum Bearbeiten einen Arbeits-Draft öffnen. Drafts sind nie live; erst die Aktivierung im Registry Studio ändert den aktiven Zustand.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>Neuen Draft anlegen</Button>
          <Button size="sm" onClick={() => setPicker(true)}>Bestehenden Draft wählen</Button>
        </div>
      </Notice>
      <DraftPicker open={picker} onOpenChange={setPicker} />
      <CreateDraftDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

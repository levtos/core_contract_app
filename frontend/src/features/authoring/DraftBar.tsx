import { t as uiText } from '@/i18n';
import { CheckCircle2, CircleAlert, FileEdit, Loader2, Redo2, Save, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
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
      <Dialog open={open} onOpenChange={onOpenChange} title={uiText("features.authoring.DraftBar.arbeits_draft_wahlen_d0f546")} description={uiText("features.authoring.DraftBar.authoring_bereiche_bearbeiten_immer_genau_einen__3bfed3")} footer={<Button variant="primary" disabled={(drafts.data?.length ?? 0) >= 100} onClick={() => setCreating(true)}>{uiText("features.authoring.DraftBar.neuer_draft_1d7ef0")}</Button>}>
        {drafts.isPending ? (
          <Spinner />
        ) : (drafts.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{uiText("features.authoring.DraftBar.noch_keine_drafts_vorhanden_8f793b")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
            {drafts.data!.map((draft) => (
              <li key={draft.draft_id}>
                <button type="button" className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-raised" onClick={() => pick(draft)}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{draftLabel(draft)}</span>
                    <span className="block text-xs text-muted">{uiText("features.authoring.DraftBar.v_4c9448")}{draft.draft_version} {uiText("features.authoring.DraftBar.basis_revision_cb2fb5")}{draft.base_revision ?? '–'} · {formatTime(draft.updated_at)}</span>
                  </span>
                  {doc.draft?.draft_id === draft.draft_id && <Badge tone="accent">{doc.dirty ? uiText("features.authoring.DraftBar.geoffnet_ungespeichert_62ba6c") : uiText("features.authoring.DraftBar.geoffnet_ec5e95")}</Badge>}
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
      title={uiText("features.authoring.DraftBar.ungespeicherte_anderungen_verwerfen_2630c0")}
      description={<>„{doc.draft ? draftLabel({ draft_id: doc.draft.draft_id, display_name: doc.displayName }) : ''}{uiText("features.authoring.DraftBar.hat_ungespeicherte_anderungen_beim_wechsel_zu_52f14b")}{target ? draftLabel(target) : ''}{uiText("features.authoring.DraftBar.gehen_sie_samt_ruckgangig_verlauf_verloren_f437b8")}</>}
      confirmLabel={uiText("features.authoring.DraftBar.verwerfen_und_wechseln_88c2d1")}
      tone="danger"
      onConfirm={doc.confirmSwitch}
    />
  );
}

/** Version conflict (OCC): never overwrites silently; the user picks explicitly. */
export function ConflictDialog() {
  const doc = useWorkingDocument();
  const navigate = useNavigate();
  const location = useLocation();
  const conflict = doc.conflict;
  const [busy, setBusy] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  useEffect(() => setConfirmOverwrite(false), [conflict]);
  if (!conflict) return null;
  const same = canonicalJson(conflict.server.config) === canonicalJson(doc.config);
  const run = async (choice: Parameters<typeof doc.resolveConflict>[0]) => {
    setBusy(true);
    try {
      const createdId = await doc.resolveConflict(choice);
      if (createdId && location.pathname.startsWith('/changes/drafts/')) navigate(`/changes/drafts/${encodeURIComponent(createdId)}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && void run('cancel')}
      title={uiText("features.authoring.DraftBar.versionskonflikt_beim_speichern_b52e2a")}
      description={uiText("features.authoring.DraftBar.der_draft_wurde_seit_dem_laden_verandert_server__3341e6", { v0: (conflict.server.draft_version), v1: (doc.draft?.draft_version) })}
      footer={
        <>
          <Button disabled={busy} onClick={() => run('cancel')}>{uiText("features.authoring.DraftBar.abbrechen_f7ff11")}</Button>
          <Button disabled={busy} onClick={() => run('keep-local-as-new')}>{uiText("features.authoring.DraftBar.meine_anderungen_als_neuen_draft_sichern_ef820d")}</Button>
          <Button disabled={busy} onClick={() => run('take-server')}>{uiText("features.authoring.DraftBar.server_stand_ubernehmen_2f2a5e")}</Button>
          <Button variant="danger" disabled={busy} onClick={() => (confirmOverwrite ? void run('overwrite') : setConfirmOverwrite(true))}>
            {confirmOverwrite ? uiText("features.authoring.DraftBar.wirklich_uberschreiben_ad728b") : uiText("features.authoring.DraftBar.server_stand_uberschreiben_613729")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {same ? <Notice tone="info">{uiText("features.authoring.DraftBar.beide_stande_sind_inhaltlich_gleich_ein_ubernehm_d8a22e")}</Notice> : <Notice tone="warn" title={uiText("features.authoring.DraftBar.die_stande_unterscheiden_sich_0b65e1")}>{uiText("features.authoring.DraftBar.server_stand_ubernehmen_verwirft_ihre_lokalen_an_59393c")}</Notice>}
        {confirmOverwrite && <Notice tone="bad" title={uiText("features.authoring.DraftBar.uberschreiben_bestatigen_a69a90")}>{uiText("features.authoring.DraftBar.die_zwischenzeitlichen_anderungen_am_server_draf_1417b3")}</Notice>}
      </div>
    </Dialog>
  );
}

export function ValidationChip() {
  const { draft, validation, autoValidate } = useWorkingDocument();
  if (validation.state === 'checking') return <Badge tone="neutral"><Loader2 size={11} className="animate-spin" /> {uiText("features.authoring.DraftBar.pruft_e99f77")}</Badge>;
  if (validation.state === 'failed') return <Tip label={validation.error ?? uiText("features.authoring.DraftBar.validierung_nicht_moglich_ce6c4d")}><span tabIndex={0}><Badge tone="warn"><CircleAlert size={11} /> {uiText("features.authoring.DraftBar.prufung_nicht_moglich_9c9bd1")}</Badge></span></Tip>;
  if (validation.state === 'idle') return <Badge tone="neutral">{autoValidate ? uiText("features.authoring.DraftBar.wird_gepruft_90f584") : uiText("features.authoring.DraftBar.ungepruft_08112f")}</Badge>;
  const count = validation.issues.length;
  if (count > 0) return <Link to={`/changes/drafts/${encodeURIComponent(draft?.draft_id ?? '')}?focus=validation`}><Badge tone="bad"><CircleAlert size={11} /> {count} {count === 1 ? uiText("features.authoring.DraftBar.fehler_f6cc01") : uiText("features.authoring.DraftBar.fehler_f6cc01")}{validation.stale ? uiText("features.authoring.DraftBar.veraltet_14c672") : ''}</Badge></Link>;
  return <Badge tone={validation.stale ? 'neutral' : 'ok'}><CheckCircle2 size={11} /> {uiText("features.authoring.DraftBar.gultig_87b71a")}{validation.stale ? uiText("features.authoring.DraftBar.veraltet_14c672") : ''}</Badge>;
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
    <div className="flex flex-wrap items-center gap-2" aria-label={uiText("features.authoring.DraftBar.arbeits_draft_00218f")}>
      {doc.draft ? (
        <>
          <Link to={`/changes/drafts/${encodeURIComponent(doc.draft.draft_id)}`} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-strong bg-raised px-2.5 py-1 text-xs hover:border-accent/60">
            <FileEdit size={13} className="text-accent" />
            <span className="max-w-40 truncate font-medium">{draftLabel({ ...doc.draft, display_name: doc.displayName })}</span>
            <span className="text-faint">{uiText("features.authoring.DraftBar.v_4c9448")}{doc.draft.draft_version}</span>
          </Link>
          {doc.dirty ? <Badge tone="warn">{uiText("features.authoring.DraftBar.ungespeichert_e2fde8")}</Badge> : <Badge tone="neutral">{uiText("features.authoring.DraftBar.gespeichert_53f27e")}</Badge>}
          <ValidationChip />
          <Tip label={uiText("features.authoring.DraftBar.ruckgangig_dd7bd2")}><Button variant="ghost" size="icon" aria-label={uiText("features.authoring.DraftBar.ruckgangig_dd7bd2")} disabled={!doc.canUndo} onClick={doc.undo}><Undo2 size={15} /></Button></Tip>
          <Tip label={uiText("features.authoring.DraftBar.wiederholen_e0ef00")}><Button variant="ghost" size="icon" aria-label={uiText("features.authoring.DraftBar.wiederholen_e0ef00")} disabled={!doc.canRedo} onClick={doc.redo}><Redo2 size={15} /></Button></Tip>
          <Button size="sm" variant="primary" disabled={!doc.dirty || doc.saving} onClick={() => void doc.save()} title={uiText("features.authoring.DraftBar.strg_s_bda7e5")}>
            {doc.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {uiText("features.authoring.DraftBar.speichern_f6b2ff")}</Button>
          <Button size="sm" onClick={() => void doc.validateNow()} disabled={doc.validation.state === 'checking'}>{uiText("features.authoring.DraftBar.prufen_a1ca13")}</Button>
          <Tip label={uiText("features.authoring.DraftBar.draft_schlie_en_e8650e")}><Button variant="ghost" size="icon" aria-label={uiText("features.authoring.DraftBar.draft_schlie_en_e8650e")} onClick={() => (doc.dirty ? setClosing(true) : doc.close())}><X size={15} /></Button></Tip>
        </>
      ) : (
        <Button size="sm" onClick={() => setPicker(true)}><FileEdit size={13} /> {uiText("features.authoring.DraftBar.arbeits_draft_wahlen_d0f546")}</Button>
      )}
      <DraftPicker open={picker} onOpenChange={setPicker} />
      <ConflictDialog />
      <SwitchDialog />
      <ConfirmDialog open={closing} onOpenChange={setClosing} title={uiText("features.authoring.DraftBar.draft_schlie_en_f5ae17")} description={uiText("features.authoring.DraftBar.es_gibt_ungespeicherte_anderungen_sie_gehen_verl_002e77")} confirmLabel={uiText("features.authoring.DraftBar.verwerfen_und_schlie_en_6dcb36")} tone="danger" onConfirm={() => { setClosing(false); doc.close(); }} />
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
      <Notice tone="info" title={uiText("features.authoring.DraftBar.v0_schreibgeschutzte_ansicht_der_aktiven_registr_d18159", { v0: (what) })} className="mb-4">
        <p>{uiText("features.authoring.DraftBar.zum_bearbeiten_einen_arbeits_draft_offnen_drafts_00df6c")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>{uiText("features.authoring.DraftBar.neuen_draft_anlegen_2247df")}</Button>
          <Button size="sm" onClick={() => setPicker(true)}>{uiText("features.authoring.DraftBar.bestehenden_draft_wahlen_58d464")}</Button>
        </div>
      </Notice>
      <DraftPicker open={picker} onOpenChange={setPicker} />
      <CreateDraftDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

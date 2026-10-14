import { t as uiText } from '@/i18n';
import { Copy, Download, FilePlus2, FolderOpen, GitCompare, History, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
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
  // After the switch dialog confirms, follow into the draft's page.
  useEffect(() => {
    if (opening && doc.draft?.draft_id === opening.draft_id) {
      setOpening(null);
      navigate(`/registry/drafts/${encodeURIComponent(opening.draft_id)}`);
    } else if (opening && doc.switchRequest === null && doc.draft?.draft_id !== opening.draft_id) setOpening(null);
  }, [opening, doc.draft?.draft_id, doc.switchRequest, navigate]);
  const [error, setError] = useState('');
  const list = drafts.data ?? [];

  const open = (draft: Draft) => {
    if (doc.requestOpen(draft) !== 'pending') navigate(`/registry/drafts/${encodeURIComponent(draft.draft_id)}`);
    else setOpening(draft);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{list.length} {uiText("features.registry.RegistryPage.von_100_drafts_drafts_sind_niemals_live_sie_durf_c3fc1f")}</p>
        <Button variant="primary" disabled={list.length >= 100} title={list.length >= 100 ? uiText("features.registry.RegistryPage.es_sind_bereits_100_entwurfe_vorhanden_zuerst_ei_f0bbd8") : undefined} onClick={() => setCreating(true)}><FilePlus2 size={15} /> {uiText("features.registry.RegistryPage.neuer_draft_610fb2")}</Button>
      </div>
      {error && <Notice tone="bad" title={uiText("features.registry.RegistryPage.aktion_fehlgeschlagen_3a20cc")}>{error}</Notice>}
      <Panel>
        {drafts.isPending ? (
          <Spinner />
        ) : list.length === 0 ? (
          <Empty title={uiText("features.registry.RegistryPage.noch_keine_drafts_a1dbb9")} action={<Button variant="primary" onClick={() => setCreating(true)}>{uiText("features.registry.RegistryPage.ersten_draft_anlegen_8191b5")}</Button>}>
            {uiText("features.registry.RegistryPage.legen_sie_einen_leeren_draft_an_kopieren_sie_die_ecb749")}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((draft) => (
              <li key={draft.draft_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <Link className="truncate hover:text-accent" to={`/registry/drafts/${encodeURIComponent(draft.draft_id)}`}>{draftLabel(draft)}</Link>
                    {doc.draft?.draft_id === draft.draft_id && <Badge tone="accent">{doc.dirty ? uiText("features.registry.RegistryPage.geoffnet_ungespeichert_62ba6c") : uiText("features.registry.RegistryPage.geoffnet_ec5e95")}</Badge>}
                  </p>
                  <p className="mono truncate text-[11px] text-faint">{draft.draft_id}</p>
                  <p className="text-xs text-muted">{uiText("features.registry.RegistryPage.v_4c9448")}{draft.draft_version} {uiText("features.registry.RegistryPage.basis_revision_690542")}{draft.base_revision ?? '–'} {uiText("features.registry.RegistryPage.erstellt_555e13")}{formatTime(draft.created_at)} {uiText("features.registry.RegistryPage.geandert_4147a3")}{formatTime(draft.updated_at)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" onClick={() => open(draft)}><Pencil size={13} /> {uiText("features.registry.RegistryPage.bearbeiten_84e45e")}</Button>
                  <Button size="sm" onClick={() => setCopyOf(draft)}><Copy size={13} /> {uiText("features.registry.RegistryPage.duplizieren_9d400c")}</Button>
                  <Button size="sm" onClick={() => downloadText(`${safeFilename(draftLabel(draft))}.json`, exportRegistry(draft.config))}><Download size={13} /> {uiText("features.registry.RegistryPage.export_366489")}</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(draft)}><Trash2 size={13} /> {uiText("features.registry.RegistryPage.loschen_6c2d35")}</Button>
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
        title={uiText("features.registry.RegistryPage.draft_loschen_4ca056")}
        description={<>„{deleting ? draftLabel(deleting) : ''}{uiText("features.registry.RegistryPage.wird_endgultig_geloscht_version_v_5065b7")}{deleting?.draft_version}{uiText("features.registry.RegistryPage.die_aktive_registry_bleibt_unberuhrt_cf60a6")}</>}
        confirmLabel={uiText("features.registry.RegistryPage.endgultig_loschen_6c1fd3")}
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
        <p className="text-sm text-muted">{uiText("features.registry.RegistryPage.revisionen_sind_unveranderlich_aktivierung_und_r_45199a")}</p>
        <Button disabled={selected.length !== 2} onClick={() => setComparing(true)}><GitCompare size={14} /> {uiText("features.registry.RegistryPage.zwei_revisionen_vergleichen_ebd968")}{selected.length}/2)</Button>
      </div>
      <Panel>
        {rows.length === 0 ? (
          <Empty title={uiText("features.registry.RegistryPage.noch_keine_revision_bf7c3f")}>{uiText("features.registry.RegistryPage.es_wurde_noch_nie_eine_registry_aktiviert_66d0b4")}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const isActive = active.data?.revision === row.revision;
              const op = operations.get(row.revision);
              return (
                <li key={row.revision} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <input type="checkbox" aria-label={uiText("features.registry.RegistryPage.revision_v0_zum_vergleich_wahlen_d77c8e", { v0: (row.revision) })} className="size-4 accent-[var(--color-accent)]" checked={selected.includes(row.revision)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, row.revision].slice(-2) : s.filter((n) => n !== row.revision)))} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {uiText("features.registry.RegistryPage.revision_e330d8")}{row.revision}
                      {isActive && <Badge tone="ok">{uiText("features.registry.RegistryPage.aktiv_3139fc")}</Badge>}
                      {op && <Badge tone={op === 'rollback' ? 'warn' : 'neutral'}>{op === 'rollback' ? uiText("features.registry.RegistryPage.rollback_c591f5") : uiText("features.registry.RegistryPage.aktivierung_90ba1a")}</Badge>}
                    </p>
                    <p className="mono text-[11px] text-faint">{row.checksum.slice(0, 20)}…</p>
                    <p className="text-xs text-muted">{formatTime(row.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => setViewing(row)}><History size={13} /> {uiText("features.registry.RegistryPage.ansehen_8e3136")}</Button>
                    <Button size="sm" onClick={() => downloadText(`registry-rev-${row.revision}.json`, exportRegistry(row.config))}><Download size={13} /> {uiText("features.registry.RegistryPage.export_366489")}</Button>
                    <Button size="sm" onClick={() => setCopyOf(row)}><FolderOpen size={13} /> {uiText("features.registry.RegistryPage.als_draft_051157")}</Button>
                    <Button size="sm" variant="danger" disabled={isActive} onClick={() => setRolling(row)}><RotateCcw size={13} /> {uiText("features.registry.RegistryPage.zuruckrollen_1c5e6f")}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)} size="xl" title={uiText("features.registry.RegistryPage.revision_v0_5db9ad", { v0: (viewing.revision) })} description={uiText("features.registry.RegistryPage.prufsumme_v0_2bfef2", { v0: (viewing.checksum) })}>
          <pre className="max-h-[60vh] overflow-auto rounded-[var(--radius-md)] bg-sunken p-3 text-xs">{canonicalJson(viewing.config)}</pre>
        </Dialog>
      )}
      {rolling && <RollbackDialog key={rolling.revision} revision={rolling} open onOpenChange={(o) => !o && setRolling(null)} />}
      {copyOf && <CreateDraftDialog open onOpenChange={(o) => !o && setCopyOf(null)} copyOf={{ config: copyOf.config, name: `Revision ${copyOf.revision}` }} onCreated={(d) => navigate(`/registry/drafts/${encodeURIComponent(d.draft_id)}`)} />}
      {comparing && pair && (
        <Dialog open onOpenChange={(o) => !o && setComparing(false)} size="lg" title={uiText("features.registry.RegistryPage.revision_v0_v1_1a2b5a", { v0: (pair[0]!.revision), v1: (pair[1]!.revision) })} description={uiText("features.registry.RegistryPage.strukturelle_differenz_der_konfigurationsdokumen_aee6e2")}>
          {(() => {
            const paths = changedPaths(pair[0]!.config, pair[1]!.config);
            return paths.length === 0 ? (
              <Notice tone="info" title={uiText("features.registry.RegistryPage.inhaltlich_identisch_8109af")} />
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
      <PageHeader title={uiText("features.registry.RegistryPage.registry_studio_995ef2")} description={uiText("features.registry.RegistryPage.drafts_bearbeiten_validieren_vergleichen_und_aus_803689")} />
      <PanelLayout view="registry"><LayoutPanel id="active" title={uiText("features.registry.RegistryPage.aktive_registry_f208c4")}><Panel>
        <PanelHeader
          title={uiText("features.registry.RegistryPage.aktive_registry_f208c4")}
          aside={active.data && <a className="text-xs text-accent hover:underline" href="./api/v1/registry/active/export" download="registry.json">{uiText("features.registry.RegistryPage.aktive_konfiguration_exportieren_d516a1")}</a>}
        />
        <div className="p-4">
          {active.isPending ? <Spinner /> : active.data ? (
            <KeyValue items={[{ label: uiText("features.registry.RegistryPage.revision_2e516d"), value: active.data.revision }, { label: uiText("features.registry.RegistryPage.prufsumme_86da55"), value: <code>{active.data.checksum.slice(0, 24)}…</code> }, { label: uiText("features.registry.RegistryPage.aktiviert_10639c"), value: formatTime(active.data.created_at) }]} />
          ) : (
            <Notice tone="info" title={uiText("features.registry.RegistryPage.noch_keine_registry_aktiv_861e71")}>{uiText("features.registry.RegistryPage.das_ist_ein_gultiger_anfangszustand_legen_sie_ei_9d85fe")}</Notice>
          )}
        </div>
      </Panel>
      </LayoutPanel><LayoutPanel id="drafts-revisions" title={uiText("features.registry.RegistryPage.drafts_revisionen_31e523")}><Tabs
        items={[
          { value: 'drafts', label: uiText("features.registry.RegistryPage.drafts_f592e6"), content: <DraftsTab /> },
          { value: 'revisions', label: uiText("features.registry.RegistryPage.revisionen_e0511e"), content: <RevisionsTab /> },
        ]}
      /></LayoutPanel></PanelLayout>
    </>
  );
}

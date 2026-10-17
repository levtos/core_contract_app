import { t as uiText } from '@/i18n';
import { useQuery } from '@tanstack/react-query';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { ArrowLeft, CheckCircle2, CircleAlert, Download, Rocket } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Collapsible } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Empty, KeyValue, Notice, PageHeader, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { Input, Textarea } from '@/components/ui/form';
import { ValidationChip, draftLabel } from '@/features/authoring/DraftBar';
import { downloadText, exportRegistry, parseRegistryJson, safeFilename } from '@/features/authoring/importExport';
import { asArray } from '@/features/authoring/model';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import type { Draft } from '@/lib/types';
import { ActivateDialog } from './ActivationDialogs';
import { DiffView } from './DiffView';
import { IssueList } from './IssueList';

const SECTIONS: { key: string; label: string; to: string }[] = [
  { key: 'dependencies', label: uiText("features.registry.DraftPage.dependencies_2e41b1"), to: "/sources/dependencies?tab=dependencies" },
  { key: 'sources', label: uiText("features.registry.DraftPage.sources_caf85b"), to: "/sources/devices" },
  { key: 'bindings', label: uiText("features.registry.DraftPage.bindings_7697ab"), to: "/sources/bindings?tab=bindings" },
  { key: 'catalogs', label: uiText("features.registry.DraftPage.kataloge_daf282"), to: "/sources/catalogs?tab=catalogs" },
  { key: 'definitions', label: uiText("features.registry.DraftPage.definitionen_871a91"), to: "/templates/own" },
  { key: 'contracts', label: uiText("features.registry.DraftPage.contracts_0488ac"), to: "/contracts/list/all" },
];

function JsonExpert() {
  const doc = useWorkingDocument();
  const current = useMemo(() => (doc.config ? JSON.stringify(doc.config, null, 2) : ''), [doc.config]);
  const [text, setText] = useState(current);
  const [error, setError] = useState('');
  useEffect(() => setText(current), [current]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{uiText("features.registry.DraftPage.optionale_expertenansicht_des_gesamten_dokuments_c2d8aa")}</p>
      <Textarea aria-label={uiText("features.registry.DraftPage.registry_json_dceba9")} rows={18} spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} />
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={text === current} disabledReason={uiText('alpha7.copy.unchanged')} onClick={() => { const parsed = parseRegistryJson(text); if (parsed.ok) { doc.replaceAll(parsed.config); setError(''); } else setError(parsed.error); }}>{uiText("features.registry.DraftPage.ubernehmen_936378")}</Button>
        <Button size="sm" disabled={text === current} disabledReason={uiText('alpha7.copy.unchanged')} onClick={() => { setText(current); setError(''); }}>{uiText("features.registry.DraftPage.zurucksetzen_1ba046")}</Button>
      </div>
    </div>
  );
}

export default function DraftPage() {
  const { draftId = '' } = useParams();
  const doc = useWorkingDocument();
  const server = useQuery({ queryKey: ['registry', 'drafts', draftId], queryFn: () => api<Draft>(`registry/drafts/${encodeURIComponent(draftId)}`), retry: false });
  const [activating, setActivating] = useState(false);
  const [switching, setSwitching] = useState(false);
  const isOpen = doc.draft?.draft_id === draftId;
  const blocked = !isOpen && doc.dirty;

  useEffect(() => {
    if (!isOpen && !doc.dirty && server.data) doc.open(server.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, doc.dirty, server.data]);

  if (server.isError && !isOpen) {
    return (
      <>
        <Back />
        <Empty title={uiText("features.registry.DraftPage.draft_v0_nicht_gefunden_ea702b", { v0: (draftId) })}>{uiText("features.registry.DraftPage.er_wurde_geloscht_oder_hat_nie_existiert_0556f2")}</Empty>
      </>
    );
  }
  if (blocked) {
    return (
      <>
        <Back />
        <Notice tone="warn" title={uiText("features.registry.DraftPage.ein_anderer_draft_hat_ungespeicherte_anderungen_261d0b")}>
          {uiText("features.registry.DraftPage.geoffnet_ist_e6c05b")}{doc.draft ? draftLabel(doc.draft) : ''}{uiText("features.registry.DraftPage.speichern_sie_ihn_zuerst_oder_verwerfen_sie_die__baa37d")}<div className="mt-2 flex gap-2">
            <Link to={`/changes/drafts/${encodeURIComponent(doc.draft?.draft_id ?? '')}`}><Button size="sm">{uiText("features.registry.DraftPage.zum_geoffneten_draft_855199")}</Button></Link>
            <Button size="sm" variant="danger" onClick={() => setSwitching(true)}>{uiText("features.registry.DraftPage.verwerfen_und_wechseln_88c2d1")}</Button>
          </div>
        </Notice>
        <ConfirmDialog open={switching} onOpenChange={setSwitching} title={uiText("features.registry.DraftPage.anderungen_verwerfen_d16767")} description={uiText("features.registry.DraftPage.die_ungespeicherten_anderungen_des_geoffneten_dr_9242f0")} confirmLabel={uiText("features.registry.DraftPage.verwerfen_594ca8")} tone="danger" onConfirm={() => { setSwitching(false); if (server.data) { doc.close(); doc.open(server.data); } }} />
      </>
    );
  }
  if (!isOpen || !doc.draft || !doc.config) return <><Back /><Spinner label={uiText("features.registry.DraftPage.draft_wird_geoffnet_7f5df8")} /></>;

  const { draft, config, validation } = doc;
  const validNow = validation.state === 'done' && validation.result?.valid === true && !validation.stale;
  const canActivate = !doc.dirty && validNow;
  const reasons = [
    doc.dirty ? uiText("features.registry.DraftPage.ungespeicherte_anderungen_zuerst_speichern_aa5d4f") : null,
    validation.state === 'checking' ? uiText("features.registry.DraftPage.validierung_lauft_42127b") : null,
    validation.stale ? uiText("features.registry.DraftPage.validierung_ist_veraltet_dfcc69") : null,
    validation.state === 'done' && !validation.result?.valid ? uiText("features.registry.DraftPage.der_draft_enthalt_fehler_ed758d") : null,
    validation.state === 'failed' ? uiText("features.registry.DraftPage.validierung_nicht_moglich_544138") : null,
    validation.state === 'idle' ? uiText("features.registry.DraftPage.noch_nicht_gepruft_5cea78") : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <Back />
      <PageHeader
        title={draftLabel({ draft_id: draft.draft_id, display_name: doc.displayName })}
        description={uiText("features.registry.DraftPage.draft_v0_v_v1_basis_revision_v2_zuletzt_gespeich_24aa87", { v0: (draft.draft_id), v1: (draft.draft_version), v2: (draft.base_revision ?? '–'), v3: (formatTime(draft.updated_at)) })}
        actions={
          <>
            <Button onClick={() => downloadText(`${safeFilename(doc.displayName || draft.draft_id)}.json`, exportRegistry(config))}><Download size={14} /> {uiText("features.registry.DraftPage.export_366489")}</Button>
          </>
        }
      />
      <PanelLayout view="registry.draft" defaultOrder={['validation', 'name', 'diff', 'activation', 'editor', 'json']}>
          <LayoutPanel id="validation" title={uiText("features.registry.DraftPage.validierung_d4bf21")} span={2}>
          <div data-pointer="validation" tabIndex={-1}>
          <Panel>
            <PanelHeader title={uiText("features.registry.DraftPage.validierung_d4bf21")} description={uiText("features.registry.DraftPage.der_server_pruft_den_bearbeiteten_auch_ungespeic_ebe4cd")} aside={<><ValidationChip /><Switch checked={doc.autoValidate} onCheckedChange={doc.setAutoValidate} label={uiText("features.registry.DraftPage.automatisch_f0b793")} /><Button size="sm" onClick={() => void doc.validateNow()}>{uiText("features.registry.DraftPage.jetzt_prufen_0ceedf")}</Button></>} />
            <div className="flex flex-col gap-3 p-4">
              {validation.state === 'failed' && <Notice tone="warn" title={uiText("features.registry.DraftPage.prufung_nicht_moglich_9c9bd1")}>{validation.error}</Notice>}
              {validation.state === 'done' && validation.issues.length === 0 && <Notice tone="ok" title={uiText("features.registry.DraftPage.keine_fehler_gefunden_0d9c76")}>{uiText("features.registry.DraftPage.der_stand_ist_strukturell_und_semantisch_gultig_a85b70")}{validation.stale ? uiText("features.registry.DraftPage.prufung_vor_der_letzten_anderung_5a34c1") : ''}.</Notice>}
              {validation.issues.length > 0 && (
                <>
                  <Notice tone="bad" title={uiText("features.registry.DraftPage.v0_fehler_v1_bffe5e", { v0: (validation.issues.length), v1: (validation.stale ? uiText("features.registry.DraftPage.veraltet_14c672") : '') })}>{uiText("features.registry.DraftPage.jeder_eintrag_verweist_auf_das_betroffene_objekt_8d552f")}</Notice>
                  <IssueList issues={validation.issues} config={config} />
                </>
              )}
            </div>
          </Panel></div>
          </LayoutPanel><LayoutPanel id="diff" title={uiText("features.registry.DraftPage.diff_auswirkungen_b6da5d")} span={2}><Panel>
            <PanelHeader title={uiText("features.registry.DraftPage.diff_auswirkungen_b6da5d")} description={uiText("features.registry.DraftPage.gegenuber_der_aktiven_revision_nur_sichtbar_wenn_b51778")} />
            <div className="p-4">
              {validation.state === 'done' && !validation.stale && validation.result?.diff && validation.result.valid ? <DiffView diff={validation.result.diff} against={uiText("features.registry.DraftPage.die_aktive_revision_ccaa57")} /> : <p className="text-sm text-muted">{validation.issues.length ? uiText("features.registry.DraftPage.erst_nach_korrektur_der_fehler_verfugbar_bd3e1e") : uiText("features.registry.DraftPage.wird_nach_der_validierung_angezeigt_0f660e")}</p>}
            </div>
          </Panel>
          </LayoutPanel><LayoutPanel id="json" title={uiText("features.registry.DraftPage.json_experte_7a839f")} span={2}><Collapsible title={uiText("features.registry.DraftPage.json_expertenmodus_8ca416")}><JsonExpert /></Collapsible></LayoutPanel>
          <LayoutPanel id="name" title={uiText("features.registry.DraftPage.draft_name_026ddb")} span={1}>
          <Panel>
            <PanelHeader title={uiText("features.registry.DraftPage.name_dcd1d5")} />
            <div className="p-4"><Input aria-label={uiText("features.registry.DraftPage.draft_name_026ddb")} maxLength={256} value={doc.displayName} placeholder={uiText("features.registry.DraftPage.name_des_drafts_2ca771")} onChange={(e) => doc.setDisplayName(e.target.value)} /></div>
          </Panel>
          </LayoutPanel><LayoutPanel id="activation" title={uiText("features.registry.DraftPage.aktivierung_90ba1a")} span={1}><Panel>
            <PanelHeader title={uiText("features.registry.DraftPage.aktivierung_90ba1a")} />
            <div className="flex flex-col gap-3 p-4">
              <p className="text-xs text-muted">{uiText("features.registry.DraftPage.nur_ein_gespeicherter_gultiger_stand_kann_aktivi_631289")}</p>
              <ul className="space-y-1 text-sm">
                <li className="flex items-center gap-2">{doc.dirty ? <CircleAlert size={14} className="text-warn" /> : <CheckCircle2 size={14} className="text-ok" />} {uiText("features.registry.DraftPage.gespeichert_5e2338")}</li>
                <li className="flex items-center gap-2">{validNow ? <CheckCircle2 size={14} className="text-ok" /> : <CircleAlert size={14} className="text-warn" />} {uiText("features.registry.DraftPage.aktuell_gultig_2034ba")}</li>
              </ul>
              {reasons.length > 0 && <p className="text-xs text-warn">{reasons.join(' ')}</p>}
              <Button variant="primary" disabled={!canActivate} onClick={() => setActivating(true)}><Rocket size={14} /> {uiText("features.registry.DraftPage.aktivieren_df1dc1")}</Button>
            </div>
          </Panel>
          </LayoutPanel><LayoutPanel id="editor" title={uiText("features.registry.DraftPage.registry_inhalt_4f888f")} span={1}><Panel>
            <PanelHeader title={uiText("features.registry.DraftPage.inhalt_3cc465")} />
            <ul className="divide-y divide-line">
              {SECTIONS.map((section) => (
                <li key={section.key}>
                  <Link to={section.to} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-raised"><span>{section.label}</span><Badge>{asArray(config[section.key]).length}</Badge></Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-4"><KeyValue items={[{ label: uiText("features.registry.DraftPage.fingerprint_version_e46d72"), value: String(config.fingerprint_version ?? 1) }]} /></div>
          </Panel>
          </LayoutPanel>
      </PanelLayout>
      {activating && <ActivateDialog key={`${draft.draft_id}@${draft.draft_version}`} draft={draft} open onOpenChange={setActivating} />}
    </>
  );
}

function Back() {
  return (
    <Link to="/changes/drafts" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
      <ArrowLeft size={13} /> {uiText("features.registry.DraftPage.registry_studio_995ef2")}</Link>
  );
}

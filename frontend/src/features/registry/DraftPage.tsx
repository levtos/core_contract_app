import { useQuery } from '@tanstack/react-query';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { ArrowLeft, CheckCircle2, CircleAlert, Download, Rocket, Save } from 'lucide-react';
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
  { key: 'dependencies', label: 'Dependencies', to: '/sources?tab=dependencies' },
  { key: 'sources', label: 'Sources', to: '/sources' },
  { key: 'bindings', label: 'Bindings', to: '/sources?tab=bindings' },
  { key: 'catalogs', label: 'Kataloge', to: '/sources?tab=catalogs' },
  { key: 'definitions', label: 'Definitionen', to: '/definitions' },
  { key: 'contracts', label: 'Contracts', to: '/contracts' },
];

function JsonExpert() {
  const doc = useWorkingDocument();
  const current = useMemo(() => (doc.config ? JSON.stringify(doc.config, null, 2) : ''), [doc.config]);
  const [text, setText] = useState(current);
  const [error, setError] = useState('');
  useEffect(() => setText(current), [current]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">Optionale Expertenansicht des gesamten Dokuments. Es gibt keinen Import-Sonderweg: übernommenes JSON ist danach ein gewöhnlicher Draft-Stand und vollständig grafisch bearbeitbar.</p>
      <Textarea aria-label="Registry-JSON" rows={18} spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} />
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={text === current} onClick={() => { const parsed = parseRegistryJson(text); if (parsed.ok) { doc.replaceAll(parsed.config); setError(''); } else setError(parsed.error); }}>Übernehmen</Button>
        <Button size="sm" disabled={text === current} onClick={() => { setText(current); setError(''); }}>Zurücksetzen</Button>
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
        <Empty title={`Draft „${draftId}“ nicht gefunden`}>Er wurde gelöscht oder hat nie existiert.</Empty>
      </>
    );
  }
  if (blocked) {
    return (
      <>
        <Back />
        <Notice tone="warn" title="Ein anderer Draft hat ungespeicherte Änderungen">
          Geöffnet ist „{doc.draft ? draftLabel(doc.draft) : ''}“. Speichern Sie ihn zuerst oder verwerfen Sie die Änderungen, um diesen Draft zu öffnen.
          <div className="mt-2 flex gap-2">
            <Link to={`/registry/drafts/${encodeURIComponent(doc.draft?.draft_id ?? '')}`}><Button size="sm">Zum geöffneten Draft</Button></Link>
            <Button size="sm" variant="danger" onClick={() => setSwitching(true)}>Verwerfen und wechseln</Button>
          </div>
        </Notice>
        <ConfirmDialog open={switching} onOpenChange={setSwitching} title="Änderungen verwerfen?" description="Die ungespeicherten Änderungen des geöffneten Drafts gehen verloren." confirmLabel="Verwerfen" tone="danger" onConfirm={() => { setSwitching(false); if (server.data) { doc.close(); doc.open(server.data); } }} />
      </>
    );
  }
  if (!isOpen || !doc.draft || !doc.config) return <><Back /><Spinner label="Draft wird geöffnet …" /></>;

  const { draft, config, validation } = doc;
  const validNow = validation.state === 'done' && validation.result?.valid === true && !validation.stale;
  const canActivate = !doc.dirty && validNow;
  const reasons = [
    doc.dirty ? 'Ungespeicherte Änderungen – zuerst speichern.' : null,
    validation.state === 'checking' ? 'Validierung läuft.' : null,
    validation.stale ? 'Validierung ist veraltet.' : null,
    validation.state === 'done' && !validation.result?.valid ? 'Der Draft enthält Fehler.' : null,
    validation.state === 'failed' ? 'Validierung nicht möglich.' : null,
    validation.state === 'idle' ? 'Noch nicht geprüft.' : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <Back />
      <PageHeader
        title={draftLabel({ draft_id: draft.draft_id, display_name: doc.displayName })}
        description={`Draft ${draft.draft_id} · v${draft.draft_version} · Basis-Revision ${draft.base_revision ?? '–'} · zuletzt gespeichert ${formatTime(draft.updated_at)}`}
        actions={
          <>
            <Button variant="primary" disabled={!doc.dirty || doc.saving} onClick={() => void doc.save()}><Save size={14} /> Speichern</Button>
            <Button onClick={() => downloadText(`${safeFilename(doc.displayName || draft.draft_id)}.json`, exportRegistry(config))}><Download size={14} /> Export</Button>
          </>
        }
      />
      <PanelLayout view="registry.draft" defaultOrder={['validation', 'name', 'diff', 'activation', 'editor', 'json']}>
          <LayoutPanel id="validation" title="Validierung" span={2}>
          <Panel>
            <PanelHeader title="Validierung" description="Der Server prüft den bearbeiteten (auch ungespeicherten) Stand – ohne ihn zu aktivieren." aside={<><ValidationChip /><Switch checked={doc.autoValidate} onCheckedChange={doc.setAutoValidate} label="automatisch" /><Button size="sm" onClick={() => void doc.validateNow()}>Jetzt prüfen</Button></>} />
            <div className="flex flex-col gap-3 p-4">
              {validation.state === 'failed' && <Notice tone="warn" title="Prüfung nicht möglich">{validation.error}</Notice>}
              {validation.state === 'done' && validation.issues.length === 0 && <Notice tone="ok" title="Keine Fehler gefunden">Der Stand ist strukturell und semantisch gültig{validation.stale ? ' (Prüfung vor der letzten Änderung)' : ''}.</Notice>}
              {validation.issues.length > 0 && (
                <>
                  <Notice tone="bad" title={`${validation.issues.length} Fehler${validation.stale ? ' (veraltet)' : ''}`}>Jeder Eintrag verweist auf das betroffene Objekt; im jeweiligen Editor steht der Fehler direkt am Feld.</Notice>
                  <IssueList issues={validation.issues} config={config} />
                </>
              )}
            </div>
          </Panel>
          </LayoutPanel><LayoutPanel id="diff" title="Diff & Auswirkungen" span={2}><Panel>
            <PanelHeader title="Diff & Auswirkungen" description="Gegenüber der aktiven Revision – nur sichtbar, wenn der Stand gültig ist." />
            <div className="p-4">
              {validation.result?.diff && validation.result.valid ? <DiffView diff={validation.result.diff} against="die aktive Revision" /> : <p className="text-sm text-muted">{validation.issues.length ? 'Erst nach Korrektur der Fehler verfügbar.' : 'Wird nach der Validierung angezeigt.'}</p>}
            </div>
          </Panel>
          </LayoutPanel><LayoutPanel id="json" title="JSON-Experte" span={2}><Collapsible title="JSON-Expertenmodus"><JsonExpert /></Collapsible></LayoutPanel>
          <LayoutPanel id="name" title="Draft-Name" span={1}>
          <Panel>
            <PanelHeader title="Name" />
            <div className="p-4"><Input aria-label="Draft-Name" maxLength={256} value={doc.displayName} placeholder="Name des Drafts" onChange={(e) => doc.setDisplayName(e.target.value)} /></div>
          </Panel>
          </LayoutPanel><LayoutPanel id="activation" title="Aktivierung" span={1}><Panel>
            <PanelHeader title="Aktivierung" />
            <div className="flex flex-col gap-3 p-4">
              <p className="text-xs text-muted">Nur ein gespeicherter, gültiger Stand kann aktiviert werden. Drafts selbst sind nie live.</p>
              <ul className="space-y-1 text-sm">
                <li className="flex items-center gap-2">{doc.dirty ? <CircleAlert size={14} className="text-warn" /> : <CheckCircle2 size={14} className="text-ok" />} Gespeichert</li>
                <li className="flex items-center gap-2">{validNow ? <CheckCircle2 size={14} className="text-ok" /> : <CircleAlert size={14} className="text-warn" />} Aktuell gültig</li>
              </ul>
              {reasons.length > 0 && <p className="text-xs text-warn">{reasons.join(' ')}</p>}
              <Button variant="primary" disabled={!canActivate} onClick={() => setActivating(true)}><Rocket size={14} /> Aktivieren …</Button>
            </div>
          </Panel>
          </LayoutPanel><LayoutPanel id="editor" title="Registry-Inhalt" span={1}><Panel>
            <PanelHeader title="Inhalt" />
            <ul className="divide-y divide-line">
              {SECTIONS.map((section) => (
                <li key={section.key}>
                  <Link to={section.to} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-raised"><span>{section.label}</span><Badge>{asArray(config[section.key]).length}</Badge></Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-4"><KeyValue items={[{ label: 'Fingerprint-Version', value: String(config.fingerprint_version ?? 1) }]} /></div>
          </Panel>
          </LayoutPanel>
      </PanelLayout>
      {activating && <ActivateDialog key={`${draft.draft_id}@${draft.draft_version}`} draft={draft} open onOpenChange={setActivating} />}
    </>
  );
}

function Back() {
  return (
    <Link to="/registry" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
      <ArrowLeft size={13} /> Registry Studio
    </Link>
  );
}

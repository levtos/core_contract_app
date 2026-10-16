import { useState } from 'react';
import { useLocation } from 'react-router';
import { t } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Notice, PageHeader, Panel, PanelHeader } from '@/components/ui/layout';
import { downloadText, exportRegistry, parseRegistryJson } from '@/features/authoring/importExport';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { ReviewDraftButton } from '@/features/authoring/DraftBar';
import { api, ApiError, describeError, type Issue } from '@/lib/api';
import { useActiveExport, useDraftMutations, useDrafts } from '@/lib/queries';
import type { Draft, ValidationResult } from '@/lib/types';
import { IssueList } from './IssueList';

export default function ImportExportPage() {
  const contractImport = useLocation().pathname.startsWith('/contracts/');
  const active = useActiveExport();
  const drafts = useDrafts();
  const { create } = useDraftMutations();
  const doc = useWorkingDocument();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [imported, setImported] = useState<Draft | null>(null);
  const [checked, setChecked] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const atLimit = (drafts.data?.length ?? 0) >= 100;
  const changeText = (next: string) => { setText(next); setError(''); setImported(null); setChecked(false); setIssues([]); };
  const submit = async () => {
    const parsed = parseRegistryJson(text);
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true); setError(''); setChecked(false); setIssues([]);
    try {
      const display = name.trim() || parsed.display_name || t('alpha7.draft.defaultName', { date: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) });
      const draft = await create.mutateAsync({ config: parsed.config, display_name: display.slice(0, 256) });
      setImported(draft);
      doc.requestOpen(draft);
      try {
        const result = await api<ValidationResult>(`registry/drafts/${encodeURIComponent(draft.draft_id)}/validate`, { method: 'POST', body: {} });
        setIssues(result.issues ?? []); setChecked(true);
      } catch (failure) {
        if (!(failure instanceof ApiError) || failure.kind !== 'validation') throw failure;
        setIssues(failure.issues); setChecked(true);
      }
    } catch (failure) { setError(describeError(failure)); }
    finally { setBusy(false); }
  };
  const disabledReason = busy ? t('alpha7.import.checking') : atLimit ? t('alpha7.import.limit') : !text.trim() ? t('alpha7.import.empty') : '';
  return <>
    <PageHeader title={t(contractImport ? 'alpha7.nav.contractImport' : 'alpha7.nav.transfer')} description={t('alpha7.import.explanation')} />
    <Panel><PanelHeader title={t('alpha7.import.title')} /><div className="flex flex-col gap-4 p-5">
      <Field label={t('alpha7.import.file')}>{props => <Input {...props} type="file" accept="application/json,.json" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (file) changeText(await file.text()); }} />}</Field>
      <Field label={t('alpha7.import.text')}>{props => <Textarea {...props} rows={9} spellCheck={false} disabled={busy} value={text} onChange={event => changeText(event.target.value)} />}</Field>
      <Field label={t('alpha7.import.name')}>{props => <Input {...props} maxLength={256} value={name} onChange={event => setName(event.target.value)} />}</Field>
      <p className="text-sm text-muted">{t('alpha7.draft.explanation')}</p>
      <div><Button variant="primary" disabled={!!disabledReason} onClick={() => void submit()}>{t('alpha7.import.start')}</Button>{disabledReason && <p className="mt-2 text-sm text-muted">{disabledReason}</p>}</div>
      {error && <Notice tone="bad">{error}</Notice>}
      {checked && imported && <section aria-live="polite" className="space-y-4">
        <p role="status" className="text-sm">{issues.length ? t('alpha7.import.errors', { count: issues.length }) : t('alpha7.import.valid')}</p>
        <IssueList issues={issues} config={imported.config} />
        {issues.length === 0 && doc.draft?.draft_id === imported.draft_id ? <ReviewDraftButton>{t('alpha7.import.review')}</ReviewDraftButton> : <Button disabled>{t('alpha7.import.review')}</Button>}
        {issues.length > 0 && <p className="text-sm text-muted">{t('alpha7.import.fix')}</p>}
        {doc.draft?.draft_id !== imported.draft_id && <p className="text-sm text-muted">{t('alpha7.import.openFirst')}</p>}
      </section>}
    </div></Panel>
    {!contractImport && <Panel className="mt-5"><PanelHeader title={t('alpha7.export.title')} /><div className="flex flex-col items-start gap-3 p-5">
      <Button disabled={!active.data} onClick={() => active.data && downloadText(`terra-${new Date().toISOString().slice(0, 10)}.json`, exportRegistry(active.data))}>{t('alpha7.export.active')}</Button>
      {!active.data && <p className="text-sm text-muted">{t('alpha7.export.noActive')}</p>}
      {doc.config && <Button onClick={() => downloadText(`terra-entwurf-${new Date().toISOString().slice(0, 10)}.json`, exportRegistry(doc.config!))}>{t('alpha7.export.draft')}</Button>}
    </div></Panel>}
  </>;
}

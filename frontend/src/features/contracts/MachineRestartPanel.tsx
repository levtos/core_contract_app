import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { t } from '@/i18n';
import { reasonLabel } from '@/i18n/codes';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { Panel, PanelHeader } from '@/components/ui/layout';
import { contractName } from '@/features/overview/overviewModel';
import { api, describeError } from '@/lib/api';
import { deepEqual } from '@/lib/json';
import { useLive } from '@/lib/live-context';
import { POLL_MS, useActiveExport } from '@/lib/queries';
import type { CommandResult, Info } from '@/lib/types';
import { uuid } from '@/lib/uuid';

export interface RestartPreview {
  contract_id: string; allowed: boolean; reason: string; initial: string | null;
  current_state: string | null; previous_episode: string | null;
  registry_revision: number; state_token: string;
  direct_contracts: string[]; indirect_contracts: string[];
  external_automations_known: false; server_time: string;
}
const subjectKey = (value: RestartPreview | undefined) => value && { id: value.contract_id, allowed: value.allowed, revision: value.registry_revision, token: value.state_token };

/** Active server capability only; editing a draft never grants permission to restart. */
export function MachineRestartPanel({ contractId }: { contractId: string }) {
  const live = useLive(); const active = useActiveExport(); const client = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const machine = live.contracts?.[contractId]?.state_machine;
  const signature = JSON.stringify(machine ?? null);
  const preview = useQuery({ queryKey: ['manual-restart', contractId, live.registryRevision, signature], queryFn: () => api<RestartPreview>(`manual-restarts/preview/${encodeURIComponent(contractId)}`), enabled: !!contractId, refetchInterval: POLL_MS, retry: false });
  const [subject, setSubject] = useState<RestartPreview | null>(null);
  const [checked, setChecked] = useState(false); const [reason, setReason] = useState('');
  const [sent, setSent] = useState<{ id: string; result?: CommandResult; error?: string } | null>(null);
  const latest = useRef({ contractId, preview: preview.data, revision: live.registryRevision }); latest.current = { contractId, preview: preview.data, revision: live.registryRevision };
  const matches = !!subject && subject.contract_id === contractId && deepEqual(subjectKey(subject), subjectKey(preview.data)) && (live.registryRevision === null || live.registryRevision === undefined || live.registryRevision === subject.registry_revision);
  const blocked = preview.isPending ? t('alpha7.restart.loading') : preview.isError ? t('alpha7.restart.unavailable') : !preview.data?.allowed ? reasonLabel(preview.data?.reason) : '';
  const send = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!subject || !matches || !checked || !reason.trim() || sent) throw new Error(t('alpha7.restart.reviewAgain'));
      const selected = subject; const explanation = reason.trim(); const id = uuid();
      setSent({ id });
      const info = await api<Info>('info');
      const current = latest.current;
      if (!mounted.current || current.contractId !== selected.contract_id || !deepEqual(subjectKey(selected), subjectKey(current.preview)) || current.revision !== null && current.revision !== undefined && current.revision !== selected.registry_revision) throw new Error(t('alpha7.restart.changed'));
      const now = Date.parse(info.server_time);
      return { id, result: await api<CommandResult>('manual-restarts', { method: 'POST', body: {
        command_id: id, contract_id: selected.contract_id, reason: explanation, confirm: true,
        expected_registry_revision: selected.registry_revision, expected_state_token: selected.state_token,
        issued_at: new Date(now).toISOString(), valid_until: new Date(now + 30_000).toISOString(),
      } }) };
    },
    onSuccess: ({ id, result }) => { setSent({ id, result }); void client.invalidateQueries({ queryKey: ['manual-restart'] }); void client.invalidateQueries({ queryKey: ['history'] }); },
    onError: error => setSent(previous => previous ? { ...previous, error: describeError(error) } : null),
  });
  const recover = useMutation({ retry: false, mutationFn: (id: string) => api<CommandResult>(`commands/${encodeURIComponent(id)}`), onSuccess: result => setSent(previous => previous ? { id: previous.id, result } : null), onError: error => setSent(previous => previous ? { ...previous, error: describeError(error) } : null) });
  const disabledReason = send.isPending ? t('alpha7.restart.sending') : sent ? t('alpha7.restart.sent') : !matches ? t('alpha7.restart.changed') : !checked ? t('alpha7.restart.confirmFirst') : !reason.trim() ? t('alpha7.restart.reasonRequired') : '';
  const open = () => { if (!preview.data?.allowed || blocked) return; setSubject(preview.data); setChecked(false); setReason(''); setSent(null); };
  return <Panel><PanelHeader title={t('alpha7.restart.title')} description={t('alpha7.restart.scope')} />
    <div className="space-y-3 p-5">
      {machine?.manual_restart === true && <p role="status" className="text-sm text-info">{t('alpha7.restart.marker')}</p>}
      <Button disabled={!!blocked || send.isPending} onClick={open}>{t('alpha7.restart.title')}</Button>
      {blocked && <p className="text-sm text-muted">{blocked}</p>}
    </div>
    <Dialog open={!!subject} onOpenChange={value => !value && !send.isPending && setSubject(null)} title={t('alpha7.restart.title')} description={t('alpha7.restart.warning')} size="lg" footer={<>
      <Button disabled={send.isPending} onClick={() => setSubject(null)}>{t('alpha7.restart.close')}</Button>
      <Button variant="danger" disabled={!!disabledReason} onClick={() => send.mutate()}>{t('alpha7.restart.execute')}</Button>
    </>}>
      {subject && <div className="space-y-4">
        <p className="text-sm">{t('alpha7.restart.target', { name: contractName(active.data, subject.contract_id), state: subject.initial ?? t('alpha7.restart.unknown'), version: subject.registry_revision })}</p>
        <div className="grid gap-4 sm:grid-cols-2">{(['direct_contracts', 'indirect_contracts'] as const).map(key => <section key={key}><h3 className="text-sm font-semibold">{t(`alpha7.restart.${key}`)}</h3>{subject[key].length ? <ul className="mt-2 space-y-1 text-sm">{subject[key].map(id => <li key={id}><Link className="text-accent hover:underline" to={`/contracts/view/${encodeURIComponent(id)}`}>{contractName(active.data, id)}</Link></li>)}</ul> : <p className="mt-2 text-sm text-muted">{t('alpha7.restart.noContracts')}</p>}</section>)}</div>
        <p className="text-sm">{t('alpha7.restart.external')}</p>
        <Field label={t('alpha7.restart.reason')}>{props => <Textarea {...props} value={reason} maxLength={256} disabled={send.isPending || !!sent} onChange={event => setReason(event.target.value)} />}</Field>
        <Checkbox label={t('alpha7.restart.confirm')} checked={checked} disabled={send.isPending || !!sent} onCheckedChange={setChecked} />
        {disabledReason && <p role="status" className="text-sm text-muted">{disabledReason}</p>}
        {sent?.result && <p role="status" className="text-sm">{sent.result.status === 'accepted' ? t('alpha7.restart.success') : t('alpha7.restart.rejected', { reason: reasonLabel(sent.result.reason ?? sent.result.status) })}</p>}
        {sent?.error && <p role="alert" className="text-sm text-bad">{sent.error}</p>}
        {sent && !sent.result && !send.isPending && <div className="space-y-2"><p className="text-sm text-muted">{t('alpha7.restart.lostResponse')}</p><Button disabled={recover.isPending} onClick={() => recover.mutate(sent.id)}>{t('alpha7.restart.recover')}</Button>{recover.isPending && <p className="text-sm text-muted">{t('alpha7.restart.recovering')}</p>}</div>}
      </div>}
    </Dialog>
  </Panel>;
}

import { useQuery } from '@tanstack/react-query';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Notice, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { api, ApiError, describeError } from '@/lib/api';
import type { JsonObject } from '@/lib/json';

/** Evidence references are opaque strings: they are only ever passed back to the server. */
function useEvidence(reference: string | null) {
  return useQuery({
    queryKey: ['evidence', 'reference', reference],
    queryFn: () => api<JsonObject>(`evidence/reference/${encodeURIComponent(reference!)}`),
    enabled: !!reference,
    retry: false,
  });
}

export function EvidenceResult({ reference }: { reference: string }) {
  const query = useEvidence(reference);
  if (query.isPending) return <Spinner />;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.code === 'evidence_not_found';
    return (
      <Notice tone={notFound ? 'warn' : 'bad'} title={notFound ? 'Keine aufgezeichnete Evidenz' : 'Evidenz nicht lesbar'}>
        {notFound ? 'Zu dieser Referenz liegt keine Beobachtung vor (z. B. von einer älteren Laufzeit nicht aufgezeichnet). Es wird nichts rekonstruiert.' : describeError(query.error)}
      </Notice>
    );
  }
  return <pre className="max-h-[50vh] overflow-auto rounded-[var(--radius-md)] bg-sunken p-3 text-xs">{JSON.stringify(query.data, null, 2)}</pre>;
}

export function EvidenceDialog({ reference, onClose }: { reference: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="lg" title="Evidenz" description={<code className="break-all text-xs">{reference}</code>}>
      <EvidenceResult reference={reference} />
    </Dialog>
  );
}

export function EvidenceTab({ initialReference = '' }: { initialReference?: string }) {
  const [input, setInput] = useState(initialReference);
  const [reference, setReference] = useState<string | null>(initialReference || null);
  const [sourceInput, setSourceInput] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const source = useQuery({ queryKey: ['evidence', 'source', sourceId], queryFn: () => api<JsonObject[]>(`evidence/${encodeURIComponent(sourceId!)}`), enabled: !!sourceId, retry: false });
  return (
    <PanelLayout view="diagnostics.evidence"><LayoutPanel id="reference" title="Evidence-Referenz" span={2}>
      <Panel>
        <PanelHeader title="Referenz auflösen" description="Exakte aufgezeichnete Beobachtung zu einer Evidence-Referenz (aus Feldern oder dem Explain-Trace)." />
        <div className="flex flex-col gap-3 p-4">
          <Field label="Evidence-Referenz">{(p) => <Input {...p} className="font-mono text-xs" value={input} onChange={(e) => setInput(e.target.value)} />}</Field>
          <div><Button variant="primary" disabled={!input.trim()} onClick={() => setReference(input.trim())}>Auflösen</Button></div>
          {reference && <EvidenceResult reference={reference} />}
        </div>
      </Panel>
      </LayoutPanel><LayoutPanel id="source" title="Quellenbeobachtung" span={1}><Panel>
        <PanelHeader title="Aktuelle Beobachtung einer Quelle" description="Zuletzt gespeicherte Beobachtungen je Binding." />
        <div className="flex flex-col gap-3 p-4">
          <Field label="Source-ID">{(p) => <Input {...p} className="font-mono text-xs" placeholder="source.beispiel" value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} />}</Field>
          <div><Button variant="primary" disabled={!sourceInput.trim()} onClick={() => setSourceId(sourceInput.trim())}>Laden</Button></div>
          {source.isPending && sourceId && <Spinner />}
          {source.isError && <Notice tone="bad" title="Nicht lesbar">{describeError(source.error)}</Notice>}
          {source.data && (source.data.length === 0 ? <Notice tone="info" title="Keine aktuelle Beobachtung" /> : <pre className="max-h-[50vh] overflow-auto rounded-[var(--radius-md)] bg-sunken p-3 text-xs">{JSON.stringify(source.data, null, 2)}</pre>)}
        </div>
      </Panel>
    </LayoutPanel></PanelLayout>
  );
}

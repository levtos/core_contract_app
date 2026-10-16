import { t as uiText } from '@/i18n';
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
      <Notice tone={notFound ? 'warn' : 'bad'} title={notFound ? uiText("features.diagnostics.EvidenceLookup.keine_aufgezeichnete_evidenz_b25154") : uiText("features.diagnostics.EvidenceLookup.evidenz_nicht_lesbar_f315c2")}>
        {notFound ? uiText("features.diagnostics.EvidenceLookup.zu_dieser_referenz_liegt_keine_beobachtung_vor_z_825a45") : describeError(query.error)}
      </Notice>
    );
  }
  return <pre className="max-h-[50vh] overflow-auto rounded-[var(--radius-md)] bg-sunken p-3 text-xs">{JSON.stringify(query.data, null, 2)}</pre>;
}

export function EvidenceDialog({ reference, onClose }: { reference: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="lg" title={uiText("features.diagnostics.EvidenceLookup.evidenz_88ffe3")} description={<code className="break-all text-xs">{reference}</code>}>
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
    <PanelLayout view="diagnostics.evidence"><LayoutPanel id="reference" title={uiText("features.diagnostics.EvidenceLookup.evidence_referenz_fd58d0")} span={2}>
      <Panel>
        <PanelHeader title={uiText("features.diagnostics.EvidenceLookup.referenz_auflosen_401785")} description={uiText("features.diagnostics.EvidenceLookup.exakte_aufgezeichnete_beobachtung_zu_einer_evide_7380c0")} />
        <div className="flex flex-col gap-3 p-4">
          <Field label={uiText("features.diagnostics.EvidenceLookup.evidence_referenz_fd58d0")}>{(p) => <Input {...p} className="font-mono text-xs" value={input} onChange={(e) => setInput(e.target.value)} />}</Field>
          <div><Button variant="primary" disabled={!input.trim()} onClick={() => setReference(input.trim())}>{uiText("features.diagnostics.EvidenceLookup.auflosen_6413ae")}</Button></div>
          {reference && <EvidenceResult reference={reference} />}
        </div>
      </Panel>
      </LayoutPanel><LayoutPanel id="source" title={uiText("features.diagnostics.EvidenceLookup.quellenbeobachtung_fd6643")} span={1}><Panel>
        <PanelHeader title={uiText("features.diagnostics.EvidenceLookup.aktuelle_beobachtung_einer_quelle_24715f")} description={uiText("features.diagnostics.EvidenceLookup.zuletzt_gespeicherte_beobachtungen_je_binding_4831bc")} />
        <div className="flex flex-col gap-3 p-4">
          <Field label={uiText("features.diagnostics.EvidenceLookup.source_id_a3a484")}>{(p) => <Input {...p} className="font-mono text-xs" placeholder={uiText("features.diagnostics.EvidenceLookup.source_beispiel_caba3c")} value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} />}</Field>
          <div><Button variant="primary" disabled={!sourceInput.trim()} onClick={() => setSourceId(sourceInput.trim())}>{uiText("features.diagnostics.EvidenceLookup.laden_00d5d2")}</Button></div>
          {source.isPending && sourceId && <Spinner />}
          {source.isError && <Notice tone="bad" title={uiText("features.diagnostics.EvidenceLookup.nicht_lesbar_05abf0")}>{describeError(source.error)}</Notice>}
          {source.data && (source.data.length === 0 ? <Notice tone="info" title={uiText("features.diagnostics.EvidenceLookup.keine_aktuelle_beobachtung_4e0775")} /> : <pre className="max-h-[50vh] overflow-auto rounded-[var(--radius-md)] bg-sunken p-3 text-xs">{JSON.stringify(source.data, null, 2)}</pre>)}
        </div>
      </Panel>
    </LayoutPanel></PanelLayout>
  );
}

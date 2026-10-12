import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ContractLiveState } from '@/components/ContractLiveState';
import { QualityBadge } from '@/components/status-parts';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/controls';
import { Field, Select } from '@/components/ui/form';
import { Empty, KeyValue, Notice, PageHeader, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { formatTime, shortId } from '@/lib/format';
import { useLive } from '@/lib/live-context';
import { useDiagnostics, useHistory } from '@/lib/queries';
import { CommandsPanel } from './CommandsPanel';
import { ContractDiagnosis } from './ContractDiagnosis';
import { EvidenceTab } from './EvidenceLookup';
import { HistoryTab, HistoryTable } from './HistoryTab';

function ContractPicker({ value, onChange, allowNone }: { value: string; onChange: (id: string) => void; allowNone?: boolean }) {
  const live = useLive();
  const ids = Object.keys(live.contracts ?? {}).sort();
  return (
    <Field label="Contract" className="max-w-md">
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          {allowNone && <option value="">— wählen —</option>}
          {value && !ids.includes(value) && <option value={value}>{value}</option>}
          {ids.map((id) => <option key={id} value={id}>{id}</option>)}
        </Select>
      )}
    </Field>
  );
}

function StateTab({ contractId, onContract }: { contractId: string; onContract: (id: string) => void }) {
  const live = useLive();
  const envelope = live.contracts?.[contractId] ?? null;
  const ids = Object.keys(live.contracts ?? {});
  if (live.contracts === null) return live.connection === 'open' || live.connection === 'connecting' ? <Spinner label="Snapshot wird erwartet …" /> : <Notice tone="warn" title="Noch kein Live-Zustand">Es wurde noch kein Snapshot empfangen ({live.connection}).</Notice>;
  if (ids.length === 0) return <Empty title="Keine aktiven Contracts">Die aktive Registry enthält keine aktivierten Contracts oder es ist keine Registry aktiv.</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <ContractPicker value={contractId} onChange={onContract} allowNone />
      {envelope ? <ContractLiveState envelope={envelope} stale={live.stale} /> : <p className="text-sm text-muted">Contract wählen, um Felder, Quality, Reasons und Evidence zu sehen.</p>}
    </div>
  );
}

function PublicationsTab() {
  const live = useLive();
  const diagnostics = useDiagnostics(10_000);
  const publications = useHistory('contracts', { limit: 50 });
  const gaps = useHistory('gaps', { limit: 50 });
  const epochs = useMemo(() => {
    const seen = new Map<string, { first: string; last: string; maxSeq: number }>();
    for (const item of publications.data?.pages.flatMap((p) => p.items) ?? []) {
      const epoch = typeof item.epoch_id === 'string' ? item.epoch_id : null;
      const at = typeof item.published_at === 'string' ? item.published_at : typeof item.at === 'string' ? item.at : '';
      if (!epoch) continue;
      const prev = seen.get(epoch);
      const seq = Number(item.publication_seq ?? 0);
      seen.set(epoch, { first: prev && prev.first < at ? prev.first : at, last: prev && prev.last > at ? prev.last : at, maxSeq: Math.max(prev?.maxSeq ?? 0, seq) });
    }
    return [...seen.entries()];
  }, [publications.data]);
  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader title="Aktuelle Veröffentlichung" />
        <div className="p-4">
          <KeyValue
            items={[
              { label: 'Epoche', value: <code>{shortId(live.epochId ?? diagnostics.data?.epoch_id ?? '–', 16)}</code> },
              { label: 'Publication-Sequenz', value: live.publicationSeq ?? diagnostics.data?.publication_seq ?? '–' },
              { label: 'Registry-Revision', value: live.registryRevision ?? '–' },
              { label: 'Bestätigt', value: live.publicationConfirmed === null ? '–' : live.publicationConfirmed ? 'ja' : <Badge tone="warn">nein</Badge> },
              { label: 'Neu synchronisiert', value: `${live.resyncCount}×` },
            ]}
          />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Epochen" description="Aus den geladenen Historienzeilen abgeleitet; eine neue Epoche erzwingt für Clients einen frischen Snapshot." />
        <div className="p-2">
          {epochs.length === 0 ? <p className="p-3 text-sm text-muted">Keine Epochen in den geladenen Zeilen.</p> : (
            <ul className="divide-y divide-line">
              {epochs.map(([id, e]) => <li key={id} className="flex flex-wrap items-center gap-3 px-2 py-2 text-sm"><code className="text-xs">{shortId(id, 16)}</code><span className="text-xs text-muted">{formatTime(e.first)} – {formatTime(e.last)}</span><Badge>max. Seq {e.maxSeq}</Badge></li>)}
            </ul>
          )}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Lücken (History Gaps)" description="Unterbrechungen der Beobachtungs-Kontinuität; betroffene Felder tragen den Grund history_gap." />
        <div className="p-4"><HistoryTable kind="gaps" filters={{ limit: 50 }} /></div>
        {gaps.isSuccess && diagnostics.data && diagnostics.data.gaps.length > 0 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Aktuelle Diagnose meldet {diagnostics.data.gaps.length} Lücke(n) im Laufzeitspeicher.</p>}
      </Panel>
      <Panel>
        <PanelHeader title="Veröffentlichungen" description="Persistierte Contract-Zustände mit Epoche und Sequenz." />
        <div className="p-4">
          <HistoryTable
            kind="contracts"
            filters={{ limit: 50 }}
            columns={[
              { header: 'Contract', render: (i) => <code>{String(i.contract_id ?? '–')}</code> },
              { header: 'Epoche', render: (i) => <code>{shortId(String(i.epoch_id ?? '–'), 10)}</code> },
              { header: 'Seq', render: (i) => String(i.publication_seq ?? '–') },
              { header: 'Revision', render: (i) => String(i.registry_revision ?? '–') },
              { header: 'Gesundheit', render: (i) => (i.contract_health === 'healthy' || i.contract_health === 'degraded' ? <QualityBadge quality={i.contract_health} /> : '–') },
            ]}
          />
        </div>
      </Panel>
    </div>
  );
}

export default function DiagnosticsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'state';
  const contract = params.get('contract') ?? '';
  const set = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) (v ? merged.set(k, v) : merged.delete(k));
    setParams(merged, { replace: true });
  };
  return (
    <>
      <PageHeader title="Diagnose & Historie" description="Was der Server tatsächlich weiß: Werte, Quality, Reasons, Evidence, Explain, Temporal-/Restore-Zustand, Machine, Historie und Commands. Es werden keine Werte oder Übergänge erfunden." />
      <Tabs
        value={tab}
        onValueChange={(t) => set({ tab: t })}
        items={[
          { value: 'state', label: 'Live-Zustand', content: <StateTab contractId={contract} onContract={(id) => set({ contract: id })} /> },
          {
            value: 'diagnosis',
            label: 'Contract-Diagnose',
            content: (
              <div className="flex flex-col gap-4">
                <ContractPicker value={contract} onChange={(id) => set({ contract: id })} allowNone />
                {contract ? <ContractDiagnosis contractId={contract} /> : <p className="text-sm text-muted">Contract wählen für Explain, Temporal, Restore und State Machine.</p>}
              </div>
            ),
          },
          { value: 'history', label: 'Historie', content: <HistoryTab key={contract} initialContract={contract} /> },
          { value: 'publications', label: 'Publikationen & Lücken', content: <PublicationsTab /> },
          { value: 'evidence', label: 'Evidence', content: <EvidenceTab /> },
          { value: 'commands', label: 'Commands', content: <CommandsPanel contractId={contract} onContract={(id) => set({ contract: id })} /> },
        ]}
      />
    </>
  );
}

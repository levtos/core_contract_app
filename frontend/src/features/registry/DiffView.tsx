import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Collapsible } from '@/components/ui/controls';
import { Notice } from '@/components/ui/layout';
import { ContractLink } from '@/components/status-parts';
import { pluralize } from '@/lib/format';
import type { Diff } from '@/lib/types';

const GROUP_LABELS: Record<string, string> = {
  dependencies: 'Dependencies',
  sources: 'Sources',
  bindings: 'Bindings',
  catalogs: 'Kataloge',
  contracts: 'Contracts',
  definitions: 'Definitionen',
};

function Chips({ items, tone = 'neutral', link }: { items: string[]; tone?: 'neutral' | 'ok' | 'bad' | 'warn' | 'accent'; link?: boolean }) {
  if (items.length === 0) return <span className="text-xs text-faint">–</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((item) => (link ? <ContractLink key={item} id={item} /> : <Badge key={item} tone={tone}>{item}</Badge>))}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-1.5 sm:grid-cols-[13rem_1fr]">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/**
 * Static semantic diff and impact analysis as delivered by the server. It never
 * predicts values (`predicts_values: false`); it lists what an activation would
 * change and which contexts might be re-initialized.
 */
export function DiffView({ diff, against }: { diff: Diff; against?: string }) {
  const groups = Object.entries(diff.objects).filter(([, g]) => g.added.length + g.removed.length + g.changed.length > 0);
  const nothing = groups.length === 0 && diff.affected_contracts.length === 0 && !diff.fingerprint_version.context_migration;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Statische Analyse{against ? ` gegen ${against}` : ''}: Es werden weder Entwürfe ausgewertet noch Werte vorhergesagt.
      </p>
      {nothing && <Notice tone="info" title="Keine Änderung gegenüber der aktiven Revision" />}
      {diff.fingerprint_version.context_migration && (
        <Notice tone="warn" title="Fingerprint-Version wechselt">
          Von {String(diff.fingerprint_version.before)} auf {diff.fingerprint_version.after}: betroffene Kontexte werden neu initialisiert (Kontextmigration). Zeitkontexte starten dabei neu.
        </Notice>
      )}
      <dl className="divide-y divide-line rounded-[var(--radius-md)] border border-line px-3">
        <Row label="Contracts hinzugefügt"><Chips items={diff.added} tone="ok" link /></Row>
        <Row label="Contracts entfernt"><Chips items={diff.removed} tone="bad" /></Row>
        <Row label="Contracts geändert"><Chips items={diff.changed} tone="warn" link /></Row>
        <Row label="Direkt betroffen"><Chips items={diff.directly_affected_contracts} link /></Row>
        <Row label="Transitiv betroffen"><Chips items={diff.transitively_affected_contracts} link /></Row>
        <Row label="Geänderte Fingerprints"><Chips items={diff.fingerprint_changes} tone="warn" /></Row>
        <Row label="Mögliche Neuinitialisierung"><Chips items={diff.possibly_invalidated_contexts} tone="warn" link /></Row>
        <Row label="Identitätswechsel Quellen"><Chips items={diff.source_identity_changes} tone="warn" /></Row>
        <Row label="Identitätswechsel Bindings"><Chips items={diff.binding_identity_changes} tone="warn" /></Row>
        <Row label="Fristen bleiben erhalten">{diff.restore.retains_absolute_deadlines_if_compatible ? 'ja, bei kompatiblem Fingerprint' : 'nein'}</Row>
        <Row label="Snapshot">{diff.snapshot.revision_changes ? `neue Revision; ${pluralize(diff.snapshot.affected_contracts.length, 'Contract', 'Contracts')} im Snapshot betroffen` : 'unverändert'}</Row>
      </dl>
      {groups.map(([name, group]) => (
        <Collapsible key={name} title={`${GROUP_LABELS[name] ?? name}: ${group.added.length} neu · ${group.changed.length} geändert · ${group.removed.length} entfernt`} defaultOpen={groups.length <= 2}>
          <dl>
            <Row label="Hinzugefügt"><Chips items={group.added} tone="ok" /></Row>
            <Row label="Entfernt"><Chips items={group.removed} tone="bad" /></Row>
            <Row label="Geändert"><Chips items={group.changed} tone="warn" /></Row>
          </dl>
          {group.changed.map((key) => (
            <div key={key} className="mt-2 rounded-[var(--radius-sm)] border border-line p-2">
              <p className="font-mono text-xs font-medium">{key}</p>
              <p className="mt-1 text-xs text-muted">Felder: {(group.fields[key] ?? []).join(', ') || '–'}</p>
              <ul className="mt-1 max-h-40 overflow-auto font-mono text-[11px] text-muted">
                {(group.field_paths[key] ?? []).map((path) => <li key={path}>{path}</li>)}
              </ul>
              {group.field_paths_truncated.includes(key) && <p className="mt-1 text-xs text-warn">Pfadliste gekürzt (Server-Limit 1 024).</p>}
            </div>
          ))}
        </Collapsible>
      ))}
      {Object.keys(diff.affected_fields).length > 0 && (
        <Collapsible title="Betroffene Ausgabefelder (konservativ)">
          <ul className="space-y-1 text-sm">
            {Object.entries(diff.affected_fields).map(([id, fields]) => (
              <li key={id} className="flex flex-wrap items-center gap-2"><Link to={`/contracts/${encodeURIComponent(id)}`} className="font-mono text-xs text-accent hover:underline">{id}</Link>{fields.map((f) => <Badge key={f}>{f}</Badge>)}</li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

import { t as uiText } from '@/i18n';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Collapsible } from '@/components/ui/controls';
import { Notice } from '@/components/ui/layout';
import { ContractLink } from '@/components/status-parts';
import type { Diff } from '@/lib/types';
import { changedObjectCount } from '@/lib/diff';

const GROUP_LABELS: Record<string, string> = {
  dependencies: uiText("features.registry.DiffView.dependencies_2e41b1"),
  sources: uiText("features.registry.DiffView.sources_caf85b"),
  bindings: uiText("features.registry.DiffView.bindings_7697ab"),
  catalogs: uiText("features.registry.DiffView.kataloge_daf282"),
  contracts: uiText("features.registry.DiffView.contracts_0488ac"),
  definitions: uiText("features.registry.DiffView.definitionen_871a91"),
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
  const added = new Set([...diff.added, ...Object.values(diff.objects).flatMap((group) => group.added)]);
  const restarted = diff.possibly_invalidated_contexts.filter((id) => !added.has(id));
  const migrating = diff.fingerprint_version.context_migration && diff.fingerprint_version.before !== null;
  return (
    <div className="flex flex-col gap-4">
      <p aria-label={uiText('alpha7.draft.changeCount')} className="text-sm font-medium">{uiText(changedObjectCount(diff) === 1 ? 'alpha7.draft.oneChange' : 'alpha7.draft.changes', { count: changedObjectCount(diff) })}</p>
      <p className="text-xs text-muted">
        {uiText("features.registry.DiffView.statische_analyse_929ff1")}{against ? uiText("features.registry.DiffView.gegen_v0_0e5182", { v0: (against) }) : ''}{uiText("features.registry.DiffView.es_werden_weder_entwurfe_ausgewertet_noch_werte__5b260d")}</p>
      {nothing && <Notice tone="info" title={uiText("features.registry.DiffView.keine_anderung_gegenuber_der_aktiven_revision_b4a476")} />}
      {diff.fingerprint_version.before === null && !nothing && <p className="text-sm text-muted">{uiText('alpha7.versions.firstStart')}</p>}
      {migrating && (
        <Notice tone="warn" title={uiText("features.registry.DiffView.fingerprint_version_wechselt_b60a4b")}>
          {uiText("features.registry.DiffView.von_704f87")}{String(diff.fingerprint_version.before)} {uiText("features.registry.DiffView.auf_9d82d9")}{diff.fingerprint_version.after}{uiText("features.registry.DiffView.betroffene_kontexte_werden_neu_initialisiert_kon_b49c90")}</Notice>
      )}
      <dl className="divide-y divide-line rounded-[var(--radius-md)] border border-line px-3">
        <Row label={uiText("features.registry.DiffView.contracts_hinzugefugt_aa1b10")}><Chips items={diff.added} link /></Row>
        <Row label={uiText("features.registry.DiffView.contracts_entfernt_5c5965")}><Chips items={diff.removed} /></Row>
        <Row label={uiText("features.registry.DiffView.contracts_geandert_59d44d")}><Chips items={diff.changed} link /></Row>
        <Row label={uiText("features.registry.DiffView.direkt_betroffen_832e51")}><Chips items={diff.directly_affected_contracts} link /></Row>
        <Row label={uiText("features.registry.DiffView.transitiv_betroffen_ef01a8")}><Chips items={diff.transitively_affected_contracts} link /></Row>
        {restarted.length > 0 && <Row label={uiText("features.registry.DiffView.mogliche_neuinitialisierung_2361a0")}><Chips items={restarted} tone="warn" link /></Row>}
        <Row label={uiText("features.registry.DiffView.fristen_bleiben_erhalten_bcbfe1")}>{diff.restore.retains_absolute_deadlines_if_compatible ? uiText("features.registry.DiffView.ja_bei_kompatiblem_fingerprint_219c13") : uiText("features.registry.DiffView.nein_4d03db")}</Row>
        <Row label={uiText("features.registry.DiffView.snapshot_6ad27b")}>{diff.snapshot.revision_changes ? uiText(diff.snapshot.affected_contracts.length === 1 ? 'alpha7.versions.affectedOne' : 'alpha7.versions.affected', { n: diff.snapshot.affected_contracts.length }) : uiText("features.registry.DiffView.unverandert_85e10f")}</Row>
      </dl>
      {groups.map(([name, group]) => (
        <Collapsible key={name} title={uiText("features.registry.DiffView.v0_v1_neu_v2_geandert_v3_entfernt_80a78f", { v0: (GROUP_LABELS[name] ?? name), v1: (group.added.length), v2: (group.changed.length), v3: (group.removed.length) })} defaultOpen={groups.length <= 2}>
          <dl>
            <Row label={uiText("features.registry.DiffView.hinzugefugt_1625f5")}><Chips items={group.added} /></Row>
            <Row label={uiText("features.registry.DiffView.entfernt_d0124f")}><Chips items={group.removed} /></Row>
            <Row label={uiText("features.registry.DiffView.geandert_d63c93")}><Chips items={group.changed} /></Row>
          </dl>
          {group.changed.map((key) => (
            <div key={key} className="mt-2 rounded-[var(--radius-sm)] border border-line p-2">
              <p className="font-mono text-xs font-medium">{key}</p>
              <p className="mt-1 text-xs text-muted">{uiText("features.registry.DiffView.felder_ad2dff")}{(group.fields[key] ?? []).join(', ') || '–'}</p>
              <ul className="mt-1 max-h-40 overflow-auto font-mono text-[11px] text-muted">
                {(group.field_paths[key] ?? []).map((path) => <li key={path}>{path}</li>)}
              </ul>
              {group.field_paths_truncated.includes(key) && <p className="mt-1 text-xs text-warn">{uiText("features.registry.DiffView.pfadliste_gekurzt_server_limit_1_024_344b24")}</p>}
            </div>
          ))}
        </Collapsible>
      ))}
      <Collapsible title={uiText('alpha7.versions.technicalDiff')}>
        <dl>
          <Row label={uiText("features.registry.DiffView.geanderte_fingerprints_eb5466")}><Chips items={diff.fingerprint_changes} /></Row>
          <Row label={uiText("features.registry.DiffView.identitatswechsel_quellen_9211e3")}><Chips items={diff.source_identity_changes} /></Row>
          <Row label={uiText("features.registry.DiffView.identitatswechsel_bindings_3f8a12")}><Chips items={diff.binding_identity_changes} /></Row>
        </dl>
      </Collapsible>
      {Object.keys(diff.affected_fields).length > 0 && (
        <Collapsible title={uiText("features.registry.DiffView.betroffene_ausgabefelder_konservativ_1da6f9")}>
          <ul className="space-y-1 text-sm">
            {Object.entries(diff.affected_fields).map(([id, fields]) => (
              <li key={id} className="flex flex-wrap items-center gap-2"><Link to={`/contracts/view/${encodeURIComponent(id)}`} className="font-mono text-xs text-fg hover:underline">{id}</Link>{fields.map((f) => <Badge key={f}>{f}</Badge>)}</li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

import { Copy, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MasterDetail } from '@/components/MasterDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Empty, PageHeader } from '@/components/ui/layout';
import { ReadOnlyNotice } from '@/features/authoring/DraftBar';
import { useAllIssues } from '@/features/authoring/issues';
import { asArray, str, uniqueName } from '@/features/authoring/model';
import { bindingsUsingCatalog, consumersOfSource, sourcesUsingDependency } from '@/features/authoring/usage';
import { useAuthoringSource } from '@/features/authoring/useAuthoringSource';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { BindingEditor, CatalogEditor, DependencyEditor, EntityPicker, SourceEditor } from '@/editors/RegistryObjects';
import { clone, isObject, setAt, type JsonObject } from '@/lib/json';
import { useCapabilities } from '@/lib/queries';

type Name = 'dependencies' | 'sources' | 'bindings' | 'catalogs';

interface CollectionProps {
  name: Name;
  idKey: string;
  singular: string;
  make: (config: JsonObject, ids: string[]) => JsonObject;
  render: (item: JsonObject, pointer: string, onChange: (next: JsonObject) => void, config: JsonObject) => ReactNode;
  subtitle: (item: JsonObject) => string;
  usage: (item: JsonObject, config: JsonObject) => ReactNode;
  copyKeys?: string[];
}

function Collection({ name, idKey, singular, make, render, subtitle, usage }: CollectionProps) {
  const src = useAuthoringSource();
  const doc = useWorkingDocument();
  const issues = useAllIssues();
  const config = src.config ?? {};
  const list = useMemo(() => asArray(config[name]).filter(isObject), [config, name]);
  const [params] = useSearchParams();
  const initial = params.get('tab') === name && params.get('item') !== null ? Number(params.get('item')) : null;
  const [selected, setSelected] = useState<number | null>(Number.isInteger(initial) ? initial : null);
  const [removing, setRemoving] = useState<number | null>(null);
  useEffect(() => {
    if (selected !== null && selected >= list.length) setSelected(list.length ? list.length - 1 : null);
  }, [list.length, selected]);

  const ids = list.map((item) => str(item[idKey]));
  const items = list.map((item, index) => ({
    key: String(index),
    label: str(item[idKey]),
    sub: subtitle(item),
    errors: issues.filter((i) => i.path === `/${name}/${index}` || i.path.startsWith(`/${name}/${index}/`)).length,
  }));
  const add = () => {
    doc.edit((c) => setAt(c, `/${name}`, [...asArray(c[name]), make(c, ids)]));
    setSelected(list.length);
  };
  const duplicate = (index: number) => {
    const copy = clone(list[index]!);
    copy[idKey] = uniqueName(`${str(copy[idKey])}_kopie`, ids);
    doc.edit((c) => setAt(c, `/${name}`, [...asArray(c[name]), copy]));
    setSelected(list.length);
  };
  const current = selected !== null ? list[selected] : undefined;

  return (
    <>
      <MasterDetail
        title={singular}
        items={items}
        selected={current ? String(selected) : null}
        onSelect={(key) => setSelected(Number(key))}
        onAdd={src.editable ? add : undefined}
        addLabel={`${singular} hinzufügen`}
        empty={<Empty title={`${singular} wählen`}>{src.editable ? 'Wählen Sie links einen Eintrag oder legen Sie mit „+“ einen neuen an.' : 'Wählen Sie links einen Eintrag zur Ansicht.'}</Empty>}
      >
        {current && selected !== null && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm font-semibold">{str(current[idKey]) || `(neu)`}</h2>
              {src.editable && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => duplicate(selected)}><Copy size={13} /> Duplizieren</Button>
                  <Button size="sm" variant="danger" onClick={() => setRemoving(selected)}><Trash2 size={13} /> Entfernen</Button>
                </div>
              )}
            </div>
            <div className="text-xs text-muted">{usage(current, config)}</div>
            <fieldset disabled={!src.editable} className="min-w-0">
              {render(current, `/${name}/${selected}`, (next) => doc.edit((c) => setAt(c, `/${name}/${selected}`, next)), config)}
            </fieldset>
          </div>
        )}
      </MasterDetail>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`${singular} entfernen?`}
        description={<>„{removing !== null ? str(list[removing]?.[idKey]) : ''}“ wird aus dem Draft entfernt. Verweise darauf werden nicht automatisch angepasst; die Validierung zeigt offene Referenzen.</>}
        confirmLabel="Entfernen"
        tone="danger"
        onConfirm={() => {
          if (removing !== null) doc.edit((c) => setAt(c, `/${name}/${removing}`, undefined));
          setRemoving(null);
          setSelected(null);
        }}
      />
    </>
  );
}

const chips = (label: string, ids: string[], to?: (id: string) => string) =>
  ids.length === 0 ? (
    <span>{label}: –</span>
  ) : (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {label}:
      {ids.slice(0, 8).map((id) => (to ? <Link key={id} to={to(id)} className="rounded-full border border-line-strong bg-raised px-2 py-0.5 font-mono text-[11px] text-accent hover:border-accent/60">{id}</Link> : <Badge key={id}>{id}</Badge>))}
      {ids.length > 8 && <span>+{ids.length - 8}</span>}
    </span>
  );

export default function SourcesPage() {
  const caps = useCapabilities();
  const [params, setParams] = useSearchParams();
  const [picker, setPicker] = useState<null | ((entityId: string, attributes: string[]) => void)>(null);
  const registrySchema = caps.data?.schemas.registry;
  return (
    <>
      <PageHeader title="Sources & Bindings" description="Quellen, ihre Frische und Herkunft, Bindings an Home Assistant oder MQTT samt Transformationen, Kataloge und Dependencies." />
      <ReadOnlyNotice what="Sources & Bindings" />
      <Tabs
        value={params.get('tab') ?? 'sources'}
        onValueChange={(tab) => setParams({ tab }, { replace: true })}
        items={[
          {
            value: 'sources',
            label: 'Sources',
            content: (
              <Collection
                name="sources"
                idKey="source_id"
                singular="Source"
                subtitle={(s) => `${str(s.source_type)} · ${str((isObject(s.freshness) ? s.freshness : {}).mode)}`}
                make={(c, ids) => ({
                  source_id: uniqueName('source.neu', ids),
                  source_type: 'boolean',
                  source_origin: 'local',
                  freshness: { mode: 'event_stateful', future_tolerance_s: 1 },
                  dependency_id: str(asArray(c.dependencies).filter(isObject)[0]?.dependency_id),
                  physical_source_key: uniqueName('physical.neu', asArray(c.sources).filter(isObject).map((s) => str(s.physical_source_key))),
                })}
                usage={(item, config) => {
                  const used = consumersOfSource(config, str(item.source_id));
                  return <span className="flex flex-col gap-1">{chips('Bindings', used.bindings)}{chips('Contracts', used.contracts, (id) => `/contracts/${encodeURIComponent(id)}`)}{used.sources.length > 0 && chips('Liveness für', used.sources)}</span>;
                }}
                render={(item, pointer, onChange, config) => (
                  <SourceEditor
                    value={item}
                    pointer={pointer}
                    onChange={onChange}
                    schema={registrySchema}
                    dependencyIds={asArray(config.dependencies).filter(isObject).map((d) => str(d.dependency_id))}
                    sourceIds={asArray(config.sources).filter(isObject).map((s) => str(s.source_id))}
                  />
                )}
              />
            ),
          },
          {
            value: 'bindings',
            label: 'Bindings',
            content: (
              <Collection
                name="bindings"
                idKey="binding_id"
                singular="Binding"
                subtitle={(b) => `${str((isObject(b.adapter) ? b.adapter : {}).kind)} → ${str(b.source_id)}`}
                make={(c, ids) => ({ binding_id: uniqueName('binding.neu', ids), source_id: str(asArray(c.sources).filter(isObject)[0]?.source_id), adapter: { kind: 'ha_state' } })}
                usage={(item, config) => (
                  <span className="flex flex-col gap-1">
                    {chips('Quelle', [str(item.source_id)].filter(Boolean))}
                    {chips('Contracts über diese Quelle', consumersOfSource(config, str(item.source_id)).contracts, (id) => `/contracts/${encodeURIComponent(id)}`)}
                  </span>
                )}
                render={(item, pointer, onChange, config) => (
                  <BindingEditor
                    value={item}
                    pointer={pointer}
                    onChange={onChange}
                    schema={registrySchema}
                    sourceIds={asArray(config.sources).filter(isObject).map((s) => str(s.source_id))}
                    catalogIds={asArray(config.catalogs).filter(isObject).map((c) => str(c.catalog_id))}
                    onPickEntity={(apply) => setPicker(() => apply)}
                  />
                )}
              />
            ),
          },
          {
            value: 'catalogs',
            label: 'Kataloge',
            content: (
              <Collection
                name="catalogs"
                idKey="catalog_id"
                singular="Katalog"
                subtitle={(c) => `v${String(c.version ?? 1)} · ${Object.keys(isObject(c.entries) ? c.entries : {}).length} Einträge`}
                make={(_, ids) => ({ catalog_id: uniqueName('catalog.neu', ids), kind: 'map', version: 1, entries: { an: true } })}
                usage={(item, config) => chips('Verwendet von Bindings', bindingsUsingCatalog(config, str(item.catalog_id)))}
                render={(item, pointer, onChange) => <CatalogEditor value={item} pointer={pointer} onChange={onChange} />}
              />
            ),
          },
          {
            value: 'dependencies',
            label: 'Dependencies',
            content: (
              <Collection
                name="dependencies"
                idKey="dependency_id"
                singular="Dependency"
                subtitle={(d) => `${str(d.kind)} · ${str(d.monitor)}`}
                make={(_, ids) => ({ dependency_id: uniqueName('dep.neu', ids), kind: 'ha', monitor: 'internal' })}
                usage={(item, config) => chips('Quellen', sourcesUsingDependency(config, str(item.dependency_id)))}
                render={(item, pointer, onChange, config) => (
                  <DependencyEditor value={item} pointer={pointer} onChange={onChange} schema={registrySchema} sourceIds={asArray(config.sources).filter(isObject).map((s) => str(s.source_id))} />
                )}
              />
            ),
          },
        ]}
      />
      <EntityPicker open={picker !== null} onOpenChange={(o) => !o && setPicker(null)} onPick={(entity, attributes) => picker?.(entity, attributes)} />
    </>
  );
}

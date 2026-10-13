import { Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Notice, Spinner } from '@/components/ui/layout';
import { typeKey, type RefOption, type TypeEntry } from '@/features/authoring/catalog';
import { asArray, asObject, newFieldSchema, str, type FieldSchema } from '@/features/authoring/model';
import { enumAt, requiredWhen, type JsonSchema } from '@/lib/capabilities';
import { join, type Json, type JsonObject } from '@/lib/json';
import { useHaEntities } from '@/lib/queries';
import { AddButton, Fld, IconButton, IssuesAt, NumberField, SectionTitle } from './common';
import { FieldSchemaEditor } from './FieldSchemaEditor';
import { ValueEditor } from './ValueEditor';
import { SchemaForm } from './SchemaForm';
import { Extras } from './Extras';

function patcher(value: JsonObject, onChange: (next: JsonObject) => void) {
  return (patch: Record<string, Json | undefined>) => {
    const next: JsonObject = { ...value };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') delete next[k];
      else next[k] = v;
    }
    onChange(next);
  };
}

/* ───────────────────────────── Dependency ───────────────────────────── */

export function DependencyEditor({ value, onChange, pointer, sourceIds, schema }: { value: JsonObject; onChange: (n: JsonObject) => void; pointer: string; sourceIds: string[]; schema?: JsonSchema }) {
  const set = patcher(value, onChange);
  const needsSource = requiredWhen(schema, 'Dependency', 'monitor', str(value.monitor)).includes('source_id') || value.monitor === 'source';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Fld label="Dependency-ID" pointer={join(pointer, 'dependency_id')}>
        {(p) => <Input {...p} value={str(value.dependency_id)} onChange={(e) => set({ dependency_id: e.target.value })} />}
      </Fld>
      <Fld label="Art" pointer={join(pointer, 'kind')}>
        {(p) => (
          <Select {...p} value={str(value.kind)} onChange={(e) => set({ kind: e.target.value })}>
            {enumAt(schema, 'Dependency', 'kind', ['ha', 'mqtt', 'other']).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Select>
        )}
      </Fld>
      <Fld label="Überwachung" pointer={join(pointer, 'monitor')} hint="internal: die App überwacht selbst; source: eine Quelle meldet die Erreichbarkeit.">
        {(p) => (
          <Select {...p} value={str(value.monitor)} onChange={(e) => set({ monitor: e.target.value, ...(e.target.value === 'internal' ? { source_id: undefined } : {}) })}>
            {enumAt(schema, 'Dependency', 'monitor', ['internal', 'source']).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Select>
        )}
      </Fld>
      <div className="sm:col-span-2"><Extras def="Dependency" value={value} pointer={pointer} onChange={onChange} /></div>
      {needsSource && (
        <Fld label="Überwachende Quelle" pointer={join(pointer, 'source_id')}>
          {(p) => (
            <Select {...p} value={str(value.source_id)} onChange={(e) => set({ source_id: e.target.value })}>
              <option value="">— wählen —</option>
              {sourceIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </Select>
          )}
        </Fld>
      )}
    </div>
  );
}

/* ─────────────────────────────── Source ─────────────────────────────── */

export function SourceEditor({ value, onChange, pointer, dependencyIds, sourceIds, schema }: { value: JsonObject; onChange: (n: JsonObject) => void; pointer: string; dependencyIds: string[]; sourceIds: string[]; schema?: JsonSchema }) {
  const set = patcher(value, onChange);
  const freshness = asObject(value.freshness);
  const mode = str(freshness.mode);
  const required = requiredWhen(schema, 'Freshness', 'mode', mode);
  const setFreshness = (patch: Record<string, Json | undefined>) => {
    const next: JsonObject = { ...freshness };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') delete next[k];
      else next[k] = v;
    }
    onChange({ ...value, freshness: next });
  };
  const hasSchema = value.value_schema !== undefined && value.value_schema !== null;
  const fp = join(pointer, 'freshness');
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Fld label="Source-ID" pointer={join(pointer, 'source_id')} hint="Beginnt mit „source.“">
          {(p) => <Input {...p} value={str(value.source_id)} onChange={(e) => set({ source_id: e.target.value })} />}
        </Fld>
        <Fld label="Anzeigename" pointer={join(pointer, 'display_name')}>
          {(p) => <Input {...p} value={str(value.display_name)} onChange={(e) => set({ display_name: e.target.value })} />}
        </Fld>
        <Fld label="Typ" pointer={join(pointer, 'source_type')}>
          {(p) => (
            <Select {...p} value={str(value.source_type)} onChange={(e) => set({ source_type: e.target.value })}>
              {enumAt(schema, 'Source', 'source_type', ['state', 'attribute', 'event', 'numeric', 'text', 'boolean']).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          )}
        </Fld>
        <Fld label="Herkunft" pointer={join(pointer, 'source_origin')} hint="z. B. local">
          {(p) => <Input {...p} value={str(value.source_origin)} onChange={(e) => set({ source_origin: e.target.value })} />}
        </Fld>
        <Fld label="Physischer Schlüssel" pointer={join(pointer, 'physical_source_key')} hint="Identität der physischen Messung; verhindert doppelte Evidenz.">
          {(p) => <Input {...p} value={str(value.physical_source_key)} onChange={(e) => set({ physical_source_key: e.target.value })} />}
        </Fld>
        <Fld label="Dependency" pointer={join(pointer, 'dependency_id')}>
          {(p) => (
            <Select {...p} value={str(value.dependency_id)} onChange={(e) => set({ dependency_id: e.target.value })}>
              {!dependencyIds.includes(str(value.dependency_id)) && <option value={str(value.dependency_id)}>{str(value.dependency_id) || '— wählen —'}</option>}
              {dependencyIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </Select>
          )}
        </Fld>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Frische (Freshness)</SectionTitle>
        <IssuesAt pointer={fp} />
        <div className="grid gap-3 sm:grid-cols-4">
          <Fld label="Modus" pointer={join(fp, 'mode')} className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={mode} onChange={(e) => setFreshness({ mode: e.target.value })}>
                {enumAt(schema, 'Freshness', 'mode', ['report_heartbeat', 'liveness_source', 'periodic_ttl', 'event_stateful']).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Select>
            )}
          </Fld>
          <NumberField label="Zukunftstoleranz (s)" pointer={join(fp, 'future_tolerance_s')} min={0} value={Number(freshness.future_tolerance_s ?? 0)} onChange={(n) => setFreshness({ future_tolerance_s: n })} />
          {(required.includes('interval_s') || freshness.interval_s !== undefined) && (
            <NumberField label={`Intervall (s)${required.includes('interval_s') ? ' *' : ''}`} pointer={join(fp, 'interval_s')} min={0} value={Number(freshness.interval_s ?? 60)} onChange={(n) => setFreshness({ interval_s: n })} />
          )}
        </div>
        {(required.includes('liveness_source') || freshness.liveness_source !== undefined) && (
          <Fld label="Liveness-Quelle *" pointer={join(fp, 'liveness_source')}>
            {(p) => (
              <Select {...p} value={str(freshness.liveness_source)} onChange={(e) => setFreshness({ liveness_source: e.target.value })}>
                <option value="">— wählen —</option>
                {sourceIds.filter((id) => id !== str(value.source_id)).map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </Select>
            )}
          </Fld>
        )}
        {mode === 'event_stateful' && <p className="text-xs text-muted">Zustandsbasiert: gilt, bis ein neues Ereignis eintrifft; kein Intervall nötig.</p>}
        <Extras def="Freshness" value={freshness} pointer={fp} onChange={(next) => onChange({ ...value, freshness: next })} />
      </section>

      <section className="flex flex-col gap-2">
        <Switch checked={hasSchema} onCheckedChange={(on) => set({ value_schema: on ? newFieldSchema('number') : undefined })} label="Eigenes Wertschema deklarieren (value_schema)" />
        <p className="text-xs text-muted">Quellen der Typen boolean/numeric/text haben ihren Eingangstyp bereits; andere benötigen ein Wertschema, bevor sie einen typisierten Eingang speisen.</p>
        {hasSchema && <FieldSchemaEditor pointer={join(pointer, 'value_schema')} value={asObject(value.value_schema) as FieldSchema} onChange={(next) => set({ value_schema: next })} />}
      </section>
      <Extras def="Source" value={value} pointer={pointer} onChange={onChange} />
    </div>
  );
}

/* ─────────────────────────────── Binding ────────────────────────────── */

export function BindingEditor({ value, onChange, pointer, sourceIds, catalogIds, schema, onPickEntity }: { value: JsonObject; onChange: (n: JsonObject) => void; pointer: string; sourceIds: string[]; catalogIds: string[]; schema?: JsonSchema; onPickEntity: (apply: (entityId: string, attributes: string[]) => void) => void }) {
  const set = patcher(value, onChange);
  const adapter = asObject(value.adapter);
  const kind = str(adapter.kind);
  const required = requiredWhen(schema, 'AdapterConfig', 'kind', kind);
  const ap = join(pointer, 'adapter');
  const setAdapter = (patch: Record<string, Json | undefined>) => {
    const next: JsonObject = { ...adapter };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') delete next[k];
      else next[k] = v;
    }
    onChange({ ...value, adapter: next });
  };
  const transform = value.transform === null || value.transform === undefined ? null : asObject(value.transform);
  const tp = join(pointer, 'transform');
  const setTransform = (next: JsonObject | undefined) => set({ transform: next });
  const transformKind = transform ? str(transform.kind) : '';
  const ha = kind.startsWith('ha_');

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Fld label="Binding-ID" pointer={join(pointer, 'binding_id')}>
          {(p) => <Input {...p} value={str(value.binding_id)} onChange={(e) => set({ binding_id: e.target.value })} />}
        </Fld>
        <Fld label="Quelle" pointer={join(pointer, 'source_id')}>
          {(p) => (
            <Select {...p} value={str(value.source_id)} onChange={(e) => set({ source_id: e.target.value })}>
              {!sourceIds.includes(str(value.source_id)) && <option value={str(value.source_id)}>{str(value.source_id) || '— wählen —'}</option>}
              {sourceIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </Select>
          )}
        </Fld>
        <Fld label="Anzeigename" pointer={join(pointer, 'display_name')}>
          {(p) => <Input {...p} value={str(value.display_name)} onChange={(e) => set({ display_name: e.target.value })} />}
        </Fld>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Adapter</SectionTitle>
        <IssuesAt pointer={ap} />
        <Fld label="Art" pointer={join(ap, 'kind')} className="max-w-xs">
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setAdapter({ kind: e.target.value })}>
              {enumAt(schema, 'AdapterConfig', 'kind', ['ha_state', 'ha_attribute', 'mqtt', 'scheduler']).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          )}
        </Fld>
        {ha && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Fld label="HA-Entität *" pointer={join(ap, 'ha_entity_id')} hint="Auswahl über die schreibgeschützte HA-Erkennung oder direkte Eingabe.">
              {(p) => (
                <div className="flex gap-2">
                  <Input {...p} className="font-mono text-xs" value={str(adapter.ha_entity_id)} placeholder="sensor.beispiel" onChange={(e) => setAdapter({ ha_entity_id: e.target.value })} />
                  <Button variant="outline" aria-label="HA-Entität auswählen" onClick={() => onPickEntity((entity, attributes) => setAdapter({ ha_entity_id: entity, ...(kind === 'ha_attribute' && attributes.length && !attributes.includes(str(adapter.ha_attribute)) ? { ha_attribute: undefined } : {}) }))}>
                    <Search size={14} /> Wählen
                  </Button>
                </div>
              )}
            </Fld>
            {(kind === 'ha_attribute' || required.includes('ha_attribute')) && (
              <Fld label="Attribut *" pointer={join(ap, 'ha_attribute')}>
                {(p) => <Input {...p} className="font-mono text-xs" value={str(adapter.ha_attribute)} onChange={(e) => setAdapter({ ha_attribute: e.target.value })} />}
              </Fld>
            )}
            <Fld label="Zeit-Attribut (optional)" pointer={join(ap, 'ha_time_attribute')} hint="Attribut mit dem Messzeitpunkt, falls vorhanden.">
              {(p) => <Input {...p} className="font-mono text-xs" value={str(adapter.ha_time_attribute)} onChange={(e) => setAdapter({ ha_time_attribute: e.target.value })} />}
            </Fld>
          </div>
        )}
        {kind === 'mqtt' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Fld label="Topic *" pointer={join(ap, 'mqtt_topic')}>
              {(p) => <Input {...p} className="font-mono text-xs" value={str(adapter.mqtt_topic)} onChange={(e) => setAdapter({ mqtt_topic: e.target.value })} />}
            </Fld>
            <Fld label="Wertpfad (optional)" pointer={join(ap, 'mqtt_value_path')} hint="Pfad im JSON-Payload">
              {(p) => <Input {...p} className="font-mono text-xs" value={str(adapter.mqtt_value_path)} onChange={(e) => setAdapter({ mqtt_value_path: e.target.value })} />}
            </Fld>
            <Fld label="Zeitpfad (optional)" pointer={join(ap, 'mqtt_time_path')}>
              {(p) => <Input {...p} className="font-mono text-xs" value={str(adapter.mqtt_time_path)} onChange={(e) => setAdapter({ mqtt_time_path: e.target.value })} />}
            </Fld>
          </div>
        )}
        <Extras def="AdapterConfig" value={adapter} pointer={ap} onChange={(next) => onChange({ ...value, adapter: next })} />
        {kind === 'scheduler' && <p className="text-xs text-muted">Der Scheduler ist kein Quellen-Adapter und wird vom Server abgelehnt, sofern er als Binding verwendet wird.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Transformation</SectionTitle>
        <IssuesAt pointer={tp} />
        <Fld label="Transformation" pointer={join(tp, 'kind')} className="max-w-xs">
          {(p) => (
            <Select
              {...p}
              value={transformKind}
              onChange={(e) => {
                const k = e.target.value;
                if (!k) return setTransform(undefined);
                setTransform(k === 'type_cast' ? { kind: k, target: 'number' } : k === 'unit_scale' ? { kind: k, factor: 1, offset: 0 } : { kind: k, catalog_id: catalogIds[0] ?? '' });
              }}
            >
              <option value="">keine</option>
              {enumAt(schema, 'Transform', 'kind', ['type_cast', 'unit_scale', 'map_ref']).map((k) => (
                <option key={k} value={k}>{k === 'type_cast' ? 'Typumwandlung' : k === 'unit_scale' ? 'Einheit skalieren' : 'Katalog-Zuordnung'}</option>
              ))}
            </Select>
          )}
        </Fld>
        {transform && transformKind === 'type_cast' && (
          <Fld label="Zieltyp" pointer={join(tp, 'target')} className="max-w-xs">
            {(p) => (
              <Select {...p} value={str(transform.target)} onChange={(e) => setTransform({ ...transform, target: e.target.value })}>
                {enumAt(schema, 'Transform', 'target', ['bool', 'number', 'text']).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Select>
            )}
          </Fld>
        )}
        {transform && transformKind === 'unit_scale' && (
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <NumberField label="Faktor" pointer={join(tp, 'factor')} value={Number(transform.factor ?? 1)} onChange={(n) => setTransform({ ...transform, factor: n })} hint="wert × Faktor + Offset" />
            <NumberField label="Offset" pointer={join(tp, 'offset')} value={Number(transform.offset ?? 0)} onChange={(n) => setTransform({ ...transform, offset: n })} />
          </div>
        )}
        {transform && transformKind === 'map_ref' && (
          <Fld label="Katalog" pointer={join(tp, 'catalog_id')} className="max-w-xs">
            {(p) => (
              <Select {...p} value={str(transform.catalog_id)} onChange={(e) => setTransform({ ...transform, catalog_id: e.target.value })}>
                {!catalogIds.includes(str(transform.catalog_id)) && <option value={str(transform.catalog_id)}>{str(transform.catalog_id) || '— wählen —'}</option>}
                {catalogIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </Select>
            )}
          </Fld>
        )}
        {transform && <Extras def="Transform" value={transform} pointer={tp} onChange={(next) => setTransform(next)} />}
      </section>
      <Extras def="Binding" value={value} pointer={pointer} onChange={onChange} />
    </div>
  );
}

/** Read-only HA entity discovery: choose an entity (never creates anything in Home Assistant). */
export function EntityPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (entityId: string, attributes: string[]) => void }) {
  const [search, setSearch] = useState('');
  const query = useHaEntities('all', open);
  const [pages, setPages] = useState(1);
  // A search can only see loaded pages: fetch the rest (bounded by the server's 10 000 entity cap).
  useEffect(() => {
    if (open && search && query.hasNextPage && !query.isFetchingNextPage && pages < 60) {
      setPages((n) => n + 1);
      void query.fetchNextPage();
    }
  }, [open, search, query, pages]);
  const all = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const needle = search.trim().toLowerCase();
  const shown = (needle ? all.filter((e) => e.entity_id.toLowerCase().includes(needle) || e.display_name.toLowerCase().includes(needle)) : all).slice(0, 300);
  const unavailable = query.isError;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Home-Assistant-Entität wählen" description="Schreibgeschützte Erkennung: es werden nur Kennungen und Attributnamen gelesen, keine Werte; in Home Assistant wird nichts angelegt oder geändert.">
      <div className="flex flex-col gap-3">
        <Input autoFocus aria-label="Entitäten durchsuchen" placeholder="Suchen nach Name oder entity_id …" value={search} onChange={(e) => setSearch(e.target.value)} />
        {query.isPending && <Spinner label="Entitäten werden gelesen …" />}
        {unavailable && <Notice tone="warn" title="Erkennung derzeit nicht verfügbar">Die Entitäten-ID kann trotzdem direkt im Feld eingegeben werden.</Notice>}
        <ul className="max-h-[50vh] divide-y divide-line overflow-auto rounded-[var(--radius-md)] border border-line">
          {shown.map((entity) => (
            <li key={entity.entity_id}>
              <button
                type="button"
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-raised"
                onClick={() => {
                  onPick(entity.entity_id, entity.attributes);
                  onOpenChange(false);
                }}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <code className="text-sm">{entity.entity_id}</code>
                  {entity.unit && <Badge>{entity.unit}</Badge>}
                  {entity.device_class && <Badge tone="info">{entity.device_class}</Badge>}
                </span>
                {entity.display_name !== entity.entity_id && <span className="text-xs text-muted">{entity.display_name}</span>}
                {entity.attributes.length > 0 && <span className="line-clamp-1 text-[11px] text-faint">Attribute: {entity.attributes.slice(0, 12).join(', ')}{entity.attributes.length > 12 ? ' …' : ''}</span>}
              </button>
            </li>
          ))}
          {!query.isPending && shown.length === 0 && !unavailable && <li className="px-3 py-6 text-center text-sm text-muted">Keine Treffer{query.hasNextPage ? ' (weitere Seiten werden geladen)' : ''}.</li>}
        </ul>
        {!needle && query.hasNextPage && (
          <div>
            <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              Weitere laden
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ─────────────────────────────── Catalog ────────────────────────────── */

export function CatalogEditor({ value, onChange, pointer }: { value: JsonObject; onChange: (n: JsonObject) => void; pointer: string }) {
  const set = patcher(value, onChange);
  const entries = Object.entries(asObject(value.entries));
  const setEntries = (next: [string, Json][]) => onChange({ ...value, entries: Object.fromEntries(next) });
  const keys = new Set(entries.map(([k]) => k));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Fld label="Katalog-ID" pointer={join(pointer, 'catalog_id')}>
          {(p) => <Input {...p} value={str(value.catalog_id)} onChange={(e) => set({ catalog_id: e.target.value })} />}
        </Fld>
        <Fld label="Art" pointer={join(pointer, 'kind')}>
          {(p) => <Input {...p} readOnly disabled value="map" />}
        </Fld>
        <NumberField label="Version" pointer={join(pointer, 'version')} min={1} step={1} value={Number(value.version ?? 1)} onChange={(n) => set({ version: Math.max(1, Math.trunc(n)) })} />
      </div>
      <SectionTitle
        aside={
          <AddButton
            onClick={() => {
              let n = 1;
              while (keys.has(`schluessel${n}`)) n += 1;
              setEntries([...entries, [`schluessel${n}`, '']]);
            }}
          >
            Eintrag
          </AddButton>
        }
      >
        Zuordnungen (Rohwert → Wert)
      </SectionTitle>
      <p className="text-xs text-muted">Schlüssel sind die Rohwerte der Quelle als Text (z. B. <code>on</code>); Werte werden per „map_ref“ eingesetzt.</p>
      <IssuesAt pointer={join(pointer, 'entries')} />
      {entries.map(([key, entry], i) => (
        <div key={i} className="grid items-start gap-2 rounded-[var(--radius-md)] border border-line p-2 sm:grid-cols-[minmax(10rem,16rem)_1fr_auto]">
          <Fld label="Rohwert" pointer={join(pointer, 'entries', key)}>
            {(p) => (
              <Input
                {...p}
                defaultValue={key}
                key={`${i}:${key}`}
                onBlur={(e) => {
                  const to = e.target.value;
                  if (to === key || keys.has(to)) return void (e.target.value = key);
                  setEntries(entries.map(([k, v], j) => (j === i ? [to, v] : [k, v])));
                }}
              />
            )}
          </Fld>
          <ValueEditor label={`Wert für ${key || '(leer)'}`} pointer={join(pointer, 'entries', key)} value={entry} onChange={(next) => setEntries(entries.map(([k, v], j) => (j === i ? [k, next] : [k, v])))} />
          <div className="pt-5">
            <IconButton label="Eintrag entfernen" tone="danger" onClick={() => setEntries(entries.filter((_, j) => j !== i))}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        </div>
      ))}
      <Extras def="Catalog" value={value} pointer={pointer} onChange={onChange} />
    </div>
  );
}

/* ────────────────────────── Contract instance ───────────────────────── */

export function ContractEditor({ value, onChange, pointer, types, refs }: { value: JsonObject; onChange: (n: JsonObject) => void; pointer: string; types: TypeEntry[]; refs: RefOption[] }) {
  const set = patcher(value, onChange);
  const key = typeKey(str(value.type_id), Number(value.type_version));
  const entry = types.find((t) => t.key === key);
  const inputs = asArray(value.inputs).map(asObject);
  const declared = entry?.inputs ?? [];
  const refFor = (name: string) => inputs.find((i) => str(i.name) === name);
  const setRef = (name: string, ref: string) => {
    const without = inputs.filter((i) => str(i.name) !== name);
    onChange({ ...value, inputs: ref ? [...without, { name, ref }].sort((a, b) => declared.findIndex((d) => d.name === str(a.name)) - declared.findIndex((d) => d.name === str(b.name))) : without });
  };
  const undeclared = inputs.filter((i) => !declared.some((d) => d.name === str(i.name)));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Fld label="Contract-ID" pointer={join(pointer, 'contract_id')} hint="z. B. wohnzimmer.licht">
          {(p) => <Input {...p} value={str(value.contract_id)} onChange={(e) => set({ contract_id: e.target.value })} />}
        </Fld>
        <Fld label="Anzeigename" pointer={join(pointer, 'display_name')}>
          {(p) => <Input {...p} value={str(value.display_name)} onChange={(e) => set({ display_name: e.target.value })} />}
        </Fld>
        <Fld label="Typ & Version" pointer={join(pointer, 'type_id')} hint={entry ? undefined : 'Dieser Typ ist weder als Paket-Typ noch als Definition bekannt.'}>
          {(p) => (
            <Select
              {...p}
              value={key}
              onChange={(e) => {
                const next = types.find((t) => t.key === e.target.value);
                if (next) onChange({ ...value, type_id: next.type_id, type_version: next.type_version, parameters: {} });
              }}
            >
              {!entry && <option value={key}>{key}</option>}
              {types.map((t) => (
                <option key={t.key} value={t.key}>{t.type_id} · v{t.type_version}{t.origin === 'draft-definition' ? ' (Draft-Definition)' : t.declarative ? ' (Definition)' : ' (Paket)'}</option>
              ))}
            </Select>
          )}
        </Fld>
        <div className="flex items-end pb-1.5">
          <Switch checked={value.enabled !== false} onCheckedChange={(on) => set({ enabled: on })} label="Aktiviert" />
        </div>
      </div>
      <Fld label="Beschreibung" pointer={join(pointer, 'description')}>
        {(p) => <Textarea {...p} rows={2} className="font-sans text-sm" value={str(value.description)} onChange={(e) => set({ description: e.target.value })} />}
      </Fld>

      <section className="flex flex-col gap-3">
        <SectionTitle>Eingänge (Bindung an Quellen und andere Contracts)</SectionTitle>
        <IssuesAt pointer={join(pointer, 'inputs')} />
        {declared.length === 0 && undeclared.length === 0 && <p className="text-xs text-faint">Dieser Typ deklariert keine Eingänge.</p>}
        {declared.map((input) => {
          const current = refFor(input.name);
          const index = inputs.findIndex((i) => str(i.name) === input.name);
          const ref = str(current?.ref);
          const ip = index >= 0 ? join(pointer, 'inputs', index) : join(pointer, 'inputs');
          return (
            <div key={input.name} className="grid items-start gap-2 sm:grid-cols-[12rem_1fr]">
              <div className="pt-6 text-sm">
                <code>{input.name}</code>{' '}
                <Badge tone={input.required ? 'accent' : 'neutral'}>{input.required ? 'Pflicht' : 'optional'}</Badge>
                {input.schema && <Badge className="ml-1">{String(input.schema.type)}{input.schema.unit ? ` · ${String(input.schema.unit)}` : ''}</Badge>}
              </div>
              <Fld label="Referenz" pointer={join(ip, 'ref')}>
                {(p) => (
                  <Select {...p} value={ref} onChange={(e) => setRef(input.name, e.target.value)}>
                    <option value="">{input.required ? '— wählen —' : '— nicht gebunden —'}</option>
                    {ref && !refs.some((r) => r.value === ref) && <option value={ref}>{ref} (unbekannt)</option>}
                    <optgroup label="Quellen">
                      {refs.filter((r) => r.kind === 'source').map((r) => (
                        <option key={r.value} value={r.value}>{r.label} · {r.detail}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Contracts">
                      {refs.filter((r) => r.kind === 'contract').map((r) => (
                        <option key={r.value} value={r.value}>{r.label} · {r.detail}</option>
                      ))}
                    </optgroup>
                  </Select>
                )}
              </Fld>
            </div>
          );
        })}
        {undeclared.map((input) => (
          <Notice key={str(input.name)} tone="warn" title={`Eingang „${str(input.name)}“ ist im Typ nicht deklariert`}>
            <Button size="sm" variant="outline" onClick={() => setRef(str(input.name), '')}>Entfernen</Button>
          </Notice>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Parameter</SectionTitle>
        {entry?.declarative ? (
          <p className="text-xs text-muted">Deklarative Typen haben keine Instanzparameter: Regelparameter gehören zur unveränderlichen Definitionsversion.</p>
        ) : entry?.parameterSchema ? (
          <SchemaForm root={entry.parameterSchema} node={entry.parameterSchema} value={asObject(value.parameters)} pointer={join(pointer, 'parameters')} onChange={(next) => set({ parameters: (next ?? {}) as JsonObject })} />
        ) : (
          <p className="text-xs text-faint">Keine Parameter bekannt.</p>
        )}
        <IssuesAt pointer={join(pointer, 'parameters')} />
      </section>
      <Extras def="Contract" value={value} pointer={pointer} onChange={onChange} />
    </div>
  );
}

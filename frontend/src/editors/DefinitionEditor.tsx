import { Lock, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox, Tabs, Tip } from '@/components/ui/controls';
import { Collapsible } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import {
  asArray,
  asObject,
  newFieldSchema,
  newRule,
  referencedNames,
  renameKey,
  renameReferences,
  ruleContext,
  str,
  uniqueName,
  type FieldSchema,
  type Rule,
} from '@/features/authoring/model';
import type { Capabilities } from '@/lib/capabilities';
import { join, type Json, type JsonObject } from '@/lib/json';
import { AddButton, Fld, IconButton, IssueCount, IssuesAt, JsonValueEditor, RowActions, SectionTitle } from './common';
import { FieldSchemaEditor } from './FieldSchemaEditor';
import { MachineEditor } from './MachineEditor';
import { operatorDefaults, RuleEditor, RuleEnvProvider } from './RuleEditor';
import { SchemaEditor } from './SchemaEditor';
import { Extras } from './Extras';

const TYPE_ID = /^test\.[a-zA-Z0-9_.-]+$/;

/**
 * Complete graphical editor of one declarative definition. Everything the
 * server accepts in `definitions[]` is reachable here; the "JSON" tab is an
 * optional expert view of the very same data, never a prerequisite.
 */
export function DefinitionEditor({
  value,
  onChange,
  pointer,
  caps,
  locked,
  lockReason,
  initialTab,
}: {
  value: JsonObject;
  onChange: (next: JsonObject) => void;
  pointer: string;
  caps: Capabilities | undefined;
  locked: boolean;
  lockReason?: string;
  initialTab?: string;
}) {
  const defaults = operatorDefaults(caps);
  const ctx = ruleContext(value, false);
  const inputs = asArray(value.inputs).map(asObject);
  const rules = asObject(value.rules);
  const outputs = asObject(value.outputs);
  const inputUse = referencedNames(value, 'input');
  const ruleUse = referencedNames(value, 'ref');
  const set = (patch: Record<string, Json | undefined>) => {
    const next: JsonObject = { ...value };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    onChange(next);
  };

  const outputsTab = (
    <SchemaEditor
      value={asObject(value.schema)}
      pointer={join(pointer, 'schema')}
      onChange={(schema) => set({ schema })}
      onAddField={(name) => {
        const fields = asObject(asObject(value.schema).fields);
        onChange({
          ...value,
          schema: { ...asObject(value.schema), fields: { ...fields, [name]: newFieldSchema('bool') }, available_projection: asArray(asObject(value.schema).available_projection) },
          outputs: { ...outputs, [name]: newRule('input', ctx, defaults) },
        });
      }}
      onRemoveField={(name) => {
        const schema = asObject(value.schema);
        onChange({
          ...value,
          schema: { ...schema, fields: Object.fromEntries(Object.entries(asObject(schema.fields)).filter(([k]) => k !== name)), available_projection: asArray(schema.available_projection).filter((p) => p !== name) },
          outputs: Object.fromEntries(Object.entries(outputs).filter(([k]) => k !== name)),
        });
      }}
      onRenameField={(from, to) => {
        const schema = asObject(value.schema);
        onChange({
          ...value,
          schema: { ...schema, fields: renameKey(asObject(schema.fields), from, to), available_projection: asArray(schema.available_projection).map((p) => (p === from ? to : p)) },
          outputs: renameKey(outputs, from, to),
        });
      }}
      extra={(name) => (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <SectionTitle>Regel für „{name}“</SectionTitle>
          <RuleEditor
            value={(outputs[name] ?? newRule('input', ctx, defaults)) as Rule}
            pointer={join(pointer, 'outputs', name)}
            onChange={(rule) => set({ outputs: { ...outputs, [name]: rule } })}
          />
        </div>
      )}
    />
  );

  const items = [
    {
      value: 'general',
      label: 'Allgemein',
      content: (
        <div className="flex max-w-3xl flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Fld label="Typ-ID" pointer={join(pointer, 'type_id')} hint={TYPE_ID.test(str(value.type_id)) ? 'Synthetischer test.*-Namensraum' : 'Muss mit „test.“ beginnen.'}>
              {(p) => <Input {...p} disabled={locked} value={str(value.type_id)} onChange={(e) => set({ type_id: e.target.value })} />}
            </Fld>
            <Fld label="Version" pointer={join(pointer, 'type_version')} hint="Logikänderungen = neue Version">
              {(p) => <Input {...p} disabled={locked} type="number" min={1} step={1} value={Number(value.type_version ?? 1)} onChange={(e) => set({ type_version: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />}
            </Fld>
            <Fld label="Sprachversion" pointer={join(pointer, 'language_version')}>
              {(p) => <Input {...p} readOnly disabled value={String(value.language_version ?? 1)} />}
            </Fld>
          </div>
          <Fld label="Anzeigename (redaktionell)" pointer={join(pointer, 'display_name')} hint="Redaktionelle Felder ändern die Semantik nicht und bleiben auch bei aktivierten Versionen bearbeitbar.">
            {(p) => <Input {...p} value={str(value.display_name)} onChange={(e) => set({ display_name: e.target.value || undefined })} />}
          </Fld>
          <Fld label="Beschreibung (redaktionell)" pointer={join(pointer, 'description')}>
            {(p) => <Textarea {...p} rows={3} className="font-sans text-sm" value={str(value.description)} onChange={(e) => set({ description: e.target.value || undefined })} />}
          </Fld>
          <fieldset disabled={locked} className="flex flex-col gap-2">
            <SectionTitle>Refresh-Eingänge</SectionTitle>
            <p className="text-xs text-muted">Deklarierte HA-Eingänge, die nach einem Commit neu angefordert werden dürfen.</p>
            {inputs.length === 0 && <p className="text-xs text-faint">Noch keine Eingänge.</p>}
            {inputs.map((input) => {
              const name = str(input.name);
              const selected = asArray(value.refresh_inputs).map(String);
              return (
                <Checkbox key={name} label={<code>{name}</code>} checked={selected.includes(name)} onCheckedChange={(on) => { const next = on ? [...selected, name] : selected.filter((n) => n !== name); set({ refresh_inputs: next.length ? next : undefined }); }} />
              );
            })}
            <IssuesAt pointer={join(pointer, 'refresh_inputs')} />
          </fieldset>
          <fieldset disabled={locked}>
            <Extras def="DeclarativeDefinition" value={value} pointer={pointer} onChange={onChange} />
          </fieldset>
        </div>
      ),
    },
    {
      value: 'inputs',
      label: (
        <span className="flex items-center gap-2">
          Eingänge <Badge>{inputs.length}</Badge>
          <IssueCount pointer={join(pointer, 'inputs')} />
        </span>
      ),
      content: (
        <fieldset disabled={locked} className="flex max-w-3xl flex-col gap-3">
          <SectionTitle aside={<AddButton onClick={() => set({ inputs: [...inputs, { name: uniqueName('eingang', inputs.map((i) => str(i.name))), schema: newFieldSchema('bool') }] })}>Eingang</AddButton>}>Typisierte Eingänge</SectionTitle>
          <IssuesAt pointer={join(pointer, 'inputs')} />
          {inputs.length === 0 && <Notice tone="info">Ohne Eingänge liefert die Definition nur Konstanten.</Notice>}
          {inputs.map((input, i) => {
            const name = str(input.name);
            const ip = join(pointer, 'inputs', i);
            const used = inputUse.get(name) ?? 0;
            return (
              <Collapsible
                key={i}
                defaultOpen
                title={<span className="flex items-center gap-2"><code>{name}</code><Badge>{str(asObject(input.schema).type)}</Badge>{used > 0 && <span className="text-xs text-faint">{used}× verwendet</span>}</span>}
                aside={
                  <>
                    <IssueCount pointer={ip} />
                    <RowActions
                      index={i}
                      count={inputs.length}
                      removeDisabled={used > 0}
                      onMove={(from, to) => {
                        const copy = inputs.slice();
                        const [moved] = copy.splice(from, 1);
                        copy.splice(to, 0, moved as JsonObject);
                        set({ inputs: copy });
                      }}
                      onRemove={() => set({ inputs: inputs.filter((_, j) => j !== i), ...(value.refresh_inputs !== undefined ? { refresh_inputs: asArray(value.refresh_inputs).filter((n) => n !== name) } : {}) })}
                    />
                  </>
                }
              >
                <div className="flex flex-col gap-3">
                  <Fld label="Name" pointer={join(ip, 'name')} hint={used > 0 ? 'Umbenennen aktualisiert alle Verweise in dieser Definition. Entfernen ist erst ohne Verwendung möglich.' : undefined}>
                    {(p) => (
                      <Input
                        {...p}
                        key={name}
                        defaultValue={name}
                        onBlur={(e) => {
                          const to = e.target.value.trim();
                          if (!to || to === name || inputs.some((x) => str(x.name) === to)) return void (e.target.value = name);
                          const renamed = renameReferences(value, 'input', name, to);
                          onChange({ ...renamed, inputs: asArray(renamed.inputs).map((x, j) => (j === i ? { ...asObject(x), name: to } : x)), ...(renamed.refresh_inputs !== undefined ? { refresh_inputs: asArray(renamed.refresh_inputs).map((n) => (n === name ? to : n)) } : {}) });
                        }}
                      />
                    )}
                  </Fld>
                  <FieldSchemaEditor pointer={join(ip, 'schema')} value={asObject(input.schema) as FieldSchema} onChange={(schema) => set({ inputs: inputs.map((x, j) => (j === i ? { ...x, schema } : x)) })} />
                  <Extras def="TypedInput" value={input} pointer={ip} onChange={(next) => set({ inputs: inputs.map((x, j) => (j === i ? next : x)) })} />
                </div>
              </Collapsible>
            );
          })}
        </fieldset>
      ),
    },
    {
      value: 'outputs',
      label: (
        <span className="flex items-center gap-2">
          Ausgaben <Badge>{Object.keys(asObject(asObject(value.schema).fields)).length}</Badge>
          <IssueCount pointer={join(pointer, 'outputs')} />
          <IssueCount pointer={join(pointer, 'schema')} />
        </span>
      ),
      content: <fieldset disabled={locked} className="min-w-0 max-w-4xl">{outputsTab}</fieldset>,
    },
    {
      value: 'rules',
      label: (
        <span className="flex items-center gap-2">
          Benannte Regeln <Badge>{Object.keys(rules).length}</Badge>
          <IssueCount pointer={join(pointer, 'rules')} />
        </span>
      ),
      content: (
        <fieldset disabled={locked} className="flex max-w-4xl flex-col gap-3">
          <SectionTitle aside={<AddButton onClick={() => set({ rules: { ...rules, [uniqueName('regel', Object.keys(rules))]: newRule('input', ctx, defaults) } })}>Regel</AddButton>}>Interne Zwischenausdrücke</SectionTitle>
          <p className="text-xs text-muted">Benannte Regeln werden pro Auswertung einmal berechnet und können über „Interne Regel (Verweis)“ mehrfach verwendet werden. Zyklen werden vom Server abgelehnt.</p>
          <IssuesAt pointer={join(pointer, 'rules')} />
          {Object.keys(rules).length === 0 && <Notice tone="info">Noch keine benannten Regeln.</Notice>}
          {Object.entries(rules).map(([name, rule]) => {
            const used = ruleUse.get(name) ?? 0;
            return (
              <Collapsible
                key={name}
                defaultOpen
                title={<span className="flex items-center gap-2"><code>{name}</code>{used > 0 && <span className="text-xs text-faint">{used}× verwendet</span>}</span>}
                aside={
                  <>
                    <IssueCount pointer={join(pointer, 'rules', name)} />
                    <IconButton label={used > 0 ? `${name} wird verwendet` : `Regel ${name} entfernen`} tone="danger" disabled={used > 0} onClick={() => set({ rules: Object.fromEntries(Object.entries(rules).filter(([k]) => k !== name)) })}>
                      <Trash2 size={14} />
                    </IconButton>
                  </>
                }
              >
                <div className="flex flex-col gap-3">
                  <Fld label="Name" pointer={join(pointer, 'rules', name)}>
                    {(p) => (
                      <Input
                        {...p}
                        key={name}
                        defaultValue={name}
                        onBlur={(e) => {
                          const to = e.target.value.trim();
                          if (!to || to === name || to in rules) return void (e.target.value = name);
                          const renamed = renameReferences(value, 'ref', name, to);
                          onChange({ ...renamed, rules: renameKey(asObject(renamed.rules), name, to) });
                        }}
                      />
                    )}
                  </Fld>
                  <RuleEditor value={rule as Rule} pointer={join(pointer, 'rules', name)} onChange={(next) => set({ rules: { ...rules, [name]: next } })} />
                </div>
              </Collapsible>
            );
          })}
        </fieldset>
      ),
    },
    {
      value: 'machine',
      label: (
        <span className="flex items-center gap-2">
          State Machine {value.machine ? <Badge tone="accent">aktiv</Badge> : <Badge>keine</Badge>}
          <IssueCount pointer={join(pointer, 'machine')} />
        </span>
      ),
      content: value.machine ? (
        <div className="flex max-w-4xl flex-col gap-4">
          <MachineEditor value={asObject(value.machine)} pointer={join(pointer, 'machine')} definition={value} caps={caps} locked={locked} onChange={(machine) => set({ machine })} />
          {!locked && (
            <div>
              <button type="button" className="cursor-pointer text-xs text-bad hover:underline" onClick={() => set({ machine: undefined })}>
                State Machine aus dieser Definition entfernen
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex max-w-xl flex-col items-start gap-3">
          <p className="text-sm text-muted">Diese Definition hat keine State Machine. Eine Machine bringt Zustände, Episoden, Sessions, eine Deadline und Befehle mit; ein Ausgabefeld muss sie über „Zustand der State Machine“ verwenden.</p>
          <AddButton
            disabled={locked}
            onClick={() =>
              set({
                machine: {
                  id: 'machine',
                  states: ['idle', 'active'],
                  initial: 'idle',
                  sessions: false,
                  commands: {},
                  transitions: [],
                  reinitialize_when: { op: 'literal', schema: newFieldSchema('bool'), value: false },
                },
              })
            }
          >
            State Machine hinzufügen
          </AddButton>
        </div>
      ),
    },
    {
      value: 'json',
      label: 'JSON (Experte)',
      content: (
        <div className="max-w-4xl">
          <p className="mb-2 text-xs text-muted">Optionale Expertenansicht derselben Daten. Ungültiges JSON wird nicht übernommen; alle Änderungen erscheinen sofort in den Formularen.</p>
          <fieldset disabled={locked}>
            <JsonValueEditor label="Definition" pointer={pointer} rows={24} value={value} onChange={(next) => next && typeof next === 'object' && !Array.isArray(next) && onChange(next)} />
          </fieldset>
        </div>
      ),
    },
  ];

  const [tab, setTab] = useState(initialTab ?? 'general');
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  return (
    <RuleEnvProvider value={{ ctx, caps, locked }}>
      <div className="flex flex-col gap-4">
        {locked && (
          <Notice tone="warn" title={<span className="flex items-center gap-2"><Lock size={14} /> Aktivierte Version – semantisch unveränderlich</span>}>
            {lockReason ?? 'Diese Version war bereits aktiv.'} Redaktionelle Felder (Name, Beschreibung) bleiben änderbar. Für Logikänderungen eine neue Version anlegen.
          </Notice>
        )}
        <IssuesAt pointer={pointer} />
        <Tabs items={items} value={tab} onValueChange={setTab} />
      </div>
    </RuleEnvProvider>
  );
}

export function LockBadge() {
  return (
    <Tip label="Diese Version war bereits aktiv und ist semantisch unveränderlich.">
      <span tabIndex={0}>
        <Badge tone="info"><Lock size={11} /> gesperrt</Badge>
      </span>
    </Tip>
  );
}

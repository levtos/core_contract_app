import { Trash2 } from 'lucide-react';
import { Checkbox, Collapsible } from '@/components/ui/controls';
import { Input, Select } from '@/components/ui/form';
import {
  asArray,
  asObject,
  newFieldSchema,
  newRule,
  renameKey,
  ruleContext,
  str,
  uniqueName,
  type FieldSchema,
  type Rule,
} from '@/features/authoring/model';
import type { Capabilities } from '@/lib/capabilities';
import { join, type Json, type JsonObject } from '@/lib/json';
import { AddButton, Fld, IconButton, IssueCount, IssuesAt, NumberField, RowActions, SectionTitle, TypedValueEditor } from './common';
import { FieldSchemaEditor } from './FieldSchemaEditor';
import { operatorDefaults, RuleEditor, RuleEnvProvider } from './RuleEditor';
import { Extras } from './Extras';

const RESERVED_EVENTS = ['input', 'deadline'];

/**
 * State machine of a definition: states, guarded transitions, typed commands,
 * episodes/sessions and the single deadline. Guards are stateless expressions.
 * Commands only request named transitions — there is no "set state".
 */
export function MachineEditor({
  value,
  onChange,
  pointer,
  definition,
  caps,
  locked,
}: {
  value: JsonObject;
  onChange: (next: JsonObject) => void;
  pointer: string;
  definition: JsonObject;
  caps: Capabilities | undefined;
  locked: boolean;
}) {
  const states = asArray(value.states).map(String);
  const transitions = asArray(value.transitions).map(asObject);
  const commands = asObject(value.commands);
  const hasDeadline = typeof value.deadline_s === 'number';
  const events = ['input', ...(hasDeadline ? ['deadline'] : []), ...Object.keys(commands)];
  const env = { ctx: ruleContext(definition, true), caps };
  const defaults = operatorDefaults(caps);
  const set = (patch: Record<string, Json | undefined>) => {
    const next: JsonObject = { ...value };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    onChange(next);
  };
  const setTransitions = (next: JsonObject[]) => set({ transitions: next });
  const guardRule = (allow = true): Rule => ({ ...newRule('literal', env.ctx, defaults), value: allow });

  const renameState = (from: string, to: string) => {
    if (!to || states.includes(to)) return;
    onChange({
      ...value,
      states: states.map((s) => (s === from ? to : s)),
      initial: value.initial === from ? to : (value.initial ?? ''),
      transitions: transitions.map((t) => ({ ...t, source: t.source === from ? to : (t.source ?? ''), target: t.target === from ? to : (t.target ?? '') })),
    });
  };
  const stateUsed = (name: string) => value.initial === name || transitions.some((t) => t.source === name || t.target === name);

  const renameCommand = (from: string, to: string) => {
    if (!to || to in commands || RESERVED_EVENTS.includes(to)) return;
    onChange({
      ...value,
      commands: renameKey(commands as Record<string, Json>, from, to),
      transitions: transitions.map((t) => (t.event === from ? { ...t, event: to } : t)),
    });
  };

  return (
    <RuleEnvProvider value={{ ...env, locked }}>
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-6">
        <IssuesAt pointer={pointer} />
        <Extras def="MachineDefinition" value={value} pointer={pointer} onChange={onChange} />
        <section className="grid gap-3 sm:grid-cols-4">
          <Fld label="Maschinen-ID" pointer={join(pointer, 'id')}>
            {(p) => <Input {...p} value={str(value.id)} onChange={(e) => set({ id: e.target.value })} />}
          </Fld>
          <Fld label="Anfangszustand" pointer={join(pointer, 'initial')}>
            {(p) => (
              <Select {...p} value={str(value.initial)} onChange={(e) => set({ initial: e.target.value })}>
                {!states.includes(str(value.initial)) && <option value={str(value.initial)}>{str(value.initial) || '—'}</option>}
                {states.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            )}
          </Fld>
          <div className="flex flex-col justify-end gap-2 pb-1.5">
            <Checkbox checked={value.sessions === true} onCheckedChange={(on) => set({ sessions: on })} label="Sessions führen" />
            <Checkbox checked={hasDeadline} onCheckedChange={(on) => set({ deadline_s: on ? 60 : undefined })} label="Deadline verwenden" />
          </div>
          {hasDeadline && <NumberField label="Deadline (s)" pointer={join(pointer, 'deadline_s')} value={Number(value.deadline_s)} min={0} hint="eine Deadline pro Contract" onChange={(n) => set({ deadline_s: n })} />}
        </section>

        <section>
          <SectionTitle aside={<AddButton onClick={() => set({ states: [...states, uniqueName('zustand', states)] })}>Zustand</AddButton>}>Zustände</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {states.map((state) => (
              <div key={state} className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-line-strong bg-sunken pl-1">
                <Input
                  aria-label={`Zustand ${state}`}
                  defaultValue={state}
                  key={state}
                  className="h-7 w-32 border-0 bg-transparent px-1.5 text-xs"
                  onBlur={(e) => (e.target.value.trim() && e.target.value !== state ? renameState(state, e.target.value.trim()) : (e.target.value = state))}
                />
                <IconButton label={stateUsed(state) ? `${state} wird verwendet` : `${state} entfernen`} tone="danger" disabled={stateUsed(state) || states.length <= 1} onClick={() => set({ states: states.filter((s) => s !== state) })}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
          </div>
          <IssuesAt pointer={join(pointer, 'states')} />
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle aside={<AddButton onClick={() => set({ commands: { ...commands, [uniqueName('befehl', [...Object.keys(commands), ...RESERVED_EVENTS])]: { arguments: {} } } })}>Befehl</AddButton>}>Befehle</SectionTitle>
          <p className="text-xs text-muted">Ein Befehl fordert eine benannte Transition an; der Guard entscheidet. Es gibt kein direktes Setzen von Zuständen.</p>
          {Object.entries(commands).map(([name, raw]) => {
            const args = asObject(asObject(raw).arguments) as Record<string, FieldSchema>;
            return (
              <Collapsible
                key={name}
                defaultOpen
                title={<code>{name}</code>}
                aside={
                  <>
                    <IssueCount pointer={join(pointer, 'commands', name)} />
                    <IconButton label={`Befehl ${name} entfernen`} tone="danger" onClick={() => onChange({ ...value, commands: Object.fromEntries(Object.entries(commands).filter(([k]) => k !== name)), transitions: transitions.filter((t) => t.event !== name) })}>
                      <Trash2 size={14} />
                    </IconButton>
                  </>
                }
              >
                <div className="flex flex-col gap-3">
                  <Extras def="CommandDefinition" value={asObject(raw)} pointer={join(pointer, 'commands', name)} onChange={(next) => set({ commands: { ...commands, [name]: next } })} />
                  <Fld label="Befehlsname" pointer={join(pointer, 'commands', name)}>
                    {(p) => <Input {...p} defaultValue={name} key={name} onBlur={(e) => (e.target.value.trim() !== name ? renameCommand(name, e.target.value.trim()) : undefined)} />}
                  </Fld>
                  <SectionTitle aside={<AddButton onClick={() => set({ commands: { ...commands, [name]: { arguments: { ...args, [uniqueName('arg', Object.keys(args))]: newFieldSchema('bool') } } } })}>Argument</AddButton>}>Typisierte Argumente</SectionTitle>
                  {Object.entries(args).length === 0 && <p className="text-xs text-faint">Keine Argumente.</p>}
                  {Object.entries(args).map(([argName, schema]) => (
                    <div key={argName} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-line p-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Fld label="Argument" pointer={join(pointer, 'commands', name, 'arguments', argName)}>
                          {(p) => (
                            <Input
                              {...p}
                              defaultValue={argName}
                              key={argName}
                              onBlur={(e) => {
                                const to = e.target.value.trim();
                                if (to && to !== argName && !(to in args)) {
                                  onChange({
                                    ...value,
                                    commands: { ...commands, [name]: { arguments: renameKey(args as Record<string, Json>, argName, to) } },
                                    transitions: transitions.map((t) => (t.event === name && isKey(t.argument_equals, argName) ? { ...t, argument_equals: renameKey(asObject(t.argument_equals), argName, to) } : t)),
                                  });
                                } else e.target.value = argName;
                              }}
                            />
                          )}
                        </Fld>
                        <FieldSchemaEditor compact pointer={join(pointer, 'commands', name, 'arguments', argName)} value={schema} onChange={(next) => set({ commands: { ...commands, [name]: { arguments: { ...args, [argName]: next } } } })} />
                      </div>
                      <IconButton label="Argument entfernen" tone="danger" onClick={() => set({ commands: { ...commands, [name]: { arguments: Object.fromEntries(Object.entries(args).filter(([k]) => k !== argName)) } } })}>
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </Collapsible>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Neu initialisieren, wenn …</SectionTitle>
          <p className="text-xs text-muted">Zustandsloser Ausdruck. Zeitliche Wahrheiten als Contract-Eingang einspeisen.</p>
          <RuleEditor value={(value.reinitialize_when ?? guardRule(false)) as Rule} pointer={join(pointer, 'reinitialize_when')} onChange={(next) => set({ reinitialize_when: next })} />
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle
            aside={
              <AddButton
                onClick={() =>
                  setTransitions([
                    ...transitions,
                    { source: states[0] ?? '', target: states[0] ?? '', event: 'input', guard: guardRule(), reason: 'transition' },
                  ])
                }
              >
                Transition
              </AddButton>
            }
          >
            Transitionen
          </SectionTitle>
          <p className="text-xs text-muted">Pro Quellzustand und Ereignis ist genau eine Transition zulässig. Die Reihenfolge ändert keine Alternativen.</p>
          {transitions.map((transition, i) => {
            const tp = join(pointer, 'transitions', i);
            const command = asObject(asObject(commands[str(transition.event)]).arguments) as Record<string, FieldSchema>;
            const isCommand = str(transition.event) in commands;
            const equals = asObject(transition.argument_equals);
            const patch = (change: Record<string, Json | undefined>) => {
              const next: JsonObject = { ...transition };
              for (const [k, v] of Object.entries(change)) {
                if (v === undefined) delete next[k];
                else next[k] = v;
              }
              setTransitions(transitions.map((t, j) => (j === i ? next : t)));
            };
            return (
              <Collapsible
                key={i}
                defaultOpen
                title={
                  <span className="flex items-center gap-2">
                    <code>{str(transition.source)}</code>
                    <span className="text-muted">—{str(transition.event)}→</span>
                    <code>{str(transition.target)}</code>
                  </span>
                }
                aside={
                  <>
                    <IssueCount pointer={tp} />
                    <RowActions
                      index={i}
                      count={transitions.length}
                      onMove={(from, to) => {
                        const copy = transitions.slice();
                        const [moved] = copy.splice(from, 1);
                        copy.splice(to, 0, moved as JsonObject);
                        setTransitions(copy);
                      }}
                      onRemove={() => setTransitions(transitions.filter((_, j) => j !== i))}
                    />
                  </>
                }
              >
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Fld label="Von" pointer={join(tp, 'source')}>
                      {(p) => (
                        <Select {...p} value={str(transition.source)} onChange={(e) => patch({ source: e.target.value })}>
                          {!states.includes(str(transition.source)) && <option value={str(transition.source)}>{str(transition.source) || '—'}</option>}
                          {states.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </Select>
                      )}
                    </Fld>
                    <Fld label="Nach" pointer={join(tp, 'target')}>
                      {(p) => (
                        <Select {...p} value={str(transition.target)} onChange={(e) => patch({ target: e.target.value })}>
                          {!states.includes(str(transition.target)) && <option value={str(transition.target)}>{str(transition.target) || '—'}</option>}
                          {states.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </Select>
                      )}
                    </Fld>
                    <Fld label="Ereignis" pointer={join(tp, 'event')} hint={str(transition.event) === 'deadline' && !hasDeadline ? 'Deadline-Transitionen benötigen eine Deadline.' : undefined}>
                      {(p) => (
                        <Select {...p} value={str(transition.event)} onChange={(e) => patch({ event: e.target.value, argument_equals: undefined })}>
                          {!events.includes(str(transition.event)) && <option value={str(transition.event)}>{str(transition.event) || '—'}</option>}
                          {events.map((ev) => (
                            <option key={ev} value={ev}>{ev === 'input' ? 'input (Eingangsänderung)' : ev === 'deadline' ? 'deadline (Fristablauf)' : `Befehl: ${ev}`}</option>
                          ))}
                        </Select>
                      )}
                    </Fld>
                    <Fld label="Grund" pointer={join(tp, 'reason')}>
                      {(p) => <Input {...p} value={str(transition.reason)} onChange={(e) => patch({ reason: e.target.value })} />}
                    </Fld>
                  </div>
                  <Extras def="TransitionDefinition" value={transition} pointer={tp} onChange={(next) => setTransitions(transitions.map((t, j) => (j === i ? next : t)))} />
                  <div className="flex flex-wrap gap-5">
                    <Checkbox checked={transition.new_episode === true} onCheckedChange={(on) => patch({ new_episode: on || undefined })} label="Beginnt neue Episode" />
                    <Checkbox checked={transition.ends_episode === true} onCheckedChange={(on) => patch({ ends_episode: on || undefined })} label="Beendet Episode" />
                  </div>
                  {isCommand && Object.keys(command).length > 0 && (
                    <div className="flex flex-col gap-2">
                      <SectionTitle>Bedingungen an die Befehlsargumente</SectionTitle>
                      {Object.entries(command).map(([argName, schema]) => {
                        const active = argName in equals;
                        return (
                          <div key={argName} className="grid items-start gap-2 sm:grid-cols-[14rem_1fr]">
                            <div className="pt-6">
                              <Checkbox
                                checked={active}
                                onCheckedChange={(on) => {
                                  const next = { ...equals };
                                  if (on) next[argName] = defaultOf(schema);
                                  else delete next[argName];
                                  patch({ argument_equals: Object.keys(next).length ? next : undefined });
                                }}
                                label={<code>{argName} =</code>}
                              />
                            </div>
                            {active && <TypedValueEditor label="muss gleich sein" schema={schema} value={equals[argName] as Json} pointer={join(tp, 'argument_equals', argName)} onChange={(v) => patch({ argument_equals: { ...equals, [argName]: v } })} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <SectionTitle>Guard (zustandslos)</SectionTitle>
                    <RuleEditor value={(transition.guard ?? guardRule()) as Rule} pointer={join(tp, 'guard')} onChange={(next) => patch({ guard: next })} />
                  </div>
                </div>
              </Collapsible>
            );
          })}
        </section>
      </fieldset>
    </RuleEnvProvider>
  );
}

function isKey(value: Json | undefined, key: string): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && key in value;
}

function defaultOf(schema: FieldSchema): Json {
  switch (schema.type) {
    case 'bool':
      return true;
    case 'number':
      return 0;
    case 'enum':
      return Array.isArray(schema.value_catalog) ? (schema.value_catalog[0] as Json) : '';
    case 'timestamp':
      return '2026-01-01T00:00:00+00:00';
    case 'object':
      return {};
    default:
      return '';
  }
}

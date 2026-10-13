import { ChevronRight, Copy, Trash2 } from 'lucide-react';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/controls';
import { Input, Select } from '@/components/ui/form';
import {
  asArray,
  asObject,
  convertRule,
  newFieldSchema,
  newRule,
  str,
  STATEFUL_OPS,
  type FieldSchema,
  type OperatorDefaults,
  type Rule,
  type RuleContext,
} from '@/features/authoring/model';
import { enumAt, type Capabilities } from '@/lib/capabilities';
import { isObject, join, setAt, toPointer, type Json, type JsonObject } from '@/lib/json';
import { cn } from '@/lib/utils';
import { AddButton, Fld, IconButton, IssueCount, IssuesAt, NumberField, RowActions, SectionTitle, TypedValueEditor } from './common';
import { FieldSchemaEditor } from './FieldSchemaEditor';
import { SchemaForm } from './SchemaForm';
import { defaultLiteralValue } from '@/features/authoring/model';
import { Extras, HANDLED } from './Extras';

/**
 * Recursive editor for the closed, tagged rule union. Operators, formulas,
 * fusion strategies and temporal operations come from the capability metadata;
 * operators without a dedicated editor are rendered by the generic schema form,
 * and unknown ones by raw JSON — never silently dropped.
 */

export interface RuleEnv {
  ctx: RuleContext;
  caps: Capabilities | undefined;
  /** Activated definition versions are semantically immutable. */
  locked: boolean;
}

const EnvContext = createContext<RuleEnv | null>(null);
export const RuleEnvProvider = EnvContext.Provider;
function useEnv(): RuleEnv {
  const env = useContext(EnvContext);
  if (!env) throw new Error('RuleEnvProvider fehlt');
  return env;
}

export function operatorDefaults(caps: Capabilities | undefined): OperatorDefaults {
  return {
    formulas: caps?.formulas.map((f) => ({ name: f.name, version: f.version })) ?? [],
    fusion: caps?.fusion.map((f) => f.strategy) ?? [],
    temporal: caps?.temporal.map((t) => ({ operation: t.operation, arguments: t.arguments })) ?? [],
  };
}

const OP_LABELS: Record<string, string> = {
  input: 'Eingang',
  ref: 'Interne Regel (Verweis)',
  literal: 'Konstante',
  and: 'UND',
  or: 'ODER',
  not: 'NICHT',
  compare: 'Vergleich',
  map: 'Zuordnung (Map)',
  first_match: 'Erster Treffer',
  bucket: 'Hysterese (Bucket)',
  formula: 'Formel',
  fusion: 'Fusion',
  temporal: 'Zeitlich (Temporal)',
  machine: 'Zustand der State Machine',
  not_applicable: 'Nicht anwendbar',
};
const OP_GROUPS: { label: string; ops: string[] }[] = [
  { label: 'Werte', ops: ['input', 'ref', 'literal'] },
  { label: 'Logik', ops: ['and', 'or', 'not', 'compare', 'map', 'first_match', 'not_applicable'] },
  { label: 'Berechnung & Fusion', ops: ['formula', 'fusion', 'bucket'] },
  { label: 'Zeit & Zustand', ops: ['temporal', 'machine'] },
];
const FALLBACK_OPS = Object.keys(OP_LABELS);

const TONE: Record<string, string> = {
  input: 'border-l-info',
  ref: 'border-l-info',
  literal: 'border-l-info',
  and: 'border-l-accent',
  or: 'border-l-accent',
  not: 'border-l-accent',
  compare: 'border-l-accent',
  map: 'border-l-accent',
  first_match: 'border-l-accent',
  not_applicable: 'border-l-accent',
  formula: 'border-l-ok',
  fusion: 'border-l-ok',
  bucket: 'border-l-warn',
  temporal: 'border-l-warn',
  machine: 'border-l-warn',
};

const COMPARISONS: [string, string][] = [
  ['eq', '= gleich'],
  ['ne', '≠ ungleich'],
  ['lt', '< kleiner'],
  ['le', '≤ höchstens'],
  ['gt', '> größer'],
  ['ge', '≥ mindestens'],
];

const TEMPORAL_HINTS: Record<string, string> = {
  stable_for: 'Wahr erst, wenn der Wahrheitswert über die Dauer unverändert anliegt (Wahrheitswert-Eingang).',
  dwell: 'Verweildauer des Wahrheitswerts (Wahrheitswert-Eingang).',
  grace: 'Hält den letzten gültigen Wert bis zum ursprünglichen Fristende; behält den Typ des Eingangs.',
  edge: 'Flankenerkennung eines Wahrheitswerts.',
  delta: 'Differenz zweier Zahlen.',
  age: 'Alter der Messung; benötigt Messzeitpunkt-Evidenz.',
};

function summary(rule: Rule): string {
  switch (rule.op) {
    case 'input':
    case 'ref':
      return str(rule.name) || '—';
    case 'literal':
      return JSON.stringify(rule.value);
    case 'compare':
      return COMPARISONS.find(([k]) => k === rule.comparison)?.[1] ?? '';
    case 'bucket':
    case 'temporal':
      return `${str(rule.id)}${rule.operation ? ` · ${String(rule.operation)}` : ''}`;
    case 'formula':
      return `${str(rule.name)}@${String(rule.version ?? '')}`;
    case 'fusion':
      return str(rule.strategy);
    default:
      return Array.isArray(rule.args) ? `${rule.args.length} Argument${rule.args.length === 1 ? '' : 'e'}` : '';
  }
}

interface NodeProps {
  value: Rule;
  onChange: (next: Rule) => void;
  pointer: string;
  label?: string;
  onRemove?: () => void;
  /** Allowed to wrap/remove-as-list-item; roots are replaced, not removed. */
  depth?: number;
}

/** One expression node with its operator-specific body and recursive children. */
export function RuleEditor({ value, onChange, pointer, label, onRemove, depth = 0 }: NodeProps) {
  const env = useEnv();
  const defaults = useMemo(() => operatorDefaults(env.caps), [env.caps]);
  const [open, setOpen] = useState(depth < 6);
  const knownOps = env.caps?.operators.map((o) => o.op) ?? FALLBACK_OPS;
  const available = knownOps.filter((op) => !(env.ctx.stateless && STATEFUL_OPS.has(op)));
  const op = value.op;
  const known = knownOps.includes(op);
  const ruleDef = env.caps?.operators.find((o) => o.op === op)?.schema_ref.split('/').pop();

  const switchOp = (next: string) => onChange(convertRule(value, next, env.ctx, defaults));
  const wrap = (wrapper: 'not' | 'and' | 'or') => onChange({ op: wrapper, args: wrapper === 'not' ? [value] : [value, newRule('input', env.ctx, defaults)] });

  return (
    <div className={cn('rounded-[var(--radius-md)] border border-line border-l-[3px] bg-sunken/60', TONE[op] ?? 'border-l-faint')} data-op={op} data-pointer={pointer}>
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
        <button type="button" aria-label={open ? 'Zuklappen' : 'Aufklappen'} aria-expanded={open} className="cursor-pointer text-muted hover:text-fg" onClick={() => setOpen((v) => !v)}>
          <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        {label && <span className="text-xs font-medium text-muted">{label}</span>}
        <Select
          aria-label={`Operator${label ? ` (${label})` : ''}`}
          className="h-8 w-auto min-w-44 text-xs"
          value={op}
          disabled={env.locked}
          onChange={(e) => switchOp(e.target.value)}
        >
          {!known && <option value={op}>{op} (unbekannt)</option>}
          {OP_GROUPS.map((group) => {
            const ops = group.ops.filter((o) => available.includes(o));
            return ops.length === 0 ? null : (
              <optgroup key={group.label} label={group.label}>
                {ops.map((o) => (
                  <option key={o} value={o}>{OP_LABELS[o] ?? o}</option>
                ))}
              </optgroup>
            );
          })}
          {available.filter((o) => !OP_GROUPS.some((g) => g.ops.includes(o))).map((o) => (
            <option key={o} value={o}>{OP_LABELS[o] ?? o}</option>
          ))}
        </Select>
        {!open && <span className="mono min-w-0 truncate text-xs text-muted">{summary(value)}</span>}
        <span className="ml-auto flex items-center gap-1">
          <IssueCount pointer={pointer} />
          {!env.locked && (
            <>
              <IconButton label="In NICHT einpacken" onClick={() => wrap('not')}>
                <span className="text-[10px] font-bold">¬</span>
              </IconButton>
              <IconButton label="In UND einpacken" onClick={() => wrap('and')}>
                <span className="text-[10px] font-bold">∧</span>
              </IconButton>
              <IconButton label="In ODER einpacken" onClick={() => wrap('or')}>
                <span className="text-[10px] font-bold">∨</span>
              </IconButton>
              <IconButton label="Knoten duplizieren (JSON in Zwischenablage)" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(value))}>
                <Copy size={13} />
              </IconButton>
              {onRemove && (
                <IconButton label="Entfernen" tone="danger" onClick={onRemove}>
                  <Trash2 size={14} />
                </IconButton>
              )}
            </>
          )}
        </span>
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line/70 px-3 pb-3 pt-3">
          <IssuesAt pointer={pointer} />
          <fieldset disabled={env.locked} className="contents">
            <Body value={value} onChange={onChange} pointer={pointer} depth={depth} />
            {ruleDef && ruleDef in HANDLED && (
              <Extras
                def={ruleDef}
                value={value}
                pointer={pointer}
                onChange={(next) => onChange(next as Rule)}
                renderRule={({ value: v, onChange: c, pointer: p, label: l }) => <RuleEditor value={v as Rule} onChange={(n) => c(n)} pointer={p} label={l} depth={depth + 1} />}
              />
            )}
          </fieldset>
        </div>
      )}
    </div>
  );
}

function Child({ parent, pointer, depth, ...props }: { parent: Rule; onChange: (next: Rule) => void; pointer: string; depth: number; keyPath: (string | number)[]; label?: string; onRemove?: () => void }) {
  const { keyPath, onChange } = props;
  const child = keyPath.reduce<Json | undefined>((node, key) => (Array.isArray(node) ? node[Number(key)] : isObject(node) ? node[String(key)] : undefined), parent as Json);
  if (!isObject(child) || typeof child.op !== 'string') {
    return <p className="text-xs text-bad">Ausdruck fehlt oder ist ungültig.</p>;
  }
  return (
    <RuleEditor
      value={child as Rule}
      pointer={join(pointer, ...keyPath)}
      depth={depth + 1}
      label={props.label}
      onRemove={props.onRemove}
      onChange={(next) => onChange(setAt(parent as Json, toPointer(keyPath), next) as Rule)}
    />
  );
}

function ArgList({ value, onChange, pointer, depth, min = 1, max, labels, addLabel = 'Argument' }: { value: Rule; onChange: (next: Rule) => void; pointer: string; depth: number; min?: number; max?: number; labels?: string[]; addLabel?: string }) {
  const env = useEnv();
  const defaults = useMemo(() => operatorDefaults(env.caps), [env.caps]);
  const args = asArray(value.args);
  const set = (next: Json[]) => onChange({ ...value, args: next });
  return (
    <div className="flex flex-col gap-2">
      {args.map((_, i) => (
        <div key={i} className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <Child parent={value} pointer={pointer} depth={depth} keyPath={['args', i]} label={labels?.[i] ?? `${i + 1}.`} onChange={onChange} />
          </div>
          {max !== min && (
            <RowActions
              index={i}
              count={args.length}
              removeDisabled={args.length <= min}
              onMove={(from, to) => {
                const copy = args.slice();
                const [moved] = copy.splice(from, 1);
                copy.splice(to, 0, moved as Json);
                set(copy);
              }}
              onRemove={() => set(args.filter((_, j) => j !== i))}
            />
          )}
        </div>
      ))}
      {(max === undefined || args.length < max) && (
        <div>
          <AddButton onClick={() => set([...args, newRule('input', env.ctx, defaults)])}>{addLabel}</AddButton>
        </div>
      )}
    </div>
  );
}

function Body({ value, onChange, pointer, depth }: { value: Rule; onChange: (next: Rule) => void; pointer: string; depth: number }) {
  const env = useEnv();
  const defaults = useMemo(() => operatorDefaults(env.caps), [env.caps]);
  const { ctx, caps } = env;
  const set = (patch: Record<string, Json | undefined>) => {
    const next: JsonObject = { ...value };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    onChange(next as Rule);
  };

  switch (value.op) {
    case 'input': {
      const names = ctx.inputs.map((i) => i.name);
      const current = str(value.name);
      const declared = ctx.inputs.find((i) => i.name === current);
      return (
        <Fld label="Eingang" pointer={join(pointer, 'name')} hint={declared ? `Typ: ${declared.schema.type}${declared.schema.unit ? ` · ${String(declared.schema.unit)}` : ''}` : 'Dieser Name ist in der Definition nicht als Eingang deklariert.'}>
          {(p) => (
            <Select {...p} value={current} onChange={(e) => set({ name: e.target.value })}>
              {!names.includes(current) && <option value={current}>{current || '— wählen —'}</option>}
              {names.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          )}
        </Fld>
      );
    }
    case 'ref': {
      const current = str(value.name);
      return (
        <Fld label="Interne Regel" pointer={join(pointer, 'name')} hint="Benannte Regeln werden pro Auswertung nur einmal berechnet; Zustandsregeln schreiten so nur einmal fort.">
          {(p) => (
            <Select {...p} value={current} onChange={(e) => set({ name: e.target.value })}>
              {!ctx.ruleNames.includes(current) && <option value={current}>{current || '— wählen —'}</option>}
              {ctx.ruleNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          )}
        </Fld>
      );
    }
    case 'literal': {
      const schema = asObject(value.schema) as FieldSchema;
      return (
        <div className="flex flex-col gap-3">
          <FieldSchemaEditor
            compact
            pointer={join(pointer, 'schema')}
            value={schema}
            onChange={(next) => set({ schema: next, ...(next.type !== schema.type ? { value: defaultLiteralValue(next) } : {}) })}
          />
          <TypedValueEditor schema={schema} value={(value.value ?? null) as Json} pointer={join(pointer, 'value')} onChange={(v) => set({ value: v })} />
        </div>
      );
    }
    case 'and':
    case 'or':
      return <ArgList value={value} onChange={onChange} pointer={pointer} depth={depth} addLabel="Operand" />;
    case 'not':
      return <ArgList value={value} onChange={onChange} pointer={pointer} depth={depth} min={1} max={1} labels={['Operand']} />;
    case 'compare':
      return (
        <div className="flex flex-col gap-3">
          <Fld label="Vergleich" pointer={join(pointer, 'comparison')} className="max-w-56">
            {(p) => (
              <Select {...p} value={str(value.comparison)} onChange={(e) => set({ comparison: e.target.value })}>
                {(enumAt(caps?.schemas.definition, 'CompareRule', 'comparison', COMPARISONS.map(([k]) => k))).map((k) => (
                  <option key={k} value={k}>{COMPARISONS.find(([c]) => c === k)?.[1] ?? k}</option>
                ))}
              </Select>
            )}
          </Fld>
          <Child parent={value} pointer={pointer} depth={depth} keyPath={['left']} label="Links" onChange={onChange} />
          <Child parent={value} pointer={pointer} depth={depth} keyPath={['right']} label="Rechts" onChange={onChange} />
        </div>
      );
    case 'not_applicable':
      return <Child parent={value} pointer={pointer} depth={depth} keyPath={['arg']} label="Bedingung (trifft nicht zu, wenn wahr)" onChange={onChange} />;
    case 'first_match': {
      const cases = asArray(value.cases);
      const set2 = (next: Json[]) => set({ cases: next });
      return (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">Die erste Zeile, deren „Wenn“ wahr ist, bestimmt das Ergebnis. Ein unbekanntes „Wenn“ blockiert die Auswahl (selection_blocked).</p>
          {cases.map((_, i) => (
            <div key={i} className="flex items-start gap-1 rounded-[var(--radius-md)] border border-line p-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Child parent={value} pointer={pointer} depth={depth} keyPath={['cases', i, 'when']} label="Wenn" onChange={onChange} />
                <Child parent={value} pointer={pointer} depth={depth} keyPath={['cases', i, 'then']} label="Dann" onChange={onChange} />
              </div>
              <RowActions
                index={i}
                count={cases.length}
                removeDisabled={cases.length <= 1}
                onMove={(from, to) => {
                  const copy = cases.slice();
                  const [moved] = copy.splice(from, 1);
                  copy.splice(to, 0, moved as Json);
                  set2(copy);
                }}
                onRemove={() => set2(cases.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <div>
            <AddButton onClick={() => set2([...cases, { when: newRule('input', ctx, defaults), then: newRule('literal', ctx, defaults) }])}>Fall</AddButton>
          </div>
        </div>
      );
    }
    case 'map':
      return <MapBody value={value} onChange={onChange} pointer={pointer} depth={depth} />;
    case 'bucket':
      return (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">Hysterese: schaltet erst über „oben“ ein und erst unter „unten“ aus. Der Zustand ist flüchtig und startet nach Neustart wieder bei „initial“.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Fld label="ID (eindeutig)" pointer={join(pointer, 'id')}>
              {(p) => <Input {...p} value={str(value.id)} onChange={(e) => set({ id: e.target.value })} />}
            </Fld>
            <NumberField label="Unten" pointer={join(pointer, 'lower')} value={Number(value.lower ?? 0)} onChange={(n) => set({ lower: n })} />
            <NumberField label="Oben" pointer={join(pointer, 'upper')} value={Number(value.upper ?? 0)} onChange={(n) => set({ upper: n })} />
            <Fld label="Initial" pointer={join(pointer, 'initial')}>
              {(p) => (
                <Select {...p} value={String(value.initial === true)} onChange={(e) => set({ initial: e.target.value === 'true' })}>
                  <option value="false">aus</option>
                  <option value="true">an</option>
                </Select>
              )}
            </Fld>
          </div>
          <Child parent={value} pointer={pointer} depth={depth} keyPath={['arg']} label="Zahl" onChange={onChange} />
        </div>
      );
    case 'formula': {
      const formulas = caps?.formulas ?? [];
      const names = [...new Set(formulas.map((f) => f.name))];
      const versions = formulas.filter((f) => f.name === value.name).map((f) => f.version);
      const selected = formulas.find((f) => f.name === value.name && f.version === value.version);
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Fld label="Formel" pointer={join(pointer, 'name')} hint={selected ? `Eingänge: ${selected.input_schema.type}${selected.input_schema.unit ? ` (${String(selected.input_schema.unit)})` : ''} → ${selected.output_schema.type}` : undefined}>
              {(p) => (
                <Select
                  {...p}
                  value={str(value.name)}
                  onChange={(e) => {
                    const first = formulas.find((f) => f.name === e.target.value);
                    set({ name: e.target.value, version: first?.version ?? 1 });
                  }}
                >
                  {!names.includes(str(value.name)) && <option value={str(value.name)}>{str(value.name) || '—'} (unbekannt)</option>}
                  {names.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              )}
            </Fld>
            <Fld label="Version" pointer={join(pointer, 'version')}>
              {(p) => (
                <Select {...p} value={String(value.version ?? '')} onChange={(e) => set({ version: Number(e.target.value) })}>
                  {!versions.includes(Number(value.version)) && <option value={String(value.version ?? '')}>{String(value.version ?? '—')}</option>}
                  {versions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              )}
            </Fld>
          </div>
          <ArgList value={value} onChange={onChange} pointer={pointer} depth={depth} />
        </div>
      );
    }
    case 'fusion': {
      const strategies = caps?.fusion ?? [];
      const current = strategies.find((s) => s.strategy === value.strategy);
      return (
        <div className="flex flex-col gap-3">
          <Fld
            label="Strategie"
            pointer={join(pointer, 'strategy')}
            hint={[current?.priority === 'argument_order' ? 'Die Reihenfolge der Argumente ist die Priorität.' : '', current?.conflict_detection ? 'Erkennt Konflikte zwischen gleich gewichteten Kandidaten.' : ''].filter(Boolean).join(' ') || undefined}
            className="max-w-sm"
          >
            {(p) => (
              <Select {...p} value={str(value.strategy)} onChange={(e) => set({ strategy: e.target.value })}>
                {!current && <option value={str(value.strategy)}>{str(value.strategy) || '—'} (unbekannt)</option>}
                {strategies.map((s) => (
                  <option key={s.strategy} value={s.strategy}>{s.strategy}</option>
                ))}
              </Select>
            )}
          </Fld>
          <ArgList value={value} onChange={onChange} pointer={pointer} depth={depth} addLabel="Kandidat" />
        </div>
      );
    }
    case 'temporal': {
      const operations = caps?.temporal ?? [];
      const operation = str(value.operation);
      const meta = operations.find((o) => o.operation === operation);
      const arity = meta?.arguments ?? (operation === 'delta' ? 2 : 1);
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Fld label="ID (eindeutig)" pointer={join(pointer, 'id')}>
              {(p) => <Input {...p} value={str(value.id)} onChange={(e) => set({ id: e.target.value })} />}
            </Fld>
            <Fld label="Operation" pointer={join(pointer, 'operation')} className="sm:col-span-1">
              {(p) => (
                <Select
                  {...p}
                  value={operation}
                  onChange={(e) => {
                    const nextArity = operations.find((o) => o.operation === e.target.value)?.arguments ?? 1;
                    const args = asArray(value.args).slice(0, nextArity);
                    while (args.length < nextArity) args.push(newRule('input', ctx, defaults));
                    set({ operation: e.target.value, args });
                  }}
                >
                  {!meta && <option value={operation}>{operation || '—'} (unbekannt)</option>}
                  {operations.map((o) => (
                    <option key={o.operation} value={o.operation}>{o.operation}</option>
                  ))}
                </Select>
              )}
            </Fld>
            <NumberField label="Dauer (s)" pointer={join(pointer, 'duration_s')} value={Number(value.duration_s ?? 1)} min={0} onChange={(n) => set({ duration_s: n })} hint="größer 0" />
            <div className="flex items-end pb-1.5">
              <Checkbox checked={value.accepts_held === true} onCheckedChange={(on) => set({ accepts_held: on || undefined })} label="Gehaltene Werte akzeptieren" />
            </div>
          </div>
          {TEMPORAL_HINTS[operation] && <p className="text-xs text-muted">{TEMPORAL_HINTS[operation]} Zeitkontexte werden mit absoluten Fristen wiederhergestellt.</p>}
          <ArgList value={value} onChange={onChange} pointer={pointer} depth={depth} min={arity} max={arity} labels={arity === 2 ? ['Aktuell', 'Vergleich'] : ['Eingang']} />
        </div>
      );
    }
    case 'machine':
      return (
        <p className="text-xs text-muted">
          Liefert den aktuellen Zustand der State Machine dieser Definition.
          {!ctx.hasMachine && <span className="ml-1 text-bad">Die Definition hat noch keine State Machine – im Reiter „State Machine“ anlegen.</span>}
        </p>
      );
    default:
      return <GenericBody value={value} onChange={onChange} pointer={pointer} depth={depth} />;
  }
}

/** Operators not known to this UI: use the server's schema if listed, raw JSON otherwise. */
function GenericBody({ value, onChange, pointer, depth }: { value: Rule; onChange: (next: Rule) => void; pointer: string; depth: number }) {
  const { caps } = useEnv();
  const operator = caps?.operators.find((o) => o.op === value.op);
  const definitionSchema = caps?.schemas.definition;
  if (!operator || !definitionSchema) {
    return <SchemaForm root={{}} node={undefined} value={value} onChange={(next) => isObject(next) && onChange(next as Rule)} pointer={pointer} label="Unbekannter Operator (JSON)" />;
  }
  return (
    <SchemaForm
      root={definitionSchema}
      node={{ $ref: operator.schema_ref }}
      value={value}
      pointer={pointer}
      onChange={(next) => isObject(next) && onChange(next as Rule)}
      renderRule={({ value: v, onChange: c, pointer: p, label }) => (
        <RuleEditor value={v as Rule} onChange={(n) => c(n)} pointer={p} label={label} depth={depth + 1} />
      )}
    />
  );
}

/** Canonical map keys are JSON scalars encoded as object keys (docs/alpha4/workbench-api.md). */
export function decodeKey(key: string): { kind: 'bool' | 'number' | 'string' | 'raw'; text: string } {
  try {
    const parsed = JSON.parse(key) as unknown;
    if (typeof parsed === 'boolean') return { kind: 'bool', text: String(parsed) };
    if (typeof parsed === 'number') return { kind: 'number', text: key };
    if (typeof parsed === 'string') return { kind: 'string', text: parsed };
  } catch {
    /* fall through */
  }
  return { kind: 'raw', text: key };
}

function MapBody({ value, onChange, pointer, depth }: { value: Rule; onChange: (next: Rule) => void; pointer: string; depth: number }) {
  const { ctx } = useEnv();
  const schema = asObject(value.schema) as FieldSchema;
  const entries = Object.entries(asObject(value.entries));
  const arg = asObject(value.arg);
  const argSchema = arg.op === 'input' ? ctx.inputs.find((i) => i.name === arg.name)?.schema : undefined;
  const mode: 'bool' | 'number' | 'enum' | 'string' | 'raw' = !argSchema ? 'raw' : argSchema.type === 'bool' ? 'bool' : argSchema.type === 'number' ? 'number' : argSchema.type === 'enum' ? 'enum' : argSchema.type === 'object' ? 'raw' : 'string';
  const catalog = Array.isArray(argSchema?.value_catalog) ? (argSchema!.value_catalog as string[]) : [];

  const setEntries = (next: [string, Json][]) => onChange({ ...value, entries: Object.fromEntries(next) });
  const keysUsed = new Set(entries.map(([k]) => k));
  const freshKey = (): string => {
    if (mode === 'bool') return ['true', 'false'].find((k) => !keysUsed.has(k)) ?? 'true';
    if (mode === 'enum') return JSON.stringify(catalog.find((c) => !keysUsed.has(JSON.stringify(c))) ?? 'neu');
    if (mode === 'number') {
      let n = 0;
      while (keysUsed.has(String(n))) n += 1;
      return String(n);
    }
    let n = 1;
    while (keysUsed.has(JSON.stringify(`wert${n}`))) n += 1;
    return JSON.stringify(`wert${n}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <Child parent={value} pointer={pointer} depth={depth} keyPath={['arg']} label="Eingang der Zuordnung" onChange={onChange} />
      <div>
        <SectionTitle>Ergebnistyp</SectionTitle>
        <FieldSchemaEditor
          compact
          pointer={join(pointer, 'schema')}
          value={schema}
          onChange={(next) => {
            const typeChanged = next.type !== schema.type;
            onChange({ ...value, schema: next, ...(typeChanged ? { entries: Object.fromEntries(entries.map(([k]) => [k, defaultLiteralValue(next)])) } : {}) });
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle aside={<AddButton onClick={() => setEntries([...entries, [freshKey(), defaultLiteralValue(schema)]])}>Eintrag</AddButton>}>Zuordnungen</SectionTitle>
        {mode === 'raw' && <p className="text-xs text-muted">Schlüssel sind kanonische JSON-Skalare: <code>true</code>, <code>42</code> oder <code>&quot;text&quot;</code> (in Anführungszeichen).</p>}
        {entries.map(([key, entryValue], i) => {
          const decoded = decodeKey(key);
          const rename = (nextKey: string) => {
            if (nextKey !== key && keysUsed.has(nextKey)) return;
            setEntries(entries.map(([k, v], j) => (j === i ? [nextKey, v] : [k, v])));
          };
          return (
            <div key={i} className="grid items-start gap-2 rounded-[var(--radius-md)] border border-line p-2 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto]">
              <Fld label="Wenn Eingang =" pointer={join(pointer, 'entries', key)}>
                {(p) =>
                  mode === 'bool' ? (
                    <Select {...p} value={decoded.text} onChange={(e) => rename(e.target.value)}>
                      <option value="true">wahr</option>
                      <option value="false">falsch</option>
                    </Select>
                  ) : mode === 'enum' ? (
                    <Select {...p} value={key} onChange={(e) => rename(e.target.value)}>
                      {!catalog.some((c) => JSON.stringify(c) === key) && <option value={key}>{key}</option>}
                      {catalog.map((c) => (
                        <option key={c} value={JSON.stringify(c)}>{c}</option>
                      ))}
                    </Select>
                  ) : mode === 'string' ? (
                    <Input {...p} value={decoded.kind === 'string' ? decoded.text : key} onChange={(e) => rename(JSON.stringify(e.target.value))} />
                  ) : (
                    <Input {...p} className="font-mono text-xs" value={key} onChange={(e) => rename(e.target.value)} />
                  )
                }
              </Fld>
              <TypedValueEditor
                label="dann"
                schema={schema}
                value={entryValue}
                pointer={join(pointer, 'entries', key)}
                onChange={(next) => setEntries(entries.map(([k, v], j) => (j === i ? [k, next] : [k, v])))}
              />
              <div className="pt-5">
                <IconButton label="Eintrag entfernen" tone="danger" disabled={entries.length <= 1} onClick={() => setEntries(entries.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Convenience wrapper wiring the environment around the root node of an expression. */
export function RuleRoot({ env, value, onChange, pointer, label, locked }: { env: Omit<RuleEnv, 'locked'>; value: Rule; onChange: (next: Rule) => void; pointer: string; label?: string; locked: boolean }): ReactNode {
  return (
    <RuleEnvProvider value={{ ...env, locked }}>
      <RuleEditor value={value} onChange={onChange} pointer={pointer} label={label} />
    </RuleEnvProvider>
  );
}

export { newFieldSchema };

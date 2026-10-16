import { t as uiText } from '@/i18n';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible } from '@/components/ui/controls';
import { Input, Select, Textarea } from '@/components/ui/form';
import { explain, useIssues } from '@/features/authoring/issues';
import { isObject, join, type Json, type JsonObject } from '@/lib/json';
import { cn } from '@/lib/utils';

/**
 * Typed, recursive editor for any JSON value: string, number, boolean, null,
 * objects (key/value rows) and arrays, nested arbitrarily and with mixed element
 * types. It is the one value editor behind literals, map results, catalogs,
 * command arguments and open schema fields. JSON text is only an optional expert
 * view; no value ever *requires* typing JSON.
 */
export type ValueKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
export const ALL_KINDS: ValueKind[] = ['string', 'number', 'boolean', 'null', 'object', 'array'];

const KIND_LABELS: Record<ValueKind, string> = {
  string: uiText("editors.ValueEditor.text_71988c"),
  number: uiText("editors.ValueEditor.zahl_654eb4"),
  boolean: uiText("editors.ValueEditor.wahrheitswert_7dc5d8"),
  null: uiText("editors.ValueEditor.null_leer_5eb672"),
  object: uiText("editors.ValueEditor.objekt_fe41f9"),
  array: uiText("editors.ValueEditor.liste_734384"),
};

export function kindOf(value: Json | undefined): ValueKind {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value as 'string' | 'number' | 'boolean';
}

export function defaultOfKind(kind: ValueKind): Json {
  switch (kind) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'object':
      return {};
    case 'array':
      return [];
  }
}

/** Keeps what can be kept when the user switches the type of a value. */
export function convertKind(value: Json | undefined, kind: ValueKind): Json {
  const from = kindOf(value);
  if (from === kind) return value as Json;
  if (kind === 'string' && (from === 'number' || from === 'boolean')) return String(value);
  if (kind === 'number' && from === 'string') {
    const n = Number(value);
    return (value as string).trim() !== '' && Number.isFinite(n) ? n : 0;
  }
  if (kind === 'boolean' && from === 'string') return value === 'true';
  if (kind === 'array' && from !== 'null') return value === '' ? [] : [value as Json]; // an empty text is no element
  return defaultOfKind(kind);
}

function NumberInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      aria-label={label}
      type="number"
      inputMode="decimal"
      step="any"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(parsed)) onChange(parsed);
      }}
    />
  );
}

function SmallButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

export interface ValueEditorProps {
  value: Json | undefined;
  onChange: (next: Json) => void;
  pointer: string;
  label?: string;
  /** Kinds the user may pick (e.g. object-typed fields accept everything except null). */
  allowedKinds?: ValueKind[];
  /** Offer the optional JSON expert view on the outermost editor. */
  expert?: boolean;
  depth?: number;
}

export function ValueEditor({ value, onChange, pointer, label = uiText('editors.SchemaForm.wert_7e347d'), allowedKinds = ALL_KINDS, expert = true, depth = 0 }: ValueEditorProps) {
  const kind = kindOf(value);
  const issues = useIssues(pointer);
  const kinds = allowedKinds.includes(kind) ? allowedKinds : [kind, ...allowedKinds];
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', depth > 0 && 'rounded-[var(--radius-sm)] border border-line/70 bg-sunken/40 p-2')} role="group" aria-label={uiText("editors.ValueEditor.v0_bereich_d9749c", { v0: (label) })} data-pointer={pointer}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {kinds.length > 1 && (
          <Select aria-label={uiText("editors.ValueEditor.v0_typ_d4f718", { v0: (label) })} className="h-7 w-auto min-w-32 text-xs" value={kind} onChange={(e) => onChange(convertKind(value, e.target.value as ValueKind))}>
            {kinds.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </Select>
        )}
      </div>
      {kind === 'string' && <Input aria-label={label} aria-invalid={issues.length > 0} value={value as string} onChange={(e) => onChange(e.target.value)} />}
      {kind === 'number' && <NumberInput label={label} value={value as number} onChange={onChange} />}
      {kind === 'boolean' && (
        <Select aria-label={label} className="max-w-40" value={String(value)} onChange={(e) => onChange(e.target.value === 'true')}>
          <option value="true">{uiText("editors.ValueEditor.wahr_167f97")}</option>
          <option value="false">{uiText("editors.ValueEditor.falsch_b3c3e0")}</option>
        </Select>
      )}
      {kind === 'null' && <p className="text-xs text-faint">{uiText("editors.ValueEditor.null_kein_wert_gesetzt_a2f805")}</p>}
      {kind === 'object' && <ObjectRows value={value as JsonObject} onChange={onChange} pointer={pointer} label={label} depth={depth} />}
      {kind === 'array' && <ArrayRows value={value as Json[]} onChange={onChange} pointer={pointer} label={label} depth={depth} />}
      {issues.map((issue, i) => (
        <p key={i} role="alert" className="text-xs text-bad"><span className="mono mr-1.5 opacity-70">{uiText("common.validationError")}</span>{explain(issue)}</p>
      ))}
      {expert && depth === 0 && (kind === 'object' || kind === 'array') && <ExpertJson value={value as Json} onChange={onChange} label={label} />}
    </div>
  );
}

function ObjectRows({ value, onChange, pointer, label, depth }: { value: JsonObject; onChange: (next: Json) => void; pointer: string; label: string; depth: number }) {
  const entries = Object.entries(value);
  const set = (next: [string, Json][]) => onChange(Object.fromEntries(next));
  const [clash, setClash] = useState<string | null>(null);
  // Nested values may be of any kind, even if the outer type excluded null.
  const inner = ALL_KINDS;
  return (
    <div className="flex flex-col gap-2">
      {entries.length === 0 && <p className="text-xs text-faint">{uiText("editors.ValueEditor.keine_eigenschaften_36c4dd")}</p>}
      {entries.map(([key, entry], index) => (
        <div key={`${index}`} className="grid items-start gap-2 sm:grid-cols-[minmax(8rem,12rem)_1fr_auto]">
          <Input
            aria-label={uiText("editors.ValueEditor.v0_schlussel_v1_59f39d", { v0: (label), v1: (index + 1) })}
            key={`${index}:${key}`}
            defaultValue={key}
            onBlur={(e) => {
              const to = e.target.value;
              if (to === key) return setClash(null);
              if (entries.some(([k], i) => i !== index && k === to)) {
                setClash(uiText("editors.ValueEditor.der_schlussel_v0_existiert_bereits_99dc5d", { v0: (to) }));
                e.target.value = key;
                return;
              }
              setClash(null);
              set(entries.map(([k, v], i) => (i === index ? [to, v] : [k, v])));
            }}
          />
          <ValueEditor value={entry} pointer={join(pointer, key)} label={uiText("editors.ValueEditor.v0_v1_a30df1", { v0: (label), v1: (key || uiText("editors.ValueEditor.leer_ac5c66")) })} allowedKinds={inner} expert={false} depth={depth + 1} onChange={(next) => set(entries.map(([k, v], i) => (i === index ? [k, next] : [k, v])))} />
          <SmallButton label={uiText("editors.ValueEditor.eigenschaft_v0_entfernen_7fded9", { v0: (key || index + 1) })} onClick={() => set(entries.filter((_, i) => i !== index))}>
            <Trash2 size={14} />
          </SmallButton>
        </div>
      ))}
      {clash && <p role="alert" className="text-xs text-bad">{clash}</p>}
      <div>
        <Button
          variant="outline"
          size="sm"
          aria-label={uiText("editors.ValueEditor.v0_eigenschaft_hinzufugen_a918ab", { v0: (label) })}
          onClick={() => {
            let n = entries.length + 1;
            while (entries.some(([k]) => k === `schluessel${n}`)) n += 1;
            set([...entries, [`schluessel${n}`, '']]);
          }}
        >
          <Plus size={13} /> {uiText("editors.ValueEditor.eigenschaft_f854ee")}</Button>
      </div>
    </div>
  );
}

function ArrayRows({ value, onChange, pointer, label, depth }: { value: Json[]; onChange: (next: Json) => void; pointer: string; label: string; depth: number }) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const copy = value.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item as Json);
    onChange(copy);
  };
  const inner = ALL_KINDS;
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && <p className="text-xs text-faint">{uiText("editors.ValueEditor.leere_liste_523d40")}</p>}
      {value.map((item, index) => (
        <div key={index} className="grid items-start gap-1 sm:grid-cols-[1fr_auto]">
          <ValueEditor value={item} pointer={join(pointer, index)} label={uiText("editors.ValueEditor.v0_v1_6f0604", { v0: (label), v1: (index + 1) })} allowedKinds={inner} expert={false} depth={depth + 1} onChange={(next) => onChange(value.map((v, i) => (i === index ? next : v)))} />
          <div className="flex">
            <SmallButton label={uiText("editors.ValueEditor.element_v0_nach_oben_b1686b", { v0: (index + 1) })} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={14} /></SmallButton>
            <SmallButton label={uiText("editors.ValueEditor.element_v0_nach_unten_0f3f34", { v0: (index + 1) })} disabled={index === value.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={14} /></SmallButton>
            <SmallButton label={uiText("editors.ValueEditor.element_v0_entfernen_d4285b", { v0: (index + 1) })} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={14} /></SmallButton>
          </div>
        </div>
      ))}
      <div>
        <Button variant="outline" size="sm" aria-label={uiText("editors.ValueEditor.v0_element_hinzufugen_e37d2b", { v0: (label) })} onClick={() => onChange([...value, ''])}>
          <Plus size={13} /> {uiText("editors.ValueEditor.element_4e5b54")}</Button>
      </div>
    </div>
  );
}

/** Optional expert view of the same value; invalid text never overwrites it. */
function ExpertJson({ value, onChange, label }: { value: Json; onChange: (next: Json) => void; label: string }) {
  const canonical = JSON.stringify(value, null, 2);
  const [text, setText] = useState(canonical);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(value)) setText(canonical);
    } catch {
      /* keep the in-progress text */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical]);
  return (
    <Collapsible title={uiText("editors.ValueEditor.json_ansicht_optional_experte_cb2cb8")} className="border-line/60 bg-transparent">
      <Textarea
        aria-label={uiText("editors.ValueEditor.v0_json_df53e7", { v0: (label) })}
        rows={6}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value) as Json);
            setError(null);
          } catch {
            setError(uiText("common.invalidJson"));
          }
        }}
      />
      {error && <p role="alert" className="mt-1 text-xs text-bad">{uiText("editors.ValueEditor.ungultiges_json_nicht_ubernommen_37858e")}{error}</p>}
    </Collapsible>
  );
}

export const isStructured = (value: Json | undefined): boolean => Array.isArray(value) || isObject(value);

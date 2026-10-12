import { Checkbox } from '@/components/ui/controls';
import { Input, Select } from '@/components/ui/form';
import { deref, type JsonSchema } from '@/lib/capabilities';
import { isObject, join, type Json, type JsonObject } from '@/lib/json';
import { AddButton, Fld, IconButton, JsonValueEditor, NumberField, SectionTitle } from './common';
import { Trash2 } from 'lucide-react';

/**
 * Generic form for any JSON Schema fragment delivered by the server (type
 * parameter schemas, operators without a dedicated editor). It interprets the
 * schema; it does not validate — the server stays authoritative. Anything it
 * cannot represent falls back to a raw JSON field, so no value is ever dropped.
 */

export interface SchemaFormProps {
  root: JsonSchema;
  node: Json | undefined;
  value: Json | undefined;
  onChange: (next: Json | undefined) => void;
  pointer: string;
  label?: string;
  required?: boolean;
  /** Renders a discriminated `op` union (the recursive rule editor). */
  renderRule?: (props: { value: JsonObject; onChange: (next: JsonObject) => void; pointer: string; label?: string }) => React.ReactNode;
}

function nullable(node: JsonObject): { inner: JsonObject; isNullable: boolean } | null {
  const variants = node.anyOf;
  if (!Array.isArray(variants)) return null;
  const nonNull = variants.filter((v) => !(isObject(v) && v.type === 'null'));
  if (nonNull.length === 1 && isObject(nonNull[0])) return { inner: nonNull[0], isNullable: nonNull.length < variants.length };
  return null;
}

export function defaultFor(root: JsonSchema, rawNode: Json | undefined): Json {
  const node = deref(root, rawNode) ?? {};
  if ('default' in node) return node.default as Json;
  if ('const' in node) return node.const as Json;
  if (Array.isArray(node.enum) && node.enum.length) return node.enum[0] as Json;
  switch (node.type) {
    case 'string':
      return '';
    case 'integer':
    case 'number':
      return typeof node.minimum === 'number' ? node.minimum : 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}

export function SchemaForm(props: SchemaFormProps) {
  const { root, value, onChange, pointer, label, required, renderRule } = props;
  const node = deref(root, props.node);
  if (!node) return <JsonValueEditor label={label ?? pointer} pointer={pointer} value={value ?? null} onChange={onChange} />;
  const title = label ?? (typeof node.title === 'string' ? node.title : pointer.split('/').pop() ?? '');
  const caption = required ? `${title} *` : title;

  const opt = nullable(node);
  if (opt) {
    const inner = deref(root, opt.inner) ?? {};
    const text = typeof inner.type === 'string' && ['string', 'number', 'integer'].includes(inner.type);
    if (text || (value === null || value === undefined)) {
      if (inner.type === 'string') {
        return (
          <Fld label={caption} pointer={pointer}>
            {(p) => <Input {...p} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />}
          </Fld>
        );
      }
      if (inner.type === 'number' || inner.type === 'integer') {
        return (
          <Fld label={caption} pointer={pointer} hint="leer lassen für „nicht gesetzt“">
            {(p) => <Input {...p} type="number" step="any" value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />}
          </Fld>
        );
      }
    }
    return <SchemaForm {...props} node={opt.inner} />;
  }

  if ('const' in node) {
    return (
      <Fld label={caption} pointer={pointer}>
        {(p) => <Input {...p} readOnly value={String(node.const)} />}
      </Fld>
    );
  }
  if (Array.isArray(node.enum)) {
    const options = node.enum;
    return (
      <Fld label={caption} pointer={pointer}>
        {(p) => (
          <Select {...p} value={String(value ?? options[0])} onChange={(e) => onChange(options.find((v) => String(v) === e.target.value))}>
            {options.map((v) => (
              <option key={String(v)} value={String(v)}>{String(v)}</option>
            ))}
          </Select>
        )}
      </Fld>
    );
  }
  if (node.type === 'boolean') {
    return <Checkbox checked={value === true} onCheckedChange={onChange} label={caption} />;
  }
  if (node.type === 'integer' || node.type === 'number') {
    return (
      <NumberField
        label={caption}
        pointer={pointer}
        value={typeof value === 'number' ? value : 0}
        min={typeof node.minimum === 'number' ? node.minimum : undefined}
        step={node.type === 'integer' ? 1 : undefined}
        hint={typeof node.exclusiveMinimum === 'number' ? `größer als ${node.exclusiveMinimum}` : undefined}
        onChange={onChange}
      />
    );
  }
  if (node.type === 'string') {
    return (
      <Fld label={caption} pointer={pointer} hint={typeof node.pattern === 'string' ? <>Muster: <code>{node.pattern}</code></> : undefined}>
        {(p) => <Input {...p} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />}
      </Fld>
    );
  }
  if (isObject(node.discriminator) && node.discriminator.propertyName === 'op' && renderRule && isObject(value)) {
    return <>{renderRule({ value, onChange, pointer, label: caption })}</>;
  }
  if (node.type === 'array') {
    const list = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-col gap-2">
        <SectionTitle aside={<AddButton onClick={() => onChange([...list, defaultFor(root, node.items)])}>Eintrag</AddButton>}>{caption}</SectionTitle>
        {list.map((item, i) => (
          <div key={i} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-line p-2">
            <div className="min-w-0 flex-1">
              <SchemaForm {...props} node={node.items} value={item} label={`#${i + 1}`} pointer={join(pointer, i)} required={false} onChange={(next) => onChange(list.map((x, j) => (j === i ? (next ?? null) : x)))} />
            </div>
            <IconButton label="Eintrag entfernen" tone="danger" onClick={() => onChange(list.filter((_, j) => j !== i))}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        {list.length === 0 && <p className="text-xs text-faint">leer</p>}
      </div>
    );
  }
  if (node.type === 'object' && isObject(node.properties)) {
    const properties = node.properties;
    const requiredKeys = Array.isArray(node.required) ? (node.required as string[]) : [];
    const current = isObject(value) ? value : {};
    return (
      <div className="flex flex-col gap-3">
        {props.label !== undefined && <SectionTitle>{caption}</SectionTitle>}
        {Object.entries(properties).map(([key, child]) => (
          <SchemaForm
            key={key}
            {...props}
            node={child}
            label={undefined}
            value={current[key]}
            pointer={join(pointer, key)}
            required={requiredKeys.includes(key)}
            onChange={(next) => {
              const copy: JsonObject = { ...current };
              if (next === undefined || (next === null && !requiredKeys.includes(key) && 'default' in (deref(root, child) ?? {}) && (deref(root, child) as JsonObject).default === null)) delete copy[key];
              else copy[key] = next;
              onChange(copy);
            }}
          />
        ))}
      </div>
    );
  }
  // Open-ended objects, unions we cannot interpret: raw JSON keeps every value reachable.
  return <JsonValueEditor label={caption} pointer={pointer} value={value ?? null} onChange={onChange} hint="Struktur ohne Formular – als JSON bearbeiten." />;
}

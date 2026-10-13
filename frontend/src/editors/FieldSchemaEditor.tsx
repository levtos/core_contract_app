import { useState } from 'react';
import { Checkbox } from '@/components/ui/controls';
import { Input, Select } from '@/components/ui/form';
import { FIELD_TYPES, FIELD_TYPE_LABELS, type FieldSchema, type FieldType } from '@/features/authoring/model';
import { join, type Json } from '@/lib/json';
import { Fld, StringListEditor } from './common';
import { Extras } from './Extras';

/** Type, required/physical flags, unit and (for enums) the value catalog of one typed value. */
export function FieldSchemaEditor({
  value,
  onChange,
  pointer,
  types = FIELD_TYPES,
  compact = false,
  idPrefix,
}: {
  value: FieldSchema;
  onChange: (next: FieldSchema) => void;
  pointer: string;
  types?: FieldType[];
  compact?: boolean;
  idPrefix?: string;
}) {
  const [restricted, setRestricted] = useState(false);
  const catalog = Array.isArray(value.value_catalog) ? (value.value_catalog as string[]) : [];
  const set = (patch: Record<string, Json | undefined>) => {
    const next: Record<string, Json> = { ...value };
    for (const [key, entry] of Object.entries(patch)) {
      if (entry === undefined) delete next[key];
      else next[key] = entry;
    }
    onChange(next as FieldSchema);
  };
  return (
    <div className="flex flex-col gap-3" data-pointer={pointer} data-testid={idPrefix}>
      <div className={compact ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3 sm:grid-cols-3'}>
        <Fld label="Typ" pointer={join(pointer, 'type')}>
          {(props) => (
            <Select
              {...props}
              value={value.type}
              onChange={(e) => {
                const type = e.target.value as FieldType;
                set({ type, ...(type !== 'enum' && catalog.length === 0 ? { value_catalog: undefined } : {}) });
              }}
            >
              {types.map((type) => (
                <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>
              ))}
            </Select>
          )}
        </Fld>
        <Fld label="Einheit (optional)" pointer={join(pointer, 'unit')}>
          {(props) => (
            <Input {...props} value={typeof value.unit === 'string' ? value.unit : ''} placeholder="z. B. W, °C" onChange={(e) => set({ unit: e.target.value === '' ? undefined : e.target.value })} />
          )}
        </Fld>
        <div className="flex flex-col justify-end gap-2 pb-1.5">
          <Checkbox checked={value.required} onCheckedChange={(required) => set({ required })} label="Pflichtwert" />
          <Checkbox checked={value.physical_state} onCheckedChange={(physical_state) => set({ physical_state })} label="Physischer Zustand" />
        </div>
      </div>
      {value.type === 'text' && catalog.length === 0 && !restricted && (
        <Checkbox checked={false} onCheckedChange={setRestricted} label="Auf feste Textwerte einschränken (Wertekatalog)" />
      )}
      {(value.type === 'enum' || catalog.length > 0 || (value.type === 'text' && restricted)) && (
        <StringListEditor
          label={value.type === 'enum' ? 'Wertekatalog (Pflicht für Enum)' : 'Wertekatalog (schränkt Werte ein)'}
          pointer={join(pointer, 'value_catalog')}
          value={catalog}
          onChange={(next) => set({ value_catalog: next.length === 0 && value.type !== 'enum' ? undefined : next })}
        />
      )}
      <Extras def="FieldSchema" value={value} pointer={pointer} onChange={(next) => onChange(next as FieldSchema)} />
    </div>
  );
}

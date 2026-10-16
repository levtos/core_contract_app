import { t } from '@/i18n';
import { fieldLabel } from '@/i18n/codes';
import { asArray, asObject, str, type FieldSchema } from '@/features/authoring/model';
import type { TypeEntry } from '@/features/authoring/catalog';
import { resolveRef } from '@/features/authoring/usage';
import { isObject, type JsonObject } from '@/lib/json';
import { displayValue } from '@/lib/status';
import type { Envelope, HaEntity, Registry } from '@/lib/types';
import type { Tone } from '@/components/ui/badge';

export function fieldsForContract(contract: JsonObject, config: Registry | null, types: TypeEntry[]) {
  const type = types.find(item => item.type_id === contract.type_id && item.type_version === contract.type_version);
  const fields = { ...type?.fields };
  const definition = asArray(config?.definitions).filter(isObject).find(item => item.type_id === contract.type_id && item.type_version === contract.type_version);
  for (const [name, rule] of Object.entries(asObject(definition?.outputs))) if (isObject(rule) && rule.op === 'temporal' && rule.operation === 'age' && fields[name]) fields[name] = { ...fields[name], unit: 's' };
  if (contract.type_id === 'test.echo' && fields.value) {
    const input = asArray(contract.inputs).filter(isObject)[0];
    const source = asArray(config?.sources).filter(isObject).find(item => item.source_id === input?.ref);
    const unit = asObject(source?.value_schema).unit;
    if (typeof unit === 'string') fields.value = { ...fields.value, unit };
  }
  return fields;
}

export function contractValue(envelope: Envelope | null, fields: Record<string, FieldSchema>): string {
  if (!envelope) return t('alpha7.contract.noValue');
  return Object.entries(envelope.fields).map(([name, field]) => `${Object.keys(envelope.fields).length > 1 ? `${fieldLabel(name)}: ` : ''}${displayValue(field, str(fields[name]?.unit))}`).join(' · ');
}

/** A single presentation chip; health and field states remain server facts. */
export function contractState(envelope: Envelope | null, enabled: boolean, draftOnly = false, stale = false): { label: string; tone: Tone; hint: string } {
  const state = (key: string, tone: Tone) => ({ label: t(`alpha7.contract.state.${key}`), tone, hint: t(`alpha7.contract.state.${key}Help`) });
  if (draftOnly) return state('draft', 'info');
  if (!enabled) return state('off', 'neutral');
  if (!envelope) return state('unknown', 'neutral');
  if (stale) return state('oldConnection', 'warn');
  const fields = Object.values(envelope.fields);
  const codes = fields.flatMap(field => field.reasons.map(reason => reason.code));
  if (codes.some(code => ['evaluation_error', 'invalid_value', 'config_incomplete'].includes(code))) return state('error', 'bad');
  if (codes.includes('input_stale')) return state('stale', 'warn');
  if (fields.some(field => field.status === 'unknown' || field.status === 'unresolved')) return state('unknown', 'neutral');
  if (envelope.contract_health === 'degraded') return state('limited', 'warn');
  if (fields.some(field => field.status === 'held')) return state('held', 'info');
  return state('healthy', 'ok');
}

export interface ContractSource { id: string; name: string; entityId?: string; sourceIndex: number }
/** Walk declared inputs only, including upstream contracts, with cycle protection. */
export function contractSources(contractId: string, config: Registry | null, entities: HaEntity[]): ContractSource[] {
  const seen = new Set<string>(); const result = new Map<string, ContractSource>();
  const sources = asArray(config?.sources).filter(isObject); const contracts = asArray(config?.contracts).filter(isObject);
  const bindings = asArray(config?.bindings).filter(isObject);
  const visit = (id: string) => {
    if (seen.has(id)) return; seen.add(id);
    const contract = contracts.find(item => item.contract_id === id);
    for (const input of asArray(contract?.inputs).filter(isObject)) {
      const target = resolveRef(str(input.ref), config);
      if (target?.kind === 'contract') visit(target.id);
      if (target?.kind !== 'source') continue;
      const sourceIndex = sources.findIndex(item => item.source_id === target.id); const source = sources[sourceIndex];
      const attached = bindings.filter(item => item.source_id === target.id);
      if (!attached.length) result.set(target.id, { id: target.id, name: str(source?.display_name) || target.id, sourceIndex });
      for (const binding of attached) {
        const entityId = str(asObject(binding.adapter).ha_entity_id) || undefined;
        const name = entities.find(item => item.entity_id === entityId)?.display_name || str(binding.display_name) || str(source?.display_name) || entityId || target.id;
        result.set(`${target.id}:${entityId ?? str(binding.binding_id)}`, { id: target.id, name, entityId, sourceIndex });
      }
    }
  };
  visit(contractId); return [...result.values()];
}

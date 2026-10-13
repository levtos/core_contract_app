import { isObject, type JsonObject } from '@/lib/json';
import { asArray, str } from './model';

/**
 * Display-only dependency facts derived from a registry document, used to show
 * "verwendet von". They never decide validity — validation stays on the server.
 */

export interface RefTarget {
  kind: 'source' | 'contract';
  id: string;
  field: string | null;
}

/** Same longest-prefix rule as the server's resolve_ref (source id, contract id, contract.field). */
export function resolveRef(ref: string, config: JsonObject | null | undefined): RefTarget | null {
  const sources = new Set(asArray(config?.sources).filter(isObject).map((s) => str(s.source_id)));
  if (sources.has(ref)) return { kind: 'source', id: ref, field: null };
  const contracts = asArray(config?.contracts)
    .filter(isObject)
    .map((c) => str(c.contract_id))
    .sort((a, b) => b.length - a.length);
  for (const id of contracts) {
    if (ref === id) return { kind: 'contract', id, field: null };
    if (ref.startsWith(`${id}.`)) return { kind: 'contract', id, field: ref.slice(id.length + 1) };
  }
  return null;
}

export interface Consumers {
  contracts: string[];
  bindings: string[];
  sources: string[];
}

export function consumersOfSource(config: JsonObject | null | undefined, sourceId: string): Consumers {
  const contracts = asArray(config?.contracts)
    .filter(isObject)
    .filter((c) => asArray(c.inputs).filter(isObject).some((i) => resolveRef(str(i.ref), config)?.id === sourceId))
    .map((c) => str(c.contract_id));
  const bindings = asArray(config?.bindings).filter(isObject).filter((b) => str(b.source_id) === sourceId).map((b) => str(b.binding_id));
  const sources = asArray(config?.sources)
    .filter(isObject)
    .filter((s) => str(asObjectSafe(s.freshness).liveness_source) === sourceId)
    .map((s) => str(s.source_id));
  return { contracts, bindings, sources };
}

function asObjectSafe(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

export function consumersOfContract(config: JsonObject | null | undefined, contractId: string): string[] {
  return asArray(config?.contracts)
    .filter(isObject)
    .filter((c) => str(c.contract_id) !== contractId && asArray(c.inputs).filter(isObject).some((i) => resolveRef(str(i.ref), config)?.id === contractId))
    .map((c) => str(c.contract_id));
}

export function contractsUsingDefinition(config: JsonObject | null | undefined, typeId: string, version: number): string[] {
  return asArray(config?.contracts)
    .filter(isObject)
    .filter((c) => str(c.type_id) === typeId && Number(c.type_version) === version)
    .map((c) => str(c.contract_id));
}

export function bindingsUsingCatalog(config: JsonObject | null | undefined, catalogId: string): string[] {
  return asArray(config?.bindings)
    .filter(isObject)
    .filter((b) => str(asObjectSafe(b.transform).catalog_id) === catalogId)
    .map((b) => str(b.binding_id));
}

export function sourcesUsingDependency(config: JsonObject | null | undefined, dependencyId: string): string[] {
  return asArray(config?.sources).filter(isObject).filter((s) => str(s.dependency_id) === dependencyId).map((s) => str(s.source_id));
}

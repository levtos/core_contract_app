import { isObject, type JsonObject } from '@/lib/json';
import { asArray, str } from './model';

export interface Location {
  to: string;
  label: string;
}

const COLLECTIONS: Record<string, { tab: string; singular: string }> = {
  sources: { tab: 'sources', singular: 'Source' },
  bindings: { tab: 'bindings', singular: 'Binding' },
  catalogs: { tab: 'catalogs', singular: 'Katalog' },
  dependencies: { tab: 'dependencies', singular: 'Dependency' },
};

const DEFINITION_TABS: Record<string, string> = {
  inputs: 'inputs',
  refresh_inputs: 'general',
  schema: 'outputs',
  outputs: 'outputs',
  rules: 'rules',
  machine: 'machine',
};

/** Where in the workbench the object addressed by a JSON Pointer is edited. */
export function locateIssue(path: string, config: JsonObject | null | undefined): Location {
  const parts = path.split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  const [collection, index, section] = parts;
  const i = Number(index);
  if (collection && COLLECTIONS[collection] && Number.isInteger(i)) {
    const item = asArray(config?.[collection]).filter(isObject)[i];
    const idKey = collection === 'sources' ? 'source_id' : collection === 'bindings' ? 'binding_id' : collection === 'catalogs' ? 'catalog_id' : 'dependency_id';
    return { to: `/sources?tab=${COLLECTIONS[collection]!.tab}&item=${i}`, label: `${COLLECTIONS[collection]!.singular} ${item ? str(item[idKey]) : `#${i}`}` };
  }
  if (collection === 'contracts' && Number.isInteger(i)) {
    const contract = asArray(config?.contracts).filter(isObject)[i];
    return contract ? { to: `/contracts/${encodeURIComponent(str(contract.contract_id))}`, label: `Contract ${str(contract.contract_id)}` } : { to: '/contracts', label: 'Contracts' };
  }
  if (collection === 'definitions' && Number.isInteger(i)) {
    const definition = asArray(config?.definitions).filter(isObject)[i];
    if (definition) {
      const tab = section ? (DEFINITION_TABS[section] ?? 'general') : 'general';
      return { to: `/definitions/${encodeURIComponent(str(definition.type_id))}/${String(definition.type_version)}?tab=${tab}`, label: `Definition ${str(definition.type_id)}@${String(definition.type_version)}` };
    }
  }
  return { to: '/registry', label: 'Registry-Dokument' };
}

/** Pointer-level structural difference (display only; the semantic analysis is the server's). */
export function changedPaths(before: unknown, after: unknown, path = ''): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((k) => {
      const child = `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      return !(k in before) || !(k in after) ? [child] : changedPaths(before[k], after[k], child);
    });
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(before.length, after.length); i += 1) {
      out.push(...(i >= before.length || i >= after.length ? [`${path}/${i}`] : changedPaths(before[i], after[i], `${path}/${i}`)));
    }
    return out;
  }
  return [path || '/'];
}

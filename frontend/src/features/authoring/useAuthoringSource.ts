import { useMemo } from 'react';
import { useActiveExport, useCapabilities, useRevisions } from '@/lib/queries';
import type { Registry } from '@/lib/types';
import { typeCatalog, type TypeEntry } from './catalog';
import { definitionKey } from './model';
import { useWorkingDocument } from './WorkingDocument';
import { asArray } from './model';
import { isObject } from '@/lib/json';

/**
 * What the authoring pages show: the working draft when one is open (editable),
 * otherwise the active registry (read only). Nothing here is ever "live" data.
 */
export interface AuthoringSource {
  config: Registry | null;
  editable: boolean;
  source: 'draft' | 'active' | 'none';
  types: TypeEntry[];
  /** Definition versions that were part of any activated revision (semantically immutable). */
  activatedVersions: Map<string, number>;
  loading: boolean;
}

export function useAuthoringSource(): AuthoringSource {
  const doc = useWorkingDocument();
  const active = useActiveExport();
  const caps = useCapabilities();
  const revisions = useRevisions();
  const config = doc.config ?? active.data ?? null;
  const types = useMemo(() => typeCatalog(caps.data, config), [caps.data, config]);
  const activatedVersions = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of revisions.data ?? []) {
      for (const definition of asArray(row.config?.definitions)) {
        if (isObject(definition)) {
          const key = definitionKey(definition);
          map.set(key, Math.min(map.get(key) ?? Infinity, row.revision));
        }
      }
    }
    return map;
  }, [revisions.data]);
  return {
    config,
    editable: doc.config !== null,
    source: doc.config ? 'draft' : active.data ? 'active' : 'none',
    types,
    activatedVersions,
    loading: active.isPending || caps.isPending,
  };
}

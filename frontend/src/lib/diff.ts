import type { Diff } from './types';

/** Count each object once; the top-level contract lists repeat objects.contracts. */
export function changedObjectCount(diff: Diff): number {
  return Object.values(diff.objects).reduce((count, group) => count + group.added.length + group.changed.length + group.removed.length, 0);
}

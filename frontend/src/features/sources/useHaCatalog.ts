import { useEffect } from 'react';
import { useHaEntities } from '@/lib/queries';

/** Metadata pages are bounded by the discovery API's 10 000 entity limit. */
export function useHaCatalog(enabled = true) {
  const query = useHaEntities('all', enabled);
  useEffect(() => {
    if (enabled && query.hasNextPage && !query.isFetchingNextPage && (query.data?.pages.length ?? 0) < 60) void query.fetchNextPage();
  }, [enabled, query.hasNextPage, query.isFetchingNextPage, query.data?.pages.length, query.fetchNextPage]);
  return { ...query, entities: query.data?.pages.flatMap(page => page.items) ?? [] };
}

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createBrowserLive, LiveStore, type LiveSnapshot } from './live';
import { useInfo } from './queries';

const LiveContext = createContext<LiveStore | null>(null);

/** Owns one WebSocket for the whole workbench; torn down with the provider. */
export function LiveProvider({ children, store }: { children: ReactNode; store?: LiveStore }) {
  const info = useInfo();
  const installationId = useRef<string | undefined>(undefined);
  installationId.current = info.data?.installation_id;
  const live = useMemo(() => store ?? createBrowserLive(() => installationId.current), [store]);
  useEffect(() => {
    live.start();
    return () => live.stop();
  }, [live]);
  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveSnapshot {
  const store = useContext(LiveContext);
  if (!store) throw new Error('LiveProvider fehlt');
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

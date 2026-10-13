import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { Capabilities } from '@/lib/capabilities';
import type { JsonObject } from '@/lib/json';
import { LiveStore, type SocketLike } from '@/lib/live';
import { LiveProvider } from '@/lib/live-context';
import { SchemaProvider } from '@/lib/schema-context';
import capabilitiesFixture from './fixtures/capabilities.json';

export const caps = capabilitiesFixture as unknown as Capabilities;

/** A live store that never connects: dialogs that read the live revision need a provider. */
export function idleLive(): LiveStore {
  return new LiveStore({ createSocket: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, send() {}, close() {} }) as SocketLike });
}

export function wrap(ui: ReactNode, options: { caps?: Capabilities; live?: LiveStore } = {}) {
  const schema = (options.caps ?? caps).schemas.registry;
  const liveStore = options.live;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SchemaProvider schema={schema}>
        <MemoryRouter>
          {liveStore ? <LiveProvider store={liveStore}>{ui}</LiveProvider> : ui}
        </MemoryRouter>
      </SchemaProvider>
    </QueryClientProvider>,
  );
}

/** Holds a JSON document in state so editors can be driven like in the real app. */
export function Stateful({ initial, children, onValue }: { initial: JsonObject; children: (value: JsonObject, set: (next: JsonObject) => void) => ReactNode; onValue?: (value: JsonObject) => void }) {
  const [value, setValue] = useState(initial);
  const set = (next: JsonObject) => {
    setValue(next);
    onValue?.(next);
  };
  return <>{children(value, set)}</>;
}

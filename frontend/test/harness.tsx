import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { Capabilities } from '@/lib/capabilities';
import type { JsonObject } from '@/lib/json';
import capabilitiesFixture from './fixtures/capabilities.json';

export const caps = capabilitiesFixture as unknown as Capabilities;

export function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
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

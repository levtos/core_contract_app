import { createContext, useContext, type ReactNode } from 'react';
import type { JsonSchema } from './capabilities';
import { useCapabilities } from './queries';

/**
 * The registry JSON Schema delivered by the server (its `$defs` also contain the
 * declarative-definition models). Editors use it to show properties they have no
 * dedicated control for, so schema additions are never silently invisible.
 */
const SchemaContext = createContext<JsonSchema | undefined>(undefined);

export function SchemaProvider({ schema, children }: { schema: JsonSchema | undefined; children: ReactNode }) {
  return <SchemaContext.Provider value={schema}>{children}</SchemaContext.Provider>;
}

export function CapabilitySchemaProvider({ children }: { children: ReactNode }) {
  const caps = useCapabilities();
  return <SchemaProvider schema={caps.data?.schemas.registry}>{children}</SchemaProvider>;
}

export const useRegistrySchema = (): JsonSchema | undefined => useContext(SchemaContext);

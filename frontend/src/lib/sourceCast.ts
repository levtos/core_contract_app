import { asObject, str } from '@/features/authoring/model';
import type { JsonObject } from './json';

/** Explicit HA text conversion; enumerations require a declared mapping. */
export function sourceCast(source: JsonObject | undefined): JsonObject | undefined {
  const type = str(asObject(source?.value_schema).type) || ({ numeric: 'number', boolean: 'bool', text: 'text' } as Record<string, string>)[str(source?.source_type)];
  return type === 'number' || type === 'bool' || type === 'text' ? { kind: 'type_cast', target: type } : undefined;
}

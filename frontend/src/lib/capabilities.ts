import type { Json, JsonObject } from './json';
import { getAt, isObject } from './json';

/**
 * Typed view of GET /api/v1/capabilities. The editors interpret this metadata
 * instead of hard-coding the synthetic `test.*` types; unknown additions stay
 * reachable through the generic schema form.
 */
export type JsonSchema = JsonObject;

export interface FieldSchemaValue extends JsonObject {
  type: 'bool' | 'number' | 'enum' | 'text' | 'timestamp' | 'object';
  required: boolean;
  physical_state: boolean;
}

export interface TypeDescription {
  type_id: string;
  type_version: number;
  schema: { fields: Record<string, FieldSchemaValue>; available_projection: string[] } & JsonObject;
  producer: string;
  parameter_schema: JsonSchema;
  inputs: { name: string; required: boolean }[];
  restore: string[];
  commands?: Record<string, JsonSchema>;
  refresh_inputs?: string[];
  grace_outputs?: string[];
  definition?: JsonObject;
  definition_fingerprint?: string;
}

export interface Operator {
  op: string;
  stateful: boolean;
  schema_ref: string;
}

export interface Capabilities {
  capability_version: number;
  history: { kinds: string[]; limit: number } & JsonObject;
  draft_id: { pattern: string };
  types: TypeDescription[];
  schemas: { registry: JsonSchema; definition: JsonSchema; history_query: JsonSchema };
  operators: Operator[];
  formulas: { name: string; version: number; input_schema: FieldSchemaValue; output_schema: FieldSchemaValue }[];
  fusion: { strategy: string; priority: string | null; conflict_detection: boolean }[];
  temporal: { operation: string; arguments: number; stateful: boolean; restores_absolute_deadlines: boolean }[];
  limits: Record<string, Json>;
  reasons: { version: number; codes: { code: string; description: string }[] };
  map_keys: JsonObject;
  fingerprint_versions: number[];
}

/** Resolve a local `#/$defs/…` reference. */
export function deref(root: JsonSchema, node: Json | undefined): JsonObject | undefined {
  if (!isObject(node)) return undefined;
  const ref = node.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/')) {
    const target = getAt(root, ref.slice(1));
    return isObject(target) ? target : undefined;
  }
  return node;
}

/** Enum values at `$defs/<def>/properties/<prop>/enum`; `fallback` if the server omits them. */
export function enumAt(
  schema: JsonSchema | undefined,
  def: string,
  prop: string,
  fallback: string[] = [],
): string[] {
  const value = schema ? getAt(schema, `/$defs/${def}/properties/${prop}/enum`) : undefined;
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : fallback;
}

export function numberLimit(caps: Capabilities | undefined, key: string, fallback: number): number {
  const value = caps?.limits?.[key];
  return typeof value === 'number' ? value : fallback;
}

export function findType(caps: Capabilities | undefined, typeId: string, version: number): TypeDescription | undefined {
  return caps?.types.find((t) => t.type_id === typeId && t.type_version === version);
}

/** Declared outputs of a type, used to offer `contract.field` references. */
export function typeFields(type: TypeDescription | undefined): string[] {
  return type ? Object.keys(type.schema.fields) : [];
}

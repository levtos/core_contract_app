/** Plain JSON values and immutable, JSON-Pointer-addressed document helpers. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const clone = <T,>(value: T): T => structuredClone(value);

export function escapePointer(segment: string | number): string {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export const toPointer = (parts: readonly (string | number)[]): string =>
  parts.length === 0 ? '' : '/' + parts.map(escapePointer).join('/');

export const fromPointer = (pointer: string): string[] =>
  pointer === '' || pointer === '/' ? [] : pointer.slice(1).split('/').map(unescapePointer);

export const join = (base: string, ...parts: (string | number)[]): string =>
  base + parts.map((p) => '/' + escapePointer(p)).join('');

export function getAt(root: unknown, pointer: string): Json | undefined {
  let current: unknown = root;
  for (const part of fromPointer(pointer)) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (isObject(current)) current = current[part];
    else return undefined;
  }
  return current as Json | undefined;
}

/** Returns a new document with `value` written at `pointer`; `undefined` removes the entry. */
export function setAt<T extends Json>(root: T, pointer: string, value: Json | undefined): T {
  const parts = fromPointer(pointer);
  if (parts.length === 0) return (value ?? null) as T;
  const write = (node: Json | undefined, index: number): Json => {
    const key = parts[index]!;
    const last = index === parts.length - 1;
    if (Array.isArray(node)) {
      const copy = node.slice();
      const at = Number(key);
      if (last) {
        if (value === undefined) copy.splice(at, 1);
        else copy[at] = value;
      } else copy[at] = write(copy[at], index + 1);
      return copy;
    }
    const copy: JsonObject = isObject(node) ? { ...node } : {};
    if (last) {
      if (value === undefined) delete copy[key];
      else copy[key] = value;
    } else copy[key] = write(copy[key], index + 1);
    return copy;
  };
  return write(root, 0) as T;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((k) => k in right && deepEqual(left[k], right[k]))
  );
}

/** Stable pretty form with sorted keys, used for diffs and exports. */
export function canonicalJson(value: unknown, indent = 2): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : isObject(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return JSON.stringify(sort(value), null, indent);
}

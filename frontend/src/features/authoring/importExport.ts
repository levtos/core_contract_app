import { canonicalJson, isObject } from '@/lib/json';
import type { Registry } from '@/lib/types';

export type ParsedImport = { ok: true; config: Registry; display_name?: string } | { ok: false; error: string };

/**
 * Import has no privileged path: the text becomes an ordinary draft and is then
 * validated like every other draft. Only syntax and "is a JSON object" are
 * checked here (the server rejects null/array/scalar documents as well).
 */
export function parseRegistryJson(text: string): ParsedImport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Kein gültiges JSON: ${(error as Error).message}` };
  }
  if (!isObject(value)) return { ok: false, error: 'Eine Registry ist ein JSON-Objekt (kein Array, Skalar oder null).' };
  // Accept the wrapped form {"display_name", "config"} as well as the raw configuration.
  if (isObject(value.config) && !('config_schema_version' in value)) {
    return { ok: true, config: value.config as Registry, display_name: typeof value.display_name === 'string' ? value.display_name : undefined };
  }
  return { ok: true, config: value as Registry };
}

export function exportRegistry(config: Registry): string {
  return canonicalJson(config);
}

/** Browser download of generated text (no server round trip, no credentials involved). */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFilename = (name: string): string => name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'registry';

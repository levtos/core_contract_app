import type { Json } from './json';

/** One structured server finding; paths are JSON Pointers into the submitted document. */
export interface Issue {
  code: string;
  path: string;
  object_id?: string | null;
  message: string;
}

export type ErrorKind =
  | 'validation'
  | 'conflict'
  | 'auth'
  | 'persistence'
  | 'not_found'
  | 'unavailable'
  | 'rate_limited'
  | 'network'
  | 'request';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: Issue[];
  readonly kind: ErrorKind;
  constructor(status: number, code: string, issues: Issue[], detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.kind = classify(status, code, issues);
  }
}

function classify(status: number, code: string, issues: Issue[]): ErrorKind {
  if (status === 0) return 'network';
  if (issues.length > 0) return 'validation';
  if (status === 409 || code.endsWith('conflict')) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (code === 'persistence_unavailable') return 'persistence';
  if (status === 404) return 'not_found';
  if (status === 503) return 'unavailable';
  return 'request';
}

interface ErrorBody {
  error?: string;
  issues?: Issue[];
  details?: { location?: (string | number)[]; type?: string }[];
}

export function issuesFromBody(body: ErrorBody | null | undefined): Issue[] {
  if (!body) return [];
  if (Array.isArray(body.issues) && body.issues.length > 0) return body.issues;
  // Structural Pydantic failures carry only locations; show them at the same field.
  return (body.details ?? [])
    .filter((d) => Array.isArray(d.location))
    .map((d) => ({
      code: `schema.${d.type ?? 'invalid'}`,
      path:
        '/' +
        d.location!.map((p) => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/'),
      message: d.type ?? 'invalid',
    }));
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/** Same-origin call below the (relative) Ingress prefix. No credentials are kept in the browser. */
export async function api<T = Json>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(`./api/v1/${path}`, {
      method,
      headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', [], 'Der Dienst ist nicht erreichbar.');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    const code = body?.error ?? 'invalid_response';
    throw new ApiError(response.status, code, issuesFromBody(body), `${code} (${response.status})`);
  }
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

const MESSAGES: Record<string, string> = {
  draft_version_conflict:
    'Der Draft wurde zwischenzeitlich geändert. Neu laden und Änderungen zusammenführen.',
  active_revision_conflict:
    'Die aktive Revision hat sich geändert. Stand neu laden und erneut prüfen.',
  no_active_registry: 'Es ist noch keine Registry aktiv.',
  persistence_unavailable: 'Persistenz derzeit nicht erreichbar. Es wurde nichts geändert.',
  ha_discovery_unavailable: 'Home-Assistant-Entitätsliste derzeit nicht verfügbar.',
  contract_disabled: 'Der Contract ist deaktiviert.',
  revision_not_found: 'Diese Revision existiert nicht.',
  evidence_not_found: 'Zu dieser Referenz liegt keine aufgezeichnete Evidenz vor.',
  invalid_request: 'Die Anfrage ist ungültig.',
  network_error: 'Der Dienst ist nicht erreichbar.',
  rate_limited: 'Zu viele Anfragen in kurzer Zeit. Die Oberfläche versucht es automatisch später erneut.',
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'auth') return 'Keine Berechtigung für diese Aktion.';
    if (error.kind === 'rate_limited') return MESSAGES.rate_limited!;
    return MESSAGES[error.code] ?? `Anfrage fehlgeschlagen: ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unbekannter Fehler.';
}

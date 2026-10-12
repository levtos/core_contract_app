import { vi } from 'vitest';
import type { Issue } from '@/lib/api';
import type { JsonObject } from '@/lib/json';
import capabilities from './fixtures/capabilities.json';
import validOk from './fixtures/validate-ok.json';
import validBad from './fixtures/validate-bad.json';

/**
 * In-memory stand-in for the Alpha-4 HTTP API with the same concurrency rules:
 * draft_version OCC, expected_active_revision OCC, rollback = new revision.
 * Validation outcome is injectable; the real engine is covered by backend tests.
 */
export interface FakeDraft {
  draft_id: string;
  draft_version: number;
  config: JsonObject;
  display_name: string;
  base_revision: number;
  created_at: string;
  updated_at: string;
}
export interface FakeRevision {
  revision: number;
  config: JsonObject;
  checksum: string;
  created_at: string;
}

export interface FakeApi {
  drafts: Map<string, FakeDraft>;
  revisions: FakeRevision[];
  activations: { revision: number; at: string; operation: string }[];
  calls: { method: string; path: string; body: unknown }[];
  /** Return issues to make validation fail for a document. */
  issuesFor: (config: JsonObject) => Issue[];
  /** Inject a server-side change between load and save (simulates a second session). */
  touchDraft: (id: string, patch: Partial<FakeDraft>) => void;
  failNext: { path: RegExp; status: number; body: unknown }[];
  active: () => number;
  fetch: ReturnType<typeof vi.fn>;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function installFakeApi(initial: { revisions?: FakeRevision[]; drafts?: FakeDraft[] } = {}): FakeApi {
  const api: FakeApi = {
    drafts: new Map((initial.drafts ?? []).map((d) => [d.draft_id, d])),
    revisions: initial.revisions ?? [],
    activations: [],
    calls: [],
    issuesFor: (config) => ((config as { __invalid?: boolean }).__invalid ? (validBad.issues as Issue[]) : []),
    touchDraft(id, patch) {
      const draft = api.drafts.get(id)!;
      api.drafts.set(id, { ...draft, ...patch, draft_version: patch.draft_version ?? draft.draft_version + 1 });
    },
    failNext: [],
    active: () => api.revisions.at(-1)?.revision ?? 0,
    fetch: vi.fn(),
  };
  let counter = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 12, 12, 0, counter++)).toISOString();

  const handle = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    const path = url.replace(/^\.\/api\/v1\//, '');
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    api.calls.push({ method, path, body });
    const forced = api.failNext.findIndex((f) => f.path.test(path));
    if (forced >= 0) {
      const [f] = api.failNext.splice(forced, 1);
      return json(f!.status, f!.body);
    }
    const validation = (config: JsonObject) => {
      const issues = api.issuesFor(config);
      return issues.length ? json(400, { error: 'invalid_request', valid: false, issues, details: [] }) : json(200, { ...validOk, valid: true, issues: [] });
    };
    if (path === 'capabilities') return json(200, capabilities);
    if (path === 'info') return json(200, { version: '1.0.0a4', api_protocol: 1, bridge_protocol: 1, config_schema_version: 1, installation_id: 'inst-1', installation_label: 'Test', epoch_id: 'e1', publication_seq: 1, server_time: stamp() });
    if (path === 'registry/active') return json(200, api.revisions.at(-1) ?? null);
    if (path === 'registry/active/export') return api.revisions.length ? json(200, api.revisions.at(-1)!.config) : json(409, { error: 'no_active_registry' });
    if (path === 'registry/revisions') return json(200, api.revisions);
    if (path === 'registry/drafts' && method === 'GET') return json(200, [...api.drafts.values()]);
    if (path === 'registry/drafts' && method === 'POST') {
      const id = body.draft_id ?? `draft-${api.drafts.size + 1}`;
      const draft: FakeDraft = { draft_id: id, draft_version: 1, config: body.config, display_name: body.display_name ?? '', base_revision: api.active(), created_at: stamp(), updated_at: stamp() };
      api.drafts.set(id, draft);
      return json(200, draft);
    }
    const draftMatch = path.match(/^registry\/drafts\/([^/]+)(?:\/(validate|activate))?$/);
    if (draftMatch) {
      const id = decodeURIComponent(draftMatch[1]!);
      const draft = api.drafts.get(id);
      if (!draft) return json(404, {});
      if (!draftMatch[2] && method === 'GET') return json(200, draft);
      if (!draftMatch[2] && method === 'PUT') {
        if (body.draft_version !== draft.draft_version) return json(409, { error: 'draft_version_conflict', details: [] });
        const next = { ...draft, config: body.config, draft_version: draft.draft_version + 1, updated_at: stamp(), display_name: body.display_name ?? draft.display_name };
        api.drafts.set(id, next);
        return json(200, next);
      }
      if (!draftMatch[2] && method === 'DELETE') {
        if (body.draft_version !== draft.draft_version) return json(409, { error: 'draft_version_conflict', details: [] });
        api.drafts.delete(id);
        return json(200, { deleted: true, draft_id: id });
      }
      if (draftMatch[2] === 'validate') return validation(draft.config);
      if (draftMatch[2] === 'activate') {
        if (body.expected_active_revision !== api.active()) return json(409, { error: 'active_revision_conflict', details: [] });
        if (body.draft_version !== draft.draft_version) return json(409, { error: 'draft_version_conflict', details: [] });
        const issues = api.issuesFor(draft.config);
        if (issues.length) return json(400, { error: 'invalid_request', valid: false, issues, details: [] });
        const revision = { revision: api.active() + 1, config: draft.config, checksum: `sum-${api.active() + 1}`.padEnd(64, '0'), created_at: stamp() };
        api.revisions.push(revision);
        api.activations.push({ revision: revision.revision, at: revision.created_at, operation: 'activate' });
        return json(200, revision);
      }
    }
    if (path === 'registry/validate' && method === 'POST') return validation(body);
    if (path === 'registry/rollback' && method === 'POST') {
      if (body.expected_active_revision !== api.active()) return json(409, { error: 'active_revision_conflict', details: [] });
      const old = api.revisions.find((r) => r.revision === body.revision);
      if (!old) return json(400, { error: 'revision_not_found', details: [] });
      const revision = { revision: api.active() + 1, config: old.config, checksum: old.checksum, created_at: stamp() };
      api.revisions.push(revision);
      api.activations.push({ revision: revision.revision, at: revision.created_at, operation: 'rollback' });
      return json(200, revision);
    }
    if (path.startsWith('history/query/activations')) return json(200, { items: api.activations.map((a) => ({ id: String(a.revision), ...a })), next_cursor: null, limit: 200, order: 'time_desc_key_desc' });
    if (path.startsWith('history/query/')) return json(200, { items: [], next_cursor: null, limit: 100, order: 'time_desc_key_desc' });
    if (path === 'diagnostics/problems') return json(200, { service: { ready: true, publication_confirmed: true, persistence: 'available', ha: 'connected', bridge: 'connected', mqtt: 'disabled', reasons: [] }, problems: [] });
    return json(404, { error: 'not_found' });
  };
  api.fetch.mockImplementation(handle);
  vi.stubGlobal('fetch', api.fetch);
  return api;
}

export const sampleConfig = (extra: JsonObject = {}): JsonObject => ({
  config_schema_version: 1,
  fingerprint_version: 2,
  dependencies: [],
  sources: [],
  bindings: [],
  contracts: [],
  catalogs: [],
  definitions: [],
  ...extra,
});

export const makeDraft = (id: string, config: JsonObject, extra: Partial<FakeDraft> = {}): FakeDraft => ({
  draft_id: id,
  draft_version: 1,
  config,
  display_name: id,
  base_revision: 0,
  created_at: '2026-10-12T10:00:00+00:00',
  updated_at: '2026-10-12T10:00:00+00:00',
  ...extra,
});

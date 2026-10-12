import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, describeError, issuesFromBody } from './api';
import validBad from '../../test/fixtures/validate-bad.json';

const respond = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })));

describe('api client', () => {
  it('uses relative same-origin URLs below the Ingress prefix and no credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);
    await api('registry/drafts', { method: 'POST', body: { a: 1 } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('./api/v1/registry/drafts');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.stringify(init)).not.toMatch(/authorization|bearer/i);
  });

  it('keeps structured validation issues with their JSON-Pointer paths', async () => {
    respond(400, validBad);
    const error = (await api('registry/validate', { method: 'POST', body: {} }).catch((e) => e)) as ApiError;
    expect(error.kind).toBe('validation');
    expect(error.issues[0]).toMatchObject({ code: 'definition.unknown_rule_input', path: '/definitions/0/outputs/value', object_id: 'test.truth' });
  });

  it('maps structural Pydantic locations to pointers when no issues are given', () => {
    expect(issuesFromBody({ error: 'invalid_request', details: [{ location: ['sources', 0, 'freshness'], type: 'missing' }] })).toEqual([
      { code: 'schema.missing', path: '/sources/0/freshness', message: 'missing' },
    ]);
  });

  it.each([
    [409, 'draft_version_conflict', 'conflict'],
    [409, 'active_revision_conflict', 'conflict'],
    [403, '', 'auth'],
    [503, 'persistence_unavailable', 'persistence'],
    [503, 'ha_discovery_unavailable', 'unavailable'],
    [404, '', 'not_found'],
  ])('classifies %i %s as %s', async (status, code, kind) => {
    respond(status, code ? { error: code } : {});
    const error = (await api('x').catch((e) => e)) as ApiError;
    expect(error.kind).toBe(kind);
  });

  it('reports a lost connection as its own kind, not as a server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = (await api('info').catch((e) => e)) as ApiError;
    expect(error.kind).toBe('network');
    expect(describeError(error)).toContain('nicht erreichbar');
  });

  it('explains OCC conflicts without leaking request content', async () => {
    respond(409, { error: 'draft_version_conflict', details: [] });
    const error = await api('registry/drafts/x', { method: 'PUT', body: { config: { password: 'x' } } }).catch((e) => e);
    expect(describeError(error)).toContain('zwischenzeitlich geändert');
    expect(String(error.message)).not.toContain('password');
  });
});

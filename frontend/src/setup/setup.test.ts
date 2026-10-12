import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupRequest, validConnection, type Connection } from './setup';
const connection: Connection = {host: 'postgres-test', port: 5432, database: 'cc_test', user: 'cc_test', sslmode: 'verify-full', ca: ''};
afterEach(() => vi.unstubAllGlobals());
describe('First-run requests', () => {
  it('uses same-origin Ingress with JSON and CSRF, no bearer bypass', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({accepted:true})));
    vi.stubGlobal('fetch', fetch);
    await setupRequest('connect', {connection}, 'ephemeral-csrf');
    expect(fetch).toHaveBeenCalledWith('./api/v1/setup/connect', expect.objectContaining({method: 'POST', headers: {'Content-Type': 'application/json', 'X-Setup-CSRF': 'ephemeral-csrf'}}));
  });
  it('unavailable database produces useful static error without secret reflection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'database_connection_failed', details:'password=secret'}), {status:503})));
    await expect(setupRequest('connect', {})).rejects.toThrow('PostgreSQL nicht erreichbar');
  });
  it('validates new and existing connection, port, identifiers and CA immediately', () => {
    expect(validConnection(connection, false)).toBe(true);
    expect(validConnection(connection, true)).toBe(false);
    expect(validConnection({...connection,password:'test'}, true)).toBe(true);
    for (const change of [{host:''}, {port:0}, {database:'postgres;DROP'}, {ca:'/ssl/../private'}]) expect(validConnection({...connection,...change},false)).toBe(false);
  });
});

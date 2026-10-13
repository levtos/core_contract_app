import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.unmock('@/lib/request-budget');
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => vi.useRealTimers());

it('shares the 100/61s budget across two React clients, invalidations and a reload', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  const { api } = await import('./api');
  const fetch = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  function Client({ name }: { name: string }) {
    const [done, setDone] = useState(0);
    return <><button onClick={() => { void Promise.all(Array.from({ length: 55 }, () => api('info'))).then(() => setDone(55)); }}>{name}</button><output>{name}:{done}</output></>;
  }
  const view = render(<><Client name="Tab A" /><Client name="Tab B" /></>);
  fireEvent.click(screen.getByText('Tab A'));
  fireEvent.click(screen.getByText('Tab B'));
  // fake-indexeddb dispatches transactions on the real event loop.
  await act(async () => { for (let i = 0; i < 800; i++) await new Promise((r) => setImmediate(r)); });
  expect(fetch).toHaveBeenCalledTimes(100);
  view.unmount();
  vi.resetModules();
  const reloaded = await import('./api');
  let reloadDone = false;
  void reloaded.api('info').then(() => { reloadDone = true; });
  await act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); });
  expect(fetch).toHaveBeenCalledTimes(100);
  expect(reloadDone).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(61_000); for (let i = 0; i < 100; i++) await new Promise((r) => setImmediate(r)); });
  expect(fetch).toHaveBeenCalledTimes(111);
  expect(reloadDone).toBe(true);
});

it.each(['registry/drafts/a/activate', 'registry/rollback', 'commands', 'tokens/rotate'])('never replays %s after HTTP 429', async (path) => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  const { api } = await import('./api');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Retry-After': '90' } }));
  vi.stubGlobal('fetch', fetch);
  function Action() {
    const [result, set] = useState('ready');
    return <><button onClick={() => { void api(path, { method: 'POST', body: { role: 'admin' } }).catch(() => set('limited')); }}>Action</button><output>{result}</output></>;
  }
  render(<Action />);
  fireEvent.click(screen.getByText('Action'));
  await act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); });
  expect(screen.getByText('limited')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  const reading = api('info', { signal: controller.signal }).catch((e) => e);
  await act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); });
  expect(fetch).toHaveBeenCalledTimes(1); // shared cooldown applies to a different request
  controller.abort();
  expect((await reading).name).toBe('AbortError');
  await vi.advanceTimersByTimeAsync(100_000);
  expect(fetch).toHaveBeenCalledTimes(1);
});

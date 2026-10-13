/** Shared by all tabs, reloads and Ingress prefixes on this origin. Only timing
 * metadata is persisted. IndexedDB read/write transactions serialize reservations. */
interface Budget { sent: number[]; blockedUntil: number }
const WINDOW = 61_000;
const LIMIT = 100; // Leave headroom below the server's 120/min for WS handshakes.
let database: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('terra.request-budget', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('timing');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error('Gemeinsames Anfragebudget ist nicht verfügbar.')); };
  });
}

async function timing(cooldown = 0): Promise<number> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction('timing', 'readwrite');
    const store = tx.objectStore('timing');
    const request = store.get('ingress');
    let wait = 0;
    request.onsuccess = () => {
      const now = Date.now();
      const previous = request.result as Budget | undefined;
      const state: Budget = {
        sent: (previous?.sent ?? []).filter((at) => at > now - WINDOW),
        blockedUntil: Math.max(previous?.blockedUntil ?? 0, cooldown ? now + cooldown : 0),
      };
      wait = Math.max(0, state.blockedUntil - now, state.sent.length >= LIMIT ? state.sent[0]! + WINDOW - now : 0);
      if (!cooldown && !wait) state.sent.push(now);
      store.put(state, 'ingress');
    };
    tx.oncomplete = () => resolve(wait);
    tx.onerror = tx.onabort = () => reject(new Error('Gemeinsames Anfragebudget ist nicht verfügbar.'));
  });
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** Waiting schedules a request once; it never repeats an HTTP operation. */
export async function reserveRequest(signal?: AbortSignal): Promise<void> {
  for (;;) {
    signal?.throwIfAborted();
    const wait = await timing();
    signal?.throwIfAborted();
    if (!wait) return;
    await pause(wait, signal);
  }
}

/** 429 pauses all tabs. The rejected operation itself is never replayed. */
export async function coolDownRequests(retryAfter: string | null): Promise<void> {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  const duration = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
  await timing(Math.max(WINDOW, Number.isFinite(duration) ? duration : 0));
}

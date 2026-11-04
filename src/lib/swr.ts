/**
 * A small in-memory stale-while-revalidate cache for READ-ONLY GETs, keyed by the full URL.
 *
 *  - fresh (younger than SWR_FRESH_MS): the page paints it and does not ask the network again.
 *  - stale (older, up to SWR_STALE_MAX_MS): the page paints it at once and asks the network quietly.
 *  - nothing / too old: the page shows its normal loading state (cold load).
 *
 * Everything is dropped by swrClear() on any write (api.ts does that for every non-GET), when the outbox or the
 * attendance sender delivers something, and on term / data-epoch / sign-in changes. A GET that was already on its way
 * when the cache was cleared may still answer — but it is never stored (the generation changed) and never shared.
 * Memory only: a reload or a second tab starts empty, and offline behaviour is untouched (errors are never cached).
 */
export const SWR_FRESH_MS = 20_000;
export const SWR_STALE_MAX_MS = 10 * 60_000;
const MAX_ENTRIES = 40;

interface Entry { data: unknown; at: number }
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let generation = 0;

/** Bumped by every swrClear(); lets a holder of its own copy of the data know whether a write happened since. */
export function swrGeneration(): number { return generation; }

/** Forget everything (and stop sharing requests that are on their way). */
export function swrClear(): void {
  generation++;
  cache.clear();
  inflight.clear();
}

export interface SwrHit<T> { data: T; at: number; fresh: boolean }

/** The saved answer for this exact URL, if there is one young enough to show. Never touches the network. */
export function swrPeek<T>(key: string, now: number = Date.now()): SwrHit<T> | null {
  const e = cache.get(key);
  if (!e) return null;
  const age = now - e.at;
  if (age > SWR_STALE_MAX_MS || age < 0) { cache.delete(key); return null; }
  return { data: e.data as T, at: e.at, fresh: age < SWR_FRESH_MS };
}

/**
 * Ask the network (through `fetcher`) and remember the answer. Identical requests that are on their way are shared.
 * A failure is passed on and nothing is stored.
 */
export function swrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const startedIn = generation;
  let raw: Promise<T>;
  try { raw = fetcher(); } catch (e) { raw = Promise.reject(e); }
  const p: Promise<T> = raw.then((data) => {
    if (startedIn === generation) {
      cache.delete(key);
      cache.set(key, { data, at: Date.now() });
      while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    }
    return data;
  }).finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/** The saved answer when it is fresh, else ask the network. For callers that only want the data. */
export function swrGet<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = swrPeek<T>(key);
  return hit?.fresh ? Promise.resolve(hit.data) : swrFetch(key, fetcher);
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { swrClear, swrFetch, swrGet, swrGeneration, swrPeek, SWR_FRESH_MS, SWR_STALE_MAX_MS } from "@client/lib/swr";
import { api } from "@client/lib/api";
import { authRequired, dataEpoch, epochStale, syncPaused } from "@client/lib/session";
import { selectedTermId } from "@client/store";

const defer = <T,>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); swrClear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("swr cache", () => {
  it("a fresh hit is served without any network call", async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    expect(await swrGet("/a", fetcher)).toEqual({ n: 1 });
    vi.setSystemTime(Date.now() + SWR_FRESH_MS - 1000);
    expect(await swrGet("/a", fetcher)).toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(swrPeek("/a")?.fresh).toBe(true);
  });

  it("a stale entry is shown at once, then replaced by the revalidated answer", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });
    await swrFetch("/a", fetcher);
    vi.setSystemTime(Date.now() + SWR_FRESH_MS + 1000);
    const hit = swrPeek<{ n: number }>("/a");
    expect(hit).toMatchObject({ data: { n: 1 }, fresh: false }); // painted immediately
    expect(await swrGet("/a", fetcher)).toEqual({ n: 2 });        // not fresh: asks the network
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(swrPeek<{ n: number }>("/a")).toMatchObject({ data: { n: 2 }, fresh: true });
  });

  it("an entry older than the stale limit is not served (cold load)", async () => {
    await swrFetch("/a", async () => 1);
    vi.setSystemTime(Date.now() + SWR_STALE_MAX_MS + 1);
    expect(swrPeek("/a")).toBeNull();
  });

  it("different URLs (class / day / term / period) never share an answer", async () => {
    await swrFetch("/api/reports/summary?class=c1&term=t1", async () => "c1");
    expect(swrPeek("/api/reports/summary?class=c2&term=t1")).toBeNull();
    expect(swrPeek("/api/reports/summary?class=c1&term=t2")).toBeNull();
    expect(swrPeek("/api/reports/summary?class=c1&term=t1&month=2026-10")).toBeNull();
    expect(swrPeek("/api/reports/summary?class=c1&term=t1")?.data).toBe("c1");
  });

  it("identical requests on their way are shared (one network call)", async () => {
    const d = defer<string>();
    const fetcher = vi.fn(() => d.promise);
    const a = swrFetch("/a", fetcher); const b = swrFetch("/a", fetcher);
    d.resolve("x");
    expect(await a).toBe("x"); expect(await b).toBe("x");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("a failure is passed on and does not poison the cache or the next try", async () => {
    await expect(swrFetch("/a", () => Promise.reject(new Error("net")))).rejects.toThrow("net");
    expect(swrPeek("/a")).toBeNull();
    expect(await swrFetch("/a", async () => "ok")).toBe("ok"); // the failed request is not left "in flight"
    // a failure after a good answer keeps the good answer
    vi.setSystemTime(Date.now() + SWR_FRESH_MS + 1);
    await expect(swrFetch("/a", () => Promise.reject(new Error("net")))).rejects.toThrow("net");
    expect(swrPeek("/a")?.data).toBe("ok");
    // a synchronous throw in the fetcher is a rejection too
    await expect(swrFetch("/b", () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });

  it("swrClear drops entries; a request that was on its way is neither stored nor shared", async () => {
    const d = defer<string>();
    const slow = swrFetch("/a", () => d.promise);
    const before = swrGeneration();
    swrClear();
    expect(swrGeneration()).toBe(before + 1);
    const fetcher = vi.fn().mockResolvedValue("new");
    expect(await swrFetch("/a", fetcher)).toBe("new"); // not joined to the old request
    d.resolve("old");
    expect(await slow).toBe("old");                   // the caller still gets its answer...
    expect(swrPeek("/a")?.data).toBe("new");          // ...but it did not overwrite the cache
  });

  it("keeps at most a few dozen entries", async () => {
    for (let i = 0; i < 60; i++) await swrFetch("/k" + i, async () => i);
    expect(swrPeek("/k0")).toBeNull();
    expect(swrPeek("/k59")?.data).toBe(59);
  });
});

describe("invalidation", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("every write through the api client drops the saved reads (post / put), even a failing one", async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await swrFetch("/api/dashboard", async () => ({ n: 1 }));
    await api.post("/api/assignments", {});
    expect(swrPeek("/api/dashboard")).toBeNull();
    await swrFetch("/api/dashboard", async () => ({ n: 1 }));
    await api.put("/api/settings", {});
    expect(swrPeek("/api/dashboard")).toBeNull();
    await swrFetch("/api/dashboard", async () => ({ n: 1 }));
    fetchMock.mockResolvedValueOnce(json({ error: "bad" }, 500));
    await expect(api.post("/api/x", {})).rejects.toBeTruthy();
    expect(swrPeek("/api/dashboard")).toBeNull();
  });

  it("a plain GET through the api client leaves the cache alone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true })));
    await swrFetch("/api/dashboard", async () => ({ n: 1 }));
    await api.get("/api/health");
    expect(swrPeek("/api/dashboard")?.data).toEqual({ n: 1 });
  });

  it("a read that overlaps a write is not remembered", async () => {
    const readBody = defer<Response>();
    const fetchMock = vi.fn(async (url: string) => (url === "/api/dashboard" ? readBody.promise : json({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const read = swrFetch("/api/dashboard", () => api.get("/api/dashboard"));
    await Promise.resolve();
    await api.post("/api/submissions/batch", {});
    readBody.resolve(json({ n: "before-the-write" }));
    await read;
    expect(swrPeek("/api/dashboard")).toBeNull();
  });

  it("term, sign-in state, data epoch and the stale-epoch flag each drop the cache", async () => {
    const put = () => swrFetch("/api/dashboard", async () => 1);
    const flip = [
      () => { selectedTermId.value = "t-" + Math.random(); },
      () => { authRequired.value = !authRequired.value; },
      () => { syncPaused.value = !syncPaused.value; },
      () => { dataEpoch.value = (dataEpoch.value ?? 0) + 1; },
      () => { epochStale.value = !epochStale.value; },
    ];
    for (const f of flip) { await put(); expect(swrPeek("/api/dashboard")).not.toBeNull(); f(); expect(swrPeek("/api/dashboard")).toBeNull(); }
  });
});

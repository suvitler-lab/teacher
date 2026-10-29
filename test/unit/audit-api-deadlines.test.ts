import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@client/lib/api";
import { authRequired, dataEpoch, serverReachable } from "@client/lib/session";

beforeEach(() => { vi.useFakeTimers(); serverReachable.value = true; authRequired.value = false; dataEpoch.value = 7; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); serverReachable.value = true; authRequired.value = false; dataEpoch.value = null; });

function stalledFetch() {
  const fn = vi.fn((_path: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const rejectAbort = () => reject(new DOMException("Aborted", "AbortError"));
    if (init.signal?.aborted) rejectAbort();
    else init.signal?.addEventListener("abort", rejectAbort, { once: true });
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("API deadlines preserve uncertain writes", () => {
  it("aborts a stalled GET after eight seconds", async () => {
    const fetch = stalledFetch();
    const verdict = api.get("/api/bootstrap").catch(e => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await verdict).toMatchObject({ status: 0, code: "timeout" });
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(serverReachable.value).toBe(false);
  });

  it("never retries a timed-out write and tells the caller its outcome is unknown", async () => {
    const fetch = stalledFetch();
    const verdict = api.post("/api/submissions/batch", { ops: [{ opId: "same-operation" }] }).catch(e => e);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await verdict).toMatchObject({ code: "timeout", message: expect.stringContaining("ยังไม่ทราบผล") });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ "X-Data-Epoch": "7" });
    expect(JSON.parse(fetch.mock.calls[0][1].body as string).ops[0].opId).toBe("same-operation");
  });

  it("honours a longer commit deadline and clears the timer after success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}', { headers: { "content-type": "application/json" } })));
    await expect(api.post("/api/restore/execute", { step: "commit" }, { timeoutMs: 60000 })).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(serverReachable.value).toBe(true);
  });

  it("caller cancellation aborts fetch without marking a working server offline", async () => {
    const fetch = stalledFetch();
    const controller = new AbortController();
    const verdict = api.get("/api/reports/summary", { signal: controller.signal }).catch(e => e);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await verdict).toMatchObject({ code: "aborted" });
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(serverReachable.value).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a rejected write still reports authentication expiry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401, headers: { "content-type": "application/json" } })));
    await expect(api.post("/api/settings", {})).rejects.toMatchObject({ status: 401 });
    expect(authRequired.value).toBe(true);
    expect(serverReachable.value).toBe(true);
  });
});

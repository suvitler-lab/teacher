import { describe, it, expect, vi, afterEach } from "vitest";
import { api, withTimeout } from "@client/lib/api";
import { serverReachable } from "@client/lib/session";

afterEach(() => { vi.unstubAllGlobals(); serverReachable.value = true; });

describe("serverReachable (what the green “ออนไลน์” badge is based on)", () => {
  it("a network failure means the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(api.get("/api/x")).rejects.toMatchObject({ code: "network" });
    expect(serverReachable.value).toBe(false);
  });

  it("any answer at all — even an error status — means it can", async () => {
    serverReachable.value = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "internal" }), { status: 500, headers: { "content-type": "application/json" } })));
    await expect(api.get("/api/x")).rejects.toMatchObject({ status: 500 });
    expect(serverReachable.value).toBe(true);
  });

  it("a request that never answers (a stalled wifi) counts as unreachable once it times out", async () => {
    vi.useFakeTimers();
    try {
      const p = withTimeout(new Promise(() => {}), 5000);
      const caught = p.catch((e) => e);
      await vi.advanceTimersByTimeAsync(5001);
      expect(await caught).toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(10); // the flag is set by a dynamic import that resolves a tick later
      expect(serverReachable.value).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});

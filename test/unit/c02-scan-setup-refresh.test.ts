import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSetupRefresh } from "../../src/pages/Scan";

// AC-13: the scan work picker re-reads the work list on its own so another device's new full score is not offered stale.
function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
}

describe("scan work picker refresh (C-02 AC-13)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    setVisibility("visible");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  afterEach(() => { vi.useRealTimers(); setVisibility("visible"); });

  it("reloads every 60 s while the page is seen", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const stop = startSetupRefresh(reload);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does nothing while hidden or offline", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const stop = startSetupRefresh(reload);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(61_000);
    expect(reload).not.toHaveBeenCalled();
    setVisibility("visible");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it("reloads at once on coming back, but not twice within 10 s", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const stop = startSetupRefresh(reload);
    await vi.advanceTimersByTimeAsync(11_000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    window.dispatchEvent(new Event("online"));
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not start a second read while one is in flight, survives a failure, and stops on cleanup", async () => {
    let fail = true;
    let release!: () => void;
    const reload = vi.fn(() => (fail
      ? Promise.reject(new Error("offline"))
      : new Promise<void>((r) => { release = r; })));
    const stop = startSetupRefresh(reload);
    await vi.advanceTimersByTimeAsync(60_500);
    expect(reload).toHaveBeenCalledTimes(1); // rejected, swallowed
    fail = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledTimes(2); // now hangs
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledTimes(2); // still in flight: no overlap
    release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reload).toHaveBeenCalledTimes(3);
  });
});

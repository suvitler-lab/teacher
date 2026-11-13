// T-29: the hide-student-names registry (D44 / BR-52): one switch per page, the first read copies the home value once.
import { beforeEach, describe, expect, it, vi } from "vitest";

async function fresh() {
  vi.resetModules();
  return import("@client/lib/hideNames");
}
beforeEach(() => { localStorage.clear(); });

describe("hideNames registry", () => {
  it("home keeps its old key: '1' or absent", async () => {
    const h = await fresh();
    expect(h.hideSignal("home").value).toBe(false);
    h.setHide("home", true);
    expect(localStorage.getItem("ngankrob-hide-names")).toBe("1");
    h.setHide("home", false);
    expect(localStorage.getItem("ngankrob-hide-names")).toBeNull();
  });
  it("another page that was never set copies the home value once and writes it at once", async () => {
    localStorage.setItem("ngankrob-hide-names", "1");
    const h = await fresh();
    expect(h.hideSignal("scan").value).toBe(true);
    expect(localStorage.getItem("ngankrob-hide-names-scan")).toBe("1");
    // later changes of home do not reach it
    h.setHide("home", false);
    expect(h.hideSignal("scan").value).toBe(true);
    expect(h.hideSignal("home").value).toBe(false);
  });
  it("a page with '0' stays shown even when home hides", async () => {
    localStorage.setItem("ngankrob-hide-names", "1");
    localStorage.setItem("ngankrob-hide-names-reports", "0");
    const h = await fresh();
    expect(h.hideSignal("reports").value).toBe(false);
  });
  it("each page has its own key", async () => {
    const h = await fresh();
    for (const p of h.HIDE_PAGES) expect(h.hideKey(p)).toBe(p === "home" ? "ngankrob-hide-names" : `ngankrob-hide-names-${p}`);
    h.setHide("attendance", true);
    expect(localStorage.getItem("ngankrob-hide-names-attendance")).toBe("1");
    h.setHide("attendance", false);
    expect(localStorage.getItem("ngankrob-hide-names-attendance")).toBe("0");
    expect(h.hideSignal("random").value).toBe(false);
  });
  it("setHideAll sets all 7 pages and leaves the projector screen alone", async () => {
    localStorage.setItem("ngankrob-pj-hide-names", "0");
    const h = await fresh();
    h.setHideAll(true);
    for (const p of h.HIDE_PAGES) expect(h.hideSignal(p).value).toBe(true);
    expect(localStorage.getItem("ngankrob-pj-hide-names")).toBe("0");
    h.setHideAll(false);
    for (const p of h.HIDE_PAGES) expect(h.hideSignal(p).value).toBe(false);
  });
  it("the home page's old exports still follow the registry", async () => {
    vi.resetModules();
    const h = await import("@client/lib/hideNames");
    const prefs = await import("@client/lib/homePrefs");
    expect(prefs.hideNames.value).toBe(false);
    prefs.setHideNames(true);
    expect(h.hideSignal("home").value).toBe(true);
    expect(localStorage.getItem("ngankrob-hide-names")).toBe("1");
  });
  it("storage that throws does not break it", async () => {
    const h = await fresh();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => h.setHide("students", true)).not.toThrow();
    expect(h.hideSignal("students").value).toBe(true);
    spy.mockRestore();
  });
  it("reloadHideFromStorage reads again after the device values were cleared", async () => {
    const h = await fresh();
    h.setHideAll(true);
    localStorage.clear();
    h.reloadHideFromStorage();
    for (const p of h.HIDE_PAGES) expect(h.hideSignal(p).value).toBe(false);
  });
});

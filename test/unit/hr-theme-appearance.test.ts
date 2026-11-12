// T-29: the look of the app (skin + layout, D41): parsing, painting from this device, adopting the server once, saving and undoing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { put } = vi.hoisted(() => ({ put: vi.fn() }));
const { ok, err } = vi.hoisted(() => ({ ok: vi.fn(), err: vi.fn() }));
const { kvUpdate } = vi.hoisted(() => ({ kvUpdate: vi.fn() }));
vi.mock("@client/lib/idb", async (orig) => ({ ...await orig<typeof import("@client/lib/idb")>(), kvUpdate }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get: vi.fn(), post: vi.fn(), put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok, err }));
vi.mock("@client/lib/fonts", async (orig) => ({ ...await orig<typeof import("@client/lib/fonts")>(), loadSkinAssets: vi.fn(() => Promise.resolve()) }));

import { parseAppearance, serializeAppearance, applyStoredAppearance, saveAppearance, deferAppearanceAdoption, adoptServerAppearance, iconSkin, appearance, resetAppearanceForTests, DEFAULT_APPEARANCE } from "@client/lib/appearance";
import { loadSkinAssets } from "@client/lib/fonts";
import { Icon } from "@client/components/Icon";
import { h } from "preact";
import { render, cleanup } from "@testing-library/preact";
import { settings } from "@client/store";
import type { Settings } from "@shared/types";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "", teacher_name: "", app_title: "งานครบ", late_after: "08:30", theme: "system", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: "", period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
  ...over,
});
const root = document.documentElement;

beforeEach(() => {
  vi.clearAllMocks();
  resetAppearanceForTests();
  settings.value = null;
  localStorage.clear();
  root.removeAttribute("data-skin"); root.removeAttribute("data-layout"); root.removeAttribute("data-theme");
  put.mockReset();
  put.mockResolvedValue({});
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});
afterEach(() => { resetAppearanceForTests(); });

describe("parseAppearance (BR-07, AC-06)", () => {
  it("never set, empty or the old value 'blue' gives warm + a", () => {
    expect(parseAppearance(undefined)).toEqual({ skin: "warm", layout: "a" });
    expect(parseAppearance("")).toEqual({ skin: "warm", layout: "a" });
    expect(parseAppearance("blue")).toEqual({ skin: "warm", layout: "a" });
    expect(parseAppearance("[1,2]")).toEqual({ skin: "warm", layout: "a" });
    expect(parseAppearance("null")).toEqual({ skin: "warm", layout: "a" });
  });
  it("a wrong field falls back alone", () => {
    expect(parseAppearance('{"v":1,"skin":"luxe","layout":"b"}')).toEqual({ skin: "warm", layout: "b" });
    expect(parseAppearance('{"v":1,"skin":"playful","layout":"z"}')).toEqual({ skin: "playful", layout: "a" });
    expect(parseAppearance('{"v":1,"skin":"pro","layout":"c"}')).toEqual({ skin: "pro", layout: "c" });
  });
  it("round-trips", () => {
    for (const skin of ["pro", "warm", "playful"] as const) for (const layout of ["a", "b", "c"] as const) {
      expect(parseAppearance(serializeAppearance({ skin, layout }))).toEqual({ skin, layout });
    }
    expect(JSON.parse(serializeAppearance({ skin: "pro", layout: "b" }))).toEqual({ v: 1, skin: "pro", layout: "b" });
  });
});

describe("applyStoredAppearance (AC-04: no flash)", () => {
  it("paints the default when nothing is remembered", () => {
    applyStoredAppearance();
    expect(root.getAttribute("data-skin")).toBe("warm");
    expect(root.getAttribute("data-layout")).toBe("a");
    expect(appearance.value).toEqual(DEFAULT_APPEARANCE);
  });
  it("paints the remembered skin + layout at once, before any settings arrive", () => {
    localStorage.setItem("ngankrob-skin", "playful"); localStorage.setItem("ngankrob-layout", "c");
    applyStoredAppearance();
    expect(root.getAttribute("data-skin")).toBe("playful");
    expect(appearance.value).toEqual({ skin: "playful", layout: "c" });
    expect(loadSkinAssets).toHaveBeenCalledWith("playful");
  });
  it("an unknown remembered value falls back for that field only", () => {
    localStorage.setItem("ngankrob-skin", "luxe"); localStorage.setItem("ngankrob-layout", "b");
    applyStoredAppearance();
    expect(appearance.value).toEqual({ skin: "warm", layout: "b" });
  });
});

describe("the server's value is adopted once (AC-03)", () => {
  it("uses accent from the first settings, remembers it, and ignores later changes", () => {
    applyStoredAppearance();
    settings.value = base({ accent: serializeAppearance({ skin: "pro", layout: "b" }) });
    expect(appearance.value).toEqual({ skin: "pro", layout: "b" });
    expect(localStorage.getItem("ngankrob-skin")).toBe("pro");
    expect(root.getAttribute("data-skin")).toBe("pro");
    // another device changed it: this screen does not move under the teacher's hands
    settings.value = base({ accent: serializeAppearance({ skin: "playful", layout: "c" }) });
    expect(appearance.value).toEqual({ skin: "pro", layout: "b" });
  });
  it("old value 'blue' on the server gives the default", () => {
    localStorage.setItem("ngankrob-skin", "pro");
    applyStoredAppearance();
    settings.value = base({ accent: "blue" });
    expect(appearance.value).toEqual({ skin: "warm", layout: "a" });
  });
});

describe("an offline start from the saved copy (T-29 R-01, AC-04)", () => {
  const stale = serializeAppearance({ skin: "playful", layout: "c" });
  const fresh = serializeAppearance({ skin: "pro", layout: "b" });
  it("does not take the saved copy's look; the look chosen on this device stays", () => {
    localStorage.setItem("ngankrob-skin", "pro"); localStorage.setItem("ngankrob-layout", "b");
    applyStoredAppearance();
    deferAppearanceAdoption(); // App: about to apply the cached bootstrap
    settings.value = base({ accent: stale });
    expect(appearance.value).toEqual({ skin: "pro", layout: "b" });
    expect(localStorage.getItem("ngankrob-skin")).toBe("pro");
    expect(root.getAttribute("data-skin")).toBe("pro");
  });
  it("when the server answers its look is adopted (once)", () => {
    localStorage.setItem("ngankrob-skin", "warm");
    applyStoredAppearance();
    deferAppearanceAdoption();
    settings.value = base({ accent: stale });
    settings.value = base({ accent: fresh }); // live bootstrap
    adoptServerAppearance();
    expect(appearance.value).toEqual({ skin: "pro", layout: "b" });
    expect(localStorage.getItem("ngankrob-skin")).toBe("pro");
    settings.value = base({ accent: stale }); // later change elsewhere: not under the teacher's hands
    expect(appearance.value).toEqual({ skin: "pro", layout: "b" });
  });
  it("with no saved copy at all the next sign-in is adopted as usual", () => {
    applyStoredAppearance();
    deferAppearanceAdoption();
    adoptServerAppearance(); // App: nothing cached, going to the sign-in page
    settings.value = base({ accent: fresh });
    expect(appearance.value).toEqual({ skin: "pro", layout: "b" });
  });
  it("a successful save also updates the copy kept for an offline start (look and theme)", async () => {
    applyStoredAppearance();
    settings.value = base({ accent: serializeAppearance({ skin: "warm", layout: "a" }) });
    await saveAppearance({ skin: "playful", theme: "dark" });
    expect(kvUpdate).toHaveBeenCalledTimes(1);
    const [key, change] = kvUpdate.mock.calls[0];
    expect(key).toBe("bootstrap");
    const out = change({ settings: base({ accent: "blue", theme: "system" }), terms: [] });
    expect(out.settings.accent).toBe('{"v":1,"skin":"playful","layout":"a"}');
    expect(out.settings.theme).toBe("dark");
    expect(out.terms).toEqual([]);
    expect(change(null)).toBeNull(); // no copy saved: nothing is invented
  });
  it("a failed save leaves the saved copy alone", async () => {
    applyStoredAppearance();
    settings.value = base({ accent: serializeAppearance({ skin: "warm", layout: "a" }) });
    put.mockRejectedValueOnce(new Error("x"));
    await saveAppearance({ skin: "pro" });
    expect(kvUpdate).not.toHaveBeenCalled();
  });
});

describe("saveAppearance (D41, D38)", () => {
  beforeEach(() => { applyStoredAppearance(); settings.value = base({ accent: serializeAppearance({ skin: "warm", layout: "a" }) }); });

  it("shows the change at once and sends ONE put with the changed keys", async () => {
    const p = saveAppearance({ skin: "playful", theme: "dark" });
    expect(root.getAttribute("data-skin")).toBe("playful");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("ngankrob-theme")).toBe("dark");
    expect(await p).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith("/api/settings", { accent: '{"v":1,"skin":"playful","layout":"a"}', theme: "dark" });
    expect(ok).toHaveBeenCalledWith("บันทึกแล้ว · ใช้กับทุกเครื่อง");
    expect(settings.value?.accent).toContain("playful");
  });
  it("sends only what changed", async () => {
    await saveAppearance({ layout: "c" });
    expect(put).toHaveBeenCalledWith("/api/settings", { accent: '{"v":1,"skin":"warm","layout":"c"}' });
    put.mockClear();
    expect(await saveAppearance({ layout: "c" })).toBe(true); // nothing changed: no request
    expect(put).not.toHaveBeenCalled();
  });
  it("goes back to the old look and says why when the save fails", async () => {
    put.mockRejectedValueOnce(new Error("500"));
    const saved = await saveAppearance({ skin: "pro", theme: "light" });
    expect(saved).toBe(false);
    expect(appearance.value.skin).toBe("warm");
    expect(root.getAttribute("data-skin")).toBe("warm");
    expect(localStorage.getItem("ngankrob-skin")).toBe("warm");
    expect(settings.value?.theme).toBe("system");
    expect(err).toHaveBeenCalledWith("บันทึกหน้าตาไม่สำเร็จ");
  });
  it("offline: sends nothing, changes nothing, tells the teacher", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(await saveAppearance({ skin: "pro" })).toBe(false);
    expect(put).not.toHaveBeenCalled();
    expect(appearance.value.skin).toBe("warm");
    expect(err).toHaveBeenCalledWith("ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์");
  });
  it("two quick taps reach the server in the order tapped", async () => {
    const order: string[] = [];
    put.mockImplementation(async (_u: string, b: { accent?: string }) => {
      await new Promise((r) => setTimeout(r, b.accent?.includes("pro") ? 20 : 1));
      order.push(JSON.parse(b.accent!).skin);
      return {};
    });
    const a = saveAppearance({ skin: "pro" });
    const b = saveAppearance({ skin: "playful" });
    await Promise.all([a, b]);
    expect(order).toEqual(["pro", "playful"]);
    expect(appearance.value.skin).toBe("playful");
  });
  it("a failed first tap does not undo a later tap", async () => {
    let n = 0;
    put.mockImplementation(async () => { if (n++ === 0) throw new Error("x"); return {}; });
    const a = saveAppearance({ skin: "pro" });
    const b = saveAppearance({ skin: "playful" });
    await Promise.all([a, b]);
    expect(appearance.value.skin).toBe("playful");
  });
  it("two quick taps that both fail go back to what the server confirmed, not the middle look (R-03)", async () => {
    put.mockRejectedValue(new Error("down"));
    const a = saveAppearance({ skin: "pro", theme: "light" });
    const b = saveAppearance({ skin: "playful", theme: "dark" });
    expect(appearance.value.skin).toBe("playful");
    expect([await a, await b]).toEqual([false, false]);
    expect(appearance.value.skin).toBe("warm");
    expect(root.getAttribute("data-skin")).toBe("warm");
    expect(localStorage.getItem("ngankrob-skin")).toBe("warm");
    expect(settings.value?.accent).toBe(serializeAppearance({ skin: "warm", layout: "a" }));
    expect(settings.value?.theme).toBe("system");
    expect(root.getAttribute("data-theme")).not.toBe("light");
    expect(localStorage.getItem("ngankrob-theme")).toBe("system");
  });
  it("first tap works, second fails: back to the first", async () => {
    put.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("x"));
    const a = saveAppearance({ skin: "pro" });
    const b = saveAppearance({ skin: "playful" });
    expect([await a, await b]).toEqual([true, false]);
    expect(appearance.value.skin).toBe("pro");
    expect(settings.value?.accent).toContain('"pro"');
  });
});

describe("saveAppearance: a failed tap never reaches the server in the next request (R-3205)", () => {
  beforeEach(() => { applyStoredAppearance(); settings.value = base({ accent: serializeAppearance({ skin: "warm", layout: "a" }), theme: "system" }); });

  it("tap 1 (skin) fails, tap 2 (layout) works: the request carries the confirmed skin + its own layout, and the screen matches the server", async () => {
    put.mockRejectedValueOnce(new Error("x"));
    const a = saveAppearance({ skin: "pro" });
    const b = saveAppearance({ layout: "b" });
    expect(appearance.value).toEqual({ skin: "pro", layout: "b" }); // both shown at once
    expect([await a, await b]).toEqual([false, true]);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][1]).toEqual({ accent: '{"v":1,"skin":"warm","layout":"b"}' });
    expect(appearance.value).toEqual({ skin: "warm", layout: "b" }); // what the server ends up with
    expect(root.getAttribute("data-skin")).toBe("warm");
    expect(localStorage.getItem("ngankrob-skin")).toBe("warm");
    expect(settings.value?.accent).toBe('{"v":1,"skin":"warm","layout":"b"}');
  });
  it("a failed theme tap does not ride along with the next look tap", async () => {
    put.mockRejectedValueOnce(new Error("x"));
    const a = saveAppearance({ theme: "dark" });
    const b = saveAppearance({ skin: "pro" });
    await Promise.all([a, b]);
    expect(put.mock.calls[1][1]).toEqual({ accent: '{"v":1,"skin":"pro","layout":"a"}' });
    expect(settings.value?.theme).toBe("system");
    expect(root.getAttribute("data-theme")).not.toBe("dark");
  });
  it("a tap that worked stays in the base of the next one", async () => {
    await saveAppearance({ skin: "pro" });
    await saveAppearance({ layout: "c" });
    expect(put.mock.calls[1][1]).toEqual({ accent: '{"v":1,"skin":"pro","layout":"c"}' });
  });
  it("silent: no toast on success or failure, same result; the text stays the AC-02 text otherwise (R-3204)", async () => {
    expect(await saveAppearance({ skin: "pro" }, { silent: true })).toBe(true);
    put.mockRejectedValueOnce(new Error("x"));
    expect(await saveAppearance({ skin: "playful" }, { silent: true })).toBe(false);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(await saveAppearance({ layout: "c" }, { silent: true })).toBe(false);
    expect(ok).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await saveAppearance({ layout: "c" });
    expect(ok).toHaveBeenCalledWith("บันทึกแล้ว · ใช้กับทุกเครื่อง");
  });
});

describe("icons keep the weight whose font has arrived (R-04)", () => {
  it("the icon skin follows the look only after that skin's assets have loaded", async () => {
    let done!: () => void;
    (loadSkinAssets as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<void>((r) => { done = r; }));
    applyStoredAppearance(); // warm: assets pending
    expect(iconSkin.value).toBeNull();
    done();
    await Promise.resolve(); await Promise.resolve();
    expect(iconSkin.value).toBe("warm");
    let done2!: () => void;
    (loadSkinAssets as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<void>((r) => { done2 = r; }));
    settings.value = base({ accent: serializeAppearance({ skin: "warm", layout: "a" }) });
    void saveAppearance({ skin: "playful" });
    expect(appearance.value.skin).toBe("playful");
    expect(iconSkin.value).toBe("warm"); // playful's icon font is still on its way: icons stay as they were
    const { container } = render(h(Icon, { name: "home" }));
    expect(container.querySelector("i")!.className).toContain("ph-duotone"); // not ph-fill, whose font has not arrived
    done2();
    await Promise.resolve(); await Promise.resolve();
    expect(iconSkin.value).toBe("playful");
    await Promise.resolve();
    expect(container.querySelector("i")!.className).toContain("ph-fill");
    cleanup();
  });
});

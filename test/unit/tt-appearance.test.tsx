// T-15: ตั้งค่า > หน้าตา > รูปแบบตารางสอน (BR-13, AC-46..48): independent parse, save keeps unknown fields, undo on failure/offline.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
const { err } = vi.hoisted(() => ({ err: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err, notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}) }));

import { SettingsPage } from "@client/pages/Settings";
import { settings, terms, currentTermId, selectedTermId } from "@client/store";
import { route } from "@client/router";
import { appearance, resetAppearanceForTests, applyStoredAppearance, parseAppearance, serializeAppearance } from "@client/lib/appearance";
import type { Settings } from "@shared/types";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(Date.now() - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});

const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, value: v });

beforeEach(() => {
  vi.clearAllMocks();
  put.mockReset();
  setOnline(true);
  localStorage.clear();
  resetAppearanceForTests();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  get.mockImplementation(async (url: string) => (url.includes("devices") ? { devices: [] } : { rows: [] }));
  put.mockResolvedValue({ ok: true });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  settings.value = base();
  route.value = "/settings?section=appearance";
  window.location.hash = "#/settings?section=appearance";
});
afterEach(() => { cleanup(); setOnline(true); });

const radio = (name: RegExp | string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const open = async () => { render(<SettingsPage />); await screen.findByRole("heading", { level: 2, name: "หน้าตา" }); };
const status = () => document.querySelector(".ap-status-wrap")!;

describe("AC-48: parse each field alone", () => {
  it("(ก) all four fields", () => expect(parseAppearance('{"v":1,"skin":"pro","layout":"b","timetable":"c"}')).toEqual({ skin: "pro", layout: "b", timetable: "c" }));
  it("(ข) a wrong timetable falls back to ก, the others stay", () => expect(parseAppearance('{"v":1,"skin":"pro","layout":"b","timetable":"z"}')).toEqual({ skin: "pro", layout: "b", timetable: "a" }));
  it("(ค) 'blue' / no field / not JSON -> default ก", () => {
    expect(parseAppearance("blue")).toEqual({ skin: "warm", layout: "a", timetable: "a" });
    expect(parseAppearance('{"v":1,"skin":"pro","layout":"c"}')).toEqual({ skin: "pro", layout: "c", timetable: "a" });
  });
  it("a wrong skin does not reset timetable", () => expect(parseAppearance('{"skin":"luxe","timetable":"b"}')).toEqual({ skin: "warm", layout: "a", timetable: "b" }));
  it("serialize writes every field and keeps fields this app does not know", () => {
    const out = JSON.parse(serializeAppearance({ skin: "pro", layout: "b", timetable: "c" }, '{"v":1,"skin":"warm","layout":"a","future":{"x":1}}'));
    expect(out).toEqual({ v: 1, skin: "pro", layout: "b", timetable: "c", future: { x: 1 } });
    expect(JSON.parse(serializeAppearance({ skin: "pro", layout: "b" }))).toEqual({ v: 1, skin: "pro", layout: "b", timetable: "a" });
  });
});

describe("AC-46/47: choosing a timetable style", () => {
  it("default ก is checked; choosing ค saves once, keeps skin/layout/theme/home_cards and says saved", async () => {
    settings.value = base({ accent: '{"v":1,"skin":"pro","layout":"b","future":1}', home_cards: '{"v":1,"order":[],"hidden":[]}' });
    applyStoredAppearance();
    await open();
    expect(radio(/ก ตารางกระดาษ/).checked).toBe(true);
    fireEvent.click(radio(/ค วันนี้เป็นหลัก/));
    await waitFor(() => expect(status().textContent).toContain("บันทึกแล้ว · ใช้กับทุกเครื่อง"));
    expect(put).toHaveBeenCalledTimes(1);
    const body = put.mock.calls[0][1] as Record<string, string>;
    expect(Object.keys(body)).toEqual(["accent"]);
    expect(JSON.parse(body.accent)).toEqual({ v: 1, skin: "pro", layout: "b", timetable: "c", future: 1 });
    expect(appearance.value.timetable).toBe("c"); // on screen at once, no reload
    expect(settings.value?.home_cards).toBe('{"v":1,"order":[],"hidden":[]}');
    expect(settings.value?.theme).toBe("light");
  });

  it("a later theme change keeps timetable", async () => {
    settings.value = base({ accent: '{"v":1,"skin":"pro","layout":"b","timetable":"c"}' });
    applyStoredAppearance();
    await open();
    fireEvent.click(radio(/สดใส/));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(JSON.parse((put.mock.calls[0][1] as { accent: string }).accent)).toMatchObject({ skin: "playful", timetable: "c" });
  });

  it("(ข) a failed save puts ก back with 'บันทึกหน้าตาไม่สำเร็จ'", async () => {
    put.mockRejectedValueOnce(new Error("500"));
    await open();
    fireEvent.click(radio(/ข ปฏิทิน/));
    await waitFor(() => expect(status().textContent).toContain("บันทึกหน้าตาไม่สำเร็จ"));
    await waitFor(() => expect(radio(/ก ตารางกระดาษ/).checked).toBe(true));
    expect(appearance.value.timetable).toBe("a");
  });

  it("(ก) offline: nothing is sent or queued, ก stays, says why", async () => {
    await open();
    setOnline(false);
    fireEvent.click(radio(/ข ปฏิทิน/));
    await waitFor(() => expect(status().textContent).toContain("ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์"));
    expect(put).not.toHaveBeenCalled();
    await waitFor(() => expect(radio(/ก ตารางกระดาษ/).checked).toBe(true));
  });
});

describe("D53: the strip switch is not here", () => {
  it("has the link text, no switch, and the link opens the home page customize panel", async () => {
    await open();
    const fs = screen.getByRole("radiogroup", { name: "รูปแบบตารางสอน" }).closest("fieldset")!;
    expect(fs.textContent).toContain("เปิด/ปิดแถบ ตอนนี้/ต่อไป ได้ที่");
    expect(fs.querySelector('[role="switch"], input[type="checkbox"]')).toBeNull();
    const link = within(fs).getByRole("button", { name: /หน้าหลัก › ปรับหน้าหลัก/ });
    fireEvent.click(link);
    expect(window.location.hash).toBe("#/?customize=1");
  });
});

describe("VF-F5 (D58): the local copy of the timetable style survives clearing what the device remembers", () => {
  it("is in LOCAL_PREF_KEEP and clearLocalPrefs leaves it alone", async () => {
    const { LOCAL_PREF_KEEP, clearLocalPrefs, localPrefKeys } = await import("@client/lib/localPrefs");
    expect(LOCAL_PREF_KEEP).toContain("ngankrob-timetable");
    localStorage.setItem("ngankrob-timetable", "b");
    localStorage.setItem("ngankrob-text-size", "x");
    expect(localPrefKeys()).not.toContain("ngankrob-timetable");
    clearLocalPrefs();
    expect(localStorage.getItem("ngankrob-timetable")).toBe("b");
    expect(localStorage.getItem("ngankrob-text-size")).toBeNull();
    localStorage.removeItem("ngankrob-timetable");
  });
});

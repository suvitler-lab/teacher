// T-32: settings > หน้าตา — saving. The screen answers at once; one PUT; the saved text; a failed or offline save puts the
// old look back (D38/D41, AC-02, AC-05); two quick taps go in order; reset asks first and leaves the text size alone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
const { err } = vi.hoisted(() => ({ err: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err, notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}) }));

import { SettingsPage } from "@client/pages/Settings";
import { settings, terms, currentTermId, selectedTermId } from "@client/store";
import { route } from "@client/router";
import { appearance, resetAppearanceForTests, applyStoredAppearance, parseAppearance } from "@client/lib/appearance";
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

const open = async () => { render(<SettingsPage />); await screen.findByRole("heading", { level: 2, name: "หน้าตา" }); };
const radio = (name: RegExp | string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const status = () => document.querySelector(".ap-status-wrap")!;

describe("AC-02: a tap shows at once and is saved", () => {
  it("skin: the screen changes before the server answers, one PUT carries the new accent, then the saved text", async () => {
    let release!: () => void;
    put.mockImplementationOnce(() => new Promise((r) => { release = () => r({ ok: true }); }));
    await open();
    fireEvent.click(radio(/สดใส/));
    expect(radio(/สดใส/).checked).toBe(true); // the card answers at once
    await waitFor(() => expect(appearance.value.skin).toBe("playful")); // the screen follows when the taps settle (< 1 s)
    expect(document.documentElement.getAttribute("data-skin")).toBe("playful");
    await waitFor(() => expect(status().textContent).toContain("กำลังบันทึก…"));
    release();
    await waitFor(() => expect(status().textContent).toContain("บันทึกแล้ว · ใช้กับทุกเครื่อง"));
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe("/api/settings");
    expect(parseAppearance((put.mock.calls[0][1] as { accent: string }).accent)).toEqual({ skin: "playful", layout: "a" });
  });

  it("only the chip announces the save: no toast (R-3204)", async () => {
    const { ok } = await import("@client/lib/notify");
    await open();
    fireEvent.click(radio(/สดใส/));
    await waitFor(() => expect(status().textContent).toContain("บันทึกแล้ว · ใช้กับทุกเครื่อง"));
    expect(ok).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it("layout and mode save the same way (mode sends only `theme`)", async () => {
    await open();
    fireEvent.click(radio(/แผงรายห้อง/));
    await waitFor(() => expect(status().textContent).toContain("บันทึกแล้ว"));
    expect(parseAppearance((put.mock.calls[0][1] as { accent: string }).accent).layout).toBe("b");
    fireEvent.click(radio("มืด"));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1][1]).toEqual({ theme: "dark" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("tapping the one already in use sends nothing", async () => {
    await open();
    fireEvent.click(radio(/อบอุ่น/));
    fireEvent.click(radio(/ก วันนี้ของครู/));
    await act(async () => { await Promise.resolve(); });
    expect(put).not.toHaveBeenCalled();
  });

  it("quick taps / arrow keys across the cards send only where they stop (R-3207)", async () => {
    await open();
    fireEvent.click(radio(/มืออาชีพ/));
    fireEvent.click(radio(/สดใส/));
    fireEvent.click(radio(/อบอุ่น/));
    fireEvent.click(radio(/มืออาชีพ/));
    await waitFor(() => expect(status().textContent).toContain("บันทึกแล้ว"));
    expect(put).toHaveBeenCalledTimes(1);
    expect(parseAppearance((put.mock.calls[0][1] as { accent: string }).accent).skin).toBe("pro");
    expect(appearance.value.skin).toBe("pro");
  });

  it("taps on different keys: the first save fails, the second works -> the chip must not say saved (R-3201)", async () => {
    let failFirst!: () => void;
    put.mockImplementationOnce(() => new Promise((_r, rej) => { failFirst = () => rej(new Error("500")); }));
    await open();
    fireEvent.click(radio(/มืออาชีพ/));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    fireEvent.click(radio("มืด"));
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); }); // the second tap has settled and waits its turn
    failFirst();
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(status().textContent).toContain("ไม่สำเร็จ"));
    expect(status().textContent).not.toContain("บันทึกแล้ว");
    expect(appearance.value.skin).toBe("warm"); // rolled back
  });
});

describe("AC-05 / D38: a failed or offline save puts the old look back", () => {
  it("server error while online: back to the old skin, 'บันทึกหน้าตาไม่สำเร็จ', nothing queued", async () => {
    put.mockRejectedValueOnce(new Error("500"));
    await open();
    fireEvent.click(radio(/สดใส/));
    await waitFor(() => expect(status().textContent).toContain("บันทึกหน้าตาไม่สำเร็จ"));
    expect(err).not.toHaveBeenCalled(); // only the chip speaks
    expect(appearance.value.skin).toBe("warm");
    expect(document.documentElement.getAttribute("data-skin")).toBe("warm");
    expect(radio(/อบอุ่น/).checked).toBe(true);
    expect(settings.value!.accent).toBe("");
    await waitFor(() => expect(status().textContent).toContain("บันทึกหน้าตาไม่สำเร็จ"));
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("a failed mode change goes back to the old mode", async () => {
    put.mockRejectedValueOnce(new Error("500"));
    await open();
    fireEvent.click(radio("มืด"));
    await waitFor(() => expect(status().textContent).toContain("บันทึกหน้าตาไม่สำเร็จ"));
    expect(err).not.toHaveBeenCalled(); // only the chip speaks
    expect(settings.value!.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("offline: no request, the old look stays, 'ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์'", async () => {
    await open();
    setOnline(false);
    fireEvent.click(radio(/ค โฟกัสงานถัดไป/));
    await waitFor(() => expect(status().textContent).toContain("ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์"));
    expect(err).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(appearance.value.layout).toBe("a");
    expect(radio(/ก วันนี้ของครู/).checked).toBe(true);
    await waitFor(() => expect(status().textContent).toContain("ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์"));
  });
});

describe("reset to default", () => {
  const look = async () => {
    settings.value = base({ accent: JSON.stringify({ v: 1, skin: "pro", layout: "c" }), theme: "dark" });
    applyStoredAppearance();
    localStorage.setItem("ngankrob-font-size", "20");
    await open();
  };

  it("asks in a dialog; 'ไม่' and Esc change nothing and give focus back to the reset button (R-3202)", async () => {
    await look();
    const btn = screen.getByRole("button", { name: /คืนค่าเริ่มต้น/ });
    fireEvent.click(btn);
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByText("คืนค่าหน้าตาเป็นค่าเริ่มต้น?")).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "ไม่" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(btn);
    expect(put).not.toHaveBeenCalled();
  });

  it("'ใช่ คืนค่า' saves อบอุ่น + ก + ตามเครื่อง and leaves the text size alone", async () => {
    await look();
    fireEvent.click(screen.getByRole("button", { name: /คืนค่าเริ่มต้น/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ใช่ คืนค่า" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const body = put.mock.calls[0][1] as { accent: string; theme: string };
    expect(parseAppearance(body.accent)).toEqual({ skin: "warm", layout: "a" });
    expect(body.theme).toBe("system");
    expect(localStorage.getItem("ngankrob-font-size")).toBe("20");
  });
});

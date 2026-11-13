// ui-redesign (fix round): the settings page's save bar must only ever count the text form, switches and the theme save
// at once (and come back when the save fails), and the page has the headings / labels / notices the design asks for.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
const { notify, err } = vi.hoisted(() => ({ notify: vi.fn(), err: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err, notify, withToast: vi.fn() }));

vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}) }));

import { SettingsPage } from "@client/pages/Settings";
import { settings, terms, currentTermId, selectedTermId } from "@client/store";
import { route } from "@client/router";
import type { Settings } from "@shared/types";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(Date.now() - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  get.mockImplementation(async (url: string) => (url.includes("devices") ? { devices: [] } : url.includes("restore") ? { pending: false, maintenance: false } : url.includes("auth/me") ? { email: "t@example.com" } : { rows: [] }));
  put.mockResolvedValue({ ok: true });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  settings.value = base();
  route.value = "/settings";
  window.location.hash = "#/settings";
});
afterEach(() => { cleanup(); });

const bar = () => screen.queryByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" });
const goTo = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "หมวดตั้งค่า" })).getByRole("button", { name: new RegExp(name) }));

describe("the save bar", () => {
  it("is not raised by changing a card layout, and saving the form does not put an old card layout back", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    act(() => { settings.value = { ...settings.value!, settings_cards: '{"v":1,"order":["term","status","backup","devices","history"],"hidden":[]}' }; });
    expect(bar()).toBeNull();

    fireEvent.input(screen.getByLabelText("ชื่อครู"), { target: { value: "ครูใหม่" } });
    expect(bar()!.textContent).toContain("แก้ไขแล้ว 1 รายการ");
    fireEvent.click(within(bar()!).getByRole("button", { name: /บันทึก/ }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1]).toEqual({ teacher_name: "ครูใหม่" });         // only the form's key
    expect(settings.value!.settings_cards).toContain('"order":["term"');          // the card layout survived
  });

  it("a switch saves at once, never raises the bar, and a failed save puts it back and says so", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    goTo("การสแกน");
    const sw = await screen.findByRole("switch", { name: "เสียงตอบรับ" });
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(bar()).toBeNull();
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/settings", { sound_enabled: true }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("success", "บันทึกแล้ว · เสียงตอบรับ: เปิด", expect.anything()));

    put.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(sw);
    await waitFor(() => expect(err).toHaveBeenCalledWith("บันทึกไม่สำเร็จ — ยังเป็นค่าเดิม"));
    expect(settings.value!.sound_enabled).toBe(true);
    expect(bar()).toBeNull();
  });

  it("the light/dark choice lives in the appearance section (not in ทั่วไป): saved at once, and a failed save goes back to the old mode", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    expect(screen.queryByRole("radio", { name: "มืด" })).toBeNull(); // AC-44: no duplicate in "ทั่วไป"
    goTo("หน้าตา");
    fireEvent.click(await screen.findByRole("radio", { name: "มืด" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/settings", { theme: "dark" }));
    expect(bar()).toBeNull();

    put.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("radio", { name: "สว่าง" }));
    await screen.findByText("บันทึกหน้าตาไม่สำเร็จ — ยังเป็นค่าเดิม");
    expect(settings.value!.theme).toBe("dark");
  });
});

describe("wide-screen layout", () => {
  it("the page body is .pg, the two form cards of the general section sit in .set-forms, and the banners / save bar stay outside it", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    expect(document.querySelector(".set-page.pg")).not.toBeNull();
    const forms = document.querySelector(".set-forms")!;
    expect(forms.querySelectorAll(":scope > section.card")).toHaveLength(1); // the device card moved to ตรวจเครื่องและออฟไลน์ (T-55)
    expect(forms.querySelector(".set-savebar, .set-banner")).toBeNull();
  });
});

describe("headings, labels and notices", () => {
  it("section titles are h2, the side menu is labelled and marks the current section", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    for (const n of ["ข้อมูลโรงเรียน"]) expect(screen.getByRole("heading", { level: 2, name: new RegExp(n) })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "หมวดตั้งค่า" });
    expect(within(nav).getAllByRole("button")).toHaveLength(12); // 8 + ประเภทงาน (T-54) + ความเป็นส่วนตัวและเสียง, ตรวจเครื่องและออฟไลน์ (T-55) + เริ่มใหม่ (T-56)
    expect(within(nav).getByRole("button", { name: "ประเภทงาน" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: /ภาพรวม/ }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("button", { name: "ห้องเรียน วิชา ภาคเรียน" })).toBeTruthy(); // AC-48 (was "ข้อมูลพื้นฐาน")
    expect(within(nav).queryByRole("button", { name: /ข้อมูลพื้นฐาน/ })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /การแสดงผลบนเครื่องนี้/ })).toBeNull(); // moved out of the overview (T-55)
    expect(within(nav).getByRole("button", { name: "ความเป็นส่วนตัวและเสียง" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "ตรวจเครื่องและออฟไลน์" })).toBeTruthy();
    goTo("เวลาเรียน");
    expect(within(nav).getByRole("button", { name: /เวลาเรียน/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { level: 2, name: /เวลาเรียน/ })).toBeTruthy();
    expect(screen.getByText("ทุกเครื่อง")).toBeTruthy();                           // the time section is synced to every device
  });

  it("?section=catalog opens the catalog section, titled ห้องเรียน วิชา ภาคเรียน", async () => {
    route.value = "/settings?section=catalog";
    render(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: /ห้องเรียน วิชา ภาคเรียน/ })).toBeTruthy();
  });

  it("an unknown ?section= falls back to ทั่วไป instead of an empty page (R-3203)", async () => {
    route.value = "/settings?section=look";
    render(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: /ข้อมูลโรงเรียน/ })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "หมวดตั้งค่า" })).getByRole("button", { name: /ภาพรวม/ }).getAttribute("aria-current")).toBe("page");
  });

  it("the link to หน้าตา is not under the 'เครื่องนี้เท่านั้น' card (R-3208)", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    const row = screen.getByRole("button", { name: /ย้ายไป หน้าตา/ });
    expect(row.closest("section.card")).toBeNull();
    expect(row.closest(".set-moved")).not.toBeNull();
  });

  it("ทั่วไป keeps a link to the look instead of the text-size control", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    expect(screen.queryByLabelText("เพิ่มขนาดตัวอักษร")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ย้ายไป หน้าตา/ }));
    expect(await screen.findByRole("heading", { level: 2, name: "หน้าตา" })).toBeTruthy();
  });

  it("the backup section shows the personal-data notice, the stale warning with its button, and NO clear-data buttons (they moved to the red section, AC-245)", async () => {
    settings.value = base({ last_backup_at: String(Date.now() - 20 * 86_400_000) });
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    goTo("สำรองและกู้คืน");
    const note = await screen.findByRole("note");
    expect(note.textContent).toContain("ข้อมูลส่วนบุคคลของนักเรียน");
    expect(note.textContent).toContain("อย่าส่งทาง LINE");
    expect(screen.getByRole("button", { name: "สำรองเลย" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(ล้างข้อมูล|ล้างทั้งหมด)/ })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /เริ่มใหม่/ })).toBeNull();
  });

  it("the red section is last and holds both clear buttons", async () => {
    settings.value = base();
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    const items = within(screen.getByRole("navigation", { name: "หมวดตั้งค่า" })).getAllByRole("button");
    expect(items[items.length - 1].textContent).toContain("เริ่มใหม่");
    goTo("เริ่มใหม่");
    expect(await screen.findByRole("heading", { level: 2, name: /เริ่มใหม่/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^ล้างข้อมูล/ }).className).toContain("dz-btn");
    expect(screen.getByRole("button", { name: /ล้างทั้งหมด/ }).className).toContain("dz-btn");
  });

  it("the stale-backup dot has words for a screen reader", async () => {
    settings.value = base({ last_backup_at: "" });
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    const nav = screen.getByRole("navigation", { name: "หมวดตั้งค่า" });
    expect(within(nav).getByText("ควรสำรองข้อมูล")).toBeTruthy();
  });

  it("password fields have labels", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    goTo("บัญชีและอุปกรณ์");
    fireEvent.click(await screen.findByRole("button", { name: /เปลี่ยนรหัสผ่าน/ }));
    expect(screen.getByLabelText("รหัสผ่านเดิม")).toBeTruthy();
    expect(screen.getByLabelText("รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)")).toBeTruthy();
    expect(screen.getByLabelText("ยืนยันรหัสผ่านใหม่")).toBeTruthy();
  });
});

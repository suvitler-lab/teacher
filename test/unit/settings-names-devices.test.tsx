// qa-final follow-up: the school / teacher name fields show the built-in names as placeholders (never as text to type
// after), the first-run guide no longer writes the fallback words, and every device in Settings can be renamed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
const { ok, err } = vi.hoisted(() => ({ ok: vi.fn(), err: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok, err, withToast: vi.fn() }));
vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}) }));

import { SettingsPage } from "@client/pages/Settings";
import { Onboarding } from "@client/pages/Onboarding";
import { settings, terms, classes, subjects, currentTermId, selectedTermId } from "@client/store";
import { route } from "@client/router";
import { nameField, schoolLabel, teacherLabel } from "@client/lib/orgNames";
import { cleanDeviceName, deviceName } from "@client/lib/device";
import type { Settings } from "@shared/types";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(Date.now() - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});

const NOW = Date.now();
let devices: any[];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  devices = [
    { id: "dev_a", name: "Chrome · Windows", user_agent: null, revoked: 0, first_seen: NOW, last_seen: NOW, current: true },
    { id: "dev_b", name: "Chrome · Windows", user_agent: null, revoked: 0, first_seen: NOW, last_seen: NOW, current: false },
  ];
  get.mockImplementation(async (url: string) => (url.includes("devices") ? { devices } : url.includes("restore") ? { pending: false, maintenance: false } : url.includes("auth/me") ? { email: "t@example.com" } : { rows: [] }));
  put.mockResolvedValue({ ok: true });
  post.mockResolvedValue({ ok: true });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  settings.value = base();
  route.value = "/settings";
  window.location.hash = "#/settings";
});
afterEach(() => { cleanup(); });

const bar = () => screen.queryByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" });
const goTo = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "หมวดตั้งค่า" })).getByRole("button", { name: new RegExp(name) }));
const school = () => screen.getByLabelText("ชื่อโรงเรียน") as HTMLInputElement;
const teacher = () => screen.getByLabelText("ชื่อครู") as HTMLInputElement;

describe("orgNames helpers", () => {
  it("built-in names are not field text; real names are; labels fall back only when empty", () => {
    for (const v of ["โรงเรียน", "ครูผู้สอน", "โรงเรียนบ้านตัวอย่าง", " โรงเรียน ", "", null, undefined]) expect(nameField(v), String(v)).toBe("");
    expect(nameField("โรงเรียนบ้านสวน")).toBe("โรงเรียนบ้านสวน");
    expect(nameField("ครูสมชาย")).toBe("ครูสมชาย");
    expect(schoolLabel("")).toBe("โรงเรียน");
    expect(schoolLabel("  ")).toBe("โรงเรียน");
    expect(schoolLabel("โรงเรียนบ้านสวน")).toBe("โรงเรียนบ้านสวน");
    expect(teacherLabel("")).toBe("ครูผู้สอน");
    expect(teacherLabel("ครูสมชาย")).toBe("ครูสมชาย");
  });
  it("a device name is 1-40 characters after trimming", () => {
    expect(cleanDeviceName("  iPad  ")).toBe("iPad");
    expect(cleanDeviceName("   ")).toBe("");
    expect(cleanDeviceName("ก".repeat(40))).toBe("ก".repeat(40));
    expect(cleanDeviceName("ก".repeat(41))).toBe("");
  });
});

describe("settings: school and teacher name fields", () => {
  it("a stored default name is a placeholder, not text: empty field, no save bar, the header still shows the words", async () => {
    settings.value = base({ school_name: "โรงเรียน", teacher_name: "ครูผู้สอน" });
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    expect(school().value).toBe("");
    expect(teacher().value).toBe("");
    expect(school().placeholder).toMatch(/^เช่น /);
    expect(teacher().placeholder).toMatch(/^เช่น /);
    expect(bar()).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "ตั้งค่า" }).parentElement!.textContent).toContain("โรงเรียน · ครูผู้สอน");
  });

  it("typing a name saves exactly what was typed — no default word in front of it", async () => {
    settings.value = base({ school_name: "โรงเรียน", teacher_name: "ครูผู้สอน" });
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    fireEvent.input(school(), { target: { value: "โรงเรียนบ้านสวน" } });
    expect(bar()!.textContent).toContain("แก้ไขแล้ว 1 รายการ");
    fireEvent.click(within(bar()!).getByRole("button", { name: /บันทึก/ }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1]).toEqual({ school_name: "โรงเรียนบ้านสวน" });
  });

  it("cancel puts the empty field back; a real name that is cleared saves as empty", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    fireEvent.input(teacher(), { target: { value: "" } });
    expect(bar()).not.toBeNull();
    fireEvent.click(within(bar()!).getByRole("button", { name: "ยกเลิก" }));
    expect(teacher().value).toBe("ครูทดสอบ");
    expect(bar()).toBeNull();
    fireEvent.input(teacher(), { target: { value: "" } });
    fireEvent.click(within(bar()!).getByRole("button", { name: /บันทึก/ }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1]).toEqual({ teacher_name: "" });
  });
});

describe("first-run guide: school step", () => {
  beforeEach(() => {
    terms.value = []; classes.value = []; subjects.value = [];
    settings.value = base({ school_name: "โรงเรียนบ้านตัวอย่าง", teacher_name: "ครูผู้สอน", onboarding_done: false });
  });

  it("leaving both names empty saves empty names (the fallback words are display-time only)", async () => {
    render(<Onboarding />);
    const input = (await screen.findByPlaceholderText(/เช่น โรงเรียน/)) as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]).toEqual(["/api/settings", { school_name: "", teacher_name: "" }]);
  });

  it("typed names are saved trimmed", async () => {
    render(<Onboarding />);
    fireEvent.input(await screen.findByPlaceholderText(/เช่น โรงเรียน/), { target: { value: "  โรงเรียนบ้านสวน " } });
    fireEvent.input(screen.getByPlaceholderText(/เช่น ครู/), { target: { value: "ครูสมชาย" } });
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1]).toEqual({ school_name: "โรงเรียนบ้านสวน", teacher_name: "ครูสมชาย" });
  });
});

describe("settings: rename a device", () => {
  async function openDevices() {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    goTo("อุปกรณ์และรหัสผ่าน");
    await screen.findByRole("heading", { level: 2, name: /อุปกรณ์ที่เข้าสู่ระบบ/ });
    await waitFor(() => expect(screen.getAllByText("Chrome · Windows", { exact: false }).length).toBeGreaterThan(0));
  }

  it("every device has a rename button, this one too; the rename box takes at most 40 characters", async () => {
    await openDevices();
    expect(screen.getAllByRole("button", { name: /เปลี่ยนชื่อเครื่อง/ })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: /เปลี่ยนชื่อเครื่อง/ })[0]);
    const box = screen.getByLabelText(/^ชื่อเครื่อง Chrome/) as HTMLInputElement;
    expect(box.maxLength).toBe(40);
    expect(box.value).toBe("Chrome · Windows");
  });

  it("renaming this device posts the trimmed name, keeps a local copy and reloads the list", async () => {
    await openDevices();
    fireEvent.click(screen.getAllByRole("button", { name: /เปลี่ยนชื่อเครื่อง/ })[0]);
    fireEvent.input(screen.getByLabelText(/^ชื่อเครื่อง Chrome/), { target: { value: "  แท็บเล็ตห้อง ป.6  " } });
    devices[0] = { ...devices[0], name: "แท็บเล็ตห้อง ป.6" };
    fireEvent.click(screen.getByRole("button", { name: "บันทึกชื่อ" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/devices/dev_a/rename", { name: "แท็บเล็ตห้อง ป.6" }));
    await waitFor(() => expect(ok).toHaveBeenCalledWith("เปลี่ยนชื่อเครื่องแล้ว"));
    expect(deviceName()).toBe("แท็บเล็ตห้อง ป.6");
    await waitFor(() => expect(screen.getByText("แท็บเล็ตห้อง ป.6", { exact: false })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "บันทึกชื่อ" })).toBeNull();
  });

  it("renaming another device does not touch this one's local name; a duplicate name is allowed", async () => {
    localStorage.setItem("gk_device_name", "ของเรา");
    await openDevices();
    fireEvent.click(screen.getAllByRole("button", { name: /เปลี่ยนชื่อเครื่อง/ })[1]);
    fireEvent.input(screen.getByLabelText(/^ชื่อเครื่อง Chrome/), { target: { value: "Chrome · Windows 2" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกชื่อ" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/devices/dev_b/rename", { name: "Chrome · Windows 2" }));
    expect(deviceName()).toBe("ของเรา");
  });

  it("an empty name cannot be saved; cancel and Esc leave the name alone; a failed save says why and stays open", async () => {
    await openDevices();
    fireEvent.click(screen.getAllByRole("button", { name: /เปลี่ยนชื่อเครื่อง/ })[1]);
    const box = screen.getByLabelText(/^ชื่อเครื่อง Chrome/);
    fireEvent.input(box, { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "บันทึกชื่อ" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(screen.queryByLabelText(/^ชื่อเครื่อง Chrome/)).toBeNull();
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /เปลี่ยนชื่อเครื่อง/ })[1]);
    fireEvent.keyDown(screen.getByLabelText(/^ชื่อเครื่อง Chrome/), { key: "Escape" });
    expect(screen.queryByLabelText(/^ชื่อเครื่อง Chrome/)).toBeNull();

    post.mockRejectedValueOnce(Object.assign(new Error("ชื่อเครื่องต้องยาว 1–40 ตัวอักษร"), { code: "bad_device_name" }));
    fireEvent.click(screen.getAllByRole("button", { name: /เปลี่ยนชื่อเครื่อง/ })[1]);
    fireEvent.input(screen.getByLabelText(/^ชื่อเครื่อง Chrome/), { target: { value: "ใหม่" } });
    fireEvent.keyDown(screen.getByLabelText(/^ชื่อเครื่อง Chrome/), { key: "Enter" });
    await waitFor(() => expect(err).toHaveBeenCalledWith("ชื่อเครื่องต้องยาว 1–40 ตัวอักษร"));
    expect(screen.getByLabelText(/^ชื่อเครื่อง Chrome/)).toBeTruthy();
  });
});

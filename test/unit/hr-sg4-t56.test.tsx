// T-56 (AC-239-245): account + devices, backup/restore, history, and the red zone with its confirmation levels (BR-58, BR-59).
// Fictitious names only. No real endpoint is called: `api` is a mock; nothing is ever sent to a server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}), logout: vi.fn(async () => {}) }));
const { runBackup } = vi.hoisted(() => ({ runBackup: vi.fn(async () => {}) }));
vi.mock("@client/lib/backup", async (orig) => ({ ...await orig<typeof import("@client/lib/backup")>(), runBackup }));
vi.mock("@client/lib/idb", async (orig) => ({ ...await orig<typeof import("@client/lib/idb")>(), clearLocalWork: vi.fn(async () => {}) }));

import { ApiError } from "@client/lib/api";
import { AccountSection, checkPasswords } from "@client/components/settings/sections/AccountSection";
import { DangerSection } from "@client/components/settings/sections/DangerSection";
import { BackupSection } from "@client/components/settings/sections/BackupSection";
import { HistorySection } from "@client/components/settings/sections/HistorySection";
import { ResetModal } from "@client/components/ResetModal";
import { RestoreModal } from "@client/components/RestoreModal";
import { SettingsPage } from "@client/pages/Settings";
import { settings, students } from "@client/store";
import { route } from "@client/router";
import { online } from "@client/lib/outbox";
import { projectorOn } from "@client/lib/projector";
import { setHide } from "@client/lib/hideNames";
import type { Settings } from "@shared/types";

const dev = (id: string, name: string, current = false) => ({ id, name, user_agent: "", last_seen: Date.now(), current });
const base = (): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(Date.now() - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
} as Settings);

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (url: string) =>
    url.includes("/api/devices") ? { devices: [dev("d1", "iPad ห้องสมุด", true), dev("d2", "คอมบ้านครูสมชาย")] }
    : url.includes("auth/me") ? { email: "somchai@example.com" }
    : url.includes("restore/status") ? { pending: false, maintenance: false }
    : url.includes("/api/audit") ? { rows: [{ id: 1, at: Date.now(), entity: "attendance", action: "update", device_name: "iPad ห้องสมุด", student_id: "s1", after: { status: "present" } }] }
    : {});
  post.mockResolvedValue({ ok: true });
  settings.value = base();
  students.value = [{ id: "s1", code: "1", qr_token: "q", prefix: null, first_name: "สมชาย", last_name: "ใจดี", nickname: null, class_id: null, number: 7, status: "active", left_at: null, updated_at: 0 } as any];
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  online.value = true; projectorOn.value = false;
  localStorage.clear(); setHide("home", false);
});
afterEach(() => { cleanup(); online.value = true; projectorOn.value = false; });

describe("BR-58 password check", () => {
  it("6+ characters and equal to the confirmation; the old one is required", () => {
    expect(checkPasswords("a", "12345", "12345").next).toBeTruthy();
    expect(checkPasswords("a", "abc123", "abc124").again).toBe("รหัสใหม่ไม่ตรงกัน");
    expect(checkPasswords("", "abc123", "abc123").cur).toBeTruthy();
    expect(checkPasswords("a", "abc123", "abc123")).toEqual({});
  });
});

describe("AC-239/240 account", () => {
  it("the e-mail is read only with the advice to ask the administrator; no PIN field", async () => {
    render(<AccountSection />);
    expect(await screen.findByText("somchai@example.com")).toBeTruthy();
    expect(document.body.textContent).toContain("เปลี่ยนอีเมล: แจ้งผู้ดูแลระบบ");
    expect(document.body.textContent).toContain("ลืมรหัสผ่าน");
    expect(document.body.textContent).not.toMatch(/PIN/);
  });

  async function openForm() {
    render(<AccountSection />);
    fireEvent.click(await screen.findByRole("button", { name: /^เปลี่ยนรหัสผ่าน/ }));
    const cur = screen.getByLabelText("รหัสผ่านเดิม") as HTMLInputElement;
    const next = screen.getByLabelText("รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)") as HTMLInputElement;
    const again = screen.getByLabelText("ยืนยันรหัสผ่านใหม่") as HTMLInputElement;
    return { cur, next, again, type: (el: HTMLInputElement, v: string) => fireEvent.input(el, { target: { value: v } }) };
  }

  it("three password fields with the right autocomplete; show/hide per field", async () => {
    const { cur, next, again } = await openForm();
    expect([cur.type, next.type, again.type]).toEqual(["password", "password", "password"]);
    expect([cur.autocomplete, next.autocomplete, again.autocomplete]).toEqual(["current-password", "new-password", "new-password"]);
    fireEvent.click(screen.getByRole("button", { name: "แสดงรหัสผ่านใหม่ (อย่างน้อย 6 ตัว)" }));
    expect(next.type).toBe("text"); expect(cur.type).toBe("password");
  });

  it("checks before sending: too short and mismatch are told under the field and nothing is sent", async () => {
    const { cur, next, again, type } = await openForm();
    type(cur, "old"); type(next, "12345"); type(again, "12345");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }));
    expect((await screen.findByRole("alert")).textContent).toContain("อย่างน้อย 6 ตัว");
    expect(document.activeElement).toBe(next);
    type(next, "abc123"); type(again, "abc124");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }));
    expect((await screen.findByRole("alert")).textContent).toContain("รหัสใหม่ไม่ตรงกัน");
    expect(post).not.toHaveBeenCalledWith("/api/auth/change-password", expect.anything());
  });

  it("a wrong old password: role=alert under that field; the form stays", async () => {
    post.mockRejectedValueOnce(new ApiError(403, "wrong_password", "รหัสผ่านเดิมไม่ถูกต้อง"));
    const { cur, next, again, type } = await openForm();
    type(cur, "old"); type(next, "abc123"); type(again, "abc123");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }));
    expect((await screen.findByRole("alert")).textContent).toContain("รหัสผ่านเดิมไม่ถูกต้อง");
    expect(cur.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("รหัสผ่านเดิม")).toBeTruthy();
  });

  it("success: sent once (double press), role=status, the form closes and the fields are empty next time", async () => {
    const { cur, next, again, type } = await openForm();
    type(cur, "old"); type(next, "abc123"); type(again, "abc123");
    const save = screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" });
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("เปลี่ยนรหัสผ่านแล้ว"));
    expect(post.mock.calls.filter(([u]) => u === "/api/auth/change-password")).toEqual([["/api/auth/change-password", { current: "old", next: "abc123" }]]);
    fireEvent.click(screen.getByRole("button", { name: /^เปลี่ยนรหัสผ่าน/ }));
    expect((screen.getByLabelText("รหัสผ่านเดิม") as HTMLInputElement).value).toBe("");
  });

  it("offline: the change button is disabled with ต้องออนไลน์", async () => {
    online.value = false;
    render(<AccountSection />);
    const b = await screen.findByRole("button", { name: /^เปลี่ยนรหัสผ่าน/ });
    expect(b.hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("ต้องออนไลน์");
  });
});

describe("AC-241 devices", () => {
  it("this device has a chip and no sign-out button in the list; another one asks first with the safe answer focused", async () => {
    render(<AccountSection />);
    await screen.findByText("คอมบ้านครูสมชาย");
    expect(screen.queryByRole("button", { name: "ออกจากระบบ iPad ห้องสมุด" })).toBeNull();
    expect(document.body.textContent).toContain("เครื่องนี้");
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ คอมบ้านครูสมชาย" }));
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.getAttribute("aria-label")).toContain("คอมบ้านครูสมชาย");
    expect(document.activeElement?.textContent).toBe("ยกเลิก");
    expect(post).not.toHaveBeenCalledWith("/api/devices/d2/signout");
    fireEvent.click(within(dlg).getByRole("button", { name: "ออกจากระบบเครื่องนั้น" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/devices/d2/signout"));
  });

  it("cancelling the question signs nobody out", async () => {
    render(<AccountSection />);
    fireEvent.click(await screen.findByRole("button", { name: "ออกจากระบบ คอมบ้านครูสมชาย" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });

  it("an empty device name is refused under the field; offline disables signing another device out", async () => {
    render(<AccountSection />);
    fireEvent.click(await screen.findByRole("button", { name: "เปลี่ยนชื่อเครื่อง คอมบ้านครูสมชาย" }));
    const input = screen.getByLabelText("ชื่อเครื่อง คอมบ้านครูสมชาย") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "บันทึกชื่อ" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toContain("1–40");
    online.value = false;
    await waitFor(() => expect(screen.getByRole("button", { name: "ออกจากระบบ คอมบ้านครูสมชาย" }).hasAttribute("disabled")).toBe(true));
  });

  it("while projecting a device shows as เครื่อง N (no name leaks)", async () => {
    projectorOn.value = true;
    render(<AccountSection />);
    await screen.findByText(/เครื่อง 2/);
    expect(document.body.textContent).not.toContain("คอมบ้านครูสมชาย");
    expect(document.body.textContent).not.toContain("somchai@example.com");
  });
});

describe("AC-242/243 backup + restore", () => {
  const props = { lastBackup: Date.now() - 9 * 86400000, backupStale: true, busy: "", restoreInfo: null, restoreFailed: false, onBackup: vi.fn(), onRestore: vi.fn(), onCancelRestore: vi.fn(), onRetryStatus: vi.fn() };
  it("no wipe button here; a link to the reports page; the stale strip has its button", () => {
    render(<BackupSection {...props} />);
    expect(screen.queryByRole("button", { name: /^ล้าง/ })).toBeNull();
    expect(screen.getByRole("link", { name: /ส่งออกรายงานที่ รายงาน/ }).getAttribute("href")).toBe("#/reports");
    expect(screen.getByRole("button", { name: "สำรองเลย" })).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("ไม่ได้เข้ารหัส");
  });
  it("offline: download and restore are disabled with ต้องออนไลน์", () => {
    online.value = false;
    render(<BackupSection {...props} />);
    expect(screen.getByRole("button", { name: /ดาวน์โหลด$/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /กู้คืนจากไฟล์สำรอง/ }).hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("ต้องออนไลน์");
  });
  it("a pending restore: the strip offers ยกเลิกงานนี้", () => {
    render(<BackupSection {...props} restoreInfo={{ pending: true, maintenance: false }} />);
    expect(screen.getByRole("button", { name: "ยกเลิกงานนี้" })).toBeTruthy();
  });

  it("restore: after a good file the red button stays disabled until the box is ticked; cancel has the focus", async () => {
    post.mockImplementation(async (u: string) => (u === "/api/restore/validate" ? { ok: true, restoreId: "r1" } : { ok: true }));
    render(<RestoreModal onClose={() => {}} onDone={() => {}} />);
    const body = JSON.stringify({ app: "ngankrob", schema_version: 1, counts: { students: 2 }, exported_at: new Date().toISOString(), data: { settings: [] } });
    const file = { text: async () => body } as unknown as File;
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    const red = await screen.findByRole("button", { name: /กู้คืนและแทนที่ข้อมูล/ });
    expect(red.hasAttribute("disabled")).toBe(true);
    expect(document.activeElement?.textContent).toBe("ยกเลิก");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(red.hasAttribute("disabled")).toBe(false);
    online.value = false;
    await waitFor(() => expect(red.hasAttribute("disabled")).toBe(true));
    expect(post).not.toHaveBeenCalledWith("/api/restore/execute", expect.anything());
  });
});

describe("AC-244 history", () => {
  it("five filters with aria-pressed; the name follows the home hide-names switch", async () => {
    render(<HistorySection />);
    expect(await screen.findByText(/สมชาย ใจดี/)).toBeTruthy();
    for (const l of ["ทั้งหมด", "ส่งงาน", "เช็คชื่อ", "นักเรียน", "บัตร QR"]) expect(screen.getByRole("button", { name: l })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ทั้งหมด" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "เช็คชื่อ" }));
    expect(screen.getByRole("button", { name: "เช็คชื่อ" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes("entity=attendance"))).toBe(true));
    cleanup();
    setHide("home", true);
    render(<HistorySection />);
    expect(await screen.findByText(/เลขที่ 7/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("สมชาย");
  });
});

describe("AC-245 red zone (BR-59)", () => {
  it("DangerSection only opens the box; offline and projecting disable both buttons", () => {
    const onReset = vi.fn();
    render(<DangerSection onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /^ล้างข้อมูล/ }));
    fireEvent.click(screen.getByRole("button", { name: /ล้างทั้งหมด/ }));
    expect(onReset.mock.calls).toEqual([["data"], ["all"]]);
    expect(post).not.toHaveBeenCalled();
    online.value = false;
    cleanup(); render(<DangerSection onReset={onReset} />);
    expect(screen.getByRole("button", { name: /^ล้างข้อมูล/ }).hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("ต้องออนไลน์");
    online.value = true; projectorOn.value = true;
    cleanup(); render(<DangerSection onReset={onReset} />);
    expect(screen.getByRole("button", { name: /ล้างทั้งหมด/ }).hasAttribute("disabled")).toBe(true);
  });

  const toStep2 = () => { fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ })); return { pw: screen.getByLabelText("รหัสผ่านของคุณ") as HTMLInputElement }; };
  const phrase = (v: string) => fireEvent.input(screen.getByPlaceholderText(/^ล้าง/), { target: { value: v } });
  const red = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

  it("step 1 lists what goes / stays, has the safety copy ticked, focuses cancel, and has no password field yet", () => {
    render(<ResetModal mode="data" onClose={() => {}} />);
    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toContain("ที่จะถูกลบ");
    expect(dlg.textContent).toContain("ที่เก็บไว้");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement?.textContent).toBe("ยกเลิก");
    expect(screen.queryByLabelText("รหัสผ่านของคุณ")).toBeNull();
  });

  it("step 2: focus on the password; the red button needs the password AND the exact phrase", () => {
    render(<ResetModal mode="data" onClose={() => {}} />);
    const { pw } = toStep2();
    expect(document.activeElement).toBe(pw);
    const go = red(/^ล้างข้อมูลทดลอง/);
    expect(go.disabled).toBe(true);
    phrase("ล้างข้อมูล"); expect(go.disabled).toBe(true); // no password yet
    fireEvent.input(pw, { target: { value: "secret1" } });
    expect(go.disabled).toBe(false);
    phrase("ล้าง ข้อมูล"); expect(go.disabled).toBe(true);
    phrase("ล้างทั้งหมด"); expect(go.disabled).toBe(true);
    phrase("ล้างข้อมูล "); expect(go.disabled).toBe(false);
  });

  it("'all' needs its own phrase", () => {
    render(<ResetModal mode="all" onClose={() => {}} />);
    const { pw } = toStep2();
    fireEvent.input(pw, { target: { value: "secret1" } });
    phrase("ล้างข้อมูล"); expect(red(/^ล้างทั้งหมด/).disabled).toBe(true);
    phrase("ล้างทั้งหมด"); expect(red(/^ล้างทั้งหมด/).disabled).toBe(false);
  });

  it("with the safety copy ticked the personal-data warning comes first; cancelling it sends nothing", async () => {
    render(<ResetModal mode="data" onClose={() => {}} />);
    const { pw } = toStep2();
    fireEvent.input(pw, { target: { value: "secret1" } }); phrase("ล้างข้อมูล");
    fireEvent.click(red(/^ล้างข้อมูลทดลอง/));
    const warn = await screen.findByRole("dialog", { name: "ก่อนดาวน์โหลดไฟล์สำรอง" });
    expect(runBackup).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
    fireEvent.click(within(warn).getByRole("button", { name: "ยกเลิก" }));
    expect(post).not.toHaveBeenCalled();
  });

  it("confirmed: the copy is made first, then reset is sent once with mode, password and phrase", async () => {
    render(<ResetModal mode="data" onClose={() => {}} />);
    const { pw } = toStep2();
    fireEvent.input(pw, { target: { value: "secret1" } }); phrase("ล้างข้อมูล");
    fireEvent.click(red(/^ล้างข้อมูลทดลอง/));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "ก่อนดาวน์โหลดไฟล์สำรอง" })).getByRole("button", { name: /เข้าใจแล้ว ดาวน์โหลด/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/reset", { mode: "data", password: "secret1", confirm: "ล้างข้อมูล" }));
    expect(runBackup).toHaveBeenCalledTimes(1);
    expect(runBackup.mock.invocationCallOrder[0]).toBeLessThan(post.mock.invocationCallOrder[0]);
  });

  it("a wrong password: role=alert and the box stays (nothing was deleted)", async () => {
    post.mockRejectedValueOnce(new ApiError(403, "wrong_password", "รหัสผ่านไม่ถูกต้อง"));
    render(<ResetModal mode="data" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox")); // no safety copy: straight to the request
    const { pw } = toStep2();
    fireEvent.input(pw, { target: { value: "bad" } }); phrase("ล้างข้อมูล");
    fireEvent.click(red(/^ล้างข้อมูลทดลอง/));
    expect((await screen.findByRole("alert")).textContent).toContain("รหัสผ่านไม่ถูกต้อง");
    expect(runBackup).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("offline: the red button is disabled with the reason", () => {
    online.value = false;
    render(<ResetModal mode="data" onClose={() => {}} />);
    const { pw } = toStep2();
    fireEvent.input(pw, { target: { value: "secret1" } }); phrase("ล้างข้อมูล");
    expect(red(/^ล้างข้อมูลทดลอง/).disabled).toBe(true);
    expect(screen.getByRole("dialog").textContent).toContain("ต้องออนไลน์");
  });

  it("Esc closes the box while idle", () => {
    const onClose = vi.fn();
    render(<ResetModal mode="data" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("page: the red section and the old link", () => {
  it("?section=danger (old link) opens the red section; projecting disables its buttons", async () => {
    route.value = "/settings?section=danger"; window.location.hash = "#/settings?section=danger";
    projectorOn.value = true;
    render(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: /เริ่มใหม่/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /^ล้างข้อมูล/ }).hasAttribute("disabled")).toBe(true));
  });
});

describe("R-5601 projecting keeps every writing button off, whatever the network does", () => {
  it("backup section + account section stay disabled across offline -> online", async () => {
    projectorOn.value = true;
    const props = { lastBackup: 0, backupStale: true, busy: "", restoreInfo: { pending: true, maintenance: false }, restoreFailed: false, onBackup: vi.fn(), onRestore: vi.fn(), onCancelRestore: vi.fn(), onRetryStatus: vi.fn() };
    render(<><BackupSection {...props} /><AccountSection /></>);
    await screen.findByText(/เครื่อง 2/);
    const names = [/^ยกเลิกงานนี้/, /^สำรองเลย/, /ดาวน์โหลด$/, /กู้คืนจากไฟล์สำรอง/, /^เปลี่ยนรหัสผ่าน/, /^ออกจากระบบ เครื่อง 2/];
    const check = () => names.forEach((n) => expect(screen.getAllByRole("button", { name: n }).every((b) => b.hasAttribute("disabled")), String(n)).toBe(true));
    check();
    online.value = false; await waitFor(check);
    online.value = true; await waitFor(check);
  });
});

describe("R-5602 focus after going back", () => {
  it("back from step 2 lands on the safe button of step 1", () => {
    render(<ResetModal mode="data" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
    fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" }));
    expect(document.activeElement?.textContent).toBe("ยกเลิก");
  });
});

describe("R-5603 more confirmation guards", () => {
  const fill = (mode: "data" | "all" = "data") => {
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
    fireEvent.input(screen.getByLabelText("รหัสผ่านของคุณ"), { target: { value: "secret1" } });
    fireEvent.input(screen.getByPlaceholderText(/^ล้าง/), { target: { value: mode === "data" ? "ล้างข้อมูล" : "ล้างทั้งหมด" } });
  };
  const confirmWarning = async () => {
    fireEvent.click(screen.getByRole("button", { name: /^ล้างข้อมูลทดลอง/ }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "ก่อนดาวน์โหลดไฟล์สำรอง" })).getByRole("button", { name: /เข้าใจแล้ว ดาวน์โหลด/ }));
  };

  it("restore while projecting: the red button stays off even with the box ticked", async () => {
    post.mockImplementation(async (u: string) => (u === "/api/restore/validate" ? { ok: true, restoreId: "r1" } : { ok: true }));
    projectorOn.value = true;
    render(<RestoreModal onClose={() => {}} onDone={() => {}} />);
    const body = JSON.stringify({ app: "ngankrob", schema_version: 1, counts: { students: 2 }, exported_at: new Date().toISOString(), data: { settings: [] } });
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [{ text: async () => body }] });
    fireEvent.change(input);
    const red = await screen.findByRole("button", { name: /กู้คืนและแทนที่ข้อมูล/ });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(red.hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("ปิดอยู่ตอนฉายจอ");
  });

  it("a failed safety copy sends no reset and says nothing was deleted", async () => {
    runBackup.mockRejectedValueOnce(new Error("x"));
    render(<ResetModal mode="data" onClose={() => {}} />);
    fill(); await confirmWarning();
    expect((await screen.findByRole("alert")).textContent).toContain("ยังไม่มีอะไรถูกลบ");
    expect(post).not.toHaveBeenCalledWith("/api/admin/reset", expect.anything());
  });

  it("while it works the box cannot be closed (Esc, backdrop; the X is disabled)", async () => {
    let release!: () => void;
    runBackup.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    const onClose = vi.fn();
    render(<ResetModal mode="data" onClose={onClose} />);
    fill(); await confirmWarning();
    await waitFor(() => expect((screen.getByRole("button", { name: "ปิด" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(document.querySelector(".modal-overlay") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    release();
  });

  it("Esc in the backup warning closes only the warning", async () => {
    const onClose = vi.fn();
    render(<ResetModal mode="data" onClose={onClose} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /^ล้างข้อมูลทดลอง/ }));
    await screen.findByRole("dialog", { name: "ก่อนดาวน์โหลดไฟล์สำรอง" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ก่อนดาวน์โหลดไฟล์สำรอง" })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "ล้างข้อมูลทดลอง" })).toBeTruthy();
  });
});

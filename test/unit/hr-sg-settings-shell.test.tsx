// T-53 (AC-207–225, 246–249): the settings shell — groups, deep links, the "ต้องทำ" strip (BR-56), the three layouts,
// the status bar, and the read-only page while projecting (SGQ3). Fictitious names only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}) }));

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), notify }));
const { installHid } = vi.hoisted(() => ({ installHid: vi.fn(() => () => {}) }));
vi.mock("@client/lib/hid", () => ({ installHidScanner: installHid }));

import { SettingsPage } from "@client/pages/Settings";
import { settings, terms, currentTermId, selectedTermId } from "@client/store";
import { route } from "@client/router";
import { SettingsCards } from "@client/components/settings/SettingsCards";
import { online } from "@client/lib/outbox";
import { projectorOn } from "@client/lib/projector";
import { resolveSection, SECTIONS, GROUPS } from "@client/components/settings/sections/registry";
import { todoItems } from "@client/components/settings/sections/todo";
import type { Settings } from "@shared/types";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(Date.now() - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});
const mq = (match: (q: string) => boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: match(q), addEventListener: vi.fn(), removeEventListener: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mq(() => false);
  get.mockImplementation(async (url: string) => (url.includes("devices") ? { devices: [{ id: "d1", name: "iPad ห้องสมุด", user_agent: "", last_seen: Date.now(), current: true }] } : url.includes("restore") ? { pending: false, maintenance: false } : url.includes("auth/me") ? { email: "somchai@example.com" } : { rows: [] }));
  put.mockResolvedValue({ ok: true });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  settings.value = base();
  projectorOn.value = false;
  route.value = "/settings";
  window.location.hash = "#/settings";
});
afterEach(() => { cleanup(); projectorOn.value = false; online.value = true; });

const nav = () => screen.getByRole("navigation", { name: "หมวดตั้งค่า" });

describe("registry: groups and deep links (AC-207, AC-210)", () => {
  it("lists the sections in their groups, in the order of the design", () => {
    expect(GROUPS.map((g) => g.label)).toEqual(["ใช้บ่อย", "การสอน", "เครื่องนี้", "บัญชีและข้อมูล", "โซนอันตราย"]);
    expect(SECTIONS.filter((s) => s.group === "often").map((s) => s.label)).toEqual(["ภาพรวม", "เวลาเรียน", "การสแกน"]);
    expect(SECTIONS.find((s) => s.key === "catalog")!.label).toBe("ห้องเรียน วิชา ภาคเรียน");
  });
  it("opens the section of every old key; tab=types goes to worktypes, tab=terms to the terms tab; unknown -> general", () => {
    for (const k of ["general", "time", "scan", "catalog", "worktypes", "appearance", "devices", "backup", "history", "reset"]) expect(resolveSection(k).section).toBe(k);
    expect(resolveSection("danger").section).toBe("reset"); // T-56: the old wipe link opens the red section
    expect(resolveSection("catalog", "terms")).toEqual({ section: "catalog", tab: "terms" });
    expect(resolveSection("catalog", "types")).toEqual({ section: "worktypes" });
    expect(resolveSection("worktypes")).toEqual({ section: "worktypes" });
    expect(resolveSection("xyz").section).toBe("general");
    expect(resolveSection(undefined).section).toBe("general");
  });
});

describe("BR-56: the ต้องทำ strip and the backup dot", () => {
  const now = Date.UTC(2026, 10, 12, 2, 0); // 12 Nov 2026 09:00 in Bangkok
  const term = { name: "2/2569", end_date: "2027-03-31" };
  it("backup 6 and 7 days old: not due; 8 days: due; never: due", () => {
    expect(todoItems(term, Date.UTC(2026, 10, 5, 2, 14), now, "2026-11-12")).toEqual([]);
    expect(todoItems(term, Date.UTC(2026, 10, 4, 2, 14), now, "2026-11-12")).toEqual([]);
    const due = todoItems(term, Date.UTC(2026, 10, 4, 1, 0), now, "2026-11-12");
    expect(due.map((t) => t.id)).toEqual(["backup"]);
    expect(due[0].text).toBe("สำรองล่าสุด 8 วันก่อน · ควรสำรองสัปดาห์ละครั้ง");
    expect(todoItems(term, 0, now, "2026-11-12").map((t) => t.id)).toEqual(["backup"]);
  });
  it("no term, and a term that ended 3 days ago (ending today is not on the strip)", () => {
    const recent = Date.UTC(2026, 10, 11);
    expect(todoItems(null, recent, now, "2026-11-12").map((t) => t.id)).toEqual(["no-term"]);
    const ended = todoItems({ name: "2/2569", end_date: "2026-11-09" }, recent, now, "2026-11-12");
    expect(ended.map((t) => t.id)).toEqual(["term-ended"]);
    expect(ended[0].text).toBe("2/2569 · สิ้นสุดแล้ว 3 วัน");
    expect(todoItems({ name: "2/2569", end_date: "2026-11-12" }, recent, now, "2026-11-12")).toEqual([]);
  });
});

describe("the overview (AC-223)", () => {
  it("strip first (only when something is due), then the cards, then the school form; no light/dark choice here", async () => {
    settings.value = base({ last_backup_at: "" });
    render(<SettingsPage />);
    const strip = await screen.findByRole("heading", { level: 3, name: /ต้องทำ 1 เรื่อง/ });
    const school = screen.getByRole("heading", { level: 2, name: /ข้อมูลโรงเรียน/ });
    expect(strip.compareDocumentPosition(school) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "ปรับการ์ดภาพรวม" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "มืด" })).toBeNull();
    fireEvent.click(within(strip.closest("section")!).getByRole("button", { name: /ไปสำรองข้อมูล/ }));
    expect(await screen.findByRole("heading", { level: 2, name: /สำรองและกู้คืน/ })).toBeTruthy();
  });
  it("nothing due = no strip", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 2, name: /ข้อมูลโรงเรียน/ });
    expect(screen.queryByRole("heading", { level: 3, name: /ต้องทำ/ })).toBeNull();
  });
});

describe("status: loading, saving, failing (AC-214, AC-215, AC-218)", () => {
  it("settings not here yet: the list is up at once and the body says it is loading (aria-busy)", () => {
    settings.value = null as unknown as Settings;
    render(<SettingsPage />);
    expect(nav()).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("กำลังโหลดการตั้งค่า");
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
  it("a failed save keeps what was typed and says so in an alert with ลองอีกครั้ง; the bar follows into another section", async () => {
    put.mockRejectedValueOnce(new Error("500"));
    render(<SettingsPage />);
    fireEvent.input(await screen.findByLabelText("ชื่อครู"), { target: { value: "ครูใหม่" } });
    fireEvent.click(within(nav()).getByRole("button", { name: /เวลาเรียน/ }));
    const bar = screen.getByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" });
    expect(bar.textContent).toContain("แก้ไขแล้ว 1 รายการ");
    fireEvent.click(within(bar).getByRole("button", { name: /บันทึก/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("บันทึกไม่สำเร็จ — ข้อมูลเดิมยังอยู่");
    fireEvent.click(within(alert).getByRole("button", { name: "ลองอีกครั้ง" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" })).toBeNull());
  });
  it("every row of the scan section says where it applies and how it is saved", async () => {
    route.value = "/settings?section=scan";
    render(<SettingsPage />);
    await screen.findByRole("switch", { name: "เสียงตอบรับ" });
    expect(screen.getAllByText("ทุกเครื่อง").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("บันทึกทันที").length).toBe(2);
    expect(screen.getByRole("button", { name: /ไปพิมพ์ที่ นักเรียน/ })).toBeTruthy();
  });
});

describe("the nav (AC-213)", () => {
  it("groups have text headings (not buttons); every item is a button; Down/Up move the focus", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    for (const g of GROUPS) expect(within(nav()).getByText(g.label).closest("button")).toBeNull();
    const first = within(nav()).getByRole("button", { name: /ภาพรวม/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(within(nav()).getByRole("button", { name: /เวลาเรียน/ }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
  });
  it("switching section moves the focus to that section's heading", async () => {
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    fireEvent.click(within(nav()).getByRole("button", { name: /เวลาเรียน/ }));
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H2"));
    expect(document.activeElement?.textContent).toContain("เวลาเรียน");
  });
});

describe("layouts (AC-208, AC-209)", () => {
  it("phone: page 1 is the list; a row opens page 2 with ‹ ตั้งค่า that goes back to the list", async () => {
    mq(() => true);
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    expect(screen.queryByLabelText("ชื่อครู")).toBeNull();
    fireEvent.click(within(nav()).getByRole("button", { name: /เวลาเรียน/ }));
    await screen.findByRole("heading", { level: 2, name: /เวลาเรียน/ });
    fireEvent.click(screen.getByRole("button", { name: "กลับไปรายการตั้งค่า" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: /เวลาเรียน/ })).toBeNull());
    expect(within(nav()).getByRole("button", { name: /การสแกน/ })).toBeTruthy();
  });
  it("iPad portrait: a bar of groups on top and the pills of the open group", async () => {
    mq((q) => q.includes("1023"));
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    const n = nav();
    expect(within(n).getByRole("button", { name: /ใช้บ่อย/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(n).getAllByRole("button", { name: /ภาพรวม|เวลาเรียน|การสแกน/ })).toHaveLength(3);
    fireEvent.click(within(n).getByRole("button", { name: /บัญชีและข้อมูล/ }));
    expect((await screen.findAllByRole("heading", { level: 2, name: /บัญชีและรหัสผ่าน|ตรวจเครื่องนี้/ })).length).toBeGreaterThan(0);
  });
});

describe("while projecting: read only, no e-mail, no names (AC-248, SGQ3)", () => {
  it("the page is read only: the controls are inside a disabled fieldset, the notice says why, the teacher's name is off the header", async () => {
    projectorOn.value = true;
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    expect(document.body.textContent).toContain("ปิดอยู่ตอนฉายจอ");
    expect((screen.getByLabelText("ชื่อครู") as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain("ครูทดสอบ ·");
    expect(screen.getByRole("button", { name: "ปรับการ์ดภาพรวม" }).hasAttribute("disabled")).toBe(true);
  });
  it("the e-mail shows ซ่อนอยู่; the history and device names are not shown", async () => {
    projectorOn.value = true;
    route.value = "/settings?section=devices";
    render(<SettingsPage />);
    await screen.findByText("ซ่อนอยู่");
    expect(document.body.textContent).not.toContain("somchai@example.com");
    fireEvent.click(within(nav()).getByRole("button", { name: /ประวัติการแก้ไข/ }));
    expect(await screen.findByText(/ประวัติการแก้ไขซ่อนอยู่ตอนฉายจอ/)).toBeTruthy();
    expect(get.mock.calls.some(([u]) => String(u).includes("/api/audit?") && !String(u).includes("limit=5"))).toBe(false);
  });
  it("not projecting: the e-mail is shown", async () => {
    route.value = "/settings?section=devices";
    render(<SettingsPage />);
    await screen.findByText("somchai@example.com");
  });
});

describe("review round (R-5301..R-5309)", () => {
  it("R-5301: projecting, the scan section does not listen to the scanner and shows no result rows", async () => {
    projectorOn.value = true;
    route.value = "/settings?section=scan";
    render(<SettingsPage />);
    await screen.findByText(/ปิดอยู่ตอนฉายจอ \(ผลการยิง/);
    expect(installHid).not.toHaveBeenCalled();
  });
  it("R-5301: not projecting, it listens", async () => {
    route.value = "/settings?section=scan";
    render(<SettingsPage />);
    await screen.findByRole("switch", { name: "เสียงตอบรับ" });
    expect(installHid).toHaveBeenCalled();
  });
  it("R-5302: projecting, no device name anywhere (list, aria-label, latest-edits card)", async () => {
    projectorOn.value = true;
    settings.value = base({ settings_cards: JSON.stringify({ v: 1, order: ["status", "backup", "term", "devices", "history"], hidden: [] }) });
    get.mockImplementation(async (url: string) => (url.includes("devices") ? { devices: [{ id: "d1", name: "iPad ห้องสมุด", user_agent: "", last_seen: Date.now(), current: false }] } : url.includes("/api/audit") ? { rows: [{ id: 1, at: Date.now(), entity: "submission", action: "update", device_name: "iPad ห้องสมุด" }] } : url.includes("restore") ? { pending: false, maintenance: false } : { email: "x@example.com" }));
    render(<SettingsCards lastBackup={1} onBackup={() => {}} onRestore={() => {}} goSection={() => {}} />);
    await waitFor(() => expect(document.body.innerHTML).toContain("เครื่อง 1"));
    await waitFor(() => expect(document.body.innerHTML).toContain("ส่งงาน/คะแนน"));
    cleanup();
    render(<SettingsPage />);
    fireEvent.click(within(nav()).getByRole("button", { name: /บัญชีและอุปกรณ์/ }));
    await screen.findByRole("button", { name: "เปลี่ยนชื่อเครื่อง เครื่อง 1" });
    expect(document.body.innerHTML).not.toContain("iPad ห้องสมุด");
  });
  it("R-5309: a key that is also an Object property falls back to general", () => {
    for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty"]) expect(resolveSection(k).section).toBe("general");
  });
  it("R-5304: offline, download / restore / start-term on the overview cards are disabled", async () => {
    online.value = false;
    render(<SettingsPage />);
    const dl = await screen.findByRole("button", { name: /ดาวน์โหลด/ });
    expect((dl as HTMLButtonElement).disabled).toBe(true);
    for (const b of screen.getAllByRole("button", { name: "กู้คืน" })) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /เริ่มภาคเรียนใหม่/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("R-5305: projecting, the catalog tab for terms still opens; the write buttons stay off", async () => {
    projectorOn.value = true;
    route.value = "/settings?section=catalog&tab=terms";
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 2, name: /ห้องเรียน วิชา ภาคเรียน/ });
    const tab = screen.getByRole("tab", { name: "วิชา" }) as HTMLButtonElement;
    expect(tab.disabled).toBe(false);
    fireEvent.click(tab);
    await waitFor(() => expect(document.body.textContent).toContain("ปิดอยู่ตอนฉายจอ"));
  });
  it("R-5303: phone: the heading takes the focus after a pick, and the list row after going back", async () => {
    mq(() => true);
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
    fireEvent.click(within(nav()).getByRole("button", { name: /เวลาเรียน/ }));
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H2"));
    fireEvent.click(screen.getByRole("button", { name: "กลับไปรายการตั้งค่า" }));
    await waitFor(() => expect(document.activeElement?.tagName).toBe("BUTTON"));
    expect(document.activeElement?.textContent).toContain("เวลาเรียน");
  });
  it("R-5307: the look section says its settings apply to every device", async () => {
    route.value = "/settings?section=appearance";
    render(<SettingsPage />);
    await screen.findByRole("radiogroup", { name: "ธีม" });
    expect(screen.getAllByText("ทุกเครื่อง").length).toBeGreaterThanOrEqual(3);
  });
  it("R-5306: choosing dark saves, toasts with เลิกทำ, and the undo sends the old mode back", async () => {
    route.value = "/settings?section=appearance";
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "มืด" }));
    await waitFor(() => expect(notify).toHaveBeenCalled(), { timeout: 3000 });
    const [kind, text, opts] = notify.mock.calls[0];
    expect(kind).toBe("success");
    expect(text).toContain("สว่าง/มืด");
    expect(opts.action.label).toBe("เลิกทำ");
    expect(put.mock.calls.some(([, b]) => b.theme === "dark")).toBe(true);
    opts.action.run();
    await waitFor(() => expect(put.mock.calls.some(([, b]) => b.theme === "light")).toBe(true), { timeout: 3000 });
  });
});

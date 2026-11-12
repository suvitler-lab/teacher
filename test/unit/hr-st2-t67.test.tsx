// T-67: iPad portrait list title (AC-203/179), sample file on the empty page (ST-S03), phone row bottom sheet (AC-204).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/store", async (orig) => ({ ...(await orig<typeof import("@client/store")>()), loadBootstrap: vi.fn(async () => {}) }));
vi.mock("@client/lib/importTemplate", async (orig) => ({ ...(await orig<typeof import("@client/lib/importTemplate")>()), downloadTemplate: vi.fn(async () => {}) }));

import { StudentsPage } from "@client/pages/Students";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, qrRotatedAt } from "@client/store";
import { route } from "@client/router";
import { projectorOn, setPjHideNames } from "@client/lib/projector";
import { setHide } from "@client/lib/hideNames";
import { swrClear } from "@client/lib/swr";
import { online } from "@client/lib/outbox";
import { toasts } from "@client/lib/notify";
import { downloadTemplate } from "@client/lib/importTemplate";

const kid = (n: number | null, first: string, over: Partial<Student> = {}): Student => ({
  id: "s" + (n ?? first), code: "610" + String(n ?? 0).padStart(2, "0"), qr_token: "SECRETTOKEN" + n, prefix: null, first_name: first, last_name: "นามสมมติ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0, ...over,
});
const KIDS = [kid(1, "สมชาย"), kid(2, "สมหญิง"), kid(3, "ภูมิ"), kid(4, "ดวงดาว")];
const A: Assignment = {
  id: "a1", title: "ใบงานที่ 4", term_id: "t1", subject_id: "math", type_id: null, unit: null, full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05",
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const payload = () => ({
  classId: "c1", range: { from: "2026-05-01", to: "2026-10-31", month: null, termId: "t1", att: "daily" }, students: KIDS, assignments: [A],
  submissions: KIDS.map((k) => ({ assignment_id: "a1", student_id: k.id, status: "submitted", score: 9, late: false })),
  attendanceSessions: [{ id: "d0", date: "2026-10-01" }], attendance: KIDS.map((k) => ({ session_id: "d0", student_id: k.id, status: "present" })),
});
const baseSettings = () => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false, accept_student_code_scan: false,
  parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
}) as never;

const phoneOn = (on: boolean) => {
  (window as any).matchMedia = (q: string) => ({ matches: on && q.includes("max-width: 720px"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
};
beforeEach(() => {
  vi.clearAllMocks(); cleanup(); swrClear(); route.value = "/students"; try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  projectorOn.value = false; setPjHideNames(false); setHide("students", false); online.value = true; phoneOn(false);
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 }];
  subjects.value = []; settings.value = baseSettings(); qrRotatedAt.value = {};
  students.value = [...KIDS];
  get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : p.startsWith("/api/students") ? { students: [] } : payload()));
  post.mockResolvedValue({});
});
afterEach(() => { cleanup(); projectorOn.value = false; online.value = true; phoneOn(false); });

const ready = () => waitFor(() => expect(document.querySelector(".stu-hero")!.getAttribute("aria-busy")).toBeNull());

describe("AC-179: the list title stays visible at every width (PM reverted the iPad-portrait sr-only rule: review R-6702 — it bought no row)", () => {
  const css = readFileSync("src/styles/students.css", "utf8");
  it("no portrait-tablet rule re-hides .stu-lhead2 (it is shown at <= 1000px per AC-179)", () => {
    expect(css).not.toMatch(/orientation: portrait\)\s*\{[^}]*stu-lhead2/);
  });
  it("the title stays in the DOM, before the column head", async () => {
    render(<StudentsPage />); await ready();
    const t = document.querySelector(".stu-lhead2")!;
    expect(t.textContent).toMatch(/รายชื่อ · 4 คน/);
    expect(t.compareDocumentPosition(document.querySelector(".stu-list-head")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ST-S03: the empty page offers the sample file", () => {
  beforeEach(() => { students.value = []; });
  it("has [ดาวน์โหลดไฟล์ตัวอย่าง .xlsx] that builds the file locally, also offline", async () => {
    render(<StudentsPage />); await ready();
    expect(screen.getByText("ยังไม่มีนักเรียนในห้องนี้")).toBeTruthy();
    online.value = false;
    const b = (await screen.findByRole("button", { name: /ดาวน์โหลดไฟล์ตัวอย่าง \.xlsx/ })) as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    fireEvent.click(b);
    expect(downloadTemplate).toHaveBeenCalledTimes(1);
  });
  it("a failed build says so (not a silent nothing)", async () => {
    (downloadTemplate as any).mockRejectedValueOnce(new Error("x"));
    render(<StudentsPage />); await ready();
    fireEvent.click(screen.getByRole("button", { name: /ดาวน์โหลดไฟล์ตัวอย่าง \.xlsx/ }));
    await waitFor(() => expect(toasts.value.some((t) => /สร้างไฟล์ตัวอย่างไม่สำเร็จ/.test(t.message))).toBe(true));
  });
});

describe("AC-204: the ⋮ of a row on a phone is a bottom sheet", () => {
  beforeEach(() => { phoneOn(true); });
  const openSheet = async (re = /จัดการ สมหญิง/) => { render(<StudentsPage />); await ready(); const btn = screen.getByRole("button", { name: re }); btn.focus(); fireEvent.click(btn); return { btn, dlg: await screen.findByRole("dialog", { name: re }) }; };
  it("opens with the 5 items, the first one focused, and no small menu", async () => {
    const { dlg } = await openSheet();
    expect(within(dlg).getAllByRole("button").filter((b) => b.getAttribute("aria-label") !== "ปิด").map((b) => b.textContent?.trim())).toEqual(["ดูข้อมูล", "แก้ไข", "ย้ายห้อง…", "ออกบัตร QR ใหม่…", "ย้ายออก/ไม่ใช้งาน…"]);
    expect(document.activeElement).toBe(within(dlg).getByRole("button", { name: /ดูข้อมูล/ }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("Esc closes and focus goes back to that row's ⋮", async () => {
    const { btn } = await openSheet();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /จัดการ สมหญิง/ })).toBeNull());
    expect(document.activeElement).toBe(btn);
  });
  it("แก้ไข opens the form of that child", async () => {
    const { dlg } = await openSheet();
    fireEvent.click(within(dlg).getByRole("button", { name: "แก้ไข" }));
    const f = await screen.findByRole("dialog", { name: "นักเรียน" });
    expect((within(f).getByLabelText("ชื่อ") as HTMLInputElement).value).toBe("สมหญิง");
  });
  it("offline: edit / move / QR are off, leave stays pressable (R-5211)", async () => {
    const { dlg } = await openSheet();
    online.value = false;
    await waitFor(() => expect((within(dlg).getByRole("button", { name: /แก้ไข/ }) as HTMLButtonElement).disabled).toBe(true));
    const dis = (re: RegExp) => (within(dlg).getByRole("button", { name: re }) as HTMLButtonElement).disabled;
    expect([dis(/ย้ายห้อง/), dis(/ออกบัตร QR/), dis(/ย้ายออก/)]).toEqual([true, true, false]);
  });
  it("hidden names: the ⋮ says the number, not the name", async () => {
    setHide("students", true);
    render(<StudentsPage />); await ready();
    expect(screen.getByRole("button", { name: /^จัดการ เลขที่ 2/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /จัดการ สมหญิง/ })).toBeNull();
  });
});

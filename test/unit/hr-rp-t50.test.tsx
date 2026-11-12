// T-50 (reuses the T-49 F-R8 fixture): the report page's numbers (BR-37..BR-43) against the hand-worked F-R8 example, and the new states (BR-38 "—", BR-39 "เก็บอยู่",
// BR-40 awaiting, BR-41 often-absent card). Each expected number is the SA's hand calculation, not read back from the code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));

import { ReportsPage } from "@client/pages/Reports";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, assignments } from "@client/store";
import type { ReportPayload } from "@client/lib/report";
import { setHide } from "@client/lib/hideNames";
import { projectorOn } from "@client/lib/projector";

const NAMES: [number, string, string][] = [[1, "สมชาย", "ใจดี"], [2, "สมหญิง", "รักเรียน"], [3, "ภูมิ", "แสงทอง"], [4, "ดวงดาว", "มั่นคง"], [5, "กานดา", "เพชรดี"], [6, "ปวีณ", "สุขใจ"], [7, "นภัส", "ทองงาม"], [8, "ธีรา", "จันทร์เพ็ญ"]];
const kid = ([n, f, l]: [number, string, string]): Student => ({ id: "s" + n, code: "6100" + n, qr_token: "Q" + n, prefix: null, first_name: f, last_name: l, nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0 });
const asg = (id: string, title: string, full: number, assigned: string | null, due: string | null, status: "open" | "closed" = "open"): Assignment => ({
  id, title, term_id: "t1", subject_id: "math", type_id: null, unit: null, full_score: full, assigned_date: assigned, due_date: due, note: null, publish_scores: true, status,
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});
const W1 = asg("w1", "ใบงานที่ 4", 10, "2026-11-01", "2026-11-05"), W2 = asg("w2", "แบบฝึกหัด 3.2", 20, "2026-11-02", "2026-11-11");
const W3 = asg("w3", "ชิ้นงานโครงงาน", 15, "2026-11-03", null), W4 = asg("w4", "สอบย่อยบทที่ 3", 10, "2026-11-04", "2026-11-04", "closed");

// [work, student, score|null (awaiting), late, status]
type Cell = [string, number, number | null, boolean?, string?];
const CELLS: Cell[] = [
  ["w1", 1, 9], ["w1", 2, 10], ["w1", 3, 7.5, true], ["w1", 4, null], ["w1", 6, 8], ["w1", 7, null, false, "excused"],
  ["w2", 5, 12], ["w2", 1, 20], ["w2", 2, null], ["w2", 3, 14], ["w2", 6, null], ["w2", 7, 20],
  ["w3", 8, 9.5], ["w3", 1, 10], ["w3", 2, 15], ["w3", 4, 13], ["w3", 6, null], ["w3", 7, 15],
  ["w4", 1, 10], ["w4", 2, 9], ["w4", 3, 8, true], ["w4", 4, 5], ["w4", 6, 10], ["w4", 7, 3],
];
// per child: [present, late, leave, sick, absent] over 20 school days
const ATT: Record<number, number[]> = { 1: [20, 0, 0, 0, 0], 2: [18, 1, 1, 0, 0], 3: [17, 1, 0, 1, 1], 4: [18, 1, 1, 0, 0], 5: [14, 1, 1, 1, 3], 6: [20, 0, 0, 0, 0], 7: [17, 1, 1, 1, 0], 8: [14, 1, 0, 2, 3] };
const STATUS = ["present", "late", "leave", "sick", "absent"];

function payloadR8(over: Partial<ReportPayload> = {}): ReportPayload {
  const sessions = Array.from({ length: 20 }, (_, i) => ({ id: "d" + i, date: `2026-10-${String(i + 1).padStart(2, "0")}` }));
  const attendance: ReportPayload["attendance"] = [];
  for (const [n, counts] of Object.entries(ATT)) {
    let day = 0;
    counts.forEach((c, k) => { for (let j = 0; j < c; j++) attendance.push({ session_id: "d" + day++, student_id: "s" + n, status: STATUS[k] }); });
  }
  return {
    classId: "c1", range: { from: "2026-10-01", to: "2026-11-11", month: null, termId: "t1", att: "daily" },
    students: NAMES.map(kid), assignments: [W1, W2, W3, W4],
    submissions: CELLS.map(([a, n, score, late, status]) => ({ assignment_id: a, student_id: "s" + n, status: status ?? "submitted", score, late: !!late })),
    attendanceSessions: sessions, attendance, ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T09:42:00Z")); // 16:42 Bangkok
  get.mockReset(); get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : payloadR8()));
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-10-01", end_date: "2026-12-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 }];
  students.value = NAMES.map(kid); assignments.value = [W1, W2, W3, W4];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  settings.value = { school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "" } as never;
  projectorOn.value = false; localStorage.clear(); setHide("reports", false);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const open_ = async () => { render(<ReportsPage />); await screen.findByRole("region", { name: "สรุปรายงาน" }); };

describe("AC-167 print sheet follows the hide switch (R-4911 #1)", () => {
  it("hidden: the sheet says \"เลขที่ N\" everywhere and never a name; the head says แสดงเลขที่แทนชื่อ", async () => {
    setHide("reports", true);
    await open_();
    fireEvent.click(screen.getByRole("button", { name: "พิมพ์" }));
    const sheet = await waitFor(() => { const e = document.querySelector(".rp-sheet"); expect(e).toBeTruthy(); return e as HTMLElement; });
    expect(sheet.textContent).toContain("แสดงเลขที่แทนชื่อ");
    expect(sheet.textContent).toContain("เลขที่ 5");
    for (const n of ["กานดา", "ธีรา", "สมชาย", "ใจดี"]) expect(sheet.textContent).not.toContain(n);
  });
  it("shown: full names, no 'แสดงเลขที่แทนชื่อ'", async () => {
    await open_();
    fireEvent.click(screen.getByRole("button", { name: "พิมพ์" }));
    const sheet = await waitFor(() => { const e = document.querySelector(".rp-sheet"); expect(e).toBeTruthy(); return e as HTMLElement; });
    expect(sheet.textContent).not.toContain("แสดงเลขที่แทนชื่อ");
    expect(sheet.textContent).toContain("กานดา");
  });
  it("Esc closes the preview and the print button gets the focus back", async () => {
    await open_();
    fireEvent.click(screen.getByRole("button", { name: "พิมพ์" }));
    await waitFor(() => expect(document.querySelector(".rp-sheet")).toBeTruthy());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".rp-sheet")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "พิมพ์" })));
  });
});

describe("AC-168 TV view has no 0% without a denominator and never a name (R-4911 #2)", () => {
  it("no task is due yet: \"—\" for the submit rate, not 0%", async () => {
    const W5 = asg("w5", "งานใหม่", 10, null, null);
    get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : payloadR8({ assignments: [W5], submissions: [] })));
    projectorOn.value = true;
    render(<ReportsPage />);
    const pj = await waitFor(() => { const e = document.querySelector(".pj"); expect(e).toBeTruthy(); return e as HTMLElement; });
    const stats = [...pj.querySelectorAll(".rp-pj-nums > div")].map((d) => d.textContent);
    expect(stats[0]).toBe("—ส่งงานแล้ว");
    expect(stats[0]).not.toContain("0%");
    expect(pj.textContent).toContain("ไม่มีชื่อนักเรียนบนจอนี้");
  });
  it("85% when there is a denominator, and no name from any child", async () => {
    projectorOn.value = true;
    render(<ReportsPage />);
    const pj = await waitFor(() => { const e = document.querySelector(".pj"); expect(e).toBeTruthy(); return e as HTMLElement; });
    expect(pj.querySelector(".rp-pj-nums")!.textContent).toContain("85%");
    for (const n of ["กานดา", "ธีรา", "สมชาย"]) expect(pj.textContent).not.toContain(n);
  });
});

describe("AC-251 a room with no children: print / Excel / TV are all off", () => {
  it("disables the three buttons, keeps reload and the hide switch, still offers the way to Students", async () => {
    get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : payloadR8({ students: [], submissions: [], attendance: [] })));
    students.value = [];
    render(<ReportsPage />);
    await screen.findByText("ห้องนี้ยังไม่มีนักเรียน");
    for (const n of ["ส่งออก Excel", "พิมพ์", "โหมดฉายจอ"]) expect((screen.getByRole("button", { name: n }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "ไปหน้านักเรียน" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "พิมพ์" }));
    expect(document.querySelector(".rp-sheet")).toBeNull();
  });
  it("with children the same buttons are on", async () => {
    await open_();
    for (const n of ["ส่งออก Excel", "พิมพ์"]) expect((screen.getByRole("button", { name: n }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("AC-166 the Excel label, and the warning while names are hidden", () => {
  it("names the file before the tap; warns only while hidden", async () => {
    await open_();
    expect(document.querySelector(".rp-xl-scope")!.textContent).toContain("ไฟล์ Excel: ป.6/1 · ทุกวิชา · ทั้งเทอม");
    expect(document.querySelector(".rp-xl-warn")).toBeNull();
    setHide("reports", true);
    await waitFor(() => expect(document.querySelector(".rp-xl-warn")!.textContent).toContain("ไฟล์ Excel มีชื่อนักเรียน"));
  });
});

function absentPayload(counts: Record<number, number>): ReportPayload {
  const p = payloadR8();
  const ids = Object.keys(counts).map((n) => "s" + n);
  p.attendance = p.attendance.filter((r) => !ids.includes(r.student_id));
  for (const [n, c] of Object.entries(counts)) for (let j = 0; j < c; j++) p.attendance.push({ session_id: "d" + j, student_id: "s" + n, status: "absent" });
  return p;
}
const absentCard = async () => (await screen.findByRole("heading", { name: /ขาดบ่อย \(ขาด ≥ 3 ครั้ง\)/ })).closest("section")!;

describe("AC-163 the often-absent card: 5 names, then ดูทั้งหมด (n) opens all", () => {
  it("6 children with absent >= 3 -> the first 5 in order (TC-740 shape) + ดูทั้งหมด (6) + a sheet of 6", async () => {
    const p = absentPayload({ 5: 6, 3: 5, 7: 5, 8: 4, 1: 3, 2: 3 });
    get.mockImplementation(async (u: string) => (u.startsWith("/api/audit") ? { rows: [] } : p));
    await open_();
    const card = await absentCard();
    await waitFor(() => expect(card.querySelectorAll(".rp-follow").length).toBe(5));
    expect([...card.querySelectorAll(".rp-follow .no")].map((e) => e.textContent)).toEqual(["5", "3", "7", "8", "1"]);
    fireEvent.click(within(card).getByRole("button", { name: /ดูทั้งหมด \(6\)/ }));
    const dlg = await screen.findByRole("dialog");
    expect([...dlg.querySelectorAll(".rp-follow .no")].map((e) => e.textContent)).toEqual(["5", "3", "7", "8", "1", "2"]);
  });
  it("exactly 5 -> 5 rows, no button", async () => {
    const p = absentPayload({ 5: 6, 3: 5, 7: 5, 8: 4, 1: 3 });
    get.mockImplementation(async (u: string) => (u.startsWith("/api/audit") ? { rows: [] } : p));
    await open_();
    const card = await absentCard();
    await waitFor(() => expect(card.querySelectorAll(".rp-follow").length).toBe(5));
    expect(within(card).queryByRole("button", { name: /ดูทั้งหมด/ })).toBeNull();
  });
  it("2 children (กานดา, ธีรา): 2 rows, no button", async () => {
    await open_();
    const card = await absentCard();
    expect(card.querySelectorAll(".rp-follow").length).toBe(2);
    expect(within(card).queryByRole("button", { name: /ดูทั้งหมด/ })).toBeNull();
  });
});

describe("R-5001 the student drawer hides the name too", () => {
  it("hidden: the drawer says เลขที่ 5 and never the full name", async () => {
    setHide("reports", true);
    await open_();
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "ดูข้อมูล เลขที่ 5" }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg.textContent).toContain("เลขที่ 5");
    expect(dlg.textContent).not.toContain("กานดา");
    expect(dlg.getAttribute("aria-label") ?? "").not.toContain("กานดา");
  });
});

describe("AC-172 / AC-251 phone: sheets for filters, export, sort, menu", () => {
  beforeEach(() => {
    (window as any).matchMedia = (q: string) => ({ matches: q.includes("max-width: 720px"), media: q, addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => { delete (window as any).matchMedia; });
  it("no desktop tool row; [ตัวกรอง (0)] opens a sheet; Esc closes and the opener gets the focus back", async () => {
    await open_();
    expect(screen.queryByRole("button", { name: "ส่งออก Excel" })).toBeNull();
    const opener = screen.getByRole("button", { name: /ตัวกรอง \(0\)/ });
    opener.focus();
    fireEvent.click(opener);
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByRole("combobox", { name: "วิชาของรายงาน" })).toBeTruthy();
    fireEvent.keyDown(dlg, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("[ส่งออก] sheet: scope label, warning when hidden, three items on", async () => {
    setHide("reports", true);
    await open_();
    fireEvent.click(screen.getByRole("button", { name: /^ส่งออก/ }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg.textContent).toContain("ไฟล์ Excel: ป.6/1 · ทุกวิชา · ทั้งเทอม");
    expect(dlg.textContent).toContain("ไฟล์ Excel มีชื่อนักเรียน");
    for (const n of ["ส่งออก Excel", "พิมพ์"]) expect((within(dlg).getByRole("button", { name: n }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("empty room: the three items in the export sheet are disabled", async () => {
    get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : payloadR8({ students: [], submissions: [], attendance: [] })));
    students.value = [];
    render(<ReportsPage />);
    await screen.findByText("ห้องนี้ยังไม่มีนักเรียน");
    fireEvent.click(screen.getByRole("button", { name: /^ส่งออก/ }));
    const dlg = await screen.findByRole("dialog");
    for (const n of ["ส่งออก Excel", "พิมพ์", "โหมดฉายจอ"]) expect((within(dlg).getByRole("button", { name: n }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("sort sheet: picking มาเรียน sorts and says so; the ⋮ menu offers ปรับการ์ด", async () => {
    await open_();
    fireEvent.click(screen.getByRole("button", { name: /เรียงตาม ส่งงาน/ }));
    fireEvent.click(await screen.findByRole("button", { name: "มาเรียน" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.textContent).toContain("เรียงตาม มาเรียน น้อยไปมาก");
    fireEvent.click(screen.getByRole("button", { name: "เมนูเพิ่มเติม" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByRole("button", { name: /ปรับการ์ด/ })).toBeTruthy();
  });
});

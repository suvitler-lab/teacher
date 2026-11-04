// ui-redesign round 3 (reports): sortable headers, the cards (chosen by the teacher), the drawer that follows the page's
// own numbers, the A4 preview, and the TV view (class totals only, never a name or a score).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));

import { ReportsPage } from "@client/pages/Reports";
import { assignments, classes, currentTermId, selectedTermId, settings, students, subjects, terms } from "@client/store";
import { projectorOn } from "@client/lib/projector";
import type { ReportPayload } from "@client/lib/report";
import { sortStudents, nextSort, scoreBuckets, attendanceMix, projectorWorkRows } from "@client/components/reports/ReportParts";
import { computeReport } from "@client/lib/report";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";

const kid = (n: number, first: string): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: first, last_name: "สมมติ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const work = (id: string, title: string, due: string): Assignment => ({
  id, title, term_id: "t1", subject_id: "math", type_id: null, unit: null, full_score: 10, assigned_date: "2020-01-01", due_date: due,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});
const A = work("a1", "ใบงานหนึ่ง", "2020-01-05"), B = work("a2", "ใบงานสอง", "2020-01-06");
const sub = (aid: string, sid: string, score: number) => ({ assignment_id: aid, student_id: sid, status: "submitted", score, late: false });

function payload(): ReportPayload {
  return {
    classId: "c1", range: { from: "2026-05-01", to: "2026-10-31", month: null, termId: "t1", att: "daily" },
    students: [kid(1, "กนก"), kid(2, "ขวัญ"), kid(3, "คเณศ")],
    assignments: [A, B],
    // กนก handed in both (9, 8) · ขวัญ one (5) · คเณศ none (both overdue = missing)
    submissions: [sub("a1", "s1", 9), sub("a2", "s1", 8), sub("a1", "s2", 5)],
    attendanceSessions: [{ id: "d1", date: "2026-10-01" }, { id: "d2", date: "2026-10-02" }],
    attendance: [
      { session_id: "d1", student_id: "s1", status: "present" }, { session_id: "d2", student_id: "s1", status: "present" },
      { session_id: "d1", student_id: "s2", status: "present" }, { session_id: "d2", student_id: "s2", status: "absent" },
      { session_id: "d1", student_id: "s3", status: "sick" },
    ],
  };
}
const baseSettings = (over: Record<string, string> = {}) => ({
  school_name: "โรงเรียนสมมติ", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
}) as never;

beforeEach(() => {
  get.mockReset(); get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : payload()));
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-01", end_date: "2026-10-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 }];
  students.value = payload().students; assignments.value = [A, B];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  settings.value = baseSettings(); projectorOn.value = false;
});

describe("pure helpers", () => {
  const model = () => computeReport(payload());
  it("sorts by the column and flips on the second tap", () => {
    const m = model();
    expect(sortStudents(m.students, { key: "submit", dir: "asc" }).map((s) => s.student.number)).toEqual([3, 2, 1]);
    expect(sortStudents(m.students, { key: "submit", dir: "desc" }).map((s) => s.student.number)).toEqual([1, 2, 3]);
    expect(nextSort({ key: "submit", dir: "asc" }, "submit")).toEqual({ key: "submit", dir: "desc" });
    expect(nextSort({ key: "submit", dir: "desc" }, "score")).toEqual({ key: "score", dir: "asc" });
  });
  it("buckets the running score and adds the attendance up", () => {
    const m = model();
    expect(scoreBuckets(m.students).reduce((a, b) => a + b, 0)).toBe(3);
    expect(attendanceMix(m)).toEqual({ present: 3, late: 0, leave: 0, sick: 1, absent: 1 });
  });
  it("the TV shows the latest due work first, up to 2N (N = 4, or 3 at the biggest text); beyond that 'and k more' takes one place", () => {
    const w = (i: number) => ({ assignment: { due_date: `2026-10-${String(i + 1).padStart(2, "0")}`, assigned_date: null } });
    const list = Array.from({ length: 11 }, (_, i) => w(i));
    const small = projectorWorkRows(list, 1);
    expect(small.shown.length).toBe(6); // 2N = 8, minus the "and k more" line = 6
    expect(small.more).toBe(5);
    expect(small.shown[0].assignment.due_date).toBe("2026-10-11"); // the latest due day first
    expect(projectorWorkRows(list, 3)).toMatchObject({ more: 7 });
    expect(projectorWorkRows(list.slice(0, 8), 1)).toMatchObject({ more: 0 }); // fits exactly: no line
  });
});

describe("reports page", () => {
  it("headers are buttons with aria-sort; a second tap reverses; names are buttons that open the drawer", async () => {
    render(<ReportsPage />);
    const table = await screen.findByRole("table");
    const head = () => within(table).getAllByRole("columnheader");
    const submitTh = () => head().find((h) => h.textContent?.includes("ส่ง"))!;
    expect(submitTh().getAttribute("aria-sort")).toBe("ascending");
    const first = () => within(table).getAllByRole("row")[1].textContent;
    expect(first()).toContain("คเณศ"); // the one who needs a look comes first
    fireEvent.click(within(submitTh()).getByRole("button"));
    expect(submitTh().getAttribute("aria-sort")).toBe("descending");
    expect(first()).toContain("กนก");
    expect(within(table).getByRole("button", { name: "ดูข้อมูล ขวัญ สมมติ" })).toBeTruthy();
  });

  it("shows the default cards; the teacher can turn one off; 'ดูทั้งหมด' appears only when more than 5 need follow-up", async () => {
    settings.value = baseSettings({ reports_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("reports"), "att")) });
    render(<ReportsPage />);
    expect(await screen.findByText("อัตราการส่งรายงาน")).toBeTruthy();
    expect(screen.getByText(/ต้องติดตาม \(2 คน\)/)).toBeTruthy();
    expect(screen.queryByText("การกระจายคะแนนสะสม")).toBeNull(); // off by default
    expect(screen.queryByText(/^การมาเรียน/)).toBeNull(); // turned off
    expect(screen.queryByText(/ดูทั้งหมด \(/)).toBeNull();
  });

  it("the 'มาเรียน' number opens attendance, the 'งานค้าง' number scrolls to the follow-up card", async () => {
    const scroll = vi.fn(); (Element.prototype as any).scrollIntoView = scroll;
    render(<ReportsPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByText("งานค้าง").closest("button, [role=button], .uc-stat") as HTMLElement);
    expect(scroll).toHaveBeenCalled();
    fireEvent.click(screen.getByText("มาเรียน").closest("button, [role=button], .uc-stat") as HTMLElement);
    expect(location.hash).toContain("/attendance");
  });

  it("a work row opens that work in the gradebook", async () => {
    render(<ReportsPage />);
    const row = await screen.findByRole("button", { name: /ใบงานหนึ่ง.*เปิดในสมุดคะแนน/ });
    fireEvent.click(row);
    expect(location.hash).toContain("/gradebook");
    expect(location.hash).toContain("asg=a1");
  });

  it("the drawer uses the page's own numbers (no second report request) and names its scope", async () => {
    render(<ReportsPage />);
    await screen.findByRole("table");
    const calls = get.mock.calls.filter((c) => String(c[0]).startsWith("/api/reports/summary")).length;
    fireEvent.input(screen.getByLabelText("วิชาของรายงาน"), { target: { value: "math" } });
    await waitFor(() => expect(get.mock.calls.filter((c) => String(c[0]).startsWith("/api/reports/summary")).length).toBe(calls + 1));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); // the new numbers have landed (the drawer then has the page's own)
    fireEvent.click(within(await screen.findByRole("table")).getByRole("button", { name: "ดูข้อมูล กนก สมมติ" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText(/คณิตศาสตร์/)).toBeTruthy();
    expect(within(d).getByRole("button", { name: "ดูทั้งเทอม" })).toBeTruthy();
    await act(async () => { await Promise.resolve(); });
    expect(get.mock.calls.filter((c) => String(c[0]).startsWith("/api/reports/summary")).length).toBe(calls + 1); // the drawer asked for nothing
  });
});

describe("A4 preview", () => {
  it("opens from พิมพ์ with the summary and the people table, and 'สรุปอย่างเดียว' drops the people", async () => {
    render(<ReportsPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /พิมพ์/ }));
    const sheet = await screen.findByLabelText("ตัวอย่างหน้า A4");
    expect(within(sheet).getByText(/รายงานสรุป ป.6\/1/)).toBeTruthy();
    expect(within(sheet).getByText("รายบุคคล")).toBeTruthy();
    expect(sheet.textContent).toContain("โรงเรียนสมมติ");
    fireEvent.click(screen.getByLabelText(/สรุปอย่างเดียว/));
    expect(within(sheet).queryByText("รายบุคคล")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /กลับ/ }));
    expect(screen.queryByLabelText("ตัวอย่างหน้า A4")).toBeNull();
  });
});

describe("TV view: the page behind", () => {
  it("everything outside the TV view is inert while it shows, and free again after", async () => {
    const outside = document.createElement("button"); outside.textContent = "behind"; document.body.appendChild(outside);
    projectorOn.value = true;
    const { unmount } = render(<ReportsPage />);
    await waitFor(() => expect(document.querySelector(".pj")).toBeTruthy());
    await waitFor(() => expect(outside.hasAttribute("inert")).toBe(true));
    expect(outside.getAttribute("aria-hidden")).toBe("true");
    unmount();
    expect(outside.hasAttribute("inert")).toBe(false);
    outside.remove();
  });
});

describe("TV view", () => {
  it("shows class totals and the works, and never a child's name or score", async () => {
    projectorOn.value = true;
    render(<ReportsPage />);
    const pj = await waitFor(() => { const e = document.querySelector(".pj"); expect(e).toBeTruthy(); return e as HTMLElement; });
    expect(pj.textContent).toContain("ป.6/1");
    expect(pj.textContent).toContain("ใบงานหนึ่ง");
    expect(pj.textContent).toMatch(/ส่งแล้ว \d+ จาก 3/);
    for (const name of ["กนก", "ขวัญ", "คเณศ"]) expect(pj.textContent).not.toContain(name);
    expect(pj.textContent).not.toMatch(/\b\d+\/10\b/);
    expect(pj.textContent).not.toContain("ต้องติดตาม");
  });
});

describe("reports page: round 3 fixes", () => {
  it("picking another class closes an open drawer", async () => {
    classes.value = [...classes.value, { id: "c2", name: "ป.6/2", grade: "ป.6", sort: 2, year: 2569, archived: false, updated_at: 0 }];
    render(<ReportsPage />);
    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: "ดูข้อมูล กนก สมมติ" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("tab", { name: /ป.6\/2/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the print preview leaves out a card the teacher turned off, and always prints the people", async () => {
    settings.value = baseSettings({ reports_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("reports"), "works")) });
    render(<ReportsPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /พิมพ์/ }));
    const sheet = await screen.findByLabelText("ตัวอย่างหน้า A4");
    expect(within(sheet).queryByText("อัตราการส่งรายงาน")).toBeNull();
    expect(within(sheet).getByText("รายบุคคล")).toBeTruthy();
  });

  it("the attendance bar says its numbers aloud, and sorting is announced", async () => {
    render(<ReportsPage />);
    const table = await screen.findByRole("table");
    expect(document.querySelector('[role="img"][aria-label^="มา "]')).toBeTruthy();
    fireEvent.click(within(within(table).getAllByRole("columnheader").find((h) => h.textContent?.includes("ส่ง"))!).getByRole("button"));
    expect(document.body.textContent).toContain("เรียงตาม ส่งงาน มากไปน้อย");
  });
});

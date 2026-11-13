// T-49: the report page's numbers (BR-37..BR-43) against the hand-worked F-R8 example, and the new states (BR-38 "—", BR-39 "เก็บอยู่",
// BR-40 awaiting, BR-41 often-absent card). Each expected number is the SA's hand calculation, not read back from the code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));

import { ReportsPage } from "@client/pages/Reports";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, assignments } from "@client/store";
import { computeReport, type ReportPayload } from "@client/lib/report";
import { showsRate, submitRateView, avgScoreView, workRateView, workAverageView, workRows, frequentAbsent, unassignedCount, nameOf } from "@client/lib/reportView";
import { setHide } from "@client/lib/hideNames";
import { projectorOn } from "@client/lib/projector";
import { defaultPageLayout } from "@client/lib/pageCards";
import { sortStudents } from "@client/components/reports/ReportParts";

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

describe("BR-37 numbers of F-R8 (hand-worked)", () => {
  const m = () => computeReport(payloadR8());
  it("per child: submitted n/m · running score % (rounded after ×100) · attendance %", () => {
    const want: Record<number, [string, number, number]> = { 5: ["1/3", 30, 75], 8: ["1/3", 27, 75], 1: ["4/4", 89, 100], 2: ["4/4", 97, 95], 3: ["3/3", 74, 90], 4: ["3/3", 72, 95], 6: ["4/4", 90, 100], 7: ["3/3", 84, 90] };
    for (const s of m().students) {
      const [frac, score, att] = want[s.student.number!];
      expect(`${s.submitted}/${s.applicable}`).toBe(frac);
      expect(Math.round((s.score * 100) / s.fullScore)).toBe(score);
      expect(Math.round(((s.attendance.present + s.attendance.late) * 100) / s.attendance.daysMarked)).toBe(att);
    }
  });
  it("hero: 85% · 4 pieces / 2 people · 71% · 90% · awaiting 4 · pending 4 · absent total 7", () => {
    const r = m();
    expect(submitRateView(r)).toBe(85);
    expect(r.metrics.missingCount).toBe(4);
    expect(r.followUp.length).toBe(2);
    expect(avgScoreView(r)).toBe(71);
    expect(r.metrics.attendanceRate).toBe(90);
    expect(r.totals).toMatchObject({ submitted: 23, applicable: 27, pending: 4, awaiting: 4, fullScore: 295 });
    expect(r.attendance.marks).toBe(160);
    expect(r.students.reduce((n, s) => n + s.attendance.absent, 0)).toBe(7);
  });
  it("BR-40: awaiting counts per work 1·2·1·0, and checking one (ปวีณ W2 = 18) makes it 3 and the average 72%", () => {
    const r = m();
    expect(r.students.find((s) => s.student.number === 6)!.awaiting).toBe(2);
    const p = payloadR8(); p.submissions = p.submissions.map((x) => (x.assignment_id === "w2" && x.student_id === "s6" ? { ...x, score: 18 } : x));
    const r2 = computeReport(p);
    expect(r2.totals.awaiting).toBe(3);
    expect(avgScoreView(r2)).toBe(72); // 226 ÷ 315 = 71.75
    expect(submitRateView(r2)).toBe(85);
  });
  it("BR-39: per work 71% / 75% … average 86 · 83 · 83 · 75 and checked n/m; the rate is shown only when final (D42)", () => {
    const r = m();
    const by = Object.fromEntries(r.assignments.map((a) => [a.assignment.id, a]));
    expect([by.w1.submitted, by.w1.total - by.w1.excused, workRateView(by.w1)]).toEqual([5, 7, 71]);
    expect([by.w1, by.w2, by.w3, by.w4].map((a) => workAverageView(a))).toEqual([86, 83, 83, 75]);
    expect([by.w1, by.w2, by.w3, by.w4].map((a) => `${a.scoredCount}/${a.submitted}`)).toEqual(["4/5", "4/6", "5/6", "6/6"]);
    expect([W1, W2, W3, W4].map((a) => showsRate(a, "2026-11-11"))).toEqual([true, false, false, true]); // W2 due today, W3 no due date, W4 closed
    expect(showsRate(asg("w7", "x", 10, null, "2026-11-15", "closed"), "2026-11-11")).toBe(true); // closed before its due date still shows the rate
    expect(workRows(r.assignments).map((a) => a.assignment.id)).toEqual(["w4", "w3", "w2", "w1"]);
  });
  it("BR-41: absent ≥ 3 only (sick/leave/late do not count): กานดา then ธีรา, ภูมิ (absent 1) out; the edge 2 / 3", () => {
    const r = m();
    const list = frequentAbsent(r.students);
    expect(list.map((x) => [x.s.student.number, x.absent, x.att])).toEqual([[5, 3, 75], [8, 3, 75]]);
    const edge = (n: number) => frequentAbsent([{ ...r.students[0], attendance: { present: 10, late: 0, leave: 0, sick: 5, absent: n, daysMarked: 15 + n } }]).length;
    expect([edge(2), edge(3)]).toEqual([0, 1]);
  });
  it("the default order of the table: ส่งงาน น้อย→มาก then number = 5 · 8 · 1 · 2 · 3 · 4 · 6 · 7", () => {
    expect(sortStudents(m().students, { key: "submit", dir: "asc" }).map((s) => s.student.number)).toEqual([5, 8, 1, 2, 3, 4, 6, 7]);
  });
});

describe("BR-38 '—' where there is no denominator", () => {
  const only = (asgs: Assignment[], subs: ReportPayload["submissions"]) => computeReport(payloadR8({ assignments: asgs, submissions: subs }));
  const W5 = asg("w5", "งานใหม่", 10, "2026-11-05", null);
  it("(1) one open task with no due date, nobody handed in → '—', but the old model still says 0", () => {
    const r = only([W5], []);
    expect(r.metrics.submitRate).toBe(0); // the model is not changed
    expect(submitRateView(r)).toBeNull();
    expect(avgScoreView(r)).toBeNull();
    expect(workAverageView(r.assignments[0])).toBeNull();
  });
  it("(2) closed, nobody handed in, 8 children → a real '0%'", () => {
    const r = only([asg("w1", "ปิดแล้ว", 10, "2026-11-01", null, "closed")], []);
    expect(submitRateView(r)).toBe(0);
    expect(workRateView(r.assignments[0])).toBe(0);
  });
  it("(3) everyone excused → the work's rate is '—'; (4) no work → both '—'", () => {
    const r = only([W5], NAMES.map(([n]) => ({ assignment_id: "w5", student_id: "s" + n, status: "excused", score: null, late: false })));
    expect(workRateView(r.assignments[0])).toBeNull();
    const none = only([], []);
    expect([submitRateView(none), avgScoreView(none)]).toEqual([null, null]);
  });
  it("(5) the BR-37 data has no '—' on the hero", async () => {
    render(<ReportsPage />);
    const hero = await screen.findByRole("region", { name: "สรุปรายงาน" });
    expect(hero.textContent).not.toContain("—");
  });
});

describe("the page", () => {
  it("hero shows 85% / 4 ชิ้น · 2 คน / 71% + รอตรวจ 4 / 90% with the BR-37 captions", async () => {
    render(<ReportsPage />);
    const hero = await screen.findByRole("region", { name: "สรุปรายงาน" });
    const t = hero.textContent!;
    expect(t).toContain("85%"); expect(t).toContain("ส่งแล้ว 23 จาก 27 ที่ถึงกำหนด · ยังไม่ถึงกำหนด 4");
    expect(t).toContain("นักเรียน 2 คน"); expect(t).toContain("71%"); expect(t).toContain("คะแนนสะสม · ค้างส่งนับ 0 · รอตรวจ 4 ชิ้น");
    expect(t).toContain("90%"); expect(t).toContain("จาก 20 วัน · ขาดรวม 7 ครั้ง");
    // the divisor words ride in the title and in the accessible name of the focusable tile
    expect(within(hero).getByRole("group", { name: /อัตราส่งงาน 85 เปอร์เซ็นต์.*ตัวส่วน = ส่งแล้ว \+ ค้างส่ง/ })).toBeTruthy();
  });
  it("DOM order: hero → tools → table → cards (one order)", async () => {
    render(<ReportsPage />);
    const hero = await screen.findByRole("region", { name: "สรุปรายงาน" });
    const table = await screen.findByRole("table");
    const cards = document.querySelector(".pg-aside")!;
    expect(hero.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("the table rows 30% · 75% and the arrow words; the open row is aria-current; Esc-style close returns focus to the name", async () => {
    render(<ReportsPage />);
    const btn = await screen.findByRole("button", { name: "ดูข้อมูล กานดา เพชรดี" });
    const row = btn.closest("tr")!;
    expect(row.textContent).toContain("1/3"); expect(row.textContent).toContain("30%"); expect(row.textContent).toContain("75%");
    expect(within(row).getByRole("img", { name: "ค้าง 2 งาน" })).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => expect(row.getAttribute("aria-current")).toBe("true"));
  });
  it("the often-absent card is on by default (BR-41) and lists กานดา and ธีรา only, with the rule line", async () => {
    expect(defaultPageLayout("reports").hidden).not.toContain("absent");
    render(<ReportsPage />);
    const card = (await screen.findByRole("heading", { name: /ขาดบ่อย \(ขาด ≥ 3 ครั้ง\)/ })).closest("section")!;
    expect(card.textContent).toContain("กานดา เพชรดี"); expect(card.textContent).toContain("มาเรียน 75%"); expect(card.textContent).toContain("ขาด 3 ครั้ง");
    expect(card.textContent).toContain("ธีรา จันทร์เพ็ญ"); expect(card.textContent).not.toContain("ภูมิ");
    expect(card.textContent).toContain("เกณฑ์: ขาด ≥ 3 ครั้งในช่วงนี้");
  });
  it("the work row says 'เก็บอยู่' for W2/W3, 71% for W1, and the average with checked n/m", async () => {
    render(<ReportsPage />);
    const w1 = await screen.findByRole("button", { name: /ใบงานที่ 4 · .* ส่งแล้ว 5 จาก 7 · 71% · ยกเว้น 1 · เฉลี่ย 86% ตรวจแล้ว 4\/5 · แตะเพื่อเปิดในสมุดคะแนน/ });
    expect(w1.textContent).toContain("5/7 · ยกเว้น 1"); expect(w1.textContent).toContain("เฉลี่ย 86% · ตรวจ 4/5");
    const w2 = screen.getByRole("button", { name: /แบบฝึกหัด 3.2/ });
    expect(w2.textContent).toContain("เก็บอยู่"); expect(w2.textContent).not.toContain("71%");
  });
  it("hide names: the table and the follow-up say 'เลขที่ N'; copy to LINE and the often-absent card are closed", async () => {
    setHide("reports", true);
    render(<ReportsPage />);
    expect(await screen.findByRole("button", { name: "ดูข้อมูล เลขที่ 5" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /คัดลอกไป LINE/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("ปิดอยู่ตอนซ่อนชื่อ (การ์ดนี้เป็นรายชื่อ)")).toBeTruthy();
    expect(document.body.textContent).not.toContain("กานดา");
    expect(nameOf({ number: null }, "x", true)).toBe("เลขที่ –");
  });
  it("a month adds the 'รวมงานที่ไม่ระบุวันมอบ n งาน' note only when n ≥ 1", () => {
    const p = payloadR8({ assignments: [W1, asg("w5", "ไม่มีวันมอบ", 10, null, null)] });
    expect(unassignedCount(p, true)).toBe(1); expect(unassignedCount(p, false)).toBe(0); expect(unassignedCount(payloadR8(), true)).toBe(0);
  });
  it("no work in the range: hero '—' + 'ยังไม่มีงานในช่วงนี้' and the table still lists the children", async () => {
    get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : payloadR8({ assignments: [], submissions: [] })));
    render(<ReportsPage />);
    const hero = await screen.findByRole("region", { name: "สรุปรายงาน" });
    expect(hero.textContent).toContain("ยังไม่มีงานในช่วงนี้"); expect(hero.textContent).toContain("ยังไม่มีคะแนนในช่วงนี้");
    expect(hero.textContent).not.toMatch(/(^|\D)0%/);
    expect((await screen.findAllByRole("row")).length).toBe(9);
  });
  it("loading: skeleton with 'กำลังโหลดรายงาน…' and no hero numbers before the data", async () => {
    let release: (v: unknown) => void = () => {};
    get.mockImplementation((p: string) => (p.startsWith("/api/audit") ? Promise.resolve({ rows: [] }) : new Promise((res) => { release = res; })));
    render(<ReportsPage />);
    expect(await screen.findByText("กำลังโหลดรายงาน…")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "สรุปรายงาน" })).toBeNull();
    release(payloadR8());
    expect(await screen.findByRole("region", { name: "สรุปรายงาน" })).toBeTruthy();
  });
});

describe("review round (R-4901..R-4904)", () => {
  it("R-4901: after tapping 'งานค้าง', changing the class does not scroll/focus the follow card again", async () => {
    classes.value = [...classes.value, { id: "c2", name: "ป.6/2", grade: "ป.6", sort: 2, year: 2569, archived: false, updated_at: 0 }];
    const scroll = vi.fn(); (Element.prototype as any).scrollIntoView = scroll;
    render(<ReportsPage />);
    const hero = await screen.findByRole("region", { name: "สรุปรายงาน" });
    fireEvent.click(within(hero).getByRole("button", { name: /งานค้าง/ }));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("tab", { name: /ป.6\/2/ }));
    await waitFor(() => expect(get.mock.calls.some((c) => String(c[0]).includes("class=c2"))).toBe(true));
    await screen.findByRole("region", { name: "สรุปรายงาน" });
    await new Promise((r) => setTimeout(r, 30));
    expect(scroll).toHaveBeenCalledTimes(1);
  });
  it("R-4902: a closed work excused for everyone reads the same on screen and to a screen reader (no 'เก็บอยู่')", async () => {
    const W6 = asg("w6", "ยกเว้นทั้งห้อง", 10, "2026-11-05", null, "closed");
    get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : payloadR8({ assignments: [W6], submissions: NAMES.map(([n]) => ({ assignment_id: "w6", student_id: "s" + n, status: "excused", score: null, late: false })) })));
    render(<ReportsPage />);
    const row = await screen.findByRole("button", { name: /ยกเว้นทั้งห้อง/ });
    expect(row.getAttribute("aria-label")).not.toContain("เก็บอยู่");
    expect(row.querySelector(".pct")!.textContent).toBe("—");
  });
  it("R-4903: reload / print / projector / Excel come after the hero in the DOM", async () => {
    render(<ReportsPage />);
    const hero = await screen.findByRole("region", { name: "สรุปรายงาน" });
    for (const name of ["ส่งออก Excel", "พิมพ์", "โหลดใหม่"]) {
      const b = screen.getByRole("button", { name });
      expect(hero.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it("R-4904: aria-busy is on the skeleton only, never on the page root that holds the status boxes", async () => {
    let release: (v: unknown) => void = () => {};
    get.mockImplementation((p: string) => (p.startsWith("/api/audit") ? Promise.resolve({ rows: [] }) : new Promise((res) => { release = res; })));
    render(<ReportsPage />);
    await screen.findByText("กำลังโหลดรายงาน…");
    expect(document.querySelector(".rp-page")!.getAttribute("aria-busy")).toBeNull();
    expect(document.querySelector(".rp-skel")!.getAttribute("aria-busy")).toBe("true");
    release(payloadR8());
    await screen.findByRole("region", { name: "สรุปรายงาน" });
  });
});


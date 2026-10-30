// QA M1-05 (black-box against BR-05): expected values were worked out by hand BEFORE reading the
// implementation — see docs/team/jobs/2026-10-30-m1-05-metrics-single-source/evidence/expected-from-br.md (E-xx).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { render, screen, waitFor } from "@testing-library/preact";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: () => null }));

import {
  assignmentProgress, assignmentRate, attendancePercent, attendanceRate, classSubmitRate,
  countWorkStates, percentOf, roundPercent, scorePercent, studentSummary, workState,
} from "@shared/metrics";
import { bkkToday } from "@shared/time";
import { bkkToday as workerBkkToday } from "../../worker/lib/time";
import { computeReport, type ReportPayload } from "@client/lib/report";
import { buildWorkbookBuffer } from "@client/lib/excel";
import { GradebookPage } from "@client/pages/Gradebook";
import { ReportsPage } from "@client/pages/Reports";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { route } from "@client/router";
import { AC01_KIDS, AC01_SUBS, FUTURE_DUE, PAST_DUE, asg, kid } from "./m1-05-fixture";

const TODAY = "2026-10-30";
const sub = (aid: string, sid: string, status: string, score: number | null, late = false) =>
  ({ assignment_id: aid, student_id: sid, status, score, late, updated_at: 1 });
const kids = (n: number) => Array.from({ length: n }, (_, i) => kid(i));
const payload = (over: Partial<ReportPayload>): ReportPayload => ({
  classId: "c1", range: { from: null, to: null, month: null, termId: "t1", att: "daily" },
  students: [], assignments: [], submissions: [], attendanceSessions: [], attendance: [], ...over,
});
const xlsOpts = { className: "ป.6/1", subjectName: "คณิต", periodLabel: "1/2569", workTypeName: () => "-", fullName: (s: any) => s.first_name };
async function sheet(p: ReportPayload, name: string): Promise<any[][]> {
  const buf = await buildWorkbookBuffer(computeReport(p), p, xlsOpts);
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const rows: any[][] = [];
  wb.getWorksheet(name).eachRow((r: any) => rows.push((r.values as any[]).slice(1)));
  return rows;
}
const subMap = (subs: ReturnType<typeof sub>[]) => new Map(subs.map((s) => [s.student_id, s]));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
});

describe("BR-05 edge cases through the shared functions", () => {
  it("E-01 every child excused: per-assignment rate 0 ÷ 0 is 0%, never NaN", () => {
    const a = asg("a1", PAST_DUE);
    const subs = kids(4).map((k) => sub("a1", k.id, "excused", null));
    const prog = assignmentProgress(a, kids(4), subMap(subs), TODAY);
    expect(prog).toMatchObject({ total: 4, excused: 4, submitted: 0, missing: 0, rate: 0 });
    expect(assignmentRate({ submitted: 0, total: 4, excused: 4 })).toBe(0);
    expect(countWorkStates(["excused", "excused"]).counted).toBe(0);
    const m = computeReport(payload({ students: kids(4), assignments: [a], submissions: subs as any }));
    expect(m.assignments[0].rate).toBe(0);
    expect(Number.isFinite(m.metrics.submitRate)).toBe(true);
  });

  it("E-02 / E-14 per-child rate ignores not-yet-due work (0 ÷ 0 → 0, early hand-in → 100%)", () => {
    const future = [asg("f1", FUTURE_DUE), asg("f2", FUTURE_DUE), asg("f3", FUTURE_DUE)];
    const none = studentSummary(future, () => undefined, TODAY);
    expect(none).toMatchObject({ submitted: 0, missing: 0, pending: 3, submitRate: 0 });
    const early = studentSummary(future, (i) => (i === 0 ? sub("f1", "s0", "submitted", 9) : undefined), TODAY);
    expect(early).toMatchObject({ submitted: 1, missing: 0, pending: 2, submitRate: 100 });
    // the report row uses the very same numbers
    const m = computeReport(payload({ students: [kid(0)], assignments: future, submissions: [sub("f1", "s0", "submitted", 9)] as any }));
    expect(m.students[0]).toMatchObject({ submitted: 1, applicable: 1, pending: 2, percent: 100 });
  });

  it("E-03 / E-04 / E-11 an exact .5 rounds up once (Math.round)", () => {
    expect(roundPercent(12.5)).toBe(13);
    expect(assignmentRate({ submitted: 1, total: 10, excused: 2 })).toBe(13); // 1 ÷ 8 = 12.5
    expect(assignmentRate({ submitted: 5, total: 8, excused: 0 })).toBe(63);  // 62.5
    expect(attendancePercent({ present: 1, late: 0, leave: 0, sick: 0, absent: 7 })).toBe(13);
    expect(percentOf(3, 8)).toBe(38);
  });

  // B-01 (fixed, AC-10): a true x.5 must not land on x.49999… and round down.
  it("B-01 true 57.5% must show 58% (23 of 40 children, 57.5 of 100 points)", () => {
    expect(assignmentRate({ submitted: 23, total: 40, excused: 0 })).toBe(58);
    expect(attendancePercent({ present: 23, late: 0, leave: 0, sick: 0, absent: 17 })).toBe(58);
    expect(scorePercent(57.5, 100)).toBe(58);
    expect(percentOf(29, 200)).toBe(15); // 14.5
  });

  it("E-05 whole-class rate is pooled, not a mean of each child's %", () => {
    expect(classSubmitRate([{ submitted: 2, missing: 1 }, { submitted: 0, missing: 3 }])).toBe(33);
    const A = [asg("p1", PAST_DUE), asg("p2", PAST_DUE), asg("p3", PAST_DUE)];
    const m = computeReport(payload({
      students: [kid(0), kid(1)], assignments: A,
      submissions: [sub("p1", "s0", "submitted", 8), sub("p2", "s0", "submitted", null)] as any,
    }));
    expect(m.students.map((s) => s.percent)).toEqual([67, 0]);
    expect(m.metrics.submitRate).toBe(33);
  });

  it("E-08 / E-13 late without a score is awaiting; void follows the due date", () => {
    const past = asg("x", PAST_DUE), fut = asg("y", FUTURE_DUE);
    expect(workState({ status: "submitted", score: null, late: true }, past, TODAY)).toBe("awaiting");
    expect(workState({ status: "submitted", score: 7, late: 1 }, past, TODAY)).toBe("late");
    expect(workState({ status: "void", score: null }, past, TODAY)).toBe("missing");
    expect(workState({ status: "void", score: null }, fut, TODAY)).toBe("pending");
    expect(countWorkStates(["awaiting", "late", "scored", "missing", "excused"])).toMatchObject({ submitted: 3, counted: 4 });
  });

  it("E-09 / E-10 attendance: nothing checked is no data; checked-but-away is 0%", async () => {
    const z = { present: 0, late: 0, leave: 0, sick: 0, absent: 0 };
    expect(attendancePercent(z)).toBeNull();
    expect(attendanceRate(z)).toBe(0); // legacy number-only form; screens must use attendancePercent
    expect(attendancePercent({ ...z, leave: 1, sick: 1 })).toBe(0);
    const p = payload({
      students: [kid(0), kid(1)],
      attendanceSessions: [{ id: "d1", date: "2026-09-01" }, { id: "d2", date: "2026-09-02" }],
      attendance: [{ session_id: "d1", student_id: "s0", status: "leave" }, { session_id: "d2", student_id: "s0", status: "sick" }],
    });
    expect(computeReport(p).metrics.attendanceRate).toBe(0);
    expect(computeReport(payload({ students: [kid(0)] })).metrics.attendanceRate).toBeNull();
    const rows = await sheet(p, "เช็คชื่อรายวัน");
    expect(rows[1].at(-1)).toBe("0%"); // s0 checked twice, away both times
    expect(rows[2].at(-1)).toBe("—");  // s1 never checked
  }, 15_000);

  it("E-12 accumulated score counts overdue as 0 and leaves awaiting out", () => {
    const A = [asg("g1", PAST_DUE), asg("g2", PAST_DUE), asg("g3", PAST_DUE)];
    const subs = [sub("g1", "s0", "submitted", 8), sub("g3", "s0", "submitted", null)];
    const s = studentSummary(A, (i) => subs.find((x) => x.assignment_id === A[i].id), TODAY);
    expect(s).toMatchObject({ score: 8, fullScore: 20, scorePercent: 40, submitted: 2, missing: 1 });
    // graded-only average of that one piece of work is 8 ÷ 10 = 80%
    expect(assignmentProgress(A[0], [kid(0)], subMap([subs[0]]), TODAY).average).toBe(80);
    // the Reports card "คะแนนเฉลี่ย" (hint: เฉพาะงานที่ตรวจแล้ว) shows the ACCUMULATED 40%, see B-04
    expect(computeReport(payload({ students: [kid(0)], assignments: A, submissions: subs as any })).metrics.avgScorePercent).toBe(40);
  });

  // B-05 (fixed): studentSummary counts awaiting work.
  it("B-05 studentSummary.awaiting counts handed-in work without a score", () => {
    const A = [asg("g1", PAST_DUE), asg("g3", PAST_DUE)];
    const s = studentSummary(A, (i) => (i === 1 ? sub("g3", "s0", "submitted", null) : undefined), TODAY);
    expect(s.awaiting).toBe(1);
  });

  it("AC-06 one Bangkok 'today' at 23:30 and 00:30, shared by worker and pages", () => {
    expect(bkkToday(Date.UTC(2026, 9, 30, 16, 30))).toBe("2026-10-30"); // 23:30 Bangkok
    expect(bkkToday(Date.UTC(2026, 9, 30, 17, 30))).toBe("2026-10-31"); // 00:30 Bangkok next day
    expect(bkkToday(Date.UTC(2026, 11, 31, 17, 0))).toBe("2027-01-01");  // year rollover
    expect(workerBkkToday).toBe(bkkToday);
  });
});

describe("same data → same number on Gradebook, Reports, report model and Excel", () => {
  // E-03 data: 10 children, past due, 1 scored, 2 excused, 7 nothing → 1 ÷ 8 = 12.5 → 13%
  const A1 = asg("a1", PAST_DUE, "ใบงาน");
  const SUBS = [sub("a1", "s0", "submitted", 8), sub("a1", "s1", "excused", null), sub("a1", "s2", "excused", null)];
  const P = () => payload({ students: kids(10), assignments: [A1], submissions: SUBS as any });

  it("E-03 with excused children: 13% on every screen", async () => {
    expect(computeReport(P()).assignments[0].rate).toBe(13);
    expect(assignmentProgress(A1, kids(10), subMap(SUBS), TODAY).rate).toBe(13);
    const s4 = await sheet(P(), "ภาพรวมห้อง");
    expect(s4[1][4]).toBe("13%");

    route.value = "/gradebook?class=c1&subject=math";
    students.value = kids(10);
    assignments.value = [A1];
    get.mockResolvedValue({ students: kids(10), assignments: [A1], submissions: SUBS });
    const gb = render(h(GradebookPage, {}));
    await screen.findByRole("columnheader", { name: /ใบงาน/ });
    await waitFor(() => expect((document.querySelector("th .hbar > div") as HTMLElement).style.width).toBe("13%"));
    expect(document.body.textContent).toContain("อัตราส่ง 13%"); // toolbar: 1 ÷ (1 + 7 overdue)
    const gbFraction = document.querySelector("tr.avg .muted")?.textContent ?? "(none)";
    gb.unmount();

    get.mockResolvedValue(P());
    render(h(ReportsPage, {}));
    const lbl = await screen.findByText("ใบงาน", { selector: ".lbl" });
    expect(lbl.parentElement!.querySelector(".pct")!.textContent).toBe("13%");
    // B-02 observation: the count next to the % still divides by the whole class (excused included)
    console.log(`[B-02] Reports "${lbl.parentElement!.querySelector(".num")!.textContent}" · Excel "${s4[1][3]}" · Gradebook "${gbFraction}" next to 13% (= 1/8)`);
  }, 20_000);

  it("E-06 / E-07 Reports score buckets use the rounded %: 59.5 → 60–69, 59 → 50–59", async () => {
    const B = { ...asg("b1", PAST_DUE, "สอบ"), full_score: 100 };
    get.mockResolvedValue(payload({
      students: [kid(0), kid(1)], assignments: [B],
      submissions: [sub("b1", "s0", "submitted", 59.5), sub("b1", "s1", "submitted", 59)] as any,
    }));
    render(h(ReportsPage, {}));
    await screen.findByText(/เด็ก0/, { selector: "td" });
    const n = [...document.querySelectorAll(".rp-hist .col .n")].map((e) => e.textContent);
    expect(n).toEqual(["0", "1", "1", "0", "0"]);
    expect(screen.getByText(/เด็ก0/, { selector: "td" }).closest("tr")!.textContent).toContain("60%");
    expect(screen.getByText(/เด็ก1/, { selector: "td" }).closest("tr")!.textContent).toContain("59%");
  });

  it("E-16 / AC-08 no excused children: 6 of 10 stays 60% in the model and the Excel sheets", async () => {
    const subs = [0, 1, 2, 3].map((i) => sub("a1", "s" + i, "submitted", 8))
      .concat([sub("a1", "s4", "submitted", 6, true), sub("a1", "s5", "submitted", null)]);
    const p = payload({ students: kids(10), assignments: [A1], submissions: subs as any });
    const m = computeReport(p);
    expect(m.assignments[0]).toMatchObject({ submitted: 6, total: 10, rate: 60 });
    const s4 = await sheet(p, "ภาพรวมห้อง");
    expect(s4[1].slice(3, 5)).toEqual(["6/10", "60%"]);
    const s1 = await sheet(p, "สรุปรายคน");
    expect(s1.slice(1).map((r) => r[5])).toEqual(m.students.map((s) => s.percent + "%"));
    expect(m.students.map((s) => s.percent)).toEqual([100, 100, 100, 100, 100, 100, 0, 0, 0, 0]);
  }, 20_000);

  it("AC-09 AC-01 data: the count next to 75% is 6/8 · ยกเว้น 2 on Reports and the Excel class sheet", async () => {
    const p = payload({ students: AC01_KIDS, assignments: [asg("a1", PAST_DUE, "ใบงาน")], submissions: AC01_SUBS("a1") as any });
    const s4 = await sheet(p, "ภาพรวมห้อง");
    expect(s4[1].slice(3, 5)).toEqual(["6/8 · ยกเว้น 2", "75%"]);
    get.mockResolvedValue(p);
    render(h(ReportsPage, {}));
    const lbl = await screen.findByText("ใบงาน", { selector: ".lbl" });
    expect(lbl.parentElement!.querySelector(".num")!.textContent).toBe("6/8 · ยกเว้น 2");
    expect(lbl.parentElement!.querySelector(".pct")!.textContent).toBe("75%");
  }, 20_000);

  it("AC-10 edge .5 values: 23 of 40 → 58% in the model and Excel; 29/200 → 15", async () => {
    expect(percentOf(29, 200)).toBe(15);
    expect(percentOf(23, 40)).toBe(58);
    const K = kids(40);
    const p = payload({ students: K, assignments: [A1], submissions: K.slice(0, 23).map((k) => sub("a1", k.id, "submitted", 8)) as any });
    expect(computeReport(p).assignments[0].rate).toBe(58);
    expect((await sheet(p, "ภาพรวมห้อง"))[1].slice(3, 5)).toEqual(["23/40", "58%"]);
  }, 20_000);

  it("AC-11 Excel score sheet says ยกเว้น (not ลา); Reports score card hint matches its value", async () => {
    const p = payload({ students: [kid(0), kid(1)], assignments: [A1], submissions: [sub("a1", "s0", "excused", null), sub("a1", "s1", "submitted", 8)] as any });
    const s2 = await sheet(p, "คะแนนรายงาน");
    expect(s2[1][3]).toBe("ยกเว้น");
    expect(s2[2][3]).toBe(8);
    get.mockResolvedValue(p);
    render(h(ReportsPage, {}));
    await screen.findByText(/เด็ก0/, { selector: "td" });
    expect(document.body.textContent).toContain("คะแนนสะสม · ค้างส่งนับ 0");
  }, 20_000);

  // R-05 (by hand): full 3, scores 1.5, 2, 2, 2 → 7.5 ÷ (4 × 3) = 62.5 → 63 (a mean of per-child % gives 62)
  it("R-05 graded average of half-point work divides once: 62.5 → 63 in the model and Excel; awaiting/excused left out", async () => {
    const H = { ...asg("h1", PAST_DUE, "ใบงานครึ่ง"), full_score: 3 };
    const subs = [sub("h1", "s0", "submitted", 1.5), sub("h1", "s1", "submitted", 2), sub("h1", "s2", "submitted", 2, true),
      sub("h1", "s3", "submitted", 2), sub("h1", "s4", "submitted", null), sub("h1", "s5", "excused", null)];
    expect(assignmentProgress(H, kids(6), subMap(subs), TODAY).average).toBe(63);
    const p = payload({ students: kids(6), assignments: [H], submissions: subs as any });
    expect(computeReport(p).assignments[0].average).toBe(63);
    expect((await sheet(p, "ภาพรวมห้อง"))[1][5]).toBe(63);
  }, 20_000);

  it("R-05 everyone full marks on half-point work → 100", () => {
    const H = { ...asg("h2", PAST_DUE), full_score: 2.5 };
    const subs = kids(7).map((k) => sub("h2", k.id, "submitted", 2.5));
    expect(assignmentProgress(H, kids(7), subMap(subs), TODAY).average).toBe(100);
    expect(computeReport(payload({ students: kids(7), assignments: [H], submissions: subs as any })).assignments[0].average).toBe(100);
  });
});

// M1-05 Verify round 1: AC-09 (fraction over the same denominator), AC-10 (.5 rounds up), AC-11 (Excel "ยกเว้น").
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put: vi.fn() } }));

import {
  percentOf, assignmentRate, assignmentFraction, assignmentProgress, studentSummary, attendanceRate,
  attendancePercent, classSubmitRate, scorePercent, averageAttendancePercent, type SubLike,
} from "@shared/metrics";
import { buildWorkbookBuffer } from "@client/lib/excel";
import { computeReport, type ReportPayload } from "@client/lib/report";
import { Home } from "@client/pages/Home";
import { ReportsPage } from "@client/pages/Reports";
import { classes, currentTermId, selectedTermId, subjects, terms } from "@client/store";
import type { DashboardPayload } from "@shared/types";
import { AC01_KIDS, AC01_SUBS, PAST_DUE, asg } from "./m1-05-fixture";

const TODAY = "2026-10-30";
const due = { full_score: 10, due_date: "2026-01-01" };
const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "s" + i }));
const handedIn = (n: number) => new Map<string, SubLike>(Array.from({ length: n }, (_, i) => ["s" + i, { status: "submitted", score: null }]));

describe("AC-10 one rounding: (part × 100) ÷ whole, .5 rounds up", () => {
  it.each([[23, 40, 58], [1, 8, 13], [7, 8, 88], [29, 200, 15], [2, 3, 67], [1, 3, 33]])("percentOf(%i, %i) = %i", (p, w, want) => {
    expect(percentOf(p, w)).toBe(want);
  });
  it("every per-number function goes through it", () => {
    expect(assignmentProgress(due, ids(40), handedIn(23), TODAY).rate).toBe(58);
    expect(assignmentRate({ submitted: 23, total: 40, excused: 0 })).toBe(58);
    expect(classSubmitRate([{ submitted: 23, missing: 17 }])).toBe(58);
    expect(scorePercent(23, 40)).toBe(58);
    expect(attendanceRate({ present: 7, late: 0, leave: 1, sick: 0, absent: 0 })).toBe(88);
    expect(attendancePercent({ present: 1, late: 0, leave: 0, sick: 0, absent: 7 })).toBe(13);
    const s = studentSummary(Array.from({ length: 40 }, () => due), (i) => (i < 23 ? { status: "submitted", score: 1 } : undefined), TODAY);
    expect(s.submitRate).toBe(58);
    expect(s.scorePercent).toBe(6); // 23 / 400 = 5.75
  });
  it("the scored average and the Students average use the same multiply-first form", () => {
    // 3 scored: 23/40 each -> 57.5 -> 58
    const p = assignmentProgress({ full_score: 40, due_date: null }, ids(3), new Map(ids(3).map((s) => [s.id, { status: "submitted", score: 23 }])), TODAY);
    expect(p.average).toBe(58);
    expect(averageAttendancePercent([{ present: 7, late: 0, leave: 0, sick: 0, absent: 1 }])).toBe(88);
  });
});

describe("B-05 studentSummary().awaiting counts handed-in work without a score", () => {
  it("1 awaiting of 3", () => {
    const s = studentSummary([due, due, due], (i) => [{ status: "submitted", score: null }, { status: "submitted", score: 5 }, undefined][i] as SubLike | undefined, TODAY);
    expect(s).toMatchObject({ awaiting: 1, submitted: 2, missing: 1 });
  });
});

describe("AC-09 the fraction next to the rate uses class − excused", () => {
  it("assignmentFraction: 6/8 · ยกเว้น 2; without excused it is the old form", () => {
    expect(assignmentFraction({ submitted: 6, total: 10, excused: 2 })).toBe("6/8 · ยกเว้น 2");
    expect(assignmentFraction({ submitted: 6, total: 10, excused: 0 })).toBe("6/10");
  });
});

// ---- screens + Excel on the AC-01 data -------------------------------------
const opts = { className: "ป.6/1", subjectName: "คณิต", periodLabel: "1/2569", workTypeName: () => "-", fullName: (s: any) => s.first_name };
function ac01(withExcused = true): ReportPayload {
  const subs = AC01_SUBS("a1").filter((s) => withExcused || s.status !== "excused");
  return {
    classId: "c1", range: { from: null, to: null, month: null, termId: "t1", att: "daily" },
    students: AC01_KIDS, assignments: [asg("a1", PAST_DUE, "ใบงาน")], submissions: subs as any, attendanceSessions: [], attendance: [],
  };
}
async function sheet(p: ReportPayload, name: string) {
  const buf = await buildWorkbookBuffer(computeReport(p), p, opts);
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const rows: any[][] = [];
  wb.getWorksheet(name).eachRow((r: any) => rows.push((r.values as any[]).slice(1)));
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
});

// Excel tests load exceljs on first use — slow when the whole suite runs at once (local timeout, not global)
describe("AC-09 / AC-11 Excel", { timeout: 30_000 }, () => {
  it("class overview sheet: 6/8 · ยกเว้น 2 next to 75%; no excused = 6/10 next to 60%", async () => {
    const row = (await sheet(ac01(), "ภาพรวมห้อง"))[1];
    expect(row.slice(3, 5)).toEqual(["6/8 · ยกเว้น 2", "75%"]);
    const plain = (await sheet(ac01(false), "ภาพรวมห้อง"))[1];
    expect(plain.slice(3, 5)).toEqual(["6/10", "60%"]);
  });
  it("score sheet shows an excused child as ยกเว้น, not ลา", async () => {
    const rows = await sheet(ac01(), "คะแนนรายงาน");
    expect(rows.find((r) => r[2] === "เด็ก6")![3]).toBe("ยกเว้น");
  });
  it("AC-10 attendance % in Excel: 7 of 8 = 88%", async () => {
    const p: ReportPayload = {
      ...ac01(false), students: [AC01_KIDS[0]],
      attendanceSessions: Array.from({ length: 8 }, (_, i) => ({ id: "d" + i, date: `2026-09-0${i + 1}` })),
      attendance: Array.from({ length: 8 }, (_, i) => ({ session_id: "d" + i, student_id: "s0", status: i < 7 ? "present" : "absent" })),
    };
    const rows = await sheet(p, "เช็คชื่อรายวัน");
    expect(rows[1].at(-1)).toBe("88%");
  });
});

describe("AC-09 / AC-11 screens", () => {
  it("Home shows 6/8 · ยกเว้น 2 beside the 75% bar", async () => {
    const d: DashboardPayload = {
      date: TODAY, termId: "t1", gradingAssignments: [], awaitingCount: 1, missingCount: 2, followUp: [], serverTime: 0, attendanceToday: [],
      openAssignments: [{ assignment: asg("a1", PAST_DUE, "ใบงาน"), perClass: [{ classId: "c1", total: 10, submitted: 6, scored: 5, awaiting: 1, late: 1, missing: 2, excused: 2 }] }],
    };
    get.mockResolvedValue(d);
    render(<Home />);
    await screen.findByText("ใบงาน");
    expect(document.querySelector(".hm-prog .num")!.textContent).toBe("6/8 · ยกเว้น 2");
  });
  it("Reports: the bar reads 6/8 · ยกเว้น 2 · 75% and the score card says what it counts", async () => {
    get.mockResolvedValue(ac01());
    render(<ReportsPage />);
    const label = await screen.findByText("ใบงาน", { selector: ".lbl" });
    expect(label.parentElement!.querySelector(".num")!.textContent).toBe("6/8 · ยกเว้น 2");
    expect(label.parentElement!.querySelector(".pct")!.textContent).toBe("75%");
    expect(document.body.textContent).toContain("คะแนนสะสม · ค้างส่งนับ 0");
  });
});

describe("R-05 scored average divides once: Σscore ÷ (scored × full)", { timeout: 30_000 }, () => {
  const subs3 = new Map<string, SubLike>([2.5, 2.5, 3, 2.5].map((sc, i) => ["s" + i, { status: "submitted", score: sc }]));
  it("full 3, scores 2.5 2.5 3 2.5 -> 10.5 / 12 = 87.5 -> 88", () => {
    expect(assignmentProgress({ full_score: 3, due_date: null }, ids(4), subs3, TODAY).average).toBe(88);
  });
  it("Excel class overview shows the same 88 in the average column", async () => {
    const p: ReportPayload = {
      ...ac01(false), students: AC01_KIDS.slice(0, 4),
      assignments: [{ ...asg("a1", null, "ใบงาน"), full_score: 3 }],
      submissions: [2.5, 2.5, 3, 2.5].map((score, i) => ({ assignment_id: "a1", student_id: "s" + i, status: "submitted", score, late: false })),
    };
    expect((await sheet(p, "ภาพรวมห้อง"))[1][5]).toBe(88);
  });
});

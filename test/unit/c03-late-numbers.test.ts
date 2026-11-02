// c03-submit-date AC-20 / BR-10 (💰): re-dating changes ONLY the late count — scores, the running total, the number
// handed in and "ค้าง" stay the same, on every screen that reads shared/metrics and in the Excel export (C-08).
// Written by QA (T-01). Expected by hand: 30 kids × full 10 = 300, 8 each = 240 → 80 %; late 30 → 2. PASS on 0312e8d
// already (the late flag is the only input that changes) — a guard so the numbers keep following `late` only.
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { assignmentProgress, studentSummary, workState } from "@shared/metrics";
import { buildWorkbookBuffer } from "../../src/lib/excel";
import { computeReport, type ReportPayload } from "../../src/lib/report";

const kid = (i: number) => ({ id: "s" + i, code: "C" + i, qr_token: "t" + i, prefix: null, first_name: "นักเรียน" + (i + 1), last_name: "สมมติ", nickname: null, class_id: "c1", number: i + 1, status: "active", left_at: null, updated_at: 0 });
const A1 = { id: "a1", term_id: "t1", subject_id: "m", type_id: null, title: "ใบงาน 1", unit: null, full_score: 10, assigned_date: "2026-10-26", due_date: "2026-10-30", note: null, publish_scores: false, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null };
const KIDS = Array.from({ length: 30 }, (_, i) => kid(i));
/** everyone 8/10; the first `lateCount` kids late (re-dated ones are on time) */
const subs = (lateCount: number) => KIDS.map((k, i) => ({ assignment_id: "a1", student_id: k.id, status: "submitted", score: 8, late: i < lateCount }));
const TODAY = "2026-11-02";
const opts = { className: "ป.6/1", subjectName: "วิทย์", periodLabel: "1/2569", workTypeName: () => "-", fullName: (s: any) => s.first_name };
const payload = (lateCount: number): any => ({
  classId: "c1", range: { from: null, to: null, month: null, termId: "t1", att: "daily" },
  students: KIDS, assignments: [A1], submissions: subs(lateCount), attendance: [], attendanceSessions: [],
});

function numbers(lateCount: number) {
  const s = subs(lateCount);
  const p = assignmentProgress(A1, KIDS, new Map(s.map((x) => [x.student_id, x])), TODAY);
  const per = KIDS.map((_k, i) => studentSummary([A1], () => s[i], TODAY));
  const report = computeReport(payload(lateCount));
  return {
    late: p.late, submitted: p.submitted, missing: p.missing, average: p.average,
    states: new Set(s.map((x) => workState(x, A1, TODAY))).size,
    sum: per.reduce((t, x) => t + x.score, 0), whole: per.reduce((t, x) => t + x.fullScore, 0),
    reportAvg: report.metrics.avgScorePercent, reportMissing: report.metrics.missingCount, reportSubmitRate: report.metrics.submitRate,
  };
}

describe("AC-20 numbers: late 30 → 2, everything else unchanged (TC-32)", () => {
  it("before: 30 late · 30 submitted · 0 missing · 240/300 = 80 %", () => {
    expect(numbers(30)).toMatchObject({ late: 30, submitted: 30, missing: 0, average: 80, sum: 240, whole: 300, reportMissing: 0 });
  });
  it("after re-dating 28: 2 late · the same 30 / 0 / 240 / 300 / 80 %", () => {
    const before = numbers(30), after = numbers(2);
    expect(after).toMatchObject({ late: 2, submitted: 30, missing: 0, average: 80, sum: 240, whole: 300 });
    expect({ ...after, late: 0, states: 0 }).toEqual({ ...before, late: 0, states: 0 });
  });
  it("Excel (C-08) colours only the 2 late cells and counts late 1 per late kid", async () => {
    const buf = await buildWorkbookBuffer(computeReport(payload(2) as ReportPayload), payload(2) as ReportPayload, opts);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("คะแนนรายงาน")!;
    let coloured = 0;
    for (let r = 2; r <= 31; r++) if ((ws.getRow(r).getCell(4).fill as any)?.fgColor?.argb === "FFFFE3B3") coloured++;
    expect(coloured).toBe(2);
    const per = wb.getWorksheet("สรุปรายคน")!;
    let lateTotal = 0;
    for (let r = 2; r <= 31; r++) lateTotal += Number(per.getRow(r).getCell(9).value ?? 0);
    expect(lateTotal).toBe(2);
  }, 20_000);
});

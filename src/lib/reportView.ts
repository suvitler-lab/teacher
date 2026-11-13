// What the report screen shows — pure functions over the model (no DOM, no network). The numbers come from report.ts / shared/metrics.ts
// untouched; this file only decides how they are SHOWN: "—" where a denominator is 0 (BR-38), "เก็บอยู่" where a rate is not final yet (BR-39),
// who is "often absent" (BR-41), how many tasks have no assigned date (BR-43). Every spot of the screen reads the same value from here.
import type { Assignment } from "@shared/types";
import { attendancePercent } from "@shared/metrics";
import type { AssignmentReport, ReportModel, ReportPayload, StudentReport } from "./report";

/** D42: the rate of a task is shown only when it is final: the task is closed, or today is past its due date. Otherwise "เก็บอยู่". */
export function showsRate(a: Pick<Assignment, "status" | "due_date">, today: string): boolean {
  return a.status === "closed" || (!!a.due_date && today > a.due_date);
}

/** hero submit rate: null (shown "—") when nobody's work is due yet — 0 ÷ 0 is not 0% (BR-38). 0 of 8 is still "0%". */
export function submitRateView(m: ReportModel): number | null {
  return m.totals.applicable > 0 ? m.metrics.submitRate : null;
}
/** hero average score: null when there is no full score to compare with (BR-38) */
export function avgScoreView(m: ReportModel): number | null {
  return m.totals.fullScore > 0 ? m.metrics.avgScorePercent : null;
}
/** rate of one task over (class − excused): null when that is 0 */
export function workRateView(a: AssignmentReport): number | null {
  return a.total - a.excused > 0 ? a.rate : null;
}
/** average of one task: null ("ยังไม่มีคะแนน") when nothing is checked yet */
export function workAverageView(a: AssignmentReport): number | null {
  return a.scoredCount > 0 ? a.average : null;
}

/** why the submit rate is "—": no task at all in the range, or tasks that are not due yet */
export function submitRateWhy(m: ReportModel, month: string | null, monthLabel: string): string {
  if (m.assignments.length === 0) return month ? `ยังไม่มีงานที่มอบหมายใน ${monthLabel}` : "ยังไม่มีงานในช่วงนี้";
  return "ยังไม่มีงานที่ถึงกำหนด";
}

/** the works card: the latest assigned first, tasks with no assigned date at the end (BR-39) */
export function workRows(list: AssignmentReport[]): AssignmentReport[] {
  const day = (a: AssignmentReport) => a.assignment.assigned_date ?? "";
  return list.map((a, i) => ({ a, i })).sort((x, y) => {
    const dx = day(x.a), dy = day(y.a);
    if (!dx !== !dy) return dx ? -1 : 1;
    return dy.localeCompare(dx) || x.i - y.i;
  }).map((e) => e.a);
}

/** the lowest count of "absent" marks that puts a child in the often-absent card (BR-41) */
export const ABSENT_MIN = 3;
/** children with absent ≥ 3 (late, leave, sick do not count), most first, then by number */
export function frequentAbsent(students: StudentReport[], min = ABSENT_MIN): { s: StudentReport; absent: number; att: number | null }[] {
  return students
    .filter((s) => s.attendance.absent >= min)
    .map((s) => ({ s, absent: s.attendance.absent, att: attendancePercent(s.attendance) }))
    .sort((a, b) => b.absent - a.absent || (a.s.student.number ?? 0) - (b.s.student.number ?? 0));
}

/** "รวมงานที่ไม่ระบุวันมอบ n งาน" is said when one month is shown and n ≥ 1 (G-R3) */
export function unassignedCount(p: ReportPayload | null, monthly: boolean): number {
  return monthly && p ? p.assignments.filter((a) => !a.assigned_date).length : 0;
}

/** the name the screen shows: the full name, or "เลขที่ N" when the page hides names (A16: "เลขที่ –" with no number) */
export function nameOf(student: { number: number | null }, full: string, hide: boolean): string {
  return hide ? `เลขที่ ${student.number ?? "–"}` : full;
}

/** the spoken form of the score spread (AC-164) */
export function bucketsLabel(b: number[]): string {
  return ["ต่ำกว่า 50%", "50–59%", "60–69%", "70–79%", "80% ขึ้นไป"].map((l, i) => `${l}: ${b[i]} คน`).join(" · ");
}

import { api } from "./api";
import { swrPeek, swrFetch } from "./swr";
import { computeReport, type ReportModel, type ReportPayload } from "./report";
import { fullName } from "./names";
import { classById, activeSubjects, workTypeById, terms, selectedTermId, UNASSIGNED } from "../store";

/**
 * The one place that knows how the "ส่งออก Excel" workbook is made, shared by the Reports page and the Gradebook
 * page so both hand the teacher exactly the same file. exceljs is imported lazily (it is large).
 */

export interface ReportQuery { classId: string; termId?: string | null; month?: string | null; subjectId?: string; attBySubject?: boolean }

/** `/api/reports/summary?...` — the same URL (and so the same swr cache entry) whichever page asks. */
export function reportSummaryUrl(q: ReportQuery): string {
  const p = new URLSearchParams({ class: q.classId });
  if (q.termId) p.set("term", q.termId);
  if (q.month) p.set("month", q.month);
  if (q.subjectId) p.set("subject", q.subjectId);
  if (q.attBySubject) p.set("att", "subject");
  return `/api/reports/summary?${p}`;
}

/** The label the workbook (and the report header) puts for a whole term. */
export function termPeriodLabel(termId: string | null = selectedTermId.value): string {
  return termId === UNASSIGNED ? "ยังไม่ระบุเทอม" : (terms.value.find((t) => t.id === termId)?.name ?? "ทั้งเทอม");
}

export interface ExcelContext { className: string; subjectName: string; periodLabel: string }

/** Build the workbook from a report the page already holds and download it. */
export async function downloadReportExcel(model: ReportModel, payload: ReportPayload, ctx: ExcelContext): Promise<void> {
  const { exportExcel } = await import("./excel");
  await exportExcel(model, payload, { ...ctx, workTypeName: (id) => workTypeById(id)?.name ?? "-", fullName });
}

/** The report for a class + subject over a whole term (fresh from the swr cache, else the server). */
export async function loadTermReport(classId: string, subjectId: string, termId: string | null): Promise<ReportPayload> {
  const url = reportSummaryUrl({ classId, termId, subjectId });
  const hit = swrPeek<ReportPayload>(url);
  if (hit?.fresh) return hit.data;
  return swrFetch(url, () => api.get<ReportPayload>(url));
}

/** Gradebook entry point: fetch the whole-term report of the class + subject on screen and download it as Excel. */
export async function exportTermExcel(classId: string, subjectId: string, termId: string | null = selectedTermId.value): Promise<void> {
  const payload = await loadTermReport(classId, subjectId, termId);
  await downloadReportExcel(computeReport(payload), payload, {
    className: classById(classId)?.name ?? "",
    subjectName: activeSubjects.value.find((s) => s.id === subjectId)?.name ?? "ทุกวิชา",
    periodLabel: termPeriodLabel(termId),
  });
}

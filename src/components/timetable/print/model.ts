// Print model of the timetable sheet (S8 · BR-16): what goes on the A4 paper, as plain data (no DOM, no clock).
// Always the "ก" grid (days × periods in the frame, breaks as bands) whatever layout the teacher picked.
import type { FrameInput, Slot, Weekday } from "@shared/timetable";
import { type RefLite, type Summary, type TermLite, type TtEntry, buildEntries, summarize, toMin } from "../../../lib/timetable/logic";
import { DAY_NAMES, MSG } from "../../../lib/timetable/messages";

export type PrintColumn =
  | { k: "p"; period: number; start: string; end: string }
  | { k: "b"; name: string; start: string; end: string };

export interface PrintCell {
  kind: "class" | "activity";
  text: string; // "คณิตศาสตร์ ป.6/2" · "ป.6/1" · the activity name (no prefix)
  archived: boolean;
  full: string; // text + " (เก็บแล้ว)" when archived — what paper shows
}

export interface PrintRow {
  weekday: Weekday;
  name: string; // "จันทร์"
  cells: Record<number, PrintCell | null>; // by period (1-based)
}

export interface PrintModel {
  title: string;
  nameLine: string | null;
  columns: PrintColumn[];
  rows: PrintRow[];
  summary: Summary;
  printedOn: string; // "13 พ.ย. 2569"
  dataStamp: string | null; // "ข้อมูลเมื่อ 09:41" (offline only)
  pastYear: boolean;
}

/** The "ครูผู้สอน … · โรงเรียน …" line (AC-65): trimmed, only what is filled, null when both are empty. */
export function printNameLine(teacher: string | null | undefined, school: string | null | undefined): string | null {
  const t = (teacher ?? "").trim();
  const s = (school ?? "").trim();
  const parts = [t ? `ครูผู้สอน ${t}` : "", s].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-11-13" → "13 พ.ย. 2569" */
export function thaiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
}

/** Periods and breaks side by side in clock order (a break sits between the periods it falls between). */
export function printColumns(frame: FrameInput): PrintColumn[] {
  const cols: PrintColumn[] = [
    ...frame.periods.map((p, i): PrintColumn => ({ k: "p", period: i + 1, start: p.start, end: p.end })),
    ...frame.breaks.map((b): PrintColumn => ({ k: "b", name: b.name, start: b.start, end: b.end })),
  ];
  return cols
    .map((c, i) => ({ c, i }))
    .sort((a, b) => toMin(a.c.start) - toMin(b.c.start) || a.i - b.i)
    .map((x) => x.c);
}

export interface PrintInput {
  slots: Slot[];
  frame: FrameInput;
  term: ({ year: number; term: number } & TermLite) | null;
  classes: RefLite[];
  subjects: RefLite[];
  teacherName?: string | null;
  schoolName?: string | null;
  readOnly: boolean;
  offline: boolean;
  loadedHM: string; // "HH:MM" of the copy on the device
  todayIso: string; // Bangkok "YYYY-MM-DD"
}

/** Null when there is nothing to print (the page keeps its print button disabled in that case). */
export function buildPrintModel(i: PrintInput): PrintModel | null {
  const summary = summarize(i.slots, i.frame);
  if (summary.total === 0) return null;
  const entries = buildEntries({ slots: i.slots, frame: i.frame, term: i.term, classes: i.classes, subjects: i.subjects }, { includeArchived: true });
  const at = new Map<string, TtEntry>(entries.map((e) => [`${e.weekday}-${e.period}`, e]));
  const days = [...i.frame.days].sort((a, b) => a - b);
  const rows: PrintRow[] = days.map((d) => {
    const cells: Record<number, PrintCell | null> = {};
    i.frame.periods.forEach((_, idx) => {
      const e = at.get(`${d}-${idx + 1}`);
      cells[idx + 1] = e ? { kind: e.kind, text: e.title, archived: e.archived, full: e.archived ? `${e.title} ${MSG.archivedPrint}` : e.title } : null;
    });
    return { weekday: d, name: DAY_NAMES[d], cells };
  });
  return {
    title: i.term ? `ตารางสอน ภาคเรียนที่ ${i.term.term} ปีการศึกษา ${i.term.year}` : "ตารางสอน",
    nameLine: printNameLine(i.teacherName, i.schoolName),
    columns: printColumns(i.frame),
    rows,
    summary,
    printedOn: thaiDate(i.todayIso),
    dataStamp: i.offline ? `ข้อมูลเมื่อ ${i.loadedHM}` : null,
    pastYear: i.readOnly,
  };
}

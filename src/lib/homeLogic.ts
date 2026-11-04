// What the home page decides from numbers it already has: pure functions, so they can be tested without a screen.
import { attendanceProgress } from "@shared/metrics";
import { bkkToday } from "@shared/time";
import type { Assignment, AttendanceDay } from "@shared/types";
import { formatThaiDate } from "./dates";

const DAY = 86_400_000;
/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export type DueTone = "danger" | "warning" | "muted";
export interface DueInfo { tone: DueTone; icon: string; text: string }

/** The chip beside an assignment: how late it is, due today / tomorrow, or the date. */
export function dueInfo(due: string | null, today: string): DueInfo {
  if (!due) return { tone: "muted", icon: "calendar-event", text: "ไม่มีกำหนดส่ง" };
  const d = daysBetween(today, due);
  if (d < 0) return { tone: "danger", icon: "calendar-event", text: `เลยกำหนด ${-d} วัน` };
  if (d === 0) return { tone: "warning", icon: "clock", text: "ครบกำหนดวันนี้" };
  if (d === 1) return { tone: "warning", icon: "clock", text: "ส่งพรุ่งนี้" };
  return { tone: "muted", icon: "calendar-event", text: `ส่ง ${formatThaiDate(due)}` };
}

export const NO_DUE_OPEN_DAYS = 14;
export const OVERDUE_OPEN_DAYS = 7;

/**
 * Open work that has probably been forgotten: no due date and open for 14 days, or more than a week past its due date.
 * Why it matters: a child who never handed in work with no due date only counts as missing once the work is closed (D31).
 */
export function shouldClose(a: Pick<Assignment, "status" | "due_date" | "assigned_date" | "created_at">, today: string): boolean {
  if (a.status !== "open") return false;
  if (a.due_date) return daysBetween(a.due_date, today) >= OVERDUE_OPEN_DAYS;
  return openDays(a, today) >= NO_DUE_OPEN_DAYS;
}

/** How many days an assignment has been open (counted from the assigned date, or when it was created). */
export function openDays(a: Pick<Assignment, "assigned_date" | "created_at">, today: string): number {
  return Math.max(0, daysBetween(a.assigned_date ?? bkkToday(a.created_at), today));
}

export function hmToMin(hm: string, fallback = 510): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/** The line under the "เช็คชื่อ" button. */
export function attendanceHeadline(att: AttendanceDay[]): string {
  if (att.length === 0) return "เช็คชื่อประจำวัน";
  const prog = att.map((a) => attendanceProgress(a.marked, a.total));
  const complete = prog.filter((p) => p === "complete").length;
  if (prog.every((p) => p === "none")) return `ยังไม่ได้เช็คชื่อ ${att.length} ห้อง`;
  if (complete === att.length) return "วันนี้เช็คครบทุกห้อง";
  return `ยังเหลือ ${att.length - complete} ห้อง`;
}

/** Rooms with children where nobody has been marked yet, once the "late" time of the day has passed. */
export function uncheckedRooms(att: AttendanceDay[], nowMinutes: number, lateAfter: string): AttendanceDay[] {
  if (nowMinutes < hmToMin(lateAfter)) return [];
  return att.filter((a) => a.total > 0 && attendanceProgress(a.marked, a.total) === "none");
}

// ---- the "do this now" card ----------------------------------------------------------------------------------
export type TodoAction = "failed" | "queue" | "term" | "room" | "backup";
export interface TodoRow {
  key: string;
  tone: "danger" | "warning";
  icon: string;
  title: string;
  detail?: string;
  action: TodoAction;
  label: string;
  classId?: string;
}
export interface TodoInput {
  failed: number;
  pending: number;
  attDrafts: number;
  termEnded: { name: string; end: string } | null;
  unchecked: { classId: string; name: string; total: number }[];
  backupDays: number | null; // days since the last backup; null = never
}

/** One row per thing that needs the teacher: sends that failed first, then what is waiting on this device, and so on. */
export function todoRows(i: TodoInput): TodoRow[] {
  const rows: TodoRow[] = [];
  if (i.failed > 0) rows.push({ key: "failed", tone: "danger", icon: "cloud-x", title: `ส่งไม่สำเร็จ ${i.failed} รายการ`, detail: "ต้องดู", action: "failed", label: "ดูรายการ" });
  if (i.pending + i.attDrafts > 0) {
    const parts = [i.attDrafts > 0 && `เช็คชื่อ ${i.attDrafts} คน`, i.pending > 0 && `คะแนน ${i.pending} รายการ`].filter(Boolean).join(" · ");
    rows.push({ key: "queue", tone: "warning", icon: "cloud-upload", title: "ค้างในเครื่องนี้", detail: `${parts} — จะส่งเองเมื่อมีเน็ต`, action: "queue", label: i.attDrafts > 0 ? "ดูเช็คชื่อ" : "ดูสมุดคะแนน" });
  }
  if (i.termEnded) rows.push({ key: "term", tone: "warning", icon: "calendar-event", title: `${/^ภาคเรียน/.test(i.termEnded.name) ? i.termEnded.name : "ภาคเรียนที่ " + i.termEnded.name} สิ้นสุดเมื่อ ${formatThaiDate(i.termEnded.end)} แล้ว`, detail: "พร้อมเริ่มภาคเรียนถัดไปไหม", action: "term", label: "เริ่มภาคเรียนใหม่" });
  for (const r of i.unchecked) rows.push({ key: "room:" + r.classId, tone: "warning", icon: "user-check", title: `${r.name} ยังไม่ได้เช็คชื่อ`, detail: `${r.total} คน`, action: "room", label: "เช็คชื่อ", classId: r.classId });
  if (i.backupDays === null) rows.push({ key: "backup", tone: "warning", icon: "database-export", title: "ยังไม่เคยสำรองข้อมูล", detail: "ควรสำรองสัปดาห์ละครั้ง", action: "backup", label: "สำรองตอนนี้" });
  else if (i.backupDays > 7) rows.push({ key: "backup", tone: "warning", icon: "database-export", title: `สำรองข้อมูลล่าสุด ${i.backupDays} วันที่แล้ว`, detail: "ควรสำรองสัปดาห์ละครั้ง", action: "backup", label: "สำรองตอนนี้" });
  return rows;
}

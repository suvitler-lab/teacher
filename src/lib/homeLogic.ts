// What the home page decides from numbers it already has: pure functions, so they can be tested without a screen.
import { attendanceProgress, attendancePercent, percentOf, type AttendanceProgress } from "@shared/metrics";
import { bkkToday } from "@shared/time";
import type { Assignment, AttendanceDay, DashboardPayload } from "@shared/types";
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

// ---- shared numbers of the home page (T-33: BR-03 / BR-04 / BR-05 / BR-06 / BR-09) --------------------------------
// Every figure comes from the EP-06 payload through the existing metric functions: no new formula.

export interface AttSummary {
  rooms: number;               // rooms that have children
  complete: number;
  partial: number;
  pct: number | null;          // (present + late) ÷ marked over the rooms, null = nothing checked ("—", never 0%)
  headline: string;            // attendanceHeadline: the line under the "เช็คชื่อ" button
}

/** The roll-call numbers over the rooms that have children (a room with nobody in it is neither counted nor divided by). */
export function attSummary(att: AttendanceDay[]): AttSummary {
  const rooms = att.filter((a) => a.total > 0);
  const prog = rooms.map((a) => attendanceProgress(a.marked, a.total));
  const sum = rooms.reduce((c, a) => ({
    present: c.present + a.present, late: c.late + a.late, leave: c.leave + a.leave, sick: c.sick + a.sick, absent: c.absent + a.absent,
  }), { present: 0, late: 0, leave: 0, sick: 0, absent: 0 });
  return {
    rooms: rooms.length,
    complete: prog.filter((p) => p === "complete").length,
    partial: prog.filter((p) => p === "partial").length,
    pct: attendancePercent(sum),
    headline: attendanceHeadline(rooms),
  };
}

export interface RoomAtt {
  progress: AttendanceProgress; marked: number; total: number;
  present: number; late: number; leave: number; sick: number; absent: number;
  /** "มา" = present + late; null while nobody is marked ("ยังไม่เช็ค", not 0%) */
  pct: number | null;
}
export interface RoomStat {
  classId: string;
  openCount: number;           // open work that includes this room
  submitted: number; missing: number; late: number; // from open work
  awaiting: number;            // open + closed-but-ungraded work (all rooms add up to awaitingCount)
  rate: number | null;         // Σsubmitted ÷ Σ(submitted + missing), null = nothing to divide by ("—")
  att: RoomAtt | null;         // null = the dashboard has no attendance row for this room
}

/** BR-03 + BR-04 for each room id given (the order is kept). */
export function roomStats(d: Pick<DashboardPayload, "openAssignments" | "gradingAssignments" | "attendanceToday">, classIds: string[]): RoomStat[] {
  return classIds.map((classId) => {
    let openCount = 0, submitted = 0, missing = 0, late = 0, awaiting = 0;
    for (const a of d.openAssignments) {
      const p = a.perClass.find((x) => x.classId === classId);
      if (!p) continue;
      openCount++; submitted += p.submitted; missing += p.missing; late += p.late; awaiting += p.awaiting;
    }
    for (const a of d.gradingAssignments) awaiting += a.perClass.find((x) => x.classId === classId)?.awaiting ?? 0;
    const row = d.attendanceToday.find((x) => x.classId === classId);
    const att: RoomAtt | null = row ? {
      progress: attendanceProgress(row.marked, row.total), marked: row.marked, total: row.total,
      present: row.present, late: row.late, leave: row.leave, sick: row.sick, absent: row.absent,
      pct: row.marked > 0 ? attendancePercent(row) : null,
    } : null;
    return { classId, openCount, submitted, missing, late, awaiting, rate: percentOf(submitted, submitted + missing), att };
  });
}

export interface DueGroup {
  assignment: Assignment;
  when: "today" | "tomorrow";
  classes: { classId: string; n: number; studentIds: string[] }[]; // not handed in yet, per room (BR-06)
  total: number;
  studentIds: string[];
}

type DueSource = Pick<DashboardPayload, "date" | "openAssignments"> & Partial<Pick<DashboardPayload, "dueSoon">>;

/** BR-06: open work due today or tomorrow, who has not handed in yet. A payload saved before this field existed gives []. */
export function dueGroups(d: DueSource, today: string = d.date): DueGroup[] {
  const out: DueGroup[] = [];
  for (const r of d.dueSoon ?? []) {
    const a = d.openAssignments.find((x) => x.assignment.id === r.assignmentId);
    if (!a || r.studentIds.length === 0) continue;
    // a copy saved on an earlier day: work that is now overdue is not "today" any more (the "chase late work" row covers it)
    if (a.assignment.due_date && a.assignment.due_date < today) continue;
    let g = out.find((x) => x.assignment.id === r.assignmentId);
    if (!g) {
      g = { assignment: a.assignment, when: a.assignment.due_date === today ? "today" : "tomorrow", classes: [], total: 0, studentIds: [] };
      out.push(g);
    }
    g.classes.push({ classId: r.classId, n: r.studentIds.length, studentIds: [...r.studentIds] });
    g.total += r.studentIds.length;
    g.studentIds.push(...r.studentIds);
  }
  return out;
}

/** "ครบกำหนดวันนี้ N งาน": distinct work in dueSoon whose due date is today. */
export const dueTodayCount = (d: DueSource, today: string = d.date) => dueGroups(d, today).filter((g) => g.when === "today").length;

export interface FollowGroup { pieces: number; people: { studentId: string; classId: string }[] }

/** BR-05: the (at most 8) children the server sent, grouped by how many pieces they owe, most first. */
export function followGroups(followUp: DashboardPayload["followUp"], classId?: string): FollowGroup[] {
  const map = new Map<number, FollowGroup>();
  for (const f of followUp) {
    if (classId && f.classId !== classId) continue;
    const g = map.get(f.missing) ?? { pieces: f.missing, people: [] };
    g.people.push({ studentId: f.studentId, classId: f.classId });
    map.set(f.missing, g);
  }
  return [...map.values()].sort((a, b) => b.pieces - a.pieces);
}

export interface HomeSummary {
  awaiting: number;            // awaitingCount
  missing: number;             // missingCount
  openCount: number;           // open work
  att: AttSummary;
  dueToday: number;
}

export function homeSummary(d: DashboardPayload, today: string = d.date): HomeSummary {
  return {
    awaiting: d.awaitingCount, missing: d.missingCount, openCount: d.openAssignments.length,
    att: attSummary(d.attendanceToday), dueToday: dueTodayCount(d, today),
  };
}

// ---- "what to do today" (BR-01 / BR-02) -------------------------------------------------------------------------
export type TodayKind = "failed" | "queue" | "room" | "due" | "overdue" | "review" | "term" | "backup" | "tomorrow";
export type TodayGo =
  | { type: "route"; path: string; params?: Record<string, string | number | undefined> }
  | { type: "failed" }
  | { type: "term" };
export interface OverdueItem { assignmentId: string; title: string; classId: string; subjectId: string | null; daysLate: number; missing: number; shouldClose: boolean }
export interface TodayRow {
  key: string;
  kind: TodayKind;
  /** words, not only colour: ต้องดู / ควรทำ / ว่างค่อยทำ / พรุ่งนี้ */
  level: "must" | "should" | "later";
  levelLabel: string;
  /** the type label of the row: "เข้าเรียน 08:30" · "วันนี้" · "ค้างอยู่" · "ว่างแล้วทำ" · "พรุ่งนี้" (never a time the system does not have) */
  tag: string;
  icon: string;
  title: string;
  reason?: string;
  primary: { label: string; go: TodayGo };
  /** one "copy to LINE" per room (never a list that mixes rooms); the model drops them while names are hidden */
  secondary?: { kind: "copy"; label: string; assignmentId: string; classId: string }[];
  due?: DueGroup;
  overdue?: OverdueItem[];
  classId?: string;
  /** tomorrow's work: shown last, not counted */
  later?: boolean;
}

export interface TodayInput {
  today: string;
  nowMinutes: number;
  lateAfter: string;
  failed: number;
  pending: number;
  attDrafts: number;
  summary: Pick<DashboardPayload, "date" | "openAssignments" | "attendanceToday" | "awaitingCount"> & Partial<Pick<DashboardPayload, "dueSoon">>;
  termEnded: { name: string; end: string } | null;
  backupDays: number | null;
  /** the room whose roll-call is waiting in this device's drafts (the "ค้างในเครื่องนี้" button opens that room) */
  queueClassId?: string;
  classNameOf: (classId: string) => string;
}

const LEVEL_LABEL = { must: "ต้องดู", should: "ควรทำ", later: "ว่างค่อยทำ" } as const;

/**
 * BR-01: the rows behind "N อย่างที่ต้องทำวันนี้", in the order of the rule: failed sends, what waits on this device, rooms not checked
 * (after `late_after`), work due today, the one "chase the late work" row, "review", the term that ended, the backup. Work due tomorrow
 * follows as "later" rows and is not counted. No row has a tick: a row goes away when the data changes (BR-02).
 */
export function todayList(i: TodayInput): TodayRow[] {
  const rows: TodayRow[] = [];
  const d = i.summary;
  const row = (r: Omit<TodayRow, "levelLabel">): TodayRow => ({ ...r, levelLabel: r.later ? "พรุ่งนี้" : LEVEL_LABEL[r.level] });
  if (i.failed > 0) rows.push(row({ key: "failed", kind: "failed", level: "must", tag: "ค้างอยู่", icon: "cloud-x", title: `ส่งไม่สำเร็จ ${i.failed} รายการ`, reason: "ต้องดู", primary: { label: "ดูรายการ", go: { type: "failed" } } }));
  if (i.pending + i.attDrafts > 0) {
    const parts = [i.attDrafts > 0 && `เช็คชื่อ ${i.attDrafts} คน`, i.pending > 0 && `คะแนน ${i.pending} รายการ`].filter(Boolean).join(" · ");
    rows.push(row({
      key: "queue", kind: "queue", level: "should", tag: "ค้างอยู่", icon: "cloud-upload", title: "ค้างในเครื่องนี้", reason: `${parts} — จะส่งเองเมื่อมีเน็ต`,
      primary: i.attDrafts > 0
        ? { label: "ดูเช็คชื่อ", go: { type: "route", path: "/attendance", params: { class: i.queueClassId } } }
        : { label: "ดูสมุดคะแนน", go: { type: "route", path: "/gradebook", params: { class: i.queueClassId } } },
    }));
  }
  for (const r of uncheckedRooms(d.attendanceToday, i.nowMinutes, i.lateAfter)) {
    const name = i.classNameOf(r.classId);
    rows.push(row({
      key: "room:" + r.classId, kind: "room", level: "should", tag: `เข้าเรียน ${i.lateAfter}`, icon: "user-check", title: `เช็คชื่อ ${name}`,
      reason: `ยังไม่ได้เช็คชื่อ · ${r.total} คน`, classId: r.classId, primary: { label: "เริ่มเช็คชื่อ", go: { type: "route", path: "/attendance", params: { class: r.classId } } },
    }));
  }
  const groups = dueGroups(d, i.today);
  const dueLine = (g: DueGroup) => `ยังไม่ส่ง ${g.total} คน · ${g.classes.map((c) => `${i.classNameOf(c.classId)} ${c.n} คน`).join(" · ")}`;
  for (const g of groups.filter((x) => x.when === "today")) {
    rows.push(row({
      key: "due:" + g.assignment.id, kind: "due", level: "should", tag: "วันนี้", icon: "calendar-due", title: g.assignment.title, reason: dueLine(g), due: g,
      primary: { label: "สแกนรับงาน", go: { type: "route", path: "/scan", params: { asg: g.assignment.id, class: g.classes[0]?.classId } } },
      secondary: g.classes.map((c) => ({ kind: "copy" as const, label: `คัดลอกรายชื่อไป LINE · ${i.classNameOf(c.classId)}`, assignmentId: g.assignment.id, classId: c.classId })),
    }));
  }
  // one row for all the late work that is still open (a child is only "missing" once the work is overdue: D31)
  const overdue: OverdueItem[] = [];
  for (const a of d.openAssignments) {
    const per = a.perClass.filter((p) => p.missing > 0);
    const missing = per.reduce((n, p) => n + p.missing, 0);
    if (missing === 0) continue;
    const worst = per.reduce((m, p) => (p.missing > m.missing ? p : m), per[0]);
    overdue.push({
      assignmentId: a.assignment.id, title: a.assignment.title, classId: worst.classId, subjectId: a.assignment.subject_id, missing,
      daysLate: a.assignment.due_date ? Math.max(0, daysBetween(a.assignment.due_date, i.today)) : 0, shouldClose: shouldClose(a.assignment, i.today),
    });
  }
  if (overdue.length > 0) {
    const first = overdue[0];
    rows.push(row({
      key: "overdue", kind: "overdue", level: "should", tag: "ค้างอยู่", icon: "alert-circle", title: "ตามงานค้าง",
      reason: `${overdue.length} งานเลยกำหนด · ค้างรวม ${overdue.reduce((n, o) => n + o.missing, 0)} ชิ้น`, overdue,
      primary: { label: "ดูรายชื่อคนค้าง", go: { type: "route", path: "/gradebook", params: { class: first.classId, subject: first.subjectId ?? undefined, asg: first.assignmentId, rows: "missing" } } },
    }));
  }
  if (d.awaitingCount > 0) {
    rows.push(row({
      key: "review", kind: "review", level: "later", tag: "ว่างแล้วทำ", icon: "hourglass-empty", title: "ตรวจงานที่ส่งแล้ว", reason: `รอตรวจ ${d.awaitingCount} ชิ้น`,
      primary: { label: "เปิดสมุดคะแนน", go: { type: "route", path: "/gradebook", params: { rows: "awaiting" } } },
    }));
  }
  if (i.termEnded) {
    const nm = /^ภาคเรียน/.test(i.termEnded.name) ? i.termEnded.name : "ภาคเรียนที่ " + i.termEnded.name;
    rows.push(row({ key: "term", kind: "term", level: "later", tag: "ว่างแล้วทำ", icon: "calendar-event", title: `${nm} สิ้นสุดเมื่อ ${formatThaiDate(i.termEnded.end)} แล้ว`, reason: "พร้อมเริ่มภาคเรียนถัดไปไหม", primary: { label: "เริ่มภาคเรียนใหม่", go: { type: "term" } } }));
  }
  const backup = (title: string) => row({ key: "backup", kind: "backup", level: "later", tag: "ว่างแล้วทำ", icon: "database-export", title, reason: "ควรสำรองสัปดาห์ละครั้ง", primary: { label: "สำรองตอนนี้", go: { type: "route", path: "/settings", params: { section: "backup" } } } });
  if (i.backupDays === null) rows.push(backup("ยังไม่เคยสำรองข้อมูล"));
  else if (i.backupDays > 7) rows.push(backup(`สำรองข้อมูลล่าสุด ${i.backupDays} วันที่แล้ว`));
  // tomorrow: listed last, never counted
  for (const g of groups.filter((x) => x.when === "tomorrow")) {
    rows.push(row({
      key: "tomorrow:" + g.assignment.id, kind: "tomorrow", level: "later", later: true, tag: "พรุ่งนี้", icon: "clock", title: g.assignment.title, reason: dueLine(g), due: g,
      primary: { label: "สแกนรับงาน", go: { type: "route", path: "/scan", params: { asg: g.assignment.id, class: g.classes[0]?.classId } } },
    }));
  }
  return rows;
}

/** The number in "เหลือ N อย่าง": rows that are not "later" (BR-01). */
export const todayCount = (rows: TodayRow[]) => rows.filter((r) => !r.later).length;

/**
 * BR-02 "ทำทีหลัง": the rows the teacher pushed back go to the end of the queue, in the order they were pushed; the count does not change.
 * Tomorrow's rows stay behind everything. Nothing is saved: a reload starts from the BR-01 order again.
 */
export function withDeferred(rows: TodayRow[], deferred: string[]): TodayRow[] {
  const keyed = new Map(rows.map((r) => [r.key, r]));
  const pushed = deferred.map((k) => keyed.get(k)).filter((r): r is TodayRow => !!r && !r.later);
  const pushedKeys = new Set(pushed.map((r) => r.key));
  const counted = rows.filter((r) => !r.later && !pushedKeys.has(r.key));
  return [...counted, ...pushed, ...rows.filter((r) => r.later)];
}

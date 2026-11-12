// Layout ข: the little decisions that are only about how ข draws things. Every number comes from the shared model (T-33):
// nothing here is a new formula, only choosing a room, ordering a list and picking words.
import type { AssignmentDashboard, ClassProgress } from "@shared/types";
import type { TodayRow } from "../../../lib/homeLogic";
import type { HomeModel, HomeRoom } from "../meta";

/** More rooms than this turns the big panels into compact ones (ux: จำนวนห้อง 1–8). */
export const COMPACT_AFTER = 3;
/** How many open works the room detail lists before "ดูทั้งหมด". */
export const SHOWN_WORK = 5;
/** How many rows of "ต้องทำตอนนี้" sit in the strip (AC-26); the rest open in a sheet. */
export const STRIP_ROWS = 3;

/** How many children are in the room: the roll-call row says so; without one the roster on this device (a room the server has no row for has nobody). */
export const headCount = (r: Pick<HomeRoom, "att" | "studentCount">): number => (r.att ? r.att.total : r.studentCount);

/**
 * The room that is shown before the teacher picks one: the first room the day's list asks for (roll-call not done after `late_after`, BR-01),
 * else the room with most work missing (the first of them on a tie), else the first room with children, else the first room.
 */
export function defaultRoomId(model: Pick<HomeModel, "rooms" | "todo">): string | null {
  const rooms = model.rooms;
  if (rooms.length === 0) return null;
  const asked = model.todo.find((r) => r.kind === "room" && r.classId && rooms.some((x) => x.classId === r.classId));
  if (asked?.classId) return asked.classId;
  const withKids = rooms.filter((r) => headCount(r) > 0);
  if (withKids.length === 0) return rooms[0].classId;
  return withKids.reduce((best, r) => (r.missing > best.missing ? r : best), withKids[0]).classId;
}

/** The room on screen: the teacher's pick while that room still exists, otherwise the default. */
export function pickedRoom(model: Pick<HomeModel, "rooms" | "todo">, picked: string | null): HomeRoom | null {
  const found = picked ? model.rooms.find((r) => r.classId === picked) : undefined;
  if (found) return found;
  const id = defaultRoomId(model);
  return model.rooms.find((r) => r.classId === id) ?? null;
}

export interface RoomWork { a: AssignmentDashboard; p: ClassProgress }

/** AC-27: the open work of one room, oldest due date first (overdue, then today, then later); no due date last; the same date keeps the server's order. */
export function roomOpenWork(model: Pick<HomeModel, "d">, classId: string): RoomWork[] {
  const rows: RoomWork[] = [];
  for (const a of model.d.openAssignments) {
    const p = a.perClass.find((x) => x.classId === classId);
    if (p) rows.push({ a, p });
  }
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const dx = x.r.a.assignment.due_date, dy = y.r.a.assignment.due_date;
      if (dx && dy && dx !== dy) return dx < dy ? -1 : 1;
      if (!dx !== !dy) return dx ? -1 : 1;
      return x.i - y.i;
    })
    .map((x) => x.r);
}

/** The four parts of the bar of one work in one room: handed in and checked / waiting to be checked / missing / not due yet. */
export function workSegments(p: ClassProgress): { handed: number; awaiting: number; missing: number; pending: number } {
  const awaiting = Math.min(p.awaiting, p.submitted);
  return {
    handed: p.submitted - awaiting,
    awaiting,
    missing: p.missing,
    pending: Math.max(0, p.total - p.excused - p.submitted - p.missing),
  };
}

/** How many children of the room are on the "follow up" list (from the at most 8 the server sent: never "ทั้งหมด"). */
export const followCount = (r: Pick<HomeRoom, "follow">): number => r.follow.reduce((n, g) => n + g.people.length, 0);

/** The children shown as avatars on a panel: most pieces owed first (the order the groups are in). */
export const followIds = (r: Pick<HomeRoom, "follow">, max: number): string[] => r.follow.flatMap((g) => g.people.map((p) => p.studentId)).slice(0, max);

/** Roll-call words of one room for a panel and its aria-label: BR-04 (% from the model; a room with nothing checked says "ยังไม่ได้เช็คชื่อวันนี้", never 0%). */
export function attWords(r: Pick<HomeRoom, "att">): string {
  const a = r.att;
  if (!a) return "มาเรียนวันนี้ —";
  if (a.progress === "none") return "ยังไม่ได้เช็คชื่อวันนี้";
  return `มาเรียน ${a.pct == null ? "—" : a.pct + "%"}${a.progress === "partial" ? ` · เช็คแล้ว ${a.marked}/${a.total}` : ""}`;
}

/** The short roll-call words of a compact panel ("มา 94%"); a room not checked is drawn as a chip by the panel itself. */
export function attShort(r: Pick<HomeRoom, "att">): string {
  const a = r.att;
  if (!a) return "มา —";
  return `มา ${a.pct == null ? "—" : a.pct + "%"}${a.progress === "partial" ? ` (${a.marked}/${a.total})` : ""}`;
}

/** What a screen reader hears on a panel (AC-29: the full room name even where the drawn one is cut with "…"). */
export function panelLabel(r: HomeRoom, pastYear: boolean): string {
  if (headCount(r) === 0) return `${r.name} ยังไม่มีนักเรียน`;
  // no rate = nothing handed in or missing yet: either no open work at all, or work that is not due yet. Unknown is never 0 (R-3502).
  const sent = r.rate != null ? `${r.rate}%` : r.openCount === 0 ? "ยังไม่มีงานเปิดรับ" : `— (งานเปิดรับ ${r.openCount} งาน ยังไม่ถึงกำหนด)`;
  const fu = followCount(r);
  return [
    `${r.name} ส่งงาน ${sent}`,
    `ส่งแล้ว ${r.submitted} รอตรวจ ${r.awaiting} ค้างส่ง ${r.missing} ส่งช้า ${r.late}`,
    pastYear ? null : attWords(r),
    fu > 0 ? `ต้องติดตาม ${fu} คน` : "ไม่มีคนค้างมาก",
    "แตะเพื่อดูรายละเอียด",
  ].filter(Boolean).join(" · ");
}

/** The rows that count in the strip and the sheet (tomorrow's rows are listed apart and never counted). */
export const countedRows = (todo: TodayRow[]): TodayRow[] => todo.filter((r) => !r.later);
export const laterRows = (todo: TodayRow[]): TodayRow[] => todo.filter((r) => r.later);

/** Tone and icon of a row's level word, shared with the other layouts (T-33 §7). */
export const LEVEL_TONE = { must: "danger", should: "warning", later: "muted" } as const;
export const LEVEL_ICON = { must: "warning-octagon", should: "warning", later: "coffee" } as const;

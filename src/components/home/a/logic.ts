// Layout ก: the little decisions that are only about how ก draws things. Every number comes from the shared model (T-33):
// nothing here is a new formula, only picking words and grouping what the model already worked out.
import { assignmentFraction, assignmentRate } from "@shared/metrics";
import type { OverdueItem, TodayRow } from "../../../lib/homeLogic";
import type { HomeModel, HomeRoom } from "../meta";

/** AC-20 / AC-20a: "ชื่องาน · เลย N วัน · ค้าง X". Work with no due date (daysLate 0) never says "เลย 0 วัน". */
export function overdueText(o: Pick<OverdueItem, "title" | "daysLate" | "missing">): string {
  return [o.title, o.daysLate > 0 ? `เลย ${o.daysLate} วัน` : null, `ค้าง ${o.missing}`].filter(Boolean).join(" · ");
}

/** The roll-call figures of the rooms that have been checked (AC-18: "ห้องที่เช็คแล้ว: มา · สาย · ลา · ป่วย · ขาด"). */
export function attTotals(rooms: HomeRoom[]) {
  const t = { present: 0, late: 0, leave: 0, sick: 0, absent: 0, checked: 0 };
  for (const r of rooms) {
    const a = r.att;
    if (!a || a.marked <= 0) continue;
    t.present += a.present; t.late += a.late; t.leave += a.leave; t.sick += a.sick; t.absent += a.absent; t.checked++;
  }
  return t;
}

/** One chip per room on the roll-call row (AC-18): "ป.6/1 ครบ 32/32" · "ป.5/1 ยังไม่เช็ค" (a room with nobody in it is left out). */
export function roomChips(rooms: HomeRoom[]): { classId: string; ok: boolean; partial: boolean; text: string }[] {
  return rooms.filter((r) => r.att && r.att.total > 0).map((r) => {
    const a = r.att!;
    if (a.progress === "complete") return { classId: r.classId, ok: true, partial: false, text: `${r.name} ครบ ${a.marked}/${a.total}` };
    if (a.progress === "partial") return { classId: r.classId, ok: false, partial: true, text: `${r.name} เช็คบางส่วน ${a.marked}/${a.total}` };
    return { classId: r.classId, ok: false, partial: false, text: `${r.name} ยังไม่เช็ค` };
  });
}

/** AC-19: the bar of each room of a work due: handed in / counted, from the open work's own per-room figures. */
export function dueRoomBars(model: HomeModel, row: TodayRow): { classId: string; name: string; pct: number; fraction: string }[] {
  const due = row.due;
  if (!due) return [];
  const per = model.d.openAssignments.find((a) => a.assignment.id === due.assignment.id)?.perClass ?? [];
  return due.classes.flatMap((c) => {
    const p = per.find((x) => x.classId === c.classId);
    if (!p) return [];
    return [{ classId: c.classId, name: model.rooms.find((r) => r.classId === c.classId)?.name ?? "", pct: assignmentRate(p), fraction: assignmentFraction(p) }];
  });
}

/** R-3401/R-3601: what a room's "handed in" figure says. Unknown is not 0: a room with work open but nothing due yet has no rate and no bar. */
export function roomRateSay(r: Pick<HomeRoom, "rate" | "openCount">): { kind: "none" | "notDue" | "rate"; text: string } {
  if (r.openCount === 0) return { kind: "none", text: "ยังไม่มีงานเปิดรับ" };
  if (r.rate == null) return { kind: "notDue", text: `งานเปิดรับ ${r.openCount} งาน ยังไม่ถึงกำหนด` };
  return { kind: "rate", text: `ส่งงาน ${r.rate}%` };
}

/** More than this many "due today" rows are folded into one line that opens (ux: "ข้อมูลเยอะ"). */
export const DUE_FOLD_AFTER = 3;

export type TimelineItem = { type: "row"; row: TodayRow } | { type: "dueFold"; rows: TodayRow[] };

/** The rows in the model's order; many due-today rows become one "ครบกำหนดวันนี้ N งาน" item where the first of them stood. */
export function timelineItems(rows: TodayRow[]): TimelineItem[] {
  const dues = rows.filter((r) => r.kind === "due");
  if (dues.length <= DUE_FOLD_AFTER) return rows.map((row) => ({ type: "row", row }));
  const out: TimelineItem[] = [];
  let placed = false;
  for (const row of rows) {
    if (row.kind !== "due") out.push({ type: "row", row });
    else if (!placed) { out.push({ type: "dueFold", rows: dues }); placed = true; }
  }
  return out;
}

/** Tone of a row's label: words always, and colours from the shared tokens (T-33 §7). */
export const LEVEL_TONE = { must: "danger", should: "warning", later: "muted" } as const;
export const LEVEL_ICON = { must: "warning-octagon", should: "warning", later: "coffee" } as const;

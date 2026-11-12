// Layout ค: the little decisions that are only about how ค draws things. Every number comes from the shared model (T-33):
// nothing here is a new formula, only picking which row stands in the focus box and what the "ต่อจากนี้" list shows.
import type { TodayRow } from "../../../lib/homeLogic";

/** The rows that count (BR-01): the model's list without tomorrow's work, in the model's order (a "ทำทีหลัง" row is already at the end: BR-02). */
export const focusQueue = (todo: TodayRow[]): TodayRow[] => todo.filter((r) => !r.later);

/** The row in the big box: the one the teacher pulled up (AC-31), else the first of the queue. A picked row that has gone (data changed) is forgotten. */
export function pickFocus(queue: TodayRow[], picked: string | null): TodayRow | undefined {
  return (picked ? queue.find((r) => r.key === picked) : undefined) ?? queue[0];
}

/** "ต่อจากนี้": every other counted row with its place in the queue ("2 จาก 5" is the place of the first of them when row 1 is in the box). */
export function nextRows(queue: TodayRow[], focusKey: string | undefined): { row: TodayRow; pos: number }[] {
  return queue.flatMap((row, i) => (row.key === focusKey ? [] : [{ row, pos: i + 1 }]));
}

/** More rows than this are folded behind "ดูทั้งหมด" (ux: ข้อมูลเยอะ — 4 rows, then a button). */
export const NEXT_SHOWN = 4;

/** The roll-call figures of the rooms that have been checked, as the ring and its legend draw them. */
export const ATT_KEYS = ["present", "late", "leave", "sick", "absent"] as const;
export type AttKey = (typeof ATT_KEYS)[number];
export const ATT_TH: Record<AttKey, string> = { present: "มา", late: "สาย", leave: "ลา", sick: "ป่วย", absent: "ขาด" };
export const ATT_ICON: Record<AttKey, string> = { present: "check", late: "clock", leave: "envelope-simple", sick: "thermometer", absent: "x" };

/** Ring segments (dash length / offset out of the circumference). Empty statuses get none; one left over takes the whole ring. */
export function ringSegments(vals: Record<AttKey, number>, circumference: number, gap = 3): { key: AttKey; len: number; off: number }[] {
  const parts = ATT_KEYS.filter((k) => vals[k] > 0);
  const tot = parts.reduce((s, k) => s + vals[k], 0);
  if (tot === 0) return [];
  const g = parts.length > 1 ? gap : 0;
  let off = 0;
  return parts.map((key) => {
    const len = (vals[key] / tot) * circumference;
    const seg = { key, len: Math.max(len - g, 1), off };
    off += len;
    return seg;
  });
}

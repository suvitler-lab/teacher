// Helpers for the "do this today" rows that every layout shares.
import { studentsById, classById } from "../../store";
import { formatThaiDateMs } from "../../lib/dates";
import { followUpText } from "../../lib/report";
import { notify } from "../../lib/notify";
import type { DueGroup } from "../../lib/homeLogic";

/** "คัดลอกรายชื่อไป LINE" for work due, ONE ROOM at a time: only that room's children who have not handed in (the same text as the old card; never names across rooms). Not offered while names are hidden. */
export function copyDueToLine(g: DueGroup, classId: string): void {
  const room = g.classes.find((c) => c.classId === classId);
  if (!room) return;
  const kids = room.studentIds.map((id) => studentsById.value.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
  const rooms = classById(classId)?.name ?? "";
  const text = followUpText(kids.map((s) => ({ student: s, missing: [g.assignment.title] })), `${rooms} ${g.assignment.title}`.trim(), formatThaiDateMs(Date.now()));
  navigator.clipboard?.writeText(text).then(() => notify("success", "คัดลอกแล้ว วางใน LINE ได้เลย"), () => notify("error", "คัดลอกไม่สำเร็จ"));
}

/**
 * Says the big number out loud when it changes (AC-21: a row went away because the data changed, 5 -> 4). Nothing is read on first show.
 * A plain aria-live region (not role=status) so the page keeps one status banner at a time.
 */
export function TodayLive({ count, said }: { count: number; said?: string }) {
  return <span class="sr-only" aria-live="polite" aria-atomic="true">{said ?? (count > 0 ? `เหลือ ${count} อย่างที่ต้องทำวันนี้` : "เคลียร์ครบแล้ว")}</span>;
}

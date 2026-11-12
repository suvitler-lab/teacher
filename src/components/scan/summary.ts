import type { Assignment, Student } from "@shared/types";
import { percentOf } from "@shared/metrics";
import type { SubState } from "./state";

/** BR-14: the four ways a hand-in is received, in the order the summary line says them. Icon + word (never the icon alone). */
export const HOW: { key: string; icon: string; word: string }[] = [
  { key: "hid", icon: "barcode", word: "เครื่องยิง" },
  { key: "camera", icon: "camera", word: "กล้อง" },
  { key: "manual", icon: "keyboard", word: "พิมพ์" },
  { key: "grid", icon: "hand-finger", word: "แตะตาราง" },
];

export interface RoundNumbers {
  submitted: Student[];
  /** handed in, score still empty (the "รับงานก่อน" mode) */
  ungraded: Student[];
  /** not handed in and not excused (BR-14) */
  missing: Student[];
  excused: Student[];
  /** handed in late (the server's flag) */
  late: number;
  /** handed in but the server has not said yet whether it is late (still waiting to be sent) — never guessed (BR-13) */
  lateUnknown: number;
  /** submitted + missing — the ring's whole (BR-13: excused are not counted) */
  counted: number;
  /** % of `counted`, `percentOf`; null when nobody is counted */
  pct: number | null;
  /** hand-ins made in THIS round, by method (only methods that are > 0, in HOW order) */
  how: { key: string; icon: string; word: string; n: number }[];
}

/** The numbers of one room for one work — the same ones the scan page shows (BR-13/BR-14). `subOf` already puts this device's unsent ops on top. */
export function roundNumbers(roundId: string, students: Student[], subOf: (studentId: string) => SubState | undefined, howOf?: (studentId: string) => string | undefined): RoundNumbers {
  const submitted: Student[] = [], ungraded: Student[] = [], missing: Student[] = [], excused: Student[] = [];
  let late = 0, lateUnknown = 0;
  const byMethod = new Map<string, number>();
  for (const st of students) {
    const sub = subOf(st.id);
    if (sub?.status === "submitted") {
      submitted.push(st);
      if (sub.score == null) ungraded.push(st);
      if (sub.late === true) late++;
      else if (sub.late === undefined) lateUnknown++;
      // the way it was first received on this device wins over the server's last `method` (the score op overwrites that one)
      const how = (howOf?.(st.id)) ?? sub.method;
      if (sub.sid === roundId && how) byMethod.set(how, (byMethod.get(how) ?? 0) + 1);
    } else if (sub?.status === "excused") excused.push(st);
    else missing.push(st);
  }
  const counted = submitted.length + missing.length;
  return {
    submitted, ungraded, missing, excused, late, counted, lateUnknown, pct: percentOf(submitted.length, counted),
    how: HOW.map((h) => ({ ...h, n: byMethod.get(h.key) ?? 0 })).filter((h) => h.n > 0),
  };
}

export interface NextRoom { classId: string; name: string; done: number; of: number }

/**
 * BR-16: the first room after this one in the work's own order (wrapping round) that is still in use and has someone
 * who has not handed in. "ส่งแล้ว x/y" is the scan page's own: handed in over (handed in + not handed in), excused not counted.
 * No such room (a one-room work, or every other room is done) → null: no button.
 */
export function nextRoom(
  asg: Pick<Assignment, "class_ids"> | undefined, currentId: string, activeIds: Set<string>, nameOf: (id: string) => string,
  studentsOf: (classId: string) => Student[], subOf: (studentId: string) => SubState | undefined,
): NextRoom | null {
  const ids = asg?.class_ids ?? [];
  const at = ids.indexOf(currentId);
  const order = at < 0 ? ids : [...ids.slice(at + 1), ...ids.slice(0, at)];
  for (const cid of order) {
    if (cid === currentId || !activeIds.has(cid)) continue;
    const n = roundNumbers("", studentsOf(cid), subOf);
    if (n.missing.length > 0) return { classId: cid, name: nameOf(cid), done: n.submitted.length, of: n.counted };
  }
  return null;
}

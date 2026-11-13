// Copy a term's timetable into another (BR-07, D54). Pure: the store fetches the source, this decides what carries over.
// Same year → every slot; a new year → rooms are matched by name (trimmed) to the target year's open rooms.
import type { FrameInput, Slot, Weekday } from "@shared/timetable";
import { normalizeSlots } from "@shared/timetable";
import { classInYear } from "@shared/roster";
import type { Class, Subject, Term } from "@shared/types";
import { DAY_NAMES, MSG } from "./messages";

export type SkipReason = "no_room" | "archived" | "outside_frame";

export interface SkippedSlot {
  weekday: Weekday;
  period: number;
  reason: SkipReason;
  className: string | null; // the source room's name (what could not be matched)
}

export interface CopyPlan {
  slots: Slot[]; // the whole new table, ready for PUT reason "copy"
  copied: number;
  skipped: SkippedSlot[];
  sameYear: boolean;
  message: string; // "คัดลอก 14 คาบแล้ว" · "คัดลอก 11 คาบ · ไม่ได้คัดลอก 3 คาบ: ป.6/4 ไม่มีในปี 2570 (จันทร์ คาบ 5 · …)"
  skippedText: string | null; // the second half of the message, or null
}

export interface CopyInput {
  sourceSlots: Slot[];
  sourceTerm: Pick<Term, "id" | "year">;
  targetTerm: Pick<Term, "id" | "year">;
  frame: FrameInput;
  classes: Class[]; // every room the app knows (all years)
  subjects: Subject[];
}

const trimName = (s: string) => s.trim();
const slotText = (s: { weekday: Weekday; period: number }) => `${DAY_NAMES[s.weekday]} คาบ ${s.period}`;

/** Work out the copy. Never touches the source; activities always carry over (if inside the frame). */
export function planCopy(input: CopyInput): CopyPlan {
  const { sourceTerm, targetTerm, frame } = input;
  const sameYear = sourceTerm.year === targetTerm.year;
  const classById = new Map(input.classes.map((c) => [c.id, c]));
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]));
  // the target year's open rooms by trimmed name (first one wins; names are unique per year in practice)
  const targetByName = new Map<string, Class>();
  for (const c of input.classes) {
    if (c.archived || !classInYear(c.year, targetTerm.year)) continue;
    const k = trimName(c.name);
    if (!targetByName.has(k)) targetByName.set(k, c);
  }

  const out: Slot[] = [];
  const skipped: SkippedSlot[] = [];
  for (const s of input.sourceSlots) {
    if (!frame.days.includes(s.weekday) || s.period < 1 || s.period > frame.periods.length) {
      skipped.push({ weekday: s.weekday, period: s.period, reason: "outside_frame", className: s.classId ? classById.get(s.classId)?.name ?? null : null });
      continue;
    }
    if (s.kind === "activity") { out.push({ ...s }); continue; }
    const srcClass = s.classId ? classById.get(s.classId) : undefined;
    const subject = s.subjectId ? subjectById.get(s.subjectId) : undefined;
    const name = srcClass?.name ?? null;
    if (s.subjectId && (!subject || subject.archived)) {
      skipped.push({ weekday: s.weekday, period: s.period, reason: "archived", className: name });
      continue;
    }
    if (sameYear) {
      if (!srcClass || srcClass.archived) {
        skipped.push({ weekday: s.weekday, period: s.period, reason: "archived", className: name });
        continue;
      }
      out.push({ ...s });
      continue;
    }
    const match = name ? targetByName.get(trimName(name)) : undefined;
    if (!match) {
      skipped.push({ weekday: s.weekday, period: s.period, reason: "no_room", className: name });
      continue;
    }
    out.push({ ...s, classId: match.id });
  }

  const slots = normalizeSlots(out);
  const skippedText = skipped.length === 0 ? null : describeSkipped(skipped, targetTerm.year);
  const base = MSG.copied(slots.length);
  return {
    slots,
    copied: slots.length,
    skipped,
    sameYear,
    skippedText,
    message: skippedText ? `คัดลอก ${slots.length} คาบ · ไม่ได้คัดลอก ${skipped.length} คาบ: ${skippedText}` : base,
  };
}

/** "ป.6/4 ไม่มีในปี 2570 (จันทร์ คาบ 5 · พุธ คาบ 2 · ศุกร์ คาบ 3)" — grouped by room, then the other reasons. */
function describeSkipped(skipped: SkippedSlot[], targetYear: number): string {
  const parts: string[] = [];
  const byRoom = new Map<string, SkippedSlot[]>();
  for (const s of skipped.filter((x) => x.reason === "no_room")) {
    const k = s.className ?? "ห้องที่ไม่ทราบชื่อ";
    byRoom.set(k, [...(byRoom.get(k) ?? []), s]);
  }
  for (const [room, list] of byRoom) parts.push(`${room} ไม่มีในปี ${targetYear} (${list.sort(bySlot).map(slotText).join(" · ")})`);
  const archived = skipped.filter((x) => x.reason === "archived").sort(bySlot);
  if (archived.length) parts.push(`ห้องหรือวิชาที่เก็บแล้ว (${archived.map(slotText).join(" · ")})`);
  const outside = skipped.filter((x) => x.reason === "outside_frame").sort(bySlot);
  if (outside.length) parts.push(`อยู่นอกโครงเวลา (${outside.map(slotText).join(" · ")})`);
  return parts.join(" · ");
}

const bySlot = (a: { weekday: number; period: number }, b: { weekday: number; period: number }) => a.weekday - b.weekday || a.period - b.period;

export interface CopySource { termId: string; name: string; count: number }

/**
 * The term to offer "คัดลอกจากภาค …" from: the nearest EARLIER term that has at least one slot (BR-07).
 * `counts` = GET /api/timetable `counts` (only terms with ≥ 1 slot).
 */
export function pickCopySource(terms: Pick<Term, "id" | "year" | "term" | "name">[], counts: { termId: string; slots: number }[], targetId: string): CopySource | null {
  const target = terms.find((t) => t.id === targetId);
  if (!target) return null;
  const order = (t: { year: number; term: number }) => t.year * 10 + t.term;
  const withSlots = new Map(counts.filter((c) => c.slots > 0).map((c) => [c.termId, c.slots]));
  const prev = terms
    .filter((t) => t.id !== targetId && order(t) < order(target) && withSlots.has(t.id))
    .sort((a, b) => order(b) - order(a))[0];
  return prev ? { termId: prev.id, name: prev.name, count: withSlots.get(prev.id) as number } : null;
}

// Pure rules of the students page (BR-44 numbers · BR-46 search · BR-45 numbers). No new formulas: the per-child numbers come from
// computeReport (BR-37) and the class average from averageAttendancePercent (D24).
import type { Student } from "@shared/types";
import { averageAttendancePercent } from "@shared/metrics";
import type { StudentReport } from "../../lib/report";
import { fullName } from "../../lib/names";

/** The label of a child on screen: the full name, or "เลขที่ N" when names are hidden ("เลขที่ –" with no number, A16). */
export function whoLabel(st: Pick<Student, "number" | "prefix" | "first_name" | "last_name">, hide: boolean): string {
  return hide ? `เลขที่ ${st.number ?? "–"}` : fullName(st as Student);
}

/** BR-46 matching of one child: 1-2 digits = the class number as a whole · otherwise a part of name, surname, nickname, code, prefix. Hidden = number only. */
export function matchesQuery(s: Student, rawQuery: string, hide: boolean): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const numeric = /^\d{1,2}$/.test(q);
  if (s.number != null && String(s.number) === q) return true;
  if (hide || numeric) return false;
  return [s.first_name, s.last_name, s.nickname, s.code, s.prefix].some((v) => (v ?? "").toLowerCase().includes(q));
}

export const searchRoster = (list: Student[], q: string, hide: boolean): Student[] => (q.trim() ? list.filter((s) => matchesQuery(s, q, hide)) : list);

/** BR-46 "all rooms": active children of the other rooms of this year (not moved / inactive / finished), by room then number. Off when hidden. */
export function searchAllRooms(all: Student[], roomIds: string[], currentClassId: string, q: string, hide: boolean): Student[] {
  if (hide || !q.trim()) return [];
  const order = new Map(roomIds.map((id, i) => [id, i]));
  return all
    .filter((s) => s.status === "active" && s.class_id && s.class_id !== currentClassId && order.has(s.class_id) && matchesQuery(s, q, false))
    .sort((a, b) => (order.get(a.class_id!)! - order.get(b.class_id!)!) || (a.number ?? 1e9) - (b.number ?? 1e9));
}

export interface HeroNumbers {
  total: number; withMissing: number; done: number; avgAtt: number | null;
  attended: number; sessions: number; missingKids: Student[];
}
/** BR-44: นักเรียน = active · มีงานค้าง = missing > 0 · ส่งงานครบ = active − มีงานค้าง · มาเรียนเฉลี่ย = pooled (null = "—"). */
export function heroNumbers(active: Student[], reports: Map<string, StudentReport>): HeroNumbers {
  const missingKids = active.filter((s) => (reports.get(s.id)?.missing ?? 0) > 0);
  const atts = active.map((s) => reports.get(s.id)?.attendance).filter((a): a is NonNullable<typeof a> => !!a);
  const attended = atts.reduce((n, a) => n + a.present + a.late, 0);
  const sessions = atts.reduce((n, a) => n + a.present + a.late + a.leave + a.sick + a.absent, 0);
  return { total: active.length, withMissing: missingKids.length, done: active.length - missingKids.length, avgAtt: averageAttendancePercent(atts), attended, sessions, missingKids };
}

/** BR-45: two or more active children on one number · children with no number. */
export function duplicateNumbers(active: Student[]): [number, Student[]][] {
  const by = new Map<number, Student[]>();
  for (const s of active) if (s.number != null) by.set(s.number, [...(by.get(s.number) ?? []), s]);
  return [...by.entries()].filter(([, kids]) => kids.length > 1).sort((a, b) => a[0] - b[0]);
}
export const withoutNumber = (active: Student[]): Student[] => active.filter((s) => s.number == null);

/** The two first names for the hero line ("กานดา ธีรา") — or the numbers when names are hidden. */
export function missingLine(kids: Student[], hide: boolean): string {
  if (kids.length === 0) return "";
  const parts = kids.slice(0, 3).map((k) => (hide ? `เลขที่ ${k.number ?? "–"}` : k.first_name));
  return parts.join(" ") + (kids.length > 3 ? " …" : "");
}

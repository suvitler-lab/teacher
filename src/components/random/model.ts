// Pure numbers and labels of the random-name page (T-44). The page and its tests read every figure from here, so the hero,
// the ring, the side panels and the announcements can never disagree (BR-24). The draw itself (pickNext / shuffle /
// attendancePool in src/lib/random.ts) is NOT changed: this file only counts what it produced.
import type { Student } from "@shared/types";
import { percentOf } from "@shared/metrics";
import { remainingInRound } from "../../lib/random";
import { shortName, fullName } from "../../lib/names";

export interface RoundCounts {
  /** how many can be drawn now (the pool after "who came" and the number range) */
  N: number;
  /** still not drawn this round: remainingInRound */
  m: number;
  /** drawn this round: N - m (not the length of the history, which can hold people outside the pool) */
  n: number;
  /** "no repeat" is on and everybody in the pool has been drawn */
  full: boolean;
  /** ring: n / N as a whole percent (null when nobody can be drawn) */
  pct: number | null;
}

export function roundCounts<T extends { id: string }>(pool: T[], called: Set<string>, noRepeat: boolean): RoundCounts {
  const N = pool.length;
  const m = remainingInRound(pool, called);
  const n = N - m;
  return { N, m, n, full: noRepeat && N > 0 && m === 0, pct: percentOf(n, N) };
}

/** Groups: k = how many groups, size = "about how many each". BR-26 (unchanged rules, only named here). */
export function groupPlan(N: number, count: number, byGroups: boolean): { k: number; size: number } {
  const k = byGroups ? Math.max(1, Math.min(N, count)) : Math.max(1, Math.round(N / count));
  return { k, size: Math.round(N / k) };
}

export const byNumber = (a: Student, b: Student) => (a.number ?? 9999) - (b.number ?? 9999);

/** Names that may be hidden: with `hide` on only the number is left (T-45 turns it on per page). */
export const shortLabel = (s: Student, hide: boolean) => (hide ? `เลขที่ ${s.number ?? "-"}` : shortName(s));
export const fullLabel = (s: Student, hide: boolean) => (hide ? `เลขที่ ${s.number ?? "-"}` : fullName(s));

export interface OptionBits { want: number; pair: boolean; noRepeat: boolean; timer: number | null; range: [number, number] | null }
/** The one line under the draw button: "สุ่ม 3 คน · ไม่ซ้ำจนครบ · จับเวลา 30 วิ" */
export function optionSummary(o: OptionBits): string {
  const parts = [o.pair ? "จับคู่ 2 คน" : `สุ่ม ${o.want} คน`, o.noRepeat ? "ไม่ซ้ำจนครบ" : "ซ้ำได้"];
  if (o.timer) parts.push(`จับเวลา ${o.timer} วิ`);
  if (o.range) parts.push(`ช่วงเลขที่ ${o.range[0]}–${o.range[1]}`);
  return parts.join(" · ");
}

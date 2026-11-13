// Small helpers every timetable layout shares: the entries of a term by cell, the spoken text of a cell,
// where "now" falls, and the two screen-size questions (phone · very large text).
import { useEffect, useState } from "preact/hooks";
import type { Frame, Weekday } from "@shared/timetable";
import { bangkok, ttNowMs } from "../../lib/timetable/clock";
import { buildEntries, toMin, type TtEntry } from "../../lib/timetable/logic";
import { dayWord } from "../../lib/timetable/messages";
import { ttInputFor } from "../../lib/timetable/store";
import { terms } from "../../store";

export const keyOf = (w: number, p: number) => `${w}:${p}`;

/** Entries of a term by "weekday:period" (archived ones included, flagged). Reads signals: call it while rendering. */
export function entryMap(termId: string): Map<string, TtEntry> {
  const input = ttInputFor(termId);
  const m = new Map<string, TtEntry>();
  if (!input) return m;
  for (const e of buildEntries(input, { includeArchived: true })) m.set(keyOf(e.weekday, e.period), e);
  return m;
}

/** The sentence a screen reader says for one cell (AC-34). */
export function cellSpoken(frame: Frame, weekday: Weekday, period: number, e: TtEntry | undefined, isNow: boolean, mode: { readOnly?: boolean; offline?: boolean } = {}): string {
  const p = frame.periods[period - 1];
  const head = `${dayWord(weekday)} คาบ ${period}`;
  // an empty cell that cannot add (old year / offline) is not announced as an "add" button (R-17)
  if (!e) return mode.readOnly || mode.offline ? `ว่าง · ${head}` : `${head} ว่าง ปุ่มเพิ่มคาบ`;
  const what = e.kind === "activity" ? `กิจกรรม ${e.label ?? ""}` : e.title;
  return `${head} ${p.start} ถึง ${p.end} ${what}${e.archived ? " ห้องเก็บแล้ว" : ""}${isNow ? " กำลังเรียนอยู่ตอนนี้" : ""}`;
}

export interface TodayInfo {
  live: boolean; // the term shown is the current one (only then "วันนี้" / "ตอนนี้" are drawn)
  weekday: Weekday;
  isSchoolDay: boolean;
  period: number | null; // the period the clock is inside, filled or not
}

/** Where the clock is on a term's frame. Only the current term has a "today". */
export function todayInfo(termId: string, frame: Frame): TodayInfo {
  const t = bangkok(ttNowMs.value);
  const live = !!terms.value.find((x) => x.id === termId)?.is_current;
  const i = frame.periods.findIndex((p) => toMin(p.start) * 60 <= t.seconds && t.seconds < toMin(p.end) * 60);
  return { live, weekday: t.weekday, isSchoolDay: frame.days.includes(t.weekday), period: live && frame.days.includes(t.weekday) && i >= 0 ? i + 1 : null };
}

function useQuery(q: string): boolean {
  const get = () => { try { return typeof matchMedia === "function" && !!matchMedia(q)?.matches; } catch { return false; } };
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    let m: MediaQueryList | undefined;
    try { m = matchMedia(q); } catch { return; }
    if (!m) return;
    const f = () => setOn(!!m!.matches);
    m.addEventListener?.("change", f);
    return () => m!.removeEventListener?.("change", f);
  }, []);
  return on;
}

/** A phone-wide screen: every layout shows one day at a time (BR-12). */
export const useMobile = () => useQuery("(max-width: 640px)");

/** The app's largest text (≥ 22px): the week table gives way to a list of days (ux: "ตัวอักษรใหญ่สุด"). */
export function useBigText(): boolean {
  const read = () => { try { return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22; } catch { return false; } };
  const [on, setOn] = useState(read);
  useEffect(() => {
    const f = () => setOn(read());
    window.addEventListener("resize", f);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(f) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-font"] });
    return () => { window.removeEventListener("resize", f); mo?.disconnect(); };
  }, []);
  return on;
}

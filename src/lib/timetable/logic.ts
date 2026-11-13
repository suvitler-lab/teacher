// Timetable logic (pure): "now / next" (BR-04), the strip and the home rows (BR-14), the shortcut room (BR-15),
// weekly totals (BR-05) and the mobile day (BR-12). Nothing here reads a clock — callers pass `nowMs`
// (from clock.ts `now()`), and every day/time is Asia/Bangkok.
import type { Frame, FrameInput, Slot, Weekday } from "@shared/timetable";
import { addDays, bangkok } from "./clock";
import { MSG, nextDayLabel, nextLine, nowLine, stripSentence } from "./messages";

export interface RefLite { id: string; name: string; archived: boolean }
export interface TermLite { start_date?: string | null; end_date?: string | null }

export interface TtInput {
  slots: Slot[];
  frame: FrameInput;
  term: TermLite | null; // the current term (null = none: nothing shows)
  classes: RefLite[];
  subjects: RefLite[];
}

/** A slot placed on the frame's clock, with the names a screen needs. */
export interface TtEntry {
  weekday: Weekday;
  period: number;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  kind: Slot["kind"];
  classId: string | null;
  subjectId: string | null;
  label: string | null;
  className: string | null;
  subjectName: string | null;
  title: string; // "คณิตศาสตร์ ป.6/4" · "ป.6/1" · the activity name
  archived: boolean; // its room or subject is archived (BR-06)
}

export const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const sameKey = (a: { weekday: number; period: number }, b: { weekday: number; period: number }) => a.weekday === b.weekday && a.period === b.period;

/** Slots inside the frame (school day + period within the count), placed on the clock. Archived ones are kept, flagged. */
export function buildEntries(input: TtInput, opts: { includeArchived?: boolean } = {}): TtEntry[] {
  const { frame } = input;
  const cls = new Map(input.classes.map((c) => [c.id, c]));
  const sub = new Map(input.subjects.map((s) => [s.id, s]));
  const out: TtEntry[] = [];
  for (const s of input.slots) {
    if (!frame.days.includes(s.weekday) || s.period < 1 || s.period > frame.periods.length) continue;
    const p = frame.periods[s.period - 1];
    const c = s.classId ? cls.get(s.classId) : undefined;
    const sb = s.subjectId ? sub.get(s.subjectId) : undefined;
    // a room or subject the app does not know is as unusable as an archived one
    const archived = s.kind === "class" && (!c || c.archived || (!!s.subjectId && (!sb || sb.archived)));
    if (archived && !opts.includeArchived) continue;
    const className = c?.name ?? null;
    const subjectName = sb?.name ?? null;
    out.push({
      weekday: s.weekday, period: s.period, start: p.start, end: p.end, startMin: toMin(p.start), endMin: toMin(p.end),
      kind: s.kind, classId: s.classId, subjectId: s.subjectId, label: s.label, className, subjectName,
      title: s.kind === "activity" ? (s.label ?? "") : [subjectName, className].filter(Boolean).join(" "),
      archived,
    });
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
}

export interface NowBreak { kind: "break"; name: string; start: string; end: string }
export interface NowPeriod { kind: "period"; entry: TtEntry }
export interface NextInfo { entry: TtEntry; offset: number; dayLabel: string }

export interface Shortcut {
  kind: "now" | "next"; // "now" = the room being taught now · "next" = the next teaching period of today
  entry: TtEntry;
  classId: string;
  className: string;
  attendanceLabel: string; // "เช็คชื่อ ป.6/4" / "เช็คชื่อ ป.6/3 (คาบต่อไป)"
  scanLabel: string; // "สแกนงาน"
  attendanceHref: string; // "#/attendance?class=<id>"
  scanHref: string; // "#/scan?class=<id>"
}

export interface StripCell {
  type: "period" | "break";
  period?: number;
  name?: string;
  start: string;
  end: string;
  entry: TtEntry | null; // null = free (or a break); archived entries are present with `archived`
  status: "past" | "now" | "later"; // by the clock
  live: boolean; // status "now" AND something is being taught/done (use this for the word "ตอนนี้")
}

export interface HomeRow {
  entry: TtEntry;
  isNow: boolean;
  shortcut: boolean; // the shortcut button sits on this row (and no other)
}

export interface DaySnapshot {
  visible: boolean; // the strip shows (something now or next)
  date: string;
  weekday: Weekday;
  isSchoolDay: boolean;
  termEnded: boolean;
  now: NowPeriod | NowBreak | null;
  next: NextInfo | null;
  shortcut: Shortcut | null;
  cells: StripCell[];
  rows: { current: HomeRow | null; later: HomeRow[] }; // order on the home list: current → the old work rows → later
  nowText: string | null;
  nextText: string | null;
  sentence: string; // one sentence for a screen reader
  announcement: string; // for the polite live region
}

const EMPTY: Omit<DaySnapshot, "date" | "weekday" | "isSchoolDay" | "termEnded"> = {
  visible: false, now: null, next: null, shortcut: null, cells: [], rows: { current: null, later: [] },
  nowText: null, nextText: null, sentence: "", announcement: "",
};

/** The shortcut room (BR-15): the room being taught now, else the next teaching period TODAY, else none. */
export function shortcutFor(entries: TtEntry[], weekday: Weekday, nowSec: number): Shortcut | null {
  const teaching = entries.filter((e) => e.weekday === weekday && e.kind === "class" && !e.archived && e.classId && e.className);
  const running = teaching.find((e) => e.startMin * 60 <= nowSec && nowSec < e.endMin * 60);
  const later = running ? undefined : teaching.filter((e) => e.startMin * 60 > nowSec).sort((a, b) => a.startMin - b.startMin)[0];
  const e = running ?? later;
  if (!e) return null;
  const id = e.classId as string;
  return {
    kind: running ? "now" : "next",
    entry: e,
    classId: id,
    className: e.className as string,
    attendanceLabel: MSG.shortcutAttendance(e.className as string, !running),
    scanLabel: MSG.shortcutScan,
    attendanceHref: `#/attendance?class=${encodeURIComponent(id)}`,
    scanHref: `#/scan?class=${encodeURIComponent(id)}`,
  };
}

/** Everything the home page needs for one instant. */
export function snapshot(input: TtInput, nowMs: number): DaySnapshot {
  const t = bangkok(nowMs);
  const nowSec = t.seconds;
  const base = { date: t.date, weekday: t.weekday, isSchoolDay: input.frame.days.includes(t.weekday), termEnded: false };
  const term = input.term;
  if (!term) return { ...EMPTY, ...base };
  if (term.end_date && t.date > term.end_date) return { ...EMPTY, ...base, termEnded: true };

  const entries = buildEntries(input);
  if (entries.length === 0) return { ...EMPTY, ...base }; // an empty table (or only archived rooms) shows nothing
  const today = entries.filter((e) => e.weekday === t.weekday);

  // now: a period that has started and not ended, or a break that spans this moment
  let now: DaySnapshot["now"] = null;
  if (base.isSchoolDay) {
    const run = today.find((e) => e.startMin * 60 <= nowSec && nowSec < e.endMin * 60);
    if (run) now = { kind: "period", entry: run };
    else {
      const br = input.frame.breaks.find((b) => toMin(b.start) * 60 <= nowSec && nowSec < toMin(b.end) * 60);
      if (br && !hasPeriodAt(input.frame, nowSec)) now = { kind: "break", name: br.name, start: br.start, end: br.end };
    }
  }

  // next: the first period today that starts later, else the first of the next school day that has one (≤ 7 days, within the term)
  let next: NextInfo | null = null;
  const later = today.find((e) => e.startMin * 60 > nowSec);
  if (later) next = { entry: later, offset: 0, dayLabel: "" };
  else {
    for (let off = 1; off <= 7; off++) {
      if (term.end_date && addDays(t.date, off) > term.end_date) break;
      const wd = ((t.weekday - 1 + off) % 7 + 1) as Weekday;
      const e = entries.find((x) => x.weekday === wd);
      if (e) { next = { entry: e, offset: off, dayLabel: nextDayLabel(off, wd) }; break; }
    }
  }

  if (!now && !next) return { ...EMPTY, ...base };

  const shortcut = shortcutFor(entries, t.weekday, nowSec);
  const all = buildEntries(input, { includeArchived: true }).filter((e) => e.weekday === t.weekday);
  const cells = base.isSchoolDay ? stripCells(input.frame, all, nowSec) : [];

  const open = today.filter((e) => e.endMin * 60 > nowSec);
  const mk = (e: TtEntry): HomeRow => ({ entry: e, isNow: e.startMin * 60 <= nowSec, shortcut: !!shortcut && sameKey(shortcut.entry, e) });
  const rows = open.map(mk);
  const current = rows.find((r) => r.isNow) ?? null;

  const nowText = now ? (now.kind === "break" ? nowLine({ kind: "break", name: now.name, end: now.end }) : nowLine({ kind: "period", period: now.entry.period, end: now.entry.end, title: now.entry.title })) : null;
  const nextText = next ? nextLine({ dayLabel: next.dayLabel, period: next.entry.period, start: next.entry.start, title: next.entry.title }) : null;

  // the sentence for screen readers drops the " · " separators; the live message says when "now" is free
  const plain = (s: string | null) => (s ? s.replace(/ · /g, " ") : null);
  const freePeriod = periodAt(input.frame, nowSec);
  const freeNow = `${MSG.nowWord}${freePeriod ? `คาบ ${freePeriod} ${MSG.freeWord}` : "ไม่มีคาบ"}`;
  const nextSpoken = next ? `${MSG.nextWord}${next.dayLabel ? ` ${next.dayLabel} ` : ""}คาบ ${next.entry.period} ${next.entry.start} ${next.entry.title}` : null;

  return {
    ...base,
    visible: true,
    now,
    next,
    shortcut,
    cells,
    rows: { current, later: rows.filter((r) => r !== current) },
    nowText,
    nextText,
    sentence: stripSentence(plain(nowText), plain(nextText)),
    announcement: [nowText ? plain(nowText) : freeNow, nextSpoken].filter(Boolean).join(" · "),
  };
}

function periodAt(frame: FrameInput, nowSec: number): number | null {
  const i = frame.periods.findIndex((p) => toMin(p.start) * 60 <= nowSec && nowSec < toMin(p.end) * 60);
  return i < 0 ? null : i + 1;
}
const hasPeriodAt = (frame: FrameInput, nowSec: number) => periodAt(frame, nowSec) !== null;

/** The strip's cells for one school day: every period and every break, in time order (BR-14). */
export function stripCells(frame: FrameInput, dayEntries: TtEntry[], nowSec: number): StripCell[] {
  const status = (s: number, e: number): StripCell["status"] => (nowSec >= e * 60 ? "past" : nowSec >= s * 60 ? "now" : "later");
  const cells: StripCell[] = frame.periods.map((p, i) => {
    const entry = dayEntries.find((e) => e.period === i + 1) ?? null;
    const st = status(toMin(p.start), toMin(p.end));
    return { type: "period", period: i + 1, start: p.start, end: p.end, entry, status: st, live: st === "now" && !!entry && !entry.archived };
  });
  for (const b of frame.breaks) {
    const st = status(toMin(b.start), toMin(b.end));
    cells.push({ type: "break", name: b.name, start: b.start, end: b.end, entry: null, status: st, live: st === "now" });
  }
  return cells.sort((a, b) => toMin(a.start) - toMin(b.start));
}

/** The first school day to show on a phone: today if it is a school day, else the next one (BR-12). */
export function mobileDay(frame: FrameInput, nowMs: number): { weekday: Weekday; isToday: boolean } {
  const t = bangkok(nowMs);
  for (let off = 0; off < 7; off++) {
    const wd = ((t.weekday - 1 + off) % 7 + 1) as Weekday;
    if (frame.days.includes(wd)) return { weekday: wd, isToday: off === 0 };
  }
  return { weekday: t.weekday, isToday: true };
}

export interface Summary {
  teach: number;
  activity: number;
  total: number;
  minutes: number;
  hours: string; // "14" · "11.6" (rounded down to 1 decimal, ".0" dropped)
  text: string; // "สอน 9 · กิจกรรม 5 · รวม 14 คาบ (14 ชม.)" · "ยังไม่มีคาบ"
}

/** Counts and hours of what is filled in (BR-05): archived rooms count, slots outside the frame do not. */
export function summarize(slots: Slot[], frame: FrameInput): Summary {
  let teach = 0, activity = 0, minutes = 0;
  for (const s of slots) {
    if (!frame.days.includes(s.weekday) || s.period < 1 || s.period > frame.periods.length) continue;
    const p = frame.periods[s.period - 1];
    minutes += Math.max(0, toMin(p.end) - toMin(p.start));
    if (s.kind === "class") teach++; else activity++;
  }
  const total = teach + activity;
  const tenths = Math.floor((minutes * 10) / 60);
  const hours = `${Math.floor(tenths / 10)}${tenths % 10 ? `.${tenths % 10}` : ""}`;
  return {
    teach, activity, total, minutes, hours,
    text: total === 0 ? MSG.emptySummary : `สอน ${teach} · กิจกรรม ${activity} · รวม ${total} คาบ (${hours} ชม.)`,
  };
}

/** What a tapped cell offers (AC-28) — does not depend on the time. */
export function slotActions(e: Pick<TtEntry, "kind" | "archived" | "className" | "classId">) {
  const shortcuts = e.kind === "class" && !e.archived && !!e.classId && !!e.className;
  return {
    attendance: shortcuts ? MSG.menuAttendance(e.className as string) : null,
    scan: shortcuts ? MSG.menuScan(e.className as string) : null,
    attendanceHref: shortcuts ? `#/attendance?class=${encodeURIComponent(e.classId as string)}` : null,
    scanHref: shortcuts ? `#/scan?class=${encodeURIComponent(e.classId as string)}` : null,
    edit: MSG.menuEdit,
    delete: MSG.menuDelete,
    archivedBadge: e.archived ? MSG.archivedBadge : null,
  };
}

/** The "คาบ 1 08:30" text of one period for slot-level views (null outside the frame). */
export function periodTimes(frame: FrameInput, period: number): { start: string; end: string } | null {
  const p = frame.periods[period - 1];
  return p ? { start: p.start, end: p.end } : null;
}

/**
 * Short text for a narrow cell (BR-12): room names up to 8 characters stay whole; anything longer keeps at least 4
 * characters then "…". Counts what a reader sees (Thai marks stay with their letter).
 */
export function clipText(text: string, max: number): string {
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? Array.from(new (Intl as unknown as { Segmenter: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter("th", { granularity: "grapheme" }).segment(text), (x) => x.segment)
    : Array.from(text);
  if (seg.length <= max) return text;
  return `${seg.slice(0, Math.max(4, max - 1)).join("")}…`;
}

export type { Frame };

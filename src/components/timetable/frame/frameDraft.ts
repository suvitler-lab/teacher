// Pure helpers of the S5 time-sheet form: the draft, adding a period / a break, and mapping validateFrame issues to form fields.
import { MAX_BREAKS, MAX_PERIODS, type Break, type FrameInput, type FrameIssue, type Period, type Weekday } from "@shared/timetable";

export const PERIOD_MINUTES = 60;
export const BREAK_MINUTES = 15;
export const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const toMin = (t: string): number | null => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);
export function fmtMin(min: number): string {
  const m = Math.min(Math.max(Math.round(min), 0), 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const cloneDraft = (f: FrameInput): FrameInput => ({
  periods: f.periods.map((p) => ({ ...p })),
  breaks: f.breaks.map((b) => ({ ...b })),
  days: [...f.days].sort((a, b) => a - b),
});

/** Period n+1 starts where period n ends and lasts 60 minutes (the first one: 08:30). */
export function nextPeriod(periods: Period[]): Period {
  const prev = periods.at(-1);
  const start = (prev && toMin(prev.end) !== null ? prev.end : "08:30");
  return { start, end: fmtMin((toMin(start) as number) + PERIOD_MINUTES) };
}

export function withPeriodCount(f: FrameInput, n: number): FrameInput {
  const count = Math.min(Math.max(n, 1), MAX_PERIODS);
  const periods = f.periods.slice(0, count).map((p) => ({ ...p }));
  while (periods.length < count) periods.push(nextPeriod(periods));
  return { ...f, periods };
}

/** A new break goes into the first free gap between two periods (15 minutes), otherwise right after the last period. */
export function newBreak(f: FrameInput): Break {
  const busy = f.breaks.map((b) => [toMin(b.start), toMin(b.end)] as const).filter((x): x is [number, number] => x[0] !== null && x[1] !== null);
  for (let i = 0; i + 1 < f.periods.length; i++) {
    const a = toMin(f.periods[i].end);
    const b = toMin(f.periods[i + 1].start);
    if (a === null || b === null || b - a < 5) continue;
    const end = Math.min(b, a + BREAK_MINUTES);
    if (!busy.some(([s, e]) => a < e && s < end)) return { name: "พัก", start: fmtMin(a), end: fmtMin(end) };
  }
  const last = f.periods.at(-1);
  const a = last ? toMin(last.end) ?? 12 * 60 : 12 * 60;
  return { name: "พัก", start: fmtMin(a), end: fmtMin(a + BREAK_MINUTES) };
}
export const canAddBreak = (f: FrameInput) => f.breaks.length < MAX_BREAKS;

export const toggleDay = (days: Weekday[], d: Weekday): Weekday[] => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));

/** The form field (data-f) an issue belongs to. */
export function fieldKey(i: Pick<FrameIssue, "field">): string {
  if (i.field === "periods") return "count";
  if (i.field === "days") return "days";
  if (i.field === "breaks") return "addbreak";
  if (/^breaks\.\d+$/.test(i.field)) return `${i.field}.start`; // overlap: point at the start time of that break
  return i.field; // periods.i.start · periods.i.end · breaks.i.name · breaks.i.start · breaks.i.end
}

export const issuesOfRow = (issues: FrameIssue[], prefix: string) => issues.filter((i) => i.field === prefix || i.field.startsWith(`${prefix}.`));
export const hasIssue = (issues: FrameIssue[], key: string) => issues.some((i) => fieldKey(i) === key);

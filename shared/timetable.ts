// Timetable shared logic (EP-11 / EP-12): pure functions used by both the worker and the app, so a
// frame or slot list is judged by one set of rules and one set of Thai messages (AC-14, AC-17).
// No I/O, no Date — times are "HH:MM" strings compared as minutes of the day.

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday … 7 = Sunday
export type SlotKind = "class" | "activity";
export interface Slot {
  weekday: Weekday;
  period: number; // 1–8
  kind: SlotKind;
  classId: string | null;
  subjectId: string | null;
  label: string | null; // activity: 1–40 chars after trim · class: null
}
export interface Period {
  start: string;
  end: string;
}
export interface Break {
  name: string;
  start: string;
  end: string;
}
export interface FrameInput {
  periods: Period[];
  breaks: Break[];
  days: Weekday[];
}
export interface Frame extends FrameInput {
  v: 1;
  rev: number;
  saved: boolean;
}
export interface TimetablePayload {
  termId: string;
  rev: number;
  readOnly: boolean;
  slots: Slot[];
}
export interface FrameIssue {
  code: string;
  field: string;
  period?: number;
  message: string;
}
export interface SlotIssue {
  code: string;
  weekday: number;
  period: number;
  message: string;
}

export const MAX_PERIODS = 8;
export const MAX_BREAKS = 3;
export const LABEL_MAX = 40;
export const BREAK_NAME_MAX = 20;
export const MAX_SLOTS = 56;

/** Length in user-perceived characters (graphemes): "🏕️" or a Thai consonant+vowel+tone cluster counts as 1. */
export function graphemeCount(s: string): number {
  const str = typeof s === "string" ? s : "";
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(x: string): Iterable<unknown> } }).Segmenter;
  if (Seg) {
    let n = 0;
    for (const _ of new Seg(undefined, { granularity: "grapheme" }).segment(str)) n++;
    return n;
  }
  return Array.from(str).length;
}

const TIME_RE =/^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_PERIOD_MINUTES = 60;

function toMin(t: string): number | null {
  if (typeof t !== "string" || !TIME_RE.test(t)) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

function fmt(min: number): string {
  const m = Math.min(Math.max(min, 0), 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const DEFAULT_STARTS = ["08:30", "09:30", "10:30", "12:30", "13:30", "14:30", "15:30"];
const DEFAULT_BREAK_NAME = "พักกลางวัน";
const MIN_BREAK_GAP = 20;

function defaultFrameInput(): FrameInput {
  return {
    periods: DEFAULT_STARTS.map((s) => ({ start: s, end: fmt((toMin(s) as number) + DEFAULT_PERIOD_MINUTES) })),
    breaks: [{ name: DEFAULT_BREAK_NAME, start: "11:30", end: "12:30" }],
    days: [1, 2, 3, 4, 5],
  };
}

/** Frame seeded from legacy `period_times` (D55); falls back to the plain default when unusable. */
function legacyFrameInput(periodTimes: string): FrameInput {
  const def = defaultFrameInput();
  let rec: Record<string, unknown> | null = null;
  try {
    const o = periodTimes ? JSON.parse(periodTimes) : null;
    if (o && typeof o === "object" && !Array.isArray(o)) rec = o as Record<string, unknown>;
  } catch {
    rec = null;
  }
  if (!rec) return def;
  const given = new Map<number, number>(); // period → start minute, only valid "HH:MM" keys 1–8
  for (let k = 1; k <= MAX_PERIODS; k++) {
    const v = rec[String(k)];
    const m = typeof v === "string" ? toMin(v) : null;
    if (m !== null) given.set(k, m);
  }
  if (given.size === 0) return def;
  const n = Math.max(DEFAULT_STARTS.length, ...given.keys());
  const starts: number[] = [];
  for (let k = 1; k <= n; k++) starts.push(given.get(k) ?? (toMin(DEFAULT_STARTS[k - 1]) as number));
  for (let i = 1; i < n; i++) if (starts[i] <= starts[i - 1]) return def;
  let len = DEFAULT_PERIOD_MINUTES;
  for (let k = 1; k < n; k++) if (given.has(k) && given.has(k + 1)) len = Math.min(len, starts[k] - starts[k - 1]);
  const periods: Period[] = starts.map((st, i) => ({
    start: fmt(st),
    end: fmt(i + 1 < n ? Math.min(st + len, starts[i + 1]) : st + len),
  }));
  const ends = periods.map((p) => toMin(p.end) as number);
  const lunchS = 11 * 60 + 30;
  const lunchE = 12 * 60 + 30;
  let breaks: Break[] = [];
  if (!starts.some((st, i) => lunchS < ends[i] && st < lunchE)) {
    breaks = [{ name: DEFAULT_BREAK_NAME, start: "11:30", end: "12:30" }];
  } else {
    let best = -1;
    let bs = 0;
    let be = 0;
    for (let i = 0; i + 1 < n; i++) {
      const gap = starts[i + 1] - ends[i];
      if (gap >= MIN_BREAK_GAP && gap > best) {
        best = gap;
        bs = ends[i];
        be = starts[i + 1];
      }
    }
    if (best >= 0) breaks = [{ name: DEFAULT_BREAK_NAME, start: fmt(bs), end: fmt(be) }];
  }
  const out: FrameInput = { periods, breaks, days: [1, 2, 3, 4, 5] };
  return validateFrame(out).length === 0 ? out : def;
}

function sortedDays(days: number[]): Weekday[] {
  return Array.from(new Set(days)).sort((a, b) => a - b) as Weekday[];
}

/** Validate a frame; returns every problem ordered period count → periods → breaks → days. [] = ok. */
export function validateFrame(f: FrameInput): FrameIssue[] {
  const issues: FrameIssue[] = [];
  const periods = Array.isArray(f?.periods) ? f.periods : [];
  const breaks = Array.isArray(f?.breaks) ? f.breaks : [];
  const days = Array.isArray(f?.days) ? f.days : [];

  if (periods.length < 1 || periods.length > MAX_PERIODS) {
    issues.push({ code: "period_count", field: "periods", message: "ตั้งได้ 1–8 คาบ" });
  }

  // periods
  periods.forEach((p, i) => {
    const n = i + 1;
    const s = toMin(p?.start);
    const e = toMin(p?.end);
    if (s === null) issues.push({ code: "bad_time", field: `periods.${i}.start`, period: n, message: "ใส่เวลาแบบ 08:30" });
    if (e === null) issues.push({ code: "bad_time", field: `periods.${i}.end`, period: n, message: "ใส่เวลาแบบ 08:30" });
    if (s !== null && e !== null && e <= s) {
      issues.push({ code: "end_not_after_start", field: `periods.${i}.end`, period: n, message: "เวลาจบต้องหลังเวลาเริ่ม" });
    }
    if (i > 0 && s !== null) {
      const prevEnd = toMin(periods[i - 1]?.end);
      if (prevEnd !== null && s < prevEnd) {
        issues.push({
          code: "period_order",
          field: `periods.${i}.start`,
          period: n,
          message: `คาบ ${n} ต้องเริ่มหลังคาบ ${n - 1} จบ (${periods[i - 1].end})`,
        });
      }
    }
  });

  // breaks
  if (breaks.length > MAX_BREAKS) {
    issues.push({ code: "break_count", field: "breaks", message: "ตั้งช่วงพักได้ไม่เกิน 3 ช่วง" });
  }
  breaks.forEach((b, i) => {
    const name = typeof b?.name === "string" ? b.name.trim() : "";
    if (name.length < 1 || graphemeCount(name) > BREAK_NAME_MAX) {
      issues.push({ code: "break_name", field: `breaks.${i}.name`, message: "ชื่อช่วงพัก 1–20 ตัวอักษร" });
    }
    const s = toMin(b?.start);
    const e = toMin(b?.end);
    if (s === null) issues.push({ code: "bad_time", field: `breaks.${i}.start`, message: "ใส่เวลาแบบ 08:30" });
    if (e === null) issues.push({ code: "bad_time", field: `breaks.${i}.end`, message: "ใส่เวลาแบบ 08:30" });
    if (s !== null && e !== null) {
      if (e <= s) {
        issues.push({ code: "end_not_after_start", field: `breaks.${i}.end`, message: "เวลาจบต้องหลังเวลาเริ่ม" });
      } else {
        periods.forEach((p, k) => {
          const ps = toMin(p?.start);
          const pe = toMin(p?.end);
          if (ps === null || pe === null || pe <= ps) return;
          if (s < pe && ps < e) {
            issues.push({
              code: "break_overlaps_period",
              field: `breaks.${i}`,
              period: k + 1,
              message: `${name}ทับคาบ ${k + 1} (${p.start}–${p.end})`,
            });
          }
        });
        for (let j = 0; j < i; j++) {
          const o = breaks[j];
          const os = toMin(o?.start);
          const oe = toMin(o?.end);
          if (os === null || oe === null || oe <= os) continue;
          if (s < oe && os < e) {
            issues.push({
              code: "break_overlaps_break",
              field: `breaks.${i}`,
              message: `ช่วงพักทับกัน (${String(o.name).trim()} กับ ${name})`,
            });
          }
        }
      }
    }
  });

  // days
  if (days.length === 0) {
    issues.push({ code: "no_days", field: "days", message: "เลือกวันเรียนอย่างน้อย 1 วัน" });
  } else if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    issues.push({ code: "bad_day", field: "days", message: "วันเรียนไม่ถูกต้อง" });
  }
  return issues;
}

/**
 * Frame from the stored `period_frame` setting (valid v:1 JSON) or, when never set / unreadable /
 * invalid, the default frame seeded from the legacy `period_times` setting (BR-02, AC-11, AC-12).
 */
export function resolveFrame(periodFrame: string | undefined, periodTimes: string): Frame {
  let storedRev = 0; // rev of a stored-but-unusable frame is kept so rev never goes backwards (D56)
  if (periodFrame) {
    try {
      const o = JSON.parse(periodFrame);
      if (o && typeof o === "object" && Number.isInteger(o.rev) && o.rev >= 0) storedRev = o.rev;
      if (o && typeof o === "object" && o.v === 1 && Number.isInteger(o.rev) && o.rev >= 0) {
        const input: FrameInput = {
          periods: Array.isArray(o.periods) ? o.periods : [],
          breaks: Array.isArray(o.breaks) ? o.breaks : [],
          days: Array.isArray(o.days) ? o.days : [],
        };
        if (validateFrame(input).length === 0) {
          return {
            v: 1,
            rev: o.rev,
            saved: true,
            periods: input.periods.map((p) => ({ start: p.start, end: p.end })),
            breaks: input.breaks.map((b) => ({ name: b.name, start: b.start, end: b.end })),
            days: sortedDays(input.days),
          };
        }
      }
    } catch {
      // fall through to defaults
    }
  }
  return { v: 1, rev: storedRev, saved: false, ...legacyFrameInput(periodTimes) };
}

/** Value stored in setting `period_frame`. Days are de-duplicated and sorted. */
export function serializeFrame(f: FrameInput, rev: number): string {
  return JSON.stringify({
    v: 1,
    rev,
    periods: f.periods.map((p) => ({ start: p.start, end: p.end })),
    breaks: f.breaks.map((b) => ({ name: b.name, start: b.start, end: b.end })),
    days: sortedDays(f.days),
  });
}

/** Legacy `period_times` value: {"1":"08:30","2":"09:30",…} for every period. */
export function periodTimesOf(f: FrameInput): string {
  const o: Record<string, string> = {};
  f.periods.forEach((p, i) => {
    o[String(i + 1)] = p.start;
  });
  return JSON.stringify(o);
}

/** Slots whose weekday is not a school day or whose period is beyond the frame. */
export function outsideFrame(slots: Slot[], f: FrameInput): Slot[] {
  return slots.filter((s) => !f.days.includes(s.weekday) || s.period < 1 || s.period > f.periods.length);
}

/** Shape checks only (no database): duplicates, frame bounds, kind rules, label rules (BR-03). */
export function slotIssues(slots: Slot[], f: FrameInput): SlotIssue[] {
  const issues: SlotIssue[] = [];
  const seen = new Set<string>();
  const add = (s: Slot, code: string, message: string) =>
    issues.push({ code, weekday: s.weekday, period: s.period, message });
  for (const s of slots) {
    const key = `${s.weekday}:${s.period}`;
    if (seen.has(key)) add(s, "duplicate_slot", "มีคาบนี้ซ้ำในคำขอ");
    seen.add(key);
    if (outsideFrame([s], f).length > 0) add(s, "outside_frame", "คาบนี้อยู่นอกโครงเวลา");
    if (s.kind === "class") {
      if (!s.classId) add(s, "class_required", "เลือกห้อง");
      if (s.label !== null && s.label !== undefined) add(s, "kind_fields", "คาบกิจกรรมไม่มีห้องหรือวิชา");
    } else {
      const label = typeof s.label === "string" ? s.label.trim() : "";
      if (label.length === 0) add(s, "label_required", "ใส่ชื่อกิจกรรม");
      else if (graphemeCount(label) > LABEL_MAX) add(s, "label_too_long", "ไม่เกิน 40 ตัวอักษร");
      if (s.classId || s.subjectId) add(s, "kind_fields", "คาบกิจกรรมไม่มีห้องหรือวิชา");
    }
  }
  return issues;
}

/** Trim labels and sort by weekday then period. Returns new objects; input is not mutated. */
export function normalizeSlots(slots: Slot[]): Slot[] {
  return slots
    .map((s) => ({ ...s, label: typeof s.label === "string" ? s.label.trim() : s.label }))
    .sort((a, b) => a.weekday - b.weekday || a.period - b.period);
}

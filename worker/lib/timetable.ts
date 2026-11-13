// SQL side of the timetable (EP-11 / EP-12). The pure rules live in shared/timetable.ts.
import type { Env } from "../env";
import type { Slot, TimetablePayload, SlotIssue } from "@shared/timetable";
import { resolveFrame, type Frame } from "@shared/timetable";
import { classInYear } from "@shared/roster";

export interface TermRow {
  id: string;
  year: number;
  term: number;
  timetable_rev: number;
}

/** The term whose academic year is editable: the current term, else the latest (same rule as bootstrap). */
export const DEFAULT_TERM_SQL = "SELECT id, year, term, timetable_rev FROM terms ORDER BY is_current DESC, year DESC, term DESC LIMIT 1";
export const EDITABLE_YEAR_SQL = "(SELECT year FROM terms ORDER BY is_current DESC, year DESC, term DESC LIMIT 1)";

export const SLOT_COLUMNS = "weekday, period, kind, class_id, subject_id, label";

export function mapSlot(r: any): Slot {
  return {
    weekday: r.weekday,
    period: r.period,
    kind: r.kind,
    classId: r.class_id ?? null,
    subjectId: r.subject_id ?? null,
    label: r.label ?? null,
  };
}

export async function defaultTerm(env: Env): Promise<TermRow | null> {
  return (await env.DB.prepare(DEFAULT_TERM_SQL).first<TermRow>()) ?? null;
}

export async function termById(env: Env, termId: string): Promise<TermRow | null> {
  return (await env.DB.prepare("SELECT id, year, term, timetable_rev FROM terms WHERE id = ?").bind(termId).first<TermRow>()) ?? null;
}

export async function editableYear(env: Env): Promise<number | null> {
  return (await defaultTerm(env))?.year ?? null;
}

export async function loadSlots(env: Env, termId: string): Promise<Slot[]> {
  const res = await env.DB.prepare(`SELECT ${SLOT_COLUMNS} FROM timetable_slots WHERE term_id = ? ORDER BY weekday, period`).bind(termId).all();
  return (res.results ?? []).map(mapSlot);
}

export async function readFrameSettings(env: Env): Promise<{ rawFrame: string | null; rawTimes: string }> {
  const res = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('period_frame','period_times')").all<{ key: string; value: string }>();
  let rawFrame: string | null = null;
  let rawTimes = "";
  for (const r of res.results ?? []) {
    if (r.key === "period_frame") rawFrame = r.value;
    else rawTimes = r.value;
  }
  return { rawFrame, rawTimes };
}

export async function currentFrame(env: Env): Promise<{ frame: Frame; rawFrame: string | null }> {
  const { rawFrame, rawTimes } = await readFrameSettings(env);
  return { frame: resolveFrame(rawFrame ?? "", rawTimes), rawFrame };
}

export function payloadOf(term: TermRow, readOnly: boolean, slots: Slot[]): TimetablePayload {
  return { termId: term.id, rev: term.timetable_rev, readOnly, slots };
}

/** The payload of one term as stored right now. */
export async function loadPayload(env: Env, term: TermRow, year: number | null): Promise<TimetablePayload> {
  return payloadOf(term, year === null || term.year !== year, await loadSlots(env, term.id));
}

/** Database-side checks of a slot list (EP-11 order #6). Archived refs only count for new or changed slots. */
export async function refIssues(env: Env, term: TermRow, slots: Slot[], stored: Slot[]): Promise<SlotIssue[]> {
  const classIds = [...new Set(slots.map((s) => s.classId).filter((x): x is string => !!x))];
  const subjectIds = [...new Set(slots.map((s) => s.subjectId).filter((x): x is string => !!x))];
  const [cls, subs] = await Promise.all([
    classIds.length
      ? env.DB.prepare("SELECT id, year, archived FROM classes WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(classIds)).all<{ id: string; year: number | null; archived: number }>()
      : Promise.resolve({ results: [] as { id: string; year: number | null; archived: number }[] }),
    subjectIds.length
      ? env.DB.prepare("SELECT id, archived FROM subjects WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(subjectIds)).all<{ id: string; archived: number }>()
      : Promise.resolve({ results: [] as { id: string; archived: number }[] }),
  ]);
  const cMap = new Map((cls.results ?? []).map((r) => [r.id, r]));
  const sMap = new Map((subs.results ?? []).map((r) => [r.id, r]));
  const old = new Map(stored.map((s) => [`${s.weekday}:${s.period}`, s]));
  const issues: SlotIssue[] = [];
  for (const s of slots) {
    const add = (code: string, message: string) => issues.push({ code, weekday: s.weekday, period: s.period, message });
    const o = old.get(`${s.weekday}:${s.period}`);
    const unchanged = !!o && o.kind === s.kind && o.classId === s.classId && o.subjectId === s.subjectId && o.label === s.label;
    if (s.classId) {
      const c = cMap.get(s.classId);
      if (!c) add("class_not_found", "ไม่พบห้องนี้");
      else if (!classInYear(c.year, term.year)) add("class_wrong_year", `ห้องนี้ไม่ได้อยู่ในปีการศึกษา ${term.year}`);
      else if (c.archived && !unchanged) add("archived_ref", "ห้อง/วิชานี้เก็บแล้ว — เลือกห้อง/วิชาที่ใช้งาน");
    }
    if (s.subjectId) {
      const sub = sMap.get(s.subjectId);
      if (!sub) add("subject_not_found", "ไม่พบวิชานี้");
      else if (sub.archived && !unchanged) add("archived_ref", "ห้อง/วิชานี้เก็บแล้ว — เลือกห้อง/วิชาที่ใช้งาน");
    }
  }
  return issues;
}

export function sameSlots(a: Slot[], b: Slot[]): boolean {
  if (a.length !== b.length) return false;
  const key = (s: Slot) => `${s.weekday}|${s.period}|${s.kind}|${s.classId ?? ""}|${s.subjectId ?? ""}|${s.label ?? ""}`;
  const set = new Set(a.map(key));
  return b.every((s) => set.has(key(s)));
}

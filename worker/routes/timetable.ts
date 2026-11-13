// EP-11 GET/PUT /api/timetable and EP-12 PUT /api/timetable/frame (job 2026-11-12-timetable).
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { ApiError, readJson } from "../lib/http";
import { setSettingStmt } from "../lib/db";
import { abortIf, batchAtEpoch, requestEpoch } from "../lib/guard";
import { auditInsertStmt } from "../lib/audit";
import {
  MAX_SLOTS, MAX_PERIODS, MAX_BREAKS, normalizeSlots, slotIssues, validateFrame, serializeFrame, periodTimesOf,
  resolveFrame, type Slot, type Weekday, type Frame, type FrameInput,
} from "@shared/timetable";
import {
  defaultTerm, termById, editableYear, loadSlots, loadPayload, currentFrame, readFrameSettings, refIssues, sameSlots,
  payloadOf, mapSlot, EDITABLE_YEAR_SQL,
} from "../lib/timetable";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

export const timetableRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
timetableRoutes.use("/api/timetable", requireAuth);
timetableRoutes.use("/api/timetable/*", requireAuth);

const TERM_NOT_FOUND = () => new ApiError(404, "term_not_found", "ไม่พบภาคเรียนนี้");
const READ_ONLY = () => new ApiError(409, "term_read_only", "ภาคเรียนของปีการศึกษาที่ผ่านมา ดูได้อย่างเดียว");
const json409 = (c: Ctx, body: Record<string, unknown>) => c.json(body, 409);
const badTimetable = (c: Ctx, issues: unknown[]) => c.json({ error: "bad_timetable", message: "ตารางสอนไม่ถูกต้อง", issues }, 422);

// ---- GET ---------------------------------------------------------------------
timetableRoutes.get("/api/timetable", async (c) => {
  const q = c.req.query("term");
  const [def, termRow] = await Promise.all([defaultTerm(c.env), q ? termById(c.env, q) : Promise.resolve(null)]);
  if (!def) throw new ApiError(404, "no_term", "ยังไม่มีภาคเรียน — สร้างภาคเรียนก่อนกรอกตารางสอน");
  const term = q ? termRow : def;
  if (!term) throw TERM_NOT_FOUND();
  const [slots, counts, { frame }] = await Promise.all([
    loadSlots(c.env, term.id),
    c.env.DB.prepare("SELECT term_id, COUNT(*) AS n FROM timetable_slots GROUP BY term_id ORDER BY term_id").all<{ term_id: string; n: number }>(),
    currentFrame(c.env),
  ]);
  return c.json({
    ...payloadOf(term, term.year !== def.year, slots),
    frame,
    counts: (counts.results ?? []).map((r) => ({ termId: r.term_id, slots: r.n })),
  });
});

// ---- PUT ---------------------------------------------------------------------
const slotSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  period: z.number().int().min(1).max(8),
  kind: z.enum(["class", "activity"]),
  classId: z.string().min(1).max(100).nullish(),
  subjectId: z.string().min(1).max(100).nullish(),
  label: z.string().max(800).nullish(),
});
const putSchema = z.object({
  termId: z.string().min(1).max(100),
  baseRev: z.number().int().min(0),
  reason: z.enum(["edit", "undo", "clear", "copy"]).optional(),
  slots: z.array(slotSchema).max(MAX_SLOTS),
});

timetableRoutes.put("/api/timetable", async (c) => {
  const body = putSchema.parse(await readJson(c));
  const env = c.env;
  const epoch = await requestEpoch(c);
  const [term, def] = await Promise.all([termById(env, body.termId), defaultTerm(env)]);
  if (!term || !def) throw TERM_NOT_FOUND();
  if (term.year !== def.year) throw READ_ONLY();
  const [stored, { frame, rawFrame }] = await Promise.all([loadSlots(env, term.id), currentFrame(env)]);
  const timetableChanged = async () => {
    const t = (await termById(env, term.id)) ?? term;
    return json409(c, {
      error: "timetable_changed",
      message: "ตารางสอนถูกแก้จากเครื่องอื่น — โหลดฉบับล่าสุดแล้ว ลองแก้อีกครั้ง",
      current: await loadPayload(env, t, await editableYear(env)),
    });
  };
  if (body.baseRev !== term.timetable_rev) return timetableChanged();

  const slots = normalizeSlots(body.slots.map((s): Slot => ({
    weekday: s.weekday as Weekday, period: s.period, kind: s.kind, classId: s.classId ?? null, subjectId: s.subjectId ?? null, label: s.label ?? null,
  })));
  const shape = slotIssues(slots, frame);
  if (shape.length) return badTimetable(c, shape);
  const refs = await refIssues(env, term, slots, stored);
  if (refs.length) return badTimetable(c, refs);

  if (sameSlots(stored, slots)) {
    return c.json({ ok: true, changed: false, timetable: payloadOf(term, false, stored) });
  }

  // new or changed slots: the batch re-checks that what they point at is still active
  const old = new Map(stored.map((s) => [`${s.weekday}:${s.period}`, s]));
  const fresh = slots.filter((s) => {
    const o = old.get(`${s.weekday}:${s.period}`);
    return !(o && o.kind === s.kind && o.classId === s.classId && o.subjectId === s.subjectId && o.label === s.label);
  });
  const freshClasses = [...new Set(fresh.map((s) => s.classId).filter(Boolean))];
  const freshSubjects = [...new Set(fresh.map((s) => s.subjectId).filter(Boolean))];
  const now = Date.now();
  const reason = body.reason ?? "edit";
  const stmts = [
    // the term's version moved, or the term stopped being editable (another device changed the current term)
    abortIf(env, `(SELECT timetable_rev FROM terms WHERE id = ?1) != ?2 OR (SELECT year FROM terms WHERE id = ?1) != ${EDITABLE_YEAR_SQL}`, term.id, body.baseRev),
    // the frame changed since this request judged the slots against it
    abortIf(env, "COALESCE((SELECT value FROM settings WHERE key = 'period_frame'), '') != ?1", rawFrame ?? ""),
    // a class/subject of a new or changed slot was archived meanwhile
    abortIf(
      env,
      "EXISTS (SELECT 1 FROM classes WHERE archived = 1 AND id IN (SELECT value FROM json_each(?1))) OR EXISTS (SELECT 1 FROM subjects WHERE archived = 1 AND id IN (SELECT value FROM json_each(?2)))",
      JSON.stringify(freshClasses), JSON.stringify(freshSubjects),
    ),
    env.DB.prepare("DELETE FROM timetable_slots WHERE term_id = ?").bind(term.id),
    env.DB.prepare(
      `INSERT INTO timetable_slots (term_id, weekday, period, kind, class_id, subject_id, label, updated_at)
       SELECT ?1, json_extract(value, '$.weekday'), json_extract(value, '$.period'), json_extract(value, '$.kind'),
              json_extract(value, '$.classId'), json_extract(value, '$.subjectId'), json_extract(value, '$.label'), ?3
       FROM json_each(?2)`,
    ).bind(term.id, JSON.stringify(slots), now),
    env.DB.prepare("UPDATE terms SET timetable_rev = timetable_rev + 1 WHERE id = ?").bind(term.id),
    auditInsertStmt(env, [{
      entity: "timetable", entity_id: term.id, action: "update", device_id: c.get("deviceId") ?? null, method: "manual",
      before: { slots: stored.length, rev: term.timetable_rev },
      after: { slots: slots.length, rev: term.timetable_rev + 1, reason },
    }], now),
  ];
  try {
    await batchAtEpoch(env, epoch, stmts);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // the batch rolled back: find out why from the data as it is now
    const t = await termById(env, term.id);
    if (!t) throw TERM_NOT_FOUND();
    const yr = await editableYear(env);
    if (yr !== null && t.year !== yr) throw READ_ONLY();
    if (t.timetable_rev !== body.baseRev) return timetableChanged();
    const now2 = await readFrameSettings(env);
    if ((now2.rawFrame ?? "") !== (rawFrame ?? "")) {
      return json409(c, { error: "frame_changed", message: "โครงเวลาถูกแก้จากเครื่องอื่น — โหลดใหม่แล้ว ลองอีกครั้ง", current: await loadPayload(env, t, yr) });
    }
    const again = await refIssues(env, t, slots, stored);
    if (again.length) return badTimetable(c, again);
    throw e;
  }
  return c.json({ ok: true, changed: true, timetable: payloadOf({ ...term, timetable_rev: term.timetable_rev + 1 }, false, slots) });
});

// ---- EP-12 frame -------------------------------------------------------------
const text = z.string().max(50);
const frameSchema = z.object({
  baseRev: z.number().int().min(0),
  frame: z.object({
    periods: z.array(z.object({ start: text, end: text })).max(MAX_PERIODS),
    breaks: z.array(z.object({ name: text, start: text, end: text })).max(MAX_BREAKS),
    days: z.array(z.number().int().min(1).max(7)).max(7),
  }),
  confirmRemove: z.number().int().min(0).optional(),
});

timetableRoutes.put("/api/timetable/frame", async (c) => {
  const body = frameSchema.parse(await readJson(c));
  const env = c.env;
  const epoch = await requestEpoch(c);
  const input: FrameInput = {
    periods: body.frame.periods,
    breaks: body.frame.breaks.map((b) => ({ ...b, name: b.name.trim() })),
    days: body.frame.days as Weekday[],
  };
  const issues = validateFrame(input);
  if (issues.length) return c.json({ error: "bad_frame", message: "โครงเวลาไม่ถูกต้อง", issues }, 422);

  const { frame: cur, rawFrame } = await currentFrame(env);
  const frameChanged = (current: Frame) =>
    json409(c, { error: "frame_changed", message: "โครงเวลาถูกแก้จากเครื่องอื่น — โหลดใหม่แล้ว ลองอีกครั้ง", current });
  if (body.baseRev !== cur.rev) return frameChanged(cur);

  const year = await editableYear(env);
  const nextRev = cur.rev + 1;
  const next: FrameInput = {
    periods: input.periods,
    breaks: input.breaks,
    days: [...new Set(input.days)].sort((a, b) => a - b) as Weekday[],
  };
  const daysJson = JSON.stringify(next.days);
  const periodCount = next.periods.length;
  // slots of the current school year that fall outside the new frame (?1 year, ?2 days, ?3 period count)
  const OUTSIDE = "term_id IN (SELECT id FROM terms WHERE year = ?1) AND (weekday NOT IN (SELECT value FROM json_each(?2)) OR period > ?3)";

  const removable = year === null ? [] : (await env.DB.prepare(
    `SELECT term_id, weekday, period, kind, class_id, subject_id, label FROM timetable_slots WHERE ${OUTSIDE} ORDER BY term_id, weekday, period`,
  ).bind(year, daysJson, periodCount).all()).results ?? [];
  const n = removable.length;
  if (n > 0 && body.confirmRemove !== n) {
    return json409(c, {
      error: "frame_removes_slots", message: `จะลบ ${n} คาบที่อยู่นอกโครงเวลาใหม่`, count: n,
      removes: removable.map((r: any) => ({ termId: r.term_id, ...mapSlot(r) })),
    });
  }

  const now = Date.now();
  const stored = serializeFrame(next, nextRev);
  const stmts = [
    abortIf(env, "COALESCE((SELECT value FROM settings WHERE key = 'period_frame'), '') != ?1", rawFrame ?? ""),
    abortIf(env, `${EDITABLE_YEAR_SQL} IS NOT ?4 OR (SELECT COUNT(*) FROM timetable_slots WHERE ${OUTSIDE}) != ?5`, year, daysJson, periodCount, year, n),
    env.DB.prepare(
      `UPDATE terms SET timetable_rev = timetable_rev + 1 WHERE year = ?1 AND id IN (SELECT term_id FROM timetable_slots WHERE ${OUTSIDE})`,
    ).bind(year, daysJson, periodCount),
    env.DB.prepare(`DELETE FROM timetable_slots WHERE ${OUTSIDE}`).bind(year, daysJson, periodCount),
    setSettingStmt(env, "period_frame", stored),
    setSettingStmt(env, "period_times", periodTimesOf(next)),
    auditInsertStmt(env, [{
      entity: "period_frame", entity_id: "frame", action: "update", device_id: c.get("deviceId") ?? null, method: "manual",
      before: cur.saved ? { periods: cur.periods, breaks: cur.breaks, days: cur.days, rev: cur.rev } : null,
      after: { periods: next.periods, breaks: next.breaks, days: next.days, rev: nextRev, removed: n },
    }], now),
  ];
  try {
    await batchAtEpoch(env, epoch, stmts);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const again = await currentFrame(env);
    if ((again.rawFrame ?? "") !== (rawFrame ?? "")) return frameChanged(again.frame);
    const y2 = await editableYear(env);
    if (y2 !== null) {
      const rows = (await env.DB.prepare(
        `SELECT term_id, weekday, period, kind, class_id, subject_id, label FROM timetable_slots WHERE ${OUTSIDE} ORDER BY term_id, weekday, period`,
      ).bind(y2, daysJson, periodCount).all()).results ?? [];
      const m = rows.length;
      if (m === 0) return frameChanged(again.frame);
      if (m !== n || y2 !== year) {
        return json409(c, {
          error: "frame_removes_slots", message: `จะลบ ${m} คาบที่อยู่นอกโครงเวลาใหม่`, count: m,
          removes: rows.map((r: any) => ({ termId: r.term_id, ...mapSlot(r) })),
        });
      }
    }
    throw e;
  }
  const def = await defaultTerm(env);
  return c.json({
    ok: true,
    frame: resolveFrame(stored, ""),
    removed: n,
    timetable: def ? await loadPayload(env, def, def.year) : null,
  });
});

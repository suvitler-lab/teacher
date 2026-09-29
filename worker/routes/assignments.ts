import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { readJson, notFound, ApiError } from "../lib/http";
import { writeAudit } from "../lib/audit";
import { abortIf, batchAtEpoch, requestEpoch } from "../lib/guard";
import { id } from "@shared/ids";
import { mapAssignment } from "../lib/rows";

export const assignmentRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
assignmentRoutes.use("/api/assignments", requireAuth);
assignmentRoutes.use("/api/assignments/*", requireAuth);
assignmentRoutes.use("/api/scan-sessions", requireAuth);
assignmentRoutes.use("/api/scan-sessions/*", requireAuth);

const assignmentSchema = z.object({
  id: z.string().optional(),
  term_id: z.string().nullable().optional(),
  subject_id: z.string().min(1),
  type_id: z.string().min(1),
  title: z.string().min(1),
  unit: z.string().nullable().optional(),
  full_score: z.number().int().min(1).max(100),
  assigned_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  publish_scores: z.boolean().optional(),
  status: z.enum(["open", "closed"]).optional(),
  class_ids: z.array(z.string()).min(1),
});

assignmentRoutes.post("/api/assignments", async (c) => {
  const b = assignmentSchema.parse(await readJson(c));
  const now = Date.now();
  const epoch = await requestEpoch(c);
  const aid = b.id ?? id("asg");
  const existing = await c.env.DB.prepare("SELECT * FROM assignments WHERE id = ?")
    .bind(aid)
    .first<any>();

  // refuse to lower full_score below scores already recorded (checked again inside the write below —
  // a score can land between this look and that write)
  const lowersBelowScores = "?2 < (SELECT full_score FROM assignments WHERE id = ?1) AND EXISTS (SELECT 1 FROM submissions WHERE assignment_id = ?1 AND score > ?2)";
  const scoreOverFull = async () => {
    const over = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = ? AND score > ?",
    ).bind(aid, b.full_score).first<{ n: number }>();
    return over?.n ?? 0;
  };
  if (existing && b.full_score < existing.full_score) {
    const over = await scoreOverFull();
    if (over > 0) return c.json({ error: "score_over_full", over }, 409);
  }

  // A class belongs to one academic year, and so does the work given to it. A class that is newly attached
  // must be of the term's year; and when the work MOVES to another term, every class it keeps must be of the
  // new year too (moving only the term would leave last year's class holding this year's work). Classes it
  // already had, under an unchanged term, are left alone — older data may predate the year model.
  if (b.term_id) {
    const term = await c.env.DB.prepare("SELECT year FROM terms WHERE id = ?").bind(b.term_id).first<{ year: number }>();
    if (term) {
      const termMoved = !existing || (existing.term_id ?? null) !== b.term_id;
      const prev = new Set(existing
        ? ((await c.env.DB.prepare("SELECT class_id FROM assignment_classes WHERE assignment_id = ?").bind(aid).all<{ class_id: string }>()).results ?? []).map((r) => r.class_id)
        : []);
      const toCheck = termMoved ? b.class_ids : b.class_ids.filter((cid) => !prev.has(cid));
      if (toCheck.length > 0) {
        const rows = await c.env.DB.prepare("SELECT name, year FROM classes WHERE id IN (SELECT value FROM json_each(?1))")
          .bind(JSON.stringify(toCheck)).all<{ name: string; year: number | null }>();
        const off = (rows.results ?? []).filter((r) => r.year != null && r.year !== term.year);
        if (off.length > 0) {
          return c.json({
            error: "class_year_mismatch",
            message: `ห้อง ${off.map((r) => r.name).join(", ")} เป็นของปีการศึกษาอื่น ไม่ตรงกับภาคเรียนของงานนี้`,
          }, 422);
        }
      }
    }
  }

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO assignments (id, term_id, subject_id, type_id, title, unit, full_score, assigned_date, due_date, note, publish_scores, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET term_id=excluded.term_id, subject_id=excluded.subject_id, type_id=excluded.type_id,
         title=excluded.title, unit=excluded.unit, full_score=excluded.full_score, assigned_date=excluded.assigned_date,
         due_date=excluded.due_date, note=excluded.note, publish_scores=excluded.publish_scores, status=excluded.status,
         updated_at=excluded.updated_at`,
    ).bind(
      aid, b.term_id ?? null, b.subject_id, b.type_id, b.title, b.unit ?? null, b.full_score,
      b.assigned_date ?? null, b.due_date ?? null, b.note ?? null, b.publish_scores === false ? 0 : 1,
      b.status ?? "open", (existing as any)?.created_at ?? now, now,
    ),
    c.env.DB.prepare("DELETE FROM assignment_classes WHERE assignment_id = ?").bind(aid),
    ...b.class_ids.map((cid) =>
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO assignment_classes (assignment_id, class_id) VALUES (?, ?)",
      ).bind(aid, cid),
    ),
  ];
  try {
    // both guards first: a restore since this request began, or scores that now sit above the new full
    // score, roll the whole batch back — nothing of it (title, full score, class links) is half-applied
    await batchAtEpoch(c.env, epoch, [abortIf(c.env, lowersBelowScores, aid, b.full_score), ...stmts]);
  } catch (e) {
    if (e instanceof ApiError) throw e; // epoch_changed
    const over = await scoreOverFull();
    if (over > 0 && existing && b.full_score < existing.full_score) return c.json({ error: "score_over_full", over }, 409);
    throw e;
  }
  await writeAudit(c.env, [
    {
      entity: "assignment", entity_id: aid, assignment_id: aid,
      action: existing ? "update" : "create", device_id: c.get("deviceId"),
      before: existing ? { full_score: (existing as any).full_score, title: (existing as any).title } : null,
      after: { title: b.title, full_score: b.full_score, class_ids: b.class_ids },
      method: "manual",
    },
  ]);
  return c.json({ ok: true, assignment: mapAssignment({ ...b, id: aid, created_at: (existing as any)?.created_at ?? now, updated_at: now, publish_scores: b.publish_scores === false ? 0 : 1, status: b.status ?? "open", deleted_at: null }, b.class_ids) });
});

assignmentRoutes.post("/api/assignments/:id/delete", async (c) => {
  const aid = c.req.param("id");
  const now = Date.now();
  const [r] = await batchAtEpoch(c.env, await requestEpoch(c), [
    c.env.DB.prepare("UPDATE assignments SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(now, now, aid),
  ]);
  if (r.meta.changes === 0) throw notFound("assignment");
  await writeAudit(c.env, [
    { entity: "assignment", entity_id: aid, assignment_id: aid, action: "void", device_id: c.get("deviceId"), method: "manual" },
  ]);
  return c.json({ ok: true });
});

// ---- scan sessions -------------------------------------------------------
const scanSessionSchema = z.object({
  id: z.string().optional(),
  assignmentId: z.string().min(1),
  classId: z.string().nullable().optional(),
  subjectId: z.string().nullable().optional(),
  mode: z.enum(["full", "type", "later"]),
  fullScore: z.number().int(),
});

assignmentRoutes.post("/api/scan-sessions", async (c) => {
  const b = scanSessionSchema.parse(await readJson(c));
  const now = Date.now();
  const sid = b.id ?? id("scn");
  await c.env.DB.prepare(
    `INSERT INTO scan_sessions (id, assignment_id, class_id, subject_id, mode, full_score, device_id, started_at, scan_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET mode=excluded.mode`,
  )
    .bind(sid, b.assignmentId, b.classId ?? null, b.subjectId ?? null, b.mode, b.fullScore, c.get("deviceId") ?? null, now)
    .run();
  return c.json({ ok: true, id: sid, startedAt: now });
});

assignmentRoutes.post("/api/scan-sessions/:id/end", async (c) => {
  const sid = c.req.param("id");
  await c.env.DB.prepare(
    `UPDATE scan_sessions SET ended_at = ?,
       scan_count = (SELECT COUNT(*) FROM submissions WHERE scan_session_id = ?)
     WHERE id = ?`,
  )
    .bind(Date.now(), sid, sid)
    .run();
  return c.json({ ok: true });
});

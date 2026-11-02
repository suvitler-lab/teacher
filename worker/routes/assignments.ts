import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { readJson, notFound, ApiError } from "../lib/http";
import { auditInsertStmt } from "../lib/audit";
import { abortIf, batchAtEpoch, requestEpoch } from "../lib/guard";
import { id, ulid } from "@shared/ids";
import { mapAssignment } from "../lib/rows";
import { lateFixForAssignment } from "../lib/late";

export const assignmentRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
assignmentRoutes.use("/api/assignments", requireAuth);
assignmentRoutes.use("/api/assignments/*", requireAuth);
assignmentRoutes.use("/api/scan-sessions", requireAuth);
assignmentRoutes.use("/api/scan-sessions/*", requireAuth);

// a real Common-Era calendar date YYYY-MM-DD, years 1900–2099 (the restore check's `date` plus a year range: a
// Buddhist-era "2569-10-20" would compare after every hand-in and silently switch "late" off)
const ceDate = z.string().regex(/^(19|20)\d{2}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}, "not a real date");
// "" from an older screen means "no date". The CE check runs in the route, once the work's stored dates are known.
const ymd = z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional());
const newDates = z.object({ assigned_date: ceDate.nullish(), due_date: ceDate.nullish() });
/** A date the work already holds, character for character, is kept as it is — anything else is checked. */
const changed = (v: string | null | undefined, stored: string | null | undefined) => (v != null && v === stored ? null : v);

const assignmentSchema = z.object({
  id: z.string().optional(),
  term_id: z.string().nullable().optional(),
  subject_id: z.string().min(1),
  type_id: z.string().min(1),
  title: z.string().min(1),
  unit: z.string().nullable().optional(),
  full_score: z.number().int().min(1).max(100),
  assigned_date: ymd,
  due_date: ymd,
  note: z.string().nullable().optional(),
  publish_scores: z.boolean().optional(),
  status: z.enum(["open", "closed"]).optional(),
  class_ids: z.array(z.string()).min(1),
  // EP-05 v2 (integrity-c02): the teacher's answer to "the old full score was held by N — give them the new one?"
  // and the old full score the question showed. Both or neither; a request without them is the old app's request.
  raise_choice: z.enum(["adjust", "keep"]).optional(),
  raise_from: z.number().int().optional(),
}).refine((v) => (v.raise_choice === undefined) === (v.raise_from === undefined), {
  message: "raise_choice and raise_from go together",
  path: ["raise_choice"],
});

// BR-01: the submission rows of work ?1 that hold the full score `full` — every class, every student status, every
// method; never excused / void / awaiting a score (a NULL score never equals anything)
const holdsFull = (full: string) => `assignment_id = ?1 AND status = 'submitted' AND score = ${full}`;
/** The work's full score as it is inside the transaction. */
const FULL_NOW = "(SELECT full_score FROM assignments WHERE id = ?1)";
/**
 * The cell history lines one "ปรับ" batch wrote (work `aid`, batch `batch`: SQL parameters). Their op_ids are
 * `<batchId>:<student_id>`, so a range on the op_id UNIQUE index reaches exactly them — not the work's whole history
 * (audit_logs has no index on batch_id). The other conditions keep the set the same as without the range; their unary
 * `+` keeps SQLite from choosing the (assignment_id, …) or (entity, …) index instead, which would walk the work's — or
 * every work's — whole cell history.
 */
const ownCellLines = (aid: string, batch: string) =>
  `op_id >= (${batch} || ':') AND op_id < (${batch} || ';') AND +assignment_id = ${aid} AND +batch_id = ${batch}
   AND +action = 'bulk' AND +entity = 'submission'`;
/** A submission row (alias s) as the API's Submission — the 10 fields of mapSubmission, late as a boolean (EP-04 reads it back). */
const SUBMISSION_JSON = `json_object('assignment_id', s.assignment_id, 'student_id', s.student_id, 'status', s.status,
  'score', s.score, 'late', json(CASE WHEN s.late = 1 THEN 'true' ELSE 'false' END), 'submitted_at', s.submitted_at,
  'method', s.method, 'device_id', s.device_id, 'scan_session_id', s.scan_session_id, 'updated_at', s.updated_at)`;

assignmentRoutes.post("/api/assignments", async (c) => {
  const b = assignmentSchema.parse(await readJson(c));
  const now = Date.now();
  const epoch = await requestEpoch(c);
  const aid = b.id ?? id("asg");
  const db = c.env.DB;
  const choice = b.raise_choice ?? null;
  // One round of reads — everything the checks below need that doesn't depend on anything else (the database is
  // far away, so the number of round trips is what a teacher waits for): the work as it is now, the term, the
  // classes it already had, the classes it is being given to, and how many hold the work's full score now.
  const [existing, term, prevRows, classRows, holdersRow] = await Promise.all([
    db.prepare("SELECT * FROM assignments WHERE id = ?").bind(aid).first<any>(),
    b.term_id ? db.prepare("SELECT year FROM terms WHERE id = ?").bind(b.term_id).first<{ year: number }>() : Promise.resolve(null),
    db.prepare("SELECT class_id FROM assignment_classes WHERE assignment_id = ?").bind(aid).all<{ class_id: string }>(),
    db.prepare("SELECT id, name, year FROM classes WHERE id IN (SELECT value FROM json_each(?1))")
      .bind(JSON.stringify(b.class_ids)).all<{ id: string; name: string; year: number | null }>(),
    b.id
      ? db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE ${holdsFull(FULL_NOW)}`).bind(aid).first<{ n: number }>()
      : Promise.resolve(null),
  ]);

  // dates: new or changed ones must be real CE dates (422) — but older work restored with a Buddhist-era date can still
  // be closed / have its scores hidden, which sends the stored dates back unchanged
  newDates.parse({
    assigned_date: changed(b.assigned_date, existing?.assigned_date),
    due_date: changed(b.due_date, existing?.due_date),
  });

  // EP-05 case 3: the question was answered for a full score that is no longer the work's (another device changed it
  // while the dialog was open) — nothing is adjusted from the old numbers (BR-05)
  const fullScoreChanged = (current: number) => c.json({
    error: "full_score_changed",
    message: `คะแนนเต็มของงานนี้เพิ่งถูกแก้จากเครื่องอื่น (ตอนนี้ ${current}) — ปิดแล้วเปิดแก้ไขงานใหม่`,
    currentFullScore: current,
  }, 409);
  if (choice && existing && existing.full_score !== b.raise_from) return fullScoreChanged(existing.full_score);

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
  // (checked again inside the write below — a class can change year between this look and that write)
  let yearChecked: string[] = [];
  const yearMismatch = (off: { name: string }[]) => c.json({
    error: "class_year_mismatch",
    message: `ห้อง ${off.map((r) => r.name).join(", ")} เป็นของปีการศึกษาอื่น ไม่ตรงกับภาคเรียนของงานนี้`,
  }, 422);
  if (term) {
    const termMoved = !existing || (existing.term_id ?? null) !== b.term_id;
    const prev = new Set((prevRows.results ?? []).map((r) => r.class_id));
    yearChecked = termMoved ? b.class_ids : b.class_ids.filter((cid) => !prev.has(cid));
    const toCheck = new Set(yearChecked);
    const off = (classRows.results ?? []).filter((r) => toCheck.has(r.id) && r.year != null && r.year !== term.year);
    if (off.length > 0) return yearMismatch(off);
  }
  // the same rule in SQL (classes looked up by primary key): the guard in the batch, and the fresh look after it fails
  const classesOffYear =
    "SELECT name FROM classes WHERE id IN (SELECT value FROM json_each(?1)) AND year IS NOT NULL AND year != (SELECT year FROM terms WHERE id = ?2)";

  // EP-05 case 6 (BR-02, BR-10): raising the full score of work some children hold the old full score of needs the
  // teacher's answer first. The new app opens its question from count/from/to; an older app shows the message.
  const raiseChoiceRequired = (count: number, from: number) => c.json({
    error: "raise_choice_required",
    message: `มี ${count} คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง`,
    count, from, to: b.full_score,
  }, 409);
  const raising = !!existing && b.full_score > existing.full_score;
  if (raising && !choice && (holdersRow?.n ?? 0) > 0) return raiseChoiceRequired(holdersRow!.n, existing.full_score);
  // the question was asked and answered (cases 7 and 8). Past case 3, the old full score is raise_from; a choice sent
  // with anything that is not a raise is ignored (case 9).
  const raise = raising && choice ? { choice, from: b.raise_from!, to: b.full_score } : null;
  const batchId = raise ? ulid() : null;
  const deviceId = c.get("deviceId") ?? null;

  // the answer stands only for the full score it was given for (BR-05): checked first in the batch. Without an answer,
  // a raise that finds a holder of the old full score at write time (a scan landed since the look above) is refused.
  const raiseGuard = choice
    ? (existing ? [abortIf(c.env, `${FULL_NOW} IS NOT ?2`, aid, b.raise_from)] : [])
    : [abortIf(c.env, `?2 > ${FULL_NOW} AND EXISTS (SELECT 1 FROM submissions WHERE ${holdsFull(FULL_NOW)})`, aid, b.full_score)];
  // who holds the old full score is decided by the write itself (BR-05, D-integrity-c02-02) — never from a list read
  // earlier or sent by a device. Placed before anything moves, so it is the count the teacher's answer applies to.
  const holdersNow = raise
    ? c.env.DB.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE ${holdsFull("?2")}`).bind(aid, raise.from)
    : null;
  // "adjust" (BR-02, BR-04): one history line per cell with the cell as it was (before the update below sees it), then
  // the cell itself — score = the new full score, method bulk, this device, now; status / late / submitted_at /
  // scan_session_id stay. EP-04 (bulk-undo) reads these lines back: action and method "bulk", the batch id below.
  const adjust = raise?.choice === "adjust"
    ? {
        audit: c.env.DB.prepare(
          `INSERT INTO audit_logs (op_id, at, client_at, device_id, actor_id, scan_session_id, batch_id, entity, entity_id,
             assignment_id, student_id, action, before_json, after_json, method)
           SELECT ?3 || ':' || s.student_id, ?4, NULL, ?5, 'teacher', NULL, ?3, 'submission', s.assignment_id || ':' || s.student_id,
             s.assignment_id, s.student_id, 'bulk', ${SUBMISSION_JSON}, NULL, 'bulk'
           FROM submissions s WHERE ${holdsFull("?2")}`,
        ).bind(aid, raise.from, batchId, now, deviceId),
        cells: c.env.DB.prepare(
          `UPDATE submissions SET score = ?3, method = 'bulk', device_id = ?4, updated_at = ?5, event_at = ?5 WHERE ${holdsFull("?2")}`,
        ).bind(aid, raise.from, raise.to, deviceId, now),
        // ...and each line's `after` is the cell as this batch leaves it (after lateFixForAssignment below)
        after: c.env.DB.prepare(
          `UPDATE audit_logs SET after_json = (SELECT ${SUBMISSION_JSON} FROM submissions s
             WHERE s.assignment_id = audit_logs.assignment_id AND s.student_id = audit_logs.student_id)
           WHERE ${ownCellLines("?1", "?2")}`,
        ).bind(aid, batchId),
      }
    : null;

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
    // BR-04: "late" follows the work's CURRENT due date (lib/late.ts) — re-decided here, after the upsert above and in
    // the same transaction, so moving the due date (or clearing it) fixes every row at once. Only rows whose value
    // changes are written; updated_at / event_at stay (the teacher did not act on those cells).
    lateFixForAssignment(c.env, aid),
  ];
  const workOpId = ulid();
  const audit = auditInsertStmt(c.env, [
    {
      op_id: workOpId, batch_id: batchId,
      entity: "assignment", entity_id: aid, assignment_id: aid,
      action: existing ? "update" : "create", device_id: c.get("deviceId"),
      before: existing ? { full_score: (existing as any).full_score, title: (existing as any).title, due_date: (existing as any).due_date ?? null } : null,
      after: {
        title: b.title, full_score: b.full_score, class_ids: b.class_ids, due_date: b.due_date ?? null,
        ...(raise ? { raise: { ...raise, count: 0 } } : {}), // count: filled in by the batch itself, just below
      },
      method: "manual",
    },
  ], now);
  // the work line's raise.count, counted in SQL in the same batch: the cells this batch adjusted, or (keep) the
  // holders of the old full score it left as they were
  const auditCount = raise
    ? c.env.DB.prepare(
        `UPDATE audit_logs SET after_json = json_set(after_json, '$.raise.count', ${raise.choice === "adjust"
          ? `(SELECT COUNT(*) FROM audit_logs WHERE ${ownCellLines("?2", "?3")})`
          : `(SELECT COUNT(*) FROM submissions WHERE assignment_id = ?2 AND status = 'submitted' AND score = ?3)`})
         WHERE op_id = ?1`,
      ).bind(workOpId, aid, raise.choice === "adjust" ? batchId : raise.from)
    : null;

  const write: D1PreparedStatement[] = [
    // guards first: a restore since this request began, scores that now sit above the new full score, a class that is
    // no longer of the term's year, or a full score other than the one the teacher answered for roll the whole batch
    // back — nothing of it (title, full score, class links, adjusted cells, the audit lines) is half-applied
    abortIf(c.env, lowersBelowScores, aid, b.full_score),
    ...(yearChecked.length > 0 ? [abortIf(c.env, `EXISTS (${classesOffYear})`, JSON.stringify(yearChecked), b.term_id)] : []),
    ...raiseGuard,
  ];
  const holdersAt = holdersNow ? write.push(holdersNow) - 1 : -1;
  if (adjust) write.push(adjust.audit, adjust.cells);
  write.push(...stmts);
  if (adjust) write.push(adjust.after);
  write.push(audit);
  if (auditCount) write.push(auditCount);

  let count = 0;
  try {
    const results = await batchAtEpoch(c.env, epoch, write);
    if (holdersAt >= 0) count = (results[holdersAt].results?.[0] as { n: number } | undefined)?.n ?? 0;
  } catch (e) {
    if (e instanceof ApiError) throw e; // epoch_changed
    // fresh look, in the order of EP-05's cases (answered full score, scores, class years, unanswered raise)
    if (choice && existing) {
      const cur = await c.env.DB.prepare("SELECT full_score FROM assignments WHERE id = ?").bind(aid).first<{ full_score: number }>();
      if (cur && cur.full_score !== b.raise_from) return fullScoreChanged(cur.full_score);
    }
    const over = await scoreOverFull();
    if (over > 0 && existing && b.full_score < existing.full_score) return c.json({ error: "score_over_full", over }, 409);
    if (yearChecked.length > 0) {
      const off = await c.env.DB.prepare(classesOffYear).bind(JSON.stringify(yearChecked), b.term_id).all<{ name: string }>();
      if ((off.results ?? []).length > 0) return yearMismatch(off.results);
    }
    if (!choice) {
      const cur = await c.env.DB.prepare(
        `SELECT full_score, (SELECT COUNT(*) FROM submissions WHERE ${holdsFull(FULL_NOW)}) AS n FROM assignments WHERE id = ?1`,
      ).bind(aid).first<{ full_score: number; n: number }>();
      if (cur && b.full_score > cur.full_score && cur.n > 0) return raiseChoiceRequired(cur.n, cur.full_score);
    }
    throw e;
  }
  return c.json({
    ok: true,
    assignment: mapAssignment({ ...b, id: aid, created_at: (existing as any)?.created_at ?? now, updated_at: now, publish_scores: b.publish_scores === false ? 0 : 1, status: b.status ?? "open", deleted_at: null }, b.class_ids),
    raise: raise ? { ...raise, count, batchId: raise.choice === "adjust" && count > 0 ? batchId : null } : null,
  });
});

assignmentRoutes.post("/api/assignments/:id/delete", async (c) => {
  const aid = c.req.param("id");
  const now = Date.now();
  // the history line first, in the same transaction, and only if this delete really happens (the work is
  // there and not deleted yet — the same condition as the update below)
  const [, r] = await batchAtEpoch(c.env, await requestEpoch(c), [
    auditInsertStmt(c.env, [
      { entity: "assignment", entity_id: aid, assignment_id: aid, action: "void", device_id: c.get("deviceId"), method: "manual" },
    ], now, { sql: "EXISTS (SELECT 1 FROM assignments WHERE id = ?2 AND deleted_at IS NULL)", binds: [aid] }),
    c.env.DB.prepare("UPDATE assignments SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(now, now, aid),
  ]);
  if (r.meta.changes === 0) throw notFound("assignment");
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
  await batchAtEpoch(c.env, await requestEpoch(c), [c.env.DB.prepare(
    `INSERT INTO scan_sessions (id, assignment_id, class_id, subject_id, mode, full_score, device_id, started_at, scan_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET mode=excluded.mode`,
  )
    .bind(sid, b.assignmentId, b.classId ?? null, b.subjectId ?? null, b.mode, b.fullScore, c.get("deviceId") ?? null, now)]);
  return c.json({ ok: true, id: sid, startedAt: now });
});

assignmentRoutes.post("/api/scan-sessions/:id/end", async (c) => {
  const sid = c.req.param("id");
  await batchAtEpoch(c.env, await requestEpoch(c), [c.env.DB.prepare(
    `UPDATE scan_sessions SET ended_at = ?,
       scan_count = (SELECT COUNT(*) FROM submissions WHERE scan_session_id = ?)
     WHERE id = ?`,
  )
    .bind(Date.now(), sid, sid)]);
  return c.json({ ok: true });
});

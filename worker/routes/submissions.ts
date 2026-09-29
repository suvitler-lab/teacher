import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { getEpoch } from "../lib/db";
import { EPOCH_SQL, abortIf, batchAtEpoch, epochChanged, requestEpoch } from "../lib/guard";
import { loadTerm, rosterRows } from "../lib/roster";
import { readJson, bad, notFound, conflict, ApiError } from "../lib/http";
import { existingOpIds, auditInsertStmt, type AuditRow } from "../lib/audit";
import { isLateSubmission, clampClientTs } from "../lib/time";
import { id, ulid } from "@shared/ids";
import type { SubmissionOpResult, Submission } from "@shared/types";

export const submissionRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
submissionRoutes.use("/api/submissions/*", requireAuth);
submissionRoutes.use("/api/assignments/:id/submissions", requireAuth);
submissionRoutes.use("/api/assignments/:id/bulk", requireAuth);
submissionRoutes.use("/api/assignments/:id/bulk-undo", requireAuth);

function mapSubmission(r: any): Submission {
  return {
    assignment_id: r.assignment_id,
    student_id: r.student_id,
    status: r.status,
    score: r.score ?? null,
    late: r.late === 1,
    submitted_at: r.submitted_at ?? null,
    method: r.method ?? null,
    device_id: r.device_id ?? null,
    scan_session_id: r.scan_session_id ?? null,
    updated_at: r.updated_at,
  };
}

// GET current submissions for an assignment (optionally only changes since ts)
submissionRoutes.get("/api/assignments/:id/submissions", async (c) => {
  const aid = c.req.param("id");
  const since = Number(c.req.query("since") ?? "0") || 0;
  const [res, asg] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM submissions WHERE assignment_id = ? AND updated_at > ? ORDER BY updated_at")
      .bind(aid, since).all(),
    c.env.DB.prepare("SELECT status, full_score, deleted_at FROM assignments WHERE id = ?")
      .bind(aid).first<{ status: string; full_score: number; deleted_at: number | null }>(),
  ]);
  return c.json({
    submissions: (res.results ?? []).map(mapSubmission),
    // the scan screen must not keep accepting hand-ins for work that was closed or deleted meanwhile
    assignment: asg ? { status: asg.status, full_score: asg.full_score, deleted: asg.deleted_at != null } : null,
    serverTime: Date.now(),
  });
});

const opSchema = z.object({
  opId: z.string().min(1),
  scanSessionId: z.string().min(1),
  assignmentId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["submitted", "excused", "void"]),
  score: z.number().multipleOf(0.5).nullable(),
  fullScoreAtScan: z.number().int(),
  method: z.enum(["camera", "hid", "manual", "grid", "bulk", "import", "restore"]),
  clientTs: z.number(),
  intent: z.enum(["receive", "grade"]).optional(),
  dataEpoch: z.number().int().optional(),
});
const batchSchema = z.object({ ops: z.array(opSchema).min(1).max(50) });

/** A submission row plus what the write's guard needs to re-check inside the transaction. */
interface GuardedRow {
  assignment_id: string;
  student_id: string;
  status: string;
  score: number | null;
  late: number;
  submitted_at: number | null;
  method: string;
  device_id: string | null;
  scan_session_id: string | null;
  updated_at: number;
  event_at: number;
  op_id: string;         // the audit row that goes with this write
  expect_full: number;   // the full score it was judged against
  receive: 0 | 1;        // accepting a hand-in (refused once the work is closed) rather than grading
}

/**
 * The conditions a write was judged under, repeated at the moment it happens — SQL over one JSON row
 * `row` and the data epoch `epoch` (a parameter placeholder). The same text guards the write AND its audit
 * row, so the trail says "written" exactly when the row was.
 *   · no restore has replaced the data since the request started
 *   · the assignment is still there, still has the full score the row was judged against, and is still
 *     open if this is a hand-in
 *   · the student's class is (still) one of the assignment's — or the assignment has no class links at all
 *   · nothing the teacher did LATER is already in the cell
 */
function stillValid(row: string, epoch: string): string {
  const f = (k: string) => `json_extract(${row}.value, '$.${k}')`;
  return `${EPOCH_SQL} = ${epoch}
    AND EXISTS (SELECT 1 FROM assignments a WHERE a.id = ${f("assignment_id")} AND a.deleted_at IS NULL
                AND a.full_score = ${f("expect_full")} AND NOT (a.status = 'closed' AND ${f("receive")} = 1))
    AND EXISTS (SELECT 1 FROM students st WHERE st.id = ${f("student_id")}
                AND (NOT EXISTS (SELECT 1 FROM assignment_classes ac WHERE ac.assignment_id = ${f("assignment_id")})
                     OR st.class_id IN (SELECT ac.class_id FROM assignment_classes ac WHERE ac.assignment_id = ${f("assignment_id")})))
    AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = ${f("assignment_id")} AND s.student_id = ${f("student_id")}
                    AND s.event_at IS NOT NULL AND s.event_at > ${f("event_at")})`;
}

/**
 * Upsert a JSON array of submission rows (one statement).
 * Last-write-wins on event_at — the moment the teacher acted — never on arrival order: a row only
 * replaces what is there if it is at least as recent. (updated_at stays "when the server saw it",
 * which the scan screen polls on.)
 * With `epoch`, a row is written only while `stillValid` holds for it; without, the caller's own guards apply.
 */
function submissionUpsertStmt(env: Env, rows: unknown[], epoch?: number) {
  return env.DB.prepare(
    `INSERT INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     SELECT json_extract(j.value,'$.assignment_id'), json_extract(j.value,'$.student_id'),
            json_extract(j.value,'$.status'), json_extract(j.value,'$.score'),
            json_extract(j.value,'$.late'), json_extract(j.value,'$.submitted_at'),
            json_extract(j.value,'$.method'), json_extract(j.value,'$.device_id'),
            json_extract(j.value,'$.scan_session_id'), json_extract(j.value,'$.updated_at'),
            json_extract(j.value,'$.event_at')
     FROM json_each(?1) j WHERE ${epoch == null ? "true" : stillValid("j", "?2")}
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET
       status=excluded.status, score=excluded.score, late=excluded.late,
       submitted_at=excluded.submitted_at, method=excluded.method,
       device_id=excluded.device_id, scan_session_id=excluded.scan_session_id,
       updated_at=excluded.updated_at, event_at=excluded.event_at
     WHERE submissions.event_at IS NULL OR excluded.event_at >= submissions.event_at`,
  ).bind(JSON.stringify(rows), ...(epoch == null ? [] : [epoch]));
}

/** The audit rows of `rows`, kept only for the rows `stillValid` lets through in the same batch. */
function guardedAuditStmt(env: Env, audits: AuditRow[], rows: GuardedRow[], epoch: number, now: number) {
  return auditInsertStmt(env, audits, now, {
    sql: `EXISTS (SELECT 1 FROM json_each(?2) r WHERE json_extract(r.value, '$.op_id') = json_extract(j.value, '$.op_id')
                  AND ${stillValid("r", "?3")})`,
    binds: [JSON.stringify(rows), epoch],
  });
}

/** Does this op ACCEPT a hand-in (refused once the work is closed), or is it the teacher grading? */
function opIntent(op: { intent?: "receive" | "grade"; method: string }): "receive" | "grade" {
  if (op.intent) return op.intent;
  return op.method === "camera" || op.method === "hid" || op.method === "manual" ? "receive" : "grade";
}

type OpIn = z.infer<typeof opSchema>;
interface AsgRow { id: string; full_score: number; due_date: string | null; status: string; deleted_at: number | null }
interface World {
  assignments: Map<string, AsgRow>;
  classesOf: Map<string, Set<string>>;
  students: Map<string, { id: string; class_id: string | null }>;
  existing: Map<string, any>; // `${assignment}\0${student}` -> current submission row
}

/** Read what the ops are about, as it is now. */
async function loadWorld(env: Env, ops: OpIn[]): Promise<World> {
  const assignmentIds = JSON.stringify([...new Set(ops.map((o) => o.assignmentId))]);
  const studentIds = JSON.stringify([...new Set(ops.map((o) => o.studentId))]);
  const pairs = JSON.stringify([...new Set(ops.map((o) => `${o.assignmentId}\u0000${o.studentId}`))].map((k) => k.split("\u0000")));
  const [aRes, linkRes, sRes, exRes] = await Promise.all([
    env.DB.prepare(
      `SELECT a.id, a.full_score, a.due_date, a.status, a.deleted_at FROM assignments a
       WHERE a.id IN (SELECT value FROM json_each(?1))`,
    ).bind(assignmentIds).all<AsgRow>(),
    env.DB.prepare(
      `SELECT ac.assignment_id, ac.class_id FROM assignment_classes ac
       WHERE ac.assignment_id IN (SELECT value FROM json_each(?1))`,
    ).bind(assignmentIds).all<{ assignment_id: string; class_id: string }>(),
    env.DB.prepare(`SELECT s.id, s.class_id FROM students s WHERE s.id IN (SELECT value FROM json_each(?1))`)
      .bind(studentIds).all<{ id: string; class_id: string | null }>(),
    // one point lookup per (assignment, student) pair, by the primary key. CROSS JOIN pins the list as the outer loop:
    // matching an expression of both columns instead (or letting the planner pick) reads the WHOLE table per scan
    env.DB.prepare(
      `SELECT sub.* FROM json_each(?1) j
       CROSS JOIN submissions sub
         ON sub.assignment_id = json_extract(j.value, '$[0]') AND sub.student_id = json_extract(j.value, '$[1]')`,
    ).bind(pairs).all(),
  ]);
  const classesOf = new Map<string, Set<string>>();
  for (const l of linkRes.results ?? []) {
    const set = classesOf.get(l.assignment_id) ?? new Set();
    set.add(l.class_id);
    classesOf.set(l.assignment_id, set);
  }
  const existing = new Map<string, any>();
  for (const r of exRes.results ?? []) existing.set(`${r.assignment_id}\u0000${r.student_id}`, r);
  return {
    assignments: new Map((aRes.results ?? []).map((a) => [a.id, a])),
    classesOf,
    students: new Map((sRes.results ?? []).map((s) => [s.id, s])),
    existing,
  };
}

/** Why this op cannot be applied to `w` — or null if the data allows it (event-time clashes are decided separately). */
function judge(op: OpIn, w: World): SubmissionOpResult | null {
  const a = w.assignments.get(op.assignmentId);
  if (!a || a.deleted_at) return { opId: op.opId, result: "invalid", reason: "assignment_missing" };
  if (a.full_score !== op.fullScoreAtScan) return { opId: op.opId, result: "full_score_changed", currentFullScore: a.full_score };
  // a closed assignment stops ACCEPTING hand-ins — by any means (scanner, camera, typed number, tap
  // on the grid) — but the teacher can still grade it in the gradebook, and void/excuse
  if (a.status === "closed" && op.status === "submitted" && opIntent(op) === "receive") return { opId: op.opId, result: "assignment_closed" };
  const student = w.students.get(op.studentId);
  const allowed = w.classesOf.get(op.assignmentId);
  if (!student || (allowed && allowed.size > 0 && (!student.class_id || !allowed.has(student.class_id)))) {
    return { opId: op.opId, result: "not_in_class" };
  }
  if (op.score != null && (op.score < 0 || op.score > a.full_score)) return { opId: op.opId, result: "invalid", reason: "score_out_of_range" };
  return null;
}

submissionRoutes.post("/api/submissions/batch", async (c) => {
  const { ops } = batchSchema.parse(await readJson(c));
  const now = Date.now();
  const deviceId = c.get("deviceId") ?? null;
  const epoch = await requestEpoch(c);

  // 1. drop ops whose op_id already landed (idempotency)
  const applied = await existingOpIds(
    c.env,
    ops.map((o) => o.opId),
  );

  // 2. what the ops are about: assignments + their class links, students, current cells
  const world = await loadWorld(c.env, ops);

  const results: SubmissionOpResult[] = new Array(ops.length);
  // ops that passed every check made HERE — whether each really landed is only known after the write
  const pending: { index: number; op: OpIn; row: GuardedRow }[] = [];
  const audits: AuditRow[] = [];
  // effective prior state per pair, updated as we process ops so a "receive"
  // and a later "score" for the same student in one batch keep the first
  // receive time instead of resetting submitted_at.
  const effective = new Map<string, any>(world.existing);

  for (const [index, op] of ops.entries()) {
    if (applied.has(op.opId)) {
      const ex = world.existing.get(`${op.assignmentId}\u0000${op.studentId}`);
      results[index] = {
        opId: op.opId,
        result: "duplicate",
        submission: ex ? mapSubmission(ex) : (undefined as any),
      };
      continue;
    }
    // made before the data was restored: held for the teacher, never poured into the new data
    if (op.dataEpoch != null && op.dataEpoch !== epoch) {
      results[index] = { opId: op.opId, result: "epoch_changed" };
      continue;
    }
    const refused = judge(op, world);
    if (refused) {
      results[index] = refused;
      continue;
    }
    const a = world.assignments.get(op.assignmentId)!;

    const pairKey = `${op.assignmentId}\u0000${op.studentId}`;
    const before = effective.get(pairKey);
    // when the teacher acted, never in the future and never older than a week
    const eventAt = clampClientTs(op.clientTs, now);
    if (before && before.event_at != null && before.event_at > eventAt) {
      // the cell already holds something the teacher did LATER (e.g. a whole-class clear made
      // from another screen while this op sat in an offline queue) — this one must not win
      results[index] = { opId: op.opId, result: "superseded", submission: mapSubmission(before) };
      continue;
    }
    const wasSubmitted = before && before.status === "submitted";
    // submitted_at + late are decided only when a student first becomes
    // "submitted"; later score edits keep the original submit time & lateness.
    let submittedAt: number | null;
    let late: number;
    if (op.status === "void") {
      submittedAt = null;
      late = 0;
    } else if (op.status === "submitted" && !wasSubmitted) {
      submittedAt = clampClientTs(op.clientTs, now);
      late = isLateSubmission(a.due_date, submittedAt) ? 1 : 0;
    } else {
      submittedAt = before?.submitted_at ?? clampClientTs(op.clientTs, now);
      late = before?.late ?? 0;
    }
    const row: GuardedRow = {
      assignment_id: op.assignmentId,
      student_id: op.studentId,
      status: op.status,
      score: op.score,
      late,
      submitted_at: submittedAt,
      method: op.method,
      device_id: deviceId,
      scan_session_id: op.scanSessionId,
      updated_at: now,
      event_at: eventAt,
      op_id: op.opId,
      expect_full: a.full_score,
      receive: op.status === "submitted" && opIntent(op) === "receive" ? 1 : 0,
    };
    pending.push({ index, op, row });
    effective.set(pairKey, row);
    audits.push({
      op_id: op.opId,
      at: now,
      client_at: op.clientTs,
      device_id: deviceId,
      scan_session_id: op.scanSessionId,
      entity: "submission",
      entity_id: `${op.assignmentId}:${op.studentId}`,
      assignment_id: op.assignmentId,
      student_id: op.studentId,
      action: op.status === "void" ? "void" : before ? "update" : "create",
      before: before ? mapSubmission(before) : null,
      after: row,
      method: op.method,
    });
  }

  if (pending.length > 0) {
    const rows = pending.map((p) => p.row);
    // the audit goes FIRST: both statements judge the same "before" (the upsert is what changes it), and
    // both re-check `stillValid` — so a row is audited if and only if it is written
    await c.env.DB.batch([guardedAuditStmt(c.env, audits, rows, epoch, now), submissionUpsertStmt(c.env, rows, epoch)]);

    // The reply must say what HAPPENED, not what was meant to: an op whose audit row is there landed;
    // any other lost a race between the check above and the write, and is answered with the truth now.
    const landed = await existingOpIds(c.env, pending.map((p) => p.op.opId));
    const lost = pending.filter((p) => !landed.has(p.op.opId));
    const fresh = lost.length > 0
      ? { epoch: await getEpoch(c.env), world: await loadWorld(c.env, lost.map((p) => p.op)) }
      : null;
    for (const p of pending) {
      if (landed.has(p.op.opId)) {
        results[p.index] = { opId: p.op.opId, result: "ok", submission: mapSubmission(p.row) };
      } else if (fresh!.epoch !== epoch) {
        results[p.index] = { opId: p.op.opId, result: "epoch_changed" };
      } else {
        const cur = fresh!.world.existing.get(`${p.op.assignmentId}\u0000${p.op.studentId}`);
        results[p.index] = judge(p.op, fresh!.world) ?? {
          opId: p.op.opId, result: "superseded", submission: cur ? mapSubmission(cur) : undefined,
        };
      }
    }
  }

  return c.json({ results, serverTime: now });
});

// bulk: mark whole class submitted / full score / clear
const bulkSchema = z.object({
  action: z.enum(["all-submitted", "full-score", "clear"]),
  classId: z.string().min(1),
});

submissionRoutes.post("/api/assignments/:id/bulk", async (c) => {
  const aid = c.req.param("id");
  const { action, classId } = bulkSchema.parse(await readJson(c));
  const epoch = await requestEpoch(c);
  const a = await c.env.DB.prepare(
    "SELECT id, term_id, full_score, due_date, deleted_at, status FROM assignments WHERE id = ?",
  )
    .bind(aid)
    .first<{ id: string; term_id: string | null; full_score: number; due_date: string | null; deleted_at: number | null; status: string }>();
  if (!a || a.deleted_at) throw notFound("assignment");
  // "everyone handed it in" is ACCEPTING hand-ins; scoring/clearing stays possible on closed work
  if (a.status === "closed" && action === "all-submitted") {
    throw conflict("assignment_closed", "งานนี้ปิดรับแล้ว — เปิดรับงานอีกครั้งก่อนถ้าต้องการรับเพิ่ม");
  }
  // only a class the work was given to: the screen filters this already, but the API keeps the relation itself
  // (older work with no class links at all stays open to any class)
  const links = (await c.env.DB.prepare("SELECT class_id FROM assignment_classes WHERE assignment_id = ?").bind(aid).all<{ class_id: string }>()).results ?? [];
  if (links.length > 0 && !links.some((l) => l.class_id === classId)) {
    throw bad("class_not_assigned", "งานนี้ไม่ได้มอบหมายให้ห้องนี้");
  }

  // the class as it was for THIS assignment's term: grading last year's work must reach last year's
  // children (finished), and must not touch this year's newcomers in the same-named class
  const list: { id: string }[] = await rosterRows(c.env, classId, await loadTerm(c.env, a.term_id), "s.id");
  if (list.length === 0) throw bad("no_students");

  const now = Date.now();
  const late = isLateSubmission(a.due_date, now) ? 1 : 0;
  const batchId = ulid();
  const deviceId = c.get("deviceId") ?? null;

  // current state for these students on this assignment
  const cur = await c.env.DB.prepare(
    "SELECT * FROM submissions WHERE assignment_id = ? AND student_id IN (SELECT id FROM students WHERE class_id = ?)",
  )
    .bind(aid, classId)
    .all();
  const curMap = new Map<string, any>();
  for (const r of (cur.results ?? []) as any[]) curMap.set(r.student_id, r);

  const upserts: GuardedRow[] = [];
  const audits: AuditRow[] = [];
  for (const s of list) {
    const before = curMap.get(s.id);
    let row: any | null = null;
    if (action === "all-submitted") {
      if (before && before.status === "submitted") continue; // already submitted
      row = {
        assignment_id: aid, student_id: s.id, status: "submitted",
        score: before?.score ?? null, late, submitted_at: now,
        method: "bulk", device_id: deviceId, scan_session_id: null, updated_at: now,
      };
    } else if (action === "full-score") {
      if (!before || before.status !== "submitted") continue; // only score those submitted
      if (before.score === a.full_score) continue;
      row = { ...before, score: a.full_score, method: "bulk", device_id: deviceId, updated_at: now };
    } else {
      // clear
      if (!before || before.status === "void") continue;
      row = {
        assignment_id: aid, student_id: s.id, status: "void", score: null, late: 0,
        submitted_at: null, method: "bulk", device_id: deviceId,
        scan_session_id: before?.scan_session_id ?? null, updated_at: now,
      };
    }
    if (!row) continue;
    const opId = id("op");
    upserts.push({
      assignment_id: row.assignment_id, student_id: row.student_id, status: row.status,
      score: row.score, late: row.late ?? 0, submitted_at: row.submitted_at,
      method: row.method, device_id: row.device_id, scan_session_id: row.scan_session_id ?? null,
      updated_at: row.updated_at, event_at: now,
      op_id: opId, expect_full: a.full_score, receive: action === "all-submitted" ? 1 : 0,
    });
    audits.push({
      op_id: opId, at: now, device_id: deviceId, batch_id: batchId,
      entity: "submission", entity_id: `${aid}:${s.id}`, assignment_id: aid, student_id: s.id,
      action: "bulk", before: before ? mapSubmission(before) : null, after: mapSubmission(upserts[upserts.length - 1]),
      method: "bulk",
    });
  }

  let changed = 0;
  if (upserts.length > 0) {
    await c.env.DB.batch([guardedAuditStmt(c.env, audits, upserts, epoch, now), submissionUpsertStmt(c.env, upserts, epoch)]);
    // what really changed = the rows whose audit landed with this batch (the same guard let both through)
    changed = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE batch_id = ? AND action = 'bulk'").bind(batchId).first<{ n: number }>())?.n ?? 0;
    if (changed === 0) {
      // nothing landed. The guards are the same for every row, so either the world changed under this
      // request (say how) — or every row already holds something newer than this action, and that is fine
      if ((await getEpoch(c.env)) !== epoch) throw epochChanged();
      const now2 = await c.env.DB.prepare("SELECT full_score, status, deleted_at FROM assignments WHERE id = ?")
        .bind(aid).first<{ full_score: number; status: string; deleted_at: number | null }>();
      if (!now2 || now2.deleted_at) throw notFound("assignment");
      if (now2.full_score !== a.full_score) throw conflict("full_score_changed", "คะแนนเต็มของงานนี้เพิ่งถูกแก้ — ลองทำรายการอีกครั้ง");
      if (now2.status === "closed" && action === "all-submitted") throw conflict("assignment_closed", "งานนี้ปิดรับแล้ว — เปิดรับงานอีกครั้งก่อนถ้าต้องการรับเพิ่ม");
    }
  }

  return c.json({ ok: true, changed, batchId });
});

// undo a bulk operation by restoring each row's pre-bulk state from the audit log
const undoSchema = z.object({ batchId: z.string().min(1) });

submissionRoutes.post("/api/assignments/:id/bulk-undo", async (c) => {
  const aid = c.req.param("id");
  const { batchId } = undoSchema.parse(await readJson(c));
  const now = Date.now();
  const deviceId = c.get("deviceId") ?? null;
  const epoch = await requestEpoch(c);

  // idempotency: if this batch was already undone, do nothing
  const undone = () => c.env.DB.prepare(
    "SELECT 1 AS x FROM audit_logs WHERE batch_id = ? AND action = 'restore' LIMIT 1",
  ).bind(batchId).first();
  if (await undone()) return c.json({ ok: true, changed: 0, alreadyUndone: true });

  const bulkAudits = await c.env.DB.prepare(
    "SELECT student_id, at, before_json, after_json FROM audit_logs WHERE batch_id = ? AND assignment_id = ? AND action = 'bulk'",
  )
    .bind(batchId, aid)
    .all<{ student_id: string; at: number; before_json: string | null; after_json: string | null }>();
  const rows = bulkAudits.results ?? [];
  if (rows.length === 0) throw notFound("batch");

  const sids = rows.map((r) => r.student_id);
  const curRes = await c.env.DB.prepare(
    `SELECT sub.* FROM submissions sub WHERE sub.assignment_id = ?2 AND sub.student_id IN (SELECT value FROM json_each(?1))`,
  )
    .bind(JSON.stringify(sids), aid)
    .all();
  const curMap = new Map<string, any>();
  for (const r of (curRes.results ?? []) as any[]) curMap.set(r.student_id, r);

  // conflict: any row was changed after the bulk wrote it -> refuse entirely
  const modified = () => c.json({ error: "modified_since", message: "มีการแก้ไขหลังการล้าง" }, 409);
  for (const r of rows) {
    const after = r.after_json ? JSON.parse(r.after_json) : null;
    const cur = curMap.get(r.student_id);
    if (cur && after && cur.updated_at > after.updated_at) return modified();
  }

  const upserts: any[] = [];
  const audits: AuditRow[] = [];
  const wrote: { student_id: string; after_updated_at: number | null }[] = [];
  for (const r of rows) {
    const before = r.before_json ? JSON.parse(r.before_json) : null;
    const after = r.after_json ? JSON.parse(r.after_json) : null;
    const restored = before
      ? {
          assignment_id: aid, student_id: r.student_id, status: before.status,
          score: before.score, late: before.late ? 1 : 0, submitted_at: before.submitted_at ?? null,
          method: "manual", device_id: deviceId, scan_session_id: before.scan_session_id ?? null, updated_at: now, event_at: now,
        }
      : {
          assignment_id: aid, student_id: r.student_id, status: "void", score: null, late: 0,
          submitted_at: null, method: "manual", device_id: deviceId, scan_session_id: null, updated_at: now, event_at: now,
        };
    upserts.push(restored);
    wrote.push({ student_id: r.student_id, after_updated_at: after?.updated_at ?? null });
    const cur = curMap.get(r.student_id);
    audits.push({
      op_id: id("op"), at: now, device_id: deviceId, batch_id: batchId,
      entity: "submission", entity_id: `${aid}:${r.student_id}`, assignment_id: aid, student_id: r.student_id,
      action: "restore", before: cur ? mapSubmission(cur) : null, after: mapSubmission(restored), method: "manual",
    });
  }

  // The two checks above are repeated INSIDE the transaction: a second "undo" of the same batch, or an edit
  // to one of these cells, that lands in the gap makes the whole undo roll back instead of being overwritten.
  try {
    await batchAtEpoch(c.env, epoch, [
      abortIf(c.env, "EXISTS (SELECT 1 FROM audit_logs WHERE batch_id = ?1 AND action = 'restore')", batchId),
      abortIf(
        c.env,
        `EXISTS (SELECT 1 FROM json_each(?1) j CROSS JOIN submissions s
                   ON s.assignment_id = ?2 AND s.student_id = json_extract(j.value, '$.student_id')
                 WHERE json_extract(j.value, '$.after_updated_at') IS NOT NULL
                   AND s.updated_at > json_extract(j.value, '$.after_updated_at'))`,
        JSON.stringify(wrote), aid,
      ),
      submissionUpsertStmt(c.env, upserts),
      auditInsertStmt(c.env, audits, now),
    ]);
  } catch (e) {
    if (e instanceof ApiError) throw e; // epoch_changed
    if (await undone()) return c.json({ ok: true, changed: 0, alreadyUndone: true });
    const again = await c.env.DB.prepare(
      `SELECT sub.updated_at, sub.student_id FROM submissions sub WHERE sub.assignment_id = ?2 AND sub.student_id IN (SELECT value FROM json_each(?1))`,
    ).bind(JSON.stringify(sids), aid).all<{ updated_at: number; student_id: string }>();
    const afterOf = new Map(wrote.map((w) => [w.student_id, w.after_updated_at]));
    if ((again.results ?? []).some((r) => afterOf.get(r.student_id) != null && r.updated_at > afterOf.get(r.student_id)!)) return modified();
    throw e;
  }
  return c.json({ ok: true, changed: upserts.length });
});

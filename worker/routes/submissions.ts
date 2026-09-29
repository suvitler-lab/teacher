import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { getEpoch } from "../lib/db";
import { loadTerm, rosterRows } from "../lib/roster";
import { readJson, bad, notFound, conflict } from "../lib/http";
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

/**
 * Upsert a JSON array of submission rows (one statement).
 * Last-write-wins on event_at — the moment the teacher acted — never on arrival order: a row only
 * replaces what is there if it is at least as recent. (updated_at stays "when the server saw it",
 * which the scan screen polls on.)
 */
function submissionUpsertStmt(env: Env, rows: any[]) {
  return env.DB.prepare(
    `INSERT INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     SELECT json_extract(j.value,'$.assignment_id'), json_extract(j.value,'$.student_id'),
            json_extract(j.value,'$.status'), json_extract(j.value,'$.score'),
            json_extract(j.value,'$.late'), json_extract(j.value,'$.submitted_at'),
            json_extract(j.value,'$.method'), json_extract(j.value,'$.device_id'),
            json_extract(j.value,'$.scan_session_id'), json_extract(j.value,'$.updated_at'),
            json_extract(j.value,'$.event_at')
     FROM json_each(?1) j WHERE true
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET
       status=excluded.status, score=excluded.score, late=excluded.late,
       submitted_at=excluded.submitted_at, method=excluded.method,
       device_id=excluded.device_id, scan_session_id=excluded.scan_session_id,
       updated_at=excluded.updated_at, event_at=excluded.event_at
     WHERE submissions.event_at IS NULL OR excluded.event_at >= submissions.event_at`,
  ).bind(JSON.stringify(rows));
}

/** Does this op ACCEPT a hand-in (refused once the work is closed), or is it the teacher grading? */
function opIntent(op: { intent?: "receive" | "grade"; method: string }): "receive" | "grade" {
  if (op.intent) return op.intent;
  return op.method === "camera" || op.method === "hid" || op.method === "manual" ? "receive" : "grade";
}

submissionRoutes.post("/api/submissions/batch", async (c) => {
  const { ops } = batchSchema.parse(await readJson(c));
  const now = Date.now();
  const deviceId = c.get("deviceId") ?? null;
  const epoch = await getEpoch(c.env);

  // 1. drop ops whose op_id already landed (idempotency)
  const applied = await existingOpIds(
    c.env,
    ops.map((o) => o.opId),
  );

  const assignmentIds = [...new Set(ops.map((o) => o.assignmentId))];
  const studentIds = [...new Set(ops.map((o) => o.studentId))];

  // 2. load assignments + their class links
  const aRes = await c.env.DB.prepare(
    `SELECT a.id, a.full_score, a.due_date, a.status, a.deleted_at FROM assignments a
     JOIN json_each(?1) j ON j.value = a.id`,
  )
    .bind(JSON.stringify(assignmentIds))
    .all<{ id: string; full_score: number; due_date: string | null; status: string; deleted_at: number | null }>();
  const aMap = new Map(aRes.results?.map((a) => [a.id, a]) ?? []);

  const linkRes = await c.env.DB.prepare(
    `SELECT ac.assignment_id, ac.class_id FROM assignment_classes ac
     JOIN json_each(?1) j ON j.value = ac.assignment_id`,
  )
    .bind(JSON.stringify(assignmentIds))
    .all<{ assignment_id: string; class_id: string }>();
  const classesOf = new Map<string, Set<string>>();
  for (const l of linkRes.results ?? []) {
    const set = classesOf.get(l.assignment_id) ?? new Set();
    set.add(l.class_id);
    classesOf.set(l.assignment_id, set);
  }

  // 3. load students (class_id)
  const sRes = await c.env.DB.prepare(
    `SELECT s.id, s.class_id FROM students s JOIN json_each(?1) j ON j.value = s.id`,
  )
    .bind(JSON.stringify(studentIds))
    .all<{ id: string; class_id: string | null }>();
  const sMap = new Map(sRes.results?.map((s) => [s.id, s]) ?? []);

  // 4. load existing submissions for the (assignment, student) pairs
  const pairs = ops.map((o) => `${o.assignmentId}\u0000${o.studentId}`);
  const exRes = await c.env.DB.prepare(
    `SELECT sub.* FROM submissions sub
     JOIN json_each(?1) j ON j.value = (sub.assignment_id || char(0) || sub.student_id)`,
  )
    .bind(JSON.stringify([...new Set(pairs)]))
    .all();
  const exMap = new Map<string, any>();
  for (const r of exRes.results ?? []) exMap.set(`${r.assignment_id}\u0000${r.student_id}`, r);

  const results: SubmissionOpResult[] = [];
  const upserts: any[] = [];
  const audits: AuditRow[] = [];
  // effective prior state per pair, updated as we process ops so a "receive"
  // and a later "score" for the same student in one batch keep the first
  // receive time instead of resetting submitted_at.
  const effective = new Map<string, any>(exMap);

  for (const op of ops) {
    if (applied.has(op.opId)) {
      const ex = exMap.get(`${op.assignmentId}\u0000${op.studentId}`);
      results.push({
        opId: op.opId,
        result: "duplicate",
        submission: ex ? mapSubmission(ex) : (undefined as any),
      });
      continue;
    }
    // made before the data was restored: held for the teacher, never poured into the new data
    if (op.dataEpoch != null && op.dataEpoch !== epoch) {
      results.push({ opId: op.opId, result: "epoch_changed" });
      continue;
    }
    const a = aMap.get(op.assignmentId);
    if (!a || a.deleted_at) {
      results.push({ opId: op.opId, result: "invalid", reason: "assignment_missing" });
      continue;
    }
    if (a.full_score !== op.fullScoreAtScan) {
      results.push({ opId: op.opId, result: "full_score_changed", currentFullScore: a.full_score });
      continue;
    }
    // a closed assignment stops ACCEPTING hand-ins — by any means (scanner, camera, typed number, tap
    // on the grid) — but the teacher can still grade it in the gradebook, and void/excuse
    if (a.status === "closed" && op.status === "submitted" && opIntent(op) === "receive") {
      results.push({ opId: op.opId, result: "assignment_closed" });
      continue;
    }
    const student = sMap.get(op.studentId);
    const allowed = classesOf.get(op.assignmentId);
    if (!student || (allowed && allowed.size > 0 && (!student.class_id || !allowed.has(student.class_id)))) {
      results.push({ opId: op.opId, result: "not_in_class" });
      continue;
    }
    if (op.score != null && (op.score < 0 || op.score > a.full_score)) {
      results.push({ opId: op.opId, result: "invalid", reason: "score_out_of_range" });
      continue;
    }

    const pairKey = `${op.assignmentId}\u0000${op.studentId}`;
    const before = effective.get(pairKey);
    // when the teacher acted, never in the future and never older than a week
    const eventAt = clampClientTs(op.clientTs, now);
    if (before && before.event_at != null && before.event_at > eventAt) {
      // the cell already holds something the teacher did LATER (e.g. a whole-class clear made
      // from another screen while this op sat in an offline queue) — this one must not win
      results.push({ opId: op.opId, result: "superseded", submission: mapSubmission(before) });
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
    const row = {
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
    };
    upserts.push(row);
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
    results.push({ opId: op.opId, result: "ok", submission: mapSubmission(row) });
  }

  if (upserts.length > 0) {
    await c.env.DB.batch([submissionUpsertStmt(c.env, upserts), auditInsertStmt(c.env, audits, now)]);
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

  const upserts: any[] = [];
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
    upserts.push({
      assignment_id: row.assignment_id, student_id: row.student_id, status: row.status,
      score: row.score, late: row.late ?? 0, submitted_at: row.submitted_at,
      method: row.method, device_id: row.device_id, scan_session_id: row.scan_session_id ?? null,
      updated_at: row.updated_at, event_at: now,
    });
    audits.push({
      op_id: id("op"), at: now, device_id: deviceId, batch_id: batchId,
      entity: "submission", entity_id: `${aid}:${s.id}`, assignment_id: aid, student_id: s.id,
      action: "bulk", before: before ? mapSubmission(before) : null, after: mapSubmission(upserts[upserts.length - 1]),
      method: "bulk",
    });
  }

  if (upserts.length > 0) {
    await c.env.DB.batch([submissionUpsertStmt(c.env, upserts), auditInsertStmt(c.env, audits, now)]);
  }

  return c.json({ ok: true, changed: upserts.length, batchId });
});

// undo a bulk operation by restoring each row's pre-bulk state from the audit log
const undoSchema = z.object({ batchId: z.string().min(1) });

submissionRoutes.post("/api/assignments/:id/bulk-undo", async (c) => {
  const aid = c.req.param("id");
  const { batchId } = undoSchema.parse(await readJson(c));
  const now = Date.now();
  const deviceId = c.get("deviceId") ?? null;

  // idempotency: if this batch was already undone, do nothing
  const already = await c.env.DB.prepare(
    "SELECT 1 AS x FROM audit_logs WHERE batch_id = ? AND action = 'restore' LIMIT 1",
  ).bind(batchId).first();
  if (already) return c.json({ ok: true, changed: 0, alreadyUndone: true });

  const bulkAudits = await c.env.DB.prepare(
    "SELECT student_id, at, before_json, after_json FROM audit_logs WHERE batch_id = ? AND assignment_id = ? AND action = 'bulk'",
  )
    .bind(batchId, aid)
    .all<{ student_id: string; at: number; before_json: string | null; after_json: string | null }>();
  const rows = bulkAudits.results ?? [];
  if (rows.length === 0) throw notFound("batch");

  const sids = rows.map((r) => r.student_id);
  const curRes = await c.env.DB.prepare(
    `SELECT sub.* FROM submissions sub JOIN json_each(?1) j ON j.value = sub.student_id WHERE sub.assignment_id = ?`,
  )
    .bind(JSON.stringify(sids), aid)
    .all();
  const curMap = new Map<string, any>();
  for (const r of (curRes.results ?? []) as any[]) curMap.set(r.student_id, r);

  // conflict: any row was changed after the bulk wrote it -> refuse entirely
  for (const r of rows) {
    const after = r.after_json ? JSON.parse(r.after_json) : null;
    const cur = curMap.get(r.student_id);
    if (cur && after && cur.updated_at > after.updated_at) {
      return c.json({ error: "modified_since", message: "มีการแก้ไขหลังการล้าง" }, 409);
    }
  }

  const upserts: any[] = [];
  const audits: AuditRow[] = [];
  for (const r of rows) {
    const before = r.before_json ? JSON.parse(r.before_json) : null;
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
    const cur = curMap.get(r.student_id);
    audits.push({
      op_id: id("op"), at: now, device_id: deviceId, batch_id: batchId,
      entity: "submission", entity_id: `${aid}:${r.student_id}`, assignment_id: aid, student_id: r.student_id,
      action: "restore", before: cur ? mapSubmission(cur) : null, after: mapSubmission(restored), method: "manual",
    });
  }

  await c.env.DB.batch([submissionUpsertStmt(c.env, upserts), auditInsertStmt(c.env, audits, now)]);
  return c.json({ ok: true, changed: upserts.length });
});

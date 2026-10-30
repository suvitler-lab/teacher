import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { readJson, notFound, conflict, ApiError } from "../lib/http";
import { writeAudit, auditInsertStmt, type AuditRow } from "../lib/audit";
import { id, qrToken } from "@shared/ids";
import { mapStudent } from "../lib/rows";
import { bkkToday } from "../lib/time";
import { abortIf, batchAtEpoch, requestEpoch } from "../lib/guard";
import { blockedStudentMoves, studentHistoryGuard, HISTORY_MOVE_MESSAGE } from "../lib/student-history";

export const studentRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
studentRoutes.use("/api/students", requireAuth);
studentRoutes.use("/api/students/*", requireAuth);
studentRoutes.use("/api/classes/:id/qr/rotate", requireAuth);

// List students, optionally filtered by class and status (e.g. moved/inactive
// for the "show former students" view). Defaults to active only.
studentRoutes.get("/api/students", async (c) => {
  const classId = c.req.query("class") || null;
  const statusParam = c.req.query("status"); // comma list, or omit for active
  const statuses = statusParam ? statusParam.split(",").map((s) => s.trim()).filter(Boolean) : ["active"];
  const allowed = statuses.filter((s) => ["active", "moved", "inactive", "finished"].includes(s));
  if (allowed.length === 0) return c.json({ students: [] });

  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (classId) { clauses.push("class_id = ?"); binds.push(classId); }
  clauses.push(`status IN (${allowed.map(() => "?").join(",")})`);
  binds.push(...allowed);
  const res = await c.env.DB.prepare(
    `SELECT id, code, qr_token, prefix, first_name, last_name, nickname, class_id, number, status, left_at, updated_at
     FROM students WHERE ${clauses.join(" AND ")} ORDER BY class_id, number IS NULL, number`,
  ).bind(...binds).all();
  return c.json({ students: (res.results ?? []).map(mapStudent) });
});

const studentSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1),
  prefix: z.string().optional().nullable(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  nickname: z.string().optional().nullable(),
  class_id: z.string().optional().nullable(),
  number: z.number().int().optional().nullable(),
  status: z.enum(["active", "moved", "inactive", "finished"]).optional(),
  // when they left the class (moved / inactive only); defaults to today. A past term still counts them.
  left_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

studentRoutes.post("/api/students", async (c) => {
  const b = studentSchema.parse(await readJson(c));
  const now = Date.now();
  const sid = b.id ?? id("stu");
  // unique code guard (ignore self). Inside the write UNIQUE(code) is the guard; a request that loses that
  // race is answered here again from fresh data (409, not the constraint's 500).
  const codeClash = () => c.env.DB.prepare("SELECT id FROM students WHERE code = ? AND id != ?")
    .bind(b.code, sid)
    .first<{ id: string }>();
  const codeTaken = () => conflict("code_taken", "รหัสนักเรียนนี้มีอยู่แล้ว");
  if (await codeClash()) throw codeTaken();

  const existing = await c.env.DB.prepare("SELECT * FROM students WHERE id = ?")
    .bind(sid)
    .first();
  const moves = [{ studentId: sid, toClassId: b.class_id ?? null }];
  const blocked = await blockedStudentMoves(c.env, moves);
  if (blocked.length) return c.json({ error: "history_move_blocked", message: HISTORY_MOVE_MESSAGE, blockedMoves: blocked }, 409);
  // Two active children in one class must not share a number: it is how a child is picked when the
  // card is forgotten, and a mark would land on whoever the lookup happened to prefer.
  // Checked again inside the write (another device can take the number in between). `+status` keeps the
  // planner on idx_students_class (class_id, number) rather than idx_students_status, with or without ANALYZE.
  const nextStatus = b.status ?? (existing as any)?.status ?? "active";
  const numberHeld = "SELECT first_name, last_name FROM students WHERE class_id = ?1 AND number = ?2 AND +status = 'active' AND id != ?3";
  const checksNumber = nextStatus === "active" && !!b.class_id && b.number != null;
  const numberTaken = async () => {
    const taken = await c.env.DB.prepare(numberHeld).bind(b.class_id, b.number, sid).first<{ first_name: string; last_name: string }>();
    return taken ? conflict("number_taken", `เลขที่ ${b.number} ในห้องนี้มีนักเรียนอยู่แล้ว: ${taken.first_name} ${taken.last_name}`.trim()) : null;
  };
  if (checksNumber) {
    const taken = await numberTaken();
    if (taken) throw taken;
  }
  const token = (existing as any)?.qr_token ?? qrToken();
  // left_at: the day they stopped being in the class. Only moved/inactive have one; it is set when the
  // status changes to it (the teacher may name the day), and left alone on later edits.
  const gone = (st: string | null) => st === "moved" || st === "inactive";
  const leftAt = gone(nextStatus)
    ? (b.left_at ?? (gone((existing as any)?.status ?? null) ? (existing as any)?.left_at : null) ?? bkkToday())
    : null;
  try {
    await batchAtEpoch(c.env, await requestEpoch(c), [
      studentHistoryGuard(c.env, moves),
      ...(checksNumber ? [abortIf(c.env, `EXISTS (${numberHeld})`, b.class_id, b.number, sid)] : []),
      c.env.DB.prepare(
        `INSERT INTO students (id, code, qr_token, prefix, first_name, last_name, nickname, class_id, number, status, left_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code=excluded.code, prefix=excluded.prefix, first_name=excluded.first_name,
           last_name=excluded.last_name, nickname=excluded.nickname, class_id=excluded.class_id,
           number=excluded.number, status=excluded.status, left_at=excluded.left_at, updated_at=excluded.updated_at`,
      ).bind(
        sid, b.code, token, b.prefix ?? null, b.first_name, b.last_name, b.nickname ?? null,
        b.class_id ?? null, b.number ?? null, nextStatus, leftAt, now,
      ),
    ]);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // fresh look, same order as the checks above
    if (await codeClash()) throw codeTaken();
    const blocked = await blockedStudentMoves(c.env, moves);
    if (blocked.length) return c.json({ error: "history_move_blocked", message: HISTORY_MOVE_MESSAGE, blockedMoves: blocked }, 409);
    const taken = checksNumber ? await numberTaken() : null;
    if (taken) throw taken;
    throw e;
  }
  await writeAudit(c.env, [
    {
      entity: "student", entity_id: sid, student_id: sid,
      action: existing ? "update" : "create", device_id: c.get("deviceId"),
      before: existing ? mapStudent(existing) : null, method: "manual",
    },
  ]);
  const row = await c.env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(sid).first();
  return c.json({ ok: true, student: mapStudent(row) });
});

const importSchema = z.object({
  class_id: z.string().min(1),
  students: z
    .array(
      z.object({
        code: z.string().min(1),
        prefix: z.string().optional().nullable(),
        first_name: z.string().min(1),
        last_name: z.string().optional().nullable(),
        nickname: z.string().optional().nullable(),
        number: z.number().int().optional().nullable(),
      }),
    )
    .min(1)
    .max(200),
});

// The same code twice in one paste would create two students with one code (UNIQUE fails → 500).
function duplicateCodes(students: { code: string }[]): string[] {
  const seen = new Set<string>(), dup = new Set<string>();
  for (const s of students) (seen.has(s.code) ? dup : seen).add(s.code);
  return [...dup];
}

/**
 * Class numbers that would collide once this paste is applied: two pasted rows that end up on one number,
 * or a pasted row's number already held by an active student who is NOT in the paste. (Class numbers are
 * how a child is picked when the card is forgotten — two children on one number means a mark can land on
 * the wrong one, so a collision blocks the import instead of being left for someone to notice.)
 *
 * "A pasted row's number" is the number the child will have AFTER the write (the upsert's CASE): the
 * pasted number if there is one; otherwise the number the child already has in THIS class, whatever their
 * status (a former child brought back by a number-less list comes back on their old number); else none.
 * `(+status)` keeps the planner on idx_students_class (class_id, number) instead of idx_students_status.
 */
async function numberProblems(env: Env, classId: string, students: { code: string; number?: number | null }[]) {
  const res = await env.DB.prepare(
    `SELECT code, number, status, first_name, last_name FROM students
     WHERE class_id = ?1 AND number IS NOT NULL AND (+status = 'active' OR code IN (SELECT value FROM json_each(?2)))`,
  ).bind(classId, JSON.stringify(students.map((s) => s.code))).all<any>();
  const rows = res.results ?? [];
  const pasted = new Set(students.map((s) => s.code));
  const kept = new Map<string, number>(rows.filter((r) => pasted.has(r.code)).map((r) => [r.code, r.number]));
  const nums = students.map((s) => s.number ?? kept.get(s.code) ?? null).filter((n): n is number => n != null);
  const dupNumbers = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
  // every pasted child's own number is already in `nums`, so only children outside the paste can clash
  const numberClashes = rows
    .filter((r) => r.status === "active" && !pasted.has(r.code) && nums.includes(r.number))
    .map((r) => ({ number: r.number as number, code: r.code as string, name: `${r.first_name} ${r.last_name}`.trim() }));
  return { dupNumbers, numberClashes };
}

/**
 * numberProblems as a guard for the import's own batch: another device can hand a pasted number to a child
 * outside the paste, or change the number a number-less pasted child keeps, between the check and the write.
 * Same "number after the write" per pasted row; children are looked up by code (UNIQUE) and by
 * (class_id, number) via idx_students_class (`+s.status` keeps idx_students_status out of it).
 */
const PASTE_NUMBERS_AFTER = `SELECT json_extract(j.value, '$.code') AS code,
    COALESCE(json_extract(j.value, '$.number'),
      (SELECT k.number FROM students k WHERE k.code = json_extract(j.value, '$.code') AND k.class_id = ?1)) AS number
  FROM json_each(?2) j`;
function numberClashGuard(env: Env, classId: string, students: { code: string; number?: number | null }[]) {
  const paste = JSON.stringify(students.map((s) => ({ code: s.code, number: s.number ?? null })));
  return [abortIf(env, `EXISTS (SELECT 1 FROM (${PASTE_NUMBERS_AFTER}) p WHERE p.number IS NOT NULL GROUP BY p.number HAVING COUNT(*) > 1)
      OR EXISTS (SELECT 1 FROM students s WHERE s.class_id = ?1
        AND s.number IN (SELECT p.number FROM (${PASTE_NUMBERS_AFTER}) p WHERE p.number IS NOT NULL)
        AND +s.status = 'active' AND s.code NOT IN (SELECT json_extract(value, '$.code') FROM json_each(?2)))`,
    classId, paste)];
}

function numberConflict(np: Awaited<ReturnType<typeof numberProblems>>) {
  if (np.dupNumbers.length === 0 && np.numberClashes.length === 0) return null;
  return {
    error: "number_conflict",
    message: np.dupNumbers.length > 0
      ? `เลขที่ซ้ำกันในรายการ: ${np.dupNumbers.join(", ")}`
      : `เลขที่ชนกับนักเรียนที่ไม่ได้อยู่ในรายการ: ${np.numberClashes.map((x) => `เลขที่ ${x.number} (${x.name})`).join(", ")}`,
    ...np,
  };
}

/**
 * Dry run of an import: what WOULD happen to each row, without writing anything.
 * Import matches students by code and overwrites — including moving them to the chosen class
 * and reactivating them — so the teacher needs to see that before pressing the button.
 */
studentRoutes.post("/api/students/import/preview", async (c) => {
  const b = importSchema.parse(await readJson(c));
  const codes = b.students.map((s) => s.code);
  const exRes = await c.env.DB.prepare(
    `SELECT s.id, s.code, s.class_id, s.number, s.status, s.prefix, s.first_name, s.last_name
     FROM students s WHERE s.code IN (SELECT value FROM json_each(?1))`,
  ).bind(JSON.stringify(codes)).all<any>();
  const byCode = new Map<string, any>((exRes.results ?? []).map((r) => [r.code, r]));

  const rows = b.students.map((s) => {
    const ex = byCode.get(s.code);
    if (!ex) return { code: s.code, action: "create" as const };
    const from = { class_id: ex.class_id as string | null, status: ex.status as string, number: ex.number as number | null, name: `${ex.first_name} ${ex.last_name}`.trim() };
    if (ex.class_id !== b.class_id) return { code: s.code, action: "move" as const, reactivates: ex.status !== "active", from };
    if (ex.status !== "active") return { code: s.code, action: "reactivate" as const, from };
    // no number in the paste (an Excel list often has none) means "leave the number alone", not "clear it"
    const changed = (s.prefix ?? "") !== (ex.prefix ?? "") || s.first_name !== ex.first_name
      || (s.last_name ?? "") !== ex.last_name || (s.number != null && s.number !== ex.number);
    return { code: s.code, action: changed ? ("update" as const) : ("same" as const), from };
  });

  const { dupNumbers, numberClashes } = await numberProblems(c.env, b.class_id, b.students);
  const blockedMoves = await blockedStudentMoves(c.env, [...byCode.values()].map((s) => ({ studentId: s.id, toClassId: b.class_id })));

  // Children already in this class who are NOT in the paste. If that is most of the class it is usually a new
  // school year's list going into last year's class — the class should be opened fresh instead ("เริ่มภาคเรียนใหม่").
  const act = await c.env.DB.prepare("SELECT code FROM students WHERE class_id = ? AND status = 'active'")
    .bind(b.class_id).all<{ code: string }>();
  const pasted = new Set(codes);
  const classActive = (act.results ?? []).length;
  const notInPaste = (act.results ?? []).filter((r) => !pasted.has(r.code)).length;

  const summary = { create: 0, update: 0, same: 0, move: 0, reactivate: 0 };
  for (const r of rows) summary[r.action]++;
  return c.json({ ok: true, rows, summary, dupCodes: duplicateCodes(b.students), dupNumbers, numberClashes, classActive, notInPaste, blockedMoves });
});

studentRoutes.post("/api/students/import", async (c) => {
  const b = importSchema.parse(await readJson(c));
  const dup = duplicateCodes(b.students);
  if (dup.length > 0) return c.json({ error: "duplicate_codes", message: `รหัสซ้ำในรายการ: ${dup.join(", ")}`, codes: dup }, 422);
  const conflictBefore = numberConflict(await numberProblems(c.env, b.class_id, b.students));
  if (conflictBefore) return c.json(conflictBefore, 422);
  const now = Date.now();
  // existing codes -> id (so re-import updates instead of duplicating)
  const codes = b.students.map((s) => s.code);
  const exRes = await c.env.DB.prepare(
    `SELECT s.id, s.code FROM students s WHERE s.code IN (SELECT value FROM json_each(?1))`,
  )
    .bind(JSON.stringify(codes))
    .all<{ id: string; code: string }>();
  const byCode = new Map(exRes.results?.map((r) => [r.code, r.id]) ?? []);
  const moves = [...byCode.values()].map((studentId) => ({ studentId, toClassId: b.class_id }));
  const blocked = await blockedStudentMoves(c.env, moves);
  if (blocked.length) return c.json({ error: "history_move_blocked", message: HISTORY_MOVE_MESSAGE, blockedMoves: blocked }, 409);

  const rows = b.students.map((s) => ({
    id: byCode.get(s.code) ?? id("stu"),
    code: s.code,
    qr_token: qrToken(),
    prefix: s.prefix ?? null,
    first_name: s.first_name,
    last_name: s.last_name ?? "",
    nickname: s.nickname ?? null,
    class_id: b.class_id,
    number: s.number ?? null,
    status: "active",
    updated_at: now,
    _isNew: !byCode.has(s.code),
  }));

  // keep existing qr_token for updates
  const upsertStmt = c.env.DB.prepare(
    `INSERT INTO students (id, code, qr_token, prefix, first_name, last_name, nickname, class_id, number, status, left_at, updated_at)
     SELECT json_extract(j.value,'$.id'), json_extract(j.value,'$.code'), json_extract(j.value,'$.qr_token'),
            json_extract(j.value,'$.prefix'), json_extract(j.value,'$.first_name'), json_extract(j.value,'$.last_name'),
            json_extract(j.value,'$.nickname'), json_extract(j.value,'$.class_id'), json_extract(j.value,'$.number'),
            'active', NULL, json_extract(j.value,'$.updated_at')
     FROM json_each(?1) j WHERE true
     ON CONFLICT(id) DO UPDATE SET code=excluded.code, prefix=excluded.prefix, first_name=excluded.first_name,
       last_name=excluded.last_name, nickname=excluded.nickname, class_id=excluded.class_id,
       number=CASE WHEN excluded.number IS NOT NULL THEN excluded.number WHEN students.class_id = excluded.class_id THEN students.number ELSE NULL END,
       status='active', left_at=NULL, updated_at=excluded.updated_at`,
  ).bind(JSON.stringify(rows));

  const audits: AuditRow[] = rows.map((r) => ({
    entity: "student", entity_id: r.id, student_id: r.id,
    action: r._isNew ? "create" : "update", device_id: c.get("deviceId"), method: "import",
    after: { code: r.code, class_id: r.class_id, number: r.number },
  }));

  try {
    await batchAtEpoch(c.env, await requestEpoch(c), [
      studentHistoryGuard(c.env, moves),
      ...numberClashGuard(c.env, b.class_id, b.students),
      upsertStmt,
      auditInsertStmt(c.env, audits, now),
    ]);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // fresh look: a code this paste would create may have been added by another device meanwhile (the
    // batch then failed on UNIQUE(code)) — answered like a plain add (409 code_taken), not 500
    const newCodes = rows.filter((r) => r._isNew).map((r) => r.code);
    if (newCodes.length > 0) {
      const taken = await c.env.DB.prepare("SELECT code FROM students WHERE code IN (SELECT value FROM json_each(?1))")
        .bind(JSON.stringify(newCodes)).all<{ code: string }>();
      const codesTaken = (taken.results ?? []).map((r) => r.code);
      if (codesTaken.length > 0) throw conflict("code_taken", `รหัสนักเรียนนี้มีอยู่แล้ว: ${codesTaken.join(", ")}`);
    }
    // then the checks above, in the same order
    const conflictNow = numberConflict(await numberProblems(c.env, b.class_id, b.students));
    if (conflictNow) return c.json(conflictNow, 422);
    const blocked = await blockedStudentMoves(c.env, moves);
    if (blocked.length) return c.json({ error: "history_move_blocked", message: HISTORY_MOVE_MESSAGE, blockedMoves: blocked }, 409);
    throw e;
  }
  return c.json({ ok: true, imported: rows.length, created: rows.filter((r) => r._isNew).length });
});

async function rotateOne(env: Env, studentId: string, deviceId: string | null, now: number, epoch: number) {
  const s = await env.DB.prepare("SELECT id, qr_token FROM students WHERE id = ?")
    .bind(studentId)
    .first<{ id: string; qr_token: string }>();
  if (!s) return null;
  const newToken = qrToken();
  await batchAtEpoch(env, epoch, [
    env.DB.prepare(
      "INSERT OR IGNORE INTO revoked_qr_tokens (token, student_id, revoked_at) VALUES (?, ?, ?)",
    ).bind(s.qr_token, studentId, now),
    env.DB.prepare("UPDATE students SET qr_token = ?, updated_at = ? WHERE id = ?").bind(
      newToken,
      now,
      studentId,
    ),
    auditInsertStmt(env, [
      {
        entity: "qr", entity_id: studentId, student_id: studentId, action: "rotate",
        device_id: deviceId, before: { qr_token: s.qr_token }, after: { qr_token: newToken },
        method: "manual",
      },
    ], now),
  ]);
  return newToken;
}

studentRoutes.post("/api/students/:id/qr/rotate", async (c) => {
  const sid = c.req.param("id");
  const token = await rotateOne(c.env, sid, c.get("deviceId") ?? null, Date.now(), await requestEpoch(c));
  if (!token) throw notFound("student");
  return c.json({ ok: true, qr_token: token });
});

studentRoutes.post("/api/classes/:id/qr/rotate", async (c) => {
  const classId = c.req.param("id");
  const res = await c.env.DB.prepare(
    "SELECT id FROM students WHERE class_id = ? AND status = 'active'",
  )
    .bind(classId)
    .all<{ id: string }>();
  const now = Date.now();
  const epoch = await requestEpoch(c);
  let n = 0;
  for (const s of res.results ?? []) {
    await rotateOne(c.env, s.id, c.get("deviceId") ?? null, now, epoch);
    n++;
  }
  return c.json({ ok: true, rotated: n });
});

const pinSchema = z.object({ pin: z.string().regex(/^\d{4}$/).nullable() });
studentRoutes.post("/api/students/:id/pin", async (c) => {
  const sid = c.req.param("id");
  const { pin } = pinSchema.parse(await readJson(c));
  const now = Date.now();
  const [r] = await batchAtEpoch(c.env, await requestEpoch(c), [
    c.env.DB.prepare("UPDATE students SET pin = ?, updated_at = ? WHERE id = ?").bind(pin, now, sid),
  ]);
  if (r.meta.changes === 0) throw notFound("student");
  return c.json({ ok: true });
});

import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { readJson } from "../lib/http";
import { schoolYearStart } from "../lib/roster";
import { auditInsertStmt, existingOpIds, type AuditRow } from "../lib/audit";
import { clampClientTs } from "../lib/time";
import { getEpoch } from "../lib/db";
import { abortIf, batchAtEpoch, epochGuard, requestEpoch } from "../lib/guard";
import { id } from "@shared/ids";

export const attendanceRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
attendanceRoutes.use("/api/attendance", requireAuth);
attendanceRoutes.use("/api/attendance/*", requireAuth);

async function findOrCreateSession(
  env: Env,
  date: string,
  classId: string,
  subjectId: string | null,
  period: number | null,
  now: number,
  epoch: number,
): Promise<string> {
  const existing = await env.DB.prepare(
    "SELECT id FROM attendance_sessions WHERE date = ? AND class_id = ? AND IFNULL(subject_id,'') = ? AND IFNULL(period,0) = ?",
  )
    .bind(date, classId, subjectId ?? "", period ?? 0)
    .first<{ id: string }>();
  if (existing) return existing.id;
  // Two requests can both find "no session yet" and both try to create it: the unique index lets
  // exactly one through. The loser must not fail — it just uses the one that now exists.
  await batchAtEpoch(env, epoch, [env.DB.prepare(
    "INSERT OR IGNORE INTO attendance_sessions (id, date, class_id, subject_id, period, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id("att"), date, classId, subjectId, period, now)]);
  const made = await env.DB.prepare(
    "SELECT id FROM attendance_sessions WHERE date = ? AND class_id = ? AND IFNULL(subject_id,'') = ? AND IFNULL(period,0) = ?",
  )
    .bind(date, classId, subjectId ?? "", period ?? 0)
    .first<{ id: string }>();
  return made!.id;
}

attendanceRoutes.get("/api/attendance", async (c) => {
  const date = c.req.query("date");
  const classId = c.req.query("class");
  const subjectId = c.req.query("subject") || null;
  const period = c.req.query("period") ? Number(c.req.query("period")) : null;
  if (!date || !classId) return c.json({ session: null, rows: [] });

  // The session and its marks are asked in ONE round trip (the database is far away): the marks name their session by the
  // same date/class/subject/period test instead of waiting for its id. A batch also reads both from one snapshot.
  const where = "date = ? AND class_id = ? AND IFNULL(subject_id,'') = ? AND IFNULL(period,0) = ?";
  const binds = [date, classId, subjectId ?? "", period ?? 0];
  const [sessionRes, rows] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM attendance_sessions WHERE ${where}`).bind(...binds),
    c.env.DB.prepare(`SELECT * FROM attendance WHERE session_id = (SELECT id FROM attendance_sessions WHERE ${where} LIMIT 1)`).bind(...binds),
  ]);
  const session = (sessionRes.results ?? [])[0] ?? null;
  if (!session) return c.json({ session: null, rows: [] });
  return c.json({ session, rows: rows.results ?? [] });
});

// Daily attendance tallies per class over a date range (homeroom sessions only).
// Feeds the week strip and the "checked today?" mark on class chips.
attendanceRoutes.get("/api/attendance/days", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const classId = c.req.query("class") || null;
  if (!from || !to) return c.json({ days: [] });
  // guard the range so a bad query can't scan the whole table (max 62 days)
  const span = (Date.parse(to) - Date.parse(from)) / (24 * 3600 * 1000);
  if (!Number.isFinite(span) || span < 0 || span > 62) return c.json({ error: "bad_range" }, 400);

  const clauses = ["s.date >= ?", "s.date <= ?", "s.subject_id IS NULL", "s.period IS NULL"];
  const binds: unknown[] = [from, to];
  if (classId) { clauses.push("s.class_id = ?"); binds.push(classId); }

  // the tallies and the class sizes don't depend on each other: one round trip for both
  const [res, counts] = await c.env.DB.batch([
    c.env.DB.prepare(
    `SELECT s.date, s.class_id AS classId,
            SUM(st.id IS NOT NULL AND a.status = 'present') AS present,
            SUM(st.id IS NOT NULL AND a.status = 'late')    AS late,
            SUM(st.id IS NOT NULL AND a.status = 'leave')   AS leave,
            SUM(st.id IS NOT NULL AND a.status = 'sick')    AS sick,
            SUM(st.id IS NOT NULL AND a.status = 'absent')  AS absent,
            COUNT(st.id)                                    AS marked
     FROM attendance_sessions s
     LEFT JOIN attendance a ON a.session_id = s.id
     LEFT JOIN students st ON st.id = a.student_id AND st.status = 'active' AND st.class_id = s.class_id
     WHERE ${clauses.join(" AND ")}
     GROUP BY s.date, s.class_id
     ORDER BY s.date`,
    ).bind(...binds),
    c.env.DB.prepare(
      "SELECT class_id AS classId, COUNT(*) AS total FROM students WHERE status = 'active' GROUP BY class_id",
    ),
  ]);
  const totalByClass = new Map(((counts.results ?? []) as { classId: string; total: number }[]).map((r) => [r.classId, r.total]));

  const days = (res.results ?? []).map((r: any) => ({
    date: r.date, classId: r.classId,
    present: r.present ?? 0, late: r.late ?? 0, leave: r.leave ?? 0, sick: r.sick ?? 0, absent: r.absent ?? 0,
    marked: r.marked ?? 0, total: totalByClass.get(r.classId) ?? 0,
  }));
  return c.json({ days });
});

// A row whose status is "none" CLEARS the student's mark (the teacher tapped the same status again): the attendance row
// is deleted, so the child is simply "not checked yet" again. It goes through the same guards as any other write.
const CLEAR = "none";

const attBatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // S-20: a junk date was saved as is
  classId: z.string().min(1).max(100),
  subjectId: z.string().min(1).max(100).nullable().optional(),
  period: z.number().int().min(0).max(20).nullable().optional(),
  rows: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["present", "late", "leave", "sick", "absent", CLEAR]),
        time: z.number().nullable().optional(),
        method: z.enum(["camera", "hid", "manual", "grid", "bulk", "import", "restore"]).optional(),
        opId: z.string().optional(),
        // updated_at the client last saw for this row; used to detect a clash
        // with another device. Omit on a first write.
        baseUpdatedAt: z.number().nullable().optional(),
        // the data epoch the tap was made in — a restore bumps it, and held-over taps are not applied
        dataEpoch: z.number().int().optional(),
      }),
    )
    .min(1)
    .max(200),
  // when true, apply this device's values even if they clash (server data loses)
  force: z.boolean().optional(),
});

interface CurRow { student_id: string; status: string; time: number | null; updated_at: number; device_id: string | null; device_name: string | null }

async function currentRows(env: Env, sessionId: string, sids: string[]): Promise<Map<string, CurRow>> {
  const res = await env.DB.prepare(
    `SELECT a.student_id, a.status, a.time, a.updated_at, a.device_id, d.name AS device_name
     FROM attendance a LEFT JOIN devices d ON d.id = a.device_id
     WHERE a.session_id = ?2 AND a.student_id IN (SELECT value FROM json_each(?1))`,
  ).bind(JSON.stringify(sids), sessionId).all<CurRow>();
  return new Map((res.results ?? []).map((r) => [r.student_id, r]));
}

// A clash = the server holds a DIFFERENT status for this student AND this client hadn't seen it:
// either it saw an older version (base < updated_at) or it saw nothing at all (base null, e.g.
// loaded offline / a second device that started from an empty list). Same status is never a
// clash — which also lets a retry after a lost response (server already has our value) go through.
// A clear ("none") clashes with any row another device wrote since this client last looked; clearing a row that
// is not there is never a clash (nothing to lose, and a retry of a clear that already landed goes through).
function findConflicts(rows: { studentId: string; status: string; baseUpdatedAt?: number | null }[], cur: Map<string, CurRow>) {
  return rows
    .filter((r) => {
      const s = cur.get(r.studentId);
      if (!s || s.status === r.status) return false;
      return r.baseUpdatedAt == null || s.updated_at > r.baseUpdatedAt;
    })
    .map((r) => {
      const s = cur.get(r.studentId)!;
      return {
        studentId: r.studentId,
        draft: { status: r.status },
        server: { status: s.status, updatedAt: s.updated_at, deviceName: s.device_name, time: s.time },
      };
    });
}

attendanceRoutes.post("/api/attendance/batch", async (c) => {
  const b = attBatchSchema.parse(await readJson(c));
  const now = Date.now();
  const deviceId = c.get("deviceId") ?? null;

  // taps made before the data was restored are held for the teacher — never applied to the new data
  const epoch = await requestEpoch(c);
  const stale = b.rows.filter((r) => r.dataEpoch != null && r.dataEpoch !== epoch).map((r) => r.studentId);
  if (stale.length > 0) {
    return c.json({ error: "epoch_changed", message: "ข้อมูลถูกกู้คืนจากไฟล์สำรองแล้ว — ตรวจสอบรายการนี้ก่อนส่งใหม่", studentIds: stale }, 409);
  }

  // Three independent questions, asked together (the database is far away: round trips are what a teacher waits for):
  // when this school year started, who in this batch really belongs to the named class, and which taps already landed
  const sids = [...new Set(b.rows.map((r) => r.studentId))];
  const [yearStart, memberRes, applied, subject] = await Promise.all([
    schoolYearStart(c.env),
    // every student in the batch must be an active member of the class the batch
    // names — a stale client must not write one room's kids into another room
    c.env.DB.prepare(
      `SELECT s.id FROM students s
       WHERE s.id IN (SELECT value FROM json_each(?1)) AND s.class_id = ?2 AND s.status = 'active'`,
    ).bind(JSON.stringify(sids), b.classId).all<{ id: string }>(),
    // A retry of something that already landed (the reply was lost) is NOT applied a second time:
    // no double write, no second audit row — and it must not clobber what happened since.
    existingOpIds(c.env, b.rows.map((r) => r.opId).filter((x): x is string => !!x)),
    // a subject that does not exist would fail the foreign key as a 500, which the offline queue retries forever (S-20)
    b.subjectId ? c.env.DB.prepare("SELECT 1 AS k FROM subjects WHERE id = ?").bind(b.subjectId).first() : Promise.resolve({ k: 1 }),
  ]);
  if (!subject) return c.json({ error: "unknown_subject", message: "ไม่พบวิชานี้ — โหลดข้อมูลใหม่แล้วลองอีกครั้ง" }, 422);

  // last year's attendance can be read (reports, Excel) but not written once a new year has started —
  // its classes are archived and its children have finished
  if (yearStart && b.date < yearStart) {
    return c.json({
      error: "before_school_year",
      message: `วันที่ ${b.date} อยู่ก่อนวันเปิดปีการศึกษาปัจจุบัน (${yearStart}) — เช็กชื่อก่อนวันนั้นไม่ได้ (ข้อมูลปีก่อนดูได้ที่หน้ารายงาน)`,
      yearStart,
    }, 422);
  }
  const members = new Set((memberRes.results ?? []).map((r) => r.id));
  const strangers = sids.filter((s) => !members.has(s));
  if (strangers.length > 0) {
    return c.json({ error: "not_in_class", message: "มีนักเรียนที่ไม่ได้อยู่ในห้องนี้", studentIds: strangers }, 422);
  }

  let sessionId: string;
  try {
    sessionId = await findOrCreateSession(
      c.env, b.date, b.classId, b.subjectId ?? null, b.period ?? null, now, epoch,
    );
  } catch (e) {
    if ((await getEpoch(c.env)) !== epoch) {
      return c.json({ error: "epoch_changed", message: "ข้อมูลถูกกู้คืนจากไฟล์สำรองแล้ว — ตรวจสอบรายการนี้ก่อนส่งใหม่", studentIds: sids }, 409);
    }
    throw e;
  }

  const todo = b.rows.filter((r) => !(r.opId && applied.has(r.opId)));

  // What the server holds for these students NOW, read after the write: `rows` = version (kept for older
  // clients), `state` = the status too. The screen must show THIS, never the status the client itself sent —
  // a retry of an edit that already landed can find that another device changed the student since.
  const confirmed = async () => {
    const cur = await currentRows(c.env, sessionId, sids);
    return {
      rows: Object.fromEntries([...cur.entries()].map(([sid, r]) => [sid, r.updated_at])),
      state: Object.fromEntries([...cur.entries()].map(([sid, r]) => [sid, { status: r.status, updatedAt: r.updated_at }])),
      // students of this batch with NO mark on the server now (a clear that landed, or a mark another device cleared)
      absent: sids.filter((sid) => !cur.has(sid)),
    };
  };
  if (todo.length === 0) {
    return c.json({ ok: true, sessionId, updatedAt: now, changed: 0, ...(await confirmed()) });
  }

  // Check-and-write must be ONE atomic step: two devices that read the same old row at the same
  // moment would otherwise both pass a check made beforehand. So the conflict test is repeated
  // INSIDE the batch as a guard statement — if a rival write landed in between, the guard makes
  // the whole batch fail and roll back, and the loser gets a proper 409.
  const guard = c.env.DB.prepare(
    `SELECT CASE WHEN EXISTS (
       SELECT 1 FROM json_each(?1) j
       JOIN attendance a ON a.session_id = ?2 AND a.student_id = json_extract(j.value, '$.student_id')
       WHERE a.status != json_extract(j.value, '$.status')
         AND (json_extract(j.value, '$.base') IS NULL OR a.updated_at > json_extract(j.value, '$.base'))
     ) THEN json('attendance conflict') ELSE 1 END`,
  );

  const clears = todo.filter((r) => r.status === CLEAR);
  const writes = todo.filter((r) => r.status !== CLEAR);

  for (let attempt = 0; attempt < 3; attempt++) {
    const curMap = await currentRows(c.env, sessionId, sids);
    if (!b.force) {
      const conflicts = findConflicts(todo, curMap);
      if (conflicts.length > 0) return c.json({ error: "conflict", sessionId, conflicts }, 409);
    }

    const upserts = writes.map((r) => ({
      session_id: sessionId,
      student_id: r.studentId,
      status: r.status,
      time: r.time != null ? clampClientTs(r.time, now) : now,
      method: r.method ?? "grid",
      device_id: deviceId,
      updated_at: now,
      base: r.baseUpdatedAt ?? null,
    }));
    // what the in-batch conflict guard looks at: every tap, clears included
    const guardRows = todo.map((r) => ({ student_id: r.studentId, status: r.status, base: r.baseUpdatedAt ?? null }));
    // the version only ever goes UP (even if a clock stepped back), so "newer than what I saw" is reliable
    const upsertStmt = c.env.DB.prepare(
      `INSERT INTO attendance (session_id, student_id, status, time, method, device_id, updated_at)
       SELECT json_extract(j.value,'$.session_id'), json_extract(j.value,'$.student_id'),
              json_extract(j.value,'$.status'), json_extract(j.value,'$.time'),
              json_extract(j.value,'$.method'), json_extract(j.value,'$.device_id'),
              json_extract(j.value,'$.updated_at')
       FROM json_each(?1) j WHERE true
       ON CONFLICT(session_id, student_id) DO UPDATE SET
         status=excluded.status, time=excluded.time, method=excluded.method,
         device_id=excluded.device_id, updated_at=MAX(excluded.updated_at, attendance.updated_at + 1)`,
    ).bind(JSON.stringify(upserts));

    const auditOf = (r: (typeof todo)[number], action: string, after: unknown): AuditRow => ({
      op_id: r.opId, entity: "attendance", entity_id: `${sessionId}:${r.studentId}`, student_id: r.studentId,
      action, device_id: deviceId,
      before: curMap.get(r.studentId) ? { status: curMap.get(r.studentId)!.status } : null,
      after, method: r.method ?? "grid",
    });
    const audits: AuditRow[] = writes.map((r) => auditOf(r, "update", { status: r.status }));
    // a clear is written to the trail only if there is a mark to take away at the moment the batch runs
    // (placed BEFORE the delete); the same clear sent twice, or on a child with no mark, leaves no trail
    const clearAuditStmt = clears.length
      ? auditInsertStmt(c.env, clears.map((r) => auditOf(r, "void", null)), now, {
          sql: "EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = ?2 AND a.student_id = json_extract(j.value, '$.student_id'))",
          binds: [sessionId],
        })
      : null;
    const deleteStmt = clears.length
      ? c.env.DB.prepare("DELETE FROM attendance WHERE session_id = ?2 AND student_id IN (SELECT value FROM json_each(?1))")
          .bind(JSON.stringify(clears.map((r) => r.studentId)), sessionId)
      : null;
    // a day with nothing left in it is not a day that was checked: reports and Excel count sessions
    const dropEmptySession = clears.length
      ? c.env.DB.prepare("DELETE FROM attendance_sessions WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM attendance WHERE session_id = ?1)").bind(sessionId)
      : null;

    try {
      // a restore since this request began rolls the batch back too: these taps were made on the old data
      // A move can finish after the early membership read. Even force only overrides a status
      // conflict; it must never write a child into the room they just left.
      const membershipGuard = abortIf(c.env, `EXISTS (
        SELECT 1 FROM json_each(?1) j WHERE NOT EXISTS (
          SELECT 1 FROM students s WHERE s.id = j.value AND s.class_id = ?2 AND s.status = 'active'
        ))`, JSON.stringify(sids), b.classId);
      const stmts = [epochGuard(c.env, epoch), membershipGuard];
      if (clearAuditStmt && deleteStmt) stmts.push(clearAuditStmt, deleteStmt);
      if (writes.length > 0) stmts.push(upsertStmt, auditInsertStmt(c.env, audits, now));
      if (dropEmptySession) stmts.push(dropEmptySession);
      if (!b.force) stmts.unshift(guard.bind(JSON.stringify(guardRows), sessionId));
      await c.env.DB.batch(stmts);
      return c.json({ ok: true, sessionId, updatedAt: now, changed: upserts.length + clears.filter((r) => curMap.has(r.studentId)).length, ...(await confirmed()) });
    } catch (e) {
      // the guard fired (or something else went wrong): look again at what is there NOW
      if ((await getEpoch(c.env)) !== epoch) {
        return c.json({ error: "epoch_changed", message: "ข้อมูลถูกกู้คืนจากไฟล์สำรองแล้ว — ตรวจสอบรายการนี้ก่อนส่งใหม่", studentIds: todo.map((r) => r.studentId) }, 409);
      }
      const invalidMembers = await c.env.DB.prepare(`SELECT j.value AS id FROM json_each(?1) j WHERE NOT EXISTS (
        SELECT 1 FROM students s WHERE s.id = j.value AND s.class_id = ?2 AND s.status = 'active'
      )`).bind(JSON.stringify(sids), b.classId).all<{ id: string }>();
      if (invalidMembers.results?.length) {
        return c.json({ error: "not_in_class", message: "มีนักเรียนที่ไม่ได้อยู่ในห้องนี้", studentIds: invalidMembers.results.map((s) => s.id) }, 422);
      }
      const again = await currentRows(c.env, sessionId, sids);
      const conflicts = b.force ? [] : findConflicts(todo, again);
      if (conflicts.length > 0) return c.json({ error: "conflict", sessionId, conflicts }, 409);
      if (attempt === 2) throw e; // not a clash: a real failure — let the client retry
    }
  }
  throw new Error("attendance batch did not settle");
});

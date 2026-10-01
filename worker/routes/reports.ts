import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { mapAssignment, mapStudent } from "../lib/rows";
import { classInYear } from "@shared/roster";
import { memberClause } from "../lib/roster";

export const reportRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
reportRoutes.use("/api/reports/summary", requireAuth);

// Returns raw, filter-scoped data. The client computes the display metrics and
// the Excel sheets from the same payload, so the two never disagree.
reportRoutes.get("/api/reports/summary", async (c) => {
  const classId = c.req.query("class");
  const subjectId = c.req.query("subject") || null;
  const month = c.req.query("month") || null; // "YYYY-MM"
  const termId = c.req.query("term") || null;
  if (!classId) return c.json({ error: "class_required" }, 400);

  // month window for filtering assignments by assigned_date
  const monthFrom = month ? `${month}-01` : null;
  const monthTo = month ? `${month}-31` : null;

  const db = c.env.DB;
  const hasTerm = !!termId && termId !== "unassigned";

  const clauses = ["a.deleted_at IS NULL", "ac.class_id = ?"];
  const binds: unknown[] = [classId];
  if (subjectId) { clauses.push("a.subject_id = ?"); binds.push(subjectId); }
  if (termId === "unassigned") clauses.push("a.term_id IS NULL");
  else if (termId) { clauses.push("a.term_id = ?"); binds.push(termId); }
  if (monthFrom) { clauses.push("(a.assigned_date IS NULL OR a.assigned_date >= ?)"); binds.push(monthFrom); }
  if (monthTo) { clauses.push("(a.assigned_date IS NULL OR a.assigned_date <= ?)"); binds.push(monthTo); }

  // Two rounds of queries, each asking everything that doesn't depend on the others at once (the database is far away,
  // so the number of round trips — not the number of queries — is what a teacher waits for).
  // Round 1: the term (its dates scope attendance; its year and end date say who was in the class), the class's year, the work.
  const [termRow, classRow, aRes] = await Promise.all([
    hasTerm
      ? db.prepare("SELECT id, year, start_date, end_date FROM terms WHERE id = ?").bind(termId)
          .first<{ id: string; year: number; start_date: string | null; end_date: string | null }>()
      : Promise.resolve(null),
    db.prepare("SELECT year FROM classes WHERE id = ?").bind(classId).first<{ year: number | null }>(),
    db.prepare(
      `SELECT a.* FROM assignments a JOIN assignment_classes ac ON ac.assignment_id = a.id
       WHERE ${clauses.join(" AND ")} ORDER BY a.assigned_date, a.created_at`,
    ).bind(...binds).all(),
  ]);
  const termStart = termRow?.start_date ?? null;
  const termEnd = termRow?.end_date ?? null;
  // attendance window = term range ∩ month (whichever bounds exist)
  const attFrom = [termStart, monthFrom].filter(Boolean).sort().pop() ?? null; // latest lower bound
  const attTo = [termEnd, monthTo].filter(Boolean).sort()[0] ?? null;          // earliest upper bound
  // a term was selected but has no dates and no month picked → tell the UI to set them
  const termDatesMissing = hasTerm && !termStart && !termEnd && !month;

  // who was in this class DURING this term (a class belongs to one academic year; a child who left in
  // term 2 is still in term 1's report) — the same rule the gradebook and dashboard use
  const term = termRow ? { id: termRow.id, year: termRow.year, end_date: termRow.end_date } : null;
  const member = memberClause("s", term);
  const classInThisYear = !term || classInYear(classRow?.year, term.year);
  const assignments = aRes.results ?? [];
  const aids = assignments.map((a: any) => a.id);

  // att=daily uses homeroom sessions (subject/period null) so per-subject
  // sessions don't double-count; att=subject counts every period of the
  // chosen subject separately.
  const att = c.req.query("att") === "subject" && subjectId ? "subject" : "daily";
  // the roll-call filter, written for a table alias (`""` for none, `"sess."` inside the join below)
  const attWhere = (p: string) =>
    `${p}class_id = ?` +
    (att === "subject" ? ` AND ${p}subject_id = ? AND ${p}period IS NOT NULL` : ` AND ${p}subject_id IS NULL AND ${p}period IS NULL`) +
    (attFrom ? ` AND ${p}date >= ?` : "") + (attTo ? ` AND ${p}date <= ?` : "");
  const attBinds: unknown[] = [classId, ...(att === "subject" ? [subjectId] : []), ...(attFrom ? [attFrom] : []), ...(attTo ? [attTo] : [])];

  // Round 2: the children, the scores, the roll-call sessions and their marks (marks are asked by the same filter
  // as the sessions, not by the sessions' ids, so they need not wait for them)
  const [studentRes, subRes, attSessions, attRows] = await Promise.all([
    classInThisYear
      ? db.prepare(
          `SELECT s.id, s.code, s.qr_token, s.prefix, s.first_name, s.last_name, s.nickname, s.class_id, s.number, s.status, s.left_at, s.updated_at
           FROM students s WHERE s.class_id = ? AND ${member.sql} ORDER BY s.number IS NULL, s.number`,
        ).bind(classId, ...member.binds).all<any>()
      : Promise.resolve({ results: [] as any[] }),
    aids.length
      ? db.prepare(
          `WITH ids AS (SELECT value AS v FROM json_each(?1))
           SELECT sub.* FROM submissions sub
           JOIN students s ON s.id = sub.student_id
           WHERE sub.assignment_id IN (SELECT v FROM ids) AND s.class_id = ? AND ${member.sql}`,
        ).bind(JSON.stringify(aids), classId, ...member.binds).all()
      : Promise.resolve({ results: [] as any[] }),
    db.prepare(`SELECT * FROM attendance_sessions WHERE ${attWhere("")} ORDER BY date, period`).bind(...attBinds).all(),
    db.prepare(
      `SELECT at.* FROM attendance at JOIN attendance_sessions sess ON sess.id = at.session_id WHERE ${attWhere("sess.")}`,
    ).bind(...attBinds).all(),
  ]);
  const students = studentRes.results ?? [];

  return c.json({
    classId,
    range: { from: attFrom, to: attTo, month, termId, termDatesMissing, att },
    students: students.map(mapStudent),
    assignments: assignments.map((a: any) => mapAssignment(a, [classId])),
    submissions: (subRes.results ?? []).map((r: any) => ({
      assignment_id: r.assignment_id, student_id: r.student_id, status: r.status,
      score: r.score ?? null, late: r.late === 1, submitted_at: r.submitted_at ?? null,
    })),
    attendanceSessions: attSessions.results ?? [],
    attendance: attRows.results ?? [],
    serverTime: Date.now(),
  });
});

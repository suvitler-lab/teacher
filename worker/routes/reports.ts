import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { mapAssignment, mapStudent } from "../lib/rows";
import { loadTerm, memberClause, rosterRows } from "../lib/roster";

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

  // term date range, for scoping attendance to the actual school term
  let termStart: string | null = null, termEnd: string | null = null;
  if (termId && termId !== "unassigned") {
    const t = await c.env.DB.prepare("SELECT start_date, end_date FROM terms WHERE id = ?")
      .bind(termId).first<{ start_date: string | null; end_date: string | null }>();
    termStart = t?.start_date ?? null;
    termEnd = t?.end_date ?? null;
  }
  // attendance window = term range ∩ month (whichever bounds exist)
  const attFrom = [termStart, monthFrom].filter(Boolean).sort().pop() ?? null; // latest lower bound
  const attTo = [termEnd, monthTo].filter(Boolean).sort()[0] ?? null;          // earliest upper bound
  // a term was selected but has no dates and no month picked → tell the UI to set them
  const termDatesMissing = !!termId && termId !== "unassigned" && !termStart && !termEnd && !month;

  const clauses = ["a.deleted_at IS NULL", "ac.class_id = ?"];
  const binds: unknown[] = [classId];
  if (subjectId) { clauses.push("a.subject_id = ?"); binds.push(subjectId); }
  if (termId === "unassigned") clauses.push("a.term_id IS NULL");
  else if (termId) { clauses.push("a.term_id = ?"); binds.push(termId); }
  if (monthFrom) { clauses.push("(a.assigned_date IS NULL OR a.assigned_date >= ?)"); binds.push(monthFrom); }
  if (monthTo) { clauses.push("(a.assigned_date IS NULL OR a.assigned_date <= ?)"); binds.push(monthTo); }

  // who was in this class DURING this term (a class belongs to one academic year; a child who left in
  // term 2 is still in term 1's report) — the same rule the gradebook and dashboard use
  const term = await loadTerm(c.env, termId);
  const member = memberClause("s", term);
  const [students, aRes] = await Promise.all([
    rosterRows(c.env, classId, term,
      "s.id, s.code, s.qr_token, s.prefix, s.first_name, s.last_name, s.nickname, s.class_id, s.number, s.status, s.left_at, s.updated_at"),
    c.env.DB.prepare(
      `SELECT a.* FROM assignments a JOIN assignment_classes ac ON ac.assignment_id = a.id
       WHERE ${clauses.join(" AND ")} ORDER BY a.assigned_date, a.created_at`,
    ).bind(...binds).all(),
  ]);

  const assignments = aRes.results ?? [];
  const aids = assignments.map((a: any) => a.id);

  const subRes = aids.length
    ? await c.env.DB.prepare(
        `WITH ids AS (SELECT value AS v FROM json_each(?1))
         SELECT sub.* FROM submissions sub
         JOIN students s ON s.id = sub.student_id
         WHERE sub.assignment_id IN (SELECT v FROM ids) AND s.class_id = ? AND ${member.sql}`,
      ).bind(JSON.stringify(aids), classId, ...member.binds).all()
    : { results: [] as any[] };

  // att=daily uses homeroom sessions (subject/period null) so per-subject
  // sessions don't double-count; att=subject counts every period of the
  // chosen subject separately.
  const att = c.req.query("att") === "subject" && subjectId ? "subject" : "daily";
  const attFilter = att === "subject" ? "subject_id = ? AND period IS NOT NULL" : "subject_id IS NULL AND period IS NULL";
  const attBinds: unknown[] = att === "subject" ? [classId, subjectId] : [classId];
  let dateFilter = "";
  if (attFrom) { dateFilter += " AND date >= ?"; attBinds.push(attFrom); }
  if (attTo) { dateFilter += " AND date <= ?"; attBinds.push(attTo); }
  const attSessions = await c.env.DB.prepare(
    `SELECT * FROM attendance_sessions WHERE class_id = ? AND ${attFilter}${dateFilter} ORDER BY date, period`,
  ).bind(...attBinds).all();
  const sessionIds = (attSessions.results ?? []).map((s: any) => s.id);
  const attRows = sessionIds.length
    ? await c.env.DB.prepare(
        `SELECT at.* FROM attendance at WHERE at.session_id IN (SELECT value FROM json_each(?1))`,
      ).bind(JSON.stringify(sessionIds)).all()
    : { results: [] as any[] };

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

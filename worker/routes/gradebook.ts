import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { mapAssignment, mapStudent } from "../lib/rows";
import { classInYear } from "@shared/roster";
import { loadTerm, memberClause } from "../lib/roster";

export const gradebookRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
gradebookRoutes.use("/api/gradebook", requireAuth);

gradebookRoutes.get("/api/gradebook", async (c) => {
  const classId = c.req.query("class");
  const subjectId = c.req.query("subject");
  const from = c.req.query("from") || null; // YYYY-MM-DD on assigned_date
  const to = c.req.query("to") || null;
  const typeId = c.req.query("type") || null;
  if (!classId) return c.json({ students: [], assignments: [], submissions: [] });

  const termId = c.req.query("term") || null;
  const db = c.env.DB;
  const clauses = ["a.deleted_at IS NULL", "ac.class_id = ?"];
  const binds: unknown[] = [classId];
  if (subjectId) { clauses.push("a.subject_id = ?"); binds.push(subjectId); }
  if (typeId) { clauses.push("a.type_id = ?"); binds.push(typeId); }
  if (termId === "unassigned") clauses.push("a.term_id IS NULL");
  else if (termId) { clauses.push("a.term_id = ?"); binds.push(termId); }
  if (from) { clauses.push("(a.assigned_date IS NULL OR a.assigned_date >= ?)"); binds.push(from); }
  if (to) { clauses.push("(a.assigned_date IS NULL OR a.assigned_date <= ?)"); binds.push(to); }

  // Two rounds, each asking everything that doesn't depend on the others at once (the database is far away, so
  // the number of round trips — not the number of queries — is what a teacher waits for).
  // Round 1: the term, the class's year, and the work.
  const [term, classRow, aRes] = await Promise.all([
    // the class as it was in this term (see shared/roster.ts) — the client draws its rows from this,
    // so an old year still shows its own children even after the same-named class was refilled
    loadTerm(c.env, termId),
    db.prepare("SELECT year FROM classes WHERE id = ?").bind(classId).first<{ year: number | null }>(),
    db.prepare(
      `SELECT a.* FROM assignments a
       JOIN assignment_classes ac ON ac.assignment_id = a.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY a.assigned_date, a.created_at`,
    ).bind(...binds).all(),
  ]);
  const assignments = aRes.results ?? [];
  const aids = assignments.map((a: any) => a.id);
  const member = memberClause("s", term);
  const classInThisYear = !term || classInYear(classRow?.year, term.year);

  // Round 2: the children, who each piece of work is for, and the scores.
  const [studentRes, linkRes, subRes] = await Promise.all([
    classInThisYear
      ? db.prepare(
          `SELECT s.id, s.code, s.qr_token, s.prefix, s.first_name, s.last_name, s.nickname, s.class_id, s.number, s.status, s.left_at, s.updated_at
           FROM students s WHERE s.class_id = ? AND ${member.sql} ORDER BY s.number IS NULL, s.number`,
        ).bind(classId, ...member.binds).all<any>()
      : Promise.resolve({ results: [] as any[] }),
    aids.length
      ? db.prepare(
          `SELECT assignment_id, class_id FROM assignment_classes
           WHERE assignment_id IN (SELECT value FROM json_each(?1))`,
        ).bind(JSON.stringify(aids)).all<{ assignment_id: string; class_id: string }>()
      : Promise.resolve({ results: [] as any[] }),
    aids.length
      ? db.prepare(
          `WITH ids AS (SELECT value AS v FROM json_each(?1))
           SELECT sub.* FROM submissions sub
           JOIN students s ON s.id = sub.student_id
           WHERE sub.assignment_id IN (SELECT v FROM ids) AND s.class_id = ? AND ${member.sql}`,
        ).bind(JSON.stringify(aids), classId, ...member.binds).all()
      : Promise.resolve({ results: [] as any[] }),
  ]);
  const students = studentRes.results ?? [];
  const linkMap = new Map<string, string[]>();
  for (const l of linkRes.results ?? []) {
    const arr = linkMap.get(l.assignment_id) ?? [];
    arr.push(l.class_id);
    linkMap.set(l.assignment_id, arr);
  }

  return c.json({
    students: students.map(mapStudent),
    assignments: assignments.map((a: any) => mapAssignment(a, linkMap.get(a.id) ?? [])),
    submissions: (subRes.results ?? []).map((r: any) => ({
      assignment_id: r.assignment_id, student_id: r.student_id, status: r.status,
      score: r.score ?? null, late: r.late === 1, submitted_at: r.submitted_at ?? null,
      method: r.method ?? null, device_id: r.device_id ?? null,
      scan_session_id: r.scan_session_id ?? null, updated_at: r.updated_at,
    })),
    serverTime: Date.now(),
  });
});

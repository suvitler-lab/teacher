import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { mapAssignment, mapStudent } from "../lib/rows";
import { loadTerm, memberClause, rosterRows } from "../lib/roster";

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
  // the class as it was in this term (see shared/roster.ts) — the client draws its rows from this,
  // so an old year still shows its own children even after the same-named class was refilled
  const term = await loadTerm(c.env, termId);
  const member = memberClause("s", term);
  const students = await rosterRows(c.env, classId, term,
    "s.id, s.code, s.qr_token, s.prefix, s.first_name, s.last_name, s.nickname, s.class_id, s.number, s.status, s.left_at, s.updated_at");
  const clauses = ["a.deleted_at IS NULL", "ac.class_id = ?"];
  const binds: unknown[] = [classId];
  if (subjectId) { clauses.push("a.subject_id = ?"); binds.push(subjectId); }
  if (typeId) { clauses.push("a.type_id = ?"); binds.push(typeId); }
  if (termId === "unassigned") clauses.push("a.term_id IS NULL");
  else if (termId) { clauses.push("a.term_id = ?"); binds.push(termId); }
  if (from) { clauses.push("(a.assigned_date IS NULL OR a.assigned_date >= ?)"); binds.push(from); }
  if (to) { clauses.push("(a.assigned_date IS NULL OR a.assigned_date <= ?)"); binds.push(to); }

  const aRes = await c.env.DB.prepare(
    `SELECT a.* FROM assignments a
     JOIN assignment_classes ac ON ac.assignment_id = a.id
     WHERE ${clauses.join(" AND ")}
     ORDER BY a.assigned_date, a.created_at`,
  )
    .bind(...binds)
    .all();
  const assignments = aRes.results ?? [];
  const aids = assignments.map((a: any) => a.id);

  const linkRes = aids.length
    ? await c.env.DB.prepare(
        `SELECT assignment_id, class_id FROM assignment_classes
         JOIN json_each(?1) j ON j.value = assignment_id`,
      ).bind(JSON.stringify(aids)).all<{ assignment_id: string; class_id: string }>()
    : { results: [] as any[] };
  const linkMap = new Map<string, string[]>();
  for (const l of linkRes.results ?? []) {
    const arr = linkMap.get(l.assignment_id) ?? [];
    arr.push(l.class_id);
    linkMap.set(l.assignment_id, arr);
  }

  const subRes = aids.length
    ? await c.env.DB.prepare(
        `SELECT sub.* FROM submissions sub
         JOIN json_each(?1) j ON j.value = sub.assignment_id
         JOIN students s ON s.id = sub.student_id
         WHERE s.class_id = ? AND ${member.sql}`,
      ).bind(JSON.stringify(aids), classId, ...member.binds).all()
    : { results: [] as any[] };

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

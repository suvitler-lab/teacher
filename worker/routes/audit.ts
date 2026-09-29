import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";

export const auditRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
auditRoutes.use("/api/audit", requireAuth);

// History feed. Filter by assignment / student / entity / date range.
// Cursor is the last seen audit id (ascending id == chronological).
auditRoutes.get("/api/audit", async (c) => {
  const assignment = c.req.query("assignment") || null;
  const student = c.req.query("student") || null;
  const entity = c.req.query("entity") || null;
  const from = c.req.query("from") ? Number(c.req.query("from")) : null;
  const to = c.req.query("to") ? Number(c.req.query("to")) : null;
  const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : null;
  const limit = Math.min(Number(c.req.query("limit") ?? "50") || 50, 200);

  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (assignment) { clauses.push("a.assignment_id = ?"); binds.push(assignment); }
  if (student) { clauses.push("a.student_id = ?"); binds.push(student); }
  if (entity) { clauses.push("a.entity = ?"); binds.push(entity); }
  if (from) { clauses.push("a.at >= ?"); binds.push(from); }
  if (to) { clauses.push("a.at <= ?"); binds.push(to); }
  if (cursor) { clauses.push("a.id < ?"); binds.push(cursor); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const res = await c.env.DB.prepare(
    `SELECT a.id, a.op_id, a.at, a.client_at, a.device_id, d.name AS device_name,
            a.entity, a.entity_id, a.assignment_id, a.student_id, a.action,
            a.before_json, a.after_json, a.method, a.batch_id
     FROM audit_logs a
     LEFT JOIN devices d ON d.id = a.device_id
     ${where}
     ORDER BY a.id DESC
     LIMIT ?`,
  )
    .bind(...binds, limit)
    .all();

  const rows = (res.results ?? []).map((r: any) => ({
    id: r.id,
    op_id: r.op_id,
    at: r.at,
    client_at: r.client_at ?? null,
    device_id: r.device_id ?? null,
    device_name: r.device_name ?? null,
    entity: r.entity,
    entity_id: r.entity_id ?? null,
    assignment_id: r.assignment_id ?? null,
    student_id: r.student_id ?? null,
    action: r.action,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    method: r.method ?? null,
    batch_id: r.batch_id ?? null,
  }));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  return c.json({ rows, nextCursor });
});

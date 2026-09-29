import type { Env } from "../env";
import { ulid } from "@shared/ids";

export interface AuditRow {
  op_id?: string | null;
  at?: number;
  client_at?: number | null;
  device_id?: string | null;
  actor_id?: string;
  scan_session_id?: string | null;
  batch_id?: string | null;
  entity: string;
  entity_id?: string | null;
  assignment_id?: string | null;
  student_id?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  method?: string | null;
}

const COLS = [
  "op_id",
  "at",
  "client_at",
  "device_id",
  "actor_id",
  "scan_session_id",
  "batch_id",
  "entity",
  "entity_id",
  "assignment_id",
  "student_id",
  "action",
  "before_json",
  "after_json",
  "method",
] as const;

function normalize(r: AuditRow, now: number): Record<string, unknown> {
  return {
    op_id: r.op_id ?? ulid(),
    at: r.at ?? now,
    client_at: r.client_at ?? null,
    device_id: r.device_id ?? null,
    actor_id: r.actor_id ?? "teacher",
    scan_session_id: r.scan_session_id ?? null,
    batch_id: r.batch_id ?? null,
    entity: r.entity,
    entity_id: r.entity_id ?? null,
    assignment_id: r.assignment_id ?? null,
    student_id: r.student_id ?? null,
    action: r.action,
    before_json: r.before === undefined ? null : JSON.stringify(r.before),
    after_json: r.after === undefined ? null : JSON.stringify(r.after),
    method: r.method ?? null,
  };
}

/**
 * A single INSERT-OR-IGNORE that writes every audit row from a JSON array via
 * json_each — one statement regardless of batch size. OR IGNORE + the op_id
 * UNIQUE index makes repeated deliveries idempotent.
 */
export function auditInsertStmt(env: Env, rows: AuditRow[], now = Date.now()) {
  const payload = JSON.stringify(rows.map((r) => normalize(r, now)));
  const select = COLS.map((c) => {
    // JSON extract yields proper types; numeric 'at'/'client_at' stay numbers
    return `json_extract(j.value, '$.${c}')`;
  }).join(", ");
  const sql = `INSERT OR IGNORE INTO audit_logs (${COLS.join(", ")})
    SELECT ${select} FROM json_each(?1) AS j`;
  return env.DB.prepare(sql).bind(payload);
}

/** Convenience: write one or more audit rows immediately (own transaction). */
export async function writeAudit(env: Env, rows: AuditRow[], now = Date.now()): Promise<void> {
  if (rows.length === 0) return;
  await auditInsertStmt(env, rows, now).run();
}

/** Which op_ids from this set already exist (already applied). */
export async function existingOpIds(env: Env, opIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (opIds.length === 0) return set;
  const payload = JSON.stringify(opIds);
  const res = await env.DB.prepare(
    `SELECT a.op_id AS op_id FROM audit_logs a
     JOIN json_each(?1) j ON j.value = a.op_id`,
  )
    .bind(payload)
    .all<{ op_id: string }>();
  for (const r of res.results ?? []) set.add(r.op_id);
  return set;
}

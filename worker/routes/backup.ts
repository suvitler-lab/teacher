import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { readJson, bad, conflict, locked } from "../lib/http";
import { getMeta, setMeta, getEpoch } from "../lib/db";
import { auditInsertStmt } from "../lib/audit";
import { id } from "@shared/ids";
import { SCHEMA_VERSION } from "@shared/types";

export const backupRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
backupRoutes.use("/api/backup", requireAuth);
backupRoutes.use("/api/backup/*", requireAuth);
backupRoutes.use("/api/restore/*", requireAuth);

// Tables included in a backup, in FK-safe (parents-first) restore order.
export const BACKUP_TABLES = [
  "settings",
  "terms",
  "classes",
  "subjects",
  "work_types",
  "students",
  "revoked_qr_tokens",
  "assignments",
  "assignment_classes",
  "scan_sessions",
  "submissions",
  "attendance_sessions",
  "attendance",
] as const;

const COLUMNS: Record<string, string[]> = {
  settings: ["key", "value"],
  terms: ["id", "year", "term", "name", "is_current", "start_date", "end_date", "updated_at"],
  classes: ["id", "name", "grade", "sort", "archived", "year", "updated_at"],
  subjects: ["id", "code", "name", "color", "sort", "archived", "updated_at"],
  work_types: ["id", "name", "icon", "color", "is_exam", "default_full", "sort", "archived", "updated_at"],
  students: ["id", "code", "qr_token", "prefix", "first_name", "last_name", "nickname", "class_id", "number", "pin", "status", "left_at", "updated_at"],
  revoked_qr_tokens: ["token", "student_id", "revoked_at"],
  assignments: ["id", "term_id", "subject_id", "type_id", "title", "unit", "full_score", "assigned_date", "due_date", "note", "publish_scores", "status", "created_at", "updated_at", "deleted_at"],
  assignment_classes: ["assignment_id", "class_id"],
  scan_sessions: ["id", "assignment_id", "class_id", "subject_id", "mode", "full_score", "device_id", "started_at", "ended_at", "scan_count"],
  submissions: ["assignment_id", "student_id", "status", "score", "late", "submitted_at", "method", "device_id", "scan_session_id", "updated_at", "event_at"],
  attendance_sessions: ["id", "date", "class_id", "subject_id", "period", "updated_at"],
  attendance: ["session_id", "student_id", "status", "time", "method", "device_id", "updated_at"],
};

const PAGE = 500;

// ---- backup (paginated per table) ---------------------------------------
// Pages are cut by rowid ("the next 500 after this one"), not by OFFSET: OFFSET n reads and throws away n rows first, so a
// whole table cost the square of its size (12,000 attendance marks → ~150,000 rows read, against a Free allowance of
// 5 million a day), and rows added or removed between two pages made it skip or repeat some. `cursor` is the rowid of the
// last row already sent; the app treats it as an opaque number.
backupRoutes.get("/api/backup", async (c) => {
  const table = c.req.query("table");
  const cursor = Number(c.req.query("cursor") ?? "0") || 0;
  if (!table || !BACKUP_TABLES.includes(table as any)) throw bad("bad_table");
  const res = await c.env.DB.prepare(
    `SELECT rowid AS _rid, * FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
  )
    .bind(cursor, PAGE)
    .all<any>();
  const rows = res.results ?? [];
  const nextCursor = rows.length === PAGE ? (rows[rows.length - 1]._rid as number) : null;
  for (const r of rows) delete r._rid; // the row as stored — the marker was only for paging
  return c.json({ table, rows, nextCursor, schema_version: SCHEMA_VERSION });
});

/**
 * A short summary of everything a backup reads — and of the writes that happen around it. A backup is read in
 * many requests (a page of one table at a time, to stay inside a Worker's CPU limit), so another device that saves
 * a score halfway through would leave a file that is half before and half after. The app takes this summary before
 * and after reading: if the two differ, something changed in between and the read starts over.
 *
 * Every write to the data leaves a mark here: rows carry `updated_at`, every audited write adds an audit row, and a
 * restore bumps the epoch. (The app writes `last_backup_at` only AFTER its second reading, so its own bookkeeping
 * never counts as "something changed".)
 */
export async function dataFingerprint(env: Env): Promise<string> {
  const stamped = (table: string, col: string) =>
    `(SELECT COUNT(*) || ':' || COALESCE(MAX(${col}), 0) || ':' || COALESCE(CAST(SUM(${col}) AS TEXT), '0') FROM ${table})`;
  const parts = [
    stamped("terms", "updated_at"),
    stamped("classes", "updated_at"),
    stamped("subjects", "updated_at"),
    stamped("work_types", "updated_at"),
    stamped("students", "updated_at"),
    stamped("assignments", "updated_at"),
    stamped("submissions", "updated_at"),
    stamped("attendance_sessions", "updated_at"),
    stamped("attendance", "updated_at"),
    stamped("revoked_qr_tokens", "revoked_at"),
    // links and scan sessions have no update stamp of their own: count + the newest row (+ what a finished round adds)
    "(SELECT COUNT(*) || ':' || COALESCE(MAX(rowid), 0) FROM assignment_classes)",
    "(SELECT COUNT(*) || ':' || COALESCE(MAX(started_at), 0) || ':' || COALESCE(MAX(ended_at), 0) || ':' || COALESCE(SUM(scan_count), 0) FROM scan_sessions)",
    "(SELECT COALESCE(group_concat(key || '=' || value, '|'), '') FROM (SELECT key, value FROM settings ORDER BY key))",
    "(SELECT COALESCE(MAX(id), 0) FROM audit_logs)",
    "COALESCE((SELECT value FROM meta WHERE key = 'data_epoch'), '')",
  ];
  const row = await env.DB.prepare(`SELECT ${parts.join(" || '#' || ")} AS fp`).first<{ fp: string }>();
  return row?.fp ?? "";
}

backupRoutes.get("/api/backup/fingerprint", async (c) => c.json({ fingerprint: await dataFingerprint(c.env) }));

// ---- restore -------------------------------------------------------------
// A restore is STAGED, then swapped in ONE transaction:
//   validate → chunk × N (rows land in restore_staging; live tables untouched) → commit
// commit checks that everything arrived, then a single DB.batch deletes every backup table
// and refills it from staging. D1 runs a batch atomically, so a cancelled, failed or
// half-uploaded restore leaves the current data exactly as it was. The batch is ~30
// statements — inside the Free plan's 50-queries-per-request limit.
//
// teacher / devices / sessions / meta are NOT in a backup and are never touched, so the
// account and every signed-in device survive a restore.

const STAGE_TTL_MS = 30 * 60 * 1000; // an upload nobody finished is dead after 30 minutes

const validateSchema = z.object({
  manifest: z.object({
    schema_version: z.number(),
    counts: z.record(z.number()).optional(),
    sha256: z.string().optional(),
  }),
});

backupRoutes.post("/api/restore/validate", async (c) => {
  const { manifest } = validateSchema.parse(await readJson(c));
  // accept any backup at or below the current schema (older versions just miss
  // newer columns, which default to null); refuse anything newer than us
  if (manifest.schema_version > SCHEMA_VERSION) {
    return c.json(
      { ok: false, error: "schema_mismatch", file: manifest.schema_version, app: SCHEMA_VERSION },
      409,
    );
  }
  // The counts are what commit checks the upload against — and a table missing from the file
  // would otherwise be silently emptied, so a partial file is refused up front.
  const counts = manifest.counts ?? {};
  const missing = BACKUP_TABLES.filter((t) => typeof counts[t] !== "number");
  if (missing.length > 0) {
    return c.json({ ok: false, error: "incomplete_backup", missing }, 422);
  }

  // One restore at a time, and the newest wins: an earlier one that was only validated (or
  // abandoned mid-upload) is discarded so it can never block this one.
  const now = Date.now();
  const jobId = id("rst");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE restore_jobs SET status = 'aborted', updated_at = ? WHERE status IN ('validated','running')").bind(now),
    c.env.DB.prepare("DELETE FROM restore_staging"),
    c.env.DB.prepare(
      "INSERT INTO restore_jobs (id, status, manifest_json, progress_json, created_at, updated_at) VALUES (?, 'validated', ?, '{}', ?, ?)",
    ).bind(jobId, JSON.stringify(manifest), now, now),
  ]);
  return c.json({ ok: true, restoreId: jobId });
});

const executeSchema = z.object({
  restoreId: z.string().min(1),
  step: z.enum(["chunk", "commit", "abort"]),
  table: z.string().optional(),
  seq: z.number().int().min(0).optional(),
  rows: z.array(z.record(z.unknown())).optional(),
});

async function activeJob(env: Env, restoreId: string, now: number) {
  const job = await env.DB.prepare("SELECT * FROM restore_jobs WHERE id = ?").bind(restoreId).first<any>();
  if (!job) throw bad("no_such_job");
  if (job.status !== "validated") throw conflict("job_not_active", "งานกู้คืนนี้จบหรือถูกยกเลิกไปแล้ว");
  if (now - job.updated_at > STAGE_TTL_MS) throw conflict("restore_expired", "งานกู้คืนหมดอายุ (ค้างเกิน 30 นาที) — เริ่มใหม่อีกครั้ง");
  return job;
}

// what to put in each column when refilling a table from staging
function valueExpr(table: string, col: string): string {
  const v = `json_extract(j.value, '$.${col}')`;
  // a scan session may point at a device that doesn't exist on this database (restoring into a
  // fresh install) — that is history, not a reason to refuse the whole restore
  if (table === "scan_sessions" && col === "device_id") return `(SELECT d.id FROM devices d WHERE d.id = ${v})`;
  // a backup made before v4 has no event_at: the moment the row was last written is the best we know
  if (table === "submissions" && col === "event_at") return `COALESCE(${v}, json_extract(j.value, '$.updated_at'))`;
  return v;
}

/**
 * Verify everything arrived, then swap it in atomically. Exported so a test can pause between the
 * early checks and the swap (`afterChecks`) and prove the guards INSIDE the batch hold when another
 * request changes things in that gap.
 */
export async function commitRestore(
  env: Env,
  restoreId: string,
  opts: { deviceId: string | null; now: number; afterChecks?: () => Promise<void> },
): Promise<{ status: number; body: unknown }> {
  const now = opts.now;
  const job = await activeJob(env, restoreId, now);
  const expected: Record<string, number> = JSON.parse(job.manifest_json || "{}").counts ?? {};
  const got = await env.DB.prepare(
    "SELECT tbl, SUM(json_array_length(rows_json)) AS n FROM restore_staging WHERE job_id = ? GROUP BY tbl",
  ).bind(restoreId).all<{ tbl: string; n: number }>();
  const staged = new Map((got.results ?? []).map((r) => [r.tbl, r.n]));
  for (const t of BACKUP_TABLES) {
    if ((staged.get(t) ?? 0) !== (expected[t] ?? 0)) {
      return { status: 409, body: { ok: false, error: "incomplete_upload", table: t, expected: expected[t] ?? 0, got: staged.get(t) ?? 0 } };
    }
  }

  if (opts.afterChecks) await opts.afterChecks(); // (tests only)

  const deletes = [...BACKUP_TABLES].reverse().map((t) => env.DB.prepare(`DELETE FROM ${t}`)); // children first
  const inserts = BACKUP_TABLES.map((t) => {
    const cols = COLUMNS[t];
    return env.DB.prepare(
      `INSERT INTO ${t} (${cols.join(", ")})
       SELECT ${cols.map((col) => valueExpr(t, col)).join(", ")}
       FROM restore_staging s, json_each(s.rows_json) j
       WHERE s.job_id = ?1 AND s.tbl = '${t}'`,
    ).bind(restoreId);
  });

  // The checks above are only a friendly early answer. Another request can change things between
  // them and the swap (a second restore being validated wipes the staging area; a cancel aborts the
  // job) — and a swap that deletes every table and refills it from an emptied staging area would
  // destroy the data and still report success. So the SAME checks run again as the first
  // statements of the batch itself: if any fails, the whole batch rolls back untouched.
  const guards = [
    env.DB.prepare(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM restore_jobs WHERE id = ?1 AND status = 'validated' AND updated_at >= ?2) THEN 1 ELSE json('restore job is no longer active') END",
    ).bind(restoreId, now - STAGE_TTL_MS),
    env.DB.prepare(
      `SELECT CASE WHEN EXISTS (
         SELECT 1 FROM restore_jobs rj, json_each(json_extract(rj.manifest_json, '$.counts')) e
         LEFT JOIN (SELECT tbl, SUM(json_array_length(rows_json)) AS n FROM restore_staging WHERE job_id = ?1 GROUP BY tbl) s ON s.tbl = e.key
         WHERE rj.id = ?1 AND COALESCE(s.n, 0) != e.value
       ) THEN json('staged rows do not match the backup') ELSE 1 END`,
    ).bind(restoreId),
  ];

  const swap = (withFkCheck: boolean) => env.DB.batch([
    // check foreign keys at the END of the transaction, so table order inside it doesn't matter
    env.DB.prepare("PRAGMA defer_foreign_keys = on"),
    ...guards,
    ...deletes,
    ...inserts,
    // Fail HERE (an ordinary statement error → clean rollback) if any row points at something
    // that isn't there, instead of leaving the violation to be caught when the transaction closes.
    // json('…') on a non-JSON string is the portable way to make SQLite raise an error.
    ...(withFkCheck ? [env.DB.prepare(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN json('foreign key check failed') ELSE 1 END",
    )] : []),
    env.DB.prepare("DELETE FROM restore_staging WHERE job_id = ?").bind(restoreId),
    env.DB.prepare("UPDATE restore_jobs SET status = 'done', updated_at = ? WHERE id = ? AND status = 'validated'").bind(now, restoreId),
    auditInsertStmt(env, [{ entity: "restore", action: "restore", device_id: opts.deviceId, method: "restore" }], now),
    // a new data epoch: anything queued before this moment (offline scores, attendance drafts, other
    // devices' screens) belongs to the data that was just replaced, and is held for review instead
    env.DB.prepare(
      "INSERT INTO meta (key, value) VALUES ('data_epoch', '2') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
    ),
  ]);
  try {
    try {
      await swap(true);
    } catch (e: any) {
      // if this database won't run the FK-check function at all, the swap is still safe without
      // it (the deferred check at commit does the same job) — anything else is a real failure
      if (!/pragma_foreign_key_check|no such (table|function)|not authorized|SQLITE_AUTH/i.test(String(e?.message ?? e))) throw e;
      await swap(false);
    }
  } catch (e: any) {
    // all-or-nothing: the transaction rolled back, the current data is exactly as it was.
    // Say WHY, by looking at what is true now.
    console.error("restore commit failed", e);
    const now2 = Date.now();
    const cur = await env.DB.prepare("SELECT status, updated_at FROM restore_jobs WHERE id = ?").bind(restoreId).first<{ status: string; updated_at: number }>();
    if (!cur || cur.status !== "validated" || now2 - cur.updated_at > STAGE_TTL_MS) {
      return { status: 409, body: { ok: false, error: "job_not_active", message: "งานกู้คืนนี้ถูกยกเลิกหรือถูกแทนที่แล้ว — ข้อมูลเดิมไม่ถูกเปลี่ยน" } };
    }
    const again = await env.DB.prepare(
      "SELECT tbl, SUM(json_array_length(rows_json)) AS n FROM restore_staging WHERE job_id = ? GROUP BY tbl",
    ).bind(restoreId).all<{ tbl: string; n: number }>();
    const have = new Map((again.results ?? []).map((r) => [r.tbl, r.n]));
    for (const t of BACKUP_TABLES) {
      if ((have.get(t) ?? 0) !== (expected[t] ?? 0)) {
        return { status: 409, body: { ok: false, error: "incomplete_upload", table: t, expected: expected[t] ?? 0, got: have.get(t) ?? 0 } };
      }
    }
    return { status: 409, body: { ok: false, error: "restore_failed", detail: String(e?.message ?? e).slice(0, 300) } };
  }
  return { status: 200, body: { ok: true } };
}

backupRoutes.post("/api/restore/execute", async (c) => {
  const body = executeSchema.parse(await readJson(c));
  const now = Date.now();

  if (body.step === "abort") {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE restore_jobs SET status = 'aborted', updated_at = ? WHERE id = ? AND status IN ('validated','running')").bind(now, body.restoreId),
      c.env.DB.prepare("DELETE FROM restore_staging WHERE job_id = ?").bind(body.restoreId),
    ]);
    return c.json({ ok: true });
  }

  if (body.step === "chunk") {
    await activeJob(c.env, body.restoreId, now);
    const table = body.table;
    const rows = body.rows ?? [];
    if (!table || !COLUMNS[table]) throw bad("bad_table");
    if (body.seq === undefined) throw bad("seq_required");
    if (rows.length === 0) return c.json({ ok: true, staged: 0 });
    if (rows.length > PAGE) throw bad("chunk_too_large");
    // re-sending a chunk (a retry) replaces it, so an upload can be resumed safely
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT OR REPLACE INTO restore_staging (job_id, tbl, seq, rows_json) VALUES (?, ?, ?, ?)")
        .bind(body.restoreId, table, body.seq, JSON.stringify(rows)),
      c.env.DB.prepare("UPDATE restore_jobs SET updated_at = ? WHERE id = ?").bind(now, body.restoreId),
    ]);
    return c.json({ ok: true, staged: rows.length });
  }

  // step === "commit"
  const r = await commitRestore(c.env, body.restoreId, { deviceId: c.get("deviceId") ?? null, now });
  return c.json(r.body as any, r.status as 200);
});

// Cancel ONE restore (by id — the dialog that is closing must not touch another device's newer job),
// or, with no id, every half-finished one and a stale lock left behind by an older version.
backupRoutes.post("/api/restore/cancel", async (c) => {
  const now = Date.now();
  const body = (await c.req.json().catch(() => ({}))) as { restoreId?: string };
  if (body?.restoreId) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE restore_jobs SET status = 'aborted', updated_at = ? WHERE id = ? AND status IN ('validated','running')").bind(now, body.restoreId),
      c.env.DB.prepare("DELETE FROM restore_staging WHERE job_id = ?").bind(body.restoreId),
    ]);
    return c.json({ ok: true });
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE restore_jobs SET status = 'aborted', updated_at = ? WHERE status IN ('validated','running')").bind(now),
    c.env.DB.prepare("DELETE FROM restore_staging"),
  ]);
  await setMeta(c.env, "maintenance", "0");
  return c.json({ ok: true });
});

// With ?id= the answer is about THAT restore — after a lost reply the dialog asks "did mine go through?"
backupRoutes.get("/api/restore/status", async (c) => {
  const id = c.req.query("id");
  const job = id
    ? await c.env.DB.prepare("SELECT id, status, created_at, updated_at FROM restore_jobs WHERE id = ?").bind(id)
        .first<{ id: string; status: string; created_at: number; updated_at: number }>()
    : await c.env.DB.prepare("SELECT id, status, created_at, updated_at FROM restore_jobs ORDER BY created_at DESC LIMIT 1")
        .first<{ id: string; status: string; created_at: number; updated_at: number }>();
  const maintenance = (await getMeta(c.env, "maintenance")) === "1";
  const pending = !!job && job.status === "validated" && Date.now() - job.updated_at <= STAGE_TTL_MS;
  return c.json({ job: job ?? null, pending, maintenance, dataEpoch: await getEpoch(c.env) });
});

export function assertNotLocked(pathIsRestore: boolean, maintenance: boolean) {
  if (maintenance && !pathIsRestore) throw locked("ระบบกำลังกู้คืนข้อมูล");
}

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import type { Env, Vars } from "./env";
import { ApiError, assertSameOrigin } from "./lib/http";
import { getMeta } from "./lib/db";
import { resolveSession } from "./lib/auth";
import { SCHEMA_VERSION } from "@shared/types";
import { authRoutes } from "./routes/auth";
import { bootstrapRoutes } from "./routes/bootstrap";
import { catalogRoutes } from "./routes/catalog";
import { studentRoutes } from "./routes/students";
import { assignmentRoutes } from "./routes/assignments";
import { submissionRoutes } from "./routes/submissions";
import { attendanceRoutes } from "./routes/attendance";
import { gradebookRoutes } from "./routes/gradebook";
import { dashboardRoutes } from "./routes/dashboard";
import { reportRoutes } from "./routes/reports";
import { auditRoutes } from "./routes/audit";
import { backupRoutes } from "./routes/backup";
import { resetRoutes } from "./routes/reset";

export function createApp() {
  const api = new Hono<{ Bindings: Env; Variables: Vars }>();

  // how long the server itself took (shows in the browser's DevTools → Network → Timing), so "slow" can be told apart
  // from "slow network" without guessing
  // Also: no API answer is ever stored by a browser or proxy cache (children's names, scores, the backup), and none
  // is sniffed into another content type (S-07). public/_headers covers only the static files.
  api.use("*", async (c, next) => {
    const t0 = Date.now();
    await next();
    try {
      c.res.headers.set("Server-Timing", `app;dur=${Date.now() - t0}`);
      c.res.headers.set("Cache-Control", "no-store");
      c.res.headers.set("X-Content-Type-Options", "nosniff");
    } catch { /* a response whose headers are read-only */ }
  });

  // same-origin guard for all writes
  api.use("*", async (c, next) => {
    assertSameOrigin(c);
    await next();
  });

  // Request bodies are small JSON; refuse an oversized one before reading it (S-09). Sign-in/setup bodies are a
  // few hundred bytes; a restore chunk (500 rows) is the biggest legitimate body.
  const tooLarge = (c: Context) => c.json({ error: "too_large", message: "ข้อมูลที่ส่งมาใหญ่เกินไป" }, 413);
  const authLimit = bodyLimit({ maxSize: 16 * 1024, onError: tooLarge });
  const restoreLimit = bodyLimit({ maxSize: 8 * 1024 * 1024, onError: tooLarge });
  const defaultLimit = bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge });
  api.use("*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();
    const p = c.req.path;
    const limit = p.startsWith("/api/auth/") || p === "/api/setup" ? authLimit : p.startsWith("/api/restore/") ? restoreLimit : defaultLimit;
    return limit(c, next);
  });

  // The preamble of every request: ONE round trip (the database is far away) for everything the request needs to know
  // before it starts — the schema version, the restore lock, the data epoch, and who the session cookie belongs to.
  //  - schema version: a database on another version than this build refuses everything (503)
  //  - maintenance lock: a restore in progress refuses writes (423)
  //  - data epoch: a write made by a screen that hasn't heard about a restore yet (another device restored the data)
  //    is refused (409): it was made against data that no longer exists. The client reloads and retries. The epoch
  //    read here is also what the write's own transaction re-checks (worker/lib/guard.ts), so a restore that commits
  //    while the request is in flight cannot be written into either.
  api.use("*", async (c, next) => {
    const path = c.req.path;
    if (path === "/api/health") return next();
    const [metaRes] = await Promise.all([
      c.env.DB.prepare("SELECT key, value FROM meta WHERE key IN ('schema_version', 'maintenance', 'data_epoch')")
        .all<{ key: string; value: string }>(),
      resolveSession(c), // cached on the request for requireAuth and the routes
    ]);
    const meta = new Map((metaRes.results ?? []).map((r) => [r.key, r.value]));
    const v = meta.get("schema_version") ?? null;
    if (v !== null && Number(v) !== SCHEMA_VERSION) {
      return c.json({ error: "schema_mismatch", db: Number(v), app: SCHEMA_VERSION }, 503);
    }
    const method = c.req.method;
    const isWrite = method !== "GET" && method !== "HEAD";
    if (isWrite && !path.startsWith("/api/restore/") && meta.get("maintenance") === "1") {
      return c.json({ error: "locked", message: "ระบบกำลังกู้คืนข้อมูล" }, 423);
    }
    const cur = Number(meta.get("data_epoch") ?? "1") || 1; // same fallback rule as getEpoch()
    c.set("dataEpoch", cur);
    if (isWrite && !path.startsWith("/api/restore/") && !path.startsWith("/api/auth/") && path !== "/api/setup") {
      const sent = c.req.header("X-Data-Epoch");
      if (sent && Number(sent) !== cur) {
        return c.json({ error: "epoch_changed", message: "ข้อมูลถูกกู้คืนจากไฟล์สำรองแล้ว — โหลดข้อมูลใหม่ก่อนทำต่อ", epoch: cur }, 409);
      }
      c.set("epoch", cur);
    }
    await next();
  });

  // What a deploy check (scripts/preflight, `curl …/api/health`) needs to know: is the database there, is it on
  // the schema this build expects, and were the secrets set. Says whether — never the values.
  api.get("/api/health", async (c) => {
    let db = false;
    let dbSchema: number | null = null;
    try {
      const v = await getMeta(c.env, "schema_version");
      db = true;
      dbSchema = v === null ? null : Number(v);
    } catch { /* db stays false */ }
    const config = { pepper: !!c.env.SESSION_PEPPER, setupCode: !!c.env.SETUP_CODE };
    // a brand-new database has no schema_version yet (null): the app tells the teacher to migrate
    const schemaOk = dbSchema === null || dbSchema === SCHEMA_VERSION;
    const ok = db && schemaOk && config.pepper;
    return c.json({ ok, schema: SCHEMA_VERSION, db: { reachable: db, schema: dbSchema, schemaOk }, config }, ok ? 200 : 503);
  });

  api.route("/", authRoutes);
  api.route("/", bootstrapRoutes);
  api.route("/", catalogRoutes);
  api.route("/", studentRoutes);
  api.route("/", assignmentRoutes);
  api.route("/", submissionRoutes);
  api.route("/", attendanceRoutes);
  api.route("/", gradebookRoutes);
  api.route("/", dashboardRoutes);
  api.route("/", reportRoutes);
  api.route("/", auditRoutes);
  api.route("/", backupRoutes);
  api.route("/", resetRoutes);

  api.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    }
    // validation errors are the client's fault (422) — never a 500 that would
    // make the offline queue retry a poison request forever
    if (err instanceof ZodError) {
      return c.json({ error: "validation", issues: err.issues }, 422);
    }
    // the message only, cut short: a whole error object can carry request data into the logs (S-10)
    console.error("unhandled", String((err as Error)?.message ?? err).slice(0, 200));
    return c.json({ error: "internal" }, 500);
  });

  api.notFound((c) => c.json({ error: "not_found" }, 404));
  return api;
}

export const app = createApp();

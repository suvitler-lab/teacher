import { Hono } from "hono";
import { ZodError } from "zod";
import type { Env, Vars } from "./env";
import { ApiError, assertSameOrigin } from "./lib/http";
import { getMeta, getEpoch } from "./lib/db";
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

export function createApp() {
  const api = new Hono<{ Bindings: Env; Variables: Vars }>();

  // same-origin guard for all writes
  api.use("*", async (c, next) => {
    assertSameOrigin(c);
    await next();
  });

  // schema version + maintenance lock guard
  api.use("*", async (c, next) => {
    const path = c.req.path;
    if (path === "/api/health") return next();
    const v = await getMeta(c.env, "schema_version");
    if (v !== null && Number(v) !== SCHEMA_VERSION) {
      return c.json({ error: "schema_mismatch", db: Number(v), app: SCHEMA_VERSION }, 503);
    }
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD" && !path.startsWith("/api/restore/")) {
      const m = await getMeta(c.env, "maintenance");
      if (m === "1") return c.json({ error: "locked", message: "ระบบกำลังกู้คืนข้อมูล" }, 423);
    }
    await next();
  });

  // A write made by a screen that hasn't heard about a restore yet (another device restored the
  // data) is refused: it was made against data that no longer exists. The client reloads and retries.
  // The epoch read here is also what the write's own transaction re-checks (worker/lib/guard.ts), so a
  // restore that commits while the request is in flight cannot be written into either.
  api.use("*", async (c, next) => {
    const sent = c.req.header("X-Data-Epoch");
    const method = c.req.method;
    const path = c.req.path;
    if (method !== "GET" && method !== "HEAD" && !path.startsWith("/api/restore/") && !path.startsWith("/api/auth/") && path !== "/api/setup") {
      const cur = await getEpoch(c.env);
      if (sent && Number(sent) !== cur) {
        return c.json({ error: "epoch_changed", message: "ข้อมูลถูกกู้คืนจากไฟล์สำรองแล้ว — โหลดข้อมูลใหม่ก่อนทำต่อ", epoch: cur }, 409);
      }
      c.set("epoch", cur);
    }
    await next();
  });

  api.get("/api/health", (c) => c.json({ ok: true, schema: SCHEMA_VERSION }));

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

  api.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    }
    // validation errors are the client's fault (422) — never a 500 that would
    // make the offline queue retry a poison request forever
    if (err instanceof ZodError) {
      return c.json({ error: "validation", issues: err.issues }, 422);
    }
    console.error("unhandled", err);
    return c.json({ error: "internal" }, 500);
  });

  api.notFound((c) => c.json({ error: "not_found" }, 404));
  return api;
}

export const app = createApp();

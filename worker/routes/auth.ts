import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { readJson, bad, unauthorized, tooMany, ApiError } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/crypto";
import {
  createSession,
  setSessionCookie,
  clearSession,
  requireAuth,
  checkLoginRate,
  recordLoginFailure,
  clearLoginFailures,
  clientKey,
} from "../lib/auth";
import { teacherExists } from "../lib/db";
import { pepperOf } from "../lib/config";
import { writeAudit } from "../lib/audit";
import { id } from "@shared/ids";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const pepper = pepperOf;

async function upsertDevice(env: Env, deviceId: string, name: string, ua: string, now: number) {
  await env.DB.prepare(
    `INSERT INTO devices (id, name, user_agent, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, user_agent = excluded.user_agent, last_seen = excluded.last_seen`,
  )
    .bind(deviceId, name, ua, now, now)
    .run();
}

const setupSchema = z.object({
  setupCode: z.string().min(1),
  password: z.string().min(6),
  deviceId: z.string().min(1),
  deviceName: z.string().min(1).max(60),
});

// First-run: create the teacher account. Refuses once a teacher exists.
authRoutes.post("/api/setup", async (c) => {
  const body = setupSchema.parse(await readJson(c));
  if (await teacherExists(c.env)) throw new ApiError(403, "already_setup", "ตั้งค่าระบบไปแล้ว");
  const expected = c.env.SETUP_CODE;
  if (!expected) throw bad("setup_code_unset", "ยังไม่ได้ตั้งค่า SETUP_CODE บนเซิร์ฟเวอร์");
  if (body.setupCode !== expected) throw new ApiError(403, "bad_setup_code", "รหัสติดตั้งไม่ถูกต้อง");

  const now = Date.now();
  const { hash, salt, iterations } = await hashPassword(body.password, pepper(c.env));
  await c.env.DB.prepare(
    "INSERT INTO teacher (id, password_hash, salt, iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id("tch"), hash, salt, iterations, now, now)
    .run();
  await upsertDevice(c.env, body.deviceId, body.deviceName, c.req.header("User-Agent") ?? "", now);
  await writeAudit(c.env, [
    { entity: "auth", action: "create", device_id: body.deviceId, method: "manual" },
  ]);
  const token = await createSession(c.env, body.deviceId, now);
  setSessionCookie(c, token);
  return c.json({ ok: true });
});

const loginSchema = z.object({
  password: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().min(1).max(60),
});

authRoutes.post("/api/auth/login", async (c) => {
  const body = loginSchema.parse(await readJson(c));
  const key = clientKey(c);
  if (!(await checkLoginRate(c.env, key))) throw tooMany("ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่");

  const row = await c.env.DB.prepare(
    "SELECT password_hash AS hash, salt, iterations FROM teacher LIMIT 1",
  ).first<{ hash: string; salt: string; iterations: number }>();
  if (!row) throw bad("not_setup", "ยังไม่ได้ตั้งค่าระบบ");

  const good = await verifyPassword(body.password, pepper(c.env), row);
  if (!good) {
    await recordLoginFailure(c.env, key);
    throw unauthorized("รหัสผ่านไม่ถูกต้อง");
  }
  await clearLoginFailures(c.env, key);
  const now = Date.now();
  await upsertDevice(c.env, body.deviceId, body.deviceName, c.req.header("User-Agent") ?? "", now);
  const token = await createSession(c.env, body.deviceId, now);
  setSessionCookie(c, token);
  return c.json({ ok: true });
});

authRoutes.post("/api/auth/logout", requireAuth, async (c) => {
  await clearSession(c);
  return c.json({ ok: true });
});

authRoutes.get("/api/auth/me", async (c) => {
  const { resolveSession } = await import("../lib/auth");
  const deviceId = await resolveSession(c);
  const isSetup = await teacherExists(c.env);
  if (!deviceId) return c.json({ authenticated: false, isSetup });
  const dev = await c.env.DB.prepare("SELECT id, name FROM devices WHERE id = ?")
    .bind(deviceId)
    .first<{ id: string; name: string }>();
  return c.json({ authenticated: true, isSetup, device: dev });
});

authRoutes.get("/api/devices", requireAuth, async (c) => {
  const current = c.get("deviceId");
  const res = await c.env.DB.prepare(
    "SELECT id, name, user_agent, revoked, first_seen, last_seen FROM devices ORDER BY last_seen DESC",
  ).all<{ id: string; name: string; user_agent: string | null; revoked: number; first_seen: number; last_seen: number }>();
  const devices = (res.results ?? []).map((d) => ({ ...d, current: d.id === current }));
  return c.json({ devices });
});

// Sign a device out remotely (e.g. a lost phone): drop its sessions so its next
// request gets a 401. Signing out the current device is allowed too.
authRoutes.post("/api/devices/:id/signout", requireAuth, async (c) => {
  const target = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM sessions WHERE device_id = ?").bind(target).run();
  await writeAudit(c.env, [
    { entity: "auth", action: "update", device_id: c.get("deviceId"), entity_id: target, after: { signed_out: target }, method: "manual" },
  ]);
  return c.json({ ok: true });
});

const changePwSchema = z.object({ current: z.string().min(1), next: z.string().min(6) });
authRoutes.post("/api/auth/change-password", requireAuth, async (c) => {
  const body = changePwSchema.parse(await readJson(c));
  const row = await c.env.DB.prepare(
    "SELECT id, password_hash AS hash, salt, iterations FROM teacher LIMIT 1",
  ).first<{ id: string; hash: string; salt: string; iterations: number }>();
  if (!row) throw bad("not_setup");
  if (!(await verifyPassword(body.current, pepper(c.env), row)))
    throw unauthorized("รหัสผ่านเดิมไม่ถูกต้อง");
  const now = Date.now();
  const h = await hashPassword(body.next, pepper(c.env));
  await c.env.DB.prepare(
    "UPDATE teacher SET password_hash = ?, salt = ?, iterations = ?, updated_at = ? WHERE id = ?",
  )
    .bind(h.hash, h.salt, h.iterations, now, row.id)
    .run();
  await writeAudit(c.env, [
    { entity: "auth", action: "update", device_id: c.get("deviceId"), method: "manual" },
  ]);
  return c.json({ ok: true });
});

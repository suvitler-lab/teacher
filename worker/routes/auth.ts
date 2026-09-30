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

const email = z.string().trim().toLowerCase().max(120).email("อีเมลไม่ถูกต้อง");
// the app sends a name like "Chrome · Windows"; anything else gets one made from the browser's own User-Agent
const deviceName = z.string().trim().max(60).optional();

/** "Chrome · Windows" from a User-Agent, for a device the teacher did not name. */
export function deviceNameFrom(ua: string): string {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux|CrOS/i.test(ua) ? "Linux" : "";
  const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\/|Opera/i.test(ua) ? "Opera" : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ") || "อุปกรณ์นี้";
}

const setupSchema = z.object({
  setupCode: z.string().min(1),
  email,
  password: z.string().min(6),
  deviceId: z.string().min(1),
  deviceName,
});

// First-run: create the teacher account. Refuses once a teacher exists.
authRoutes.post("/api/setup", async (c) => {
  const body = setupSchema.parse(await readJson(c));
  if (await teacherExists(c.env)) throw new ApiError(403, "already_setup", "ตั้งค่าระบบไปแล้ว");
  const expected = c.env.SETUP_CODE;
  if (!expected) throw bad("setup_code_unset", "ยังไม่ได้ตั้งค่า SETUP_CODE บนเซิร์ฟเวอร์");
  // the code is the only thing between a stranger and a fresh install: limit guesses like a password
  const key = "setup:" + clientKey(c);
  if (!(await checkLoginRate(c.env, key))) throw tooMany("ลองรหัสผิดหลายครั้ง รอสักครู่แล้วลองใหม่");
  if (body.setupCode !== expected) {
    await recordLoginFailure(c.env, key);
    throw new ApiError(403, "bad_setup_code", "รหัสติดตั้งไม่ถูกต้อง");
  }
  await clearLoginFailures(c.env, key);

  const now = Date.now();
  const { hash, salt, iterations } = await hashPassword(body.password, pepper(c.env));
  await c.env.DB.prepare(
    "INSERT INTO teacher (id, email, password_hash, salt, iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id("tch"), body.email, hash, salt, iterations, now, now)
    .run();
  const ua = c.req.header("User-Agent") ?? "";
  await upsertDevice(c.env, body.deviceId, body.deviceName || deviceNameFrom(ua), ua, now);
  await writeAudit(c.env, [
    { entity: "auth", action: "create", device_id: body.deviceId, method: "manual" },
  ]);
  const token = await createSession(c.env, body.deviceId, now);
  setSessionCookie(c, token);
  return c.json({ ok: true });
});

const loginSchema = z.object({
  email,
  password: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName,
});

authRoutes.post("/api/auth/login", async (c) => {
  const body = loginSchema.parse(await readJson(c));
  const key = clientKey(c);
  if (!(await checkLoginRate(c.env, key))) throw tooMany("ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่");

  const row = await c.env.DB.prepare(
    "SELECT id, email, password_hash AS hash, salt, iterations FROM teacher LIMIT 1",
  ).first<{ id: string; email: string | null; hash: string; salt: string; iterations: number }>();
  if (!row) throw bad("not_setup", "ยังไม่ได้ตั้งค่าระบบ");

  // The password is always checked, so a wrong e-mail and a wrong password look and cost the same.
  const good = await verifyPassword(body.password, pepper(c.env), row);
  if (!good || (row.email !== null && row.email !== body.email)) {
    await recordLoginFailure(c.env, key);
    throw unauthorized("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  }
  await clearLoginFailures(c.env, key);
  const now = Date.now();
  if (row.email === null) {
    // account from before e-mail sign-in: the right password attaches the e-mail typed now
    await c.env.DB.prepare("UPDATE teacher SET email = ?, updated_at = ? WHERE id = ? AND email IS NULL")
      .bind(body.email, now, row.id)
      .run();
  }
  const ua = c.req.header("User-Agent") ?? "";
  await upsertDevice(c.env, body.deviceId, body.deviceName || deviceNameFrom(ua), ua, now);
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
  const t = await c.env.DB.prepare("SELECT email FROM teacher LIMIT 1").first<{ email: string | null }>();
  // emailSet: false only for an account made before e-mail sign-in (its next sign-in attaches one)
  const emailSet = !!t?.email;
  if (!deviceId) return c.json({ authenticated: false, isSetup, emailSet });
  const dev = await c.env.DB.prepare("SELECT id, name FROM devices WHERE id = ?")
    .bind(deviceId)
    .first<{ id: string; name: string }>();
  return c.json({ authenticated: true, isSetup, emailSet, email: t?.email ?? null, device: dev });
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

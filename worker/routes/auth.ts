import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { readJson, bad, unauthorized, notFound, tooMany, ApiError } from "../lib/http";
import { hashPassword, verifyPassword, sha256Hex, timingSafeEqual } from "../lib/crypto";
import {
  createSession,
  setSessionCookie,
  clearSession,
  requireAuth,
  reserveAttempt,
  retryAfterSeconds,
  ipRate,
  guessRate,
  currentTokenHash,
  type RateKey,
} from "../lib/auth";
import { teacherExists } from "../lib/db";
import { pepperOf } from "../lib/config";
import { auditInsertStmt } from "../lib/audit";
import { id } from "@shared/ids";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const pepper = pepperOf;

function upsertDeviceStmt(env: Env, deviceId: string, name: string, ua: string, now: number) {
  return env.DB.prepare(
    `INSERT INTO devices (id, name, user_agent, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET user_agent = excluded.user_agent, last_seen = excluded.last_seen, revoked = 0`,
  )
    .bind(deviceId, name, ua, now, now);
}
async function upsertDevice(env: Env, deviceId: string, name: string, ua: string, now: number) {
  await upsertDeviceStmt(env, deviceId, name, ua, now).run();
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
  setupCode: z.string().min(1).max(256),
  email,
  password: z.string().min(6).max(256),
  deviceId: z.string().min(1).max(100),
  deviceName,
});

// First-run: create the teacher account. Refuses once a teacher exists.
authRoutes.post("/api/setup", async (c) => {
  const body = setupSchema.parse(await readJson(c));
  if (await teacherExists(c.env)) throw new ApiError(403, "already_setup", "ตั้งค่าระบบไปแล้ว");
  const expected = c.env.SETUP_CODE;
  if (!expected) throw bad("setup_code_unset", "ยังไม่ได้ตั้งค่า SETUP_CODE บนเซิร์ฟเวอร์");
  // the code is the only thing between a stranger and a fresh install: limit guesses like a password
  const attempt = await reserveAttempt(c.env, [ipRate("setup:", c)]);
  if (!attempt) throw tooMany("ลองรหัสผิดหลายครั้ง รอสักครู่แล้วลองใหม่");
  // constant-time: how long a wrong code takes must not tell how much of it was right (S-06)
  if (!timingSafeEqual(await sha256Hex(body.setupCode), await sha256Hex(expected))) {
    throw new ApiError(403, "bad_setup_code", "รหัสติดตั้งไม่ถูกต้อง");
  }
  await attempt.succeeded();

  const now = Date.now();
  const { hash, salt, iterations } = await hashPassword(body.password, pepper(c.env));
  // The initial check is only a fast refusal. Claim the singleton account atomically so two
  // valid setup requests cannot both create a teacher while password hashing is in flight.
  // The account, its first device and the history line are one transaction; the history line (no e-mail, no hash)
  // is written only if THIS request created the account.
  const tid = id("tch");
  const ua = c.req.header("User-Agent") ?? "";
  const [created] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO teacher (id, email, password_hash, salt, iterations, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM teacher)`,
    ).bind(tid, body.email, hash, salt, iterations, now, now),
    auditInsertStmt(c.env, [{ entity: "auth", action: "create", device_id: body.deviceId, method: "manual" }], now,
      { sql: "EXISTS (SELECT 1 FROM teacher WHERE id = ?2)", binds: [tid] }),
  ]);
  if (created.meta.changes !== 1) throw new ApiError(403, "already_setup", "ตั้งค่าระบบไปแล้ว");
  await upsertDevice(c.env, body.deviceId, body.deviceName || deviceNameFrom(ua), ua, now);
  const token = await createSession(c.env, body.deviceId, now);
  setSessionCookie(c, token);
  return c.json({ ok: true });
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(256),
  deviceId: z.string().min(1).max(100),
  deviceName,
});

// One account, so the e-mail's budget is the account's: guesses spread over many addresses still stop (S-01).
// A device that has signed in before (and was not signed out since) spends its OWN budget instead, so a stranger's
// guessing cannot lock the teacher out — and knowing a device id buys 10 guesses an hour, not unlimited (S-15).
// An account from before e-mail sign-in accepts any e-mail, so it is counted under one fixed key (S-22).
const HOUR_MS = 1000 * 60 * 60;
const accountRate = (e: string | null): RateKey => ({ key: "login:acct:" + (e ?? "*"), max: 30, windowMs: HOUR_MS, shared: true });
const deviceRate = (id: string): RateKey => ({ key: "login:dev:" + id, max: 10, windowMs: HOUR_MS, shared: true });

authRoutes.post("/api/auth/login", async (c) => {
  const body = loginSchema.parse(await readJson(c));
  const pep = pepper(c.env); // a server without its secret refuses before anything is counted

  const [row, known] = await Promise.all([
    c.env.DB.prepare("SELECT id, email, password_hash AS hash, salt, iterations FROM teacher LIMIT 1")
      .first<{ id: string; email: string | null; hash: string; salt: string; iterations: number }>(),
    c.env.DB.prepare("SELECT 1 AS k FROM devices WHERE id = ? AND revoked = 0").bind(body.deviceId).first(),
  ]);
  if (!row) throw bad("not_setup", "ยังไม่ได้ตั้งค่าระบบ");
  const keys = [ipRate("login:ip:", c), known ? deviceRate(body.deviceId) : accountRate(row.email === null ? null : body.email)];
  const attempt = await reserveAttempt(c.env, keys);
  if (!attempt) throw tooMany("ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่", await retryAfterSeconds(c.env, keys));

  // The password is always checked, so a wrong e-mail and a wrong password look and cost the same.
  const good = await verifyPassword(body.password, pep, row);
  if (!good || (row.email !== null && row.email !== body.email)) {
    throw unauthorized("อีเมลหรือรหัสผ่านไม่ถูกต้อง"); // the reserved try stays: it was a wrong guess
  }
  await attempt.succeeded();
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
  const deviceId = await resolveSession(c); // already looked up by the app's preamble
  // asked together: is there a teacher (and with what e-mail), and — if signed in — which device is this
  const [t, dev] = await Promise.all([
    c.env.DB.prepare("SELECT email FROM teacher LIMIT 1").first<{ email: string | null }>(),
    deviceId
      ? c.env.DB.prepare("SELECT id, name FROM devices WHERE id = ?").bind(deviceId).first<{ id: string; name: string }>()
      : Promise.resolve(null),
  ]);
  const isSetup = !!t;
  // emailSet: false only for an account made before e-mail sign-in (its next sign-in attaches one)
  const emailSet = !!t?.email;
  if (!deviceId) return c.json({ authenticated: false, isSetup, emailSet });
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
  // one transaction: the sign-out and its history line (which device did it, which device — never a session token)
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE device_id = ?").bind(target),
    // no longer a "known" device for the sign-in limit (S-15) — until it signs in with the password again
    c.env.DB.prepare("UPDATE devices SET revoked = 1 WHERE id = ?").bind(target),
    auditInsertStmt(c.env, [
      { entity: "auth", action: "device_signout", device_id: c.get("deviceId"), entity_id: target, after: { signed_out: target }, method: "manual" },
    ]),
  ]);
  return c.json({ ok: true });
});

// v9.2: rename a device (any signed-in device may name any device — one teacher, many screens). The stored name wins on
// the next sign-in (upsertDeviceStmt keeps it), so a name given from another screen is not undone by that screen.
const DEVICE_NAME_MAX = 40;
authRoutes.post("/api/devices/:id/rename", requireAuth, async (c) => {
  const body = z.object({ name: z.string() }).parse(await readJson(c));
  const name = body.name.trim();
  if (name.length < 1 || name.length > DEVICE_NAME_MAX) {
    throw new ApiError(422, "bad_device_name", `ชื่อเครื่องต้องยาว 1–${DEVICE_NAME_MAX} ตัวอักษร`);
  }
  const res = await c.env.DB.prepare("UPDATE devices SET name = ? WHERE id = ?").bind(name, c.req.param("id")).run();
  if (!res.meta.changes) throw notFound("ไม่พบเครื่องนี้");
  return c.json({ ok: true, name });
});

const changePwSchema = z.object({ current: z.string().min(1).max(256), next: z.string().min(6).max(256) });
authRoutes.post("/api/auth/change-password", requireAuth, async (c) => {
  const body = changePwSchema.parse(await readJson(c));
  const pep = pepper(c.env);
  const row = await c.env.DB.prepare(
    "SELECT id, password_hash AS hash, salt, iterations FROM teacher LIMIT 1",
  ).first<{ id: string; hash: string; salt: string; iterations: number }>();
  if (!row) throw bad("not_setup");
  // the old password is a secret like any other: a session left on an unattended tablet must not be a free
  // guessing machine (S-03) — counted per address and per signed-in device
  const attempt = await reserveAttempt(c.env, [ipRate("chpw:ip:", c), guessRate("chpw:dev:" + c.get("deviceId"))]);
  if (!attempt) throw tooMany("ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่");
  // 403, not 401: the teacher IS signed in — a 401 makes the app think the session ended and pop the sign-in box
  if (!(await verifyPassword(body.current, pep, row)))
    throw new ApiError(403, "wrong_password", "รหัสผ่านเดิมไม่ถูกต้อง");
  await attempt.succeeded();
  const now = Date.now();
  const h = await hashPassword(body.next, pep);
  const keep = (await currentTokenHash(c)) ?? "";
  // one transaction: the new password, every OTHER device signed out (a lost phone stops working the moment the
  // password changes — S-02; this device stays signed in), and the history line — which records THAT it changed,
  // by which device and when, never the password, its hash or its salt
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE teacher SET password_hash = ?, salt = ?, iterations = ?, updated_at = ? WHERE id = ?",
    ).bind(h.hash, h.salt, h.iterations, now, row.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE token_hash != ?").bind(keep),
    c.env.DB.prepare("UPDATE devices SET revoked = 1 WHERE id != ?").bind(c.get("deviceId")),
    auditInsertStmt(c.env, [
      { entity: "auth", action: "password_change", device_id: c.get("deviceId"), method: "manual" },
    ], now),
  ]);
  return c.json({ ok: true });
});

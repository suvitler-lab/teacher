import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, Vars } from "../env";
import { sha256Hex, randomToken } from "./crypto";
import { unauthorized } from "./http";

export const SESSION_COOKIE = "gk_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

export async function createSession(
  env: Env,
  deviceId: string,
  now = Date.now(),
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expires = now + SESSION_TTL_MS;
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, device_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(tokenHash, deviceId, now, expires)
    .run();
  return token;
}

export function setSessionCookie(c: Ctx, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSession(c: Ctx) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const h = await sha256Hex(token);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(h).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Returns device_id when a valid session cookie is present, else null. */
export async function resolveSession(c: Ctx, now = Date.now()): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const h = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    "SELECT device_id, expires_at FROM sessions WHERE token_hash = ?",
  )
    .bind(h)
    .first<{ device_id: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < now) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(h).run();
    return null;
  }
  return row.device_id;
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (
  c,
  next,
) => {
  const deviceId = await resolveSession(c);
  if (!deviceId) throw unauthorized();
  c.set("deviceId", deviceId);
  await next();
};

// ---- login rate limiting -------------------------------------------------

const WINDOW_MS = 1000 * 60 * 15;
const MAX_ATTEMPTS = 5;

export async function checkLoginRate(env: Env, key: string, now = Date.now()): Promise<boolean> {
  const since = now - WINDOW_MS;
  await env.DB.prepare("DELETE FROM login_attempts WHERE at < ?").bind(since).run();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND at >= ?",
  )
    .bind(key, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) < MAX_ATTEMPTS;
}

export async function recordLoginFailure(env: Env, key: string, now = Date.now()) {
  await env.DB.prepare("INSERT INTO login_attempts (key, at) VALUES (?, ?)").bind(key, now).run();
}

export async function clearLoginFailures(env: Env, key: string) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

export function clientKey(c: Ctx): string {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For") ||
    "local"
  );
}

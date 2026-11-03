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
  await env.DB.batch([
    // sessions that ran out are otherwise only removed when their own cookie comes back (S-14)
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, device_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(tokenHash, deviceId, now, expires),
  ]);
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

/**
 * Returns device_id when a valid session cookie is present, else null. Looked up once per request: the app's
 * preamble asks first (in the same round trip as the meta flags), and every later caller gets that answer.
 */
export async function resolveSession(c: Ctx, now = Date.now()): Promise<string | null> {
  const cached = c.get("sessionDevice");
  if (cached !== undefined) return cached;
  const device = await lookupSession(c, now);
  c.set("sessionDevice", device);
  return device;
}

async function lookupSession(c: Ctx, now: number): Promise<string | null> {
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

/** SHA-256 of this request's session cookie (null without one) — the row in `sessions` it belongs to. */
export async function currentTokenHash(c: Ctx): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  return token ? sha256Hex(token) : null;
}

// ---- password-guess rate limiting -----------------------------------------
//
// Every place that checks a secret (login, setup code, change-password, reset) RESERVES its try before checking:
// one batch inserts the try and counts it, so D1 runs concurrent requests one after another and 30 guesses sent at
// once cannot all read "0 so far" (security review S-01). A try over budget is taken back, so retrying while
// locked out does not extend the lock-out.

const WINDOW_MS = 1000 * 60 * 15;
const MAX_ATTEMPTS = 5;
const LONGEST_WINDOW_MS = 1000 * 60 * 60;

export interface RateKey {
  key: string;
  max: number;
  windowMs: number;
  /** counts everyone's tries (an account): a success removes only its own try, not the others' */
  shared?: boolean;
}

/** The usual budget: 5 tries per 15 minutes. */
export function guessRate(key: string): RateKey {
  return { key, max: MAX_ATTEMPTS, windowMs: WINDOW_MS };
}

/** The usual budget for one client address (an IPv6 /64 counts as one). */
export function ipRate(prefix: string, c: Ctx): RateKey {
  return guessRate(prefix + clientKey(c));
}

export interface Attempt {
  /** the secret was right: clear the per-client counts and take back this request's try on shared keys */
  succeeded(): Promise<void>;
  /** the try never reached the secret check (e.g. nothing to check against): take it back */
  release(): Promise<void>;
}

/** Reserve one try on every key, atomically. null = some key is over its budget (and nothing was kept). */
export async function reserveAttempt(env: Env, keys: RateKey[], now = Date.now()): Promise<Attempt | null> {
  const db = env.DB;
  const count = (k: RateKey) => db.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND at >= ?").bind(k.key, now - k.windowMs);
  // A read first: a client already over budget is refused without writing a row, so hammering the endpoint
  // cannot burn the free daily write quota (S-18). The batch below still re-checks atomically.
  const pre = await db.batch<{ n: number }>(keys.map(count));
  if (keys.some((k, i) => Number(pre[i].results?.[0]?.n ?? 0) >= k.max)) return null;
  const res = await db.batch<{ id?: number; n?: number }>([
    db.prepare("DELETE FROM login_attempts WHERE at < ?").bind(now - LONGEST_WINDOW_MS),
    ...keys.map((k) => db.prepare("INSERT INTO login_attempts (key, at) VALUES (?, ?) RETURNING rowid AS id").bind(k.key, now)),
    ...keys.map(count),
  ]);
  const ids = keys.map((_, i) => Number(res[1 + i].results?.[0]?.id));
  const over = keys.some((k, i) => Number(res[1 + keys.length + i].results?.[0]?.n ?? 0) > k.max);
  const dropOwn = () => db.prepare(`DELETE FROM login_attempts WHERE rowid IN (${ids.map(() => "?").join(", ")})`).bind(...ids);
  if (over) {
    await dropOwn().run();
    return null;
  }
  return {
    async succeeded() {
      const own = keys.filter((k) => !k.shared).map((k) => db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(k.key));
      await db.batch([dropOwn(), ...own]);
    },
    async release() {
      await dropOwn().run();
    },
  };
}

export function clientKey(c: Ctx): string {
  const raw =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "local";
  return ipBucket(raw);
}

/**
 * The address a rate limit counts by. IPv4 as is; IPv6 cut to its /64 — one home or phone line gets a whole /64,
 * so counting each address separately would hand an attacker billions of fresh budgets (S-01).
 */
export function ipBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  const s = ip.toLowerCase().replace(/%.*$/, ""); // drop a zone id
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return mapped[1];
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(":") + "::/64";
}

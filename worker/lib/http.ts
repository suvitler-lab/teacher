import type { Context } from "hono";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export const bad = (code: string, msg?: string) => new ApiError(400, code, msg);
export const unauthorized = (msg?: string) => new ApiError(401, "unauthorized", msg);
export const forbidden = (msg?: string) => new ApiError(403, "forbidden", msg);
export const notFound = (msg?: string) => new ApiError(404, "not_found", msg);
export const conflict = (code: string, msg?: string) => new ApiError(409, code, msg);
export const locked = (msg?: string) => new ApiError(423, "locked", msg);
export const tooMany = (msg?: string) => new ApiError(429, "rate_limited", msg);

export function ok<T>(c: Context, data: T, status = 200) {
  return c.json(data as object, status as 200);
}

/**
 * Reject cross-site writes: same-origin POST/PUT/DELETE only, JSON body.
 * Cheap CSRF guard for a cookie-auth API.
 */
export function assertSameOrigin(c: Context) {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD") return;
  const origin = c.req.header("Origin");
  const host = c.req.header("Host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) throw forbidden("bad_origin");
    } catch {
      throw forbidden("bad_origin");
    }
  }
}

export async function readJson<T>(c: Context): Promise<T> {
  const ct = c.req.header("Content-Type") || "";
  if (!ct.includes("application/json")) throw bad("expected_json");
  try {
    return (await c.req.json()) as T;
  } catch {
    throw bad("invalid_json");
  }
}

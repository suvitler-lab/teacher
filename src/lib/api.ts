import { swrClear } from "./swr";

export class ApiError extends Error {
  status: number;
  code: string;
  data: any;
  constructor(status: number, code: string, message: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** a server answer that carries only a code (no Thai message) must never reach the teacher as raw English */
const CODE_TEXT: Record<string, string> = {
  unauthorized: "เซสชันหมดอายุ — เข้าสู่ระบบอีกครั้ง",
  forbidden: "ไม่มีสิทธิ์ทำรายการนี้",
  not_found: "ไม่พบข้อมูลนี้ (อาจถูกลบไปแล้ว)",
  epoch_changed: "ข้อมูลถูกกู้คืนจากเครื่องอื่น — โหลดใหม่ก่อน",
  rate_limited: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่",
  validation: "ข้อมูลที่กรอกไม่ครบหรือไม่ถูกต้อง — ตรวจช่องที่กรอกอีกครั้ง",
  invalid_body: "ข้อมูลที่ส่งไม่ถูกต้อง — ลองใหม่อีกครั้ง",
};

export interface RequestOptions { timeoutMs?: number; signal?: AbortSignal }

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Writes say which data epoch they were made against; after a restore elsewhere the server refuses them.
  const { dataEpoch, serverReachable } = await import("./session");
  if (method !== "GET" && dataEpoch.value != null) headers["X-Data-Epoch"] = String(dataEpoch.value);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? (method === "GET" ? 8000 : 15000));
  // a write (even one that may or may not land) makes every saved read answer suspect
  if (method !== "GET") swrClear();
  const init: RequestInit = {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    signal: controller.signal,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  let res: Response;
  let payload: any;
  try {
    res = await fetch(path, init);
    const isJson = (res.headers.get("Content-Type") || "").includes("application/json");
    payload = isJson ? await res.json() : {};
  } catch {
    if (options.signal?.aborted && !timedOut) throw new ApiError(0, "aborted", "ยกเลิกคำขอแล้ว");
    serverReachable.value = false;
    if (timedOut) throw new ApiError(0, "timeout", method === "GET"
      ? "เครือข่ายตอบช้าเกินไป — ลองโหลดใหม่"
      : "เครือข่ายตอบช้าเกินไป — ยังไม่ทราบผล ตรวจข้อมูลล่าสุดก่อนทำซ้ำ");
    throw new ApiError(0, "network", "ต่ออินเทอร์เน็ตไม่ได้");
  } finally {
    if (method !== "GET") swrClear(); // reads that started while the write was on its way must not be remembered either
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
  serverReachable.value = true; // it answered (whatever it said)
  if (!res.ok) {
    // a 401 anywhere means the session expired — prompt re-login globally
    if (res.status === 401 && path !== "/api/auth/me" && path !== "/api/auth/login") {
      const { authRequired } = await import("./session");
      authRequired.value = true;
    }
    if (res.status === 409 && payload.error === "epoch_changed" && !path.startsWith("/api/restore/")) {
      const { epochStale } = await import("./session");
      epochStale.value = true;
    }
    const retryAfter = res.headers.get("Retry-After");
    throw new ApiError(res.status, payload.error ?? "error", payload.message ?? (payload.error && CODE_TEXT[payload.error]) ?? "เกิดข้อผิดพลาด", retryAfter ? { ...payload, retryAfter } : payload);
  }
  return payload as T;
}

/**
 * A network that is "connected" but dead (a classroom wifi that stalls) never fails on its own — the request just
 * hangs. Give up after `ms` and let the caller treat it as offline.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      void import("./session").then((m) => { m.serverReachable.value = false; });
      reject(new ApiError(0, "timeout", "เครือข่ายตอบช้าเกินไป"));
    }, ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", path, body, options),
};

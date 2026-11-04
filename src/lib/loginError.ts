import { ApiError } from "./api";

/** Seconds the server asked us to wait (Retry-After header kept by api.ts, or retryAfter in the body); null when unknown. */
function waitSeconds(e: ApiError): number | null {
  const raw = e.data?.retryAfter ?? e.data?.retryAfterSeconds;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Thai message for a failed sign-in: rate limited, no network, or wrong credentials. Never echoes the password. */
export function loginErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) {
      const s = waitSeconds(e);
      return s === null
        ? "ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่"
        : `ลองผิดหลายครั้งเกินไป รอ ${Math.max(1, Math.ceil(s / 60))} นาทีแล้วลองใหม่`;
    }
    if (e.status === 0) return e.code === "timeout" ? "เครือข่ายตอบช้าเกินไป ลองใหม่อีกครั้ง" : "ต่ออินเทอร์เน็ตไม่ได้ ตรวจการเชื่อมต่อแล้วลองใหม่";
    return e.message || "เข้าสู่ระบบไม่สำเร็จ";
  }
  return (e as Error)?.message || "เข้าสู่ระบบไม่สำเร็จ";
}

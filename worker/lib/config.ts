// What the server needs from its deployment (secrets), and a way to say plainly when it is missing.
import type { Env } from "../env";
import { ApiError } from "./http";

/**
 * The secret that seasons every password hash. There is deliberately NO default: a server deployed without
 * it would hash the teacher's password with a value anyone can read in the source, and would look fine
 * doing it. Better it refuses to start the account than to start it weak.
 *
 * (Changing this later makes the stored password unverifiable — see docs/OPERATIONS.md, "รีเซ็ตรหัสผ่านครู".)
 */
export function pepperOf(env: Env): string {
  const p = env.SESSION_PEPPER;
  if (!p) {
    throw new ApiError(
      503,
      "config_missing",
      "ยังไม่ได้ตั้งค่า SESSION_PEPPER บนเซิร์ฟเวอร์ — รัน `npx wrangler secret put SESSION_PEPPER` แล้วลองใหม่ (ดู docs/OPERATIONS.md)",
    );
  }
  return p;
}

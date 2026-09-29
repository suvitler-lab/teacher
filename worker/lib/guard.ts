// Guards that live INSIDE the write's own D1 batch (one batch = one transaction).
//
// A check made before a write is only advice: another device, a restore, or a settings change can land
// between the two. So whatever a request decided from the data it read must be repeated in the same
// transaction as the write — either as a WHERE on the write itself (the row is skipped), or as an abort
// guard placed first in the batch (the whole batch rolls back).
import type { Context } from "hono";
import type { Env, Vars } from "../env";
import { getEpoch } from "./db";
import { ApiError } from "./http";

/** The data epoch as SQL sees it right now — same fallback rule as getEpoch(). */
export const EPOCH_SQL =
  "COALESCE(NULLIF(CAST((SELECT value FROM meta WHERE key = 'data_epoch') AS INTEGER), 0), 1)";

/**
 * A statement that makes the WHOLE batch fail (and roll back) when `violation` is true.
 * json('…') on a non-JSON string is the portable way to make SQLite raise an error; restore and
 * attendance use the same trick.
 */
export function abortIf(env: Env, violation: string, ...binds: unknown[]) {
  return env.DB.prepare(`SELECT CASE WHEN (${violation}) THEN json('guard') ELSE 1 END`).bind(...binds);
}

/** Abort the batch if a restore has replaced the data since `epoch` was read. */
export function epochGuard(env: Env, epoch: number) {
  return abortIf(env, `${EPOCH_SQL} != ?1`, epoch);
}

export const epochChanged = () =>
  new ApiError(409, "epoch_changed", "ข้อมูลถูกกู้คืนจากไฟล์สำรองแล้ว — โหลดข้อมูลใหม่ก่อนทำต่อ");

/** The data epoch this request started in (set by the app for every write; read fresh if a route runs without it). */
export async function requestEpoch(c: Context<{ Bindings: Env; Variables: Vars }>): Promise<number> {
  return c.get("epoch") ?? (await getEpoch(c.env));
}

/**
 * Run `stmts` in one transaction that only happens if the data is still the data this request read
 * (`epoch`). Throws the 409 `epoch_changed` if a restore got in first; any other failure is rethrown
 * for the caller's own diagnosis. Results line up with `stmts` (the guard's own result is dropped).
 */
export async function batchAtEpoch(env: Env, epoch: number, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  try {
    return (await env.DB.batch([epochGuard(env, epoch), ...stmts])).slice(1);
  } catch (e) {
    if ((await getEpoch(env)) !== epoch) throw epochChanged();
    throw e;
  }
}

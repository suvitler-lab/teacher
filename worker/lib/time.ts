// bkkParts/bkkToday live in shared/time.ts so the pages use the very same "today" (M1-05).
import { bkkToday } from "@shared/time";
export { bkkParts, bkkToday } from "@shared/time";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
/** Trust the client's event time, but never in the future or older than 7 days. */
export function clampClientTs(clientTs: number, now: number): number {
  if (!Number.isFinite(clientTs)) return now;
  return Math.min(now, Math.max(now - SEVEN_DAYS, clientTs));
}

/** true if submitted after the due date (date-only comparison, Bangkok). */
export function isLateSubmission(dueDate: string | null, submittedMs: number): boolean {
  if (!dueDate) return false;
  return bkkToday(submittedMs) > dueDate;
}

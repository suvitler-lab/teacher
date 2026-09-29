// Asia/Bangkok is UTC+7 with no DST — a fixed offset, safe to compute directly.
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

export function bkkParts(ms: number): { date: string; hm: string; minutes: number } {
  const d = new Date(ms + BKK_OFFSET_MS);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  return {
    date: `${y}-${mo}-${day}`,
    hm: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    minutes: hh * 60 + mm,
  };
}

export function bkkToday(ms = Date.now()): string {
  return bkkParts(ms).date;
}

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

/** minutes-of-day threshold from "HH:MM"; used to flag late attendance. */
export function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return 8 * 60 + 30;
  return Number(m[1]) * 60 + Number(m[2]);
}

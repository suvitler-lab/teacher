// The one "today" in Bangkok time, shared by the worker and every page. Overdue vs not-yet-due
// is decided against this date, so two screens never disagree around midnight.
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

/** YYYY-MM-DD in Bangkok for the given instant (default: now). */
export function bkkToday(ms = Date.now()): string {
  return bkkParts(ms).date;
}

// Dates are stored as Gregorian ISO (YYYY-MM-DD, what <input type=date> emits).
// Thai users read Buddhist-era years, so display converts (year + 543).

const THAI_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${THAI_MONTHS[Number(mo)]} ${Number(y) + 543}`;
}

const THAI_MONTHS_FULL = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const thaiMonthsFull = THAI_MONTHS_FULL;

/** A moment (ms) as Bangkok wall-clock parts, whatever the device's own time zone. */
function bkkParts(ms: number) {
  const d = new Date(ms + 7 * 3600 * 1000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
const hhmm = (p: { h: number; mi: number }) => `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;

/** "30 ก.ย. 2569" from a timestamp. */
export function formatThaiDateMs(ms: number): string {
  const p = bkkParts(ms);
  return `${p.d} ${THAI_MONTHS[p.mo]} ${p.y + 543}`;
}
/** "30 ก.ย." (no year) from a timestamp. */
export function formatThaiDayMonthMs(ms: number): string {
  const p = bkkParts(ms);
  return `${p.d} ${THAI_MONTHS[p.mo]}`;
}
/** "30 ก.ย. 2569 14:05" from a timestamp. */
export function formatThaiDateTimeMs(ms: number): string {
  return `${formatThaiDateMs(ms)} ${hhmm(bkkParts(ms))}`;
}
/** "14:05" from a timestamp. */
export function formatThaiTimeMs(ms: number): string {
  return hhmm(bkkParts(ms));
}

export function currentMonthIso(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Options for a month <select>: last 12 months, value=YYYY-MM, label in B.E. */
export function monthOptions(count = 12): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: `${THAI_MONTHS[d.getUTCMonth() + 1]} ${d.getUTCFullYear() + 543}` });
  }
  return out;
}

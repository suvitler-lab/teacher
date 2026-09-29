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

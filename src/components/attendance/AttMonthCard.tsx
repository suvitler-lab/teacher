import { Icon } from "../Icon";
import type { AttendanceDay } from "@shared/types";
import { percentOf } from "@shared/metrics";

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "เดือนนี้" (BR-21): Σ(มา+สาย) ÷ Σเช็คแล้ว over the days checked this month, plus a small bar per checked day. `days` = this room's daily rows. */
export function AttMonthCard({ days, month, failed }: { days: AttendanceDay[]; month: number; failed: boolean }) {
  const got = days.filter((d) => d.marked > 0).sort((a, b) => a.date.localeCompare(b.date));
  const came = got.reduce((n, d) => n + d.present + d.late, 0), marked = got.reduce((n, d) => n + d.marked, 0);
  const pct = percentOf(came, marked);
  return (
    <section class="card att-card att-month" aria-labelledby="att-month-h">
      <h2 class="att-h" id="att-month-h"><Icon name="calendar" size={20} /> เดือนนี้ · {THAI_MONTHS[month - 1]}</h2>
      {failed ? <div class="att-tip">ยังโหลดสรุปเดือนนี้ไม่ได้</div>
        : got.length === 0 ? <div class="att-tip">เดือนนี้ยังไม่มีการเช็คชื่อรายวัน</div> : (
          <>
            <p class="att-month-sum">มาเรียน <b>{pct}%</b> · เช็คแล้ว {got.length} วัน</p>
            <div class="att-bars" role="list">
              {got.map((d) => { const p = percentOf(d.present + d.late, d.marked) ?? 0; const dd = Number(d.date.slice(8)); return (
                <div class="att-bar" role="listitem" aria-label={`วันที่ ${dd} มาเรียน ${p}%`}>
                  <b>{p}</b><i style={`height:${Math.max(8, p)}%`} /><span>{dd}</span>
                </div>
              ); })}
            </div>
          </>
        )}
    </section>
  );
}

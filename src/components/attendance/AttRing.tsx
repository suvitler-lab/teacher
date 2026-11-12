import type { AttendanceStatus } from "@shared/types";

const KEYS: AttendanceStatus[] = ["present", "late", "leave", "sick", "absent"];
const LABELS: Record<AttendanceStatus, string> = { present: "มา", late: "สาย", leave: "ลา", sick: "ป่วย", absent: "ขาด" };

/** Ring split into the 5 statuses over a dashed "not checked yet" track. role=img carries every number (colour is never the only cue). */
export function AttRing({ counts, total, marked, unmarked, held = 0, size = 96, loading }: { counts: number[]; total: number; marked: number; unmarked: number; held?: number; size?: number; loading?: boolean }) {
  const sw = Math.max(8, Math.round(size / 8));
  const r = (size - sw) / 2, C = 2 * Math.PI * r, h = size / 2, tot = total || 1;
  const none = Math.max(0, unmarked); // BR-19: total − checked − waiting-for-choice
  const parts = counts.filter((n) => n > 0).length + (none ? 1 : 0);
  const gap = parts > 1 ? 2 : 0;
  let off = 0;
  const label = loading ? "กำลังโหลด…" : `${KEYS.map((k, i) => `${LABELS[k]} ${counts[i]}`).join(" ")} ยังไม่เช็ค ${none}${held > 0 ? ` ต้องตรวจสอบ ${held}` : ""} จาก ${total} คน`;
  return (
    <div class="att-plate" role="img" aria-label={label}>
      <svg class="att-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={h} cy={h} r={r} fill="none" stroke="var(--border-control)" stroke-width={Math.max(3, sw * 0.4)} stroke-dasharray="4 5" />
        {KEYS.map((k, i) => {
          const len = (counts[i] / tot) * C;
          const el = <circle class="att-seg" cx={h} cy={h} r={r} fill="none" stroke={`var(--att-${k})`} stroke-width={sw}
            style={`stroke-dasharray:${Math.max(len - (len ? gap : 0), 0).toFixed(1)} ${C.toFixed(1)};stroke-dashoffset:${(-off).toFixed(1)}`} transform={`rotate(-90 ${h} ${h})`} />;
          off += len;
          return el;
        })}
      </svg>
      <div class="att-rc" aria-hidden="true"><b>{loading ? "–" : marked}</b><small>จาก {total}</small></div>
    </div>
  );
}

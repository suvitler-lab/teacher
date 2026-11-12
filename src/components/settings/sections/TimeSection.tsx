import { Icon } from "../../Icon";
import type { Settings } from "@shared/types";
import { Row, Scope, SaveMode } from "./shared";

/** Period start times: "{"1":"08:30","3":"10:20"}" (BR-57). Only the periods filled in are kept; an empty box means "not used". */
function PeriodTimes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let times: Record<string, string> = {};
  try { times = JSON.parse(value || "{}"); } catch { times = {}; }
  function setPeriod(p: number, t: string) { const next = { ...times }; if (t) next[String(p)] = t; else delete next[String(p)]; onChange(JSON.stringify(next)); }
  return (
    <div class="set-periods">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
        <label><span class="muted">คาบ {p}</span><input type="time" aria-label={`เวลาเริ่มคาบ ${p}`} value={times[String(p)] ?? ""} onInput={(e) => setPeriod(p, (e.target as HTMLInputElement).value)} /></label>
      ))}
    </div>
  );
}

export function TimeSection({ draft, set }: { draft: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  return (
    <div class="set-forms">
      <section class="card" aria-labelledby="se-th">
        <h2 id="se-th" class="set-section-title"><Icon name="clock" /> เวลาเรียน <Scope all /></h2>
        <Row label="เริ่มนับสาย (เช็คชื่อรายวัน)" hint="สแกนหลังเวลานี้ = สาย" mode="form">
          <input type="time" aria-label="เวลาเริ่มนับสาย" value={draft.late_after} onInput={(e) => set("late_after", (e.target as HTMLInputElement).value)} class="set-time" />
        </Row>
        <div class="set-periods-wrap">
          <div class="set-label">เวลาเริ่มคาบ (สำหรับเช็คชื่อรายคาบ)</div>
          <div class="page-sub" style="margin-bottom:8px">สแกนหลังเวลาเริ่มคาบจะนับเป็นสาย · เว้นว่างได้ถ้าไม่ใช้คาบนั้น</div>
          <PeriodTimes value={draft.period_times} onChange={(v) => set("period_times", v)} />
          <SaveMode mode="form" />
        </div>
      </section>
    </div>
  );
}

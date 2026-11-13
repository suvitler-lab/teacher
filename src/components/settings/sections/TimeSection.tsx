import { useRef, useState } from "preact/hooks";
import { Icon } from "../../Icon";
import type { Settings } from "@shared/types";
import { Row, Scope, useOffline, useReadOnly } from "./shared";
import { FrameSheet } from "../../timetable/frame";
import { ttFrame } from "../../../lib/timetable/store";
import { DAY_SHORT } from "../../../lib/timetable/messages";

/** Period times now live in one place: the frame (EP-12). This card only reads it and opens the same sheet the timetable page uses (AC-17). */
function FrameSummary() {
  const f = ttFrame.value;
  const ro = useReadOnly();
  const offline = useOffline();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const days = f.days.map((d) => DAY_SHORT[d]).join(" ");
  return (
    <div class="set-periods-wrap">
      <div class="set-label">เวลาเริ่มคาบ (ใช้กับตารางสอนและเช็คชื่อรายคาบ)</div>
      <p class="page-sub" style="margin-bottom:8px">
        {f.periods.length} คาบต่อวัน · วันเรียน {days}{f.breaks.length ? ` · พัก ${f.breaks.length} ช่วง` : ""}
        {f.saved ? "" : " · ยังไม่ได้ตั้ง ใช้ค่าเริ่มต้น"}
      </p>
      <ul class="set-periods" aria-label="เวลาแต่ละคาบ" style="list-style:none;margin:0 0 10px;padding:0">
        {f.periods.map((p, i) => (
          <li key={i} style="font-size:var(--fs-sm)"><span class="muted">คาบ {i + 1}</span> <span style="white-space:nowrap">{p.start}–{p.end}</span></li>
        ))}
        {f.breaks.map((b, i) => (
          <li key={`b${i}`} style="font-size:var(--fs-sm)"><span class="muted">{b.name}</span> <span style="white-space:nowrap">{b.start}–{b.end}</span></li>
        ))}
      </ul>
      <button type="button" ref={btn} onClick={() => setOpen(true)} disabled={offline || ro} aria-describedby={offline ? "tts-off" : undefined} style="min-height:var(--tap)">
        <Icon name="clock" size={20} /> ตั้งเวลาคาบ
      </button>
      {offline && <p id="tts-off" class="page-sub" role="status" style="margin-top:6px">ออฟไลน์ — ตั้งเวลาคาบได้เมื่อออนไลน์</p>}
      <FrameSheet open={open} onClose={() => setOpen(false)} returnFocus={btn.current} />
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
        <FrameSummary />
      </section>
    </div>
  );
}

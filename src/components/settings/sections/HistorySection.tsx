import { useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { AuditHistory } from "../../AuditHistory";
import { hideSignal } from "../../../lib/hideNames";
import { useReadOnly } from "./shared";

const FILTERS = [{ v: "", l: "ทั้งหมด" }, { v: "submission", l: "ส่งงาน" }, { v: "attendance", l: "เช็คชื่อ" }, { v: "student", l: "นักเรียน" }, { v: "qr", l: "บัตร QR" }];

/** ประวัติการแก้ไข (P2): read only; 5 filters; student names follow the home page's hide-names switch (BR-52). Hidden while projecting (it names children). */
export function HistorySection() {
  const ro = useReadOnly();
  const [filter, setFilter] = useState("");
  const hide = hideSignal("home").value;
  return (
    <section class="card" aria-labelledby="se-hh">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <h2 id="se-hh" class="set-section-title" style="margin:0"><Icon name="history" /> ประวัติการแก้ไข</h2>
        <div class="chips-row" role="group" aria-label="กรองประวัติ">{FILTERS.map((f) => <button key={f.v} class={"pill" + (filter === f.v ? " on" : "")} aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}>{f.l}</button>)}</div>
      </div>
      <p class="page-sub acct-note">อ่านอย่างเดียว · แสดง 40 รายการล่าสุด{hide && !ro ? " · ซ่อนชื่อนักเรียนอยู่ แสดงเป็นเลขที่" : ""}</p>
      {ro
        ? <div class="page-sub" role="status"><Icon name="eye-off" size={16} /> ประวัติการแก้ไขซ่อนอยู่ตอนฉายจอ (มีชื่อนักเรียน)</div>
        : <AuditHistory entity={filter || undefined} />}
    </section>
  );
}

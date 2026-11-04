import { useState } from "preact/hooks";
import { Icon } from "../Icon";
import { Drawer, Switch } from "../ui";
import { homeCards, saveHomeCards } from "../../lib/homePrefs";
import { defaultHomeCards, isHidden, moveCard, toggleCard, type HomeCardKey } from "../../lib/homeCards";
import { CARD_META } from "./meta";

/** "ปรับหน้าหลัก": show / hide and reorder the cards. Every tap is saved at once and shared with the other devices. */
export function CardSettings({ onClose }: { onClose: () => void }) {
  const prefs = homeCards.value;
  const [say, setSay] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const title = (k: HomeCardKey) => CARD_META[k].title;
  return (
    <Drawer label="ปรับหน้าหลัก" title={<><h2 class="hm-drawer-t" id="hm-prefs-h">ปรับหน้าหลัก</h2><div class="page-sub">เปิด/ปิดและเรียงการ์ด · บันทึกทันที ใช้กับทุกเครื่องที่เข้าสู่ระบบ</div></>} onClose={onClose}>
      <div class="page-sub hm-lock"><Icon name="info-circle" size={16} /> ปิดไม่ได้: ต้องทำตอนนี้ · ปุ่มลัด · ตัวเลข 4 ช่อง</div>
      <div class="page-sub" style="margin-bottom:4px">บนจอกว้าง การ์ดกว้าง (งานที่กำลังเก็บ ห้องของฉัน) อยู่คอลัมน์ซ้าย ที่เหลืออยู่ขวา · ลำดับมีผลในคอลัมน์เดียวกัน</div>
      {prefs.order.map((k, i) => {
        const on = !isHidden(prefs, k);
        const m = CARD_META[k];
        return (
          <div class={"hm-pref" + (on ? "" : " off")}>
            <span class="ic"><Icon name={on ? m.icon : "eye-off"} size={20} /></span>
            <span class="grow"><div class="nm">{m.title}{m.fresh && <span class="hm-new">ใหม่</span>}</div><div class="ds">{m.desc}</div></span>
            <Switch on={on} label={`แสดงการ์ด ${m.title}`} onToggle={() => { saveHomeCards(toggleCard(prefs, k)); setSay(`${m.title}: ${on ? "ซ่อน" : "แสดง"}`); }} />
            <span class="mv">
              <button class="icon ghost" aria-label={`เลื่อน ${m.title} ขึ้น`} disabled={i === 0} onClick={() => { saveHomeCards(moveCard(prefs, k, -1)); setSay(`ย้าย ${title(k)} ไปลำดับ ${i}`); }}><Icon name="chevron-up" size={20} /></button>
              <button class="icon ghost" aria-label={`เลื่อน ${m.title} ลง`} disabled={i === prefs.order.length - 1} onClick={() => { saveHomeCards(moveCard(prefs, k, 1)); setSay(`ย้าย ${title(k)} ไปลำดับ ${i + 2}`); }}><Icon name="chevron-down" size={20} /></button>
            </span>
          </div>
        );
      })}
      <span class="sr-only" role="status" aria-live="polite">{say}</span>
      <div class="row" style="justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px">
        {confirmReset ? (
          <span class="row" style="gap:6px"><span class="page-sub">คืนค่าเริ่มต้นทั้งหมด?</span>
            <button class="ghost" onClick={() => setConfirmReset(false)}>ไม่</button>
            <button onClick={() => { saveHomeCards(defaultHomeCards()); setConfirmReset(false); setSay("คืนค่าเริ่มต้นแล้ว"); }}>ใช่ คืนค่า</button></span>
        ) : <button class="ghost" onClick={() => setConfirmReset(true)}><Icon name="history" size={20} /> คืนค่าเริ่มต้น</button>}
        <button class="primary" onClick={onClose}>เสร็จ</button>
      </div>
    </Drawer>
  );
}

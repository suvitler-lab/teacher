import { useState } from "preact/hooks";
import { Icon } from "../Icon";
import { Drawer, Switch } from "../ui";
import { defaultPageLayout, savePageLayout, type PageKey } from "../../lib/pageCards";
import { isHiddenCard, moveLayoutCard, toggleLayoutCard, type CardLayout } from "../../lib/cardLayout";

export interface CardMeta { title: string; icon: string; desc: string; fresh?: boolean }

/**
 * "ปรับการ์ด" for the scan, attendance and random-name pages: show / hide and reorder the cards of one page.
 * Every tap is saved at once and shared with the other devices (same behaviour as the home page's drawer).
 */
export function PageCardSettings({ page, title, layout, meta, locked, onClose, reorder = true, pinned = [] }: {
  page: PageKey; title: string; layout: CardLayout<string>; meta: Record<string, CardMeta>; locked: string; onClose: () => void;
  /** cards that always sit first on the page (their arrows are off; the order of the others is still the teacher's) */
  pinned?: string[];
  /** false: the page draws its cards in fixed places, so moving them would change nothing (only show / hide is offered) */
  reorder?: boolean;
}) {
  const [say, setSay] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const save = (next: CardLayout<string>) => savePageLayout(page, next as never);
  // these pages spread their cards over columns; scan / attendance / random keep one column beside the main block
  const columns = page === "reports" || page === "students" || page === "gradebook" || page === "settings";
  return (
    <Drawer label={`ปรับการ์ด ${title}`} title={<><h2 class="hm-drawer-t" id="pc-prefs-h">ปรับการ์ด · {title}</h2><div class="page-sub">{reorder ? "เปิด/ปิดและเรียงการ์ด" : "เปิด/ปิดการ์ด"} · บันทึกทันที ใช้กับทุกเครื่องที่เข้าสู่ระบบ</div></>} onClose={onClose}>
      <div class="page-sub hm-lock"><Icon name="info-circle" size={16} /> ปิดไม่ได้ (เพื่อกันข้อมูลหาย): {locked}</div>
      {layout.order.map((k, i) => {
        const on = !isHiddenCard(layout, k);
        const m = meta[k];
        const pin = pinned.includes(k);
        return (
          <div class={"hm-pref" + (on ? "" : " off")} key={k}>
            <span class="ic"><Icon name={on ? m.icon : "eye-off"} size={20} /></span>
            <span class="grow"><div class="nm">{m.title}{m.fresh && <span class="hm-new">ใหม่</span>}</div><div class="ds">{m.desc}{pin && " · อยู่บนสุดเสมอ"}</div></span>
            <Switch on={on} label={`แสดงการ์ด ${m.title}`} onToggle={() => { save(toggleLayoutCard(layout, k)); setSay(`${m.title}: ${on ? "ซ่อน" : "แสดง"}`); }} />
            {reorder && <span class="mv">
              <button class="icon ghost" aria-label={`เลื่อน ${m.title} ขึ้น`} disabled={pin || i === 0} onClick={() => { save(moveLayoutCard(layout, k, -1)); setSay(`ย้าย ${m.title} ไปลำดับ ${i}`); }}><Icon name="chevron-up" size={20} /></button>
              <button class="icon ghost" aria-label={`เลื่อน ${m.title} ลง`} disabled={pin || i === layout.order.length - 1} onClick={() => { save(moveLayoutCard(layout, k, 1)); setSay(`ย้าย ${m.title} ไปลำดับ ${i + 2}`); }}><Icon name="chevron-down" size={20} /></button>
            </span>}
          </div>
        );
      })}
      {reorder && columns && <div class="page-sub" style="margin-top:6px">ใบแรกอยู่บนซ้าย · ใบถัดไปลงคอลัมน์ที่ยังสั้นกว่า</div>}
      <span class="sr-only" role="status" aria-live="polite">{say}</span>
      <div class="row" style="justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px">
        {confirmReset ? (
          <span class="row" style="gap:6px"><span class="page-sub">คืนค่าเริ่มต้นทั้งหมด?</span>
            <button class="ghost" onClick={() => setConfirmReset(false)}>ไม่</button>
            <button onClick={() => { save(defaultPageLayout(page) as never); setConfirmReset(false); setSay("คืนค่าเริ่มต้นแล้ว"); }}>ใช่ คืนค่า</button></span>
        ) : <button class="ghost" onClick={() => setConfirmReset(true)}><Icon name="history" size={20} /> คืนค่าเริ่มต้น</button>}
        <button class="primary" onClick={onClose}>เสร็จ</button>
      </div>
    </Drawer>
  );
}

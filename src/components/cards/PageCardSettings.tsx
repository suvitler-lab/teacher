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
export function PageCardSettings({ page, title, layout, meta, locked, onClose }: {
  page: PageKey; title: string; layout: CardLayout<string>; meta: Record<string, CardMeta>; locked: string; onClose: () => void;
}) {
  const [say, setSay] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const save = (next: CardLayout<string>) => savePageLayout(page, next as never);
  return (
    <Drawer label={`ปรับการ์ด ${title}`} title={<><h2 class="hm-drawer-t" id="pc-prefs-h">ปรับการ์ด · {title}</h2><div class="page-sub">เปิด/ปิดและเรียงการ์ด · บันทึกทันที ใช้กับทุกเครื่องที่เข้าสู่ระบบ</div></>} onClose={onClose}>
      <div class="page-sub hm-lock"><Icon name="info-circle" size={16} /> ปิดไม่ได้ (เพื่อกันข้อมูลหาย): {locked}</div>
      {layout.order.map((k, i) => {
        const on = !isHiddenCard(layout, k);
        const m = meta[k];
        return (
          <div class={"hm-pref" + (on ? "" : " off")} key={k}>
            <span class="ic"><Icon name={on ? m.icon : "eye-off"} size={20} /></span>
            <span class="grow"><div class="nm">{m.title}{m.fresh && <span class="hm-new">ใหม่</span>}</div><div class="ds">{m.desc}</div></span>
            <Switch on={on} label={`แสดงการ์ด ${m.title}`} onToggle={() => { save(toggleLayoutCard(layout, k)); setSay(`${m.title}: ${on ? "ซ่อน" : "แสดง"}`); }} />
            <span class="mv">
              <button class="icon ghost" aria-label={`เลื่อน ${m.title} ขึ้น`} disabled={i === 0} onClick={() => { save(moveLayoutCard(layout, k, -1)); setSay(`ย้าย ${m.title} ไปลำดับ ${i}`); }}><Icon name="chevron-up" size={20} /></button>
              <button class="icon ghost" aria-label={`เลื่อน ${m.title} ลง`} disabled={i === layout.order.length - 1} onClick={() => { save(moveLayoutCard(layout, k, 1)); setSay(`ย้าย ${m.title} ไปลำดับ ${i + 2}`); }}><Icon name="chevron-down" size={20} /></button>
            </span>
          </div>
        );
      })}
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

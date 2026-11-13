import { useState } from "preact/hooks";
import "../../styles/home-tt.css";
import { Icon } from "../Icon";
import { Drawer, Switch } from "../ui";
import { navigate } from "../../router";
import { LAYOUTS, saveAppearance, type Layout } from "../../lib/appearance";
import {
  LAYOUT_CARD_META, LAYOUT_LETTER, isFixedCard, LAYOUT_LOCKED, LAYOUT_NAME, isLayoutCardHidden, layoutCardsOf, layoutTitle, moveLayoutCard,
  resetLayoutPrefs, saveLayoutPrefs, toggleLayoutCard, type LayoutCardKey,
} from "../../lib/homeLayout";

/**
 * "ปรับหน้าหลัก" (AC-07, BR-12): (1) choose the layout, (2) show / hide / reorder the sub-cards of THIS layout only,
 * the locked parts said in words, (3) a link to ตั้งค่า > หน้าตา. Every tap is saved at once and shared with the other devices;
 * a save that fails (or no network) puts the card back and says why (D38: nothing is queued).
 */
export function CardSettings({ layout, onClose }: { layout: Layout; onClose: () => void }) {
  const prefs = layoutCardsOf(layout);
  const meta = LAYOUT_CARD_META[layout];
  const [say, setSay] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  /** a step at either end does nothing; the button stays focusable (aria-disabled, not disabled) so the keyboard focus never falls out of the panel (R-3306) */
  // a fixed card (the timetable strip, D53) has a switch only: it stays out of the list that can be moved
  const fixed = prefs.order.filter(isFixedCard);
  const movable = prefs.order.filter((k) => !isFixedCard(k));
  const step = (k: LayoutCardKey, dir: -1 | 1, i: number, pos: number) => {
    const edge = dir === -1 ? i === 0 : i === movable.length - 1;
    if (edge) return;
    void saveLayoutPrefs(layout, moveLayoutCard(prefs, k, dir)); setSay(`ย้าย ${name(k)} ไปลำดับ ${pos}`);
  };
  const name = (k: LayoutCardKey) => meta[k]?.title ?? k;
  const head = `ปรับหน้าหลัก · ${layoutTitle(layout)}`;
  return (
    <Drawer label={head} title={<><h2 class="hm-drawer-t" id="hm-prefs-h">{head}</h2><div class="page-sub">เลือกโครง เปิด/ปิดและเรียงการ์ด · บันทึกทันที ใช้กับทุกเครื่องที่เข้าสู่ระบบ</div></>} onClose={onClose}>
      <fieldset class="hm-lay">
        <legend class="hm-lay-l">โครงหน้าหลัก</legend>
        <div class="hm-lay-opts">
          {LAYOUTS.map((l) => (
            <label class={"hm-lay-opt" + (l === layout ? " on" : "")}>
              <input type="radio" name="hm-layout" value={l} checked={l === layout}
                onChange={() => { void saveAppearance({ layout: l }); setSay(`ใช้ ${layoutTitle(l)} แล้ว`); }} />
              <span class="t">โครง {LAYOUT_LETTER[l]}</span><span class="s">{LAYOUT_NAME[l]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div class="page-sub hm-lock"><Icon name="info-circle" size={16} /> ปิดไม่ได้: {LAYOUT_LOCKED[layout]}</div>
      {[...fixed, ...movable].map((k) => {
        const i = movable.indexOf(k);
        const isFixed = i < 0;
        const on = !isLayoutCardHidden(prefs, k);
        const m = meta[k] ?? { title: k, icon: "layout-grid", desc: "" };
        return (
          <div class={"hm-pref" + (on ? "" : " off")} key={k} data-card={k}>
            <span class="ic"><Icon name={on ? m.icon : "eye-off"} size={20} /></span>
            <span class="grow"><div class="nm">{m.title}</div><div class="ds">{m.desc}</div></span>
            <Switch on={on} label={`แสดงการ์ด ${m.title}`} onToggle={() => { void saveLayoutPrefs(layout, toggleLayoutCard(prefs, k)); setSay(`${m.title}: ${on ? "ซ่อน" : "แสดง"}`); }} />
            {!isFixed && (
              <span class="mv">
                <button class="icon ghost" aria-label={`เลื่อน ${m.title} ขึ้น`} aria-disabled={i === 0} onClick={() => step(k, -1, i, i)}><Icon name="chevron-up" size={20} /></button>
                <button class="icon ghost" aria-label={`เลื่อน ${m.title} ลง`} aria-disabled={i === movable.length - 1} onClick={() => step(k, 1, i, i + 2)}><Icon name="chevron-down" size={20} /></button>
              </span>
            )}
          </div>
        );
      })}
      <span class="sr-only" role="status" aria-live="polite">{say}</span>

      <div class="hm-pref-link"><button class="lk" onClick={() => { onClose(); navigate("/settings", { section: "appearance" }); }}>เปลี่ยนโครง/ธีมที่ ตั้งค่า &gt; หน้าตา ›</button></div>

      <div class="row" style="justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px">
        {confirmReset ? (
          <span class="row" style="gap:6px"><span class="page-sub">คืนค่าเริ่มต้นของ {layoutTitle(layout)}?</span>
            <button class="ghost" onClick={() => setConfirmReset(false)}>ไม่</button>
            <button onClick={() => { void resetLayoutPrefs(layout); setConfirmReset(false); setSay("คืนค่าเริ่มต้นแล้ว"); }}>ใช่ คืนค่า</button></span>
        ) : <button class="ghost" onClick={() => setConfirmReset(true)}><Icon name="history" size={20} /> คืนค่าเริ่มต้น</button>}
        <button class="primary" onClick={onClose}>เสร็จ</button>
      </div>
    </Drawer>
  );
}

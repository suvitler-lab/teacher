// The head of the timetable page (shared by all three layouts): title · term chooser · read-only / offline tags ·
// ตั้งเวลาคาบ · พิมพ์ตาราง · ⋯ (copy from the earlier term, clear the term; on a phone also the two buttons).
// A button that cannot work now stays visible but off (aria-disabled) with the reason written next to it, never hidden.
import { useEffect, useRef, useState } from "preact/hooks";
import type { Term } from "@shared/types";
import { Icon } from "../Icon";
import { MSG } from "../../lib/timetable/messages";
import type { CopySource } from "../../lib/timetable/copy";
import { focusFirstItem, menuKeys } from "../../lib/menuKeys";

export interface TtHeaderProps {
  term: Term;
  termList: Term[];
  readOnly: boolean;
  offline: boolean;
  offlineStamp: string | null;
  hasSlots: boolean;
  loaded: boolean; // the table is on screen (otherwise "nothing to print" would be a lie)
  canPrint: boolean;
  copySource: CopySource | null;
  mobile: boolean;
  frameBtn: preact.RefObject<HTMLButtonElement>;
  onTerm: (id: string) => void;
  onFrame: () => void;
  onPrint: () => void;
  onCopy: () => void;
  onClear: () => void;
}

export function TtHeader(p: TtHeaderProps) {
  const [menu, setMenu] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !menu) moreBtn.current?.focus();
    was.current = menu;
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const down = (e: Event) => { const t = e.target as Node; if (!document.querySelector(".tth-menu")?.contains(t) && !moreBtn.current?.contains(t)) setMenu(false); };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [menu]);

  const editable = !p.readOnly;
  const frameOff = p.offline;
  const copyLabel = p.copySource ? MSG.copyButton(p.copySource.name, p.copySource.count) : "";
  const showMore = editable && (p.mobile || p.hasSlots || !!p.copySource);
  // focus goes back to the ⋯ button before the menu unmounts, so a dialog opened by the item remembers it and Esc/ไม่ returns there
  const run = (fn: () => void, off = false) => () => { if (off) return; moreBtn.current?.focus(); setMenu(false); fn(); };

  return (
    <header class="tth">
      <div class="tth-l">
        <span class="tth-ic"><Icon name="calendar-event" size={20} /></span>
        <h1 class="tth-title">{MSG.pageTitle}</h1>
        <label class="tth-term">
          <span class="tth-sr">ภาคเรียน</span>
          <select aria-label="ภาคเรียนที่แสดง" value={p.term.id} onChange={(e) => p.onTerm((e.target as HTMLSelectElement).value)}>
            {p.termList.map((t) => <option value={t.id}>{t.name}{t.is_current ? " · ปัจจุบัน" : ""}</option>)}
          </select>
        </label>
        {p.readOnly && <span class="tth-tag tth-tag-old"><Icon name="history" size={15} /> {MSG.pastYear}</span>}
        {p.offlineStamp && <span class="tth-tag tth-tag-off"><Icon name="wifi-off" size={15} /> {p.offlineStamp}</span>}
      </div>
      <div class="tth-act">
        {!p.mobile && editable && (
          <button ref={p.frameBtn} type="button" aria-disabled={frameOff ? "true" : undefined} onClick={() => { if (!frameOff) p.onFrame(); }}>
            <Icon name="clock" size={18} /> ตั้งเวลาคาบ
          </button>
        )}
        {!p.mobile && (
          <button type="button" aria-label="พิมพ์ตารางสอน" disabled={!p.canPrint} onClick={p.onPrint}>
            <Icon name="printer" size={18} /> พิมพ์ตาราง
          </button>
        )}
        {(showMore || p.mobile) && (
          <span class="tth-more">
            <button ref={moreBtn} type="button" class="icon" aria-label="เมนูเพิ่มเติมของตารางสอน" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <Icon name="dots-three" size={22} />
            </button>
            {menu && (
              <div class="tth-menu" role="menu" aria-label="ตารางสอน" ref={focusFirstItem} onKeyDown={menuKeys(() => setMenu(false))}>
                {p.mobile && editable && <button type="button" role="menuitem" aria-disabled={frameOff ? "true" : undefined} onClick={run(p.onFrame, frameOff)}><Icon name="clock" size={18} /> ตั้งเวลาคาบ</button>}
                {p.mobile && <button type="button" role="menuitem" aria-label="พิมพ์ตารางสอน" aria-disabled={!p.canPrint ? "true" : undefined} onClick={run(p.onPrint, !p.canPrint)}><Icon name="printer" size={18} /> พิมพ์ตาราง</button>}
                {editable && p.copySource && <button type="button" role="menuitem" aria-disabled={p.offline ? "true" : undefined} onClick={run(p.onCopy, p.offline)}><Icon name="copy" size={18} /> {copyLabel}</button>}
                {editable && p.hasSlots && <button type="button" role="menuitem" class="tth-danger" aria-disabled={p.offline ? "true" : undefined} onClick={run(p.onClear, p.offline)}><Icon name="trash" size={18} /> ล้างตารางภาคนี้</button>}
                {p.offline && <p class="tth-off">{MSG.offlineEdit}</p>}
                {p.loaded && !p.canPrint && p.mobile && <p class="tth-off">ยังไม่มีคาบให้พิมพ์</p>}
              </div>
            )}
          </span>
        )}
      </div>
      {(p.offline && editable) && <p class="tth-note" role="note">{MSG.offlineEdit}</p>}
      {p.loaded && !p.canPrint && !p.mobile && <p class="tth-note" role="note">ยังไม่มีคาบให้พิมพ์</p>}
    </header>
  );
}

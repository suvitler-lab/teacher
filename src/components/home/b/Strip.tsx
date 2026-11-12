// Layout ข: "ต้องทำตอนนี้ N" — the first three rows of BR-01 as pills, and "อีก X อย่าง" which opens the whole list in a sheet (it never changes the layout, AC-26).
import { useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { Drawer } from "../../ui";
import { Chip } from "../shared";
import { navigate } from "../../../router";
import { runTodayGo } from "../model";
import { copyDueToLine } from "../today";
import type { TodayRow } from "../../../lib/homeLogic";
import type { HomeLayoutProps } from "../meta";
import { LEVEL_ICON, LEVEL_TONE, STRIP_ROWS, countedRows, laterRows } from "./logic";

function Pill({ row }: { row: TodayRow }) {
  return (
    <li class={"hmb-pill " + row.level}>
      <span class="ic" aria-hidden="true"><Icon name={row.icon} size={20} /></span>
      <span class="t"><b class="clamp2" title={row.title}>{row.title}</b><small>{row.levelLabel}</small></span>
      <button type="button" class={"hmb-btn" + (row.level === "later" ? "" : " primary")} aria-label={`${row.primary.label}: ${row.title}`} onClick={() => runTodayGo(row.primary.go)}>{row.primary.label}</button>
    </li>
  );
}

/** One row of the full list. `done` closes the sheet before a button leaves the page. */
function SheetRow({ row, hide, done }: { row: TodayRow; hide: boolean; done: () => void }) {
  return (
    <li class={"hmb-sheet-row " + (row.later ? "later" : row.level)}>
      <div class="top">
        <span class="ic" aria-hidden="true"><Icon name={row.icon} size={20} /></span>
        <div class="t"><h3>{row.title}</h3>{row.reason && <p>{row.reason}</p>}</div>
        <Chip tone={row.later ? "muted" : LEVEL_TONE[row.level]} icon={row.later ? "calendar-blank" : LEVEL_ICON[row.level]}>{row.levelLabel}</Chip>
      </div>
      <div class="acts">
        <button type="button" class={"hmb-btn" + (row.later || row.level === "later" ? "" : " primary")} onClick={() => { done(); runTodayGo(row.primary.go); }}>{row.primary.label}</button>
        {/* one copy button per room; the model has already taken them out while names are hidden */}
        {!hide && row.due && row.secondary?.map((s) => (
          <button type="button" key={s.classId} class="hmb-btn" onClick={() => copyDueToLine(row.due!, s.classId)}><Icon name="copy" size={20} />{s.label}</button>
        ))}
      </div>
    </li>
  );
}

export function TodoStrip({ model, hide }: Pick<HomeLayoutProps, "model" | "hide">) {
  const [sheet, setSheet] = useState(false);
  const rows = countedRows(model.todo);
  const n = model.todayCount;
  const rest = n - STRIP_ROWS;
  const later = laterRows(model.todo);
  return (<>
    <section class="hmb-strip" aria-labelledby="hmb-todo-h">
      <h2 id="hmb-todo-h" class="lead"><Icon name="bell-ringing" size={20} />ต้องทำตอนนี้ <span class="n num" aria-label={`${n} อย่าง`}>{n}</span></h2>
      {n === 0 ? (
        <div class="hmb-pill clear"><span class="ic" aria-hidden="true"><Icon name="smiley" size={20} /></span><span class="t"><b>ไม่มีอะไรค้าง · เคลียร์ครบแล้ว</b></span>
          <button type="button" class="hmb-btn" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="plus" size={20} />สร้างงานพรุ่งนี้</button></div>
      ) : <ul class="pills">{rows.slice(0, STRIP_ROWS).map((r) => <Pill key={r.key} row={r} />)}</ul>}
      {rest > 0 && <button type="button" class="hmb-btn ghost" aria-haspopup="dialog" onClick={() => setSheet(true)}>อีก {rest} อย่าง <Icon name="chevron-right" size={20} /></button>}
    </section>
    {sheet && (
      <Drawer label="ต้องทำตอนนี้ทั้งหมด" title={<><h2 class="hm-drawer-t">ต้องทำตอนนี้ทั้งหมด · {n}</h2><div class="page-sub">เรียงตามลำดับที่ควรทำ</div></>} onClose={() => setSheet(false)}>
        <ol class="hmb-sheet">{rows.map((r) => <SheetRow key={r.key} row={r} hide={hide} done={() => setSheet(false)} />)}</ol>
        {later.length > 0 && (<>
          <h3 class="hmb-sheet-h">ภายหลัง · ไม่นับในตัวเลขวันนี้</h3>
          <ol class="hmb-sheet">{later.map((r) => <SheetRow key={r.key} row={r} hide={hide} done={() => setSheet(false)} />)}</ol>
        </>)}
      </Drawer>
    )}
  </>);
}

// Layout ก only (N1, BR-14, AC-54/55): today's timetable periods as rows of "ลำดับงานวันนี้" — the period being taught first, the old work
// rows after it (Timeline.tsx), then the periods still to come (at most 5 rows in all, then "ดูอีก N คาบ"); finished periods fold into one line.
// They are not counted in the numbers, have no tick, and go away by themselves when the period ends (the snapshot is recalculated every minute).
import "../../../styles/home-tt.css";
import { useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { Chip } from "../shared";
import { navigate } from "../../../router";
import type { DaySnapshot, HomeRow } from "../../../lib/timetable/logic";
import { MSG } from "../../../lib/timetable/messages";

export const TT_MAX_ROWS = 5;

function TtItem({ row, snap }: { row: HomeRow; snap: DaySnapshot }) {
  const e = row.entry;
  const sc = row.shortcut ? snap.shortcut : null;
  const activity = e.kind === "activity";
  const chip = row.isNow ? `${activity ? MSG.nowWord : "กำลังสอน"} · ถึง ${e.end}` : null;
  return (
    <li class={"hma-item tt" + (row.isNow ? " now" : "")} data-kind="tt" data-tt-row>
      <div class="hma-time">{e.start}–{e.end}</div>
      <div class="hma-node" aria-hidden="true"><Icon name={activity ? "users-three" : "school"} size={18} /></div>
      <div class="hma-body">
        <div class="hma-top">
          <div class="hma-txt"><h3 title={e.title}>คาบ {e.period} · {e.title}</h3></div>
          {chip ? <Chip tone="accent" icon="clock">{chip}</Chip> : null}
        </div>
        <div class="hmt-from"><Icon name="calendar-event" size={14} />{MSG.fromTimetable}</div>
        {sc && (
          <div class="hma-acts">
            <button type="button" class={row.isNow ? "hma-btn primary" : "hma-btn"} onClick={() => navigate("/attendance", { class: sc.classId })}><Icon name="user-check" size={20} />{sc.attendanceLabel}</button>
          </div>
        )}
      </div>
    </li>
  );
}

/** the period being taught now: sits above the old work rows */
export function TtCurrent({ snap }: { snap: DaySnapshot | null }) {
  const cur = snap?.rows.current;
  return cur ? <TtItem row={cur} snap={snap as DaySnapshot} /> : null;
}

/** the periods still to come + the folded finished ones: sits below the old work rows */
export function TtLater({ snap }: { snap: DaySnapshot | null }) {
  const [openPast, setOpenPast] = useState(false);
  if (!snap) return null;
  const room = Math.max(0, TT_MAX_ROWS - (snap.rows.current ? 1 : 0));
  const shown = snap.rows.later.slice(0, room);
  const more = snap.rows.later.length - shown.length;
  const past = snap.cells.filter((c) => c.type === "period" && c.status === "past" && c.entry && !c.entry.archived);
  return (<>
    {shown.map((r) => <TtItem key={`${r.entry.weekday}-${r.entry.period}`} row={r} snap={snap} />)}
    {more > 0 && (
      <li class="hma-item tt more" data-kind="ttMore">
        <div class="hma-time" aria-hidden="true" />
        <div class="hma-node" aria-hidden="true"><Icon name="dots-three" size={18} /></div>
        <div class="hma-body flat"><button type="button" class="hma-btn" onClick={() => navigate("/timetable")}>ดูอีก {more} คาบ<Icon name="chevron-right" size={16} /></button></div>
      </li>
    )}
    {past.length > 0 && (
      <li class="hma-item tt past" data-kind="ttPast">
        <div class="hma-time" aria-hidden="true" />
        <div class="hma-node" aria-hidden="true"><Icon name="check" size={18} /></div>
        <div class="hma-body flat">
          <button type="button" class="hma-btn" aria-expanded={openPast} onClick={() => setOpenPast(!openPast)}>
            <Icon name={openPast ? "chevron-up" : "chevron-down"} size={18} />คาบที่ผ่านแล้ว {past.length} คาบ
          </button>
          {openPast && <ul class="hmt-pastl">{past.map((c) => <li key={c.period}>คาบ {c.period} · {c.start}–{c.end} · {c.entry?.title}</li>)}</ul>}
        </div>
      </li>
    )}
  </>);
}

// A day as a list of periods — the phone view of every layout (BR-12) and the table's stand-in at the largest text size.
// One day at a time (day chips) or, with `all`, every school day as a group. Words, not colour, say "ตอนนี้" / "ต่อไป".
import { useState } from "preact/hooks";
import { Icon } from "../Icon";
import type { Weekday } from "@shared/timetable";
import { ttNowMs } from "../../lib/timetable/clock";
import { type TtEntry, mobileDay, snapshot, toMin } from "../../lib/timetable/logic";
import { DAY_NAMES, DAY_SHORT, MSG, dayWord } from "../../lib/timetable/messages";
import { ttInputFor } from "../../lib/timetable/store";
import { PeriodChip } from "./PeriodChip";
import { type LayoutProps, cellAttr } from "./layoutTypes";
import { cellSpoken, entryMap, keyOf, todayInfo } from "./ttCells";

export function DayList(p: LayoutProps & { all?: boolean }) {
  const { frame, termId, readOnly, offline } = p;
  const entries = entryMap(termId);
  const today = todayInfo(termId, frame);
  const initial = today.live ? mobileDay(frame, ttNowMs.value) : { weekday: frame.days[0], isToday: false };
  const [picked, setPicked] = useState<Weekday | null>(null);
  const day: Weekday = picked && frame.days.includes(picked) ? picked : frame.days.includes(initial.weekday) ? initial.weekday : frame.days[0];

  // "ต่อไป": the next period of today (BR-04) — only on the term that is current
  const input = today.live ? ttInputFor(termId) : null;
  const snap = input ? snapshot(input, ttNowMs.value) : null;
  const nextToday = snap?.next && snap.next.offset === 0 ? snap.next.entry : null;

  const headingOf = (w: Weekday) => {
    if (today.live && w === today.weekday) return `วันนี้ (${DAY_NAMES[w]})`;
    if (!picked && w === initial.weekday && today.live && !initial.isToday) return `${dayWord(w)} (วันเรียนถัดไป)`;
    return dayWord(w);
  };

  const periodRows = (w: Weekday) => {
    type Row = { start: number; node: preact.VNode };
    const rows: Row[] = frame.periods.map((per, i): Row => {
      const n = i + 1;
      const e: TtEntry | undefined = entries.get(keyOf(w, n));
      const isNow = !!e && today.live && w === today.weekday && today.period === n;
      const isNext = !!e && !isNow && !!nextToday && nextToday.weekday === w && nextToday.period === n;
      const label = cellSpoken(frame, w, n, e, isNow, { readOnly, offline });
      const time = `${per.start}–${per.end}`;
      const tag = isNow ? MSG.nowWord : isNext ? MSG.nextWord : "";
      const inner = (
        <>
          <span class="ttd-p"><b>คาบ {n}</b><span class="ttd-t">{time}</span></span>
          <span class="ttd-body">
            {e ? <PeriodChip e={e} size="row" /> : readOnly ? <span class="ttd-free">{MSG.freeWord}</span> : <span class="ttd-add"><Icon name="plus" size={16} /> เพิ่มคาบ</span>}
          </span>
          {tag && <span class="ttd-tag">{tag}</span>}
        </>
      );
      const interactive = !readOnly;
      return {
        start: toMin(per.start),
        node: (
          <li key={`p${n}`} class={`ttd-row${e ? "" : " free"}${isNow ? " now" : ""}`} aria-current={isNow ? "time" : undefined}>
            {interactive ? (
              <button
                type="button" class="ttd-cell" data-tt-cell={cellAttr(w, n)} aria-label={label}
                aria-haspopup={e ? "menu" : undefined} aria-disabled={!e && offline ? "true" : undefined}
                onClick={(ev) => p.onCell(w, n, ev.currentTarget as HTMLElement)}
                onKeyDown={(ev) => { if (ev.key === "Delete" && e && !offline) { ev.preventDefault(); p.onDelete?.(w, n); } }}
              >{inner}</button>
            ) : (
              <div class="ttd-cell" data-tt-cell={cellAttr(w, n)} tabIndex={0} role="group" aria-label={label}>{inner}</div>
            )}
          </li>
        ),
      };
    });
    for (const b of frame.breaks) {
      rows.push({
        start: toMin(b.start) - 0.5,
        node: (
          <li key={`b${b.name}${b.start}`} class="ttd-brk" aria-label={`${b.name} ${b.start} ถึง ${b.end}`}>
            <span>{b.name}</span><span class="ttd-t">{b.start}–{b.end}</span>
          </li>
        ),
      });
    }
    return rows.sort((a, b) => a.start - b.start).map((r) => r.node);
  };

  const hasAny = (w: Weekday) => frame.periods.some((_, i) => entries.has(keyOf(w, i + 1)));

  if (p.all) {
    return (
      <div class="ttd ttd-all">
        {frame.days.map((w) => (
          <section class="ttd-day" aria-labelledby={`ttd-h-${w}`}>
            <h2 id={`ttd-h-${w}`} class="ttd-h">{headingOf(w)}</h2>
            <ul class="ttd-list">{periodRows(w)}</ul>
          </section>
        ))}
      </div>
    );
  }
  return (
    <div class="ttd">
      <div class="ttd-chips" role="group" aria-label="เลือกวัน">
        {frame.days.map((w) => (
          <button type="button" class="ttd-chip" aria-pressed={w === day} aria-label={dayWord(w)} onClick={() => setPicked(w)}>
            <span>{DAY_SHORT[w]}</span>
            {today.live && w === today.weekday && <small>วันนี้</small>}
          </button>
        ))}
      </div>
      <section class="ttd-day" aria-labelledby="ttd-h">
        <h2 id="ttd-h" class="ttd-h">{headingOf(day)}</h2>
        {readOnly && !hasAny(day) && <p class="ttd-none">ไม่มีคาบ</p>}
        <ul class="ttd-list">{periodRows(day)}</ul>
      </section>
    </div>
  );
}

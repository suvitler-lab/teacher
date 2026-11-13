// Layout ค "วันนี้เป็นหลัก" (S3, T-21): a "ตอนนี้ / ต่อไป" card with the attendance + scan shortcut (BR-15), today's periods as a list,
// and the whole week as the editor (two columns on a wide screen; one column below, with the day chips; phone = the day list only).
// Everything comes from snapshot() (src/lib/timetable/logic.ts) — this file only draws it. The shortcut only opens a page; it writes nothing.
// No motion. Words ("ตอนนี้" "ต่อไป" "ผ่านแล้ว"), not colour alone, carry the state.
import "../../../styles/timetable-c.css";
import { useEffect, useState } from "preact/hooks";
import type { Weekday } from "@shared/timetable";
import { Icon } from "../../Icon";
import { navigate } from "../../../router";
import { bangkok, ttNowMs } from "../../../lib/timetable/clock";
import { type TtEntry, mobileDay, snapshot, toMin } from "../../../lib/timetable/logic";
import { DAY_NAMES, MSG, dayWord } from "../../../lib/timetable/messages";
import { ttInputFor } from "../../../lib/timetable/store";
import { LayoutA } from "../a";
import { DayList } from "../DayList";
import { type LayoutProps, cellAttr } from "../layoutTypes";
import { PeriodChip } from "../PeriodChip";
import { cellSpoken, entryMap, keyOf, todayInfo, useBigText, useMobile } from "../ttCells";

/** Two columns from this width up (iPad landscape, computer); below it the week is the chip + day-list editor. */
function useWide(min = 1000): boolean {
  const q = `(min-width: ${min}px)`;
  const get = () => { try { return typeof matchMedia === "function" && !!matchMedia(q)?.matches; } catch { return false; } };
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    let m: MediaQueryList | undefined;
    try { m = matchMedia(q); } catch { return; }
    if (!m) return;
    const f = () => setOn(!!m!.matches);
    m.addEventListener?.("change", f);
    return () => m!.removeEventListener?.("change", f);
  }, []);
  return on;
}

type Snap = ReturnType<typeof snapshot> | null;

function snapOf(termId: string, live: boolean): Snap {
  const input = live ? ttInputFor(termId) : null;
  return input ? snapshot(input, ttNowMs.value) : null;
}

export function LayoutC(p: LayoutProps) {
  const mobile = useMobile();
  const big = useBigText();
  const wide = useWide() && !big;
  const grid = useWide(1400) && !big; // the paper grid needs a wide right column (computer); iPad landscape keeps chips + day list there
  const { termId, frame } = p;
  const today = todayInfo(termId, frame);
  const nowCard = today.live ? <NowCard {...p} snap={snapOf(termId, true)} period={today.period} /> : null;

  if (mobile) {
    // phone: the card, then the day list (it opens on today, or the next school day) — BR-12 / AC-59
    return <div class="ttc ttc-phone">{nowCard}<DayList {...p} /></div>;
  }
  return (
    <div class={`ttc${wide && grid ? " ttc-two" : ""}`}>
      <div class="ttc-col">
        {nowCard}
        {/* today's list only beside the paper grid; the chip + day-list editor already opens on today, so it is not shown twice (V-22) */}
        {(grid || big) && <TodayList {...p} />}
      </div>
      <section class="ttc-col ttc-week" aria-labelledby="ttc-wk">
        <h2 id="ttc-wk" class="ttc-h">ทั้งสัปดาห์ {!p.readOnly && <span class="ttc-hint">แตะช่องเพื่อเพิ่ม/แก้</span>}</h2>
        {big ? <DayList {...p} all /> : grid ? <LayoutA {...p} /> : <DayList {...p} />}
      </section>
    </div>
  );
}

function NowCard({ snap, period, frame }: LayoutProps & { snap: Snap; period: number | null }) {
  const now = snap?.now ?? null;
  const next = snap?.next ?? null;
  const sc = snap?.shortcut ?? null;
  const freePeriod = !now && period ? period : null; // inside a period nobody teaches
  const shortcut = (later: boolean) => sc && (sc.kind === "next") === later ? (
    <div class="ttc-acts">
      <button type="button" class="primary ttc-btn" onClick={() => navigate("/attendance", { class: sc.classId })}><Icon name="user-check" size={20} />{sc.attendanceLabel}</button>
      <button type="button" class="ttc-btn" onClick={() => navigate("/scan", { class: sc.classId })}><Icon name="scan" size={20} />{sc.scanLabel}</button>
    </div>
  ) : null;

  if (!now && !next && !freePeriod) {
    return <section class="ttc-card ttc-none" aria-label="ตอนนี้และต่อไป"><p class="ttc-v">ไม่มีคาบเหลือแล้ว</p></section>;
  }
  const periodTitle = (e: TtEntry) => (e.kind === "activity" ? `กิจกรรม ${e.label ?? ""}` : e.title);
  return (
    <section class="ttc-card" aria-label="ตอนนี้และต่อไป" data-ttc-now>
      {(now || freePeriod) && (
        <div class="ttc-blk main" data-blk="now">
          <span class="ttc-tag">{MSG.nowWord}</span>
          {now?.kind === "period" && <><p class="ttc-v">{periodTitle(now.entry)}</p><p class="ttc-k">คาบ {now.entry.period} · ถึง {now.entry.end}</p></>}
          {now?.kind === "break" && <><p class="ttc-v">{now.name}</p><p class="ttc-k">ถึง {now.end}</p></>}
          {freePeriod && <><p class="ttc-v">คาบ {freePeriod} {MSG.freeWord}</p><p class="ttc-k">ถึง {frame.periods[freePeriod - 1].end}</p></>}
          {shortcut(false)}
        </div>
      )}
      {next && (
        <div class="ttc-blk" data-blk="next">
          <span class="ttc-tag next">{MSG.nextWord}</span>
          <p class="ttc-v">{periodTitle(next.entry)}</p>
          <p class="ttc-k">{next.dayLabel ? `${next.dayLabel} · ` : ""}คาบ {next.entry.period} · {next.entry.start}–{next.entry.end}</p>
          {shortcut(true)}
        </div>
      )}
    </section>
  );
}

/** Today's periods (and breaks) by time; on a day off, the next school day. Tapping a row opens the same sheet / menu as the week. */
function TodayList(p: LayoutProps) {
  const { frame, termId, readOnly, offline } = p;
  const entries = entryMap(termId);
  const today = todayInfo(termId, frame);
  const nowSec = bangkok(ttNowMs.value).seconds;
  const isToday = today.live && today.isSchoolDay;
  const day: Weekday = isToday ? today.weekday : today.live ? mobileDay(frame, ttNowMs.value).weekday : frame.days[0];
  const heading = today.live ? `${isToday ? "วันนี้" : "วันเรียนถัดไป"} · ${DAY_NAMES[day]}` : dayWord(day);
  const nextToday = (() => { const s = snapOf(termId, today.live); return s?.next && s.next.offset === 0 ? s.next.entry : null; })();

  type Row = { start: number; node: preact.VNode };
  const rows: Row[] = frame.periods.map((per, i): Row => {
    const n = i + 1;
    const e = entries.get(keyOf(day, n));
    const isNow = !!e && isToday && today.period === n;
    const isNext = !!e && !isNow && !!nextToday && nextToday.period === n;
    const past = isToday && toMin(per.end) * 60 <= nowSec;
    const tag = isNow ? MSG.nowWord : isNext ? MSG.nextWord : past && e ? MSG.passedWord : "";
    const inner = (
      <>
        <span class="ttd-p"><b>คาบ {n}</b><span class="ttd-t">{per.start}–{per.end}</span></span>
        <span class="ttd-body">
          {e ? <PeriodChip e={e} size="row" /> : readOnly ? <span class="ttd-free">{MSG.freeWord}</span> : <span class="ttd-add"><Icon name="plus" size={16} /> เพิ่มคาบ</span>}
        </span>
        {tag && <span class="ttd-tag">{tag}</span>}
      </>
    );
    const label = cellSpoken(frame, day, n, e, isNow, { readOnly, offline }) + (tag && !isNow ? ` ${tag}` : "");
    return {
      start: toMin(per.start),
      node: (
        <li key={`p${n}`} class={`ttd-row${e ? "" : " free"}${isNow ? " now" : ""}${past && e ? " past" : ""}`} aria-current={isNow ? "time" : undefined}>
          {!readOnly ? (
            <button
              type="button" class="ttd-cell" data-tt-cell={`today:${cellAttr(day, n)}`} aria-label={label}
              aria-haspopup={e ? "menu" : undefined} aria-disabled={!e && offline ? "true" : undefined}
              onClick={(ev) => p.onCell(day, n, ev.currentTarget as HTMLElement)}
              onKeyDown={(ev) => { if (ev.key === "Delete" && e && !offline) { ev.preventDefault(); p.onDelete?.(day, n); } }}
            >{inner}</button>
          ) : (
            <div class="ttd-cell" tabIndex={0} role="group" aria-label={label}>{inner}</div>
          )}
        </li>
      ),
    };
  });
  for (const b of frame.breaks) {
    rows.push({
      start: toMin(b.start) - 0.5,
      node: <li key={`b${b.name}${b.start}`} class="ttd-brk" aria-label={`${b.name} ${b.start} ถึง ${b.end}`}><span>{b.name}</span><span class="ttd-t">{b.start}–{b.end}</span></li>,
    });
  }
  return (
    <section class="ttc-today" aria-labelledby="ttc-td">
      <h2 id="ttc-td" class="ttc-h">{heading}</h2>
      <ul class="ttd-list">{rows.sort((a, b) => a.start - b.start).map((r) => r.node)}</ul>
    </section>
  );
}

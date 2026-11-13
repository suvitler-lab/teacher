// Layout ข "ปฏิทินแกนเวลา" (S2): a vertical time axis, one column per school day (week) or a single column (day).
// A period is a block as tall as its length (60 min = 64px, every 60-minute block the same); a break is a narrow striped band.
// "ตอนนี้ HH:MM" is a solid line plus a word in the axis. Empty cells always show a dashed "+" and open the add sheet.
// role="grid" with a roving tabindex (arrows walk the cells, Enter/Space opens, Delete removes). No motion.
// "เพิ่มคาบ" cannot pick a place inside the sheet (the sheet's place is fixed), so it first lists the empty cells (one extra step).
import "../../../styles/timetable-b.css";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Weekday } from "@shared/timetable";
import { Icon } from "../../Icon";
import { bangkok, bangkokHM, ttNowMs } from "../../../lib/timetable/clock";
import { mobileDay, summarize, toMin } from "../../../lib/timetable/logic";
import { DAY_NAMES, DAY_SHORT, MSG, dayWord } from "../../../lib/timetable/messages";
import { type LayoutProps, cellAttr } from "../layoutTypes";
import { PeriodChip } from "../PeriodChip";
import { cellSpoken, entryMap, keyOf, todayInfo, useBigText, useMobile } from "../ttCells";

type Item = { k: "p"; n: number; start: string; end: string } | { k: "b"; name: string; start: string; end: string };
type View = "week" | "day";

export function LayoutB(p: LayoutProps) {
  const { frame, termId, readOnly, offline } = p;
  const mobile = useMobile();
  const big = useBigText();
  const entries = entryMap(termId);
  const today = todayInfo(termId, frame);
  const np = frame.periods.length;

  const [view, setView] = useState<View>("week");
  const [picked, setPicked] = useState<Weekday | null>(null);
  const [at, setAt] = useState<{ w: Weekday; p: number }>({ w: frame.days[0], p: 1 });
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const sel = useRef<HTMLSelectElement>(null);
  const scrolled = useRef(false);

  const oneDay = mobile || big || view === "day";
  const initialDay = today.live ? mobileDay(frame, ttNowMs.value).weekday : frame.days[0];
  const day: Weekday = picked && frame.days.includes(picked) ? picked : frame.days.includes(initialDay) ? initialDay : frame.days[0];
  const days: Weekday[] = oneDay ? [day] : frame.days;
  const cur = days.includes(at.w) && at.p <= np ? at : { w: days[0], p: 1 };
  const canDelete = !readOnly && !offline;
  const live = !readOnly;

  // rows in time order: periods and breaks
  const items: Item[] = [
    ...frame.periods.map((per, i): Item => ({ k: "p", n: i + 1, start: per.start, end: per.end })),
    ...frame.breaks.map((b): Item => ({ k: "b", name: b.name, start: b.start, end: b.end })),
  ].sort((a, b) => toMin(a.start) - toMin(b.start));

  // where the clock is on the axis (a period or a break); the line is drawn only on the current term, on a school day
  const sec = bangkok(ttNowMs.value).seconds;
  const nowIdx = today.live && today.isSchoolDay ? items.findIndex((it) => toMin(it.start) * 60 <= sec && sec < toMin(it.end) * 60) : -1;
  const nowItem = nowIdx >= 0 ? items[nowIdx] : null;
  const nowPct = nowItem ? Math.round(((sec - toMin(nowItem.start) * 60) / ((toMin(nowItem.end) - toMin(nowItem.start)) * 60)) * 100) : 0;
  const nowText = `${MSG.nowWord} ${bangkokHM(ttNowMs.value)}`;

  // open on the current time without scrolling by hand — once only (never again when the minute ticks)
  useEffect(() => {
    if (scrolled.current || nowIdx < 0) return;
    const box = ref.current;
    const row = box?.querySelector<HTMLElement>(`[data-ttb-row="${nowIdx}"]`);
    if (!box || !row || box.scrollHeight <= box.clientHeight) return;
    scrolled.current = true;
    box.scrollTop = Math.max(0, row.offsetTop - 56);
  }, [nowIdx]);

  const rowH = (it: Item) => it.k === "b" ? "minmax(28px, auto)" : `minmax(max(var(--tap), calc(var(--ttb-px) * ${(toMin(it.end) - toMin(it.start)) / 60})), auto)`;
  const template = `var(--ttb-axis) repeat(${days.length}, minmax(var(--ttb-min), 1fr))`;
  const rowsTpl = `auto ${items.map(rowH).join(" ")}`;

  const go = (w: Weekday, per: number) => {
    setAt({ w, p: per });
    ref.current?.querySelector<HTMLElement>(`[data-tt-cell="${cellAttr(w, per)}"]`)?.focus();
  };
  const onKey = (ev: KeyboardEvent) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-tt-cell]");
    if (!t) return;
    const [ws, ps] = (t.getAttribute("data-tt-cell") as string).split(":");
    const w = Number(ws) as Weekday, per = Number(ps);
    const di = days.indexOf(w);
    const ctrl = ev.ctrlKey || ev.metaKey;
    let next: [Weekday, number] | null = null;
    switch (ev.key) {
      case "ArrowDown": next = [w, Math.min(np, per + 1)]; break;
      case "ArrowUp": next = [w, Math.max(1, per - 1)]; break;
      case "ArrowRight": next = [days[Math.min(days.length - 1, di + 1)], per]; break;
      case "ArrowLeft": next = [days[Math.max(0, di - 1)], per]; break;
      case "Home": next = ctrl ? [days[0], 1] : [w, 1]; break;
      case "End": next = ctrl ? [days[days.length - 1], np] : [w, np]; break;
      case "Enter": case " ":
        ev.preventDefault();
        p.onCell(w, per, t);
        return;
      case "Delete":
        if (canDelete && entries.has(keyOf(w, per))) { ev.preventDefault(); p.onDelete?.(w, per); }
        return;
      default: return;
    }
    ev.preventDefault();
    go(next[0], next[1]);
  };

  // ---- "เพิ่มคาบ": the empty cells, in day then period order ----
  const empties: { w: Weekday; n: number }[] = [];
  for (const w of frame.days) for (let n = 1; n <= np; n++) if (!entries.has(keyOf(w, n))) empties.push({ w, n });
  const emptyText = (e: { w: Weekday; n: number }) => `${dayWord(e.w)} · คาบ ${e.n} · ${frame.periods[e.n - 1].start}–${frame.periods[e.n - 1].end}`;
  const firstEmpty = empties.find((e) => e.w === (oneDay ? day : today.live ? today.weekday : e.w)) ?? empties[0];
  const openAdd = () => {
    if (offline || empties.length === 0) return;
    setTarget(firstEmpty ? `${firstEmpty.w}:${firstEmpty.n}` : "");
    setAdding(true);
  };
  const closeAdd = () => { setAdding(false); setTimeout(() => addBtn.current?.focus(), 0); };
  const confirmAdd = () => {
    const [ws, ps] = (sel.current?.value || target).split(":");
    const w = Number(ws) as Weekday, per = Number(ps);
    if (!w || !per) return;
    setAdding(false);
    if (oneDay) setPicked(w);
    setAt({ w, p: per });
    setTimeout(() => p.onCell(w, per, addBtn.current as HTMLElement), 0);
  };

  const hasAny = days.some((w) => frame.periods.some((_, i) => entries.has(keyOf(w, i + 1))));
  const showSwitch = !mobile && !big;
  // layout ข shows the summary under the header (ux.md: ก under the table · ข under the header · ค at the end of the page)
  const summary = summarize(p.slots, frame).text;

  return (
    <div class="ttb">
      <div class="ttb-bar">
        {showSwitch && (
          <div class="ttb-sw" role="radiogroup" aria-label="มุมมอง">
            {(["day", "week"] as View[]).map((v) => (
              <button type="button" role="radio" aria-checked={oneDay === (v === "day")} class="ttb-sw-b" onClick={() => setView(v)}>{v === "day" ? "วัน" : "สัปดาห์"}</button>
            ))}
          </div>
        )}
        {oneDay && (
          <div class="ttd-chips ttb-chips" role="group" aria-label="เลือกวัน">
            {frame.days.map((w) => (
              <button type="button" class="ttd-chip" aria-pressed={w === day} aria-label={dayWord(w)} onClick={() => { setPicked(w); setAt({ w, p: 1 }); }}>
                <span>{DAY_SHORT[w]}</span>
                {today.live && w === today.weekday && <small>วันนี้</small>}
              </button>
            ))}
          </div>
        )}
        <p class="tt-sum ttb-sum" data-testid="tt-summary">{summary}</p>
        {live && (
          <button ref={addBtn} type="button" class="primary ttb-add" aria-expanded={adding} aria-disabled={offline || empties.length === 0 ? "true" : undefined} onClick={() => (adding ? closeAdd() : openAdd())}>
            <Icon name="plus" size={16} /> เพิ่มคาบ
          </button>
        )}
      </div>

      {adding && (
        <div class="ttb-pick" role="group" aria-label="เลือกช่องที่จะเพิ่มคาบ" onKeyDown={(ev) => { if (ev.key === "Escape") { ev.stopPropagation(); closeAdd(); } }}>
          <label>
            <span>เลือกช่องว่าง</span>
            <select ref={sel} autoFocus>
              {empties.map((e) => <option value={`${e.w}:${e.n}`} selected={target === `${e.w}:${e.n}`}>{emptyText(e)}</option>)}
            </select>
          </label>
          <button type="button" class="primary" onClick={confirmAdd}>ถัดไป</button>
          <button type="button" onClick={closeAdd}>ยกเลิก</button>
        </div>
      )}
      {live && !offline && empties.length === 0 && <p class="ttb-note">ช่องคาบเต็มทุกช่องแล้ว</p>}
      {readOnly && !hasAny && <p class="ttb-note">ไม่มีคาบ</p>}

      {/* V-11: 8+ periods use a shorter hour (compact density) so the whole day fits the frame; 7 periods keep 60px per hour */}
      <div class="ttb-frame" ref={ref} data-density={np >= 8 ? "compact" : undefined}>
        <div
          class="ttb-grid" role="grid" aria-label={oneDay ? `ตารางสอน${dayWord(day)}` : "ตารางสอนทั้งสัปดาห์"} aria-rowcount={items.length + 1} aria-colcount={days.length + 1}
          style={`grid-template-columns:${template};grid-template-rows:${rowsTpl}`} onKeyDown={onKey}
        >
          <div role="row" class="ttb-row">
            <div role="columnheader" class="ttb-ch ttb-corner" style="grid-area:1 / 1">เวลา</div>
            {days.map((w, ci) => {
              const isToday = today.live && w === today.weekday;
              return (
                <div role="columnheader" class={`ttb-ch${isToday ? " today" : ""}`} style={`grid-area:1 / ${ci + 2}`} aria-label={`${dayWord(w)}${isToday ? " วันนี้" : ""}`}>
                  <b>{oneDay ? DAY_NAMES[w] : DAY_SHORT[w]}</b>
                  {isToday && <em class="ttb-tag">วันนี้</em>}
                </div>
              );
            })}
          </div>
          {items.map((it, ri) => {
            const row = ri + 2;
            const isNowRow = ri === nowIdx;
            if (it.k === "b") {
              return (
                <div role="row" class="ttb-row" data-ttb-row={ri} key={`b${it.name}${it.start}`}>
                  <div role="rowheader" class={`ttb-ax ttb-ax-b${isNowRow ? " now" : ""}`} style={`grid-area:${row} / 1`} aria-label={`${it.name} ${it.start} ถึง ${it.end}${isNowRow ? ` ${nowText}` : ""}`}>
                    <span aria-hidden="true">{it.start}</span>
                    {isNowRow && <em class={`ttb-nowtag${nowPct < 50 ? "" : " lo"}`} style={nowPct < 50 ? `top:${nowPct}%` : undefined} aria-hidden="true">{nowText}</em>}
                  </div>
                  <div role="gridcell" class="ttb-brk" style={`grid-area:${row} / 2 / ${row} / -1`} aria-label={`${it.name} ${it.start} ถึง ${it.end}`}>
                    <span>{it.name} {it.start}–{it.end}</span>
                  </div>
                  {isNowRow && <div class="ttb-line" aria-hidden="true" style={`grid-area:${row} / 2 / ${row} / -1;--ttb-y:${nowPct}%`} />}
                </div>
              );
            }
            return (
              <div role="row" class="ttb-row" data-ttb-row={ri} key={`p${it.n}`}>
                <div role="rowheader" class={`ttb-ax${isNowRow ? ` now${nowPct < 50 ? " late" : ""}` : ""}`} style={`grid-area:${row} / 1`} aria-label={`คาบ ${it.n} ${it.start} ถึง ${it.end}${isNowRow ? ` ${nowText}` : ""}`}>
                  <b aria-hidden="true">{it.start}</b>
                  <span aria-hidden="true">คาบ {it.n}</span>
                  {isNowRow && <em class={`ttb-nowtag${nowPct < 50 ? "" : " lo"}`} style={nowPct < 50 ? `top:${nowPct}%` : undefined} aria-hidden="true">{nowText}</em>}
                </div>
                {days.map((w, ci) => {
                  const e = entries.get(keyOf(w, it.n));
                  const isNow = !!e && isNowRow && w === today.weekday;
                  const focused = cur.w === w && cur.p === it.n;
                  return (
                    <div
                      role="gridcell" data-tt-cell={cellAttr(w, it.n)} class={`ttb-c${e ? " fill" : " empty"}${isNow ? " now" : ""}${live && !(offline && !e) ? " act" : ""}`}
                      tabIndex={focused ? 0 : -1} aria-label={cellSpoken(frame, w, it.n, e, isNow, { readOnly, offline })}
                      aria-haspopup={e && live ? "menu" : undefined} aria-disabled={!e && live && offline ? "true" : undefined}
                      style={`grid-area:${row} / ${ci + 2}`}
                      onFocus={() => { if (!focused) setAt({ w, p: it.n }); }}
                      onClick={(ev) => { setAt({ w, p: it.n }); p.onCell(w, it.n, ev.currentTarget as HTMLElement); }}
                    >
                      {e ? (
                        <>
                          <PeriodChip e={e} size="block" />
                          {isNow && <em class="ttb-tag">{MSG.nowWord}</em>}
                        </>
                      ) : live ? <span class="ttb-plus" aria-hidden="true"><Icon name="plus" size={18} /></span> : null}
                    </div>
                  );
                })}
                {isNowRow && <div class="ttb-line" aria-hidden="true" style={`grid-area:${row} / 2 / ${row} / -1;--ttb-y:${nowPct}%`} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

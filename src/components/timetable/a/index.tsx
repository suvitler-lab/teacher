// Layout ก "ตารางกระดาษ" (S1): rows = school days, columns = periods, the lunch (and other) breaks as a tall band between them.
// role="grid" with a roving tabindex: one Tab stop, arrows walk the cells, Enter/Space opens the cell, Delete removes it.
// Phone and the largest text size show the day list instead (DayList). No motion; "ตอนนี้" / "วันนี้" are words.
import "../../../styles/timetable-a.css";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Weekday } from "@shared/timetable";
import { Icon } from "../../Icon";
import { DAY_NAMES, MSG } from "../../../lib/timetable/messages";
import { DayList } from "../DayList";
import { type LayoutProps, cellAttr } from "../layoutTypes";
import { PeriodChip } from "../PeriodChip";
import { printColumns } from "../print";
import { cellSpoken, entryMap, keyOf, todayInfo, useBigText, useMobile } from "../ttCells";

export function LayoutA(p: LayoutProps) {
  const mobile = useMobile();
  const big = useBigText();
  if (mobile) return <DayList {...p} />;
  if (big) return <DayList {...p} all />;
  return <Grid {...p} />;
}

function Grid(p: LayoutProps) {
  const { frame, termId, readOnly, offline } = p;
  const days = frame.days;
  const np = frame.periods.length;
  const entries = entryMap(termId);
  const today = todayInfo(termId, frame);
  const cols = printColumns(frame);
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // the week is larger than the frame (wider: x, taller: y): it scrolls, so the frame is a focusable region with a hint,
  // and a soft edge marks the side that still has more (V-40/V-43)
  const [over, setOver] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [more, setMore] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [at, setAt] = useState<{ w: Weekday; p: number }>({ w: days[0], p: 1 });
  const cur = days.includes(at.w) && at.p <= np ? at : { w: days[0], p: 1 };
  const canDelete = !readOnly && !offline;
  // V-10: a big week (6+ school days or 8+ periods) uses the compact density so all its rows fit one screen
  const compact = days.length >= 6 || np >= 8;

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const check = () => {
      const x = el.scrollWidth > el.clientWidth + 1, y = el.scrollHeight > el.clientHeight + 1;
      setOver((o) => (o.x === x && o.y === y ? o : { x, y }));
      const mx = x && el.scrollLeft + el.clientWidth < el.scrollWidth - 1, my = y && el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setMore((m) => (m.x === mx && m.y === my ? m : { x: mx, y: my }));
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // a late web font changes the row heights after the first check
    document.fonts?.ready?.then(check).catch(() => {});
    const off = () => { el.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
    if (typeof ResizeObserver === "undefined") return off;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { off(); ro.disconnect(); };
  }, [np, days.length, cols.length]);

  const template = `var(--tta-day) ${cols.map((c) => (c.k === "p" ? "minmax(var(--tta-min), 1fr)" : "var(--tta-brk)")).join(" ")}`;

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
      case "ArrowRight": next = [w, Math.min(np, per + 1)]; break;
      case "ArrowLeft": next = [w, Math.max(1, per - 1)]; break;
      case "ArrowDown": next = [days[Math.min(days.length - 1, di + 1)], per]; break;
      case "ArrowUp": next = [days[Math.max(0, di - 1)], per]; break;
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

  return (
    <>
    <div class="tta-wrap" data-more-x={more.x ? "" : undefined} data-more-y={more.y ? "" : undefined}>
    <div class="tta-frame" ref={frameRef} data-density={compact ? "compact" : undefined} {...(over.x || over.y ? { tabIndex: 0, role: "region", "aria-label": overLabel(over) } : {})}>
      <div
        ref={ref} class="tta-grid" role="grid" aria-label="ตารางสอนทั้งสัปดาห์" aria-rowcount={days.length + 1} aria-colcount={cols.length + 1}
        style={`grid-template-columns:${template}`} onKeyDown={onKey}
      >
        <div role="row" class="tta-row">
          <div role="columnheader" class="tta-ch tta-corner" style="grid-area:1 / 1">วัน / คาบ</div>
          {cols.map((c, hi) => c.k === "p" ? (
            <div role="columnheader" style={`grid-area:1 / ${hi + 2}`} class={`tta-ch${today.period === c.period ? " now" : ""}`} aria-label={`คาบ ${c.period} ${c.start} ถึง ${c.end}${today.period === c.period ? ` ${MSG.nowWord}` : ""}`}>
              <b>คาบ {c.period}</b>
              <span>{c.start}–{c.end}</span>
              {today.period === c.period && <em class="tta-now">{MSG.nowWord}</em>}
            </div>
          ) : (
            <div role="columnheader" style={`grid-area:1 / ${hi + 2}`} class="tta-ch tta-chb" aria-label={`${c.name} ${c.start} ถึง ${c.end}`}><span aria-hidden="true">พัก</span></div>
          ))}
        </div>
        {days.map((w, ri) => {
          const isToday = today.live && w === today.weekday;
          return (
            <div role="row" class="tta-row" key={w}>
              <div role="rowheader" style={`grid-area:${ri + 2} / 1`} class={`tta-dn${isToday ? " today" : ""}`}>
                <b>{DAY_NAMES[w]}</b>
                {isToday && <em class="tta-today">วันนี้</em>}
              </div>
              {cols.map((c, ci) => {
                if (c.k === "b") {
                  // one band for the whole column, drawn from the first day row down to the last
                  return ri === 0 ? (
                    <div role="presentation" aria-hidden="true" class="tta-brk" style={`grid-area:2 / ${ci + 2} / span ${days.length} / span 1`}>
                      <span>{c.name} {c.start}–{c.end}</span>
                    </div>
                  ) : null;
                }
                const e = entries.get(keyOf(w, c.period));
                const isNow = !!e && isToday && today.period === c.period;
                const focused = cur.w === w && cur.p === c.period;
                const live = !readOnly;
                return (
                  <div
                    role="gridcell" data-tt-cell={cellAttr(w, c.period)} class={`tta-c${e ? " fill" : " empty"}${isNow ? " now" : ""}${live && !(offline && !e) ? " act" : ""}`}
                    tabIndex={focused ? 0 : -1} aria-label={cellSpoken(frame, w, c.period, e, isNow, { readOnly, offline })}
                    aria-haspopup={e && live ? "menu" : undefined} aria-disabled={!e && live && offline ? "true" : undefined}
                    style={`grid-area:${ri + 2} / ${ci + 2}`}
                    onFocus={() => { if (!focused) setAt({ w, p: c.period }); }}
                    onClick={(ev) => { setAt({ w, p: c.period }); p.onCell(w, c.period, ev.currentTarget as HTMLElement); }}
                  >
                    {e ? (
                      <>
                        <PeriodChip e={e} />
                        {isNow && <em class="tta-now">{MSG.nowWord}</em>}
                      </>
                    ) : live ? <span class="tta-plus" aria-hidden="true" title="เพิ่มคาบ"><Icon name="plus" size={18} /></span> : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
    </div>
    {(over.x || over.y) && <p class="tta-hint">{overHint(over)}</p>}
    </>
  );
}

function overLabel(o: { x: boolean; y: boolean }): string {
  return o.x && o.y ? "ตารางสอน เลื่อนดูทางขวาและด้านล่างได้" : o.x ? "ตารางสอน เลื่อนดูทางขวาได้" : "ตารางสอน เลื่อนดูด้านล่างได้";
}
function overHint(o: { x: boolean; y: boolean }): string {
  return o.x && o.y ? "เลื่อนตารางไปทางขวาและลงล่างเพื่อดูคาบและวันที่เหลือ ›" : o.x ? "เลื่อนตารางไปทางขวาเพื่อดูคาบที่เหลือ ›" : "เลื่อนตารางลงเพื่อดูวันที่เหลือ ⌄";
}

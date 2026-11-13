// The "ตารางสอนวันนี้" strip under the header of all three home layouts (BR-14, AC-18..27, AC-53, AC-64): every period and break of
// today as a cell, a "ตอนนี้" / "ต่อไป" line, the one attendance shortcut (BR-15) and "ดูทั้งสัปดาห์". Everything comes from the snapshot
// (`ttToday`, logic.ts); this file only draws it. A shortcut only opens a page — it never writes roll-call or hand-in data.
// No motion. Words carry the state ("ตอนนี้" / "ผ่านแล้ว"), colour only backs them up.
import "../../styles/home-tt.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { focusFirstItem, menuKeys } from "../../lib/menuKeys";
import { navigate } from "../../router";
import { currentTermId } from "../../store";
import { ttOfflineStamp } from "../../lib/timetable/store";
import { clipText, type DaySnapshot, type StripCell } from "../../lib/timetable/logic";
import { MSG } from "../../lib/timetable/messages";

/** "ตอนนี้ · คาบ 2 · ถึง 10:30 · …" -> the part after the leading word (the word is drawn as a tag). */
const afterWord = (line: string) => line.slice(line.indexOf(" · ") + 3);

function cellName(c: StripCell): string {
  if (c.type === "break") return c.name ?? "พัก";
  const e = c.entry;
  if (!e) return MSG.freeWord;
  return clipText(e.kind === "activity" ? e.label ?? "" : e.className ?? "", 8);
}

function cellSpoken(c: StripCell): string {
  const when = `${c.start} ถึง ${c.end}`;
  const state = c.live ? ` ${MSG.nowWord}` : c.status === "past" ? ` ${MSG.passedWord}` : "";
  if (c.type === "break") return `${c.name} ${when}${state}`;
  const e = c.entry;
  const what = !e ? MSG.freeWord : e.archived ? `${e.title} ${MSG.archivedBadge}` : e.title;
  return `คาบ ${c.period} ${when} ${what}${state}`;
}

function Cell({ c }: { c: StripCell }) {
  const e = c.entry;
  const word = c.live ? MSG.nowWord : c.status === "past" ? MSG.passedWord : "";
  return (
    <li class={`hmt-cell ${c.type} ${c.status}${c.live ? " live" : ""}${e ? "" : " free"}`} aria-current={c.live ? "time" : undefined} aria-label={cellSpoken(c)}>
      <span class="hmt-c-h" aria-hidden="true">
        <b>{c.type === "break" ? "พัก" : c.period}</b>
        {word && <span class="hmt-c-w">{c.status === "past" && <Icon name="check" size={14} />}{word}</span>}
      </span>
      <span class="hmt-c-n" aria-hidden="true">
        {e?.kind === "activity" && <Icon name="users-three" size={14} />}
        {c.type === "break" ? <span>{c.start}</span> : <span>{cellName(c)}</span>}
        {e?.archived && <span class="hmt-c-a">{MSG.archivedBadge}</span>}
      </span>
    </li>
  );
}

export function TimetableStrip({ snap }: { snap: DaySnapshot }) {
  const sc = snap.shortcut;
  const stamp = ttOfflineStamp(currentTermId.value);
  const rest = (s: string | null) => (s ? afterWord(s) : "");
  // a phone shows the cells as a sideways row: bring the "ตอนนี้" cell into view at once (no animation; only when it changes)
  const cellsRef = useRef<HTMLOListElement>(null);
  const liveIdx = snap.cells.findIndex((c) => c.live);
  useEffect(() => {
    const ol = cellsRef.current;
    const live = ol?.querySelector<HTMLElement>(".hmt-cell.live");
    const from = (live?.previousElementSibling as HTMLElement | null) ?? live; // keep the cell before "ตอนนี้" in view too
    if (ol && from && ol.scrollWidth > ol.clientWidth + 1) ol.scrollLeft = Math.max(0, from.offsetLeft - 4);
  }, [liveIdx]);
  return (
    <section class="hmt" aria-label="ตารางสอนวันนี้" data-tt-strip>
      {/* one row on a wide strip: now/next text · the period cells · the shortcuts (≤ 56px, ux.md S6); wraps on narrower widths */}
      <div class="hmt-in">
        <p class="hmt-t">
          {snap.now && <span class="hmt-l" data-line="now"><span class="hmt-tag now">{MSG.nowWord}</span>{rest(snap.nowText)}</span>}
          {snap.next && <span class="hmt-l" data-line="next"><span class="hmt-tag next">{MSG.nextWord}</span>{rest(snap.nextText)}</span>}
          {stamp && <span class="hmt-l"><span class="hmt-tag off"><Icon name="wifi-off" size={14} />{stamp}</span></span>}
        </p>
        {snap.cells.length > 0 && <ol ref={cellsRef} class="hmt-cells" aria-label="คาบของวันนี้">{snap.cells.map((c, i) => <Cell key={`${c.type}${c.period ?? c.start}${i}`} c={c} />)}</ol>}
        <div class="hmt-a">
          {sc && <button type="button" class="hmt-btn primary" onClick={() => navigate("/attendance", { class: sc.classId })}><Icon name="user-check" size={20} />{sc.attendanceLabel}</button>}
          {/* a wide strip shows the secondary shortcuts as buttons; a narrower one keeps them in the ⋯ menu (CSS picks one; ux.md S6) */}
          {sc && <button type="button" class="hmt-btn hmt-sec" onClick={() => navigate("/scan", { class: sc.classId })}><Icon name="scan" size={20} />{sc.scanLabel}</button>}
          <button type="button" class={`hmt-btn ghost${sc ? " hmt-sec" : ""}`} onClick={() => navigate("/timetable")}>{MSG.stripOpenWeek}<Icon name="chevron-right" size={16} /></button>
          {sc && <MoreMenu scanLabel={sc.scanLabel} onScan={() => navigate("/scan", { class: sc.classId })} />}
        </div>
      </div>
      {/* polite: said when the minute changes what "now" is; never moves the focus */}
      <span class="sr-only" role="status" aria-live="polite">{snap.announcement}</span>
    </section>
  );
}

/** The ⋯ button + menu with the secondary shortcuts (scan, the whole week) on a narrower strip. ↑ ↓ Home End Esc; focus returns. */
function MoreMenu({ scanLabel, onScan }: { scanLabel: string; onScan: () => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  const close = () => { btn.current?.focus(); setOpen(false); }; // Esc / a choice: focus goes back to ⋯ before the menu unmounts
  const run = (fn: () => void) => () => { close(); fn(); };
  return (
    <div class="hmt-more" ref={box} onFocusOut={(e) => { const to = e.relatedTarget as Node | null; if (open && to && !box.current?.contains(to)) setOpen(false); }}>
      <button ref={btn} type="button" class="hmt-btn hmt-dots" aria-label="ทางลัดเพิ่มเติม" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="dots-three" size={22} />
      </button>
      {open && (
        <div class="hmt-menu" role="menu" aria-label="ทางลัดเพิ่มเติม" ref={focusFirstItem} onKeyDown={menuKeys(close)}>
          <button type="button" role="menuitem" onClick={run(onScan)}><Icon name="scan" size={20} />{scanLabel}</button>
          <button type="button" role="menuitem" onClick={run(() => navigate("/timetable"))}><Icon name="chevron-right" size={20} />{MSG.stripOpenWeek}</button>
        </div>
      )}
    </div>
  );
}

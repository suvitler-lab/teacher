import { useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";
import { Icon } from "./Icon";
import {
  edgeState, fitsAll, minimapScrollFor, minimapWindow,
  type ColumnPrefs, type ScrollInfo, type Segment,
} from "../lib/gbColumns";

const EMPTY: ScrollInfo = { scrollLeft: 0, clientWidth: 0, scrollWidth: 0, nameW: 0, totW: 0 };

/** Where the gradebook frame is scrolled, re-read on scroll, resize and whenever the columns change (`sig`). */
export function useScrollInfo(ref: RefObject<HTMLElement>, active: boolean, sig: string): ScrollInfo {
  const [info, setInfo] = useState<ScrollInfo>(EMPTY);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const measure = () => {
      const next: ScrollInfo = {
        scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
        nameW: (el.querySelector("th.name-col") as HTMLElement | null)?.offsetWidth ?? 0,
        totW: (el.querySelector("thead th.tot-col") as HTMLElement | null)?.offsetWidth ?? 0,
      };
      setInfo((prev) => (prev.scrollLeft === next.scrollLeft && prev.clientWidth === next.clientWidth && prev.scrollWidth === next.scrollWidth
        && prev.nameW === next.nameW && prev.totW === next.totW ? prev : next));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (ro) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    return () => { el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); ro?.disconnect(); };
  }, [active, sig]);
  return info;
}

/** Scroll the frame to `left`; jumps glide unless the device asks for less motion. */
export function scrollFrameTo(el: HTMLElement, left: number, smooth: boolean) {
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: smooth && !reduce ? "smooth" : "auto" });
  else el.scrollLeft = left;
}

const TINT = (c: string) => `var(--tint-${c}-fg)`;

/** Minimap: one stripe per drawn column in its type colour + a frame for what is on screen. Tap / drag to move the table. */
export function MiniMap({ info, segments, scrollRef }: { info: ScrollInfo; segments: Segment[]; scrollRef: RefObject<HTMLElement> }) {
  const track = useRef<HTMLDivElement | null>(null);
  const infoRef = useRef(info);
  infoRef.current = info;
  const drag = useRef(false);
  // stable ref callback, also told when the minimap goes away: a drag cut short (rotate, columns now fit) must not leave snapping off
  const setTrack = useRef((el: HTMLDivElement | null) => { track.current = el; if (!el && drag.current) { drag.current = false; if (scrollRef.current) scrollRef.current.style.scrollSnapType = ""; } }).current;
  const win = minimapWindow(info);
  const pct = Math.round(win.left / Math.max(0.0001, 1 - win.width) * 100) || 0;

  function moveTo(clientX: number) {
    const t = track.current, sc = scrollRef.current;
    if (!t || !sc) return;
    const r = t.getBoundingClientRect();
    sc.scrollLeft = minimapScrollFor((clientX - r.left) / Math.max(1, r.width), infoRef.current);
  }
  function release(e: PointerEvent) {
    if (!drag.current) return;
    drag.current = false;
    if (scrollRef.current) scrollRef.current.style.scrollSnapType = ""; // snapping settles on the nearest column
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }
  function onKey(e: KeyboardEvent) {
    const sc = scrollRef.current;
    if (!sc) return;
    const colW = (sc.querySelector("th.col-w") as HTMLElement | null)?.offsetWidth ?? 120;
    const max = sc.scrollWidth - sc.clientWidth;
    let to: number | null = null;
    if (e.key === "ArrowLeft") to = sc.scrollLeft - colW;
    else if (e.key === "ArrowRight") to = sc.scrollLeft + colW;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = max;
    if (to == null) return;
    e.preventDefault();
    scrollFrameTo(sc, Math.min(max, Math.max(0, to)), true);
  }
  return (
    <div class="gb-mini" ref={setTrack} role="slider"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`เลื่อนมา ${pct}%`}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        drag.current = true;
        if (scrollRef.current) scrollRef.current.style.scrollSnapType = "none"; // follow the finger exactly while dragging
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => { if (drag.current) moveTo(e.clientX); }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      {segments.map((s) => <i key={s.key} title={s.label} style={`background:${TINT(s.color)}`} />)}
      <div class="gb-mini-win" style={`left:${win.left * 100}%;width:${win.width * 100}%`} />
    </div>
  );
}

/** "เลื่อนดู": the minimap and one jump button per type that has a column on screen. Not drawn when every column fits. */
export function GradebookNav({ info, segments, jumps, onJump, scrollRef }: {
  info: ScrollInfo; segments: Segment[]; scrollRef: RefObject<HTMLElement>;
  jumps: { typeKey: string; name: string; color: string }[]; onJump: (typeKey: string) => void;
}) {
  if (fitsAll(info) || segments.length === 0) return null;
  return (
    <div class="gb-nav">
      <span class="gb-nav-lbl">เลื่อนดู</span>
      <MiniMap info={info} segments={segments} scrollRef={scrollRef} />
      {jumps.map((j) => (
        <button type="button" class="gb-jump" aria-label={`ไปที่${j.name}`} data-jump={j.typeKey} style={`color:${TINT(j.color)}`} onClick={() => onJump(j.typeKey)}>{j.name}</button>
      ))}
    </div>
  );
}

/** Edge shadows class for the frame: more to the left / right. */
export function edgeClass(info: ScrollInfo): string {
  const e = edgeState(info);
  return (e.left ? " can-l" : "") + (e.right ? " can-r" : "");
}

/** The "คอลัมน์ (n/N)" button and its panel. Esc closes and gives the focus back to the button. */
export function ColumnsMenu({ prefs, types, hidden, shown, total, onToggleType, onTotal, onBars }: {
  prefs: ColumnPrefs; types: { key: string; name: string; color: string; count: number }[]; hidden: Set<string>;
  shown: number; total: number; onToggleType: (key: string) => void; onTotal: () => void; onBars: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };
  useEffect(() => { if (open) (panel.current?.querySelector("button[role=checkbox]") as HTMLElement | null)?.focus(); }, [open]);
  const lastShown = types.filter((t) => !hidden.has(t.key)).length <= 1;
  return (
    <div class="gb-cols-wrap" onKeyDown={(e) => { if (open && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}>
      <button type="button" ref={btn} class="gb-cols-btn" aria-expanded={open} aria-controls="gb-colmenu-panel" onClick={() => (open ? close() : setOpen(true))}>
        <Icon name="columns-3" size={16} /> คอลัมน์ ({shown}/{total})
      </button>
      {open && (
        <>
          <div style="position:fixed;inset:0;z-index:39" onClick={() => setOpen(false)} />
          <div id="gb-colmenu-panel" class="gb-menu gb-colmenu" role="group" aria-label={`แสดงคอลัมน์ (${shown} จาก ${total})`} ref={panel}>
            <b class="gb-colmenu-h">แสดงคอลัมน์ ({shown} จาก {total})</b>
            {types.map((t) => {
              const on = !hidden.has(t.key);
              return (
                <button type="button" role="checkbox" aria-checked={on} aria-disabled={on && lastShown} onClick={() => { if (!(on && lastShown)) onToggleType(t.key); }}>
                  <Icon name={on ? "square-check" : "square"} size={18} />
                  <span class="gb-colmenu-dot" style={`background:${TINT(t.color)}`} />
                  <span class="grow">{t.name}</span><span class="muted">{t.count} งาน</span>
                </button>
              );
            })}
            <div class="gb-menu-sep" role="separator" />
            <button type="button" role="checkbox" aria-checked={prefs.showTotal} onClick={onTotal}>
              <Icon name={prefs.showTotal ? "square-check" : "square"} size={18} /> <span class="grow">คอลัมน์สะสม</span>
            </button>
            <button type="button" role="checkbox" aria-checked={prefs.showBars} onClick={onBars}>
              <Icon name={prefs.showBars ? "square-check" : "square"} size={18} /> <span class="grow">แถบความคืบหน้าที่หัวคอลัมน์</span>
            </button>
            <p class="gb-colmenu-note">สะสมคิดรวมทุกงาน แม้ซ่อนบางคอลัมน์</p>
            <button type="button" class="primary" style="justify-content:center" onClick={close}>ตกลง</button>
          </div>
        </>
      )}
    </div>
  );
}

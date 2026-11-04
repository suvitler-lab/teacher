import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
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
  useLayoutEffect(() => { // measured before the first paint: the bar never shows an empty position first
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

/**
 * What the PAGE needs to know about the scroll position: more to the left / right (edge shadows) and whether every
 * column fits. It is a small string, so scrolling re-renders the page only when one of those three answers changes —
 * not on every scroll event (the whole table would be drawn again each time). The minimap reads the full position itself.
 */
export function useScrollFlags(ref: RefObject<HTMLElement>, active: boolean, sig: string): string {
  const [flags, setFlags] = useState("000");
  // First read happens in a layout effect: the frame is measured right after it is drawn and before the browser paints,
  // so the one follow-up draw (edge shadows / "everything fits") is not seen as a second paint. Equal flags never redraw.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const measure = () => {
      const e = edgeState({ scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, nameW: 0, totW: 0 });
      const next = `${e.left ? 1 : 0}${e.right ? 1 : 0}${fitsAll({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }) ? 1 : 0}`;
      setFlags((prev) => (prev === next ? prev : next));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (ro) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    return () => { el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); ro?.disconnect(); };
  }, [active, sig]);
  return flags;
}
export const flagsFit = (flags: string) => flags[2] === "1";
export const edgeClassOf = (flags: string) => (flags[0] === "1" ? " can-l" : "") + (flags[1] === "1" ? " can-r" : "");

/** Scroll the frame to `left`; jumps glide unless the device asks for less motion. */
export function scrollFrameTo(el: HTMLElement, left: number, smooth: boolean) {
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: smooth && !reduce ? "smooth" : "auto" });
  else el.scrollLeft = left;
}

const TINT = (c: string) => `var(--tint-${c}-fg)`;

/** The shape that goes with a work-type colour (circle, square, triangle, diamond, star, hexagon, cross): a type is never told by colour alone. */
const SHAPES: Record<string, string> = {
  violet: '<circle cx="6" cy="6" r="5.5"/>',
  blue: '<rect x="1" y="1" width="10" height="10" rx="1.5"/>',
  orange: '<path d="M6 .5 11.5 11h-11z"/>',
  green: '<path d="M6 .3 11.7 6 6 11.7.3 6z"/>',
  magenta: '<path d="M6 .4l1.6 3.8 4 .3-3.1 2.6 1 4L6 8.9 2.5 11l1-4L.4 4.5l4-.3z"/>',
  aqua: '<path d="M3.2 1.1h5.6L11.6 6 8.8 10.9H3.2L.4 6z"/>',
  red: '<path d="M4.2.8h3.6v3.4h3.4v3.6H7.8v3.4H4.2V7.8H.8V4.2h3.4z"/>',
};
export function TypeShape({ color, class: cls }: { color: string; class?: string }) {
  return <svg class={"tshape" + (cls ? " " + cls : "")} viewBox="0 0 12 12" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: SHAPES[color] ?? SHAPES.violet }} />;
}

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
export function GradebookNav({ sig, segments, jumps, onJump, scrollRef }: {
  sig: string; segments: Segment[]; scrollRef: RefObject<HTMLElement>;
  jumps: { typeKey: string; name: string; color: string }[]; onJump: (typeKey: string) => void;
}) {
  // the full scroll position lives HERE, so a scroll re-draws this small bar and not the whole table
  const info = useScrollInfo(scrollRef, true, sig);
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

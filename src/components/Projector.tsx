import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import "../styles/projector.css";
import { Icon } from "./Icon";
import { navigate } from "../router";
import { online } from "../lib/outbox";
import { serverReachable } from "../lib/session";
import {
  projectorOn, pjTheme, pjSize, pjHint, pjHideNames, setPjHideNames, setPjTheme, setPjSize, startProjector, exitProjector, PJ_HOLD_MS,
  type PjSize,
} from "../lib/projector";

const PAGES = [
  { path: "/scan", title: "สแกนส่งงาน", icon: "scan" },
  { path: "/attendance", title: "เช็คชื่อ", icon: "user-check" },
  { path: "/random", title: "สุ่มชื่อ", icon: "dice-3" },
  { path: "/reports", title: "รายงาน", icon: "chart-bar" },
] as const;

/** The button in a page header: choose the look, then start. */
export function ProjectorButton() {
  const [open, setOpen] = useState(false);
  return (
    <span class="pj-pre-wrap" style="position:relative">
      <button aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name="presentation" size={18} /> <span class="att-hide-sm">โหมดฉายจอ</span></button>
      {open && (
        <>
          <div style="position:fixed;inset:0;z-index:29" onClick={() => setOpen(false)} />
          <div class="gb-menu pjpre" role="dialog" aria-label="ตั้งค่าโหมดฉายจอ" style="right:0;left:auto;z-index:30">
            <div class="page-sub">ธีมหน้าจอ</div>
            <div class="row" style="gap:6px">
              <button class={pjTheme.value === "dark" ? "primary" : ""} aria-pressed={pjTheme.value === "dark"} onClick={() => setPjTheme("dark")}>เข้ม</button>
              <button class={pjTheme.value === "light" ? "primary" : ""} aria-pressed={pjTheme.value === "light"} onClick={() => setPjTheme("light")}>สว่าง</button>
            </div>
            <div class="page-sub">ขนาดตัวอักษร</div>
            <div class="row" style="gap:6px">
              {([[1, "มาตรฐาน"], [2, "ใหญ่"], [3, "ใหญ่มาก"]] as [PjSize, string][]).map(([n, l]) => (
                <button class={pjSize.value === n ? "primary" : ""} aria-pressed={pjSize.value === n} onClick={() => setPjSize(n)}>{l}</button>
              ))}
            </div>
            <label class="rnd-opt" style="margin:0"><input type="checkbox" checked={pjHideNames.value} onChange={(e) => setPjHideNames((e.target as HTMLInputElement).checked)} /> ซ่อนชื่อเด็กบนจอ</label>
            <button class="primary" onClick={() => { setOpen(false); startProjector(); }}><Icon name="presentation" size={18} /> เริ่มฉายจอ</button>
            <div class="page-sub">คะแนนและเปอร์เซ็นต์รายคนจะถูกซ่อน · กดค้างปุ่ม × 1 วินาทีเพื่อออก</div>
          </div>
        </>
      )}
    </span>
  );
}

/**
 * The full-screen frame of projector mode, the same for every page: title, "กำลังฉายจอ", the exit button
 * (hold one second, or Esc), a way to the other projector pages, and the page's own body in between.
 */
export function ProjectorShell({ page, children }: { page: "scan" | "attendance" | "random" | "reports"; children: ComponentChildren }) {
  const cur = PAGES.find((p) => p.path === "/" + page)!;
  const [other, setOther] = useState(false);
  const [p, setP] = useState(0);
  const hold = useRef<{ raf: number; t0: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const up = online.value && serverReachable.value;

  function stop(short: boolean) {
    if (!hold.current) return;
    cancelAnimationFrame(hold.current.raf);
    hold.current = null; setP(0);
    if (short) { pjHint.value = true; setTimeout(() => { pjHint.value = false; }, 3000); }
  }
  function begin() {
    stop(false);
    const t0 = performance.now();
    const step = () => {
      const pct = Math.min(100, ((performance.now() - t0) / PJ_HOLD_MS) * 100);
      setP(pct);
      if (pct >= 100) { hold.current = null; exitProjector(); return; }
      hold.current = { raf: requestAnimationFrame(step), t0 };
    };
    hold.current = { raf: requestAnimationFrame(step), t0 };
  }
  // the page behind the TV view still holds names and scores: nothing outside this view can be tabbed to or read by a screen reader
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const me = root.current;
    if (!me) return;
    const opener = document.activeElement as HTMLElement | null;
    const marked: Element[] = [];
    for (let node: Element = me; node.parentElement; node = node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib !== node && !sib.hasAttribute("inert") && sib.tagName !== "SCRIPT") { sib.setAttribute("inert", ""); sib.setAttribute("aria-hidden", "true"); marked.push(sib); }
      }
    }
    // focus moves into the TV view (its frame, not a button: a scanner's Enter must not press "×"); back to the opener on leaving
    me.focus({ preventScroll: true });
    return () => {
      for (const el of marked) { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") exitProjector(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div class="pj" ref={root} tabIndex={-1} data-th={pjTheme.value} data-sz={pjSize.value} role="region" aria-label={`โหมดฉายจอ: ${cur.title}`}>
      <div class="pjbar">
        <h1><Icon name={cur.icon} size={44} />{cur.title}</h1>
        <div class="row" style="gap:16px">
          {!up && <span class="pj-off" role="status" aria-label="ออฟไลน์"><Icon name="wifi-off" size={32} /></span>}
          <span class="live" role="status"><i />กำลังฉายจอ</span>
          <button ref={btn} class="exit" aria-label="ออกจากโหมดฉายจอ — กดค้าง 1 วินาที" style={`--p:${p}`}
            onPointerDown={begin} onPointerUp={() => stop(true)} onPointerCancel={() => stop(false)} onPointerLeave={() => stop(false)}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); begin(); } }}
            onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(true); }}>
            <Icon name="x" size={34} />
          </button>
        </div>
      </div>
      {pjHint.value && <div class="hint" role="status">กดค้างเพื่อออกจากโหมดฉายจอ</div>}
      <div class="body">{children}</div>
      <div class="other">
        {other && (
          <div class="menu4" role="menu">
            {PAGES.filter((x) => x.path !== "/" + page).map((x) => (
              <button role="menuitem" onClick={() => { setOther(false); navigate(x.path); }}><Icon name={x.icon} size={32} />{x.title}</button>
            ))}
            <button role="menuitem" onClick={() => exitProjector()}><Icon name="x" size={32} />ออกจากโหมดฉายจอ</button>
          </div>
        )}
        <button class="pjbtn sec" aria-expanded={other} onClick={() => setOther((v) => !v)} style="height:calc(var(--pj-u)*64);font-size:calc(var(--pj-u)*26)"><Icon name="arrow-right" size={30} />ไปหน้าอื่น</button>
      </div>
    </div>
  );
}

export { projectorOn };

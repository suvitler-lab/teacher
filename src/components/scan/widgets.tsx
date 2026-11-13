import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../../components/Icon";
import { isCoarse } from "../../lib/display";
import { scannerReady, focusScan, hidTestOn, hidLog } from "./state";

/** True below the width where the page falls back to one column (iPad upright, phone). */
export function useNarrow(bp = 999): boolean {
  const q = `(max-width: ${bp}px)`;
  const get = () => (typeof matchMedia === "function" ? matchMedia(q).matches : typeof window !== "undefined" && window.innerWidth <= bp);
  const [n, setN] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q);
    const on = () => setN(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [q]);
  return n;
}

/** A progress ring with the count inside. `size` 56 in the seat-grid head, 120 on the summary. */
export function Ring({ value, total, size, label, big }: { value: number; total: number; size: number; label?: string; big?: boolean }) {
  const stroke = size < 80 ? 6 : 8;
  const r = size / 2 - stroke / 2 - 1;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div class="pring" style={`width:${size}px;height:${size}px`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" stroke-width={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-success)" stroke-width={stroke}
          stroke-linecap="round" stroke-dasharray={`${circ * pct} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div class="cap">
        <span style={`font-size:${big ? "1.6rem" : "var(--fs-xs)"};font-weight:600;font-variant-numeric:tabular-nums`}>{value}/{total}</span>
        {label && <span style="font-size:var(--fs-xs);color:var(--text-secondary)">{label}</span>}
      </div>
    </div>
  );
}

/**
 * A button that opens a small menu under it. Esc or a tap outside closes it and gives the focus back to the button;
 * choosing something calls `done()`, which closes it and sends the focus to the scan field (P-2).
 */
export function PopMenu({ button, role = "menu", label, children, right }: {
  button: (p: { open: boolean; toggle: () => void; ref: { current: HTMLButtonElement | null } }) => ComponentChildren;
  role?: "menu" | "dialog"; label?: string; right?: boolean;
  children: (done: () => void) => ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };
  const done = () => { setOpen(false); if (isCoarse()) btn.current?.focus(); else focusScan(); };
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", key, true);
    box.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => document.removeEventListener("keydown", key, true);
  }, [open]);
  return (
    <span class="sc-menu">
      {button({ open, toggle: () => setOpen((v) => !v), ref: btn })}
      {open && (
        <>
          <div class="sc-menu-back" onClick={close} />
          <div class={"sc-pop" + (right ? " right" : "")} role={role} aria-label={label} ref={box}>{children(done)}</div>
        </>
      )}
    </span>
  );
}

export function HidBadge() {
  const ready = scannerReady.value;
  return (
    <>
      <span class={"sc-chip " + (ready ? "success" : "warning")}>
        <Icon name={ready ? "circle-check" : "hand-click"} size={16} />
        {ready ? "เครื่องยิงพร้อม" : "คลิกหน้านี้ก่อนยิง"}
      </span>
      <button class="sc-chip muted btn" aria-pressed={hidTestOn.value} onClick={() => { hidTestOn.value = !hidTestOn.value; hidLog.value = []; if (!hidTestOn.value) focusScan(); }}>ทดสอบ</button>
    </>
  );
}

export function HidTestPanel() {
  return (
    <section class="card sc-hidtest" aria-labelledby="sc-hidtest-h">
      <div class="row" style="justify-content:space-between;gap:8px">
        <h2 id="sc-hidtest-h" class="sc-h2"><Icon name="barcode" size={20} /> ทดสอบเครื่องยิง</h2>
        <button class="ghost" onClick={() => { hidTestOn.value = false; hidLog.value = []; focusScan(); }}>เสร็จ</button>
      </div>
      <div class="page-sub" role="status">ยิงบัตรใบไหนก็ได้ ระบบจะบอกว่าอ่านได้ไหม — <b>ไม่บันทึกการส่งงาน</b></div>
      {hidLog.value.length === 0
        ? <div class="sc-hidwait">รอการยิง…</div>
        : hidLog.value.map((r) => (
          <div class={"sc-hidrow " + (r.ok ? "ok" : "bad")}>
            <Icon name={r.ok ? "circle-check" : "x"} size={16} />
            <span class="grow"><span class="mono">{r.raw.slice(0, 16)}</span>{r.who ? ` → ${r.who}` : " — ไม่พบ"}</span>
          </div>
        ))}
    </section>
  );
}

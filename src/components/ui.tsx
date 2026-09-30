import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import "../styles/ui.css";
import { Icon } from "./Icon";
import type { WorkState } from "@shared/metrics";
import type { Student } from "@shared/types";
import { initials } from "../lib/names";
import { terms, selectedTermId, setSelectedTerm, UNASSIGNED, viewingPastYear, viewTerm, currentTermId } from "../store";
import { online, syncing, pendingCount } from "../lib/outbox";
import { thaiMonthsFull } from "../lib/dates";

// ---- viewport hook -------------------------------------------------------
export function useIsPhone(bp = 720): boolean {
  const [phone, setPhone] = useState(typeof window !== "undefined" && window.innerWidth <= bp);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp}px)`);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [bp]);
  return phone;
}

// ---- page header ---------------------------------------------------------
export function PageHeader({ icon, title, sub, actions }: {
  icon: string; title: string; sub?: ComponentChildren; actions?: ComponentChildren;
}) {
  return (
    <div class="uh">
      <div class="uh-l">
        <span class="uh-ic"><Icon name={icon} size={20} /></span>
        <div style="min-width:0">
          <div class="uh-title">{title}</div>
          {sub != null && <div class="uh-sub">{sub}</div>}
        </div>
      </div>
      {actions && <div class="uh-act">{actions}</div>}
    </div>
  );
}

// ---- class chips ---------------------------------------------------------
export interface ClassChipInfo { id: string; name: string; count?: number; mark?: "ok" | "part" | "todo" | null }
export function ClassChips({ items, value, onPick }: {
  items: ClassChipInfo[]; value: string; onPick: (id: string) => void;
}) {
  return (
    <div class="chips-row" role="tablist" aria-label="เลือกห้อง">
      {items.map((c) => (
        <button
          class={"pill" + (c.id === value ? " on" : "")}
          role="tab" aria-selected={c.id === value}
          onClick={() => onPick(c.id)}
        >
          {c.mark === "ok" && <Icon name="check" size={13} />}
          {c.mark === "part" && <Icon name="circle-half-2" size={13} style="color:var(--text-warning)" />}
          {c.mark === "todo" && <span class="dot" style="background:var(--fill-warning)" />}
          {c.name}
          {c.count != null && <span class="n">{c.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---- term picker (shared selected term) ----------------------------------
export function TermPicker() {
  const list = terms.value;
  if (list.length === 0) return null;
  return (
    <label class="pill" style="cursor:pointer;gap:5px">
      <Icon name="calendar-event" size={15} />
      <select
        value={selectedTermId.value ?? ""}
        onChange={(e) => setSelectedTerm((e.target as HTMLSelectElement).value)}
        style="border:none;background:transparent;height:auto;width:auto;padding:0;color:inherit;font-size:13px"
      >
        {list.map((t) => <option value={t.id}>{t.name}{t.is_current ? " · ปัจจุบัน" : ""}</option>)}
        <option value={UNASSIGNED}>ยังไม่ระบุเทอม</option>
      </select>
    </label>
  );
}

/**
 * Shown while the picker is on an earlier academic year: those are that year's classes and children
 * (the same-named classes of this year are different children), kept as they were.
 */
export function YearBanner({ note }: { note?: string }) {
  if (!viewingPastYear.value) return null;
  const t = viewTerm.value!;
  return (
    <div class="year-banner" role="status">
      <Icon name="history" size={16} />
      <span><b>ปีการศึกษา {t.year}</b> · ห้องและนักเรียนของปีนั้น · {note ?? "ยังแก้คะแนนย้อนหลังได้"}</span>
      <button class="ghost sm" onClick={() => setSelectedTerm(currentTermId.value)}>กลับไปปีนี้</button>
    </div>
  );
}

// ---- segmented control ---------------------------------------------------
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: ComponentChildren; disabled?: boolean }[];
  value: T; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button class={o.value === value ? "on" : ""} disabled={o.disabled} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- stat card -----------------------------------------------------------
const TONE_CLS: Record<string, string> = {
  accent: "background:var(--bg-accent);color:var(--text-accent)",
  success: "background:var(--bg-success);color:var(--text-success)",
  warning: "background:var(--bg-warning);color:var(--text-warning)",
  danger: "background:var(--bg-danger);color:var(--text-danger)",
};
export function StatCard({ label, value, unit, hint, icon, tone = "accent", valueTone, onClick }: {
  label: string; value: ComponentChildren; unit?: string; hint?: ComponentChildren;
  icon?: string; tone?: keyof typeof TONE_CLS; valueTone?: "danger" | "warning"; onClick?: () => void;
}) {
  const inner = (
    <>
      <div class="top">
        <span class="lbl">{label}</span>
        {icon && <span class="ic" style={TONE_CLS[tone]}><Icon name={icon} size={14} /></span>}
      </div>
      <div class="val" style={valueTone ? `color:var(--text-${valueTone})` : undefined}>{value}{unit && <small> {unit}</small>}</div>
      {hint != null && <div class="hint">{hint}</div>}
    </>
  );
  return onClick
    ? <button class="uc-stat" onClick={onClick}>{inner}</button>
    : <div class="uc-stat">{inner}</div>;
}

// ---- progress bar --------------------------------------------------------
export function ProgressBar({ pct, tone }: { pct: number; tone?: string }) {
  return <div class="pbar"><div style={`width:${Math.max(0, Math.min(100, pct))}%${tone ? `;background:${tone}` : ""}`} /></div>;
}

// ---- progress ring -------------------------------------------------------
export function ProgressRing({ value, total, size = 84, label }: { value: number; total: number; size?: number; label?: string }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? value / total : 0;
  return (
    <div class="pring" style={`width:${size}px;height:${size}px`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" stroke-width="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-success)" stroke-width="8"
          stroke-linecap="round" stroke-dasharray={`${circ * pct} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div class="cap">
        <span style="font-size:16px;font-weight:500;font-variant-numeric:tabular-nums">{value}/{total}</span>
        {label && <span style="font-size:11px;color:var(--text-secondary)">{label}</span>}
      </div>
    </div>
  );
}

// ---- stacked bar ---------------------------------------------------------
export function StackBar({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  return (
    <div class="stack">
      {segments.filter((s) => s.value > 0).map((s) => <i style={`flex:${s.value};background:${s.color}`} />)}
      {total === 1 && segments.every((s) => s.value === 0) && <i style="flex:1;background:var(--border)" />}
    </div>
  );
}

// ---- avatar --------------------------------------------------------------
export function Avatar({ student, text, size = 28, tone }: { student?: Student; text?: string; size?: number; tone?: "accent" }) {
  const label = text ?? (student ? initials(student) : "?");
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`
    + (tone === "accent" ? ";background:var(--fill-accent);color:var(--on-accent)" : "");
  return <span class="uc-av" style={style}>{label}</span>;
}

// ---- work-state cell -----------------------------------------------------
// `mark`: "unsaved" = NOT even saved on this device (storage refused) · "pend" = saved on this device, not on the
// server yet · "fail" = the server refused it
export function WorkCell({ state, score, mark, hidden }: { state: WorkState; score?: number | null; mark?: "pend" | "fail" | "unsaved" | null; hidden?: boolean }) {
  const m = mark ? " " + mark : "";
  const tip = mark === "pend" ? "รอส่งขึ้นระบบ" : mark === "fail" ? "ส่งไม่สำเร็จ" : mark === "unsaved" ? "ยังไม่ได้บันทึกลงเครื่อง — ลองใหม่" : undefined;
  // a hidden column keeps who-handed-in visible but not the marks themselves
  if (state === "scored" || state === "late") return <span class={"wcell " + state + m} title={hidden ? "ซ่อนคะแนนอยู่" : tip}>{hidden ? "•••" : score}</span>;
  if (state === "awaiting") return <span class={"wcell awaiting" + m} title={tip}><Icon name="check" size={14} /></span>;
  if (state === "missing") return <span class={"wcell missing" + m} title={tip}>–</span>;
  if (state === "excused") return <span class={"wcell excused" + m} title={tip}>ยกเว้น</span>;
  return <span class={"wcell pending" + m} title={tip}>·</span>;
}

// ---- empty state ---------------------------------------------------------
export function EmptyState({ icon = "inbox", text, action }: { icon?: string; text: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="uc-empty">
      <div class="ei"><Icon name={icon} size={30} /></div>
      <div>{text}</div>
      {action && <div style="margin-top:10px">{action}</div>}
    </div>
  );
}

// ---- load failed ---------------------------------------------------------
export function LoadError({ onRetry, text }: { onRetry: () => void; text?: string }) {
  return (
    <div class="card">
      <EmptyState icon="cloud-off"
        text={text ?? (online.value ? "โหลดข้อมูลไม่สำเร็จ" : "ออฟไลน์ — ยังไม่มีข้อมูลส่วนนี้ในเครื่อง")}
        action={<button onClick={onRetry}><Icon name="refresh" size={15} /> ลองอีกครั้ง</button>} />
    </div>
  );
}

// ---- drawer --------------------------------------------------------------
export function Drawer({ title, onClose, children }: { title: ComponentChildren; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="drawer-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="drawer" role="dialog" aria-label={typeof title === "string" ? title : "รายละเอียด"}>
        <div class="drawer-head">
          <div style="min-width:0">{title}</div>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose}><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- sync badge ----------------------------------------------------------
export function SyncBadge() {
  const cls = syncing.value ? "saving" : online.value ? "online" : "offline";
  const label = syncing.value ? "กำลังบันทึก" : online.value ? "ออนไลน์" : "ออฟไลน์";
  return (
    <span class={"sync " + cls}>
      <Icon name={syncing.value ? "loader-2" : online.value ? "cloud-check" : "cloud-off"} size={13} class={syncing.value ? "spin" : undefined} />
      {label}{pendingCount.value > 0 ? ` · ค้าง ${pendingCount.value}` : ""}
    </span>
  );
}

// ---- Thai date field -------------------------------------------------------
// <input type="date"> shows the browser's own format (month/day/year on an English browser). This shows
// day · month · Buddhist-era year, and still hands back the ISO date (YYYY-MM-DD) the rest of the app stores.
export function DateField({ value, onChange, label, style }: { value: string; onChange: (iso: string) => void; label?: string; style?: string }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [d, setD] = useState(m ? String(Number(m[3])) : "");
  const [mo, setMo] = useState(m ? String(Number(m[2])) : "");
  const [y, setY] = useState(m ? m[1] : "");
  // the value changed from outside (form reset, term picked): follow it
  useEffect(() => {
    const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (mm) { setD(String(Number(mm[3]))); setMo(String(Number(mm[2]))); setY(mm[1]); }
    else if (!value) { setD(""); setMo(""); setY(""); }
  }, [value]);

  function commit(nd: string, nm: string, ny: string) {
    setD(nd); setMo(nm); setY(ny);
    if (!nd && !nm && !ny) return onChange("");
    if (!nd || !nm || !ny) return; // wait until all three are chosen
    const last = new Date(Date.UTC(Number(ny), Number(nm), 0)).getUTCDate();
    const day = Math.min(Number(nd), last);
    if (day !== Number(nd)) setD(String(day));
    onChange(`${ny}-${nm.padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  const thisYear = new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear();
  const years: number[] = [];
  for (let i = thisYear - 3; i <= thisYear + 3; i++) years.push(i);
  if (y && !years.includes(Number(y))) years.push(Number(y)), years.sort((a, b) => a - b);
  const sel = "width:auto;height:auto;min-width:0";
  return (
    <span class="row" style={`gap:4px;flex-wrap:nowrap;${style ?? ""}`} role="group" aria-label={label}>
      <select aria-label="วัน" style={sel} value={d} onInput={(e) => commit((e.target as HTMLSelectElement).value, mo, y)}>
        <option value="">วัน</option>
        {Array.from({ length: 31 }, (_, i) => <option value={String(i + 1)}>{i + 1}</option>)}
      </select>
      <select aria-label="เดือน" style={sel} value={mo} onInput={(e) => commit(d, (e.target as HTMLSelectElement).value, y)}>
        <option value="">เดือน</option>
        {thaiMonthsFull.slice(1).map((n, i) => <option value={String(i + 1)}>{n}</option>)}
      </select>
      <select aria-label="ปี พ.ศ." style={sel} value={y} onInput={(e) => commit(d, mo, (e.target as HTMLSelectElement).value)}>
        <option value="">ปี</option>
        {years.map((yy) => <option value={String(yy)}>{yy + 543}</option>)}
      </select>
    </span>
  );
}

import type { ComponentChildren } from "preact";
import type { Student } from "@shared/types";
import { Icon } from "../Icon";
import { Segmented } from "../ui";
import { shortLabel, fullLabel, type RoundCounts } from "./model";

/** Round ring in the hero: drawn / can be drawn. A real progressbar only when there is something to count. */
export function RoundRing({ c, ready, size = 84 }: { c: RoundCounts; ready: boolean; size?: number }) {
  const r = size / 2 - 7, circ = 2 * Math.PI * r;
  const live = ready && c.N > 0;
  const frac = live ? (c.pct ?? 0) / 100 : 0;
  return (
    <div class="rnd-plate" style={`--sz:${size}px`}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" stroke-width="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-accent)" stroke-width="8" stroke-linecap="round"
          stroke-dasharray={`${circ * frac} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div class="rnd-rc" role={live ? "progressbar" : undefined} aria-label={live ? "สุ่มแล้วกี่คนในรอบนี้" : undefined}
        aria-valuemin={live ? 0 : undefined} aria-valuemax={live ? c.N : undefined} aria-valuenow={live ? c.n : undefined} aria-valuetext={live ? `${c.n} จาก ${c.N} คน` : undefined}>
        {c.full ? <Icon name="circle-check" size={30} /> : <b>{live ? c.n : "–"}</b>}
        {!c.full && <small>{live ? `/${c.N}` : ""}</small>}
      </div>
    </div>
  );
}

export interface HeroProps {
  room: string;
  mode: "pick" | "group";
  onMode: (m: "pick" | "group") => void;
  presentOnly: boolean;
  onPool: () => void;
  noRepeat: boolean;
  counts: RoundCounts;
  /** att.status === "ready" and the pool can be counted */
  ready: boolean;
  /** the pool size is really known (not loading / not checked / failed): otherwise the chip shows a dash, never a 0 */
  known: boolean;
  loading: boolean;
  came: string; // "41" or "–"
  total: number;
  offline: boolean;
}

export function RandomHero(p: HeroProps) {
  const { counts: c } = p;
  const dash = (v: number) => (p.ready ? String(v) : "–");
  return (
    <section class="rnd-hero" aria-label={`สุ่มชื่อ ${p.room}`} aria-busy={p.loading}>
      <div class="rnd-hero-t">
        <p class="rnd-kicker"><Icon name="dice-3" size={18} /> สุ่มชื่อ · {p.mode === "group" ? "จับกลุ่ม" : p.presentOnly ? "เฉพาะคนที่มาเรียนวันนี้" : "ทั้งห้อง"}</p>
        <h2 class="rnd-hero-h">{p.room}</h2>
      </div>
      <div class="rnd-stats" aria-live="off">
        <div class={"rnd-stat" + (p.loading ? " dim" : "")}><small>มาเรียน</small><span><b class="num">{p.came}</b> จาก {p.total}</span></div>
        {p.mode === "pick" ? (
          <div class={"rnd-stat" + (p.loading ? " dim" : "")}>
            <small>{c.full ? <><Icon name="circle-check" size={16} /> สุ่มครบทุกคนแล้ว</> : p.noRepeat ? "เหลือยังไม่ถูกสุ่ม" : "สุ่มซ้ำได้"}</small>
            <span><b class="num">{c.full ? `(${c.N})` : p.noRepeat ? dash(c.m) : "–"}</b></span>
          </div>
        ) : (
          <div class={"rnd-stat" + (p.loading ? " dim" : "")}><small>จับกลุ่มจาก</small><span><b class="num">{dash(c.N)}</b> คน</span></div>
        )}
      </div>
      {p.mode === "pick" && <RoundRing c={c} ready={p.ready} />}
      <div class="rnd-hero-p">
        <button class={"rnd-hp rnd-poolchip" + (p.presentOnly ? " on" : "")} aria-pressed={p.presentOnly} onClick={p.onPool}
          title="กดเพื่อสลับระหว่างเฉพาะคนที่มา กับทั้งห้อง">
          <Icon name="user-check" size={20} /> {p.presentOnly ? "เฉพาะคนที่มา" : "ทั้งห้อง"} ({p.known ? c.N : "–"})
        </button>
        {p.offline && <span class="rnd-hp info"><Icon name="wifi-off" size={18} /> ออฟไลน์</span>}
        <Segmented value={p.mode} label="โหมด" onChange={p.onMode} options={[
          { value: "pick", label: <><Icon name="user" size={18} /> สุ่มชื่อ</> },
          { value: "group", label: <><Icon name="users-group" size={18} /> จับกลุ่ม</> },
        ]} />
        {p.presentOnly && <span class="rnd-basis">นับจากเช็คชื่อรายวันของวันนี้ · เช็คชื่อรายคาบไม่นับ</span>}
      </div>
    </section>
  );
}

/** A read-only chip: number + short name (or the number alone while names are hidden). */
export function PersonChip({ s, hide, tone, children }: { s: Student; hide: boolean; tone?: "left" | "last" | "done"; children?: ComponentChildren }) {
  return (
    <span class={"rnd-chip" + (tone ? " " + tone : "")} title={fullLabel(s, hide)}>
      <span class="sr-only">เลขที่ </span><b>{s.number ?? "-"}</b>{!hide && <span class="nm">{shortLabel(s, hide)}</span>}{children}
    </span>
  );
}

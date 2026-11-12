import type { ComponentChildren } from "preact";
import { Icon } from "../Icon";
import { AttRing } from "./AttRing";

const LEG: [string, string, string][] = [["present", "check", "มา"], ["late", "clock", "สาย"], ["leave", "file-text", "ลา"], ["sick", "thermometer", "ป่วย"], ["absent", "x", "ขาด"]];

export interface AttHeroProps {
  room: string; dateText: string; counts: number[]; total: number; marked: number; unmarked: number; held: number;
  loading: boolean; scoped: boolean; showLegend?: boolean; children?: ComponentChildren;
}

/** The hero: room · day, "เช็คแล้ว n จาก N" (or the done / not-started wording), the status ring, and the controls (day, mode, save chip). */
export function AttHero(p: AttHeroProps) {
  const came = p.counts[0] + p.counts[1];
  const done = p.total > 0 && p.marked > 0 && p.unmarked === 0 && p.held === 0 && !p.loading;
  const count = p.loading
    ? <div class="att-count-b" aria-live="off"><small>กำลังโหลด…</small><span class="num">–</span><b>จาก {p.total} คน</b></div>
    : p.total === 0 ? <div class="att-count-b"><span class="num">0</span><b>คน</b><small>ห้องนี้ยังไม่มีนักเรียน</small></div>
    : done ? (
      <div class="att-done">
        <span class="att-done-ic" aria-hidden="true"><Icon name="circle-check" size={32} /></span>
        <div><p class="att-big">เช็คครบแล้ว · <span class="att-nw">มา {came} · ขาด {p.counts[4]}</span></p></div>
      </div>
    ) : p.marked === 0 && p.held === 0 ? <div class="att-count-b" aria-live="off"><small>ยังไม่ได้เช็ค ·</small><span class="num">{p.total}</span><b>คน</b></div>
    : <div class="att-count-b" aria-live="off"><small>เช็คแล้ว</small><span class="num">{p.marked}</span><b>จาก {p.total} คน</b></div>;
  return (
    <section class="att-hero" aria-label={`เช็คชื่อ ${p.room} ${p.dateText}`}>
      <div class="att-hero-t">
        <p class="att-kicker"><Icon name="user-check" size={18} /> เช็คชื่อ{p.scoped ? "รายคาบ" : "รายวัน"}</p>
        <h2 class="att-hero-h">{p.room} · {p.dateText}</h2>
      </div>
      {count}
      <AttRing counts={p.counts} total={p.total} marked={p.marked} unmarked={p.unmarked} held={p.held} loading={p.loading} size={88} />
      {p.showLegend && (
        <ul class="att-hleg" aria-hidden="true">
          {LEG.map(([, ic, w], i) => <li><Icon name={ic} size={14} /> {w} <b>{p.counts[i]}</b></li>)}
          <li><Icon name="circle-dashed" size={14} /> ยังไม่เช็ค <b>{p.unmarked}</b></li>
        </ul>
      )}
      <div class="att-pills">{p.children}</div>
    </section>
  );
}

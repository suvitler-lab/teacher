// Layout ก "วันนี้ของครู": hero with the big number, the day's list in the order of BR-01, and the side cards (AC-17..24).
// Everything comes from `props.model` (worked out once in Home.tsx / homeLogic.ts); this file only draws it.
import "../../../styles/home-a.css";
import { Icon } from "../../Icon";
import { Greeting } from "../Greeting";
import { QuickActions } from "../QuickActions";
import { ResumeScan } from "../Resume";
import { Chip } from "../shared";
import { navigate } from "../../../router";
import type { HomeLayoutProps } from "../meta";
import { Timeline } from "./Timeline";
import { SideCards } from "./Cards";
import { ScrollArea } from "./ScrollArea";

/** A picture only: no data in it (A5), so a screen reader skips it. Colours come from the theme's illustration tokens. */
function Illo() {
  return (
    <svg class="hma-illo" viewBox="0 0 120 96" aria-hidden="true" focusable="false">
      <circle cx="84" cy="30" r="20" fill="var(--illo-1)" />
      <rect x="14" y="40" width="64" height="44" rx="8" fill="var(--illo-4)" stroke="var(--illo-2)" stroke-width="3" />
      <path d="M26 56h40M26 68h26" stroke="var(--illo-2)" stroke-width="4" stroke-linecap="round" />
      <path d="M78 78l8 8 16-18" fill="none" stroke="var(--illo-3)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function LayoutA({ model, cards, hide, pastYear, openList, openCustomize }: HomeLayoutProps) {
  const { summary, stale, todayCount } = model;
  const att = summary.att;
  const clear = todayCount === 0;
  // the roll-call pill: "มา 92% · ยังเหลือ 1 ห้อง" (the figures of BR-04 as the model has them)
  const attText = att.pct != null ? `มาเรียน ${att.pct}% · ${att.headline}` : att.headline;
  const pill = (icon: string, text: string, label: string, go: () => void) => (
    <button type="button" class="hma-pill" aria-label={label} onClick={go}><Icon name={icon} size={18} />{text}<Icon name="chevron-right" size={16} /></button>
  );
  return (<>
    <section class="hma-hero" aria-label="สรุปวันนี้">
      <div class="hma-hero-t">
        <Greeting class="hma-greet" />
        {pastYear ? (
          <p class="hma-past">ดูข้อมูลของปีที่ผ่านมา · ไม่มีงานของวันนี้</p>
        ) : clear ? (
          <p class="hma-big"><span class="ck" aria-hidden="true"><Icon name="check-circle" size={44} /></span><span class="t">เคลียร์ครบแล้ว เยี่ยมมาก</span></p>
        ) : (
          <p class="hma-big"><span class="lead">ตอนนี้เหลือ</span><span class="num">{todayCount}</span><span class="t">อย่างที่ต้องทำวันนี้</span></p>
        )}
        <div class="hma-summary" role="group" aria-label="ตัวเลขสรุป">
          {/* R-3402: an earlier year has no "today" — no roll-call pill and no "due today" pill (same as layout ข) */}
          {!pastYear && pill("user-check", attText, `เช็คชื่อ ${attText} · ไปหน้าเช็คชื่อ`, () => navigate("/attendance"))}
          {!pastYear && pill("calendar-check", `ครบกำหนดวันนี้ ${summary.dueToday} งาน`, `ครบกำหนดวันนี้ ${summary.dueToday} งาน · ไปสมุดคะแนน`, () => navigate("/gradebook"))}
          {pill("hourglass-empty", `รอตรวจ ${summary.awaiting}`, `รอตรวจ ${summary.awaiting} ชิ้น เปิดรายการ`, () => openList("awaiting"))}
          {pill("alert-circle", `ค้างส่ง ${summary.missing}`, `ค้างส่ง ${summary.missing} ชิ้น เปิดรายการ`, () => openList("missing"))}
          {stale && <Chip tone="warning" icon="wifi-off">ข้อมูลเก่า</Chip>}
        </div>
      </div>
      <Illo />
    </section>
    {!pastYear && <ResumeScan />}
    <div class="hma-grid">
      <QuickActions class="hma-qs" />
      {pastYear ? (
        <section class="card hma-tl-wrap"><p class="page-sub">ปีเก่าไม่มีรายการของวันนี้ · ดูห้องและงานของปีนั้นได้จากการ์ดด้านข้าง</p></section>
      ) : <Timeline model={model} hide={hide} />}
      <ScrollArea tag="aside" wrap="hma-sidecol" class="hma-side" label="ภาพรวมห้อง">
        {cards.length === 0
          ? <section class="card hma-card"><p class="page-sub">ยังไม่ได้เปิดการ์ดใดไว้</p><button type="button" class="hma-btn" onClick={openCustomize}><Icon name="layout-grid" size={20} />ปรับหน้าหลัก</button></section>
          : <SideCards cards={cards} model={model} hide={hide} pastYear={pastYear} />}
      </ScrollArea>
    </div>
  </>);
}

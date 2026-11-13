import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../Icon";
import type { Student } from "@shared/types";
import { shortName } from "../../lib/names";
import { SCAN_CARD_META } from "../cards/meta";
import type { CardMeta } from "../cards/PageCardSettings";
import { scanHiding } from "./hide";

/** The scan page's cards for "ปรับการ์ด": the shared list plus "ยังไม่ส่ง" (AC-71, kept here because the shared list is another task's file) */
export const SCAN_META: Record<string, CardMeta> = {
  ...SCAN_CARD_META,
  unsent: { title: "ยังไม่ส่ง", icon: "user-question", desc: "ใครยังไม่ส่งงานนี้ (เลขที่ + ชื่อสั้น) — อ่านอย่างเดียว", fresh: true },
};
/** AC-71: what cannot be switched off */
export const SCAN_LOCKED_TEXT = "ช่องรับเลข · การ์ดผล · ตารางเลขที่ · ส่วนหัวของรอบ · ส่งไม่สำเร็จ · แถบวันที่รับ";

/** BR-14: how many places the unsent chips show before "และอีก n คน" (AC-66) */
export const UNSENT_MAX = 12;

/** A side-panel card whose head folds the body away on a narrow screen (iPad upright, phone): "ยังไม่ส่ง (15)". A wide screen always shows it. */
export function SideCard({ id, title, icon, count, unit, narrow, tone, children }: {
  id: string; title: string; icon: string; count: number | string; /** said after the number on a wide screen ("15 คน"); a narrow head is always "title (n)" */ unit?: string; narrow: boolean; tone?: "warning"; children: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const fold = narrow && !open;
  return (
    <section class={"card sc-side" + (tone ? " " + tone : "") + (fold ? " folded" : "")} aria-labelledby={id}>
      {narrow
        ? <h2 id={id} class="sc-h2"><button class="sc-foldbtn" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={icon} size={20} /> {title} ({count}) <Icon name={open ? "chevron-up" : "chevron-down"} size={16} /></button></h2>
        : <h2 id={id} class="sc-h2"><Icon name={icon} size={20} /> {title}{count === 0 ? "" : ` ${count}${unit ? " " + unit : ""}`}</h2>}
      {!fold && children}
    </section>
  );
}

/**
 * AC-66: who has not handed in yet — read only, not a queue (Q1): chips "เลขที่ ชื่อสั้น" in number order, at most 12, then
 * "และอีก n คน". `people` is already BR-14's group (not submitted, not excused), so it adds up with the grid.
 */
export function UnsentCard({ people, known, narrow }: { people: Student[]; known: boolean; narrow: boolean }) {
  if (!known) {
    return (
      <SideCard id="sc-unsent-h" title="ยังไม่ส่ง" icon="user-question" count="?" narrow={narrow}>
        <div class="sc-rempty">ยังไม่ทราบว่าใครส่งแล้วบ้าง</div>
      </SideCard>
    );
  }
  const hide = scanHiding();
  const sorted = [...people].sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
  const shown = sorted.slice(0, UNSENT_MAX);
  const more = sorted.length - shown.length;
  return (
    <SideCard id="sc-unsent-h" title="ยังไม่ส่ง" icon="user-question" count={sorted.length} unit="คน" narrow={narrow}>
      {sorted.length === 0
        ? <div class="sc-rempty sc-alldone"><Icon name="circle-check" size={18} /> ทุกคนส่งครบแล้ว</div>
        : (
          <ul class="sc-names sc-unsent" aria-label="นักเรียนที่ยังไม่ส่ง">
            {shown.map((st) => <li class="sc-chip muted dashed" key={st.id}>เลขที่ {st.number ?? "-"}{hide ? "" : ` ${shortName(st)}`}</li>)}
            {more > 0 && <li class="sc-more">และอีก {more} คน</li>}
          </ul>
        )}
    </SideCard>
  );
}

/** AC-67: what this device holds that the system does not yet — "รอส่งขึ้นระบบ n" (never "sync" / "queue") */
export function QueueCard({ people, narrow }: { people: Student[]; narrow: boolean }) {
  const hide = scanHiding();
  if (people.length === 0) return null;
  const sorted = [...people].sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
  return (
    <SideCard id="sc-queue-h" title="รอส่งขึ้นระบบ" icon="cloud-upload" count={sorted.length} narrow={narrow} tone="warning">
      <div class="page-sub">เก็บไว้ในเครื่องนี้แล้ว — ต่อเน็ตเมื่อไหร่ส่งเอง ไม่ต้องสแกนซ้ำ</div>
      <ul class="sc-names sc-unsent" aria-label="รายการที่รอส่งขึ้นระบบ">
        {sorted.slice(0, UNSENT_MAX).map((st) => <li class="sc-chip warning" key={st.id}><Icon name="cloud-upload" size={14} /> เลขที่ {st.number ?? "-"}{hide ? "" : ` ${shortName(st)}`}</li>)}
        {sorted.length > UNSENT_MAX && <li class="sc-more">และอีก {sorted.length - UNSENT_MAX} คน</li>}
      </ul>
    </SideCard>
  );
}

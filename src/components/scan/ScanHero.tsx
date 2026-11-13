import { Icon } from "../Icon";
import type { ComponentChildren } from "preact";
import type { ScanMode } from "@shared/types";
import { bkkToday } from "@shared/time";
import { percentOf } from "@shared/metrics";
import { activeClasses, subjectById, workTypeById } from "../../store";
import { syncing } from "../../lib/outbox";
import { ProjectorButton } from "../Projector";
import { projectorOn } from "../../lib/projector";
import { session, recvDate, activeAssignment, startSession, thaiShort, thaiDayMonth, dueWord, MODE_LABEL } from "./state";
import { PopMenu } from "./widgets";
import { ReceivedDateChip } from "./ScanParts";
import { HideButton } from "./hide";

/** AC-55: the ring in the hero — `role=img` with the numbers in its label; "ไม่ทราบ" while the hand-ins are not known (never 0 %) */
export function HeroRing({ done, of, known, size = 72 }: { done: number; of: number; known: boolean; size?: number }) {
  const stroke = 7;
  const r = size / 2 - stroke / 2 - 1;
  const circ = 2 * Math.PI * r;
  const pct = known ? percentOf(done, of) : null;
  const frac = pct == null ? 0 : Math.min(1, pct / 100);
  const label = known ? (pct == null ? `ส่งแล้ว ${done} จาก ${of} คน` : `ส่งแล้ว ${done} จาก ${of} คน ร้อยละ ${pct}`) : "ยังไม่ทราบว่าใครส่งแล้วบ้าง";
  return (
    <div class="sc-hring" role="img" aria-label={label} style={`width:${size}px;height:${size}px`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" stroke-width={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-success)" stroke-width={stroke}
          stroke-linecap="round" stroke-dasharray={`${circ * frac} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span class="cap" aria-hidden="true">{!known ? "ไม่ทราบ" : pct == null ? "—" : `${pct}%`}</span>
    </div>
  );
}

/**
 * The top of the round (AC-55): work title (two lines at most, `title` for the rest) · "รับแล้ว x จาก y คน" · ring · room ▾ ·
 * how to give scores ▾ · received day ▾ · due chip (BR-15) · online chip with "รอส่ง n" · reader badge. Same buttons and
 * destinations as the old header bar; only the look and the order changed.
 */
export function ScanHero({ x, y, known, up, waiting, hid, onEnd, onMode, onPrefs }: {
  x: number; y: number; known: boolean; up: boolean; /** children of this work + room with something not yet sent (BR-14) — the same number as the queue card and the grid legend */ waiting: number; hid: ComponentChildren;
  onEnd: () => void; onMode: (m: ScanMode) => void; onPrefs: () => void;
}) {
  const s = session.value!;
  const asg = activeAssignment.value;
  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const subj = subjectById(s.subjectId);
  const wt = workTypeById(asg?.type_id ?? null);
  const today = bkkToday();
  const back = !!recvDate.value;
  const left = asg?.due_date ? Math.round((Date.parse(asg.due_date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5) : null;
  const dueTone = left == null ? "" : left < 0 ? "danger" : left <= 1 ? "warning" : "muted";
  return (
    <header class={"ctxbar sc-hero" + (back ? " back" : "")} role="group" aria-label={back ? `กำลังรับงานย้อนหลัง · ${thaiShort(recvDate.value!)}` : "รอบสแกน"}>
      <HeroRing done={x} of={y} known={known} />
      <div class="hero-body">
        <div class="hero-top">
          <h1 class="t" title={asg?.title}>{asg?.title}</h1>
          {/* aria-live off: the number moves with every scan — the result card is what is announced */}
          <div class="hero-count" aria-live="off">{known ? <><b>รับแล้ว {x}</b> จาก {y} คน</> : <><b>รับแล้ว …</b> จาก … คน</>}</div>
          <span class="grow" />
          <div class="hero-acts">
            <button class="icon sc-cb" aria-label="ปรับการ์ด" onClick={onPrefs}><Icon name="layout-grid" size={20} /></button>
            <HideButton />
            <ProjectorButton />
            <button class="sc-cb strong hero-end" onClick={onEnd}><Icon name="player-stop" size={20} /> จบรอบ</button>
            {/* AC-78 phone: "จบรอบ" sits in the ⋯ menu of the bar (shown by css under 720px; the button above is hidden there) */}
            <span class="hero-more">
              <PopMenu label="เมนูเพิ่มเติม" right
                button={({ open, toggle, ref }) => <button class="icon sc-cb" ref={ref} aria-label="เมนูเพิ่มเติม" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon name="dots-vertical" size={20} /></button>}>
                {(done) => <button role="menuitem" onClick={() => { done(); onEnd(); }}><Icon name="player-stop" size={20} /> จบรอบ</button>}
              </PopMenu>
            </span>
          </div>
        </div>
        <div class="hero-pills">
          <PopMenu label="เปลี่ยนห้อง"
            button={({ open, toggle, ref }) => (
              <button class="sc-cb" ref={ref} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                <Icon name="users" size={16} /> {cls?.name} <Icon name="chevron-down" size={16} />
              </button>
            )}>
            {(done) => (
              <>
                <div class="hd">เปลี่ยนห้อง (งานเดียวกัน)</div>
                {(asg?.class_ids ?? [s.classId]).map((cid) => {
                  const c = activeClasses.value.find((z) => z.id === cid);
                  return <button role="menuitem" class={cid === s.classId ? "on" : ""} onClick={() => { done(); if (cid !== s.classId) startSession(s.assignmentId, cid, s.mode); }}>{c?.name ?? cid}</button>;
                })}
              </>
            )}
          </PopMenu>
          <PopMenu label="วิธีให้คะแนน"
            button={({ open, toggle, ref }) => (
              <button class="sc-cb" ref={ref} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                {back ? MODE_LABEL[s.mode] : `เต็ม ${s.fullScore} · ${MODE_LABEL[s.mode]}`} <Icon name="chevron-down" size={16} />
              </button>
            )}>
            {(done) => (
              <>
                <div class="hd">ใช้กับการสแกนครั้งถัดไป</div>
                {(["full", "type", "later"] as ScanMode[]).map((m) => (
                  <button role="menuitemradio" aria-checked={s.mode === m} class={s.mode === m ? "on" : ""} disabled={m === "type" && projectorOn.value}
                    onClick={() => { done(); onMode(m); }}>{MODE_LABEL[m]}{m === "type" && projectorOn.value ? " (ปิดระหว่างฉายจอ)" : ""}</button>
                ))}
              </>
            )}
          </PopMenu>
          <ReceivedDateChip assignedDate={asg?.assigned_date ?? null} />
          {asg?.due_date && <span class={"sc-chip " + dueTone}><Icon name="calendar-due" size={16} /> {dueWord(left)} · {thaiDayMonth(asg.due_date)}</span>}
          <span class={"sc-chip " + (up ? "success" : "warning")} role="status">
            <Icon name={up ? "cloud-check" : "cloud-off"} size={16} />
            {syncing.value ? "กำลังบันทึก" : up ? "ออนไลน์" : "ออฟไลน์"}{waiting > 0 ? ` · รอส่ง ${waiting}` : ""}
          </span>
          {hid}
          <span class="chips">
            {subj && <span class={"chip " + subj.color}>{subj.name}</span>}
            {wt && <span class={"chip " + wt.color}>{wt.name}</span>}
          </span>
        </div>
      </div>
    </header>
  );
}

// Layout ค "โฟกัสงานถัดไป": one job in a big box ("ถัดไป · 1 จาก 5"), the rest as "ต่อจากนี้", then the quick buttons and the tiles (AC-30..33).
// Everything comes from `props.model` (worked out once in Home.tsx / homeLogic.ts); this file only draws it and remembers, for this visit only,
// which row the teacher pulled up (AC-31). Nothing is saved and no API is called (BR-02): "ทำทีหลัง" goes through `onDefer`.
import { useEffect, useRef, useState } from "preact/hooks";
import "../../../styles/home-c.css";
import { Icon } from "../../Icon";
import { Greeting } from "../Greeting";
import { QuickActions } from "../QuickActions";
import { ResumeScan } from "../Resume";
import { navigate } from "../../../router";
import { runTodayGo } from "../model";
import { copyDueToLine } from "../today";
import type { TodayKind, TodayRow } from "../../../lib/homeLogic";
import type { HomeLayoutProps, HomeModel } from "../meta";
import { LEVEL_ICON, dueRoomBars, overdueText, roomChips } from "../a/logic";
import { NEXT_SHOWN, focusQueue, nextRows, pickFocus } from "./logic";
import { Tiles } from "./Tiles";
import { Bar } from "../shared";

const GO_ICON: Record<TodayKind, string> = {
  failed: "cloud-x", queue: "cloud-upload", room: "user-check", due: "scan", overdue: "list-checks", review: "clipboard-list", term: "calendar-event", backup: "database-export", tomorrow: "scan",
};

/** A picture only: no data in it (A5), so a screen reader skips it. Colours come from the theme's illustration tokens. */
function Illo() {
  return (
    <svg class="hmc-illo" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r="50" fill="var(--illo-4)" stroke="var(--illo-2)" stroke-width="4" />
      <circle cx="60" cy="60" r="32" fill="none" stroke="var(--illo-1)" stroke-width="6" />
      <circle cx="60" cy="60" r="14" fill="var(--illo-3)" />
      <path d="M60 60L100 20" stroke="var(--illo-2)" stroke-width="5" stroke-linecap="round" />
      <path d="M92 18l10 0 0 10" fill="none" stroke="var(--illo-2)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** What sits under the reason in the big box: roll-call chips, the per-room bars of a work, the late works (the same figures as the model). */
function Extra({ row, model }: { row: TodayRow; model: HomeModel }) {
  if (row.kind === "room") {
    return <div class="hmc-rooms">{roomChips(model.rooms).map((c) => (
      <span key={c.classId} class={"hmc-room-chip " + (c.ok ? "ok" : "no")}><Icon name={c.ok ? "circle-check" : "alert-circle"} size={16} />{c.text}</span>
    ))}</div>;
  }
  if (row.kind === "due" || row.kind === "tomorrow") {
    return <div class="hmc-bars">{dueRoomBars(model, row).map((b) => (
      <div class="hmc-bar" key={b.classId}><b>{b.name}</b><Bar pct={b.pct} tone="var(--hero-fg)" label={`${b.name} ส่งแล้ว ${b.fraction}`} /><span class="num">{b.fraction}</span></div>
    ))}</div>;
  }
  if (row.kind === "overdue" && row.overdue) {
    return <ul class="hmc-ov">{row.overdue.map((o) => <li key={o.assignmentId}><Icon name="calendar-x" size={16} />{overdueText(o)}</li>)}</ul>;
  }
  return null;
}

interface FocusProps { row: TodayRow; pos: number; total: number; model: HomeModel; hide: boolean; onSkip: () => void; headRef: { current: HTMLHeadingElement | null } }

function FocusBox({ row, pos, total, model, hide, onSkip, headRef }: FocusProps) {
  return (
    <section class="hmc-focus" aria-labelledby="hmc-f-h">
      <div class="hmc-f-main">
        <div class="hmc-step">
          <span>ถัดไป · {pos} จาก {total}</span>
          <span class="dots" aria-hidden="true">{Array.from({ length: total }, (_, i) => <i key={i} class={i + 1 === pos ? "on" : ""} />)}</span>
          {model.stale && <span class="hmc-tag"><Icon name="wifi-off" size={16} />ข้อมูลเก่า</span>}
        </div>
        <div class="hmc-f-ic" aria-hidden="true"><Icon name={row.icon} size={36} /></div>
        <h2 id="hmc-f-h" ref={headRef} tabIndex={-1} class="hmc-f-t" title={row.title}>{row.title}</h2>
        <p class="hmc-f-why"><span class="hmc-tag lv"><Icon name={LEVEL_ICON[row.level]} size={16} />{row.levelLabel}</span>{row.reason && <span>{row.reason}</span>}</p>
        <Extra row={row} model={model} />
        <div class="hmc-acts">
          <button type="button" class="hmc-btn primary" onClick={() => runTodayGo(row.primary.go)}><Icon name={GO_ICON[row.kind]} size={24} />{row.primary.label}</button>
          {/* one copy button per room; the model has already taken them out while names are hidden */}
          {!hide && row.due && row.secondary?.map((s) => (
            <button type="button" key={s.classId} class="hmc-btn" onClick={() => copyDueToLine(row.due!, s.classId)}><Icon name="copy" size={22} />{s.label}</button>
          ))}
          {row.overdue?.filter((o) => o.shouldClose).map((o) => (
            <button type="button" key={o.assignmentId} class="hmc-btn" aria-label={`ปิดรับงานนี้ ${o.title}`}
              onClick={() => navigate("/gradebook", { class: o.classId, subject: o.subjectId ?? undefined, asg: o.assignmentId })}><Icon name="lock" size={22} />ปิดรับงานนี้</button>
          ))}
          {total > 1 && (
            <button type="button" class="hmc-btn skip" aria-label={`ทำทีหลัง: ${row.title}`} onClick={onSkip}><Icon name="arrow-bend-down-right" size={22} />ทำทีหลัง</button>
          )}
        </div>
      </div>
      <Illo />
    </section>
  );
}

/** Nothing left to do (AC-32): no reset button; the quick buttons and tiles are still below. */
function ClearBox({ headRef, stale }: { headRef: FocusProps["headRef"]; stale: boolean }) {
  return (
    <section class="hmc-focus clear" aria-labelledby="hmc-f-h">
      <div class="hmc-f-main">
        {/* R-3603: "all clear" from an old copy must carry the same warning as the focus box */}
        <div class="hmc-step"><span>ไม่มีอะไรค้าง</span>{stale && <span class="hmc-tag"><Icon name="wifi-off" size={16} />ข้อมูลเก่า</span>}</div>
        <div class="hmc-f-ic" aria-hidden="true"><Icon name="check-circle" size={36} /></div>
        <h2 id="hmc-f-h" ref={headRef} tabIndex={-1} class="hmc-f-t">วันนี้เคลียร์ครบแล้ว</h2>
        <p class="hmc-f-why"><span>ไม่มีอะไรค้าง พักสักครู่ แล้วค่อยเตรียมงานพรุ่งนี้</span></p>
        <div class="hmc-acts">
          <button type="button" class="hmc-btn primary" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="plus-circle" size={24} />สร้างงานพรุ่งนี้</button>
        </div>
      </div>
      <Illo />
    </section>
  );
}

/** A past year has no "today": say so in the box where the job would stand. */
function PastBox() {
  return (
    <section class="hmc-focus clear" aria-labelledby="hmc-f-h">
      <div class="hmc-f-main">
        <h2 id="hmc-f-h" class="hmc-f-t">ดูข้อมูลของปีที่ผ่านมา</h2>
        <p class="hmc-f-why"><span>ไม่มีงานของวันนี้ · ดูห้องและงานของปีนั้นได้จากไทล์ด้านล่าง</span></p>
      </div>
      <Illo />
    </section>
  );
}

function NextList({ rows, tomorrow, onPick }: { rows: { row: TodayRow; pos: number }[]; tomorrow: TodayRow[]; onPick: (key: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, NEXT_SHOWN);
  const folded = rows.length - NEXT_SHOWN;
  // tomorrow's work is not counted: it stands here only when nothing else follows, or when the whole list is open
  const tail = rows.length === 0 || all ? tomorrow : [];
  return (
    <section class="hmc-next" aria-labelledby="hmc-n-h">
      <h2 id="hmc-n-h">ต่อจากนี้</h2>
      <ul class="hmc-nx-list">
        {shown.map(({ row, pos }) => (
          <li key={row.key}>
            <button type="button" class="hmc-nx" data-kind={row.kind} aria-label={`ทำ ${row.title} ก่อน`} onClick={() => onPick(row.key)}>
              <span class="k"><span aria-hidden="true">{pos}</span></span>
              <span class="t"><b class="clamp2" title={row.title}>{row.title}</b>{row.reason && <small class="clamp2">{row.reason}</small>}</span>
              <Icon name="chevron-right" size={18} />
            </button>
          </li>
        ))}
        {tail.map((row) => (
          <li key={row.key}>
            <div class="hmc-nx later" data-kind="tomorrow">
              <span class="k"><Icon name="calendar-blank" size={18} /></span>
              <span class="t"><b class="clamp2" title={row.title}>พรุ่งนี้: {row.title}</b><small>ไม่นับในงานของวันนี้</small></span>
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && tomorrow.length === 0 && <p class="page-sub">ไม่มีงานต่อ</p>}
      {folded > 0 && (
        <button type="button" class="hmc-more" aria-expanded={all} onClick={() => setAll(!all)}>
          <Icon name={all ? "chevron-up" : "chevron-down"} size={18} />{all ? "ซ่อนรายการ" : `ดูทั้งหมด (${rows.length + 1})`}
        </button>
      )}
    </section>
  );
}

export function LayoutC({ model, cards, hide, pastYear, onDefer, openCustomize }: HomeLayoutProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const moved = useRef(0);
  const headRef = useRef<HTMLHeadingElement | null>(null);
  const [moveTick, setMoveTick] = useState(0);
  // after a row is pulled up the row the teacher tapped is gone from the list: bring the keyboard to the box, not to the top of the page
  useEffect(() => { if (moveTick !== moved.current) { moved.current = moveTick; headRef.current?.focus(); } }, [moveTick]);

  const queue = pastYear ? [] : focusQueue(model.todo);
  const focus = pickFocus(queue, picked);
  const pos = focus ? queue.indexOf(focus) + 1 : 0;
  const total = model.todayCount; // the big number of the page: the same value everywhere (BR-01)
  const tomorrow = pastYear ? [] : model.todo.filter((r) => r.later);
  const clear = !pastYear && total === 0;

  const pick = (key: string) => {
    const row = queue.find((r) => r.key === key);
    setPicked(key);
    if (row) setSaid(`ขึ้นเป็นงานถัดไป: ${row.title}`);
    setMoveTick((n) => n + 1);
  };
  const skip = () => { if (focus) { setPicked(null); onDefer(focus.key); } };

  return (<>
    <div class="hmc-head">
      <Greeting class="hmc-greet" />
      {!pastYear && total > 0 && <span class="hmc-left">เหลือ {total} อย่างที่ต้องทำวันนี้</span>}
    </div>
    {!pastYear && <ResumeScan />}
    <div class="hmc-grid">
      {pastYear ? <PastBox /> : focus && !clear ? <FocusBox row={focus} pos={pos} total={total} model={model} hide={hide} onSkip={skip} headRef={headRef} /> : <ClearBox headRef={headRef} stale={model.stale} />}
      {!pastYear && <NextList rows={nextRows(queue, focus?.key)} tomorrow={tomorrow} onPick={pick} />}
    </div>
    <span class="sr-only" aria-live="polite">{said}</span>
    <QuickActions class="hmc-qs" />
    <div class="hmc-tiles">
      {cards.length === 0
        ? <section class="card hmc-tile"><p class="page-sub">ยังไม่ได้เปิดไทล์ใดไว้</p><button type="button" class="hmc-btn" onClick={openCustomize}><Icon name="layout-grid" size={20} />ปรับหน้าหลัก</button></section>
        : <Tiles cards={cards} model={model} hide={hide} pastYear={pastYear} />}
    </div>
  </>);
}

// Layout ก: "ลำดับงานวันนี้" — the BR-01 rows in the model's order. No tick, no "done": a row goes away when the data changes (BR-02).
import { useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { Chip, Bar } from "../shared";
import { navigate } from "../../../router";
import { runTodayGo } from "../model";
import { copyDueToLine } from "../today";
import type { TodayKind, TodayRow } from "../../../lib/homeLogic";
import type { HomeLayoutProps, HomeModel } from "../meta";
import { LEVEL_ICON, LEVEL_TONE, attTotals, dueRoomBars, overdueText, roomChips, timelineItems, type TimelineItem } from "./logic";

const GO_ICON: Record<TodayKind, string> = {
  failed: "cloud-x", queue: "cloud-upload", room: "user-check", due: "scan", overdue: "list-checks", review: "clipboard-list", term: "calendar-event", backup: "database-export", tomorrow: "scan",
};

/** the part of a row under its title: roll-call chips, per-room bars, late work chips */
function Extra({ row, model, firstRoom }: { row: TodayRow; model: HomeModel; firstRoom: boolean }) {
  if (row.kind === "room" && firstRoom) {
    const t = attTotals(model.rooms);
    return (
      <>
        <div class="hma-rooms">{roomChips(model.rooms).map((c) => (
          <span key={c.classId} class={"hma-room-chip " + (c.ok ? "ok" : "no")}><Icon name={c.ok ? "circle-check" : "alert-circle"} size={16} />{c.text}</span>
        ))}</div>
        {t.checked > 0 && <p class="hma-sum">ห้องที่เช็คแล้ว: มา {t.present} · สาย {t.late} · ลา {t.leave} · ป่วย {t.sick} · ขาด {t.absent}</p>}
      </>
    );
  }
  if (row.kind === "due" || row.kind === "tomorrow") {
    return <div class="hma-bars">{dueRoomBars(model, row).map((b) => (
      <div class="hma-bar" key={b.classId}><b>{b.name}</b><Bar pct={b.pct} tone="var(--fill-success)" label={`${b.name} ส่งแล้ว ${b.fraction}`} /><span class="num">{b.fraction}</span></div>
    ))}</div>;
  }
  if (row.kind === "overdue" && row.overdue) {
    return (
      <ul class="hma-ov">{row.overdue.map((o) => (
        <li key={o.assignmentId}>
          <Chip tone="danger" icon="calendar-x">{overdueText(o)}</Chip>
          {o.shouldClose && (
            <button type="button" class="hma-btn" aria-label={`ปิดรับงานนี้ ${o.title}`}
              onClick={() => navigate("/gradebook", { class: o.classId, subject: o.subjectId ?? undefined, asg: o.assignmentId })}><Icon name="lock" size={20} />ปิดรับงานนี้</button>
          )}
        </li>
      ))}</ul>
    );
  }
  return null;
}

function RowCard({ row, model, hide, firstRoom }: { row: TodayRow; model: HomeModel; hide: boolean; firstRoom: boolean }) {
  const later = !!row.later;
  return (
    <div class="hma-body">
      <div class="hma-top">
        <div class="hma-txt"><h3>{row.title}</h3>{row.reason && <p>{row.reason}</p>}</div>
        <Chip tone={later ? "muted" : LEVEL_TONE[row.level]} icon={later ? "calendar-blank" : LEVEL_ICON[row.level]}>{row.levelLabel}</Chip>
      </div>
      <Extra row={row} model={model} firstRoom={firstRoom} />
      {later && row.kind === "tomorrow" && <p class="hma-sum">ไม่นับในตัวเลขวันนี้</p>}
      <div class="hma-acts">
        <button type="button" class={later || row.level === "later" ? "hma-btn" : "hma-btn primary"} aria-label={`${row.primary.label} ${row.title}`} onClick={() => runTodayGo(row.primary.go)}>
          <Icon name={GO_ICON[row.kind]} size={20} />{row.primary.label}
        </button>
        {/* one copy button per room; the model has already taken them out while names are hidden */}
        {!hide && row.due && row.secondary?.map((s) => (
          <button type="button" key={s.classId} class="hma-btn" aria-label={`${s.label} · ${row.title}`} onClick={() => copyDueToLine(row.due!, s.classId)}><Icon name="copy" size={20} />{s.label}</button>
        ))}
      </div>
    </div>
  );
}

function Item({ row, model, hide, firstRoom }: { row: TodayRow; model: HomeModel; hide: boolean; firstRoom: boolean }) {
  return (
    <li class={`hma-item ${row.later ? "later" : row.level}`} data-kind={row.kind}>
      <div class="hma-time">{row.tag}</div>
      <div class="hma-node" aria-hidden="true"><Icon name={row.icon} size={18} /></div>
      <RowCard row={row} model={model} hide={hide} firstRoom={firstRoom} />
    </li>
  );
}

/** many "due today" rows folded into one that opens (ux: ข้อมูลเยอะ) */
function DueFold({ rows, model, hide }: { rows: TodayRow[]; model: HomeModel; hide: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li class="hma-item should" data-kind="dueFold">
      <div class="hma-time">วันนี้</div>
      <div class="hma-node" aria-hidden="true"><Icon name="calendar-due" size={18} /></div>
      <div class="hma-body">
        <div class="hma-top">
          <div class="hma-txt"><h3>ครบกำหนดวันนี้ {rows.length} งาน</h3><p>กดเพื่อดูแต่ละงานและคนที่ยังไม่ส่ง</p></div>
          <Chip tone="warning" icon="warning">ควรทำ</Chip>
        </div>
        <div class="hma-acts">
          <button type="button" class="hma-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name={open ? "chevron-up" : "chevron-down"} size={20} />{open ? "ซ่อนรายการ" : `ดูทั้ง ${rows.length} งาน`}
          </button>
        </div>
        {open && <ol class="hma-sub">{rows.map((r) => <li key={r.key}><RowCard row={r} model={model} hide={hide} firstRoom={false} /></li>)}</ol>}
      </div>
    </li>
  );
}

export function Timeline({ model, hide }: Pick<HomeLayoutProps, "model" | "hide">) {
  const items = timelineItems(model.todo);
  const firstRoomKey = model.todo.find((r) => r.kind === "room")?.key;
  const counted = model.todayCount;
  // tomorrow's rows come last, after the "nothing left" line when the day is clear
  const main = items.filter((it) => it.type === "dueFold" || !it.row.later);
  const tail = items.filter((it) => it.type === "row" && it.row.later);
  const draw = (it: TimelineItem) => it.type === "dueFold"
    ? <DueFold key="dueFold" rows={it.rows} model={model} hide={hide} />
    : <Item key={it.row.key} row={it.row} model={model} hide={hide} firstRoom={it.row.key === firstRoomKey} />;
  return (
    <section class="card hma-tl-wrap" aria-labelledby="hma-tl-h">
      <div class="hma-tl-head"><h2 id="hma-tl-h"><Icon name="path" size={20} />ลำดับงานวันนี้</h2><span class="page-sub">รายการหายเองเมื่อข้อมูลเปลี่ยน</span></div>
      <ol class="hma-tl">
        {main.map(draw)}
        {counted === 0 && (
          <li class="hma-item clear" data-kind="clear">
            <div class="hma-time">วันนี้</div>
            <div class="hma-node" aria-hidden="true"><Icon name="check" size={18} /></div>
            <div class="hma-body"><div class="hma-txt"><h3>ไม่มีอะไรค้าง</h3><p>พักสักครู่ แล้วค่อยเตรียมงานพรุ่งนี้</p></div>
              <div class="hma-acts"><button type="button" class="hma-btn" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="plus" size={20} />สร้างงาน</button></div></div>
          </li>
        )}
        {tail.map(draw)}
      </ol>
    </section>
  );
}

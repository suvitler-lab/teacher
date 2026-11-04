import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../Icon";
import { WorkCell } from "../ui";
import { gradebookLayout } from "../../lib/pageCards";
import { visibleCards } from "../../lib/cardLayout";
import type { GradebookCard } from "../../lib/pageCards";
import { api } from "../../lib/api";
import { fullName } from "../../lib/names";
import { formatThaiDateMs } from "../../lib/dates";
import { menuKeys, focusFirstItem } from "../../lib/menuKeys";
import { W } from "../../lib/pageColumns";
import { PageCols } from "../PageCols";
import { memoShallow } from "./memo";
import { percentOf, type WorkState, type WorkStateCounts } from "@shared/metrics";
import type { Assignment, Student } from "@shared/types";

/** Score buckets for the distribution card: share of the full score, so works with different full scores compare. */
export const DIST_BUCKETS = [
  { label: "ต่ำกว่า 50%", min: 0, max: 50 }, { label: "50–59%", min: 50, max: 60 }, { label: "60–69%", min: 60, max: 70 },
  { label: "70–79%", min: 70, max: 80 }, { label: "80% ขึ้นไป", min: 80, max: 101 },
] as const;

/** How many scored children fall in each bucket (a 7.5/10 is 75%). */
export function distribution(scores: number[], full: number): number[] {
  const out = DIST_BUCKETS.map(() => 0);
  for (const sc of scores) {
    const pct = full > 0 ? (sc * 100) / full : 0;
    const i = DIST_BUCKETS.findIndex((b) => pct >= b.min && pct < b.max);
    if (i >= 0) out[i]++;
  }
  return out;
}

/**
 * Open work worth closing (nobody is expected to hand in more): its due day has passed, or — with `allIn` — every child
 * on screen has already handed in or is excused (the same rule as the Home card).
 */
export function shouldClose(list: Assignment[], today: string, allIn?: (a: Assignment) => boolean): Assignment[] {
  return list.filter((a) => a.status === "open" && ((!!a.due_date && a.due_date < today) || (allIn ? allIn(a) : false)));
}

/** Whole days a due day is behind today (0 when it is not). */
export const daysLate = (due: string, today: string): number => Math.max(0, Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / 86_400_000));

// The cards of this page are small on purpose: the TABLE is the page. The top ones are one row of buttons above it
// (a summary line and drop-down lists); the bottom ones are a one-line legend, one line of keys, and two cards that start off.
const TOP: GradebookCard[] = ["summary", "awaiting", "close", "follow"];
const BOTTOM: GradebookCard[] = ["legend", "shortcuts", "dist", "recent"];

/** Rough card heights for balancing the bottom columns (spec §2): the distribution and the latest edits are both medium. */
const BOTTOM_WEIGHT: Record<string, number> = { dist: W.M, recent: W.M };

interface Props {
  assignments: Assignment[];
  selAsg: Assignment | null;
  students: Student[];
  counts: WorkStateCounts;
  stateOf: (aid: string, sid: string, a: Assignment) => WorkState;
  scoresOf: (aid: string) => number[];
  today: string;
  submitRate: number;
  /** pick a work (its column is selected and scrolled to) */
  onPick: (aid: string) => void;
  /** show only the children behind: not handed in, or waiting for a score */
  onRows: (kind: "missing" | "awaiting") => void;
  onCloseWork: (aid: string) => void;
}

/** A button that opens a small list under it (role=menu, ↑↓ and Esc work, the first item takes focus). */
function Drop({ icon, label, children, empty }: { icon: string; label: string; children: (close: () => void) => ComponentChildren; empty?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <span style="position:relative">
      <button class="gb-tile" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={icon} size={20} />{label}<Icon name="chevron-down" size={16} />
      </button>
      {open && (
        <>
          <div style="position:fixed;inset:0;z-index:39" onClick={close} />
          <div class="gb-menu gb-menu-left gb-list" role="menu" ref={focusFirstItem} onKeyDown={menuKeys(close)}>
            {empty ? <div class="page-sub" style="padding:8px 10px">ไม่มีรายการ</div> : children(close)}
          </div>
        </>
      )}
    </span>
  );
}

/** The row above the table: summary line and drop-downs, in the order and with the visibility the teacher chose. */
function StripView(p: Props) {
  const keys = (visibleCards(gradebookLayout.value) as GradebookCard[]).filter((k) => TOP.includes(k));
  if (keys.length === 0) return null;
  const awaitingBy = p.assignments
    .map((a) => ({ a, n: p.students.filter((st) => p.stateOf(a.id, st.id, a) === "awaiting").length }))
    .filter((x) => x.n > 0).sort((x, y) => y.n - x.n).slice(0, 8); // most waiting first
  const closable = shouldClose(p.assignments, p.today, (a) => p.students.length > 0
    && p.students.every((st) => { const s = p.stateOf(a.id, st.id, a); return s !== "missing" && s !== "pending"; }));
  const missingBy = p.students
    .map((st) => ({ st, n: p.assignments.filter((a) => p.stateOf(a.id, st.id, a) === "missing").length }))
    .filter((x) => x.n > 0).sort((x, y) => y.n - x.n).slice(0, 8);
  const view: Record<string, () => preact.JSX.Element> = {
    summary: () => (
      <div class="gb-tile sum" role="group" aria-label="สรุปห้อง">
        <span>งาน <b>{p.assignments.length}</b></span>
        <span>อัตราส่ง <b>{p.submitRate}%</b></span>
        <button class="gb-n" onClick={() => p.onRows("awaiting")}>รอตรวจ <b style="color:var(--text-accent)">{p.counts.awaiting}</b></button>
        <button class="gb-n" onClick={() => p.onRows("missing")}>ค้างส่ง <b style="color:var(--text-danger)">{p.counts.missing}</b> ชิ้น</button>
      </div>
    ),
    awaiting: () => (
      <Drop icon="hourglass-empty" label={`รอตรวจ ${awaitingBy.length} งาน`} empty={awaitingBy.length === 0}>
        {(close) => awaitingBy.map(({ a, n }) => (
          <button role="menuitem" class="gc-row" key={a.id} onClick={() => { close(); p.onPick(a.id); p.onRows("awaiting"); }}><span class="grow">{a.title}</span><b>{n}</b></button>
        ))}
      </Drop>
    ),
    close: () => (
      <Drop icon="lock" label={`ควรปิดรับ ${closable.length} งาน`} empty={closable.length === 0}>
        {(close) => closable.map((a) => (
          <div class="gc-row" key={a.id}>
            <button role="menuitem" class="ghost grow" onClick={() => { close(); p.onPick(a.id); }}>{a.title}<div class="page-sub">{a.due_date && a.due_date < p.today ? `เลยกำหนด ${daysLate(a.due_date, p.today)} วัน` : "ส่งครบทุกคนแล้ว"}</div></button>
            <button role="menuitem" onClick={() => { close(); p.onCloseWork(a.id); }}>ปิดรับ</button>
          </div>
        ))}
      </Drop>
    ),
    follow: () => (
      <Drop icon="flag" label={`ต้องติดตาม ${missingBy.length} คน`} empty={missingBy.length === 0}>
        {(close) => missingBy.map(({ st, n }) => (
          <button role="menuitem" class="gc-row" key={st.id} onClick={() => { close(); p.onRows("missing"); }}><span class="grow">{st.number ?? "-"} {fullName(st)}</span><b style="color:var(--text-danger)">ค้าง {n}</b></button>
        ))}
      </Drop>
    ),
  };
  return <div class="gb-strip" role="group" aria-label="การ์ดสรุป">{keys.map((k) => <span key={k}>{view[k]()}</span>)}</div>;
}
/** Drawn again only when its props change (a cell focus in the table no longer redraws it). */
export const GradebookStrip = memoShallow(StripView);

/** Under the table: the legend as one line, one line of keys, and the cards that start off (spread, latest edits). */
function BottomView(p: Props) {
  const keys = (visibleCards(gradebookLayout.value) as GradebookCard[]).filter((k) => BOTTOM.includes(k));
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (keys.length === 0) return null;
  const view: Record<string, () => preact.JSX.Element | null> = {
    legend: () => (
      <div class="gb-legend" role="note" aria-label="คำอธิบายสัญลักษณ์">
        <span><WorkCell state="scored" score={9} /> มีคะแนน</span>
        <span><WorkCell state="late" score={7} /> ส่งช้า</span>
        <span><WorkCell state="awaiting" /> รอตรวจ</span>
        <span><WorkCell state="missing" /> ค้างส่ง</span>
        <span><WorkCell state="pending" /> ยังไม่ถึงกำหนด</span>
        <span><WorkCell state="excused" /> ไม่นับ (ยกเว้น)</span>
        <span><WorkCell state="scored" score={8} mark="pend" /> รอส่งขึ้นระบบ</span>
        <span><WorkCell state="scored" score={8} mark="fail" /> ส่งไม่สำเร็จ</span>
        <span><WorkCell state="scored" score={8} mark="unsaved" /> ยังไม่ได้บันทึก</span>
      </div>
    ),
    shortcuts: () => touch ? null : (
      <div class="page-sub gb-help"><Icon name="keyboard" size={16} /> ลูกศร เลื่อนช่อง · Enter หรือพิมพ์ตัวเลข กรอกคะแนน · Enter ไปคนถัดไป · Esc ปิด · Alt+Enter ดูสถานะ/วันที่รับ · Space ที่หัวคอลัมน์ = เลือกงาน</div>
    ),
    dist: () => {
      const sc = p.selAsg ? p.scoresOf(p.selAsg.id) : [];
      const d = p.selAsg ? distribution(sc, p.selAsg.full_score) : [];
      const mx = Math.max(1, ...d);
      return (
        <section class="card gb-bcard" aria-label="การกระจายคะแนน">
          <b><Icon name="chart-histogram" size={20} /> การกระจายคะแนน{p.selAsg ? ` · ${p.selAsg.title}` : ""}</b>
          {!p.selAsg ? <div class="page-sub">เลือกงานก่อน</div> : !p.selAsg.publish_scores ? <div class="page-sub"><Icon name="eye-off" size={16} /> งานนี้ซ่อนคะแนนไว้ — ไม่แสดงการกระจายคะแนน</div> : sc.length === 0 ? <div class="page-sub">งานนี้ยังไม่มีคะแนน</div> : (
            <div class="gb-hist">{DIST_BUCKETS.map((b, i) => <div key={b.label}><i style={`height:${Math.round((d[i] / mx) * 48) + 2}px`} /><small>{d[i]}</small><small>{b.label}</small></div>)}</div>
          )}
          {p.selAsg && p.selAsg.publish_scores && sc.length > 0 && <div class="page-sub">{sc.length} คน · {percentOf(d[0], sc.length)}% ต่ำกว่าครึ่ง</div>}
        </section>
      );
    },
    recent: () => <RecentCard asg={p.selAsg} />,
  };
  const lines = keys.filter((k) => k === "legend" || k === "shortcuts"), cards = keys.filter((k) => k === "dist" || k === "recent");
  // the legend and the keys stay one full-width line each; the real cards spread over up to three columns
  const lineViews = lines.map((k) => { const v = view[k](); return v ? <div key={k}>{v}</div> : null; });
  return (
    <>
      {lines.length > 0 && <div class="gb-bottom">{lineViews}</div>}
      <PageCols keys={cards} max={3} minCol={22} weightOf={(k) => BOTTOM_WEIGHT[k] ?? W.M} render={(k) => view[k]()} class="gb-bcards" />
    </>
  );
}
export const GradebookBottom = memoShallow(BottomView);

interface AuditLite { id: number; at: number; action: string; device_name: string | null }
function RecentCard({ asg }: { asg: Assignment | null }) {
  const [rows, setRows] = useState<AuditLite[] | null>(null);
  useEffect(() => {
    setRows(null);
    if (!asg) return;
    api.get<{ rows: AuditLite[] }>(`/api/audit?assignment=${encodeURIComponent(asg.id)}&limit=5`).then((r) => setRows(r.rows ?? []), () => setRows([]));
  }, [asg?.id]);
  return (
    <section class="card gb-bcard" aria-label="แก้ไขล่าสุด">
      <b><Icon name="clock" size={20} /> แก้ไขล่าสุด</b>
      {!asg ? <div class="page-sub">เลือกงานก่อน</div> : rows === null ? <div class="page-sub">กำลังโหลด…</div> : rows.length === 0 ? <div class="page-sub">ยังไม่มีการแก้ไขของงานนี้</div> : rows.map((r) => (
        <div class="gb-log" key={r.id}><span class="page-sub">{formatThaiDateMs(r.at)}</span> {r.action}{r.device_name ? ` · ${r.device_name}` : ""}</div>
      ))}
    </section>
  );
}

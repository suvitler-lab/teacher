import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { WorkCell } from "../ui";
import { Dialog } from "../Dialog";
import { gradebookLayout } from "../../lib/pageCards";
import { visibleCards } from "../../lib/cardLayout";
import type { GradebookCard } from "../../lib/pageCards";
import { api } from "../../lib/api";
import { fullName } from "../../lib/names";
import { formatThaiDate, formatThaiDateMs } from "../../lib/dates";
import { ok, err } from "../../lib/notify";
import { percentOf, type WorkState } from "@shared/metrics";
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

const DRAWER_KEYS: GradebookCard[] = ["awaiting", "close", "follow", "legend", "shortcuts", "dist", "recent"];

interface Props {
  assignments: Assignment[];
  selAsg: Assignment | null;
  students: Student[];
  stateOf: (aid: string, sid: string, a: Assignment) => WorkState;
  scoresOf: (aid: string) => number[];
  today: string;
  /** pick a work (its column is selected and scrolled to) */
  onPick: (aid: string) => void;
  /** show only the children behind: not handed in, or waiting for a score */
  onRows: (kind: "missing" | "awaiting") => void;
  onCloseWork: (aid: string) => void;
  onEdit: () => void;
  /** this page hides names: the drawer shows the number only and cannot copy a name list */
  hide: boolean;
  nameOf: (st: Student) => string;
  /** first line of the copied list: "<room> · <subject> · ค้างส่ง" */
  copyHead: string;
  onClose: () => void;
  /** a sheet from the bottom (narrow screens) instead of the right-hand drawer */
  sheet: boolean;
  /** a wide mouse screen may dock the drawer beside the table (not modal, starts unpinned) */
  pinnable?: boolean;
  pinned?: boolean;
  onPin?: () => void;
}

/** What the pill in the hero counts — the same lists the drawer draws, so the two never disagree (BR-36). */
export function drawerLists(p: Pick<Props, "assignments" | "students" | "stateOf" | "today">) {
  const awaitingBy = p.assignments
    .map((a) => ({ a, n: p.students.filter((st) => p.stateOf(a.id, st.id, a) === "awaiting").length }))
    .filter((x) => x.n > 0).sort((x, y) => y.n - x.n).slice(0, 8); // most waiting first
  const closable = shouldClose(p.assignments, p.today, (a) => p.students.length > 0
    && p.students.every((st) => { const s = p.stateOf(a.id, st.id, a); return s !== "missing" && s !== "pending"; }));
  const missingAll = p.students
    .map((st) => ({ st, n: p.assignments.filter((a) => p.stateOf(a.id, st.id, a) === "missing").length }))
    .filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
  return { awaitingBy, closable, missingAll, missingBy: missingAll.slice(0, 8) };
}

/** The list a teacher pastes into LINE: every child who is behind, not cut at 8; the first line names room and subject. */
export function followCopyText(head: string, rows: { number: number | null | undefined; name: string; n: number }[]): string {
  return [head, ...rows.map((r) => `${r.number ?? "-"} ${r.name} (ค้าง ${r.n})`)].join("\n");
}

/** The side drawer: every card of the page in one place (right 360px on a wide screen, a sheet from the bottom on a narrow one). */
export function GradebookDrawer(p: Props) {
  const keys = (visibleCards(gradebookLayout.value) as GradebookCard[]).filter((k) => DRAWER_KEYS.includes(k));
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const { awaitingBy, closable, missingAll, missingBy } = drawerLists(p);
  const asg = p.selAsg;
  // R-4804: pinning swaps the modal Dialog for an aside; the Dialog hands focus back to the pill as it goes — put it on the pin button instead
  useEffect(() => { if (p.pinned) (document.querySelector(".gb-drawer.pinned .gd-head [aria-pressed]") as HTMLElement | null)?.focus(); }, [p.pinned]);
  const done = () => { if (!p.pinned) p.onClose(); }; // a pinned drawer stays while the teacher works the table
  const copy = async () => {
    const text = followCopyText(p.copyHead, missingAll.map(({ st, n }) => ({ number: st.number, name: fullName(st), n })));
    try { await navigator.clipboard.writeText(text); ok("คัดลอกรายชื่อแล้ว"); } catch { err("คัดลอกไม่สำเร็จ — ลองอีกครั้ง"); }
  };
  const head = (icon: string, text: string, n?: number) => <h3 class="gd-h"><Icon name={icon} size={18} /> {text}{n != null ? <b class="gd-n">{n}</b> : null}</h3>;
  const view: Record<string, () => preact.JSX.Element | null> = {
    awaiting: () => (
      <section class="gd-card" aria-label="รอตรวจ">
        {head("hourglass-empty", "รอตรวจ", awaitingBy.length)}
        {awaitingBy.length === 0 ? <div class="page-sub">ไม่มีงานรอตรวจ</div> : awaitingBy.map(({ a, n }) => (
          <button class="gc-row" key={a.id} onClick={() => { done(); p.onPick(a.id); p.onRows("awaiting"); }}><span class="grow">{a.title}</span><b>{n}</b></button>
        ))}
      </section>
    ),
    close: () => (
      <section class="gd-card" aria-label="ควรปิดรับ">
        {head("lock", "ควรปิดรับ", closable.length)}
        {closable.length === 0 ? <div class="page-sub">ไม่มีงานที่ควรปิดรับ</div> : closable.map((a) => (
          <div class="gc-row" key={a.id}>
            <button class="ghost grow" onClick={() => { done(); p.onPick(a.id); }}>{a.title}<div class="page-sub">{a.due_date && a.due_date < p.today ? `เลยกำหนด ${daysLate(a.due_date, p.today)} วัน` : "ส่งครบทุกคนแล้ว"}</div></button>
            <button onClick={() => { done(); p.onCloseWork(a.id); }}>ปิดรับ</button>
          </div>
        ))}
      </section>
    ),
    follow: () => (
      <section class="gd-card" aria-label="ต้องติดตาม">
        {head("flag", "ต้องติดตาม", missingAll.length)}
        {missingBy.length === 0 ? <div class="page-sub">ไม่มีใครค้างส่ง</div> : missingBy.map(({ st, n }) => (
          <button class="gc-row" key={st.id} onClick={() => { done(); p.onRows("missing"); }}><span class="grow">{st.number ?? "-"} {p.nameOf(st)}</span><b style="color:var(--text-danger)">ค้าง {n}</b></button>
        ))}
        {missingAll.length > missingBy.length && <div class="page-sub">แสดง {missingBy.length} คนแรกจาก {missingAll.length} คน</div>}
        <button type="button" disabled={p.hide || missingAll.length === 0} title={p.hide ? "ซ่อนชื่ออยู่ — คัดลอกรายชื่อไม่ได้" : "คัดลอกรายชื่อทุกคนที่ค้างส่งไปวางใน LINE"} onClick={copy}>
          <Icon name="copy" size={16} /> คัดลอกรายชื่อ
        </button>
        {p.hide && <div class="page-sub" role="note">ปิดไว้ขณะซ่อนชื่อ</div>}
      </section>
    ),
    legend: () => (
      <section class="gd-card" aria-label="คำอธิบายสัญลักษณ์" role="note">
        {head("info-circle", "คำอธิบายสัญลักษณ์")}
        <div class="gb-legend">
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
      </section>
    ),
    shortcuts: () => touch ? null : (
      <section class="gd-card" aria-label="ปุ่มลัด">
        <div class="page-sub gb-help"><Icon name="keyboard" size={16} /> ลูกศร เลื่อนช่อง · Enter หรือพิมพ์ตัวเลข กรอกคะแนน · Enter ไปคนถัดไป · Esc ปิด · Alt+Enter ดูสถานะ/วันที่รับ · Space ที่หัวคอลัมน์ = เลือกงาน</div>
      </section>
    ),
    dist: () => {
      const sc = asg ? p.scoresOf(asg.id) : [];
      const d = asg ? distribution(sc, asg.full_score) : [];
      const mx = Math.max(1, ...d);
      return (
        <section class="gd-card" aria-label="การกระจายคะแนน">
          {head("chart-histogram", `การกระจายคะแนน${asg ? ` · ${asg.title}` : ""}`)}
          {!asg ? <div class="page-sub">เลือกงานก่อน</div> : !asg.publish_scores ? <div class="page-sub"><Icon name="eye-off" size={16} /> งานนี้ซ่อนคะแนนไว้ — ไม่แสดงการกระจายคะแนน</div> : sc.length === 0 ? <div class="page-sub">งานนี้ยังไม่มีคะแนน</div> : (
            <div class="gb-hist">{DIST_BUCKETS.map((b, i) => <div key={b.label}><i style={`height:${Math.round((d[i] / mx) * 48) + 2}px`} /><small>{d[i]}</small><small>{b.label}</small></div>)}</div>
          )}
          {asg && asg.publish_scores && sc.length > 0 && <div class="page-sub">{sc.length} คน · {percentOf(d[0], sc.length)}% ต่ำกว่าครึ่ง</div>}
        </section>
      );
    },
    recent: () => <RecentCard asg={asg} />,
  };
  const inner = (
    <>
      <div class="gd-head"><h2>สรุปสมุดคะแนน</h2>
        {p.pinnable && <button type="button" class={"icon ghost" + (p.pinned ? " on" : "")} aria-pressed={!!p.pinned} aria-label={p.pinned ? "เลิกปักไว้ข้างตาราง" : "ปักไว้ข้างตาราง"} title={p.pinned ? "เลิกปักไว้ข้างตาราง" : "ปักไว้ข้างตาราง"} onClick={p.onPin}><Icon name="pin" /></button>}
        <button class="icon ghost" aria-label="ปิด" onClick={p.onClose}><Icon name="x" /></button></div>
      {asg && (
        <section class="gd-card" aria-label="งานที่เลือก">
          {head("notebook", "งานที่เลือก")}
          <div class="gd-tt">{asg.title}</div>
          <dl class="gd-dl">
            <dt>เต็ม</dt><dd>{asg.full_score}</dd>
            <dt>วันสั่ง</dt><dd>{asg.assigned_date ? formatThaiDate(asg.assigned_date) : "–"}</dd>
            <dt>กำหนดส่ง</dt><dd>{asg.due_date ? formatThaiDate(asg.due_date) : "ไม่มีกำหนดส่ง"}</dd>
            {asg.unit && <><dt>หน่วย/บท</dt><dd>{asg.unit}</dd></>}
            {asg.note && <><dt>คำชี้แจง</dt><dd style="white-space:pre-wrap;overflow-wrap:anywhere">{asg.note}</dd></>}
          </dl>
          <button type="button" onClick={() => { done(); p.onEdit(); }}><Icon name="edit" size={16} /> แก้ไขงาน</button>
        </section>
      )}
      {keys.map((k) => <div key={k}>{view[k]()}</div>)}
    </>
  );
  if (p.pinned && p.pinnable) {
    return <aside class="gb-drawer pinned" aria-label="สรุปสมุดคะแนน" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); p.onClose(); } }}>{inner}</aside>;
  }
  return (
    <div class="gb-drawer-scrim" onClick={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <Dialog class={"gb-drawer" + (p.sheet ? " btm" : "")} label="สรุปสมุดคะแนน" onClose={p.onClose}>{inner}</Dialog>
    </div>
  );
}

interface AuditLite { id: number; at: number; action: string; device_name: string | null }
function RecentCard({ asg }: { asg: Assignment | null }) {
  const [rows, setRows] = useState<AuditLite[] | null>(null);
  useEffect(() => {
    setRows(null);
    if (!asg) return;
    api.get<{ rows: AuditLite[] }>(`/api/audit?assignment=${encodeURIComponent(asg.id)}&limit=5`).then((r) => setRows(r.rows ?? []), () => setRows([]));
  }, [asg?.id]);
  return (
    <section class="gd-card" aria-label="แก้ไขล่าสุด">
      <h3 class="gd-h"><Icon name="clock" size={18} /> แก้ไขล่าสุด</h3>
      {!asg ? <div class="page-sub">เลือกงานก่อน</div> : rows === null ? <div class="page-sub">กำลังโหลด…</div> : rows.length === 0 ? <div class="page-sub">ยังไม่มีการแก้ไขของงานนี้</div> : rows.map((r) => (
        <div class="gb-log" key={r.id}><span class="page-sub">{formatThaiDateMs(r.at)}</span> {r.action}{r.device_name ? ` · ${r.device_name}` : ""}</div>
      ))}
    </section>
  );
}

import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../Icon";
import { StackBar, Drawer } from "../ui";
import { ProjectorShell } from "../Projector";
import { PageCols, useRegionRem } from "../PageCols";
import { REPORTS_WEIGHT } from "../cards/meta";
import { W } from "../../lib/pageColumns";
import { reportsLayout } from "../../lib/pageCards";
import { visibleCards } from "../../lib/cardLayout";
import type { ReportsCard } from "../../lib/pageCards";
import type { AssignmentReport, ReportModel, ReportPayload, StudentReport } from "../../lib/report";
import { showsRate, submitRateView, avgScoreView, submitRateWhy, workRateView, workAverageView, workRows, frequentAbsent, ABSENT_MIN, nameOf, bucketsLabel } from "../../lib/reportView";
import { fullName } from "../../lib/names";
import { navigate } from "../../router";
import { scorePercent, attendancePercent, assignmentFraction } from "@shared/metrics";
import { formatThaiDate, formatThaiDateMs, formatThaiTimeMs } from "../../lib/dates";
import { settings } from "../../store";

/** Total of each attendance word over the whole class (every child's marks added up). */
export function attendanceMix(model: ReportModel) {
  return model.students.reduce((a, s) => ({
    present: a.present + s.attendance.present, late: a.late + s.attendance.late, leave: a.leave + s.attendance.leave,
    sick: a.sick + s.attendance.sick, absent: a.absent + s.attendance.absent,
  }), { present: 0, late: 0, leave: 0, sick: 0, absent: 0 });
}

/** Class score spread: how many children sit in each band of the running score (<50, 50–59, 60–69, 70–79, 80+). */
export function scoreBuckets(students: StudentReport[]): number[] {
  const b = [0, 0, 0, 0, 0];
  for (const s of students) {
    const pct = scorePercent(s.score, s.fullScore); // the same rounded % the table shows
    if (pct == null) continue;
    b[pct < 50 ? 0 : pct < 60 ? 1 : pct < 70 ? 2 : pct < 80 ? 3 : 4]++;
  }
  return b;
}

export type SortKey = "number" | "submit" | "score" | "att";
export interface SortState { key: SortKey; dir: "asc" | "desc" }

/** The value a column sorts by. A child with nothing to measure sorts as "fine" (1), so the ones to look at come first. */
const sortValue = (s: StudentReport, key: SortKey): number => {
  if (key === "number") return s.student.number ?? 0;
  if (key === "submit") return s.percent;
  if (key === "score") return s.fullScore ? s.score / s.fullScore : 1;
  return s.attendance.daysMarked ? (s.attendance.present + s.attendance.late) / s.attendance.daysMarked : 1;
};
export function sortStudents(list: StudentReport[], st: SortState): StudentReport[] {
  const k = st.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => k * (sortValue(a, st.key) - sortValue(b, st.key)) || (a.student.number ?? 0) - (b.student.number ?? 0));
}
/** A tap on a header: same column = flip the direction, another column = start with its natural direction (ones to look at first). */
export function nextSort(cur: SortState, key: SortKey): SortState {
  return cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
}
const SORT_NAME: Record<SortKey, string> = { number: "เลขที่", submit: "ส่งงาน", score: "คะแนนสะสม", att: "มาเรียน" };
/** What a screen reader hears after a sort tap: "เรียงตาม ส่งงาน น้อยไปมาก". */
export function sortAnnouncement(st: SortState): string {
  return `เรียงตาม ${SORT_NAME[st.key]} ${st.dir === "asc" ? "น้อยไปมาก" : "มากไปน้อย"}`;
}

/**
 * Rows the projector shows for the works: up to 2N (N = 4, or 3 at the biggest text), the latest due day first (the work
 * the class is collecting now matters more than one from September). When there are more than 2N, the "and k more" line
 * takes one place, so 2N−2 are shown and k = the rest.
 */
export function projectorWorkRows<T extends { assignment: { due_date: string | null; assigned_date: string | null } }>(list: T[], size: 1 | 2 | 3): { shown: T[]; more: number } {
  const cap = 2 * (size === 3 ? 3 : 4);
  const day = (a: T) => a.assignment.due_date ?? a.assignment.assigned_date ?? "";
  const latestFirst = [...list].sort((a, b) => day(b).localeCompare(day(a)));
  if (latestFirst.length <= cap) return { shown: latestFirst, more: 0 };
  return { shown: latestFirst.slice(0, cap - 2), more: latestFirst.length - (cap - 2) };
}

const bucketClass = ["f-low", "f-mid", "f-ok", "f-ok", "f-succ"];
const FOLLOW_SHOWN = 8;
const WORKS_SHOWN = 8;
/** the often-absent card shows the first 5 (D43: the cards never cost the table a row); the rest sit behind "ดูทั้งหมด (n)" */
const ABSENT_SHOWN = 5;

/** One tile of the band above the table. A button when it goes somewhere; otherwise a focusable group (its title says what the number is divided by). */
function Tile({ icon, label, value, unit, sub, subShort, onClick, aria, title, tone }: {
  icon: string; label: string; value: ComponentChildren; unit?: string; sub: string; subShort?: string; onClick?: () => void; aria: string; title?: string; tone?: "danger";
}) {
  const inner = (
    <>
      <span class="l"><Icon name={icon} size={16} class="ic" />{label}{onClick && <Icon name="chevron-right" size={14} class="go" />}</span>
      <span class="v">{value}{unit && <small>{unit}</small>}</span>
      {subShort ? <><span class="s lng">{sub}</span><span class="s sht" aria-hidden="true">{subShort}</span></> : <span class="s">{sub}</span>}
    </>
  );
  const cls = "rp-k" + (tone ? " " + tone : "");
  return onClick
    ? <button type="button" class={cls} onClick={onClick} aria-label={aria} title={title}>{inner}</button>
    : <div class={cls} tabIndex={0} role="group" aria-label={aria} title={title}>{inner}</div>;
}

/** The four numbers (AC-154). Every value reads reportView.ts, so a spot that has no denominator says "—" and why, never 0%. */
export function ReportHero({ model, classId, monthLabel, monthly, onFollow }: {
  model: ReportModel; classId: string; monthLabel: string; monthly: boolean; onFollow: () => void;
}) {
  const t = model.totals, mix = attendanceMix(model);
  const rate = submitRateView(model), avg = avgScoreView(model);
  const unit = model.attendance.unit === "period" ? "คาบ" : "วัน";
  const rateSub = rate == null ? submitRateWhy(model, monthly ? "m" : null, monthLabel) : `ส่งแล้ว ${t.submitted} จาก ${t.applicable} ที่ถึงกำหนด` + (t.pending > 0 ? ` · ยังไม่ถึงกำหนด ${t.pending}` : "");
  const rateDen = "ตัวส่วน = ส่งแล้ว + ค้างส่ง ไม่นับยังไม่ถึงกำหนดและยกเว้น";
  const avgDen = "ตัวส่วน = คะแนนเต็มของงานที่มีคะแนนและค้างส่ง";
  const avgSub = avg == null ? "ยังไม่มีคะแนนในช่วงนี้" : `คะแนนสะสม · ค้างส่งนับ 0 · รอตรวจ ${t.awaiting} ชิ้น`;
  const attSub = model.metrics.attendanceRate == null ? "ยังไม่มีข้อมูลเช็คชื่อในช่วงนี้" : `จาก ${model.attendance.sessions} ${unit} · ขาดรวม ${mix.absent} ครั้ง`;
  return (
    <section class="rp-hero" aria-label="สรุปรายงาน" aria-live="off">
      <Tile icon="checks" label="อัตราส่งงาน" value={rate == null ? "—" : `${rate}%`} sub={rateSub} title={rateDen}
        aria={rate == null ? `อัตราส่งงาน ไม่มีข้อมูล · ${rateSub}` : `อัตราส่งงาน ${rate} เปอร์เซ็นต์ · ${rateSub} · ${rateDen}`} />
      <Tile icon="alert-circle" label="งานค้าง" value={model.metrics.missingCount} unit="ชิ้น" sub={`นักเรียน ${model.followUp.length} คน`} tone="danger" onClick={onFollow}
        aria={`งานค้าง ${model.metrics.missingCount} ชิ้น · นักเรียน ${model.followUp.length} คน · ดูรายชื่อที่ต้องติดตาม`} />
      <Tile icon="star" label="คะแนนเฉลี่ย" value={avg == null ? "—" : `${avg}%`} sub={avgSub} title={avg == null ? avgDen : `${avgSub} · ค้างนับ 0 · รอตรวจ ${t.awaiting} · ${avgDen}`}
        subShort={avg == null ? undefined : `ค้างนับ 0 · รอตรวจ ${t.awaiting}`}
        aria={avg == null ? `คะแนนเฉลี่ย ไม่มีข้อมูล · ${avgSub}` : `คะแนนเฉลี่ย ${avg} เปอร์เซ็นต์ · ${avgSub} · ${avgDen}`} />
      <Tile icon="user-check" label="มาเรียน" value={model.metrics.attendanceRate == null ? "—" : `${model.metrics.attendanceRate}%`} sub={attSub} onClick={() => navigate("/attendance", { class: classId })}
        aria={`มาเรียน ${model.metrics.attendanceRate == null ? "ไม่มีข้อมูล" : model.metrics.attendanceRate + " เปอร์เซ็นต์"} · ${attSub} · ไปหน้าเช็คชื่อ`} />
    </section>
  );
}

interface CardsProps {
  model: ReportModel; classId: string; unitLabel: string;
  /** most columns the cards may use (1 beside the table, 2 when they sit above it) */
  max: number;
  /** what the page covers, e.g. "พ.ย. 2569" — named when a month has no work */
  periodLabel?: string;
  hide: boolean;
  onOpenStudent: (id: string) => void;
  /** copies the LINE text; resolves true when it worked (the button then says "คัดลอกแล้ว") */
  onCopyLine: () => Promise<boolean> | void;
  /** set when the page shows one month: an empty month offers the whole term */
  onFullTerm?: () => void;
  /** bumps when the hero's "งานค้าง" is tapped and the follow card is on: open it, bring it into view, focus its head */
  focusFollow: number;
  /** the last tap this page already acted on (kept by the page, so a remount of the cards does not act on it again) */
  handled: { current: number };
}

/** The people who still owe work, one row each (the card and the sheet share it). */
export function FollowRows({ model, hide, limit, onOpen }: { model: ReportModel; hide: boolean; limit?: number; onOpen: (id: string) => void }) {
  const list = limit ? model.followUp.slice(0, limit) : model.followUp;
  return <>{list.map((f) => {
    const nm = nameOf(f.student, fullName(f.student), hide);
    return (
      // the name and the list of works are cut with "…" on a narrow screen: the full text rides in title and, where the list is shortened, in the button's name
      <button class="rp-follow" key={f.student.id} onClick={() => onOpen(f.student.id)}
        aria-label={f.missing.length > 3 ? `${nm} ค้างส่ง ${f.missing.length} งาน: ${f.missing.join(" · ")}` : undefined}>
        <span class="no">{f.student.number ?? "-"}</span>
        <span class="who"><span class="nm" title={nm}>{nm}</span><span class="what" title={f.missing.join(" · ")}>{f.missing.slice(0, 3).join(" · ")}{f.missing.length > 3 ? " …" : ""}</span></span>
        <span class="chip"><Icon name="alert-circle" size={16} /> ค้าง {f.missing.length}</span>
      </button>
    );
  })}</>;
}

/** The often-absent children, one row each (the card shows ABSENT_SHOWN, the sheet all of them). */
function AbsentRows({ list, onOpen }: { list: ReturnType<typeof frequentAbsent>; onOpen: (id: string) => void }) {
  return <>{list.map(({ s, absent, att }) => (
    <button class="rp-follow" key={s.student.id} onClick={() => onOpen(s.student.id)}>
      <span class="no">{s.student.number ?? "-"}</span>
      <span class="who"><span class="nm" title={fullName(s.student)}>{fullName(s.student)}</span><span class="what">มาเรียน {att == null ? "—" : att + "%"}</span></span>
      <span class="chip"><Icon name="x" size={16} /> ขาด {absent} ครั้ง</span>
    </button>
  ))}</>;
}

function RcHead({ id, icon, title, folded, onToggle, extra }: { id: string; icon: string; title: string; folded: boolean; onToggle: () => void; extra?: ComponentChildren }) {
  return (
    <div class="hm-cardhead rp-ch">
      <h2 id={id}>
        <button type="button" id={id + "-b"} class="rp-fold" aria-expanded={!folded} aria-controls={id + "-body"} onClick={onToggle}>
          <Icon name={icon} size={20} /><span class="tt">{title}</span><Icon name={folded ? "chevron-down" : "chevron-up"} size={16} />
        </button>
      </h2>
      {extra}
    </div>
  );
}

/** The cards, in the order and with the visibility the teacher chose, spread over the columns that fit (the table itself is fixed). */
export function ReportCards({ model, classId, unitLabel, max, periodLabel, hide, onOpenStudent, onCopyLine, onFullTerm, focusFollow, handled }: CardsProps) {
  const keys = visibleCards(reportsLayout.value) as ReportsCard[];
  const [allFollow, setAllFollow] = useState(false);
  const [allWorks, setAllWorks] = useState(false);
  const [allAbsent, setAllAbsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({}); // not remembered (A19)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    if (!focusFollow || focusFollow === handled.current) return; // a remount (another class) must not replay a tap already handled
    handled.current = focusFollow;
    setFolded((f) => ({ ...f, follow: false }));
    setTimeout(() => { const b = document.getElementById("rc-fl-b"); b?.scrollIntoView?.({ block: "center" }); b?.focus(); }, 0);
  }, [focusFollow]);
  const mix = attendanceMix(model);
  const attTotal = mix.present + mix.late + mix.leave + mix.sick + mix.absent;
  const buckets = scoreBuckets(model.students);
  const maxBucket = Math.max(1, ...buckets);
  const counted = buckets.reduce((n, x) => n + x, 0);
  const t = model.totals;
  const often = frequentAbsent(model.students);

  async function copy() {
    const r = await onCopyLine();
    if (r === false) return;
    setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }
  const fold = (k: string) => () => setFolded((f) => ({ ...f, [k]: !f[k] }));
  const card = (k: string, id: string, icon: string, title: string, body: ComponentChildren, extra?: ComponentChildren) => (
    <section class="card rp-card" aria-labelledby={id}>
      <RcHead id={id} icon={icon} title={title} folded={!!folded[k]} onToggle={fold(k)} extra={extra} />
      <div class="rp-cb" id={id + "-body"} hidden={!!folded[k]}>{body}</div>
    </section>
  );
  const workRow = (a: AssignmentReport) => {
    const rate = workRateView(a), avg = workAverageView(a), final = showsRate(a.assignment, model.today);
    const tone = rate == null ? "" : rate >= 85 ? "f-ok" : rate >= 60 ? "f-mid" : "f-low";
    const due = a.assignment.due_date ? `กำหนด ${formatThaiDate(a.assignment.due_date)}` : "ไม่มีกำหนด";
    const pctText = !final ? "เก็บอยู่" : rate == null ? "—" : `${rate}%`;
    const avgText = avg == null ? "ยังไม่มีคะแนน" : `เฉลี่ย ${avg}% · ตรวจ ${a.scoredCount}/${a.submitted}`;
    const avgSpoken = avg == null ? "ยังไม่มีคะแนน" : `เฉลี่ย ${avg}% ตรวจแล้ว ${a.scoredCount}/${a.submitted}`;
    return (
      <button class="rp-work" key={a.assignment.id} onClick={() => navigate("/gradebook", { class: classId, asg: a.assignment.id })}
        aria-label={`${a.assignment.title} · ${due} · ส่งแล้ว ${a.submitted} จาก ${a.total - a.excused}${pctText === "เก็บอยู่" ? " · เก็บอยู่" : pctText === "—" ? " · ไม่มีอัตรา" : ` · ${pctText}`}${a.excused > 0 ? ` · ยกเว้น ${a.excused}` : ""} · ${avgSpoken} · แตะเพื่อเปิดในสมุดคะแนน`}>
        <span class="lbl" title={a.assignment.title}>{a.assignment.title}<span class="due">{due}</span></span>
        <div class={"track" + (final ? "" : " pending")}>{final && rate != null && <div class={tone} style={`width:${rate}%`} />}</div>
        <span class="num">{assignmentFraction(a)}</span>
        <span class={"pct" + (final ? "" : " soft")}>{pctText}</span>
        <span class={"avg" + (avg == null ? " soft" : "")}>{avgText}</span>
      </button>
    );
  };

  const view: Record<ReportsCard, () => preact.JSX.Element> = {
    stats: () => card("stats", "rc-st", "chart-bar", "ตัวเลขสรุป", (
      <dl class="rp-dl">
        {([["นักเรียน", model.students.length], ["งาน", model.assignments.length], ["ส่งแล้ว", t.submitted], ["ค้างส่ง", model.metrics.missingCount],
          ["ยังไม่ถึงกำหนด", t.pending], ["รอตรวจ", t.awaiting], ["ขาดรวม", mix.absent]] as [string, number][]).map(([l, v]) => (
          <div key={l}><dt>{l}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    )),
    works: () => {
      const rows = workRows(model.assignments);
      const shown = rows.slice(0, WORKS_SHOWN);
      return card("works", "rc-wk", "clipboard-list", "อัตราการส่งรายงาน", (
        <>
          {model.assignments.length === 0 ? (
            <div class="page-sub">
              {onFullTerm ? `ยังไม่มีงานที่มอบหมายใน ${periodLabel ?? "เดือนนี้"}` : "ยังไม่มีงานในช่วงนี้"}
              {onFullTerm && <> <button class="ghost" onClick={onFullTerm}>ดูทั้งเทอม</button></>}
            </div>
          ) : <div class="rp-bars">{shown.map(workRow)}</div>}
          {rows.length > WORKS_SHOWN && (
            <button class="ghost rp-all" aria-haspopup="dialog" onClick={() => setAllWorks(true)}>ดูทั้งหมด ({rows.length}) <Icon name="chevron-right" size={16} /></button>
          )}
          <div class="rp-legend">
            <span><span class="dot f-ok" />85% ขึ้นไป</span>
            <span><span class="dot f-mid" />60–84%</span>
            <span><span class="dot f-low" />ต่ำกว่า 60%</span>
            <span><span class="dot" style="border:1.5px dashed var(--text-secondary)" />ยังไม่ถึงกำหนด</span>
          </div>
          {allWorks && (
            <Drawer title="อัตราการส่งรายงานทั้งหมด" onClose={() => setAllWorks(false)}><div class="rp-bars">{rows.map(workRow)}</div></Drawer>
          )}
        </>
      ), model.assignments.length > 0 ? <span class="page-sub">{model.assignments.length} งาน</span> : undefined);
    },
    att: () => card("att", "rc-at", "user-check", `การมาเรียน${model.attendance.unit === "period" ? " (รายคาบ)" : ""}`, (
      <>
        {attTotal === 0 && <div class="page-sub">ยังไม่มีข้อมูลเช็คชื่อในช่วงนี้ <button class="ghost" onClick={() => navigate("/attendance", { class: classId })}>ไปเช็คชื่อ</button></div>}
        {attTotal > 0 && (
          <div role="img" aria-label={`มา ${mix.present} สาย ${mix.late} ลา ${mix.leave} ป่วย ${mix.sick} ขาด ${mix.absent}`}>
            <StackBar segments={[
              { value: mix.present, color: "var(--fill-success)" }, { value: mix.late, color: "var(--fill-warning)" },
              { value: mix.leave, color: "var(--fill-accent)" }, { value: mix.sick, color: "var(--rp-purple)" }, { value: mix.absent, color: "var(--rp-danger)" },
            ]} />
          </div>
        )}
        {attTotal > 0 && <div class="rp-attleg" aria-hidden="true">
          <span class="ok"><Icon name="check" size={16} />มา {mix.present}</span>
          <span class="late"><Icon name="clock" size={16} />สาย {mix.late}</span>
          <span class="leave"><Icon name="file-text" size={16} />ลา {mix.leave}</span>
          <span class="sick"><Icon name="thermometer" size={16} />ป่วย {mix.sick}</span>
          <span class="abs"><Icon name="x" size={16} />ขาด {mix.absent}</span>
        </div>}
      </>
    ), <span class="page-sub" style="font-variant-numeric:tabular-nums">{attTotal.toLocaleString("th-TH")} ครั้ง · {model.attendance.sessions} {unitLabel}</span>),
    follow: () => card("follow", "rc-fl", "flag", `ต้องติดตาม (${model.followUp.length} คน)`, (
      <>
        {model.followUp.length === 0 ? (
          <div class="page-sub" style="color:var(--text-success)"><Icon name="circle-check" size={16} /> ส่งงานครบทุกคน</div>
        ) : <FollowRows model={model} hide={hide} limit={allFollow ? undefined : FOLLOW_SHOWN} onOpen={onOpenStudent} />}
        {model.followUp.length > FOLLOW_SHOWN && (
          <button class="ghost" style="width:100%" aria-expanded={allFollow} onClick={() => setAllFollow((v) => !v)}>
            {allFollow ? `แสดงแค่ ${FOLLOW_SHOWN} คน` : `ดูทั้งหมด (${model.followUp.length})`} <Icon name={allFollow ? "chevron-up" : "chevron-down"} size={16} />
          </button>
        )}
      </>
    ), model.followUp.length > 0 ? (
      <span class="rp-copywrap">
        <button class="ghost rp-copy" onClick={copy} disabled={hide} aria-describedby={hide ? "rc-fl-why" : undefined}><Icon name={copied ? "check" : "brand-line"} size={20} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไป LINE"}</button>
        {hide && <span id="rc-fl-why" class="rp-why">ปิดอยู่ตอนซ่อนชื่อ</span>}
      </span>
    ) : undefined),
    hist: () => card("hist", "rc-hs", "chart-histogram", "การกระจายคะแนนสะสม", (
      <>
        <div role="img" aria-label={bucketsLabel(buckets)}>
          <div class="rp-hist" aria-hidden="true">
            {buckets.map((n, i) => <div class="col" key={i}><span class="n">{n}</span><div class={"bar " + bucketClass[i]} style={`--h:${(n / maxBucket).toFixed(3)}`} /></div>)}
          </div>
          <div class="rp-histx" aria-hidden="true"><span>&lt;50</span><span>50–59</span><span>60–69</span><span>70–79</span><span>80+</span></div>
        </div>
        {counted < model.students.length && <div class="page-sub">ไม่นับ {model.students.length - counted} คนที่ยังไม่มีคะแนนเต็ม</div>}
      </>
    ), <span class="page-sub">{model.students.length} คน</span>),
    absent: () => card("absent", "rc-ab", "user-x", `ขาดบ่อย (ขาด ≥ ${ABSENT_MIN} ครั้ง)`, (
      <>
        {hide ? <div class="page-sub">ปิดอยู่ตอนซ่อนชื่อ (การ์ดนี้เป็นรายชื่อ)</div>
          : attTotal === 0 ? <div class="page-sub">ยังไม่มีข้อมูลเช็คชื่อในช่วงนี้</div>
          : often.length === 0 ? <div class="page-sub" style="color:var(--text-success)"><Icon name="circle-check" size={16} /> ไม่มีใครขาด {ABSENT_MIN} ครั้งขึ้นไป</div>
          : <AbsentRows list={often.slice(0, ABSENT_SHOWN)} onOpen={onOpenStudent} />}
        {!hide && often.length > ABSENT_SHOWN && (
          <button class="ghost rp-all" aria-haspopup="dialog" onClick={() => setAllAbsent(true)}>ดูทั้งหมด ({often.length}) <Icon name="chevron-right" size={16} /></button>
        )}
        {allAbsent && !hide && (
          <Drawer title={`ขาดบ่อย (${often.length} คน)`} onClose={() => setAllAbsent(false)}><AbsentRows list={often} onOpen={(id) => { setAllAbsent(false); onOpenStudent(id); }} /></Drawer>
        )}
        <div class="rp-note">เกณฑ์: ขาด ≥ {ABSENT_MIN} ครั้งในช่วงนี้</div>
      </>
    )),
  };
  return <PageCols keys={keys} max={max} weightOf={(k) => REPORTS_WEIGHT[k] ?? W.M} render={(k) => view[k]()} />;
}

/** Width of the page body (rem) from which the table and the cards sit side by side. */
export const REPORT_SPLIT_REM = 56;

/**
 * The body of the page. One DOM order always — the table, then the cards — so the reading order never changes with the width (G-R12).
 * Wide (>= 56rem of the page body, and at least one card on): the table on the left, the cards in one column on the right. Narrower: the
 * cards (1-2 columns) sit above the table by CSS grid areas. No cards: the table alone, with a line that says why the rest is gone.
 */
export function ReportBody({ table, cards }: { table: ComponentChildren; cards: (max: number) => ComponentChildren }) {
  const [ref, rem] = useRegionRem<HTMLDivElement>();
  const has = visibleCards(reportsLayout.value).length > 0;
  const split = has && rem >= REPORT_SPLIT_REM;
  return (
    <div ref={ref} class={"rp-body" + (split ? " lg" : "")} data-split={split ? "lg" : "stack"}>
      <div class={has ? "pg-main" : "pg-solo"}>{table}</div>
      {has ? <div class="pg-aside">{cards(split ? 1 : 2)}</div> : <p class="rp-alloff" role="note">ปิดการ์ดทั้งหมดอยู่ — เปิดได้ที่ “ปรับการ์ด”</p>}
    </div>
  );
}

interface PrintProps {
  model: ReportModel; payload: ReportPayload | null; className: string; subjectName: string;
  /** "ภาคเรียนที่ 1/2569" */
  termLabel: string;
  /** "พ.ย. 2569" when the page shows one month, otherwise null */
  monthLabel: string | null;
  updatedAt: number | null;
  sort: SortState; onClose: () => void;
  /** the page hides names: the sheet prints "เลขที่ N" instead of the name (AC-167) */
  hide?: boolean;
}

/**
 * The A4 preview in the page: what "พิมพ์" will put on paper — the cards the teacher keeps on (black on white, no colour), then one row
 * per child (switch off for the summary alone). The cards switched off in "ปรับการ์ด" are not printed; the people table always is.
 */
/** "1 ต.ค. 2569 – 10 พ.ย. 2569", or — when the month asked for lies outside the term, so the range would run backwards — the plain fact (B-06) */
export function rangeText(range: { from: string | null; to: string | null }): string {
  if (!range.from) return "";
  if (range.to && range.to < range.from) return "เดือนนี้อยู่นอกภาคเรียน (ไม่มีวันเรียนในช่วงนี้)";
  return `${formatThaiDate(range.from)} – ${range.to ? formatThaiDate(range.to) : "ปัจจุบัน"}`;
}

export function ReportPrint({ model, payload, className, subjectName, termLabel, monthLabel, updatedAt, sort, onClose, hide = false }: PrintProps) {
  const [summaryOnly, setSummaryOnly] = useState(false);
  const printBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { printBtn.current?.focus(); }, []); // focus starts on [พิมพ์]
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  useEffect(() => {
    const on = () => document.body.classList.add("print-report");
    const off = () => document.body.classList.remove("print-report");
    window.addEventListener("beforeprint", on); window.addEventListener("afterprint", off);
    return () => { off(); window.removeEventListener("beforeprint", on); window.removeEventListener("afterprint", off); };
  }, []);
  function print() { document.body.classList.add("print-report"); window.print(); document.body.classList.remove("print-report"); }
  const school = settings.value?.school_name ?? "";
  const teacher = settings.value?.teacher_name ?? "";
  const mix = attendanceMix(model);
  const rows = sortStudents(model.students, sort);
  const on = visibleCards(reportsLayout.value) as string[]; // the cards the teacher keeps on are the ones on paper too
  const buckets = scoreBuckets(model.students);
  const stamp = updatedAt ?? Date.now();
  return (
    <div class="rp-printwrap">
      <div class="rp-printbar no-print">
        <Icon name="printer" size={20} />
        <span class="grow"><b>ตัวอย่างก่อนพิมพ์ (A4 แนวตั้ง)</b> · พิมพ์{summaryOnly ? "เฉพาะสรุป" : "สรุป + รายบุคคล"} · ไม่พิมพ์ปุ่ม ตัวกรอง เมนู</span>
        <label class="rnd-opt"><input type="checkbox" checked={summaryOnly} onChange={(e) => setSummaryOnly((e.target as HTMLInputElement).checked)} /> สรุปอย่างเดียว (ไม่มีรายบุคคล)</label>
        <button class="primary" ref={printBtn} onClick={print}><Icon name="printer" size={16} /> พิมพ์</button>
        <button class="ghost" onClick={onClose}><Icon name="arrow-left" size={16} /> กลับ</button>
      </div>
      <article class="rp-sheet" aria-label="ตัวอย่างหน้า A4">
        <header>
          <div class="rp-sheet-school">{[school, teacher].filter(Boolean).join(" · ")}</div>
          <h1>รายงานสรุป {className}</h1>
          <div>{subjectName} · {termLabel}{monthLabel ? ` · ${monthLabel}` : ""}</div>
          {hide && <div class="rp-sheet-meta">แสดงเลขที่แทนชื่อ</div>}
          <div class="rp-sheet-meta">ข้อมูล ณ {formatThaiDateMs(stamp)} {formatThaiTimeMs(stamp)}{payload?.range.from ? ` · ช่วงข้อมูล ${rangeText(payload.range)}` : ""}</div>
        </header>
        {on.includes("stats") && (
          <section class="rp-sheet-nums" aria-label="สรุป">
            <div><b>{submitRateView(model) == null ? "—" : submitRateView(model) + "%"}</b><span>อัตราส่งงาน</span></div>
            <div><b>{model.metrics.missingCount}</b><span>งานค้าง (ชิ้น)</span></div>
            <div><b>{avgScoreView(model) == null ? "—" : avgScoreView(model) + "%"}</b><span>คะแนนเฉลี่ย</span></div>
            <div><b>{model.metrics.attendanceRate == null ? "—" : model.metrics.attendanceRate + "%"}</b><span>มาเรียน</span></div>
          </section>
        )}
        {on.includes("works") && (
          <section>
            <h2>อัตราการส่งรายงาน</h2>
            {model.assignments.length === 0 ? <p class="rp-sheet-meta">ยังไม่มีงานในช่วงนี้</p> : (
              <table class="rp-sheet-table">
                <thead><tr><th>งาน</th><th class="num">เต็ม</th><th class="num">ส่งแล้ว</th><th class="num">อัตรา</th><th class="num">เฉลี่ย</th></tr></thead>
                <tbody>{model.assignments.map((a) => (
                  <tr key={a.assignment.id}>
                    <td>{a.assignment.title}</td><td class="num">{a.assignment.full_score}</td><td class="num">{assignmentFraction(a)}</td>
                    <td class="num">{showsRate(a.assignment, model.today) ? (workRateView(a) == null ? "—" : a.rate + "%") : "เก็บอยู่"}</td>
                    <td class="num">{workAverageView(a) == null ? "—" : a.average + "%"}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        )}
        {on.includes("att") && (
          <section>
            <h2>การมาเรียน</h2>
            <p class="rp-sheet-meta">มา {mix.present} · สาย {mix.late} · ลา {mix.leave} · ป่วย {mix.sick} · ขาด {mix.absent} ({model.attendance.sessions} {model.attendance.unit === "period" ? "คาบ" : "วัน"})</p>
          </section>
        )}
        {on.includes("hist") && (
          <section>
            <h2>การกระจายคะแนนสะสม</h2>
            <p class="rp-sheet-meta">{["ต่ำกว่า 50%", "50–59%", "60–69%", "70–79%", "80% ขึ้นไป"].map((l, i) => `${l}: ${buckets[i]} คน`).join(" · ")}</p>
          </section>
        )}
        {on.includes("follow") && model.followUp.length > 0 && (
          <section>
            <h2>ต้องติดตาม ({model.followUp.length} คน)</h2>
            <table class="rp-sheet-table">
              <thead><tr><th>#</th><th>ชื่อ</th><th>งานที่ค้าง</th></tr></thead>
              <tbody>{model.followUp.map((f) => <tr key={f.student.id}><td>{f.student.number ?? "-"}</td><td>{nameOf(f.student, fullName(f.student), hide)}</td><td>{f.missing.join(" · ")}</td></tr>)}</tbody>
            </table>
          </section>
        )}
        {!summaryOnly && (
          <section class="rp-sheet-people">
            <h2>รายบุคคล</h2>
            <table class="rp-sheet-table">
              <thead><tr><th>#</th><th>ชื่อ</th><th class="num">ส่ง</th><th class="num">ค้าง</th><th class="num">สะสม</th><th class="num">มา</th></tr></thead>
              <tbody>{rows.map((s) => {
                const sp = scorePercent(s.score, s.fullScore), ap = attendancePercent(s.attendance);
                return <tr key={s.student.id}><td>{s.student.number ?? "-"}</td><td>{nameOf(s.student, fullName(s.student), hide)}</td><td class="num">{s.submitted}/{s.applicable}</td><td class="num">{s.missing || ""}</td><td class="num">{sp != null ? sp + "%" : "—"}</td><td class="num">{ap != null ? ap + "%" : "—"}</td></tr>;
              })}</tbody>
            </table>
          </section>
        )}
      </article>
    </div>
  );
}

/** TV mode of the report: class totals only — no names, no child's score, no list of who is behind (D26/D27). */
export function ReportProjector({ model, className, subjectName, periodLabel, size, unitLabel }: {
  model: ReportModel; className: string; subjectName: string; periodLabel: string; size: 1 | 2 | 3; unitLabel: string;
}) {
  const mix = attendanceMix(model);
  const total = mix.present + mix.late + mix.leave + mix.sick + mix.absent;
  const { shown, more } = projectorWorkRows(model.assignments, size);
  const rate = submitRateView(model); // "—" when nothing is due yet, never 0% (BR-38)
  return (
    <ProjectorShell page="reports">
      <div class="s2" style="font-size:calc(var(--pj-u)*34);color:var(--pj-t1);font-weight:600;flex:none">{className} · {subjectName} · {periodLabel}</div>
      <div class="rp-pj-nums">
        <div><div class="stat">{rate == null ? "—" : rate + "%"}</div><div class="s2">ส่งงานแล้ว</div></div>
        <div><div class="stat">{model.metrics.missingCount}</div><div class="s2">งานค้าง ชิ้น</div></div>
        <div><div class="stat">{model.metrics.attendanceRate == null ? "—" : model.metrics.attendanceRate + "%"}</div><div class="s2">มาเรียน</div></div>
      </div>
      <div class="s2" style="flex:none;font-size:calc(var(--pj-u)*22)">ไม่มีชื่อนักเรียนบนจอนี้</div>
      {shown.length === 0 ? <div class="empty">ยังไม่มีงานในช่วงนี้</div> : (
        <div class={"rp-pj-works" + (shown.length > (size === 3 ? 3 : 4) ? " two" : "")}>
          {shown.map((a) => (
            <div class="rp-pj-work" key={a.assignment.id}>
              <div class="rp-pj-line"><span class="rp-pj-title" title={a.assignment.title}>{a.assignment.title}</span><span class="rp-pj-frac">ส่งแล้ว {a.submitted} จาก {a.total - a.excused}</span></div>
              <div class="pbar"><div style={`width:${workRateView(a) ?? 0}%`} /></div>
            </div>
          ))}
        </div>
      )}
      {more > 0 && <div class="s2" style="flex:none">และอีก {more} งาน</div>}
      {total > 0 && (
        <div style="flex:none">
          <StackBar segments={[
            { value: mix.present, color: "var(--pj-ok)" }, { value: mix.late, color: "var(--pj-warn)" }, { value: mix.leave, color: "var(--pj-ac)" },
            { value: mix.sick, color: "var(--pj-t2)" }, { value: mix.absent, color: "var(--pj-bad)" },
          ]} />
          <div class="s2" style="margin-top:calc(var(--pj-u)*6)">มา {mix.present} · สาย {mix.late} · ลา {mix.leave} · ป่วย {mix.sick} · ขาด {mix.absent} <span style="opacity:.8">({total.toLocaleString("th-TH")} ครั้ง · {model.attendance.sessions} {unitLabel})</span></div>
        </div>
      )}
    </ProjectorShell>
  );
}

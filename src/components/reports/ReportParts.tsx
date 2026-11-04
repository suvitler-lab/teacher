import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../Icon";
import { CardHead } from "../home/shared";
import { StackBar } from "../ui";
import { ProjectorShell } from "../Projector";
import { PageCols, useRegionRem } from "../PageCols";
import { REPORTS_WEIGHT } from "../cards/meta";
import { W } from "../../lib/pageColumns";
import { reportsLayout } from "../../lib/pageCards";
import { visibleCards } from "../../lib/cardLayout";
import type { ReportsCard } from "../../lib/pageCards";
import type { ReportModel, ReportPayload, StudentReport } from "../../lib/report";
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

/** One of the four numbers above the cards (a button when it goes somewhere). */
function RpStat({ label, value, unit, hint, icon, tone = "accent", danger, onClick }: {
  label: string; value: ComponentChildren; unit?: string; hint: string; icon: string; tone?: "accent" | "success" | "danger"; danger?: boolean; onClick?: () => void;
}) {
  const cls = "rp-stat" + (danger ? " danger" : "");
  const inner = (
    <>
      <span class="top"><span class="sl">{label}</span><span class={"ic " + tone}><Icon name={icon} size={20} /></span></span>
      <span class="val">{value}{unit && <small> {unit}</small>}</span>
      <span class="hint" title={hint}>{hint}</span>
    </>
  );
  return onClick ? <button type="button" class={cls} onClick={onClick}>{inner}</button> : <div class={cls}>{inner}</div>;
}

interface CardsProps {
  model: ReportModel; classId: string; unitLabel: string;
  /** most columns the cards may use (1 beside the table, 2 when they sit above it) */
  max: number;
  /** what the page covers, e.g. "พ.ย. 2569" — named when a month has no work */
  periodLabel?: string;
  onOpenStudent: (id: string) => void;
  /** copies the LINE text; resolves true when it worked (the button then says "คัดลอกแล้ว") */
  onCopyLine: () => Promise<boolean> | void;
  /** set when the page shows one month: an empty month offers the whole term */
  onFullTerm?: () => void;
}

/** The cards, in the order and with the visibility the teacher chose, spread over the columns that fit (the table itself is fixed). */
export function ReportCards({ model, classId, unitLabel, max, periodLabel, onOpenStudent, onCopyLine, onFullTerm }: CardsProps) {
  const keys = visibleCards(reportsLayout.value) as ReportsCard[];
  const [allFollow, setAllFollow] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const mix = attendanceMix(model);
  const attTotal = mix.present + mix.late + mix.leave + mix.sick + mix.absent;
  const buckets = scoreBuckets(model.students);
  const maxBucket = Math.max(1, ...buckets);
  const sub = model.students.reduce((n, s) => n + s.submitted, 0), app = model.students.reduce((n, s) => n + s.applicable, 0), pend = model.students.reduce((n, s) => n + s.pending, 0);

  async function copy() {
    const r = await onCopyLine();
    if (r === false) return;
    setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  const view: Record<ReportsCard, () => preact.JSX.Element> = {
    stats: () => (
      <div class="rp-statwrap"><div class="rp-stats">
        <RpStat label="อัตราส่งงาน" value={`${model.metrics.submitRate}%`} tone="success" icon="checks" hint={`ส่งแล้ว ${sub} จาก ${app} ที่ถึงกำหนด` + (pend > 0 ? ` · ยังไม่ถึงกำหนด ${pend}` : "")} />
        <RpStat label="งานค้าง" value={model.metrics.missingCount} unit="ชิ้น" danger tone="danger" icon="alert-circle" hint={`นักเรียน ${model.followUp.length} คน`}
          onClick={() => document.getElementById("rc-fl")?.scrollIntoView?.({ block: "center", behavior: "smooth" })} />
        <RpStat label="คะแนนเฉลี่ย" value={`${model.metrics.avgScorePercent}%`} icon="star" hint="คะแนนสะสม · ค้างส่งนับ 0" />
        <RpStat label="มาเรียน" value={model.metrics.attendanceRate == null ? "—" : `${model.metrics.attendanceRate}%`} tone="success" icon="user-check"
          hint={model.metrics.attendanceRate == null ? "ยังไม่มีข้อมูลเช็คชื่อในช่วงนี้" : `จาก ${model.attendance.sessions} ${unitLabel} · ขาดรวม ${mix.absent} ครั้ง`}
          onClick={() => navigate("/attendance", { class: classId })} />
      </div></div>
    ),
    works: () => (
      <section class="card rp-card" aria-labelledby="rc-wk">
        <CardHead id="rc-wk" icon="clipboard-list" title="อัตราการส่งรายงาน" extra={model.assignments.length > 0 ? <span class="page-sub">{model.assignments.length} งาน</span> : undefined} />
        {model.assignments.length === 0 ? (
          <div class="page-sub">
            {onFullTerm ? `ยังไม่มีงานที่มอบหมายใน ${periodLabel ?? "เดือนนี้"}` : "ยังไม่มีงานในช่วงนี้"}
            {onFullTerm && <> <button class="ghost" onClick={onFullTerm}>ดูทั้งเทอม</button></>}
          </div>
        ) : (
          <div class="rp-bars">
            {model.assignments.map((a) => {
              const overdue = !!a.assignment.due_date && model.today > a.assignment.due_date;
              const tone = a.rate >= 85 ? "f-ok" : a.rate >= 60 ? "f-mid" : "f-low";
              return (
                <button class="rp-work" key={a.assignment.id} onClick={() => navigate("/gradebook", { class: classId, asg: a.assignment.id })} aria-label={`${a.assignment.title} ส่งแล้ว ${assignmentFraction(a)} — เปิดในสมุดคะแนน`}>
                  <span class="lbl" title={a.assignment.title}>{a.assignment.title}</span>
                  <div class={"track" + (overdue ? "" : " pending")}>{overdue && <div class={tone} style={`width:${a.rate}%`} />}</div>
                  <span class="num">{assignmentFraction(a)}</span>
                  <span class={"pct" + (overdue ? "" : " soft")}>{overdue ? a.rate + "%" : "เก็บอยู่"}</span>
                </button>
              );
            })}
          </div>
        )}
        <div class="rp-legend">
          <span><span class="dot f-ok" />85% ขึ้นไป</span>
          <span><span class="dot f-mid" />60–84%</span>
          <span><span class="dot f-low" />ต่ำกว่า 60%</span>
          <span><span class="dot" style="border:1.5px dashed var(--text-secondary)" />ยังไม่ถึงกำหนด</span>
        </div>
      </section>
    ),
    att: () => (
      <section class="card rp-card" aria-labelledby="rc-at">
        <CardHead id="rc-at" icon="user-check" title={`การมาเรียน${model.attendance.unit === "period" ? " (รายคาบ)" : ""}`} link="เช็คชื่อ ›" onLink={() => navigate("/attendance", { class: classId })}
          extra={<span class="page-sub" style="font-variant-numeric:tabular-nums">{attTotal.toLocaleString("th-TH")} ครั้ง · {model.attendance.sessions} {unitLabel}</span>} />
        {attTotal === 0 && <div class="page-sub">ยังไม่มีข้อมูลเช็คชื่อในช่วงนี้</div>}
        {attTotal > 0 && (
          <div role="img" aria-label={`มา ${mix.present} สาย ${mix.late} ลา ${mix.leave} ป่วย ${mix.sick} ขาด ${mix.absent}`}>
            <StackBar segments={[
              { value: mix.present, color: "var(--fill-success)" }, { value: mix.late, color: "var(--fill-warning)" },
              { value: mix.leave, color: "var(--fill-accent)" }, { value: mix.sick, color: "var(--rp-purple)" }, { value: mix.absent, color: "var(--rp-danger)" },
            ]} />
          </div>
        )}
        {attTotal > 0 && <div class="rp-attleg">
          <span class="ok"><Icon name="check" size={16} />มา {mix.present}</span>
          <span class="late"><Icon name="clock" size={16} />สาย {mix.late}</span>
          <span class="leave"><Icon name="file-text" size={16} />ลา {mix.leave}</span>
          <span class="sick"><Icon name="thermometer" size={16} />ป่วย {mix.sick}</span>
          <span class="abs"><Icon name="x" size={16} />ขาด {mix.absent}</span>
        </div>}
      </section>
    ),
    follow: () => {
      const list = allFollow ? model.followUp : model.followUp.slice(0, FOLLOW_SHOWN);
      return (
        <section class="card rp-card" aria-labelledby="rc-fl">
          <CardHead id="rc-fl" icon="flag" title={`ต้องติดตาม (${model.followUp.length} คน)`}
            extra={model.followUp.length > 0 ? <button class="ghost rp-copy" onClick={copy}><Icon name={copied ? "check" : "brand-line"} size={20} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไป LINE"}</button> : undefined} />
          {model.followUp.length === 0 ? (
            <div class="page-sub" style="color:var(--text-success)"><Icon name="circle-check" size={16} /> ส่งงานครบทุกคน</div>
          ) : list.map((f) => (
            <button class="rp-follow" key={f.student.id} onClick={() => onOpenStudent(f.student.id)}>
              <span class="no">{f.student.number ?? "-"}</span>
              <span class="who"><span class="nm">{fullName(f.student)}</span><span class="what">{f.missing.slice(0, 3).join(" · ")}{f.missing.length > 3 ? " …" : ""}</span></span>
              <span class="chip"><Icon name="alert-circle" size={16} /> ค้าง {f.missing.length}</span>
            </button>
          ))}
          {model.followUp.length > FOLLOW_SHOWN && (
            <button class="ghost" style="width:100%" aria-expanded={allFollow} onClick={() => setAllFollow((v) => !v)}>
              {allFollow ? `แสดงแค่ ${FOLLOW_SHOWN} คน` : `ดูทั้งหมด (${model.followUp.length})`} <Icon name={allFollow ? "chevron-up" : "chevron-down"} size={16} />
            </button>
          )}
        </section>
      );
    },
    hist: () => (
      <section class="card rp-card" aria-labelledby="rc-hs">
        <CardHead id="rc-hs" icon="chart-histogram" title="การกระจายคะแนนสะสม" extra={<span class="page-sub">{model.students.length} คน</span>} />
        <div class="rp-hist">
          {buckets.map((n, i) => <div class="col" key={i}><span class="n">{n}</span><div class={"bar " + bucketClass[i]} style={`--h:${(n / maxBucket).toFixed(3)}`} /></div>)}
        </div>
        <div class="rp-histx"><span>&lt;50</span><span>50–59</span><span>60–69</span><span>70–79</span><span>80+</span></div>
      </section>
    ),
  };
  return <PageCols keys={keys} max={max} weightOf={(k) => REPORTS_WEIGHT[k] ?? W.M} render={(k) => view[k]()} />;
}

/** Width of the page body (rem) from which the table and the cards sit side by side. */
export const REPORT_SPLIT_REM = 56;

/**
 * The body of the page. Wide (>= 56rem of the page body, and at least one card on): the table on the left, the cards in one column
 * on the right. Narrower: the cards (1-2 columns) above the table. No cards: the table alone, kept readable (64rem). The width that
 * decides it is the body's own, so a bigger text size falls back to the stacked form by itself.
 */
export function ReportBody({ table, cards }: { table: ComponentChildren; cards: (max: number) => ComponentChildren }) {
  const [ref, rem] = useRegionRem<HTMLDivElement>();
  const has = visibleCards(reportsLayout.value).length > 0;
  const split = has && rem >= REPORT_SPLIT_REM;
  const tableNode = <div key="t" class={has ? "pg-main" : "pg-solo"}>{table}</div>;
  const cardsNode = has ? <div key="c" class="pg-aside">{cards(split ? 1 : 2)}</div> : null;
  return (
    <div ref={ref} class={"rp-body pg-split" + (split ? " lg" : "")} data-split={split ? "lg" : "stack"}>
      {split ? [tableNode, cardsNode] : [cardsNode, tableNode]}
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

export function ReportPrint({ model, payload, className, subjectName, termLabel, monthLabel, updatedAt, sort, onClose }: PrintProps) {
  const [summaryOnly, setSummaryOnly] = useState(false);
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
        <button class="primary" onClick={print}><Icon name="printer" size={16} /> พิมพ์</button>
        <button class="ghost" onClick={onClose}><Icon name="arrow-left" size={16} /> กลับ</button>
      </div>
      <article class="rp-sheet" aria-label="ตัวอย่างหน้า A4">
        <header>
          <div class="rp-sheet-school">{[school, teacher].filter(Boolean).join(" · ")}</div>
          <h1>รายงานสรุป {className}</h1>
          <div>{subjectName} · {termLabel}{monthLabel ? ` · ${monthLabel}` : ""}</div>
          <div class="rp-sheet-meta">ข้อมูล ณ {formatThaiDateMs(stamp)} {formatThaiTimeMs(stamp)}{payload?.range.from ? ` · ช่วงข้อมูล ${rangeText(payload.range)}` : ""}</div>
        </header>
        {on.includes("stats") && (
          <section class="rp-sheet-nums" aria-label="สรุป">
            <div><b>{model.metrics.submitRate}%</b><span>อัตราส่งงาน</span></div>
            <div><b>{model.metrics.missingCount}</b><span>งานค้าง (ชิ้น)</span></div>
            <div><b>{model.metrics.avgScorePercent}%</b><span>คะแนนเฉลี่ย</span></div>
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
                    <td class="num">{a.assignment.due_date && model.today > a.assignment.due_date ? a.rate + "%" : "เก็บอยู่"}</td>
                    <td class="num">{a.scoredCount > 0 ? a.average + "%" : "—"}</td>
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
              <tbody>{model.followUp.map((f) => <tr key={f.student.id}><td>{f.student.number ?? "-"}</td><td>{fullName(f.student)}</td><td>{f.missing.join(" · ")}</td></tr>)}</tbody>
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
                return <tr key={s.student.id}><td>{s.student.number ?? "-"}</td><td>{fullName(s.student)}</td><td class="num">{s.submitted}/{s.applicable}</td><td class="num">{s.missing || ""}</td><td class="num">{sp != null ? sp + "%" : "—"}</td><td class="num">{ap != null ? ap + "%" : "—"}</td></tr>;
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
  return (
    <ProjectorShell page="reports">
      <div class="s2" style="font-size:calc(var(--pj-u)*34);color:var(--pj-t1);font-weight:600;flex:none">{className} · {subjectName} · {periodLabel}</div>
      <div class="rp-pj-nums">
        <div><div class="stat">{model.metrics.submitRate}%</div><div class="s2">ส่งแล้ว</div></div>
        <div><div class="stat">{model.metrics.missingCount}</div><div class="s2">ค้าง ชิ้น</div></div>
        <div><div class="stat">{model.metrics.attendanceRate == null ? "—" : model.metrics.attendanceRate + "%"}</div><div class="s2">มาเรียน</div></div>
      </div>
      {shown.length === 0 ? <div class="empty">ยังไม่มีงานในช่วงนี้</div> : (
        <div class={"rp-pj-works" + (shown.length > (size === 3 ? 3 : 4) ? " two" : "")}>
          {shown.map((a) => (
            <div class="rp-pj-work" key={a.assignment.id}>
              <div class="rp-pj-line"><span class="rp-pj-title">{a.assignment.title}</span><span class="rp-pj-frac">ส่งแล้ว {a.submitted} จาก {a.total - a.excused}</span></div>
              <div class="pbar"><div style={`width:${a.rate}%`} /></div>
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
          <div class="s2" style="margin-top:calc(var(--pj-u)*6)">มา {mix.present} · สาย {mix.late} · ขาด {mix.absent} <span style="opacity:.8">({total.toLocaleString("th-TH")} ครั้ง · {model.attendance.sessions} {unitLabel})</span></div>
        </div>
      )}
    </ProjectorShell>
  );
}

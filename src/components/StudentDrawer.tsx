import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/students.css";
import { Icon } from "./Icon";
import { Drawer, Avatar, StackBar } from "./ui";
import { api } from "../lib/api";
import { computeReport, type ReportModel, type ReportPayload, type StudentReport } from "../lib/report";
import { classById, selectedTermId, studentsById, subjectById, workTypeById } from "../store";
import { fullName } from "../lib/names";
import type { Student } from "@shared/types";
import { scorePercent, attendancePercent, workState } from "@shared/metrics";
import { bkkToday } from "@shared/time";
import { formatThaiDate, formatThaiDayMonthMs } from "../lib/dates";
import { navigate } from "../router";

const METHOD_LABEL: Record<string, string> = { camera: "สแกนกล้อง", hid: "เครื่องยิง", manual: "กรอกเอง", grid: "ตาราง", bulk: "ทั้งห้อง", import: "นำเข้า", restore: "กู้คืน" };
const ENTITY_LABEL: Record<string, string> = { submission: "ส่งงาน/คะแนน", attendance: "เช็คชื่อ", qr: "บัตร QR", assignment: "งาน", student: "นักเรียน" };

function describeAudit(r: any): string {
  if (r.entity === "submission") {
    const b = r.before?.score, a = r.after?.score;
    if (r.action === "void") return "ยกเลิกการส่ง";
    if (b != null && a != null && b !== a) return `คะแนน ${b} → ${a}`;
    if (a != null) return `ให้คะแนน ${a}`;
    return "รับงาน";
  }
  if (r.entity === "attendance" && r.action === "void") return "ยกเลิกการเช็ค";
  if (r.entity === "attendance") return `เช็คชื่อ: ${({ present: "มา", late: "สาย", leave: "ลา", sick: "ป่วย", absent: "ขาด" } as Record<string, string>)[String(r.after?.status)] ?? r.after?.status ?? "-"}`;
  if (r.entity === "qr") return "ออก QR ใหม่";
  return ENTITY_LABEL[r.entity] ?? r.action;
}

interface MissingRow { id: string | null; title: string; subject: string | null; type: string | null; due: string | null }

export function StudentDrawer({ studentId, classId, onClose, onEdit, onCopyMissing, data, scopeLabel, onFullTerm, from = "students", onRotate, hide = false, readOnly = false, onMove, onLeave }: {
  studentId: string; classId: string; onClose: () => void;
  onEdit: (s: Student) => void; onCopyMissing?: (titles: string[]) => void;
  /** the report the page already shows (its subject / month filters): used as it is, no second request */
  data?: { model: ReportModel; payload: ReportPayload };
  /** what the numbers cover, e.g. "คณิตศาสตร์ · พ.ย. 2569" — shown as a chip under the name (the reports page) */
  scopeLabel?: string;
  /** shown next to the scope: go back to the whole term */
  onFullTerm?: () => void;
  /** which page opened it: the reports page leads to the gradebook, the students page to editing */
  from?: "reports" | "students";
  /** the students page: issue a new QR for this child (the page asks first) */
  onRotate?: (s: Student) => void;
  /** names hidden on the page that opened it: the name, nickname and code become "เลขที่ N" everywhere in here (default false = as before) */
  hide?: boolean;
  /** an earlier school year: no button that writes (AC-185) */
  readOnly?: boolean;
  /** the students page: move class / move out (the page opens its own dialog) */
  onMove?: (s: Student) => void;
  onLeave?: (s: Student) => void;
}) {
  const student = studentsById.value.get(studentId);
  const [report, setReport] = useState<StudentReport | null>(null);
  const [missing, setMissing] = useState<MissingRow[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unknown">("loading");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    // opening another student (or term) must not leave the previous one's numbers on screen,
    // and a slow answer for the previous one must not land on this one
    let live = true;
    setReport(null); setMissing([]); setAudit([]); setStatus("loading");
    (async () => {
      let p: ReportPayload | null = null, model: ReportModel | null = null;
      let sr: StudentReport | null = null;
      if (data) { p = data.payload; model = data.model; sr = model.students.find((s) => s.student.id === studentId) ?? null; }
      if (!sr) {
        // not in the set the page loaded (a child of another class, or added a moment ago): ask for that child's own class — never guess "complete"
        const q = new URLSearchParams({ class: studentsById.value.get(studentId)?.class_id ?? classId });
        if (selectedTermId.value) q.set("term", selectedTermId.value);
        p = await api.get<ReportPayload>(`/api/reports/summary?${q}`);
        if (!live) return;
        model = computeReport(p);
        sr = model.students.find((s) => s.student.id === studentId) ?? null;
      }
      if (!p || !model) return;
      setReport(sr);
      const fu = model.followUp.find((f) => f.student.id === studentId);
      // map missing titles to their work (subject, type, due day) for display
      // matched by assignment id (two works may share a title): the works this child is "missing" on, by the same rule as the numbers
      const today = bkkToday();
      const subOf = (aid: string) => p.submissions.find((x) => x.assignment_id === aid && x.student_id === studentId);
      const missingWorks = p.assignments.filter((x) => workState(subOf(x.id), x, today) === "missing");
      const titles = fu?.missing ?? [];
      const miss = titles.map((title, i) => {
        const same = missingWorks.filter((x) => x.title === title);
        const nth = titles.slice(0, i).filter((t) => t === title).length;
        const a = same[nth] ?? same[0] ?? p.assignments.find((x) => x.title === title);
        return { id: a?.id ?? null, title, subject: a ? subjectById(a.subject_id)?.name ?? null : null, type: a?.type_id ? workTypeById(a.type_id)?.name ?? null : null, due: a?.due_date ?? null };
      });
      setMissing(miss);
      setStatus(sr ? "ready" : "unknown");
    })().catch(() => { if (live) setStatus("error"); });
    api.get<{ rows: any[] }>(`/api/audit?student=${studentId}&limit=6`).then((r) => { if (live) setAudit(r.rows); }).catch(() => {});
    return () => { live = false; };
  }, [studentId, classId, selectedTermId.value, data?.payload]);

  const cls = classById(student?.class_id ?? classId);
  const att = report?.attendance;
  const attTotal = att ? att.present + att.late + att.leave + att.sick + att.absent : 0;
  const scorePct = report ? scorePercent(report.score, report.fullScore) : null;
  const attPct = att ? attendancePercent(att) : null;

  function copyMissing() {
    const titles = missing.map((m) => m.title);
    onCopyMissing?.(titles);
    // students page: "5. กานดา ค้างส่ง 2 งาน:" (number + first name, as the LINE text of BR-37)
    const head = from === "students" && student ? `${student.number != null ? student.number + ". " : ""}${student.first_name}` : student ? fullName(student) : "";
    const text = `${head} ค้างส่ง ${titles.length} งาน:\n` + titles.map((t) => "· " + t).join("\n");
    setCopyFailed(false);
    const done = () => { setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000); };
    const fail = () => { setCopyFailed(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopyFailed(false), 4000); };
    if (!navigator.clipboard?.writeText) { fail(); return; }
    navigator.clipboard.writeText(text).then(done, fail);
  }
  const label = student ? (hide ? `เลขที่ ${student.number ?? "–"}` : fullName(student)) : studentId;
  const nameLine = from === "students" && student && !hide ? `เลขที่ ${student.number ?? "–"} ${fullName(student)}` : label;

  const edit = student && (
    <button class={from === "students" ? "primary" : "ghost"} onClick={() => onEdit(student)}><Icon name="edit" size={20} /> แก้ไขข้อมูล</button>
  );
  return (
    <Drawer label={student ? `ข้อมูล ${label}` : "ข้อมูลนักเรียน"} onClose={onClose} title={
      <div class="sd-id">
        <Avatar {...(hide && student ? { text: String(student.number ?? "–") } : { student })} size={44} tone="accent" />
        <div style="min-width:0">
          <h2 class="sd-name" title={student ? nameLine : undefined}>{student ? nameLine : studentId}</h2>
          {hide ? <div class="page-sub">{cls?.name}{from === "students" ? " · ทุกวิชา · ทั้งเทอม" : ""}</div>
            : from === "students" ? <div class="page-sub">{cls?.name} · ทุกวิชา · ทั้งเทอม · รหัส {student?.code}{student?.nickname ? ` · ชื่อเล่น ${student.nickname}` : ""}</div>
            : <div class="page-sub">{student?.nickname ? `“${student.nickname}” · ` : ""}{cls?.name} เลขที่ {student?.number ?? "-"} · รหัส {student?.code}</div>}
        </div>
      </div>
    }>
      {from === "reports" && (
        <div class="sd-scope">
          <span class="hm-chip muted"><Icon name="filter" size={16} /><span>ขอบเขต: {scopeLabel ?? "ทุกวิชา · ทั้งเทอม"} (ตามตัวกรองหน้านี้)</span></span>
          {onFullTerm && <button class="ghost" onClick={onFullTerm}>ดูทั้งเทอม</button>}
        </div>
      )}
      <div class="sd-tiles">
        <div><div class="l">ส่งงาน</div><div class="v">{report ? `${report.submitted}/${report.applicable}` : "—"}</div></div>
        <div><div class="l">คะแนนสะสม</div><div class="v">{scorePct != null ? scorePct + "%" : "—"}</div></div>
        <div><div class="l">มาเรียน</div><div class="v">{attPct != null ? attPct + "%" : "—"}</div></div>
      </div>
      {from === "students" && report && (
        <div class="sd-facts page-sub">
          ค้างส่ง {report.missing} · ยังไม่ถึงกำหนด {report.pending} · รอตรวจ {report.awaiting} · คะแนนสะสม {report.score}/{report.fullScore} · ร้อยละสะสม {scorePct != null ? scorePct + "%" : "—"} · มาเรียน {att ? att.present + att.late : 0}/{attTotal} · ร้อยละมา {attPct != null ? attPct + "%" : "—"}
        </div>
      )}

      <div class="sd-sec">
        <b>งานค้างส่ง{status === "ready" ? ` ${missing.length} ชิ้น` : ""}</b>
        {missing.length > 0 && (hide
          ? <button class="ghost sd-copy" disabled><Icon name="brand-line" size={18} /> คัดลอกไป LINE · ปิดอยู่ตอนซ่อนชื่อ</button>
          : <button class="ghost sd-copy" onClick={copyMissing}><Icon name={copied ? "check" : "brand-line"} size={18} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไป LINE"}</button>)}
      </div>
      {copyFailed && <div class="page-sub" role="status" style="color:var(--text-warning);margin-bottom:6px">คัดลอกไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเอง</div>}
      {status === "error" ? (
        <div class="page-sub" style="color:var(--text-warning);margin-bottom:10px"><Icon name="cloud-off" size={16} /> โหลดสถิติไม่สำเร็จ{navigator.onLine ? "" : " (ออฟไลน์)"}</div>
      ) : status === "loading" ? (
        <div class="page-sub" style="margin-bottom:10px"><Icon name="loader-2" size={16} class="spin" /> กำลังโหลด…</div>
      ) : status === "unknown" ? (
        <div class="page-sub" style="margin-bottom:10px" role="status"><Icon name="alert-circle" size={16} /> ยังไม่ทราบ — ยังไม่มีสถิติของนักเรียนคนนี้</div>
      ) : missing.length === 0 ? (
        <div class="page-sub" style="color:var(--text-success);margin-bottom:10px"><Icon name="circle-check" size={16} /> ส่งงานครบ</div>
      ) : missing.map((m) => (
        <div class="sd-mrow">
          <Icon name="alert-circle" size={16} class="sd-bad" />
          {m.id ? <button type="button" class="lk grow sd-mtitle" title={m.title} aria-label={`ไปสมุดคะแนน งาน ${m.title}`} onClick={() => { onClose(); navigate("/gradebook", { class: classId, asg: m.id! }); }}>⚠ {m.title} →</button>
            : <span class="grow sd-mtitle" title={m.title}>{m.title}</span>}
          {(m.type || m.subject) && <span class="chip sd-mtag">{m.type ?? m.subject}</span>}
          {m.due && <span class="page-sub sd-mdue"><Icon name="calendar" size={16} /> {formatThaiDate(m.due)}</span>}
        </div>
      ))}

      {att && (
        <div class="sd-block">
          <b>เช็คชื่อ{data?.payload.range.month ? "เดือนที่เลือก" : "เทอมนี้"}</b>
          {attTotal > 0 && (
            <div role="img" aria-label={`มา ${att.present} สาย ${att.late} ลา ${att.leave} ป่วย ${att.sick} ขาด ${att.absent}`} style="margin-top:6px">
              <StackBar segments={[
                { value: att.present, color: "var(--fill-success)" }, { value: att.late, color: "var(--fill-warning)" }, { value: att.leave, color: "var(--fill-accent)" },
                { value: att.sick, color: "var(--fill-purple)" }, { value: att.absent, color: "var(--fill-danger)" },
              ]} />
            </div>
          )}
          <div class="sd-attleg">
            <span class="ok"><Icon name="check" size={16} />มา {att.present}</span>
            <span class="late"><Icon name="clock" size={16} />สาย {att.late}</span>
            <span class="leave"><Icon name="file-text" size={16} />ลา {att.leave}</span>
            <span class="sick"><Icon name="thermometer" size={16} />ป่วย {att.sick}</span>
            <span class="abs"><Icon name="x" size={16} />ขาด {att.absent}</span>
          </div>
        </div>
      )}

      {audit.length > 0 && (
        <div class="sd-block">
          <div class="sd-sec" style="margin:0"><b>ประวัติล่าสุด</b><button class="ghost sd-copy" onClick={() => { onClose(); navigate("/settings", { section: "history" }); }}>ดูทั้งหมด ›</button></div>
          {audit.map((r) => (
            <div class="sd-hrow">
              <Icon name="history" size={16} class="muted" />
              <span class="grow">{describeAudit(r)}</span>
              <span class="page-sub" style="white-space:nowrap">{formatThaiDayMonthMs(r.at)}{r.method ? " · " + (METHOD_LABEL[r.method] ?? r.method) : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div class="drawer-actions sd-actions">
        {from === "students" && student && onRotate && !readOnly && <button onClick={() => onRotate(student)}><Icon name="qrcode" size={20} /> ออก QR ใหม่…</button>}
        {from === "students" && student && onMove && !readOnly && <button onClick={() => onMove(student)}><Icon name="arrows-exchange" size={20} /> ย้ายห้อง…</button>}
        {from === "students" && student && onLeave && !readOnly && <button onClick={() => onLeave(student)} style="color:var(--text-danger)"><Icon name="user-off" size={20} /> ย้ายออก/ไม่ใช้งาน…</button>}
        {from === "students" && readOnly && <div class="page-sub">ปีการศึกษาเก่า — อ่านอย่างเดียว ไม่มีปุ่มแก้ไขหรือย้าย</div>}
        {from === "reports" && !readOnly && edit}
        <button class={from === "reports" ? "primary" : ""} onClick={() => { onClose(); navigate("/gradebook", { class: classId }); }}><Icon name="notebook" size={20} /> ไปสมุดคะแนน</button>
        {from === "students" && !readOnly && edit}
      </div>
    </Drawer>
  );
}

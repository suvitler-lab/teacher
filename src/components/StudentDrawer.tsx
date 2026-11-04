import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/students.css";
import { Icon } from "./Icon";
import { Drawer, Avatar, StackBar } from "./ui";
import { api } from "../lib/api";
import { computeReport, type ReportModel, type ReportPayload, type StudentReport } from "../lib/report";
import { classById, selectedTermId, studentsById, subjectById, workTypeById } from "../store";
import { fullName } from "../lib/names";
import type { Student } from "@shared/types";
import { scorePercent, attendancePercent } from "@shared/metrics";
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

interface MissingRow { title: string; subject: string | null; type: string | null; due: string | null }

export function StudentDrawer({ studentId, classId, onClose, onEdit, onCopyMissing, data, scopeLabel, onFullTerm, from = "students", onRotate }: {
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
}) {
  const student = studentsById.value.get(studentId);
  const [report, setReport] = useState<StudentReport | null>(null);
  const [missing, setMissing] = useState<MissingRow[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    // opening another student (or term) must not leave the previous one's numbers on screen,
    // and a slow answer for the previous one must not land on this one
    let live = true;
    setReport(null); setMissing([]); setAudit([]); setStatus("loading");
    (async () => {
      let p: ReportPayload, model: ReportModel;
      if (data) { p = data.payload; model = data.model; }
      else {
        const q = new URLSearchParams({ class: classId });
        if (selectedTermId.value) q.set("term", selectedTermId.value);
        p = await api.get<ReportPayload>(`/api/reports/summary?${q}`);
        if (!live) return;
        model = computeReport(p);
      }
      const sr = model.students.find((s) => s.student.id === studentId) ?? null;
      setReport(sr);
      const fu = model.followUp.find((f) => f.student.id === studentId);
      // map missing titles to their work (subject, type, due day) for display
      const miss = (fu?.missing ?? []).map((title) => {
        const a = p.assignments.find((x) => x.title === title);
        return { title, subject: a ? subjectById(a.subject_id)?.name ?? null : null, type: a?.type_id ? workTypeById(a.type_id)?.name ?? null : null, due: a?.due_date ?? null };
      });
      setMissing(miss);
      setStatus("ready");
    })().catch(() => { if (live) setStatus("error"); });
    api.get<{ rows: any[] }>(`/api/audit?student=${studentId}&limit=6`).then((r) => { if (live) setAudit(r.rows); }).catch(() => {});
    return () => { live = false; };
  }, [studentId, classId, selectedTermId.value, data?.payload]);

  const cls = classById(classId);
  const att = report?.attendance;
  const attTotal = att ? att.present + att.late + att.leave + att.sick + att.absent : 0;
  const scorePct = report ? scorePercent(report.score, report.fullScore) : null;
  const attPct = att ? attendancePercent(att) : null;

  function copyMissing() {
    const titles = missing.map((m) => m.title);
    onCopyMissing?.(titles);
    const text = `${student ? fullName(student) : ""} ค้างส่ง ${titles.length} งาน:\n` + titles.map((t) => "· " + t).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000); });
  }

  const edit = student && (
    <button class={from === "students" ? "primary" : "ghost"} onClick={() => onEdit(student)}><Icon name="edit" size={20} /> แก้ไขข้อมูล</button>
  );
  return (
    <Drawer label={student ? `ข้อมูล ${fullName(student)}` : "ข้อมูลนักเรียน"} onClose={onClose} title={
      <div class="sd-id">
        <Avatar student={student} size={44} tone="accent" />
        <div style="min-width:0">
          <h2 class="sd-name">{student ? fullName(student) : studentId}</h2>
          <div class="page-sub">{student?.nickname ? `“${student.nickname}” · ` : ""}{cls?.name} เลขที่ {student?.number ?? "-"} · รหัส {student?.code}</div>
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

      <div class="sd-sec">
        <b>งานค้างส่ง{status === "ready" ? ` ${missing.length} ชิ้น` : ""}</b>
        {missing.length > 0 && <button class="ghost sd-copy" onClick={copyMissing}><Icon name={copied ? "check" : "brand-line"} size={18} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไป LINE"}</button>}
      </div>
      {status === "error" ? (
        <div class="page-sub" style="color:var(--text-warning);margin-bottom:10px"><Icon name="cloud-off" size={16} /> โหลดสถิติไม่สำเร็จ{navigator.onLine ? "" : " (ออฟไลน์)"}</div>
      ) : status === "loading" ? (
        <div class="page-sub" style="margin-bottom:10px"><Icon name="loader-2" size={16} class="spin" /> กำลังโหลด…</div>
      ) : missing.length === 0 ? (
        <div class="page-sub" style="color:var(--text-success);margin-bottom:10px"><Icon name="circle-check" size={16} /> ส่งงานครบ</div>
      ) : missing.map((m) => (
        <div class="sd-mrow">
          <Icon name="alert-circle" size={16} class="sd-bad" />
          <span class="grow sd-mtitle">{m.title}</span>
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
        {from === "students" && student && onRotate && <button onClick={() => onRotate(student)}><Icon name="qrcode" size={20} /> ออก QR ใหม่</button>}
        {from === "reports" && edit}
        <button class={from === "reports" ? "primary" : ""} onClick={() => { onClose(); navigate("/gradebook", { class: classId }); }}><Icon name="notebook" size={20} /> ไปสมุดคะแนน</button>
        {from === "students" && edit}
      </div>
    </Drawer>
  );
}

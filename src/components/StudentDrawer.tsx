import { useEffect, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { Drawer, Avatar } from "./ui";
import { api } from "../lib/api";
import { computeReport, type ReportPayload, type StudentReport } from "../lib/report";
import { classById, selectedTermId, studentsById, subjectById } from "../store";
import { fullName } from "../lib/names";
import type { Student } from "@shared/types";

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
  if (r.entity === "attendance") return `เช็คชื่อ: ${r.after?.status ?? "-"}`;
  if (r.entity === "qr") return "ออก QR ใหม่";
  return ENTITY_LABEL[r.entity] ?? r.action;
}

export function StudentDrawer({ studentId, classId, onClose, onEdit, onCopyMissing }: {
  studentId: string; classId: string; onClose: () => void;
  onEdit: (s: Student) => void; onCopyMissing?: (titles: string[]) => void;
}) {
  const student = studentsById.value.get(studentId);
  const [report, setReport] = useState<StudentReport | null>(null);
  const [missing, setMissing] = useState<{ title: string; subject: string | null }[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    // opening another student (or term) must not leave the previous one's numbers on screen,
    // and a slow answer for the previous one must not land on this one
    let live = true;
    setReport(null); setMissing([]); setAudit([]); setStatus("loading");
    (async () => {
      const q = new URLSearchParams({ class: classId });
      if (selectedTermId.value) q.set("term", selectedTermId.value);
      const p = await api.get<ReportPayload>(`/api/reports/summary?${q}`);
      if (!live) return;
      const model = computeReport(p);
      const sr = model.students.find((s) => s.student.id === studentId) ?? null;
      setReport(sr);
      const fu = model.followUp.find((f) => f.student.id === studentId);
      // map missing titles to their subjects for display
      const miss = (fu?.missing ?? []).map((title) => {
        const a = p.assignments.find((x) => x.title === title);
        return { title, subject: a ? subjectById(a.subject_id)?.name ?? null : null };
      });
      setMissing(miss);
      setStatus("ready");
    })().catch(() => { if (live) setStatus("error"); });
    api.get<{ rows: any[] }>(`/api/audit?student=${studentId}&limit=6`).then((r) => { if (live) setAudit(r.rows); }).catch(() => {});
    return () => { live = false; };
  }, [studentId, classId, selectedTermId.value]);

  const cls = classById(classId);
  const att = report?.attendance;

  function copyMissing() {
    const titles = missing.map((m) => m.title);
    onCopyMissing?.(titles);
    const text = `${student ? fullName(student) : ""} ค้างส่ง ${titles.length} งาน:\n` + titles.map((t) => "· " + t).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <Drawer onClose={onClose} title={
      <div class="row" style="gap:10px">
        <Avatar student={student} size={42} tone="accent" />
        <div style="min-width:0">
          <div style="font-size:15px;font-weight:500">{student ? fullName(student) : studentId}</div>
          <div class="page-sub">{student?.nickname ? `“${student.nickname}” · ` : ""}{cls?.name} เลขที่ {student?.number ?? "-"} · รหัส {student?.code}</div>
        </div>
      </div>
    }>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:12px">
        <div style="background:var(--surface-1);border-radius:10px;padding:6px 8px"><div class="page-sub">ส่งงาน</div><div style="font-size:16px;font-weight:500;font-variant-numeric:tabular-nums">{report ? `${report.submitted}/${report.applicable}` : "—"}</div></div>
        <div style="background:var(--surface-1);border-radius:10px;padding:6px 8px"><div class="page-sub">คะแนนสะสม</div><div style="font-size:16px;font-weight:500" class={report && report.fullScore && report.score / report.fullScore < 0.6 ? "" : ""}>{report && report.fullScore ? Math.round((report.score / report.fullScore) * 100) + "%" : "—"}</div></div>
        <div style="background:var(--surface-1);border-radius:10px;padding:6px 8px"><div class="page-sub">มาเรียน</div><div style="font-size:16px;font-weight:500">{att && att.daysMarked ? Math.round(((att.present + att.late) / att.daysMarked) * 100) + "%" : "—"}</div></div>
      </div>

      <div class="row" style="justify-content:space-between;font-weight:500;margin-bottom:4px">
        <span>งานค้างส่ง{status === "ready" ? ` ${missing.length} ชิ้น` : ""}</span>
        {missing.length > 0 && <button class="ghost" style="height:26px;font-size:12px" onClick={copyMissing}><Icon name={copied ? "check" : "brand-line"} size={14} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไป LINE"}</button>}
      </div>
      {status === "error" ? (
        <div class="page-sub" style="color:var(--text-warning);margin-bottom:10px"><Icon name="cloud-off" size={14} /> โหลดสถิติไม่สำเร็จ{navigator.onLine ? "" : " (ออฟไลน์)"}</div>
      ) : status === "loading" ? (
        <div class="page-sub" style="margin-bottom:10px"><Icon name="loader-2" size={14} class="spin" /> กำลังโหลด…</div>
      ) : missing.length === 0 ? (
        <div class="page-sub" style="color:var(--text-success);margin-bottom:10px"><Icon name="circle-check" size={14} /> ส่งงานครบ</div>
      ) : missing.map((m) => (
        <div class="row" style="gap:8px;padding:6px 0;border-top:0.5px solid var(--border)">
          <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)">–</span>
          <span class="grow" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{m.title}</span>
          {m.subject && <span class="page-sub">{m.subject}</span>}
        </div>
      ))}

      {att && (
        <div style="margin-top:10px">
          <div style="font-weight:500;margin-bottom:2px">เช็คชื่อเทอมนี้</div>
          <div class="row" style="gap:10px;flex-wrap:wrap;font-size:13px;font-variant-numeric:tabular-nums">
            <span>มา {att.present}</span><span style="color:var(--text-warning)">สาย {att.late}</span>
            <span style="color:var(--text-accent)">ลา {att.leave}</span><span style="color:var(--text-purple)">ป่วย {att.sick}</span>
            <span style="color:var(--text-danger)">ขาด {att.absent}</span>
          </div>
        </div>
      )}

      {audit.length > 0 && (
        <div style="margin-top:12px">
          <div style="font-weight:500;margin-bottom:2px">ประวัติล่าสุด</div>
          {audit.map((r) => (
            <div class="row" style="gap:8px;padding:5px 0;border-top:0.5px solid var(--border);font-size:12px">
              <Icon name="history" size={14} class="muted" />
              <span class="grow">{describeAudit(r)}</span>
              <span class="page-sub" style="white-space:nowrap">{new Date(r.at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}{r.method ? " · " + (METHOD_LABEL[r.method] ?? r.method) : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
        {student && <button onClick={() => onEdit(student)}><Icon name="edit" size={15} /> แก้ไขข้อมูล</button>}
      </div>
    </Drawer>
  );
}

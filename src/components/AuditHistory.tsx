import { useEffect, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { api } from "../lib/api";
import { studentsById, assignments } from "../store";
import { fullName } from "../lib/names";
import { formatThaiTimeMs } from "../lib/dates";

interface AuditRow {
  id: number;
  at: number;
  device_name: string | null;
  entity: string;
  action: string;
  before: any;
  after: any;
  method: string | null;
  student_id: string | null;
  assignment_id: string | null;
}

const ENTITY_LABEL: Record<string, string> = {
  submission: "ส่งงาน/คะแนน", attendance: "เช็คชื่อ", assignment: "งาน",
  student: "นักเรียน", qr: "บัตร QR", settings: "ตั้งค่า", restore: "กู้คืน", auth: "บัญชี",
};
const METHOD_LABEL: Record<string, string> = {
  camera: "สแกนกล้อง", hid: "เครื่องยิง", manual: "กรอกเอง", grid: "ตาราง", bulk: "ทั้งห้อง", import: "นำเข้า", restore: "กู้คืน",
};

function describe(r: AuditRow): string {
  if (r.entity === "submission") {
    const b = r.before?.score, a = r.after?.score;
    if (r.action === "void") return "ยกเลิกการส่ง";
    if (b != null && a != null && b !== a) return `คะแนน ${b} → ${a}`;
    if (a != null) return `ให้คะแนน ${a}`;
    return "รับงาน";
  }
  if (r.entity === "attendance") return `สถานะ: ${r.after?.status ?? "-"}`;
  if (r.entity === "qr") return "ออก QR ใหม่";
  if (r.entity === "assignment") return r.action === "void" ? "ลบงาน" : r.action === "create" ? "สร้างงาน" : "แก้ไขงาน";
  return r.action;
}

export function AuditHistory({ entity }: { entity?: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let current = true; // a slower answer for an earlier filter must not replace the one the teacher is looking at now
    setLoading(true); setFailed(false);
    const q = "/api/audit?limit=40" + (entity ? `&entity=${entity}` : "");
    api.get<{ rows: AuditRow[] }>(q)
      .then((r) => { if (current) setRows(r.rows); })
      .catch(() => { if (current) { setRows([]); setFailed(true); } }) // "couldn't load" is not "nothing happened yet"
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [entity, tries]);

  if (loading) return <div class="page-sub" style="padding:8px 0">กำลังโหลด…</div>;
  if (failed) return (
    <div class="page-sub" style="padding:8px 0;color:var(--text-warning)">
      <Icon name="cloud-off" size={14} /> โหลดประวัติไม่สำเร็จ · <button class="lk" style="background:none;border:none;color:var(--text-accent);cursor:pointer;padding:0;font:inherit" onClick={() => setTries((n) => n + 1)}>ลองอีกครั้ง</button>
    </div>
  );
  if (rows.length === 0) return <div class="page-sub" style="padding:8px 0">ยังไม่มีประวัติการแก้ไข</div>;

  return (
    <div style="max-height:340px;overflow-y:auto">
      {rows.map((r) => {
        const st = r.student_id ? studentsById.value.get(r.student_id) : null;
        const asg = r.assignment_id ? assignments.value.find((a) => a.id === r.assignment_id) : null;
        return (
          <div class="row" style="gap:10px;padding:8px 0;border-top:0.5px solid var(--border)">
            <Icon name="history" size={16} class="muted" />
            <div class="grow" style="min-width:0">
              <div style="font-size:13px">
                <span style="font-weight:500">{describe(r)}</span>
                {st && <span class="muted"> · {fullName(st)}</span>}
              </div>
              <div class="page-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                {ENTITY_LABEL[r.entity] ?? r.entity}{asg ? ` · ${asg.title}` : ""}
                {r.method ? ` · ${METHOD_LABEL[r.method] ?? r.method}` : ""}
              </div>
            </div>
            <div class="page-sub" style="text-align:right;white-space:nowrap">
              <div>{formatThaiTimeMs(r.at)}</div>
              {r.device_name && <div>{r.device_name}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

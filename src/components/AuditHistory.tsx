import { useEffect, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { api } from "../lib/api";
import { studentsById, assignments, terms } from "../store";
import { fullName } from "../lib/names";
import { formatThaiTimeMs } from "../lib/dates";
import { hideSignal } from "../lib/hideNames";

interface AuditRow {
  id: number;
  at: number;
  device_name: string | null;
  entity: string;
  entity_id?: string | null;
  action: string;
  before: any;
  after: any;
  method: string | null;
  student_id: string | null;
  assignment_id: string | null;
}

const ENTITY_LABEL: Record<string, string> = {
  submission: "ส่งงาน/คะแนน", attendance: "เช็คชื่อ", assignment: "งาน",
  student: "นักเรียน", qr: "บัตร QR", settings: "ตั้งค่า", restore: "กู้คืน", auth: "บัญชี", timetable: "ตารางสอน", period_frame: "โครงเวลา",
};
const METHOD_LABEL: Record<string, string> = {
  camera: "สแกนกล้อง", hid: "เครื่องยิง", manual: "กรอกเอง", grid: "ตาราง", bulk: "ทั้งห้อง", import: "นำเข้า", restore: "กู้คืน",
};

const STATUS_LABEL: Record<string, string> = { present: "มา", late: "สาย", leave: "ลา", sick: "ป่วย", absent: "ขาด" };
const ACTION_LABEL: Record<string, string> = {
  create: "เพิ่มข้อมูล", update: "แก้ไข", void: "ยกเลิก/ลบ", delete: "ลบ", move: "ย้ายห้อง", import: "นำเข้า", restore: "กู้คืนข้อมูล",
  rotate: "ออก QR ใหม่", reactivate: "กลับมาใช้งานอีกครั้ง", password_change: "เปลี่ยนรหัสผ่าน", device_signout: "ออกจากระบบเครื่องอื่น",
  start_term: "เริ่มภาคเรียนใหม่", signout: "ออกจากระบบ", login: "เข้าสู่ระบบ", archive: "เก็บเข้าคลัง", close: "ปิดรับงาน", reopen: "เปิดรับงานอีกครั้ง",
};

/** "2/2569" for a term id (the timetable audit row keeps the term in entity_id); empty when the term is unknown. */
function termText(id: string | null | undefined): string {
  const t = id ? terms.value.find((x) => x.id === id) : null;
  return t ? `${t.term}/${t.year}` : "";
}

function describe(r: AuditRow): string {
  if (r.entity === "timetable") {
    const t = termText(r.entity_id);
    return `${t ? `${t} · ` : ""}${r.before?.slots ?? 0} → ${r.after?.slots ?? 0}`; // 14 → 15 (BR-10: counts only, no names)
  }
  if (r.entity === "period_frame") {
    const b = r.before?.periods?.length, a = r.after?.periods?.length;
    return b == null ? `ตั้งครั้งแรก ${a ?? 0} คาบ` : `${b} → ${a ?? 0} คาบ`;
  }
  if (r.entity === "submission") {
    const b = r.before?.score, a = r.after?.score;
    if (r.action === "void") return "ยกเลิกการส่ง";
    if (b != null && a != null && b !== a) return `คะแนน ${b} → ${a}`;
    if (a != null) return `ให้คะแนน ${a}`;
    return "รับงาน";
  }
  if (r.entity === "attendance" && r.action === "void") return "ยกเลิกการเช็ค";
  if (r.entity === "attendance") return `สถานะ: ${STATUS_LABEL[String(r.after?.status)] ?? r.after?.status ?? "-"}`;
  if (r.entity === "qr") return "ออก QR ใหม่";
  if (r.entity === "assignment") return r.action === "void" ? "ลบงาน" : r.action === "create" ? "สร้างงาน" : "แก้ไขงาน";

  return ACTION_LABEL[r.action] ?? r.action;
}

export function AuditHistory({ entity }: { entity?: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const hide = hideSignal("home").value; // names follow the home switch (BR-52 / P2): hidden = "เลขที่ N"

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

  if (loading) return <div class="page-sub" role="status" aria-busy="true" style="padding:8px 0">กำลังโหลด…</div>;
  if (failed) return (
    <div class="page-sub" role="alert" style="padding:8px 0;color:var(--text-warning)">
      <Icon name="cloud-off" size={14} /> โหลดประวัติไม่สำเร็จ · <button class="hist-retry" onClick={() => setTries((n) => n + 1)}>ลองอีกครั้ง</button>
    </div>
  );
  if (rows.length === 0) return <div class="page-sub" style="padding:8px 0">ยังไม่มีประวัติการแก้ไข</div>;

  return (
    <div>
      {rows.map((r) => {
        const st = r.student_id ? studentsById.value.get(r.student_id) : null;
        const asg = r.assignment_id ? assignments.value.find((a) => a.id === r.assignment_id) : null;
        return (
          <div class="hist-row" key={r.id}>
            <Icon name="history" size={16} class="muted" />
            <div class="hist-main">
              <div style="font-size:var(--fs-sm)">
                <span style="font-weight:500">{describe(r)}</span>
                {st && <span class="muted"> · {hide ? `เลขที่ ${st.number ?? "-"}` : fullName(st)}</span>}
              </div>
              <div class="page-sub">
                {ENTITY_LABEL[r.entity] ?? r.entity}{asg ? ` · ${asg.title}` : ""}
                {r.method ? ` · ${METHOD_LABEL[r.method] ?? r.method}` : ""}
              </div>
            </div>
            <div class="page-sub hist-when">
              <div>{formatThaiTimeMs(r.at)}</div>
              {r.device_name && <div>{r.device_name}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// What a line of the edit history says, in Thai. The history list and a student's drawer both show these lines.
export const METHOD_LABEL: Record<string, string> = {
  camera: "สแกนกล้อง", hid: "เครื่องยิง", manual: "กรอกเอง", grid: "ตาราง", bulk: "ทั้งห้อง", import: "นำเข้า", restore: "กู้คืน",
};
export const ENTITY_LABEL: Record<string, string> = {
  submission: "ส่งงาน/คะแนน", attendance: "เช็คชื่อ", assignment: "งาน", student: "นักเรียน", qr: "บัตร QR", settings: "ตั้งค่า", restore: "กู้คืน", auth: "บัญชี",
};
export const ATTENDANCE_LABEL: Record<string, string> = { present: "มา", late: "สาย", leave: "ลา", sick: "ป่วย", absent: "ขาด" };

/** `entityShown`: the line already names what it is about (the history list prints the entity underneath). */
export function describeAudit(r: { entity: string; action: string; before?: any; after?: any }, entityShown = false): string {
  if (r.entity === "submission") {
    const b = r.before?.score, a = r.after?.score;
    if (r.action === "void") return "ยกเลิกการส่ง";
    if (b != null && a != null && b !== a) return `คะแนน ${b} → ${a}`;
    if (a != null) return `ให้คะแนน ${a}`;
    return "รับงาน";
  }
  if (r.entity === "attendance") {
    const st = r.after?.status;
    return `${entityShown ? "สถานะ" : "เช็คชื่อ"}: ${st ? ATTENDANCE_LABEL[st] ?? st : "-"}`;
  }
  if (r.entity === "qr") return "ออก QR ใหม่";
  if (r.entity === "assignment") {
    if (r.action === "void") return "ลบงาน";
    if (r.action === "create") return "สร้างงาน";
    const b = r.before?.publish_scores, a = r.after?.publish_scores;
    if (typeof a === "boolean" && typeof b === "boolean" && a !== b && r.after && Object.keys(r.after).length === 1) return a ? "แสดงคะแนน" : "ซ่อนคะแนน";
    return "แก้ไขงาน";
  }
  return ENTITY_LABEL[r.entity] ?? r.action;
}

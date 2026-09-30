import { describe, it, expect } from "vitest";
import { buildWorkbookBuffer } from "@client/lib/excel";
import { computeReport, type ReportPayload } from "@client/lib/report";

const st = (id: string, number: number, name: string) => ({ id, number, first_name: name, last_name: "ทดสอบ", prefix: "", class_id: "c1", status: "active" }) as any;

function payload(att: "daily" | "subject", sessions: ReportPayload["attendanceSessions"], rows: [string, string, string][]): ReportPayload {
  return {
    classId: "c1",
    range: { from: null, to: null, month: null, termId: null, att },
    students: [st("st1", 1, "ก"), st("st2", 2, "ข")],
    assignments: [],
    submissions: [],
    attendanceSessions: sessions,
    attendance: rows.map(([session_id, student_id, status]) => ({ session_id, student_id, status })),
  };
}
const opts = { className: "ป.6/1", subjectName: "วิทย์", periodLabel: "1/2569", workTypeName: () => "-", fullName: (s: any) => s.first_name };

async function sheet(p: ReportPayload, name: string) {
  const buf = await buildWorkbookBuffer(computeReport(p), p, opts);
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(name);
  expect(ws, `sheet ${name}`).toBeTruthy();
  const rows: any[][] = [];
  ws.eachRow((r: any) => rows.push((r.values as any[]).slice(1)));
  return rows;
}

describe("Excel attendance sheet matches the Reports page", () => {
  it("per-subject: a day with two periods keeps BOTH columns, totals equal the report", async () => {
    // Sep 10: period 1 present, period 2 absent · Sep 11: period 1 late
    const p = payload("subject",
      [{ id: "s1", date: "2026-09-10", subject_id: "sub", period: 1 }, { id: "s2", date: "2026-09-10", subject_id: "sub", period: 2 }, { id: "s3", date: "2026-09-11", subject_id: "sub", period: 1 }],
      [["s1", "st1", "present"], ["s2", "st1", "absent"], ["s3", "st1", "late"], ["s1", "st2", "present"]]);

    const rows = await sheet(p, "เช็คชื่อรายคาบ");
    expect(rows[0]).toEqual(["เลขที่", "ชื่อ - สกุล", "10/9 ค1", "10/9 ค2", "11/9 ค1", "มา", "สาย", "ลา", "ป่วย", "ขาด", "% มา"]);
    // st1: ม ข ส → present 1, late 1, absent 1 → (1+1)/3
    expect(rows[1]).toEqual([1, "ก", "ม", "ข", "ส", 1, 1, 0, 0, 1, "67%"]);
    // st2: only period 1 was checked for them
    expect(rows[2].slice(2)).toEqual(["ม", "", "", 1, 0, 0, 0, 0, "100%"]);

    // …and those totals are exactly what the report page computes
    const model = computeReport(p);
    const a1 = model.students[0].attendance;
    expect([a1.present, a1.late, a1.leave, a1.sick, a1.absent]).toEqual(rows[1].slice(5, 10));
    expect(model.attendance).toEqual({ unit: "period", sessions: 3, marks: 4 });
    // Includes the cold ExcelJS import and a real XLSX write/read under parallel test load.
  }, 15_000);

  it("daily: one column per day", async () => {
    const p = payload("daily", [{ id: "d1", date: "2026-09-10" }, { id: "d2", date: "2026-09-11" }], [["d1", "st1", "present"], ["d2", "st1", "sick"]]);
    const rows = await sheet(p, "เช็คชื่อรายวัน");
    expect(rows[0].slice(0, 4)).toEqual(["เลขที่", "ชื่อ - สกุล", "10/9", "11/9"]);
    expect(rows[1].slice(2, 4)).toEqual(["ม", "ป"]);
    expect(computeReport(p).attendance.unit).toBe("day");
  });

  it("nothing checked shows a dash, and the report has no attendance rate (not 0%)", async () => {
    const p = payload("daily", [], []);
    const rows = await sheet(p, "เช็คชื่อรายวัน");
    expect(rows[1][rows[1].length - 1]).toBe("—");
    expect(computeReport(p).metrics.attendanceRate).toBeNull();
  });
});

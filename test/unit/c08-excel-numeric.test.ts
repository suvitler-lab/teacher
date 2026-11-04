import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbookBuffer } from "../../src/lib/excel";
import { computeReport, type ReportPayload } from "../../src/lib/report";

// C-08: the per-student Excel sheet holds numbers (not "x/y" text) and shows which work was handed in late.
const kid = (i: number) => ({ id: "s" + i, code: "C" + i, qr_token: "t" + i, prefix: null, first_name: "เด็ก" + i, last_name: "x", nickname: null, class_id: "c1", number: i + 1, status: "active", left_at: null, updated_at: 0 });
const asg = (id: string, full: number) => ({ id, term_id: "t1", subject_id: "m", type_id: null, title: "งาน" + id, unit: null, full_score: full, assigned_date: "2026-09-01", due_date: "2026-09-10", note: null, publish_scores: false, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null });
const sub = (a: string, s: string, score: number | null, late = false) => ({ assignment_id: a, student_id: s, status: "submitted", score, late });
const opts = { className: "ป.6/1", subjectName: "คณิต", periodLabel: "1/2569", workTypeName: () => "-", fullName: (s: any) => s.first_name };

async function build(p: any) {
  const buf = await buildWorkbookBuffer(computeReport(p as ReportPayload), p as ReportPayload, opts);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}
const payload = () => ({
  students: [kid(0), kid(1)], assignments: [asg("a1", 10), asg("a2", 20)],
  submissions: [sub("a1", "s0", 7.5, true), sub("a2", "s0", 15), sub("a1", "s1", 10)],
  attendance: [], attendanceSessions: [], range: { att: "daily" },
});

describe("Excel numeric + late (C-08)", () => {
  it("per-student sheet: score, full score, % and late count are numbers", async () => {
    const ws = (await build(payload())).getWorksheet("สรุปรายคน")!;
    const r = ws.getRow(2);
    expect(r.getCell(7).value).toBe(22.5);
    expect(r.getCell(8).value).toBe(30);
    expect(typeof r.getCell(6).value).toBe("number");
    expect(r.getCell(6).numFmt).toBe('0"%"');
    expect(r.getCell(9).value).toBe(1);
    expect(ws.getRow(3).getCell(9).value).toBe(0);
    expect(ws.getRow(3).getCell(7).value).toBe(10);
    expect(ws.getRow(3).getCell(8).value).toBe(30);
  }, 20_000);
  it("first sheet: one numbers-only column per work, empty where nothing was scored, late only coloured", async () => {
    const wb = await build(payload());
    expect(wb.worksheets[0].name).toBe("คะแนนรายใบงาน");
    const ws = wb.getWorksheet("คะแนนรายใบงาน")!;
    expect(ws.getRow(1).getCell(4).value).toContain("เต็ม 10");
    expect(ws.getRow(1).getCell(5).value).toContain("เต็ม 20");
    expect(ws.getRow(2).getCell(4).value).toBe(7.5); // late, still a number
    expect((ws.getRow(2).getCell(4).fill as any).fgColor.argb).toBe("FFFFE3B3");
    expect(ws.getRow(2).getCell(5).value).toBe(15);
    expect(ws.getRow(3).getCell(4).value).toBe(10);
    expect(ws.getRow(3).getCell(5).value ?? null).toBeNull(); // not handed in: empty, not a word
    expect(ws.getRow(2).getCell(6).value).toBe(22.5); // total
    expect(ws.getRow(2).getCell(4).note).toBeUndefined();
  }, 20_000);
  it("score sheet marks only late hand-ins (fill only, no comment), scores stay numbers", async () => {
    const ws = (await build(payload())).getWorksheet("คะแนนรายงาน")!;
    const late = ws.getRow(2).getCell(4);
    expect(late.value).toBe(7.5);
    expect((late.fill as any).fgColor.argb).toBe("FFFFE3B3");
    expect(late.note).toBeUndefined(); // a comment hid the score in some viewers
    expect(ws.getRow(2).getCell(5).fill?.type).toBeUndefined(); // on time: no colour
    expect(ws.getRow(3).getCell(4).fill?.type).toBeUndefined();
  }, 20_000);
  it("an excused cell is not coloured (an unscored late hand-in still shows รอตรวจ)", async () => {
    const p: any = payload();
    p.submissions = [{ ...sub("a1", "s0", null, true) }, { assignment_id: "a2", student_id: "s0", status: "excused", score: null, late: true }];
    const ws = (await build(p)).getWorksheet("คะแนนรายงาน")!;
    expect(ws.getRow(2).getCell(4).value).toBe("รอตรวจ");
    expect(ws.getRow(2).getCell(5).value).toBe("ยกเว้น");
    expect(ws.getRow(2).getCell(5).fill?.type).toBeUndefined();
  }, 20_000);
});

describe("Excel says ไม่ส่ง by the same rule as the screens (C-04)", () => {
  it("closed work with no due date: not handed in = ไม่ส่ง; open one stays empty", async () => {
    const p: any = payload();
    p.assignments = [{ ...asg("a1", 10), due_date: null, status: "closed" }, { ...asg("a2", 20), due_date: null, status: "open" }];
    p.submissions = [];
    const ws = (await build(p)).getWorksheet("คะแนนรายงาน")!;
    expect(ws.getRow(2).getCell(4).value).toBe("ไม่ส่ง");
    const open = ws.getRow(2).getCell(5).value;
    expect(open === null || open === "").toBe(true);
  }, 20_000);
});

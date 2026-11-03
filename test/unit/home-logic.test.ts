import { describe, it, expect } from "vitest";
import { dueInfo, shouldClose, todoRows, uncheckedRooms, attendanceHeadline, hmToMin } from "../../src/lib/homeLogic";

const TODAY = "2026-11-04";

describe("dueInfo: the chip on an assignment", () => {
  it("says how late, today, tomorrow, or the date; and 'no due date' when there is none", () => {
    expect(dueInfo("2026-11-02", TODAY)).toMatchObject({ tone: "danger", text: "เลยกำหนด 2 วัน" });
    expect(dueInfo("2026-11-04", TODAY)).toMatchObject({ tone: "warning", text: "ครบกำหนดวันนี้" });
    expect(dueInfo("2026-11-05", TODAY)).toMatchObject({ tone: "warning", text: "ส่งพรุ่งนี้" });
    expect(dueInfo("2026-11-12", TODAY)).toMatchObject({ tone: "muted", text: "ส่ง 12 พ.ย. 2569" });
    expect(dueInfo(null, TODAY)).toMatchObject({ tone: "muted", text: "ไม่มีกำหนดส่ง" });
  });
});

describe("shouldClose: open work the teacher has probably forgotten to close", () => {
  const base = { status: "open" as const, due_date: null as string | null, assigned_date: "2026-10-20" as string | null, created_at: Date.parse("2026-10-20T03:00:00Z") };
  it("no due date: after 14 days open (a child who never handed in only counts as missing once the work is closed)", () => {
    expect(shouldClose({ ...base, assigned_date: "2026-10-21" }, TODAY)).toBe(true);   // 14 days
    expect(shouldClose({ ...base, assigned_date: "2026-10-22" }, TODAY)).toBe(false);  // 13 days
  });
  it("no due date and no assigned date: counts from when it was created", () => {
    expect(shouldClose({ ...base, assigned_date: null, created_at: Date.parse("2026-10-01T03:00:00Z") }, TODAY)).toBe(true);
    expect(shouldClose({ ...base, assigned_date: null, created_at: Date.parse("2026-11-01T03:00:00Z") }, TODAY)).toBe(false);
  });
  it("with a due date: more than a week overdue", () => {
    expect(shouldClose({ ...base, due_date: "2026-10-28" }, TODAY)).toBe(true);        // 7 days overdue
    expect(shouldClose({ ...base, due_date: "2026-10-29" }, TODAY)).toBe(false);       // 6 days
    expect(shouldClose({ ...base, due_date: "2026-11-10" }, TODAY)).toBe(false);       // not yet due
  });
  it("never for work that is already closed", () => {
    expect(shouldClose({ ...base, status: "closed", due_date: "2026-01-01" }, TODAY)).toBe(false);
  });
});

describe("attendance helpers", () => {
  const day = (classId: string, marked: number, total: number) => ({ date: TODAY, classId, present: marked, late: 0, leave: 0, sick: 0, absent: 0, marked, total });
  it("hmToMin reads HH:MM and falls back on junk", () => {
    expect(hmToMin("08:30")).toBe(510);
    expect(hmToMin("x")).toBe(510);
    expect(hmToMin("9:05", 0)).toBe(545);
  });
  it("headline for the attendance button: none / partly / all rooms checked", () => {
    expect(attendanceHeadline([day("a", 0, 40), day("b", 0, 30)])).toBe("ยังไม่ได้เช็คชื่อ 2 ห้อง");
    expect(attendanceHeadline([day("a", 40, 40), day("b", 10, 30)])).toBe("ยังเหลือ 1 ห้อง");
    expect(attendanceHeadline([day("a", 40, 40), day("b", 30, 30)])).toBe("วันนี้เช็คครบทุกห้อง");
    expect(attendanceHeadline([])).toBe("เช็คชื่อประจำวัน");
  });
  it("uncheckedRooms: only rooms with children and nothing marked, and only once the late time has passed", () => {
    const att = [day("a", 0, 40), day("b", 12, 30), day("c", 0, 0), day("d", 0, 25)];
    expect(uncheckedRooms(att, hmToMin("08:29"), "08:30")).toEqual([]);
    expect(uncheckedRooms(att, hmToMin("08:30"), "08:30").map((r) => r.classId)).toEqual(["a", "d"]);
  });
});

describe("todoRows: the one 'do this now' card", () => {
  const none = { failed: 0, pending: 0, attDrafts: 0, termEnded: null, unchecked: [], backupDays: 3 };
  it("is empty when nothing needs doing", () => {
    expect(todoRows(none)).toEqual([]);
  });
  it("puts failed sends first, then what is waiting on this device, the ended term, rooms, then the backup", () => {
    const rows = todoRows({
      failed: 2, pending: 7, attDrafts: 1, termEnded: { name: "1/2569", end: "2026-10-31" },
      unchecked: [{ classId: "c3", name: "ป.6/3", total: 43 }], backupDays: 12,
    });
    expect(rows.map((r) => r.key)).toEqual(["failed", "queue", "term", "room:c3", "backup"]);
    expect(rows[0]).toMatchObject({ tone: "danger", action: "failed" });
    expect(rows[1].detail).toContain("เช็คชื่อ 1");
    expect(rows[1].detail).toContain("คะแนน 7");
    expect(rows[2].title).toBe("ภาคเรียนที่ 1/2569 สิ้นสุดเมื่อ 31 ต.ค. 2569 แล้ว");
    // a term already named "ภาคเรียนที่ 1/2569" must not read "ภาคเรียนที่ ภาคเรียนที่ 1/2569"
    expect(todoRows({ ...none, termEnded: { name: "ภาคเรียนที่ 1/2569", end: "2026-10-31" } })[0].title).toBe("ภาคเรียนที่ 1/2569 สิ้นสุดเมื่อ 31 ต.ค. 2569 แล้ว");
    expect(rows[3]).toMatchObject({ action: "room", classId: "c3" });
    expect(rows[3].title).toBe("ป.6/3 ยังไม่ได้เช็คชื่อ");
    expect(rows[4].title).toBe("สำรองข้อมูลล่าสุด 12 วันที่แล้ว");
  });
  it("a backup that never happened is its own message; a recent one is not mentioned", () => {
    expect(todoRows({ ...none, backupDays: null })[0].title).toBe("ยังไม่เคยสำรองข้อมูล");
    expect(todoRows({ ...none, backupDays: 7 })).toEqual([]);
    expect(todoRows({ ...none, backupDays: 8 })).toHaveLength(1);
  });
  it("only drafts or only queued scores still produce one 'waiting on this device' row", () => {
    expect(todoRows({ ...none, attDrafts: 3 })[0]).toMatchObject({ key: "queue", action: "queue" });
    expect(todoRows({ ...none, pending: 1 })[0].detail).not.toContain("เช็คชื่อ");
  });
});

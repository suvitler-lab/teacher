// T-33: the numbers and the "today" list shared by the three home layouts (BR-01, BR-02, BR-03, BR-04, BR-05, BR-06, BR-09).
import { describe, expect, it } from "vitest";
import { dueGroups, dueTodayCount, followGroups, homeSummary, roomStats, todayCount, todayList, withDeferred, type TodayInput } from "@client/lib/homeLogic";
import { parseLayoutCards, defaultLayoutCards, visibleLayoutCards, toggleLayoutCard, moveLayoutCard, LAYOUT_CARDS } from "@client/lib/homeLayout";
import { asg } from "./m1-05-fixture";
import type { AssignmentDashboard, AttendanceDay, ClassProgress, DashboardPayload } from "@shared/types";

const D = "2026-11-11";
const per = (classId: string, submitted: number, missing: number, awaiting = 0, late = 0): ClassProgress => ({ classId, total: 30, submitted, scored: 0, awaiting, late, missing, excused: 0 });
const ad = (a: ReturnType<typeof asg>, p: ClassProgress[]): AssignmentDashboard => ({ assignment: a, perClass: p });
const attRow = (classId: string, o: Partial<AttendanceDay>): AttendanceDay => ({ date: D, classId, present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 30, ...o });

// BR-03 example: c62 has 3 open works, 71 handed in, 10 missing -> 88% (not the draft's 79%)
const open: AssignmentDashboard[] = [
  ad(asg("w1", D, "ใบงานเศษส่วน"), [per("c61", 20, 7, 8), per("c62", 21, 0)]),
  ad(asg("w2", "2026-11-01", "แบบฝึก 2"), [per("c61", 20, 0, 12), per("c62", 24, 6), per("c51", 10, 5, 6)]),
  ad(asg("w3", "2026-11-05", "แบบฝึก 3"), [per("c62", 26, 4), per("c51", 3, 0, 4)]),
];
const payload = (o: Partial<DashboardPayload> = {}): DashboardPayload => ({
  date: D, termId: "t1", openAssignments: open, gradingAssignments: [], awaitingCount: 30, missingCount: 22, serverTime: 0,
  attendanceToday: [
    attRow("c61", { present: 28, late: 2, leave: 1, sick: 1, marked: 32, total: 32 }),
    attRow("c62", { present: 26, late: 1, absent: 3, marked: 30, total: 30 }),
    attRow("c51", { marked: 0, total: 28 }),
    attRow("c00", { marked: 0, total: 0 }),
  ],
  followUp: [],
  dueSoon: [{ assignmentId: "w1", classId: "c61", studentIds: ["a", "b", "c", "d", "e"] }, { assignmentId: "w1", classId: "c62", studentIds: Array.from("123456789") }],
  absentToday: [],
  ...o,
});

describe("BR-03 / BR-04 numbers per room", () => {
  const s = roomStats(payload(), ["c61", "c62", "c51"]);
  it("submit rate is Σsubmitted ÷ Σ(submitted + missing), multiplied first", () => {
    expect(s[1].submitted).toBe(71); expect(s[1].missing).toBe(10); expect(s[1].rate).toBe(88);
  });
  it("awaiting adds up to awaitingCount over the rooms", () => { expect(s.reduce((n, r) => n + r.awaiting, 0)).toBe(30); });
  it("a room with nothing to divide shows null, not 0%", () => { expect(roomStats(payload({ openAssignments: [] }), ["c61"])[0].rate).toBeNull(); });
  it("attendance: (present + late) ÷ marked; not marked = null", () => {
    expect(s[0].att?.pct).toBe(94); expect(s[1].att?.pct).toBe(90); expect(s[2].att?.pct).toBeNull(); expect(s[2].att?.progress).toBe("none");
  });
  it("the summary counts rooms that have children only: ยังเหลือ 1 ห้อง, 57 of 62 = 92%", () => {
    const h = homeSummary(payload());
    expect(h.att.rooms).toBe(3); expect(h.att.complete).toBe(2); expect(h.att.headline).toBe("ยังเหลือ 1 ห้อง"); expect(h.att.pct).toBe(92);
    expect(h.awaiting).toBe(30); expect(h.missing).toBe(22); expect(h.dueToday).toBe(1);
  });
});

describe("BR-06 / BR-05", () => {
  it("due today: unsubmitted per room, 14 in all", () => {
    const g = dueGroups(payload());
    expect(g).toHaveLength(1); expect(g[0].total).toBe(14); expect(g[0].classes.map((c) => [c.classId, c.n, c.studentIds.length])).toEqual([["c61", 5, 5], ["c62", 9, 9]]); expect(g[0].when).toBe("today");
  });
  it("a payload saved before dueSoon existed gives nothing, without error", () => {
    const old = payload() as Partial<DashboardPayload>; delete old.dueSoon;
    expect(dueTodayCount(old as DashboardPayload)).toBe(0);
  });
  it("follow-up groups by pieces owed, most first", () => {
    const f = [0, 1, 2, 3, 4].map((i) => ({ studentId: "s" + i, classId: "c61", missing: 2 })).concat([0, 1, 2].map((i) => ({ studentId: "t" + i, classId: "c62", missing: 1 })));
    expect(followGroups(f).map((g) => [g.pieces, g.people.length])).toEqual([[2, 5], [1, 3]]);
    expect(followGroups(f, "c62").map((g) => g.pieces)).toEqual([1]);
  });
});

describe("BR-01 / BR-02 the list for today", () => {
  const input = (o: Partial<TodayInput> = {}): TodayInput => ({
    today: D, nowMinutes: 10 * 60 + 42, lateAfter: "08:30", failed: 0, pending: 0, attDrafts: 0, summary: payload(), termEnded: null, backupDays: 9,
    classNameOf: (id) => ({ c61: "ป.6/1", c62: "ป.6/2", c51: "ป.5/1" })[id] ?? id, ...o,
  });
  it("the BR-01 example gives 5 things, in the order of the rule", () => {
    const r = todayList(input());
    expect(r.map((x) => x.kind)).toEqual(["room", "due", "overdue", "review", "backup"]);
    expect(todayCount(r)).toBe(5);
    expect(r[0].title).toBe("เช็คชื่อ ป.5/1"); expect(r[0].tag).toBe("เข้าเรียน 08:30");
    expect(r[1].reason).toBe("ยังไม่ส่ง 14 คน · ป.6/1 5 คน · ป.6/2 9 คน");
    expect(r[2].overdue!.reduce((n, o) => n + o.missing, 0)).toBe(22);
  });
  it("before late_after the room row is not there: 4 things", () => { expect(todayCount(todayList(input({ nowMinutes: 8 * 60 })))).toBe(4); });
  it("failed sends first, then what waits on this device", () => {
    const r = todayList(input({ failed: 2, pending: 1 }));
    expect(r.slice(0, 2).map((x) => x.kind)).toEqual(["failed", "queue"]);
  });
  it("work due tomorrow comes last and is not counted", () => {
    const t = payload({ openAssignments: [ad(asg("w9", "2026-11-12", "พรุ่งนี้ส่ง"), [per("c61", 1, 0)])], dueSoon: [{ assignmentId: "w9", classId: "c61", studentIds: ["x"] }], awaitingCount: 0, missingCount: 0 });
    const r = todayList(input({ summary: t, backupDays: 1, nowMinutes: 8 * 60 }));
    expect(r.map((x) => x.kind)).toEqual(["tomorrow"]); expect(todayCount(r)).toBe(0);
  });
  it("ทำทีหลัง sends a row to the end of the queue and the count stays 5; a room checked in the meantime drops the row", () => {
    const r = todayList(input());
    const after = withDeferred(r, ["room:c51"]);
    expect(after.map((x) => x.kind)).toEqual(["due", "overdue", "review", "backup", "room"]); expect(todayCount(after)).toBe(5);
    expect(withDeferred(r, ["nope"]).map((x) => x.key)).toEqual(r.map((x) => x.key));
    const checked = payload({ attendanceToday: [attRow("c51", { marked: 28, total: 28, present: 28 })] });
    expect(todayCount(todayList(input({ summary: checked })))).toBe(4);
  });
});

describe("BR-12 cards per layout", () => {
  it("each layout has its own list; unknown keys are dropped and a missing card is added at the end", () => {
    expect(defaultLayoutCards("a").hidden).toEqual(["classes"]);
    expect(visibleLayoutCards(defaultLayoutCards("b"))).toEqual(["timetable", "follow", "absent"]);
    expect(visibleLayoutCards(defaultLayoutCards("c"))).toEqual(["timetable", "att", "open", "follow"]);
    expect(parseLayoutCards("b", { order: ["absent", "ghost", "att"], hidden: ["absent"] })).toEqual({ order: ["absent", "timetable", "follow"], hidden: ["absent"] });
    expect(parseLayoutCards("c", "junk")).toEqual(defaultLayoutCards("c"));
  });
  it("toggle and move touch only the list given", () => {
    const p = defaultLayoutCards("c");
    expect(toggleLayoutCard(p, "att").hidden).toEqual(["att"]);
    expect(moveLayoutCard(p, "att", -1)).toBe(p); // the fixed timetable card is not a neighbour to swap with
    expect(moveLayoutCard(p, "att", 1).order).toEqual(["timetable", "open", "att", "follow"]);
    expect(moveLayoutCard(p, "timetable", 1)).toBe(p); // fixed: never moves
    expect(LAYOUT_CARDS.a).toHaveLength(6);
  });
});

describe("R-3302 an offline copy from another day uses the real today", () => {
  it("work that was due on the copy's day is overdue today (no 'วันนี้' row, not counted); tomorrow's becomes today", () => {
    const next = "2026-11-12";
    expect(dueGroups(payload(), next)).toEqual([]);                  // w1 was due on D: now late, the overdue row covers it
    expect(dueTodayCount(payload(), next)).toBe(0);
    const tom = payload({ openAssignments: [ad(asg("w9", next, "ครบพรุ่งนี้ของสำเนา"), [per("c61", 1, 0)])], dueSoon: [{ assignmentId: "w9", classId: "c61", studentIds: ["x"] }] });
    expect(dueGroups(tom, D)[0].when).toBe("tomorrow");
    expect(dueGroups(tom, next)[0].when).toBe("today");
    expect(homeSummary(tom, next).dueToday).toBe(1);
  });
});

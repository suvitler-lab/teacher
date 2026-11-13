// T-14: timetable logic — the clock cases K01–K26 (test-plan §4), shortcut room (BR-15, AC-58/59), home rows (BR-14),
// totals (BR-05), mobile day (BR-12), copy from the previous term (BR-07). Pure functions, so every case is exact.
import { describe, expect, it } from "vitest";
import { bangkok, addDays, parseNowParam, nowParamOf, nowOverrideAllowed } from "@client/lib/timetable/clock";
import { buildEntries, clipText, mobileDay, shortcutFor, slotActions, snapshot, summarize } from "@client/lib/timetable/logic";
import { pickCopySource, planCopy } from "@client/lib/timetable/copy";
import { CLASSES, F_T1, FRAME, SUBJECTS, TERM_1_2569, TERM_2_2569, cls, input, refs } from "@client/lib/timetable/testdata";

const at = (s: string) => {
  const ms = parseNowParam(s);
  if (ms === null) throw new Error(`bad time ${s}`);
  return ms;
};
const archivedRoom = (id: string) => refs(CLASSES.map((c) => (c.id === id ? { ...c, archived: true } : c)));

interface K {
  k: string;
  when: string;
  now: string | null;
  next: string | null;
  button: string | null;
  rows: number[];
  inp?: ReturnType<typeof input>;
}

const NEXT4 = "ต่อไป · คาบ 4 · 12:30 · คณิตศาสตร์ ป.6/3";
const NEXT_THU2 = "ต่อไป · พรุ่งนี้ (พฤหัส) · คาบ 2 · 09:30 · คณิตศาสตร์ ป.6/3";
const NEXT_FRI3 = "ต่อไป · พรุ่งนี้ (ศุกร์) · คาบ 3 · 10:30 · คณิตศาสตร์ ป.6/4";
const NEXT_MON2 = "ต่อไป · วันจันทร์ · คาบ 2 · 09:30 · คณิตศาสตร์ ป.6/2";
const NOW2 = "ตอนนี้ · คาบ 2 · ถึง 10:30 · คณิตศาสตร์ ป.6/4";
const NOW_BREAK = "ตอนนี้ · พักกลางวัน · ถึง 12:30";

const CASES: K[] = [
  { k: "K01", when: "2026-11-11T09:45", now: NOW2, next: NEXT4, button: "เช็คชื่อ ป.6/4", rows: [2, 4] },
  { k: "K02", when: "2026-11-11T09:50", now: NOW2, next: NEXT4, button: "เช็คชื่อ ป.6/4", rows: [2, 4] },
  { k: "K03", when: "2026-11-11T10:29:59", now: NOW2, next: NEXT4, button: "เช็คชื่อ ป.6/4", rows: [2, 4] },
  { k: "K04", when: "2026-11-11T10:30:00", now: null, next: NEXT4, button: "เช็คชื่อ ป.6/3 (คาบต่อไป)", rows: [4] },
  { k: "K05", when: "2026-11-11T10:45", now: null, next: NEXT4, button: "เช็คชื่อ ป.6/3 (คาบต่อไป)", rows: [4] },
  { k: "K06", when: "2026-11-11T11:30:00", now: NOW_BREAK, next: NEXT4, button: "เช็คชื่อ ป.6/3 (คาบต่อไป)", rows: [4] },
  { k: "K07", when: "2026-11-11T12:00", now: NOW_BREAK, next: NEXT4, button: "เช็คชื่อ ป.6/3 (คาบต่อไป)", rows: [4] },
  { k: "K08", when: "2026-11-11T12:30:00", now: "ตอนนี้ · คาบ 4 · ถึง 13:30 · คณิตศาสตร์ ป.6/3", next: NEXT_THU2, button: "เช็คชื่อ ป.6/3", rows: [4] },
  { k: "K09", when: "2026-11-11T13:30:00", now: null, next: NEXT_THU2, button: null, rows: [] },
  { k: "K10", when: "2026-11-11T08:00", now: null, next: "ต่อไป · คาบ 2 · 09:30 · คณิตศาสตร์ ป.6/4", button: "เช็คชื่อ ป.6/4 (คาบต่อไป)", rows: [2, 4] },
  { k: "K11", when: "2026-11-12T14:30:00", now: "ตอนนี้ · คาบ 6 · ถึง 15:30 · ลูกเสือ", next: NEXT_FRI3, button: null, rows: [6] },
  { k: "K12", when: "2026-11-12T16:45", now: null, next: NEXT_FRI3, button: null, rows: [] },
  { k: "K13", when: "2026-11-13T08:00", now: null, next: "ต่อไป · คาบ 3 · 10:30 · คณิตศาสตร์ ป.6/4", button: "เช็คชื่อ ป.6/4 (คาบต่อไป)", rows: [3, 4, 5, 6, 7] },
  { k: "K14", when: "2026-11-13T10:45", now: "ตอนนี้ · คาบ 3 · ถึง 11:30 · คณิตศาสตร์ ป.6/4", next: "ต่อไป · คาบ 4 · 12:30 · คณิตศาสตร์ ป.6/1", button: "เช็คชื่อ ป.6/4", rows: [3, 4, 5, 6, 7] },
  { k: "K15", when: "2026-11-13T13:40", now: "ตอนนี้ · คาบ 5 · ถึง 14:30 · ชุมนุม", next: "ต่อไป · คาบ 6 · 14:30 · สวดมนต์", button: null, rows: [5, 6, 7] },
  { k: "K16", when: "2026-11-13T16:40", now: null, next: NEXT_MON2, button: null, rows: [] },
  { k: "K17", when: "2026-11-14T10:00", now: null, next: NEXT_MON2, button: null, rows: [] },
  { k: "K18", when: "2026-11-16T13:00", now: null, next: "ต่อไป · คาบ 5 · 13:30 · ดนตรี ป.6/4", button: "เช็คชื่อ ป.6/4 (คาบต่อไป)", rows: [5, 7] },
  { k: "K19", when: "2026-11-16T15:40", now: "ตอนนี้ · คาบ 7 · ถึง 16:30 · PLC กลุ่มสาระ", next: "ต่อไป · พรุ่งนี้ (อังคาร) · คาบ 2 · 09:30 · คณิตศาสตร์ ป.6/1", button: null, rows: [7] },
  { k: "K20", when: "2026-11-11T10:45", now: null, next: "ต่อไป · พรุ่งนี้ (พฤหัส) · คาบ 6 · 14:30 · ลูกเสือ", button: null, rows: [], inp: input({ classes: archivedRoom("c3") }) },
  // Sunday → Monday is the next calendar day, so BR-04 says "พรุ่งนี้" (test-plan K21 writes just "วันจันทร์")
  { k: "K21", when: "2026-11-15T12:00", now: null, next: "ต่อไป · พรุ่งนี้ (จันทร์) · คาบ 2 · 09:30 · คณิตศาสตร์ ป.6/2", button: null, rows: [] },
  { k: "K22", when: "2026-11-11T16:30:00", now: null, next: NEXT_THU2, button: null, rows: [] },
  { k: "K25", when: "2026-11-11T02:45:00Z", now: NOW2, next: NEXT4, button: "เช็คชื่อ ป.6/4", rows: [2, 4] },
  // 00:30 Bangkok on Thursday: "today" is Thursday, so period 2 is "next" without the word "tomorrow"
  { k: "K26", when: "2026-11-11T17:30:00Z", now: null, next: "ต่อไป · คาบ 2 · 09:30 · คณิตศาสตร์ ป.6/3", button: "เช็คชื่อ ป.6/3 (คาบต่อไป)", rows: [2, 6] },
];

describe("clock K01–K26 (BR-04, BR-14, BR-15)", () => {
  for (const c of CASES) {
    it(`${c.k} ${c.when}`, () => {
      const s = snapshot(c.inp ?? input(), at(c.when));
      expect(s.visible).toBe(true);
      expect(s.nowText).toBe(c.now);
      expect(s.nextText).toBe(c.next);
      expect(s.shortcut?.attendanceLabel ?? null).toBe(c.button);
      expect([...(s.rows.current ? [s.rows.current] : []), ...s.rows.later].map((r) => r.entry.period)).toEqual(c.rows);
    });
  }

  it("K23 last day of the term after the last period: nothing to show (cannot look past the end date)", () => {
    const s = snapshot(input(), at("2027-03-12T16:40"));
    expect(s.visible).toBe(false);
    expect(s.cells).toEqual([]);
    expect(s.rows.later).toEqual([]);
    expect(s.rows.current).toBeNull();
  });

  it("K24 after the term ended: no strip, no rows (AC-24 ค)", () => {
    const s = snapshot(input(), at("2027-04-05T10:00"));
    expect(s.visible).toBe(false);
    expect(s.termEnded).toBe(true);
    expect(s.shortcut).toBeNull();
  });

  it("no term / empty table / only archived rooms: nothing (AC-24 ก ข)", () => {
    expect(snapshot(input({ term: null }), at("2026-11-11T09:45")).visible).toBe(false);
    expect(snapshot(input({ slots: [] }), at("2026-11-11T12:00")).visible).toBe(false); // a break alone is not worth a strip
    const allArchived = input({ slots: [{ weekday: 3, period: 2, kind: "class", classId: "c4", subjectId: null, label: null }], classes: archivedRoom("c4") });
    expect(snapshot(allArchived, at("2026-11-11T09:45")).visible).toBe(false);
  });

  it("the end of a period is not part of it, the start is (10:30:00 / 14:30:00)", () => {
    expect(snapshot(input(), at("2026-11-11T10:30:00")).now).toBeNull();
    expect(snapshot(input(), at("2026-11-12T14:30:00")).now).not.toBeNull();
  });

  it("an archived subject hides the slot as an archived room does (BR-06)", () => {
    const s = snapshot(input({ subjects: refs(SUBJECTS.map((x) => (x.id === "s-math" ? { ...x, archived: true } : x))) }), at("2026-11-11T09:45"));
    expect(s.now).toBeNull(); // wednesday period 2 is mathematics
    expect(s.rows.current).toBeNull();
  });

  it("ticks over 10:30 inside the minute: the old period leaves, the shortcut moves on (AC-23)", () => {
    const before = snapshot(input(), at("2026-11-11T10:29:59"));
    const after = snapshot(input(), at("2026-11-11T10:31:00"));
    expect(before.shortcut?.className).toBe("ป.6/4");
    expect(after.shortcut?.className).toBe("ป.6/3");
    expect(after.rows.current).toBeNull();
  });

  it("TC-108 crossing a month and a year: Thu 2026-12-31 16:40 → next is Fri 2027-01-01, tomorrow", () => {
    // (the test plan calls these Tuesday/Wednesday; the real calendar says Thursday/Friday)
    const s = snapshot(input(), at("2026-12-31T16:40"));
    expect(s.nextText).toBe(NEXT_FRI3);
  });

  it("TC-109 Saturday as a school day: now is the Saturday period, Sunday looks to Monday", () => {
    const sat: typeof F_T1 = [...F_T1, { weekday: 6, period: 1, kind: "activity", classId: null, subjectId: null, label: "ติวพิเศษ" }];
    const frame = { ...FRAME, days: [1, 2, 3, 4, 5, 6] as typeof FRAME.days };
    const s = snapshot(input({ slots: sat, frame }), at("2026-11-14T08:45"));
    expect(s.nowText).toBe("ตอนนี้ · คาบ 1 · ถึง 09:30 · ติวพิเศษ");
    expect(s.cells.length).toBe(8); // seven periods + the break: a school day has cells
    expect(snapshot(input({ slots: sat, frame }), at("2026-11-15T09:00")).nextText).toBe("ต่อไป · พรุ่งนี้ (จันทร์) · คาบ 2 · 09:30 · คณิตศาสตร์ ป.6/2");
  });

  it("a term end date inside the search stops 'next' (no school day past it)", () => {
    const s = snapshot(input({ term: { start_date: "2026-10-26", end_date: "2026-11-13" } }), at("2026-11-13T16:40"));
    expect(s.visible).toBe(false);
  });
});

describe("strip cells (BR-14)", () => {
  it("K02 Wed 09:50: [1 free past][2 ป.6/4 now][3 free][break][4 ป.6/3][5][6][7 free]", () => {
    const cells = snapshot(input(), at("2026-11-11T09:50")).cells;
    const brief = cells.map((c) => (c.type === "break" ? `พัก:${c.status}` : `${c.period}:${c.entry?.className ?? "-"}:${c.status}${c.live ? "!" : ""}`));
    expect(brief).toEqual(["1:-:past", "2:ป.6/4:now!", "3:-:later", "พัก:later", "4:ป.6/3:later", "5:-:later", "6:-:later", "7:-:later"]);
  });

  it("K05: period 3 is free right now, so nothing is 'live' (the word ตอนนี้ is not shown)", () => {
    const cells = snapshot(input(), at("2026-11-11T10:45")).cells;
    expect(cells.some((c) => c.live)).toBe(false);
    expect(cells.find((c) => c.period === 3)?.status).toBe("now");
  });

  it("K17 Saturday is not a school day: no cells, only the 'next' line", () => {
    const s = snapshot(input(), at("2026-11-14T10:00"));
    expect(s.cells).toEqual([]);
    expect(s.isSchoolDay).toBe(false);
    expect(s.visible).toBe(true);
  });

  it("an archived room stays in its cell, flagged, and is never live", () => {
    const cells = snapshot(input({ classes: archivedRoom("c4") }), at("2026-11-11T09:50")).cells;
    const c2 = cells.find((c) => c.period === 2)!;
    expect(c2.entry?.archived).toBe(true);
    expect(c2.live).toBe(false);
  });
});

describe("shortcut room (BR-15) — AC-58", () => {
  const AC58: [string, string, string | null][] = [
    ["ก", "2026-11-11T09:50", "เช็คชื่อ ป.6/4"],
    ["ข", "2026-11-13T10:45", "เช็คชื่อ ป.6/4"], // teaching period 3 (ป.6/4), not period 4's ป.6/1
    ["ค", "2026-11-11T10:45", "เช็คชื่อ ป.6/3 (คาบต่อไป)"],
    ["ง", "2026-11-11T12:00", "เช็คชื่อ ป.6/3 (คาบต่อไป)"],
    ["จ", "2026-11-16T13:00", "เช็คชื่อ ป.6/4 (คาบต่อไป)"],
    ["ฉ", "2026-11-16T15:40", null],
    ["ช", "2026-11-13T13:40", null],
    ["ซ", "2026-11-14T10:00", null],
  ];
  for (const [id, when, want] of AC58) {
    it(`(${id}) ${when}`, () => {
      const e = buildEntries(input());
      const t = bangkok(at(when));
      const sc = shortcutFor(e, t.weekday, t.seconds);
      expect(sc?.attendanceLabel ?? null).toBe(want);
      if (sc) {
        expect(sc.scanLabel).toBe("สแกนงาน");
        expect(sc.attendanceHref).toBe(`#/attendance?class=${sc.classId}`);
        expect(sc.scanHref).toBe(`#/scan?class=${sc.classId}`);
      }
    });
  }

  it("(ฌ) the room is archived: no button", () => {
    expect(snapshot(input({ classes: archivedRoom("c3") }), at("2026-11-11T10:45")).shortcut).toBeNull();
  });

  it("never points at another day: Friday evening has no shortcut although Monday has rooms", () => {
    expect(snapshot(input(), at("2026-11-13T16:40")).shortcut).toBeNull();
  });

  it("AC-59 one room everywhere, and only its own row carries the button", () => {
    const s = snapshot(input(), at("2026-11-11T09:50"));
    expect(s.shortcut?.classId).toBe("c4");
    const rows = [s.rows.current!, ...s.rows.later];
    expect(rows.map((r) => [r.entry.period, r.shortcut])).toEqual([[2, true], [4, false]]);
  });

  it("the shortcut row is the 'next' one when nothing is running (K05: period 4 only)", () => {
    const s = snapshot(input(), at("2026-11-11T10:45"));
    expect(s.shortcut?.kind).toBe("next");
    expect(s.rows.later.map((r) => r.shortcut)).toEqual([true]);
  });
});

describe("home rows (BR-14, AC-54/55)", () => {
  it("(ก) Wed 09:50: the running period first, then the later ones in time order", () => {
    const s = snapshot(input(), at("2026-11-11T09:50"));
    expect(s.rows.current?.entry.title).toBe("คณิตศาสตร์ ป.6/4");
    expect(s.rows.current?.isNow).toBe(true);
    expect(s.rows.later.map((r) => `${r.entry.start}–${r.entry.end} ${r.entry.title}`)).toEqual(["12:30–13:30 คณิตศาสตร์ ป.6/3"]);
  });
  it("(ง) Wed 13:40: no row at all", () => {
    const s = snapshot(input(), at("2026-11-11T13:40"));
    expect(s.rows.current).toBeNull();
    expect(s.rows.later).toEqual([]);
  });
  it("(ค) Fri 08:00: five rows 3 4 5 6 7, activities included, none running", () => {
    const s = snapshot(input(), at("2026-11-13T08:00"));
    expect(s.rows.current).toBeNull();
    expect(s.rows.later.map((r) => r.entry.kind)).toEqual(["class", "class", "activity", "activity", "activity"]);
  });
  it("a Thursday 14:00 shows the scouts row", () => {
    const s = snapshot(input(), at("2026-11-12T14:00"));
    expect(s.rows.later.map((r) => r.entry.label)).toEqual(["ลูกเสือ"]);
  });
});

describe("totals (BR-05)", () => {
  it("F-T1: สอน 9 · กิจกรรม 5 · รวม 14 คาบ (14 ชม.)", () => {
    const s = summarize(F_T1, FRAME);
    expect([s.teach, s.activity, s.total, s.minutes]).toEqual([9, 5, 14, 840]);
    expect(s.text).toBe("สอน 9 · กิจกรรม 5 · รวม 14 คาบ (14 ชม.)");
    expect(s.text).not.toContain("20");
  });
  it("50-minute periods: 14 × 50 = 700 min → 11.6 h (rounded down)", () => {
    const fiftyEach = { ...FRAME, periods: FRAME.periods.map((p) => ({ start: p.start, end: addMinutes(p.start, 50) })) };
    const s = summarize(F_T1, fiftyEach);
    expect(s.minutes).toBe(700);
    expect(s.hours).toBe("11.6");
    expect(s.text).toBe("สอน 9 · กิจกรรม 5 · รวม 14 คาบ (11.6 ชม.)");
  });
  it("empty: ยังไม่มีคาบ · slots outside the frame are not counted · archived rooms are", () => {
    expect(summarize([], FRAME).text).toBe("ยังไม่มีคาบ");
    const out = summarize([{ weekday: 6, period: 1, kind: "activity", classId: null, subjectId: null, label: "x" }, { weekday: 1, period: 9, kind: "activity", classId: null, subjectId: null, label: "y" }], FRAME);
    expect(out.total).toBe(0);
    expect(summarize(F_T1, FRAME).teach).toBe(9); // counts do not look at archive flags
  });
  it("AC-03: adding an activity Thursday period 7 makes 15", () => {
    const s = summarize([...F_T1, { weekday: 4, period: 7, kind: "activity", classId: null, subjectId: null, label: "ประชุมระดับชั้น" }], FRAME);
    expect([s.activity, s.total]).toEqual([6, 15]);
  });
});

function addMinutes(t: string, m: number): string {
  const total = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + m;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

describe("mobile day (BR-12)", () => {
  it("opens today on a school day", () => {
    expect(mobileDay(FRAME, at("2026-11-11T09:00"))).toEqual({ weekday: 3, isToday: true });
  });
  it("a Saturday or Sunday opens the next school day (Monday)", () => {
    expect(mobileDay(FRAME, at("2026-11-14T10:00"))).toEqual({ weekday: 1, isToday: false });
    expect(mobileDay(FRAME, at("2026-11-15T10:00"))).toEqual({ weekday: 1, isToday: false });
  });
  it("uses the Bangkok day: 17:30 UTC on Wednesday is already Thursday", () => {
    expect(mobileDay(FRAME, at("2026-11-11T17:30:00Z")).weekday).toBe(4);
  });
  it("text clipping: a room name up to 8 characters stays whole, longer text keeps ≥ 4 then …", () => {
    expect(clipText("ป.6/2", 8)).toBe("ป.6/2");
    expect(clipText("ห้องเรียนพิเศษ ป.6/5", 6).endsWith("…")).toBe(true);
    expect(Array.from(clipText("ห้องเรียนพิเศษ ป.6/5", 6)).length).toBeGreaterThanOrEqual(5);
  });
});

describe("cell menu (AC-28) does not depend on the time", () => {
  it("a teaching slot offers attendance and scan; an activity only edit and delete; an archived room a badge only", () => {
    const e = buildEntries(input(), { includeArchived: true });
    const wed4 = e.find((x) => x.weekday === 3 && x.period === 4)!;
    expect(slotActions(wed4)).toMatchObject({ attendance: "เช็คชื่อ ป.6/3", scan: "สแกนส่งงาน ป.6/3", edit: "แก้คาบนี้", delete: "ลบคาบนี้", archivedBadge: null });
    const fri6 = e.find((x) => x.weekday === 5 && x.period === 6)!;
    expect(slotActions(fri6)).toMatchObject({ attendance: null, scan: null, edit: "แก้คาบนี้" });
    const gone = buildEntries(input({ classes: archivedRoom("c3") }), { includeArchived: true }).find((x) => x.weekday === 3 && x.period === 4)!;
    expect(slotActions(gone)).toMatchObject({ attendance: null, scan: null, archivedBadge: "เก็บแล้ว" });
  });
});

describe("clock helpers", () => {
  it("Bangkok wall clock from any instant", () => {
    expect(bangkok(at("2026-11-11T02:45:00Z"))).toMatchObject({ date: "2026-11-11", weekday: 3, minutes: 9 * 60 + 45 });
    expect(bangkok(at("2026-11-11T17:30:00Z"))).toMatchObject({ date: "2026-11-12", weekday: 4, minutes: 30 });
  });
  it("?now= without a zone is Bangkok, with Z or an offset it is that instant, junk is ignored", () => {
    expect(parseNowParam("2026-11-11T09:45")).toBe(Date.UTC(2026, 10, 11, 2, 45));
    expect(parseNowParam("2026-11-11T09:45:00+07:00")).toBe(Date.UTC(2026, 10, 11, 2, 45));
    expect(parseNowParam("tomorrow")).toBeNull();
    expect(parseNowParam("")).toBeNull();
  });
  it("calendar addition crosses months, years and leap days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });
  it("?now= is read from the search or the hash route, and only honoured on a local host", () => {
    expect(nowParamOf({ search: "?now=2026-11-11T09:45", hash: "" })).toBe("2026-11-11T09:45");
    expect(nowParamOf({ search: "", hash: "#/home?now=2026-11-11T09:45" })).toBe("2026-11-11T09:45");
    expect(nowParamOf({ search: "", hash: "#/home" })).toBeNull();
    expect(nowOverrideAllowed({ hostname: "localhost" })).toBe(true);
    expect(nowOverrideAllowed({ hostname: "127.0.0.1" })).toBe(true);
    expect(nowOverrideAllowed({ hostname: "ngankrob.example.workers.dev" })).toBe(import.meta.env.DEV);
  });
});

describe("copy from the previous term (BR-07)", () => {
  const frame = FRAME;
  it("AC-37 same year: every slot carries over, ids unchanged", () => {
    const plan = planCopy({ sourceSlots: F_T1, sourceTerm: TERM_1_2569, targetTerm: TERM_2_2569, frame, classes: CLASSES, subjects: SUBJECTS });
    expect(plan.copied).toBe(14);
    expect(plan.skipped).toEqual([]);
    expect(plan.message).toBe("คัดลอก 14 คาบแล้ว");
    expect(plan.slots.map((s) => s.classId)).toEqual(normalized(F_T1).map((s) => s.classId));
  });

  const term2570 = { id: "t2570-1", year: 2570, term: 1 };
  const classes2570 = [
    ...CLASSES.map((c) => ({ ...c, archived: true })), // last year's rooms were archived at the new year
    cls("n1", "ป.6/1 ", { year: 2570 }), // trailing space: matched by trimmed name
    cls("n2", "ป.6/2", { year: 2570 }),
    cls("n3", "ป.6/3", { year: 2570 }),
  ];
  it("AC-38 across years: matched by name; ป.6/4 (3 slots) is reported; 11 copied (6 + 5)", () => {
    const plan = planCopy({ sourceSlots: F_T1, sourceTerm: TERM_2_2569, targetTerm: term2570, frame, classes: classes2570, subjects: SUBJECTS });
    expect(plan.copied).toBe(11);
    expect(plan.slots.filter((s) => s.kind === "class").length).toBe(6);
    expect(plan.slots.filter((s) => s.kind === "activity").length).toBe(5);
    expect(plan.skipped.map((s) => [s.weekday, s.period, s.reason])).toEqual([[1, 5, "no_room"], [3, 2, "no_room"], [5, 3, "no_room"]]);
    expect(plan.slots.find((s) => s.weekday === 5 && s.period === 4)?.classId).toBe("n1");
    expect(plan.message).toBe("คัดลอก 11 คาบ · ไม่ได้คัดลอก 3 คาบ: ป.6/4 ไม่มีในปี 2570 (จันทร์ คาบ 5 · พุธ คาบ 2 · ศุกร์ คาบ 3)");
  });
  it("an archived subject is not copied across years; activities always are", () => {
    const plan = planCopy({ sourceSlots: F_T1, sourceTerm: TERM_2_2569, targetTerm: term2570, frame, classes: classes2570, subjects: SUBJECTS.map((s) => (s.id === "s-music" ? { ...s, archived: true } : s)) });
    expect(plan.skipped.some((s) => s.reason === "archived")).toBe(true);
    expect(plan.slots.filter((s) => s.kind === "activity").length).toBe(5);
  });
  it("same year: archived rooms and slots outside the frame are left out", () => {
    const small = { ...FRAME, periods: FRAME.periods.slice(0, 5) }; // periods 6, 7 no longer exist
    const plan = planCopy({ sourceSlots: F_T1, sourceTerm: TERM_1_2569, targetTerm: TERM_2_2569, frame: small, classes: CLASSES.map((c) => (c.id === "c3" ? { ...c, archived: true } : c)), subjects: SUBJECTS });
    expect(plan.skipped.filter((s) => s.reason === "outside_frame").length).toBe(5); // อ6 พฤ6 ศ6 ศ7 จ7
    expect(plan.skipped.filter((s) => s.reason === "archived").length).toBe(2); // ป.6/3 พ4 พฤ2
    expect(plan.copied).toBe(14 - 5 - 2);
  });
  it("source is the nearest earlier term that has slots", () => {
    const terms = [TERM_1_2569, TERM_2_2569, { id: "t2568-2", year: 2568, term: 2, name: "2/2568" }];
    const counts = [{ termId: "t2569-1", slots: 14 }, { termId: "t2568-2", slots: 6 }];
    expect(pickCopySource(terms, counts, "t2569-2")).toEqual({ termId: "t2569-1", name: "1/2569", count: 14 });
    expect(pickCopySource(terms, counts, "t2569-1")).toEqual({ termId: "t2568-2", name: "2/2568", count: 6 });
    expect(pickCopySource(terms, [], "t2569-2")).toBeNull();
  });
});

function normalized(s: typeof F_T1) {
  return s.slice().sort((a, b) => a.weekday - b.weekday || a.period - b.period);
}

describe("TC-059 the same shortcut function everywhere", () => {
  it("strip, row, top of layout ค and the phone's today view all read snapshot().shortcut", () => {
    const a = snapshot(input(), at("2026-11-11T09:50"));
    const b = snapshot(input(), at("2026-11-11T09:50"));
    expect(a.shortcut?.classId).toBe(b.shortcut?.classId);
    expect(shortcutFor(buildEntries(input()), 3, 9 * 3600 + 50 * 60)?.classId).toBe(a.shortcut?.classId);
  });
});

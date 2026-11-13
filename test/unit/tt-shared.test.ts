import { describe, it, expect } from "vitest";
import {
  resolveFrame,
  validateFrame,
  serializeFrame,
  periodTimesOf,
  outsideFrame,
  slotIssues,
  normalizeSlots,
  graphemeCount,
  type FrameInput,
  type Slot,
} from "@shared/timetable";

const DEFAULT_TIMES = ["08:30", "09:30", "10:30", "12:30", "13:30", "14:30", "15:30"];
const frame = (over: Partial<FrameInput> = {}): FrameInput => ({
  periods: [
    { start: "08:30", end: "09:30" },
    { start: "09:30", end: "10:30" },
    { start: "10:30", end: "11:30" },
    { start: "12:30", end: "13:30" },
  ],
  breaks: [{ name: "พักกลางวัน", start: "11:30", end: "12:30" }],
  days: [1, 2, 3, 4, 5],
  ...over,
});
const codes = (f: FrameInput) => validateFrame(f).map((i) => i.code);
const cls = (weekday: number, period: number, over: Partial<Slot> = {}): Slot => ({
  weekday: weekday as Slot["weekday"], period, kind: "class", classId: "c1", subjectId: null, label: null, ...over,
});
const act = (weekday: number, period: number, label: string | null, over: Partial<Slot> = {}): Slot => ({
  weekday: weekday as Slot["weekday"], period, kind: "activity", classId: null, subjectId: null, label, ...over,
});

describe("resolveFrame (AC-11, AC-12, BR-02)", () => {
  it("AC-11: never set + empty period_times -> default 7 periods, lunch break, Mon-Fri", () => {
    for (const raw of [undefined, "", "{}"]) {
      const f = resolveFrame(undefined, raw as string);
      expect(f.saved).toBe(false);
      expect(f.rev).toBe(0);
      expect(f.v).toBe(1);
      expect(f.periods.map((p) => p.start)).toEqual(DEFAULT_TIMES);
      expect(f.periods[0]).toEqual({ start: "08:30", end: "09:30" });
      expect(f.periods[6]).toEqual({ start: "15:30", end: "16:30" });
      expect(f.breaks).toEqual([{ name: "พักกลางวัน", start: "11:30", end: "12:30" }]);
      expect(f.days).toEqual([1, 2, 3, 4, 5]);
      expect(validateFrame(f)).toEqual([]);
    }
  });

  it("AC-12: period_times {1:08:00,2:09:00} -> p1 08:00-09:00, p2 09:00-10:00, p3 default", () => {
    const f = resolveFrame(undefined, '{"1":"08:00","2":"09:00"}');
    expect(f.saved).toBe(false);
    expect(f.periods[0]).toEqual({ start: "08:00", end: "09:00" });
    expect(f.periods[1]).toEqual({ start: "09:00", end: "10:00" });
    expect(f.periods[2]).toEqual({ start: "10:30", end: "11:30" });
  });

  it("BR-02: period_times {1:08:00} alone -> 08:00-09:00; bad values and garbage are ignored", () => {
    expect(resolveFrame(undefined, '{"1":"08:00"}').periods[0]).toEqual({ start: "08:00", end: "09:00" });
    const f = resolveFrame(undefined, '{"1":"8:00","2":"25:00","3":5,"9":"07:00"}');
    expect(f.periods.map((p) => p.start)).toEqual(DEFAULT_TIMES);
    expect(resolveFrame(undefined, "not json").periods).toHaveLength(7);
    expect(resolveFrame(undefined, "[1,2]").periods).toHaveLength(7);
  });

  it("caps end at 23:59 for a late legacy start", () => {
    expect(resolveFrame(undefined, '{"7":"23:30"}').periods[6]).toEqual({ start: "23:30", end: "23:59" });
  });

  it("valid stored period_frame wins (saved, rev kept, days sorted); period_times ignored", () => {
    const stored = serializeFrame(frame({ days: [5, 1, 6] }), 4);
    const f = resolveFrame(stored, '{"1":"07:00"}');
    expect(f.saved).toBe(true);
    expect(f.rev).toBe(4);
    expect(f.periods).toHaveLength(4);
    expect(f.periods[0].start).toBe("08:30");
    expect(f.days).toEqual([1, 5, 6]);
  });

  it("unreadable / wrong version / invalid stored frame falls back to defaults", () => {
    const bad = JSON.stringify({ v: 1, rev: 2, periods: [], breaks: [], days: [1] });
    // D56: the stored rev is kept when the JSON is readable with an integer rev >= 0, otherwise 0
    const cases: [string, number][] = [["xx", 0], ['{"v":2,"rev":1}', 1], [bad, 2], ['{"v":1,"periods":[]}', 0]];
    for (const [raw, rev] of cases) {
      const f = resolveFrame(raw, '{"1":"08:00"}');
      expect(f.saved).toBe(false);
      expect(f.rev).toBe(rev);
      expect(f.periods[0]).toEqual({ start: "08:00", end: "09:00" });
    }
  });

  it("VF-B1 (D55): 50-minute example with 8 periods -> contract result, valid frame", () => {
    const f = resolveFrame(undefined, '{"1":"08:30","2":"09:20","3":"10:10","4":"11:00","5":"13:00","6":"13:50","7":"14:40","8":"15:30"}');
    expect(f.periods.map((p) => `${p.start}-${p.end}`)).toEqual([
      "08:30-09:20", "09:20-10:10", "10:10-11:00", "11:00-11:50", "13:00-13:50", "13:50-14:40", "14:40-15:30", "15:30-16:20",
    ]);
    expect(f.breaks).toEqual([{ name: "พักกลางวัน", start: "11:50", end: "13:00" }]);
    expect(validateFrame(f)).toEqual([]);
    expect(f.saved).toBe(false);
  });

  it("VF-B1: only key 8 -> 8 periods, p8 from the file, others default, valid", () => {
    const f = resolveFrame(undefined, '{"8":"16:30"}');
    expect(f.periods).toHaveLength(8);
    expect(f.periods[7]).toEqual({ start: "16:30", end: "17:30" });
    expect(f.periods[6]).toEqual({ start: "15:30", end: "16:30" });
    expect(validateFrame(f)).toEqual([]);
  });

  it("VF-B1: a missing middle key takes the default start", () => {
    const f = resolveFrame(undefined, '{"1":"08:00","3":"10:00"}');
    expect(f.periods[1].start).toBe("09:30");
    expect(f.periods[0]).toEqual({ start: "08:00", end: "09:00" });
    expect(validateFrame(f)).toEqual([]);
  });

  it("VF-B1: starts that do not increase -> plain defaults", () => {
    const f = resolveFrame(undefined, '{"1":"10:00","2":"09:00"}');
    expect(f.periods.map((p) => p.start)).toEqual(DEFAULT_TIMES);
    expect(f.periods[0].end).toBe("09:30");
    expect(f.breaks).toEqual([{ name: "พักกลางวัน", start: "11:30", end: "12:30" }]);
  });

  it("VF-B1: no gap of 20 minutes or more around a lunch overlap -> breaks []", () => {
    const f = resolveFrame(undefined, '{"1":"08:00","2":"09:00","3":"10:00","4":"11:00","5":"12:00","6":"13:00","7":"14:00"}');
    expect(f.breaks).toEqual([]);
    expect(validateFrame(f)).toEqual([]);
  });

  it("VF-B1: a stored frame that fails validation keeps its rev (no ABA); unreadable -> 0", () => {
    const bad = JSON.stringify({ v: 1, rev: 5, periods: [], breaks: [], days: [1] });
    const f = resolveFrame(bad, '{"1":"08:00"}');
    expect(f).toMatchObject({ saved: false, rev: 5 });
    expect(resolveFrame("not json", "").rev).toBe(0);
  });

  it("AC-16: first open days = Mon-Fri", () => {
    expect(resolveFrame(undefined, "{}").days).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("validateFrame (AC-14, AC-17, BR-02)", () => {
  it("BR-02: period 3 10:30-11:30 + break 11:30-12:30 + period 4 12:30 is valid", () => {
    expect(validateFrame(frame())).toEqual([]);
  });

  it("BR-02: period 4 starting 12:00 overlaps the lunch break", () => {
    const f = frame({ periods: [...frame().periods.slice(0, 3), { start: "12:00", end: "13:00" }] });
    const i = validateFrame(f);
    expect(i).toHaveLength(1);
    expect(i[0]).toMatchObject({ code: "break_overlaps_period", field: "breaks.0", message: "พักกลางวันทับคาบ 4 (12:00–13:00)" });
  });

  it("AC-14 (ก): period 2 09:30-09:30", () => {
    const f = frame();
    f.periods[1] = { start: "09:30", end: "09:30" };
    expect(validateFrame(f)).toEqual([
      { code: "end_not_after_start", field: "periods.1.end", period: 2, message: "เวลาจบต้องหลังเวลาเริ่ม" },
    ]);
  });

  it("AC-14 (ข): period 2 starts 09:00 before period 1 ends 09:30", () => {
    const f = frame();
    f.periods[1] = { start: "09:00", end: "09:30" };
    const i = validateFrame(f).filter((x) => x.code === "period_order");
    expect(i).toEqual([
      { code: "period_order", field: "periods.1.start", period: 2, message: "คาบ 2 ต้องเริ่มหลังคาบ 1 จบ (09:30)" },
    ]);
  });

  it("AC-14 (ค): break 11:00-12:00 named พัก overlaps period 3", () => {
    const f = frame({ breaks: [{ name: "พัก", start: "11:00", end: "12:00" }] });
    expect(validateFrame(f)).toEqual([
      { code: "break_overlaps_period", field: "breaks.0", period: 3, message: "พักทับคาบ 3 (10:30–11:30)" },
    ]);
  });

  it("AC-14 (ง): 0 periods and 9 periods", () => {
    expect(validateFrame(frame({ periods: [] }))).toEqual([
      { code: "period_count", field: "periods", message: "ตั้งได้ 1–8 คาบ" },
    ]);
    const nine = Array.from({ length: 9 }, (_, i) => ({ start: `${String(7 + i).padStart(2, "0")}:00`, end: `${String(7 + i).padStart(2, "0")}:50` }));
    const r = validateFrame(frame({ periods: nine, breaks: [] }));
    expect(r.map((x) => x.code)).toEqual(["period_count"]);
    expect(r[0].message).toBe("ตั้งได้ 1–8 คาบ");
    expect(validateFrame(frame({ periods: nine.slice(0, 8), breaks: [] }))).toEqual([]);
  });

  it("AC-14 (จ): no days", () => {
    expect(validateFrame(frame({ days: [] }))).toEqual([
      { code: "no_days", field: "days", message: "เลือกวันเรียนอย่างน้อย 1 วัน" },
    ]);
  });

  it("bad_day for out-of-range / non-integer day", () => {
    expect(codes(frame({ days: [1, 8 as never] }))).toEqual(["bad_day"]);
    expect(codes(frame({ days: [0 as never] }))).toEqual(["bad_day"]);
    expect(validateFrame(frame({ days: [1.5 as never] }))[0].message).toBe("วันเรียนไม่ถูกต้อง");
  });

  it("AC-16: Saturday/Sunday are valid days", () => {
    expect(validateFrame(frame({ days: [1, 2, 3, 4, 5, 6, 7] }))).toEqual([]);
  });

  it("bad_time for malformed times (periods and breaks)", () => {
    const f = frame();
    f.periods[0] = { start: "8:30", end: "09:30" };
    f.breaks[0] = { name: "พัก", start: "11:30", end: "24:00" };
    const i = validateFrame(f);
    expect(i.map((x) => [x.code, x.field])).toEqual([
      ["bad_time", "periods.0.start"],
      ["bad_time", "breaks.0.end"],
    ]);
    expect(i[0].message).toBe("ใส่เวลาแบบ 08:30");
  });

  it("break_count: 4 breaks", () => {
    const b = (s: string, e: string, n: string) => ({ name: n, start: s, end: e });
    const f = frame({
      periods: [{ start: "08:00", end: "09:00" }],
      breaks: [b("09:00", "09:10", "ก"), b("09:20", "09:30", "ข"), b("09:40", "09:50", "ค"), b("10:00", "10:10", "ง")],
    });
    expect(validateFrame(f)).toEqual([{ code: "break_count", field: "breaks", message: "ตั้งช่วงพักได้ไม่เกิน 3 ช่วง" }]);
  });

  it("break_name: empty (whitespace) and 21 chars invalid, 20 ok", () => {
    const mk = (name: string) => frame({ breaks: [{ name, start: "11:30", end: "12:30" }] });
    expect(validateFrame(mk("   "))).toEqual([{ code: "break_name", field: "breaks.0.name", message: "ชื่อช่วงพัก 1–20 ตัวอักษร" }]);
    expect(codes(mk("ก".repeat(21)))).toEqual(["break_name"]);
    expect(validateFrame(mk("ก".repeat(20)))).toEqual([]);
  });

  it("break_overlaps_break names both breaks", () => {
    const f = frame({
      breaks: [
        { name: "พักกลางวัน", start: "11:30", end: "12:30" },
        { name: "พักสั้น", start: "12:00", end: "12:20" },
      ],
    });
    expect(validateFrame(f)).toEqual([
      { code: "break_overlaps_break", field: "breaks.1", message: "ช่วงพักทับกัน (พักกลางวัน กับ พักสั้น)" },
    ]);
  });

  it("half-open intervals: touching edges are not overlaps", () => {
    expect(validateFrame(frame({ breaks: [{ name: "พัก", start: "11:30", end: "12:30" }, { name: "สั้น", start: "12:30", end: "12:30" }] })).map((x) => x.code)).toEqual(["end_not_after_start"]);
  });

  it("returns all problems ordered count -> period -> break -> day", () => {
    const f: FrameInput = {
      periods: [{ start: "09:00", end: "09:00" }],
      breaks: [{ name: "", start: "10:00", end: "10:30" }],
      days: [],
    };
    expect(codes(f)).toEqual(["end_not_after_start", "break_name", "no_days"]);
    const g = { ...f, periods: [] as FrameInput["periods"] };
    expect(codes(g)).toEqual(["period_count", "break_name", "no_days"]);
  });

  it("AC-17: changing period 1 start to 08:20 stays valid; making it overlap period 2 is rejected with the same message", () => {
    const ok = frame();
    ok.periods[0] = { start: "08:20", end: "09:30" };
    expect(validateFrame(ok)).toEqual([]);
    const bad = frame();
    bad.periods[0] = { start: "09:40", end: "09:50" };
    expect(validateFrame(bad).map((x) => x.message)).toContain("คาบ 2 ต้องเริ่มหลังคาบ 1 จบ (09:50)");
  });
});

describe("serializeFrame / periodTimesOf", () => {
  it("serializes v:1 JSON with rev and sorted unique days; round-trips through resolveFrame", () => {
    const s = serializeFrame(frame({ days: [3, 1, 3, 2] }), 4);
    const o = JSON.parse(s);
    expect(o.v).toBe(1);
    expect(o.rev).toBe(4);
    expect(o.days).toEqual([1, 2, 3]);
    expect(o.periods).toHaveLength(4);
    const f = resolveFrame(s, "{}");
    expect(f).toMatchObject({ saved: true, rev: 4, days: [1, 2, 3] });
    expect(f.breaks).toEqual(frame().breaks);
  });

  it("periodTimesOf lists starts per period count (AC-13/AC-17 single source)", () => {
    expect(JSON.parse(periodTimesOf(frame()))).toEqual({ "1": "08:30", "2": "09:30", "3": "10:30", "4": "12:30" });
    const f = frame();
    f.periods[0] = { start: "08:20", end: "09:30" };
    expect(JSON.parse(periodTimesOf(f))["1"]).toBe("08:20");
    expect(JSON.parse(periodTimesOf(resolveFrame(undefined, "{}")))).toEqual(
      Object.fromEntries(DEFAULT_TIMES.map((t, i) => [String(i + 1), t])),
    );
  });
});

describe("outsideFrame (BR-08, AC-16)", () => {
  it("returns slots on removed days or beyond the period count", () => {
    const slots = [cls(1, 2), cls(5, 3), cls(6, 1), act(1, 7, "PLC"), cls(2, 4)];
    const f = frame({ days: [1, 2, 3, 4] });
    expect(outsideFrame(slots, f)).toEqual([cls(5, 3), cls(6, 1), act(1, 7, "PLC")]);
  });
  it("nothing outside when adding Saturday and the slot is empty", () => {
    expect(outsideFrame([cls(1, 1)], frame({ days: [1, 2, 3, 4, 5, 6] }))).toEqual([]);
  });
});

describe("slotIssues (BR-03, AC-04, AC-05)", () => {
  const f = frame();
  it("valid slots pass: activity 'ลูกเสือ', class without subject", () => {
    expect(slotIssues([act(1, 1, "ลูกเสือ"), cls(2, 2)], f)).toEqual([]);
  });
  it("AC-04 (ก): class without room -> class_required", () => {
    expect(slotIssues([cls(1, 1, { classId: null })], f)).toEqual([
      { code: "class_required", weekday: 1, period: 1, message: "เลือกห้อง" },
    ]);
  });
  it("AC-04 (ข): empty or whitespace label -> label_required", () => {
    for (const l of ["", "   ", null]) {
      expect(slotIssues([act(1, 1, l)], f)).toEqual([
        { code: "label_required", weekday: 1, period: 1, message: "ใส่ชื่อกิจกรรม" },
      ]);
    }
  });
  it("AC-04 (ค): 41 chars too long, 40 ok, trimmed length counts", () => {
    expect(slotIssues([act(1, 1, "ก".repeat(41))], f)).toEqual([
      { code: "label_too_long", weekday: 1, period: 1, message: "ไม่เกิน 40 ตัวอักษร" },
    ]);
    expect(slotIssues([act(1, 1, "ก".repeat(40))], f)).toEqual([]);
    expect(slotIssues([act(1, 1, `  ${"ก".repeat(40)}  `)], f)).toEqual([]);
  });
  it("B-02: label length counts graphemes (emoji x40 ok, x41 rejected, Thai marks per cluster)", () => {
    expect(graphemeCount("🏕️")).toBe(1);
    expect(graphemeCount("ก")).toBe(1);
    expect(graphemeCount("กี่")).toBe(1); // consonant + vowel + tone mark
    expect(graphemeCount("")).toBe(0);
    expect(slotIssues([act(1, 1, "🏕️".repeat(40))], f)).toEqual([]);
    expect(slotIssues([act(1, 1, "🏕️".repeat(41))], f).map((x) => x.code)).toEqual(["label_too_long"]);
    expect(slotIssues([act(1, 1, "กี่".repeat(40))], f)).toEqual([]);
    expect(slotIssues([act(1, 1, "กี่".repeat(41))], f).map((x) => x.code)).toEqual(["label_too_long"]);
  });
  it("kind_fields: activity with room/subject, class with label", () => {
    const msg = "คาบกิจกรรมไม่มีห้องหรือวิชา";
    expect(slotIssues([act(1, 1, "อบรม", { classId: "c1" })], f)).toEqual([{ code: "kind_fields", weekday: 1, period: 1, message: msg }]);
    expect(slotIssues([act(1, 1, "อบรม", { subjectId: "s1" })], f).map((x) => x.code)).toEqual(["kind_fields"]);
    expect(slotIssues([cls(1, 1, { label: "x" })], f)).toEqual([{ code: "kind_fields", weekday: 1, period: 1, message: msg }]);
  });
  it("AC-05: duplicate weekday+period in one request -> duplicate_slot", () => {
    expect(slotIssues([cls(2, 2), cls(2, 2, { classId: "c2" })], f)).toEqual([
      { code: "duplicate_slot", weekday: 2, period: 2, message: "มีคาบนี้ซ้ำในคำขอ" },
    ]);
  });
  it("outside_frame: removed day, period beyond count, period 0", () => {
    const r = slotIssues([cls(6, 1), cls(1, 5), cls(1, 0)], f);
    expect(r.map((x) => x.code)).toEqual(["outside_frame", "outside_frame", "outside_frame"]);
    expect(r[0].message).toBe("คาบนี้อยู่นอกโครงเวลา");
  });
});

describe("normalizeSlots", () => {
  it("trims labels and sorts by weekday then period without mutating input", () => {
    const input = [act(3, 1, "  ประชุม  "), cls(1, 5), cls(1, 2), act(2, 1, "x")];
    const copy = JSON.parse(JSON.stringify(input));
    const out = normalizeSlots(input);
    expect(out.map((s) => [s.weekday, s.period])).toEqual([[1, 2], [1, 5], [2, 1], [3, 1]]);
    expect(out[3].label).toBe("ประชุม");
    expect(out[0].label).toBeNull();
    expect(input).toEqual(copy);
  });
  it("AC-04: a whitespace-only label normalizes to empty so slotIssues rejects it", () => {
    const [s] = normalizeSlots([act(1, 1, "   ")]);
    expect(s.label).toBe("");
    expect(slotIssues([s], frame()).map((x) => x.code)).toEqual(["label_required"]);
  });
});

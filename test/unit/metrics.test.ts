import { describe, it, expect } from "vitest";
import {
  workState, isSubmitted, assignmentProgress, studentSummary, attendanceRate, groupScoreTotal,
  type SubLike,
} from "@shared/metrics";

const TODAY = "2026-09-29";
const dueAgo = { full_score: 10, due_date: "2026-09-20" };   // past
const dueSoon = { full_score: 10, due_date: "2026-10-05" };  // future
const noDue = { full_score: 10, due_date: null };

const scored = (n: number, late = false): SubLike => ({ status: "submitted", score: n, late });
const awaiting: SubLike = { status: "submitted", score: null };
const excused: SubLike = { status: "excused", score: null };
const voided: SubLike = { status: "void", score: null };

describe("workState", () => {
  it("covers all six states", () => {
    expect(workState(scored(8), dueAgo, TODAY)).toBe("scored");
    expect(workState(scored(8, true), dueAgo, TODAY)).toBe("late");
    expect(workState(awaiting, dueAgo, TODAY)).toBe("awaiting");
    expect(workState(undefined, dueAgo, TODAY)).toBe("missing");
    expect(workState(undefined, dueSoon, TODAY)).toBe("pending");
    expect(workState(excused, dueAgo, TODAY)).toBe("excused");
  });
  it("no due date is never missing", () => {
    expect(workState(undefined, noDue, TODAY)).toBe("pending");
  });
  it("void with past due counts as missing; a raw 0/1 late flag works", () => {
    expect(workState(voided, dueAgo, TODAY)).toBe("missing");
    expect(workState({ status: "submitted", score: 7, late: 1 }, dueAgo, TODAY)).toBe("late");
  });
  it("awaiting takes precedence over the late flag until a score exists", () => {
    expect(workState({ status: "submitted", score: null, late: 1 }, dueAgo, TODAY)).toBe("awaiting");
  });
  it("isSubmitted is true for scored/late/awaiting only", () => {
    expect(["scored", "late", "awaiting"].every((s) => isSubmitted(s as any))).toBe(true);
    expect(["missing", "pending", "excused"].some((s) => isSubmitted(s as any))).toBe(false);
  });
});

describe("assignmentProgress", () => {
  const students = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
  it("rate excludes excused from the denominator", () => {
    const subs = new Map<string, SubLike>([
      ["a", scored(10)], ["b", scored(8, true)], ["c", awaiting], ["d", excused],
      // e => missing
    ]);
    const p = assignmentProgress(dueAgo, students, subs, TODAY);
    expect(p).toMatchObject({ total: 5, submitted: 3, scored: 2, late: 1, awaiting: 1, missing: 1, excused: 1 });
    // submitted 3 / (5 - 1 excused) = 75
    expect(p.rate).toBe(75);
    // average over scored (10/10=100, 8/10=80) = 90
    expect(p.average).toBe(90);
  });
});

describe("studentSummary", () => {
  const asgs = [dueAgo, dueAgo, dueSoon, dueAgo, dueAgo]; // full 10 each
  it("missing counts as 0, awaiting/pending/excused excluded from score", () => {
    const subs = [scored(9), awaiting, undefined, excused, undefined];
    const s = studentSummary(asgs, (i) => subs[i], TODAY);
    // submitted = scored + awaiting = 2 ; missing = index3? no: index3 excused, index4 missing => missing=1
    expect(s.submitted).toBe(2);
    expect(s.missing).toBe(1);
    expect(s.excused).toBe(1);
    expect(s.pending).toBe(1);
    // submitRate = 2 / (2 + 1) = 67
    expect(s.submitRate).toBe(67);
    // score 9 over (scored full 10 + missing full 10) = 9/20 = 45
    expect(s.score).toBe(9);
    expect(s.fullScore).toBe(20);
    expect(s.scorePercent).toBe(45);
  });
  it("all pending gives 0% but no missing penalty", () => {
    const s = studentSummary([dueSoon, dueSoon], () => undefined, TODAY);
    expect(s).toMatchObject({ submitted: 0, missing: 0, pending: 2, submitRate: 0, scorePercent: 0 });
  });
});

describe("attendanceRate", () => {
  it("present + late over marked", () => {
    expect(attendanceRate({ present: 8, late: 2, leave: 0, sick: 0, absent: 0 })).toBe(100);
    expect(attendanceRate({ present: 7, late: 1, leave: 1, sick: 0, absent: 1 })).toBe(80);
    expect(attendanceRate({ present: 0, late: 0, leave: 0, sick: 0, absent: 0 })).toBe(0);
  });
});

// ---- M1-05: one definition per number (BR-05) ------------------------------
import {
  percentOf, assignmentRate, classSubmitRate, scorePercent, attendancePercent,
  averageAttendancePercent, countWorkStates,
} from "@shared/metrics";
import { bkkToday as sharedBkkToday, bkkParts as sharedBkkParts } from "@shared/time";
import { bkkToday as workerBkkToday } from "../../worker/lib/time";
import { isHalfStep } from "@shared/grade";

describe("M1-05 percentOf — the one rounding point", () => {
  it("rounds half up to a whole percent, null when there is nothing to divide by", () => {
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(1, 8)).toBe(13); // 12.5 -> 13
    expect(percentOf(0, 5)).toBe(0);
    expect(percentOf(3, 0)).toBeNull();
  });
});

describe("M1-05 AC-01 assignmentRate = submitted ÷ (class − excused)", () => {
  // 10 children, past due: 4 scored on time · 1 late with score · 1 no score · 2 excused · 2 not handed in
  const ids = Array.from({ length: 10 }, (_, i) => ({ id: "s" + i }));
  const subs = new Map<string, SubLike>([
    ["s0", scored(8)], ["s1", scored(7)], ["s2", scored(6)], ["s3", scored(9)],
    ["s4", scored(5, true)], ["s5", awaiting], ["s6", excused], ["s7", excused],
  ]);
  it("75% from raw counts, the same as assignmentProgress.rate", () => {
    const p = assignmentProgress(dueAgo, ids, subs, TODAY);
    expect(assignmentRate({ submitted: 6, total: 10, excused: 2 })).toBe(75);
    expect(assignmentRate(p)).toBe(p.rate);
    expect(p.rate).toBe(75);
  });
  it("a class where everyone is excused is 0, not NaN", () => {
    expect(assignmentRate({ submitted: 0, total: 2, excused: 2 })).toBe(0);
  });
  it("AC-02 countWorkStates counts every seat by its work state and adds up to the whole class", () => {
    const states = ids.map((s) => workState(subs.get(s.id), dueAgo, TODAY));
    const l = countWorkStates(states);
    expect(l).toMatchObject({ scored: 4, late: 1, awaiting: 1, missing: 2, pending: 0, excused: 2, total: 10, submitted: 6, counted: 8 });
    expect(l.scored + l.late + l.awaiting + l.missing + l.pending + l.excused).toBe(l.total);
  });
});

describe("M1-05 AC-03 per-student and whole-class submit rate", () => {
  it("2 handed in · 1 overdue · 1 not due yet = 67% (not-yet-due work is left out)", () => {
    const s = studentSummary([dueAgo, dueAgo, dueAgo, dueSoon], (i) => [scored(8), awaiting, undefined, undefined][i], TODAY);
    expect(s.submitRate).toBe(67);
    expect(classSubmitRate([s])).toBe(67);
  });
  it("the class rate pools every child (Σ submitted ÷ Σ(submitted + missing)), not a mean of percents", () => {
    // 1/1 and 1/3 -> pooled 2/4 = 50 (mean of percents would be 67)
    expect(classSubmitRate([{ submitted: 1, missing: 0 }, { submitted: 1, missing: 2 }])).toBe(50);
    expect(classSubmitRate([])).toBe(0);
  });
});

describe("M1-05 scorePercent / attendancePercent", () => {
  it("scorePercent: Σscore ÷ Σfull, null without any full score", () => {
    expect(scorePercent(9, 20)).toBe(45);
    expect(scorePercent(0, 0)).toBeNull();
  });
  it("AC-04 present 3 · late 1 · leave 1 · sick 0 · absent 1 = 67%; nothing checked = null (shown as —)", () => {
    expect(attendancePercent({ present: 3, late: 1, leave: 1, sick: 0, absent: 1 })).toBe(67);
    expect(attendancePercent({ present: 0, late: 0, leave: 0, sick: 0, absent: 0 })).toBeNull();
    // attendanceRate keeps its old 0 fallback
    expect(attendanceRate({ present: 0, late: 0, leave: 0, sick: 0, absent: 0 })).toBe(0);
  });
  it("M1-06 AC-06 / D24: averageAttendancePercent pools every child's days (sum then divide), not a mean of %", () => {
    const a = { present: 3, late: 1, leave: 1, sick: 0, absent: 1 }; // 4/6
    const b = { present: 1, late: 0, leave: 0, sick: 0, absent: 1 }; // 1/2
    const none = { present: 0, late: 0, leave: 0, sick: 0, absent: 0 };
    expect(averageAttendancePercent([a, b, none])).toBe(63); // (4 + 1) / (6 + 2) = 62.5 -> 63
    expect(averageAttendancePercent([a, b])).toBe(63);
    expect(averageAttendancePercent([none])).toBeNull(); // nothing checked -> "—"
    expect(averageAttendancePercent([])).toBeNull();
  });
});

describe("M1-05 AC-06 one Bangkok 'today' helper", () => {
  it("23:30 and 00:30 Bangkok give the Bangkok date, the same in shared and worker", () => {
    const at2330 = Date.UTC(2026, 9, 30, 16, 30); // 23:30 on 30 Oct in Bangkok
    const at0030 = Date.UTC(2026, 9, 30, 17, 30); // 00:30 on 31 Oct in Bangkok
    expect(sharedBkkToday(at2330)).toBe("2026-10-30");
    expect(sharedBkkToday(at0030)).toBe("2026-10-31");
    expect(workerBkkToday(at2330)).toBe(sharedBkkToday(at2330));
    expect(workerBkkToday(at0030)).toBe(sharedBkkToday(at0030));
    expect(sharedBkkParts(at0030)).toMatchObject({ hm: "00:30", minutes: 30 });
  });
});

describe("M1-05 AC-05 isHalfStep is the one half-point rule", () => {
  it("accepts 7.5 and 0.5, rejects 7.25 and 7.500000000000001", () => {
    expect([7.5, 0.5, 0, 10].every(isHalfStep)).toBe(true);
    expect([7.25, 7.500000000000001, NaN, Infinity].some(isHalfStep)).toBe(false);
  });
});

// gb-1a: the folded-group "รวม" is the running total's rule (BR-05) applied to the group's work only
describe("groupScoreTotal", () => {
  const half = { full_score: 20, due_date: "2026-09-20" };
  const hand = (list: (SubLike | undefined)[], asgs: { full_score: number; due_date: string | null }[] = [dueAgo, dueAgo, dueAgo, dueAgo]) =>
    groupScoreTotal(asgs, (i) => list[i], TODAY);

  it("adds score over full for scored + late; half points are kept exactly", () => {
    expect(hand([scored(8), scored(7.5, true)], [dueAgo, dueAgo])).toEqual({ score: 15.5, fullScore: 20 });
  });
  it("a zero score counts (0/10), it is not 'no data'", () => {
    expect(hand([scored(0)], [dueAgo])).toEqual({ score: 0, fullScore: 10 });
  });
  it("overdue and not handed in counts as 0 of its full score", () => {
    expect(hand([scored(8), undefined], [dueAgo, half])).toEqual({ score: 8, fullScore: 30 });
  });
  it("excused work is left out of both sides", () => {
    expect(hand([scored(8), excused], [dueAgo, half])).toEqual({ score: 8, fullScore: 10 });
  });
  it("handed in but not scored yet, not yet due, and empty cells are left out", () => {
    expect(hand([scored(9), awaiting, undefined, voided], [dueAgo, dueAgo, dueSoon, noDue])).toEqual({ score: 9, fullScore: 10 });
  });
  it("nothing counts at all -> null (shown as –, never 0)", () => {
    expect(hand([excused, awaiting, undefined], [dueAgo, dueAgo, dueSoon])).toBeNull();
    expect(hand([], [])).toBeNull();
  });
  it("agrees with studentSummary over the same work (same rule as สะสม)", () => {
    const list = [scored(8), scored(5, true), undefined, excused, awaiting];
    const asgs = [dueAgo, dueAgo, half, dueAgo, dueAgo];
    const g = groupScoreTotal(asgs, (i) => list[i], TODAY)!;
    const s = studentSummary(asgs, (i) => list[i], TODAY);
    expect([g.score, g.fullScore]).toEqual([s.score, s.fullScore]);
  });
});

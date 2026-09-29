import { describe, it, expect } from "vitest";
import {
  workState, isSubmitted, assignmentProgress, studentSummary, attendanceRate,
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

import { describe, expect, it } from "vitest";
import { workState, studentSummary, assignmentProgress } from "../../shared/metrics";

// C-04: work with no due date was never "missing", so % sent and the running total came out too high.
// Rule (owner, 2 Nov): once the work is CLOSED, whoever has not handed in is missing; open work with no due date is still just pending.
const TODAY = "2026-11-02";
const noDue = (status: "open" | "closed", full = 10) => ({ full_score: full, due_date: null, status });
const sc = (score: number) => ({ status: "submitted", score, late: false });

describe("closed work counts as missing (C-04)", () => {
  it("no due date: open = pending, closed = missing", () => {
    expect(workState(undefined, noDue("open"), TODAY)).toBe("pending");
    expect(workState(undefined, noDue("closed"), TODAY)).toBe("missing");
    expect(workState({ status: "void", score: null, late: false }, noDue("closed"), TODAY)).toBe("missing");
  });
  it("handed-in and excused work is untouched by closing", () => {
    expect(workState(sc(7), noDue("closed"), TODAY)).toBe("scored");
    expect(workState({ status: "submitted", score: null, late: false }, noDue("closed"), TODAY)).toBe("awaiting");
    expect(workState({ status: "excused", score: null, late: false }, noDue("closed"), TODAY)).toBe("excused");
  });
  it("a closed work with a future due date is missing too (collecting has stopped); open + future due stays pending", () => {
    expect(workState(undefined, { full_score: 10, due_date: "2026-12-01", status: "closed" }, TODAY)).toBe("missing");
    expect(workState(undefined, { full_score: 10, due_date: "2026-12-01", status: "open" }, TODAY)).toBe("pending");
  });
  it("work without a status behaves as before (due-date rule only)", () => {
    expect(workState(undefined, { full_score: 10, due_date: null }, TODAY)).toBe("pending");
    expect(workState(undefined, { full_score: 10, due_date: "2026-10-01" }, TODAY)).toBe("missing");
  });
  it("running total: one closed no-due work scored 8, another closed one not handed in → 8/20 (40%), 1 of 2 sent", () => {
    const work = [noDue("closed"), noDue("closed")];
    const s = studentSummary(work, (i) => (i === 0 ? sc(8) : undefined), TODAY);
    expect(s).toMatchObject({ submitted: 1, missing: 1, score: 8, fullScore: 20, scorePercent: 40, submitRate: 50 });
    // while the second one is still open it is left out: 8/10
    const open = studentSummary([noDue("closed"), noDue("open")], (i) => (i === 0 ? sc(8) : undefined), TODAY);
    expect(open).toMatchObject({ missing: 0, pending: 1, fullScore: 10, scorePercent: 80, submitRate: 100 });
  });
  it("class progress of a closed no-due work: 3 of 4 sent → 1 missing", () => {
    const subs = new Map([["a", sc(5)], ["b", sc(6)], ["c", sc(7)]]);
    const p = assignmentProgress(noDue("closed"), ["a", "b", "c", "d"].map((id) => ({ id })), subs as any, TODAY);
    expect(p).toMatchObject({ submitted: 3, missing: 1, pending: 0 });
  });
});

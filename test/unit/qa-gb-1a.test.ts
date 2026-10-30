// QA gb-1a (money flag): group total expectations hand-computed from README "ตัวเลขในระบบคิดอย่างไร" (BR-05)
// before reading the implementation. today = 2026-10-30 (Bangkok). Fake data only.
import { describe, it, expect } from "vitest";
import { groupScoreTotal, studentSummary } from "../../shared/metrics";

const TODAY = "2026-10-30";
type Asg = { full_score: number; due_date: string | null };
type Sub = { status: string; score: number | null; late?: boolean } | undefined;
const past = "2026-10-01", future = "2026-11-15";
const run = (rows: [Asg, Sub][]) => groupScoreTotal(rows.map((r) => r[0]), (i) => rows[i][1], TODAY);

describe("QA gb-1a group total vs hand calculation (BR-05)", () => {
  it("mix: half score + excused + blank overdue (=0) + zero score + awaiting", () => {
    // A 7.5/10 counts; B excused skipped; C blank overdue -> 0/10 counts; D 0/20 counts; E submitted no score skipped
    // score = 7.5+0+0 = 7.5 ; full = 10+10+20 = 40
    const r = run([
      [{ full_score: 10, due_date: past }, { status: "submitted", score: 7.5 }],
      [{ full_score: 10, due_date: past }, { status: "excused", score: null }],
      [{ full_score: 10, due_date: past }, undefined],
      [{ full_score: 20, due_date: past }, { status: "submitted", score: 0 }],
      [{ full_score: 10, due_date: past }, { status: "submitted", score: null }],
    ]);
    expect(r).toEqual({ score: 7.5, fullScore: 40 });
  });
  it("late scored counts like on-time: 8/10 + 5/10 = 13/20", () => {
    expect(run([
      [{ full_score: 10, due_date: past }, { status: "submitted", score: 8, late: true }],
      [{ full_score: 10, due_date: past }, { status: "submitted", score: 5 }],
    ])).toEqual({ score: 13, fullScore: 20 });
  });
  it("void submission overdue = missing (0/10); not yet due = skipped", () => {
    expect(run([
      [{ full_score: 10, due_date: past }, { status: "void", score: null }],
      [{ full_score: 10, due_date: future }, undefined],
      [{ full_score: 10, due_date: null }, undefined],
    ])).toEqual({ score: 0, fullScore: 10 });
  });
  it("group with nothing countable -> null (dash, not 0): not due yet / excused / awaiting / empty list", () => {
    expect(run([[{ full_score: 10, due_date: future }, undefined]])).toBeNull();
    expect(run([[{ full_score: 10, due_date: past }, { status: "excused", score: null }]])).toBeNull();
    expect(run([[{ full_score: 10, due_date: past }, { status: "submitted", score: null }]])).toBeNull();
    expect(run([])).toBeNull();
  });
  it("one group holding everything == cumulative; groups added together == cumulative", () => {
    const rows: [Asg, Sub][] = [
      [{ full_score: 10, due_date: past }, { status: "submitted", score: 7.5 }],
      [{ full_score: 5, due_date: past }, { status: "excused", score: null }],
      [{ full_score: 20, due_date: past }, undefined],
      [{ full_score: 10, due_date: past }, { status: "submitted", score: 10 }],
      [{ full_score: 10, due_date: future }, undefined],
    ];
    const s = studentSummary(rows.map((r) => r[0]), (i) => rows[i][1], TODAY);
    expect({ score: s.score, fullScore: s.fullScore }).toEqual({ score: 17.5, fullScore: 40 }); // by hand: 7.5+10 ; 10+20+10
    const all = run(rows);
    expect(all).toEqual({ score: 17.5, fullScore: 40 });
    const g1 = run(rows.slice(0, 2)), g2 = run(rows.slice(2, 4)), g3 = run(rows.slice(4));
    expect(g1).toEqual({ score: 7.5, fullScore: 10 });
    expect(g2).toEqual({ score: 10, fullScore: 30 });
    expect(g3).toBeNull();
    const sum = [g1, g2, g3].reduce((a: { score: number; fullScore: number }, g) => ({ score: a.score + (g?.score ?? 0), fullScore: a.fullScore + (g?.fullScore ?? 0) }), { score: 0, fullScore: 0 });
    expect(sum).toEqual({ score: s.score, fullScore: s.fullScore });
  });
});

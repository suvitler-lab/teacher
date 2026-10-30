// QA M1-05: the dashboard API and the report endpoint give the same per-assignment rate as the
// shared function (expected values from evidence/expected-from-br.md E-01, E-16).
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, login, seed } from "./helpers";
import { assignmentRate } from "@shared/metrics";
import { computeReport } from "@client/lib/report";

let cookie: string;
beforeEach(async () => { cookie = await login(); await seed(); });

// seed(): class c1 has st1, st2; assignment a1 belongs to c1. Make a1 overdue.
const overdue = () => env.DB.prepare("UPDATE assignments SET due_date='2000-01-01' WHERE id='a1'").run();
const ins = (sid: string, status: string, score: number | null) =>
  env.DB.prepare("INSERT INTO submissions (assignment_id,student_id,status,score,late,submitted_at,updated_at) VALUES ('a1',?,?,?,0,1,1)").bind(sid, status, score);

async function bothSides() {
  const dash = (await (await call("/api/dashboard?term=t1", {}, cookie)).json()) as any;
  const pc = dash.openAssignments.find((a: any) => a.assignment.id === "a1").perClass.find((p: any) => p.classId === "c1");
  const rep = computeReport((await (await call("/api/reports/summary?class=c1&subject=s1", {}, cookie)).json()) as any);
  return { dash, pc, rep };
}

describe("dashboard API = report = shared function", () => {
  it("E-01 the whole class excused: 0%, no NaN, nobody counted as overdue", async () => {
    await overdue();
    await env.DB.batch([ins("st1", "excused", null), ins("st2", "excused", null)]);
    const { pc, rep } = await bothSides();
    expect(pc).toMatchObject({ total: 2, submitted: 0, excused: 2, missing: 0 });
    expect(assignmentRate(pc)).toBe(0);
    expect(rep.assignments[0].rate).toBe(0);
    expect(rep.metrics.missingCount).toBe(0);
    expect(rep.followUp).toEqual([]);
  });

  it("E-16 / AC-08 no excused: 1 of 2 = 50% on both sides; the overdue child is 0%", async () => {
    await overdue();
    await ins("st1", "submitted", 7.5).run();
    const { pc, rep } = await bothSides();
    expect(pc).toMatchObject({ total: 2, submitted: 1, excused: 0, missing: 1 });
    expect(assignmentRate(pc)).toBe(50);
    expect(rep.assignments[0].rate).toBe(50);
    expect(rep.students.map((s) => s.percent)).toEqual([100, 0]);
    expect(rep.metrics.submitRate).toBe(50);
  });
});

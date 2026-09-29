import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { attendanceProgress } from "../../shared/metrics";
import { computeReport } from "../../src/lib/report";

// The dashboard SQL and the report client both derive from shared/metrics, so
// their numbers for the same class + assignment must line up exactly.
describe("dashboard", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("per-class progress matches assignmentProgress via the report payload", async () => {
    // a1 (due far future) in class c1: st1 scored, st2 awaiting; st? none
    await call("/api/submissions/batch", json({
      ops: [
        { opId: "d1", scanSessionId: "s", assignmentId: "a1", studentId: "st1", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: 1 },
        { opId: "d2", scanSessionId: "s", assignmentId: "a1", studentId: "st2", status: "submitted", score: null, fullScoreAtScan: 10, method: "camera", clientTs: 1 },
      ],
    }), cookie);

    const dashRes = await call("/api/dashboard?term=t1", {}, cookie);
    const dash = (await dashRes.json()) as any;
    const a1 = dash.openAssignments.find((x: any) => x.assignment.id === "a1");
    const c1 = a1.perClass.find((p: any) => p.classId === "c1");
    expect(c1.total).toBe(2);       // st1, st2 active in c1
    expect(c1.submitted).toBe(2);   // scored + awaiting
    expect(c1.scored).toBe(1);
    expect(c1.awaiting).toBe(1);

    // reports/summary computed with the same metric functions
    const repRes = await call("/api/reports/summary?class=c1&term=t1", {}, cookie);
    const model = computeReport((await repRes.json()) as any);
    const rep = model.assignments.find((x) => x.assignment.id === "a1")!;
    expect(rep.submitted).toBe(c1.submitted);
    expect(rep.scoredCount).toBe(c1.scored);
    expect(dash.awaitingCount).toBe(1);
  });

  it("counts overdue unsubmitted work as missing and lists follow-ups", async () => {
    // make a1 overdue and leave everyone unsubmitted
    await call("/api/assignments", json({
      id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
      assigned_date: "2026-09-01", due_date: "2000-01-01", publish_scores: true, status: "open", class_ids: ["c1"],
    }), cookie);
    const dash = (await (await call("/api/dashboard?term=t1", {}, cookie)).json()) as any;
    expect(dash.missingCount).toBe(2); // st1 + st2 overdue
    expect(dash.followUp.length).toBe(2);
    expect(dash.followUp.every((f: any) => f.missing === 1)).toBe(true);
  });

  it("lists EVERY active class for the day, and one marked student is 'partial', not done", async () => {
    // c1 has 2 students; only st1 is marked. c2 has 1 student and nobody has started it.
    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present" }] }), cookie);
    const dash = (await (await call("/api/dashboard?date=2026-09-10", {}, cookie)).json()) as any;

    const byClass = new Map<string, any>(dash.attendanceToday.map((d: any) => [d.classId, d]));
    expect(byClass.size).toBe(2);
    const c1 = byClass.get("c1"), c2 = byClass.get("c2");
    expect([c1.marked, c1.total]).toEqual([1, 2]);
    expect([c2.marked, c2.total]).toEqual([0, 1]);
    expect(attendanceProgress(c1.marked, c1.total)).toBe("partial");
    expect(attendanceProgress(c2.marked, c2.total)).toBe("none");

    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [{ studentId: "st2", status: "late" }] }), cookie);
    const again = (await (await call("/api/dashboard?date=2026-09-10", {}, cookie)).json()) as any;
    const c1b = again.attendanceToday.find((d: any) => d.classId === "c1");
    expect(attendanceProgress(c1b.marked, c1b.total)).toBe("complete");
  });

  it("does not count a student who has since moved out", async () => {
    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [
      { studentId: "st1", status: "present" }, { studentId: "st2", status: "absent" },
    ] }), cookie);
    await env.DB.prepare("UPDATE students SET status = 'moved' WHERE id = 'st2'").run();

    const dash = (await (await call("/api/dashboard?date=2026-09-10", {}, cookie)).json()) as any;
    const c1 = dash.attendanceToday.find((d: any) => d.classId === "c1");
    expect([c1.marked, c1.total, c1.absent]).toEqual([1, 1, 0]);

    const days = (await (await call("/api/attendance/days?from=2026-09-10&to=2026-09-10&class=c1", {}, cookie)).json()) as any;
    expect([days.days[0].marked, days.days[0].absent]).toEqual([1, 0]);
  });

  it("closed work still waiting to be graded counts as awaiting, but is no longer chased as missing", async () => {
    await call("/api/assignments", json({
      id: "a2", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 2", full_score: 10,
      assigned_date: "2026-09-01", due_date: "2000-01-01", publish_scores: true, status: "closed", class_ids: ["c1"],
    }), cookie);
    // st1 handed it in (not graded yet); st2 never did
    await call("/api/submissions/batch", json({ ops: [
      { opId: "g1", scanSessionId: "s", assignmentId: "a2", studentId: "st1", status: "submitted", score: null, fullScoreAtScan: 10, method: "grid", clientTs: 1 },
    ] }), cookie);

    const dash = (await (await call("/api/dashboard?term=t1", {}, cookie)).json()) as any;
    expect(dash.awaitingCount).toBe(1);
    expect(dash.missingCount).toBe(0); // closed: nobody is chasing st2 any more
    expect(dash.openAssignments.map((x: any) => x.assignment.id)).toEqual(["a1"]);
    expect(dash.gradingAssignments.map((x: any) => x.assignment.id)).toEqual(["a2"]);
    expect(dash.gradingAssignments[0].perClass[0].awaiting).toBe(1);
  });

  it("term=unassigned selects only work with no term, not everything", async () => {
    await call("/api/assignments", json({
      id: "a3", term_id: null, subject_id: "s1", type_id: "wt_worksheet", title: "ยังไม่ผูกเทอม", full_score: 10,
      assigned_date: "2026-09-01", due_date: "2026-12-31", publish_scores: true, status: "open", class_ids: ["c1"],
    }), cookie);

    const un = (await (await call("/api/dashboard?term=unassigned", {}, cookie)).json()) as any;
    expect(un.openAssignments.map((x: any) => x.assignment.id)).toEqual(["a3"]);
    const t1 = (await (await call("/api/dashboard?term=t1", {}, cookie)).json()) as any;
    expect(t1.openAssignments.map((x: any) => x.assignment.id)).toEqual(["a1"]);

    // and the gradebook / reports agree on what "unassigned" means
    const gb = (await (await call("/api/gradebook?class=c1&term=unassigned", {}, cookie)).json()) as any;
    expect(gb.assignments.map((a: any) => a.id)).toEqual(["a3"]);
    const rep = (await (await call("/api/reports/summary?class=c1&term=unassigned", {}, cookie)).json()) as any;
    expect(rep.assignments.map((a: any) => a.id)).toEqual(["a3"]);
  });
});

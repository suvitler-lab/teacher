import { describe, it, expect, beforeEach } from "vitest";
import { call, json, login, seed } from "./helpers";

describe("reports summary", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
  });

  it("returns students, assignments and submissions scoped to the class", async () => {
    await call("/api/submissions/batch", json({
      ops: [{ opId: "r1", scanSessionId: "s", assignmentId: "a1", studentId: "st1", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: 1 }],
    }), cookie);

    const res = await call("/api/reports/summary?class=c1&subject=s1", {}, cookie);
    const body = (await res.json()) as any;
    expect(body.students.length).toBe(2); // st1, st2 in c1
    expect(body.assignments.length).toBe(1);
    expect(body.submissions.find((s: any) => s.student_id === "st1").score).toBe(8);
  });

  it("counts only daily (homeroom) attendance, not per-subject sessions", async () => {
    // one daily + one per-subject session, same date/class
    await call("/api/attendance/batch", json({
      date: "2569-09-10", classId: "c1",
      rows: [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "absent" }],
    }), cookie);
    await call("/api/attendance/batch", json({
      date: "2569-09-10", classId: "c1", subjectId: "s1", period: 1,
      rows: [{ studentId: "st1", status: "late" }],
    }), cookie);

    const res = await call("/api/reports/summary?class=c1&subject=s1&month=2569-09", {}, cookie);
    const body = (await res.json()) as any;
    // only the daily session's rows should appear (2 rows), not the per-subject one
    expect(body.attendanceSessions.length).toBe(1);
    expect(body.attendance.length).toBe(2);
  });

  it("att=subject counts the per-subject session instead", async () => {
    await call("/api/attendance/batch", json({ date: "2569-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present" }] }), cookie);
    await call("/api/attendance/batch", json({ date: "2569-09-10", classId: "c1", subjectId: "s1", period: 1, rows: [{ studentId: "st1", status: "late" }] }), cookie);

    const res = await call("/api/reports/summary?class=c1&subject=s1&month=2569-09&att=subject", {}, cookie);
    const body = (await res.json()) as any;
    expect(body.attendanceSessions.length).toBe(1);
    expect(body.attendance[0].status).toBe("late");
  });

  it("term=unassigned only returns assignments with no term", async () => {
    // a1 from seed has term t1; add an assignment with no term
    await call("/api/assignments", json({
      subject_id: "s1", type_id: "wt_worksheet", title: "ไม่มีเทอม", full_score: 10,
      class_ids: ["c1"], term_id: null, status: "open",
    }), cookie);
    const res = await call("/api/reports/summary?class=c1&term=unassigned", {}, cookie);
    const body = (await res.json()) as any;
    expect(body.assignments.every((a: any) => a.term_id === null)).toBe(true);
    expect(body.assignments.length).toBe(1);
  });
});

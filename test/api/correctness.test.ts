import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

function op(o: Record<string, unknown> = {}) {
  return {
    opId: "c" + Math.random().toString(36).slice(2),
    scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: null, fullScoreAtScan: 10, method: "camera", clientTs: Date.now(),
    ...o,
  };
}

describe("submission correctness", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("keeps submitted_at and late when a score is added later", async () => {
    const t0 = Date.now() - 60_000;
    await call("/api/submissions/batch", json({ ops: [op({ opId: "r", clientTs: t0 })] }), cookie);
    const before = await env.DB.prepare("SELECT submitted_at, late FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();

    // grade it later with a different client time
    await call("/api/submissions/batch", json({ ops: [op({ opId: "g", score: 8, clientTs: Date.now() })] }), cookie);
    const after = await env.DB.prepare("SELECT submitted_at, late, score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();

    expect(after.submitted_at).toBe(before.submitted_at);
    expect(after.late).toBe(before.late);
    expect(after.score).toBe(8);
  });

  it("receive + grade in one batch keep the first receive time", async () => {
    const t0 = Date.now() - 30_000;
    await call("/api/submissions/batch", json({
      ops: [op({ opId: "a", clientTs: t0 }), op({ opId: "b", score: 9, clientTs: Date.now() })],
    }), cookie);
    const row = await env.DB.prepare("SELECT submitted_at, score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
    expect(row.submitted_at).toBe(t0);
    expect(row.score).toBe(9);
  });

  it("clamps clientTs to within the last 7 days", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ opId: "old", clientTs: 1 })] }), cookie);
    const row = await env.DB.prepare("SELECT submitted_at FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
    const sevenDaysAgo = Date.now() - 7 * 864e5;
    expect(row.submitted_at).toBeGreaterThanOrEqual(sevenDaysAgo - 1000);
  });

  it("accepts half points and stores them exactly", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ opId: "h", score: 7.5 })] }), cookie);
    const row = await env.DB.prepare("SELECT score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
    expect(row.score).toBe(7.5);
  });

  it("rejects a non-half fraction with 422 (not 500)", async () => {
    const res = await call("/api/submissions/batch", json({ ops: [op({ opId: "x", score: 7.3 })] }), cookie);
    expect(res.status).toBe(422);
    expect((await res.json() as any).error).toBe("validation");
  });
});

describe("bulk undo", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("restores the pre-clear state, and is idempotent on repeat", async () => {
    // st1 submitted with a score
    await call("/api/submissions/batch", json({ ops: [op({ opId: "s1", score: 6 })] }), cookie);
    // clear the whole class
    const clr = await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie);
    const { batchId } = (await clr.json()) as any;
    expect((await env.DB.prepare("SELECT status FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>()).status).toBe("void");

    // undo -> back to submitted 6
    const u1 = await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);
    expect(u1.status).toBe(200);
    const restored = await env.DB.prepare("SELECT status, score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
    expect(restored.status).toBe("submitted");
    expect(restored.score).toBe(6);

    // repeat undo -> no-op
    const u2 = await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);
    expect((await u2.json() as any).alreadyUndone).toBe(true);
  });

  it("refuses (409) if a row was changed after the clear", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ opId: "s2", score: 6 })] }), cookie);
    const clr = await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie);
    const { batchId } = (await clr.json()) as any;
    // someone re-grades st1 after the clear
    await call("/api/submissions/batch", json({ ops: [op({ opId: "s3", score: 10 })] }), cookie);

    const u = await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);
    expect(u.status).toBe(409);
    // data untouched
    expect((await env.DB.prepare("SELECT score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>()).score).toBe(10);
  });
});

describe("attendance conflict", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("detects a clash via baseUpdatedAt and refuses without writing", async () => {
    // first write establishes a row
    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present" }] }), cookie);
    const row = await env.DB.prepare("SELECT updated_at, status FROM attendance WHERE student_id='st1'").first<any>();

    // another device (which had seen the row) changes it
    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "late", baseUpdatedAt: row.updated_at }] }), cookie);

    // our stale write (baseUpdatedAt from before) must conflict
    const res = await call("/api/attendance/batch", json({
      date: "2026-09-10", classId: "c1",
      rows: [{ studentId: "st1", status: "absent", baseUpdatedAt: row.updated_at }],
    }), cookie);
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.conflicts[0].server.status).toBe("late");
    expect(body.conflicts[0].draft.status).toBe("absent");
    // unchanged on the server
    expect((await env.DB.prepare("SELECT status FROM attendance WHERE student_id='st1'").first<any>()).status).toBe("late");
  });

  it("force overrides the clash", async () => {
    await call("/api/attendance/batch", json({ date: "2026-09-11", classId: "c1", rows: [{ studentId: "st1", status: "present" }] }), cookie);
    const res = await call("/api/attendance/batch", json({
      date: "2026-09-11", classId: "c1", force: true,
      rows: [{ studentId: "st1", status: "absent", baseUpdatedAt: 1 }],
    }), cookie);
    expect(res.status).toBe(200);
    expect((await env.DB.prepare("SELECT status FROM attendance WHERE student_id='st1'").first<any>()).status).toBe("absent");
  });
});

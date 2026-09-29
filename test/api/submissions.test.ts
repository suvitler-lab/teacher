import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

function op(overrides: Record<string, unknown> = {}) {
  return {
    opId: "op1",
    scanSessionId: "scn1",
    assignmentId: "a1",
    studentId: "st1",
    status: "submitted",
    score: 10,
    fullScoreAtScan: 10,
    method: "camera",
    clientTs: 1700000000000,
    ...overrides,
  };
}

describe("submissions batch", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
  });

  it("records a submission and one audit row", async () => {
    const res = await call("/api/submissions/batch", json({ ops: [op()] }), cookie);
    const body = (await res.json()) as any;
    expect(body.results[0].result).toBe("ok");

    const sub = await env.DB.prepare("SELECT * FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
    expect(sub.score).toBe(10);
    const audits = await env.DB.prepare("SELECT * FROM audit_logs WHERE op_id='op1'").all();
    expect(audits.results.length).toBe(1);
  });

  it("is idempotent: same opId twice does not double-write", async () => {
    await call("/api/submissions/batch", json({ ops: [op()] }), cookie);
    const res2 = await call("/api/submissions/batch", json({ ops: [op()] }), cookie);
    const body = (await res2.json()) as any;
    expect(body.results[0].result).toBe("duplicate");
    const audits = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE op_id='op1'").first<any>();
    expect(audits.n).toBe(1);
  });

  it("rejects a student not in the assignment's class", async () => {
    const res = await call("/api/submissions/batch", json({ ops: [op({ opId: "o2", studentId: "st9" })] }), cookie);
    const body = (await res.json()) as any;
    expect(body.results[0].result).toBe("not_in_class");
  });

  it("flags full_score_changed when the client's snapshot is stale", async () => {
    const res = await call("/api/submissions/batch", json({ ops: [op({ opId: "o3", fullScoreAtScan: 99 })] }), cookie);
    const body = (await res.json()) as any;
    expect(body.results[0].result).toBe("full_score_changed");
    expect(body.results[0].currentFullScore).toBe(10);
  });

  it("rejects out-of-range scores", async () => {
    const res = await call("/api/submissions/batch", json({ ops: [op({ opId: "o4", score: 50 })] }), cookie);
    const body = (await res.json()) as any;
    expect(body.results[0].result).toBe("invalid");
  });

  it("bulk all-submitted marks the whole class", async () => {
    const res = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1" }), cookie);
    const body = (await res.json()) as any;
    expect(body.changed).toBe(2); // st1, st2
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id='a1' AND status='submitted'").first<any>();
    expect(n.n).toBe(2);
  });

  it("since filter returns only newer rows", async () => {
    await call("/api/submissions/batch", json({ ops: [op()] }), cookie);
    const res = await call("/api/assignments/a1/submissions?since=9999999999999", {}, cookie);
    const body = (await res.json()) as any;
    expect(body.submissions.length).toBe(0);
  });
});

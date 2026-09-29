import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

function op(o: Record<string, unknown> = {}) {
  return {
    opId: "m" + Math.random().toString(36).slice(2),
    scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: null, fullScoreAtScan: 10, method: "camera", clientTs: Date.now(),
    ...o,
  };
}

async function saveAssignment(cookie: string, over: Record<string, unknown>) {
  return call("/api/assignments", json({
    id: "a1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
    assigned_date: "2026-09-01", due_date: "2026-12-31", publish_scores: true, status: "open",
    class_ids: ["c1"], ...over,
  }), cookie);
}

describe("assignment management", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("a closed assignment refuses camera/hid scans but allows grid grading", async () => {
    await saveAssignment(cookie, { status: "closed" });

    const scan = await call("/api/submissions/batch", json({ ops: [op({ method: "camera" })] }), cookie);
    expect((await scan.json() as any).results[0].result).toBe("assignment_closed");

    const grid = await call("/api/submissions/batch", json({ ops: [op({ method: "grid", score: 7 })] }), cookie);
    expect((await grid.json() as any).results[0].result).toBe("ok");
  });

  it("refuses to lower full_score below a recorded score (409)", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ score: 9 })] }), cookie);
    const res = await saveAssignment(cookie, { full_score: 5 });
    expect(res.status).toBe(409);
    expect((await res.json() as any).error).toBe("score_over_full");
    // still 10
    expect((await env.DB.prepare("SELECT full_score FROM assignments WHERE id='a1'").first<any>()).full_score).toBe(10);
  });

  it("allows lowering full_score when no score exceeds it", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ score: 4 })] }), cookie);
    const res = await saveAssignment(cookie, { full_score: 5 });
    expect(res.status).toBe(200);
  });
});

describe("terms with dates", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("stores start/end dates and rejects an inverted range", async () => {
    const ok = await call("/api/terms", json({ year: 2569, term: 1, name: "1/2569", start_date: "2026-05-16", end_date: "2026-10-10", is_current: true }), cookie);
    expect(ok.status).toBe(200);
    const bad = await call("/api/terms", json({ year: 2569, term: 2, name: "2/2569", start_date: "2026-11-01", end_date: "2026-10-01" }), cookie);
    expect(bad.status).toBe(400);
  });
});

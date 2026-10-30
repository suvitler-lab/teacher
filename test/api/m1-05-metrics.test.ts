// M1-05: one half-point rule on every write path (AC-05) and one per-assignment rate (AC-01).
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { takeBackup, type Backup } from "./backup-helpers";
import { assignmentRate } from "@shared/metrics";
import { computeReport } from "@client/lib/report";

let cookie: string;
beforeEach(async () => { cookie = await login(); await seed(); });

const op = (opId: string, score: number | null, studentId = "st1") => ({
  opId, scanSessionId: "s", assignmentId: "a1", studentId, status: "submitted", score, fullScoreAtScan: 10, method: "grid", clientTs: 1,
});
const scoreOf = async () => (await env.DB.prepare("SELECT score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>())?.score ?? null;

describe("AC-05 batch: isHalfStep decides", () => {
  it.each([[7.5], [0.5]])("accepts %s", async (score) => {
    const r = await call("/api/submissions/batch", json({ ops: [op("ok-" + score, score)] }), cookie);
    expect(r.status).toBe(200);
    expect(await scoreOf()).toBe(score);
  });
  it.each([[7.500000000000001], [7.25]])("refuses %s with 422 and stores nothing", async (score) => {
    const r = await call("/api/submissions/batch", json({ ops: [op("bad", score)] }), cookie);
    expect(r.status).toBe(422);
    expect((await r.json() as any).error).toBe("validation");
    expect(await scoreOf()).toBeNull();
  });
});

describe("AC-05 restore: the chunk step refuses what isHalfStep refuses", () => {
  async function chunkWith(score: unknown): Promise<Response> {
    await call("/api/submissions/batch", json({ ops: [op("base", 7.5)] }), cookie);
    const b: Backup = structuredClone(await takeBackup(cookie));
    b.data.submissions.find((s) => s.student_id === "st1")!.score = score;
    const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: b.counts } }), cookie)).json()) as any;
    return call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: "submissions", seq: 0, rows: b.data.submissions }), cookie);
  }
  it.each([[7.5], [0.5]])("chunk with %s is accepted", async (score) => {
    expect((await chunkWith(score)).status).toBe(200);
  });
  it.each([[7.500000000000001], [7.25]])("chunk with %s is refused as invalid_backup on submissions.score", async (score) => {
    const r = await chunkWith(score);
    expect(r.status).toBe(422);
    const body = (await r.json()) as any;
    expect(body.error).toBe("invalid_backup");
    expect(body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ table: "submissions", field: "score" })]));
  });
});

describe("AC-01 dashboard API and report agree on 75%", () => {
  it("6 handed in / (10 - 2 excused)", async () => {
    // seed() has st1, st2 in c1; add 8 more so the class is 10, and make a1 overdue
    const extra = Array.from({ length: 8 }, (_, i) => i + 3);
    await env.DB.batch([
      ...extra.map((n) => env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,NULL,'x','y','c1',?,'active',0)")
        .bind("k" + n, "1" + String(n).padStart(2, "0"), "Q-" + String(n).padStart(10, "Z"), n)),
      env.DB.prepare("UPDATE assignments SET due_date='2000-01-01' WHERE id='a1'"),
    ]);
    const ins = (sid: string, status: string, score: number | null, late: number) =>
      env.DB.prepare("INSERT INTO submissions (assignment_id,student_id,status,score,late,submitted_at,updated_at) VALUES ('a1',?,?,?,?,1,1)").bind(sid, status, score, late);
    await env.DB.batch([
      ins("st1", "submitted", 8, 0), ins("st2", "submitted", 8, 0), ins("k3", "submitted", 8, 0), ins("k4", "submitted", 8, 0),
      ins("k5", "submitted", 6, 1), ins("k6", "submitted", null, 0), ins("k7", "excused", null, 0), ins("k8", "excused", null, 0),
    ]);

    const dash = (await (await call("/api/dashboard?term=t1", {}, cookie)).json()) as any;
    const pc = dash.openAssignments.find((a: any) => a.assignment.id === "a1").perClass.find((p: any) => p.classId === "c1");
    expect(pc).toMatchObject({ total: 10, submitted: 6, excused: 2, missing: 2 });
    expect(assignmentRate(pc)).toBe(75);

    const rep = (await (await call("/api/reports/summary?class=c1&subject=s1", {}, cookie)).json()) as any;
    const model = computeReport(rep);
    expect(model.assignments[0].rate).toBe(75);
  });
});

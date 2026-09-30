import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

let cookie: string;
beforeEach(async () => { cookie = await login(); await seed(); });
const op = (extra: Record<string, unknown> = {}) => ({
  opId: crypto.randomUUID(), scanSessionId: "audit", assignmentId: "a1", studentId: "st1",
  status: "submitted", score: 9, fullScoreAtScan: 10, method: "grid", intent: "grade",
  clientTs: Date.now(), dataEpoch: 1, ...extra,
});
const grade = (extra: Record<string, unknown> = {}) => call("/api/submissions/batch", json({ ops: [op(extra)] }), cookie);
const cell = () => env.DB.prepare("SELECT * FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
const full = (score: number) => call("/api/assignments", json({ id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "Audit", full_score: score, class_ids: ["c1"] }), cookie);
const clear = async () => (await (await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie)).json()) as any;
const undo = (batchId: string) => call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);

describe("final audit: bulk undo preserves valid scores and real history", () => {
  it("refuses 9/10 → clear → full score 5 → undo, without a restore audit", async () => {
    await grade();
    const cleared = await clear();
    expect((await full(5)).status).toBe(200);
    const res = await undo(cleared.batchId);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "full_score_changed" });
    expect(await cell()).toMatchObject({ status: "void", score: null });
    expect(await env.DB.prepare("SELECT 1 FROM audit_logs WHERE action='restore'").first()).toBeNull();
  });

  it("checks the current full score inside undo's transaction too", async () => {
    await grade(); const cleared = await clear();
    const g = gateBatch();
    const restoring = callIn(g.env, "/api/assignments/a1/bulk-undo", json({ batchId: cleared.batchId }), cookie);
    await g.ready;
    await full(5);
    g.release();
    const res = await restoring;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "full_score_changed" });
    expect((await cell()).score).toBeNull();
  });

  it("can still undo when a larger full score allows the original score", async () => {
    await grade(); const cleared = await clear(); await full(15);
    expect((await undo(cleared.batchId)).status).toBe(200);
    expect((await cell()).score).toBe(9);
  });

  it("refuses a changed before-state rather than recording a stale snapshot; retry and undo restore 7", async () => {
    const t = Date.now();
    await grade({ score: 5, clientTs: t - 20_000 });
    const g = gateBatch();
    const clearing = callIn(g.env, "/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie);
    await g.ready;
    expect((await grade({ score: 7, clientTs: t - 10_000 })).status).toBe(200);
    g.release();
    const res = await clearing;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "modified_since" });
    expect((await cell()).score).toBe(7);
    expect(await env.DB.prepare("SELECT 1 FROM audit_logs WHERE action='bulk'").first()).toBeNull();
    const retried = await clear();
    expect((await undo(retried.batchId)).status).toBe(200);
    expect((await cell()).score).toBe(7);
  });

  it("notices a changed score even when two writes have the same millisecond timestamp", async () => {
    await grade({ score: 5 });
    const g = gateBatch();
    const clearing = callIn(g.env, "/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE submissions SET score=7 WHERE student_id='st1'").run();
    g.release();
    expect((await clearing).status).toBe(409);
    expect((await cell()).score).toBe(7);
  });
});

describe("final audit: the first hand-in stays the first hand-in", () => {
  it("bounds repeated write conflicts and returns a retryable response without a false audit", async () => {
    await grade({ score: 1 });
    let writes = 0;
    const DB = new Proxy(env.DB, { get(target, key) {
      if (key === "batch") return async (stmts: D1PreparedStatement[]) => {
        writes++;
        await target.prepare("UPDATE submissions SET score=score+1 WHERE student_id='st1'").run();
        return target.batch(stmts);
      };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const pending = op({ score: 8 });
    const res = await callIn({ ...env, DB }, "/api/submissions/batch", json({ ops: [pending] }), cookie);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "write_busy" });
    expect(writes).toBe(3);
    expect((await cell()).score).toBe(4);
    expect(await env.DB.prepare("SELECT 1 FROM audit_logs WHERE op_id=?").bind(pending.opId).first()).toBeNull();
  });
  it.each([false, true])("a concurrent grade keeps the real hand-in time and late=%s, including ACK and audit", async (alreadyLate) => {
    const bkkDay = (delta: number) => new Date(Date.now() + 7 * 3600_000 - delta * 86400_000).toISOString().slice(0, 10);
    const due = bkkDay(alreadyLate ? 2 : 1);
    const receivedAt = alreadyLate ? Date.now() - 10_000 : Date.parse(`${due}T23:59:59+07:00`);
    await env.DB.prepare("UPDATE assignments SET due_date=? WHERE id='a1'").bind(due).run();
    const gradedOp = op({ score: 8 });
    const g = gateBatch();
    const grading = callIn(g.env, "/api/submissions/batch", json({ ops: [gradedOp] }), cookie);
    await g.ready;
    await grade({ score: null, method: "manual", intent: "receive", clientTs: receivedAt });
    g.release();
    const response = (await (await grading).json()) as any;
    expect(response.results[0]).toMatchObject({ result: "ok", submission: { score: 8, submitted_at: receivedAt, late: alreadyLate } });
    expect(await cell()).toMatchObject({ score: 8, submitted_at: receivedAt, late: alreadyLate ? 1 : 0 });
    const audit = await env.DB.prepare("SELECT before_json,after_json FROM audit_logs WHERE op_id=?").bind(gradedOp.opId).first<any>();
    expect(JSON.parse(audit.before_json)).toMatchObject({ score: null, submitted_at: receivedAt, late: alreadyLate });
    expect(JSON.parse(audit.after_json)).toMatchObject({ score: 8, submitted_at: receivedAt, late: alreadyLate ? 1 : 0 });
  });
});

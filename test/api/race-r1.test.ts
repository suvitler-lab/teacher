// Round 1 of the 2026-09-29 audit: a check made BEFORE a write is not a check at all unless it is repeated
// INSIDE the write's own transaction. Each test holds one request between its check and its write
// (gateBatch), lets the world change, then releases it — and asserts that the data, the reply and the
// audit trail all still tell the same, true story.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

function op(o: Record<string, unknown> = {}) {
  return {
    opId: "o" + Math.random().toString(36).slice(2), scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: 3, fullScoreAtScan: 10, method: "grid", clientTs: Date.now(), ...o,
  };
}
const asg = (o: Record<string, unknown> = {}) => ({
  id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
  assigned_date: "2569-09-01", due_date: "2569-12-31", publish_scores: true, class_ids: ["c1"], ...o,
});
const cell = () => env.DB.prepare("SELECT status, score, event_at FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
const auditOf = (opId: string) => env.DB.prepare("SELECT after_json FROM audit_logs WHERE op_id = ?").bind(opId).first<any>();
const bumpEpoch = () => env.DB.prepare("UPDATE meta SET value='2' WHERE key='data_epoch'").run();

describe("a write that was checked before the world changed", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("B01: a request that started before a restore does not write into the restored data", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ opId: "base", score: 5, clientTs: Date.now() - 10_000 })] }), cookie);
    const g = gateBatch();
    const stale = callIn(g.env, "/api/submissions/batch", json({ ops: [op({ opId: "stale", score: 9, dataEpoch: 1 })] }), cookie);
    await g.ready;
    await bumpEpoch(); // what a restore does last: the data is now a different data set
    g.release();

    const body = (await (await stale).json()) as any;
    expect(body.results[0].result).toBe("epoch_changed");
    expect((await cell()).score).toBe(5);
    expect(await auditOf("stale")).toBeNull();
  });

  it("B01: same for a whole-class bulk action", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ opId: "base", score: 5, clientTs: Date.now() - 10_000 })] }), cookie);
    const g = gateBatch();
    const bulk = callIn(g.env, "/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie);
    await g.ready;
    await bumpEpoch();
    g.release();

    const res = await bulk;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "epoch_changed" });
    expect((await cell()).status).toBe("submitted");
  });

  it("B01: same for an assignment edit", async () => {
    const g = gateBatch();
    const edit = callIn(g.env, "/api/assignments", json(asg({ title: "แก้ไขก่อน restore" })), cookie);
    await g.ready;
    await bumpEpoch();
    g.release();

    expect((await edit).status).toBe(409);
    expect((await env.DB.prepare("SELECT title FROM assignments WHERE id='a1'").first<any>()).title).toBe("ใบงาน 1");
  });

  it("B04: an older score that lost to a newer one is answered `superseded`, and never audited as written", async () => {
    const t = Date.now();
    const g = gateBatch();
    const older = callIn(g.env, "/api/submissions/batch", json({ ops: [op({ opId: "older", score: 3, clientTs: t - 500 })] }), cookie);
    await g.ready;
    const newer = (await (await call("/api/submissions/batch", json({ ops: [op({ opId: "newer", score: 9, clientTs: t })] }), cookie)).json()) as any;
    expect(newer.results[0].result).toBe("ok");
    g.release();

    const r = ((await (await older).json()) as any).results[0];
    expect(r.result).toBe("superseded");
    expect(r.submission.score).toBe(9); // the truth, not what this op wanted
    expect((await cell()).score).toBe(9);
    expect(await auditOf("older")).toBeNull();
    expect(JSON.parse((await auditOf("newer")).after_json).score).toBe(9);
  });

  it("B04: two ops for one student in one request are both audited when both land", async () => {
    const t = Date.now();
    const res = (await (await call("/api/submissions/batch", json({ ops: [
      op({ opId: "first", status: "submitted", score: null, clientTs: t - 100 }),
      op({ opId: "second", score: 8, clientTs: t }),
    ] }), cookie)).json()) as any;
    expect(res.results.map((r: any) => r.result)).toEqual(["ok", "ok"]);
    expect(await auditOf("first")).not.toBeNull();
    expect(JSON.parse((await auditOf("second")).after_json).score).toBe(8);
    expect((await cell()).score).toBe(8);
  });

  it("B05: a score checked against the old full score is refused when the full score was lowered meanwhile", async () => {
    const g = gateBatch();
    const grade = callIn(g.env, "/api/submissions/batch", json({ ops: [op({ opId: "nine", score: 9 })] }), cookie);
    await g.ready;
    expect((await call("/api/assignments", json(asg({ full_score: 5 })), cookie)).status).toBe(200);
    g.release();

    const r = ((await (await grade).json()) as any).results[0];
    expect(r).toMatchObject({ result: "full_score_changed", currentFullScore: 5 });
    expect(await cell()).toBeNull();
    expect(await auditOf("nine")).toBeNull();
  });

  it("B05: and the other way round — lowering the full score under a score that lands first is refused", async () => {
    const g = gateBatch();
    const lower = callIn(g.env, "/api/assignments", json(asg({ full_score: 5 })), cookie);
    await g.ready;
    expect(((await (await call("/api/submissions/batch", json({ ops: [op({ opId: "nine", score: 9 })] }), cookie)).json()) as any).results[0].result).toBe("ok");
    g.release();

    const res = await lower;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "score_over_full", over: 1 });
    const row = await env.DB.prepare("SELECT a.full_score AS f, s.score AS s FROM assignments a JOIN submissions s ON s.assignment_id = a.id").first<any>();
    expect(row).toEqual({ f: 10, s: 9 });
  });

  it("B05: a bulk full-score is not written with a full score that has since changed", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ opId: "in", score: null })] }), cookie);
    const g = gateBatch();
    const full = callIn(g.env, "/api/assignments/a1/bulk", json({ action: "full-score", classId: "c1" }), cookie);
    await g.ready;
    await call("/api/assignments", json(asg({ full_score: 5 })), cookie);
    g.release();

    const res = await full;
    expect(res.status).toBe(409);
    expect((await cell()).score).toBeNull();
  });

  it("closing the assignment meanwhile stops a hand-in that was accepted a moment earlier", async () => {
    const g = gateBatch();
    const scan = callIn(g.env, "/api/submissions/batch", json({ ops: [op({ opId: "late", method: "camera", score: null })] }), cookie);
    await g.ready;
    await call("/api/assignments", json(asg({ status: "closed" })), cookie);
    g.release();

    expect(((await (await scan).json()) as any).results[0].result).toBe("assignment_closed");
    expect(await cell()).toBeNull();
  });

  it("deleting the assignment meanwhile stops the write", async () => {
    const g = gateBatch();
    const scan = callIn(g.env, "/api/submissions/batch", json({ ops: [op({ opId: "gone" })] }), cookie);
    await g.ready;
    await call("/api/assignments/a1/delete", json({}), cookie);
    g.release();

    expect(((await (await scan).json()) as any).results[0]).toMatchObject({ result: "invalid", reason: "assignment_missing" });
    expect(await cell()).toBeNull();
  });

  it("moving the student to another class meanwhile stops the write", async () => {
    const g = gateBatch();
    const scan = callIn(g.env, "/api/submissions/batch", json({ ops: [op({ opId: "moved" })] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE students SET class_id='c2' WHERE id='st1'").run();
    g.release();

    expect(((await (await scan).json()) as any).results[0].result).toBe("not_in_class");
    expect(await cell()).toBeNull();
  });

  it("bulk reports what it really changed, not what it meant to", async () => {
    // st1 already holds something newer than this bulk action, so the bulk must leave it alone
    await call("/api/submissions/batch", json({ ops: [op({ opId: "future", score: 4, clientTs: Date.now() })] }), cookie);
    await env.DB.prepare("UPDATE submissions SET event_at = event_at + 60000 WHERE student_id='st1'").run();
    const res = (await (await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie)).json()) as any;
    expect(res.changed).toBe(0);
    expect((await cell()).status).toBe("submitted");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='bulk'").first<any>()).n).toBe(0);
  });
});

describe("every other data write holds the same line against a restore that lands mid-request", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });
  const held = async (path: string, body: unknown) => {
    const g = gateBatch();
    const req = callIn(g.env, path, json(body), cookie);
    await g.ready;
    await bumpEpoch();
    g.release();
    return req;
  };

  it("attendance taps are refused with the students named, and nothing is written", async () => {
    const res = await held("/api/attendance/batch", { date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present" }] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "epoch_changed", studentIds: ["st1"] });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM attendance").first<any>()).n).toBe(0);
  });

  it("a student edit is refused", async () => {
    const res = await held("/api/students", { id: "st1", code: "101", first_name: "เปลี่ยน", last_name: "ข", class_id: "c1", number: 1 });
    expect(res.status).toBe(409);
    expect((await env.DB.prepare("SELECT first_name FROM students WHERE id='st1'").first<any>()).first_name).toBe("ก");
  });

  it("a class rename is refused", async () => {
    const res = await held("/api/classes", { id: "c1", name: "ห้องใหม่" });
    expect(res.status).toBe(409);
    expect((await env.DB.prepare("SELECT name FROM classes WHERE id='c1'").first<any>()).name).toBe("ป.6/1");
  });

  it("deleting an assignment is refused", async () => {
    const res = await held("/api/assignments/a1/delete", {});
    expect(res.status).toBe(409);
    expect((await env.DB.prepare("SELECT deleted_at FROM assignments WHERE id='a1'").first<any>()).deleted_at).toBeNull();
  });

  it("two undos of one bulk clear at the same moment apply once", async () => {
    await call("/api/submissions/batch", json({ ops: [op({ opId: "in", score: 4 })] }), cookie);
    const clear = (await (await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie)).json()) as any;
    expect(clear.changed).toBe(1);
    const undo = () => call("/api/assignments/a1/bulk-undo", json({ batchId: clear.batchId }), cookie);
    const [a, b] = await Promise.all([undo(), undo()]);
    const bodies = [(await a.json()) as any, (await b.json()) as any];
    expect(bodies.filter((x) => x.changed === 1)).toHaveLength(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='restore'").first<any>()).n).toBe(1);
    expect((await cell()).score).toBe(4);
  });
});

describe("the API keeps the relations the screens rely on", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("B07: bulk refuses a class the assignment was not given to, and touches nobody", async () => {
    const res = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c2" }), cookie);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "class_not_assigned" });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions").first<any>()).n).toBe(0);
  });

  it("B07: an assignment with no class links at all still accepts bulk for any class (older data)", async () => {
    await env.DB.prepare("DELETE FROM assignment_classes WHERE assignment_id='a1'").run();
    const res = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c2" }), cookie);
    expect(res.status).toBe(200);
  });

  it("B08: moving an assignment to a term of another year is refused while it keeps last year's class", async () => {
    await env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('t2',2570,1,'1/2570',0,0)").run();
    const res = await call("/api/assignments", json(asg({ term_id: "t2" })), cookie);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "class_year_mismatch" });
    expect((await env.DB.prepare("SELECT term_id FROM assignments WHERE id='a1'").first<any>()).term_id).toBe("t1");
  });

  it("B08: editing an assignment without changing its term never re-judges older classes", async () => {
    await env.DB.prepare("UPDATE classes SET year = 2568 WHERE id='c1'").run(); // predates the year model
    const res = await call("/api/assignments", json(asg({ title: "แก้ชื่อเฉย ๆ" })), cookie);
    expect(res.status).toBe(200);
  });
});

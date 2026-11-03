// correctness-lows (2026-11-03): the reviewer's low findings of C-02 on EP-05 `POST /api/assignments` (+ EP-04 undo).
// Written BEFORE the fix (AC-03 and AC-04 failed on b16af7f; AC-05 is a test gap — it passed already and stays as a guard).
//
// Fixture (fictional): a1 "ใบงาน 1" full 10, open, given to c1 AND c2.
//   c1: ก st1 = submitted 10 (hid, on time) · ข st2 = submitted 7 (grid)
//   c2: ซ st9 = submitted 10 (grid)
// Full holders (BR-01) = ก, ซ.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

const DAY = 86_400_000;
const bkkDay = (daysAgo: number) => new Date(Date.now() + 7 * 3600_000 - daysAgo * DAY).toISOString().slice(0, 10);
const DUE = bkkDay(3);
const T_ON_TIME = Date.now() - 5 * DAY;
const KO = "st1", KHO = "st2", SO = "st9";
const NINE = "status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at";

let cookie: string;

const A1 = () => ({
  id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
  assigned_date: bkkDay(10), due_date: DUE, publish_scores: true, status: "open", class_ids: ["c1", "c2"],
});
const save = (body: Record<string, unknown>, e?: typeof env) =>
  e ? callIn(e, "/api/assignments", json(body), cookie) : call("/api/assignments", json(body), cookie);
const one = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
const all = async (sql: string, ...b: unknown[]) => ((await env.DB.prepare(sql).bind(...b).all<any>()).results ?? []) as any[];
const work = () => one<any>("SELECT full_score, status, publish_scores, title FROM assignments WHERE id = 'a1'");
const cellOf = (sid: string) => one<any>(`SELECT ${NINE} FROM submissions WHERE assignment_id = 'a1' AND student_id = ?`, sid);
const maxAuditId = async () => ((await one<any>("SELECT COALESCE(MAX(id), 0) AS m FROM audit_logs")).m as number);
const auditsAfter = (id: number) => all("SELECT * FROM audit_logs WHERE id > ? ORDER BY id", id);

function sub(sid: string, score: number, method = "grid") {
  return env.DB.prepare(
    `INSERT INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     VALUES ('a1',?,'submitted',?,0,?,?,'dev_fixture',NULL,?,?)`,
  ).bind(sid, score, T_ON_TIME, method, T_ON_TIME, T_ON_TIME);
}

beforeEach(async () => {
  cookie = await login();
  await seed();
  await env.DB.batch([
    env.DB.prepare("UPDATE assignments SET due_date = ?, assigned_date = ? WHERE id = 'a1'").bind(DUE, bkkDay(10)),
    env.DB.prepare("INSERT INTO assignment_classes (assignment_id, class_id) VALUES ('a1','c2')"),
    sub(KO, 10, "hid"), sub(KHO, 7), sub(SO, 10),
  ]);
});

describe("AC-03 (C-02 R-05): the holders of a class removed in the same save are neither counted nor adjusted", () => {
  it("raise 10 → 20 and drop c2, no answer → 409 raise_choice_required with count 1 (ก only), nothing lands", async () => {
    const mark = await maxAuditId();
    const res = await save({ ...A1(), full_score: 20, class_ids: ["c1"] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "raise_choice_required", count: 1, from: 10, to: 20 });
    expect((await work()).full_score).toBe(10);
    expect(await auditsAfter(mark)).toEqual([]);
  });

  it("…ปรับ → ก 20 · ซ (c2, removed) stays 10 · raise.count 1 · one cell line + the work line (count 1)", async () => {
    const mark = await maxAuditId();
    const res = await save({ ...A1(), full_score: 20, class_ids: ["c1"], raise_choice: "adjust", raise_from: 10 });
    expect(res.status).toBe(200);
    const raise = ((await res.json()) as any).raise;
    expect(raise).toMatchObject({ choice: "adjust", from: 10, to: 20, count: 1 });
    expect((await cellOf(KO)).score).toBe(20);
    expect((await cellOf(SO)).score).toBe(10);
    expect((await cellOf(KHO)).score).toBe(7);
    const lines = await auditsAfter(mark);
    expect(lines.filter((l) => l.entity === "submission").map((l) => l.student_id)).toEqual([KO]);
    const workLine = lines.find((l) => l.entity === "assignment");
    expect(JSON.parse(workLine.after_json).raise).toMatchObject({ choice: "adjust", count: 1 });
    // …and the undo (EP-04) gives back ก's 10
    const undo = await call("/api/assignments/a1/bulk-undo", json({ batchId: raise.batchId }), cookie);
    expect(undo.status).toBe(200);
    expect((await cellOf(KO)).score).toBe(10);
  });

  it("…คงไว้ → raise.count 1 and the work line says 1", async () => {
    const mark = await maxAuditId();
    const res = await save({ ...A1(), full_score: 20, class_ids: ["c1"], raise_choice: "keep", raise_from: 10 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).raise).toMatchObject({ choice: "keep", count: 1 });
    const workLine = (await auditsAfter(mark)).find((l) => l.entity === "assignment");
    expect(JSON.parse(workLine.after_json).raise).toMatchObject({ choice: "keep", count: 1 });
  });

  it("drop c2 when only ซ (c2) holds the full score → a plain raise, no question, nobody adjusted", async () => {
    await env.DB.prepare("UPDATE submissions SET score = 9 WHERE student_id = ?").bind(KO).run();
    const res = await save({ ...A1(), full_score: 20, class_ids: ["c1"] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).raise).toBeNull();
    expect((await work()).full_score).toBe(20);
    expect((await cellOf(SO)).score).toBe(10);
  });

  it("[guard] no class removed → count 2 (ก ซ), both adjusted", async () => {
    const res = await save({ ...A1(), full_score: 20 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ count: 2 });
    const ok = await save({ ...A1(), full_score: 20, raise_choice: "adjust", raise_from: 10 });
    expect(((await ok.json()) as any).raise).toMatchObject({ count: 2 });
    expect((await cellOf(SO)).score).toBe(20);
  });

  it("[guard] a moved student whose class is still given the work is still a holder (BR-01: every student status)", async () => {
    await env.DB.prepare("UPDATE students SET status = 'moved' WHERE id = ?").bind(SO).run();
    const res = await save({ ...A1(), full_score: 20 });
    expect(await res.json()).toMatchObject({ count: 2 });
  });
});

describe("AC-04 (C-02 R-04): a save without full_score keeps the stored full score (the gradebook's close / hide)", () => {
  /** What the gradebook sends to close a1 from a list where another device has since lowered 20 → 10. */
  const patch = (over: Record<string, unknown> = {}) => {
    const { full_score: _drop, ...rest } = A1();
    return { ...rest, ...over };
  };

  it("close without full_score → 200, closed, full score as stored (10), no raise question", async () => {
    const res = await save(patch({ status: "closed" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.raise).toBeNull();
    expect(body.assignment).toMatchObject({ id: "a1", status: "closed", full_score: 10 });
    expect(await work()).toMatchObject({ full_score: 10, status: "closed" });
  });

  it("the work line of the audit says the stored full score", async () => {
    const mark = await maxAuditId();
    expect((await save(patch({ publish_scores: false }))).status).toBe(200);
    const line = (await auditsAfter(mark)).find((l) => l.entity === "assignment");
    expect(JSON.parse(line.after_json)).toMatchObject({ full_score: 10 });
    expect(JSON.parse(line.before_json)).toMatchObject({ full_score: 10 });
  });

  it("another device changes the full score between the read and the write → the newer full score stays", async () => {
    const g = gateBatch();
    const pending = save(patch({ status: "closed" }), g.env);
    await g.ready;
    await env.DB.prepare("UPDATE assignments SET full_score = 15 WHERE id = 'a1'").run();
    g.release();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).assignment.full_score).toBe(15);
    expect(await work()).toMatchObject({ full_score: 15, status: "closed" });
  });

  it("a NEW work without full_score → 422 validation, nothing created", async () => {
    const res = await save(patch({ id: "a_new", title: "งานใหม่" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).error).toBe("validation");
    expect(await one("SELECT id FROM assignments WHERE id = 'a_new'")).toBeNull();
    const res2 = await save((({ id: _i, ...r }) => r)(patch()));
    expect(res2.status).toBe(422);
  });

  it("review R-05: raise_choice / raise_from sent without full_score are ignored (no raise) — 200, not 409 full_score_changed", async () => {
    const res = await save(patch({ status: "closed", raise_choice: "adjust", raise_from: 99 }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).raise).toBeNull();
    expect(await work()).toMatchObject({ full_score: 10, status: "closed" });
    expect((await cellOf(KO)).score).toBe(10);
  });

  it("[guard] the old full request (stale full_score 20 over a stored 10 with holders) is still asked: 409 raise_choice_required", async () => {
    const res = await save({ ...A1(), full_score: 20, status: "closed" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("raise_choice_required");
  });
});

describe("AC-05 (C-02 R-07): ปรับ + a due-date edit in one save, then EP-04 undo", () => {
  it("the raise lands with the late of the new due date, and the undo gives back every score (late by the current due date)", async () => {
    const newDue = bkkDay(6); // before T_ON_TIME (5 days ago) → ก and ซ become late
    const mark = await maxAuditId();
    const res = await save({ ...A1(), full_score: 20, due_date: newDue, raise_choice: "adjust", raise_from: 10 });
    expect(res.status).toBe(200);
    const raise = ((await res.json()) as any).raise;
    expect(raise).toMatchObject({ count: 2 });
    expect(await cellOf(KO)).toMatchObject({ score: 20, late: 1, submitted_at: T_ON_TIME, status: "submitted" });
    expect(await cellOf(KHO)).toMatchObject({ score: 7, late: 1 });
    // each cell line's `after` is the cell as the batch left it (late included)
    const cellLines = (await auditsAfter(mark)).filter((l) => l.entity === "submission");
    expect(cellLines.map((l) => [l.student_id, JSON.parse(l.after_json).late, JSON.parse(l.before_json).late]))
      .toEqual([[KO, true, false], [SO, true, false]]);

    const undo = await call("/api/assignments/a1/bulk-undo", json({ batchId: raise.batchId }), cookie);
    expect(undo.status).toBe(200);
    expect(((await undo.json()) as any).changed).toBe(2);
    expect(await cellOf(KO)).toMatchObject({ score: 10, late: 1, submitted_at: T_ON_TIME, status: "submitted" });
    expect(await cellOf(SO)).toMatchObject({ score: 10, late: 1 });
    expect((await work()).full_score).toBe(20);
    expect((await one<any>("SELECT due_date FROM assignments WHERE id = 'a1'")).due_date).toBe(newDue);
    // a second undo is a no-op
    const again = await call("/api/assignments/a1/bulk-undo", json({ batchId: raise.batchId }), cookie);
    expect(await again.json()).toMatchObject({ ok: true, changed: 0, alreadyUndone: true });
  });
});

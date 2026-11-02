// M1-06 / BR-06, BR-07, BR-02: the server decides on its own whether an op ACCEPTS a hand-in or GRADES work —
// from the method only, never from the client's `intent` field (still accepted so older clients keep working, but
// ignored). A batch is judged op by op against the state left by the ops before it in the same request. The whole-
// class buttons never touch an excused cell.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

function op(o: Record<string, unknown> = {}) {
  return {
    opId: "o" + Math.random().toString(36).slice(2), scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: null, fullScoreAtScan: 10, method: "grid", clientTs: Date.now(), ...o,
  };
}
const batch = async (cookie: string, ...ops: Record<string, unknown>[]) =>
  ((await (await call("/api/submissions/batch", json({ ops }), cookie)).json()) as any).results as any[];
const cellOf = (sid: string) =>
  env.DB.prepare("SELECT * FROM submissions WHERE assignment_id='a1' AND student_id=?").bind(sid).first<any>();
const auditOf = (opId: string) => env.DB.prepare("SELECT * FROM audit_logs WHERE op_id = ?").bind(opId).first<any>();
const closeA1 = () => env.DB.prepare("UPDATE assignments SET status = 'closed' WHERE id = 'a1'").run();
const bulk = async (cookie: string, action: string) => {
  const res = await call("/api/assignments/a1/bulk", json({ action, classId: "c1" }), cookie);
  return { status: res.status, body: (await res.json()) as any };
};

describe("BR-06: a hand-in is decided from the method, never from the client's intent", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  for (const method of ["hid", "camera", "manual"]) {
    it(`AC-01: closed work, ${method} op claiming intent "grade" -> assignment_closed, no row, no audit`, async () => {
      await closeA1();
      const o = op({ method, intent: "grade", score: 8 });
      const [r] = await batch(cookie, o);
      expect(r).toEqual({ opId: o.opId, result: "assignment_closed" });
      expect(await cellOf("st1")).toBeNull();
      expect(await auditOf(o.opId)).toBeNull();
    });
  }

  for (const extra of [{}, { intent: "grade" }, { intent: "receive" }]) {
    it(`AC-02: closed work, gradebook (grid) score 8 with ${JSON.stringify(extra)} -> ok`, async () => {
      await closeA1();
      const o = op({ method: "grid", score: 8, ...extra });
      const [r] = await batch(cookie, o);
      expect(r.result).toBe("ok");
      expect((await cellOf("st1")).score).toBe(8);
      expect(await auditOf(o.opId)).not.toBeNull();
    });
  }

  it("AC-03: open work, the real clients' ops behave as before", async () => {
    const scan = op({ method: "hid", intent: "receive", clientTs: Date.now() - 20_000 });
    expect((await batch(cookie, scan))[0].result).toBe("ok");
    const was = await cellOf("st1");
    expect(was.status).toBe("submitted");
    const grade = op({ method: "grid", intent: "grade", score: 7, clientTs: Date.now() - 10_000 });
    expect((await batch(cookie, grade))[0].result).toBe("ok");
    const now = await cellOf("st1");
    expect(now.score).toBe(7);
    expect(now.submitted_at).toBe(was.submitted_at);
    const camera = op({ studentId: "st2", method: "camera", intent: "receive" });
    expect((await batch(cookie, camera))[0].result).toBe("ok");
  });
});

describe("BR-02 / R-06: a batch is judged against the state the ops before it left", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("AC-04: moved student, one request [void, grade 8] -> void ok, grade student_inactive, the cell stays void", async () => {
    await batch(cookie, op({ opId: "scan", method: "hid", clientTs: Date.now() - 60_000 }));
    await env.DB.prepare("UPDATE students SET status = 'moved', left_at = '2026-10-15' WHERE id = 'st1'").run();
    const v = op({ opId: "v", status: "void", method: "manual", clientTs: Date.now() - 20_000 });
    const g = op({ opId: "g", method: "grid", score: 8, clientTs: Date.now() - 10_000 });
    const [rv, rg] = await batch(cookie, v, g);
    expect(rv.result).toBe("ok");
    expect(rg).toEqual({ opId: "g", result: "student_inactive" });
    const cell = await cellOf("st1");
    expect(cell.status).toBe("void");
    expect(cell.score).toBeNull();
    expect(await auditOf("g")).toBeNull();
  });
});

describe("BR-07: the whole-class buttons never touch an excused cell", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
    const now = Date.now();
    await env.DB.batch(["st3", "st4", "st5"].map((sid, i) => env.DB.prepare(
      "INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,'ด.ช.','ก','ข','c1',?,'active',?)",
    ).bind(sid, `10${i + 3}`, `Q-X${i}XXXXXXXX`, i + 3, now)));
    // st1 excused, st2 + st3 handed in, st4 + st5 nothing yet
    const t = Date.now() - 60_000;
    const rs = await batch(cookie,
      op({ studentId: "st1", status: "excused", score: null, clientTs: t }),
      op({ studentId: "st2", method: "hid", clientTs: t }),
      op({ studentId: "st3", method: "hid", clientTs: t }));
    expect(rs.map((r) => r.result)).toEqual(["ok", "ok", "ok"]);
  });

  it("AC-05: all-submitted, full-score and clear leave the excused cell alone; changed counts real changes; undo works", async () => {
    const excused = await cellOf("st1");
    expect(excused.status).toBe("excused");

    const all = await bulk(cookie, "all-submitted");
    expect(all.status).toBe(200);
    expect(all.body.changed).toBe(2); // st4, st5
    expect(await cellOf("st1")).toEqual(excused);

    const full = await bulk(cookie, "full-score");
    expect(full.body.changed).toBe(4); // st2..st5
    expect(await cellOf("st1")).toEqual(excused);
    for (const sid of ["st2", "st3", "st4", "st5"]) expect((await cellOf(sid)).score).toBe(10);

    const clear = await bulk(cookie, "clear");
    expect(clear.body.changed).toBe(4);
    expect(await cellOf("st1")).toEqual(excused);
    for (const sid of ["st2", "st3", "st4", "st5"]) expect((await cellOf(sid)).status).toBe("void");

    const undo = await call("/api/assignments/a1/bulk-undo", json({ batchId: clear.body.batchId }), cookie);
    expect(undo.status).toBe(200);
    for (const sid of ["st2", "st3", "st4", "st5"]) {
      const c = await cellOf(sid);
      expect(c.status).toBe("submitted");
      expect(c.score).toBe(10);
    }
    expect(await cellOf("st1")).toEqual(excused);
  });
});

describe("Verify 1 R-01 / R-03: the batch route accepts only what a screen sends", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });
  const send = (...ops: Record<string, unknown>[]) => call("/api/submissions/batch", json({ ops }), cookie);

  for (const method of ["bulk", "import", "restore"]) {
    it(`R-01: method ${method} through the batch route -> 422, no row, no audit`, async () => {
      const o = op({ method, score: 8 });
      const res = await send(o);
      expect(res.status).toBe(422);
      expect(((await res.json()) as any).error).toBe("validation");
      expect(await cellOf("st1")).toBeNull();
      expect(await auditOf(o.opId)).toBeNull();
    });
  }

  it("R-01: the screens' methods still go through", async () => {
    // integrity-c01 (BR-02, D-integrity-c01-04): the typed number right after the same round's camera hand-in carries
    // the score the keypad sends — a second scoreless hand-in on a submitted cell is `already_submitted` now (BR-01)
    const rs = await batch(cookie,
      op({ method: "hid" }), op({ studentId: "st2", method: "camera" }),
      op({ studentId: "st2", method: "manual", score: 8, clientTs: Date.now() + 1 }), op({ method: "grid", score: 8, clientTs: Date.now() + 2 }));
    expect(rs.map((r) => r.result)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(await cellOf("st2")).toMatchObject({ status: "submitted", score: 8, method: "manual" });
  });

  it("R-03: the same opId twice in one request -> 422, nothing written", async () => {
    const a = op({ opId: "same", method: "grid", score: 4 });
    const b = op({ opId: "same", method: "grid", score: 9, clientTs: Date.now() + 1 });
    const res = await send(a, b);
    expect(res.status).toBe(422);
    expect(await cellOf("st1")).toBeNull();
    expect(await auditOf("same")).toBeNull();
  });
});

// integrity-c01 T-02: `already_submitted` judged on a row written earlier in the SAME request — the answer must follow
// what that row really did (landed -> the stored row; did not land -> judged again on the cell as it is)
describe("integrity-c01 BR-01 / BR-06: a hand-in after another hand-in of the same cell in one request", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("[R1 hid null, R2 hid 10] on an empty cell -> [ok, already_submitted with R1's row]; one audit; cell = R1", async () => {
    const t = Date.now() - 30_000;
    const r1 = op({ scanSessionId: "R1", method: "hid", score: null, clientTs: t });
    const r2 = op({ scanSessionId: "R2", method: "hid", score: 10, clientTs: t + 5_000 });
    const [a, b] = await batch(cookie, r1, r2);
    expect(a.result).toBe("ok");
    expect(b).toEqual({ opId: r2.opId, result: "already_submitted", submission: a.submission });
    expect(await cellOf("st1")).toMatchObject({ status: "submitted", score: null, scan_session_id: "R1", submitted_at: t });
    expect(await auditOf(r1.opId)).not.toBeNull();
    expect(await auditOf(r2.opId)).toBeNull();
  });

  it("the earlier hand-in does not land (work closed between the check and the write) -> both assignment_closed, nothing written", async () => {
    const t = Date.now() - 30_000;
    const r1 = op({ scanSessionId: "R1", method: "hid", score: null, clientTs: t });
    const r2 = op({ scanSessionId: "R2", method: "camera", score: 10, clientTs: t + 5_000 });
    const g = gateBatch();
    const held = callIn(g.env, "/api/submissions/batch", json({ ops: [r1, r2] }), cookie);
    await g.ready; // both ops judged: r1 to write, r2 already_submitted on r1's row
    await closeA1();
    g.release();
    const res = (await (await held).json()) as any;
    expect(res.results).toEqual([
      { opId: r1.opId, result: "assignment_closed" },
      { opId: r2.opId, result: "assignment_closed" },
    ]);
    expect(await cellOf("st1")).toBeNull();
    expect(await auditOf(r1.opId)).toBeNull();
    expect(await auditOf(r2.opId)).toBeNull();
  });

  it("[hid null, grid 7] of the same cell in one request -> ok, ok (a grade after a hand-in is never already_submitted)", async () => {
    const t = Date.now() - 30_000;
    const [a, b] = await batch(cookie,
      op({ scanSessionId: "R1", method: "hid", score: null, clientTs: t }),
      op({ scanSessionId: "gb", method: "grid", score: 7, clientTs: t + 5_000 }));
    expect([a.result, b.result]).toEqual(["ok", "ok"]);
    expect(await cellOf("st1")).toMatchObject({ status: "submitted", score: 7, submitted_at: t });
  });
});

// QA (black-box) for M1-06: BR-06 (the server decides "hand-in" vs "grading" from the method, never from the
// client's intent), BR-02 judged op by op inside one request, BR-07 (whole-class buttons never touch an excused
// cell), D24 (average attendance pooled). Expected results were worked out from the BRs BEFORE running:
// docs/team/jobs/2026-10-30-m1-06-server-intent/evidence/qa-expected-from-br.md (E-xx).
// Every request here is hand-crafted (not sent through the UI), so it tests what the SERVER enforces.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, cookieFrom, json, login, seed } from "./helpers";
import { averageAttendancePercent } from "@shared/metrics";

type Op = Record<string, unknown>;
let seq = 0;
function op(o: Op = {}): Op {
  return {
    opId: `q6_${++seq}_${Math.random().toString(36).slice(2, 8)}`, scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: null, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
const send = (ops: Op[], cookie?: string) => call("/api/submissions/batch", json({ ops }), cookie);
const batch = async (cookie: string, ...ops: Op[]) => ((await (await send(ops, cookie)).json()) as any).results as any[];
const one = async (cookie: string, o: Op) => (await batch(cookie, o))[0];
const cellOf = (sid: string) =>
  env.DB.prepare("SELECT * FROM submissions WHERE assignment_id = 'a1' AND student_id = ?").bind(sid).first<any>();
const auditOf = (opId: unknown) => env.DB.prepare("SELECT * FROM audit_logs WHERE op_id = ?").bind(opId).first<any>();
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<any>()).n as number;
const dropCell = (sid = "st1") => env.DB.prepare("DELETE FROM submissions WHERE assignment_id = 'a1' AND student_id = ?").bind(sid).run();
const closeA1 = () => env.DB.prepare("UPDATE assignments SET status = 'closed' WHERE id = 'a1'").run();
const moveOut = (sid = "st1") => env.DB.prepare("UPDATE students SET status = 'moved', left_at = '2026-10-15' WHERE id = ?").bind(sid).run();
const bulk = async (cookie: string | undefined, action: string) => {
  const res = await call("/api/assignments/a1/bulk", json({ action, classId: "c1" }), cookie);
  return { status: res.status, body: (await res.json()) as any };
};

const RECEIVE_METHODS = ["camera", "hid", "manual"];
const GRADE_METHODS = ["grid"]; // Verify 1 (R-01): the batch route takes camera|hid|manual|grid only
const NOT_BATCH_METHODS = ["bulk", "import", "restore"];
const INTENTS: Op[] = [{}, { intent: "receive" }, { intent: "grade" }];

describe("QA BR-06 E-01: method x intent x open/closed (hand-crafted requests)", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("E-01 open work: all 4 batch methods x 3 intents -> ok on an empty cell", async () => {
    for (const method of [...RECEIVE_METHODS, ...GRADE_METHODS]) {
      for (const extra of INTENTS) {
        await dropCell();
        const o = op({ method, score: GRADE_METHODS.includes(method) ? 8 : null, ...extra });
        expect((await one(cookie, o)).result, `${method} ${JSON.stringify(extra)}`).toBe("ok");
        expect((await cellOf("st1")).status).toBe("submitted");
      }
    }
  });

  it("E-01 closed work: camera/hid/manual with ANY intent (incl. a forged 'grade') -> assignment_closed, no row, no audit", async () => {
    await closeA1();
    const audits = await count("audit_logs");
    for (const method of RECEIVE_METHODS) {
      for (const extra of INTENTS) {
        const o = op({ method, score: 8, ...extra });
        expect(await one(cookie, o), `${method} ${JSON.stringify(extra)}`).toEqual({ opId: o.opId, result: "assignment_closed" });
        expect(await auditOf(o.opId)).toBeNull();
      }
    }
    expect(await cellOf("st1")).toBeNull();
    expect(await count("audit_logs")).toBe(audits);
  });

  it("E-01 closed work: grid with ANY intent (incl. 'receive') -> ok, score 8, audited", async () => {
    await closeA1();
    for (const method of GRADE_METHODS) {
      for (const extra of INTENTS) {
        await dropCell();
        const o = op({ method, score: 8, ...extra });
        expect((await one(cookie, o)).result, `${method} ${JSON.stringify(extra)}`).toBe("ok");
        expect((await cellOf("st1")).score).toBe(8);
        expect(await auditOf(o.opId)).not.toBeNull();
      }
    }
  });

  it("E-01b closed work: void / excused sent from the scan page (hid, intent receive) are not hand-ins -> ok", async () => {
    expect((await one(cookie, op({ method: "hid", clientTs: Date.now() - 60_000 }))).result).toBe("ok");
    await closeA1();
    const x = op({ method: "hid", intent: "receive", status: "excused", clientTs: Date.now() - 30_000 });
    expect((await one(cookie, x)).result).toBe("ok");
    expect((await cellOf("st1")).status).toBe("excused");
    const v = op({ method: "hid", intent: "receive", status: "void", clientTs: Date.now() - 10_000 });
    expect((await one(cookie, v)).result).toBe("ok");
    expect((await cellOf("st1")).status).toBe("void");
  });
});

describe("QA 🔐 server-enforcement: hand-crafted requests cannot get round the guards", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("no session -> 401 on batch and bulk (nothing written); an unknown intent value -> 422 (validation)", async () => {
    const audits = await count("audit_logs");
    expect((await send([op({ method: "grid", intent: "grade", score: 8 })])).status).toBe(401);
    expect((await bulk(undefined, "all-submitted")).status).toBe(401);
    expect((await bulk("gk_session=forged", "all-submitted")).status).toBe(401);
    expect((await send([op({ method: "hid", intent: "admin" })], cookie)).status).toBe(422);
    expect(await count("submissions")).toBe(0);
    expect(await count("audit_logs")).toBe(audits);
  });

  it("closed work: the all-submitted button is refused (409); a crafted batch with method bulk/import/restore -> 422, nothing written; grid cannot skip BR-02", async () => {
    await closeA1();
    const audits = await count("audit_logs");
    const btn = await bulk(cookie, "all-submitted");
    expect(btn.status).toBe(409);
    expect(btn.body.error).toBe("assignment_closed");
    // E-01d (Verify 1): methods that belong to other routes are refused by the batch schema
    for (const method of NOT_BATCH_METHODS) {
      for (const extra of INTENTS) {
        const res = await send([op({ method, score: 8, ...extra })], cookie);
        expect(res.status, `${method} ${JSON.stringify(extra)}`).toBe(422);
      }
    }
    expect(await count("submissions")).toBe(0);
    expect(await count("audit_logs")).toBe(audits);
    // E-01e: a moved child off the term's list, empty cell: grading does not turn this into a write
    await moveOut("st2");
    const o = op({ studentId: "st2", method: "grid", score: 5 });
    expect(await one(cookie, o)).toEqual({ opId: o.opId, result: "student_inactive" });
    expect(await cellOf("st2")).toBeNull();
  });

  it("E-05: the same opId twice in one request -> 422, neither op written, no audit", async () => {
    const audits = await count("audit_logs");
    const a = op({ method: "hid" });
    const b = op({ opId: a.opId, studentId: "st2", method: "grid", score: 7 });
    expect((await send([a, b], cookie)).status).toBe(422);
    expect(await cellOf("st1")).toBeNull();
    expect(await cellOf("st2")).toBeNull();
    expect(await count("audit_logs")).toBe(audits);
  });

  it("E-06: one valid op + one op with method 'restore' -> 422 for the whole request, the valid op is not written", async () => {
    const audits = await count("audit_logs");
    const good = op({ method: "hid" });
    const bad = op({ studentId: "st2", method: "restore", score: 7 });
    expect((await send([good, bad], cookie)).status).toBe(422);
    expect(await count("submissions")).toBe(0);
    expect(await count("audit_logs")).toBe(audits);
    expect(await auditOf(good.opId)).toBeNull();
  });

  it("E-02 one request, moved child: [void, grade 8] and [grade 7, void, grade 9] -> the last grade is student_inactive; active child control", async () => {
    expect((await one(cookie, op({ method: "hid", clientTs: Date.now() - 120_000 }))).result).toBe("ok");
    expect((await one(cookie, op({ studentId: "st2", method: "hid", clientTs: Date.now() - 120_000 }))).result).toBe("ok");
    await moveOut("st1");

    const v = op({ status: "void", method: "manual", clientTs: Date.now() - 100_000 });
    const g = op({ method: "grid", intent: "grade", score: 8, clientTs: Date.now() - 90_000 });
    expect((await batch(cookie, v, g)).map((r) => r.result)).toEqual(["ok", "student_inactive"]);
    expect(await auditOf(g.opId)).toBeNull();
    let cell = await cellOf("st1");
    expect([cell.status, cell.score]).toEqual(["void", null]);

    // make it non-void again is impossible (off the list) - so put a scored row back via SQL to test the 3-op chain
    await env.DB.prepare("UPDATE submissions SET status = 'submitted', score = 6, event_at = ? WHERE assignment_id = 'a1' AND student_id = 'st1'")
      .bind(Date.now() - 80_000).run();
    const g1 = op({ method: "grid", score: 7, clientTs: Date.now() - 70_000 });
    const v2 = op({ status: "void", method: "manual", clientTs: Date.now() - 60_000 });
    const g2 = op({ method: "grid", score: 9, clientTs: Date.now() - 50_000 });
    expect((await batch(cookie, g1, v2, g2)).map((r) => r.result)).toEqual(["ok", "ok", "student_inactive"]);
    cell = await cellOf("st1");
    expect([cell.status, cell.score]).toEqual(["void", null]);

    // control: an active child, same [void, grade 8] -> both ok, cell submitted with 8
    const cv = op({ studentId: "st2", status: "void", method: "manual", clientTs: Date.now() - 40_000 });
    const cg = op({ studentId: "st2", method: "grid", score: 8, clientTs: Date.now() - 30_000 });
    expect((await batch(cookie, cv, cg)).map((r) => r.result)).toEqual(["ok", "ok"]);
    const c2 = await cellOf("st2");
    expect([c2.status, c2.score]).toEqual(["submitted", 8]);
  });
});

describe("QA 🔐 role-matrix (one teacher account): signed-out / forged / expired / no session x batch, bulk, bulk-undo -> 401", () => {
  // (ก) the signed-in teacher -> ok on all three is covered above (E-01, E-03, undo test)
  let cookieA: string;
  let cookieB: string;
  let batchId: string;
  const state = async () => JSON.stringify({
    subs: (await env.DB.prepare("SELECT * FROM submissions ORDER BY student_id").all()).results,
    audits: await count("audit_logs"),
  });
  const tryAll = async (cookie: string | undefined) => [
    (await send([op({ method: "grid", score: 8, studentId: "st2" })], cookie)).status,
    (await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie)).status,
    (await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie)).status,
  ];
  beforeEach(async () => {
    cookieA = await login();
    await seed();
    cookieB = cookieFrom(await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "dev_qa_b", deviceName: "เครื่องทดสอบ B" })));
    expect(cookieB).toContain("gk_session=");
    expect((await call("/api/bootstrap", {}, cookieB)).status).toBe(200); // B really is signed in before each case
    expect((await one(cookieA, op({ method: "hid" }))).result).toBe("ok");
    const b = await bulk(cookieA, "all-submitted"); // gives bulk-undo a real batch to aim at
    expect(b.status).toBe(200);
    batchId = b.body.batchId;
  });

  it("(ข) no session and (ค) forged cookie -> 401 on all three endpoints, nothing written", async () => {
    const before = await state();
    expect(await tryAll(undefined)).toEqual([401, 401, 401]);
    expect(await tryAll("gk_session=forged0000000000000000")).toEqual([401, 401, 401]);
    expect(await state()).toBe(before);
  });

  it("(ค) expired session -> 401 on all three endpoints, nothing written", async () => {
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE device_id = 'dev_qa_b'").bind(Date.now() - 1000).run();
    const before = await state();
    expect(await tryAll(cookieB)).toEqual([401, 401, 401]);
    expect(await state()).toBe(before);
  });

  it("(ง) a device signed out from settings -> 401 on all three, nothing written; the teacher's own device still works", async () => {
    expect((await call("/api/devices/dev_qa_b/signout", json({}), cookieA)).status).toBe(200);
    const before = await state();
    expect(await tryAll(cookieB)).toEqual([401, 401, 401]);
    expect(await state()).toBe(before);
    expect((await one(cookieA, op({ studentId: "st2", method: "grid", score: 8 }))).result).toBe("ok");
  });
});

describe("QA BR-07 E-03: each whole-class button on its own, from the same start, never touches excused", () => {
  let cookie: string;
  let excused: any;
  beforeEach(async () => {
    cookie = await login();
    await seed();
    const now = Date.now();
    await env.DB.batch(["st3", "st4", "st5"].map((sid, i) => env.DB.prepare(
      "INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,'ด.ญ.','ทดสอบ','สมมติ','c1',?,'active',?)",
    ).bind(sid, `30${i + 3}`, `Q-QA6${i}XXXXXX`, i + 3, now)));
    const t = Date.now() - 60_000;
    const rs = await batch(cookie,
      op({ studentId: "st1", status: "excused", method: "grid", clientTs: t }),
      op({ studentId: "st2", method: "hid", clientTs: t }),
      op({ studentId: "st3", method: "camera", clientTs: t }));
    expect(rs.map((r) => r.result)).toEqual(["ok", "ok", "ok"]);
    excused = await cellOf("st1");
    expect(excused.status).toBe("excused");
  });

  const CASES: Array<[string, number, (c: Record<string, any>) => void]> = [
    ["all-submitted", 2, (c) => { for (const s of ["st2", "st3", "st4", "st5"]) expect(c[s]?.status, s).toBe("submitted"); }],
    ["full-score", 2, (c) => { for (const s of ["st2", "st3"]) expect(c[s].score, s).toBe(10); expect(c.st4).toBeNull(); expect(c.st5).toBeNull(); }],
    ["clear", 2, (c) => { for (const s of ["st2", "st3"]) expect(c[s].status, s).toBe("void"); expect(c.st4).toBeNull(); expect(c.st5).toBeNull(); }],
  ];
  for (const [action, changed, check] of CASES) {
    it(`"${action}" -> changed ${changed}, excused row byte-identical`, async () => {
      const r = await bulk(cookie, action);
      expect(r.status).toBe(200);
      expect(r.body.changed).toBe(changed);
      const cells: Record<string, any> = {};
      for (const s of ["st1", "st2", "st3", "st4", "st5"]) cells[s] = await cellOf(s);
      expect(cells.st1).toEqual(excused);
      check(cells);
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE batch_id = ? AND student_id = 'st1'").bind(r.body.batchId).first<any>();
      expect(n.n).toBe(0);
    });
  }

  it("undo of all-submitted and of clear restores the others and still leaves excused alone", async () => {
    const all = await bulk(cookie, "all-submitted");
    const u1 = await call("/api/assignments/a1/bulk-undo", json({ batchId: all.body.batchId }), cookie);
    expect(u1.status).toBe(200);
    for (const s of ["st4", "st5"]) { const c = await cellOf(s); expect(c == null || c.status === "void", s).toBe(true); }
    for (const s of ["st2", "st3"]) expect((await cellOf(s)).status).toBe("submitted");
    const clear = await bulk(cookie, "clear");
    const u2 = await call("/api/assignments/a1/bulk-undo", json({ batchId: clear.body.batchId }), cookie);
    expect(u2.status).toBe(200);
    for (const s of ["st2", "st3"]) expect((await cellOf(s)).status).toBe("submitted");
    expect(await cellOf("st1")).toEqual(excused);
  });
});

describe("QA D24 E-04: average attendance = pooled, then divided", () => {
  it("A 4/6 + B 1/2 -> 63 (not the per-child mean 58); late counts as present; unchecked child ignored; nobody -> null", () => {
    const z = { present: 0, late: 0, leave: 0, sick: 0, absent: 0 };
    const A = { ...z, present: 3, late: 1, leave: 1, absent: 1 }; // 4 of 6
    const B = { ...z, present: 1, sick: 1 }; // 1 of 2
    expect(averageAttendancePercent([A, B])).toBe(63);
    expect(averageAttendancePercent([A, B, { ...z }])).toBe(63);
    expect(averageAttendancePercent([{ ...z, present: 4, absent: 2 }, { ...z, present: 1, absent: 1 }])).toBe(63);
    expect(averageAttendancePercent([])).toBeNull();
    expect(averageAttendancePercent([{ ...z }, { ...z }])).toBeNull();
  });
});

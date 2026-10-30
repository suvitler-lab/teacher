// QA (black-box) for M1-02 / BR-02 (D15 + D23): who may write a cell of a student who is no longer active.
// Expected results were worked out from BR-02 BEFORE running (docs/team/jobs/2026-10-30-m1-02-inactive-student-guard/
// evidence/qa-expected-from-br.md, E-xx / S-xx). Dates use the app's real format (Gregorian YYYY-MM-DD, as the
// terms API and bkkToday() store them) for both terms.end_date and students.left_at.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

type Op = Record<string, unknown>;
let seq = 0;
function op(o: Op = {}): Op {
  return {
    opId: `qa${++seq}_${Math.random().toString(36).slice(2, 8)}`, scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: null, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
const batch = async (cookie: string, ...ops: Op[]) =>
  ((await (await call("/api/submissions/batch", json({ ops }), cookie)).json()) as any).results as any[];
const one = async (cookie: string, o: Op) => (await batch(cookie, o))[0];
const cellOf = (sid: string, aid = "a1") =>
  env.DB.prepare("SELECT * FROM submissions WHERE assignment_id=? AND student_id=?").bind(aid, sid).first<any>();
const auditOf = (opId: unknown) => env.DB.prepare("SELECT * FROM audit_logs WHERE op_id = ?").bind(opId).first<any>();
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<any>()).n as number;
const setStudent = (sid: string, status: string, leftAt: string | null) =>
  env.DB.prepare("UPDATE students SET status = ?, left_at = ? WHERE id = ?").bind(status, leftAt, sid).run();
const setTermEnd = (end: string | null) => env.DB.prepare("UPDATE terms SET end_date = ? WHERE id = 't1'").bind(end).run();
const noTerm = () => env.DB.prepare("UPDATE assignments SET term_id = NULL WHERE id = 'a1'").run();
/** A cell written while the student was still active (a scan 1 minute ago, score 6). */
const preexisting = async (cookie: string, sid = "st1", score: number | null = 6) => {
  const r = await one(cookie, op({ studentId: sid, method: "hid", score, clientTs: Date.now() - 60_000 }));
  expect(r.result).toBe("ok");
  return cellOf(sid);
};

const END = "2026-09-30";
const NON_RECEIVE: Array<[string, Op]> = [
  ["grade (grid)", { method: "grid", score: 7 }],
  ["excused (grid)", { status: "excused", method: "grid", score: null }],
  ["void (manual)", { status: "void", method: "manual", score: null }],
];

describe("QA BR-02: hand-ins (intent receive) need an active student", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  // E-03: an existing cell does not open the door to a NEW hand-in; the cell is left exactly as it was
  for (const status of ["moved", "inactive", "finished"]) {
    it(`E-03: ${status} with an existing scored cell - a scan is refused and the cell is untouched`, async () => {
      const before = await preexisting(cookie);
      await setStudent("st1", status, status === "finished" ? null : "2026-10-20");
      const audits = await count("audit_logs");
      for (const method of ["hid", "camera", "manual"]) {
        const o = op({ method, score: 9 });
        expect(await one(cookie, o)).toEqual({ opId: o.opId, result: "student_inactive" });
        expect(await auditOf(o.opId)).toBeNull();
      }
      expect(await cellOf("st1")).toEqual(before);
      expect(await count("audit_logs")).toBe(audits);
    });
  }

  // E-05 / E-06: being on the term's list (last year's gradebook) does not allow a scan either
  it("E-05/E-06: on the list of a finished term (finished, or left after the end) - still no scan", async () => {
    await setTermEnd(END);
    for (const [status, leftAt] of [["finished", null], ["moved", "2026-10-15"], ["inactive", "2026-12-01"]] as const) {
      await setStudent("st1", status, leftAt);
      for (const extra of [{ method: "hid" }, { method: "camera" }, { method: "manual" }]) {
        const o = op(extra);
        expect((await one(cookie, o)).result, `${status} ${JSON.stringify(extra)}`).toBe("student_inactive");
      }
    }
    expect(await cellOf("st1")).toBeNull();
    // M1-06 / BR-06: the server ignores the client's intent - a grid op is grading, so a finished child who is on
    // the ended term's list can be scored even when the request claims intent "receive"
    await setStudent("st1", "finished", null);
    const g = op({ method: "grid", intent: "receive", score: 7 });
    expect((await one(cookie, g)).result).toBe("ok");
    expect((await cellOf("st1")).score).toBe(7);
  });

  it("an active student is not affected by anything above (control)", async () => {
    await setTermEnd(END);
    expect((await one(cookie, op({ method: "hid" }))).result).toBe("ok");
    expect((await one(cookie, op({ studentId: "st2", method: "grid", score: 7 }))).result).toBe("ok");
  });
});

describe("QA BR-02: grading / excusing / voiding an EXISTING cell is always allowed", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  for (const status of ["moved", "inactive", "finished"]) {
    for (const term of ["no term", "term without end", "ended term, left before"] as const) {
      it(`E-07/E-08/E-09: ${status}, ${term}: grade 8, excuse, void on an existing cell -> ok`, async () => {
        const was = await preexisting(cookie);
        if (term === "no term") await noTerm();
        if (term === "ended term, left before") await setTermEnd(END);
        await setStudent("st1", status, status === "finished" ? null : "2026-08-01"); // before END: not on the list

        const g = op({ method: "grid", score: 8, clientTs: Date.now() - 30_000 });
        expect((await one(cookie, g)).result).toBe("ok");
        const graded = await cellOf("st1");
        expect(graded.score).toBe(8);
        expect(graded.submitted_at).toBe(was.submitted_at);
        expect(graded.late).toBe(was.late);
        expect(await auditOf(g.opId)).not.toBeNull();

        const x = op({ status: "excused", method: "grid", score: null, clientTs: Date.now() - 20_000 });
        expect((await one(cookie, x)).result).toBe("ok");
        expect((await cellOf("st1")).status).toBe("excused");

        const v = op({ status: "void", method: "manual", score: null, clientTs: Date.now() - 10_000 });
        expect((await one(cookie, v)).result).toBe("ok");
        expect((await cellOf("st1")).status).toBe("void");
        expect(await auditOf(v.opId)).not.toBeNull();
      });
    }
  }

  it("E-08: an undo from the scan page sent with method hid (void) is not a hand-in either", async () => {
    await preexisting(cookie);
    await setStudent("st1", "moved", "2026-10-20");
    const v = op({ status: "void", method: "hid", score: null });
    expect((await one(cookie, v)).result).toBe("ok");
    expect((await cellOf("st1")).status).toBe("void");
  });

  // R-05(ข) (PM, 30 Oct): a void cell holds no work, so it is NOT an existing score - the class-list rule decides
  it("a voided cell is not an existing score: off the term's list -> student_inactive, cell stays void, no audit", async () => {
    await preexisting(cookie);
    expect((await one(cookie, op({ status: "void", method: "manual", clientTs: Date.now() - 30_000 }))).result).toBe("ok");
    const voided = await cellOf("st1");
    await setStudent("st1", "moved", "2026-10-20"); // running term, no end date -> off the list
    const o = op({ method: "grid", score: 5 });
    expect(await one(cookie, o)).toEqual({ opId: o.opId, result: "student_inactive" });
    expect(await cellOf("st1")).toEqual(voided);
    expect(await auditOf(o.opId)).toBeNull();
  });

  it("a voided cell of a child still on the term's list (left after the end) can be scored -> ok", async () => {
    await preexisting(cookie);
    expect((await one(cookie, op({ status: "void", method: "manual", clientTs: Date.now() - 30_000 }))).result).toBe("ok");
    await setTermEnd(END);
    await setStudent("st1", "moved", "2026-10-20"); // > END -> on the list
    const o = op({ method: "grid", score: 5 });
    expect((await one(cookie, o)).result).toBe("ok");
    expect(await cellOf("st1")).toMatchObject({ status: "submitted", score: 5 });
    expect(await auditOf(o.opId)).not.toBeNull();
  });
});

describe("QA BR-02: an EMPTY cell follows the class list of the assignment's term", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  async function expectEmpty(o: Op, want: "ok" | "student_inactive", label: string) {
    const audits = await count("audit_logs");
    const r = await one(cookie, o);
    expect(r.result, label).toBe(want);
    if (want === "student_inactive") {
      expect(r, label).toEqual({ opId: o.opId, result: "student_inactive" });
      expect(await cellOf("st1"), label).toBeNull();
      expect(await auditOf(o.opId), label).toBeNull();
      expect(await count("audit_logs"), label).toBe(audits);
    } else {
      expect(await cellOf("st1"), label).not.toBeNull();
      expect(await auditOf(o.opId), label).not.toBeNull();
    }
  }
  const wipeCell = () => env.DB.prepare("DELETE FROM submissions WHERE assignment_id='a1' AND student_id='st1'").run();

  // E-10 / E-20: work with no term reaches today's active children only
  for (const status of ["moved", "inactive", "finished"]) {
    it(`E-10: no term, ${status}: grade / excuse / void on an empty cell -> student_inactive`, async () => {
      await noTerm();
      await setStudent("st1", status, status === "finished" ? null : "2026-10-20");
      for (const [label, extra] of NON_RECEIVE) await expectEmpty(op(extra), "student_inactive", `${status} ${label}`);
    });
  }

  it("E-11 / E-12: term without an end date - finished ok, moved / inactive refused (even far-future left_at)", async () => {
    for (const [label, extra] of NON_RECEIVE.slice(0, 2)) {
      await setStudent("st1", "finished", null);
      await expectEmpty(op(extra), "ok", `finished ${label}`);
      await wipeCell();
      for (const status of ["moved", "inactive"]) {
        await setStudent("st1", status, "2099-12-31");
        await expectEmpty(op(extra), "student_inactive", `${status} ${label}`);
      }
    }
  });

  it("E-13: ended term, finished (no left_at) -> ok", async () => {
    await setTermEnd(END);
    await setStudent("st1", "finished", null);
    await expectEmpty(op({ method: "grid", score: 7 }), "ok", "finished grade");
    expect((await cellOf("st1")).score).toBe(7);
  });

  // E-14 / E-15 / E-16 / E-17: the boundary is strict: left_at > end_date
  const cases: Array<[string, string | null, "ok" | "student_inactive"]> = [
    ["left before the end", "2026-09-29", "student_inactive"],
    ["left ON the end date", END, "student_inactive"],
    ["left the day after the end", "2026-10-01", "ok"],
    ["no leaving date", null, "student_inactive"],
  ];
  for (const status of ["moved", "inactive"]) {
    for (const [what, leftAt, want] of cases) {
      it(`E-14..17: ended term, ${status}, ${what} -> ${want} (grade, excuse)`, async () => {
        await setTermEnd(END);
        await setStudent("st1", status, leftAt);
        for (const [label, extra] of NON_RECEIVE.slice(0, 2)) {
          await expectEmpty(op(extra), want, `${status} ${what} ${label}`);
          await wipeCell();
        }
      });
    }
  }

  it("E-21: ended term, moved after the end: void on an empty cell -> ok (on the list)", async () => {
    await setTermEnd(END);
    await setStudent("st1", "moved", "2026-10-01");
    await expectEmpty(op({ status: "void", method: "manual" }), "ok", "void");
  });
});

describe("QA BR-02: not_in_class is answered first", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("E-18: a moved child of another class, on that term's list, is not_in_class for scan and grade", async () => {
    await setTermEnd(END);
    await setStudent("st9", "moved", "2026-10-15");
    for (const extra of [{ method: "hid" }, { method: "grid", score: 7 }, { status: "excused", method: "grid" }]) {
      expect((await one(cookie, op({ studentId: "st9", ...extra }))).result).toBe("not_in_class");
    }
    expect(await cellOf("st9")).toBeNull();
  });

  it("E-19: a moved child of another class WITH a cell in this work is still not_in_class for a grade", async () => {
    await env.DB.prepare(
      "INSERT INTO submissions (assignment_id, student_id, status, score, submitted_at, late, method, updated_at) VALUES ('a1','st9','submitted',6,1,0,'hid',1)",
    ).run();
    await setStudent("st9", "moved", "2026-10-15");
    const o = op({ studentId: "st9", method: "grid", score: 8 });
    expect((await one(cookie, o)).result).toBe("not_in_class");
    expect((await cellOf("st9")).score).toBe(6);
    expect(await auditOf(o.opId)).toBeNull();
  });
});

describe("QA BR-02: a refusal changes nothing anyone can see", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("S-01/S-02/S-03: mixed batch - the active child lands, the moved child is refused; dashboard and report unchanged by the refusals", async () => {
    // one cell already written for st2 so the numbers aren't all zero
    expect((await one(cookie, op({ studentId: "st2", method: "grid", score: 5, clientTs: Date.now() - 60_000 }))).result).toBe("ok");
    await setStudent("st1", "moved", "2026-10-20");
    // serverTime is the clock of the reply, not data: drop it before comparing
    const body = async (path: string) => {
      const { serverTime: _t, ...rest } = (await (await call(path, {}, cookie)).json()) as any;
      return JSON.stringify(rest);
    };
    const snap = async () => ({
      dash: await body("/api/dashboard?term=t1&date=2026-10-30"),
      report: await body("/api/reports/summary?class=c1&term=t1"),
      gradebook: await body("/api/assignments/a1/submissions"),
      rows: await count("submissions"),
      audits: await count("audit_logs"),
    });
    const before = await snap();

    // only refusals: nothing visible moves
    const refused = [op({ method: "hid" }), op({ method: "camera" }), op({ method: "grid", score: 9 }), op({ status: "excused", method: "grid" })];
    const rs = await batch(cookie, ...refused);
    expect(rs.map((r) => r.result)).toEqual(["student_inactive", "student_inactive", "student_inactive", "student_inactive"]);
    expect(await snap()).toEqual(before);

    // refusals mixed with a normal hand-in: the batch is not failed as a whole
    const good = op({ studentId: "st2", method: "grid", score: 9 });
    const bad = op({ method: "hid" });
    const mixed = await batch(cookie, bad, good);
    expect(mixed.map((r) => r.result)).toEqual(["student_inactive", "ok"]);
    expect((await cellOf("st2")).score).toBe(9);
    expect(await cellOf("st1")).toBeNull();
    expect(await count("audit_logs")).toBe(before.audits + 1);
  });

  it("the report lists a moved child of the running term? no - and a refused grade does not bring them back", async () => {
    await setStudent("st1", "moved", "2026-10-20");
    await one(cookie, op({ method: "grid", score: 9 }));
    const rep = (await (await call("/api/reports/summary?class=c1&term=t1", {}, cookie)).json()) as any;
    expect(rep.students.map((s: any) => s.id)).toEqual(["st2"]);
  });
});

// S-04: two (or three) devices at once — the race pattern of race-r1.test.ts (hold one request between its check
// and its D1 write, let another device change the world through the REAL API, release)
describe("QA BR-02 multi-device: a status change from another device in the middle of a write", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });
  const moveVia = async (status: string, leftAt?: string) => {
    const res = await call("/api/students", json({
      id: "st1", code: "101", prefix: "ด.ช.", first_name: "ก", last_name: "ข", class_id: "c1", number: 1, status,
      ...(leftAt ? { left_at: leftAt } : {}),
    }), cookie);
    expect(res.status).toBe(200);
  };

  it("device A scans st1 while device B marks st1 moved -> A gets student_inactive, no row, no audit", async () => {
    const g = gateBatch();
    const o = op({ method: "camera" });
    const a = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await moveVia("moved");
    g.release();
    expect(((await (await a).json()) as any).results[0]).toEqual({ opId: o.opId, result: "student_inactive" });
    expect(await cellOf("st1")).toBeNull();
    expect(await auditOf(o.opId)).toBeNull();
  });

  it("device A grades st1's empty cell (finished = on the list) while B marks st1 moved today -> refused in the write", async () => {
    await setStudent("st1", "finished", null);
    const g = gateBatch();
    const o = op({ method: "grid", score: 8 });
    const a = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await moveVia("moved"); // left_at = today; the running term has no end date -> no longer on the list
    g.release();
    expect(((await (await a).json()) as any).results[0].result).toBe("student_inactive");
    expect(await cellOf("st1")).toBeNull();
    expect(await auditOf(o.opId)).toBeNull();
  });

  it("A grades an empty cell (st1 active), B scans st1 (creates the cell), C marks st1 moved, then A lands -> ok (the cell exists now)", async () => {
    const t = Date.now();
    const g = gateBatch();
    const a = op({ method: "grid", score: 8, clientTs: t });
    const reqA = callIn(g.env, "/api/submissions/batch", json({ ops: [a] }), cookie);
    await g.ready;
    expect((await one(cookie, op({ opId: "B-scan", method: "hid", clientTs: t - 5_000 }))).result).toBe("ok");
    await moveVia("moved");
    g.release();
    expect(((await (await reqA).json()) as any).results[0].result).toBe("ok");
    expect(await cellOf("st1")).toMatchObject({ status: "submitted", score: 8 });
    expect(await auditOf(a.opId)).not.toBeNull();
  });

  it("after the move, two devices at once: A edits the existing score, B scans -> A ok, B refused, final score is A's", async () => {
    await preexisting(cookie);
    await moveVia("moved");
    const a = op({ method: "grid", score: 8 });
    const b = op({ method: "hid", score: 10 });
    const [ra, rb] = await Promise.all([
      (async () => (await call("/api/submissions/batch", json({ ops: [a] }), cookie)).json() as any)(),
      (async () => (await call("/api/submissions/batch", json({ ops: [b] }), cookie)).json() as any)(),
    ]);
    expect(ra.results[0].result).toBe("ok");
    expect(rb.results[0].result).toBe("student_inactive");
    expect((await cellOf("st1")).score).toBe(8);
    expect(await auditOf(b.opId)).toBeNull();
  });

  it("device A's scan of a moved student is refused; B makes st1 active again; the same scan re-sent lands (retry from failed)", async () => {
    await moveVia("moved");
    const o = op({ method: "hid" });
    expect((await one(cookie, o)).result).toBe("student_inactive");
    await moveVia("active");
    expect((await one(cookie, { ...o, opId: o.opId + "_retry" })).result).toBe("ok");
    expect(await cellOf("st1")).not.toBeNull();
  });
});

describe("QA BR-02 offline replay on the server side", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("an op that DID land before the move, re-sent after it (reply lost offline), is answered duplicate - not student_inactive", async () => {
    const o = op({ method: "hid", score: 6 });
    expect((await one(cookie, o)).result).toBe("ok");
    const cell = await cellOf("st1");
    await setStudent("st1", "moved", "2026-10-20");
    const again = await one(cookie, o);
    expect(again.result).toBe("duplicate");
    expect(await cellOf("st1")).toEqual(cell);
  });

  it("a refused op re-sent with the same opId is refused again and never written twice", async () => {
    await setStudent("st1", "moved", "2026-10-20");
    const audits = await count("audit_logs");
    const o = op({ method: "hid" });
    expect((await one(cookie, o)).result).toBe("student_inactive");
    expect((await one(cookie, o)).result).toBe("student_inactive");
    expect(await cellOf("st1")).toBeNull();
    expect(await count("audit_logs")).toBe(audits);
  });
});

describe("QA AC-05 extension: bulk follows the class list (memberClause)", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st3','103','Q-DDDDDDDDDD','ด.ช.','ช','ซ','c1',3,'inactive','2026-10-20',0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st4','104','Q-EEEEEEEEEE','ด.ญ.','ฌ','ญ','c1',4,'moved','2026-10-20',0)"),
    ]);
  });
  const bulk = async (action: string) =>
    (await (await call("/api/assignments/a1/bulk", json({ action, classId: "c1" }), cookie)).json()) as any;

  it("running term: all-submitted touches the 2 active children only (inactive and moved left alone, no audit)", async () => {
    expect((await bulk("all-submitted")).changed).toBe(2);
    expect(await cellOf("st3")).toBeNull();
    expect(await cellOf("st4")).toBeNull();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE student_id IN ('st3','st4')").first<any>()).n).toBe(0);
  });

  // B-01 (= R-01, fixed in Verify 1): bulk is gradebook work (D23) - it follows the class list (memberClause), and
  // the write guard no longer demands an active student for it (hand_in = 0 for bulk)
  it("B-01: ended term: a child who left AFTER the end is on the list, so all-submitted should mark them", async () => {
    await setTermEnd(END); // st4 left 2026-10-20 > 2026-09-30 -> on the list
    await setStudent("st3", "inactive", "2026-09-30"); // left ON the end date: not on the list
    const r = await bulk("all-submitted");
    expect(await cellOf("st3")).toBeNull();
    expect(r.changed).toBe(3); // st1, st2, st4
    expect((await cellOf("st4"))?.status).toBe("submitted");
  });

  it("B-01: every child the ended term lists gets a row AND a bulk audit row (changed = audits of the batch)", async () => {
    await setTermEnd(END);
    const r = await bulk("all-submitted");
    expect(r.changed).toBe(4); // st1, st2 active + st3, st4 left 2026-10-20 > END
    for (const s of ["st1", "st2", "st3", "st4"]) expect((await cellOf(s)).status).toBe("submitted");
    const audits = (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE batch_id = ? AND action = 'bulk'").bind(r.batchId).first<any>()).n;
    expect(audits).toBe(4);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE student_id = 'st4' AND action = 'bulk'").first<any>()).n).toBe(1);
  });
});

describe("QA B-01: last year's gradebook, whole-class actions on last year's finished children", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,start_date,end_date,updated_at) VALUES ('t0',2568,2,'2/2568',0,'2025-11-01','2026-03-15',0)"),
      env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c0','ป.6/1','ป.6',5,1,2568,0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st5','501','Q-FFFFFFFFFF','ด.ช.','ฎ','ฏ','c0',1,'finished',NULL,0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st6','502','Q-GGGGGGGGGG','ด.ญ.','ฐ','ฑ','c0',2,'finished',NULL,0)"),
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a0','t0','s1','wt_worksheet','ใบงานปีก่อน',10,'2026-01-05','2026-01-31',1,'open',0,0)"),
      env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES ('a0','c0')"),
    ]);
  });
  const bulk = async (action: string) =>
    (await (await call("/api/assignments/a0/bulk", json({ action, classId: "c0" }), cookie)).json()) as any;
  const oldCell = (sid: string) => cellOf(sid, "a0");

  it("B-01: 'ทั้งห้องส่งแล้ว' on last year's work marks last year's (finished) children", async () => {
    const r = await bulk("all-submitted");
    expect(r.changed).toBe(2);
    expect((await oldCell("st5"))?.status).toBe("submitted");
  });

  it("B-01: both finished children get a row and a bulk audit; this year's class is untouched", async () => {
    const r = await bulk("all-submitted");
    expect(r).toMatchObject({ ok: true, changed: 2 });
    for (const s of ["st5", "st6"]) expect((await oldCell(s)).status).toBe("submitted");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE batch_id = ? AND action = 'bulk'").bind(r.batchId).first<any>()).n).toBe(2);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = 'a0' AND student_id NOT IN ('st5','st6')").first<any>()).n).toBe(0);
  });

  it("grading last year's finished children one by one, and full-score / clear on their cells, still work (receive = 0)", async () => {
    for (const sid of ["st5", "st6"]) {
      expect((await one(cookie, op({ assignmentId: "a0", studentId: sid, method: "grid", score: 7 }))).result).toBe("ok");
    }
    expect((await bulk("full-score")).changed).toBe(2);
    expect((await oldCell("st5")).score).toBe(10);
    expect((await bulk("clear")).changed).toBe(2);
    expect((await oldCell("st6")).status).toBe("void");
  });
});

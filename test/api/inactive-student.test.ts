// M1-02 / BR-02: a student who is no longer in the class (status moved / inactive / finished) can not hand in
// new work by any route — scanner, camera, typed number, tap on the grid, whole-class bulk. The teacher can still
// correct a score that is ALREADY in the gradebook (D15). The check happens both before the write (judge) and
// inside the write's own transaction (stillValid), so a status change in between cannot slip a row through.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

function op(o: Record<string, unknown> = {}) {
  return {
    opId: "o" + Math.random().toString(36).slice(2), scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: null, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
const batch = async (cookie: string, ...ops: Record<string, unknown>[]) =>
  ((await (await call("/api/submissions/batch", json({ ops }), cookie)).json()) as any).results as any[];
const cellOf = (sid: string) =>
  env.DB.prepare("SELECT * FROM submissions WHERE assignment_id='a1' AND student_id=?").bind(sid).first<any>();
const auditOf = (opId: string) => env.DB.prepare("SELECT * FROM audit_logs WHERE op_id = ?").bind(opId).first<any>();
const setStatus = (sid: string, status: string) =>
  env.DB.prepare("UPDATE students SET status = ?1, left_at = CASE WHEN ?1 IN ('moved','inactive') THEN '2026-10-15' ELSE left_at END WHERE id = ?2")
    .bind(status, sid).run();

describe("BR-02: no new hand-ins for a student who left the class", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  // AC-01
  for (const status of ["moved", "inactive", "finished"]) {
    for (const method of ["hid", "camera", "manual"]) {
      it(`AC-01: ${status} student, ${method} hand-in -> student_inactive, no row, no audit`, async () => {
        await setStatus("st1", status);
        const o = op({ method });
        const [r] = await batch(cookie, o);
        expect(r).toEqual({ opId: o.opId, result: "student_inactive" });
        expect(await cellOf("st1")).toBeNull();
        expect(await auditOf(o.opId)).toBeNull();
      });
    }
  }

  it("AC-01: a tap on the grid sent as a hand-in (intent receive) is refused too", async () => {
    await setStatus("st1", "moved");
    const o = op({ method: "grid", intent: "receive" });
    expect((await batch(cookie, o))[0].result).toBe("student_inactive");
    expect(await cellOf("st1")).toBeNull();
  });

  it("AC-01: a hand-in for a student whose cell already exists (voided) is still refused", async () => {
    await batch(cookie, op({ opId: "first", method: "hid", clientTs: Date.now() - 20_000 }));
    await batch(cookie, op({ opId: "undo", status: "void", method: "manual", clientTs: Date.now() - 10_000 }));
    await setStatus("st1", "moved");
    const o = op({ method: "hid" });
    expect((await batch(cookie, o))[0].result).toBe("student_inactive");
    expect((await cellOf("st1")).status).toBe("void");
    expect(await auditOf(o.opId)).toBeNull();
  });

  // AC-02
  it("AC-02: the teacher can still change a score already in the gradebook; hand-in time and lateness stay", async () => {
    await batch(cookie, op({ opId: "before", method: "hid", score: 6, clientTs: Date.now() - 60_000 }));
    const was = await cellOf("st1");
    await setStatus("st1", "moved");
    for (const extra of [{}, { intent: "grade" }]) {
      const o = op({ method: "grid", score: 8, ...extra });
      const [r] = await batch(cookie, o);
      expect(r.result).toBe("ok");
      const now = await cellOf("st1");
      expect(now.score).toBe(8);
      expect(now.status).toBe("submitted");
      expect(now.submitted_at).toBe(was.submitted_at);
      expect(now.late).toBe(was.late);
      expect(await auditOf(o.opId)).not.toBeNull();
    }
  });

  // AC-03 (the seeded term t1 has no end date yet: the term is still running)
  for (const status of ["moved", "inactive"]) {
    it(`AC-03: ${status} during the running term (no end date), no cell - a gradebook score is refused`, async () => {
      await setStatus("st1", status);
      const o = op({ method: "grid", score: 8 });
      expect((await batch(cookie, o))[0]).toEqual({ opId: o.opId, result: "student_inactive" });
      expect(await cellOf("st1")).toBeNull();
      expect(await auditOf(o.opId)).toBeNull();
    });
  }

  it("AC-03: moved BEFORE the term's end date, no cell - a gradebook score (and an excuse) is refused", async () => {
    await env.DB.prepare("UPDATE terms SET end_date = '2026-11-30' WHERE id = 't1'").run();
    await setStatus("st1", "moved"); // left_at 2026-10-15 < 2026-11-30
    for (const extra of [{ score: 8 }, { status: "excused", score: null }]) {
      const o = op({ method: "grid", ...extra });
      expect((await batch(cookie, o))[0]).toEqual({ opId: o.opId, result: "student_inactive" });
    }
    expect(await cellOf("st1")).toBeNull();
  });

  it("AC-03: work with no term reaches active students only - a finished student's empty cell is refused", async () => {
    await env.DB.prepare("UPDATE assignments SET term_id = NULL WHERE id = 'a1'").run();
    await setStatus("st1", "finished");
    expect((await batch(cookie, op({ method: "grid", score: 8 })))[0].result).toBe("student_inactive");
    expect(await cellOf("st1")).toBeNull();
  });

  it("a finished student (on the term's list) can be graded on an empty cell, but still can't hand in", async () => {
    await setStatus("st1", "finished");
    expect((await batch(cookie, op({ method: "hid" })))[0].result).toBe("student_inactive");
    expect((await batch(cookie, op({ method: "grid", score: 8 })))[0].result).toBe("ok");
    expect((await cellOf("st1")).score).toBe(8);
  });

  it("R-05: a VOID cell is no score to correct - grading a moved student's voided cell is refused", async () => {
    await batch(cookie, op({ opId: "scan", method: "hid", score: 6, clientTs: Date.now() - 60_000 }));
    await batch(cookie, op({ opId: "undo", status: "void", method: "manual", clientTs: Date.now() - 30_000 }));
    await setStatus("st1", "moved");
    const o = op({ method: "grid", score: 8 });
    expect((await batch(cookie, o))[0]).toEqual({ opId: o.opId, result: "student_inactive" });
    expect((await cellOf("st1")).status).toBe("void");
    expect(await auditOf(o.opId)).toBeNull();
  });

  it("R-04: moved ON the term's end date (left_at = end_date) is not on that term's list", async () => {
    await env.DB.prepare("UPDATE terms SET end_date = '2026-10-15' WHERE id = 't1'").run();
    await setStatus("st1", "moved"); // left_at 2026-10-15 = end_date
    expect((await batch(cookie, op({ method: "grid", score: 8 })))[0].result).toBe("student_inactive");
    expect(await cellOf("st1")).toBeNull();
  });

  it("R-04 race: a student who FINISHED between the check and the write can't hand in (in the term's list or not)", async () => {
    const g = gateBatch();
    const o = op({ method: "hid" });
    const scan = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await setStatus("st1", "finished"); // still on t1's list - only the hand-in rule stops it
    g.release();

    expect(((await (await scan).json()) as any).results[0]).toEqual({ opId: o.opId, result: "student_inactive" });
    expect(await cellOf("st1")).toBeNull();
    expect(await auditOf(o.opId)).toBeNull();
  });

  it("R-05 race: the cell is voided between the check and the write of a moved student's grade -> not written", async () => {
    await batch(cookie, op({ opId: "scan", method: "hid", score: 6, clientTs: Date.now() - 60_000 }));
    await setStatus("st1", "moved");
    const g = gateBatch();
    const o = op({ method: "grid", score: 9, clientTs: Date.now() - 30_000 });
    const req = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE submissions SET status='void', score=NULL WHERE assignment_id='a1' AND student_id='st1'").run();
    g.release();

    expect(((await (await req).json()) as any).results[0].result).toBe("student_inactive");
    expect((await cellOf("st1")).status).toBe("void");
    expect(await auditOf(o.opId)).toBeNull();
  });

  // AC-09
  it("AC-09: undoing a scan (void, manual) of a moved student's existing cell is allowed", async () => {
    await batch(cookie, op({ opId: "scan", method: "hid", clientTs: Date.now() - 60_000 }));
    await setStatus("st1", "moved");
    const o = op({ status: "void", method: "manual" });
    expect((await batch(cookie, o))[0].result).toBe("ok");
    expect((await cellOf("st1")).status).toBe("void");
    expect(await auditOf(o.opId)).not.toBeNull();
  });

  it("a student in the wrong class is still answered not_in_class, even if inactive", async () => {
    await setStatus("st9", "moved");
    expect((await batch(cookie, op({ studentId: "st9" })))[0].result).toBe("not_in_class");
  });

  it("active students are unaffected (hand-in and gradebook score)", async () => {
    expect((await batch(cookie, op({ method: "hid" })))[0].result).toBe("ok");
    expect((await batch(cookie, op({ studentId: "st2", method: "grid", score: 7 })))[0].result).toBe("ok");
  });

  // AC-04
  it("AC-04: the student is moved between the check and the write -> no row, no audit, reply student_inactive", async () => {
    const g = gateBatch();
    const o = op({ method: "hid" });
    const scan = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await setStatus("st1", "moved");
    g.release();

    const body = (await (await scan).json()) as any;
    expect(body.results[0]).toEqual({ opId: o.opId, result: "student_inactive" });
    expect(await cellOf("st1")).toBeNull();
    expect(await auditOf(o.opId)).toBeNull();
  });

  it("AC-04: a gradebook score on an empty cell, student made inactive meanwhile -> no row, no audit", async () => {
    const g = gateBatch();
    const o = op({ method: "grid", score: 8 });
    const req = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await setStatus("st1", "inactive");
    g.release();

    expect(((await (await req).json()) as any).results[0].result).toBe("student_inactive");
    expect(await cellOf("st1")).toBeNull();
    expect(await auditOf(o.opId)).toBeNull();
  });

  it("AC-04: a gradebook score on an existing cell, student moved meanwhile -> still written (D15)", async () => {
    await batch(cookie, op({ opId: "before", method: "hid", score: 6, clientTs: Date.now() - 60_000 }));
    const g = gateBatch();
    const o = op({ method: "grid", score: 9 });
    const req = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await setStatus("st1", "moved");
    g.release();

    expect(((await (await req).json()) as any).results[0].result).toBe("ok");
    expect((await cellOf("st1")).score).toBe(9);
    expect(await auditOf(o.opId)).not.toBeNull();
  });
});

// AC-08: a new year has started; last year's children are finished (or left after last year's term ended).
// The teacher can still fill in last year's gradebook (README: "ยังตรวจและแก้คะแนนงานปีเก่าได้").
describe("BR-02: last year's gradebook stays open for last year's children", () => {
  let cookie: string;
  const old = (o: Record<string, unknown> = {}) => op({ assignmentId: "a0", method: "grid", score: 7, ...o });
  const oldCell = (sid: string) =>
    env.DB.prepare("SELECT * FROM submissions WHERE assignment_id='a0' AND student_id=?").bind(sid).first<any>();
  beforeEach(async () => {
    cookie = await login();
    await seed();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,end_date,updated_at) VALUES ('t0',2568,2,'2/2568',0,'2026-03-15',0)"),
      env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c0','ป.5/1','ป.5',5,1,2568,0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st5','501','Q-FFFFFFFFFF','ด.ช.','ฎ','ฏ','c0',1,'finished',NULL,0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st6','502','Q-GGGGGGGGGG','ด.ญ.','ฐ','ฑ','c0',2,'moved','2026-04-01',0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st7','503','Q-HHHHHHHHHH','ด.ช.','ฒ','ณ','c0',3,'moved','2026-02-01',0)"),
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a0','t0','s1','wt_worksheet','ใบงานปีก่อน',10,'2025-12-01','2026-01-31',1,'open',0,0)"),
      env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES ('a0','c0')"),
    ]);
  });

  it("AC-08: a finished student with no cell in last year's work can be graded", async () => {
    const o = old({ studentId: "st5" });
    expect((await batch(cookie, o))[0].result).toBe("ok");
    expect((await oldCell("st5")).score).toBe(7);
    expect(await auditOf(o.opId)).not.toBeNull();
  });

  it("AC-08: a moved student who left AFTER that term ended can be graded on an empty cell", async () => {
    expect((await batch(cookie, old({ studentId: "st6" })))[0].result).toBe("ok");
    expect((await oldCell("st6")).score).toBe(7);
  });

  it("AC-08: a moved student who left BEFORE that term ended can not (no cell)", async () => {
    expect((await batch(cookie, old({ studentId: "st7" })))[0].result).toBe("student_inactive");
    expect(await oldCell("st7")).toBeNull();
  });

  it("AC-08: last year's children still can't hand in (scan) last year's work", async () => {
    for (const sid of ["st5", "st6"]) {
      expect((await batch(cookie, old({ studentId: sid, method: "hid", score: null })))[0].result).toBe("student_inactive");
      expect(await oldCell(sid)).toBeNull();
    }
  });

  it("R-01: whole-class bulk on last year's work reaches last year's children (finished + left after the term)", async () => {
    const bulk = async (action: string) =>
      (await (await call("/api/assignments/a0/bulk", json({ action, classId: "c0" }), cookie)).json()) as any;
    const r = await bulk("all-submitted");
    expect(r.changed).toBe(2);
    expect((await oldCell("st5")).status).toBe("submitted");
    expect((await oldCell("st6")).status).toBe("submitted");
    expect(await oldCell("st7")).toBeNull(); // left before that term ended: not on its list
    const audits = await env.DB.prepare("SELECT student_id FROM audit_logs WHERE batch_id = ? ORDER BY student_id").bind(r.batchId).all<any>();
    expect(audits.results.map((a) => a.student_id)).toEqual(["st5", "st6"]);

    expect((await bulk("full-score")).changed).toBe(2);
    expect((await oldCell("st5")).score).toBe(10);
    expect((await oldCell("st6")).score).toBe(10);
  });

  it("R-03 race: the term's end date is blanked ('') meanwhile -> treated as no end date, like inRoster", async () => {
    const g = gateBatch();
    const o = old({ studentId: "st6" });
    const req = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE terms SET end_date = '' WHERE id = 't0'").run();
    g.release();

    expect(((await (await req).json()) as any).results[0].result).toBe("student_inactive");
    expect(await oldCell("st6")).toBeNull();
    expect(await auditOf(o.opId)).toBeNull();
  });

  it("AC-08 race: the leaving date is corrected to before the term's end meanwhile -> no row, no audit", async () => {
    const g = gateBatch();
    const o = old({ studentId: "st6" });
    const req = callIn(g.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE students SET left_at = '2026-02-01' WHERE id = 'st6'").run();
    g.release();

    expect(((await (await req).json()) as any).results[0].result).toBe("student_inactive");
    expect(await oldCell("st6")).toBeNull();
    expect(await auditOf(o.opId)).toBeNull();
  });
});

// AC-05
describe("BR-02: whole-class bulk actions leave a moved student alone", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES ('st3','103','Q-DDDDDDDDDD','ด.ช.','ช','ซ','c1',3,'active',0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES ('st4','104','Q-EEEEEEEEEE','ด.ญ.','ฌ','ญ','c1',4,'active',0)"),
    ]);
  });
  const bulk = async (action: string) =>
    (await (await call("/api/assignments/a1/bulk", json({ action, classId: "c1" }), cookie)).json()) as any;

  it("AC-05: all-submitted marks the 3 active students only", async () => {
    await setStatus("st4", "moved");
    const r = await bulk("all-submitted");
    expect(r.changed).toBe(3);
    expect(await cellOf("st4")).toBeNull();
    for (const s of ["st1", "st2", "st3"]) expect((await cellOf(s)).status).toBe("submitted");
  });

  it("AC-05: full-score and clear do not touch the moved student's existing row", async () => {
    for (const s of ["st1", "st2", "st3", "st4"]) {
      await batch(cookie, op({ studentId: s, method: "hid", score: 5, clientTs: Date.now() - 60_000 }));
    }
    await setStatus("st4", "moved");
    const before = await cellOf("st4");

    expect((await bulk("full-score")).changed).toBe(3);
    expect(await cellOf("st4")).toEqual(before);
    for (const s of ["st1", "st2", "st3"]) expect((await cellOf(s)).score).toBe(10);

    expect((await bulk("clear")).changed).toBe(3);
    expect(await cellOf("st4")).toEqual(before);
    for (const s of ["st1", "st2", "st3"]) expect((await cellOf(s)).status).toBe("void");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='bulk' AND student_id='st4'").first<any>()).n).toBe(0);
  });
});

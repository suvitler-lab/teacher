// integrity-c01 (gaps C-01): a scan must never change a cell that is already "submitted".
// Written by QA BEFORE the fix, from requirements.md (BR-01..BR-08, AC-01..AC-14, scenes ฉ1–ฉ6) — black-box against
// POST /api/submissions/batch. Tests tagged [guard] already pass on main and must keep passing after the fix;
// every other test is expected to FAIL on main 18759a2 (the scan overwrites the cell) and pass after the fix.
//
// Fixture (fictional): a1 = "ใบงาน 1", full 10, open, class c1. ก = st1, ข = st2, ค = st3 (all active in c1).
// "R1" / "R2" = two scan rounds (scanSessionId) — R2 is on a device whose copy of the hand-ins is stale.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

const KO = "st1"; // ก
const KHO = "st2"; // ข
const KHO2 = "st3"; // ค

let seq = 0;
function op(o: Record<string, unknown> = {}) {
  return {
    opId: `c01-${++seq}-${Math.random().toString(36).slice(2, 8)}`, scanSessionId: "R2", assignmentId: "a1", studentId: KO,
    status: "submitted", score: 10, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
const send = (cookie: string, ...ops: Record<string, unknown>[]) => call("/api/submissions/batch", json({ ops }), cookie);
const batch = async (cookie: string, ...ops: Record<string, unknown>[]) => {
  const res = await send(cookie, ...ops);
  expect(res.status).toBe(200);
  return ((await res.json()) as any).results as any[];
};
const one = async (cookie: string, o: Record<string, unknown>) => (await batch(cookie, o))[0];

// the 9 fields of "the cell" (requirements: ช่องเดิม)
const NINE = "status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at";
const cellOf = (sid: string) =>
  env.DB.prepare(`SELECT ${NINE} FROM submissions WHERE assignment_id='a1' AND student_id=?`).bind(sid).first<any>();
const auditsOfOp = async (opId: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE op_id = ?").bind(opId).first<any>()).n as number;
const auditActionsOf = async (sid: string) =>
  ((await env.DB.prepare("SELECT action FROM audit_logs WHERE student_id = ? ORDER BY id").bind(sid).all<any>()).results ?? [])
    .map((r: any) => r.action as string);
const bulk = async (cookie: string, action: string) => {
  const res = await call("/api/assignments/a1/bulk", json({ action, classId: "c1" }), cookie);
  return { status: res.status, body: (await res.json()) as any };
};

async function addKho2() {
  await env.DB.prepare(
    "INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,'ด.ช.','ค','ฆ','c1',3,'active',0)",
  ).bind(KHO2, "103", "Q-DDDDDDDDDD").run();
}

/** ก = submitted 7 from the gradebook (method grid) at T0 ("09:00"). Returns T0. */
async function gradedSeven(cookie: string, sid = KO, t0 = Date.now() - 60_000) {
  const r = await one(cookie, op({ studentId: sid, method: "grid", score: 7, clientTs: t0, scanSessionId: "gb" }));
  expect(r.result).toBe("ok");
  const c = await cellOf(sid);
  expect(c).toMatchObject({ status: "submitted", score: 7, method: "grid", submitted_at: t0 });
  return t0;
}

describe("C-01 BR-01: a hand-in reaching a cell that is already submitted changes nothing", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); await addKho2(); });

  // ฉ1 — full mode on a stale iPad: 7 must not become 10 (camera / hid / manual = card, scanner, seat-grid tap)
  for (const method of ["hid", "camera", "manual"]) {
    it(`AC-01 ฉ1: ก = 7 (grid 09:00), R2 ${method} score 10 at 09:00:20 -> already_submitted with the stored 7; 9 fields + audit unchanged`, async () => {
      const t0 = await gradedSeven(cookie);
      const before = await cellOf(KO);
      const auditsBefore = await auditActionsOf(KO);
      const o = op({ method, score: 10, clientTs: t0 + 20_000 });
      const r = await one(cookie, o);
      expect(r.result).toBe("already_submitted");
      expect(r.opId).toBe(o.opId);
      expect(r.submission).toMatchObject({ student_id: KO, status: "submitted", score: 7 });
      expect(await cellOf(KO)).toEqual(before);
      expect(await auditsOfOp(o.opId)).toBe(0);
      expect(await auditActionsOf(KO)).toEqual(auditsBefore);
    });
  }

  // ฉ2 — "grade later" mode: 7 must not become null (รอตรวจ)
  it("AC-02 ฉ2: ก = 7, R2 later-mode hid score null -> already_submitted, score stays 7 (not รอตรวจ)", async () => {
    const t0 = await gradedSeven(cookie);
    const before = await cellOf(KO);
    const o = op({ score: null, clientTs: t0 + 20_000 });
    const r = await one(cookie, o);
    expect(r.result).toBe("already_submitted");
    expect(r.submission?.score).toBe(7);
    expect(await cellOf(KO)).toEqual(before);
    expect(await auditsOfOp(o.opId)).toBe(0);
  });

  // ฉ6 — two devices: phone R1 (later mode) received ก, teacher gave 8 in the gradebook, iPad R2 (full mode) scans ก
  it("AC-02 ฉ6: R1 received ก (null) -> gradebook 8 -> R2 full-mode hid 10 -> already_submitted, stays 8", async () => {
    const t = Date.now() - 90_000;
    expect((await one(cookie, op({ scanSessionId: "R1", score: null, clientTs: t }))).result).toBe("ok");
    expect((await one(cookie, op({ method: "grid", scanSessionId: "gb", score: 8, clientTs: t + 30_000 }))).result).toBe("ok");
    const before = await cellOf(KO);
    expect(before).toMatchObject({ score: 8, submitted_at: t });
    for (const [score, mode] of [[10, "full"], [null, "later"]] as const) {
      const o = op({ scanSessionId: "R2", score, clientTs: t + 60_000 });
      const r = await one(cookie, o);
      expect(r.result, `R2 ${mode}`).toBe("already_submitted");
      expect(r.submission?.score).toBe(8);
      expect(await cellOf(KO)).toEqual(before);
      expect(await auditsOfOp(o.opId)).toBe(0);
    }
  });

  // ฉ4 — "ทั้งห้องส่งแล้ว" on the computer, then a stale iPad scans ข
  it("AC-03 ฉ4: all-submitted (ข = submitted null, bulk) -> R2 full-mode hid 10 -> already_submitted; score null, submitted_at + late from the bulk", async () => {
    const all = await bulk(cookie, "all-submitted");
    expect(all.status).toBe(200);
    const before = await cellOf(KHO);
    expect(before).toMatchObject({ status: "submitted", score: null, method: "bulk" });
    const o = op({ studentId: KHO, score: 10, clientTs: Date.now() });
    const r = await one(cookie, o);
    expect(r.result).toBe("already_submitted");
    expect(r.submission?.score ?? null).toBeNull();
    const after = await cellOf(KHO);
    expect(after).toEqual(before);
    expect(after.submitted_at).toBe(before.submitted_at);
    expect(after.late).toBe(before.late);
    expect(await auditsOfOp(o.opId)).toBe(0);
  });

  it("AC-03 ฉ4 (full button too): all-submitted + full-score (ข = 10) -> R2 later-mode hid null -> already_submitted, stays 10", async () => {
    expect((await bulk(cookie, "all-submitted")).status).toBe(200);
    expect((await bulk(cookie, "full-score")).status).toBe(200);
    const before = await cellOf(KHO);
    expect(before).toMatchObject({ status: "submitted", score: 10 });
    const o = op({ studentId: KHO, score: null, clientTs: Date.now() });
    expect((await one(cookie, o)).result).toBe("already_submitted");
    expect(await cellOf(KHO)).toEqual(before);
  });

  // BR-04 (expected from BR before reading code): ก work1 = 7/10, work2 = 8/10 -> 15/20 = 75 %.
  // Bug full mode: 18/20 = 90 %. Bug later mode: work1 becomes รอตรวจ -> 8/10 = 80 %. After the fix: 75 % both ways.
  for (const [mode, score, bugTotal] of [["full", 10, "18/20 = 90 %"], ["later", null, "8/10 = 80 %"]] as const) {
    it(`BR-04: ก's running total stays 15/20 = 75 % after a stale ${mode}-mode scan of work 1 (bug on main: ${bugTotal})`, async () => {
      await env.DB.prepare(
        "INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a2','t1','s1','wt_worksheet','ใบงาน 2',10,'2569-09-01','2569-12-31',1,'open',0,0)",
      ).run();
      await env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES ('a2','c1')").run();
      const t0 = await gradedSeven(cookie);
      expect((await one(cookie, op({ assignmentId: "a2", method: "grid", scanSessionId: "gb", score: 8, clientTs: t0 }))).result).toBe("ok");
      const total = async () => env.DB.prepare(
        "SELECT SUM(s.score) AS got, SUM(a.full_score) AS full FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.student_id = ? AND s.status = 'submitted' AND s.score IS NOT NULL",
      ).bind(KO).first<any>();
      expect(await total()).toEqual({ got: 15, full: 20 });
      await one(cookie, op({ score, clientTs: t0 + 20_000 }));
      const t = await total();
      expect(t).toEqual({ got: 15, full: 20 });
      expect(Math.round((t.got / t.full) * 100)).toBe(75);
    });
  }

  it("BR-04: ก's running total stays 15/20 = 75 % after a stale full-mode AND a stale later-mode scan of work 1", async () => {
    await env.DB.prepare(
      "INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a2','t1','s1','wt_worksheet','ใบงาน 2',10,'2569-09-01','2569-12-31',1,'open',0,0)",
    ).run();
    await env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES ('a2','c1')").run();
    const t0 = await gradedSeven(cookie);
    expect((await one(cookie, op({ assignmentId: "a2", method: "grid", scanSessionId: "gb", score: 8, clientTs: t0 }))).result).toBe("ok");
    const total = async () => env.DB.prepare(
      "SELECT SUM(s.score) AS got, SUM(a.full_score) AS full FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.student_id = ? AND s.status = 'submitted' AND s.score IS NOT NULL",
    ).bind(KO).first<any>();
    expect(await total()).toEqual({ got: 15, full: 20 });
    await one(cookie, op({ score: 10, clientTs: t0 + 20_000 })); // full mode
    await one(cookie, op({ score: null, clientTs: t0 + 30_000 })); // later mode
    const t = await total();
    expect(t).toEqual({ got: 15, full: 20 });
    expect(Math.round((t.got / t.full) * 100)).toBe(75);
  });
});

describe("C-01 BR-02: typing the score right after receiving it in the same round still works", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); await addKho2(); });

  it("[guard] AC-04: ค empty, R1 type mode [hid null, manual 8] in ONE request -> ok, ok; ค = 8, submitted_at = the receive op, audit create+update", async () => {
    const t = Date.now() - 30_000;
    const rs = await batch(cookie,
      op({ studentId: KHO2, scanSessionId: "R1", score: null, clientTs: t }),
      op({ studentId: KHO2, scanSessionId: "R1", method: "manual", score: 8, clientTs: t + 3_000 }));
    expect(rs.map((r) => r.result)).toEqual(["ok", "ok"]);
    expect(await cellOf(KHO2)).toMatchObject({ status: "submitted", score: 8, submitted_at: t });
    expect(await auditActionsOf(KHO2)).toEqual(["create", "update"]);
  });

  it("[guard] AC-04: same, as TWO requests", async () => {
    const t = Date.now() - 30_000;
    expect((await one(cookie, op({ studentId: KHO2, scanSessionId: "R1", score: null, clientTs: t }))).result).toBe("ok");
    expect((await one(cookie, op({ studentId: KHO2, scanSessionId: "R1", method: "manual", score: 8, clientTs: t + 3_000 }))).result).toBe("ok");
    expect(await cellOf(KHO2)).toMatchObject({ status: "submitted", score: 8, submitted_at: t });
    expect(await auditActionsOf(KHO2)).toEqual(["create", "update"]);
  });

  it("AC-05 ฉ3: ก = 7 (grid), R2 type mode: hid null then manual 6 (two requests) -> both already_submitted, stays 7", async () => {
    const t0 = await gradedSeven(cookie);
    const before = await cellOf(KO);
    const recv = op({ score: null, clientTs: t0 + 20_000 });
    const typed = op({ method: "manual", score: 6, clientTs: t0 + 25_000 });
    expect((await one(cookie, recv)).result).toBe("already_submitted");
    expect((await one(cookie, typed)).result).toBe("already_submitted");
    expect(await cellOf(KO)).toEqual(before);
    expect(await auditsOfOp(recv.opId) + await auditsOfOp(typed.opId)).toBe(0);
  });

  it("AC-05 ฉ3: same in ONE request -> [already_submitted, already_submitted], stays 7", async () => {
    const t0 = await gradedSeven(cookie);
    const before = await cellOf(KO);
    const rs = await batch(cookie,
      op({ score: null, clientTs: t0 + 20_000 }),
      op({ method: "manual", score: 6, clientTs: t0 + 25_000 }));
    expect(rs.map((r) => r.result)).toEqual(["already_submitted", "already_submitted"]);
    expect(await cellOf(KO)).toEqual(before);
  });

  it("BR-02 (1): R1 received ค, the gradebook gave 5 meanwhile, R1's typed 8 arrives -> already_submitted, stays 5", async () => {
    const t = Date.now() - 60_000;
    expect((await one(cookie, op({ studentId: KHO2, scanSessionId: "R1", score: null, clientTs: t }))).result).toBe("ok");
    expect((await one(cookie, op({ studentId: KHO2, scanSessionId: "gb", method: "grid", score: 5, clientTs: t + 10_000 }))).result).toBe("ok");
    const before = await cellOf(KHO2);
    const r = await one(cookie, op({ studentId: KHO2, scanSessionId: "R1", method: "manual", score: 8, clientTs: t + 20_000 }));
    expect(r.result).toBe("already_submitted");
    expect(r.submission?.score).toBe(5);
    expect(await cellOf(KHO2)).toEqual(before);
  });

  it("BR-02 (2): R1 rescans ค after it already has 8 from R1 -> already_submitted, stays 8", async () => {
    const t = Date.now() - 60_000;
    await batch(cookie,
      op({ studentId: KHO2, scanSessionId: "R1", score: null, clientTs: t }),
      op({ studentId: KHO2, scanSessionId: "R1", method: "manual", score: 8, clientTs: t + 3_000 }));
    const before = await cellOf(KHO2);
    const r = await one(cookie, op({ studentId: KHO2, scanSessionId: "R1", score: null, clientTs: t + 10_000 }));
    expect(r.result).toBe("already_submitted");
    expect(await cellOf(KHO2)).toEqual(before);
  });

  it("BR-02 (3): R1 received ค (null) and the same round sends ANOTHER receive without a score -> already_submitted", async () => {
    const t = Date.now() - 60_000;
    expect((await one(cookie, op({ studentId: KHO2, scanSessionId: "R1", score: null, clientTs: t }))).result).toBe("ok");
    const before = await cellOf(KHO2);
    const r = await one(cookie, op({ studentId: KHO2, scanSessionId: "R1", method: "camera", score: null, clientTs: t + 5_000 }));
    expect(r.result).toBe("already_submitted");
    expect(await cellOf(KHO2)).toEqual(before);
  });
});

describe("C-01 BR-03 / BR-05: deliberate edits and not-yet-submitted cells behave exactly as before", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); await addKho2(); });

  it("[guard] AC-06: ก = 10 from scan R1, gradebook grid 7 (newer) -> ok 7, submitted_at + late kept, one 'update' audit", async () => {
    const t = Date.now() - 60_000;
    expect((await one(cookie, op({ scanSessionId: "R1", score: 10, clientTs: t }))).result).toBe("ok");
    const was = await cellOf(KO);
    const g = op({ method: "grid", scanSessionId: "gb", score: 7, clientTs: t + 30_000 });
    expect((await one(cookie, g)).result).toBe("ok");
    const now = await cellOf(KO);
    expect(now).toMatchObject({ status: "submitted", score: 7, submitted_at: was.submitted_at, late: was.late });
    const a = await env.DB.prepare("SELECT action FROM audit_logs WHERE op_id = ?").bind(g.opId).all<any>();
    expect((a.results ?? []).map((x: any) => x.action)).toEqual(["update"]);
  });

  it("[guard] AC-06: void from the seat grid on a submitted cell still works", async () => {
    const t = Date.now() - 60_000;
    expect((await one(cookie, op({ scanSessionId: "R1", score: 10, clientTs: t }))).result).toBe("ok");
    expect((await one(cookie, op({ scanSessionId: "R1", status: "void", method: "manual", score: null, clientTs: t + 5_000 }))).result).toBe("ok");
    expect((await cellOf(KO)).status).toBe("void");
  });

  it("[guard] AC-06: full-score, clear and undo on scanned cells answer as before", async () => {
    const t = Date.now() - 60_000;
    expect((await one(cookie, op({ scanSessionId: "R1", score: null, clientTs: t }))).result).toBe("ok");
    const full = await bulk(cookie, "full-score");
    expect(full.status).toBe(200);
    expect((await cellOf(KO)).score).toBe(10);
    const clear = await bulk(cookie, "clear");
    expect(clear.status).toBe(200);
    expect((await cellOf(KO)).status).toBe("void");
    const undo = await call("/api/assignments/a1/bulk-undo", json({ batchId: clear.body.batchId }), cookie);
    expect(undo.status).toBe(200);
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 10 });
  });

  it("[guard] AC-07 (1): no row -> hid 10 -> ok, submitted 10, submitted_at = scan time", async () => {
    const t = Date.now() - 10_000;
    expect((await one(cookie, op({ clientTs: t }))).result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 10, submitted_at: t });
  });

  it("[guard] AC-07 (2): void -> hid 10 at a later time -> ok, submitted_at = the NEW scan time", async () => {
    const t = Date.now() - 60_000;
    await one(cookie, op({ scanSessionId: "R1", score: 10, clientTs: t }));
    await one(cookie, op({ scanSessionId: "R1", status: "void", method: "manual", score: null, clientTs: t + 5_000 }));
    expect((await one(cookie, op({ clientTs: t + 30_000 }))).result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 10, submitted_at: t + 30_000 });
  });

  // R-02 / D-c01-02: BR-06 judges each op on the state the op before it left — a void first makes the cell "not
  // submitted", so the hand-in after it is BR-05 (ok, new submitted_at), not already_submitted.
  it("[guard] AC-07 (2b) R-02: ก = 7 (grid), ONE request [void ก, hid 10 ก] -> ok, ok; ก = submitted 10, submitted_at = the scan, 1 audit per op", async () => {
    const t0 = await gradedSeven(cookie);
    const v = op({ scanSessionId: "R2", status: "void", method: "manual", score: null, clientTs: t0 + 10_000 });
    const s = op({ scanSessionId: "R2", method: "hid", score: 10, clientTs: t0 + 20_000 });
    const rs = await batch(cookie, v, s);
    expect(rs.map((r) => r.result)).toEqual(["ok", "ok"]);
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 10, method: "hid", scan_session_id: "R2", submitted_at: t0 + 20_000 });
    expect(await auditsOfOp(v.opId)).toBe(1);
    expect(await auditsOfOp(s.opId)).toBe(1);
  });

  it("[guard] AC-07 (3) / C-06 not in scope: excused -> hid 10 -> still ok and becomes submitted 10", async () => {
    const t = Date.now() - 60_000;
    expect((await one(cookie, op({ method: "grid", scanSessionId: "gb", status: "excused", score: null, clientTs: t }))).result).toBe("ok");
    expect((await cellOf(KO)).status).toBe("excused");
    expect((await one(cookie, op({ clientTs: t + 10_000 }))).result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 10 });
  });
});

describe("C-01 BR-06: the old refusals still win over already_submitted", () => {
  let cookie: string;
  let t0: number;
  beforeEach(async () => { cookie = await login(); await seed(); t0 = await gradedSeven(cookie); });

  it("[guard] AC-08 (1): an opId recorded before -> duplicate", async () => {
    const x = op({ studentId: KHO, score: 10, clientTs: t0 });
    expect((await one(cookie, x)).result).toBe("ok");
    expect((await one(cookie, x)).result).toBe("duplicate");
  });

  it("[guard] AC-08 (2): a stale dataEpoch -> epoch_changed", async () => {
    await env.DB.prepare("UPDATE meta SET value='2' WHERE key='data_epoch'").run();
    const before = await cellOf(KO);
    expect((await one(cookie, op({ dataEpoch: 1, clientTs: t0 + 20_000 }))).result).toBe("epoch_changed");
    expect(await cellOf(KO)).toEqual(before);
  });

  it("[guard] AC-08 (3): closed work -> assignment_closed", async () => {
    await env.DB.prepare("UPDATE assignments SET status = 'closed' WHERE id = 'a1'").run();
    const before = await cellOf(KO);
    expect((await one(cookie, op({ clientTs: t0 + 20_000 }))).result).toBe("assignment_closed");
    expect(await cellOf(KO)).toEqual(before);
  });

  it("[guard] AC-08 (4): fullScoreAtScan does not match -> full_score_changed", async () => {
    const before = await cellOf(KO);
    expect((await one(cookie, op({ fullScoreAtScan: 99, score: 10, clientTs: t0 + 20_000 }))).result).toBe("full_score_changed");
    expect(await cellOf(KO)).toEqual(before);
  });

  it("[guard] AC-08 (5): older than what the cell holds -> superseded", async () => {
    const before = await cellOf(KO);
    expect((await one(cookie, op({ clientTs: t0 - 20_000 }))).result).toBe("superseded");
    expect(await cellOf(KO)).toEqual(before);
  });
});

describe("C-01 BR-07 / BR-01 race / BR-06 per-op: replay, two devices at once, a mixed request", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); await addKho2(); });

  // ฉ5 — iPad offline since 08:50, computer gives 7 at 09:00, iPad scans at 09:05 into its queue, reconnects 09:20
  it("AC-09 ฉ5: the queued 09:05 scan reaches the server after the 09:00 grade -> already_submitted, stays 7; a later gradebook op still ok", async () => {
    const t0 = await gradedSeven(cookie);
    const before = await cellOf(KO);
    const queued = op({ scanSessionId: "R2", score: 10, clientTs: t0 + 45_000 }); // made after the grade, sent much later
    const r = await one(cookie, queued);
    expect(r.result).toBe("already_submitted");
    expect(await cellOf(KO)).toEqual(before);
    // the same device then edits ก in the gradebook: not blocked
    const g = op({ method: "grid", scanSessionId: "gb", score: 9, clientTs: Date.now() });
    expect((await one(cookie, g)).result).toBe("ok");
    expect((await cellOf(KO)).score).toBe(9);
  });

  it("AC-10: the same opId sent twice (answer lost on the way) -> already_submitted both times, no audit", async () => {
    const t0 = await gradedSeven(cookie);
    const before = await cellOf(KO);
    const x = op({ score: 10, clientTs: t0 + 20_000 });
    expect((await one(cookie, x)).result).toBe("already_submitted");
    const again = await one(cookie, x);
    expect(again.result).toBe("already_submitted");
    expect(again.submission?.score).toBe(7);
    expect(await cellOf(KO)).toEqual(before);
    expect(await auditsOfOp(x.opId)).toBe(0);
  });

  it("AC-11: R1 (full 10) is checked first but writes last, R2 (later null) lands in between -> R1 already_submitted, cell = R2, one audit", async () => {
    const t = Date.now() - 30_000;
    const r1 = op({ studentId: KHO, scanSessionId: "R1", score: 10, clientTs: t + 10_000 }); // newer: `superseded` cannot save us
    const r2 = op({ studentId: KHO, scanSessionId: "R2", score: null, clientTs: t });
    const g = gateBatch();
    const held = callIn(g.env, "/api/submissions/batch", json({ ops: [r1] }), cookie);
    await g.ready; // R1 has looked at the (empty) cell and is about to write
    expect((await one(cookie, r2)).result).toBe("ok");
    g.release();
    const res = (await (await held).json()) as any;
    expect(res.results[0].result).toBe("already_submitted");
    expect(await cellOf(KHO)).toMatchObject({ status: "submitted", score: null, scan_session_id: "R2", submitted_at: t });
    expect(await auditActionsOf(KHO)).toEqual(["create"]);
    expect(await auditsOfOp(r1.opId)).toBe(0);
  });

  // Order of arrival is not controlled here: if R1 (newer) lands first, R2 (older) is `superseded` by BR-06 order — also
  // correct. What must hold either way: exactly one writer, one audit, the cell = the winner. (The gated test above is
  // the one that fails on main.)
  it("[guard] AC-11: the same two ops sent at once -> exactly one ok, the other refused (already_submitted | superseded); cell = the winner; one audit", async () => {
    const t = Date.now() - 30_000;
    const r1 = op({ studentId: KHO, scanSessionId: "R1", score: 10, clientTs: t + 10_000 });
    const r2 = op({ studentId: KHO, scanSessionId: "R2", score: null, clientTs: t });
    const [a, b] = await Promise.all([one(cookie, r1), one(cookie, r2)]);
    expect([a.result, b.result].filter((x) => x === "ok")).toHaveLength(1);
    const loser = a.result === "ok" ? b : a;
    expect(["already_submitted", "superseded"]).toContain(loser.result);
    const winner = a.result === "ok" ? r1 : r2;
    expect(await cellOf(KHO)).toMatchObject({ status: "submitted", score: winner.score, scan_session_id: winner.scanSessionId });
    expect(await auditActionsOf(KHO)).toEqual(["create"]);
  });

  it("AC-13: one request [ก, ข, ค] with ก = 7 -> [already_submitted, ok, ok]; ข and ค recorded with audit; ก unchanged", async () => {
    const t0 = await gradedSeven(cookie);
    const before = await cellOf(KO);
    const ops = [KO, KHO, KHO2].map((sid) => op({ studentId: sid, score: 10, clientTs: t0 + 20_000 }));
    const rs = await batch(cookie, ...ops);
    expect(rs.map((r) => r.opId)).toEqual(ops.map((o) => o.opId));
    expect(rs.map((r) => r.result)).toEqual(["already_submitted", "ok", "ok"]);
    expect(await cellOf(KO)).toEqual(before);
    for (const sid of [KHO, KHO2]) {
      expect(await cellOf(sid)).toMatchObject({ status: "submitted", score: 10 });
      expect(await auditActionsOf(sid)).toEqual(["create"]);
    }
    expect(await auditsOfOp(ops[0].opId)).toBe(0);
  });
});

describe("C-01 BR-08: older apps and the rest of the contract", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("AC-14: an old app's request (no dataEpoch, no intent) on a submitted cell -> 200, only {opId, result, submission}, data unchanged", async () => {
    const t0 = await gradedSeven(cookie);
    const before = await cellOf(KO);
    const legacy = { opId: "legacy-1", scanSessionId: "R2", assignmentId: "a1", studentId: KO, status: "submitted", score: 10, fullScoreAtScan: 10, method: "camera", clientTs: t0 + 20_000 };
    const res = await call("/api/submissions/batch", json({ ops: [legacy] }), cookie);
    expect(res.status).toBe(200);
    const r = ((await res.json()) as any).results[0];
    expect(r.result).toBe("already_submitted");
    expect(Object.keys(r).sort()).toEqual(["opId", "result", "submission"]);
    expect(await cellOf(KO)).toEqual(before);
  });

  it("[guard] AC-14: GET submissions still answers in the old shape after an already_submitted", async () => {
    const t0 = await gradedSeven(cookie);
    await send(cookie, op({ clientTs: t0 + 20_000 }));
    const res = await call("/api/assignments/a1/submissions", {}, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.submissions)).toBe(true);
    expect(typeof body.serverTime).toBe("number");
  });
});

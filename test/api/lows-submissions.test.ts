// correctness-lows (2026-11-03): the reviewer's low findings of C-01 / C-03 that touch data correctness, EP-01 / EP-03 / EP-04.
// Written BEFORE the fix (each test below except the AC-02 characterization failed on b16af7f), black-box against the API.
//
// Fixture (fictional, as c03-received-date): today = 2026-11-02 09:00 Bangkok = 02:00Z = 1793584800000 (fake Date reaches
// the worker). a1 "ใบงาน 1", full 10, open, class c1, assigned 2026-10-26, due 2026-10-30. ก=st1 ข=st2 (active, c1).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";
import { bkkToday } from "../../shared/time";

const NOW = 1793584800000; //            2026-11-02 09:00 ไทย (02:00Z)
const MIDNIGHT = 1793638800000; //       2026-11-03 00:00 ไทย (2026-11-02 17:00Z)
const NOON_1029 = 1793250000000; //      2026-10-29 12:00 ไทย
const NOON_1030 = 1793336400000; //      2026-10-30 12:00 ไทย
const KO = "st1", KHO = "st2";
const NINE = "status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at";

let cookie: string;
let seq = 0;
const at = (ms: number) => vi.setSystemTime(ms);
const tick = (ms = 1000) => vi.setSystemTime(Date.now() + ms);

function op(o: Record<string, unknown> = {}) {
  if (o.clientTs === undefined) tick();
  return {
    opId: `lows-${++seq}-${Math.random().toString(36).slice(2, 8)}`, scanSessionId: "R1", assignmentId: "a1", studentId: KO,
    status: "submitted", score: 10, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
const redate = (sid: string, receivedDate: unknown, o: Record<string, unknown> = {}) =>
  op({ studentId: sid, method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate, score: 7, ...o });

const send = (...ops: Record<string, unknown>[]) => call("/api/submissions/batch", json({ ops }), cookie);
async function batch(...ops: Record<string, unknown>[]) {
  const res = await send(...ops);
  expect(res.status).toBe(200);
  return ((await res.json()) as any).results as any[];
}
const one = async (o: Record<string, unknown>) => (await batch(o))[0];
const cellOf = (sid: string) =>
  env.DB.prepare(`SELECT ${NINE} FROM submissions WHERE assignment_id = 'a1' AND student_id = ?`).bind(sid).first<any>();
const auditsOfOp = async (opId: string) =>
  ((await env.DB.prepare("SELECT * FROM audit_logs WHERE op_id = ? ORDER BY id").bind(opId).all<any>()).results ?? []) as any[];
const auditCount = async () => ((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs").first<any>()).n as number);

/** Put a cell straight into D1 (fixture). */
function put(sid: string, o: { status?: string; score?: number | null; late?: number; at?: number | null; method?: string; scn?: string | null; event?: number }) {
  const subAt = o.at === undefined ? NOW - 3600_000 : o.at;
  const ev = o.event ?? (subAt ?? NOW - 3600_000);
  return env.DB.prepare(
    `INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     VALUES ('a1',?,?,?,?,?,?,?,?,?,?)`,
  ).bind(sid, o.status ?? "submitted", o.score === undefined ? 7 : o.score, o.late ?? 0, subAt, o.method ?? "grid", "dev_fixture", o.scn ?? null, ev, ev).run();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);
  cookie = await login();
  await seed();
  await env.DB.prepare("UPDATE assignments SET assigned_date = '2026-10-26', due_date = '2026-10-30' WHERE id = 'a1'").run();
});
afterEach(() => { vi.useRealTimers(); });

describe("AC-01 (C-01 R-04): already_submitted does not lean on an op_id column of submissions", () => {
  it("with an op_id column on submissions (a future migration), a scan onto a stored submitted cell is already_submitted, not a 500", async () => {
    await env.DB.prepare("ALTER TABLE submissions ADD COLUMN op_id TEXT").run();
    try {
      await put(KO, { score: 7 });
      await env.DB.prepare("UPDATE submissions SET op_id = 'legacy_op' WHERE student_id = ?").bind(KO).run();
      const before = await auditCount();
      const res = await send(op({ studentId: KO }), op({ studentId: KHO }), op({ studentId: KHO, scanSessionId: "R2" }));
      expect(res.status).toBe(200);
      const rs = ((await res.json()) as any).results as any[];
      expect(rs.map((r) => r.result)).toEqual(["already_submitted", "ok", "already_submitted"]);
      expect(rs[0].submission).toMatchObject({ status: "submitted", score: 7 });
      expect(rs[2].submission).toMatchObject({ status: "submitted", score: 10 }); // the row the 2nd op of THIS request wrote
      expect(await auditCount()).toBe(before + 1);
    } finally {
      await env.DB.prepare("ALTER TABLE submissions DROP COLUMN op_id").run();
    }
  });
});

describe("AC-02 (C-01 R-07): known limitation, pinned (BR-01 judges against the cell as stored)", () => {
  it("[characterization] ก = 7 at 09:00 · A scans ก 09:05 → already_submitted (nothing written) · B's offline void of 09:01 arrives later → lands", async () => {
    await put(KO, { score: 7, at: NOW, event: NOW });
    const scanA = await one(op({ studentId: KO, clientTs: NOW + 5 * 60_000 }));
    expect(scanA.result).toBe("already_submitted");
    at(NOW + 10 * 60_000);
    const voidB = await one(op({ studentId: KO, status: "void", score: null, method: "grid", scanSessionId: "gbB", clientTs: NOW + 60_000 }));
    expect(voidB.result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ status: "void", score: null });
  });
});

describe("AC-06 (C-03 R-03): a received date may lead the server's clock by up to 5 minutes at midnight", () => {
  it("server 23:59:58, app already on 11-03 → ok; submitted_at = now (never in the future), its Thai day = 11-02, late by that day", async () => {
    const t = MIDNIGHT - 2000;
    at(t);
    const r = await one(op({ studentId: KO, receivedDate: "2026-11-03", clientTs: t }));
    expect(r.result).toBe("ok");
    expect(r.submission).toMatchObject({ status: "submitted", submitted_at: t, late: true });
    const cell = await cellOf(KO);
    expect(cell).toMatchObject({ submitted_at: t, late: 1, event_at: t });
    expect(bkkToday(cell.submitted_at)).toBe("2026-11-02");
  });

  it("the client clock ahead (clientTs 00:00:02 next day) is clamped to now, and still ok", async () => {
    const t = MIDNIGHT - 2000;
    at(t);
    const r = await one(op({ studentId: KO, receivedDate: "2026-11-03", clientTs: MIDNIGHT + 2000 }));
    expect(r.result).toBe("ok");
    expect((await cellOf(KO)).submitted_at).toBe(t);
  });

  it("a re-date to 'tomorrow' within the 5 minutes is ok and lands at now", async () => {
    await put(KO, { score: 7, at: NOW, event: NOW });
    const t = MIDNIGHT - 60_000;
    at(t);
    const r = await one(redate(KO, "2026-11-03", { clientTs: t }));
    expect(r.result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 7, submitted_at: t });
  });

  it("EP-03 all-submitted with 11-03 at 23:59:58 → 200, submitted_at = now", async () => {
    const t = MIDNIGHT - 2000;
    at(t);
    const res = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1", receivedDate: "2026-11-03" }), cookie);
    expect(res.status).toBe(200);
    expect((await cellOf(KO)).submitted_at).toBe(t);
  });

  it("[guard] more than 5 minutes before midnight (23:54:00) → still received_date_future; nothing written", async () => {
    at(MIDNIGHT - 6 * 60_000);
    const r = await one(op({ studentId: KO, receivedDate: "2026-11-03" }));
    expect([r.result, r.reason]).toEqual(["invalid", "received_date_future"]);
    expect(await cellOf(KO)).toBeNull();
    const res = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1", receivedDate: "2026-11-03" }), cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("received_date_future");
  });

  it("[guard] two days ahead at 23:59:58 → received_date_future", async () => {
    at(MIDNIGHT - 2000);
    const r = await one(op({ studentId: KO, receivedDate: "2026-11-04" }));
    expect([r.result, r.reason]).toEqual(["invalid", "received_date_future"]);
  });

  it("[guard] the assigned-date floor still uses the real day: work assigned 11-03, at 23:58 a hand-in dated 11-02 is ok", async () => {
    await env.DB.prepare("UPDATE assignments SET assigned_date = '2026-11-03' WHERE id = 'a1'").run();
    at(MIDNIGHT - 2 * 60_000);
    const r = await one(op({ studentId: KO, receivedDate: "2026-11-02" }));
    expect(r.result).toBe("ok");
  });
});

describe("AC-07 (C-03 R-06): a re-date to the day already stored is a no-op", () => {
  it("ok with the cell as stored; no write (9 fields unchanged) and no audit row; sending it again is ok again", async () => {
    await put(KO, { score: 7, at: NOW - 3600_000, method: "hid", scn: "R1" }); // 11-02 08:00
    const cell0 = await cellOf(KO);
    const before = await auditCount();
    const o = redate(KO, "2026-11-02");
    const r = await one(o);
    expect(r.result).toBe("ok");
    expect(r.submission).toMatchObject({ status: "submitted", score: 7, submitted_at: NOW - 3600_000, method: "hid", scan_session_id: "R1" });
    expect(await cellOf(KO)).toEqual(cell0);
    expect(await auditsOfOp(o.opId)).toEqual([]);
    expect(await auditCount()).toBe(before);
    tick();
    const again = await one(o);
    expect(again.result).toBe("ok");
    expect(await cellOf(KO)).toEqual(cell0);
    expect(await auditCount()).toBe(before);
  });

  it("does not break the undo of a whole-class action that covers the cell (no 409 modified_since)", async () => {
    const bulk = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1" }), cookie);
    expect(bulk.status).toBe(200);
    const { batchId, changed } = (await bulk.json()) as any;
    expect(changed).toBe(2);
    tick();
    const r = await one(redate(KO, "2026-11-02", { score: null }));
    expect(r.result).toBe("ok");
    const undo = await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);
    expect(undo.status).toBe(200);
    expect(((await undo.json()) as any).changed).toBe(2);
    expect(await cellOf(KO)).toMatchObject({ status: "void" });
  });

  it("[guard] a re-date to ANOTHER day still writes (1 audit row) and still makes that undo 409", async () => {
    const bulk = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1" }), cookie);
    const { batchId } = (await bulk.json()) as any;
    tick();
    const o = redate(KO, "2026-10-30", { score: null });
    expect((await one(o)).result).toBe("ok");
    expect((await auditsOfOp(o.opId)).length).toBe(1);
    expect((await cellOf(KO)).submitted_at).toBe(NOON_1030);
    const undo = await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);
    expect(undo.status).toBe(409);
  });

  it("[guard] the same-day re-date of an older op than the cell is still superseded", async () => {
    await put(KO, { score: 7, at: NOW - 3600_000 });
    const r = await one(redate(KO, "2026-11-02", { clientTs: NOW - 2 * 3600_000 }));
    expect(r.result).toBe("superseded");
  });
});

describe("AC-08 (C-03 R-05): EP-01's audit `after.late` says the late that is stored", () => {
  it("a re-date racing a due-date move: the cell's late is fixed in the batch, and its audit line says the same", async () => {
    await put(KO, { score: 7, at: NOW, event: NOW, late: 1 }); // 11-02, due 10-30 → late
    const gate = gateBatch();
    const o = redate(KO, "2026-10-29"); // judged on due 10-30 → late 0
    const pending = callIn(gate.env, "/api/submissions/batch", json({ ops: [o] }), cookie);
    await gate.ready;
    await env.DB.prepare("UPDATE assignments SET due_date = '2026-10-28' WHERE id = 'a1'").run(); // another device moves the due date
    gate.release();
    const res = await pending;
    expect(res.status).toBe(200);
    const r = ((await res.json()) as any).results[0];
    expect(r.result).toBe("ok");
    expect(r.submission).toMatchObject({ submitted_at: NOON_1029, late: true });
    expect(await cellOf(KO)).toMatchObject({ submitted_at: NOON_1029, late: 1 });
    const [line] = await auditsOfOp(o.opId);
    expect(!!JSON.parse(line.after_json).late).toBe(true);
  });

  it("review R-01: two ops on one cell in one request — each audit line keeps the late of the row IT wrote", async () => {
    const hid = op({ studentId: KO, clientTs: NOW }); // received now (11-02) → late 1
    const rd = redate(KO, "2026-10-29"); //               then re-dated to 10-29 → late 0
    expect((await batch(hid, rd)).map((r) => r.result)).toEqual(["ok", "ok"]);
    expect(await cellOf(KO)).toMatchObject({ submitted_at: NOON_1029, late: 0 });
    const [l1] = await auditsOfOp(hid.opId);
    const [l2] = await auditsOfOp(rd.opId);
    expect([JSON.parse(l1.after_json).submitted_at, !!JSON.parse(l1.after_json).late]).toEqual([NOW, true]);
    expect([JSON.parse(l2.after_json).submitted_at, !!JSON.parse(l2.after_json).late]).toEqual([NOON_1029, false]);
  });

  it("review R-01: [grid hand-in late, grid void] — the hand-in's line still says late", async () => {
    const give = op({ studentId: KO, method: "grid", scanSessionId: "gb", score: 8, clientTs: NOW });
    const clear = op({ studentId: KO, method: "grid", scanSessionId: "gb", status: "void", score: null });
    expect((await batch(give, clear)).map((r) => r.result)).toEqual(["ok", "ok"]);
    expect(!!JSON.parse((await auditsOfOp(give.opId))[0].after_json).late).toBe(true);
    expect(!!JSON.parse((await auditsOfOp(clear.opId))[0].after_json).late).toBe(false);
  });

  it("[guard] no race: the audit line keeps EP-01's own shape (late as 0/1)", async () => {
    await put(KO, { score: 7, at: NOW, event: NOW, late: 1 });
    const o = redate(KO, "2026-10-29");
    expect((await one(o)).result).toBe("ok");
    const [line] = await auditsOfOp(o.opId);
    expect(JSON.parse(line.after_json).late).toBe(0);
  });
});

describe("AC-09 (C-03 R-02): a re-date never makes a hand-in that was refused", () => {
  it("[hid, grid dateOnly] on an empty cell while the work is closed in between → no cell, no audit, no ok", async () => {
    const gate = gateBatch();
    const hid = op({ studentId: KO });
    const rd = redate(KO, "2026-10-30");
    const pending = callIn(gate.env, "/api/submissions/batch", json({ ops: [hid, rd] }), cookie);
    await gate.ready;
    await env.DB.prepare("UPDATE assignments SET status = 'closed' WHERE id = 'a1'").run(); // closed from another device
    gate.release();
    const res = await pending;
    expect(res.status).toBe(200);
    const rs = ((await res.json()) as any).results as any[];
    expect(rs.map((r) => [r.result, r.reason ?? null])).toEqual([["assignment_closed", null], ["invalid", "cell_not_submitted"]]);
    expect(await cellOf(KO)).toBeNull();
    expect(await auditsOfOp(hid.opId)).toEqual([]);
    expect(await auditsOfOp(rd.opId)).toEqual([]);
  });

  it("[guard] the same request with the work open → both ok, one cell received on 10-30", async () => {
    const rs = await batch(op({ studentId: KO }), redate(KO, "2026-10-30"));
    expect(rs.map((r) => r.result)).toEqual(["ok", "ok"]);
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 10, submitted_at: NOON_1030, method: "grid" });
  });

  it("[guard] a re-date of a STORED submitted cell on closed work is still ok (grading, not a hand-in)", async () => {
    await put(KO, { score: 7, at: NOW, event: NOW });
    await env.DB.prepare("UPDATE assignments SET status = 'closed' WHERE id = 'a1'").run();
    const r = await one(redate(KO, "2026-10-30"));
    expect(r.result).toBe("ok");
    expect((await cellOf(KO)).submitted_at).toBe(NOON_1030);
  });
});

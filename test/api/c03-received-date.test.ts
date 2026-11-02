// c03-submit-date (gaps C-03): the teacher picks the date the work was RECEIVED, and can re-date a submitted cell.
// Written by QA (T-01) BEFORE the fix, from requirements.md (AC-01..AC-24, BR-01..BR-11) and api-contract.md v3 (EP-01)
// — black-box against POST /api/submissions/batch. Expected values were computed by hand in test-plan.md before running.
//
// Tests tagged [guard] already pass on 0312e8d (old behaviour that must not change). Every other test is expected to
// FAIL on 0312e8d (the server ignores `receivedDate` / `dateOnly`) and pass after T-02.
//
// Fixture (fictional): today = 2026-11-02 09:00 Bangkok = 02:00Z = 1793584800000 (fake Date, reaches the worker).
// a1 "ใบงาน 1", full 10, open, class c1, assigned 2026-10-26, due 2026-10-30. ก=st1 ข=st2 ค=st3 ง=st4 (active, c1).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { bkkToday } from "../../shared/time";

const NOW = 1793584800000; //         2026-11-02 09:00 ไทย (02:00Z)
const NOON_1029 = 1793250000000; //   2026-10-29 12:00 ไทย
const NOON_1030 = 1793336400000; //   2026-10-30 12:00 ไทย (requirements example)
const NOON_1031 = 1793422800000; //   2026-10-31 12:00 ไทย
const NOON_1020 = 1792472400000; //   2026-10-20 12:00 ไทย
const NOON_0416 = 1776315600000; //   2026-04-16 12:00 ไทย (200 days before 11-02)
const DAY = 86_400_000;

const KO = "st1", KHO = "st2", KHAW = "st3", NGO = "st4"; // ก ข ค ง
const NINE = "status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at";

let cookie: string;
let seq = 0;

/** Move the fake clock (worker + test share it). */
const at = (ms: number) => vi.setSystemTime(ms);
const tick = (ms = 1000) => vi.setSystemTime(Date.now() + ms);

/** An EP-01 op. Without an explicit clientTs the clock moves 1 s first, so each op is newer than the one before. */
function op(o: Record<string, unknown> = {}) {
  if (o.clientTs === undefined) tick();
  return {
    opId: `c03-${++seq}-${Math.random().toString(36).slice(2, 8)}`, scanSessionId: "R1", assignmentId: "a1", studentId: KO,
    status: "submitted", score: 10, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
/** A re-date op from the gradebook (EP-01 v3: grid + dateOnly + status submitted + receivedDate). */
const redate = (sid: string, receivedDate: unknown, o: Record<string, unknown> = {}) =>
  op({ studentId: sid, method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate, score: 7, ...o });

const send = (...ops: Record<string, unknown>[]) => call("/api/submissions/batch", json({ ops }), cookie);
async function batch(...ops: Record<string, unknown>[]) {
  const res = await send(...ops);
  expect(res.status).toBe(200);
  return ((await res.json()) as any).results as any[];
}
const one = async (o: Record<string, unknown>) => (await batch(o))[0];

const cellOf = (sid: string, aid = "a1") =>
  env.DB.prepare(`SELECT ${NINE} FROM submissions WHERE assignment_id = ? AND student_id = ?`).bind(aid, sid).first<any>();
const auditsOfOp = async (opId: string) =>
  ((await env.DB.prepare("SELECT * FROM audit_logs WHERE op_id = ? ORDER BY id").bind(opId).all<any>()).results ?? []) as any[];
const maxAuditId = async () => ((await env.DB.prepare("SELECT COALESCE(MAX(id),0) AS m FROM audit_logs").first<any>()).m as number);
const auditsAfter = async (id: number) =>
  ((await env.DB.prepare("SELECT * FROM audit_logs WHERE id > ? ORDER BY id").bind(id).all<any>()).results ?? []) as any[];

/** Put a cell straight into D1 (fixture). */
function put(sid: string, o: { status?: string; score?: number | null; late?: number; at?: number | null; method?: string; scn?: string | null; event?: number }) {
  const subAt = o.at === undefined ? NOW - 3600_000 : o.at;
  const ev = o.event ?? (subAt ?? NOW - 3600_000);
  return env.DB.prepare(
    `INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     VALUES ('a1',?,?,?,?,?,?,?,?,?,?)`,
  ).bind(sid, o.status ?? "submitted", o.score === undefined ? 7 : o.score, o.late ?? 0, subAt, o.method ?? "grid", "dev_fixture", o.scn ?? null, ev, ev).run();
}
async function student(id: string, code: string, first: string, no: number, status = "active") {
  await env.DB.prepare(
    "INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,'ด.ช.',?,'ทดสอบ','c1',?,?,0)",
  ).bind(id, code, `Q-C03${code.padStart(7, "0")}`, first, no, status).run();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);
  cookie = await login();
  await seed();
  await env.DB.prepare("UPDATE assignments SET assigned_date = '2026-10-26', due_date = '2026-10-30' WHERE id = 'a1'").run();
  await student(KHAW, "103", "ค", 3);
  await student(NGO, "104", "ง", 4);
});
afterEach(() => { vi.useRealTimers(); });

describe("C-03 AC-01 / AC-02: the received date of a first hand-in", () => {
  it("TC-01 AC-01: ก empty, hid 10 + receivedDate 2026-10-30 at 09:00 → ok, submitted_at = 10-30 12:00 (1793336400000), late 0, event_at = 09:00, 1 create audit", async () => {
    const o = op({ receivedDate: "2026-10-30", clientTs: NOW });
    const r = await one(o);
    expect(r.result).toBe("ok");
    expect(r.submission).toMatchObject({ status: "submitted", score: 10, late: false, submitted_at: NOON_1030 });
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 10, late: 0, submitted_at: NOON_1030, event_at: NOW });
    const a = await auditsOfOp(o.opId);
    expect(a.map((x) => x.action)).toEqual(["create"]);
  });

  it("TC-02 AC-01 / Q3 (D-06): camera on empty, manual on void, grid 8 on empty, grid 8 on excused — all with 10-30 → noon 10-30, late 0", async () => {
    await put(KHO, { status: "void", score: null, at: null });
    await put(NGO, { status: "excused", score: null, at: null });
    const ops = [
      op({ studentId: KO, method: "camera", receivedDate: "2026-10-30" }),
      op({ studentId: KHO, method: "manual", receivedDate: "2026-10-30" }),
      op({ studentId: KHAW, method: "grid", scanSessionId: "gb", score: 8, receivedDate: "2026-10-30" }),
      op({ studentId: NGO, method: "grid", scanSessionId: "gb", score: 8, receivedDate: "2026-10-30" }),
    ];
    const rs = await batch(...ops);
    expect(rs.map((r) => r.result)).toEqual(["ok", "ok", "ok", "ok"]);
    for (const sid of [KO, KHO, KHAW, NGO]) {
      expect({ sid, ...(await cellOf(sid)) }).toMatchObject({ sid, status: "submitted", submitted_at: NOON_1030, late: 0 });
    }
  });

  it("TC-03 AC-02 (ก) [guard]: no receivedDate (old app) → submitted_at = 09:00 exactly, late 1", async () => {
    const r = await one(op({ clientTs: NOW }));
    expect(r.result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ submitted_at: NOW, late: 1, event_at: NOW });
  });

  it("TC-04 AC-02 (ข) [guard]: receivedDate = today 2026-11-02 → real time 09:00 (not noon), late 1", async () => {
    const r = await one(op({ clientTs: NOW, receivedDate: "2026-11-02" }));
    expect(r.result).toBe("ok");
    expect(r.submission).toMatchObject({ late: true, submitted_at: NOW });
    expect(await cellOf(KO)).toMatchObject({ submitted_at: NOW, late: 1 });
  });
});

describe("C-03 AC-03: a wrong date refuses only that op (invalid + reason), not the request", () => {
  it("TC-05 AC-03: one request ก 11-03 / ข 10-25 / ค 2569-10-30 / ง plain → future / before_assigned / invalid / ok; no row, no audit for ก ข ค", async () => {
    const ops = [
      op({ studentId: KO, receivedDate: "2026-11-03" }),
      op({ studentId: KHO, receivedDate: "2026-10-25" }),
      op({ studentId: KHAW, receivedDate: "2569-10-30" }),
      op({ studentId: NGO }),
    ];
    const res = await send(...ops);
    expect(res.status).toBe(200);
    const rs = ((await res.json()) as any).results as any[];
    expect(rs.map((r) => [r.result, r.reason ?? null])).toEqual([
      ["invalid", "received_date_future"],
      ["invalid", "received_date_before_assigned"],
      ["invalid", "received_date_invalid"],
      ["ok", null],
    ]);
    for (const [i, sid] of [KO, KHO, KHAW].entries()) {
      expect({ sid, cell: await cellOf(sid) }).toEqual({ sid, cell: null });
      expect(await auditsOfOp(ops[i].opId)).toEqual([]);
    }
    expect((await cellOf(NGO))?.status).toBe("submitted");
  });

  for (const bad of ["2026-02-30", "30/10/2026", "", "2026-1-5", "1899-12-31", "2100-01-01", "2026-10-30T00:00", "2026-10-30".padEnd(32, " ")]) {
    it(`TC-06 AC-03: receivedDate ${JSON.stringify(bad)} → invalid received_date_invalid, no row`, async () => {
      const o = op({ receivedDate: bad });
      const r = await one(o);
      expect({ result: r.result, reason: r.reason }).toEqual({ result: "invalid", reason: "received_date_invalid" });
      expect(await cellOf(KO)).toBeNull();
      expect(await auditsOfOp(o.opId)).toEqual([]);
    });
  }

  it("TC-51 Q3: grid score 8 on an empty cell with a future date → invalid received_date_future, no row", async () => {
    const r = await one(op({ studentId: KHAW, method: "grid", scanSessionId: "gb", score: 8, receivedDate: "2026-11-03" }));
    expect({ result: r.result, reason: r.reason }).toEqual({ result: "invalid", reason: "received_date_future" });
    expect(await cellOf(KHAW)).toBeNull();
  });
});

describe("C-03 AC-04 / AC-05 (BR-04): a date never re-dates a hand-in that is already there", () => {
  it("TC-07 AC-04 [guard]: ก submitted 7 at 10-29 noon → hid + 10-30 → already_submitted, cell unchanged, no audit; a wrong date is not even checked (D-03)", async () => {
    await put(KO, { score: 7, at: NOON_1029, late: 0, method: "grid" });
    const before = await cellOf(KO);
    for (const rd of ["2026-10-30", "2026-11-03", "garbage"]) {
      const o = op({ receivedDate: rd });
      const r = await one(o);
      expect({ rd, result: r.result }).toEqual({ rd, result: "already_submitted" });
      expect(r.submission).toMatchObject({ score: 7, submitted_at: NOON_1029 });
      expect(await cellOf(KO)).toEqual(before);
      expect(await auditsOfOp(o.opId)).toEqual([]);
    }
  });

  for (const second of [{ receivedDate: "2026-10-30" }, {}]) {
    it(`TC-08 AC-05: ข empty, ONE request [hid null + 10-30, manual 8 same round ${second.receivedDate ? "with" : "without"} a date] → ok, ok; 8, noon 10-30, late 0`, async () => {
      const rs = await batch(
        op({ studentId: KHO, score: null, receivedDate: "2026-10-30" }),
        op({ studentId: KHO, method: "manual", score: 8, ...second }),
      );
      expect(rs.map((r) => r.result)).toEqual(["ok", "ok"]);
      expect(await cellOf(KHO)).toMatchObject({ status: "submitted", score: 8, submitted_at: NOON_1030, late: 0 });
    });
  }
});

describe("C-03 AC-06 (BR-07): offline queue — the 7-day clamp of event_at never moves the received date", () => {
  it("TC-09 AC-06 (ก): picked 10-20, scanned 10-20 10:00, sent 10-28 10:00 → event_at clamped to now−7d, submitted_at = 10-20 noon, late 0", async () => {
    await env.DB.prepare("UPDATE assignments SET assigned_date = '2026-10-15' WHERE id = 'a1'").run();
    const sendAt = Date.UTC(2026, 9, 28, 3); // 10-28 10:00 ไทย
    at(sendAt);
    const r = await one(op({ clientTs: Date.UTC(2026, 9, 20, 3), receivedDate: "2026-10-20" }));
    expect(r.result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ event_at: sendAt - 7 * DAY, submitted_at: NOON_1020, late: 0 });
    expect(sendAt - 7 * DAY).toBe(1792551600000);
  });

  it("TC-10 AC-06 (ข) [guard]: scanned 11-02 08:55 (app put 2026-11-02), sent 11-06 10:00 → submitted_at 11-02 08:55, late 1", async () => {
    at(Date.UTC(2026, 10, 6, 3));
    const scanned = Date.UTC(2026, 10, 2, 1, 55);
    expect(scanned).toBe(1793584500000);
    const r = await one(op({ clientTs: scanned, receivedDate: "2026-11-02" }));
    expect(r.result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ submitted_at: scanned, late: 1 });
  });

  it("TC-48 BR-02: queued across midnight — clientTs 11-01 23:00, receivedDate 2026-11-02 (not the event's day) → min(noon 11-02, now) = now, never in the future", async () => {
    const r = await one(op({ clientTs: Date.UTC(2026, 10, 1, 16), receivedDate: "2026-11-02" }));
    expect(r.result).toBe("ok");
    const c = await cellOf(KO);
    expect(c.submitted_at).toBe(NOW);
    expect(c.late).toBe(1);
  });
});

describe("C-03 AC-07 / AC-08 (server part — the scan screen itself is ui-redesign): the reply carries late at once", () => {
  it("TC-11 AC-07/08: ก ข ค scanned with 10-30 → each ok with submission.late false and noon 10-30", async () => {
    const rs = await batch(...[KO, KHO, KHAW].map((sid) => op({ studentId: sid, receivedDate: "2026-10-30" })));
    expect(rs.map((r) => [r.result, r.submission?.late, r.submission?.submitted_at])).toEqual([
      ["ok", false, NOON_1030], ["ok", false, NOON_1030], ["ok", false, NOON_1030],
    ]);
  });

  it("TC-12 AC-08 [guard]: same with 2026-11-02 → each ok with submission.late true", async () => {
    const rs = await batch(...[KO, KHO, KHAW].map((sid) => op({ studentId: sid, receivedDate: "2026-11-02" })));
    expect(rs.map((r) => [r.result, r.submission?.late])).toEqual([["ok", true], ["ok", true], ["ok", true]]);
  });
});

describe("C-03 AC-12 / AC-13 / AC-15 (BR-05): re-dating a submitted cell from the gradebook", () => {
  it("TC-19 AC-12: ก 7, 11-02 09:00, late 1 → grid dateOnly 10-30 → ok (not already_submitted), 7, noon 10-30, late 0, method grid, new event_at, op's round", async () => {
    await put(KO, { score: 7, at: NOW, late: 1, method: "hid", scn: "R0" });
    const o = redate(KO, "2026-10-30");
    const r = await one(o);
    expect(r.result).toBe("ok");
    expect(r.submission).toMatchObject({ score: 7, late: false, submitted_at: NOON_1030 });
    expect(await cellOf(KO)).toMatchObject({
      status: "submitted", score: 7, submitted_at: NOON_1030, late: 0, method: "grid", scan_session_id: "gb", event_at: o.clientTs,
    });
  });

  it("TC-20 AC-12: ข 9, 10-29 noon, late 0 → dateOnly 10-31 → late 1, score kept", async () => {
    await put(KHO, { score: 9, at: NOON_1029, late: 0 });
    const r = await one(redate(KHO, "2026-10-31", { score: 9 }));
    expect(r.result).toBe("ok");
    expect(await cellOf(KHO)).toMatchObject({ score: 9, submitted_at: NOON_1031, late: 1 });
  });

  it("TC-21 AC-13: the op still holds 9 (old screen) while ก is 7 → stays 7; another device set 8 before the op → stays 8", async () => {
    await put(KO, { score: 7, at: NOW, late: 1 });
    expect((await one(redate(KO, "2026-10-30", { score: 9 }))).result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ score: 7, submitted_at: NOON_1030, late: 0 });

    await put(KHO, { score: 7, at: NOW, late: 1 });
    expect((await one(op({ studentId: KHO, method: "grid", scanSessionId: "pc", score: 8 }))).result).toBe("ok"); // other device, earlier
    expect((await one(redate(KHO, "2026-10-30", { score: 7 }))).result).toBe("ok");
    expect(await cellOf(KHO)).toMatchObject({ score: 8, submitted_at: NOON_1030, late: 0 });
  });

  it("TC-25 AC-15: one update audit row, method grid, before 09:00/late true → after noon 10-30/late false, score 7 → 7", async () => {
    await put(KO, { score: 7, at: NOW, late: 1, method: "hid" });
    const o = redate(KO, "2026-10-30");
    expect((await one(o)).result).toBe("ok");
    const rows = await auditsOfOp(o.opId);
    expect(rows).toHaveLength(1);
    expect({ action: rows[0].action, method: rows[0].method }).toEqual({ action: "update", method: "grid" });
    const before = JSON.parse(rows[0].before_json), after = JSON.parse(rows[0].after_json);
    expect({ at: before.submitted_at, late: !!before.late, score: before.score }).toEqual({ at: NOW, late: true, score: 7 });
    expect({ at: after.submitted_at, late: !!after.late, score: after.score }).toEqual({ at: NOON_1030, late: false, score: 7 });
  });

  it("TC-26 AC-16 (server) / BR-09: undo = a second dateOnly op with the old date 2026-11-02 → date 11-02 and late 1 again, score 7", async () => {
    await put(KO, { score: 7, at: NOW, late: 1 });
    expect((await one(redate(KO, "2026-10-30"))).result).toBe("ok");
    expect((await cellOf(KO)).late).toBe(0);
    const r = await one(redate(KO, "2026-11-02"));
    expect(r.result).toBe("ok");
    const c = await cellOf(KO);
    expect({ day: bkkToday(c.submitted_at), late: c.late, score: c.score }).toEqual({ day: "2026-11-02", late: 1, score: 7 });
    expect(c.submitted_at).toBeLessThanOrEqual(Date.now());
  });

  it("TC-27 AC-16 / BR-05 [guard]: re-dating to the SAME Thai date keeps submitted_at to the ms (10-29 08:15 stays, not noon)", async () => {
    const t = Date.UTC(2026, 9, 29, 1, 15);
    expect(t).toBe(1793236500000);
    await put(KO, { score: 7, at: t, late: 0, method: "hid" });
    expect((await one(redate(KO, "2026-10-29"))).result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ submitted_at: t, late: 0, score: 7 });
  });
});

describe("C-03 AC-14: who can be re-dated", () => {
  it("TC-22 AC-14 (1)(2)(3): dateOnly on no row / void / excused → invalid cell_not_submitted, nothing written", async () => {
    await put(KHO, { status: "void", score: null, at: null });
    await put(NGO, { status: "excused", score: null, at: null });
    const before = { [KHO]: await cellOf(KHO), [NGO]: await cellOf(NGO) };
    const ops = [redate(KHAW, "2026-10-30"), redate(KHO, "2026-10-30"), redate(NGO, "2026-10-30")];
    const rs = await batch(...ops);
    expect(rs.map((r) => [r.result, r.reason])).toEqual([
      ["invalid", "cell_not_submitted"], ["invalid", "cell_not_submitted"], ["invalid", "cell_not_submitted"],
    ]);
    expect(await cellOf(KHAW)).toBeNull();
    expect(await cellOf(KHO)).toEqual(before[KHO]);
    expect(await cellOf(NGO)).toEqual(before[NGO]);
    for (const o of ops) expect(await auditsOfOp(o.opId)).toEqual([]);
  });

  it("TC-23 AC-14 (4): closed work → dateOnly still ok (teacher's work)", async () => {
    await put(KO, { score: 7, at: NOW, late: 1 });
    await env.DB.prepare("UPDATE assignments SET status = 'closed' WHERE id = 'a1'").run();
    const r = await one(redate(KO, "2026-10-30"));
    expect(r.result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ submitted_at: NOON_1030, late: 0, score: 7 });
  });

  for (const status of ["moved", "finished"]) {
    it(`TC-23 AC-14 (4) D15/D23: a ${status} student's submitted cell can be re-dated`, async () => {
      await put(KHO, { score: 6, at: NOW, late: 1 });
      await env.DB.prepare("UPDATE students SET status = ? WHERE id = ?").bind(status, KHO).run();
      const r = await one(redate(KHO, "2026-10-30", { score: 6 }));
      expect(r.result).toBe("ok");
      expect(await cellOf(KHO)).toMatchObject({ submitted_at: NOON_1030, late: 0, score: 6 });
    });
  }

  it("TC-24 AC-14 (5): dateOnly with a hand-in method, or with status void/excused → invalid redate_not_allowed, cell unchanged", async () => {
    await put(KO, { score: 7, at: NOW, late: 1 });
    const before = await cellOf(KO);
    const ops = [
      redate(KO, "2026-10-30", { method: "hid", scanSessionId: "R1" }),
      redate(KO, "2026-10-30", { method: "camera", scanSessionId: "R1" }),
      redate(KO, "2026-10-30", { method: "manual", scanSessionId: "R1" }),
      redate(KO, "2026-10-30", { status: "void", score: null }),
      redate(KO, "2026-10-30", { status: "excused", score: null }),
    ];
    for (const o of ops) {
      const r = await one(o);
      expect({ m: o.method, s: o.status, result: r.result, reason: r.reason })
        .toEqual({ m: o.method, s: o.status, result: "invalid", reason: "redate_not_allowed" });
      expect(await cellOf(KO)).toEqual(before);
      expect(await auditsOfOp(o.opId)).toEqual([]);
    }
  });

  it("TC-45 edge: dateOnly without a receivedDate (absent or null) → invalid received_date_invalid, cell unchanged", async () => {
    await put(KO, { score: 7, at: NOW, late: 1 });
    const before = await cellOf(KO);
    for (const o of [redate(KO, undefined), redate(KO, null)]) {
      const r = await one(o);
      expect({ result: r.result, reason: r.reason }).toEqual({ result: "invalid", reason: "received_date_invalid" });
      expect(await cellOf(KO)).toEqual(before);
    }
  });

  it("TC-46 edge: dateOnly with a wrong date on a submitted cell → future / before_assigned / invalid, cell unchanged", async () => {
    await put(KO, { score: 7, at: NOW, late: 1 });
    const before = await cellOf(KO);
    for (const [rd, reason] of [["2026-11-03", "received_date_future"], ["2026-10-25", "received_date_before_assigned"], ["2026-02-30", "received_date_invalid"]]) {
      const r = await one(redate(KO, rd));
      expect({ rd, result: r.result, reason: r.reason }).toEqual({ rd, result: "invalid", reason });
      expect(await cellOf(KO)).toEqual(before);
    }
  });
});

describe("C-03 AC-18 (BR-07): offline re-date vs a newer edit; replay", () => {
  it("TC-29 AC-18 [guard]: iPad re-dates ก at 10:00 (queued), the computer sets 8 at 10:05 → the re-date arrives: superseded, ก = 8 with its old date", async () => {
    await put(KO, { score: 7, at: NOW - 3600_000, late: 1, event: NOW - 3600_000 });
    at(Date.UTC(2026, 10, 2, 3, 10)); // 10:10 ไทย
    const queued = redate(KO, "2026-10-30", { clientTs: Date.UTC(2026, 10, 2, 3, 0) });
    expect((await one(op({ method: "grid", scanSessionId: "pc", score: 8, clientTs: Date.UTC(2026, 10, 2, 3, 5) }))).result).toBe("ok");
    const r = await one(queued);
    expect(r.result).toBe("superseded");
    expect(await cellOf(KO)).toMatchObject({ score: 8, submitted_at: NOW - 3600_000, late: 1 });
  });

  it("TC-30 AC-18: nothing in between → ok; the same opId again → duplicate, written once", async () => {
    await put(KO, { score: 7, at: NOW, late: 1 });
    const o = redate(KO, "2026-10-30");
    expect((await one(o)).result).toBe("ok");
    tick();
    expect((await one(o)).result).toBe("duplicate");
    expect(await cellOf(KO)).toMatchObject({ score: 7, submitted_at: NOON_1030, late: 0 });
    expect(await auditsOfOp(o.opId)).toHaveLength(1);
  });
});

describe("C-03 AC-21 / AC-22 (BR-08): old apps and other ops behave exactly as before", () => {
  const legacy = (o: Record<string, unknown> = {}) => {
    const x: Record<string, unknown> = op(o);
    delete x.receivedDate; delete x.dateOnly;
    return x;
  };

  it("TC-35 AC-21 [guard]: old-app ops → ok (submitted_at = clientTs), duplicate, already_submitted {opId,result,submission}, superseded", async () => {
    const first = legacy({ clientTs: NOW - 60_000 });
    expect((await one(first)).result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ submitted_at: NOW - 60_000, late: 1 });
    expect((await one(first)).result).toBe("duplicate");
    const again = await one(legacy({ scanSessionId: "R9" }));
    expect(again.result).toBe("already_submitted");
    expect(Object.keys(again).sort()).toEqual(["opId", "result", "submission"]);
    expect((await one(legacy({ method: "grid", scanSessionId: "gb", score: 6 }))).result).toBe("ok");
    expect((await one(legacy({ method: "grid", scanSessionId: "gb", score: 5, clientTs: NOW - 120_000 }))).result).toBe("superseded");
    expect(await cellOf(KO)).toMatchObject({ score: 6, submitted_at: NOW - 60_000 });
  });

  it("TC-37 AC-22 [guard]: a cell stored at 10-30 noon by the new app, graded 9 by an old app → submitted_at kept, late 0", async () => {
    await put(KO, { score: 7, at: NOON_1030, late: 0, method: "hid" });
    expect((await one(legacy({ method: "grid", scanSessionId: "gb", score: 9 }))).result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ score: 9, submitted_at: NOON_1030, late: 0 });
  });

  it("TC-47 edge [guard]: grid score edit on a submitted cell WITH a receivedDate but no dateOnly → date ignored (op C)", async () => {
    await put(KO, { score: 7, at: NOW - 3600_000, late: 1 });
    expect((await one(op({ method: "grid", scanSessionId: "gb", score: 9, receivedDate: "2026-10-30" }))).result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ score: 9, submitted_at: NOW - 3600_000, late: 1 });
  });

  it("TC-42 edge [guard]: void / excused ops carry a wrong date → not checked, ok", async () => {
    await put(KO, { score: 7, at: NOW - 3600_000, late: 1 });
    expect((await one(op({ status: "void", method: "manual", score: null, receivedDate: "2026-11-03" }))).result).toBe("ok");
    expect((await one(op({ studentId: KHO, status: "excused", method: "grid", scanSessionId: "gb", score: null, receivedDate: "nope" }))).result).toBe("ok");
    expect((await cellOf(KO)).status).toBe("void");
    expect((await cellOf(KHO)).status).toBe("excused");
  });
});

describe("C-03 BR-02 / D-04: no cap going back; the floor is the assigned date only when it is a real CE date ≤ today", () => {
  it("TC-43 Q2: assigned_date empty → 2026-04-16 (200 days back) is accepted, noon, late 0", async () => {
    await env.DB.prepare("UPDATE assignments SET assigned_date = NULL WHERE id = 'a1'").run();
    const r = await one(op({ receivedDate: "2026-04-16" }));
    expect(r.result).toBe("ok");
    expect(await cellOf(KO)).toMatchObject({ submitted_at: NOON_0416, late: 0 });
  });

  it("TC-43 D-04: an old Buddhist-era assigned_date (2569-10-26) is not used as the floor", async () => {
    await env.DB.prepare("UPDATE assignments SET assigned_date = '2569-10-26' WHERE id = 'a1'").run();
    const r = await one(op({ receivedDate: "2026-04-16" }));
    expect(r.result).toBe("ok");
    expect((await cellOf(KO)).submitted_at).toBe(NOON_0416);
  });

  it("TC-43 D-04 [guard]: assigned in the future (11-05) → today is still accepted (real time)", async () => {
    await env.DB.prepare("UPDATE assignments SET assigned_date = '2026-11-05' WHERE id = 'a1'").run();
    const r = await one(op({ receivedDate: "2026-11-02", clientTs: NOW }));
    expect(r.result).toBe("ok");
    expect((await cellOf(KO)).submitted_at).toBe(NOW);
  });

  it("TC-52 AC-03 / BR-02: receivedDate equal to the assigned date (10-26) is accepted (floor is inclusive)", async () => {
    const r = await one(op({ receivedDate: "2026-10-26" }));
    expect(r.result).toBe("ok");
    expect((await cellOf(KO)).submitted_at).toBe(Date.UTC(2026, 9, 26, 5));
  });
});

describe("C-03 EP-01 schema (422 for the whole request) and auth", () => {
  for (const [what, extra] of [
    ["receivedDate: 123", { receivedDate: 123 }],
    ["receivedDate of 33 characters", { receivedDate: "2026-10-30".padEnd(33, "x") }],
    ['dateOnly: "yes"', { dateOnly: "yes" }],
  ] as const) {
    it(`TC-44 edge: ${what} → 422, nothing written`, async () => {
      const res = await send(op({ studentId: KHO }), op(extra as Record<string, unknown>));
      expect(res.status).toBe(422);
      expect(await cellOf(KO)).toBeNull();
      expect(await cellOf(KHO)).toBeNull();
    });
  }

  it("TC-50 edge [guard]: not logged in → 401, nothing written", async () => {
    const mark = await maxAuditId();
    const res = await call("/api/submissions/batch", json({ ops: [op({ receivedDate: "2026-10-30" })] }));
    expect(res.status).toBe(401);
    expect(await cellOf(KO)).toBeNull();
    expect(await auditsAfter(mark)).toEqual([]);
  });
});

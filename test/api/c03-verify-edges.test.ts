// c03-submit-date — T-03 (QA verify) edge cases not covered by the T-01 files. Black-box against the real routes
// (EP-01 batch, EP-03 bulk, backup/restore) with a fake clock that reaches the worker.
//
// Fixture (fictional): a1 "ใบงาน 1", full 10, open, class c1, assigned 2026-10-26, due 2026-10-30, ก=st1 ข=st2.
// Expected values computed by hand before running:
//   23:59:59 ไทย 2026-11-02 = 16:59:59Z = 1793638799000 · 00:00:01 ไทย 2026-11-03 = 1793638801000
//   12:00 ไทย 2026-11-02 = 1793595600000 · 12:00 ไทย 1944-09-13 = Date.UTC(1944,8,13,5) = -798404400000
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { takeBackup, restoreFrom } from "./backup-helpers";

const BEFORE_MIDNIGHT = 1793638799000; // 2026-11-02 23:59:59 ไทย
const AFTER_MIDNIGHT = 1793638801000; //  2026-11-03 00:00:01 ไทย
const NOON_1102 = 1793595600000;

let cookie: string;
let seq = 0;
const op = (o: Record<string, unknown>) => ({
  opId: `c03v-${++seq}`, scanSessionId: "R1", assignmentId: "a1", studentId: "st1",
  status: "submitted", score: null, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
});
async function batch(...ops: Record<string, unknown>[]) {
  const res = await call("/api/submissions/batch", json({ ops }), cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as any).results as any[];
}
const bulk = async (body: Record<string, unknown>) => {
  const res = await call("/api/assignments/a1/bulk", json({ classId: "c1", ...body }), cookie);
  return { status: res.status, body: (await res.json()) as any };
};
const cell = (sid: string) =>
  env.DB.prepare("SELECT status, score, late, submitted_at, event_at FROM submissions WHERE assignment_id = 'a1' AND student_id = ?").bind(sid).first<any>();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(BEFORE_MIDNIGHT - 60_000);
  cookie = await login();
  await seed();
  await env.DB.prepare("UPDATE assignments SET assigned_date = '2026-10-26', due_date = '2026-10-30' WHERE id = 'a1'").run();
});
afterEach(() => { vi.useRealTimers(); });

describe("T-03 Bangkok midnight: the server's 'today' at 23:59:59 and 00:00:01", () => {
  it("23:59:59 ไทย 11-02: tomorrow 11-03 is still the future; today 11-02 = the real time", async () => {
    vi.setSystemTime(BEFORE_MIDNIGHT);
    const [a, b] = await batch(
      op({ studentId: "st1", receivedDate: "2026-11-03" }),
      op({ studentId: "st2", receivedDate: "2026-11-02", clientTs: BEFORE_MIDNIGHT - 1000 }),
    );
    expect(a).toMatchObject({ result: "invalid", reason: "received_date_future" });
    expect(b.result).toBe("ok");
    expect(b.submission).toMatchObject({ submitted_at: BEFORE_MIDNIGHT - 1000, late: true });
    expect(await cell("st1")).toBeNull();
  });

  it("00:00:01 ไทย 11-03: 11-03 accepted at the real time; an op made at 23:59:59 for 11-02 keeps its real time; a stale 11-03 op made at 23:59:59 never lands before midnight", async () => {
    vi.setSystemTime(AFTER_MIDNIGHT);
    await env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES ('st3','103','Q-C03V000003','ด.ช.','ค','ทดสอบ','c1',3,'active',0)").run();
    const [a, b, c] = await batch(
      op({ studentId: "st1", receivedDate: "2026-11-03", clientTs: AFTER_MIDNIGHT - 500 }),
      op({ studentId: "st2", receivedDate: "2026-11-02", clientTs: BEFORE_MIDNIGHT }),
      op({ studentId: "st3", receivedDate: "2026-11-03", clientTs: BEFORE_MIDNIGHT }),
    );
    expect(a.submission).toMatchObject({ submitted_at: AFTER_MIDNIGHT - 500, late: true });
    expect(b.submission).toMatchObject({ submitted_at: BEFORE_MIDNIGHT, late: true });
    // eventAt is 11-02, the date says 11-03 → min(noon 11-03, now) = now (00:00:01) — still on 11-03
    expect(c.submission.submitted_at).toBe(AFTER_MIDNIGHT);
  });

  it("re-date across midnight: a cell received 23:59:59 re-dated at 00:00:01 to 11-03 → the re-date's own time; back to 11-02 → noon 11-02", async () => {
    vi.setSystemTime(BEFORE_MIDNIGHT);
    await batch(op({ studentId: "st1", score: 6, clientTs: BEFORE_MIDNIGHT }));
    vi.setSystemTime(AFTER_MIDNIGHT);
    const [r1] = await batch(op({ studentId: "st1", method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: "2026-11-03", clientTs: AFTER_MIDNIGHT - 500 }));
    expect(r1.submission).toMatchObject({ score: 6, submitted_at: AFTER_MIDNIGHT - 500 });
    vi.setSystemTime(AFTER_MIDNIGHT + 1000);
    const [r2] = await batch(op({ studentId: "st1", method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: "2026-11-02", clientTs: AFTER_MIDNIGHT + 500 }));
    expect(r2.submission).toMatchObject({ score: 6, submitted_at: NOON_1102, late: true });
  });

  it("bulk ทั้งห้องส่งแล้ว: 11-02 at 23:59:59 = now · 11-02 at 00:00:01 = noon 11-02 · 11-03 at 23:59:59 = future (400)", async () => {
    vi.setSystemTime(BEFORE_MIDNIGHT);
    expect((await bulk({ action: "all-submitted", receivedDate: "2026-11-03" })).body.error).toBe("received_date_future");
    const r = await bulk({ action: "all-submitted", receivedDate: "2026-11-02" });
    expect(r.status).toBe(200);
    expect((await cell("st1")).submitted_at).toBe(BEFORE_MIDNIGHT);
    await bulk({ action: "clear" });
    await batch(op({ studentId: "st1", status: "void", method: "grid", scanSessionId: "gb" }), op({ studentId: "st2", status: "void", method: "grid", scanSessionId: "gb" }));
    vi.setSystemTime(AFTER_MIDNIGHT);
    const r2 = await bulk({ action: "all-submitted", receivedDate: "2026-11-02" });
    expect(r2.status).toBe(200);
    expect((await cell("st1")).submitted_at).toBe(NOON_1102);
  });
});

describe("T-03 floor on the received date (B-01 fixed: MIN_RECEIVED_DATE 2000-01-01) vs backup/restore", () => {
  it("a year before 1970 (1944-09-13, work without assigned date) is refused and writes no row", async () => {
    vi.setSystemTime(1793584800000); // 2026-11-02 09:00 ไทย
    await env.DB.prepare("UPDATE assignments SET assigned_date = NULL WHERE id = 'a1'").run();
    const [r] = await batch(op({ studentId: "st1", receivedDate: "1944-09-13", clientTs: Date.now() - 1000 }));
    expect(r).toMatchObject({ result: "invalid", reason: "received_date_invalid" });
    expect(await cell("st1")).toBeNull();
  });
  it("a date far back but valid (2000-01-02) is stored, and the backup holding it restores", async () => {
    vi.setSystemTime(1793584800000);
    await env.DB.prepare("UPDATE assignments SET assigned_date = NULL WHERE id = 'a1'").run();
    const [r] = await batch(op({ studentId: "st1", receivedDate: "2000-01-02", clientTs: Date.now() - 1000 }));
    expect(r.result).toBe("ok");
    expect(r.submission.submitted_at).toBe(Date.UTC(2000, 0, 2, 5));
    const b = await takeBackup(cookie);
    const res = await restoreFrom(cookie, b);
    const body = (await res.json()) as any;
    expect({ status: res.status, error: body.error, issues: body.issues }).toMatchObject({ status: 200 });
  });
});

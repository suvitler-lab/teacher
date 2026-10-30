import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";
import { isLateSubmission, bkkToday } from "../../worker/lib/time";

// M1-04 (BR-04): a row is late iff status = 'submitted', submitted_at is set, the work has a due date, and the
// Bangkok (UTC+7) calendar date of submitted_at is after due_date. Moving the due date must re-decide every row of
// the work in the same transaction as the edit itself.

/** Epoch ms of a Bangkok wall-clock time (UTC+7, no DST). month is 1-based. */
const bkk = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 7, mi);

const A_AT = bkk(2026, 10, 22, 10, 0); // A hands in 2026-10-22 10:00 BKK
const B_AT = bkk(2026, 10, 19, 10, 0); // B hands in 2026-10-19 10:00 BKK

async function putSub(studentId: string, o: { status?: string; score?: number | null; late: number; submitted_at: number | null }) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     VALUES ('a1', ?, ?, ?, ?, ?, 'manual', NULL, NULL, 500, 500)`,
  ).bind(studentId, o.status ?? "submitted", o.score === undefined ? 8 : o.score, o.late, o.submitted_at).run();
}

async function row(studentId: string) {
  return env.DB.prepare("SELECT * FROM submissions WHERE assignment_id = 'a1' AND student_id = ?").bind(studentId).first<any>();
}

const body = (over: Record<string, unknown> = {}) => ({
  id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
  assigned_date: "2026-10-01", due_date: "2026-10-20", publish_scores: true, status: "open", class_ids: ["c1"], ...over,
});

async function setDueRaw(due: string | null) {
  await env.DB.prepare("UPDATE assignments SET due_date = ? WHERE id = 'a1'").bind(due).run();
}

describe("late follows the current due date (BR-04)", () => {
  let cookie: string;
  const save = (over: Record<string, unknown> = {}) => call("/api/assignments", json(body(over)), cookie);

  beforeEach(async () => {
    cookie = await login();
    await seed();
    await setDueRaw("2026-10-20");
  });

  it("AC-01 moving the due date later clears late; submitted_at, score, updated_at, event_at are untouched", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT, score: 7 });
    await putSub("st2", { late: 0, submitted_at: B_AT, score: 9 });
    const res = await save({ due_date: "2026-10-25" });
    expect(res.status).toBe(200);
    const a = await row("st1"), b = await row("st2");
    expect(a).toMatchObject({ late: 0, submitted_at: A_AT, score: 7, status: "submitted", updated_at: 500, event_at: 500 });
    expect(b).toMatchObject({ late: 0, submitted_at: B_AT, score: 9, status: "submitted", updated_at: 500, event_at: 500 });
  });

  it("AC-02 moving the due date back earlier makes the after-due hand-in late again", async () => {
    await setDueRaw("2026-10-25");
    await putSub("st1", { late: 0, submitted_at: A_AT });
    await putSub("st2", { late: 0, submitted_at: B_AT });
    expect((await save({ due_date: "2026-10-20" })).status).toBe(200);
    expect((await row("st1")).late).toBe(1);
    expect((await row("st2")).late).toBe(0);
  });

  it("AC-01+02 round trip: 10-20 → 10-25 → 10-20", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT });
    await putSub("st2", { late: 0, submitted_at: B_AT });
    await save({ due_date: "2026-10-25" });
    expect([(await row("st1")).late, (await row("st2")).late]).toEqual([0, 0]);
    await save({ due_date: "2026-10-20" });
    expect([(await row("st1")).late, (await row("st2")).late]).toEqual([1, 0]);
  });

  it("AC-03 removing the due date clears every late flag", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT });
    await putSub("st2", { late: 1, submitted_at: B_AT });
    expect((await save({ due_date: null })).status).toBe(200);
    expect((await row("st1")).late).toBe(0);
    expect((await row("st2")).late).toBe(0);
  });

  it("AC-04 compares the Bangkok date, not UTC: 23:30 on the due day is on time, 00:30 the next day is late", async () => {
    // 2026-10-20 23:30 BKK = 16:30 UTC same day; 2026-10-21 00:30 BKK = 17:30 UTC on 10-20 (UTC would call it on time)
    await putSub("st1", { late: 1, submitted_at: bkk(2026, 10, 20, 23, 30) });
    await putSub("st2", { late: 0, submitted_at: bkk(2026, 10, 21, 0, 30) });
    // an edit that keeps the same due date still re-decides the rows
    expect((await save({ title: "ใบงาน 1 (แก้)" })).status).toBe(200);
    expect((await row("st1")).late).toBe(0);
    expect((await row("st2")).late).toBe(1);
  });

  it("AC-04 early-morning Bangkok hand-in is a new day although UTC still says yesterday", async () => {
    // 2026-10-20 06:30 BKK = 2026-10-19 23:30 UTC; due 10-19 → late in Bangkok
    await putSub("st1", { late: 0, submitted_at: bkk(2026, 10, 20, 6, 30) });
    await putSub("st2", { late: 1, submitted_at: bkk(2026, 10, 19, 23, 59) });
    await save({ due_date: "2026-10-19" });
    expect((await row("st1")).late).toBe(1);
    expect((await row("st2")).late).toBe(0);
  });

  it("AC-04 the SQL decision equals isLateSubmission at every boundary minute", async () => {
    const due = "2026-10-20";
    const times = [
      bkk(2026, 10, 20, 0, 0), bkk(2026, 10, 20, 6, 59), bkk(2026, 10, 20, 7, 0), bkk(2026, 10, 20, 23, 59),
      bkk(2026, 10, 21, 0, 0), bkk(2026, 10, 21, 0, 1), bkk(2026, 10, 21, 6, 59), bkk(2026, 10, 19, 23, 59),
      bkk(2026, 10, 20, 23, 59) + 59_999, bkk(2026, 12, 31, 23, 30), bkk(2027, 1, 1, 0, 30),
    ];
    for (const t of times) {
      const expected = isLateSubmission(due, t) ? 1 : 0;
      await putSub("st1", { late: 1 - expected, submitted_at: t }); // start from the wrong answer
      await save({ due_date: due });
      expect({ t: new Date(t).toISOString(), late: (await row("st1")).late }).toEqual({ t: new Date(t).toISOString(), late: expected });
    }
  });

  it("R-02 a due date must be YYYY-MM-DD; an empty one means none", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT });
    expect((await save({ due_date: "20/10/2026" })).status).toBe(422);
    expect((await save({ assigned_date: "2026-1-5" })).status).toBe(422);
    expect((await save({ due_date: "" })).status).toBe(200);
    expect((await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date).toBeNull();
    expect((await row("st1")).late).toBe(0); // same as isLateSubmission("")
  });

  it("B-01/R-09 a due date must be a real Common-Era date (1900–2099)", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT });
    for (const bad of ["2569-10-20", "2026-02-30", "2026-13-01", "1899-12-31", "2100-01-01"]) {
      expect({ bad, status: (await save({ due_date: bad })).status }).toEqual({ bad, status: 422 });
      expect({ bad, status: (await save({ assigned_date: bad })).status }).toEqual({ bad, status: 422 });
    }
    expect((await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date).toBe("2026-10-20");
    expect((await row("st1")).late).toBe(1);
    expect((await save({ due_date: "2028-02-29", assigned_date: "1900-01-01" })).status).toBe(200); // leap day, lower bound
    expect((await save({ due_date: "2099-12-31" })).status).toBe(200); // upper bound
  });

  it("B-01 a date the work already holds (older BE data) is kept; a changed one must be CE", async () => {
    await env.DB.prepare("UPDATE assignments SET due_date = '2569-10-20', assigned_date = '2569-10-01' WHERE id = 'a1'").run();
    // the gradebook closing the work sends the stored dates back unchanged
    expect((await save({ due_date: "2569-10-20", assigned_date: "2569-10-01", status: "closed" })).status).toBe(200);
    expect((await env.DB.prepare("SELECT status, due_date FROM assignments WHERE id='a1'").first<any>())).toEqual({ status: "closed", due_date: "2569-10-20" });
    expect((await save({ due_date: "2569-10-21", assigned_date: "2569-10-01" })).status).toBe(422);
    expect((await save({ due_date: "2569-10-20", assigned_date: "2569-10-02" })).status).toBe(422);
    // a new work cannot borrow another's stored value
    expect((await call("/api/assignments", json(body({ id: "a7", due_date: "2569-10-20" })), cookie)).status).toBe(422);
    expect((await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date).toBe("2569-10-20");
  });

  it("R-03 a fractional ms in the last half-ms before Bangkok midnight is still that day (truncated, as in JS)", async () => {
    const t = bkk(2026, 10, 20, 23, 59) + 59_999.7;
    expect(isLateSubmission("2026-10-20", t)).toBe(false);
    await putSub("st1", { late: 1, submitted_at: t as number });
    await save({ due_date: "2026-10-20" });
    expect((await row("st1")).late).toBe(0);
  });

  it("AC-05 void, excused, and rows without submitted_at are never late", async () => {
    await putSub("st1", { status: "void", late: 1, submitted_at: A_AT, score: null });
    await putSub("st2", { status: "excused", late: 1, submitted_at: A_AT, score: null });
    expect((await save({ due_date: "2026-10-01" })).status).toBe(200);
    expect((await row("st1")).late).toBe(0);
    expect((await row("st2")).late).toBe(0);
    await putSub("st1", { status: "submitted", late: 1, submitted_at: null });
    await save({ due_date: "2026-10-01" });
    expect((await row("st1")).late).toBe(0);
  });

  it("AC-05 only rows of THIS work are touched", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,due_date,publish_scores,status,created_at,updated_at) VALUES ('a2','t1','s1','wt_worksheet','อื่น',10,'2026-10-20',1,'open',0,0)"),
      env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES ('a2','c1')"),
      env.DB.prepare("INSERT INTO submissions (assignment_id, student_id, status, score, late, submitted_at, updated_at, event_at) VALUES ('a2','st1','submitted',8,1,?,500,500)").bind(A_AT),
    ]);
    await save({ due_date: "2026-10-25" });
    expect((await env.DB.prepare("SELECT late FROM submissions WHERE assignment_id='a2'").first<any>()).late).toBe(1);
  });

  it("AC-06 a refused full-score cut (score_over_full) changes nothing — late included", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT, score: 9 });
    const res = await save({ due_date: "2026-10-25", full_score: 5 });
    expect(res.status).toBe(409);
    expect((await res.json() as any).error).toBe("score_over_full");
    expect((await row("st1")).late).toBe(1);
    const a = await env.DB.prepare("SELECT due_date, full_score FROM assignments WHERE id='a1'").first<any>();
    expect(a).toEqual({ due_date: "2026-10-20", full_score: 10 });
  });

  it("AC-06 a score landing between the check and the write rolls back the late update too", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT, score: 4 });
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/assignments", json(body({ due_date: "2026-10-25", full_score: 5 })), cookie);
    await gate.ready;
    await env.DB.prepare("UPDATE submissions SET score = 9 WHERE assignment_id='a1' AND student_id='st1'").run();
    gate.release();
    const res = await pending;
    expect(res.status).toBe(409);
    expect((await row("st1")).late).toBe(1);
    expect((await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date).toBe("2026-10-20");
  });

  it("AC-06 a restore landing before the write (epoch) rolls back the late update too", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT });
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/assignments", json(body({ due_date: "2026-10-25" })), cookie);
    await gate.ready;
    await env.DB.prepare("UPDATE meta SET value = '2' WHERE key = 'data_epoch'").run();
    gate.release();
    const res = await pending;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "epoch_changed" });
    expect((await row("st1")).late).toBe(1);
  });

  it("AC-07 the work's audit line records the due date before and after", async () => {
    await save({ due_date: "2026-10-25" });
    const a = await env.DB.prepare(
      "SELECT before_json, after_json FROM audit_logs WHERE entity='assignment' AND entity_id='a1' AND action='update' ORDER BY id DESC LIMIT 1",
    ).first<any>();
    expect(JSON.parse(a.before_json)).toMatchObject({ due_date: "2026-10-20" });
    expect(JSON.parse(a.after_json)).toMatchObject({ due_date: "2026-10-25" });

    await save({ due_date: null });
    const b = await env.DB.prepare(
      "SELECT before_json, after_json FROM audit_logs WHERE entity='assignment' AND entity_id='a1' AND action='update' ORDER BY id DESC LIMIT 1",
    ).first<any>();
    expect(JSON.parse(b.before_json)).toMatchObject({ due_date: "2026-10-25" });
    expect(JSON.parse(b.after_json)).toMatchObject({ due_date: null });
  });

  it("AC-07 a newly created work records its due date in the audit", async () => {
    const res = await call("/api/assignments", json(body({ id: "a9", due_date: "2026-11-01" })), cookie);
    expect(res.status).toBe(200);
    const a = await env.DB.prepare("SELECT before_json, after_json FROM audit_logs WHERE entity='assignment' AND entity_id='a9'").first<any>();
    expect(JSON.parse(a.before_json ?? "null")).toBeNull(); // stored as JSON text
    expect(JSON.parse(a.after_json)).toMatchObject({ due_date: "2026-11-01" });
  });

  it("AC-09 gradebook, reports and dashboard count late by the new value", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT, score: 7 });
    await putSub("st2", { late: 0, submitted_at: B_AT, score: 9 });
    const lateOf = async () => {
      const gb = await (await call("/api/gradebook?class=c1&term=t1", {}, cookie)).json() as any;
      const rp = await (await call("/api/reports/summary?class=c1&term=t1", {}, cookie)).json() as any;
      const db = await (await call("/api/dashboard?term=t1&date=2026-10-30", {}, cookie)).json() as any;
      const pick = (subs: any[]) => subs.filter((s: any) => s.assignment_id === "a1").map((s: any) => [s.student_id, s.late]).sort();
      const dash = db.openAssignments.find((x: any) => x.assignment.id === "a1").perClass.find((p: any) => p.classId === "c1");
      return { gradebook: pick(gb.submissions), reports: pick(rp.submissions), dashboardLate: dash.late };
    };
    expect(await lateOf()).toEqual({ gradebook: [["st1", true], ["st2", false]], reports: [["st1", true], ["st2", false]], dashboardLate: 1 });
    await save({ due_date: "2026-10-25" });
    expect(await lateOf()).toEqual({ gradebook: [["st1", false], ["st2", false]], reports: [["st1", false], ["st2", false]], dashboardLate: 0 });
    await save({ due_date: "2026-10-20" });
    expect(await lateOf()).toEqual({ gradebook: [["st1", true], ["st2", false]], reports: [["st1", true], ["st2", false]], dashboardLate: 1 });
  });
});

// AC-10 (R-01): every path that writes submissions re-decides late from the CURRENT due date, in the same
// transaction as the write — so no ordering of a due-date edit and a write can leave a stale late flag.
describe("late follows the current due date on every write path (AC-10)", () => {
  let cookie: string;
  const save = (over: Record<string, unknown> = {}) => call("/api/assignments", json(body(over)), cookie);
  const op = (o: Record<string, unknown> = {}) => ({
    opId: "op" + Math.random().toString(36).slice(2), scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: null, fullScoreAtScan: 10, method: "camera", clientTs: Date.now(), ...o,
  });

  beforeEach(async () => {
    cookie = await login();
    await seed();
    await setDueRaw("2026-10-20");
  });

  it("clear the class → move the due date later → undo the clear: A comes back on time", async () => {
    await putSub("st1", { late: 1, submitted_at: A_AT, score: 7 });
    const clear = await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie);
    expect(clear.status).toBe(200);
    const { batchId } = await clear.json() as any;
    expect((await save({ due_date: "2026-10-25" })).status).toBe(200);
    const undo = await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);
    expect(undo.status).toBe(200);
    expect(await row("st1")).toMatchObject({ status: "submitted", score: 7, submitted_at: A_AT, late: 0 });
  });

  it("clear → move the due date earlier → undo: an on-time hand-in comes back late", async () => {
    await putSub("st2", { late: 0, submitted_at: B_AT, score: 9 }); // 10-19, on time for 10-20
    const { batchId } = await (await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie)).json() as any;
    await save({ due_date: "2026-10-18" });
    expect((await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie)).status).toBe(200);
    expect((await row("st2")).late).toBe(1);
  });

  it("a due-date edit landing between the judge and the write of a first hand-in: late follows the new date", async () => {
    // judged while the due date was two days ago (→ late); the edit moves it two days ahead (→ on time)
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    await setDueRaw(bkkToday(now - 2 * day));
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/submissions/batch", json({ ops: [op({ clientTs: now })] }), cookie);
    await gate.ready;
    expect((await save({ due_date: bkkToday(now + 2 * day) })).status).toBe(200); // commits first
    gate.release();
    const res = await pending;
    expect(res.status).toBe(200);
    const out = await res.json() as any;
    expect(out.results[0].result).toBe("ok");
    expect((await row("st1")).late).toBe(0);
    expect(out.results[0].submission.late).toBe(false); // the reply says what is stored
  });

  it("the reverse race: judged on time, the edit moves the due date into the past first → stored late", async () => {
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    await setDueRaw(bkkToday(now + 2 * day));
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/submissions/batch", json({ ops: [op({ clientTs: now })] }), cookie);
    await gate.ready;
    expect((await save({ due_date: bkkToday(now - 2 * day) })).status).toBe(200);
    gate.release();
    const out = await (await pending).json() as any;
    expect(out.results[0].result).toBe("ok");
    expect((await row("st1")).late).toBe(1);
    expect(out.results[0].submission.late).toBe(true);
  });

  it("all-submitted judged under an old due date, edit lands first: rows follow the new date", async () => {
    // due date in the past → "everyone handed it in now" is judged late
    await setDueRaw("2000-01-01");
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1" }), cookie);
    await gate.ready;
    expect((await save({ due_date: "2099-12-31" })).status).toBe(200);
    gate.release();
    expect((await pending).status).toBe(200);
    expect([(await row("st1")).late, (await row("st2")).late]).toEqual([0, 0]);
  });
});

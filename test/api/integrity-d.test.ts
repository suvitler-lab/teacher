import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

const DATE = "2026-09-10";
const att = (cookie: string, rows: unknown[], extra: Record<string, unknown> = {}) =>
  call("/api/attendance/batch", json({ date: DATE, classId: "c1", rows, ...extra }), cookie);

function op(o: Record<string, unknown> = {}) {
  return {
    opId: "o" + Math.random().toString(36).slice(2), scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: null, fullScoreAtScan: 10, method: "grid", clientTs: Date.now(), ...o,
  };
}
const batch = (cookie: string, ops: unknown[]) => call("/api/submissions/batch", json({ ops }), cookie);
const cell = () => env.DB.prepare("SELECT status, score, event_at FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
const bumpEpoch = () => env.DB.prepare("UPDATE meta SET value='2' WHERE key='data_epoch'").run();

async function closeA1(cookie: string) {
  await call("/api/assignments", json({
    id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
    assigned_date: "2569-09-01", due_date: "2569-12-31", publish_scores: true, status: "closed", class_ids: ["c1"],
  }), cookie);
}

describe("attendance: two devices at the same moment", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("both start from the same version with different values → exactly one wins, the other gets a 409", async () => {
    // both devices loaded the (empty) session at the same time: base null
    const [a, b] = await Promise.all([
      att(cookie, [{ studentId: "st1", status: "present", baseUpdatedAt: null }]),
      att(cookie, [{ studentId: "st1", status: "absent", baseUpdatedAt: null }]),
    ]);
    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([200, 409]);

    const loser = a.status === 409 ? a : b;
    const body = (await loser.json()) as any;
    expect(body.error).toBe("conflict");
    expect(body.conflicts).toHaveLength(1);

    // the row holds the WINNER's value, not a mix and not the loser's
    const winnerStatus = a.status === 200 ? "present" : "absent";
    expect((await env.DB.prepare("SELECT status FROM attendance WHERE student_id='st1'").first<any>()).status).toBe(winnerStatus);
  });

  it("same for a row both devices had seen at the same version", async () => {
    await att(cookie, [{ studentId: "st1", status: "present" }]);
    const base = (await env.DB.prepare("SELECT updated_at FROM attendance WHERE student_id='st1'").first<any>()).updated_at;
    const [a, b] = await Promise.all([
      att(cookie, [{ studentId: "st1", status: "late", baseUpdatedAt: base }]),
      att(cookie, [{ studentId: "st1", status: "absent", baseUpdatedAt: base }]),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("two devices agreeing on the value is not a clash", async () => {
    const [a, b] = await Promise.all([
      att(cookie, [{ studentId: "st1", status: "present", baseUpdatedAt: null }]),
      att(cookie, [{ studentId: "st1", status: "present", baseUpdatedAt: null }]),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it("re-sending an op that already landed writes nothing again, and audits once", async () => {
    const rows = [{ studentId: "st1", status: "present", baseUpdatedAt: null, opId: "att-1" }];
    expect((await att(cookie, rows)).status).toBe(200);

    // another device changes it afterwards
    const base = (await env.DB.prepare("SELECT updated_at FROM attendance WHERE student_id='st1'").first<any>()).updated_at;
    await att(cookie, [{ studentId: "st1", status: "absent", baseUpdatedAt: base }]);

    // the first device's lost-reply retry arrives now: it must NOT put "present" back
    const retry = await att(cookie, rows);
    expect(retry.status).toBe(200);
    expect((await env.DB.prepare("SELECT status FROM attendance WHERE student_id='st1'").first<any>()).status).toBe("absent");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE op_id='att-1'").first<any>()).n).toBe(1);
  });

  it("returns the version of every row, and versions only go up", async () => {
    const r1 = (await (await att(cookie, [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "late" }])).json()) as any;
    expect(Object.keys(r1.rows).sort()).toEqual(["st1", "st2"]);
    const r2 = (await (await att(cookie, [{ studentId: "st1", status: "absent", baseUpdatedAt: r1.rows.st1 }])).json()) as any;
    expect(r2.rows.st1).toBeGreaterThan(r1.rows.st1);
    expect(Object.keys(r2.rows)).toEqual(["st1"]); // the versions of the students in THIS request
  });

  it("taps made before a restore are refused (epoch_changed) and nothing is written", async () => {
    await bumpEpoch();
    const res = await att(cookie, [{ studentId: "st1", status: "present", dataEpoch: 1 }]);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "epoch_changed", studentIds: ["st1"] });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM attendance").first<any>()).n).toBe(0);

    // taps made in the new epoch are fine
    expect((await att(cookie, [{ studentId: "st1", status: "present", dataEpoch: 2 }])).status).toBe(200);
  });
});

describe("scores: the teacher's LATER action always wins", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("a score that waited in an offline queue does not bring back what a whole-class clear removed", async () => {
    const t0 = Date.now();
    await batch(cookie, [op({ opId: "first", score: 5, clientTs: t0 - 5000 })]);
    expect((await cell()).score).toBe(5);

    // the teacher clears the whole class from another screen …
    const clr = await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie);
    expect(clr.status).toBe(200);
    expect((await cell()).status).toBe("void");

    // … and only now does the older queued edit (made BEFORE the clear) reach the server
    const late = (await (await batch(cookie, [op({ opId: "old", score: 3, clientTs: t0 - 1000 })])).json()) as any;
    expect(late.results[0].result).toBe("superseded");
    expect((await cell()).status).toBe("void"); // the clear stands

    // an edit made AFTER the clear is a new decision and wins
    const fresh = (await (await batch(cookie, [op({ opId: "new", score: 7, clientTs: Date.now() })])).json()) as any;
    expect(fresh.results[0].result).toBe("ok");
    expect((await cell()).score).toBe(7);
  });

  it("3 then 9 arriving out of order still ends at 9", async () => {
    const t = Date.now();
    await batch(cookie, [op({ opId: "nine", score: 9, clientTs: t })]);
    const res = (await (await batch(cookie, [op({ opId: "three", score: 3, clientTs: t - 500 })])).json()) as any;
    expect(res.results[0].result).toBe("superseded");
    expect((await cell()).score).toBe(9);
  });

  it("an older op is not applied and leaves no audit row", async () => {
    const t = Date.now();
    await batch(cookie, [op({ opId: "n", score: 9, clientTs: t })]);
    await batch(cookie, [op({ opId: "o", score: 3, clientTs: t - 500 })]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE op_id='o'").first<any>()).n).toBe(0);
  });

  it("ops made before a restore are held (epoch_changed), not applied", async () => {
    await bumpEpoch();
    const res = (await (await batch(cookie, [op({ opId: "e1", score: 6, dataEpoch: 1 })])).json()) as any;
    expect(res.results[0].result).toBe("epoch_changed");
    expect(await cell()).toBeNull();
    const ok = (await (await batch(cookie, [op({ opId: "e2", score: 6, dataEpoch: 2 })])).json()) as any;
    expect(ok.results[0].result).toBe("ok");
  });
});

describe("closed work stops accepting hand-ins on EVERY route, but can still be graded", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); await closeA1(cookie); });

  it.each(["camera", "hid", "manual"])("method %s is refused", async (method) => {
    const res = (await (await batch(cookie, [op({ method })])).json()) as any;
    expect(res.results[0].result).toBe("assignment_closed");
    expect(await cell()).toBeNull();
  });

  it("the gradebook (grid) can still enter a score", async () => {
    const res = (await (await batch(cookie, [op({ method: "grid", score: 8 })])).json()) as any;
    expect(res.results[0].result).toBe("ok");
  });

  it("intent overrides the guess from the method", async () => {
    const recv = (await (await batch(cookie, [op({ method: "grid", intent: "receive" })])).json()) as any;
    expect(recv.results[0].result).toBe("assignment_closed");
    const grade = (await (await batch(cookie, [op({ method: "manual", intent: "grade", score: 4 })])).json()) as any;
    expect(grade.results[0].result).toBe("ok");
  });

  it("voiding is always allowed", async () => {
    await batch(cookie, [op({ method: "grid", score: 8 })]);
    const res = (await (await batch(cookie, [op({ method: "manual", status: "void", score: null })])).json()) as any;
    expect(res.results[0].result).toBe("ok");
  });

  it("'everyone handed it in' (bulk) is refused; scoring and clearing still work", async () => {
    const all = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1" }), cookie);
    expect(all.status).toBe(409);
    expect(await all.json()).toMatchObject({ error: "assignment_closed" });

    await batch(cookie, [op({ method: "grid", score: 8 })]);
    expect((await call("/api/assignments/a1/bulk", json({ action: "full-score", classId: "c1" }), cookie)).status).toBe(200);
    expect((await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie)).status).toBe(200);
  });

  it("the scan screen can ask whether the work is still open", async () => {
    const closed = (await (await call("/api/assignments/a1/submissions", {}, cookie)).json()) as any;
    expect(closed.assignment).toMatchObject({ status: "closed", deleted: false });
  });
});

describe("a write from a screen that hasn't heard about a restore", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("is refused with epoch_changed; the same write without a stale epoch goes through", async () => {
    await bumpEpoch();
    const stale = await call("/api/classes", { ...json({ name: "ป.5/1" }), headers: { "X-Data-Epoch": "1" } }, cookie);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "epoch_changed", epoch: 2 });

    const fresh = await call("/api/classes", { ...json({ name: "ป.5/1" }), headers: { "X-Data-Epoch": "2" } }, cookie);
    expect(fresh.status).toBe(200);
  });

  it("bootstrap tells the client which epoch it is looking at", async () => {
    const b = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    expect(b.dataEpoch).toBe(1);
    await bumpEpoch();
    expect(((await (await call("/api/bootstrap", {}, cookie)).json()) as any).dataEpoch).toBe(2);
  });
});

describe("one class number per child", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });
  const put = (o: Record<string, unknown>) => call("/api/students", json({ code: "555", first_name: "ใหม่", last_name: "ทดสอบ", class_id: "c1", number: 1, ...o }), cookie);

  it("adding or editing a student onto a number another active child holds is refused (409 number_taken)", async () => {
    const res = await put({ number: 1 }); // st1 already has 1 in c1
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("number_taken");
    expect(body.message).toContain("ก");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE code='555'").first<any>()).n).toBe(0);

    // a free number is fine
    expect((await put({ number: 30 })).status).toBe(200);
  });

  it("editing a student without changing their own number is fine", async () => {
    const res = await call("/api/students", json({ id: "st1", code: "101", first_name: "ก", last_name: "ข-แก้", class_id: "c1", number: 1 }), cookie);
    expect(res.status).toBe(200);
  });

  it("a moved-out child's old number is free again; a different class may reuse a number", async () => {
    await env.DB.prepare("UPDATE students SET status = 'moved' WHERE id = 'st2'").run();
    expect((await put({ code: "556", number: 2 })).status).toBe(200);            // st2 (moved) held 2
    expect((await put({ code: "557", number: 1, class_id: "c2" })).status).toBe(409); // st9 holds 1 in c2
    expect((await put({ code: "558", number: 5, class_id: "c2" })).status).toBe(200);
  });

  it("bringing a former student back onto a taken number is refused too", async () => {
    await env.DB.prepare("UPDATE students SET status = 'moved', number = 1 WHERE id = 'st9'").run();
    await env.DB.prepare("UPDATE students SET class_id = 'c1' WHERE id = 'st9'").run(); // st9 (moved) now shares number 1 with st1
    const res = await call("/api/students", json({ id: "st9", code: "201", first_name: "จ", last_name: "ฉ", class_id: "c1", number: 1, status: "active" }), cookie);
    expect(res.status).toBe(409);
  });

  it("import: two rows on one number, or a number held by someone outside the paste, is refused (422) and writes nothing", async () => {
    const row = (code: string, number: number) => ({ code, prefix: "ด.ช.", first_name: "ก" + code, last_name: "ข", number });
    const dup = await call("/api/students/import", json({ class_id: "c1", students: [row("601", 7), row("602", 7)] }), cookie);
    expect(dup.status).toBe(422);
    expect(await dup.json()).toMatchObject({ error: "number_conflict", dupNumbers: [7] });

    const clash = await call("/api/students/import", json({ class_id: "c1", students: [row("603", 2)] }), cookie); // st2 (not pasted) holds 2
    expect(clash.status).toBe(422);
    expect(((await clash.json()) as any).numberClashes[0]).toMatchObject({ number: 2, code: "102" });

    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE code IN ('601','602','603')").first<any>()).n).toBe(0);
    // a clean paste still works
    expect((await call("/api/students/import", json({ class_id: "c1", students: [row("604", 8), row("605", 9)] }), cookie)).status).toBe(200);
  });
});

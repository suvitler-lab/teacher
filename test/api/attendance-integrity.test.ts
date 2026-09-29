import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

const DATE = "2026-09-10";
const post = (cookie: string, body: Record<string, unknown>) =>
  call("/api/attendance/batch", json({ date: DATE, classId: "c1", ...body }), cookie);

describe("attendance batch integrity", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("rejects a student who is not in the named class (422) and writes nothing", async () => {
    // st9 belongs to c2 — a stale client naming c1 must not be able to file him there
    const res = await post(cookie, { rows: [{ studentId: "st1", status: "present" }, { studentId: "st9", status: "present" }] });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("not_in_class");
    expect(body.studentIds).toEqual(["st9"]);

    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM attendance").first<any>()).n).toBe(0);
    // and no empty session was left behind
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM attendance_sessions").first<any>()).n).toBe(0);
  });

  it("rejects a student who is no longer active", async () => {
    await env.DB.prepare("UPDATE students SET status = 'moved' WHERE id = 'st2'").run();
    const res = await post(cookie, { rows: [{ studentId: "st2", status: "present" }] });
    expect(res.status).toBe(422);
  });

  it("two devices that both started from an empty list: the second is a clash, not an overwrite", async () => {
    const a = await post(cookie, { rows: [{ studentId: "st1", status: "present", baseUpdatedAt: null }] });
    expect(a.status).toBe(200);

    const b = await post(cookie, { rows: [{ studentId: "st1", status: "absent", baseUpdatedAt: null }] });
    expect(b.status).toBe(409);
    const body = (await b.json()) as any;
    expect(body.conflicts[0].server.status).toBe("present");
    expect(body.conflicts[0].draft.status).toBe("absent");
    // first device's value survives
    expect((await env.DB.prepare("SELECT status FROM attendance WHERE student_id='st1'").first<any>()).status).toBe("present");
  });

  it("the same status from a second device is not a clash", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present", baseUpdatedAt: null }] });
    const b = await post(cookie, { rows: [{ studentId: "st1", status: "present", baseUpdatedAt: null }] });
    expect(b.status).toBe(200);
  });

  it("retrying after a lost response is not a clash with itself, and audits once", async () => {
    const rows = [{ studentId: "st1", status: "late", baseUpdatedAt: null, opId: "att-op-1" }];
    // the server applied it but the client never saw the reply, so it resends the same payload
    expect((await post(cookie, { rows })).status).toBe(200);
    expect((await post(cookie, { rows })).status).toBe(200);

    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE op_id = 'att-op-1'").first<any>()).n).toBe(1);
    expect((await env.DB.prepare("SELECT status FROM attendance WHERE student_id='st1'").first<any>()).status).toBe("late");
  });

  it("a stale base against a different status is still a clash", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const row = await env.DB.prepare("SELECT updated_at FROM attendance WHERE student_id='st1'").first<any>();
    await post(cookie, { rows: [{ studentId: "st1", status: "late", baseUpdatedAt: row.updated_at }] });
    const stale = await post(cookie, { rows: [{ studentId: "st1", status: "absent", baseUpdatedAt: row.updated_at }] });
    expect(stale.status).toBe(409);
  });

  it("stores the client's scan time and method, clamped to now", async () => {
    const t = Date.now() - 60_000;
    await post(cookie, { rows: [{ studentId: "st1", status: "present", time: t, method: "hid" }] });
    const r1 = await env.DB.prepare("SELECT time, method FROM attendance WHERE student_id='st1'").first<any>();
    expect(r1.time).toBe(t);
    expect(r1.method).toBe("hid");

    // a wild future time can't be recorded
    const before = Date.now();
    await post(cookie, { rows: [{ studentId: "st2", status: "present", time: before + 10 * 864e5 }] });
    const r2 = await env.DB.prepare("SELECT time FROM attendance WHERE student_id='st2'").first<any>();
    expect(r2.time).toBeLessThanOrEqual(Date.now());
  });
});

describe("attendance replies tell the truth about what the server holds (B03)", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("a retry of an edit that already landed reports the CURRENT status — not the status the retry carried", async () => {
    // device A: 'present' lands, but its reply is lost
    const first = (await (await post(cookie, { rows: [{ studentId: "st1", status: "present", opId: "lost-reply", baseUpdatedAt: null }] })).json()) as any;
    expect(first.state.st1.status).toBe("present");
    // device B, with the version it saw, changes the student to 'absent'
    const other = await post(cookie, { rows: [{ studentId: "st1", status: "absent", opId: "other-device", baseUpdatedAt: first.rows.st1 }] });
    expect(other.status).toBe(200);
    // device A retries the SAME op — the server must not write it again, and must say what is true now
    const retry = (await (await post(cookie, { rows: [{ studentId: "st1", status: "present", opId: "lost-reply", baseUpdatedAt: null }] })).json()) as any;
    expect(retry.changed).toBe(0);
    expect(retry.state.st1.status).toBe("absent");
    expect(retry.rows.st1).toBe(retry.state.st1.updatedAt); // `rows` (versions) and `state` agree
    expect((await env.DB.prepare("SELECT status FROM attendance WHERE student_id='st1'").first<any>()).status).toBe("absent");
  });

  it("a normal write also returns the stored status per student, including students not in this request's rows only when asked", async () => {
    const res = (await (await post(cookie, { rows: [{ studentId: "st1", status: "late" }, { studentId: "st2", status: "sick" }] })).json()) as any;
    expect(res.changed).toBe(2);
    expect(res.state.st1.status).toBe("late");
    expect(res.state.st2.status).toBe("sick");
  });
});

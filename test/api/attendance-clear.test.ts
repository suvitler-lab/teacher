// Attendance "clear" (v9): a row with status "none" takes a mark back — the child is "not checked yet" again.
// It goes through the same guards as every other attendance write: restore epoch, class membership,
// clash with another device, audit in the same batch — and sending it twice is harmless.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";
import { BACKUP_TABLES } from "../../worker/routes/backup";

const DATE = "2026-09-10";
const post = (cookie: string, body: Record<string, unknown>) =>
  call("/api/attendance/batch", json({ date: DATE, classId: "c1", ...body }), cookie);
const n = async (sql: string) => (await env.DB.prepare(sql).first<any>()).n as number;
const rowOf = (sid: string) => env.DB.prepare("SELECT status, updated_at FROM attendance WHERE student_id = ?").bind(sid).first<any>();
const auditOf = (opId: string) => env.DB.prepare("SELECT action, before_json, after_json, entity FROM audit_logs WHERE op_id = ?").bind(opId).all<any>();

describe("attendance clear (status none)", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("deletes the mark: the child is unchecked again, and the reply says so", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "absent" }] });
    const base = (await rowOf("st1")).updated_at;

    const res = await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: base, opId: "clr-1", method: "grid" }] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.changed).toBe(1);
    expect(body.absent).toEqual(["st1"]);
    expect(body.state.st1).toBeUndefined();

    expect(await rowOf("st1")).toBeNull();
    expect((await rowOf("st2")).status).toBe("absent"); // the others are untouched
    const get = (await (await call(`/api/attendance?date=${DATE}&class=c1`, {}, cookie)).json()) as any;
    expect(get.rows.map((r: any) => r.student_id)).toEqual(["st2"]);
  });

  it("writes one audit row: before = the old status, after = null", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "late" }] });
    const base = (await rowOf("st1")).updated_at;
    await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: base, opId: "clr-a" }] });
    const a = (await auditOf("clr-a")).results!;
    expect(a).toHaveLength(1);
    expect(a[0].entity).toBe("attendance");
    expect(a[0].action).toBe("void");
    expect(JSON.parse(a[0].before_json)).toEqual({ status: "late" });
    expect(JSON.parse(a[0].after_json)).toBeNull();
  });

  it("is idempotent: clearing twice, or a child who was never marked, is fine and leaves no audit", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const base = (await rowOf("st1")).updated_at;
    const first = await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: base, opId: "clr-2" }] });
    expect(first.status).toBe(200);
    // the reply was lost: the same payload again
    const again = await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: base, opId: "clr-2" }] });
    expect(again.status).toBe(200);
    expect(((await again.json()) as any).absent).toEqual(["st1"]);
    // a fresh clear (new op) on a row that is already gone
    const fresh = await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: base, opId: "clr-3" }] });
    expect(fresh.status).toBe(200);
    // a child nobody ever marked
    const never = await post(cookie, { rows: [{ studentId: "st2", status: "none", baseUpdatedAt: null, opId: "clr-4" }] });
    expect(never.status).toBe(200);

    expect((await auditOf("clr-2")).results).toHaveLength(1);
    expect((await auditOf("clr-3")).results).toHaveLength(0);
    expect((await auditOf("clr-4")).results).toHaveLength(0);
    expect(await n("SELECT COUNT(*) AS n FROM attendance")).toBe(0);
  });

  it("clears and marks can travel in one batch", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const base = (await rowOf("st1")).updated_at;
    const res = await post(cookie, { rows: [
      { studentId: "st1", status: "none", baseUpdatedAt: base, opId: "mix-1" },
      { studentId: "st2", status: "sick", opId: "mix-2" },
    ] });
    expect(res.status).toBe(200);
    expect(await rowOf("st1")).toBeNull();
    expect((await rowOf("st2")).status).toBe("sick");
    expect((await auditOf("mix-1")).results).toHaveLength(1);
    expect((await auditOf("mix-2")).results).toHaveLength(1);
    // the day still has a mark in it, so it is still a checked day
    expect(await n("SELECT COUNT(*) AS n FROM attendance_sessions")).toBe(1);
  });

  it("refuses a student who is no longer in the class (inactive or another room) and keeps the mark", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "present" }] });
    await env.DB.prepare("UPDATE students SET status = 'moved' WHERE id = 'st2'").run();
    const gone = await post(cookie, { rows: [{ studentId: "st2", status: "none", baseUpdatedAt: null }] });
    expect(gone.status).toBe(422);
    expect(((await gone.json()) as any).error).toBe("not_in_class");
    expect((await rowOf("st2")).status).toBe("present");

    // st9 lives in c2: a batch that names c1 can not clear him
    const foreign = await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: null }, { studentId: "st9", status: "none", baseUpdatedAt: null }] });
    expect(foreign.status).toBe(422);
    expect(((await foreign.json()) as any).studentIds).toEqual(["st9"]);
    expect((await rowOf("st1")).status).toBe("present"); // the whole batch failed together
  });

  it("a clear against a mark that another device changed since is a clash (409), unless forced", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const seen = (await rowOf("st1")).updated_at;
    // another device re-marks the child after this device last looked
    await post(cookie, { rows: [{ studentId: "st1", status: "absent", baseUpdatedAt: seen }] });

    const stale = await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: seen, opId: "clr-5" }] });
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as any;
    expect(body.error).toBe("conflict");
    expect(body.conflicts[0].draft.status).toBe("none");
    expect(body.conflicts[0].server.status).toBe("absent");
    expect((await rowOf("st1")).status).toBe("absent");
    expect((await auditOf("clr-5")).results).toHaveLength(0);

    // a clear from a device that never saw the row at all is a clash too
    expect((await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: null }] })).status).toBe(409);

    // the teacher picks "use this device": the clear goes through
    const forced = await post(cookie, { force: true, rows: [{ studentId: "st1", status: "none", baseUpdatedAt: seen, opId: "clr-6" }] });
    expect(forced.status).toBe(200);
    expect(await rowOf("st1")).toBeNull();
    expect((await auditOf("clr-6")).results).toHaveLength(1);
  });

  it("a clear built on the latest version is not a clash", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    await post(cookie, { rows: [{ studentId: "st1", status: "late", baseUpdatedAt: (await rowOf("st1")).updated_at }] });
    const latest = (await rowOf("st1")).updated_at;
    expect((await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: latest }] })).status).toBe(200);
    expect(await rowOf("st1")).toBeNull();
  });

  it("a mark another device made after a retried clear landed is reported, not undone", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const base = (await rowOf("st1")).updated_at;
    const clear = { studentId: "st1", status: "none", baseUpdatedAt: base, opId: "clr-7" };
    await post(cookie, { rows: [clear] });
    await post(cookie, { rows: [{ studentId: "st1", status: "sick", baseUpdatedAt: null }] }); // other device, later
    // the first device never saw its reply and resends: the clear is NOT applied a second time
    const retry = await post(cookie, { rows: [clear] });
    expect(retry.status).toBe(200);
    const body = (await retry.json()) as any;
    expect(body.state.st1.status).toBe("sick");
    expect((await rowOf("st1")).status).toBe("sick");
  });

  it("an emptied day is not a checked day: the empty session goes, the week tally shows nothing", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "absent" }] });
    expect(await n("SELECT COUNT(*) AS n FROM attendance_sessions")).toBe(1);

    const b1 = (await rowOf("st1")).updated_at, b2 = (await rowOf("st2")).updated_at;
    await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: b1 }] });
    expect(await n("SELECT COUNT(*) AS n FROM attendance_sessions")).toBe(1); // st2 still has a mark
    await post(cookie, { rows: [{ studentId: "st2", status: "none", baseUpdatedAt: b2 }] });
    expect(await n("SELECT COUNT(*) AS n FROM attendance_sessions")).toBe(0);

    const days = (await (await call(`/api/attendance/days?from=${DATE}&to=${DATE}`, {}, cookie)).json()) as any;
    expect(days.days).toEqual([]);
    const get = (await (await call(`/api/attendance?date=${DATE}&class=c1`, {}, cookie)).json()) as any;
    expect(get.rows).toEqual([]);
    // and a new mark on that day starts a fresh session as usual
    expect((await post(cookie, { rows: [{ studentId: "st1", status: "late" }] })).status).toBe(200);
    expect(await n("SELECT COUNT(*) AS n FROM attendance_sessions")).toBe(1);
    const report = (await (await call("/api/reports/summary?class=c1", {}, cookie)).json()) as any;
    expect(report.attendanceSessions).toHaveLength(1);
    expect(report.attendance).toHaveLength(1);
  });

  it("the week tally and the dashboard simply do not count a cleared child", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "absent" }, { studentId: "st2", status: "present" }] });
    await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: (await rowOf("st1")).updated_at }] });
    const days = (await (await call(`/api/attendance/days?from=${DATE}&to=${DATE}&class=c1`, {}, cookie)).json()) as any;
    expect(days.days[0]).toMatchObject({ marked: 1, present: 1, absent: 0, total: 2 });
    const dash = (await (await call(`/api/dashboard?date=${DATE}`, {}, cookie)).json()) as any;
    expect(dash.absentToday.filter((r: any) => r.studentId === "st1")).toEqual([]);
    const today = dash.attendanceToday.find((r: any) => r.classId === "c1");
    expect(today.marked).toBe(1);
  });

  it("a clear made before a restore is held, not applied to the restored data", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const base = (await rowOf("st1")).updated_at;
    const res = await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: base, dataEpoch: 999 }] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "epoch_changed", studentIds: ["st1"] });
    expect((await rowOf("st1")).status).toBe("present");
  });

  it("a restore that lands between the check and the write rolls the clear back", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const base = (await rowOf("st1")).updated_at;
    const g = gateBatch();
    const req = callIn(g.env, "/api/attendance/batch", json({ date: DATE, classId: "c1", rows: [{ studentId: "st1", status: "none", baseUpdatedAt: base }] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE meta SET value='2' WHERE key='data_epoch'").run();
    g.release();
    const res = await req;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "epoch_changed" });
    expect((await rowOf("st1")).status).toBe("present");
    expect(await n("SELECT COUNT(*) AS n FROM audit_logs WHERE entity='attendance' AND action='void'")).toBe(0);
  });

  it("a mark that lands between the check and the write turns a clear into a clash, not a silent delete", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const base = (await rowOf("st1")).updated_at;
    const g = gateBatch();
    const req = callIn(g.env, "/api/attendance/batch", json({ date: DATE, classId: "c1", rows: [{ studentId: "st1", status: "none", baseUpdatedAt: base, opId: "clr-8" }] }), cookie);
    await g.ready;
    // the other device re-marks the child while the clear is on its way
    await env.DB.prepare("UPDATE attendance SET status='absent', updated_at = updated_at + 5 WHERE student_id='st1'").run();
    g.release();
    const res = await req;
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).conflicts[0].server.status).toBe("absent");
    expect((await rowOf("st1")).status).toBe("absent");
    expect((await auditOf("clr-8")).results).toHaveLength(0);
  });
});

describe("backup and restore after a clear", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  async function backupOf() {
    const data: Record<string, any[]> = {}; const counts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      data[t] = ((await (await call(`/api/backup?table=${t}`, {}, cookie)).json()) as any).rows;
      counts[t] = data[t].length;
    }
    return { data, counts };
  }
  async function restoreFrom(b: { data: Record<string, any[]>; counts: Record<string, number> }) {
    const v = await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: b.counts } }), cookie);
    expect(v.status).toBe(200);
    const { restoreId } = (await v.json()) as any;
    for (const t of BACKUP_TABLES) {
      if (b.data[t].length === 0) continue;
      const r = await call("/api/restore/execute", json({ restoreId, step: "chunk", table: t, seq: 0, rows: b.data[t] }), cookie);
      expect(r.status).toBe(200);
    }
    return call("/api/restore/execute", json({ restoreId, step: "commit" }), cookie);
  }

  it("a backup taken after a clear restores cleanly, with the child still unchecked", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "late" }] });
    await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: (await rowOf("st1")).updated_at }] });
    const b = await backupOf();
    expect(b.counts.attendance).toBe(1);
    expect(b.data.attendance.map((r) => r.student_id)).toEqual(["st2"]);
    expect((await restoreFrom(b)).status).toBe(200);
    expect(await rowOf("st1")).toBeNull();
    expect((await rowOf("st2")).status).toBe("late");
  });

  it("a restore brings a cleared mark back, because the file still has it", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    const b = await backupOf();
    await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: (await rowOf("st1")).updated_at }] });
    expect(await rowOf("st1")).toBeNull();
    expect((await restoreFrom(b)).status).toBe(200);
    expect((await rowOf("st1")).status).toBe("present");
  });

  it("a backup of a day that was fully cleared (no session left) validates and restores", async () => {
    await post(cookie, { rows: [{ studentId: "st1", status: "present" }] });
    await post(cookie, { rows: [{ studentId: "st1", status: "none", baseUpdatedAt: (await rowOf("st1")).updated_at }] });
    const b = await backupOf();
    expect(b.counts.attendance).toBe(0);
    expect(b.counts.attendance_sessions).toBe(0);
    expect((await restoreFrom(b)).status).toBe(200);
  });
});

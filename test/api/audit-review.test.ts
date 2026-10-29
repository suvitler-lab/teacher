import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";
import { restoreFrom, takeBackup } from "./backup-helpers";

describe("independent review of school-year races", () => {
  it("does not create an attendance session in a restored epoch from a stale request", async () => {
    const cookie = await login();
    await seed();
    let release!: () => void;
    let reached!: () => void;
    const ready = new Promise<void>(r => { reached = r; });
    const wait = new Promise<void>(r => { release = r; });
    const unwrapped = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
      const wrapped = new Proxy(statement, {
        get(target, key) {
          if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
          if (key === "run") return async () => { reached(); await wait; return target.run(); };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      unwrapped.set(wrapped, statement);
      return wrapped;
    };
    const DB = new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare") return (sql: string) => {
          const statement = target.prepare(sql);
          return /INSERT OR IGNORE INTO attendance_sessions/.test(sql) ? wrap(statement) : statement;
        };
        if (key === "batch") return async (statements: D1PreparedStatement[]) => {
          if (statements.some(statement => unwrapped.has(statement))) { reached(); await wait; }
          return target.batch(statements.map(statement => unwrapped.get(statement) ?? statement));
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const pending = callIn({ ...env, DB }, "/api/attendance/batch", json({
      date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present", opId: "stale-session" }],
    }), cookie);
    await ready;
    await env.DB.prepare("UPDATE meta SET value='2' WHERE key='data_epoch'").run();
    release();
    expect((await pending).status).toBe(409);
    expect(await env.DB.prepare("SELECT COUNT(*) n FROM attendance_sessions").first()).toEqual({ n: 0 });
  });

  it("treats a legacy null class year as the current year when blocking a cross-year move", async () => {
    const cookie = await login();
    await seed();
    await env.DB.prepare("UPDATE classes SET year=NULL WHERE id='c1'").run();
    await env.DB.prepare("UPDATE classes SET year=2570 WHERE id='c2'").run();
    const moved = await call("/api/students", json({
      id: "st1", code: "101", first_name: "ก", last_name: "ข", class_id: "c2", number: 9,
    }), cookie);
    expect(moved.status).toBe(409);
    expect(await moved.json()).toMatchObject({ error: "history_move_blocked" });
    expect(await env.DB.prepare("SELECT class_id FROM students WHERE id='st1'").first()).toEqual({ class_id: "c1" });
  });

  it("cannot put the old year back in charge after a new school year starts", async () => {
    const cookie = await login();
    await seed();
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/terms", json({
      id: "t1", year: 2569, term: 1, name: "old term", is_current: true,
    }), cookie);
    await gate.ready;
    const started = await call("/api/terms/start", json({
      expectedCurrentTermId: "t1", year: 2570, term: 1, name: "1/2570",
      start_date: "2027-05-01", keepClasses: ["c1"],
    }), cookie);
    gate.release();
    const stale = await pending;
    expect(started.status).toBe(200);
    expect(stale.status).toBe(409);
    const current = await env.DB.prepare("SELECT year FROM terms WHERE is_current=1").first();
    expect(current).toEqual({ year: 2570 });
    expect(await env.DB.prepare("SELECT archived FROM classes WHERE id='c1'").first()).toEqual({ archived: 1 });
  });

  it("cannot overwrite the year of a term created concurrently under the same id", async () => {
    const cookie = await login();
    await seed();
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/terms", json({
      id: "shared-id", year: 2569, term: 2, name: "stale create",
    }), cookie);
    await gate.ready;
    const winner = await call("/api/terms", json({
      id: "shared-id", year: 2570, term: 1, name: "other year", is_current: false,
    }), cookie);
    gate.release();
    const stale = await pending;
    expect(winner.status).toBe(200);
    expect(stale.status).toBe(409);
    expect(await env.DB.prepare("SELECT year,term,name FROM terms WHERE id='shared-id'").first())
      .toEqual({ year: 2570, term: 1, name: "other year" });
  });
});

describe("independent review of restore roster relationships", () => {
  it("rejects assignment class links into a different school year than the term", async () => {
    const cookie = await login();
    await seed();
    const before = await takeBackup(cookie);
    const b = structuredClone(before);
    b.data.classes.find(row => row.id === "c1")!.year = 2570;
    const res = await restoreFrom(cookie, b);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "invalid_backup" });
    expect((await takeBackup(cookie)).data).toEqual(before.data);
  });

  it("keeps legacy assignments without class links restorable when their normal write route accepts marks", async () => {
    const cookie = await login();
    await seed();
    await env.DB.prepare("DELETE FROM assignment_classes WHERE assignment_id='a1'").run();
    const saved = await call("/api/submissions/batch", json({ ops: [{
      opId: "legacy-global", scanSessionId: "grid", assignmentId: "a1", studentId: "st9",
      status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: Date.now(), intent: "grade",
    }] }), cookie);
    expect(saved.status).toBe(200);
    const savedBody = await saved.json() as any;
    expect(savedBody.results[0].result).toBe("ok");
    const b = await takeBackup(cookie);
    const restored = await restoreFrom(cookie, b);
    expect(restored.status).toBe(200);
    expect((await takeBackup(cookie)).data).toEqual(b.data);
  });

  it("rejects a submission whose student is in another class than the assignment", async () => {
    const cookie = await login();
    await seed();
    const before = await takeBackup(cookie);
    const b = structuredClone(before);
    b.data.submissions.push({
      assignment_id: "a1", student_id: "st9", status: "submitted", score: 8,
      late: 0, updated_at: 123, event_at: 123,
    });
    b.counts.submissions++;
    const res = await restoreFrom(cookie, b);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "invalid_backup" });
    expect((await takeBackup(cookie)).data).toEqual(before.data);
  });

  it("rejects attendance that belongs to another class than the session", async () => {
    const cookie = await login();
    await seed();
    const before = await takeBackup(cookie);
    const b = structuredClone(before);
    b.data.attendance_sessions.push({ id: "wrong-room", date: "2026-09-10", class_id: "c1", updated_at: 123 });
    b.counts.attendance_sessions++;
    b.data.attendance.push({ session_id: "wrong-room", student_id: "st9", status: "present", updated_at: 123 });
    b.counts.attendance++;
    const res = await restoreFrom(cookie, b);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "invalid_backup" });
    expect((await takeBackup(cookie)).data).toEqual(before.data);
  });
});

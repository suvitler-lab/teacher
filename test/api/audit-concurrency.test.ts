import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, cookieFrom, gateBatch, json, login, seed } from "./helpers";

const term = (overrides: Record<string, unknown> = {}) => ({
  year: 2569, term: 2, name: "2/2569", ...overrides,
});
const count = async (table: string, where = "1") =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first<{ n: number }>())!.n;

/** Hold the teacher INSERT after setup has checked that the account does not exist. */
function gateSetupInsert() {
  let release!: () => void;
  let reached!: () => void;
  const ready = new Promise<void>((resolve) => { reached = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  function wrap(stmt: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(stmt, {
      get(target, prop) {
        if (prop === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
        if (prop === "run") return async () => { reached(); await wait; return target.run(); };
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => {
        const stmt = target.prepare(sql);
        return /INSERT INTO teacher/i.test(sql) ? wrap(stmt) : stmt;
      };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { env: { ...env, DB }, ready, release };
}

describe("catalog and setup concurrency audit", () => {
  it("refuses settings checked before restore without overwriting restored settings or adding an audit", async () => {
    const cookie = await login();
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/settings", json({ school_name: "stale school" }, { method: "PUT" }), cookie);
    await gate.ready;
    await env.DB.batch([
      env.DB.prepare("UPDATE meta SET value = '2' WHERE key = 'data_epoch'"),
      env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('school_name', 'restored school')"),
    ]);
    gate.release();
    const res = await pending;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "epoch_changed" });
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key = 'school_name'").first()).toEqual({ value: "restored school" });
    expect(await count("audit_logs", "entity = 'settings'")).toBe(0);
  });

  it("saves settings and their audit together at the current epoch", async () => {
    const cookie = await login();
    const res = await call("/api/settings", json({ school_name: "current school" }, { method: "PUT", headers: { "X-Data-Epoch": "1" } }), cookie);
    expect(res.status).toBe(200);
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key = 'school_name'").first()).toEqual({ value: "current school" });
    const audit = await env.DB.prepare("SELECT after_json FROM audit_logs WHERE entity = 'settings'").first<{ after_json: string }>();
    expect(JSON.parse(audit!.after_json)).toEqual({ school_name: "current school" });
  });

  it("creates only one teacher when two setup requests pass the initial check", async () => {
    const gate = gateSetupInsert();
    const body = { setupCode: "test-code", password: "pw123456" };
    const pending = callIn(gate.env, "/api/setup", json({ ...body, email: "loser@example.com", deviceId: "loser" }));
    await gate.ready;
    const winner = await call("/api/setup", json({ ...body, email: "winner@example.com", deviceId: "winner" }));
    gate.release();
    const loser = await pending;
    expect(winner.status).toBe(200);
    expect(cookieFrom(winner)).not.toBe("");
    expect(loser.status).toBe(403);
    expect(await loser.json()).toMatchObject({ error: "already_setup" });
    expect(cookieFrom(loser)).toBe("");
    expect(await count("teacher")).toBe(1);
    expect(await env.DB.prepare("SELECT email FROM teacher").first()).toEqual({ email: "winner@example.com" });
    expect(await count("devices")).toBe(1);
    expect(await count("sessions")).toBe(1);
    expect(await count("audit_logs", "entity = 'auth' AND action = 'create'")).toBe(1);
    expect(await count("devices", "id = 'loser'")).toBe(0);
  });

  it("refuses a duplicate year/term on the create path and leaves the current term alone", async () => {
    const cookie = await login();
    await seed();
    const res = await call("/api/terms", json(term({ term: 1, is_current: true })), cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "term_exists" });
    expect(await count("terms")).toBe(1);
    expect(await env.DB.prepare("SELECT id FROM terms WHERE is_current = 1").first()).toEqual({ id: "t1" });
  });

  it.each(["create", "update"])("rechecks year/term inside a %s transaction after another request takes the pair", async (mode) => {
    const cookie = await login();
    await seed();
    if (mode === "update") {
      expect((await call("/api/terms", json(term({ id: "edit-me", term: 3 })), cookie)).status).toBe(200);
    }
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/terms", json(term({ id: mode === "update" ? "edit-me" : "new-term", is_current: true })), cookie);
    await gate.ready;
    const winner = await call("/api/terms", json(term({ id: "winner" })), cookie);
    gate.release();
    const loser = await pending;
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(409);
    expect(await loser.json()).toMatchObject({ error: "term_exists" });
    expect(await count("terms", "year = 2569 AND term = 2")).toBe(1);
    expect(await env.DB.prepare("SELECT id FROM terms WHERE is_current = 1").first()).toEqual({ id: "t1" });
    if (mode === "update") {
      expect(await env.DB.prepare("SELECT term FROM terms WHERE id = 'edit-me'").first()).toEqual({ term: 3 });
    } else {
      expect(await count("terms", "id = 'new-term'")).toBe(0);
    }
  });

  it("refuses starting a term if a catalog create takes the year/term while the start is pending", async () => {
    const cookie = await login();
    await seed();
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/terms/start", json(term({ expectedCurrentTermId: "t1", start_date: "2026-10-01" })), cookie);
    await gate.ready;
    const winner = await call("/api/terms", json(term({ id: "winner" })), cookie);
    gate.release();
    const loser = await pending;
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(409);
    expect(await loser.json()).toMatchObject({ error: "term_exists" });
    expect(await count("terms", "year = 2569 AND term = 2")).toBe(1);
    expect(await env.DB.prepare("SELECT id FROM terms WHERE is_current = 1").first()).toEqual({ id: "t1" });
    expect(await count("audit_logs", "entity = 'term'")).toBe(0);
  });

  it("still edits a term without duplicating itself and starts a distinct next term", async () => {
    const cookie = await login();
    await seed();
    expect((await call("/api/terms", json(term({ id: "t1", term: 1, name: "renamed", is_current: true })), cookie)).status).toBe(200);
    expect((await call("/api/terms/start", json(term({ expectedCurrentTermId: "t1", start_date: "2026-10-01" })), cookie)).status).toBe(200);
    expect(await count("terms")).toBe(2);
    expect(await count("terms", "is_current = 1")).toBe(1);
    expect(await count("audit_logs", "entity = 'term'")).toBe(1);
  });
});

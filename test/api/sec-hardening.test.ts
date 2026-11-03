import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { takeBackup, restoreFrom } from "./backup-helpers";
import { BACKUP_TABLES } from "../../worker/routes/backup";

// Security review 2026-11-03, Low items: S-07 headers, S-08 Sec-Fetch-Site, S-09 body size,
// S-10 no raw SQL in restore errors, S-12 prototype keys as table names.

describe("S-07 every /api response is no-store + nosniff", () => {
  it("data, backup, errors and health", async () => {
    const cookie = await login();
    for (const [path, ck] of [["/api/bootstrap", cookie], ["/api/backup?table=students&cursor=0", cookie], ["/api/bootstrap", undefined], ["/api/health", undefined], ["/api/nope", cookie]] as const) {
      const res = await call(path, {}, ck);
      expect(res.headers.get("Cache-Control"), path).toBe("no-store");
      expect(res.headers.get("X-Content-Type-Options"), path).toBe("nosniff");
    }
  });
});

describe("S-08 writes from another site are refused even without Origin", () => {
  it("Sec-Fetch-Site cross-site / same-site → 403; same-origin passes", async () => {
    const cookie = await login();
    const put = (site: string) => call("/api/settings", json({ school_name: "x" }, { method: "PUT", headers: { "Sec-Fetch-Site": site } }), cookie);
    expect((await put("cross-site")).status).toBe(403);
    expect((await put("same-site")).status).toBe(403);
    expect((await put("same-origin")).status).toBe(200);
    // reads are not affected (a link from elsewhere still opens the app's data for the signed-in teacher)
    expect((await call("/api/bootstrap", { headers: { "Sec-Fetch-Site": "cross-site" } }, cookie)).status).toBe(200);
  });
});

describe("S-09 body size and field length", () => {
  it("a huge login body is 413 before any work", async () => {
    await login();
    const res = await call("/api/auth/login", json({ email: "teacher@example.com", password: "x".repeat(20_000), deviceId: "d" }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "too_large" });
  });

  it("an over-long password or device id is a validation error, not a hash", async () => {
    await login();
    expect((await call("/api/auth/login", json({ email: "teacher@example.com", password: "x".repeat(300), deviceId: "d" }))).status).toBe(422);
    expect((await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "d".repeat(200) }))).status).toBe(422);
  });

  it("a write body over 1 MB is 413", async () => {
    const cookie = await login();
    const res = await call("/api/settings", json({ school_name: "x".repeat(1_100_000) }, { method: "PUT" }), cookie);
    expect(res.status).toBe(413);
  });
});

describe("S-10 restore failures do not send SQL text back", () => {
  it("restore_failed carries a code only", async () => {
    const cookie = await login();
    await seed();
    const b = await takeBackup(cookie);
    const failing = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "batch") return async () => { throw new Error("D1_ERROR: UNIQUE constraint failed: secret_table.secret_col"); };
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const res = await restoreFrom(cookie, b, { commitEnv: { ...env, DB: failing } as typeof env });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ ok: false, error: "restore_failed" });
    expect(JSON.stringify(body)).not.toMatch(/secret_|UNIQUE|D1_ERROR/);
  });
});

describe("S-12 a prototype key is not a table", () => {
  it("chunk with table 'constructor' / '__proto__' is 400 bad_table, not 500", async () => {
    const cookie = await login();
    const counts = Object.fromEntries(BACKUP_TABLES.map((t) => [t, 0]));
    const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts } }), cookie)).json()) as any;
    expect(v.ok).toBe(true);
    for (const table of ["constructor", "__proto__", "toString"]) {
      const res = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table, seq: 0, rows: [{ id: "x" }] }), cookie);
      expect(res.status, table).toBe(400);
      expect(await res.json()).toMatchObject({ error: "bad_table" });
    }
    await call("/api/restore/cancel", json({ restoreId: v.restoreId }), cookie);
  });
});

// ---- re-review round 1 (S-20, S-21) ----
describe("S-20 malformed input is 4xx, never 500 or junk", () => {
  const att = (over: Record<string, unknown>) => ({ date: "2026-11-03", classId: "c1", rows: [{ studentId: "st1", status: "present" }], ...over });
  it("settings body null / array → 422", async () => {
    const cookie = await login();
    expect((await call("/api/settings", { method: "PUT", body: "null", headers: { "Content-Type": "application/json" } }, cookie)).status).toBe(422);
    expect((await call("/api/settings", { method: "PUT", body: "[1]", headers: { "Content-Type": "application/json" } }, cookie)).status).toBe(422);
  });
  it("attendance: junk date, out-of-range period → 422; unknown subject → 422 (not 500)", async () => {
    const cookie = await login();
    await seed();
    expect((await call("/api/attendance/batch", json(att({ date: "zzzz-not-a-date" })), cookie)).status).toBe(422);
    expect((await call("/api/attendance/batch", json(att({ period: 9999 })), cookie)).status).toBe(422);
    expect((await call("/api/attendance/batch", json(att({ subjectId: "", period: 1 })), cookie)).status).toBe(422);
    const unk = await call("/api/attendance/batch", json(att({ subjectId: "no-such-subject", period: 1 })), cookie);
    expect(unk.status).toBe(422);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM attendance").first<any>()).n).toBe(0);
  });
  it("term: year out of range or a junk date → 422", async () => {
    const cookie = await login();
    expect((await call("/api/terms", json({ year: 99999, term: 1, name: "x" }), cookie)).status).toBe(422);
    expect((await call("/api/terms", json({ year: 2569, term: 1, name: "x", start_date: "junk" }), cookie)).status).toBe(422);
  });
});

describe("S-21 text fields have a maximum length", () => {
  it("student names, class and subject names", async () => {
    const cookie = await login();
    await seed();
    const long = "ก".repeat(1000);
    expect((await call("/api/students", json({ code: "999", first_name: long, last_name: "x", class_id: "c1" }), cookie)).status).toBe(422);
    expect((await call("/api/classes", json({ name: long }), cookie)).status).toBe(422);
    expect((await call("/api/subjects", json({ name: long }), cookie)).status).toBe(422);
  });
});

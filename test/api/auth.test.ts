import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, json, cookieFrom, login, seed } from "./helpers";

// a deployment whose secrets were never set
const noPepper = () => ({ ...env, SESSION_PEPPER: undefined }) as unknown as typeof env;

describe("auth & setup", () => {
  it("health works without auth", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, schema: 5 });
  });

  it("health says whether the database is there and the secrets are set — never their values", async () => {
    const body = (await (await call("/api/health")).json()) as any;
    expect(body).toMatchObject({ ok: true, db: { reachable: true, schema: 5, schemaOk: true }, config: { pepper: true, setupCode: true } });
    expect(JSON.stringify(body)).not.toContain("test-pepper");
    expect(JSON.stringify(body)).not.toContain("test-code");
  });

  it("health is 503 when the pepper was never set, and when the database is on another schema", async () => {
    const noSecret = await callIn(noPepper(), "/api/health");
    expect(noSecret.status).toBe(503);
    expect(await noSecret.json()).toMatchObject({ ok: false, config: { pepper: false } });

    await env.DB.prepare("UPDATE meta SET value='4' WHERE key='schema_version'").run();
    const old = await call("/api/health");
    expect(old.status).toBe(503);
    expect(await old.json()).toMatchObject({ ok: false, db: { schema: 4, schemaOk: false } });
  });

  it("bootstrap requires auth", async () => {
    const res = await call("/api/bootstrap");
    expect(res.status).toBe(401);
  });

  it("setup creates the teacher and can only run once", async () => {
    const cookie = await login();
    expect(cookie).toContain("gk_session=");

    const again = await call(
      "/api/setup",
      json({ setupCode: "test-code", password: "pw123456", deviceId: "d2", deviceName: "x" }),
    );
    expect(again.status).toBe(403);
    expect(await again.json()).toMatchObject({ error: "already_setup" });
  });

  it("login rejects wrong password and rate-limits after 5 tries", async () => {
    await login();
    for (let i = 0; i < 5; i++) {
      const bad = await call(
        "/api/auth/login",
        json({ password: "wrong", deviceId: "d", deviceName: "x" }),
      );
      expect(bad.status).toBe(401);
    }
    const sixth = await call(
      "/api/auth/login",
      json({ password: "wrong", deviceId: "d", deviceName: "x" }),
    );
    expect(sixth.status).toBe(429);
  });

  it("without a pepper, setup is refused (no account is created with a guessable hash) and says how to fix it", async () => {
    const res = await callIn(noPepper(), "/api/setup", json({ setupCode: "test-code", password: "pw123456", deviceId: "d1", deviceName: "x" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "config_missing", message: expect.stringContaining("SESSION_PEPPER") });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM teacher").first<any>()).n).toBe(0);
  });

  it("without a pepper, login and change-password refuse — and a refused login is not counted as a wrong password", async () => {
    const cookie = await login();
    for (let i = 0; i < 7; i++) {
      const r = await callIn(noPepper(), "/api/auth/login", json({ password: "pw123456", deviceId: "d", deviceName: "x" }));
      expect(r.status).toBe(503);
    }
    // 7 refusals must not have locked the teacher out (the rate limit is for wrong passwords)
    const ok = await call("/api/auth/login", json({ password: "pw123456", deviceId: "d", deviceName: "x" }));
    expect(ok.status).toBe(200);
    const change = await callIn(noPepper(), "/api/auth/change-password", json({ current: "pw123456", next: "another1" }), cookie);
    expect(change.status).toBe(503);
  });

  it("the password reset in docs/OPERATIONS.md (delete the teacher, sessions and lockouts) turns setup back on and touches no data", async () => {
    await login();
    await seed();
    for (let i = 0; i < 6; i++) await call("/api/auth/login", json({ password: "wrong", deviceId: "d", deviceName: "x" })); // locked out
    await env.DB.batch([env.DB.prepare("DELETE FROM teacher"), env.DB.prepare("DELETE FROM sessions"), env.DB.prepare("DELETE FROM login_attempts")]);

    expect(await (await call("/api/auth/me")).json()).toMatchObject({ authenticated: false, isSetup: false });
    const res = await call("/api/setup", json({ setupCode: "test-code", password: "brand-new-pw", deviceId: "d9", deviceName: "เครื่องใหม่" }));
    expect(res.status).toBe(200);

    // the new password works, the old one does not, and not a row of the school's data was touched
    expect((await call("/api/auth/login", json({ password: "brand-new-pw", deviceId: "d9", deviceName: "x" }))).status).toBe(200);
    expect((await call("/api/auth/login", json({ password: "pw123456", deviceId: "d9", deviceName: "x" }))).status).toBe(401);
    for (const [table, n] of [["students", 3], ["assignments", 1], ["classes", 2]] as const) {
      expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<any>()).n, table).toBe(n);
    }
  });

  it("correct login yields a working session", async () => {
    await login();
    const res = await call(
      "/api/auth/login",
      json({ password: "pw123456", deviceId: "d3", deviceName: "มือถือ" }),
    );
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    const me = await call("/api/auth/me", {}, cookie);
    expect(await me.json()).toMatchObject({ authenticated: true });
  });
});

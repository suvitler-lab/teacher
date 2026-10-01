import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, json, cookieFrom, login, seed } from "./helpers";

// a deployment whose secrets were never set
const noPepper = () => ({ ...env, SESSION_PEPPER: undefined }) as unknown as typeof env;

describe("auth & setup", () => {
  it("health works without auth", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, schema: 6 });
  });

  it("health says whether the database is there and the secrets are set — never their values", async () => {
    const body = (await (await call("/api/health")).json()) as any;
    expect(body).toMatchObject({ ok: true, db: { reachable: true, schema: 6, schemaOk: true }, config: { pepper: true, setupCode: true } });
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
      json({ setupCode: "test-code", email: "teacher@example.com", password: "pw123456", deviceId: "d2", deviceName: "x" }),
    );
    expect(again.status).toBe(403);
    expect(await again.json()).toMatchObject({ error: "already_setup" });
  });

  it("login rejects wrong password and rate-limits after 5 tries", async () => {
    await login();
    for (let i = 0; i < 5; i++) {
      const bad = await call(
        "/api/auth/login",
        json({ email: "teacher@example.com", password: "wrong", deviceId: "d", deviceName: "x" }),
      );
      expect(bad.status).toBe(401);
    }
    const sixth = await call(
      "/api/auth/login",
      json({ email: "teacher@example.com", password: "wrong", deviceId: "d", deviceName: "x" }),
    );
    expect(sixth.status).toBe(429);
  });

  it("without a pepper, setup is refused (no account is created with a guessable hash) and says how to fix it", async () => {
    const res = await callIn(noPepper(), "/api/setup", json({ setupCode: "test-code", email: "teacher@example.com", password: "pw123456", deviceId: "d1", deviceName: "x" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "config_missing", message: expect.stringContaining("SESSION_PEPPER") });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM teacher").first<any>()).n).toBe(0);
  });

  it("without a pepper, login and change-password refuse — and a refused login is not counted as a wrong password", async () => {
    const cookie = await login();
    for (let i = 0; i < 7; i++) {
      const r = await callIn(noPepper(), "/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "d", deviceName: "x" }));
      expect(r.status).toBe(503);
    }
    // 7 refusals must not have locked the teacher out (the rate limit is for wrong passwords)
    const ok = await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "d", deviceName: "x" }));
    expect(ok.status).toBe(200);
    const change = await callIn(noPepper(), "/api/auth/change-password", json({ current: "pw123456", next: "another1" }), cookie);
    expect(change.status).toBe(503);
  });

  it("the password reset in docs/OPERATIONS.md (delete the teacher, sessions and lockouts) turns setup back on and touches no data", async () => {
    await login();
    await seed();
    for (let i = 0; i < 6; i++) await call("/api/auth/login", json({ email: "teacher@example.com", password: "wrong", deviceId: "d", deviceName: "x" })); // locked out
    await env.DB.batch([env.DB.prepare("DELETE FROM teacher"), env.DB.prepare("DELETE FROM sessions"), env.DB.prepare("DELETE FROM login_attempts")]);

    expect(await (await call("/api/auth/me")).json()).toMatchObject({ authenticated: false, isSetup: false });
    const res = await call("/api/setup", json({ setupCode: "test-code", email: "teacher@example.com", password: "brand-new-pw", deviceId: "d9", deviceName: "เครื่องใหม่" }));
    expect(res.status).toBe(200);

    // the new password works, the old one does not, and not a row of the school's data was touched
    expect((await call("/api/auth/login", json({ email: "teacher@example.com", password: "brand-new-pw", deviceId: "d9", deviceName: "x" }))).status).toBe(200);
    expect((await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "d9", deviceName: "x" }))).status).toBe(401);
    for (const [table, n] of [["students", 3], ["assignments", 1], ["classes", 2]] as const) {
      expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<any>()).n, table).toBe(n);
    }
  });

  it("correct login yields a working session", async () => {
    await login();
    const res = await call(
      "/api/auth/login",
      json({ email: "teacher@example.com", password: "pw123456", deviceId: "d3", deviceName: "มือถือ" }),
    );
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    const me = await call("/api/auth/me", {}, cookie);
    expect(await me.json()).toMatchObject({ authenticated: true });
  });

  it("sign-in needs the e-mail as well as the password, in any letter case, and says which is wrong only in one way", async () => {
    await login();
    const ok = await call("/api/auth/login", json({ email: "  Teacher@Example.COM ", password: "pw123456", deviceId: "d4" }));
    expect(ok.status).toBe(200);

    const wrongMail = await call("/api/auth/login", json({ email: "other@example.com", password: "pw123456", deviceId: "d5" }));
    const wrongPw = await call("/api/auth/login", json({ email: "teacher@example.com", password: "nope-nope", deviceId: "d5" }));
    expect(wrongMail.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    expect(await wrongMail.json()).toEqual(await wrongPw.json());

    const notMail = await call("/api/auth/login", json({ email: "teacher", password: "pw123456", deviceId: "d5" }));
    expect(notMail.status).toBe(422);
  });

  it("wrong e-mails count towards the lockout too", async () => {
    await login();
    for (let i = 0; i < 5; i++) {
      expect((await call("/api/auth/login", json({ email: "guess@example.com", password: "pw123456", deviceId: "d" }))).status).toBe(401);
    }
    expect((await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "d" }))).status).toBe(429);
  });

  it("an account made before e-mail sign-in gets its e-mail from the first sign-in with the right password", async () => {
    await login();
    await env.DB.prepare("UPDATE teacher SET email = NULL").run();
    expect(await (await call("/api/auth/me")).json()).toMatchObject({ isSetup: true, emailSet: false });

    const wrong = await call("/api/auth/login", json({ email: "me@school.ac.th", password: "wrong-one", deviceId: "d6" }));
    expect(wrong.status).toBe(401);
    expect((await env.DB.prepare("SELECT email FROM teacher").first<any>()).email).toBeNull(); // a wrong password attaches nothing

    expect((await call("/api/auth/login", json({ email: "Me@School.ac.th", password: "pw123456", deviceId: "d6" }))).status).toBe(200);
    expect((await env.DB.prepare("SELECT email FROM teacher").first<any>()).email).toBe("me@school.ac.th");
    expect(await (await call("/api/auth/me")).json()).toMatchObject({ emailSet: true });
    // and from now on that e-mail is the only one that works
    expect((await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "d7" }))).status).toBe(401);
  });

  it("a device that was not named gets a readable name from its browser", async () => {
    await login();
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
    const res = await call("/api/auth/login", { ...json({ email: "teacher@example.com", password: "pw123456", deviceId: "d8" }), headers: { "Content-Type": "application/json", "User-Agent": ua } });
    expect(res.status).toBe(200);
    expect((await env.DB.prepare("SELECT name FROM devices WHERE id = 'd8'").first<any>()).name).toBe("Chrome · Windows");
  });

  it("first-run guide: an empty school can be set up end to end, and 'onboarding_done' is remembered", async () => {
    const cookie = await login();
    const boot0 = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    expect(boot0.settings.onboarding_done).toBe(false);
    expect(boot0.terms).toHaveLength(0);

    expect((await call("/api/settings", { method: "PUT", body: JSON.stringify({ school_name: "รร.ทดสอบ", teacher_name: "ครูใจดี" }) }, cookie)).status).toBe(200);
    const start = await call("/api/terms/start", json({ expectedCurrentTermId: null, year: 2569, term: 1, name: "1/2569", start_date: "2026-05-15" }), cookie);
    expect(start.status).toBe(200);
    expect((await call("/api/classes", json({ name: "ป.6/1", grade: "ป.6", sort: 1 }), cookie)).status).toBe(200);
    expect((await call("/api/subjects", json({ name: "คณิตศาสตร์", color: "blue", sort: 1 }), cookie)).status).toBe(200);
    expect((await call("/api/settings", { method: "PUT", body: JSON.stringify({ onboarding_done: true }) }, cookie)).status).toBe(200);

    const boot = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    expect(boot.settings).toMatchObject({ school_name: "รร.ทดสอบ", teacher_name: "ครูใจดี", onboarding_done: true });
    expect(boot.terms).toHaveLength(1);
    expect(boot.terms[0]).toMatchObject({ name: "1/2569", is_current: true });
    expect(boot.classes.map((c: any) => c.name)).toEqual(["ป.6/1"]);
    expect(boot.classes[0].year).toBe(2569); // filed under the year the guide just opened
    expect(boot.subjects.map((c: any) => c.name)).toEqual(["คณิตศาสตร์"]);
  });

  it("a wrong current password on change-password is 403 (not 401), and the session stays valid", async () => {
    const cookie = await login();
    const res = await call("/api/auth/change-password", json({ current: "nope-nope", next: "another1" }), cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "wrong_password" });
    expect((await call("/api/bootstrap", {}, cookie)).status).toBe(200);
  });
});

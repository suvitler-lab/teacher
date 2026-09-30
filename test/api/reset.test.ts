import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

const count = async (t: string) => (await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first<{ n: number }>())!.n;
const reset = (cookie: string, body: Record<string, unknown>) => call("/api/admin/reset", json(body), cookie);

describe("start over", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("needs the password and the confirmation words, and changes nothing without them", async () => {
    const noWords = await reset(cookie, { mode: "data", password: "pw123456", confirm: "ok" });
    expect(noWords.status).toBe(400);
    const badPw = await reset(cookie, { mode: "data", password: "wrong", confirm: "ล้างข้อมูล" });
    expect(badPw.status).toBe(401);
    expect(await count("students")).toBe(3);
    expect((await call("/api/admin/reset", json({ mode: "data", password: "pw123456", confirm: "ล้างข้อมูล" }))).status).toBe(401); // not signed in
  });

  it("'data' clears classes, children and work but keeps the account, and brings the welcome guide back", async () => {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('onboarding_done','1')").run();
    const res = await reset(cookie, { mode: "data", password: "pw123456", confirm: "ล้างข้อมูล" });
    expect(res.status).toBe(200);
    for (const t of ["students", "classes", "terms", "subjects", "assignments", "assignment_classes"]) expect(await count(t)).toBe(0);
    expect(await count("teacher")).toBe(1);
    expect(await count("work_types")).toBe(8);
    const boot = await call("/api/bootstrap", {}, cookie);
    expect(boot.status).toBe(200); // still signed in
    expect(((await boot.json()) as any).settings.onboarding_done).toBe(false);
  });

  it("bumps the data epoch so work queued on other devices is held, not applied", async () => {
    const before = Number((await env.DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first<{ value: string }>())!.value);
    await reset(cookie, { mode: "data", password: "pw123456", confirm: "ล้างข้อมูล" });
    const after = Number((await env.DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first<{ value: string }>())!.value);
    expect(after).toBe(before + 1);
  });

  it("'all' also removes the account, so the first-run screen is back and a new teacher can set up", async () => {
    const res = await reset(cookie, { mode: "all", password: "pw123456", confirm: "ล้างทั้งหมด" });
    expect(res.status).toBe(200);
    expect(await count("teacher")).toBe(0);
    expect(await count("sessions")).toBe(0);
    expect(await count("work_types")).toBe(8);
    expect((await call("/api/bootstrap", {}, cookie)).status).toBe(401);
    const me = (await (await call("/api/auth/me")).json()) as any;
    expect(me.isSetup).toBe(false);
    expect((await call("/api/setup", json({ setupCode: "test-code", email: "new@example.com", password: "another1", deviceId: "d2" }))).status).toBe(200);
  });

  it("wrong passwords are rate-limited", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await reset(cookie, { mode: "data", password: "nope", confirm: "ล้างข้อมูล" })).status;
    expect(last).toBe(429);
    expect(await count("students")).toBe(3);
  });
});

describe("setup code guessing", () => {
  it("is limited after repeated wrong codes", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call("/api/setup", json({ setupCode: "guess" + i, email: "a@b.co", password: "abcdef", deviceId: "d" }))).status;
    expect(last).toBe(429);
  });
});

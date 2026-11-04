import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, json, cookieFrom, login } from "./helpers";

// Security review 2026-11-03: S-01 (login brute force), S-02 (sessions after a password change),
// S-03 (change-password guessing), S-06/setup + reset sharing the same atomic rate limit.

const EMAIL = "teacher@example.com";
const fromIp = (ip: string, init: RequestInit): RequestInit => ({ ...init, headers: { ...(init.headers as any), "CF-Connecting-IP": ip } });
const wrongLogin = (ip: string, deviceId = "dev_attacker", email = EMAIL) =>
  call("/api/auth/login", fromIp(ip, json({ email, password: "wrong-guess", deviceId, deviceName: "x" })));
const statuses = (rs: Response[]) => rs.map((r) => r.status);
const countOf = (xs: number[], s: number) => xs.filter((x) => x === s).length;

describe("S-01 login rate limit", () => {
  it("30 wrong passwords sent at once from one address: at most 5 are checked, the rest are 429", async () => {
    await login();
    const rs = statuses(await Promise.all(Array.from({ length: 30 }, () => wrongLogin("203.0.113.7"))));
    expect(countOf(rs, 401)).toBeLessThanOrEqual(5);
    expect(countOf(rs, 401)).toBeGreaterThan(0);
    expect(countOf(rs, 429)).toBe(30 - countOf(rs, 401));
    // the budget is spent: the right password from that address is refused too, until the window passes
    const right = await call("/api/auth/login", fromIp("203.0.113.7", json({ email: EMAIL, password: "pw123456", deviceId: "dev_x" })));
    expect(right.status).toBe(429);
  });

  it("an IPv6 /64 is ONE budget: rotating addresses inside it does not buy more guesses", async () => {
    await login();
    const net = ["2001:db8:1:2::1", "2001:db8:1:2::2", "2001:db8:1:2:aaaa::3", "2001:0DB8:0001:0002:ffff:ffff:ffff:ffff"];
    const rs: number[] = [];
    for (const ip of net) for (let i = 0; i < 5; i++) rs.push((await wrongLogin(ip)).status);
    expect(countOf(rs, 401)).toBe(5);
    expect(countOf(rs, 429)).toBe(15);
    // a different /64 is someone else
    expect((await wrongLogin("2001:db8:1:3::1")).status).toBe(401);
  });

  it("the account has its own budget across addresses; the teacher's known device still gets in", async () => {
    await login(); // registers dev_test
    const rs: number[] = [];
    for (let n = 1; n <= 7; n++) for (let i = 0; i < 5; i++) rs.push((await wrongLogin(`198.51.100.${n}`)).status);
    expect(countOf(rs, 401)).toBe(30);
    // a fresh address with an unknown device: the account budget is spent
    expect((await wrongLogin("198.51.100.99")).status).toBe(429);
    const stranger = await call("/api/auth/login", fromIp("198.51.100.98", json({ email: EMAIL, password: "pw123456", deviceId: "dev_new" })));
    expect(stranger.status).toBe(429);
    // a device that has signed in before is not locked out by someone else's guessing
    const known = await call("/api/auth/login", fromIp("198.51.100.97", json({ email: EMAIL, password: "pw123456", deviceId: "dev_test" })));
    expect(known.status).toBe(200);
  });

  it("a right password clears the address's count; a refused-by-limit try leaves no row behind", async () => {
    await login();
    for (let i = 0; i < 4; i++) expect((await wrongLogin("192.0.2.1")).status).toBe(401);
    expect((await call("/api/auth/login", fromIp("192.0.2.1", json({ email: EMAIL, password: "pw123456", deviceId: "dev_test" })))).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await wrongLogin("192.0.2.1")).status).toBe(401);
    expect((await wrongLogin("192.0.2.1")).status).toBe(429);
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE key LIKE 'login:ip:%'").first<any>()).n;
    expect(n).toBe(5); // the 429 did not add a row (the lock is not extended by retrying)
  });
});

describe("S-02 a password change signs every OTHER device out", () => {
  it("device B gets 401 after device A changes the password; A stays signed in", async () => {
    const a = await login();
    const b = cookieFrom(await call("/api/auth/login", json({ email: EMAIL, password: "pw123456", deviceId: "dev_b", deviceName: "มือถือ" })));
    expect((await call("/api/bootstrap", {}, b)).status).toBe(200);
    const res = await call("/api/auth/change-password", json({ current: "pw123456", next: "brand-new-77" }), a);
    expect(res.status).toBe(200);
    expect((await call("/api/bootstrap", {}, b)).status).toBe(401);
    expect((await call("/api/bootstrap", {}, a)).status).toBe(200);
    const rows = (await env.DB.prepare("SELECT device_id FROM sessions").all<any>()).results;
    expect(rows.map((r: any) => r.device_id)).toEqual(["dev_test"]);
  });

  it("a wrong current password signs nobody out", async () => {
    const a = await login();
    const b = cookieFrom(await call("/api/auth/login", json({ email: EMAIL, password: "pw123456", deviceId: "dev_b" })));
    expect((await call("/api/auth/change-password", json({ current: "nope-nope", next: "brand-new-77" }), a)).status).toBe(403);
    expect((await call("/api/bootstrap", {}, b)).status).toBe(200);
  });
});

describe("login 429 says how long to wait", () => {
  it("Retry-After header and body.retryAfter agree, within [1, 900] for the address budget; absent on 200 and 401", async () => {
    await login();
    for (let i = 0; i < 5; i++) {
      const r = await wrongLogin("203.0.113.50");
      expect(r.status).toBe(401);
      expect(r.headers.get("Retry-After")).toBeNull();
      expect((await r.json()) as any).not.toHaveProperty("retryAfter");
    }
    const limited = await wrongLogin("203.0.113.50");
    expect(limited.status).toBe(429);
    const header = Number(limited.headers.get("Retry-After"));
    const body = (await limited.json()) as any;
    expect(body).toMatchObject({ error: "rate_limited", message: "ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่" });
    expect(Number.isInteger(header)).toBe(true);
    expect(header).toBeGreaterThanOrEqual(1);
    expect(header).toBeLessThanOrEqual(900);
    expect(body.retryAfter).toBe(header);
    const ok = await call("/api/auth/login", fromIp("203.0.113.51", json({ email: EMAIL, password: "pw123456", deviceId: "dev_test" })));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Retry-After")).toBeNull();
  });

  it("an older lock-out reopens sooner: the wait follows the stored window start", async () => {
    await login();
    const old = Date.now() - 14 * 60 * 1000; // 14 min ago: 1 min of the 15 left
    for (let i = 0; i < 5; i++) await env.DB.prepare("INSERT INTO login_attempts (key, at) VALUES (?, ?)").bind("login:ip:203.0.113.60", old).run();
    const r = await wrongLogin("203.0.113.60");
    expect(r.status).toBe(429);
    const wait = Number(r.headers.get("Retry-After"));
    expect(wait).toBeGreaterThanOrEqual(55);
    expect(wait).toBeLessThanOrEqual(61);
  });

  it("the account/device hour budget gives a wait up to 3600, and the reply does not say which budget", async () => {
    await login();
    for (let n = 1; n <= 7; n++) for (let i = 0; i < 5; i++) await wrongLogin(`198.51.100.${n}`);
    const r = await wrongLogin("198.51.100.99");
    expect(r.status).toBe(429);
    const wait = Number(r.headers.get("Retry-After"));
    expect(wait).toBeGreaterThan(900);
    expect(wait).toBeLessThanOrEqual(3600);
    expect(JSON.stringify(await r.json())).not.toMatch(/acct|login:|ip|email|device/i);
  });
});

describe("S-03 change-password is rate limited", () => {
  it("5 wrong current passwords, then 429 — even with the right one", async () => {
    const a = await login();
    for (let i = 0; i < 5; i++) {
      expect((await call("/api/auth/change-password", json({ current: "guess-" + i, next: "brand-new-77" }), a)).status).toBe(403);
    }
    const sixth = await call("/api/auth/change-password", json({ current: "pw123456", next: "brand-new-77" }), a);
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ error: "rate_limited" });
  });

  it("12 guesses at once: at most 5 are checked", async () => {
    const a = await login();
    const rs = statuses(await Promise.all(Array.from({ length: 12 }, (_, i) =>
      call("/api/auth/change-password", json({ current: "guess-" + i, next: "brand-new-77" }), a))));
    expect(countOf(rs, 403)).toBeLessThanOrEqual(5);
    expect(countOf(rs, 429)).toBe(12 - countOf(rs, 403));
  });

  it("a successful change clears the count", async () => {
    const a = await login();
    for (let i = 0; i < 4; i++) await call("/api/auth/change-password", json({ current: "guess", next: "brand-new-77" }), a);
    expect((await call("/api/auth/change-password", json({ current: "pw123456", next: "brand-new-77" }), a)).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await call("/api/auth/change-password", json({ current: "guess", next: "x-brand-new-88" }), a)).status).toBe(403);
  });
});

describe("setup code and reset share the atomic limit", () => {
  it("30 wrong setup codes at once: at most 5 are checked", async () => {
    const rs = statuses(await Promise.all(Array.from({ length: 30 }, (_, i) =>
      call("/api/setup", json({ setupCode: "wrong-" + i, email: EMAIL, password: "pw123456", deviceId: "d1" }))))).filter((s) => s !== 429);
    expect(rs.length).toBeLessThanOrEqual(5);
    expect(rs.every((s) => s === 403)).toBe(true);
  });

  it("a setup code of another length is refused the same way", async () => {
    const res = await call("/api/setup", json({ setupCode: "x", email: EMAIL, password: "pw123456", deviceId: "d1" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "bad_setup_code" });
    expect((await call("/api/setup", json({ setupCode: "test-code", email: EMAIL, password: "pw123456", deviceId: "d1" }))).status).toBe(200);
  });

  it("30 wrong reset passwords at once: at most 5 are checked", async () => {
    const a = await login();
    const rs = statuses(await Promise.all(Array.from({ length: 30 }, () =>
      call("/api/admin/reset", json({ mode: "data", confirm: "ล้างข้อมูล", password: "wrong" }), a))));
    expect(countOf(rs, 403)).toBeLessThanOrEqual(5);
    expect(countOf(rs, 429) + countOf(rs, 403)).toBe(30);
  });
});

// ---- re-review round 1 (S-15, S-18, S-22) ----

describe("S-15 a known device has its own budget; a signed-out device is not known", () => {
  it("P8: guessing with the teacher's device id from many addresses stops at the device budget", async () => {
    await login(); // dev_test
    const rs: number[] = [];
    for (let n = 1; n <= 10; n++) for (let i = 0; i < 5; i++) rs.push((await wrongLogin(`198.51.100.${n}`, "dev_test")).status);
    expect(countOf(rs, 401)).toBe(10);
    expect(countOf(rs, 429)).toBe(40);
  });

  it("P9: a phone signed out (and the password changed) is a stranger again — the account budget applies", async () => {
    const a = await login();
    await call("/api/auth/login", json({ email: EMAIL, password: "pw123456", deviceId: "dev_phone" }));
    expect((await call("/api/devices/dev_phone/signout", json({}), a)).status).toBe(200);
    expect((await env.DB.prepare("SELECT revoked FROM devices WHERE id = 'dev_phone'").first<any>()).revoked).toBe(1);
    const rs: number[] = [];
    for (let n = 1; n <= 8; n++) for (let i = 0; i < 5; i++) rs.push((await wrongLogin(`203.0.113.${n}`, "dev_phone")).status);
    expect(countOf(rs, 429)).toBeGreaterThan(0);
    expect(countOf(rs, 401)).toBeLessThanOrEqual(30);
  });

  it("changing the password revokes every other device; signing in again un-revokes it", async () => {
    const a = await login();
    await call("/api/auth/login", json({ email: EMAIL, password: "pw123456", deviceId: "dev_b" }));
    expect((await call("/api/auth/change-password", json({ current: "pw123456", next: "brand-new-77" }), a)).status).toBe(200);
    const rev = async (id: string) => (await env.DB.prepare("SELECT revoked FROM devices WHERE id = ?").bind(id).first<any>()).revoked;
    expect(await rev("dev_b")).toBe(1);
    expect(await rev("dev_test")).toBe(0);
    expect((await call("/api/auth/login", json({ email: EMAIL, password: "brand-new-77", deviceId: "dev_b" }))).status).toBe(200);
    expect(await rev("dev_b")).toBe(0);
  });
});

describe("S-18 a refused (429) try writes nothing", () => {
  it("no INSERT/DELETE/UPDATE once the budget is spent", async () => {
    await login();
    for (let i = 0; i < 5; i++) await wrongLogin("192.0.2.50");
    const seen: string[] = [];
    const spy = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "prepare") return (sql: string) => { seen.push(sql); return target.prepare(sql); };
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const res = await callIn({ ...env, DB: spy } as typeof env, "/api/auth/login", fromIp("192.0.2.50", json({ email: EMAIL, password: "x", deviceId: "dev_z" })));
    expect(res.status).toBe(429);
    expect(seen.filter((s) => /^\s*(INSERT|DELETE|UPDATE)/i.test(s))).toEqual([]);
  });
});

describe("S-22 an account without an e-mail has ONE account budget", () => {
  it("changing the typed e-mail does not buy fresh budgets", async () => {
    await login();
    await env.DB.prepare("UPDATE teacher SET email = NULL").run();
    const rs: number[] = [];
    for (let n = 1; n <= 7; n++) for (let i = 0; i < 5; i++) rs.push((await wrongLogin(`198.51.100.${n}`, "dev_x", `x${n}-${i}@example.com`)).status);
    expect(countOf(rs, 401)).toBe(30);
    expect(countOf(rs, 429)).toBe(5);
  });
});

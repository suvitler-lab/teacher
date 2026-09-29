import { describe, it, expect } from "vitest";
import { call, json, cookieFrom, login } from "./helpers";

describe("auth & setup", () => {
  it("health works without auth", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, schema: 5 });
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

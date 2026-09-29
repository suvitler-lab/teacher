import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, login, seed } from "./helpers";

describe("QR token rotation", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
  });

  it("rotating a student's QR revokes the old token and issues a new one", async () => {
    const before = await env.DB.prepare("SELECT qr_token FROM students WHERE id='st1'").first<any>();
    const res = await call("/api/students/st1/qr/rotate", { method: "POST" }, cookie);
    const body = (await res.json()) as any;
    expect(body.qr_token).toMatch(/^Q-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(body.qr_token).not.toBe(before.qr_token);

    const revoked = await env.DB.prepare("SELECT * FROM revoked_qr_tokens WHERE token=?").bind(before.qr_token).first();
    expect(revoked).toBeTruthy();

    const audit = await env.DB.prepare("SELECT * FROM audit_logs WHERE entity='qr' AND action='rotate' AND student_id='st1'").first();
    expect(audit).toBeTruthy();
  });

  it("class rotate re-issues tokens for every active student", async () => {
    const res = await call("/api/classes/c1/qr/rotate", { method: "POST" }, cookie);
    const body = (await res.json()) as any;
    expect(body.rotated).toBe(2);
  });

  it("bootstrap exposes revoked tokens so a scan can warn", async () => {
    const before = await env.DB.prepare("SELECT qr_token FROM students WHERE id='st1'").first<any>();
    await call("/api/students/st1/qr/rotate", { method: "POST" }, cookie);
    const boot = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    expect(boot.revokedTokens[before.qr_token]).toBe("st1");
  });
});

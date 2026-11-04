import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, login, seed } from "./helpers";

// ui-redesign round 2: the scan, attendance and random-name pages each keep their card layout in one setting,
// the same way the home page does (home_cards), so every device of the one teacher shows the same page.
const KEYS = ["scan_cards", "attendance_cards", "random_cards", "gradebook_cards", "reports_cards", "students_cards", "settings_cards"] as const;

describe("page card settings", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login(); await seed();
    for (const k of KEYS) await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(k).run(); // reset() keeps the settings table
  });

  it("each key defaults to an empty string (the page then uses its default cards)", async () => {
    const boot = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    for (const k of KEYS) expect(boot.settings[k]).toBe("");
  });

  it("each key is saved by PUT /api/settings and comes back in the bootstrap", async () => {
    const body: Record<string, string> = {};
    for (const k of KEYS) body[k] = JSON.stringify({ v: 1, order: ["a", "b"], hidden: ["b"], page: k });
    const res = await call("/api/settings", { method: "PUT", body: JSON.stringify({ ...body, not_a_setting: "x" }), headers: { "Content-Type": "application/json" } }, cookie);
    expect(res.status).toBe(200);
    const boot = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    for (const k of KEYS) expect(boot.settings[k]).toBe(body[k]);
    expect(boot.settings.not_a_setting).toBeUndefined();
  });
});

// QA-final A (B-A2): the students endpoints trim text fields, refuse whitespace-only names and a class number
// below 1 or not whole — with a Thai message, in the usual 422 { error: "validation" } shape.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

const body = (over: Record<string, unknown> = {}) => ({ code: "S001", prefix: "ด.ช.", first_name: "สมชาย", last_name: "ใจดี", class_id: "c1", number: 20, ...over });

describe("student validation", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });
  const add = (over: Record<string, unknown>) => call("/api/students", json(body(over)), cookie);
  const count = async (code: string) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE code = ?").bind(code).first<any>()).n as number;

  it("trims name and code before saving", async () => {
    const res = await add({ code: "  S001  ", first_name: "  สมชาย ", last_name: " ใจดี  " });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT code, first_name, last_name FROM students WHERE code = 'S001'").first<any>();
    expect(row).toEqual({ code: "S001", first_name: "สมชาย", last_name: "ใจดี" });
    // the padded code is the same code, not a second student
    expect((await add({ id: undefined, code: "S001 " })).status).toBe(409);
  });

  it("rejects whitespace-only name, last name and code with a Thai message (422 validation)", async () => {
    for (const [over, msg] of [[{ first_name: "   " }, "กรอกชื่อ"], [{ last_name: "\t " }, "กรอกสกุล"], [{ code: "  " }, "กรอกรหัสนักเรียน"]] as const) {
      const res = await add(over);
      expect(res.status).toBe(422);
      const b = (await res.json()) as any;
      expect(b.error).toBe("validation");
      expect(b.message).toBe(msg);
      expect(Array.isArray(b.issues)).toBe(true);
    }
    expect(await count("S001")).toBe(0);
  });

  it("rejects a class number below 1 or not whole, but still takes an ordinary number and null", async () => {
    for (const n of [0, -5, 2.5]) {
      const res = await add({ code: "N" + String(n).replace(/\W/g, "_") + "x", number: n });
      expect(res.status).toBe(422);
      const b = (await res.json()) as any;
      expect(b.error).toBe("validation");
      expect(b.message).toMatch(/เลขที่.*จำนวนเต็ม/);
    }
    expect((await add({ code: "S101", number: 51 })).status).toBe(200);
    expect((await add({ code: "S102", number: null })).status).toBe(200);
    expect((await add({ code: "S103", number: undefined })).status).toBe(200);
  });

  it("an unrelated validation failure still carries a Thai message, never a bare code", async () => {
    const res = await add({ status: "nonsense" });
    expect(res.status).toBe(422);
    const b = (await res.json()) as any;
    expect(b.error).toBe("validation");
    expect(b.message).toMatch(/[ก-๙]/);
  });

  it("the import trims codes/names and refuses a bad class number or a blank name, writing nothing", async () => {
    const imp = (students: unknown[], path = "/api/students/import") => call(path, json({ class_id: "c1", students }), cookie);
    const ok = await imp([{ code: " S201 ", first_name: " เอ ", last_name: " บี ", number: 30 }]);
    expect(ok.status).toBe(200);
    expect(await env.DB.prepare("SELECT code, first_name, last_name FROM students WHERE code = 'S201'").first<any>()).toEqual({ code: "S201", first_name: "เอ", last_name: "บี" });

    for (const path of ["/api/students/import", "/api/students/import/preview"]) {
      for (const [row, msg] of [[{ code: "S202", first_name: "  ", number: 31 }, "กรอกชื่อ"], [{ code: "S203", first_name: "ซี", number: -1 }, null], [{ code: "S204", first_name: "ดี", number: 1.5 }, null]] as const) {
        const res = await imp([row], path);
        expect(res.status).toBe(422);
        const b = (await res.json()) as any;
        expect(b.error).toBe("validation");
        expect(b.message).toBe(msg ?? "เลขที่ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
      }
    }
    expect(await count("S202")).toBe(0);
    expect(await count("S203")).toBe(0);
  });
});

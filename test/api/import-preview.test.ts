import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

const row = (code: string, first: string, last: string, number: number | null, prefix = "ด.ช.") => ({ code, prefix, first_name: first, last_name: last, number });
const preview = (cookie: string, students: unknown[], class_id = "c1") =>
  call("/api/students/import/preview", json({ class_id, students }), cookie);

describe("import preview (dry run)", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("classifies every row: new / changed / unchanged / moved / reactivated — and writes nothing", async () => {
    await env.DB.prepare("UPDATE students SET status = 'moved', class_id = 'c1' WHERE id = 'st2'").run(); // was in c1, has left
    const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM students").first<any>()).n;

    const res = await preview(cookie, [
      row("101", "ก", "ข", 1),          // exactly as it is → same
      row("102", "ค", "ง", 2, "ด.ญ."),  // st2 is 'moved' → reactivate
      row("201", "จ", "ฉ", 3),          // st9 sits in c2 → move
      row("999", "ใหม่", "ล้วน", 4),    // not known → create
    ]);
    const body = (await res.json()) as any;

    expect(body.rows.map((r: any) => r.action)).toEqual(["same", "reactivate", "move", "create"]);
    expect(body.rows[2].from.class_id).toBe("c2");
    expect(body.summary).toEqual({ create: 1, update: 0, same: 1, move: 1, reactivate: 1 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM students").first<any>()).n).toBe(before); // nothing written

    const changed = (await (await preview(cookie, [row("101", "ก", "แก้ไขนามสกุล", 1)])).json()) as any;
    expect(changed.rows[0].action).toBe("update");
  });

  it("a moved student who is also in another class is both a move and a reactivation", async () => {
    await env.DB.prepare("UPDATE students SET status = 'inactive' WHERE id = 'st9'").run();
    const body = (await (await preview(cookie, [row("201", "จ", "ฉ", 1)])).json()) as any;
    expect(body.rows[0]).toMatchObject({ action: "move", reactivates: true });
  });

  it("warns about repeated codes and numbers, and about numbers held by someone outside the paste", async () => {
    const body = (await (await preview(cookie, [
      row("555", "เอ", "หนึ่ง", 5),
      row("555", "เอ", "สอง", 6),           // same code twice
      row("556", "บี", "สาม", 7),
      row("557", "ซี", "สี่", 7),           // same number twice
      row("558", "ดี", "ห้า", 2),           // number 2 belongs to st2, who is NOT in this paste
    ])).json()) as any;
    expect(body.dupCodes).toEqual(["555"]);
    expect(body.dupNumbers).toEqual([7]);
    expect(body.numberClashes).toEqual([{ number: 2, code: "102", name: "ค ง" }]);
  });

  it("the import itself refuses repeated codes with a clear 422, instead of a 500", async () => {
    const res = await call("/api/students/import", json({ class_id: "c1", students: [row("555", "เอ", "หนึ่ง", 5), row("555", "เอ", "สอง", 6)] }), cookie);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "duplicate_codes", codes: ["555"] });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE code = '555'").first<any>()).n).toBe(0);
  });

  it("does what the preview said: the move and the reactivation really happen", async () => {
    await env.DB.prepare("UPDATE students SET status = 'moved' WHERE id = 'st2'").run();
    const res = await call("/api/students/import", json({ class_id: "c1", students: [row("102", "ค", "ง", 2), row("201", "จ", "ฉ", 3)] }), cookie);
    expect(res.status).toBe(200);
    const st2 = await env.DB.prepare("SELECT status, class_id FROM students WHERE id = 'st2'").first<any>();
    const st9 = await env.DB.prepare("SELECT status, class_id FROM students WHERE id = 'st9'").first<any>();
    expect(st2).toMatchObject({ status: "active", class_id: "c1" });
    expect(st9).toMatchObject({ status: "active", class_id: "c1" }); // moved out of c2
  });
});

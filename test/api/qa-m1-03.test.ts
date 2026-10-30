// QA black-box tests for M1-03 (guards inside the write's transaction): multi-device on EXISTING children,
// moved->active, year change on edit, duplicates inside a paste, plain duplicate codes, normal paths.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

const one = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<any>();
const count = async (sql: string, ...b: unknown[]) => (await one(sql, ...b)).n as number;
const snap = async () => ({
  students: (await env.DB.prepare("SELECT * FROM students ORDER BY id").all()).results,
  assignments: (await env.DB.prepare("SELECT * FROM assignments ORDER BY id").all()).results,
  ac: (await env.DB.prepare("SELECT * FROM assignment_classes ORDER BY assignment_id, class_id").all()).results,
  audit: await count("SELECT COUNT(*) AS n FROM audit_logs"),
});
const edit = (id: string, code: string, first: string, number: number, extra: object = {}) =>
  json({ id, code, first_name: first, last_name: "ทดสอบ", class_id: "c1", number, ...extra });

describe("QA M1-03", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("TC-A multi-device: two EXISTING children edited onto one free number at once -> 1 ok, 1 x 409 number_taken", async () => {
    const g = gateBatch();
    const first = callIn(g.env, "/api/students", edit("st1", "101", "หนึ่ง😀", 7), cookie);
    await g.ready;
    expect((await call("/api/students", edit("st2", "102", "สอง", 7), cookie)).status).toBe(200);
    const before = await snap();
    g.release();
    const res = await first;
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("number_taken");
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE class_id='c1' AND number=7 AND status='active'")).toBe(1);
    expect(await one("SELECT number, first_name FROM students WHERE id='st1'")).toEqual({ number: 1, first_name: "ก" });
    expect(await snap()).toEqual(before); // loser changed nothing, wrote no audit
  });

  it("TC-B moved child brought back to active onto a number someone else holds -> 409, stays moved (plain and raced)", async () => {
    await env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st3','103','Q-DDDDDDDDDD','ช','ซ','c1',1,'moved','2569-10-01',0)").run();
    const before = await snap();
    const res = await call("/api/students", edit("st3", "103", "ช", 1, { status: "active" }), cookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("number_taken");
    expect(await snap()).toEqual(before);
    const g = gateBatch();
    const back = callIn(g.env, "/api/students", edit("st3", "103", "ช", 9, { status: "active" }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE students SET number = 9 WHERE id = 'st2'").run();
    const mid = await snap();
    g.release();
    expect((await back).status).toBe(409);
    expect(await snap()).toEqual(mid);
    expect((await one("SELECT status FROM students WHERE id='st3'")).status).toBe("moved");
  });

  it("TC-B2 a non-active child may take a number an active child holds (guard only for active)", async () => {
    expect((await call("/api/students", edit("st2", "102", "ค", 1, { status: "inactive" }), cookie)).status).toBe(200);
  });

  it("TC-C moving existing work to a term of another year while its class is old-year -> 422, nothing changes", async () => {
    await env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('t2',2570,1,'1/2570',0,0)").run();
    const before = await snap();
    const res = await call("/api/assignments", json({ id: "a1", term_id: "t2", subject_id: "s1", type_id: "wt_worksheet", title: "ย้าย", full_score: 10, class_ids: ["c1"] }), cookie);
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).error).toBe("class_year_mismatch");
    expect(await snap()).toEqual(before);
  });

  it("TC-C2 adding a class to existing work, class changes year before the write -> 422, links unchanged", async () => {
    const g = gateBatch();
    const p = callIn(g.env, "/api/assignments", json({ id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10, class_ids: ["c1", "c2"] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE classes SET year = 2570 WHERE id = 'c2'").run();
    const mid = await snap();
    g.release();
    const res = await p;
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).error).toBe("class_year_mismatch");
    expect(await snap()).toEqual(mid);
    expect(mid.ac).toEqual([{ assignment_id: "a1", class_id: "c1" }]);
  });

  it("TC-D import with two pasted rows on one number -> 422 number_conflict dupNumbers, nothing written", async () => {
    const before = await snap();
    const res = await call("/api/students/import", json({ class_id: "c1", students: [
      { code: "601", first_name: "ใหม่", last_name: "หนึ่ง", number: 5 },
      { code: "602", first_name: "ใหม่", last_name: "สอง", number: 5 },
    ] }), cookie);
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("number_conflict");
    expect(body.dupNumbers).toEqual([5]);
    expect(await snap()).toEqual(before);
  });

  it("TC-D2 import onto a number held by an outside child (no race) -> 422 with clash detail", async () => {
    const before = await snap();
    const res = await call("/api/students/import", json({ class_id: "c1", students: [{ code: "601", first_name: "ใหม่", last_name: "หนึ่ง", number: 2 }] }), cookie);
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).numberClashes).toEqual([{ number: 2, code: "102", name: "ค ง" }]);
    expect(await snap()).toEqual(before);
  });

  it("TC-E create with a code that exists, no race -> 409 code_taken (not 500), nothing written", async () => {
    const before = await snap();
    const res = await call("/api/students", json({ code: "101", first_name: "ซ้ำ", last_name: "รหัส", class_id: "c1", number: 20 }), cookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("code_taken");
    expect(await snap()).toEqual(before);
  });

  it("TC-E2 import with a repeated code inside the paste -> 422 duplicate_codes (not 500), nothing written", async () => {
    const before = await snap();
    const res = await call("/api/students/import", json({ class_id: "c1", students: [
      { code: "701", first_name: "ก", last_name: "ข" }, { code: "701", first_name: "ค", last_name: "ง" },
    ] }), cookie);
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).error).toBe("duplicate_codes");
    expect(await snap()).toEqual(before);
  });

  it("TC-E3 import race: two new pasted codes, other device takes ONE -> 409 naming that code, none of the paste written", async () => {
    const g = gateBatch();
    const p = callIn(g.env, "/api/students/import", json({ class_id: "c1", students: [
      { code: "801", first_name: "ใหม่", last_name: "หนึ่ง", number: 11 },
      { code: "802", first_name: "ใหม่", last_name: "สอง", number: 12 },
    ] }), cookie);
    await g.ready;
    expect((await call("/api/students", json({ code: "802", first_name: "อีก", last_name: "เครื่อง", class_id: "c2", number: 3 }), cookie)).status).toBe(200);
    g.release();
    const res = await p;
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("code_taken");
    expect(body.message).toContain("802");
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE code='801'")).toBe(0);
  });

  it("TC-F normal paths repeated on the same class still 200: edit twice, re-import twice, edit work", async () => {
    expect((await call("/api/students", edit("st1", "101", "ก", 1), cookie)).status).toBe(200);
    expect((await call("/api/students", edit("st1", "101", "ก", 1), cookie)).status).toBe(200);
    const paste = json({ class_id: "c1", students: [{ code: "101", first_name: "ก", last_name: "ข", number: 1 }, { code: "102", first_name: "ค", last_name: "ง", number: 2 }, { code: "901", first_name: "ใหม่", last_name: "ล่าสุด", number: 3 }] });
    expect((await call("/api/students/import", paste, cookie)).status).toBe(200);
    expect((await call("/api/students/import", paste, cookie)).status).toBe(200);
    const w = json({ id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "แก้ชื่อ", full_score: 10, class_ids: ["c1"] });
    expect((await call("/api/assignments", w, cookie)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE class_id='c1' AND number=3")).toBe(1);
  });

  it("TC-F2 old data: work whose class is of another year can still be edited under the same term", async () => {
    await env.DB.prepare("UPDATE classes SET year = 2560 WHERE id = 'c1'").run();
    const res = await call("/api/assignments", json({ id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "แก้เก่า", full_score: 10, class_ids: ["c1"] }), cookie);
    expect(res.status).toBe(200);
  });
  // ---- AC-08 (Verify 1): a pasted row WITHOUT a number keeps the child's old number, so that number counts ----
  const ac08 = async () => {
    await env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES ('st3','103','Q-DDDDDDDDDD','ช','ซ','c1',7,'moved','2569-10-01',0)").run();
    await env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES ('st4','104','Q-EEEEEEEEEE','ใหม่','ห้อง','c1',7,'active',0)").run();
  };
  const row103 = (extra: object = {}) => ({ code: "103", first_name: "ช", last_name: "ซ", ...extra });

  it("TC-G AC-08 preview warns and import is refused (422 number_conflict, readable Thai), nothing changes", async () => {
    await ac08();
    const pv = await call("/api/students/import/preview", json({ class_id: "c1", students: [row103()] }), cookie);
    expect(pv.status).toBe(200);
    const pb = (await pv.json()) as any;
    expect([...pb.dupNumbers, ...pb.numberClashes.map((x: any) => x.number)]).toContain(7);
    const before = await snap();
    const res = await call("/api/students/import", json({ class_id: "c1", students: [row103()] }), cookie);
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("number_conflict");
    expect(body.message).toMatch(/[ก-๙]+.*7/); // Thai text naming number 7
    expect(await snap()).toEqual(before);
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE class_id='c1' AND number=7 AND status='active'")).toBe(1);
  });

  it("TC-G2 AC-08 giving 103 a new number 31 -> preview clean, import 200, 103 active with 31, 104 keeps 7", async () => {
    await ac08();
    const pv = (await (await call("/api/students/import/preview", json({ class_id: "c1", students: [row103({ number: 31 })] }), cookie)).json()) as any;
    expect(pv.dupNumbers).toEqual([]);
    expect(pv.numberClashes).toEqual([]);
    expect((await call("/api/students/import", json({ class_id: "c1", students: [row103({ number: 31 })] }), cookie)).status).toBe(200);
    expect(await one("SELECT number, status FROM students WHERE id='st3'")).toEqual({ number: 31, status: "active" });
    expect((await one("SELECT number FROM students WHERE id='st4'")).number).toBe(7);
  });

  it("TC-G3 AC-08 no false positive: re-import of an all-active class with no numbers in the paste -> 200, numbers kept", async () => {
    const paste = json({ class_id: "c1", students: [
      { code: "101", first_name: "ก", last_name: "ข" }, { code: "102", first_name: "ค", last_name: "ง" }, { code: "555", first_name: "ใหม่", last_name: "ไม่มีเลข" },
    ] });
    const pv = (await (await call("/api/students/import/preview", paste, cookie)).json()) as any;
    expect(pv.dupNumbers).toEqual([]);
    expect(pv.numberClashes).toEqual([]);
    expect((await call("/api/students/import", paste, cookie)).status).toBe(200);
    expect((await call("/api/students/import", paste, cookie)).status).toBe(200);
    expect(await one("SELECT number FROM students WHERE id='st1'")).toEqual({ number: 1 });
    expect(await one("SELECT number FROM students WHERE id='st2'")).toEqual({ number: 2 });
  });

  it("TC-G4 AC-08 race: unnumbered pasted child keeps number 1, another device gives 1 to an outside child meanwhile -> 422, nothing written", async () => {
    await env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES ('st5','105','Q-FFFFFFFFFF','นอก','รายการ','c1',40,'active',0)").run();
    const g = gateBatch();
    const p = callIn(g.env, "/api/students/import", json({ class_id: "c1", students: [{ code: "101", first_name: "ก-แก้", last_name: "ข" }, { code: "556", first_name: "ใหม่", last_name: "สอง" }] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE students SET number = 1 WHERE id = 'st5'").run(); // st1 (in paste) still holds 1
    const mid = await snap();
    g.release();
    const res = await p;
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).error).toBe("number_conflict");
    expect(await snap()).toEqual(mid);
  });
});

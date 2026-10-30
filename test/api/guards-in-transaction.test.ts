// M1-03: the class-year rule, the one-number-per-child rule and the unique student code must hold AT THE
// MOMENT OF THE WRITE, not only when the request looked. Each test holds one request between its check
// and its D1 batch (gateBatch), lets another device change the data, then releases it — the loser must get
// the same 409/422 a plain request would get, and nothing of it may be written.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

const one = (sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(...binds).first<any>();
const count = async (sql: string, ...binds: unknown[]) => (await one(sql, ...binds)).n as number;

describe("guards repeated inside the write's own transaction", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("AC-01: a class moved to another year between the check and the write is refused (422 class_year_mismatch)", async () => {
    const g = gateBatch();
    const create = callIn(g.env, "/api/assignments", json({
      id: "a9", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "งานใหม่", full_score: 10, class_ids: ["c1"],
    }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE classes SET year = 2570 WHERE id = 'c1'").run();
    g.release();

    const res = await create;
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("class_year_mismatch");
    expect(body.message).toBe("ห้อง ป.6/1 เป็นของปีการศึกษาอื่น ไม่ตรงกับภาคเรียนของงานนี้");
    expect(await count("SELECT COUNT(*) AS n FROM assignments WHERE id = 'a9'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM assignment_classes WHERE assignment_id = 'a9'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id = 'a9'")).toBe(0);
  });

  it("AC-01: same when work moves to another term and a kept class changed year meanwhile", async () => {
    await env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('t2',2569,2,'2/2569',0,0)").run();
    const g = gateBatch();
    const move = callIn(g.env, "/api/assignments", json({
      id: "a1", term_id: "t2", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1 ย้ายเทอม", full_score: 10, class_ids: ["c1"],
    }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE classes SET year = 2568 WHERE id = 'c1'").run();
    g.release();

    const res = await move;
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).error).toBe("class_year_mismatch");
    expect(await one("SELECT term_id, title FROM assignments WHERE id = 'a1'")).toEqual({ term_id: "t1", title: "ใบงาน 1" });
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id = 'a1'")).toBe(0);
  });

  it("AC-02: two children added on one free number at once — one lands, the other gets 409 number_taken", async () => {
    const kid = (code: string, first_name: string) =>
      json({ code, first_name, last_name: "ทดสอบ", class_id: "c1", number: 7 });
    const g = gateBatch();
    const first = callIn(g.env, "/api/students", kid("701", "หนึ่ง"), cookie);
    await g.ready;
    expect((await call("/api/students", kid("702", "สอง"), cookie)).status).toBe(200);
    g.release();

    const res = await first;
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("number_taken");
    expect(body.message).toBe("เลขที่ 7 ในห้องนี้มีนักเรียนอยู่แล้ว: สอง ทดสอบ");
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE class_id = 'c1' AND number = 7 AND status = 'active'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE code = '701'")).toBe(0);
  });

  it("AC-02: an edit onto a number that was taken meanwhile is refused and leaves the child as they were", async () => {
    const g = gateBatch();
    const edit = callIn(g.env, "/api/students", json({ id: "st2", code: "102", first_name: "ค", last_name: "ง-แก้", class_id: "c1", number: 7 }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE students SET number = 7 WHERE id = 'st1'").run();
    g.release();

    const res = await edit;
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("number_taken");
    expect(await one("SELECT number, last_name FROM students WHERE id = 'st2'")).toEqual({ number: 2, last_name: "ง" });
  });

  it("AC-03: two children added with one code at once — one lands, the other gets 409 code_taken (not 500)", async () => {
    const kid = (first_name: string, number: number) =>
      json({ code: "10599", first_name, last_name: "ทดสอบ", class_id: "c1", number });
    const g = gateBatch();
    const first = callIn(g.env, "/api/students", kid("หนึ่ง", 8), cookie);
    await g.ready;
    expect((await call("/api/students", kid("สอง", 9), cookie)).status).toBe(200);
    g.release();

    const res = await first;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "code_taken", message: "รหัสนักเรียนนี้มีอยู่แล้ว" });
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE code = '10599'")).toBe(1);
    expect((await one("SELECT first_name FROM students WHERE code = '10599'")).first_name).toBe("สอง");
  });

  it("AC-04: an import whose number was given to a child outside the paste meanwhile is refused and writes nothing", async () => {
    const g = gateBatch();
    const imp = callIn(g.env, "/api/students/import", json({ class_id: "c1", students: [
      { code: "101", prefix: "ด.ช.", first_name: "ก-แก้", last_name: "ข", number: 1 },
      { code: "601", prefix: "ด.ช.", first_name: "ใหม่", last_name: "หนึ่ง", number: 7 },
    ] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE students SET number = 7 WHERE id = 'st2'").run(); // st2 (code 102) is not in the paste
    g.release();

    const res = await imp;
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ error: "number_conflict", dupNumbers: [] });
    expect(body.numberClashes).toEqual([{ number: 7, code: "102", name: "ค ง" }]);
    expect(body.message).toBe("เลขที่ชนกับนักเรียนที่ไม่ได้อยู่ในรายการ: เลขที่ 7 (ค ง)");
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE code = '601'")).toBe(0);
    expect((await one("SELECT first_name FROM students WHERE id = 'st1'")).first_name).toBe("ก");
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE method = 'import'")).toBe(0);
  });

  it("AC-07: an import whose new code was added by another device meanwhile gets 409 code_taken (not 500) and writes nothing", async () => {
    const g = gateBatch();
    const imp = callIn(g.env, "/api/students/import", json({ class_id: "c1", students: [
      { code: "101", prefix: "ด.ช.", first_name: "ก-แก้", last_name: "ข", number: 1 },
      { code: "10777", prefix: "ด.ช.", first_name: "ใหม่", last_name: "รายการ", number: 7 },
    ] }), cookie);
    await g.ready;
    expect((await call("/api/students", json({ code: "10777", first_name: "อีก", last_name: "เครื่อง", class_id: "c2", number: 5 }), cookie)).status).toBe(200);
    g.release();

    const res = await imp;
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("code_taken");
    expect(body.message).toContain("10777");
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE code = '10777'")).toBe(1);
    expect((await one("SELECT first_name, class_id FROM students WHERE code = '10777'"))).toEqual({ first_name: "อีก", class_id: "c2" });
    expect((await one("SELECT first_name FROM students WHERE id = 'st1'")).first_name).toBe("ก");
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE method = 'import'")).toBe(0);
  });

  it("AC-08: a number-less row brings a former child back on their kept number — counted as the paste's number (preview + import)", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES ('st3','103','Q-DDDDDDDDDD','ช','ซ','c1',7,'moved',0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES ('st4','601','Q-EEEEEEEEEE','ใหม่','เจ็ด','c1',7,'active',0)"),
    ]);
    const back = { code: "103", first_name: "ช", last_name: "ซ" };
    const pv = (await (await call("/api/students/import/preview", json({ class_id: "c1", students: [back] }), cookie)).json()) as any;
    expect(pv.numberClashes).toEqual([{ number: 7, code: "601", name: "ใหม่ เจ็ด" }]);

    const res = await call("/api/students/import", json({ class_id: "c1", students: [back] }), cookie);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "number_conflict", numberClashes: [{ number: 7, code: "601" }] });
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE class_id = 'c1' AND number = 7 AND status = 'active'")).toBe(1);
    expect((await one("SELECT status FROM students WHERE id = 'st3'")).status).toBe("moved");

    // given a new number, the same child comes back fine
    expect((await call("/api/students/import", json({ class_id: "c1", students: [{ ...back, number: 31 }] }), cookie)).status).toBe(200);
    expect(await one("SELECT status, number FROM students WHERE id = 'st3'")).toEqual({ status: "active", number: 31 });
  });

  it("AC-08: two number-less former children on one kept number are a repeat within the paste", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES ('st3','103','Q-DDDDDDDDDD','ช','ซ','c1',7,'moved',0)"),
      env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES ('st4','104','Q-EEEEEEEEEE','ฌ','ญ','c1',7,'inactive',0)"),
    ]);
    const students = [{ code: "103", first_name: "ช", last_name: "ซ" }, { code: "104", first_name: "ฌ", last_name: "ญ" }];
    const pv = (await (await call("/api/students/import/preview", json({ class_id: "c1", students }), cookie)).json()) as any;
    expect(pv.dupNumbers).toEqual([7]);
    const res = await call("/api/students/import", json({ class_id: "c1", students }), cookie);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "number_conflict", dupNumbers: [7] });
  });

  it("R-04: a number-less pasted child given a pasted number by another device meanwhile is refused", async () => {
    const g = gateBatch();
    const imp = callIn(g.env, "/api/students/import", json({ class_id: "c1", students: [
      { code: "101", first_name: "ก", last_name: "ข" },              // keeps whatever number st1 has at the write
      { code: "601", first_name: "ใหม่", last_name: "หนึ่ง", number: 7 },
    ] }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE students SET number = 7 WHERE id = 'st1'").run();
    g.release();

    const res = await imp;
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "number_conflict", dupNumbers: [7] });
    expect(await count("SELECT COUNT(*) AS n FROM students WHERE code = '601'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE method = 'import'")).toBe(0);
  });

  it("R-04: a class whose year became NULL meanwhile still passes the year guard", async () => {
    const g = gateBatch();
    const create = callIn(g.env, "/api/assignments", json({
      id: "a9", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "งานใหม่", full_score: 10, class_ids: ["c1"],
    }), cookie);
    await g.ready;
    await env.DB.prepare("UPDATE classes SET year = NULL WHERE id = 'c1'").run();
    g.release();
    expect((await create).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM assignment_classes WHERE assignment_id = 'a9'")).toBe(1);
  });

  it("R-04: a moved student is not held to the number guard, even when the number was taken meanwhile", async () => {
    const g = gateBatch();
    const save = callIn(g.env, "/api/students", json({ code: "701", first_name: "ย้าย", last_name: "ออก", class_id: "c1", number: 7, status: "moved" }), cookie);
    await g.ready;
    expect((await call("/api/students", json({ code: "702", first_name: "อยู่", last_name: "ต่อ", class_id: "c1", number: 7 }), cookie)).status).toBe(200);
    g.release();
    expect((await save).status).toBe(200);
    expect(await one("SELECT status, number FROM students WHERE code = '701'")).toEqual({ status: "moved", number: 7 });
  });

  it("AC-05: without a race the same requests still go through", async () => {
    expect((await call("/api/assignments", json({
      id: "a9", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "งานใหม่", full_score: 10, class_ids: ["c1", "c2"],
    }), cookie)).status).toBe(200);
    expect((await call("/api/students", json({ code: "701", first_name: "หนึ่ง", last_name: "ทดสอบ", class_id: "c1", number: 7 }), cookie)).status).toBe(200);
    expect((await call("/api/students", json({ id: "st1", code: "101", first_name: "ก", last_name: "ข-แก้", class_id: "c1", number: 1 }), cookie)).status).toBe(200);
    // a child in the paste may keep or swap numbers with another child in the paste
    expect((await call("/api/students/import", json({ class_id: "c1", students: [
      { code: "101", first_name: "ก", last_name: "ข", number: 2 },
      { code: "102", first_name: "ค", last_name: "ง", number: 1 },
      { code: "602", first_name: "ใหม่", last_name: "สอง" },
    ] }), cookie)).status).toBe(200);
    expect(await one("SELECT number FROM students WHERE id = 'st1'")).toEqual({ number: 2 });
  });
});

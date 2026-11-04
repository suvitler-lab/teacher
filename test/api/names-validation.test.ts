// qa-final follow-up (B-A8 B-A9 B-A10 + device rename): the same name twice among the active classes of a year /
// subjects / work types is refused with a Thai 409; a new work needs a usable type and a title of at most 200
// characters; a device can be given a name (1-40 characters, repeats allowed) and keeps it across sign-ins.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

let cookie: string;
const post = (path: string, body: unknown, ck = cookie) => call(path, json(body), ck);
const one = async (sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(...binds).first<any>();
const THAI = /[฀-๿]/;

beforeEach(async () => { cookie = await login(); await seed(); });
afterEach(async () => {
  // work types keep their migration defaults between tests: remove what a test added
  await env.DB.batch([
    env.DB.prepare("DELETE FROM submissions"), env.DB.prepare("DELETE FROM assignment_classes"), env.DB.prepare("DELETE FROM assignments"),
    env.DB.prepare("DELETE FROM work_types WHERE id LIKE 'x%'"),
  ]);
});

const wt = (o: Record<string, unknown>) => post("/api/work-types", { icon: "file-text", color: "violet", default_full: 10, ...o });

describe("work types: one active name once (B-A8)", () => {
  it("refuses a new type named like an active one — trimmed, any letter case — with a Thai 409", async () => {
    await wt({ id: "x_quiz", name: "Quiz Pro" });
    for (const name of ["Quiz Pro", "  quiz pro  ", "QUIZ PRO", "ใบงาน", " ใบงาน"]) {
      const res = await wt({ name });
      expect(res.status, name).toBe(409);
      const b = (await res.json()) as any;
      expect(b.error).toBe("duplicate_name");
      expect(b.message).toMatch(THAI);
    }
    expect((await one("SELECT COUNT(*) AS n FROM work_types WHERE lower(name) = 'quiz pro'")).n).toBe(1);
  });

  it("refuses renaming a type to the name of another active type, but not to its own name in another case", async () => {
    await wt({ id: "x_a", name: "ก่อน" });
    expect((await wt({ id: "x_a", name: "ใบงาน" })).status).toBe(409);
    expect((await one("SELECT name FROM work_types WHERE id = 'x_a'")).name).toBe("ก่อน");
    await wt({ id: "x_b", name: "Mini Test" });
    expect((await wt({ id: "x_b", name: "mini test" })).status).toBe(200); // the same row
  });

  it("stores the name trimmed", async () => {
    expect((await wt({ id: "x_t", name: "  งานกลุ่ม  " })).status).toBe(200);
    expect((await one("SELECT name FROM work_types WHERE id = 'x_t'")).name).toBe("งานกลุ่ม");
  });

  it("an archived type's name is free again; bringing it back while the name is taken is refused", async () => {
    await wt({ id: "x_old", name: "ท้ายบท" });
    await wt({ id: "x_old", name: "ท้ายบท", archived: true });
    expect((await wt({ id: "x_new", name: "ท้ายบท" })).status).toBe(200);
    const back = await wt({ id: "x_old", name: "ท้ายบท", archived: false });
    expect(back.status).toBe(409);
    expect(((await back.json()) as any).message).toMatch(THAI);
    expect((await one("SELECT archived FROM work_types WHERE id = 'x_old'")).archived).toBe(1);
  });

  it("re-saving a row whose name an older version let clash (re-order, colour) still works", async () => {
    await env.DB.prepare("INSERT INTO work_types (id,name,icon,color,is_exam,default_full,sort,archived,updated_at) VALUES ('x_dup','ใบงาน','file-text','violet',0,10,99,0,0)").run();
    expect((await wt({ id: "x_dup", name: "ใบงาน", sort: 5, color: "red" })).status).toBe(200);
  });
});

describe("classes and subjects: one active name once (B-A9)", () => {
  it("a class named like an active class of the same year is refused (409, Thai) — new, renamed, or brought back", async () => {
    for (const name of ["ป.6/1", "  ป.6/1 "]) {
      const res = await post("/api/classes", { name });
      expect(res.status).toBe(409);
      const b = (await res.json()) as any;
      expect(b.error).toBe("duplicate_name");
      expect(b.message).toMatch(THAI);
    }
    expect((await post("/api/classes", { id: "c2", name: "ป.6/1", grade: "ป.6", sort: 20 })).status).toBe(409);
    expect((await one("SELECT name FROM classes WHERE id = 'c2'")).name).toBe("ป.6/2");
    // archive c1: the name is free; then bring it back while a new "ป.6/1" exists
    expect((await post("/api/classes", { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 10, archived: true })).status).toBe(200);
    expect((await post("/api/classes", { name: "ป.6/1" })).status).toBe(200);
    expect((await post("/api/classes", { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 10, archived: false })).status).toBe(409);
    expect((await one("SELECT COUNT(*) AS n FROM classes WHERE name = 'ป.6/1' AND archived = 0")).n).toBe(1);
  });

  it("another year's class may have the same name; an unchanged class can be re-saved", async () => {
    await env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('old1','ป.5/1','ป.5',5,0,2568,0)").run();
    expect((await post("/api/classes", { name: "ป.5/1" })).status).toBe(200); // filed under 2569
    expect((await post("/api/classes", { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 30 })).status).toBe(200); // re-order
  });

  it("a subject named like an active subject is refused (409, Thai), whatever the case; archived ones don't count", async () => {
    expect((await post("/api/subjects", { name: "วิทย์" })).status).toBe(409);
    expect((await post("/api/subjects", { id: "s9", name: "English" })).status).toBe(200);
    const res = await post("/api/subjects", { name: " english " });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).message).toMatch(THAI);
    expect((await post("/api/subjects", { id: "s9", name: "English", archived: true })).status).toBe(200);
    expect((await post("/api/subjects", { name: "English" })).status).toBe(200);
    expect((await one("SELECT COUNT(*) AS n FROM subjects WHERE name = 'วิทย์'")).n).toBe(1);
  });
});

const work = (o: Record<string, unknown> = {}) => post("/api/assignments", {
  subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน ใหม่", full_score: 10, term_id: "t1",
  assigned_date: "2026-09-01", due_date: "2026-12-31", class_ids: ["c1"], ...o,
});

describe("assignments: title length and archived types (B-A10)", () => {
  it("a title of 200 characters is taken; 201 is a 422 with a Thai message and nothing is written", async () => {
    expect((await work({ title: "ก".repeat(200) })).status).toBe(200);
    const before = (await one("SELECT COUNT(*) AS n FROM assignments")).n;
    const res = await work({ title: "ก".repeat(201) });
    expect(res.status).toBe(422);
    const b = (await res.json()) as any;
    expect(b.error).toBe("title_too_long");
    expect(b.message).toMatch(THAI);
    expect((await one("SELECT COUNT(*) AS n FROM assignments")).n).toBe(before);
    // 300 characters, as the QA found
    expect((await work({ title: "x".repeat(300) })).status).toBe(422);
  });

  it("a new work of an archived work type is refused (422, Thai); editing a work that already has the type is fine", async () => {
    await wt({ id: "x_gone", name: "ชั่วคราว" });
    const made = await work({ id: "w-old", type_id: "x_gone" });
    expect(made.status).toBe(200);
    await wt({ id: "x_gone", name: "ชั่วคราว", archived: true });

    const res = await work({ type_id: "x_gone", title: "ใหม่" });
    expect(res.status).toBe(422);
    const b = (await res.json()) as any;
    expect(b.error).toBe("work_type_archived");
    expect(b.message).toMatch(THAI);
    expect((await one("SELECT COUNT(*) AS n FROM assignments WHERE title = 'ใหม่'")).n).toBe(0);

    // the old work keeps its (now archived) type when edited ...
    expect((await work({ id: "w-old", type_id: "x_gone", title: "แก้ชื่อ" })).status).toBe(200);
    // ... but another work cannot be moved onto it
    const moved = await work({ id: "a1", type_id: "x_gone", title: "ย้ายประเภท" });
    expect(moved.status).toBe(422);
    expect((await one("SELECT type_id FROM assignments WHERE id = 'a1'")).type_id).toBe("wt_worksheet");
  });
});

describe("devices: rename (v9.2)", () => {
  const rename = (id: string, name: unknown, ck = cookie) => post(`/api/devices/${id}/rename`, { name }, ck);
  const nameOf = async (id: string) => (await one("SELECT name FROM devices WHERE id = ?", id)).name as string;

  it("renames this device and another; trims; repeats are allowed", async () => {
    const other = await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "dev_b", deviceName: "Chrome · Windows" }));
    expect(other.status).toBe(200);
    const res = await rename("dev_test", "  iPad ห้องพักครู ");
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).name).toBe("iPad ห้องพักครู");
    expect(await nameOf("dev_test")).toBe("iPad ห้องพักครู");
    expect((await rename("dev_b", "iPad ห้องพักครู")).status).toBe(200); // same name twice is allowed
    expect(await nameOf("dev_b")).toBe("iPad ห้องพักครู");
    const list = ((await (await call("/api/devices", {}, cookie)).json()) as any).devices;
    expect(list.filter((d: any) => d.name === "iPad ห้องพักครู").length).toBe(2);
  });

  it("1-40 characters: empty, spaces only and 41 are 422 with a Thai message; 40 is taken", async () => {
    for (const bad of ["", "   ", "ก".repeat(41), " " + "ก".repeat(41)]) {
      const res = await rename("dev_test", bad);
      expect(res.status, JSON.stringify(bad)).toBe(422);
      expect(((await res.json()) as any).message).toMatch(THAI);
    }
    expect((await rename("dev_test", "ก".repeat(40))).status).toBe(200);
    expect((await rename("dev_test", 5)).status).toBe(422); // not a string
    expect((await rename("dev_test", "ก".repeat(40) + "   ")).status).toBe(200); // trimmed first
  });

  it("an unknown device is 404; not signed in is 401; the name survives that device signing in again", async () => {
    expect((await rename("dev_nope", "x")).status).toBe(404);
    expect((await rename("dev_test", "x", "")).status).toBe(401);
    await rename("dev_test", "เครื่องของครู");
    const again = await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "dev_test", deviceName: "Chrome · Windows" }));
    expect(again.status).toBe(200);
    expect(await nameOf("dev_test")).toBe("เครื่องของครู");
  });
});

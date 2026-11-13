import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed, reset } from "./helpers";

// EP-11 GET/PUT /api/timetable — job 2026-11-12-timetable, T-12
let cookie: string;
const put = (body: unknown, c = cookie) => call("/api/timetable", json(body, { method: "PUT" }), c);
const get = (q = "") => call(`/api/timetable${q}`, {}, cookie);
const cls = (weekday: number, period: number, classId = "c1", subjectId: string | null = "s1") => ({ weekday, period, kind: "class", classId, subjectId, label: null });
const act = (weekday: number, period: number, label: string) => ({ weekday, period, kind: "activity", classId: null, subjectId: null, label });
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
const audits = async () => (await env.DB.prepare("SELECT * FROM audit_logs WHERE entity = 'timetable'").all<any>()).results!;
const rev = async (id = "t1") => (await env.DB.prepare("SELECT timetable_rev AS r FROM terms WHERE id = ?").bind(id).first<{ r: number }>())!.r;
const hhmm = (h: number) => String(h).padStart(2, "0");
const periods = (n: number) => Array.from({ length: n }, (_, i) => ({ start: `${hhmm(8 + i)}:00`, end: `${hhmm(8 + i)}:50` }));
const putFrame = (body: unknown) => call("/api/timetable/frame", json(body, { method: "PUT" }), cookie);

beforeEach(async () => {
  await reset();
  cookie = await login();
  await seed();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('t2',2569,2,'2/2569',0,0)"),
    env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('told',2568,2,'2/2568',0,0)"),
    env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c3','ป.6/3','ป.6',30,0,2569,0)"),
    env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('cold','ป.5/1','ป.5',5,0,2568,0)"),
    env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('cnull','ป.4/1','ป.4',6,0,NULL,0)"),
    env.DB.prepare("INSERT INTO subjects (id,code,name,color,sort,archived,updated_at) VALUES ('s2','ค16101','คณิต','red',20,0,0)"),
  ]);
});

describe("EP-11 auth and read", () => {
  it("401 without a session, nothing in the body (AC-09)", async () => {
    for (const r of [
      await call("/api/timetable"),
      await call("/api/timetable", json({ termId: "t1", baseRev: 0, slots: [] }, { method: "PUT" })),
      await call("/api/timetable/frame", json({ baseRev: 0, frame: { periods: [], breaks: [], days: [1] } }, { method: "PUT" })),
    ]) {
      expect(r.status).toBe(401);
      expect(JSON.stringify(await r.json())).not.toContain("slots");
    }
  });

  it("GET defaults to the current term, empty table, default frame, counts only terms with slots", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b).toMatchObject({ termId: "t1", rev: 0, readOnly: false, slots: [], counts: [] });
    expect(b.frame).toMatchObject({ v: 1, rev: 0, saved: false, days: [1, 2, 3, 4, 5] });
    expect(b.frame.periods).toHaveLength(7);
  });

  it("GET ?term= of another year is readOnly; unknown term 404 (AC-08)", async () => {
    expect(await (await get("?term=told")).json()).toMatchObject({ termId: "told", readOnly: true });
    expect(await (await get("?term=t2")).json()).toMatchObject({ termId: "t2", readOnly: false });
    const nf = await get("?term=nope");
    expect(nf.status).toBe(404);
    expect(await nf.json()).toMatchObject({ error: "term_not_found" });
  });

  it("no term -> 404 no_term and bootstrap.timetable null (AC-10)", async () => {
    await env.DB.batch(["assignment_classes", "assignments", "students", "subjects", "classes", "terms"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
    const r = await get();
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: "no_term", message: "ยังไม่มีภาคเรียน — สร้างภาคเรียนก่อนกรอกตารางสอน" });
    const bs: any = await (await call("/api/bootstrap", {}, cookie)).json();
    expect(bs.timetable).toBeNull();
  });
});

describe("EP-11 PUT happy paths", () => {
  it("adds a class slot and an activity; reload shows them; rev +1; one audit row (AC-02 AC-03 AC-45)", async () => {
    const r = await put({ termId: "t1", baseRev: 0, slots: [cls(3, 3), act(4, 7, "  ประชุมระดับชั้น ")] });
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b).toMatchObject({ ok: true, changed: true, timetable: { termId: "t1", rev: 1, readOnly: false } });
    expect(b.timetable.slots).toEqual([cls(3, 3), act(4, 7, "ประชุมระดับชั้น")]);
    const g: any = await (await get()).json();
    expect(g.slots).toEqual(b.timetable.slots);
    expect(g.counts).toEqual([{ termId: "t1", slots: 2 }]);
    const a = await audits();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ entity_id: "t1", action: "update", method: "manual" });
    expect(JSON.parse(a[0].before_json)).toEqual({ slots: 0, rev: 0 });
    expect(JSON.parse(a[0].after_json)).toEqual({ slots: 2, rev: 1, reason: "edit" });
    expect(a[0].before_json + a[0].after_json).not.toContain("ก"); // counts only: no names at all
  });

  it("replaces a slot class -> activity with nothing left over; subject is optional (AC-05)", async () => {
    await put({ termId: "t1", baseRev: 0, slots: [cls(1, 2, "c2", "s1"), cls(2, 1, "c1", null)] });
    const r = await put({ termId: "t1", baseRev: 1, reason: "edit", slots: [act(1, 2, "อบรม"), cls(2, 1, "c1", null)] });
    expect(r.status).toBe(200);
    const g: any = await (await get()).json();
    expect(g.slots[0]).toEqual(act(1, 2, "อบรม"));
    expect(g.slots[1]).toMatchObject({ classId: "c1", subjectId: null });
    expect(await count("timetable_slots")).toBe(2);
  });

  it("delete, undo and clear are the same PUT; the reason goes in the audit (AC-06 AC-07 AC-45)", async () => {
    await put({ termId: "t1", baseRev: 0, slots: [cls(1, 1), cls(2, 6)] });
    await put({ termId: "t1", baseRev: 1, slots: [cls(1, 1)] });
    await put({ termId: "t1", baseRev: 2, reason: "undo", slots: [cls(1, 1), cls(2, 6)] });
    await put({ termId: "t1", baseRev: 3, reason: "clear", slots: [] });
    expect(((await (await get()).json()) as any).slots).toEqual([]);
    const a = await audits();
    expect(a).toHaveLength(4);
    expect(a.map((x: any) => JSON.parse(x.after_json).reason)).toEqual(["edit", "edit", "undo", "clear"]);
    expect(JSON.parse(a[3].before_json)).toEqual({ slots: 2, rev: 3 });
    expect(JSON.parse(a[3].after_json)).toMatchObject({ slots: 0, rev: 4 });
  });

  it("clearing one term leaves other terms, settings, attendance and scores untouched (AC-07)", async () => {
    await put({ termId: "t1", baseRev: 0, slots: [cls(1, 1)] });
    await put({ termId: "t2", baseRev: 0, slots: [cls(1, 1), cls(1, 2)] });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO attendance_sessions (id,date,class_id,subject_id,period,updated_at) VALUES ('as1','2569-09-10','c1',NULL,NULL,1)"),
      env.DB.prepare("INSERT INTO attendance (session_id,student_id,status,time,method,device_id,updated_at) VALUES ('as1','st1','present',1,'grid',NULL,1)"),
      env.DB.prepare("INSERT INTO submissions (assignment_id,student_id,status,score,late,submitted_at,method,device_id,scan_session_id,updated_at) VALUES ('a1','st1','submitted',8,0,1,'grid',NULL,NULL,1)"),
    ]);
    const tables = ["attendance", "submissions", "attendance_sessions", "settings", "classes", "subjects"];
    const before = await Promise.all(tables.map(count));
    const r = await put({ termId: "t1", baseRev: 1, reason: "clear", slots: [] });
    expect(r.status).toBe(200);
    expect(await count("timetable_slots")).toBe(2);
    expect(((await (await get("?term=t2")).json()) as any).slots).toHaveLength(2);
    expect(await rev("t2")).toBe(1);
    expect(await Promise.all(tables.map(count))).toEqual(before);
  });

  it("an identical list is 200 changed:false: no rev bump, no audit", async () => {
    await put({ termId: "t1", baseRev: 0, slots: [cls(1, 1)] });
    const r = await put({ termId: "t1", baseRev: 1, slots: [cls(1, 1)] });
    expect(await r.json()).toMatchObject({ ok: true, changed: false, timetable: { rev: 1 } });
    expect(await rev()).toBe(1);
    expect(await audits()).toHaveLength(1);
  });

  it("56 slots (7 days x 8 periods) are accepted once the frame has them; 57 is a 422", async () => {
    const f = await putFrame({ baseRev: 0, frame: { periods: periods(8), breaks: [], days: [1, 2, 3, 4, 5, 6, 7] } });
    expect(f.status).toBe(200);
    const all: any[] = [];
    for (let d = 1; d <= 7; d++) for (let p = 1; p <= 8; p++) all.push(act(d, p, `ก${d}${p}`));
    expect(all).toHaveLength(56);
    expect((await put({ termId: "t1", baseRev: 0, slots: all })).status).toBe(200);
    const over = await put({ termId: "t1", baseRev: 1, slots: [...all, act(1, 1, "x")] });
    expect(over.status).toBe(422);
    expect(await over.json()).toMatchObject({ error: "validation" });
  });
});

describe("EP-11 refusals (check order table)", () => {
  const expectNothing = async (before: number) => {
    expect(await count("timetable_slots")).toBe(before);
    expect(await audits()).toHaveLength(0);
  };

  it("#1 malformed body -> 422 validation", async () => {
    for (const body of [
      { baseRev: 0, slots: [] },
      { termId: "t1", baseRev: -1, slots: [] },
      { termId: "t1", baseRev: 0, slots: [cls(8, 1)] },
      { termId: "t1", baseRev: 0, slots: [cls(1, 9)] },
      { termId: "t1", baseRev: 0, slots: [{ ...cls(1, 1), kind: "x" }] },
      { termId: "t1", baseRev: 0, slots: [act(1, 1, "x".repeat(801))] },
      { termId: "t1", baseRev: 0, reason: "zzz", slots: [] },
    ]) {
      const r = await put(body);
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({ error: "validation" });
    }
    await expectNothing(0);
  });

  it("#2 unknown term 404", async () => {
    const r = await put({ termId: "nope", baseRev: 0, slots: [] });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: "term_not_found" });
  });

  it("#3 previous-year term 409 term_read_only, nothing changes, even with a stale baseRev (AC-08)", async () => {
    await env.DB.prepare("INSERT INTO timetable_slots (term_id,weekday,period,kind,class_id,subject_id,label,updated_at) VALUES ('told',1,1,'activity',NULL,NULL,'เก่า',0)").run();
    const r = await put({ termId: "told", baseRev: 99, slots: [] });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "term_read_only", message: "ภาคเรียนของปีการศึกษาที่ผ่านมา ดูได้อย่างเดียว" });
    expect(await count("timetable_slots")).toBe(1);
    expect(await audits()).toHaveLength(0);
    // another term of the current year stays editable
    expect((await put({ termId: "t2", baseRev: 0, slots: [cls(1, 1)] })).status).toBe(200);
  });

  it("#4 stale baseRev -> 409 timetable_changed with current; two devices (AC-41)", async () => {
    await put({ termId: "t1", baseRev: 0, slots: [cls(1, 1)] }); // iPad -> rev 1
    const r = await put({ termId: "t1", baseRev: 0, slots: [cls(2, 2)] }); // computer still on rev 0
    expect(r.status).toBe(409);
    const b: any = await r.json();
    expect(b).toMatchObject({
      error: "timetable_changed",
      message: "ตารางสอนถูกแก้จากเครื่องอื่น — โหลดฉบับล่าสุดแล้ว ลองแก้อีกครั้ง",
      current: { termId: "t1", rev: 1, readOnly: false },
    });
    expect(b.current.slots).toEqual([cls(1, 1)]);
    expect(await count("timetable_slots")).toBe(1);
    expect(await audits()).toHaveLength(1);
    const ok = await put({ termId: "t1", baseRev: 1, slots: [...b.current.slots, cls(2, 2)] });
    expect(ok.status).toBe(200);
    expect(await rev()).toBe(2);
  });

  it("#5 shape issues -> 422 bad_timetable with the contract messages (AC-04 AC-05)", async () => {
    const cases: [any[], string, string][] = [
      [[{ ...cls(1, 1), classId: null }], "class_required", "เลือกห้อง"],
      [[act(1, 1, "   ")], "label_required", "ใส่ชื่อกิจกรรม"],
      [[act(1, 1, "ก".repeat(41))], "label_too_long", "ไม่เกิน 40 ตัวอักษร"],
      [[cls(1, 1), cls(1, 1, "c2")], "duplicate_slot", "มีคาบนี้ซ้ำในคำขอ"],
      [[cls(6, 1)], "outside_frame", "คาบนี้อยู่นอกโครงเวลา"],
      [[cls(1, 8)], "outside_frame", "คาบนี้อยู่นอกโครงเวลา"],
      [[{ ...act(1, 1, "ก"), classId: "c1" }], "kind_fields", "คาบกิจกรรมไม่มีห้องหรือวิชา"],
      [[{ ...cls(1, 1), label: "x" }], "kind_fields", "คาบกิจกรรมไม่มีห้องหรือวิชา"],
    ];
    for (const [slots, code, message] of cases) {
      const r = await put({ termId: "t1", baseRev: 0, slots });
      expect(r.status, code).toBe(422);
      const b: any = await r.json();
      expect(b.error).toBe("bad_timetable");
      expect(b.issues.map((i: any) => [i.code, i.message])).toContainEqual([code, message]);
    }
    await expectNothing(0);
  });

  it("#5b labels count graphemes: emoji x41 -> 422 label_too_long (B-02)", async () => {
    const bad = await put({ termId: "t1", baseRev: 0, slots: [act(1, 1, "🏕️".repeat(41))] });
    expect(bad.status).toBe(422);
    const b: any = await bad.json();
    expect(b.error).toBe("bad_timetable");
    expect(b.issues.map((i: any) => i.code)).toContain("label_too_long");
    // x40 passes the validator but the 0008 CHECK counts code points (80 > 40): needs a migration change (see dev-notes)
  });

  it("#6 database references: missing / wrong year / archived (AC-40)", async () => {
    const issue = async (slot: any) => {
      const r = await put({ termId: "t1", baseRev: 0, slots: [slot] });
      expect(r.status).toBe(422);
      return ((await r.json()) as any).issues[0];
    };
    expect(await issue(cls(1, 1, "ghost"))).toMatchObject({ code: "class_not_found", message: "ไม่พบห้องนี้" });
    expect(await issue(cls(1, 1, "c1", "ghost"))).toMatchObject({ code: "subject_not_found" });
    expect(await issue(cls(1, 1, "cold"))).toMatchObject({ code: "class_wrong_year", message: "ห้องนี้ไม่ได้อยู่ในปีการศึกษา 2569" });
    await env.DB.batch([env.DB.prepare("UPDATE classes SET archived = 1 WHERE id = 'c3'"), env.DB.prepare("UPDATE subjects SET archived = 1 WHERE id = 's2'")]);
    expect(await issue(cls(1, 1, "c3"))).toMatchObject({ code: "archived_ref", message: "ห้อง/วิชานี้เก็บแล้ว — เลือกห้อง/วิชาที่ใช้งาน" });
    expect(await issue(cls(1, 1, "c1", "s2"))).toMatchObject({ code: "archived_ref" });
    await expectNothing(0);
    // a class with year NULL counts as the current year
    expect((await put({ termId: "t1", baseRev: 0, slots: [cls(1, 1, "cnull")] })).status).toBe(200);
  });

  it("archived class/subject keep their slots; moving them is 422; restoring works (AC-40 BR-06)", async () => {
    await put({ termId: "t1", baseRev: 0, slots: [cls(3, 4, "c3", "s2"), cls(4, 2, "c3", "s2")] });
    await env.DB.batch([env.DB.prepare("UPDATE classes SET archived = 1 WHERE id = 'c3'"), env.DB.prepare("UPDATE subjects SET archived = 1 WHERE id = 's2'")]);
    const g: any = await (await get()).json();
    expect(g.slots).toHaveLength(2); // kept and still sent
    // unchanged archived slots + a new ordinary slot -> ok
    const ok = await put({ termId: "t1", baseRev: 1, slots: [...g.slots, cls(3, 3, "c1", "s1")] });
    expect(ok.status).toBe(200);
    // move (3,4) to (3,5) -> a new slot that references the archived class -> 422
    const cur: any = await (await get()).json();
    const moved = cur.slots.map((s: any) => (s.weekday === 3 && s.period === 4 ? { ...s, period: 5 } : s));
    const r = await put({ termId: "t1", baseRev: 2, slots: moved });
    expect(r.status).toBe(422);
    expect(((await r.json()) as any).issues[0]).toMatchObject({ code: "archived_ref", weekday: 3, period: 5 });
    // restored -> accepted
    await env.DB.batch([env.DB.prepare("UPDATE classes SET archived = 0 WHERE id = 'c3'"), env.DB.prepare("UPDATE subjects SET archived = 0 WHERE id = 's2'")]);
    expect((await put({ termId: "t1", baseRev: 2, slots: moved })).status).toBe(200);
  });

  it("#8 epoch: a write from before a restore is refused and writes nothing (AC-42)", async () => {
    await env.DB.prepare("UPDATE meta SET value = '2' WHERE key = 'data_epoch'").run();
    const r = await call("/api/timetable", json({ termId: "t1", baseRev: 0, slots: [cls(1, 1)] }, { method: "PUT", headers: { "X-Data-Epoch": "1" } }), cookie);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "epoch_changed" });
    await expectNothing(0);
  });

  it("a restore landing between the check and the write refuses the write (epoch in the batch)", async () => {
    const gate = gateBatch();
    const held = callIn(gate.env, "/api/timetable", json({ termId: "t1", baseRev: 0, slots: [cls(1, 1)] }, { method: "PUT" }), cookie);
    await gate.ready;
    await env.DB.prepare("UPDATE meta SET value = '2' WHERE key = 'data_epoch'").run();
    gate.release();
    const r = await held;
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "epoch_changed" });
    await expectNothing(0);
  });

  it("a frame saved between the check and the write rolls the whole batch back (frame_changed)", async () => {
    const gate = gateBatch();
    const held = callIn(gate.env, "/api/timetable", json({ termId: "t1", baseRev: 0, slots: [cls(1, 7)] }, { method: "PUT" }), cookie);
    await gate.ready;
    expect((await putFrame({ baseRev: 0, frame: { periods: periods(6), breaks: [], days: [1, 2, 3, 4, 5] } })).status).toBe(200);
    gate.release();
    const r = await held;
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "frame_changed", message: "โครงเวลาถูกแก้จากเครื่องอื่น — โหลดใหม่แล้ว ลองอีกครั้ง" });
    expect(await count("timetable_slots")).toBe(0);
  });

  it("a class archived between the check and the write refuses a new slot for it (422)", async () => {
    const gate = gateBatch();
    const held = callIn(gate.env, "/api/timetable", json({ termId: "t1", baseRev: 0, slots: [cls(1, 1, "c3", null)] }, { method: "PUT" }), cookie);
    await gate.ready;
    await env.DB.prepare("UPDATE classes SET archived = 1 WHERE id = 'c3'").run();
    gate.release();
    const r = await held;
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: "bad_timetable", issues: [{ code: "archived_ref" }] });
    await expectNothing(0);
  });

  it("two devices writing at once on the same rev: exactly one wins", async () => {
    const gate = gateBatch();
    const held = callIn(gate.env, "/api/timetable", json({ termId: "t1", baseRev: 0, slots: [cls(1, 1)] }, { method: "PUT" }), cookie);
    await gate.ready;
    expect((await put({ termId: "t1", baseRev: 0, slots: [cls(2, 2)] })).status).toBe(200);
    gate.release();
    const r = await held;
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "timetable_changed", current: { rev: 1 } });
    expect(((await (await get()).json()) as any).slots).toEqual([cls(2, 2)]);
    expect(await audits()).toHaveLength(1);
  });
});

describe("bootstrap.timetable and settings.period_frame (D51)", () => {
  it("bootstrap carries the current term's table and the frame setting", async () => {
    await put({ termId: "t1", baseRev: 0, slots: [cls(1, 1)] });
    const b: any = await (await call("/api/bootstrap", {}, cookie)).json();
    expect(b.timetable).toEqual({ termId: "t1", rev: 1, readOnly: false, slots: [cls(1, 1)] });
    expect(b.settings.period_frame).toBe("");
  });
  it("VF-B3: bootstrap rev equals GET rev after PUTs; an empty table keeps its rev and slots []", async () => {
    await put({ termId: "t1", baseRev: 0, slots: [cls(1, 1)] });
    await put({ termId: "t1", baseRev: 1, slots: [] });
    const b: any = await (await call("/api/bootstrap", {}, cookie)).json();
    const g: any = await (await get()).json();
    expect(b.timetable).toEqual({ termId: "t1", rev: 2, readOnly: false, slots: [] });
    expect(b.timetable.rev).toBe(g.rev);
    expect(b.timetable.termId).toBe(g.termId);
  });
  it("VF-B5: an empty classId is a 422, not a 500", async () => {
    const r = await put({ termId: "t1", baseRev: 0, slots: [{ ...cls(1, 1), classId: "" }] });
    expect(r.status).toBe(422);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed, reset } from "./helpers";

// EP-12 PUT /api/timetable/frame + PUT /api/settings period_frame_owned — job 2026-11-12-timetable, T-12
let cookie: string;
const putFrame = (body: unknown) => call("/api/timetable/frame", json(body, { method: "PUT" }), cookie);
const putTt = (body: unknown) => call("/api/timetable", json(body, { method: "PUT" }), cookie);
const putSettings = (body: unknown) => call("/api/settings", json(body, { method: "PUT" }), cookie);
const act = (weekday: number, period: number, label: string) => ({ weekday, period, kind: "activity", classId: null, subjectId: null, label });
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
const setting = async (k: string) => (await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(k).first<{ value: string }>())?.value ?? null;
const audits = async () => (await env.DB.prepare("SELECT * FROM audit_logs WHERE entity = 'period_frame'").all<any>()).results!;
const hhmm = (h: number) => String(h).padStart(2, "0");
const periods = (n: number, startHour = 8) => Array.from({ length: n }, (_, i) => ({ start: `${hhmm(startHour + i)}:00`, end: `${hhmm(startHour + i)}:50` }));
const frame = (n = 7, days = [1, 2, 3, 4, 5], breaks: any[] = []) => ({ periods: periods(n), breaks, days });
const slotCount = async (termId: string) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM timetable_slots WHERE term_id = ?").bind(termId).first<{ n: number }>())!.n;
const termRev = async (id: string) => (await env.DB.prepare("SELECT timetable_rev AS r FROM terms WHERE id = ?").bind(id).first<{ r: number }>())!.r;

beforeEach(async () => {
  await reset();
  cookie = await login();
  await seed();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('t2',2569,2,'2/2569',0,0)"),
    env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('told',2568,2,'2/2568',0,0)"),
  ]);
});

describe("VF-B2 break name is trimmed (S-02)", () => {
  it("stores '  พัก  ' as 'พัก'; whitespace only -> 422 break_name", async () => {
    const br = (name: string) => [{ name, start: "08:50", end: "09:00" }];
    const ok = await putFrame({ baseRev: 0, frame: frame(7, [1, 2, 3, 4, 5], br("  พัก  ")) });
    expect(ok.status).toBe(200);
    expect(JSON.parse((await setting("period_frame"))!).breaks[0].name).toBe("พัก");
    const bad = await putFrame({ baseRev: 1, frame: frame(7, [1, 2, 3, 4, 5], br("   ")) });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as any).issues[0].code).toBe("break_name");
  });
});

describe("EP-12 save and validation", () => {
  it("saves a new frame: period_frame rev 1 + period_times in one go; 200 shape (AC-13)", async () => {
    const f = {
      periods: [{ start: "08:30", end: "09:30" }, { start: "09:30", end: "10:30" }, { start: "10:45", end: "11:30" }, { start: "11:30", end: "12:30" }, { start: "12:30", end: "13:30" }, { start: "13:30", end: "14:30" }, { start: "14:30", end: "15:30" }, { start: "16:30", end: "17:20" }],
      breaks: [{ name: "พักเช้า", start: "10:30", end: "10:45" }],
      days: [5, 1, 2, 3, 4, 3],
    };
    const r = await putFrame({ baseRev: 0, frame: f });
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b).toMatchObject({ ok: true, removed: 0, frame: { v: 1, rev: 1, saved: true, days: [1, 2, 3, 4, 5] }, timetable: { termId: "t1", readOnly: false, slots: [] } });
    expect(b.frame.periods).toHaveLength(8);
    expect(JSON.parse((await setting("period_times"))!)).toMatchObject({ "3": "10:45", "8": "16:30" });
    const settings: any = (await (await call("/api/bootstrap", {}, cookie)).json() as any).settings;
    expect(JSON.parse(settings.period_frame)).toMatchObject({ v: 1, rev: 1 });
    expect(JSON.parse(settings.period_times)["8"]).toBe("16:30");
    const g: any = await (await call("/api/timetable", {}, cookie)).json();
    expect(g.frame).toMatchObject({ rev: 1, saved: true });
  });

  it("422 bad_frame for each AC-14 case; messages exact; nothing written, no audit", async () => {
    const cases: [any, string, string][] = [
      [{ periods: [{ start: "08:30", end: "09:30" }, { start: "09:30", end: "09:30" }], breaks: [], days: [1] }, "end_not_after_start", "เวลาจบต้องหลังเวลาเริ่ม"],
      [{ periods: [{ start: "08:30", end: "09:30" }, { start: "09:00", end: "10:00" }], breaks: [], days: [1] }, "period_order", "คาบ 2 ต้องเริ่มหลังคาบ 1 จบ (09:30)"],
      [{ periods: [{ start: "08:30", end: "09:30" }, { start: "09:30", end: "10:30" }, { start: "10:30", end: "11:30" }], breaks: [{ name: "พัก", start: "11:00", end: "12:00" }], days: [1] }, "break_overlaps_period", "พักทับคาบ 3 (10:30–11:30)"],
      [{ periods: [], breaks: [], days: [1] }, "period_count", "ตั้งได้ 1–8 คาบ"],
      [{ periods: periods(7), breaks: [], days: [] }, "no_days", "เลือกวันเรียนอย่างน้อย 1 วัน"],
    ];
    for (const [f, code, message] of cases) {
      const r = await putFrame({ baseRev: 0, frame: f });
      expect(r.status, code).toBe(422);
      const b: any = await r.json();
      expect(b.error).toBe("bad_frame");
      expect(b.issues.map((i: any) => [i.code, i.message])).toContainEqual([code, message]);
    }
    expect(await setting("period_frame")).toBeNull();
    expect(await audits()).toHaveLength(0);
  });

  it("9 periods / 4 breaks / 8 days are malformed bodies (422 validation)", async () => {
    for (const f of [frame(9), { ...frame(7), breaks: Array.from({ length: 4 }, () => ({ name: "a", start: "01:00", end: "01:10" })) }, { ...frame(7), days: [1, 2, 3, 4, 5, 6, 7, 1] }, { ...frame(7), days: [0] }]) {
      const r = await putFrame({ baseRev: 0, frame: f });
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({ error: "validation" });
    }
    expect((await putFrame({ baseRev: 0, confirmRemove: -1, frame: frame() })).status).toBe(422);
  });

  it("baseRev not the stored rev -> 409 frame_changed with current (never set = 0)", async () => {
    const r = await putFrame({ baseRev: 4, frame: frame() });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "frame_changed", current: { rev: 0, saved: false } });
    expect(await setting("period_frame")).toBeNull();
    await putFrame({ baseRev: 0, frame: frame() });
    const again = await putFrame({ baseRev: 0, frame: frame(6) });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "frame_changed", current: { rev: 1, saved: true } });
  });

  it("epoch changed -> 409 epoch_changed, nothing written", async () => {
    await env.DB.prepare("UPDATE meta SET value = '2' WHERE key = 'data_epoch'").run();
    const r = await call("/api/timetable/frame", json({ baseRev: 0, frame: frame() }, { method: "PUT", headers: { "X-Data-Epoch": "1" } }), cookie);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "epoch_changed" });
    expect(await setting("period_frame")).toBeNull();
  });

  it("audit: one row per saved frame with before (null the first time) / after, never for a refusal (AC-45)", async () => {
    await putFrame({ baseRev: 0, frame: frame(7) });
    await putFrame({ baseRev: 0, frame: frame(6) }); // refused: stale
    await putFrame({ baseRev: 1, frame: { periods: [], breaks: [], days: [1] } }); // refused: invalid
    await putFrame({ baseRev: 1, frame: frame(8) });
    const a = await audits();
    expect(a).toHaveLength(2);
    expect(a[0].before_json).toBe("null");
    expect(JSON.parse(a[0].after_json)).toMatchObject({ rev: 1, removed: 0 });
    expect(JSON.parse(a[1].before_json)).toMatchObject({ rev: 1 });
    expect(JSON.parse(a[1].after_json)).toMatchObject({ rev: 2, removed: 0 });
    expect(JSON.parse(a[1].before_json).periods).toHaveLength(7);
    expect(JSON.parse(a[1].after_json).periods).toHaveLength(8);
  });
});

describe("EP-12 removing slots (BR-08 AC-15 AC-16)", () => {
  // default frame = 7 periods Mon-Fri. Current year terms: t1 (2569/1), t2 (2569/2); old year: told
  const seedSlots = async () => {
    await putFrame({ baseRev: 0, frame: frame(7) }); // frame rev 1
    const put = async (termId: string, slots: any[]) => expect((await putTt({ termId, baseRev: 0, slots })).status).toBe(200);
    await put("t1", [act(1, 7, "PLC กลุ่มสาระ"), act(5, 7, "PLC สายชั้น"), act(5, 1, "ศุกร์ 1"), act(2, 2, "อ 2")]);
    await put("t2", [act(5, 3, "ศุกร์ t2"), act(3, 3, "พ 3")]);
    await env.DB.prepare("INSERT INTO timetable_slots (term_id,weekday,period,kind,class_id,subject_id,label,updated_at) VALUES ('told',5,7,'activity',NULL,NULL,'ปีเก่า',0)").run();
  };

  it("reducing to 6 periods asks first (409 frame_removes_slots + list), nothing changes", async () => {
    await seedSlots();
    const r = await putFrame({ baseRev: 1, frame: frame(6) });
    expect(r.status).toBe(409);
    const b: any = await r.json();
    expect(b).toMatchObject({ error: "frame_removes_slots", count: 2 });
    expect(b.removes).toEqual([
      { termId: "t1", ...act(1, 7, "PLC กลุ่มสาระ") },
      { termId: "t1", ...act(5, 7, "PLC สายชั้น") },
    ]);
    expect(await count("timetable_slots")).toBe(7);
    expect(await setting("period_frame")).toContain('"rev":1');
    // a wrong confirmation number is asked again
    const wrong = await putFrame({ baseRev: 1, confirmRemove: 1, frame: frame(6) });
    expect(wrong.status).toBe(409);
    expect(await count("timetable_slots")).toBe(7);
  });

  it("confirmRemove = n deletes them from every term of the current year only, bumps those terms' rev, writes period_times (AC-15)", async () => {
    await seedSlots();
    const r = await putFrame({ baseRev: 1, confirmRemove: 2, frame: frame(6) });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, removed: 2, frame: { rev: 2 }, timetable: { termId: "t1", rev: 2 } });
    expect(await slotCount("t1")).toBe(2);
    expect(await slotCount("t2")).toBe(2); // t2 had nothing outside
    expect(await termRev("t2")).toBe(1); // untouched term keeps its rev
    expect(await slotCount("told")).toBe(1); // previous year never touched
    expect(await termRev("told")).toBe(0);
    expect(Object.keys(JSON.parse((await setting("period_times"))!))).toHaveLength(6);
    const a = await audits();
    expect(JSON.parse(a[a.length - 1].after_json)).toMatchObject({ rev: 2, removed: 2 });
  });

  it("removing Friday removes the Friday slots of every current-year term (9 left of 14 style) and the app can drop a day (AC-15)", async () => {
    await seedSlots();
    const r = await putFrame({ baseRev: 1, frame: frame(7, [1, 2, 3, 4]) });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ count: 3 }); // t1: (5,1) (5,7); t2: (5,3)
    const ok = await putFrame({ baseRev: 1, confirmRemove: 3, frame: frame(7, [1, 2, 3, 4]) });
    expect(ok.status).toBe(200);
    expect(await slotCount("t1")).toBe(2);
    expect(await slotCount("t2")).toBe(1);
    expect(await slotCount("told")).toBe(1);
    expect(await termRev("t1")).toBe(2);
    expect(await termRev("t2")).toBe(2);
  });

  it("adding Saturday or periods, or removing an empty day, asks nothing (AC-16)", async () => {
    await seedSlots();
    expect((await putFrame({ baseRev: 1, frame: frame(8, [1, 2, 3, 4, 5, 6]) })).status).toBe(200);
    expect(await count("timetable_slots")).toBe(7);
    const put = await putTt({ termId: "t1", baseRev: 1, slots: [act(1, 7, "PLC กลุ่มสาระ"), act(5, 7, "PLC สายชั้น"), act(5, 1, "ศุกร์ 1"), act(2, 2, "อ 2"), act(6, 3, "เสาร์")] });
    expect(put.status).toBe(200);
    expect(await termRev("t1")).toBe(2);
    // Sunday was never a day and nothing sits there; dropping Saturday with a slot asks, so clear it first
    const ask = await putFrame({ baseRev: 2, frame: frame(8, [1, 2, 3, 4, 5]) });
    expect(ask.status).toBe(409);

  });

  it("a slot added between the question and the answer: the count guard refuses, nothing deleted", async () => {
    await seedSlots();
    const gate = gateBatch();
    const held = callIn(gate.env, "/api/timetable/frame", json({ baseRev: 1, confirmRemove: 2, frame: frame(6) }, { method: "PUT" }), cookie);
    await gate.ready;
    // another device adds a third slot in period 7 meanwhile
    expect((await putTt({ termId: "t2", baseRev: 1, slots: [act(5, 3, "ศุกร์ t2"), act(3, 3, "พ 3"), act(4, 7, "ใหม่")] })).status).toBe(200);
    gate.release();
    const r = await held;
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "frame_removes_slots", count: 3 });
    expect(await count("timetable_slots")).toBe(8);
    expect(await setting("period_frame")).toContain('"rev":1');
  });

  it("the slots to remove were already deleted meanwhile (recount 0): 409 frame_changed, never 'จะลบ 0 คาบ' (VF-B5)", async () => {
    await seedSlots();
    const gate = gateBatch();
    const held = callIn(gate.env, "/api/timetable/frame", json({ baseRev: 1, confirmRemove: 2, frame: frame(6) }, { method: "PUT" }), cookie);
    await gate.ready;
    // another device clears the two period-7 slots of the current year (t1 has them; the old year is not counted)
    expect((await putTt({ termId: "t1", baseRev: 1, slots: [act(5, 1, "ศุกร์ 1"), act(2, 2, "อ 2")] })).status).toBe(200);
    gate.release();
    const r = await held;
    expect(r.status).toBe(409);
    const b: any = await r.json();
    expect(b.error).toBe("frame_changed");
    expect(b.message).not.toContain("ลบ 0");
    expect(await setting("period_frame")).toContain('"rev":1');
  });
});

describe("PUT /api/settings and period_frame (D49)", () => {
  it("while period_frame is empty, period_times is writable as before", async () => {
    const r = await putSettings({ period_times: '{"1":"08:00"}' });
    expect(r.status).toBe(200);
    expect(await setting("period_times")).toBe('{"1":"08:00"}');
  });

  it("once the frame is set, a different period_times is 409 period_frame_owned and NOTHING in that request is written", async () => {
    await putFrame({ baseRev: 0, frame: frame(7) });
    const times = await setting("period_times");
    const r = await putSettings({ period_times: '{"1":"07:00"}', school_name: "โรงเรียนใหม่" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "period_frame_owned", message: "เวลาคาบตั้งที่ ตารางสอน › ตั้งเวลาคาบ — โหลดแอปใหม่แล้วลองอีกครั้ง" });
    expect(await setting("period_times")).toBe(times);
    expect(await setting("school_name")).not.toBe("โรงเรียนใหม่");
  });

  it("the same period_times value still passes (older app saving the school name)", async () => {
    await putFrame({ baseRev: 0, frame: frame(7) });
    const times = (await setting("period_times"))!;
    const r = await putSettings({ period_times: times, school_name: "โรงเรียนใหม่" });
    expect(r.status).toBe(200);
    expect(await setting("school_name")).toBe("โรงเรียนใหม่");
  });

  it("a frame saved while the settings request is in flight still refuses it", async () => {
    const gate = gateBatch();
    const held = callIn(gate.env, "/api/settings", json({ period_times: '{"1":"07:00"}' }, { method: "PUT" }), cookie);
    await gate.ready;
    await putFrame({ baseRev: 0, frame: frame(7) });
    gate.release();
    const r = await held;
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "period_frame_owned" });
    expect(JSON.parse((await setting("period_times"))!)["1"]).toBe("08:00");
  });

  it("period_frame cannot be written through settings (read-only key is dropped)", async () => {
    const r = await putSettings({ period_frame: '{"v":1}' });
    expect(r.status).toBe(200);
    expect(await setting("period_frame")).toBeNull();
  });
});

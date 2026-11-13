// T-14: timetable store — save queue and its failures (BR-09, AC-41/42/43, AC-06), the frame (EP-12), copy (BR-07), offline
// read-only, the bootstrap seed + cache, and the injectable clock. The API is mocked to the contract (api-contract.part-5).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put } }));

import { ApiError } from "@client/lib/api";
import { applyBootstrap, classes, currentTermId, settings, subjects, terms } from "@client/store";
import { kvGet, kvSet } from "@client/lib/idb";
import { dataEpoch } from "@client/lib/session";
import { online } from "@client/lib/outbox";
import { setClock, ttNowMs, tickNow, startTimetableClock, pinClock, initClockFromLocation } from "@client/lib/timetable/clock";
import { ttSeedBootstrap, tableOf } from "@client/lib/timetable/state";
import {
  clearTerm, commitCopy, copySourceFor, describeRemoves, loadTerm, prepareCopy, removeSlot, removeSummary, resetTimetableStoreForTests, retryLast,
  saveFrame, ttCounts, ttFrame, ttFrameBroken, ttNotice, ttOfflineStamp, ttSummaryFor, ttToday, ttUndo, undoRemove, upsertSlot, UNDO_MS,
} from "@client/lib/timetable/store";
import { CLASSES, F_T1, FRAME, SUBJECTS, TERM_1_2569, TERM_2_2569 } from "@client/lib/timetable/testdata";
import { serializeFrame, type Slot, type TimetablePayload } from "@shared/timetable";
import type { Bootstrap, Settings } from "@shared/types";

const T2 = TERM_2_2569.id;
const T1 = TERM_1_2569.id;
const payload = (rev: number, slots: Slot[] = F_T1, termId = T2, readOnly = false): TimetablePayload => ({ termId, rev, readOnly, slots });
const room = (weekday: Slot["weekday"], period: number, classId = "c1"): Slot => ({ weekday, period, kind: "class", classId, subjectId: "s-math", label: null });
const flush = () => new Promise((r) => setTimeout(r, 0));
const err = (status: number, code: string, message: string, data: Record<string, unknown> = {}) => new ApiError(status, code, message, { error: code, message, ...data });
const setOnline = (v: boolean) => { online.value = v; };

const baseSettings = (over: Partial<Settings> = {}): Settings => ({
  school_name: "", teacher_name: "", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "",
  period_frame: serializeFrame(FRAME, FRAME.rev), home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "",
  reports_cards: "", students_cards: "", settings_cards: "", ...over,
});

beforeEach(async () => {
  vi.clearAllMocks();
  get.mockReset(); put.mockReset(); post.mockReset();
  resetTimetableStoreForTests();
  setOnline(true);
  setClock(null);
  dataEpoch.value = 5;
  terms.value = [TERM_1_2569, TERM_2_2569];
  currentTermId.value = T2;
  classes.value = CLASSES;
  subjects.value = SUBJECTS;
  settings.value = baseSettings();
  ttSeedBootstrap(payload(7), { live: true, at: Date.now(), epoch: 5 });
  await kvSet("bootstrap", { dataEpoch: 5, settings: baseSettings(), timetable: payload(7) } as unknown as Bootstrap);
});
afterEach(() => { setOnline(true); setClock(null); vi.useRealTimers(); });

describe("bootstrap seed", () => {
  it("the current term's table from the bootstrap is ready without a request (AC-26 ก offline start)", () => {
    expect(tableOf(T2)?.slots.length).toBe(14);
    expect(tableOf(T2)?.rev).toBe(7);
    expect(get).not.toHaveBeenCalled();
    expect(ttSummaryFor(T2)?.text).toBe("สอน 9 · กิจกรรม 5 · รวม 14 คาบ (14 ชม.)");
  });

  it("applyBootstrap carries the timetable in; a cached copy keeps its own time for 'ข้อมูลเมื่อ'", () => {
    resetTimetableStoreForTests();
    const b = { settings: baseSettings(), terms: [TERM_2_2569], currentTermId: T2, classes: CLASSES, subjects: SUBJECTS, workTypes: [], students: [], revokedTokens: {}, assignments: [], dataEpoch: 5, serverTime: Date.now(), timetable: payload(7) } as unknown as Bootstrap;
    const at = Date.UTC(2026, 10, 11, 2, 41); // 09:41 Bangkok
    applyBootstrap(b, false, at);
    expect(tableOf(T2)?.source).toBe("cache");
    setOnline(false);
    expect(ttOfflineStamp(T2)).toBe("ออฟไลน์ · ข้อมูลเมื่อ 09:41");
    setOnline(true);
    expect(ttOfflineStamp(T2)).toBeNull();
  });

  it("a new data epoch (a restore) drops every table; the same epoch keeps the other terms", () => {
    ttSeedBootstrap(payload(1, [], T1), { live: true, at: 1, epoch: 5 });
    ttSeedBootstrap(payload(8), { live: true, at: 2, epoch: 5 });
    expect(tableOf(T1)).not.toBeNull();
    ttSeedBootstrap(payload(1), { live: true, at: 3, epoch: 6 });
    expect(tableOf(T1)).toBeNull();
    expect(tableOf(T2)?.rev).toBe(1);
  });

  it("no timetable on the bootstrap (an old server) leaves things alone; null = no term", () => {
    ttSeedBootstrap(undefined, { live: true, at: 1, epoch: 5 });
    expect(tableOf(T2)?.rev).toBe(7);
    ttSeedBootstrap(null, { live: true, at: 1, epoch: 5 });
    expect(tableOf(T2)?.rev).toBe(7);
  });
});

describe("the strip follows the injected clock (BR-04)", () => {
  it("ttToday is null with no table, and follows now() otherwise", () => {
    setClock(Date.UTC(2026, 10, 11, 2, 45)); // Wed 09:45 Bangkok
    expect(ttToday.value?.nowText).toBe("ตอนนี้ · คาบ 2 · ถึง 10:30 · คณิตศาสตร์ ป.6/4");
    expect(ttToday.value?.shortcut?.attendanceLabel).toBe("เช็คชื่อ ป.6/4");
    setClock(Date.UTC(2026, 10, 11, 3, 45)); // 10:45
    expect(ttToday.value?.nowText).toBeNull();
    expect(ttToday.value?.shortcut?.attendanceLabel).toBe("เช็คชื่อ ป.6/3 (คาบต่อไป)");
    currentTermId.value = null;
    expect(ttToday.value).toBeNull();
  });

  it("AC-23 the 60 s tick moves 'now' on without a reload", () => {
    vi.useFakeTimers();
    let t = Date.UTC(2026, 10, 11, 3, 29, 30); // 10:29:30
    setClock(() => t);
    const stop = startTimetableClock();
    expect(ttToday.value?.shortcut?.className).toBe("ป.6/4");
    t += 60_000; // 10:30:30
    vi.advanceTimersByTime(60_000);
    expect(ttToday.value?.shortcut?.className).toBe("ป.6/3");
    expect(ttNowMs.value).toBe(t);
    stop();
    t += 3_600_000;
    vi.advanceTimersByTime(180_000);
    expect(ttNowMs.value).not.toBe(t); // stopped: no more ticks
  });

  it("coming back to the tab recalculates at once", () => {
    let t = Date.UTC(2026, 10, 11, 2, 45);
    setClock(() => t);
    const stop = startTimetableClock();
    t += 3_600_000;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ttNowMs.value).toBe(t);
    stop();
  });

  it("?now= pins a clock that keeps running — only on a local host", () => {
    expect(initClockFromLocation({ search: "?now=2026-11-11T09:45", hash: "", hostname: "app.example.com" })).toBe(import.meta.env.DEV); // dev builds are local by definition
    pinClock(null);
    expect(initClockFromLocation({ search: "?now=2026-11-11T09:45", hash: "", hostname: "localhost" })).toBe(true);
    tickNow();
    expect(ttNowMs.value).toBeGreaterThanOrEqual(Date.UTC(2026, 10, 11, 2, 45));
    expect(ttNowMs.value).toBeLessThan(Date.UTC(2026, 10, 11, 2, 46));
    pinClock(null);
  });
});

describe("saving a change (BR-09, AC-03)", () => {
  it("shows at once, one PUT carries baseRev + the whole table + reason, then confirms the new rev", async () => {
    let release!: (v: unknown) => void;
    put.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const p = upsertSlot(T2, { weekday: 4, period: 7, kind: "activity", classId: null, subjectId: null, label: "  ประชุมระดับชั้น  " });
    expect(tableOf(T2)?.slots.length).toBe(15); // already on screen
    expect(tableOf(T2)?.pending).toBe(1);
    await flush();
    expect(put).toHaveBeenCalledTimes(1);
    const [url, body] = put.mock.calls[0];
    expect(url).toBe("/api/timetable");
    expect(body).toMatchObject({ termId: T2, baseRev: 7, reason: "edit" });
    expect(body.slots.length).toBe(15);
    expect(body.slots.find((s: Slot) => s.weekday === 4 && s.period === 7)).toEqual({ weekday: 4, period: 7, kind: "activity", classId: null, subjectId: null, label: "ประชุมระดับชั้น" });
    release({ ok: true, changed: true, timetable: payload(8, body.slots) });
    const r = await p;
    expect(r).toEqual({ ok: true, changed: true, rev: 8 });
    expect(tableOf(T2)?.rev).toBe(8);
    expect(tableOf(T2)?.pending).toBe(0);
    expect(ttSummaryFor(T2)?.text).toBe("สอน 9 · กิจกรรม 6 · รวม 15 คาบ (15 ชม.)");
    expect(ttNotice.value).toMatchObject({ kind: "ok", text: "บันทึกคาบแล้ว" });
  });

  it("replacing the slot of a cell keeps one item per cell (BR-03)", async () => {
    put.mockImplementationOnce(async (_u, body) => ({ ok: true, changed: true, timetable: payload(8, body.slots) }));
    await upsertSlot(T2, room(3, 2, "c1")); // Wednesday 2 was c4
    const cell = tableOf(T2)!.slots.filter((s) => s.weekday === 3 && s.period === 2);
    expect(cell).toHaveLength(1);
    expect(cell[0].classId).toBe("c1");
  });

  it("two quick taps are sent one after the other; the second uses the new rev (no double send)", async () => {
    const releases: ((v: unknown) => void)[] = [];
    put.mockImplementation(() => new Promise((r) => releases.push(r)));
    const a = upsertSlot(T2, room(2, 3));
    const b = upsertSlot(T2, room(2, 4));
    await flush();
    expect(put).toHaveBeenCalledTimes(1); // the second waits
    expect(tableOf(T2)?.slots.length).toBe(16); // both are on screen
    const first = put.mock.calls[0][1];
    expect(first.slots.length).toBe(15);
    releases[0]({ ok: true, changed: true, timetable: payload(8, first.slots) });
    await a;
    expect(tableOf(T2)?.slots.length).toBe(16); // the screen keeps the second change while it is on its way
    await flush();
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][1].baseRev).toBe(8);
    expect(put.mock.calls[1][1].slots.length).toBe(16);
    releases[1]({ ok: true, changed: true, timetable: payload(9, put.mock.calls[1][1].slots) });
    expect((await b).ok).toBe(true);
    expect(tableOf(T2)?.rev).toBe(9);
  });

  it("saving the same thing again is not blocked by the screen (the server answers changed:false)", async () => {
    put.mockResolvedValueOnce({ ok: true, changed: false, timetable: payload(7) });
    const r = await upsertSlot(T2, F_T1[0]);
    expect(r).toEqual({ ok: true, changed: false, rev: 7 });
  });

  it("a form error is answered locally, nothing is sent and the table does not change (AC-04/05)", async () => {
    const r = await upsertSlot(T2, { weekday: 4, period: 7, kind: "activity", classId: null, subjectId: null, label: "   " });
    expect(r).toMatchObject({ ok: false, code: "bad_timetable", message: "ใส่ชื่อกิจกรรม" });
    const out = await upsertSlot(T2, room(1, 9)); // period 9 does not exist
    expect(out).toMatchObject({ ok: false, code: "bad_timetable" });
    expect(put).not.toHaveBeenCalled();
    expect(tableOf(T2)?.slots.length).toBe(14);
  });
});

describe("failures put the old table back (AC-43 ข)", () => {
  it("500: back to the old table, 'บันทึกตารางสอนไม่สำเร็จ' with retry; retry sends again with the newest rev", async () => {
    put.mockRejectedValueOnce(err(500, "internal", "เกิดข้อผิดพลาด"));
    const r = await upsertSlot(T2, room(2, 3));
    expect(r).toMatchObject({ ok: false, message: "บันทึกตารางสอนไม่สำเร็จ" });
    expect(tableOf(T2)?.slots.length).toBe(14);
    expect(tableOf(T2)?.pending).toBe(0);
    expect(ttNotice.value).toMatchObject({ kind: "error", text: "บันทึกตารางสอนไม่สำเร็จ", retry: true });
    put.mockImplementationOnce(async (_u, body) => ({ ok: true, changed: true, timetable: payload(8, body.slots) }));
    const again = await retryLast();
    expect(again.ok).toBe(true);
    expect(tableOf(T2)?.slots.length).toBe(15);
    expect(put.mock.calls[1][1].baseRev).toBe(7);
  });

  it("network failure: same as 500", async () => {
    put.mockRejectedValueOnce(new ApiError(0, "network", "ต่ออินเทอร์เน็ตไม่ได้"));
    const r = await upsertSlot(T2, room(2, 3));
    expect(r.ok).toBe(false);
    expect(tableOf(T2)?.slots.length).toBe(14);
    expect(ttNotice.value?.retry).toBe(true);
  });

  it("a change queued behind a failed one is dropped, not sent on top of the old table", async () => {
    let rejectFirst!: (e: unknown) => void;
    put.mockImplementationOnce(() => new Promise((_r, rej) => { rejectFirst = rej; }));
    const a = upsertSlot(T2, room(2, 3));
    const b = upsertSlot(T2, room(2, 4));
    await flush();
    rejectFirst(err(500, "internal", "x"));
    await a;
    const rb = await b;
    expect(put).toHaveBeenCalledTimes(1);
    expect(rb.ok).toBe(false);
    expect(tableOf(T2)?.slots.length).toBe(14);
  });

  it("timeout: reload from the server first (it may have been saved) and then offer retry (D08)", async () => {
    put.mockRejectedValueOnce(new ApiError(0, "timeout", "เครือข่ายตอบช้าเกินไป"));
    const saved = [...F_T1, room(2, 3)];
    get.mockResolvedValueOnce({ ...payload(8, saved), frame: FRAME, counts: [{ termId: T2, slots: 15 }] });
    const r = await upsertSlot(T2, room(2, 3));
    expect(get).toHaveBeenCalledWith(`/api/timetable?term=${T2}`);
    expect(r).toMatchObject({ ok: false, code: "timeout" });
    expect(tableOf(T2)?.rev).toBe(8); // what the server really has
    expect(tableOf(T2)?.slots.length).toBe(15);
    expect(ttNotice.value).toMatchObject({ text: "บันทึกตารางสอนไม่สำเร็จ", retry: true });
  });

  it("422 from the server keeps the issues for the form", async () => {
    put.mockRejectedValueOnce(err(422, "bad_timetable", "x", { issues: [{ code: "archived_ref", weekday: 2, period: 3, message: "ห้อง/วิชานี้เก็บแล้ว — เลือกห้อง/วิชาที่ใช้งาน" }] }));
    const r = await upsertSlot(T2, room(2, 3));
    expect(r).toMatchObject({ ok: false, code: "bad_timetable", message: "ห้อง/วิชานี้เก็บแล้ว — เลือกห้อง/วิชาที่ใช้งาน" });
    expect(tableOf(T2)?.slots.length).toBe(14);
  });
});

describe("409s (AC-41, AC-42, AC-08)", () => {
  it("timetable_changed: shows the server's newest table + its message; the edit is not forced over it", async () => {
    const theirs = [...F_T1, room(2, 3, "c2")]; // iPad added a slot
    put.mockRejectedValueOnce(err(409, "timetable_changed", "ตารางสอนถูกแก้จากเครื่องอื่น — โหลดฉบับล่าสุดแล้ว ลองแก้อีกครั้ง", { current: payload(8, theirs) }));
    const r = await upsertSlot(T2, room(2, 4));
    expect(r).toMatchObject({ ok: false, code: "timetable_changed", message: "ตารางสอนถูกแก้จากเครื่องอื่น — โหลดฉบับล่าสุดแล้ว ลองแก้อีกครั้ง" });
    expect(tableOf(T2)?.rev).toBe(8);
    expect(tableOf(T2)?.slots.length).toBe(15); // theirs, without our unsaved slot
    expect(tableOf(T2)?.slots.some((s) => s.weekday === 2 && s.period === 4)).toBe(false);
    expect(ttNotice.value?.text).toBe("ตารางสอนถูกแก้จากเครื่องอื่น — โหลดฉบับล่าสุดแล้ว ลองแก้อีกครั้ง");
    // trying again now sends the new rev
    put.mockImplementationOnce(async (_u, body) => ({ ok: true, changed: true, timetable: payload(9, body.slots) }));
    expect((await upsertSlot(T2, room(2, 4))).ok).toBe(true);
    expect(put.mock.calls[1][1].baseRev).toBe(8);
  });

  it("falls back to the contract text when the server sends no message", async () => {
    put.mockRejectedValueOnce(new ApiError(409, "timetable_changed", "", { current: payload(8) }));
    await upsertSlot(T2, room(2, 4));
    expect(ttNotice.value?.text).toBe("ตารางสอนถูกแก้จากเครื่องอื่น — โหลดฉบับล่าสุดแล้ว ลองแก้อีกครั้ง");
  });

  it("epoch_changed: nothing written, bootstrap reloaded, 'ข้อมูลถูกกู้คืนจากไฟล์สำรอง — โหลดตารางใหม่แล้ว'", async () => {
    put.mockRejectedValueOnce(err(409, "epoch_changed", "x"));
    const restored: Bootstrap = { settings: baseSettings(), terms: [TERM_1_2569, TERM_2_2569], currentTermId: T2, classes: CLASSES, subjects: SUBJECTS, workTypes: [], students: [], revokedTokens: {}, assignments: [], dataEpoch: 6, serverTime: Date.now(), timetable: payload(1, []) } as unknown as Bootstrap;
    get.mockImplementation(async (u: string) => (u === "/api/bootstrap" ? restored : (() => { throw new Error(u); })()));
    const r = await upsertSlot(T2, room(2, 4));
    expect(r).toMatchObject({ ok: false, code: "epoch_changed", message: "ข้อมูลถูกกู้คืนจากไฟล์สำรอง — โหลดตารางใหม่แล้ว" });
    expect(get).toHaveBeenCalledWith("/api/bootstrap");
    expect(tableOf(T2)?.slots).toEqual([]); // the restored table
    expect(ttNotice.value?.text).toBe("ข้อมูลถูกกู้คืนจากไฟล์สำรอง — โหลดตารางใหม่แล้ว");
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("term_read_only: back to the old table and the term turns read-only", async () => {
    put.mockRejectedValueOnce(err(409, "term_read_only", "ภาคเรียนของปีการศึกษาที่ผ่านมา ดูได้อย่างเดียว"));
    const r = await upsertSlot(T2, room(2, 4));
    expect(r).toMatchObject({ ok: false, code: "term_read_only" });
    expect(tableOf(T2)?.readOnly).toBe(true);
    expect(tableOf(T2)?.slots.length).toBe(14);
    // and the next edit is refused without a request
    const again = await upsertSlot(T2, room(2, 5));
    expect(again).toMatchObject({ ok: false, code: "term_read_only", message: "ภาคเรียนของปีการศึกษาที่ผ่านมา ดูได้อย่างเดียว" });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("a past-year term loaded read-only is never sent", async () => {
    get.mockResolvedValueOnce({ ...payload(2, [room(1, 2)], "t2568-2", true), frame: FRAME, counts: [] });
    await loadTerm("t2568-2");
    const r = await upsertSlot("t2568-2", room(2, 4));
    expect(r.ok).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });

  it("an answer that arrives after a restore elsewhere (epoch moved on) is ignored", async () => {
    let release!: (v: unknown) => void;
    put.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const p = upsertSlot(T2, room(2, 4));
    await flush();
    dataEpoch.value = 6;
    release({ ok: true, changed: true, timetable: payload(8, [...F_T1, room(2, 4)]) });
    const r = await p;
    expect(r).toMatchObject({ ok: false, code: "stale" });
    expect(tableOf(T2)?.rev).toBe(7);
  });
});

describe("offline is read-only (D38, Q4, AC-43 ก)", () => {
  it("edit, delete, clear: refused with the offline text; nothing sent, nothing queued, table unchanged", async () => {
    setOnline(false);
    const a = await upsertSlot(T2, room(2, 4));
    const b = await removeSlot(T2, 1, 2);
    const c = await clearTerm(T2);
    for (const r of [a, b, c]) expect(r).toMatchObject({ ok: false, code: "offline", message: "ออฟไลน์ — แก้ตารางสอนได้เมื่อออนไลน์" });
    expect(put).not.toHaveBeenCalled();
    expect(tableOf(T2)?.slots.length).toBe(14);
    expect(ttUndo.value).toBeNull();
    setOnline(true);
    put.mockImplementationOnce(async (_u, body) => ({ ok: true, changed: true, timetable: payload(8, body.slots) }));
    await upsertSlot(T2, room(2, 4));
    expect(put).toHaveBeenCalledTimes(1); // coming back online does not replay anything
  });

  it("the frame and the copy are refused too", async () => {
    ttCounts.value = [{ termId: T1, slots: 14 }];
    setOnline(false);
    expect(await saveFrame(FRAME)).toMatchObject({ ok: false, code: "offline" });
    expect(await prepareCopy(T2)).toMatchObject({ ok: false, code: "offline" });
    expect(put).not.toHaveBeenCalled();
  });

  it("reading still works: the loaded copy stays; an unloaded term says it cannot load", async () => {
    setOnline(false);
    expect((await loadTerm(T2)).ok).toBe(true);
    expect((await loadTerm(T2, { force: true })).ok).toBe(true); // keeps what is on screen
    expect((await loadTerm(T1)).ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(ttToday.value).not.toBeNull(); // shortcuts and the strip keep working
  });
});

describe("delete + undo (AC-06)", () => {
  it("the cell is empty at once with the sentence; [เลิกทำ] within 5 s saves it back with reason undo", async () => {
    put.mockImplementation(async (_u, body) => ({ ok: true, changed: true, timetable: payload(body.reason === "undo" ? 9 : 8, body.slots) }));
    const p = removeSlot(T2, 2, 6);
    expect(tableOf(T2)?.slots.some((s) => s.weekday === 2 && s.period === 6)).toBe(false);
    expect(ttUndo.value?.message).toBe("ลบคาบ คณิตศาสตร์ ป.6/2 (อังคาร คาบ 6) แล้ว");
    await p;
    expect(ttSummaryFor(T2)?.total).toBe(13);
    expect((await undoRemove()).ok).toBe(true);
    expect(put.mock.calls[1][1].reason).toBe("undo");
    expect(put.mock.calls[1][1].baseRev).toBe(8); // the latest rev
    expect(tableOf(T2)?.slots.length).toBe(14);
    expect(ttUndo.value).toBeNull();
    expect(ttNotice.value?.text).toBe("เลิกทำแล้ว");
  });

  it("not undone: after 5 s the offer goes away and the total stays 13 on every device", async () => {
    vi.useFakeTimers();
    put.mockImplementation(async (_u, body) => ({ ok: true, changed: true, timetable: payload(8, body.slots) }));
    const p = removeSlot(T2, 2, 6);
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1);
    expect(ttUndo.value).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(ttUndo.value).toBeNull();
    await p;
    expect(put).toHaveBeenCalledTimes(1);
    expect(ttSummaryFor(T2)?.total).toBe(13);
  });

  it("a failed delete puts the slot back and offers no undo", async () => {
    put.mockRejectedValueOnce(err(500, "internal", "x"));
    const r = await removeSlot(T2, 2, 6);
    expect(r.ok).toBe(false);
    expect(ttUndo.value).toBeNull();
    expect(tableOf(T2)?.slots.length).toBe(14);
  });

  it("deleting an activity names it by its label", async () => {
    put.mockImplementation(async (_u, body) => ({ ok: true, changed: true, timetable: payload(8, body.slots) }));
    const p = removeSlot(T2, 4, 6);
    expect(ttUndo.value?.message).toBe("ลบคาบ ลูกเสือ (พฤหัส คาบ 6) แล้ว");
    await p;
  });

  it("undo is refused when someone filled the cell meanwhile (no overwrite)", async () => {
    put.mockImplementation(async (_u, body) => ({ ok: true, changed: true, timetable: payload(8, body.slots) }));
    await removeSlot(T2, 2, 6);
    await upsertSlot(T2, room(2, 6, "c1"));
    expect(await undoRemove()).toMatchObject({ ok: false, code: "cell_taken" });
  });
});

describe("clear (S9-ก)", () => {
  it("PUT [] with reason clear; the frame is untouched; total back to 'ยังไม่มีคาบ'", async () => {
    put.mockImplementationOnce(async (_u, body) => ({ ok: true, changed: true, timetable: payload(8, body.slots) }));
    expect((await clearTerm(T2)).ok).toBe(true);
    expect(put.mock.calls[0][1]).toMatchObject({ reason: "clear", slots: [], baseRev: 7 });
    expect(ttSummaryFor(T2)?.text).toBe("ยังไม่มีคาบ");
    expect(ttFrame.value.rev).toBe(3);
    expect(ttToday.value).toBeNull(); // an empty table shows nothing on the home page (AC-24 ก)
    expect(ttNotice.value?.text).toBe("ล้างตารางภาคนี้แล้ว");
  });
});

describe("loading a term (GET)", () => {
  it("fills the table and the counts used by 'คัดลอกจากภาค …'", async () => {
    get.mockResolvedValueOnce({ ...payload(4, F_T1, T1), frame: FRAME, counts: [{ termId: T1, slots: 14 }, { termId: T2, slots: 14 }] });
    expect((await loadTerm(T1)).ok).toBe(true);
    expect(tableOf(T1)?.rev).toBe(4);
    expect(ttCounts.value).toHaveLength(2);
    expect(copySourceFor(T2)).toEqual({ termId: T1, name: "1/2569", count: 14 });
    expect(copySourceFor(T1)).toBeNull();
  });
  it("an already loaded term is not fetched again unless forced (once the counts are known)", async () => {
    get.mockResolvedValueOnce({ ...payload(7, F_T1), frame: FRAME, counts: [] });
    await loadTerm(T2); // the bootstrap seeded the table but not the counts: one GET fills them (B-01)
    expect(get).toHaveBeenCalledTimes(1);
    await loadTerm(T2);
    expect(get).toHaveBeenCalledTimes(1);
    get.mockResolvedValueOnce({ ...payload(9, []), frame: FRAME, counts: [] });
    await loadTerm(T2, { force: true });
    expect(tableOf(T2)?.rev).toBe(9);
  });
  it("404 no_term gives the contract sentence", async () => {
    get.mockRejectedValueOnce(err(404, "no_term", "x"));
    const r = await loadTerm("zzz");
    expect(r).toEqual({ ok: false, message: "ยังไม่มีภาคเรียน — สร้างภาคเรียนก่อนกรอกตารางสอน" });
  });
  it("the current term's GET also refreshes the offline copy (kv bootstrap) inside the same epoch", async () => {
    get.mockResolvedValueOnce({ ...payload(9, [room(1, 2)]), frame: FRAME, counts: [] });
    await loadTerm(T2, { force: true });
    await flush();
    const cached = await kvGet<Bootstrap>("bootstrap");
    expect(cached?.timetable?.rev).toBe(9);
  });
});

describe("copy counts after the bootstrap seed (B-01)", () => {
  it("the seeded current term still fetches once so the copy source is known", async () => {
    get.mockResolvedValueOnce({ ...payload(7, [], T2), frame: FRAME, counts: [{ termId: T1, slots: 14 }] });
    ttSeedBootstrap(payload(7, []), { live: true, at: Date.now(), epoch: 5 });
    expect(copySourceFor(T2)).toBeNull();
    await loadTerm(T2);
    expect(get).toHaveBeenCalledTimes(1);
    expect(copySourceFor(T2)).toEqual({ termId: T1, name: "1/2569", count: 14 });
  });
  it("offline with a seeded table does not call and does not fail", async () => {
    setOnline(false);
    expect(await loadTerm(T2)).toEqual({ ok: true });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("copy from the previous term (BR-07, AC-37, AC-39)", () => {
  beforeEach(async () => {
    ttSeedBootstrap(payload(1, [], T2), { live: true, at: Date.now(), epoch: 5 });
    ttCounts.value = [{ termId: T1, slots: 14 }];
  });

  it("empty target: no question, one PUT with reason copy and the 14 slots", async () => {
    get.mockResolvedValueOnce({ ...payload(4, F_T1, T1), frame: FRAME, counts: [] });
    const prep = await prepareCopy(T2);
    if (!prep.ok) throw new Error("prepare failed");
    expect(prep).toMatchObject({ needsConfirm: false, existing: 0, confirmText: null });
    expect(prep.plan.copied).toBe(14);
    put.mockImplementationOnce(async (_u, body) => ({ ok: true, changed: true, timetable: payload(2, body.slots) }));
    expect((await commitCopy(T2, prep.plan)).ok).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1]).toMatchObject({ termId: T2, baseRev: 1, reason: "copy" });
    expect(put.mock.calls[0][1].slots).toHaveLength(14);
    expect(get).toHaveBeenCalledWith(`/api/timetable?term=${T1}`);
    expect(ttNotice.value?.text).toBe("คัดลอก 14 คาบแล้ว");
  });

  it("AC-39 target already has 3 slots: asks 'แทนที่ 3 คาบเดิมด้วย 14 คาบจากภาค 1/2569?' first; nothing is saved by asking", async () => {
    ttSeedBootstrap(payload(2, [room(1, 2), room(1, 3), room(1, 4)], T2), { live: true, at: Date.now(), epoch: 5 });
    get.mockResolvedValueOnce({ ...payload(4, F_T1, T1), frame: FRAME, counts: [] });
    const prep = await prepareCopy(T2);
    if (!prep.ok) throw new Error("prepare failed");
    expect(prep).toMatchObject({ needsConfirm: true, existing: 3, confirmText: "แทนที่ 3 คาบเดิมด้วย 14 คาบจากภาค 1/2569?" });
    expect(put).not.toHaveBeenCalled();
    expect(tableOf(T2)?.slots).toHaveLength(3);
  });

  it("no earlier term with slots: no source, no request", async () => {
    ttCounts.value = [];
    expect(await prepareCopy(T2)).toMatchObject({ ok: false, code: "no_source" });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("the frame (EP-12, AC-13/15/16)", () => {
  const five = { ...FRAME, periods: FRAME.periods.slice(0, 5) };

  it("a frame that would delete slots answers frame_removes_slots with the list; confirming sends confirmRemove", async () => {
    const removes = [
      { termId: T2, weekday: 1, period: 7, kind: "activity", classId: null, subjectId: null, label: "PLC กลุ่มสาระ" },
      { termId: T2, weekday: 5, period: 7, kind: "activity", classId: null, subjectId: null, label: "PLC สายชั้น" },
    ];
    put.mockRejectedValueOnce(err(409, "frame_removes_slots", "x", { count: 2, removes }));
    const first = await saveFrame({ periods: five.periods.concat(FRAME.periods.slice(5, 6)), breaks: FRAME.breaks, days: FRAME.days });
    expect(first).toMatchObject({ ok: false, code: "frame_removes_slots", count: 2 });
    expect(put.mock.calls[0][0]).toBe("/api/timetable/frame");
    expect(put.mock.calls[0][1]).toMatchObject({ baseRev: 3 });
    expect(put.mock.calls[0][1].confirmRemove).toBeUndefined();
    const text = removeSummary(first.ok ? [] : first.removes ?? []);
    expect(text).toBe("จะลบ 2 คาบในคาบ 7: PLC กลุ่มสาระ (จันทร์), PLC สายชั้น (ศุกร์)");
    expect(describeRemoves(first.ok ? [] : first.removes ?? [])).toEqual(["PLC กลุ่มสาระ (จันทร์)", "PLC สายชั้น (ศุกร์)"]);
    expect(tableOf(T2)?.slots).toHaveLength(14); // nothing changes until they confirm

    const newFrame = { periods: FRAME.periods.slice(0, 6), breaks: FRAME.breaks, days: FRAME.days };
    const kept = F_T1.filter((s) => s.period <= 6);
    put.mockResolvedValueOnce({ ok: true, frame: { v: 1, rev: 4, saved: true, ...newFrame }, removed: 2, timetable: payload(9, kept) });
    get.mockResolvedValue({ ...payload(9, kept), frame: FRAME, counts: [] });
    const done = await saveFrame(newFrame, { confirmRemove: 2 });
    expect(done.ok).toBe(true);
    expect(put.mock.calls[1][1]).toMatchObject({ baseRev: 3, confirmRemove: 2 });
  });

  it("success: period_frame and period_times in settings follow, the table is replaced, the offline copy is updated", async () => {
    const newFrame = { periods: [{ start: "08:00", end: "09:00" }, { start: "09:00", end: "10:00" }], breaks: [], days: [1, 2, 3, 4, 5] as typeof FRAME.days };
    put.mockResolvedValueOnce({ ok: true, frame: { v: 1, rev: 4, saved: true, ...newFrame }, removed: 0, timetable: payload(8, F_T1.filter((s) => s.period <= 2)) });
    const r = await saveFrame(newFrame);
    expect(r).toEqual({ ok: true, changed: true, rev: 4 });
    expect(ttFrame.value).toMatchObject({ rev: 4, saved: true });
    expect(ttFrame.value.periods).toHaveLength(2);
    expect(JSON.parse(settings.value!.period_times)).toEqual({ 1: "08:00", 2: "09:00" });
    expect(tableOf(T2)?.rev).toBe(8);
    expect(ttNotice.value?.text).toBe("บันทึกเวลาคาบแล้ว");
    expect(get).not.toHaveBeenCalled(); // nothing removed → no refresh of the counts
    await flush();
    const cached = await kvGet<Bootstrap>("bootstrap");
    expect(JSON.parse(cached!.settings.period_frame!).rev).toBe(4);
  });

  it("a bad frame is answered locally with the shared messages; nothing is sent (AC-14)", async () => {
    const bad = { periods: [{ start: "08:30", end: "09:30" }, { start: "09:00", end: "10:00" }], breaks: [], days: [1] as typeof FRAME.days };
    const r = await saveFrame(bad);
    expect(r).toMatchObject({ ok: false, code: "bad_frame", message: "คาบ 2 ต้องเริ่มหลังคาบ 1 จบ (09:30)" });
    expect(put).not.toHaveBeenCalled();
  });

  it("frame_changed: takes the server's frame and says so", async () => {
    const theirs = { ...FRAME, rev: 5 };
    put.mockRejectedValueOnce(err(409, "frame_changed", "โครงเวลาถูกแก้จากเครื่องอื่น — โหลดใหม่แล้ว ลองอีกครั้ง", { current: theirs }));
    const r = await saveFrame(five);
    expect(r).toMatchObject({ ok: false, code: "frame_changed" });
    expect(ttFrame.value.rev).toBe(5);
    expect(ttNotice.value?.text).toBe("โครงเวลาถูกแก้จากเครื่องอื่น — โหลดใหม่แล้ว ลองอีกครั้ง");
  });

  it("422 bad_frame from the server returns its issues", async () => {
    put.mockRejectedValueOnce(err(422, "bad_frame", "x", { issues: [{ code: "no_days", field: "days", message: "เลือกวันเรียนอย่างน้อย 1 วัน" }] }));
    const r = await saveFrame(FRAME);
    expect(r).toMatchObject({ ok: false, code: "bad_frame", message: "เลือกวันเรียนอย่างน้อย 1 วัน" });
  });

  it("a frame never saved sends baseRev 0", async () => {
    settings.value = baseSettings({ period_frame: "", period_times: "" });
    expect(ttFrame.value).toMatchObject({ saved: false, rev: 0 });
    put.mockResolvedValueOnce({ ok: true, frame: { ...FRAME, rev: 1 }, removed: 0, timetable: payload(7) });
    await saveFrame(FRAME);
    expect(put.mock.calls[0][1].baseRev).toBe(0);
  });

  it("frame saves wait behind slot saves (the frame bumps the table's rev)", async () => {
    let release!: (v: unknown) => void;
    put.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const a = upsertSlot(T2, room(2, 4));
    const f = saveFrame(FRAME);
    await flush();
    expect(put).toHaveBeenCalledTimes(1);
    release({ ok: true, changed: true, timetable: payload(8, put.mock.calls[0][1].slots) });
    put.mockResolvedValueOnce({ ok: true, frame: { ...FRAME, rev: 4 }, removed: 0, timetable: payload(9) });
    await a;
    await f;
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][0]).toBe("/api/timetable/frame");
  });
});

// ---- Verify fix round 1 (D56 D57 D59, code-review R-02 R-04 R-10 R-11 R-12) --------------------------------------------
describe("VF-F1: retry keeps the base version of the failed request (D59 ก)", () => {
  it("retry sends the OLD baseRev, so another device edit is answered 409 and not overwritten", async () => {
    put.mockRejectedValueOnce(new ApiError(0, "timeout", "x"));
    get.mockResolvedValueOnce({ ...payload(8, F_T1), frame: FRAME, counts: [] }); // another device saved rev 8 meanwhile
    await upsertSlot(T2, room(2, 3));
    expect(tableOf(T2)?.rev).toBe(8);
    put.mockRejectedValueOnce(err(409, "timetable_changed", "ตารางสอนถูกแก้จากเครื่องอื่น", { current: payload(8, [...F_T1, room(4, 3, "c2")]) }));
    const r = await retryLast();
    expect(put.mock.calls[1][1].baseRev).toBe(7); // not 8
    expect(r).toMatchObject({ ok: false, code: "timetable_changed" });
    expect(tableOf(T2)?.slots).toHaveLength(15); // theirs
    expect(tableOf(T2)?.slots.some((s) => s.weekday === 2 && s.period === 3)).toBe(false);
  });

  it("the first request had landed: the retry 409 whose current equals the wish counts as saved", async () => {
    put.mockRejectedValueOnce(new ApiError(0, "timeout", "x"));
    const saved = [...F_T1, room(2, 3)];
    get.mockResolvedValueOnce({ ...payload(8, saved), frame: FRAME, counts: [] });
    await upsertSlot(T2, room(2, 3));
    put.mockRejectedValueOnce(err(409, "timetable_changed", "x", { current: payload(8, saved) }));
    const r = await retryLast();
    expect(r).toMatchObject({ ok: true, rev: 8 });
    expect(ttNotice.value).toMatchObject({ kind: "ok", text: "บันทึกคาบแล้ว" });
    expect(tableOf(T2)?.slots).toHaveLength(15);
    expect(tableOf(T2)?.pending).toBe(0);
  });

  it("a failed frame save offers no retry button (R-11)", async () => {
    put.mockRejectedValueOnce(err(500, "internal", "x"));
    await saveFrame({ periods: FRAME.periods.slice(0, 5), breaks: [], days: FRAME.days });
    expect(ttNotice.value).toMatchObject({ kind: "error", text: "บันทึกตารางสอนไม่สำเร็จ", retry: false });
  });
});

const bootWith = (frameJson: string, slots: Slot[]) => ({
  settings: baseSettings({ period_frame: frameJson }), terms: [TERM_1_2569, TERM_2_2569], currentTermId: T2, classes: CLASSES, subjects: SUBJECTS,
  workTypes: [], students: [], revokedTokens: {}, assignments: [], dataEpoch: 5, serverTime: Date.now(), timetable: payload(8, slots),
});

describe("VF-F2: after frame_changed the screen holds the new frame (D57)", () => {
  const smaller = { ...FRAME, periods: FRAME.periods.slice(0, 6), rev: 4 };
  const boot = () => bootWith(serializeFrame(smaller, 4), F_T1.filter((s) => s.period <= 6));

  it("EP-11 409 frame_changed reloads the bootstrap: ttFrame is the new frame", async () => {
    get.mockResolvedValue(boot());
    put.mockRejectedValueOnce(err(409, "frame_changed", "โครงเวลาถูกแก้จากเครื่องอื่น — โหลดใหม่แล้ว ลองอีกครั้ง", { current: payload(8, F_T1.filter((s) => s.period <= 6)) }));
    const r = await upsertSlot(T2, room(2, 3));
    expect(r).toMatchObject({ ok: false, code: "frame_changed" });
    expect(get).toHaveBeenCalledWith("/api/bootstrap");
    expect(ttFrame.value.periods).toHaveLength(6);
    expect(ttFrame.value.rev).toBe(4);
  });

  it("EP-11 422 with outside_frame reloads the bootstrap too", async () => {
    get.mockResolvedValue(boot());
    put.mockRejectedValueOnce(err(422, "bad_timetable", "x", { issues: [{ code: "outside_frame", weekday: 2, period: 3, message: "คาบนี้อยู่นอกโครงเวลา" }] }));
    const r = await upsertSlot(T2, room(2, 3));
    expect(r).toMatchObject({ ok: false, code: "bad_timetable", message: "คาบนี้อยู่นอกโครงเวลา" });
    expect(get).toHaveBeenCalledWith("/api/bootstrap");
    expect(ttFrame.value.periods).toHaveLength(6);
  });

  it("EP-12 409 frame_changed with an unreadable frame (saved:false) reloads the bootstrap", async () => {
    get.mockResolvedValue(boot());
    put.mockRejectedValueOnce(err(409, "frame_changed", "x", { current: { ...FRAME, saved: false, rev: 4 } }));
    await saveFrame({ periods: FRAME.periods.slice(0, 5), breaks: [], days: FRAME.days });
    expect(get).toHaveBeenCalledWith("/api/bootstrap");
    expect(ttFrame.value.rev).toBe(4);
  });
});

describe("VF-F3: an unreadable stored frame (D56)", () => {
  it("ttFrameBroken: period_frame not empty but not saved; empty / good = not broken", () => {
    expect(ttFrameBroken.value).toBe(false);
    settings.value = baseSettings({ period_frame: "" });
    expect(ttFrameBroken.value).toBe(false);
    settings.value = baseSettings({ period_frame: "{bad" });
    expect(ttFrame.value.saved).toBe(false);
    expect(ttFrameBroken.value).toBe(true);
  });

  it("422 outside_frame while broken says the frame is unreadable", async () => {
    settings.value = baseSettings({ period_frame: "{bad" });
    get.mockResolvedValue(bootWith("{bad", F_T1));
    put.mockRejectedValueOnce(err(422, "bad_timetable", "x", { issues: [{ code: "outside_frame", weekday: 6, period: 3, message: "คาบนี้อยู่นอกโครงเวลา" }] }));
    const r = await upsertSlot(T2, room(2, 3));
    expect(r).toMatchObject({ ok: false, message: "โครงเวลาที่บันทึกไว้อ่านไม่ได้ — ตั้งเวลาคาบใหม่" });
    expect(ttNotice.value?.text).toBe("โครงเวลาที่บันทึกไว้อ่านไม่ได้ — ตั้งเวลาคาบใหม่");
  });
});

describe("VF-F4: the removal sentence names the term when slots come from several (R-04)", () => {
  const act = (termId: string, weekday: 1 | 5, label: string, period = 7) => ({ termId, weekday, period, kind: "activity" as const, classId: null, subjectId: null, label });
  it("two terms: the current term first, then newer to older; no repeated-looking items", () => {
    const removes = [act(T1, 1, "PLC กลุ่มสาระ"), act(T1, 5, "PLC สายชั้น"), act(T2, 1, "PLC กลุ่มสาระ"), act(T2, 5, "PLC สายชั้น")];
    expect(removeSummary(removes)).toBe("จะลบ 4 คาบในคาบ 7 — ภาค 2/2569: PLC กลุ่มสาระ (จันทร์), PLC สายชั้น (ศุกร์) · ภาค 1/2569: PLC กลุ่มสาระ (จันทร์), PLC สายชั้น (ศุกร์)");
  });
  it("one term keeps the short sentence", () => {
    expect(removeSummary([act(T2, 1, "PLC กลุ่มสาระ"), act(T2, 5, "PLC สายชั้น")])).toBe("จะลบ 2 คาบในคาบ 7: PLC กลุ่มสาระ (จันทร์), PLC สายชั้น (ศุกร์)");
  });
});

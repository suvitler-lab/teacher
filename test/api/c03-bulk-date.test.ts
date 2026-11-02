// c03-submit-date (gaps C-03): "ทั้งห้องส่งแล้ว" with a received date (EP-03 v3), undo (EP-04), late follows the due date
// (EP-05), what the screens read (EP-02 / gradebook / reports / dashboard / backup) and the database budget (AC-24).
// Written by QA (T-01) BEFORE the fix, from requirements.md + api-contract.md v3 — black-box. Expected numbers were
// computed by hand in test-plan.md before running. [guard] = passes on 0312e8d already and must keep passing.
//
// Fixture (fictional): today = 2026-11-02 09:00 Bangkok = 1793584800000 (fake Date). a1 full 10, open, c1,
// assigned 2026-10-26, due 2026-10-30. Class c1 is grown to 32 for AC-09: 25 no row · 2 void · 3 submitted · 2 excused.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, json, login, seed } from "./helpers";
import { metered } from "./meter";
import { takeBackup, restoreFrom } from "./backup-helpers";
import { bkkToday } from "../../shared/time";
import { percentOf } from "../../shared/metrics";

const NOW = 1793584800000; //       2026-11-02 09:00 ไทย
const NOON_1029 = 1793250000000;
const NOON_1030 = 1793336400000;
const DAY = 86_400_000;
const VOID_AT = 1793000000123; //    a void cell that still carries an old submitted_at (restored to the ms)
const NINE = "status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at";

let cookie: string;
let seq = 0;
const at = (ms: number) => vi.setSystemTime(ms);
const tick = (ms = 1000) => vi.setSystemTime(Date.now() + ms);

const one = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
const all = async (sql: string, ...b: unknown[]) => ((await env.DB.prepare(sql).bind(...b).all<any>()).results ?? []) as any[];
const cellOf = (sid: string, aid = "a1") => one<any>(`SELECT ${NINE} FROM submissions WHERE assignment_id = ? AND student_id = ?`, aid, sid);
async function cells(aid = "a1") {
  const out: Record<string, any> = {};
  for (const r of await all(`SELECT student_id, ${NINE} FROM submissions WHERE assignment_id = ? ORDER BY student_id`, aid)) {
    const { student_id, ...rest } = r;
    out[student_id] = rest;
  }
  return out;
}
const maxAuditId = async () => ((await one<any>("SELECT COALESCE(MAX(id),0) AS m FROM audit_logs")).m as number);
const auditsAfter = (id: number) => all("SELECT * FROM audit_logs WHERE id > ? ORDER BY id", id);

const bulk = async (body: Record<string, unknown>, aid = "a1", e?: typeof env) => {
  const init = json({ classId: "c1", ...body });
  const res = e ? await callIn(e, `/api/assignments/${aid}/bulk`, init, cookie) : await call(`/api/assignments/${aid}/bulk`, init, cookie);
  return { status: res.status, body: (await res.json()) as any };
};
const undo = async (batchId: string) => {
  const res = await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);
  return { status: res.status, body: (await res.json()) as any };
};
function op(o: Record<string, unknown> = {}) {
  if (o.clientTs === undefined) tick();
  return {
    opId: `c03b-${++seq}-${Math.random().toString(36).slice(2, 8)}`, scanSessionId: "R1", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: 8, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
async function batch(ops: Record<string, unknown>[], e?: typeof env) {
  const init = json({ ops });
  const res = e ? await callIn(e, "/api/submissions/batch", init, cookie) : await call("/api/submissions/batch", init, cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as any).results as any[];
}

function put(sid: string, o: { status?: string; score?: number | null; late?: number; at?: number | null; method?: string }, aid = "a1") {
  const subAt = o.at === undefined ? NOW - 3600_000 : o.at;
  const ev = subAt ?? NOW - 3600_000;
  return env.DB.prepare(
    `INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(aid, sid, o.status ?? "submitted", o.score === undefined ? 7 : o.score, o.late ?? 0, subAt, o.method ?? "grid", "dev_fixture", null, ev, ev);
}
/** Students `${prefix}01..` in class `cls`, numbered from `from`. */
async function students(prefix: string, n: number, cls: string, from = 1) {
  const ids: string[] = [];
  const stmts = [];
  for (let i = 0; i < n; i++) {
    const id = `${prefix}${String(i + 1).padStart(2, "0")}`;
    ids.push(id);
    stmts.push(env.DB.prepare(
      "INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,'ด.ญ.',?,'สมมติ',?,?,'active',0)",
    ).bind(id, `${prefix}-${i + 1}`, `Q-${prefix.toUpperCase()}${String(i + 1).padStart(8, "0")}`, `นักเรียน ${i + 1}`, cls, from + i));
  }
  await env.DB.batch(stmts);
  return ids;
}
async function addClass(id: string) {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES (?,?,'ป.6',30,0,2569,0)").bind(id, `ป.6/${id}`),
    env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES ('a1',?)").bind(id),
  ]);
}

/** AC-09 room: c1 = st1, st2 + b01..b30 = 32. void b01 (carries VOID_AT), b02 · submitted b03..b05 · excused b06, b07 · 25 no row. */
const ROOM = { voids: ["b01", "b02"], submitted: ["b03", "b04", "b05"], excused: ["b06", "b07"], empty: [] as string[] };
async function room32() {
  const extra = await students("b", 30, "c1", 3);
  await env.DB.batch([
    put("b01", { status: "void", score: null, at: VOID_AT }),
    put("b02", { status: "void", score: null, at: null }),
    put("b03", { score: 5, at: NOON_1029 }),
    put("b04", { score: 6, at: NOON_1029 }),
    put("b05", { score: 7, at: NOON_1029 }),
    put("b06", { status: "excused", score: null, at: null }),
    put("b07", { status: "excused", score: null, at: null }),
  ]);
  ROOM.empty = ["st1", "st2", ...extra.slice(7)];
  expect(ROOM.empty).toHaveLength(25);
}
const CHANGED = () => [...ROOM.empty, ...ROOM.voids];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);
  cookie = await login();
  await seed();
  await env.DB.prepare("UPDATE assignments SET assigned_date = '2026-10-26', due_date = '2026-10-30' WHERE id = 'a1'").run();
});
afterEach(() => { vi.useRealTimers(); });

describe("C-03 AC-09 (BR-06): ทั้งห้องส่งแล้ว with a received date", () => {
  beforeEach(room32);

  it("TC-13 AC-09: 32 kids + 2026-10-30 → changed 27, noon 10-30 late 0, the 5 others untouched, 27 bulk audits in one batch with after.submitted_at", async () => {
    const before = await cells(); const mark = await maxAuditId();
    const r = await bulk({ action: "all-submitted", receivedDate: "2026-10-30" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, changed: 27 });
    for (const sid of CHANGED()) {
      expect({ sid, ...(await cellOf(sid)) }).toMatchObject({ sid, status: "submitted", score: null, submitted_at: NOON_1030, late: 0 });
    }
    for (const sid of [...ROOM.submitted, ...ROOM.excused]) expect({ sid, c: await cellOf(sid) }).toEqual({ sid, c: before[sid] });
    const audits = (await auditsAfter(mark)).filter((a) => a.entity === "submission");
    expect(audits).toHaveLength(27);
    expect(new Set(audits.map((a) => a.action))).toEqual(new Set(["bulk"]));
    expect(new Set(audits.map((a) => a.batch_id))).toEqual(new Set([r.body.batchId]));
    for (const a of audits) expect({ sid: a.student_id, at: JSON.parse(a.after_json).submitted_at }).toEqual({ sid: a.student_id, at: NOON_1030 });
  });

  it("TC-14 AC-09 [guard]: no receivedDate → submitted_at = now, late 1 (as before)", async () => {
    tick();
    const t = Date.now();
    const r = await bulk({ action: "all-submitted" });
    expect(r.body).toMatchObject({ ok: true, changed: 27 });
    for (const sid of CHANGED()) expect({ sid, ...(await cellOf(sid)) }).toMatchObject({ sid, submitted_at: t, late: 1 });
  });

  it("TC-49 edge: the same request twice at once → 27 changed in total, 27 bulk audits, all at noon 10-30", async () => {
    const mark = await maxAuditId();
    const [a, b] = await Promise.all([
      bulk({ action: "all-submitted", receivedDate: "2026-10-30" }),
      bulk({ action: "all-submitted", receivedDate: "2026-10-30" }),
    ]);
    const changed = [a, b].reduce((n, x) => n + (x.status === 200 ? x.body.changed : 0), 0);
    expect(changed).toBe(27);
    expect((await auditsAfter(mark)).filter((x) => x.action === "bulk")).toHaveLength(27);
    for (const sid of CHANGED()) expect({ sid, at: (await cellOf(sid)).submitted_at }).toEqual({ sid, at: NOON_1030 });
  });
});

describe("C-03 AC-10 (BR-02/06): a wrong date or a date with another action → 400, nothing changes", () => {
  beforeEach(room32);

  for (const [what, body, code] of [
    ["future 2026-11-03", { action: "all-submitted", receivedDate: "2026-11-03" }, "received_date_future"],
    ["before assigned 2026-10-25", { action: "all-submitted", receivedDate: "2026-10-25" }, "received_date_before_assigned"],
    ["malformed 30/10/2026", { action: "all-submitted", receivedDate: "30/10/2026" }, "received_date_invalid"],
    ["Buddhist year 2569-10-30", { action: "all-submitted", receivedDate: "2569-10-30" }, "received_date_invalid"],
    ["full-score + a date", { action: "full-score", receivedDate: "2026-10-30" }, "received_date_not_applicable"],
    ["clear + a date", { action: "clear", receivedDate: "2026-10-30" }, "received_date_not_applicable"],
  ] as const) {
    it(`TC-15 AC-10: ${what} → 400 ${code}, Thai message, no cell or audit changes`, async () => {
      const before = await cells(); const mark = await maxAuditId();
      const r = await bulk(body);
      expect({ status: r.status, error: r.body.error }).toEqual({ status: 400, error: code });
      expect(String(r.body.message ?? "")).toMatch(/[฀-๿]/);
      expect(await cells()).toEqual(before);
      expect(await auditsAfter(mark)).toEqual([]);
    });
  }

  it("TC-16 AC-10 (v3 order): checks that need no database come first; then not_found / closed / class; then before_assigned", async () => {
    const before = await cells();
    const missing = await bulk({ action: "all-submitted", receivedDate: "2026-11-03" }, "nope");
    expect({ s: missing.status, e: missing.body.error }).toEqual({ s: 400, e: "received_date_future" });
    const wrongClass = await bulk({ action: "all-submitted", classId: "c2", receivedDate: "2026-10-25" });
    expect({ s: wrongClass.status, e: wrongClass.body.error }).toEqual({ s: 400, e: "class_not_assigned" });
    const notApplicable = await bulk({ action: "full-score", receivedDate: "30/10/2026" });
    expect({ s: notApplicable.status, e: notApplicable.body.error }).toEqual({ s: 400, e: "received_date_not_applicable" });
    await env.DB.prepare("UPDATE assignments SET status = 'closed' WHERE id = 'a1'").run();
    const closed = await bulk({ action: "all-submitted", receivedDate: "2026-10-25" });
    expect({ s: closed.status, e: closed.body.error }).toEqual({ s: 409, e: "assignment_closed" });
    expect(await cells()).toEqual(before);
  });

  it("TC-16 AC-21 [guard]: receivedDate null with clear is the same as absent → 200", async () => {
    const r = await bulk({ action: "clear", receivedDate: null });
    expect(r.status).toBe(200);
  });
});

describe("C-03 AC-11 (BR-06): undo restores submitted_at to the ms", () => {
  beforeEach(room32);

  it("TC-17 AC-11: undo B1 → changed 27; empty/void back to void, VOID_AT restored to the ms, others null; 27 restore audits; undo again → alreadyUndone", async () => {
    const before = await cells();
    const b1 = await bulk({ action: "all-submitted", receivedDate: "2026-10-30" });
    expect(b1.body.changed).toBe(27);
    expect((await cellOf("st1")).submitted_at).toBe(NOON_1030);
    const mark = await maxAuditId();
    const u = await undo(b1.body.batchId);
    expect(u.status).toBe(200);
    expect(u.body).toMatchObject({ ok: true, changed: 27 });
    expect(await cellOf("b01")).toMatchObject({ status: "void", submitted_at: VOID_AT, late: 0 });
    for (const sid of [...ROOM.empty, "b02"]) expect({ sid, ...(await cellOf(sid)) }).toMatchObject({ sid, status: "void", submitted_at: null, late: 0 });
    for (const sid of [...ROOM.submitted, ...ROOM.excused]) expect(await cellOf(sid)).toEqual(before[sid]);
    const restores = (await auditsAfter(mark)).filter((a) => a.entity === "submission");
    expect(restores.map((a) => a.action)).toEqual(new Array(27).fill("restore"));
    const again = await undo(b1.body.batchId);
    expect(again.body).toMatchObject({ ok: true, changed: 0, alreadyUndone: true });
  });

  it("TC-18 AC-11: ก re-dated (dateOnly) after B1 → undo 409 modified_since, nothing restored, no audit", async () => {
    const b1 = await bulk({ action: "all-submitted", receivedDate: "2026-10-30" });
    const r = await batch([op({ method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: "2026-10-29", score: null })]);
    expect(r[0].result).toBe("ok");
    expect((await cellOf("st1")).submitted_at).toBe(NOON_1029);
    const before = await cells(); const mark = await maxAuditId();
    const u = await undo(b1.body.batchId);
    expect({ s: u.status, e: u.body.error }).toEqual({ s: 409, e: "modified_since" });
    expect(await cells()).toEqual(before);
    expect(await auditsAfter(mark)).toEqual([]);
  });
});

describe("C-03 AC-23 (server part — the dialog is ui-redesign): 45 kids + date → undo", () => {
  it("TC-38 AC-23: class c3 of 45 → all-submitted 10-30 → changed 45 at noon late 0 → undo changed 45, all void", async () => {
    await addClass("c3");
    const kids = await students("k", 45, "c3");
    const r = await bulk({ action: "all-submitted", classId: "c3", receivedDate: "2026-10-30" });
    expect(r.status).toBe(200);
    expect(r.body.changed).toBe(45);
    const rows = await all("SELECT submitted_at, late FROM submissions WHERE assignment_id='a1' AND student_id LIKE 'k%'");
    expect(rows).toHaveLength(45);
    expect(new Set(rows.map((x) => `${x.submitted_at}/${x.late}`))).toEqual(new Set([`${NOON_1030}/0`]));
    const u = await undo(r.body.batchId);
    expect(u.body).toMatchObject({ ok: true, changed: 45 });
    for (const sid of kids) expect((await cellOf(sid)).status).toBe("void");
  });
});

describe("C-03 AC-17 (BR-03) [guard]: moving the due date re-decides late, the received date never moves", () => {
  const save = (due: string | null) => call("/api/assignments", json({
    id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
    assigned_date: "2026-10-26", due_date: due, publish_scores: true, status: "open", class_ids: ["c1"],
  }), cookie);

  it("TC-28 AC-17: ก 10-30 noon late 0 → due 10-29 late 1 → no due late 0 → due 10-30 late 0; submitted_at fixed", async () => {
    await put("st1", { score: 7, at: NOON_1030, late: 0 }).run();
    const steps: [string | null, number][] = [["2026-10-29", 1], [null, 0], ["2026-10-30", 0]];
    for (const [due, late] of steps) {
      expect((await save(due)).status).toBe(200);
      expect({ due, ...(await cellOf("st1")) }).toMatchObject({ due, late, submitted_at: NOON_1030 });
    }
  });
});

describe("C-03 AC-19 / AC-21 (server part): EP-02 returns the received date the screens will show", () => {
  it("TC-31 AC-19 [guard]: ก 10-30 noon on time · ข 11-02 = 3 days after due, late · ค on a work with no due date, not late", async () => {
    await env.DB.batch([
      put("st1", { score: 7, at: NOON_1030, late: 0 }),
      put("st2", { score: 7, at: NOW, late: 1 }),
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a2','t1','s1','wt_worksheet','ใบงาน 2',10,'2026-10-26',NULL,1,'open',0,0)"),
      env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES ('a2','c1')"),
      put("st2", { score: 7, at: NOW, late: 0 }, "a2"),
    ]);
    const s1 = (await (await call("/api/assignments/a1/submissions", {}, cookie)).json()) as any;
    const ko = s1.submissions.find((x: any) => x.student_id === "st1");
    const kho = s1.submissions.find((x: any) => x.student_id === "st2");
    expect({ day: bkkToday(ko.submitted_at), late: ko.late }).toEqual({ day: "2026-10-30", late: false });
    expect({ day: bkkToday(kho.submitted_at), late: kho.late }).toEqual({ day: "2026-11-02", late: true });
    expect((Date.parse(bkkToday(kho.submitted_at)) - Date.parse("2026-10-30")) / DAY).toBe(3);
    const s2 = (await (await call("/api/assignments/a2/submissions", {}, cookie)).json()) as any;
    expect(s2.submissions.find((x: any) => x.student_id === "st2")).toMatchObject({ late: false, submitted_at: NOW });
  });

  it("TC-36 AC-21 [guard]: GET submissions keeps its shape", async () => {
    const body = (await (await call("/api/assignments/a1/submissions", {}, cookie)).json()) as any;
    expect(Array.isArray(body.submissions)).toBe(true);
    expect(typeof body.serverTime).toBe("number");
    expect(body.snapshot).toBe(true);
  });

  it("TC-50 edge [guard]: bulk with a date while logged out → 401, nothing changes", async () => {
    const res = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1", receivedDate: "2026-10-30" }));
    expect(res.status).toBe(401);
    expect(await cells()).toEqual({});
  });
});

describe("C-03 AC-20 (BR-10 💰): re-dating changes only the late count", () => {
  /** 30 kids in c1 (st1, st2 + b01..b28), each handed in 8/10 on 11-02 (late). */
  async function thirtyLate() {
    const extra = await students("b", 28, "c1", 3);
    const kids = ["st1", "st2", ...extra];
    const rs = await batch(kids.map((sid) => op({ studentId: sid, score: 8 })));
    expect(rs.every((r) => r.result === "ok")).toBe(true);
    return kids;
  }
  async function numbers() {
    const s = (await (await call("/api/assignments/a1/submissions", {}, cookie)).json()) as any;
    const sub = s.submissions.filter((x: any) => x.status === "submitted");
    const scored = sub.filter((x: any) => x.score != null);
    const sum = scored.reduce((t: number, x: any) => t + x.score, 0);
    const rp = (await (await call("/api/reports/summary?class=c1&term=t1", {}, cookie)).json()) as any;
    const db = (await (await call("/api/dashboard?term=t1&date=2026-11-02", {}, cookie)).json()) as any;
    const dash = db.openAssignments.find((x: any) => x.assignment.id === "a1").perClass.find((p: any) => p.classId === "c1");
    return {
      lateEp02: sub.filter((x: any) => x.late).length,
      lateReports: rp.submissions.filter((x: any) => x.assignment_id === "a1" && x.late).length,
      lateDashboard: dash.late,
      submitted: sub.length,
      sum, whole: scored.length * 10, pct: percentOf(sum, scored.length * 10),
    };
  }

  it("TC-33 AC-20: late 30 → 2 after 28 re-dates to 10-30; Σ 240/300 = 80 % and 30 submitted unchanged", async () => {
    const kids = await thirtyLate();
    expect(await numbers()).toEqual({ lateEp02: 30, lateReports: 30, lateDashboard: 30, submitted: 30, sum: 240, whole: 300, pct: 80 });
    const rs = await batch(kids.slice(2).map((sid) => op({ studentId: sid, method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: "2026-10-30", score: 8 })));
    expect(rs.map((r) => r.result)).toEqual(new Array(28).fill("ok"));
    expect(await numbers()).toEqual({ lateEp02: 2, lateReports: 2, lateDashboard: 2, submitted: 30, sum: 240, whole: 300, pct: 80 });
  });

  it("TC-34 AC-20 [guard]: backup → restore keeps submitted_at and late of every cell", async () => {
    await env.DB.batch([put("st1", { score: 7, at: NOON_1030, late: 0 }), put("st2", { score: 8, at: NOW, late: 1 })]);
    const before = await all("SELECT student_id, submitted_at, late FROM submissions WHERE assignment_id='a1' ORDER BY student_id");
    const b = await takeBackup(cookie);
    await env.DB.prepare("UPDATE submissions SET submitted_at = 0, late = 1").run();
    const res = await restoreFrom(cookie, b);
    expect(res.status).toBe(200);
    expect(await all("SELECT student_id, submitted_at, late FROM submissions WHERE assignment_id='a1' ORDER BY student_id")).toEqual(before);
  });
});

describe("C-03 AC-24 (BR-11): a received date costs no extra statement or row", () => {
  async function measure(run: (e: typeof env) => Promise<unknown>) {
    const m = metered();
    await run(m.env);
    return { queries: m.stats.queries, rowsRead: m.stats.rowsRead, rowsWritten: m.stats.rowsWritten, measured: m.stats.measured };
  }
  const wipe = () => env.DB.batch([
    env.DB.prepare("DELETE FROM audit_logs WHERE entity = 'submission'"),
    env.DB.prepare("DELETE FROM submissions"),
  ]);

  it("TC-39 AC-24: bulk 32 kids and a batch of 50 ops — with receivedDate ≤ without (statements, rows read, rows written)", async () => {
    await room32();
    const fixture = await all(`SELECT assignment_id, student_id, ${NINE} FROM submissions`);
    const refill = () => env.DB.batch(fixture.map((r) => env.DB.prepare(
      `INSERT INTO submissions (assignment_id, student_id, ${NINE}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(r.assignment_id, r.student_id, r.status, r.score, r.late, r.submitted_at, r.method, r.device_id, r.scan_session_id, r.updated_at, r.event_at)));

    const bulkPlain = await measure((e) => bulk({ action: "all-submitted" }, "a1", e));
    await wipe(); await refill(); tick();
    const bulkDated = await measure((e) => bulk({ action: "all-submitted", receivedDate: "2026-10-30" }, "a1", e));

    await wipe();
    await addClass("c4");
    const fifty = await students("f", 50, "c4");
    const plainOps = fifty.map((sid) => op({ studentId: sid }));
    const batchPlain = await measure((e) => batch(plainOps, e));
    await wipe(); tick();
    const datedOps = fifty.map((sid) => op({ studentId: sid, receivedDate: "2026-10-30" }));
    const batchDated = await measure((e) => batch(datedOps, e));

    console.log("AC24 " + JSON.stringify({ bulkPlain, bulkDated, batchPlain, batchDated }));
    for (const [plain, dated, what] of [[bulkPlain, bulkDated, "bulk 32"], [batchPlain, batchDated, "batch 50"]] as const) {
      expect({ what, q: dated.queries <= plain.queries }).toEqual({ what, q: true });
      if (plain.measured && dated.measured) {
        expect({ what, read: dated.rowsRead <= plain.rowsRead, written: dated.rowsWritten <= plain.rowsWritten })
          .toEqual({ what, read: true, written: true });
      }
    }
  });
});

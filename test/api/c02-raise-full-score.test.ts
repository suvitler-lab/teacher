// integrity-c02 (gaps C-02 · D32): raising an assignment's full score must ask whether the children who had the OLD
// full score get the NEW full score ("ปรับ" = default) and land everything in one batch with one batch_id.
// Written by QA BEFORE the fix, from requirements.md (BR-01..BR-10, AC-01..AC-15) only — black-box against
// POST /api/assignments (EP-ใหม่, Tech Lead names it EP-05), POST /api/assignments/:id/bulk-undo (EP-04, reused for
// "ย้อนกลับ"), POST /api/submissions/batch (EP-01, unchanged) and GET /api/assignments/:id/submissions (EP-02).
//
// Tests tagged [guard] already pass on 2285c17 and must keep passing after the fix (old behaviour BR-06/BR-07/BR-10).
// Every other test is expected to FAIL on 2285c17 (the raise is saved silently, nobody is adjusted) and pass after it.
//
// ── CONTRACT ───────────────────────────────────────────────────────────────────────────────────────────────────────
// docs/team/api-contract.md v2 · EP-05 (Tech Lead, 2026-11-02). The first draft of this file used provisional names
// (raise_full / expected_full_score / full_score_raise_unconfirmed / adjusted / batchId at top level); QA switched them
// to EP-05 v2 before handing over. If EP-05 changes, QA (not Dev) updates ONLY this block + test-plan.md §10.
const C = {
  choice: "raise_choice", //            request: "adjust" = ปรับเป็นเต็มใหม่ · "keep" = คงไว้ (optional; absent = old app)
  ADJUST: "adjust",
  KEEP: "keep",
  expected: "raise_from", //             request: the OLD full score the dialog showed (required with raise_choice)
  confirmError: "raise_choice_required", // 409 (count/from/to + Thai message for old apps)
  count: "count", //                     field of that 409 body
  staleError: "full_score_changed", //   409 when DB full score != raise_from (+ currentFullScore)
  cellMethod: "bulk", //                 method written on adjusted cells
  cellAction: "bulk", //                 audit action of each adjusted cell (EP-04 reads action = 'bulk' of the batch)
};
/** 200 body `raise` (null when nothing was asked). */
const raiseOf = (body: any) => body?.raise as { choice: string; from: number; to: number; count: number; batchId: string | null } | null | undefined;
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Fixture "F" (requirements §AC, fictional): a1 "ใบงาน 1" full 10, open, given to c1 AND c2.
//   c1: ก st1 = submitted 10 (hid, late 0, on time) · ข st2 = submitted 10 (bulk, late 1) · ค st3 = submitted 7 (grid)
//       ง st4 = submitted, no score (รอตรวจ) · จ st5 = excused · ฉ st6 = void · ช st7 = no row · ฌ st8 = no row (scans later)
//   c2: ซ st9 = submitted 10 (grid), student status "moved".
// Full holders (BR-01) = ก, ข, ซ = 3.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";
import { percentOf } from "../../shared/metrics";

const DAY = 86_400_000;
const bkkDay = (daysAgo: number) => new Date(Date.now() + 7 * 3600_000 - daysAgo * DAY).toISOString().slice(0, 10);
const DUE = bkkDay(3);
const T_ON_TIME = Date.now() - 5 * DAY; // before the due date -> late 0
const T_LATE = Date.now() - 1 * DAY; //    after the due date  -> late 1

const KO = "st1", KHO = "st2", KHAW = "st3", NGO = "st4", CHO = "st5", CHING = "st6", CHANG = "st7", CHOE = "st8", SO = "st9";
const HOLDERS = [KO, KHO, SO];
const OTHERS = [KHAW, NGO, CHO, CHING, CHANG];
const NINE = "status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at";

let cookie: string;

const A1 = () => ({
  id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
  assigned_date: bkkDay(10), due_date: DUE, publish_scores: true, status: "open", class_ids: ["c1", "c2"],
});
/** Save a1 (or another assignment body) exactly as an app would. `extra` = the new choice fields (absent = old app). */
const save = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, e?: typeof env) =>
  e ? callIn(e, "/api/assignments", json({ ...A1(), ...over, ...extra }), cookie)
    : call("/api/assignments", json({ ...A1(), ...over, ...extra }), cookie);
const choose = (choice: string, from = 10) => ({ [C.choice]: choice, [C.expected]: from });
const raise = (to: number, choice: string, from = 10, e?: typeof env) => save({ full_score: to }, choose(choice, from), e);
const undo = (batchId: string, id = "a1") => call(`/api/assignments/${id}/bulk-undo`, json({ batchId }), cookie);

const one = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
const all = async (sql: string, ...b: unknown[]) => ((await env.DB.prepare(sql).bind(...b).all<any>()).results ?? []) as any[];
const fullOf = async (id = "a1") => (await one<any>("SELECT full_score FROM assignments WHERE id = ?", id)).full_score as number;
const cellOf = (sid: string, aid = "a1") =>
  one<any>(`SELECT ${NINE} FROM submissions WHERE assignment_id = ? AND student_id = ?`, aid, sid);
const cells = async (aid = "a1") => {
  const out: Record<string, any> = {};
  for (const r of await all(`SELECT student_id, ${NINE} FROM submissions WHERE assignment_id = ? ORDER BY student_id`, aid)) {
    const { student_id, ...rest } = r;
    out[student_id] = rest;
  }
  return out;
};
const maxAuditId = async () => ((await one<any>("SELECT COALESCE(MAX(id), 0) AS m FROM audit_logs")).m as number);
const auditsAfter = (id: number) => all("SELECT * FROM audit_logs WHERE id > ? ORDER BY id", id);
const scoreOf = async (sid: string, aid = "a1") => (await cellOf(sid, aid))?.score ?? null;

async function student(id: string, code: string, first: string, cls: string, no: number, status = "active") {
  await env.DB.prepare(
    "INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,'ด.ช.',?,'ทดสอบ',?,?,?,0)",
  ).bind(id, code, `Q-C02${code.padStart(7, "0")}`, first, cls, no, status).run();
}
function sub(aid: string, sid: string, o: { status?: string; score: number | null; late?: number; at?: number | null; method?: string; scn?: string | null }) {
  const at = o.at === undefined ? T_ON_TIME : o.at;
  return env.DB.prepare(
    `INSERT INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(aid, sid, o.status ?? "submitted", o.score, o.late ?? 0, at, o.method ?? "grid", "dev_fixture", o.scn ?? null, at ?? T_ON_TIME, at ?? T_ON_TIME);
}

/** Fixture F (see header). */
async function fixtureF() {
  await env.DB.batch([
    env.DB.prepare("UPDATE assignments SET due_date = ?, assigned_date = ? WHERE id = 'a1'").bind(DUE, bkkDay(10)),
    env.DB.prepare("INSERT INTO assignment_classes (assignment_id, class_id) VALUES ('a1','c2')"),
    env.DB.prepare("UPDATE students SET first_name = 'ซ', status = 'moved' WHERE id = 'st9'"),
  ]);
  await student(KHAW, "103", "ค", "c1", 3);
  await student(NGO, "104", "ง", "c1", 4);
  await student(CHO, "105", "จ", "c1", 5);
  await student(CHING, "106", "ฉ", "c1", 6);
  await student(CHANG, "107", "ช", "c1", 7);
  await student(CHOE, "108", "ฌ", "c1", 8);
  await env.DB.batch([
    sub("a1", KO, { score: 10, late: 0, at: T_ON_TIME, method: "hid", scn: "scn_r1" }),
    sub("a1", KHO, { score: 10, late: 1, at: T_LATE, method: "bulk" }),
    sub("a1", KHAW, { score: 7, method: "grid" }),
    sub("a1", NGO, { score: null, method: "hid", scn: "scn_r1" }),
    sub("a1", CHO, { status: "excused", score: null, at: null, method: "grid" }),
    sub("a1", CHING, { status: "void", score: null, at: null, method: "manual" }),
    sub("a1", SO, { score: 10, method: "grid" }),
  ]);
}

/** A hand-in from a scanner (EP-01), e.g. ฌ scanned full 10 on another device. */
const scan = async (sid: string, score: number | null, fullAtScan: number, o: Record<string, unknown> = {}) => {
  const res = await call("/api/submissions/batch", json({ ops: [{
    opId: `c02-${sid}-${Math.random().toString(36).slice(2, 9)}`, scanSessionId: "scn_other", assignmentId: "a1", studentId: sid,
    status: "submitted", score, fullScoreAtScan: fullAtScan, method: "hid", clientTs: Date.now(), ...o,
  }] }), cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as any).results[0];
};
const grade = (sid: string, score: number, fullAtScan: number) => scan(sid, score, fullAtScan, { method: "grid", scanSessionId: "gb" });

/** Nothing of a refused request may have landed: full score, every cell, no new audit row. */
async function nothingChanged(fullBefore: number, cellsBefore: Record<string, any>, auditMark: number) {
  expect(await fullOf()).toBe(fullBefore);
  expect(await cells()).toEqual(cellsBefore);
  expect(await auditsAfter(auditMark)).toEqual([]);
}

beforeEach(async () => { cookie = await login(); await seed(); await fixtureF(); });

describe("C-02 AC-01 / BR-01 / BR-02: raise 10 → 20 and choose ปรับ", () => {
  it("TC-01 AC-01: the server asks first — a raise with no choice is refused 409 with count 3 (ก ข ซ) and nothing lands", async () => {
    const before = await cells(); const mark = await maxAuditId();
    const res = await save({ full_score: 20 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ error: C.confirmError, [C.count]: 3, from: 10, to: 20 });
    await nothingChanged(10, before, mark);
  });

  it("TC-02 AC-01: ปรับ → full 20 · ก ข ซ score 20 (status/late/submitted_at kept) · ค ง จ ฉ ช untouched · adjusted 3", async () => {
    const before = await cells();
    const t0 = Date.now();
    const res = await raise(20, C.ADJUST);
    expect(res.status).toBe(200);
    expect(await fullOf()).toBe(20);
    for (const sid of HOLDERS) {
      const c = await cellOf(sid);
      expect({ sid, score: c.score }).toEqual({ sid, score: 20 }); // on 2285c17: 10 (the bug)
      expect({ status: c.status, late: c.late, submitted_at: c.submitted_at })
        .toEqual({ status: before[sid].status, late: before[sid].late, submitted_at: before[sid].submitted_at });
      expect(c.updated_at).toBeGreaterThanOrEqual(t0);
      expect(c.event_at).toBeGreaterThanOrEqual(t0);
      expect(c.method).toBe(C.cellMethod);
    }
    for (const sid of OTHERS) expect({ sid, cell: await cellOf(sid) }).toEqual({ sid, cell: before[sid] ?? null });
    const r = raiseOf(await res.json());
    expect(r).toMatchObject({ choice: C.ADJUST, from: 10, to: 20, count: 3 });
    expect(typeof r?.batchId).toBe("string");
  });

  it("TC-03 AC-01 / BR-02 example: ก {submitted, 10, late 0, 09:00} → {submitted, 20, late 0, 09:00}; ข keeps late 1", async () => {
    await raise(20, C.ADJUST);
    expect(await cellOf(KO)).toMatchObject({ status: "submitted", score: 20, late: 0, submitted_at: T_ON_TIME });
    expect(await cellOf(KHO)).toMatchObject({ status: "submitted", score: 20, late: 1, submitted_at: T_LATE });
  });

  it("TC-04 BR-01: a closed assignment is asked too (closing only blocks hand-ins)", async () => {
    const res = await save({ full_score: 20, status: "closed" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any)[C.count]).toBe(3);
    const ok = await save({ full_score: 20, status: "closed" }, choose(C.ADJUST));
    expect(ok.status).toBe(200);
    expect(await scoreOf(KO)).toBe(20);
  });

  it("TC-05 BR-01: half-step 9.5 under full 10 is not a full holder (exact match only)", async () => {
    await env.DB.prepare("UPDATE submissions SET score = 9.5 WHERE assignment_id='a1' AND student_id = ?").bind(KHAW).run();
    const res = await save({ full_score: 20 });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any)[C.count]).toBe(3);
    await raise(20, C.ADJUST);
    expect(await scoreOf(KHAW)).toBe(9.5);
  });
});

describe("C-02 AC-02 / BR-02: choose คงไว้", () => {
  it("TC-06 AC-02: คงไว้ → full 20, every cell unchanged (ก ข ซ 10/20), no submission audit, work audit says keep + 3", async () => {
    const before = await cells(); const mark = await maxAuditId();
    const res = await raise(20, C.KEEP);
    expect(res.status).toBe(200);
    expect(await fullOf()).toBe(20);
    expect(await cells()).toEqual(before);
    const audits = await auditsAfter(mark);
    expect(audits.filter((a) => a.entity === "submission")).toEqual([]);
    const work = audits.filter((a) => a.entity === "assignment" && a.entity_id === "a1");
    expect(work).toHaveLength(1);
    expect(JSON.parse(work[0].before_json)).toMatchObject({ full_score: 10 });
    const after = JSON.parse(work[0].after_json);
    expect(after).toMatchObject({ full_score: 20 });
    expect({ choice: after.raise?.choice, count: after.raise?.count }).toEqual({ choice: C.KEEP, count: 3 });
    expect(work[0].batch_id).toBeTruthy(); // EP-05: keep also gets a new batch id on the work line
    expect(raiseOf(await res.json())).toMatchObject({ choice: C.KEEP, from: 10, to: 20, count: 3, batchId: null });
  });
});

describe("C-02 AC-03 / BR-04: a failed write leaves nothing half-done", () => {
  it("TC-07 AC-03 [guard]: data epoch changes before the write → 409 epoch_changed, nothing lands", async () => {
    const before = await cells(); const mark = await maxAuditId();
    const g = gateBatch();
    const pending = raise(20, C.ADJUST, 10, g.env);
    await g.ready;
    await env.DB.prepare("UPDATE meta SET value = '2' WHERE key = 'data_epoch'").run();
    g.release();
    const res = await pending;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "epoch_changed" });
    await nothingChanged(10, before, mark);
  });

  // The year guard (M1-03) runs for classes being ADDED (or a term move) — so the same save also adds an empty class c3,
  // which moves to another school year while the request is held. (Changing c2's year with the class list unchanged
  // is not guarded on 2285c17 either — out of scope, noted in test-plan §10.)
  it("TC-08 AC-03 [guard]: the save also adds class c3, which moves to another school year before the write → 422 class_year_mismatch, nothing lands", async () => {
    await env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c3','ป.6/3','ป.6',30,0,2569,0)").run();
    const before = await cells(); const mark = await maxAuditId();
    const g = gateBatch();
    const pending = save({ full_score: 20, class_ids: ["c1", "c2", "c3"] }, choose(C.ADJUST), g.env);
    await g.ready;
    await env.DB.prepare("UPDATE classes SET year = 2570 WHERE id = 'c3'").run();
    g.release();
    const res = await pending;
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "class_year_mismatch" });
    await nothingChanged(10, before, mark);
  });

  // A statement in the middle of the write fails (SQLite trigger RAISE). If the full score, the cells and the audit
  // rows are in ONE batch, all of it rolls back. If any part is written separately, the full score stays at 20.
  for (const [what, ddl] of [
    ["updating an adjusted cell", "CREATE TRIGGER c02_fail BEFORE UPDATE OF score ON submissions WHEN NEW.score = 20 BEGIN SELECT RAISE(ABORT, 'c02 injected'); END"],
    ["writing a cell's audit row", "CREATE TRIGGER c02_fail BEFORE INSERT ON audit_logs WHEN NEW.entity = 'submission' BEGIN SELECT RAISE(ABORT, 'c02 injected'); END"],
  ] as const) {
    it(`TC-09 AC-03: a statement fails while ${what} → 5xx, full stays 10, ก ข ซ stay 10, no new audit`, async () => {
      const before = await cells(); const mark = await maxAuditId();
      await env.DB.prepare(ddl).run();
      const res = await raise(20, C.ADJUST);
      await env.DB.prepare("DROP TRIGGER c02_fail").run();
      expect(res.status).toBeGreaterThanOrEqual(500); // on 2285c17: 200 (no cell is touched, the raise lands)
      await nothingChanged(10, before, mark);
    });
  }
});

describe("C-02 AC-04 / BR-04: one batch_id for the work line and the 3 cell lines", () => {
  it("TC-10 AC-04: 4 new audit rows (work 1 + cells 3) share one batch_id; cell rows a1:<student> 10 → 20", async () => {
    const mark = await maxAuditId();
    const res = await raise(20, C.ADJUST);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const audits = await auditsAfter(mark);
    const cellRows = audits.filter((a) => a.entity === "submission");
    expect(cellRows.map((a) => a.student_id).sort()).toEqual([...HOLDERS].sort()); // on 2285c17: []
    for (const a of cellRows) {
      expect(a.entity_id).toBe(`a1:${a.student_id}`);
      expect(a.assignment_id).toBe("a1");
      expect(a.action).toBe(C.cellAction);
      expect(JSON.parse(a.before_json)).toMatchObject({ score: 10 });
      expect(JSON.parse(a.after_json)).toMatchObject({ score: 20 });
    }
    const work = audits.filter((a) => a.entity === "assignment" && a.entity_id === "a1");
    expect(work).toHaveLength(1);
    expect(JSON.parse(work[0].before_json)).toMatchObject({ full_score: 10 });
    const after = JSON.parse(work[0].after_json);
    expect(after).toMatchObject({ full_score: 20 });
    expect({ choice: after.raise?.choice, count: after.raise?.count }).toEqual({ choice: C.ADJUST, count: 3 });
    expect(audits).toHaveLength(4);
    const ids = new Set(audits.map((a) => a.batch_id));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
    expect(raiseOf(body)?.batchId).toBe([...ids][0]);
  });
});

describe("C-02 AC-05 / BR-05: who is adjusted is decided when writing, not when asking", () => {
  it("TC-11 AC-05: dialog said 3 → ฌ scanned full 10 on another device → ปรับ adjusts 4 (ฌ = 20)", async () => {
    const ask = await save({ full_score: 20 });
    expect(ask.status).toBe(409);
    expect(((await ask.json()) as any)[C.count]).toBe(3);
    expect((await scan(CHOE, 10, 10)).result).toBe("ok");
    const res = await raise(20, C.ADJUST);
    expect(res.status).toBe(200);
    expect(raiseOf(await res.json())?.count).toBe(4);
    for (const sid of [...HOLDERS, CHOE]) expect({ sid, score: await scoreOf(sid) }).toEqual({ sid, score: 20 });
  });

  it("TC-12 AC-05: ฌ lands between the server's check and its write (gate) → still adjusted, result 4", async () => {
    const g = gateBatch();
    const pending = raise(20, C.ADJUST, 10, g.env);
    await g.ready;
    expect((await scan(CHOE, 10, 10)).result).toBe("ok");
    g.release();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(raiseOf(await res.json())?.count).toBe(4);
    expect(await scoreOf(CHOE)).toBe(20);
    expect(await fullOf()).toBe(20);
  });
});

describe("C-02 AC-06 / BR-05: the full score changed while the dialog was open", () => {
  it("TC-13 AC-06: another device set full 15 → ปรับ (dialog 10 → 20) is refused 409 Thai, full stays 15, nothing lands", async () => {
    await env.DB.prepare("UPDATE assignments SET full_score = 15 WHERE id = 'a1'").run();
    const before = await cells(); const mark = await maxAuditId();
    const res = await raise(20, C.ADJUST, 10);
    expect(res.status).toBe(409); // on 2285c17: 200, full 20, the stale dialog wins
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ error: C.staleError, currentFullScore: 15 });
    // AC-06 "ข้อความไทยให้โหลดใหม่" · EP-05 wording: "…(ตอนนี้ 15) — ปิดแล้วเปิดแก้ไขงานใหม่"
    expect(body.message).toMatch(/[฀-๿]/);
    expect(body.message).toMatch(/15/);
    await nothingChanged(15, before, mark);
  });

  it("TC-14 AC-06: same when the change lands between the check and the write (gate)", async () => {
    const before = await cells();
    const g = gateBatch();
    const pending = raise(20, C.ADJUST, 10, g.env);
    await g.ready;
    await env.DB.prepare("UPDATE assignments SET full_score = 15 WHERE id = 'a1'").run();
    const mark = await maxAuditId();
    g.release();
    const res = await pending;
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe(C.staleError);
    await nothingChanged(15, before, mark);
  });

  it("TC-15 AC-06: คงไว้ with a stale dialog is refused the same way", async () => {
    await env.DB.prepare("UPDATE assignments SET full_score = 15 WHERE id = 'a1'").run();
    const before = await cells(); const mark = await maxAuditId();
    const res = await raise(20, C.KEEP, 10);
    expect(res.status).toBe(409);
    await nothingChanged(15, before, mark);
  });
});

describe("C-02 AC-07 / BR-06: a queued scan made with the old full score (EP-01 unchanged)", () => {
  it("TC-16 AC-07 [guard]: ฌ 10 (fullScoreAtScan 10) arriving after 10 → 20 + ปรับ → full_score_changed 20, no row; a 20/20 op → ok", async () => {
    const res = await raise(20, C.ADJUST);
    expect(res.status).toBe(200);
    const stale = await scan(CHOE, 10, 10, { clientTs: Date.now() - 60_000 });
    expect(stale).toMatchObject({ result: "full_score_changed", currentFullScore: 20 });
    expect(await cellOf(CHOE)).toBeNull();
    const fresh = await scan(CHOE, 20, 20);
    expect(fresh.result).toBe("ok");
    expect(await scoreOf(CHOE)).toBe(20);
  });
});

describe("C-02 AC-08 / BR-07: no question when nobody holds the old full score, or the full score does not go up", () => {
  async function a2() {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a2','t1','s1','wt_worksheet','ใบงาน 2',10,?,?,1,'open',0,0)").bind(bkkDay(10), DUE),
      env.DB.prepare("INSERT INTO assignment_classes (assignment_id, class_id) VALUES ('a2','c1')"),
      sub("a2", KHAW, { score: 7 }),
      sub("a2", NGO, { score: null, method: "hid" }),
      sub("a2", CHO, { status: "excused", score: null, at: null }),
    ]);
    return { id: "a2", title: "ใบงาน 2", class_ids: ["c1"] };
  }

  it("TC-17 AC-08 [guard]: a2 (ค 7, ง รอตรวจ, จ excused) 10 → 20 with no choice → 200 at once, no cell or submission audit changes", async () => {
    const body = await a2();
    const before = await cells("a2"); const mark = await maxAuditId();
    const res = await save({ ...body, full_score: 20 });
    expect(res.status).toBe(200);
    expect(raiseOf(await res.json()) ?? null).toBeNull(); // EP-05 case 9
    expect(await fullOf("a2")).toBe(20);
    expect(await cells("a2")).toEqual(before);
    expect((await auditsAfter(mark)).filter((a) => a.entity === "submission")).toEqual([]);
  });

  it("TC-18 AC-08 [guard]: creating a new work (full 20) is never asked", async () => {
    const res = await save({ id: "a9", title: "งานใหม่", full_score: 20, class_ids: ["c1"] });
    expect(res.status).toBe(200);
    expect(await fullOf("a9")).toBe(20);
  });

  it("TC-19 AC-08 [guard]: editing only the title / due date of a1 (3 full holders, full stays 10) → 200, no cell change", async () => {
    const before = await cells(); const mark = await maxAuditId();
    const res = await save({ title: "ใบงาน 1 (แก้ชื่อ)", due_date: bkkDay(2) });
    expect(res.status).toBe(200);
    expect((await auditsAfter(mark)).filter((a) => a.entity === "submission")).toEqual([]);
    const now = await cells();
    for (const sid of Object.keys(before)) expect(now[sid].score).toBe(before[sid].score);
  });

  it("TC-20 AC-08 [guard]: same full score sent WITH a choice (10 → 10, ปรับ) changes no cell", async () => {
    const before = await cells();
    const res = await save({ full_score: 10 }, choose(C.ADJUST));
    expect(res.status).toBe(200);
    expect(await cells()).toEqual(before);
    expect(raiseOf(await res.json()) ?? null).toBeNull(); // EP-05 case 9: raise null
  });
});

describe("C-02 AC-09 / BR-07: lowering the full score behaves as before", () => {
  async function a3a4() {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a3','t1','s1','wt_worksheet','ใบงาน 3',20,?,?,1,'open',0,0)").bind(bkkDay(10), DUE),
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a4','t1','s1','wt_worksheet','ใบงาน 4',20,?,?,1,'open',0,0)").bind(bkkDay(10), DUE),
      env.DB.prepare("INSERT INTO assignment_classes (assignment_id, class_id) VALUES ('a3','c1')"),
      env.DB.prepare("INSERT INTO assignment_classes (assignment_id, class_id) VALUES ('a4','c1')"),
      sub("a3", KO, { score: 20 }),
      sub("a3", KHAW, { score: 15 }),
      sub("a4", KHAW, { score: 8 }),
    ]);
  }

  // The Thai line "ลดคะแนนเต็มไม่ได้ มี 2 รายการที่คะแนนเกิน" is NOT in the server body on 2285c17 (body = {error, over}),
  // so the form builds it from `over` — checked in the browser (TC-41), not here. The server part is error + over.
  it("TC-21 AC-09 [guard]: a3 (ก 20, ค 15) 20 → 10 → 409 score_over_full over 2, no question, nothing changes", async () => {
    await a3a4();
    const before = await cells("a3"); const mark = await maxAuditId();
    const res = await save({ id: "a3", title: "ใบงาน 3", full_score: 10, class_ids: ["c1"] });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ error: "score_over_full", over: 2 });
    expect(body.error).not.toBe(C.confirmError);
    expect(await fullOf("a3")).toBe(20);
    expect(await cells("a3")).toEqual(before);
    expect(await auditsAfter(mark)).toEqual([]);
  });

  it("TC-22 AC-09 [guard]: a4 (ค 8) 20 → 10 → 200 at once, ค still 8", async () => {
    await a3a4();
    const res = await save({ id: "a4", title: "ใบงาน 4", full_score: 10, class_ids: ["c1"] });
    expect(res.status).toBe(200);
    expect(await fullOf("a4")).toBe(10);
    expect(await scoreOf(KHAW, "a4")).toBe(8);
  });
});

describe("C-02 AC-12 / BR-01 / BR-05: the count comes from the server, across classes and student statuses", () => {
  for (const status of ["moved", "finished", "inactive"]) {
    it(`TC-23 AC-12: ซ in c2 with status ${status} is counted → 3 (a device that knows only ก would say 1)`, async () => {
      await env.DB.prepare("UPDATE students SET status = ? WHERE id = ?").bind(status, SO).run();
      const res = await save({ full_score: 20 });
      expect(res.status).toBe(409);
      expect(((await res.json()) as any)[C.count]).toBe(3);
      const ok = await raise(20, C.ADJUST);
      expect(raiseOf(await ok.json())?.count).toBe(3);
      expect(await scoreOf(SO)).toBe(20);
    });
  }
});

describe("C-02 AC-13 / BR-03 (💰): what the gradebook / scan screen read back", () => {
  // expected-from-br (computed by hand in test-plan.md §1 before reading code):
  //   a1 c1 (ก 10, ข 10, ค 7 have a score): before 27/30 = 90 · ปรับ 47/60 = 78 (78.33) · คงไว้ 27/60 = 45
  //   ก cumulative (a1 + b 8/10): before 18/20 = 90 · ปรับ 28/30 = 93 (93.33) · คงไว้ 18/30 = 60
  async function withB() {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('b','t1','s1','wt_worksheet','งาน b',10,?,?,1,'open',0,0)").bind(bkkDay(10), DUE),
      env.DB.prepare("INSERT INTO assignment_classes (assignment_id, class_id) VALUES ('b','c1')"),
      sub("b", KO, { score: 8 }),
    ]);
  }
  const snapshot = async (id = "a1") => (await (await call(`/api/assignments/${id}/submissions`, {}, cookie)).json()) as any;
  /** BR-03 formula from what EP-02 returns: Σscore ÷ (number with a score × full), class c1 only. */
  async function classPercent() {
    const s = await snapshot();
    const c1 = new Set(["st1", "st2", KHAW, NGO, CHO, CHING, CHANG, CHOE]);
    const scored = s.submissions.filter((x: any) => c1.has(x.student_id) && x.status === "submitted" && x.score != null);
    const sum = scored.reduce((t: number, x: any) => t + x.score, 0);
    return { sum, whole: scored.length * s.assignment.full_score, pct: percentOf(sum, scored.length * s.assignment.full_score) };
  }
  async function koCumulative() {
    let got = 0, whole = 0;
    for (const id of ["a1", "b"]) {
      const s = await snapshot(id);
      const mine = s.submissions.find((x: any) => x.student_id === KO);
      if (mine?.status === "submitted" && mine.score != null) { got += mine.score; whole += s.assignment.full_score; }
    }
    return { got, whole, pct: percentOf(got, whole) };
  }

  it("TC-24 AC-13 [guard]: before the raise — a1 c1 27/30 = 90 %, ก cumulative 18/20 = 90 %", async () => {
    await withB();
    expect(await classPercent()).toEqual({ sum: 27, whole: 30, pct: 90 });
    expect(await koCumulative()).toEqual({ got: 18, whole: 20, pct: 90 });
  });

  it("TC-25 AC-13: after ปรับ — EP-02 shows full 20 and ก 20; a1 c1 47/60 = 78 %, ก cumulative 28/30 = 93 %", async () => {
    await withB();
    expect((await raise(20, C.ADJUST)).status).toBe(200);
    const s = await snapshot();
    expect(s.assignment.full_score).toBe(20);
    expect(s.submissions.find((x: any) => x.student_id === KO)).toMatchObject({ status: "submitted", score: 20 });
    expect(await classPercent()).toEqual({ sum: 47, whole: 60, pct: 78 }); // on 2285c17: 27/60 = 45
    expect(await koCumulative()).toEqual({ got: 28, whole: 30, pct: 93 }); // on 2285c17: 18/30 = 60
  });

  it("TC-26 AC-13 / AC-02: after คงไว้ — a1 c1 27/60 = 45 %, ก cumulative 18/30 = 60 % (the teacher's own choice)", async () => {
    await withB();
    expect((await raise(20, C.KEEP)).status).toBe(200);
    expect(await classPercent()).toEqual({ sum: 27, whole: 60, pct: 45 });
    expect(await koCumulative()).toEqual({ got: 18, whole: 30, pct: 60 });
  });
});

describe("C-02 AC-14 / BR-09: ย้อนกลับ after ปรับ (EP-04 bulk-undo with the returned batch id)", () => {
  async function adjusted() {
    const res = await raise(20, C.ADJUST);
    expect(res.status).toBe(200);
    const id = raiseOf(await res.json())?.batchId;
    expect(typeof id).toBe("string"); // on 2285c17: undefined — there is nothing to undo
    return id as string;
  }

  it("TC-27 AC-14: undo → ก ข ซ back to 10, full stays 20, one audit row per cell; then lowering to 10 saves (BR-09 example)", async () => {
    const id = await adjusted();
    const mark = await maxAuditId();
    const res = await undo(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, changed: 3 });
    for (const sid of HOLDERS) expect({ sid, score: await scoreOf(sid) }).toEqual({ sid, score: 10 });
    expect(await fullOf()).toBe(20);
    const rows = await auditsAfter(mark);
    expect(rows.filter((a) => a.entity === "submission").map((a) => a.student_id).sort()).toEqual([...HOLDERS].sort());
    expect(rows.filter((a) => a.entity !== "submission")).toEqual([]);
    const lower = await save({ full_score: 10 });
    expect(lower.status).toBe(200);
    expect(await fullOf()).toBe(10);
  });

  it("TC-28 AC-14: ก edited to 18 in the gradebook after ปรับ → undo 409 modified_since, nothing changes", async () => {
    const id = await adjusted();
    expect((await grade(KO, 18, 20)).result).toBe("ok");
    const before = await cells(); const mark = await maxAuditId();
    const res = await undo(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "modified_since" });
    await nothingChanged(20, before, mark);
    expect(await scoreOf(KO)).toBe(18);
  });

  it("TC-29 AC-14: undo twice → the second changes nothing (no extra audit)", async () => {
    const id = await adjusted();
    expect((await undo(id)).status).toBe(200);
    const before = await cells(); const mark = await maxAuditId();
    const again = await undo(id);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, changed: 0 });
    await nothingChanged(20, before, mark);
  });
});

describe("C-02 AC-15 / BR-10: an app that does not know the question, and no login", () => {
  it("TC-30 AC-15: old app raises a1 10 → 20 (3 holders) → 409 'มี 3 คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง', nothing lands", async () => {
    const before = await cells(); const mark = await maxAuditId();
    const res = await save({ full_score: 20 }); // exactly what an app on 2285c17 sends
    expect(res.status).toBe(409); // on 2285c17: 200 and 10/20 silently (the bug)
    const body = (await res.json()) as any;
    expect(body.message).toBe("มี 3 คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง");
    await nothingChanged(10, before, mark);
  });

  it("TC-31 AC-15 [guard]: old app raising a work with no full holder still saves (200)", async () => {
    await env.DB.prepare("UPDATE submissions SET score = 9 WHERE assignment_id = 'a1' AND score = 10").run();
    const res = await save({ full_score: 20 });
    expect(res.status).toBe(200);
    expect(await fullOf()).toBe(20);
  });

  it("TC-32 AC-15 [guard]: not logged in → 401, nothing lands (with or without a choice)", async () => {
    const before = await cells(); const mark = await maxAuditId();
    for (const extra of [{}, choose(C.ADJUST)]) {
      const res = await call("/api/assignments", json({ ...A1(), full_score: 20, ...extra }));
      expect(res.status).toBe(401);
    }
    await nothingChanged(10, before, mark);
  });
});

describe("C-02 edge: pressing ปรับ twice / two devices at once", () => {
  it("TC-33 AC-10 (API part): the same ปรับ sent twice → second is 409 stale (full is now 20), no second set of audit rows", async () => {
    const first = await raise(20, C.ADJUST);
    expect(first.status).toBe(200);
    expect(raiseOf(await first.json())?.count).toBe(3);
    const before = await cells(); const mark = await maxAuditId();
    const second = await raise(20, C.ADJUST);
    expect(second.status).toBe(409);
    await nothingChanged(20, before, mark);
  });

  it("TC-34 AC-10 / BR-05: two ปรับ requests at the same moment → exactly one lands (3 cell audit rows in total)", async () => {
    const mark = await maxAuditId();
    const [a, b] = await Promise.all([raise(20, C.ADJUST), raise(20, C.ADJUST)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    for (const sid of HOLDERS) expect(await scoreOf(sid)).toBe(20);
    expect((await auditsAfter(mark)).filter((x) => x.entity === "submission")).toHaveLength(3);
  });
});

describe("C-02 EP-05 schema + the no-question path re-checked inside the write", () => {
  it("TC-35 AC-15 / EP-05: raise_choice without raise_from (or a bad choice) → 422 validation, nothing lands", async () => {
    const before = await cells(); const mark = await maxAuditId();
    for (const extra of [{ [C.choice]: C.ADJUST }, { [C.expected]: 10 }, { [C.choice]: "maybe", [C.expected]: 10 }]) {
      const res = await save({ full_score: 20 }, extra);
      expect({ extra, status: res.status }).toEqual({ extra, status: 422 }); // on 2285c17: 200 (field ignored, raise lands)
    }
    await nothingChanged(10, before, mark);
  });

  it("TC-36 AC-08 / AC-15 / BR-05: no full holder when read, ฌ scans full 10 before the write (old-app request) → 409 raise_choice_required, nothing lands", async () => {
    await env.DB.prepare("UPDATE submissions SET score = 9 WHERE assignment_id = 'a1' AND score = 10").run();
    const before = await cells();
    const g = gateBatch();
    const pending = save({ full_score: 20 }, {}, g.env);
    await g.ready;
    expect((await scan(CHOE, 10, 10)).result).toBe("ok");
    const cellsMid = await cells(); const mark = await maxAuditId();
    g.release();
    const res = await pending;
    expect(res.status).toBe(409); // on 2285c17: 200 → ฌ silently 10/20
    expect(await res.json()).toMatchObject({ error: C.confirmError, [C.count]: 1 });
    expect(cellsMid[CHOE]).toMatchObject({ status: "submitted", score: 10 });
    expect({ ...cellsMid, [CHOE]: undefined }).toEqual({ ...before, [CHOE]: undefined });
    await nothingChanged(10, cellsMid, mark);
  });
});

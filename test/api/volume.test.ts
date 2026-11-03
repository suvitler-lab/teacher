// Round 3: the app must hold up at the size of a real school term, on the Free plan.
//   200 students · 40 assignments · 8,000 scores · 12,000 attendance marks (test/api/volume.ts).
// Two things are checked for every path a teacher uses: the answer is RIGHT at this size, and it stays inside a
// budget — statements per request (Free allows about 50), and rows read/written (D1 Free: about 5 million read and
// 100,000 written a DAY). The budgets are ~2-3× what was measured, so a 20× regression (a query that quietly
// starts reading the whole table) fails here instead of at the school in week three.
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, json, login } from "./helpers";
import { metered } from "./meter";
import { seedVolume, expectedVolume, VOLUME } from "./volume";
import { takeBackup, restoreFrom } from "./backup-helpers";

type Budget = { queries?: number; read?: number; written?: number };
const MAX_QUERIES = 45; // the Free plan's cap is about 50 per request
/** Run one request against a metered database; fail with the numbers if it is over budget. */
async function cost(cookie: string, label: string, budget: Budget, path: string, body?: unknown) {
  const m = metered();
  const res = await callIn(m.env, path, body === undefined ? {} : json(body), cookie);
  expect(m.stats.measured, "this runtime must report row counts, or the budgets mean nothing").toBe(true);
  const s = m.stats;
  const took = `${label}: ${s.queries} statements, ${s.rowsRead} rows read, ${s.rowsWritten} written`;
  expect(s.queries, took).toBeLessThanOrEqual(budget.queries ?? MAX_QUERIES);
  if (budget.read != null) expect(s.rowsRead, took).toBeLessThanOrEqual(budget.read);
  if (budget.written != null) expect(s.rowsWritten, took).toBeLessThanOrEqual(budget.written);
  return res;
}

const classScoreSum = (k: number) => {
  let sum = 0;
  for (let a = 1; a <= VOLUME.assignments; a++) for (let n = 1; n <= VOLUME.perClass; n++) sum += (a * 7 + k * 5 + n * 3) % 11;
  return sum;
};

describe("reading at school size", () => {
  it("every screen's data is complete and correct, and cheap", async () => {
    const cookie = await login();
    await seedVolume();
    const want = expectedVolume();
    const q = "term=t1";

    const boot = (await (await cost(cookie, "bootstrap", { read: 2_000 }, "/api/bootstrap")).json()) as any;
    expect(boot.students).toHaveLength(want.students);
    expect(boot.assignments).toHaveLength(want.assignments);
    expect(boot.classes).toHaveLength(VOLUME.classes);

    const gb = (await (await cost(cookie, "gradebook, one class", { read: 8_000 }, `/api/gradebook?class=c1&${q}`)).json()) as any;
    expect(gb.students).toHaveLength(VOLUME.perClass);
    expect(gb.assignments).toHaveLength(VOLUME.assignments);
    expect(gb.submissions).toHaveLength(VOLUME.assignments * VOLUME.perClass);
    expect(gb.submissions.reduce((n: number, s: any) => n + s.score, 0)).toBe(classScoreSum(1));

    const rp = (await (await cost(cookie, "report, one class", { read: 12_000 }, `/api/reports/summary?class=c2&${q}`)).json()) as any;
    expect(rp.submissions).toHaveLength(VOLUME.assignments * VOLUME.perClass);
    expect(rp.submissions.reduce((n: number, s: any) => n + s.score, 0)).toBe(classScoreSum(2));
    expect(rp.attendanceSessions).toHaveLength(VOLUME.days);
    expect(rp.attendance).toHaveLength(VOLUME.days * VOLUME.perClass);
    const tally: Record<string, number> = {};
    for (const a of rp.attendance) tally[a.status] = (tally[a.status] ?? 0) + 1;
    expect(tally).toEqual({ present: want.marks.present / VOLUME.classes, late: want.marks.late / VOLUME.classes, absent: want.marks.absent / VOLUME.classes });

    const home = (await (await cost(cookie, "home dashboard", { read: 12_000 }, `/api/dashboard?${q}&date=2026-07-01`)).json()) as any;
    expect(home.openAssignments).toHaveLength(want.assignments);
    for (const a of home.openAssignments) {
      expect(a.perClass).toHaveLength(VOLUME.classes);
      for (const p of a.perClass) expect(p).toMatchObject({ total: VOLUME.perClass, submitted: VOLUME.perClass });
    }

    // the scan screen reads this every minute it is open (docs: ~205 rows measured) — keep it near that, not 5x over
    const subs = (await (await cost(cookie, "one assignment's hand-ins", { read: 500 }, "/api/assignments/a1/submissions")).json()) as any;
    expect(subs.submissions).toHaveLength(VOLUME.classes * VOLUME.perClass);
    await cost(cookie, "attendance overview", { read: 6_000 }, "/api/attendance/days?from=2026-05-15&to=2026-05-20");
    await cost(cookie, "student list", { read: 1_000 }, "/api/students");
    await cost(cookie, "one backup page", { read: 1_500 }, "/api/backup?table=submissions&cursor=0");
  }, 120_000);

  it("a whole backup reads each row about once — not the square of the table's size", async () => {
    const cookie = await login();
    await seedVolume();
    const m = metered();
    const backup = await takeBackup(cookie, m.env);
    const rows = Object.values(backup.counts).reduce((n, v) => n + v, 0);
    expect(rows).toBeGreaterThan(20_000);
    // paged by OFFSET this was ~239,000 rows read for ~20,800 rows (every page re-read everything before it)
    expect(m.stats.rowsRead, `${rows} rows backed up, ${m.stats.rowsRead} rows read`).toBeLessThan(rows * 1.5);
  }, 120_000);
});

describe("ending a scan round at school size (P11)", () => {
  it("counting the round's hand-ins reads that one work's rows, not the whole submissions table", async () => {
    const cookie = await login();
    await seedVolume();
    await env.DB.prepare("INSERT INTO scan_sessions (id, assignment_id, class_id, mode, full_score, started_at) VALUES ('scn_end', 'a1', 'c1', 'full', 10, 1)").run();
    await env.DB.prepare("UPDATE submissions SET scan_session_id = 'scn_end' WHERE assignment_id = 'a1' AND substr(student_id, 1, 4) = 'st1_'").run();
    const m = metered();
    const res = await callIn(m.env, "/api/scan-sessions/scn_end/end", json({}), cookie);
    expect(res.status).toBe(200);
    const took = `${m.stats.queries} statements, ${m.stats.rowsRead} rows read`;
    console.log("P11 scan-end:", took);
    expect((await env.DB.prepare("SELECT scan_count FROM scan_sessions WHERE id = 'scn_end'").first<any>()).scan_count).toBe(VOLUME.perClass);
    // the table holds 8,000 rows; one work's rows are 200
    expect(m.stats.rowsRead, took).toBeLessThanOrEqual(400);
  }, 60_000);
});

describe("whole-class actions with a long history (P14)", () => {
  it("a whole-class action and its undo read the work's own history, not the whole audit table", async () => {
    const cookie = await login();
    await seedVolume();
    // a term's worth of other history: 6,000 cell lines of other works
    await env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 6000)
       INSERT INTO audit_logs (op_id, at, entity, entity_id, assignment_id, student_id, action, method)
       SELECT 'hist' || i, 1000 + i, 'submission', 'a' || (i % 30 + 10) || ':x', 'a' || (i % 30 + 10), 'st1_' || (i % 40 + 1), 'update', 'grid' FROM n`,
    ).run();
    const clear = (await (await cost(cookie, "clear a whole class (long history)", { read: 4_000, written: 600 }, "/api/assignments/a6/bulk", { action: "clear", classId: "c1" })).json()) as any;
    expect(clear.changed).toBe(VOLUME.perClass);
    const undo = (await (await cost(cookie, "undo it (long history)", { read: 2_000, written: 600 }, "/api/assignments/a6/bulk-undo", { batchId: clear.batchId })).json()) as any;
    expect(undo.changed).toBe(VOLUME.perClass);
  }, 120_000);
});

describe("writing at school size", () => {
  // n scans of a1, walking through the school: 40 children of class `cls`, then the next class, …
  const scanOps = (n: number, score: number, cls = 1, prefix = "w") =>
    Array.from({ length: n }, (_, i) => ({
      opId: `${prefix}${cls}_${score}_${i}`, scanSessionId: "scn", assignmentId: "a1",
      studentId: `st${cls + Math.floor(i / VOLUME.perClass)}_${(i % VOLUME.perClass) + 1}`, status: "submitted",
      score, fullScoreAtScan: 10, method: "camera", clientTs: Date.now() + i,
    }));
  const scoreOf = async (sid: string, aid = "a1") =>
    (await env.DB.prepare("SELECT score FROM submissions WHERE assignment_id = ? AND student_id = ?").bind(aid, sid).first<any>()).score;

  it("scanning: one child, and a whole class or more in one request", async () => {
    const cookie = await login();
    await seedVolume();
    // a scan hands work IN: the children scanned below (classes 1-3) have not handed a1 in yet — a cell that is
    // already submitted is never overwritten by a scan (integrity-c01 BR-01: `already_submitted`, nothing written)
    await env.DB.prepare("DELETE FROM submissions WHERE assignment_id = 'a1' AND student_id IN (SELECT id FROM students WHERE class_id IN ('c1','c2','c3'))").run();

    // the everyday case: one scan, one request — must cost almost nothing whatever the size of the term
    const one = (await (await cost(cookie, "one scan", { read: 300, written: 30 }, "/api/submissions/batch", { ops: scanOps(1, 3) })).json()) as any;
    expect(one.results[0].result).toBe("ok");
    expect(await scoreOf("st1_1")).toBe(3);

    // an offline queue arriving at once: the most one request may carry (50 ops)
    const fifty = (await (await cost(cookie, "50 scans", { read: 6_000, written: 800 }, "/api/submissions/batch", { ops: scanOps(50, 6, 2) })).json()) as any;
    expect(fifty.results.map((r: any) => r.result)).toEqual(Array(50).fill("ok"));
    expect(await scoreOf("st2_7")).toBe(6);
    expect(await scoreOf("st3_10")).toBe(6); // the 50 ran on into the next class
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity = 'submission'").first<any>()).n).toBe(51); // one audit row per write
  }, 120_000);

  it("whole-class actions and their undo", async () => {
    const cookie = await login();
    await seedVolume();
    const original = classScoreSum(1); // over 40 assignments; here only a5 and a6 change
    const a5 = Array.from({ length: VOLUME.perClass }, (_, i) => (5 * 7 + 1 * 5 + (i + 1) * 3) % 11);
    const a6 = Array.from({ length: VOLUME.perClass }, (_, i) => (6 * 7 + 1 * 5 + (i + 1) * 3) % 11);

    const full = (await (await cost(cookie, "everyone scored full", { read: 4_000, written: 600 }, "/api/assignments/a5/bulk", { action: "full-score", classId: "c1" })).json()) as any;
    expect(full.changed).toBe(a5.filter((s) => s !== 10).length);
    expect((await env.DB.prepare("SELECT SUM(score) AS n FROM submissions WHERE assignment_id = 'a5' AND student_id LIKE 'st1\\_%' ESCAPE '\\'").first<any>()).n).toBe(400);

    const clear = (await (await cost(cookie, "clear a whole class", { read: 4_000, written: 600 }, "/api/assignments/a6/bulk", { action: "clear", classId: "c1" })).json()) as any;
    expect(clear.changed).toBe(VOLUME.perClass);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = 'a6' AND student_id LIKE 'st1\\_%' ESCAPE '\\' AND status = 'void'").first<any>()).n).toBe(VOLUME.perClass);

    const undo = (await (await cost(cookie, "undo it", { read: 2_000, written: 600 }, "/api/assignments/a6/bulk-undo", { batchId: clear.batchId })).json()) as any;
    expect(undo.changed).toBe(VOLUME.perClass);
    const back = await env.DB.prepare("SELECT student_id, score, status FROM submissions WHERE assignment_id = 'a6' AND student_id LIKE 'st1\\_%' ESCAPE '\\'").all<any>();
    expect(back.results!.every((r) => r.status === "submitted")).toBe(true);
    expect(back.results!.reduce((n, r) => n + r.score, 0)).toBe(a6.reduce((n, s) => n + s, 0));
    void original;
  }, 120_000);

  it("attendance for a class, and editing an assignment", async () => {
    const cookie = await login();
    await seedVolume();
    const rows = Array.from({ length: VOLUME.perClass }, (_, i) => ({ studentId: `st1_${i + 1}`, status: i % 10 === 0 ? "absent" : "present" }));
    const att = (await (await cost(cookie, "a class's attendance", { read: 1_500, written: 800 }, "/api/attendance/batch", { date: "2026-09-10", classId: "c1", rows })).json()) as any;
    expect(att.changed).toBe(VOLUME.perClass);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM attendance a JOIN attendance_sessions s ON s.id = a.session_id WHERE s.date = '2026-09-10' AND s.class_id = 'c1' AND a.status = 'absent'").first<any>()).n).toBe(4);

    const edit = await cost(cookie, "edit an assignment given to five classes", { read: 500, written: 200 }, "/api/assignments",
      { id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "แก้ชื่อ", full_score: 10, class_ids: ["c1", "c2", "c3", "c4", "c5"] });
    expect(edit.status).toBe(200);

    // M1-04 R-06: the worst case of a due-date edit — every hand-in of the work flips late (5 classes × 40 = 200 rows).
    // Measured and reported (not held to the 200-row budget above): the flip is the point of the edit.
    const flip = { id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "แก้ชื่อ", full_score: 10, due_date: "2026-01-01", class_ids: ["c1", "c2", "c3", "c4", "c5"] };
    const m = metered();
    expect((await callIn(m.env, "/api/assignments", json(flip), cookie)).status).toBe(200);
    expect(m.stats.measured).toBe(true);
    console.log(`[R-06] due-date edit flipping every row: ${m.stats.queries} statements, ${m.stats.rowsRead} rows read, ${m.stats.rowsWritten} written`);
    expect(m.stats.queries).toBeLessThanOrEqual(MAX_QUERIES);
    // AC-11: the budget of the worst case (every row flips)
    expect(m.stats.rowsRead, "due-date edit flipping every row: rows read").toBeLessThanOrEqual(1_000);
    expect(m.stats.rowsWritten, "due-date edit flipping every row: rows written").toBeLessThanOrEqual(300);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = 'a1' AND late = 1").first<any>()).n).toBe(VOLUME.classes * VOLUME.perClass);
    // saving again with the same due date writes no late rows at all
    const again = metered();
    expect((await callIn(again.env, "/api/assignments", json(flip), cookie)).status).toBe(200);
    console.log(`[R-06] same edit again (nothing flips): ${again.stats.queries} statements, ${again.stats.rowsRead} rows read, ${again.stats.rowsWritten} written`);
    // nothing flips: the edit's usual budget
    expect(again.stats.queries).toBeLessThanOrEqual(MAX_QUERIES);
    expect(again.stats.rowsRead, "same edit again: rows read").toBeLessThanOrEqual(500);
    expect(again.stats.rowsWritten, "same edit again: rows written").toBeLessThanOrEqual(200);
  }, 120_000);

  // integrity-c02 (EP-05 v2): raising a1's full score 10 → 20 with "ปรับ" when every one of its 200 hand-ins holds 10 —
  // the worst case: 200 cells, 200 cell history lines and the work line in one batch; then undoing it (EP-04).
  // a1 already has a history (3 lines per cell — a scan and two gradebook edits, 600 lines), so a query that reads the
  // work's whole history instead of this batch's own lines shows up in the numbers.
  it("raising the full score with ปรับ over 200 full holders, and its undo", async () => {
    const cookie = await login();
    await seedVolume();
    const cellsOfA1 = VOLUME.classes * VOLUME.perClass;
    await env.DB.batch([
      env.DB.prepare("UPDATE submissions SET score = 10 WHERE assignment_id = 'a1'"),
      env.DB.prepare(`INSERT INTO audit_logs (op_id, at, actor_id, entity, entity_id, assignment_id, student_id, action, method)
        SELECT 'hist' || k.n || '_' || s.student_id, 1780000000000 + k.n, 'teacher', 'submission', 'a1:' || s.student_id, 'a1',
          s.student_id, CASE k.n WHEN 1 THEN 'scan' ELSE 'update' END, CASE k.n WHEN 1 THEN 'camera' ELSE 'grid' END
        FROM submissions s, (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3) k WHERE s.assignment_id = 'a1'`),
    ]);
    const body = {
      id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "งานที่ 1", full_score: 20,
      assigned_date: "2026-06-01", due_date: "2026-12-31", class_ids: ["c1", "c2", "c3", "c4", "c5"],
      raise_choice: "adjust", raise_from: 10,
    };
    const m = metered();
    const res = await callIn(m.env, "/api/assignments", json(body), cookie);
    expect(res.status).toBe(200);
    expect(m.stats.measured).toBe(true);
    const took = `raise 10 → 20 + ปรับ, ${cellsOfA1} cells: ${m.stats.queries} statements, ${m.stats.rowsRead} rows read, ${m.stats.rowsWritten} written`;
    console.log(`[C-02] ${took}`);
    const raise = ((await res.json()) as any).raise;
    expect(raise).toMatchObject({ choice: "adjust", from: 10, to: 20, count: cellsOfA1 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = 'a1' AND score = 20").first<any>()).n).toBe(cellsOfA1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE batch_id = ?").bind(raise.batchId).first<any>()).n).toBe(cellsOfA1 + 1);
    // measured 2026-11-02: 24 statements, 2,062 rows read, 1,832 written (the 200 cells and their 200 history lines,
    // indexes included). Before its two history queries were held to this batch's own op_ids: 3,260 read — the work's
    // whole history walked twice. Budgets ~2.4× / ~2.2× the measurement, as above.
    expect(m.stats.queries, took).toBeLessThanOrEqual(MAX_QUERIES);
    expect(m.stats.rowsRead, took).toBeLessThanOrEqual(5_000);
    expect(m.stats.rowsWritten, took).toBeLessThanOrEqual(4_000);

    // EP-04 as it is (not changed by integrity-c02): measured 14 statements, 6,420 rows read, 1,601 written with this
    // 600-line history (5,220 read with 200 lines — its reads grow with the work's history, not only with the batch)
    const undo = (await (await cost(cookie, "undo the raise's ปรับ", { read: 15_000, written: 4_000 },
      "/api/assignments/a1/bulk-undo", { batchId: raise.batchId })).json()) as any;
    expect(undo.changed).toBe(cellsOfA1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = 'a1' AND score = 10").first<any>()).n).toBe(cellsOfA1);
    expect((await env.DB.prepare("SELECT full_score FROM assignments WHERE id = 'a1'").first<any>()).full_score).toBe(20);
  }, 120_000);

  it("importing a class list", async () => {
    const cookie = await login();
    await seedVolume();
    await env.DB.prepare("INSERT INTO classes (id, name, grade, sort, archived, year, updated_at) VALUES ('c9', 'ป.5/1', 'ป.5', 90, 0, 2569, 1)").run();
    const students = Array.from({ length: 40 }, (_, i) => ({ code: `9${String(i + 1).padStart(2, "0")}`, first_name: `นักเรียน${i + 1}`, last_name: "ใหม่", number: i + 1 }));
    const res = (await (await cost(cookie, "import 40 children", { read: 1_500, written: 800 }, "/api/students/import", { class_id: "c9", students })).json()) as any;
    expect(res).toMatchObject({ imported: 40, created: 40 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM students").first<any>()).n).toBe(expectedVolume().students + 40);
  }, 120_000);
});

describe("restoring at school size", () => {
  it("fits in one request's statements — and costs almost a whole day's write allowance, which is why the runbook says when to do it", async () => {
    const cookie = await login();
    await seedVolume();
    const backup = await takeBackup(cookie);
    const total = Object.values(backup.counts).reduce((n, v) => n + v, 0);

    const m = metered();
    const res = await restoreFrom(cookie, backup, { commitEnv: m.env });
    expect(res.status).toBe(200);
    const s = m.stats;
    const took = `restore commit of ${total} rows: ${s.queries} statements, ${s.rowsRead} read, ${s.rowsWritten} written`;
    expect(s.measured).toBe(true);
    expect(s.queries, took).toBeLessThanOrEqual(MAX_QUERIES);
    // D1 Free allows ~100,000 rows written a day. One restore at this size is deleting and rewriting everything (indexes
    // included) — measured ~92,000. If this fails, a change made it dearer: decide on purpose, and update docs/OPERATIONS.md.
    expect(s.rowsWritten, took).toBeLessThan(100_000);
    expect(s.rowsWritten, took + " — far cheaper than before? then the runbook's warning can be relaxed").toBeGreaterThan(20_000);
    expect(((await (await call("/api/restore/status", {}, cookie)).json()) as any)).toMatchObject({ pending: false });
  }, 180_000);
});

import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { BACKUP_TABLES } from "../../worker/routes/backup";
import { computeReport } from "../../src/lib/report";

let cookie: string;
const get = async (path: string) => (await call(path, {}, cookie)).json() as Promise<any>;
const post = (path: string, body: unknown) => call(path, json(body), cookie);
const one = async (sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(...binds).first<any>();

const T1 = { id: "t1", year: 2569, term: 1, name: "1/2569", start_date: "2026-05-15", end_date: "2026-09-30", is_current: true };
const TERM2 = { year: 2569, term: 2, name: "2/2569", start_date: "2026-10-01", end_date: "2027-03-15" };
const YEAR2570 = { year: 2570, term: 1, name: "1/2570", start_date: "2027-05-15", end_date: "2027-09-30" };

const start = (expectedCurrentTermId: string | null, body: Record<string, unknown>) =>
  post("/api/terms/start", { expectedCurrentTermId, ...body });
const currentTermId = async () => (await one("SELECT id FROM terms WHERE is_current = 1")).id as string;

async function scoreOp(opId: string, assignmentId: string, studentId: string, score: number, full = 10, extra: Record<string, unknown> = {}) {
  const res = await post("/api/submissions/batch", {
    ops: [{ opId, scanSessionId: "s", assignmentId, studentId, status: "submitted", score, fullScoreAtScan: full, method: "grid", clientTs: Date.now(), ...extra }],
  });
  return ((await res.json()) as any).results[0];
}

/** 1/2569 (dated) → 2/2569 with work in it, one score. Returns the term-2 id and the work id. */
async function twoTermsWithWork() {
  const r = await start("t1", TERM2);
  expect(r.status).toBe(200);
  const t2 = ((await r.json()) as any).termId as string;
  const a = await post("/api/assignments", {
    id: "a2", term_id: t2, subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 2/2569", full_score: 10,
    assigned_date: "2026-10-05", due_date: "2026-10-12", class_ids: ["c1"],
  });
  expect(a.status).toBe(200);
  expect((await scoreOp("op-a2-st1", "a2", "st1", 8)).result).toBe("ok");
  await post("/api/attendance/batch", { date: "2026-10-06", classId: "c1", rows: [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "absent" }] });
  return { t2 };
}

/** Everything a screen or Excel file is built from, for one class in one term — with the fields that legitimately
 * change when a child "finishes" (status, updated_at) left out, so equality means "same people, same numbers". */
async function snapshot(classId: string, termId: string) {
  const rep = await get(`/api/reports/summary?class=${classId}&term=${termId}`);
  const gb = await get(`/api/gradebook?class=${classId}&term=${termId}`);
  const dash = await get(`/api/dashboard?term=${termId}&date=2026-11-01`);
  const model = computeReport(rep);
  const digest = JSON.stringify(model, (k, v) => (k === "student" ? { id: v.id, number: v.number, name: v.first_name } : k === "assignment" ? { id: v.id, title: v.title, status: v.status } : v));
  const people = (list: any[]) => list.map((s) => `${s.number}:${s.first_name}:${s.id}`);
  return {
    report: { students: people(rep.students), assignments: rep.assignments.map((a: any) => [a.id, a.title, a.status]), submissions: rep.submissions, attendance: rep.attendance, sessions: rep.attendanceSessions.map((s: any) => s.date), digest },
    gradebook: { students: people(gb.students), assignments: gb.assignments.map((a: any) => [a.id, a.title, a.status]), submissions: gb.submissions.map((s: any) => [s.assignment_id, s.student_id, s.status, s.score]) },
    dashboard: { open: dash.openAssignments, grading: dash.gradingAssignments, awaiting: dash.awaitingCount, missing: dash.missingCount, followUp: dash.followUp },
  };
}

describe("starting terms and school years", () => {
  beforeEach(async () => {
    cookie = await login();
    await seed();
    expect((await post("/api/terms", T1)).status).toBe(200); // give the seeded 1/2569 real dates
  });

  it("a new term in the SAME year only adds the term: classes and children stay as they are", async () => {
    const res = await start("t1", TERM2);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ ok: true, newYear: false, classes: [], finished: 0 });

    expect(await currentTermId()).toBe(body.termId);
    expect((await one("SELECT COUNT(*) AS n FROM terms WHERE is_current = 1")).n).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM classes WHERE archived = 0")).n).toBe(2);
    expect((await one("SELECT COUNT(*) AS n FROM students WHERE status = 'active'")).n).toBe(3);
  });

  it("a new YEAR opens fresh classes with the same names, puts last year's away, and finishes the children in them", async () => {
    const { t2 } = await twoTermsWithWork();
    const res = await start(t2, { ...YEAR2570, keepClasses: ["c1", "c2"] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ ok: true, newYear: true, finished: 3 });
    expect(body.classes.map((c: any) => c.name).sort()).toEqual(["ป.6/1", "ป.6/2"]);

    // last year: archived, still filed under 2569; its children finished; the work untouched
    for (const id of ["c1", "c2"]) expect(await one("SELECT archived, year FROM classes WHERE id = ?", id)).toEqual({ archived: 1, year: 2569 });
    expect((await one("SELECT COUNT(*) AS n FROM students WHERE status = 'finished'")).n).toBe(3);
    expect((await one("SELECT status FROM assignments WHERE id = 'a2'")).status).toBe("open");

    // this year: brand-new empty classes, same names, year 2570, not archived
    const fresh = (await env.DB.prepare("SELECT id, name, year, archived FROM classes WHERE year = 2570").all<any>()).results;
    expect(fresh.map((c: any) => c.name).sort()).toEqual(["ป.6/1", "ป.6/2"]);
    expect(fresh.every((c: any) => c.archived === 0)).toBe(true);
    expect(fresh.every((c: any) => !["c1", "c2"].includes(c.id))).toBe(true);
    expect((await one("SELECT COUNT(*) AS n FROM students WHERE class_id IN (SELECT id FROM classes WHERE year = 2570)")).n).toBe(0);
    expect(await currentTermId()).toBe(body.termId);
  });

  it("HEADLINE: after the new year starts and a new cohort is imported into the same-named class, last term's report, gradebook and dashboard have exactly the same numbers", async () => {
    const { t2 } = await twoTermsWithWork();
    const before = await snapshot("c1", t2);
    expect(before.report.students.length).toBe(2);            // the two children of that year …
    expect(before.report.submissions.length).toBe(1);         // … and their one score

    const res = await start(t2, { ...YEAR2570, keepClasses: ["c1", "c2"] });
    const { classes } = (await res.json()) as any;
    const newC1 = classes.find((c: any) => c.from === "c1").id as string;

    // June: the new cohort is imported into "ป.6/1" — the NEW ป.6/1
    const imp = await post("/api/students/import", {
      class_id: newC1,
      students: [
        { code: "301", prefix: "ด.ช.", first_name: "ใหม่", last_name: "หนึ่ง", number: 1 },
        { code: "302", prefix: "ด.ญ.", first_name: "ใหม่", last_name: "สอง", number: 2 },
        { code: "303", prefix: "ด.ญ.", first_name: "ใหม่", last_name: "สาม", number: 3 },
      ],
    });
    expect(imp.status).toBe(200);

    // last year's ป.6/1 report is EXACTLY what it was — not the newcomers, not "missing every assignment"
    const after = await snapshot("c1", t2);
    expect(after).toEqual(before);

    // and the new year sees only its own children
    const cur = await currentTermId();
    const fresh = await get(`/api/reports/summary?class=${newC1}&term=${cur}`);
    expect(fresh.students.map((s: any) => s.code)).toEqual(["301", "302", "303"]);
    expect(fresh.assignments).toEqual([]);
    expect(fresh.submissions).toEqual([]);
    // (and the old class holds none of them)
    const oldRoster = await get(`/api/gradebook?class=c1&term=${t2}`);
    expect(oldRoster.students.map((s: any) => s.code)).toEqual(["101", "102"]);
  });

  it("last year's class asked about in THIS year's term is empty — the two years can't mix", async () => {
    const { t2 } = await twoTermsWithWork();
    const { termId: t3, classes } = (await (await start(t2, { ...YEAR2570, keepClasses: ["c1"] })).json()) as any;
    expect((await get(`/api/reports/summary?class=c1&term=${t3}`)).students).toEqual([]);
    expect((await get(`/api/gradebook?class=c1&term=${t3}`)).students).toEqual([]);
    expect((await get(`/api/reports/summary?class=${classes[0].id}&term=${t2}`)).students).toEqual([]);
  });

  it("last year's work can still be graded after the year has started — for last year's children only", async () => {
    const { t2 } = await twoTermsWithWork();
    const { classes } = (await (await start(t2, { ...YEAR2570, keepClasses: ["c1"] })).json()) as any;
    const newC1 = classes[0].id as string;
    await post("/api/students/import", { class_id: newC1, students: [{ code: "301", first_name: "ใหม่", last_name: "หนึ่ง", number: 1 }] });

    // a single grade for a child who has finished the year
    expect((await scoreOp("op-late-grade", "a2", "st1", 9, 10, { method: "grid" })).result).toBe("ok");
    expect((await one("SELECT score FROM submissions WHERE assignment_id='a2' AND student_id='st1'")).score).toBe(9);

    // "full score for everyone who handed it in" works on last year's class …
    const bulk = await post("/api/assignments/a2/bulk", { action: "full-score", classId: "c1" });
    expect(bulk.status).toBe(200);
    expect((await one("SELECT score FROM submissions WHERE assignment_id='a2' AND student_id='st1'")).score).toBe(10);
    // … and can't be pointed at this year's class of the same name (it is a different year's class)
    const wrong = await post("/api/assignments/a2/bulk", { action: "all-submitted", classId: newC1 });
    expect(wrong.status).toBe(400);
    expect(await one("SELECT * FROM submissions WHERE student_id IN (SELECT id FROM students WHERE code='301')")).toBeNull();
  });

  it("starting the same term twice changes nothing the second time — a repeat tap or a second device can't double it", async () => {
    const { t2 } = await twoTermsWithWork();
    const body = { ...YEAR2570, keepClasses: ["c1", "c2"] };
    expect((await start(t2, body)).status).toBe(200);
    const again = await start(t2, body);
    expect(again.status).toBe(409);
    expect(((await again.json()) as any).error).toBe("term_changed");
    expect((await one("SELECT COUNT(*) AS n FROM classes")).n).toBe(4);
    expect((await one("SELECT COUNT(*) AS n FROM terms")).n).toBe(3);
  });

  it("two starts racing each other: exactly one wins, and no class or term is doubled (the guard is inside the write)", async () => {
    const { t2 } = await twoTermsWithWork();
    const body = { ...YEAR2570, keepClasses: ["c1", "c2"] };
    const [a, b] = await Promise.all([start(t2, body), start(t2, body)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await one("SELECT COUNT(*) AS n FROM classes")).n).toBe(4);
    expect((await one("SELECT COUNT(*) AS n FROM terms")).n).toBe(3);
    expect((await one("SELECT COUNT(*) AS n FROM terms WHERE is_current = 1")).n).toBe(1);
  });

  it("refuses a page that is out of date, dates that run into another term, and a term that isn't next", async () => {
    // opened before someone else already moved on
    expect((await start("t-old", TERM2)).status).toBe(409);
    // 2/2569 starting before 1/2569 has ended
    const overlap = await start("t1", { ...TERM2, start_date: "2026-09-01" });
    expect(overlap.status).toBe(422);
    expect(((await overlap.json()) as any).error).toBe("terms_overlap");
    // ends before it begins
    expect((await start("t1", { ...TERM2, end_date: "2026-09-01" })).status).toBe(400);
    // going backwards
    const back = await start("t1", { ...TERM2, year: 2568 });
    expect(back.status).toBe(422);
    expect(((await back.json()) as any).error).toBe("term_backwards");
    // a term that already exists
    await post("/api/terms", { year: 2569, term: 2, name: "2/2569", start_date: "2026-10-01", end_date: "2027-03-15" });
    const dup = await start("t1", { ...TERM2, start_date: "2026-10-02" });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as any).error).toBe("term_exists");
    // none of the refusals changed anything
    expect(await currentTermId()).toBe("t1");
    expect((await one("SELECT COUNT(*) AS n FROM classes WHERE archived = 0")).n).toBe(2);
  });

  it("only the classes the teacher chose are opened for the new year; an unknown class is refused", async () => {
    const { t2 } = await twoTermsWithWork();
    const bad = await start(t2, { ...YEAR2570, keepClasses: ["no-such-class"] });
    expect(bad.status).toBe(400);
    expect((await one("SELECT COUNT(*) AS n FROM classes WHERE archived = 0")).n).toBe(2); // nothing happened

    const ok = await start(t2, { ...YEAR2570, keepClasses: ["c1"] });
    const body = (await ok.json()) as any;
    expect(body.classes.map((c: any) => c.name)).toEqual(["ป.6/1"]);
    expect((await one("SELECT COUNT(*) AS n FROM classes WHERE year = 2570")).n).toBe(1);
    // ป.6/2 is put away with its children even though it isn't reopened
    expect((await one("SELECT archived FROM classes WHERE id = 'c2'")).archived).toBe(1);
    expect((await one("SELECT status FROM students WHERE id = 'st9'")).status).toBe("finished");
  });

  it("can close last year's still-open work — and leaves it alone otherwise", async () => {
    const { t2 } = await twoTermsWithWork();
    const res = await start(t2, { ...YEAR2570, keepClasses: ["c1"], closeOpenWork: true });
    expect(res.status).toBe(200);
    expect((await one("SELECT status FROM assignments WHERE id = 'a1'")).status).toBe("closed");
    expect((await one("SELECT status FROM assignments WHERE id = 'a2'")).status).toBe("closed");
  });

  it("term changes across years must go through 'start' — and a term's year can't be edited under its classes", async () => {
    // a 2570 term exists, but making it current by the old route is refused
    expect((await post("/api/terms", { id: "t70", year: 2570, term: 1, name: "1/2570", start_date: "2027-05-15", end_date: "2027-09-30" })).status).toBe(200);
    const sw = await post("/api/terms", { id: "t70", year: 2570, term: 1, name: "1/2570", is_current: true });
    expect(sw.status).toBe(409);
    expect(((await sw.json()) as any).error).toBe("use_start_term");
    expect(await currentTermId()).toBe("t1");
    // moving a term to another year would strand its classes
    const yr = await post("/api/terms", { ...T1, year: 2570 });
    expect(yr.status).toBe(409);
    expect(((await yr.json()) as any).error).toBe("term_year_locked");
    // but within the year it's a plain switch
    await post("/api/terms", { id: "t2x", year: 2569, term: 2, name: "2/2569", start_date: "2026-10-01", end_date: "2027-03-15" });
    expect((await post("/api/terms", { id: "t2x", year: 2569, term: 2, name: "2/2569", is_current: true })).status).toBe(200);
    expect(await currentTermId()).toBe("t2x");
  });
});

describe("who is in a class during a term", () => {
  beforeEach(async () => {
    cookie = await login();
    await seed();
    await post("/api/terms", T1);
  });

  const studentBody = (over: Record<string, unknown>) => ({ id: "st2", code: "102", first_name: "ค", last_name: "ง", class_id: "c1", number: 2, ...over });

  it("a child who left during term 2 is still in term 1's report, but not in term 2's", async () => {
    const { t2 } = await twoTermsWithWork();
    expect((await post("/api/students", studentBody({ status: "moved", left_at: "2026-11-10" }))).status).toBe(200);
    expect((await get("/api/reports/summary?class=c1&term=t1")).students.map((s: any) => s.id)).toEqual(["st1", "st2"]);
    expect((await get(`/api/reports/summary?class=c1&term=${t2}`)).students.map((s: any) => s.id)).toEqual(["st1"]);
    expect((await get(`/api/gradebook?class=c1&term=${t2}`)).students.map((s: any) => s.id)).toEqual(["st1"]);
  });

  it("the day they left is recorded by the server (today if not given), kept on later edits, and cleared when they return", async () => {
    await post("/api/students", studentBody({ status: "moved" }));
    const left = (await one("SELECT left_at FROM students WHERE id='st2'")).left_at as string;
    expect(left).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // renaming a child who already left doesn't move the day
    await post("/api/students", studentBody({ status: "moved", left_at: "2026-08-20", first_name: "ค2" }));
    expect((await one("SELECT left_at FROM students WHERE id='st2'")).left_at).toBe("2026-08-20");
    await post("/api/students", studentBody({ status: "moved", first_name: "ค3" }));
    expect((await one("SELECT left_at FROM students WHERE id='st2'")).left_at).toBe("2026-08-20");

    await post("/api/students", studentBody({ status: "active" }));
    expect((await one("SELECT left_at FROM students WHERE id='st2'")).left_at).toBeNull();
    // and 'finished' is a status the teacher can set by hand
    expect((await post("/api/students", studentBody({ status: "finished" }))).status).toBe(200);
    expect((await get("/api/students?status=finished")).students.map((s: any) => s.id)).toEqual(["st2"]);
  });

  it("importing a paste puts children back in the class as current ones (no left day)", async () => {
    await post("/api/students", studentBody({ status: "moved", left_at: "2026-08-20" }));
    await post("/api/students/import", { class_id: "c1", students: [{ code: "102", first_name: "ค", last_name: "ง", number: 2 }] });
    expect(await one("SELECT status, left_at FROM students WHERE id='st2'")).toEqual({ status: "active", left_at: null });
  });

  it("the import preview says when most of a class isn't in the paste (a new year's list going into last year's class)", async () => {
    await env.DB.batch(Array.from({ length: 8 }, (_, i) => env.DB.prepare(
      "INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,?,?,?,?,'active',0)",
    ).bind(`p${i}`, `${500 + i}`, `Q-PREVIEW${i}AB`, "ก", "ข", "c1", 10 + i)));
    const res = await post("/api/students/import/preview", { class_id: "c1", students: [{ code: "901", first_name: "ใหม่", last_name: "ก", number: 40 }] });
    const body = (await res.json()) as any;
    expect(body.classActive).toBe(10);
    expect(body.notInPaste).toBe(10);
  });
});

describe("attendance and classes across years", () => {
  beforeEach(async () => {
    cookie = await login();
    await seed();
    await post("/api/terms", T1);
  });

  it("attendance can't be written for a day before the current school year began", async () => {
    const row = [{ studentId: "st1", status: "present" }];
    const early = await post("/api/attendance/batch", { date: "2026-01-10", classId: "c1", rows: row });
    expect(early.status).toBe(422);
    expect(((await early.json()) as any).error).toBe("before_school_year");
    expect((await one("SELECT COUNT(*) AS n FROM attendance")).n).toBe(0);
    expect((await post("/api/attendance/batch", { date: "2026-05-15", classId: "c1", rows: row })).status).toBe(200);
    expect((await post("/api/attendance/batch", { date: "2026-09-10", classId: "c1", rows: row })).status).toBe(200);
  });

  it("with no term dates there is no start to enforce (older setups keep working)", async () => {
    await post("/api/terms", { id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null });
    expect((await post("/api/attendance/batch", { date: "2026-01-10", classId: "c1", rows: [{ studentId: "st1", status: "present" }] })).status).toBe(200);
  });

  it("a new class is filed under the current year; a class of a past year can't be brought back", async () => {
    const made = (await (await post("/api/classes", { name: "ป.5/1" })).json()) as any;
    expect((await one("SELECT year FROM classes WHERE id = ?", made.id)).year).toBe(2569);

    const { t2 } = await twoTermsWithWork();
    await start(t2, { ...YEAR2570, keepClasses: ["c1"] });
    const back = await post("/api/classes", { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 10, archived: false });
    expect(back.status).toBe(409);
    expect(((await back.json()) as any).error).toBe("class_of_past_year");
    expect((await one("SELECT archived FROM classes WHERE id='c1'")).archived).toBe(1);
    // renaming it while it stays put is fine
    expect((await post("/api/classes", { id: "c1", name: "ป.6/1 (เก่า)", grade: "ป.6", sort: 10, archived: true })).status).toBe(200);
  });

  it("work for a new year can't be attached to last year's class (and vice versa)", async () => {
    const { t2 } = await twoTermsWithWork();
    const { termId: t3, classes } = (await (await start(t2, { ...YEAR2570, keepClasses: ["c1"] })).json()) as any;
    const mk = (class_ids: string[], term_id: string, id = "a3") => post("/api/assignments", {
      id, term_id, subject_id: "s1", type_id: "wt_worksheet", title: "งานใหม่", full_score: 10, class_ids,
    });
    const wrong = await mk(["c1"], t3);
    expect(wrong.status).toBe(422);
    expect(((await wrong.json()) as any).error).toBe("class_year_mismatch");
    expect((await mk([classes[0].id], t3)).status).toBe(200);
    expect((await mk([classes[0].id], t2, "a4")).status).toBe(422); // the new class in last year's term
    // old work keeps its own classes when it is edited afterwards (closing it, say)
    const a2 = await get(`/api/gradebook?class=c1&term=${t2}`);
    expect(a2.assignments[0].class_ids).toEqual(["c1"]);
    expect((await post("/api/assignments", { id: "a2", term_id: t2, subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 2/2569", full_score: 10, status: "closed", class_ids: ["c1"] })).status).toBe(200);
  });
});

describe("backups from before the school-year model", () => {
  beforeEach(async () => {
    cookie = await login();
    await seed();
    await post("/api/terms", T1);
  });

  async function takeBackup() {
    const data: Record<string, any[]> = {}, counts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      data[t] = ((await get(`/api/backup?table=${t}`)) as any).rows;
      counts[t] = data[t].length;
    }
    return { data, counts };
  }
  async function restore(b: { data: Record<string, any[]>; counts: Record<string, number> }, schema_version: number) {
    const v = (await (await post("/api/restore/validate", { manifest: { schema_version, counts: b.counts } })).json()) as any;
    for (const t of BACKUP_TABLES) {
      for (let i = 0; i < b.data[t].length; i += 500) {
        const r = await post("/api/restore/execute", { restoreId: v.restoreId, step: "chunk", table: t, seq: i / 500, rows: b.data[t].slice(i, i + 500) });
        expect(r.status).toBe(200);
      }
    }
    return post("/api/restore/execute", { restoreId: v.restoreId, step: "commit" });
  }

  it("carries each class's year and each child's left day through a backup and back", async () => {
    await post("/api/students", { id: "st2", code: "102", first_name: "ค", last_name: "ง", class_id: "c1", number: 2, status: "moved", left_at: "2026-08-20" });
    const backup = await takeBackup();
    await env.DB.prepare("UPDATE classes SET year = 1 WHERE id='c1'").run();
    await env.DB.prepare("UPDATE students SET left_at = NULL WHERE id='st2'").run();
    expect((await restore(backup, 5)).status).toBe(200);
    expect((await one("SELECT year FROM classes WHERE id='c1'")).year).toBe(2569);
    expect((await one("SELECT left_at FROM students WHERE id='st2'")).left_at).toBe("2026-08-20");
  });

  it("restores a v4 file (no year, no left day): the classes count as belonging to any year, so nothing disappears", async () => {
    const backup = await takeBackup();
    backup.data.classes = backup.data.classes.map(({ year, ...c }) => c);
    backup.data.students = backup.data.students.map(({ left_at, ...s }) => s);
    expect((await restore(backup, 4)).status).toBe(200);

    expect((await one("SELECT year FROM classes WHERE id='c1'")).year).toBeNull();
    expect((await one("SELECT left_at FROM students WHERE id='st1'")).left_at).toBeNull();
    // the class still shows its children in this year's term …
    expect((await get("/api/gradebook?class=c1&term=t1")).students.map((s: any) => s.id)).toEqual(["st1", "st2"]);
    expect((await get("/api/reports/summary?class=c1&term=t1")).students.map((s: any) => s.id)).toEqual(["st1", "st2"]);
    // … and starting a new year still works on it (a class with no year is treated as this year's)
    const res = await start("t1", { ...YEAR2570, keepClasses: ["c1"] });
    expect(res.status).toBe(200);
    expect((await one("SELECT archived, year FROM classes WHERE id='c1'")).archived).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM classes WHERE year = 2570")).n).toBe(1);
  });
});

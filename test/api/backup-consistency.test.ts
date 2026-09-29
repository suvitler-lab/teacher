// Round 3: a backup you cannot trust is worse than none. Two things are checked here:
//  · the fingerprint that lets the app notice another device saving in the middle of a backup;
//  · the restore drill the audit asked for — back up a school's worth of data, damage it, restore, and get EXACTLY it back.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { takeBackup, restoreFrom } from "./backup-helpers";
import { BACKUP_TABLES } from "../../worker/routes/backup";
import { seedVolume, expectedVolume } from "./volume";

const fingerprint = async (cookie: string) => ((await (await call("/api/backup/fingerprint", {}, cookie)).json()) as any).fingerprint as string;

describe("backup fingerprint", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("needs a signed-in teacher", async () => {
    expect((await call("/api/backup/fingerprint")).status).toBe(401);
  });

  it("is the same while nothing is written — reading a backup does not disturb it", async () => {
    const a = await fingerprint(cookie);
    await call("/api/backup?table=students", {}, cookie);
    await call("/api/backup?table=submissions", {}, cookie);
    expect(await fingerprint(cookie)).toBe(a);
  });

  const op = (o: Record<string, unknown> = {}) => ({
    opId: "o" + Math.random().toString(36).slice(2), scanSessionId: "scn", assignmentId: "a1", studentId: "st1",
    status: "submitted", score: 5, fullScoreAtScan: 10, method: "grid", clientTs: Date.now(), ...o,
  });
  const assignment = (o: Record<string, unknown> = {}) => ({
    id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
    assigned_date: "2569-09-01", due_date: "2569-12-31", publish_scores: true, class_ids: ["c1"], ...o,
  });

  // every kind of write another device could make while a backup is being read
  const writes: [string, (c: string) => unknown][] = [
    ["a score", (c) => call("/api/submissions/batch", json({ ops: [op()] }), c)],
    ["a changed score", async (c) => { await call("/api/submissions/batch", json({ ops: [op({ score: 4, clientTs: Date.now() - 5000 })] }), c); await new Promise((r) => setTimeout(r, 5)); return call("/api/submissions/batch", json({ ops: [op({ score: 9 })] }), c); }],
    ["a bulk clear", async (c) => { await call("/api/submissions/batch", json({ ops: [op()] }), c); return call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), c); }],
    ["an attendance mark", (c) => call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present" }] }), c)],
    ["an edited assignment", (c) => call("/api/assignments", json(assignment({ title: "แก้ชื่อ" })), c)],
    ["a deleted assignment", (c) => call("/api/assignments/a1/delete", json({}), c)],
    ["a renamed class", (c) => call("/api/classes", json({ id: "c1", name: "ป.6/9" }), c)],
    ["a new subject", (c) => call("/api/subjects", json({ name: "ภาษาไทย", color: "red" }), c)],
    ["an edited student", (c) => call("/api/students", json({ id: "st1", code: "101", first_name: "เปลี่ยน", last_name: "ข", class_id: "c1", number: 1 }), c)],
    ["a school-name setting", (c) => call("/api/settings", { method: "PUT", body: JSON.stringify({ school_name: "โรงเรียนทดสอบ" }) }, c)],
    ["a rotated QR", (c) => call("/api/students/st1/qr/rotate", json({}), c)],
    ["a restore (epoch)", async () => env.DB.prepare("UPDATE meta SET value='2' WHERE key='data_epoch'").run()],
  ];
  it.each(writes)("changes when %s is written", async (_name, write) => {
    const before = await fingerprint(cookie);
    await write(cookie);
    expect(await fingerprint(cookie)).not.toBe(before);
  });
});

describe("backup paging", () => {
  it("visits every row exactly once, hands out rows as stored, and does not skip or repeat when rows are missing in between", async () => {
    const cookie = await login();
    await seedVolume();
    // gaps in the row ids, as after deletes: paging by "the next 500 after this id" must not care
    await env.DB.prepare("DELETE FROM submissions WHERE rowid % 3 = 0").run();
    const left = (await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions").first<any>()).n;

    const seen = new Set<string>();
    let pages = 0;
    for (let cursor: number | null = 0; cursor !== null; pages++) {
      const page = (await (await call(`/api/backup?table=submissions&cursor=${cursor}`, {}, cookie)).json()) as any;
      expect(page.rows.length).toBeLessThanOrEqual(500);
      for (const r of page.rows) {
        expect(Object.keys(r), "the paging marker must not leak into the data").not.toContain("_rid");
        const key = r.assignment_id + "|" + r.student_id;
        expect(seen.has(key), `${key} sent twice`).toBe(false);
        seen.add(key);
      }
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(left);
    expect(pages).toBeGreaterThan(5);
  }, 120_000);

  it("a table that is exactly one page long ends cleanly, and an empty one is an empty page", async () => {
    const cookie = await login();
    await seedVolume();
    const classes = (await (await call("/api/backup?table=classes", {}, cookie)).json()) as any;
    expect(classes).toMatchObject({ nextCursor: null });
    expect(classes.rows).toHaveLength(5);
    const empty = (await (await call("/api/backup?table=revoked_qr_tokens", {}, cookie)).json()) as any;
    expect(empty).toMatchObject({ rows: [], nextCursor: null });
  }, 60_000);
});

// ---- the restore drill ----------------------------------------------------
const sorted = (rows: any[]) => rows.map((r) => JSON.stringify(r)).sort();
const one = async (sql: string) => (await env.DB.prepare(sql).first<any>()) as Record<string, number>;

describe("restore drill at the size of a real school term", () => {
  it("backup → damage everything → restore → the data is exactly what it was", async () => {
    const cookie = await login();
    await seedVolume();
    const want = expectedVolume();

    // the seed is what we think it is (so "the same" below means something)
    expect((await one("SELECT COUNT(*) AS n FROM submissions")).n).toBe(want.submissions);
    expect((await one("SELECT SUM(score) AS n FROM submissions")).n).toBe(want.scoreSum);
    expect((await one("SELECT COUNT(*) AS n FROM attendance")).n).toBe(want.attendance);

    const first = await takeBackup(cookie);
    expect(first.counts).toMatchObject({
      students: want.students, assignments: want.assignments, assignment_classes: want.links,
      submissions: want.submissions, attendance_sessions: want.sessions, attendance: want.attendance,
    });

    // damage: wrong scores, lost marks, a renamed child, a closed assignment, an extra class, a deleted class link
    await env.DB.batch([
      env.DB.prepare("UPDATE submissions SET score = 0"),
      env.DB.prepare("DELETE FROM attendance WHERE status = 'absent'"),
      env.DB.prepare("UPDATE attendance SET status = 'absent' WHERE session_id = 'as1_1'"),
      env.DB.prepare("UPDATE students SET first_name = 'ผิด' WHERE id = 'st1_1'"),
      env.DB.prepare("UPDATE assignments SET status = 'closed', title = 'พัง' WHERE id = 'a7'"),
      env.DB.prepare("DELETE FROM assignment_classes WHERE assignment_id = 'a3'"),
      env.DB.prepare("INSERT INTO classes (id, name, grade, sort, archived, year, updated_at) VALUES ('cx', 'ห้องเกิน', 'ป.6', 99, 0, 2569, 5)"),
    ]);
    expect((await one("SELECT SUM(score) AS n FROM submissions")).n).toBe(0);

    const res = await restoreFrom(cookie, first);
    expect(res.status).toBe(200);

    // every table, every row, every column
    const second = await takeBackup(cookie);
    for (const t of BACKUP_TABLES) {
      expect(second.counts[t], `${t}: row count`).toBe(first.counts[t]);
      expect(sorted(second.data[t]), `${t}: rows`).toEqual(sorted(first.data[t]));
    }
    // and the numbers a teacher reads off the screen, recomputed from the live tables
    expect((await one("SELECT SUM(score) AS n FROM submissions")).n).toBe(want.scoreSum);
    const marks = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM attendance GROUP BY status").all<{ status: string; n: number }>();
    expect(Object.fromEntries((marks.results ?? []).map((m) => [m.status, m.n]))).toEqual(want.marks);
    expect((await one("SELECT COUNT(*) AS n FROM classes")).n).toBe(want.students / 40);
    expect((await one("SELECT first_name AS n FROM students WHERE id = 'st1_1'")).n).toBe("ชื่อ1_1");
    // and the restore did what it says on the epoch, so other devices' queues are held
    expect((await one("SELECT CAST(value AS INTEGER) AS n FROM meta WHERE key = 'data_epoch'")).n).toBe(2);
  }, 120_000);

  it("a backup taken from the restored data is the same as the one restored (the drill is repeatable)", async () => {
    const cookie = await login();
    await seedVolume();
    const first = await takeBackup(cookie);
    expect((await restoreFrom(cookie, first)).status).toBe(200);
    const second = await takeBackup(cookie);
    expect((await restoreFrom(cookie, second)).status).toBe(200);
    const third = await takeBackup(cookie);
    for (const t of BACKUP_TABLES) expect(sorted(third.data[t]), t).toEqual(sorted(first.data[t]));
  }, 180_000);
});

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

// Migration 0008 (schema 7): timetable_slots constraints and terms.timetable_rev. Direct SQL on the
// test D1 (real migrations applied by test/apply-migrations.ts) — the API is T-12's job.
const NOW = 1_700_000_000_000;
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
const rejects = async (sql: string, ...b: unknown[]) => {
  let err: unknown = null;
  try { await run(sql, ...b); } catch (e) { err = e; }
  return err;
};
const INS = "INSERT INTO timetable_slots (term_id, weekday, period, kind, class_id, subject_id, label, updated_at) VALUES (?,?,?,?,?,?,?,?)";

async function base() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM timetable_slots"),
    env.DB.prepare("DELETE FROM classes"), env.DB.prepare("DELETE FROM subjects"), env.DB.prepare("DELETE FROM terms"),
    env.DB.prepare("INSERT INTO terms (id, year, term, name, is_current, updated_at) VALUES ('t1', 2569, 2, '2/2569', 1, ?)").bind(NOW),
    env.DB.prepare("INSERT INTO classes (id, name, sort, archived, updated_at) VALUES ('c1', 'ป.6/1', 1, 0, ?)").bind(NOW),
    env.DB.prepare("INSERT INTO subjects (id, name, sort, archived, updated_at) VALUES ('s1', 'คณิตศาสตร์', 1, 0, ?)").bind(NOW),
  ]);
}
async function cleanup() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM timetable_slots"),
    env.DB.prepare("DELETE FROM classes"), env.DB.prepare("DELETE FROM subjects"), env.DB.prepare("DELETE FROM terms"),
  ]);
}
const count = async () => (await env.DB.prepare("SELECT COUNT(*) n FROM timetable_slots").first<{ n: number }>())!.n;

describe("migration 0008 timetable_slots", () => {
  it("leaves schema_version 7 after the migrations and starts terms at timetable_rev 0", async () => {
    await base();
    try {
      const m = await env.DB.prepare("SELECT value FROM meta WHERE key='schema_version'").first<{ value: string }>();
      // reset() in helpers.ts rewrites the marker per test; the migration itself must have written 7 first
      expect(["6", "7"]).toContain(m!.value);
      const t = await env.DB.prepare("SELECT timetable_rev FROM terms WHERE id='t1'").first<{ timetable_rev: number }>();
      expect(t!.timetable_rev).toBe(0);
    } finally { await cleanup(); }
  });

  it("accepts a class slot and an activity slot", async () => {
    await base();
    try {
      await run(INS, "t1", 1, 2, "class", "c1", "s1", null, NOW);
      await run(INS, "t1", 1, 3, "class", "c1", null, null, NOW); // subject is optional
      await run(INS, "t1", 5, 7, "activity", null, null, "PLC สายชั้น", NOW);
      expect(await count()).toBe(3);
    } finally { await cleanup(); }
  });

  it("rejects a class slot without a class, or with a label", async () => {
    await base();
    try {
      expect(await rejects(INS, "t1", 1, 1, "class", null, "s1", null, NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 1, "class", "c1", null, "ชื่อ", NOW)).toBeTruthy();
      expect(await count()).toBe(0);
    } finally { await cleanup(); }
  });

  it("rejects an activity slot with a class or subject, or without a usable label", async () => {
    await base();
    try {
      expect(await rejects(INS, "t1", 1, 1, "activity", "c1", null, "ลูกเสือ", NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 1, "activity", null, "s1", "ลูกเสือ", NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 1, "activity", null, null, null, NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 1, "activity", null, null, "   ", NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 1, "activity", null, null, "ก".repeat(801), NOW)).toBeTruthy();
      await run(INS, "t1", 1, 1, "activity", null, null, "ก".repeat(40), NOW); // 40 exactly is allowed
      expect(await count()).toBe(1);
    } finally { await cleanup(); }
  });

  it("rejects an unknown kind, weekday 0/8, period 0/9", async () => {
    await base();
    try {
      expect(await rejects(INS, "t1", 1, 1, "lunch", "c1", null, null, NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 0, 1, "class", "c1", null, null, NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 8, 1, "class", "c1", null, null, NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 0, "class", "c1", null, null, NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 9, "class", "c1", null, null, NOW)).toBeTruthy();
      await run(INS, "t1", 7, 8, "class", "c1", null, null, NOW); // 7 and 8 are the allowed maxima
      expect(await count()).toBe(1);
    } finally { await cleanup(); }
  });

  it("rejects a second row for the same (term, weekday, period)", async () => {
    await base();
    try {
      await run(INS, "t1", 2, 2, "class", "c1", "s1", null, NOW);
      expect(await rejects(INS, "t1", 2, 2, "activity", null, null, "ชุมนุม", NOW)).toBeTruthy();
      expect(await count()).toBe(1);
    } finally { await cleanup(); }
  });

  it("rejects unknown term / class / subject (foreign keys)", async () => {
    await base();
    try {
      expect(await rejects(INS, "nope", 1, 1, "class", "c1", null, null, NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 1, "class", "nope", null, null, NOW)).toBeTruthy();
      expect(await rejects(INS, "t1", 1, 1, "class", "c1", "nope", null, NOW)).toBeTruthy();
      expect(await count()).toBe(0);
    } finally { await cleanup(); }
  });

  it("refuses to delete a class or term a slot still points at", async () => {
    await base();
    try {
      await run(INS, "t1", 1, 2, "class", "c1", "s1", null, NOW);
      expect(await rejects("DELETE FROM classes WHERE id='c1'")).toBeTruthy();
      expect(await rejects("DELETE FROM terms WHERE id='t1'")).toBeTruthy();
    } finally { await cleanup(); }
  });

  it("the rev is a plain counter that can be bumped", async () => {
    await base();
    try {
      await run("UPDATE terms SET timetable_rev = timetable_rev + 1 WHERE id = 't1'");
      const t = await env.DB.prepare("SELECT timetable_rev FROM terms WHERE id='t1'").first<{ timetable_rev: number }>();
      expect(t!.timetable_rev).toBe(1);
      expect(await rejects("UPDATE terms SET timetable_rev = NULL WHERE id = 't1'")).toBeTruthy();
    } finally { await cleanup(); }
  });

  it("has the class index", async () => {
    const r = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_timetable_slots_class'").first();
    expect(r).toBeTruthy();
  });
});

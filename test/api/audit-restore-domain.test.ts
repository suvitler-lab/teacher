import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { takeBackup, type Backup } from "./backup-helpers";
import { BACKUP_TABLES, commitRestore } from "../../worker/routes/backup";

let cookie: string;
beforeEach(async () => {
  cookie = await login(); await seed();
  await env.DB.prepare("INSERT INTO submissions(assignment_id,student_id,status,score,late,updated_at,event_at) VALUES('a1','st1','submitted',8,0,123,123)").run();
});
async function stage(b: Backup) {
  const v = await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: b.counts } }), cookie);
  expect(v.status).toBe(200);
  const { restoreId } = await v.json() as any;
  for (const table of BACKUP_TABLES) if (b.data[table].length) {
    const r = await call("/api/restore/execute", json({ restoreId, step: "chunk", table, seq: 0, rows: b.data[table] }), cookie);
    if (r.status !== 200) return { restoreId, response: r };
  }
  return { restoreId, response: null };
}
async function attempt(b: Backup) {
  const s = await stage(b);
  return s.response ?? call("/api/restore/execute", json({ restoreId: s.restoreId, step: "commit" }), cookie);
}
async function unchanged(before: Backup) {
  expect((await takeBackup(cookie)).data).toEqual(before.data);
  expect((await env.DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first<any>()).value).toBe("1");
  expect((await env.DB.prepare("SELECT COUNT(*) n FROM audit_logs WHERE entity='restore'").first<any>()).n).toBe(0);
}

describe("restore domain invariants", () => {
  it.each([999, -1, 1.25])("refuses invalid score %s without changing live data", async (score) => {
    const before = await takeBackup(cookie), b = structuredClone(before);
    b.data.submissions[0].score = score;
    const r = await attempt(b);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: "invalid_backup", issues: [expect.objectContaining({ table: "submissions", field: "score" })] });
    await unchanged(before);
  });
  it.each([
    ["illegal status", (b: Backup) => { b.data.students[0].status = "unexpected"; }],
    ["missing required name", (b: Backup) => { delete b.data.students[0].first_name; }],
    ["impossible date", (b: Backup) => { b.data.terms[0].start_date = "2026-02-30"; }],
    ["inverted term range", (b: Backup) => { b.data.terms[0].start_date = "2026-10-01"; b.data.terms[0].end_date = "2026-09-01"; }],
    ["missing class reference", (b: Backup) => { b.data.students[0].class_id = "no-class"; }],
    ["submission from another class", (b: Backup) => { b.data.submissions[0].student_id = "st9"; }],
    ["duplicate active number", (b: Backup) => { b.data.students[1].number = b.data.students[0].number; }],
    ["duplicate academic term", (b: Backup) => { b.data.terms.push({ ...b.data.terms[0], id: "another-term", is_current: 0 }); b.counts.terms++; }],
  ])("refuses %s and preserves the snapshot", async (_label, change) => {
    const before = await takeBackup(cookie), b = structuredClone(before);
    change(b);
    const r = await attempt(b);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: "invalid_backup", issues: expect.any(Array) });
    await unchanged(before);
  });
  it("rechecks cross-table score limits inside the transaction if a staged chunk changes after early checks", async () => {
    const before = await takeBackup(cookie);
    const s = await stage(before);
    expect(s.response).toBeNull();
    const r = await commitRestore(env as any, s.restoreId, {
      now: Date.now(), deviceId: null,
      afterChecks: async () => {
        const rows = [{ ...before.data.submissions[0], score: 999 }];
        const uploaded = await call("/api/restore/execute", json({ restoreId: s.restoreId, step: "chunk", table: "submissions", seq: 0, rows }), cookie);
        expect(uploaded.status).toBe(200);
      },
    });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: "invalid_backup" });
    await unchanged(before);
  });
  it("restores valid older rows with the documented missing migration columns", async () => {
    const b = await takeBackup(cookie);
    delete b.data.submissions[0].event_at;
    for (const c of b.data.classes) delete c.year;
    for (const s of b.data.students) delete s.left_at;
    for (const t of b.data.terms) { delete t.start_date; delete t.end_date; }
    const r = await attempt(b);
    expect(r.status).toBe(200);
    expect(await env.DB.prepare("SELECT score,event_at FROM submissions").first()).toEqual({ score: 8, event_at: 123 });
  });
  it("rejects negative and fractional manifest counts", async () => {
    const b = await takeBackup(cookie);
    for (const count of [-1, 1.2]) {
      const r = await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: { ...b.counts, students: count } } }), cookie);
      expect(r.status).toBe(422);
    }
  });
});

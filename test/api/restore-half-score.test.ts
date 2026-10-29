// Regression: half-point scores (BR-01: 0 <= score <= full_score, score*2 integer)
// are saved by POST /api/submissions/batch, so a backup holding them must restore.
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { restoreFrom, takeBackup, type Backup } from "./backup-helpers";

let cookie: string;
const epoch = async () => (await env.DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first<any>())?.value ?? null;
const scoreOf = async () => (await env.DB.prepare("SELECT score, typeof(score) AS t FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>());
const restoreAudits = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity='restore'").first<any>()).n as number;

beforeEach(async () => {
  cookie = await login();
  await seed(); // assignment a1 has full_score 10
  const r = await call("/api/submissions/batch", json({ ops: [{ opId: "half-1", scanSessionId: "s", assignmentId: "a1", studentId: "st1", status: "submitted", score: 7.5, fullScoreAtScan: 10, method: "grid", clientTs: 1 }] }), cookie);
  expect(r.status).toBe(200);
});

describe("restore keeps half-point scores", () => {
  it("AC-01: backup with 7.5 restores through validate -> chunks -> commit and reads back 7.5", async () => {
    expect(await scoreOf()).toEqual({ score: 7.5, t: "real" });
    const backup = await takeBackup(cookie);
    expect(backup.data.submissions.find((s) => s.student_id === "st1")?.score).toBe(7.5);
    const epochBefore = Number(await epoch() ?? 1);

    // Drift after the backup, so the restore has to really put the 7.5 back.
    await env.DB.prepare("UPDATE submissions SET score=3 WHERE assignment_id='a1' AND student_id='st1'").run();

    const r = await restoreFrom(cookie, backup);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
    expect(await scoreOf()).toEqual({ score: 7.5, t: "real" });
    expect(Number(await epoch())).toBe(epochBefore + 1);
    const after = await takeBackup(cookie);
    expect(after.counts).toEqual(backup.counts);
    expect(after.data.submissions).toEqual(backup.data.submissions);
  });

  it("AC-03: whole-number and null scores still restore as before", async () => {
    await call("/api/submissions/batch", json({ ops: [
      { opId: "int-1", scanSessionId: "s", assignmentId: "a1", studentId: "st1", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: 2 },
      { opId: "null-1", scanSessionId: "s", assignmentId: "a1", studentId: "st2", status: "submitted", score: null, fullScoreAtScan: 10, method: "grid", clientTs: 2 },
    ] }), cookie);
    const backup = await takeBackup(cookie);
    expect(backup.data.submissions.map((s) => s.score).sort()).toEqual([8, null].sort());
    const r = await restoreFrom(cookie, backup);
    expect(r.status).toBe(200);
    expect((await takeBackup(cookie)).data.submissions).toEqual(backup.data.submissions);
  });

  it.each<[string, unknown, string]>([
    ["quarter step 7.25", 7.25, "chunk"],
    ["negative half -0.5", -0.5, "chunk"],
    ["string \"7.5\"", "7.5", "chunk"],
    ["over full 10.5", 10.5, "commit"],
  ])("AC-02: refuses %s with invalid_backup on submissions.score and changes nothing", async (_label, score) => {
    const before = await takeBackup(cookie);
    const epochBefore = await epoch();
    const auditsBefore = await restoreAudits();
    const b: Backup = structuredClone(before);
    b.data.submissions.find((s) => s.student_id === "st1")!.score = score;

    // Same real flow as the app, but the bad row may be stopped at the chunk step already.
    const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: b.counts } }), cookie)).json()) as any;
    let res: Response | null = null;
    for (const t of Object.keys(b.data)) {
      if (!b.data[t].length) continue;
      const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq: 0, rows: b.data[t] }), cookie);
      if (r.status !== 200) { res = r; break; }
    }
    res ??= await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "commit" }), cookie);

    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("invalid_backup");
    expect(body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ table: "submissions", field: "score" })]));
    expect((await takeBackup(cookie)).data).toEqual(before.data);
    expect(await epoch()).toBe(epochBefore);
    expect(await restoreAudits()).toBe(auditsBefore);
  });

  it("AC-02: the in-transaction SQL guard alone also rejects 7.25 and strings (staged rows bypassing zod)", async () => {
    const before = await takeBackup(cookie);
    for (const score of [7.25, -0.5, "7.5", 10.5]) {
      const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: before.counts } }), cookie)).json()) as any;
      for (const t of Object.keys(before.data)) {
        if (!before.data[t].length) continue;
        const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq: 0, rows: before.data[t] }), cookie);
        expect(r.status).toBe(200);
      }
      // Tamper with the staged JSON directly, as a replaced chunk could after the row checks.
      const staged = await env.DB.prepare("SELECT rows_json FROM restore_staging WHERE job_id=? AND tbl='submissions'").bind(v.restoreId).first<any>();
      const rows = JSON.parse(staged.rows_json);
      rows.find((s: any) => s.student_id === "st1").score = score;
      await env.DB.prepare("UPDATE restore_staging SET rows_json=? WHERE job_id=? AND tbl='submissions'").bind(JSON.stringify(rows), v.restoreId).run();
      const res = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "commit" }), cookie);
      expect(res.status, `score ${JSON.stringify(score)}`).toBe(422);
      expect(await res.json()).toMatchObject({ error: "invalid_backup", issues: [expect.objectContaining({ table: "submissions", field: "score" })] });
    }
    expect((await takeBackup(cookie)).data).toEqual(before.data);
  });
});

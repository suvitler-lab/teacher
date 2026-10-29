// QA black-box check for job 2026-10-30-m1-01-restore-half-score (T-02).
// Expected results were calculated from BR-01 before running (docs/team/jobs/.../evidence/qa-expected-from-br.md).
// BR-01: valid score = null, or a JSON number with 0 <= score <= full_score and score*2 an integer.
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { takeBackup, type Backup } from "./backup-helpers";
import { BACKUP_TABLES } from "../../worker/routes/backup";
import { computeReport } from "../../src/lib/report";

let cookie: string;
const record = (r: Record<string, unknown>) => console.log("QA-ROW " + JSON.stringify(r));

const epoch = async () => Number((await env.DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first<any>())?.value ?? 0);
const restoreAudits = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity='restore'").first<any>()).n as number;
const fingerprint = async () => ((await (await call("/api/backup/fingerprint", {}, cookie)).json()) as any).fingerprint as string;
const dataPartOf = (fp: string) => fp.split("#").slice(0, -2).join("#"); // drop audit max id + data_epoch
const scoreRow = async (sid = "st1") =>
  env.DB.prepare("SELECT score, typeof(score) AS t FROM submissions WHERE assignment_id='a1' AND student_id=?").bind(sid).first<any>();

/** The app's real restore flow: validate -> chunk x N (500 rows) -> commit. Returns where it stopped. */
async function tryRestore(b: Backup) {
  const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: b.counts } }), cookie)).json()) as any;
  expect(v.ok).toBe(true);
  for (const t of BACKUP_TABLES) {
    const rows = b.data[t];
    for (let i = 0, seq = 0; i < rows.length; i += 500, seq++) {
      const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq, rows: rows.slice(i, i + 500) }), cookie);
      if (r.status !== 200) return { stage: `chunk:${t}#${seq}`, status: r.status, body: (await r.json()) as any, restoreId: v.restoreId };
    }
  }
  const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "commit" }), cookie);
  return { stage: "commit", status: r.status, body: (await r.json()) as any, restoreId: v.restoreId };
}

async function saveScore(score: number | null, full: number, sid = "st1", opId = "qa-op") {
  const r = await call("/api/submissions/batch", json({ ops: [{ opId, scanSessionId: "qa", assignmentId: "a1", studentId: sid, status: "submitted", score, fullScoreAtScan: full, method: "grid", clientTs: 1 }] }), cookie);
  expect(r.status).toBe(200);
}

beforeEach(async () => {
  cookie = await login();
  await seed(); // a1 full 10, class c1 = st1, st2
});


type Case = [label: string, full: number, value: unknown, expectOk: boolean, expectedCode: string | null];
const cases: Case[] = [
  ["null", 10, null, true, null],
  ["0", 10, 0, true, null],
  ["0.5", 10, 0.5, true, null],
  ["7", 10, 7, true, null],
  ["7.5", 10, 7.5, true, null],
  ["10 (= full)", 10, 10, true, null],
  ["10.5 (> full)", 10, 10.5, false, "score_over_full"],
  ["7.25 (quarter)", 10, 7.25, false, "invalid_score"],
  ["-0.5 (negative)", 10, -0.5, false, "invalid_score"],
  ["\"7.5\" (string)", 10, "7.5", false, "invalid_score"],
  ["100.5 (> full)", 10, 100.5, false, "score_over_full"],
  ["0.1 (extra)", 10, 0.1, false, "invalid_score"],
  ["true (extra)", 10, true, false, "invalid_score"],
  ["11 (extra, > full)", 10, 11, false, "score_over_full"],
  ["full1 0.5", 1, 0.5, true, null],
  ["full1 1", 1, 1, true, null],
  ["full1 1.5 (> full)", 1, 1.5, false, "score_over_full"],
];

describe("QA BR-01 table through backup -> restore", () => {
  it.each(cases)("%s (full %d)", async (label, full, value, expectOk, expectedCode) => {
    if (full !== 10) await env.DB.prepare("UPDATE assignments SET full_score=? WHERE id='a1'").bind(full).run();
    await saveScore(1, full); // a valid integer score in the live data
    const before = await takeBackup(cookie);
    const fpBefore = await fingerprint();
    const epochBefore = await epoch();
    const auditsBefore = await restoreAudits();

    const b: Backup = structuredClone(before);
    b.data.submissions.find((s) => s.student_id === "st1")!.score = value;
    const res = await tryRestore(b);
    const scoreIssue = (res.body?.issues ?? []).find((i: any) => i.table === "submissions" && i.field === "score");
    const row = await scoreRow();
    record({
      label, full, value, expectOk, expectedCode,
      status: res.status, stage: res.stage, error: res.body?.error ?? null,
      issues: res.body?.issues ?? null, liveScore: row?.score, liveType: row?.t,
      epochDelta: (await epoch()) - epochBefore, auditDelta: (await restoreAudits()) - auditsBefore,
    });

    if (expectOk) {
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(Object.is(row.score, value)).toBe(true);
      expect(row.t).toBe(value === null ? "null" : Number.isInteger(value) ? "integer" : "real");
      expect(await epoch()).toBe(epochBefore + 1);
      expect(await restoreAudits()).toBe(auditsBefore + 1);
      expect((await takeBackup(cookie)).data).toEqual(b.data);
    } else {
      expect(res.status).toBe(422);
      expect(res.body.error).toBe("invalid_backup");
      expect(scoreIssue, JSON.stringify(res.body.issues)).toBeTruthy();
      // nothing changed: rows, fingerprint, epoch, restore audit
      expect((await takeBackup(cookie)).data).toEqual(before.data);
      expect(await fingerprint()).toBe(fpBefore);
      expect(await epoch()).toBe(epochBefore);
      expect(await restoreAudits()).toBe(auditsBefore);
      expect(row).toEqual({ score: 1, t: "integer" });
    }
  });
});

describe("QA AC-01 + (ก) reading 7.5 back after a real restore", () => {
  it("7.5 saved via batch -> backup -> drift -> restore -> gradebook + report show 7.5 / 75%", async () => {
    await saveScore(7.5, 10);
    const backup = await takeBackup(cookie);
    const fpAtBackup = await fingerprint();
    const epochBefore = await epoch();
    await env.DB.prepare("UPDATE submissions SET score=3 WHERE assignment_id='a1' AND student_id='st1'").run();

    const res = await tryRestore(backup);
    expect(res).toMatchObject({ stage: "commit", status: 200, body: { ok: true } });
    expect(await scoreRow()).toEqual({ score: 7.5, t: "real" });
    expect(await epoch()).toBe(epochBefore + 1);
    const after = await takeBackup(cookie);
    expect(after.counts).toEqual(backup.counts);
    expect(after.data).toEqual(backup.data);
    const fpAfter = await fingerprint();
    expect(dataPartOf(fpAfter)).toBe(dataPartOf(fpAtBackup));

    const gb = (await (await call("/api/gradebook?class=c1&term=t1", {}, cookie)).json()) as any;
    const gbSub = gb.submissions.find((s: any) => s.student_id === "st1" && s.assignment_id === "a1");
    expect(gbSub.score).toBe(7.5);

    const rep = (await (await call("/api/reports/summary?class=c1&term=t1", {}, cookie)).json()) as any;
    expect(rep.submissions.find((s: any) => s.student_id === "st1").score).toBe(7.5);
    const model = computeReport(rep);
    const st1 = model.students.find((s) => s.student.id === "st1")!;
    const scored = rep.submissions.filter((s: any) => s.score != null);
    const totalScore = model.students.reduce((n, s) => n + s.score, 0);
    const rawAvg = scored.reduce((n: number, s: any) => n + s.score, 0) / scored.length;
    const a1 = model.assignments.find((a) => a.assignment.id === "a1")!;
    record({ label: "AC-01 (ก)", gradebookScore: gbSub.score, st1Score: st1.score, st1Full: st1.fullScore, totalScore, rawAvg, avgScorePercent: model.metrics.avgScorePercent, a1Average: a1.average, a1Scored: a1.scoredCount, fpDataEqual: dataPartOf(fpAfter) === dataPartOf(fpAtBackup) });
    expect(st1.score).toBe(7.5);
    expect(st1.fullScore).toBe(10);
    expect(totalScore).toBe(7.5);
    expect(rawAvg).toBe(7.5);
    expect(model.metrics.avgScorePercent).toBe(75);
    expect(a1.average).toBe(75);
    expect(a1.scoredCount).toBe(1);
  });
});

describe("QA (ค) legacy-shape backup (whole numbers / null only)", () => {
  it("integer, null and excused rows restore unchanged", async () => {
    await saveScore(8, 10, "st1", "op-1");
    await saveScore(null, 10, "st2", "op-2");
    const before = await takeBackup(cookie);
    expect(before.data.submissions.map((s) => s.score).sort()).toEqual([8, null].sort());
    const b: Backup = structuredClone(before);
    // an older file may also carry an excused row with a null score
    b.data.submissions[1] = { ...b.data.submissions[1], status: "excused", score: null };
    const epochBefore = await epoch();
    const res = await tryRestore(b);
    expect(res).toMatchObject({ stage: "commit", status: 200, body: { ok: true } });
    expect((await takeBackup(cookie)).data).toEqual(b.data);
    expect(await scoreRow("st1")).toEqual({ score: 8, t: "integer" });
    expect(await epoch()).toBe(epochBefore + 1);
    record({ label: "(ค) legacy", status: res.status, scores: b.data.submissions.map((s) => [s.student_id, s.status, s.score]) });
  });
});

describe("QA multi-chunk: half scores across the 500-row chunk boundary", () => {
  async function bigClass(n: number) {
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < n; i++) {
      const id = `qs${i}`;
      stmts.push(env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,?,?,?,?,'active',0)")
        .bind(id, `Q${i}`, `Q-QA${String(i).padStart(8, "0")}`, "ทดสอบ", "😀", "c1", 100 + i));
      stmts.push(env.DB.prepare("INSERT INTO submissions (assignment_id,student_id,status,score,late,method,event_at,updated_at) VALUES ('a1',?,'submitted',?,0,'grid',?,?)")
        .bind(id, (i % 21) / 2, i + 1, i + 1));
    }
    for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  }

  it("520 rows with 0..10 in 0.5 steps restore exactly; one bad row in chunk #1 refuses everything", async () => {
    await bigClass(520);
    const before = await takeBackup(cookie);
    expect(before.data.submissions.length).toBe(520);
    const sumBefore = before.data.submissions.reduce((n, s) => n + s.score, 0);
    // hand-calculated: (i%21)/2 over i=0..519 -> 24 full cycles of 0..10 (sum 105 each) + i=504..519 -> 0..7.5 (16 values, sum 60)
    expect(sumBefore).toBe(24 * 105 + 60);
    await env.DB.prepare("UPDATE submissions SET score=0").run();
    const ok = await tryRestore(before);
    expect(ok).toMatchObject({ stage: "commit", status: 200 });
    const after = await takeBackup(cookie);
    expect(after.data.submissions).toEqual(before.data.submissions);
    const dbSum = await env.DB.prepare("SELECT SUM(score) AS s, SUM(typeof(score)='real') AS reals FROM submissions").first<any>();
    expect(dbSum.s).toBe(2580);
    expect(dbSum.reals).toBe(248); // odd i%21 -> x.5: 24 cycles x 10 + residues 1,3..15 (8) = 248

    // bad row only in the 2nd chunk (row index 510)
    const bad: Backup = structuredClone(after);
    bad.data.submissions[510].score = 7.25;
    const fp = await fingerprint();
    const ep = await epoch();
    const r = await tryRestore(bad);
    record({ label: "multi-chunk", okStatus: ok.status, sumBefore, dbSum, badStage: r.stage, badStatus: r.status, badIssues: r.body?.issues });
    expect(r.status).toBe(422);
    expect(r.stage).toBe("chunk:submissions#1");
    expect((await takeBackup(cookie)).data).toEqual(after.data);
    expect(await fingerprint()).toBe(fp);
    expect(await epoch()).toBe(ep);
  });
});

describe("QA SQL guard alone (staged rows bypassing the chunk check): which code is reported", () => {
  it.each<[unknown]>([[7.25], [-0.5], ["7.5"], [true], [10.5], [7.5]])("staged score %s", async (score) => {
    await saveScore(1, 10);
    const before = await takeBackup(cookie);
    const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: before.counts } }), cookie)).json()) as any;
    for (const t of BACKUP_TABLES) {
      if (!before.data[t].length) continue;
      const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq: 0, rows: before.data[t] }), cookie);
      expect(r.status).toBe(200);
    }
    const staged = await env.DB.prepare("SELECT rows_json FROM restore_staging WHERE job_id=? AND tbl='submissions'").bind(v.restoreId).first<any>();
    const rows = JSON.parse(staged.rows_json);
    rows.find((s: any) => s.student_id === "st1").score = score;
    await env.DB.prepare("UPDATE restore_staging SET rows_json=? WHERE job_id=? AND tbl='submissions'").bind(JSON.stringify(rows), v.restoreId).run();
    const ep = await epoch();
    const res = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "commit" }), cookie);
    const body = (await res.json()) as any;
    record({ label: "sql-guard", score, status: res.status, error: body.error ?? null, issues: body.issues ?? null });
    if (score === 7.5) {
      expect(res.status).toBe(200);
      expect(await scoreRow()).toEqual({ score: 7.5, t: "real" });
    } else {
      expect(res.status).toBe(422);
      expect(body.issues).toEqual([expect.objectContaining({ table: "submissions", field: "score" })]);
      expect(await epoch()).toBe(ep);
      expect(await scoreRow()).toEqual({ score: 1, t: "integer" });
    }
  });
});

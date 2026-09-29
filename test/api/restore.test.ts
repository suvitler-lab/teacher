import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { BACKUP_TABLES, commitRestore } from "../../worker/routes/backup";

type Backup = { data: Record<string, any[]>; counts: Record<string, number> };

/** Read the whole database back through the real backup endpoint, like the client does. */
async function takeBackup(cookie: string): Promise<Backup> {
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const res = await call(`/api/backup?table=${t}`, {}, cookie);
    data[t] = ((await res.json()) as any).rows;
    counts[t] = data[t].length;
  }
  return { data, counts };
}

const validate = (cookie: string, counts: Record<string, number>, schema_version = 5) =>
  call("/api/restore/validate", json({ manifest: { schema_version, counts } }), cookie);
const exec = (cookie: string, body: Record<string, unknown>) => call("/api/restore/execute", json(body), cookie);

/** Upload a backup into staging, in chunks of `size` rows per table. */
async function upload(cookie: string, restoreId: string, b: Backup, size = 500, skip?: (t: string, seq: number) => boolean) {
  for (const t of BACKUP_TABLES) {
    const rows = b.data[t];
    for (let i = 0, seq = 0; i < rows.length; i += size, seq++) {
      if (skip?.(t, seq)) continue;
      const r = await exec(cookie, { restoreId, step: "chunk", table: t, seq, rows: rows.slice(i, i + size) });
      expect(r.status).toBe(200);
    }
  }
}
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<any>()).n as number;

describe("backup", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("paginates a table and reports the schema version", async () => {
    const body = (await (await call("/api/backup?table=students", {}, cookie)).json()) as any;
    expect(body.rows.length).toBe(3);
    expect(body.schema_version).toBe(5);
  });

  it("rejects an unknown table", async () => {
    expect((await call("/api/backup?table=teacher", {}, cookie)).status).toBe(400);
  });
});

describe("restore validation", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });
  const zeros = () => Object.fromEntries(BACKUP_TABLES.map((t) => [t, 0]));

  it("refuses a backup newer than the app", async () => {
    const res = await validate(cookie, zeros(), 999);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "schema_mismatch", file: 999, app: 5 });
  });

  it("accepts an older (v1) backup", async () => {
    const res = await validate(cookie, zeros(), 1);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).restoreId).toBeTruthy();
  });

  it("refuses a file that doesn't list every table — it would silently empty the missing ones", async () => {
    const counts: Record<string, number> = zeros();
    delete counts.attendance;
    const res = await validate(cookie, counts);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "incomplete_backup", missing: ["attendance"] });
  });
});

describe("restore replaces the data — in one transaction", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
    // some real activity so counts aren't trivial
    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "absent" }] }), cookie);
    await call("/api/submissions/batch", json({ ops: [{ opId: "o1", scanSessionId: "s", assignmentId: "a1", studentId: "st1", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: 1 }] }), cookie);
  });

  it("brings back the backed-up state and REMOVES what was added after it", async () => {
    const backup = await takeBackup(cookie);

    // life goes on after the backup: a rename, a new student, a new attendance day
    await env.DB.prepare("UPDATE classes SET name = 'ชื่อใหม่' WHERE id = 'c1'").run();
    await env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,updated_at) VALUES ('st_new','999','Q-NEWNEWNEW1','ใหม่','มาก','c1',9,'active',1)").run();
    await call("/api/attendance/batch", json({ date: "2026-09-11", classId: "c1", rows: [{ studentId: "st1", status: "late" }] }), cookie);
    expect(await count("students")).toBe(4);

    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v.restoreId, backup);
    expect((await exec(cookie, { restoreId: v.restoreId, step: "commit" })).status).toBe(200);

    expect((await env.DB.prepare("SELECT name FROM classes WHERE id='c1'").first<any>()).name).toBe("ป.6/1");
    expect(await count("students")).toBe(3);                 // st_new is gone: "replace", not "merge"
    expect(await count("attendance_sessions")).toBe(1);      // the day added after the backup is gone
    expect(await count("submissions")).toBe(1);
    expect(await count("restore_staging")).toBe(0);           // staging cleaned up
    expect((await env.DB.prepare("SELECT status FROM restore_jobs").first<any>()).status).toBe("done");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity='restore'").first<any>()).n).toBe(1);
  });

  it("keeps the account and signed-in devices: the teacher is still logged in afterwards", async () => {
    const backup = await takeBackup(cookie);
    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v.restoreId, backup);
    await exec(cookie, { restoreId: v.restoreId, step: "commit" });

    const me = (await (await call("/api/auth/me", {}, cookie)).json()) as any;
    expect(me.authenticated).toBe(true);
    expect(await count("teacher")).toBe(1);
    expect(await count("devices")).toBe(1);
  });

  it("uploading touches nothing live and doesn't lock the system", async () => {
    const backup = await takeBackup(cookie);
    await env.DB.prepare("UPDATE classes SET name = 'ก่อนกู้คืน' WHERE id = 'c1'").run();

    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v.restoreId, backup);

    // still the current data, and normal writes still work while a restore is staged
    expect((await env.DB.prepare("SELECT name FROM classes WHERE id='c1'").first<any>()).name).toBe("ก่อนกู้คืน");
    expect((await call("/api/classes", json({ name: "ป.5/1" }), cookie)).status).toBe(200);
  });

  it("a failing restore changes NOTHING (foreign-key violation rolls the whole swap back)", async () => {
    const backup = await takeBackup(cookie);
    // a student pointing at a class that isn't in the file
    backup.data.students[0] = { ...backup.data.students[0], class_id: "no-such-class" };
    const before = { students: await count("students"), classes: await count("classes"), attendance: await count("attendance") };
    await env.DB.prepare("UPDATE classes SET name = 'ต้องไม่ถูกทับ' WHERE id = 'c1'").run();

    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v.restoreId, backup);
    const res = await exec(cookie, { restoreId: v.restoreId, step: "commit" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("restore_failed");

    // everything exactly as it was — no table half-emptied, no half-refilled
    expect({ students: await count("students"), classes: await count("classes"), attendance: await count("attendance") }).toEqual(before);
    expect((await env.DB.prepare("SELECT name FROM classes WHERE id='c1'").first<any>()).name).toBe("ต้องไม่ถูกทับ");
    expect(await count("submissions")).toBe(1);
  });

  it("a malformed row (missing a required field) also rolls back cleanly", async () => {
    const backup = await takeBackup(cookie);
    delete backup.data.students[1].first_name;
    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v.restoreId, backup);
    expect((await exec(cookie, { restoreId: v.restoreId, step: "commit" })).status).toBe(409);
    expect(await count("students")).toBe(3);
    expect(await count("attendance")).toBe(2);
  });

  it("refuses to commit an incomplete upload, and the missing chunk can be sent afterwards", async () => {
    const backup = await takeBackup(cookie);
    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    // upload with the students table skipped
    await upload(cookie, v.restoreId, backup, 500, (t) => t === "students");
    const res = await exec(cookie, { restoreId: v.restoreId, step: "commit" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "incomplete_upload", table: "students", expected: 3, got: 0 });
    expect(await count("students")).toBe(3); // nothing was touched

    // the upload can be resumed (re-sending a chunk is safe), then it commits
    await exec(cookie, { restoreId: v.restoreId, step: "chunk", table: "students", seq: 0, rows: backup.data.students });
    await exec(cookie, { restoreId: v.restoreId, step: "chunk", table: "students", seq: 0, rows: backup.data.students });
    expect((await exec(cookie, { restoreId: v.restoreId, step: "commit" })).status).toBe(200);
  });

  it("cancelling clears the staged upload, and a new restore can start straight away", async () => {
    const backup = await takeBackup(cookie);
    const v1 = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v1.restoreId, backup);
    expect(await count("restore_staging")).toBeGreaterThan(0);

    expect((await call("/api/restore/cancel", json({}), cookie)).status).toBe(200);
    expect(await count("restore_staging")).toBe(0);
    expect(((await (await call("/api/restore/status", {}, cookie)).json()) as any).pending).toBe(false);

    // the old code answered 409 restore_in_progress here forever
    const v2 = await validate(cookie, backup.counts);
    expect(v2.status).toBe(200);
  });

  it("a newer restore supersedes an abandoned one; the old one can no longer be used", async () => {
    const backup = await takeBackup(cookie);
    const v1 = (await (await validate(cookie, backup.counts)).json()) as any;
    const v2 = (await (await validate(cookie, backup.counts)).json()) as any;
    expect(v2.restoreId).not.toBe(v1.restoreId);

    const stale = await exec(cookie, { restoreId: v1.restoreId, step: "chunk", table: "classes", seq: 0, rows: backup.data.classes });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "job_not_active" });
  });

  it("an upload nobody finished expires after 30 minutes", async () => {
    const backup = await takeBackup(cookie);
    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await env.DB.prepare("UPDATE restore_jobs SET updated_at = ? WHERE id = ?").bind(Date.now() - 31 * 60 * 1000, v.restoreId).run();

    const res = await exec(cookie, { restoreId: v.restoreId, step: "chunk", table: "classes", seq: 0, rows: backup.data.classes });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "restore_expired" });
    expect(((await (await call("/api/restore/status", {}, cookie)).json()) as any).pending).toBe(false);
  });

  it("history pointing at a device that doesn't exist here doesn't block the restore", async () => {
    await env.DB.prepare("INSERT INTO scan_sessions (id, assignment_id, class_id, subject_id, mode, full_score, device_id, started_at) VALUES ('scn1','a1','c1','s1','full',10,'dev_test',1)").run();
    const backup = await takeBackup(cookie);
    backup.data.scan_sessions[0].device_id = "dev_from_another_install";

    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v.restoreId, backup);
    expect((await exec(cookie, { restoreId: v.restoreId, step: "commit" })).status).toBe(200);
    expect((await env.DB.prepare("SELECT device_id FROM scan_sessions WHERE id='scn1'").first<any>()).device_id).toBeNull();
  });

  it("uploads in several chunks per table", async () => {
    const backup = await takeBackup(cookie);
    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v.restoreId, backup, 1); // one row per chunk
    expect((await exec(cookie, { restoreId: v.restoreId, step: "commit" })).status).toBe(200);
    expect(await count("students")).toBe(3);
    expect(await count("attendance")).toBe(2);
  });
});

describe("a lock left behind by an older restore", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("cancel lifts it, so writes work again", async () => {
    await env.DB.prepare("UPDATE meta SET value = '1' WHERE key = 'maintenance'").run();
    expect((await call("/api/classes", json({ name: "ป.5/1" }), cookie)).status).toBe(423);
    expect(((await (await call("/api/restore/status", {}, cookie)).json()) as any).maintenance).toBe(true);

    expect((await call("/api/restore/cancel", json({}), cookie)).status).toBe(200);
    expect((await call("/api/classes", json({ name: "ป.5/1" }), cookie)).status).toBe(200);
  });
});

describe("restore under concurrency and after a lost reply", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login();
    await seed();
    await call("/api/submissions/batch", json({ ops: [{ opId: "o1", scanSessionId: "s", assignmentId: "a1", studentId: "st1", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: Date.now() }] }), cookie);
  });

  it("a restore committing while ANOTHER restore is being validated never ends with empty tables and a 'success'", async () => {
    const backup = await takeBackup(cookie);
    for (const order of [0, 1, 0, 1, 0, 1, 0, 1]) {
      await env.DB.prepare("UPDATE classes SET name = 'ก่อนกู้คืน' WHERE id = 'c1'").run();
      const v1 = (await (await validate(cookie, backup.counts)).json()) as any;
      await upload(cookie, v1.restoreId, backup);

      const commit = () => exec(cookie, { restoreId: v1.restoreId, step: "commit" });
      const rival = () => validate(cookie, backup.counts); // wipes the staging area of every earlier job
      const [a, b] = order === 0 ? await Promise.all([commit(), rival()]) : await Promise.all([rival(), commit()]);
      const commitRes = order === 0 ? a : b;

      // whatever happened, the data is either exactly the backup or exactly what it was — never emptied
      expect(await count("students")).toBe(3);
      expect(await count("submissions")).toBe(1);
      const name = (await env.DB.prepare("SELECT name FROM classes WHERE id='c1'").first<any>()).name;
      if (commitRes.status === 200) expect(name).toBe("ป.6/1");
      else {
        expect(commitRes.status).toBe(409);
        expect(name).toBe("ก่อนกู้คืน");
      }
    }
  });

  // The interleaving that used to destroy data, produced on purpose: the early checks pass, THEN a
  // rival request changes things, THEN the swap runs. The guards inside the batch must refuse it.
  it.each([
    ["a second restore is validated (it wipes the staging area)", (cookie: string, backup: Backup, _id: string) => validate(cookie, backup.counts)],
    ["the dialog is cancelled", (cookie: string, _b: Backup, id: string) => call("/api/restore/cancel", json({ restoreId: id }), cookie)],
  ])("the swap refuses — and the data is untouched — when, after the early checks passed, %s", async (_label, rival) => {
    const backup = await takeBackup(cookie);
    await env.DB.prepare("UPDATE classes SET name = 'ก่อนกู้คืน' WHERE id = 'c1'").run();
    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v.restoreId, backup);

    const r = await commitRestore(env as any, v.restoreId, {
      deviceId: null, now: Date.now(),
      afterChecks: async () => { await rival(cookie, backup, v.restoreId); },
    });

    expect(r.status).toBe(409);
    expect((r.body as any).error).toBe("job_not_active");
    // not emptied, not half-refilled, name untouched, and no success recorded
    expect(await count("students")).toBe(3);
    expect(await count("submissions")).toBe(1);
    expect(await count("attendance_sessions")).toBe(0);
    expect((await env.DB.prepare("SELECT name FROM classes WHERE id='c1'").first<any>()).name).toBe("ก่อนกู้คืน");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM restore_jobs WHERE id = ? AND status = 'done'").bind(v.restoreId).first<any>()).n).toBe(0);
    expect((await env.DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first<any>()).value).toBe("1");
  });

  it("a restore whose staged rows disappeared (a rival validate wiped them) refuses, and changes nothing", async () => {
    const backup = await takeBackup(cookie);
    const v1 = (await (await validate(cookie, backup.counts)).json()) as any;
    await upload(cookie, v1.restoreId, backup);
    await env.DB.prepare("DELETE FROM restore_staging").run(); // what a competing validate does
    const before = await count("students");

    const res = await exec(cookie, { restoreId: v1.restoreId, step: "commit" });
    expect(res.status).toBe(409);
    expect(await count("students")).toBe(before);
  });

  it("after the commit, the job can be asked about by id — done, and the data epoch moved on", async () => {
    const backup = await takeBackup(cookie);
    const v = (await (await validate(cookie, backup.counts)).json()) as any;
    // while it's only validated, "is mine done?" says no
    expect(((await (await call(`/api/restore/status?id=${v.restoreId}`, {}, cookie)).json()) as any).job.status).toBe("validated");

    await upload(cookie, v.restoreId, backup);
    expect((await exec(cookie, { restoreId: v.restoreId, step: "commit" })).status).toBe(200);

    const st = (await (await call(`/api/restore/status?id=${v.restoreId}`, {}, cookie)).json()) as any;
    expect(st.job.status).toBe("done");
    expect(st.dataEpoch).toBe(2);
    expect(((await (await call("/api/bootstrap", {}, cookie)).json()) as any).dataEpoch).toBe(2);

    // an id that doesn't exist is "unknown", not "done"
    expect(((await (await call("/api/restore/status?id=rst_nope", {}, cookie)).json()) as any).job).toBeNull();
  });

  it("cancelling by id only cancels THAT restore, not a newer one from another device", async () => {
    const backup = await takeBackup(cookie);
    const v1 = (await (await validate(cookie, backup.counts)).json()) as any;
    const v2 = (await (await validate(cookie, backup.counts)).json()) as any; // supersedes v1

    await call("/api/restore/cancel", json({ restoreId: v1.restoreId }), cookie); // the old dialog closing
    expect(((await (await call("/api/restore/status", {}, cookie)).json()) as any).pending).toBe(true); // v2 still alive

    await call("/api/restore/cancel", json({ restoreId: v2.restoreId }), cookie);
    expect(((await (await call("/api/restore/status", {}, cookie)).json()) as any).pending).toBe(false);
  });

  it("a backup from before event_at existed restores with event_at = updated_at; a newer one keeps its own", async () => {
    const backup = await takeBackup(cookie);
    const row = backup.data.submissions[0];
    expect(row.event_at).toBeTruthy(); // the backup itself carries it now

    // an old (v3) file has no event_at column at all
    const old = { ...backup, data: { ...backup.data, submissions: [{ ...row, event_at: undefined, updated_at: 12345 }] } };
    delete (old.data.submissions[0] as any).event_at;
    const v = (await (await validate(cookie, old.counts, 3)).json()) as any;
    await upload(cookie, v.restoreId, old);
    expect((await exec(cookie, { restoreId: v.restoreId, step: "commit" })).status).toBe(200);
    expect((await env.DB.prepare("SELECT event_at, updated_at FROM submissions").first<any>())).toEqual({ event_at: 12345, updated_at: 12345 });
  });
});

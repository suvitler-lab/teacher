// T-13 · EP-13 · AC-44 — the timetable travels in a backup, old files still restore, bad rows are refused whole.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { takeBackup, restoreFrom, type Backup } from "./backup-helpers";
import { BACKUP_TABLES } from "../../worker/routes/backup";

const FRAME = JSON.stringify({ v: 1, rev: 3, periods: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, start: `0${7 + n}:30`.slice(-5), end: `0${8 + n}:30`.slice(-5) })), breaks: [], days: [1, 2, 3, 4, 5] });
const PERIOD_TIMES = JSON.stringify({ 1: "08:30", 2: "09:30" });
// 14 slots: Mon 3 · Tue 2 · Wed 2 · Thu 2 · Fri 5 (A5), classes c1/c2 + one activity
const SLOTS: [number, number, string][] = [[1, 1, "c1"], [1, 2, "c2"], [1, 3, "c1"], [2, 1, "c1"], [2, 2, "c2"], [3, 1, "c1"], [3, 4, "c2"], [4, 2, "c1"], [4, 3, "c1"], [5, 1, "c1"], [5, 2, "c2"], [5, 3, "c1"], [5, 4, "c2"], [5, 8, "act"]];
const count = async (t: string) => (await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first<{ n: number }>())!.n;
const slotRows = async () => (await env.DB.prepare("SELECT * FROM timetable_slots ORDER BY weekday, period").all<any>()).results;

async function seedTimetable() {
  const stmts = SLOTS.map(([d, p, c]) => c === "act"
    ? env.DB.prepare("INSERT INTO timetable_slots (term_id,weekday,period,kind,class_id,subject_id,label,updated_at) VALUES ('t1',?,?,'activity',NULL,NULL,'ชุมนุม',5)").bind(d, p)
    : env.DB.prepare("INSERT INTO timetable_slots (term_id,weekday,period,kind,class_id,subject_id,label,updated_at) VALUES ('t1',?,?,'class',?,'s1',NULL,5)").bind(d, p, c));
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('period_frame',?)").bind(FRAME));
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('period_times',?)").bind(PERIOD_TIMES));
  await env.DB.batch(stmts);
}
const settingOf = async (k: string) => (await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(k).first<{ value: string }>())?.value;

describe("timetable in backup/restore (AC-44)", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); await seedTimetable(); });

  it("lists timetable_slots last and serves it through GET /api/backup", async () => {
    expect(BACKUP_TABLES[BACKUP_TABLES.length - 1]).toBe("timetable_slots");
    const page = (await (await call("/api/backup?table=timetable_slots", {}, cookie)).json()) as any;
    expect(page.rows.length).toBe(14);
    expect(Object.keys(page.rows[0]).sort()).toEqual(["class_id", "kind", "label", "period", "subject_id", "term_id", "updated_at", "weekday"]);
    expect(page.schema_version).toBe(7);
  });

  it("backup -> wipe -> restore gives back the same 14 slots and the 8-period frame", async () => {
    const before = await slotRows();
    const b = await takeBackup(cookie);
    expect(b.counts.timetable_slots).toBe(14);
    await env.DB.batch([env.DB.prepare("DELETE FROM timetable_slots"), env.DB.prepare("DELETE FROM settings WHERE key IN ('period_frame','period_times')")]);
    expect(await count("timetable_slots")).toBe(0);
    const res = await restoreFrom(cookie, b);
    expect(res.status).toBe(200);
    expect(await slotRows()).toEqual(before);
    expect(await settingOf("period_frame")).toBe(FRAME);
    expect(await settingOf("period_times")).toBe(PERIOD_TIMES);
  });

  it("restore resets terms.timetable_rev to 0 (not in COLUMNS)", async () => {
    await env.DB.prepare("UPDATE terms SET timetable_rev=9").run();
    const b = await takeBackup(cookie);
    expect((await restoreFrom(cookie, b)).status).toBe(200);
    expect((await env.DB.prepare("SELECT timetable_rev r FROM terms").first<any>()).r).toBe(0);
  });

  it("a v6 file with no timetable_slots restores: empty table, period_times from the file, no error", async () => {
    const b = await takeBackup(cookie);
    delete b.data.timetable_slots; delete b.counts.timetable_slots;
    b.data.settings = b.data.settings.filter((r) => r.key !== "period_frame");
    b.counts.settings = b.data.settings.length;
    const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts: b.counts } }), cookie)).json()) as any;
    expect(v.ok).toBe(true);
    for (const t of BACKUP_TABLES.filter((x) => x !== "timetable_slots")) {
      expect((await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq: 0, rows: b.data[t] }), cookie)).status).toBe(200);
    }
    expect((await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "commit" }), cookie)).status).toBe(200);
    expect(await count("timetable_slots")).toBe(0);
    expect(await settingOf("period_frame")).toBeUndefined();
    expect(await settingOf("period_times")).toBe(PERIOD_TIMES);
    expect(await count("students")).toBe(3);
  });

  it("still refuses a file missing another table (incomplete_backup), but not timetable_slots", async () => {
    const counts: Record<string, number> = Object.fromEntries(BACKUP_TABLES.filter((t) => t !== "timetable_slots").map((t) => [t, 0]));
    expect((await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts } }), cookie)).status).toBe(200);
    delete counts.submissions;
    const r = await call("/api/restore/validate", json({ manifest: { schema_version: 6, counts } }), cookie);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: "incomplete_backup", missing: ["submissions"] });
  });

  it("the fingerprint changes when a slot changes", async () => {
    const fp = async () => ((await (await call("/api/backup/fingerprint", {}, cookie)).json()) as any).fingerprint as string;
    const a = await fp();
    await env.DB.prepare("UPDATE timetable_slots SET updated_at=99 WHERE weekday=1 AND period=1").run();
    expect(await fp()).not.toBe(a);
  });

  // ---- bad rows: 422 and the live data stays as it was ------------------------------------------------
  type Mut = (b: Backup) => void;
  const badRows: [string, string, Mut][] = [
    ["missing term", "missing_reference", (b) => { b.data.timetable_slots[0].term_id = "nope"; }],
    ["missing class", "missing_reference", (b) => { b.data.timetable_slots[0].class_id = "nope"; }],
    ["missing subject", "missing_reference", (b) => { b.data.timetable_slots[0].subject_id = "nope"; }],
    ["class kind without a room", "kind_fields", (b) => { b.data.timetable_slots[0].class_id = null; }],
    ["class kind with a label", "kind_fields", (b) => { b.data.timetable_slots[0].label = "x"; }],
    ["activity with a room", "kind_fields", (b) => { b.data.timetable_slots.find((r) => r.kind === "activity")!.class_id = "c1"; }],
    ["activity without a label", "kind_fields", (b) => { b.data.timetable_slots.find((r) => r.kind === "activity")!.label = null; }],
    ["room of another school year", "wrong_school_year", (b) => { b.data.classes[0].year = 2568; }],
    ["duplicate slot", "duplicate_slot", (b) => { b.data.timetable_slots.push({ ...b.data.timetable_slots[0] }); b.counts.timetable_slots++; }],
  ];
  for (const [name, code, mut] of badRows) {
    it(`refuses ${name} with 422 (${code}) and leaves the data unchanged`, async () => {
      const b = await takeBackup(cookie);
      mut(b);
      const before = await slotRows();
      const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 7, counts: b.counts } }), cookie)).json()) as any;
      for (const t of BACKUP_TABLES) {
        expect((await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq: 0, rows: b.data[t] }), cookie)).status).toBe(200);
      }
      const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "commit" }), cookie);
      const body = (await r.json()) as any;
      expect(r.status).toBe(422);
      expect(body.error).toBe("invalid_backup");
      expect(body.issues[0]).toMatchObject({ code });
      expect(await slotRows()).toEqual(before);
      expect(await count("students")).toBe(3);
    });
  }

  it("rows out of range or of unknown kind are refused at the chunk step", async () => {
    const b = await takeBackup(cookie);
    const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 7, counts: b.counts } }), cookie)).json()) as any;
    for (const patch of [{ weekday: 8 }, { period: 9 }, { kind: "x" }, { label: "ก".repeat(801), kind: "activity", class_id: null, subject_id: null }]) {
      const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: "timetable_slots", seq: 0, rows: [{ ...b.data.timetable_slots[0], ...patch }] }), cookie);
      expect(r.status).toBe(422);
      expect(((await r.json()) as any).issues[0].table).toBe("timetable_slots");
    }
  });

  // ---- VF-B4 (S-03 · D56): slots must fit the frame the file carries -----------------------------------
  const commitMutated = async (mut: Mut) => {
    const b = await takeBackup(cookie);
    mut(b);
    const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 7, counts: b.counts } }), cookie)).json()) as any;
    for (const t of BACKUP_TABLES) {
      expect((await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq: 0, rows: b.data[t] }), cookie)).status).toBe(200);
    }
    const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "commit" }), cookie);
    return { r, body: (await r.json()) as any };
  };
  const setFrame = (b: Backup, value: string) => { b.data.settings.find((x) => x.key === "period_frame")!.value = value; };
  const frameOf = (periods: number, days: number[]) => JSON.stringify({ v: 1, rev: 3, periods: Array.from({ length: periods }, (_, i) => ({ start: `${String(8 + i).padStart(2, "0")}:00`, end: `${String(8 + i).padStart(2, "0")}:50` })), breaks: [], days });
  const refused = async (mut: Mut, code: string, table: string) => {
    const before = await slotRows();
    const frameBefore = await settingOf("period_frame");
    const { r, body } = await commitMutated(mut);
    expect(r.status).toBe(422);
    expect(body.error).toBe("invalid_backup");
    expect(body.issues[0]).toMatchObject({ table, code });
    expect(await slotRows()).toEqual(before);
    expect(await settingOf("period_frame")).toBe(frameBefore);
    expect(await count("students")).toBe(3);
  };

  it("VF-B4: a Saturday slot with a Mon-Fri frame -> 422 outside_frame, data unchanged", async () => {
    await refused((b) => { b.data.timetable_slots[0].weekday = 6; }, "outside_frame", "timetable_slots");
  });
  it("VF-B4: period 8 with a 7-period frame -> 422 outside_frame", async () => {
    await refused((b) => setFrame(b, frameOf(7, [1, 2, 3, 4, 5])), "outside_frame", "timetable_slots");
  });
  it("VF-B4: a corrupt period_frame -> 422 bad_frame", async () => {
    await refused((b) => setFrame(b, '{"v":1,"rev":3,"periods":[],"breaks":[],"days":[1]}'), "bad_frame", "settings");
  });
  it("VF-B4: a normal file and a file with no frame and no slots still restore", async () => {
    expect((await commitMutated(() => {})).r.status).toBe(200);
    const none = await commitMutated((b) => {
      b.data.timetable_slots = []; b.counts.timetable_slots = 0;
      b.data.settings = b.data.settings.filter((x) => x.key !== "period_frame"); b.counts.settings = b.data.settings.length;
    });
    expect(none.r.status).toBe(200);
  });

  // R-14: the activity label obeys the same 40-grapheme rule as PUT /api/timetable (shared graphemeCount)
  const labelRestore = (label: string) => commitMutated((b) => {
    const a = b.data.timetable_slots.find((r) => r.kind === "activity")!;
    a.label = label;
  });
  it("R-14: an activity label of 40 emoji restores; 41 emoji or 41 plain characters are refused as invalid_backup", async () => {
    expect((await labelRestore("👍".repeat(40))).r.status).toBe(200);
    expect((await slotRows()).find((r: any) => r.kind === "activity").label).toBe("👍".repeat(40));
    // 2-code-point grapheme x40 = 80 code points: must pass the app check AND the widened 0008 CHECK
    expect((await labelRestore("❤️".repeat(40))).r.status).toBe(200);
    expect((await slotRows()).find((r: any) => r.kind === "activity").label).toBe("❤️".repeat(40));
    for (const bad of ["👍".repeat(41), "a".repeat(41)]) {
      const before = await slotRows();
      const b = await takeBackup(cookie);
      b.data.timetable_slots.find((r) => r.kind === "activity")!.label = bad;
      const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 7, counts: b.counts } }), cookie)).json()) as any;
      let refusedAt: any = null;
      for (const t of BACKUP_TABLES) {
        const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq: 0, rows: b.data[t] }), cookie);
        if (r.status !== 200) { refusedAt = { status: r.status, body: await r.json() }; break; }
      }
      expect(refusedAt.status).toBe(422);
      expect(refusedAt.body.error).toBe("invalid_backup");
      expect(refusedAt.body.issues[0]).toMatchObject({ table: "timetable_slots", field: "label" });
      expect(await slotRows()).toEqual(before);
    }
  });
  // R-21: the old "≤50 statements" test only re-did arithmetic and exercised no code, so it was removed.
  // The real commit batch is built inside the backup route and run by every restore test above.
});

describe("reset removes the timetable", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); await seedTimetable(); });
  it("'data' clears slots but keeps the period frame; 'all' clears settings too", async () => {
    expect((await call("/api/admin/reset", json({ mode: "data", password: "pw123456", confirm: "ล้างข้อมูล" }), cookie)).status).toBe(200);
    expect(await count("timetable_slots")).toBe(0);
    expect(await count("terms")).toBe(0);
    expect(await settingOf("period_frame")).toBe(FRAME);
    await call("/api/admin/reset", json({ mode: "all", password: "pw123456", confirm: "ล้างทั้งหมด" }), cookie);
    expect(await settingOf("period_frame")).toBeUndefined();
  });
});

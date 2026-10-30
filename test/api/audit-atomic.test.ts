// M1-08: every write's history line is written in the SAME transaction as the write (all-or-nothing), the
// history covers PIN / password / device sign-out without holding any secret, every catalog write leaves
// before/after, and the whole-class actions record the `late` value that is really stored (and their undo
// is not refused just because the due date moved since).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, cookieFrom, gateBatch, json, login, seed } from "./helpers";

let cookie: string;
const post = (path: string, body: unknown) => call(path, json(body), cookie);

const audits = (where = "1=1", ...binds: unknown[]) =>
  env.DB.prepare(`SELECT * FROM audit_logs WHERE ${where} ORDER BY id`).bind(...binds).all<any>().then((r) => r.results ?? []);
const count = async (table: string, where = "1=1", ...binds: unknown[]) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).bind(...binds).first<{ n: number }>())!.n;

/** Make every audit insert fail (a broken history table) until dropped. */
const auditDown = () => env.DB.prepare("CREATE TRIGGER t_audit_down BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit down'); END").run();
/** Make every write to `table` fail until dropped. */
const writeDown = async (table: string) => {
  await env.DB.prepare(`CREATE TRIGGER t_${table}_ins_down BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'down'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER t_${table}_upd_down BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'down'); END`).run();
};

afterEach(async () => {
  const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 't\\_%' ESCAPE '\\'").all<{ name: string }>();
  for (const { name } of t.results ?? []) await env.DB.prepare(`DROP TRIGGER IF EXISTS ${name}`).run();
  await env.DB.prepare("DELETE FROM work_types WHERE id = 'wt_new'").run();
});

beforeEach(async () => {
  // work_types is not wiped between tests (helpers.reset keeps its defaults): drop what these tests add
  await env.DB.prepare("DELETE FROM work_types WHERE id = 'wt_new'").run();
  cookie = await login();
  await seed();
});

const newStudent = { id: "st_new", code: "999", first_name: "ใหม่", last_name: "ทดสอบ", class_id: "c1", number: 30 };

describe("AC-01 the history line and the write are one transaction", () => {
  it("creating a student: audit fails → no student; success → both, without the card token", async () => {
    await auditDown();
    expect((await post("/api/students", newStudent)).status).toBe(500);
    expect(await count("students", "id = 'st_new'")).toBe(0);
    await env.DB.prepare("DROP TRIGGER t_audit_down").run();

    expect((await post("/api/students", newStudent)).status).toBe(200);
    const [a] = await audits("entity = 'student' AND entity_id = 'st_new'");
    expect(a).toMatchObject({ action: "create", device_id: "dev_test", student_id: "st_new" });
    expect(JSON.parse(a.after_json)).toMatchObject({ code: "999", first_name: "ใหม่", class_id: "c1", number: 30 });
    const token = (await env.DB.prepare("SELECT qr_token FROM students WHERE id = 'st_new'").first<any>()).qr_token;
    expect(JSON.stringify(a)).not.toContain(token);
  });

  it("editing a student: audit fails → the edit is not kept; success → before and after", async () => {
    const edit = { id: "st1", code: "101", first_name: "แก้แล้ว", last_name: "ข", class_id: "c1", number: 1 };
    await auditDown();
    expect((await post("/api/students", edit)).status).toBe(500);
    expect((await env.DB.prepare("SELECT first_name FROM students WHERE id = 'st1'").first<any>()).first_name).toBe("ก");
    await env.DB.prepare("DROP TRIGGER t_audit_down").run();

    expect((await post("/api/students", edit)).status).toBe(200);
    const [a] = await audits("entity = 'student' AND entity_id = 'st1'");
    expect(a.action).toBe("update");
    expect(JSON.parse(a.before_json).first_name).toBe("ก");
    expect(JSON.parse(a.after_json).first_name).toBe("แก้แล้ว");
    expect(JSON.stringify(a)).not.toContain("Q-AAAAAAAAAA");
  });

  it("a student write that fails leaves no history line", async () => {
    await writeDown("students");
    expect((await post("/api/students", newStudent)).status).toBe(500);
    expect(await count("audit_logs", "entity = 'student'")).toBe(0);
  });

  it("deleting work: audit fails → the work stays; success → one line; deleting again → 404 and no new line", async () => {
    await auditDown();
    expect((await post("/api/assignments/a1/delete", {})).status).toBe(500);
    expect((await env.DB.prepare("SELECT deleted_at FROM assignments WHERE id = 'a1'").first<any>()).deleted_at).toBeNull();
    await env.DB.prepare("DROP TRIGGER t_audit_down").run();

    expect((await post("/api/assignments/a1/delete", {})).status).toBe(200);
    expect((await post("/api/assignments/a1/delete", {})).status).toBe(404);
    expect(await audits("entity = 'assignment' AND entity_id = 'a1'")).toMatchObject([{ action: "void", device_id: "dev_test" }]);
  });

  it("a delete whose write fails leaves no history line", async () => {
    await writeDown("assignments");
    expect((await post("/api/assignments/a1/delete", {})).status).toBe(500);
    expect(await count("audit_logs", "entity = 'assignment'")).toBe(0);
  });
});

describe("AC-02 PIN, password and device sign-out are in the history, with no secret in it", () => {
  it("setting and clearing a PIN: who / which device / when — never the PIN", async () => {
    const t0 = Date.now();
    expect((await post("/api/students/st1/pin", { pin: "4826" })).status).toBe(200);
    expect((await post("/api/students/st1/pin", { pin: null })).status).toBe(200);
    expect((await post("/api/students/nobody/pin", { pin: "1111" })).status).toBe(404);
    const rows = await audits("entity = 'student' AND student_id = 'st1'");
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.action)).toEqual(["pin_set", "pin_clear"]);
    for (const r of rows) {
      expect(r).toMatchObject({ device_id: "dev_test", actor_id: "teacher", entity_id: "st1" });
      expect(r.at).toBeGreaterThanOrEqual(t0);
      expect(JSON.stringify(r)).not.toContain("4826");
    }
    expect(await count("audit_logs", "student_id = 'nobody'")).toBe(0);
    // seen in the history screen too
    const feed = await (await call("/api/audit?entity=student", {}, cookie)).json() as any;
    expect(feed.rows.map((r: any) => r.action)).toEqual(["pin_clear", "pin_set"]);
    expect(feed.rows[0].device_name).toBe("เครื่องทดสอบ");
  });

  it("a PIN change whose history line fails is not kept", async () => {
    await auditDown();
    expect((await post("/api/students/st1/pin", { pin: "4826" })).status).toBe(500);
    expect((await env.DB.prepare("SELECT pin FROM students WHERE id = 'st1'").first<any>()).pin).toBeNull();
  });

  it("changing the password: a history line with the device, never the password, hash or salt", async () => {
    expect((await post("/api/auth/change-password", { current: "pw123456", next: "brand-new-77" })).status).toBe(200);
    const t = await env.DB.prepare("SELECT password_hash, salt FROM teacher").first<any>();
    const rows = await audits("entity = 'auth' AND action = 'password_change'");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ device_id: "dev_test", actor_id: "teacher" });
    const text = JSON.stringify(rows[0]);
    for (const secret of ["pw123456", "brand-new-77", t.password_hash, t.salt]) expect(text).not.toContain(secret);
  });

  it("a password change whose history line fails is not kept", async () => {
    await auditDown();
    expect((await post("/api/auth/change-password", { current: "pw123456", next: "brand-new-77" })).status).toBe(500);
    const res = await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "dev_x" }));
    expect(res.status).toBe(200);
  });

  it("signing a device out: which device did it and which was signed out — never a session token", async () => {
    const other = await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "dev_b", deviceName: "มือถือ" }));
    const otherCookie = cookieFrom(other);
    const token = otherCookie.split("=")[1];
    expect((await post("/api/devices/dev_b/signout", {})).status).toBe(200);
    expect(await count("sessions", "device_id = 'dev_b'")).toBe(0);
    const rows = await audits("entity = 'auth' AND action = 'device_signout'");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ device_id: "dev_test", entity_id: "dev_b" });
    expect(JSON.stringify(rows[0])).not.toContain(token);
  });

  it("a sign-out whose history line fails keeps the device signed in", async () => {
    await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "dev_b" }));
    await auditDown();
    expect((await post("/api/devices/dev_b/signout", {})).status).toBe(500);
    expect(await count("sessions", "device_id = 'dev_b'")).toBe(1);
  });

  it("first-run setup: the account and its history line land together", async () => {
    await env.DB.batch(["audit_logs", "sessions", "devices", "teacher"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
    await auditDown();
    const res = await call("/api/setup", json({ setupCode: "test-code", email: "t@example.com", password: "pw123456", deviceId: "dev_s" }));
    expect(res.status).toBe(500);
    expect(await count("teacher")).toBe(0);
    expect(await count("devices")).toBe(0);
  });
});

describe("AC-03 every catalog write leaves before/after in its own transaction", () => {
  const cases = [
    { entity: "class", path: "/api/classes", create: { id: "c_new", name: "ป.5/1" }, update: { id: "c_new", name: "ป.5/9" }, field: "name" },
    { entity: "subject", path: "/api/subjects", create: { id: "s_new", name: "ศิลปะ" }, update: { id: "s_new", name: "ดนตรี" }, field: "name" },
    { entity: "work_type", path: "/api/work-types", create: { id: "wt_new", name: "โครงงาน" }, update: { id: "wt_new", name: "รายงาน" }, field: "name" },
    { entity: "term", path: "/api/terms", create: { id: "t_new", year: 2569, term: 2, name: "2/2569" }, update: { id: "t_new", year: 2569, term: 2, name: "ภาค 2/2569" }, field: "name" },
  ];
  it.each(cases)("$entity: create and edit are both in the history", async ({ entity, path, create, update, field }) => {
    expect((await post(path, create)).status).toBe(200);
    expect((await post(path, update)).status).toBe(200);
    const rows = await audits("entity = ? AND entity_id = ?", entity, create.id);
    expect(rows.map((r: any) => r.action)).toEqual(["create", "update"]);
    expect(JSON.parse(rows[0].before_json ?? "null")).toBeNull();
    expect(JSON.parse(rows[0].after_json)[field]).toBe((create as any)[field]);
    expect(JSON.parse(rows[1].before_json)[field]).toBe((create as any)[field]);
    expect(JSON.parse(rows[1].after_json)[field]).toBe((update as any)[field]);
    expect(rows[1].device_id).toBe("dev_test");
  });

  it.each(cases)("$entity: history down → nothing written", async ({ entity, path, create }) => {
    await auditDown();
    expect((await post(path, create)).status).toBe(500);
    const table = { class: "classes", subject: "subjects", work_type: "work_types", term: "terms" }[entity]!;
    expect(await count(table, "id = ?", create.id)).toBe(0);
  });
});

// ---- whole-class actions and their undo -------------------------------------------------------------------
const setDue = (due: string | null) => env.DB.prepare("UPDATE assignments SET due_date = ? WHERE id = 'a1'").bind(due).run();
const cell = (sid: string) => env.DB.prepare("SELECT * FROM submissions WHERE assignment_id = 'a1' AND student_id = ?").bind(sid).first<any>();
const saveDue = (due: string) => post("/api/assignments", {
  id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
  assigned_date: "2569-09-01", due_date: due, publish_scores: true, status: "open", class_ids: ["c1"],
});
const bulk = (action: string) => post("/api/assignments/a1/bulk", { action, classId: "c1" });
const undo = (batchId: string) => post("/api/assignments/a1/bulk-undo", { batchId });
/** every audit line of `batchId` / `action` says the late value that is stored now */
async function expectAuditLateMatches(batchId: string, action: string) {
  const rows = await audits("batch_id = ? AND action = ?", batchId, action);
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    const stored = await cell(r.student_id);
    expect({ student: r.student_id, late: JSON.parse(r.after_json).late }).toEqual({ student: r.student_id, late: stored.late === 1 });
  }
}
const hand = (sid: string, at: number, score: number | null = null, status = "submitted") => post("/api/submissions/batch", {
  ops: [{ opId: `op-${sid}-${at}-${status}`, scanSessionId: "s", assignmentId: "a1", studentId: sid, status, score, fullScoreAtScan: 10, method: "grid", clientTs: at }],
});

describe("AC-04 the history of a whole-class action says the late value really stored", () => {
  it("all-submitted while the due date moves into the past: after.late = stored late", async () => {
    await setDue("2099-12-31");
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1" }), cookie);
    await gate.ready;
    await setDue("2020-01-01");
    gate.release();
    const res = await pending;
    expect(res.status).toBe(200);
    const { batchId } = await res.json() as any;
    expect((await cell("st1")).late).toBe(1);
    await expectAuditLateMatches(batchId, "bulk");
  });

  it("full-score on a row whose stored late was stale: after.late = stored late", async () => {
    await setDue("2020-01-01");
    await env.DB.prepare(
      "INSERT INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at, event_at) VALUES ('a1','st1','submitted',3,0,?, 'grid', 1, 1)",
    ).bind(Date.UTC(2026, 5, 1)).run();
    const res = await bulk("full-score");
    const { batchId } = await res.json() as any;
    expect((await cell("st1")).late).toBe(1);
    await expectAuditLateMatches(batchId, "bulk");
  });

  it("undo of a clear after the due date moved: the restore lines say the late value stored", async () => {
    await setDue("2099-12-31");
    const at = Date.now() - 60_000;
    await hand("st1", at, 7);
    await hand("st2", at, 5);
    const { batchId } = await (await bulk("clear")).json() as any;
    expect((await saveDue("2020-01-01")).status).toBe(200);
    expect((await undo(batchId)).status).toBe(200);
    expect((await cell("st1"))).toMatchObject({ status: "submitted", score: 7, late: 1 });
    await expectAuditLateMatches(batchId, "restore");
  });
});

describe("AC-05 undo after the due date moved", () => {
  it("undo of all-submitted succeeds when only late changed since (R-10)", async () => {
    await setDue("2099-12-31");
    const { batchId, changed } = await (await bulk("all-submitted")).json() as any;
    expect(changed).toBe(2);
    expect((await saveDue("2020-01-01")).status).toBe(200);
    expect((await cell("st1")).late).toBe(1);
    const res = await undo(batchId);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, changed: 2 });
    expect((await cell("st1"))).toMatchObject({ status: "void", late: 0 });
  });

  it("undo of a clear succeeds after the due date moved", async () => {
    await setDue("2099-12-31");
    await hand("st1", Date.now() - 60_000, 7);
    const { batchId } = await (await bulk("clear")).json() as any;
    expect((await saveDue("2020-01-01")).status).toBe(200);
    expect((await undo(batchId)).status).toBe(200);
  });

  it("undo is still refused when a score was really changed since", async () => {
    await setDue("2099-12-31");
    const { batchId } = await (await bulk("all-submitted")).json() as any;
    expect((await saveDue("2020-01-01")).status).toBe(200);
    expect((await hand("st1", Date.now() + 1, 6)).status).toBe(200);
    const res = await undo(batchId);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "modified_since" });
    expect((await cell("st1")).score).toBe(6);
  });

  it("undo is still refused when a status was really changed since", async () => {
    await setDue("2099-12-31");
    const { batchId } = await (await bulk("all-submitted")).json() as any;
    expect((await hand("st2", Date.now() + 1, null, "excused")).status).toBe(200);
    const res = await undo(batchId);
    expect(res.status).toBe(409);
    expect((await cell("st2")).status).toBe("excused");
  });
});

describe("no card token and no unknown settings key in the history", () => {
  it("issuing a new QR card records THAT it happened, not the old or new token", async () => {
    const res = await post("/api/students/st1/qr/rotate", {});
    expect(res.status).toBe(200);
    const { qr_token } = await res.json() as any;
    const rows = await audits("entity = 'qr' AND student_id = 'st1'");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "rotate", device_id: "dev_test" });
    const text = JSON.stringify(rows[0]);
    expect(text).not.toContain("Q-AAAAAAAAAA");
    expect(text).not.toContain(qr_token);
  });

  it("settings history keeps only the allowed keys", async () => {
    const res = await call("/api/settings", json({ school_name: "โรงเรียนทดสอบ", injected: "x".repeat(50), password: "nope" }, { method: "PUT" }), cookie);
    expect(res.status).toBe(200);
    const [a] = await audits("entity = 'settings'");
    expect(JSON.parse(a.after_json)).toEqual({ school_name: "โรงเรียนทดสอบ" });
  });
});

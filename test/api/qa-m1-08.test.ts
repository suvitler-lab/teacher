// QA M1-08 (black-box): all-or-nothing of student create/edit and work delete, no secret in any history line,
// undo after the due date moved, history closed to anyone not signed in.
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, cookieFrom, json, login, seed } from "./helpers";

let cookie: string;
const post = (path: string, body: unknown) => call(path, json(body), cookie);
const rows = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<any>().then((r) => r.results ?? []);
const n = async (table: string, where = "1=1") => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first<any>()).n as number;
const auditDown = () => env.DB.prepare("CREATE TRIGGER t_qa_down BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'down'); END").run();
const auditUp = () => env.DB.prepare("DROP TRIGGER IF EXISTS t_qa_down").run();

beforeEach(async () => { await auditUp(); cookie = await login(); await seed(); });

describe("all-or-nothing (AC-01)", () => {
  it("create student: audit down -> no student and no audit; then success -> both", async () => {
    const s = { id: "st_q", code: "777", first_name: "คิว", last_name: "เอ", class_id: "c1", number: 40 };
    await auditDown();
    expect((await post("/api/students", s)).status).toBe(500);
    await auditUp();
    expect(await n("students", "id='st_q'")).toBe(0);
    expect(await n("audit_logs", "entity_id='st_q'")).toBe(0);
    expect((await post("/api/students", s)).status).toBe(200);
    expect(await n("students", "id='st_q'")).toBe(1);
    expect(await n("audit_logs", "entity='student' AND entity_id='st_q' AND action='create'")).toBe(1);
  });

  it("edit student: audit down -> row unchanged, no audit added", async () => {
    const before = await rows("SELECT * FROM students WHERE id='st1'");
    const audits0 = await n("audit_logs");
    await auditDown();
    expect((await post("/api/students", { id: "st1", code: "101", first_name: "X😀", last_name: "ข", class_id: "c1", number: 1 })).status).toBe(500);
    await auditUp();
    expect(await rows("SELECT * FROM students WHERE id='st1'")).toEqual(before);
    expect(await n("audit_logs")).toBe(audits0);
  });

  it("delete work: audit down -> still live; success -> exactly one 'void' line; data and audit agree", async () => {
    await auditDown();
    expect((await post("/api/assignments/a1/delete", {})).status).toBe(500);
    await auditUp();
    expect((await rows("SELECT deleted_at FROM assignments WHERE id='a1'"))[0].deleted_at).toBeNull();
    expect(await n("audit_logs", "entity_id='a1'")).toBe(0);
    expect((await post("/api/assignments/a1/delete", {})).status).toBe(200);
    expect((await rows("SELECT deleted_at FROM assignments WHERE id='a1'"))[0].deleted_at).not.toBeNull();
    expect(await n("audit_logs", "entity='assignment' AND entity_id='a1' AND action='void'")).toBe(1);
  });

  it("double-tap delete: only one history line", async () => {
    const [r1, r2] = await Promise.all([post("/api/assignments/a1/delete", {}), post("/api/assignments/a1/delete", {})]);
    expect([r1.status, r2.status]).toContain(200);
    expect(await n("audit_logs", "entity='assignment' AND entity_id='a1'")).toBe(1);
  });
});

describe("no secret in any history line (PII)", () => {
  it("PIN / password / QR rotate / device sign-out / settings: every audit row and the feed are clean", async () => {
    const pin = "7319", newPw = "zq-Brand-new-55";
    const sessionToken = cookie.split("=")[1];
    expect((await post("/api/students/st1/pin", { pin })).status).toBe(200);
    const bCookie = cookieFrom(await call("/api/auth/login", json({ email: "teacher@example.com", password: "pw123456", deviceId: "dev_b", deviceName: "มือถือ" })));
    const bToken = bCookie.split("=")[1];
    const rot = await (await post("/api/students/st1/qr/rotate", {})).json() as any;
    const classRot = await post("/api/classes/c1/qr/rotate", {});
    expect(classRot.status).toBe(200);
    expect((await post("/api/devices/dev_b/signout", {})).status).toBe(200);
    expect((await call("/api/settings", json({ school_name: "รร.ทดสอบ" }, { method: "PUT" }), cookie)).status).toBe(200);
    const t = await rows("SELECT password_hash, salt FROM teacher");
    expect((await post("/api/auth/change-password", { current: "pw123456", next: newPw })).status).toBe(200);
    const t2 = await rows("SELECT password_hash, salt FROM teacher");
    const stu = await rows("SELECT qr_token FROM students");
    const secrets = [pin, "pw123456", newPw, t[0].password_hash, t[0].salt, t2[0].password_hash, t2[0].salt, sessionToken, bToken,
      "Q-AAAAAAAAAA", rot.qr_token, ...stu.map((s) => s.qr_token)].filter(Boolean) as string[];
    expect(secrets.length).toBeGreaterThan(8);
    const all = JSON.stringify(await rows("SELECT * FROM audit_logs"));
    expect((await rows("SELECT COUNT(*) AS c FROM audit_logs"))[0].c).toBeGreaterThan(4);
    for (const s of secrets) expect(all, `leak: ${s.slice(0, 4)}`).not.toContain(s);
    const feed = JSON.stringify(await (await call("/api/audit?limit=200", {}, cookie)).json());
    for (const s of secrets) expect(feed).not.toContain(s);
    for (const a of ["pin_set", "password_change", "device_signout", "rotate"]) expect(all).toContain(a);
  });
});

describe("undo after due date moved (AC-05) and history access", () => {
  const setDue = (d: string) => env.DB.prepare("UPDATE assignments SET due_date=? WHERE id='a1'").bind(d).run();
  const redate = (due: string) => post("/api/assignments", { id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10, assigned_date: "2569-09-01", due_date: due, publish_scores: true, status: "open", class_ids: ["c1"] });
  const bulk = async (action: string) => (await (await post("/api/assignments/a1/bulk", { action, classId: "c1" })).json()) as any;
  const hand = (sid: string, score: number | null, status = "submitted") => post("/api/submissions/batch", { ops: [{ opId: `o-${sid}-${status}-${score}`, scanSessionId: "s", assignmentId: "a1", studentId: sid, status, score, fullScoreAtScan: 10, method: "grid", clientTs: Date.now() + 5 }] });

  it("clear -> move due date -> undo restores everything", async () => {
    await setDue("2099-12-31");
    await hand("st1", 7); await hand("st2", 5);
    const { batchId } = await bulk("clear");
    expect((await redate("2020-01-01")).status).toBe(200);
    expect((await post("/api/assignments/a1/bulk-undo", { batchId })).status).toBe(200);
    const r = await rows("SELECT student_id,status,score,late FROM submissions WHERE assignment_id='a1' ORDER BY student_id");
    expect(r).toEqual([{ student_id: "st1", status: "submitted", score: 7, late: 1 }, { student_id: "st2", status: "submitted", score: 5, late: 1 }]);
  });

  it("all-submitted -> move due date -> undo ok; with a real score edit in between -> 409, data untouched", async () => {
    await setDue("2099-12-31");
    const a = await bulk("all-submitted");
    await redate("2020-01-01");
    expect((await post("/api/assignments/a1/bulk-undo", { batchId: a.batchId })).status).toBe(200);
    const b = await bulk("all-submitted");
    await redate("2021-01-01");
    expect((await hand("st1", 4)).status).toBe(200);
    const res = await post("/api/assignments/a1/bulk-undo", { batchId: b.batchId });
    expect(res.status).toBe(409);
    expect((await rows("SELECT score FROM submissions WHERE student_id='st1' AND assignment_id='a1'"))[0].score).toBe(4);
  });

  it("history is closed to anyone not signed in (401), open when signed in", async () => {
    expect((await call("/api/audit")).status).toBe(401);
    expect((await call("/api/audit", {}, "gk_session=bogus")).status).toBe(401);
    expect((await call("/api/audit", {}, cookie)).status).toBe(200);
  });
});

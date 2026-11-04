// A backup the app itself wrote must always restore. The restore rule not_in_assignment_class (a score of a student whose
// room is not one of the work's rooms) stays; the app prevents the state at the source instead: a room that has ANY
// submissions row of the work cannot be taken off the work (409 class_has_scores), so no such backup can exist.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";
import { takeBackup, restoreFrom } from "./backup-helpers";

const work = (classIds: string[], over: Record<string, unknown> = {}) =>
  json({ id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10, assigned_date: "2569-09-01", due_date: "2569-12-31", publish_scores: true, class_ids: classIds, ...over });
const scan = (studentId: string, o: Record<string, unknown> = {}) =>
  ({ opId: `o_${studentId}`, scanSessionId: "scn", assignmentId: "a1", studentId, status: "submitted", score: 7.5, fullScoreAtScan: 10, method: "grid", clientTs: Date.now(), ...o });
const links = async () =>
  ((await env.DB.prepare("SELECT class_id FROM assignment_classes WHERE assignment_id='a1' ORDER BY class_id").all<any>()).results ?? []).map((r) => r.class_id);

describe("taking a room off a work that has its scores", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login(); await seed();
    // the work is for both rooms; st1 (c1) and st9 (c2) are scored
    expect((await call("/api/assignments", work(["c1", "c2"]), cookie)).status).toBe(200);
  });

  it("is refused with 409 class_has_scores (room name in the message) and nothing changes", async () => {
    expect((await call("/api/submissions/batch", json({ ops: [scan("st1"), scan("st9")] }), cookie)).status).toBe(200);
    const auditN = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity='assignment'").first<any>())?.n;
    const auditBefore = await auditN();
    const res = await call("/api/assignments", work(["c2"], { title: "ชื่อใหม่" }), cookie);
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("class_has_scores");
    expect(body.message).toContain("ป.6/1");
    expect(body.message).not.toContain("ป.6/2");
    expect(await links()).toEqual(["c1", "c2"]);
    expect((await env.DB.prepare("SELECT title FROM assignments WHERE id='a1'").first<any>())?.title).toBe("ใบงาน 1");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id='a1'").first<any>())?.n).toBe(2);
    expect(await auditN()).toBe(auditBefore);
  });

  it.each(["excused", "void", "awaiting"])("is refused even when the only row of the room is %s (no score)", async (status) => {
    await env.DB.prepare(
      "INSERT INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at) VALUES ('a1','st1',?,NULL,0,NULL,'manual','dev_x',NULL,1,1)",
    ).bind(status).run();
    const res = await call("/api/assignments", work(["c2"]), cookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("class_has_scores");
    expect(await links()).toEqual(["c1", "c2"]);
  });

  it("a room with no submissions can still be removed (the other room's scores stay)", async () => {
    expect((await call("/api/submissions/batch", json({ ops: [scan("st1")] }), cookie)).status).toBe(200);
    const res = await call("/api/assignments", work(["c1"]), cookie);
    expect(res.status).toBe(200);
    expect(await links()).toEqual(["c1"]);
    expect((await env.DB.prepare("SELECT score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>())?.score).toBe(7.5);
  });

  it("adding a room and editing other fields keep working when rooms have scores", async () => {
    expect((await call("/api/submissions/batch", json({ ops: [scan("st1"), scan("st9")] }), cookie)).status).toBe(200);
    await env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c3','ป.6/3','ป.6',30,0,2569,0)").run();
    const res = await call("/api/assignments", work(["c1", "c2", "c3"], { title: "ชื่อใหม่", note: "แก้โน้ต" }), cookie);
    expect(res.status).toBe(200);
    expect(await links()).toEqual(["c1", "c2", "c3"]);
    expect((await env.DB.prepare("SELECT title FROM assignments WHERE id='a1'").first<any>())?.title).toBe("ชื่อใหม่");
  });

  it("a restore round trip of the normal backup (rooms with scores still linked) works", async () => {
    expect((await call("/api/submissions/batch", json({ ops: [scan("st1"), scan("st9")] }), cookie)).status).toBe(200);
    // the refused save leaves the data exactly as it was, so the backup taken afterwards restores
    expect((await call("/api/assignments", work(["c2"]), cookie)).status).toBe(409);
    const backup = await takeBackup(cookie);
    expect(backup.data.submissions.length).toBe(2);
    const res = await restoreFrom(cookie, backup);
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
    expect(row?.score).toBe(7.5);
    expect(await links()).toEqual(["c1", "c2"]);
  });
});

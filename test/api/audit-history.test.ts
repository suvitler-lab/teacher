import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";

let cookie: string;
const post = (path: string, body: unknown) => call(path, json(body), cookie);
const move = (classId: string | null) => ({ id: "st1", code: "101", first_name: "ก", last_name: "ข", class_id: classId, number: 8 });
const paste = (classId: string) => ({ class_id: classId, students: [{ code: "101", first_name: "ก", last_name: "ข", number: 8 }] });
const score = () => post("/api/submissions/batch", { ops: [{ opId: "history-score", scanSessionId: "s", assignmentId: "a1", studentId: "st1", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: Date.now() }] });
const attend = () => post("/api/attendance/batch", { date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present", opId: "history-att" }] });
const student = () => env.DB.prepare("SELECT * FROM students WHERE id='st1'").first<any>();
const report = async () => {
  const r = await (await call("/api/reports/summary?class=c1&term=t1", {}, cookie)).json() as any;
  delete r.serverTime;
  return r;
};

describe("student history stays in its original class", () => {
  beforeEach(async () => { cookie = await login(); await seed(); });

  it.each(["score", "attendance"])("preview and both write paths refuse a same-year move with %s history", async (kind) => {
    expect((await (kind === "score" ? score() : attend())).status).toBe(200);
    const before = await student();
    const beforeReport = await report();
    const preview = await (await post("/api/students/import/preview", paste("c2"))).json() as any;
    expect(preview.blockedMoves).toEqual([{ studentId: "st1", code: "101", fromClassId: "c1", toClassId: "c2", reason: "has_history" }]);
    for (const [path, body] of [["/api/students", move("c2")], ["/api/students/import", paste("c2")]] as const) {
      const res = await post(path, body);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: "history_move_blocked" });
      expect(await student()).toEqual(before);
      expect(await report()).toEqual(beforeReport);
    }
  });

  it("blocks cross-year reuse even before the student has any marks", async () => {
    await env.DB.prepare("UPDATE classes SET year=2570 WHERE id='c2'").run();
    const preview = await (await post("/api/students/import/preview", paste("c2"))).json() as any;
    expect(preview.blockedMoves[0].reason).toBe("cross_year");
    expect((await post("/api/students", move("c2"))).status).toBe(409);
    expect((await post("/api/students/import", paste("c2"))).status).toBe(409);
    expect((await student()).class_id).toBe("c1");
  });

  it("cannot detach a student with history by choosing no class", async () => {
    await score();
    expect((await post("/api/students", move(null))).status).toBe(409);
    expect((await student()).class_id).toBe("c1");
  });

  it("keeps same-class edits and reimports working, and allows a same-year move with no history", async () => {
    await score();
    expect((await post("/api/students", { ...move("c1"), first_name: "แก้ไข" })).status).toBe(200);
    expect((await post("/api/students/import", paste("c1"))).status).toBe(200);
    const preview = await (await post("/api/students/import/preview", paste("c1"))).json() as any;
    expect(preview.blockedMoves).toEqual([]);
    expect((await post("/api/students", { id: "st2", code: "102", first_name: "ค", last_name: "ง", class_id: "c2", number: 9 })).status).toBe(200);
  });

  it.each(["edit", "import"])("rolls back the entire %s if a score lands after its early check", async (kind) => {
    const gate = gateBatch();
    const pending = callIn(gate.env, kind === "edit" ? "/api/students" : "/api/students/import", json(kind === "edit" ? move("c2") : paste("c2")), cookie);
    await gate.ready;
    try { expect((await score()).status).toBe(200); } finally { gate.release(); }
    const res = await pending;
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "history_move_blocked" });
    expect((await student()).class_id).toBe("c1");
  });

  it("rejects an attendance request when its student moves after the membership check", async () => {
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", force: true, rows: [{ studentId: "st1", status: "present", opId: "racing-att" }] }), cookie);
    await gate.ready;
    try { expect((await post("/api/students", move("c2"))).status).toBe(200); } finally { gate.release(); }
    const res = await pending;
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "not_in_class", studentIds: ["st1"] });
    expect(await env.DB.prepare("SELECT 1 FROM attendance WHERE student_id='st1'").first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM audit_logs WHERE op_id='racing-att'").first()).toBeNull();
  });
});

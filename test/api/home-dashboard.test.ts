import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed } from "./helpers";

// ui-redesign round 1: the home page's "due soon" and "who is away today" cards come from two extra fields of
// /api/dashboard, built from rows the endpoint already reads (no extra database reads), and the card layout
// lives in one more setting (home_cards) so every device of the one teacher shows the same page.
describe("home dashboard: dueSoon, absentToday, home_cards", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await login(); await seed();
    await env.DB.prepare("DELETE FROM settings WHERE key = 'home_cards'").run(); // reset() keeps the settings table between tests
  });

  async function putAsg(id: string, over: Record<string, unknown>) {
    const res = await call("/api/assignments", json({
      id, term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "งาน " + id, full_score: 10,
      assigned_date: "2026-10-20", due_date: "2026-11-04", publish_scores: true, status: "open", class_ids: ["c1"], ...over,
    }), cookie);
    expect(res.status).toBe(200);
  }
  const dash = async (date: string) => (await (await call(`/api/dashboard?term=t1&date=${date}`, {}, cookie)).json()) as any;

  it("dueSoon lists who has not handed in work due today or tomorrow, per assignment and class", async () => {
    await putAsg("a1", { due_date: "2026-11-04" });                   // due today
    await putAsg("a2", { due_date: "2026-11-05" });                   // due tomorrow
    await putAsg("a3", { due_date: "2026-11-06" });                   // two days away: not "soon"
    await putAsg("a4", { due_date: "2026-11-04", status: "closed" }); // closed: nobody is chasing it
    await call("/api/submissions/batch", json({ ops: [
      { opId: "h1", scanSessionId: "s", assignmentId: "a1", studentId: "st1", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: 1 },
    ] }), cookie);

    const d = await dash("2026-11-04");
    const rows = d.dueSoon as { assignmentId: string; classId: string; studentIds: string[] }[];
    const byAsg = new Map(rows.map((r) => [r.assignmentId, r]));
    expect([...byAsg.keys()].sort()).toEqual(["a1", "a2"]);
    expect(byAsg.get("a1")!.classId).toBe("c1");
    expect(byAsg.get("a1")!.studentIds).toEqual(["st2"]);             // st1 already handed in
    expect(byAsg.get("a2")!.studentIds.sort()).toEqual(["st1", "st2"]);
  });

  it("dueSoon skips excused children and work that is already overdue (that is the follow-up list)", async () => {
    await putAsg("a1", { due_date: "2026-11-04" });
    await putAsg("a2", { due_date: "2026-11-03" });                   // overdue on the 4th
    await call("/api/submissions/batch", json({ ops: [
      { opId: "x1", scanSessionId: "s", assignmentId: "a1", studentId: "st2", status: "excused", score: null, fullScoreAtScan: 10, method: "grid", clientTs: 1 },
    ] }), cookie);
    const d = await dash("2026-11-04");
    const a1 = d.dueSoon.find((r: any) => r.assignmentId === "a1");
    expect(a1.studentIds).toEqual(["st1"]);                           // st2 is excused
    expect(d.dueSoon.some((r: any) => r.assignmentId === "a2")).toBe(false);
  });

  it("dueSoon is empty when nothing is due soon and leaves the existing fields alone", async () => {
    await putAsg("a1", { due_date: "2026-12-30" });
    const d = await dash("2026-11-04");
    expect(d.dueSoon).toEqual([]);
    expect(d.missingCount).toBe(0);
    expect(d.openAssignments).toHaveLength(1);
  });

  it("absentToday lists each active child whose status today is not 'present', and the day totals stay as before", async () => {
    await call("/api/attendance/batch", json({ date: "2026-11-04", classId: "c1", rows: [
      { studentId: "st1", status: "present" }, { studentId: "st2", status: "sick" },
    ] }), cookie);
    const d = await dash("2026-11-04");
    expect(d.absentToday).toEqual([{ classId: "c1", studentId: "st2", status: "sick" }]);
    const c1 = d.attendanceToday.find((x: any) => x.classId === "c1");
    expect([c1.present, c1.sick, c1.marked, c1.total]).toEqual([1, 1, 2, 2]);
  });

  it("absentToday does not list a child who has moved out, nor an unmarked class", async () => {
    await call("/api/attendance/batch", json({ date: "2026-11-04", classId: "c1", rows: [
      { studentId: "st1", status: "absent" }, { studentId: "st2", status: "late" },
    ] }), cookie);
    await env.DB.prepare("UPDATE students SET status = 'moved' WHERE id = 'st1'").run();
    const d = await dash("2026-11-04");
    expect(d.absentToday).toEqual([{ classId: "c1", studentId: "st2", status: "late" }]);
    expect(d.absentToday.some((r: any) => r.classId === "c2")).toBe(false);
  });

  it("home_cards is saved by PUT /api/settings, comes back in the bootstrap, and unknown keys are still dropped", async () => {
    const value = JSON.stringify({ v: 1, order: ["open", "att"], hidden: ["att"] });
    const res = await call("/api/settings", { method: "PUT", body: JSON.stringify({ home_cards: value, not_a_setting: "x" }), headers: { "Content-Type": "application/json" } }, cookie);
    expect(res.status).toBe(200);
    const boot = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    expect(boot.settings.home_cards).toBe(value);
    expect(boot.settings.not_a_setting).toBeUndefined();
  });

  it("home_cards defaults to an empty string (the page then uses its default layout)", async () => {
    const boot = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    expect(boot.settings.home_cards).toBe("");
  });
});

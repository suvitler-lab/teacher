import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, gateBatch, json, login, seed } from "./helpers";
import { bkkToday } from "../../worker/lib/time";

// QA M1-04 (BR-04) — black-box cases from docs/team/jobs/2026-10-30-m1-04-late-flag/evidence/qa-expected-from-br.md
// (expected values were worked out by hand from BR-04 before these tests were run).
// late = 1  <=>  status 'submitted' AND submitted_at set AND due_date set AND Bangkok date(submitted_at) > due_date

const Z = (iso: string) => Date.parse(iso); // UTC instant
const DAY = 24 * 60 * 60 * 1000;

async function put(sid: string, o: { status?: string; score?: number | null; late: number; at: number | null }) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at)
     VALUES ('a1', ?, ?, ?, ?, ?, 'manual', NULL, NULL, 500, 500)`,
  ).bind(sid, o.status ?? "submitted", o.score === undefined ? 8 : o.score, o.late, o.at).run();
}
const lates = async (ids: string[]) => {
  const out: number[] = [];
  for (const id of ids) out.push((await env.DB.prepare("SELECT late FROM submissions WHERE assignment_id='a1' AND student_id=?").bind(id).first<any>()).late);
  return out;
};
const setDue = (due: string | null) => env.DB.prepare("UPDATE assignments SET due_date = ? WHERE id='a1'").bind(due).run();
const body = (over: Record<string, unknown> = {}) => ({
  id: "a1", term_id: "t1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10,
  assigned_date: "2026-10-01", due_date: "2026-10-20", publish_scores: true, status: "open", class_ids: ["c1"], ...over,
});

describe("QA M1-04 late follows the current due date", () => {
  let cookie: string;
  const save = async (over: Record<string, unknown> = {}) => {
    const r = await call("/api/assignments", json(body(over)), cookie);
    expect(r.status).toBe(200);
  };
  const S = ["st1", "st2", "st3", "st4", "st5", "st6"];

  beforeEach(async () => {
    cookie = await login();
    await seed();
    await env.DB.batch([3, 4, 5, 6].map((n) =>
      env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES (?,?,?,'ด.ช.','ทดสอบ',?,'c1',?,'active',0)")
        .bind(`st${n}`, `10${n}`, `Q-QA0000000${n}`, `คนที่${n}`, n)));
    await setDue("2026-10-20");
  });

  it("E01-E05 same due date: 23:59 / 23:59:59.999 on time, 00:00 / 00:01 next Bangkok day late, UTC-yesterday 00:00 BKK on time", async () => {
    const at = [Z("2026-10-20T16:59:00Z"), Z("2026-10-20T16:59:59.999Z"), Z("2026-10-20T17:00:00.000Z"), Z("2026-10-20T17:01:00Z"), Z("2026-10-19T17:00:00Z")];
    const exp = [0, 0, 1, 1, 0];
    for (let i = 0; i < at.length; i++) await put(S[i], { late: 1 - exp[i], at: at[i] }); // start from the wrong value
    await save({ title: "ใบงาน 1 แก้ชื่อ" });
    expect(await lates(S.slice(0, 5))).toEqual(exp);
  });

  it("E06-E07 postponing by one day clears 10-21 hand-ins (incl. 00:00 BKK) but not 10-22 00:00 BKK", async () => {
    await put("st1", { late: 1, at: Z("2026-10-21T03:00:00Z") }); // 10-21 10:00
    await put("st2", { late: 1, at: Z("2026-10-20T17:00:00Z") }); // 10-21 00:00
    await put("st3", { late: 1, at: Z("2026-10-21T17:00:00Z") }); // 10-22 00:00
    await save({ due_date: "2026-10-21" });
    expect(await lates(["st1", "st2", "st3"])).toEqual([0, 0, 1]);
  });

  it("E08-E09 moving the due date back: 10-22 10:00 late, 10-20 23:59 still on time", async () => {
    await setDue("2026-10-25");
    await put("st1", { late: 0, at: Z("2026-10-22T03:00:00Z") });
    await put("st2", { late: 0, at: Z("2026-10-20T16:59:00Z") });
    await save({ due_date: "2026-10-20" });
    expect(await lates(["st1", "st2"])).toEqual([1, 0]);
  });

  it("E10-E13 void/excused with a stale late=1 and a row without submitted_at end at 0; a submitted twin stays late", async () => {
    await put("st1", { status: "void", late: 1, at: Z("2026-10-23T03:00:00Z"), score: null });
    await put("st2", { status: "excused", late: 1, at: Z("2026-10-23T03:00:00Z"), score: null });
    await put("st3", { late: 1, at: null });
    await put("st4", { late: 0, at: Z("2026-10-23T03:00:00Z") });
    await save({ due_date: "2026-10-21" });
    expect(await lates(["st1", "st2", "st3", "st4"])).toEqual([0, 0, 0, 1]);
    await save({ due_date: null }); // E10
    expect(await lates(["st1", "st2", "st3", "st4"])).toEqual([0, 0, 0, 0]);
  });

  it("E14-E15 month end: adding due 10-31 makes 11-01 00:00 BKK late, 10-31 23:59 on time", async () => {
    await setDue(null);
    await put("st1", { late: 0, at: Z("2026-10-31T17:00:00Z") });
    await put("st2", { late: 1, at: Z("2026-10-31T16:59:00Z") });
    await save({ due_date: "2026-10-31" });
    expect(await lates(["st1", "st2"])).toEqual([1, 0]);
  });

  it("E16 year end: due 2026-12-31 makes 2027-01-01 00:00 BKK late, 23:59:59.999 on time", async () => {
    await put("st1", { late: 0, at: Z("2026-12-31T17:00:00Z") });
    await put("st2", { late: 1, at: Z("2026-12-31T16:59:59.999Z") });
    await save({ due_date: "2026-12-31" });
    expect(await lates(["st1", "st2"])).toEqual([1, 0]);
  });

  it("R report scenario: late counts in gradebook / reports summary / dashboard follow each due change", async () => {
    // A 10-22 10:00, B 10-19 10:00, C 10-21 00:00 BKK, D void, E excused (expected-from-br.md section R)
    await put("st1", { late: 1, at: Z("2026-10-22T03:00:00Z"), score: 7 });
    await put("st2", { late: 0, at: Z("2026-10-19T03:00:00Z"), score: 9 });
    await put("st3", { late: 0, at: Z("2026-10-20T17:00:00Z"), score: 6 }); // starts wrong on purpose
    await put("st4", { status: "void", late: 0, at: null, score: null });
    await put("st5", { status: "excused", late: 0, at: null, score: null });
    const counts = async () => {
      const gb = await (await call("/api/gradebook?class=c1&term=t1", {}, cookie)).json() as any;
      const rp = await (await call("/api/reports/summary?class=c1&term=t1", {}, cookie)).json() as any;
      const db = await (await call("/api/dashboard?term=t1&date=2026-10-30", {}, cookie)).json() as any;
      const n = (subs: any[]) => subs.filter((s: any) => s.assignment_id === "a1" && s.late === true).length;
      const pc = db.openAssignments.find((x: any) => x.assignment.id === "a1").perClass.find((p: any) => p.classId === "c1");
      return [n(gb.submissions), n(rp.submissions), pc.late];
    };
    const steps: [string | null, number][] = [["2026-10-20", 2], ["2026-10-21", 1], ["2026-10-25", 0], ["2026-10-18", 3], [null, 0], ["2026-10-20", 2]];
    for (const [due, n] of steps) {
      await save({ due_date: due });
      expect({ due, counts: await counts() }).toEqual({ due, counts: [n, n, n] });
    }
  });

  it("the scan screen's source (GET /api/assignments/:id/submissions) returns late as a boolean after the edit", async () => {
    await put("st1", { late: 0, at: Z("2026-10-22T03:00:00Z") });
    await put("st2", { late: 1, at: Z("2026-10-19T03:00:00Z") });
    await save({ due_date: "2026-10-20" });
    const r = await (await call("/api/assignments/a1/submissions", {}, cookie)).json() as any;
    const m = Object.fromEntries(r.submissions.map((s: any) => [s.student_id, s.late]));
    expect(m).toEqual({ st1: true, st2: false });
  });

  it("a first hand-in made after the due change is decided by the NEW due date (scan op path)", async () => {
    const now = Date.now();
    const clientTs = now - 2 * DAY;
    await setDue(bkkToday(now - 4 * DAY));
    await put("st1", { late: 1, at: clientTs });
    await save({ due_date: bkkToday(now) }); // postpone to today: st1 on time
    const res = await call("/api/submissions/batch", json({ ops: [{ opId: "qa-op-1", scanSessionId: "s", assignmentId: "a1", studentId: "st2", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs }] }), cookie);
    expect(res.status).toBe(200);
    expect(await lates(["st1", "st2"])).toEqual([0, 0]);
    await save({ due_date: bkkToday(now - 4 * DAY) }); // back again: both late
    expect(await lates(["st1", "st2"])).toEqual([1, 1]);
  });

  it("bulk 'all submitted' after the due change uses the new due date, and a later edit agrees", async () => {
    const now = Date.now();
    await setDue(bkkToday(now - 3 * DAY));
    await save({ due_date: bkkToday(now) });
    const r = await call("/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1" }), cookie);
    expect(r.status).toBe(200);
    expect(await lates(["st1", "st2"])).toEqual([0, 0]);
    await save({ due_date: bkkToday(now - 3 * DAY) });
    expect(await lates(["st1", "st2"])).toEqual([1, 1]);
  });

  it("saving the same due date twice is idempotent and never touches updated_at / event_at / submitted_at / score", async () => {
    await put("st1", { late: 0, at: Z("2026-10-22T03:00:00Z") });
    await save({ due_date: "2026-10-20" });
    await save({ due_date: "2026-10-20" });
    const r = await env.DB.prepare("SELECT late, updated_at, event_at, submitted_at, score FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
    expect(r).toEqual({ late: 1, updated_at: 500, event_at: 500, submitted_at: Z("2026-10-22T03:00:00Z"), score: 8 });
  });

  it("two edits sent at once: the stored late always matches the stored due date", async () => {
    await put("st1", { late: 0, at: Z("2026-10-22T03:00:00Z") });
    await Promise.all([
      call("/api/assignments", json(body({ due_date: "2026-10-25" })), cookie),
      call("/api/assignments", json(body({ due_date: "2026-10-20" })), cookie),
    ]);
    const due = (await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date;
    expect((await lates(["st1"]))[0]).toBe(due === "2026-10-20" ? 1 : 0);
  });

  // ---- Verify 1: AC-10 (every write path re-decides late from the due date inside its own transaction) + R-02 ----
  const counts = async () => {
    const gb = await (await call("/api/gradebook?class=c1&term=t1", {}, cookie)).json() as any;
    const rp = await (await call("/api/reports/summary?class=c1&term=t1", {}, cookie)).json() as any;
    const db = await (await call("/api/dashboard?term=t1&date=2026-10-30", {}, cookie)).json() as any;
    const n = (subs: any[]) => subs.filter((s: any) => s.assignment_id === "a1" && s.late === true).length;
    const pc = db.openAssignments.find((x: any) => x.assignment.id === "a1").perClass.find((p: any) => p.classId === "c1");
    return [n(gb.submissions), n(rp.submissions), pc.late];
  };
  const clearThenUndo = async (between: () => Promise<void>) => {
    const clr = await call("/api/assignments/a1/bulk", json({ action: "clear", classId: "c1" }), cookie);
    expect(clr.status).toBe(200);
    const { batchId } = (await clr.json()) as any;
    await between();
    const u = await call("/api/assignments/a1/bulk-undo", json({ batchId }), cookie);
    expect(u.status).toBe(200);
  };

  it("AC-10 clear class → postpone due to 10-25 → undo the clear: A comes back NOT late, counts 0 everywhere", async () => {
    await put("st1", { late: 1, at: Z("2026-10-22T03:00:00Z"), score: 7 });
    await put("st2", { late: 0, at: Z("2026-10-19T03:00:00Z"), score: 9 });
    expect(await counts()).toEqual([1, 1, 1]);
    await clearThenUndo(() => save({ due_date: "2026-10-25" }));
    const a = await env.DB.prepare("SELECT status, score, late, submitted_at FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first<any>();
    expect(a).toEqual({ status: "submitted", score: 7, late: 0, submitted_at: Z("2026-10-22T03:00:00Z") });
    expect(await lates(["st2"])).toEqual([0]);
    expect(await counts()).toEqual([0, 0, 0]);
  });

  it("AC-10 reverse: due 10-25, clear → move due back to 10-20 → undo: A comes back late, counts 1 everywhere", async () => {
    await setDue("2026-10-25");
    await put("st1", { late: 0, at: Z("2026-10-22T03:00:00Z"), score: 7 });
    await put("st2", { late: 0, at: Z("2026-10-20T16:59:00Z"), score: 9 }); // 23:59 BKK on the due day
    await clearThenUndo(() => save({ due_date: "2026-10-20" }));
    expect(await lates(["st1", "st2"])).toEqual([1, 0]);
    expect(await counts()).toEqual([1, 1, 1]);
  });

  it("AC-10 a due-date edit landing between the scan op's judge and its write: the new row follows the NEW due date", async () => {
    const now = Date.now();
    await setDue(bkkToday(now - 4 * DAY));
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/submissions/batch", json({ ops: [{ opId: "qa-race-1", scanSessionId: "s", assignmentId: "a1", studentId: "st2", status: "submitted", score: 8, fullScoreAtScan: 10, method: "grid", clientTs: now - 2 * DAY }] }), cookie);
    await gate.ready; // judged with the old due date (would be late)
    await save({ due_date: bkkToday(now) });
    gate.release();
    const res = await pending;
    expect(res.status).toBe(200);
    const r = await env.DB.prepare("SELECT status, late FROM submissions WHERE assignment_id='a1' AND student_id='st2'").first<any>();
    expect(r).toEqual({ status: "submitted", late: 0 });
  });

  it("AC-10 bulk 'all submitted' with a due-date edit landing before its write follows the NEW due date", async () => {
    const now = Date.now();
    await setDue(bkkToday(now - 3 * DAY)); // bulk judges "late" against this
    const gate = gateBatch();
    const pending = callIn(gate.env, "/api/assignments/a1/bulk", json({ action: "all-submitted", classId: "c1" }), cookie);
    await gate.ready;
    await save({ due_date: bkkToday(now) });
    gate.release();
    expect((await pending).status).toBe(200);
    expect(await lates(S)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("R-02 malformed due/assigned dates are refused (422) and change nothing; an empty due date means none", async () => {
    await put("st1", { late: 1, at: Z("2026-10-22T03:00:00Z") });
    for (const bad of [{ due_date: "20/10/2026" }, { due_date: "2026-10-20T00:00" }, { due_date: "20261020" }, { assigned_date: "1/10/2026" }]) {
      const r = await call("/api/assignments", json(body({ title: "ห้ามเปลี่ยน", ...bad })), cookie);
      expect({ bad, status: r.status }).toEqual({ bad, status: 422 });
    }
    const a = await env.DB.prepare("SELECT title, due_date FROM assignments WHERE id='a1'").first<any>();
    expect(a).toEqual({ title: "ใบงาน 1", due_date: "2026-10-20" });
    expect(await lates(["st1"])).toEqual([1]);
    await save({ due_date: "" });
    expect((await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date).toBeNull();
    expect(await lates(["st1"])).toEqual([0]);
  });

  it("R-02 (B-01) a Buddhist-era due date (2569-10-20) is refused — brief: YYYY-MM-DD in the Common Era", async () => {
    // a BE due date compares as "2026-10-22" < "2569-10-20" → nobody is ever late (BR-04 silently off)
    await put("st1", { late: 1, at: Z("2026-10-22T03:00:00Z") });
    const r = await call("/api/assignments", json(body({ due_date: "2569-10-20" })), cookie);
    expect(r.status).toBe(422);
    expect((await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date).toBe("2026-10-20");
    expect(await lates(["st1"])).toEqual([1]);
  });

  // ---- Verify 2: B-01 details (real CE date 1900–2099; a value equal to the stored one is always accepted) ----
  it("B-01 a date that does not exist (2026-02-30) is refused and changes nothing", async () => {
    await put("st1", { late: 1, at: Z("2026-10-22T03:00:00Z") });
    for (const bad of [{ due_date: "2026-02-30" }, { assigned_date: "2026-13-01" }]) {
      const r = await call("/api/assignments", json(body({ title: "ห้ามเปลี่ยน", ...bad })), cookie);
      expect({ bad, status: r.status }).toEqual({ bad, status: 422 });
    }
    const a = await env.DB.prepare("SELECT title, due_date FROM assignments WHERE id='a1'").first<any>();
    expect(a).toEqual({ title: "ใบงาน 1", due_date: "2026-10-20" });
    expect(await lates(["st1"])).toEqual([1]);
  });

  it("B-01 a year before 1900 (1899-12-31) is refused; 1900-01-01 and 2099-12-31 are accepted", async () => {
    const r = await call("/api/assignments", json(body({ due_date: "1899-12-31" })), cookie);
    expect(r.status).toBe(422);
    expect((await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date).toBe("2026-10-20");
    await save({ due_date: "1900-01-01" });
    await save({ due_date: "2099-12-31" });
    expect((await env.DB.prepare("SELECT due_date FROM assignments WHERE id='a1'").first<any>()).due_date).toBe("2099-12-31");
  });

  it("B-01 an old work already stored with a BE due date can still be hidden / closed with that same value (late unchanged)", async () => {
    await env.DB.prepare("UPDATE assignments SET due_date = '2569-10-20', assigned_date = '2569-10-01' WHERE id='a1'").run();
    await put("st1", { late: 0, at: Z("2026-10-22T03:00:00Z") }); // BR-04 against "2569-10-20" = not late
    const keep = { due_date: "2569-10-20", assigned_date: "2569-10-01" };
    await save({ ...keep, publish_scores: false });
    await save({ ...keep, publish_scores: false, status: "closed" });
    const a = await env.DB.prepare("SELECT due_date, assigned_date, publish_scores, status FROM assignments WHERE id='a1'").first<any>();
    expect(a).toEqual({ due_date: "2569-10-20", assigned_date: "2569-10-01", publish_scores: 0, status: "closed" });
    expect(await lates(["st1"])).toEqual([0]);
    // but changing it to ANOTHER BE value is still refused
    expect((await call("/api/assignments", json(body({ ...keep, due_date: "2569-10-21" })), cookie)).status).toBe(422);
  });
});

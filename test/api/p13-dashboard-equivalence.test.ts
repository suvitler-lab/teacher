import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, login, seed } from "./helpers";
import { assignmentProgress, workState, type SubLike } from "../../shared/metrics";
import { loadTerm, memberClause } from "../../worker/lib/roster";

// P13 (code review): the dashboard used to JOIN students (+ the term's membership rule and class year) on the
// submissions query. It now reads submissions alone and drops the ones whose child is not in the term's roster.
// This file rebuilds the dashboard numbers with the OLD query, straight from git HEAD ca4f280, and requires the
// route to give exactly the same answer for every roster edge (left_at before / on / after the term end, inactive
// without a date, finished, legacy class year NULL, another year's class, a child with no class).

const DATE = "2026-11-01";

async function oldWay(termId: string | null) {
  const term = await loadTerm(env as any, termId);
  const clauses = ["a.deleted_at IS NULL"];
  const binds: unknown[] = [];
  if (termId === "unassigned") clauses.push("a.term_id IS NULL");
  else if (termId) { clauses.push("a.term_id = ?"); binds.push(termId); }
  const assignments = ((await env.DB.prepare(
    `SELECT a.* FROM assignments a WHERE ${clauses.join(" AND ")} ORDER BY a.due_date IS NULL, a.due_date, a.created_at`,
  ).bind(...binds).all()).results ?? []) as any[];
  const aids = assignments.map((a) => a.id);
  const member = memberClause("s", term);
  const yearJoin = term ? "JOIN classes cl ON cl.id = s.class_id AND (cl.year IS NULL OR cl.year = ?)" : "";
  const yearBinds = term ? [term.year] : [];
  const links = (await env.DB.prepare(
    `SELECT assignment_id, class_id FROM assignment_classes WHERE assignment_id IN (SELECT value FROM json_each(?1))`,
  ).bind(JSON.stringify(aids)).all<any>()).results ?? [];
  const stu = (await env.DB.prepare(`SELECT s.id, s.class_id FROM students s ${yearJoin} WHERE ${member.sql}`)
    .bind(...yearBinds, ...member.binds).all<any>()).results ?? [];
  // the HEAD query, verbatim
  const subs = (await env.DB.prepare(
    `WITH ids AS (SELECT value AS v FROM json_each(?1))
     SELECT sub.assignment_id, sub.student_id, sub.status, sub.score, sub.late, s.class_id
     FROM submissions sub
     JOIN students s ON s.id = sub.student_id ${yearJoin}
     WHERE sub.assignment_id IN (SELECT v FROM ids) AND ${member.sql}`,
  ).bind(JSON.stringify(aids), ...yearBinds, ...member.binds).all<any>()).results ?? [];

  const classStudents = new Map<string, { id: string }[]>();
  for (const s of stu) if (s.class_id) (classStudents.get(s.class_id) ?? classStudents.set(s.class_id, []).get(s.class_id)!).push({ id: s.id });
  const linksByAsg = new Map<string, string[]>();
  for (const l of links) (linksByAsg.get(l.assignment_id) ?? linksByAsg.set(l.assignment_id, []).get(l.assignment_id)!).push(l.class_id);
  const subByAsg = new Map<string, Map<string, SubLike>>();
  for (const r of subs) {
    const m = subByAsg.get(r.assignment_id) ?? subByAsg.set(r.assignment_id, new Map()).get(r.assignment_id)!;
    m.set(r.student_id, { status: r.status, score: r.score ?? null, late: r.late });
  }
  let awaitingCount = 0, missingCount = 0;
  const followMiss = new Map<string, { classId: string; missing: number }>();
  const open: any[] = [], grading: any[] = [];
  for (const a of assignments) {
    const isOpen = a.status === "open";
    const sm = subByAsg.get(a.id) ?? new Map();
    const perClass = (linksByAsg.get(a.id) ?? []).map((classId) => {
      const students = classStudents.get(classId) ?? [];
      const p = assignmentProgress(a, students, sm, DATE);
      awaitingCount += p.awaiting;
      if (isOpen) {
        missingCount += p.missing;
        for (const st of students) if (workState(sm.get(st.id), a, DATE) === "missing") {
          const cur = followMiss.get(st.id) ?? { classId, missing: 0 };
          cur.missing++;
          followMiss.set(st.id, cur);
        }
      }
      return { classId, total: p.total, submitted: p.submitted, scored: p.scored, awaiting: p.awaiting, late: p.late, missing: p.missing, excused: p.excused };
    });
    if (isOpen) open.push({ id: a.id, perClass });
    else if (perClass.some((p) => p.awaiting > 0)) grading.push({ id: a.id, perClass });
  }
  const followUp = [...followMiss.entries()].map(([studentId, v]) => ({ studentId, classId: v.classId, missing: v.missing }))
    .sort((x, y) => y.missing - x.missing).slice(0, 8);
  return { open, grading, awaitingCount, missingCount, followUp };
}

async function newWay(cookie: string, termId: string | null) {
  const q = termId ? `term=${encodeURIComponent(termId)}&` : "";
  const d = (await (await call(`/api/dashboard?${q}date=${DATE}`, {}, cookie)).json()) as any;
  const pick = (list: any[]) => list.map((x) => ({ id: x.assignment.id, perClass: x.perClass }));
  return { open: pick(d.openAssignments), grading: pick(d.gradingAssignments), awaitingCount: d.awaitingCount, missingCount: d.missingCount, followUp: d.followUp };
}

describe("P13 dashboard: submissions filtered in code == the old JOIN", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("every roster edge gives the same numbers as the HEAD query, for a term with an end date, without one, no term, and a past year's term", async () => {
    const now = 0;
    const stu = (id: string, cls: string | null, status: string, leftAt: string | null, n: number) =>
      env.DB.prepare("INSERT INTO students (id,code,qr_token,first_name,last_name,class_id,number,status,left_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(id, "9" + n, "Q-" + String(n).padStart(10, "Z"), id, "x", cls, n, status, leftAt, now);
    const asg = (id: string, term: string, status: string, due: string | null) =>
      env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES (?,?,'s1','wt_worksheet',?,10,'2026-09-01',?,1,?,?,?)")
        .bind(id, term, id, due, status, now, now);
    const link = (a: string, c: string) => env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES (?,?)").bind(a, c);
    const sub = (a: string, s: string, status: string, score: number | null, late = 0) =>
      env.DB.prepare("INSERT INTO submissions (assignment_id,student_id,status,score,late,updated_at) VALUES (?,?,?,?,?,0)").bind(a, s, status, score, late);

    await env.DB.batch([
      env.DB.prepare("UPDATE terms SET end_date = '2026-09-30' WHERE id = 't1'"),
      env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,end_date,updated_at) VALUES ('t0',2568,2,'2/2568',0,'2026-03-31',0)"),
      env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c3','legacy','ป.6',30,0,NULL,0)"),
      env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c4','ป.5/1 2568','ป.5',40,1,2568,0)"),
      stu("m_before", "c1", "moved", "2026-09-15", 11),   // left during the term   -> out of t1
      stu("m_on", "c1", "inactive", "2026-09-30", 12),     // left ON the end date   -> out (left_at > end)
      stu("m_after", "c1", "moved", "2026-10-15", 13),    // left after the term    -> in t1, out of "no term"
      stu("i_nodate", "c1", "inactive", null, 14),        // no left_at             -> out
      stu("fin", "c1", "finished", null, 15),             // finished               -> in any term, out of "no term"
      stu("leg", "c3", "active", null, 16),               // legacy class, year NULL -> in every year
      stu("old", "c4", "active", null, 17),               // another year's class   -> only t0
      stu("old_moved", "c4", "moved", "2026-02-01", 18),  // left inside t0         -> out of t0
      stu("nocls", null, "active", null, 19),             // no class
      asg("a2", "t1", "open", "2026-10-01"),              // overdue -> missing/followUp
      asg("a3", "t1", "closed", null),                    // closed  -> grading + missing-not-chased
      asg("a0", "t0", "open", "2026-03-01"),              // a past year's work
      link("a1", "c3"), link("a1", "c4"),
      link("a2", "c1"), link("a2", "c3"), link("a2", "c4"),
      link("a3", "c1"), link("a3", "c3"),
      link("a0", "c4"), link("a0", "c1"),
    ]);
    const everyone = ["st1", "st2", "st9", "m_before", "m_on", "m_after", "i_nodate", "fin", "leg", "old", "old_moved", "nocls"];
    const shapes: [string, number | null, number][] = [["submitted", 8, 0], ["submitted", null, 0], ["excused", null, 0], ["submitted", 6, 1], ["void", null, 0]];
    const rows: D1PreparedStatement[] = [];
    for (const [ai, a] of ["a1", "a2", "a3", "a0"].entries()) {
      everyone.forEach((s, i) => {
        if ((i + ai) % 6 === 5) return; // some children have no row at all
        const [st, sc, late] = shapes[(i + ai) % shapes.length];
        rows.push(sub(a, s, st, sc, late));
      });
    }
    await env.DB.batch(rows);

    for (const termId of ["t1", "t0", null, "unassigned"]) {
      const want = await oldWay(termId);
      const got = await newWay(cookie, termId);
      expect(got, `term ${termId}`).toEqual(want);
    }
    // t1 without an end date (everyone active or finished; moved/inactive out whatever left_at says)
    await env.DB.prepare("UPDATE terms SET end_date = NULL WHERE id = 't1'").run();
    expect(await newWay(cookie, "t1")).toEqual(await oldWay("t1"));

    // and it is not vacuous: t1 (end 30 Sep) on c1 = st1, st2, m_after, fin
    await env.DB.prepare("UPDATE terms SET end_date = '2026-09-30' WHERE id = 't1'").run();
    const t1 = await newWay(cookie, "t1");
    expect(t1.open.find((x) => x.id === "a2")!.perClass.map((p: any) => [p.classId, p.total])).toEqual([["c1", 4], ["c3", 1], ["c4", 0]]);
    expect(t1.missingCount).toBeGreaterThan(0);
    expect(t1.awaitingCount).toBeGreaterThan(0);
    expect((await newWay(cookie, "t0")).open.find((x) => x.id === "a0")!.perClass).toEqual(
      (await oldWay("t0")).open.find((x) => x.id === "a0")!.perClass,
    );
  });
});

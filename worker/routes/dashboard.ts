import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { mapAssignment } from "../lib/rows";
import { bkkToday } from "../lib/time";
import { loadTerm, memberClause } from "../lib/roster";
import { assignmentProgress, workState, type SubLike } from "@shared/metrics";
import type { DashboardPayload, ClassProgress, AttendanceDay, AssignmentDashboard } from "@shared/types";

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
dashboardRoutes.use("/api/dashboard", requireAuth);

// The home dashboard. Numbers are computed with the same shared/metrics
// functions the report and gradebook use, so the pages never disagree.
dashboardRoutes.get("/api/dashboard", async (c) => {
  const termId = c.req.query("term") || null;
  const date = c.req.query("date") || bkkToday();

  // open work (still collecting) AND closed work: closed work can still be waiting to be graded
  const clauses = ["a.deleted_at IS NULL"];
  const binds: unknown[] = [];
  if (termId === "unassigned") clauses.push("a.term_id IS NULL");
  else if (termId) { clauses.push("a.term_id = ?"); binds.push(termId); }

  // the class rosters of THIS term (a past year's classes hold that year's children)
  const term = await loadTerm(c.env, termId);
  const member = memberClause("s", term);
  const yearJoin = term ? "JOIN classes cl ON cl.id = s.class_id AND (cl.year IS NULL OR cl.year = ?)" : "";
  const yearBinds = term ? [term.year] : [];

  const aRes = await c.env.DB.prepare(
    `SELECT a.* FROM assignments a WHERE ${clauses.join(" AND ")} ORDER BY a.due_date IS NULL, a.due_date, a.created_at`,
  ).bind(...binds).all();
  const assignments = aRes.results ?? [];
  const aids = assignments.map((a: any) => a.id);

  // class links, active students (id+class), submissions for these assignments
  const [linkRes, stuRes, subRes] = await Promise.all([
    aids.length
      ? c.env.DB.prepare(
          `SELECT assignment_id, class_id FROM assignment_classes JOIN json_each(?1) j ON j.value = assignment_id`,
        ).bind(JSON.stringify(aids)).all<{ assignment_id: string; class_id: string }>()
      : Promise.resolve({ results: [] as any[] }),
    c.env.DB.prepare(`SELECT s.id, s.class_id FROM students s ${yearJoin} WHERE ${member.sql}`)
      .bind(...yearBinds, ...member.binds).all<{ id: string; class_id: string | null }>(),
    aids.length
      ? c.env.DB.prepare(
          `SELECT sub.assignment_id, sub.student_id, sub.status, sub.score, sub.late, s.class_id
           FROM submissions sub JOIN json_each(?1) j ON j.value = sub.assignment_id
           JOIN students s ON s.id = sub.student_id ${yearJoin} WHERE ${member.sql}`,
        ).bind(JSON.stringify(aids), ...yearBinds, ...member.binds).all<any>()
      : Promise.resolve({ results: [] as any[] }),
  ]);

  const classStudents = new Map<string, { id: string }[]>();
  for (const s of stuRes.results ?? []) {
    if (!s.class_id) continue;
    (classStudents.get(s.class_id) ?? classStudents.set(s.class_id, []).get(s.class_id)!).push({ id: s.id });
  }

  const linksByAsg = new Map<string, string[]>();
  for (const l of linkRes.results ?? []) {
    (linksByAsg.get(l.assignment_id) ?? linksByAsg.set(l.assignment_id, []).get(l.assignment_id)!).push(l.class_id);
  }

  // submissions keyed by assignment -> student
  const subByAsg = new Map<string, Map<string, SubLike>>();
  for (const r of subRes.results ?? []) {
    let m = subByAsg.get(r.assignment_id);
    if (!m) { m = new Map(); subByAsg.set(r.assignment_id, m); }
    m.set(r.student_id, { status: r.status, score: r.score ?? null, late: r.late });
  }

  // awaiting = work to GRADE (open or closed); missing = work still being CHASED (open only:
  // once the teacher closes an assignment they have stopped collecting it)
  let awaitingCount = 0, missingCount = 0;
  const followMiss = new Map<string, { classId: string; missing: number }>();
  const openAssignments: AssignmentDashboard[] = [];
  const gradingAssignments: AssignmentDashboard[] = [];

  for (const a of assignments as any[]) {
    const isOpen = a.status === "open";
    const asg = mapAssignment(a, linksByAsg.get(a.id) ?? []);
    const subs = subByAsg.get(a.id) ?? new Map<string, SubLike>();
    const perClass: ClassProgress[] = (linksByAsg.get(a.id) ?? []).map((classId) => {
      const students = classStudents.get(classId) ?? [];
      const p = assignmentProgress(a, students, subs, date);
      awaitingCount += p.awaiting;
      if (isOpen) {
        missingCount += p.missing;
        for (const st of students) {
          if (workState(subs.get(st.id), a, date) === "missing") {
            const cur = followMiss.get(st.id) ?? { classId, missing: 0 };
            cur.missing++;
            followMiss.set(st.id, cur);
          }
        }
      }
      return {
        classId, total: p.total, submitted: p.submitted, scored: p.scored,
        awaiting: p.awaiting, late: p.late, missing: p.missing, excused: p.excused,
      };
    });
    if (isOpen) openAssignments.push({ assignment: asg, perClass });
    else if (perClass.some((p) => p.awaiting > 0)) gradingAssignments.push({ assignment: asg, perClass });
  }

  // Attendance for the day: EVERY active class (a room nobody has started yet must still show
  // up as "not checked"), daily sessions only, counting only the active students of that class.
  const [classRes, attRes, activeRes] = await Promise.all([
    c.env.DB.prepare("SELECT id FROM classes WHERE archived = 0 ORDER BY sort, name").all<{ id: string }>(),
    c.env.DB.prepare(
      `SELECT s.class_id AS classId, at.status AS status, COUNT(*) AS n
       FROM attendance_sessions s
       JOIN attendance at ON at.session_id = s.id
       JOIN students st ON st.id = at.student_id AND st.status = 'active' AND st.class_id = s.class_id
       WHERE s.date = ? AND s.subject_id IS NULL AND s.period IS NULL
       GROUP BY s.class_id, at.status`,
    ).bind(date).all<{ classId: string; status: string; n: number }>(),
    // "today" is about the children who are in the class today, whatever term is being viewed
    c.env.DB.prepare("SELECT class_id, COUNT(*) AS n FROM students WHERE status = 'active' GROUP BY class_id")
      .all<{ class_id: string | null; n: number }>(),
  ]);
  const activeCount = new Map<string, number>();
  for (const r of activeRes.results ?? []) if (r.class_id) activeCount.set(r.class_id, r.n);
  const tally = new Map<string, AttendanceDay>();
  for (const cl of classRes.results ?? []) {
    tally.set(cl.id, {
      date, classId: cl.id, present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0,
      total: activeCount.get(cl.id) ?? 0,
    });
  }
  for (const r of attRes.results ?? []) {
    const d = tally.get(r.classId);
    if (d && r.status in d) { (d as any)[r.status] += r.n; d.marked += r.n; }
  }

  const followUp = [...followMiss.entries()]
    .map(([studentId, v]) => ({ studentId, classId: v.classId, missing: v.missing }))
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 8);

  const payload: DashboardPayload = {
    date, termId,
    openAssignments, gradingAssignments,
    awaitingCount, missingCount,
    attendanceToday: [...tally.values()],
    followUp,
    serverTime: Date.now(),
  };
  return c.json(payload);
});

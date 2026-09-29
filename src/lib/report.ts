import type { Student, Assignment } from "@shared/types";
import {
  workState, isSubmitted, assignmentProgress, studentSummary,
  attendanceRate, type AttendanceCounts,
} from "@shared/metrics";

export interface ReportPayload {
  classId: string;
  range: { from: string | null; to: string | null; month: string | null; termId: string | null; termDatesMissing?: boolean; att?: "daily" | "subject" };
  students: Student[];
  assignments: Assignment[];
  submissions: { assignment_id: string; student_id: string; status: string; score: number | null; late: boolean }[];
  // daily mode: one row per day · subject mode: one row per day + period
  attendanceSessions: { id: string; date: string; subject_id?: string | null; period?: number | null }[];
  attendance: { session_id: string; student_id: string; status: string }[];
}

export interface StudentReport {
  student: Student;
  submitted: number;
  applicable: number;
  missing: number;
  percent: number;
  score: number;
  fullScore: number;
  attendance: AttendanceCounts & { daysMarked: number };
}
export interface AssignmentReport {
  assignment: Assignment;
  submitted: number;
  total: number;
  rate: number;
  average: number;
  scoredCount: number;
}
export interface ReportModel {
  students: StudentReport[];
  assignments: AssignmentReport[];
  followUp: { student: Student; missing: string[] }[];
  // attendanceRate is null when nothing was checked in this range ("no data" is not 0%)
  metrics: { submitRate: number; missingCount: number; avgScorePercent: number; attendanceRate: number | null };
  // what one attendance "mark" means here: a school day (daily) or a period (per subject)
  attendance: { unit: "day" | "period"; sessions: number; marks: number };
  today: string;
}

function todayBkk(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function computeReport(p: ReportPayload): ReportModel {
  const today = todayBkk();
  const subKey = (aid: string, sid: string) => `${aid}:${sid}`;
  const subMap = new Map(p.submissions.map((s) => [subKey(s.assignment_id, s.student_id), s]));

  // attendance tally per student
  const attByStudent = new Map<string, AttendanceCounts>();
  for (const a of p.attendance) {
    const rec = attByStudent.get(a.student_id) ?? { present: 0, late: 0, leave: 0, sick: 0, absent: 0 };
    if (a.status in rec) (rec as any)[a.status]++;
    attByStudent.set(a.student_id, rec);
  }

  const students: StudentReport[] = p.students.map((student) => {
    const sum = studentSummary(
      p.assignments,
      (i) => subMap.get(subKey(p.assignments[i].id, student.id)),
      today,
    );
    const rec: AttendanceCounts = attByStudent.get(student.id) ?? { present: 0, late: 0, leave: 0, sick: 0, absent: 0 };
    const daysMarked = rec.present + rec.late + rec.leave + rec.sick + rec.absent;
    return {
      student,
      submitted: sum.submitted,
      applicable: sum.submitted + sum.missing,
      missing: sum.missing,
      percent: sum.submitRate,
      score: sum.score,
      fullScore: sum.fullScore,
      attendance: { ...rec, daysMarked },
    };
  });

  const assignments: AssignmentReport[] = p.assignments.map((assignment) => {
    const prog = assignmentProgress(
      assignment,
      p.students,
      new Map(p.students.map((s) => [s.id, subMap.get(subKey(assignment.id, s.id))]).filter((e): e is [string, any] => !!e[1])),
      today,
    );
    return {
      assignment,
      submitted: prog.submitted,
      total: prog.total,
      rate: prog.rate,
      average: prog.average,
      scoredCount: prog.scored,
    };
  });

  const followUp = students
    .filter((s) => s.missing > 0)
    .map((s) => ({
      student: s.student,
      missing: p.assignments
        .filter((a) => workState(subMap.get(subKey(a.id, s.student.id)), a, today) === "missing")
        .map((a) => a.title),
    }))
    .sort((a, b) => b.missing.length - a.missing.length);

  const totApplicable = students.reduce((n, s) => n + s.applicable, 0);
  const totSubmitted = students.reduce((n, s) => n + s.submitted, 0);
  const totScore = students.reduce((n, s) => n + s.score, 0);
  const totFull = students.reduce((n, s) => n + s.fullScore, 0);
  const totCounts = students.reduce<AttendanceCounts>(
    (acc, s) => ({
      present: acc.present + s.attendance.present,
      late: acc.late + s.attendance.late,
      leave: acc.leave + s.attendance.leave,
      sick: acc.sick + s.attendance.sick,
      absent: acc.absent + s.attendance.absent,
    }),
    { present: 0, late: 0, leave: 0, sick: 0, absent: 0 },
  );

  const marks = totCounts.present + totCounts.late + totCounts.leave + totCounts.sick + totCounts.absent;
  return {
    students, assignments, followUp,
    metrics: {
      submitRate: totApplicable ? Math.round((totSubmitted / totApplicable) * 100) : 0,
      missingCount: students.reduce((n, s) => n + s.missing, 0),
      avgScorePercent: totFull ? Math.round((totScore / totFull) * 100) : 0,
      attendanceRate: marks > 0 ? attendanceRate(totCounts) : null,
    },
    attendance: {
      unit: p.range?.att === "subject" ? "period" : "day",
      sessions: p.attendanceSessions.length,
      marks,
    },
    today,
  };
}

// re-export for pages that render per-work-state cells (gradebook, scan, students)
export { workState, isSubmitted };

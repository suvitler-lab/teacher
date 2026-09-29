// Single source of truth for the numbers every page shows. Pure + unit-tested.
// The dashboard SQL and report client both compute against these definitions so
// two screens never disagree. Names differ from CellState in shared/grade.ts on
// purpose — this classifies a whole (student × assignment), not one input cell.

export type WorkState =
  | "scored"    // submitted, has a score, on time
  | "late"      // submitted, has a score, after the due date
  | "awaiting"  // submitted, no score yet
  | "missing"   // not submitted (or void) and past due
  | "pending"   // not submitted, not due yet (or no due date)
  | "excused";  // marked excused — never counted

export interface SubLike {
  status: string;          // submitted | excused | void
  score: number | null;
  late?: boolean | number; // boolean (client) or 0/1 (raw D1 row)
}
export interface AsgLike {
  full_score: number;
  due_date: string | null; // YYYY-MM-DD (Asia/Bangkok)
}

const isLate = (s: SubLike) => s.late === true || s.late === 1;

/** Classify one student's state on one assignment. `today` is YYYY-MM-DD. */
export function workState(sub: SubLike | undefined | null, asg: AsgLike, today: string): WorkState {
  if (sub && sub.status === "excused") return "excused";
  const voidLike = !sub || sub.status === "void";
  if (!voidLike && sub!.status === "submitted") {
    if (sub!.score != null) return isLate(sub!) ? "late" : "scored";
    return "awaiting";
  }
  if (asg.due_date && today > asg.due_date) return "missing";
  return "pending";
}

/** A state counts toward "submitted" (turned the work in, scored or not). */
export function isSubmitted(st: WorkState): boolean {
  return st === "scored" || st === "late" || st === "awaiting";
}

// ---- per-assignment progress (one assignment, one class) -----------------

export interface AssignmentProgress {
  total: number;     // active students in the class
  submitted: number; // scored + late + awaiting
  scored: number;    // has a score (incl. late)
  awaiting: number;
  late: number;
  missing: number;
  pending: number;
  excused: number;
  rate: number;      // submitted ÷ (total − excused), rounded %
  average: number;   // mean of (score ÷ full × 100) over scored, rounded
}

export function assignmentProgress<S extends { id: string }>(
  asg: AsgLike,
  students: S[],
  subByStudent: Map<string, SubLike>,
  today: string,
): AssignmentProgress {
  let submitted = 0, scored = 0, awaiting = 0, late = 0, missing = 0, pending = 0, excused = 0;
  let scoreSum = 0;
  for (const st of students) {
    const state = workState(subByStudent.get(st.id), asg, today);
    switch (state) {
      case "scored": scored++; submitted++; break;
      case "late": scored++; late++; submitted++; break;
      case "awaiting": awaiting++; submitted++; break;
      case "missing": missing++; break;
      case "pending": pending++; break;
      case "excused": excused++; break;
    }
    if (state === "scored" || state === "late") {
      const sc = subByStudent.get(st.id)!.score ?? 0;
      scoreSum += asg.full_score > 0 ? (sc / asg.full_score) * 100 : 0;
    }
  }
  const denom = students.length - excused;
  return {
    total: students.length,
    submitted, scored, awaiting, late, missing, pending, excused,
    rate: denom > 0 ? Math.round((submitted / denom) * 100) : 0,
    average: scored > 0 ? Math.round(scoreSum / scored) : 0,
  };
}

// ---- per-student rollup (one student, many assignments) ------------------

export interface StudentSummary {
  submitted: number;  // scored + late + awaiting
  awaiting: number;
  missing: number;
  excused: number;
  pending: number;
  submitRate: number; // submitted ÷ (submitted + missing), rounded %
  score: number;      // Σ score over scored + late
  fullScore: number;  // Σ full over scored + late + missing(as 0)
  scorePercent: number; // score ÷ fullScore, rounded %
}

export function studentSummary(
  assignments: AsgLike[],
  subForAssignment: (i: number) => SubLike | undefined,
  today: string,
): StudentSummary {
  let submitted = 0, awaiting = 0, missing = 0, excused = 0, pending = 0;
  let score = 0, fullScore = 0;
  assignments.forEach((asg, i) => {
    const sub = subForAssignment(i);
    const state = workState(sub, asg, today);
    switch (state) {
      case "scored":
      case "late":
        submitted++;
        score += sub!.score ?? 0;
        fullScore += asg.full_score;
        break;
      case "awaiting": submitted++; break;
      case "missing": missing++; fullScore += asg.full_score; break; // counts as 0
      case "pending": pending++; break;
      case "excused": excused++; break;
    }
  });
  const applic = submitted + missing;
  return {
    submitted, awaiting, missing, excused, pending,
    submitRate: applic > 0 ? Math.round((submitted / applic) * 100) : 0,
    score, fullScore,
    scorePercent: fullScore > 0 ? Math.round((score / fullScore) * 100) : 0,
  };
}

// ---- attendance ----------------------------------------------------------

export interface AttendanceCounts {
  present: number; late: number; leave: number; sick: number; absent: number;
}

/** Present rate = (present + late) ÷ marked days, rounded %. */
export function attendanceRate(c: AttendanceCounts): number {
  const marked = c.present + c.late + c.leave + c.sick + c.absent;
  return marked > 0 ? Math.round(((c.present + c.late) / marked) * 100) : 0;
}

/**
 * How far along a class's roll-call is: nobody marked yet, some marked, or everyone.
 * One marked student out of 32 is "partial", never "done".
 */
export type AttendanceProgress = "none" | "partial" | "complete";
export function attendanceProgress(marked: number, total: number): AttendanceProgress {
  if (marked <= 0) return "none";
  return marked >= total ? "complete" : "partial";
}

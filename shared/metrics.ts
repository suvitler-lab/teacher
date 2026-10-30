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

// ---- the one rounding point ----------------------------------------------

/** Every percent on screen is rounded here and nowhere else: Math.round to a whole percent (BR-05). */
export function roundPercent(x: number): number {
  return Math.round(x);
}

/**
 * part ÷ whole as a whole-number percent; null when there is nothing to divide by ("no data", not 0%).
 * Multiply first, then divide: (23 / 40) * 100 is 57.49999… in floating point and would round to 57,
 * (23 * 100) / 40 is exactly 57.5 and rounds to 58 (AC-10).
 */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? roundPercent((part * 100) / whole) : null;
}

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
  average: number;   // Σscore ÷ (scored × full) over scored work, rounded %
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
      scoreSum += sc; // raw points; divided once below (R-05)
    }
  }
  const denom = students.length - excused;
  return {
    total: students.length,
    submitted, scored, awaiting, late, missing, pending, excused,
    rate: percentOf(submitted, denom) ?? 0,
    average: percentOf(scoreSum, scored * asg.full_score) ?? 0, // Σscore ÷ (scored × full)
  };
}

/** Per-assignment submit rate from counts: submitted ÷ (class − excused), rounded %; 0 if nobody counts. */
export function assignmentRate(c: { submitted: number; total: number; excused: number }): number {
  return percentOf(c.submitted, c.total - c.excused) ?? 0;
}

/**
 * The fraction shown next to assignmentRate, over the same denominator: "6/8 · ยกเว้น 2".
 * Without excused children it is the old "6/10".
 */
export function assignmentFraction(c: { submitted: number; total: number; excused: number }): string {
  return `${c.submitted}/${c.total - c.excused}` + (c.excused > 0 ? ` · ยกเว้น ${c.excused}` : "");
}

export interface WorkStateCounts extends Record<WorkState, number> {
  total: number;     // every seat
  submitted: number; // scored + late + awaiting
  counted: number;   // total − excused (the rate's denominator)
}

/** Count seats by work state — what the scan legend and a column's progress bar show. */
export function countWorkStates(states: WorkState[]): WorkStateCounts {
  const c: WorkStateCounts = { scored: 0, late: 0, awaiting: 0, missing: 0, pending: 0, excused: 0, total: 0, submitted: 0, counted: 0 };
  for (const st of states) {
    c[st]++;
    c.total++;
    if (isSubmitted(st)) c.submitted++;
  }
  c.counted = c.total - c.excused;
  return c;
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
      case "awaiting": submitted++; awaiting++; break;
      case "missing": missing++; fullScore += asg.full_score; break; // counts as 0
      case "pending": pending++; break;
      case "excused": excused++; break;
    }
  });
  const applic = submitted + missing;
  return {
    submitted, awaiting, missing, excused, pending,
    submitRate: percentOf(submitted, applic) ?? 0,
    score, fullScore,
    scorePercent: scorePercent(score, fullScore) ?? 0,
  };
}

/** Σscore ÷ Σfull as a rounded %; null when there is no full score to compare with. */
export function scorePercent(score: number, fullScore: number): number | null {
  return percentOf(score, fullScore);
}

/** Whole-class submit rate: pooled Σsubmitted ÷ Σ(submitted + missing) over every child (not a mean of %). */
export function classSubmitRate(rows: { submitted: number; missing: number }[]): number {
  let submitted = 0, applicable = 0;
  for (const r of rows) { submitted += r.submitted; applicable += r.submitted + r.missing; }
  return percentOf(submitted, applicable) ?? 0;
}

// ---- attendance ----------------------------------------------------------

export interface AttendanceCounts {
  present: number; late: number; leave: number; sick: number; absent: number;
}

const markedOf = (c: AttendanceCounts) => c.present + c.late + c.leave + c.sick + c.absent;

/** Present rate = (present + late) ÷ marked days, rounded %. 0 when nothing was checked. */
export function attendanceRate(c: AttendanceCounts): number {
  return attendancePercent(c) ?? 0;
}

/** Same as attendanceRate, but null when nothing was checked — the screen shows "—", never 0%. */
export function attendancePercent(c: AttendanceCounts): number | null {
  return percentOf(c.present + c.late, markedOf(c));
}

/**
 * The Students page's "average attendance" (D24): every child's days pooled, then divided —
 * Σ(present + late) ÷ Σmarked, the same rule as attendancePercent. null ("—") when nobody was checked.
 */
export function averageAttendancePercent(list: AttendanceCounts[]): number | null {
  const total: AttendanceCounts = { present: 0, late: 0, leave: 0, sick: 0, absent: 0 };
  for (const c of list) {
    total.present += c.present; total.late += c.late; total.leave += c.leave; total.sick += c.sick; total.absent += c.absent;
  }
  return attendancePercent(total);
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

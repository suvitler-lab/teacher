// Shared data for the M1-05 "same number on every screen" tests (brief AC-01..AC-04).
import type { Assignment, Student } from "@shared/types";

export const PAST_DUE = "2026-01-01";   // long past whichever day the suite runs
export const FUTURE_DUE = "2099-12-31"; // never due during the suite

export const asg = (id: string, due: string | null, title = id): Assignment => ({
  id, title, term_id: "t1", subject_id: "math", type_id: null, unit: null, full_score: 10,
  assigned_date: "2025-12-01", due_date: due, note: null, publish_scores: true, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});

export const kid = (i: number): Student => ({
  id: "s" + i, code: String(100 + i), qr_token: "Q-" + String(i).padStart(10, "A"), prefix: null,
  first_name: "เด็ก" + i, last_name: "ทดสอบ", nickname: null, class_id: "c1", number: i + 1,
  status: "active", left_at: null, updated_at: 0,
});

/** AC-01: 10 children, past due: 4 scored on time, 1 late with score, 1 no score, 2 excused, 2 nothing. */
export const AC01_KIDS = Array.from({ length: 10 }, (_, i) => kid(i));
export const AC01_SUBS = (assignmentId: string) => [
  ...[0, 1, 2, 3].map((i) => ({ assignment_id: assignmentId, student_id: "s" + i, status: "submitted", score: 8 as number | null, late: false, updated_at: 1 })),
  { assignment_id: assignmentId, student_id: "s4", status: "submitted", score: 6, late: true, updated_at: 1 },
  { assignment_id: assignmentId, student_id: "s5", status: "submitted", score: null, late: false, updated_at: 1 },
  { assignment_id: assignmentId, student_id: "s6", status: "excused", score: null, late: false, updated_at: 1 },
  { assignment_id: assignmentId, student_id: "s7", status: "excused", score: null, late: false, updated_at: 1 },
];

/** AC-03: one child, 4 pieces of work: 2 handed in, 1 overdue, 1 not due yet. */
export const AC03_ASGS = [asg("w1", PAST_DUE), asg("w2", PAST_DUE), asg("w3", PAST_DUE), asg("w4", FUTURE_DUE)];
export const AC03_SUBS = [
  { assignment_id: "w1", student_id: "s0", status: "submitted", score: 8, late: false },
  { assignment_id: "w2", student_id: "s0", status: "submitted", score: null, late: false },
];

/** AC-04: present 3, late 1, leave 1, sick 0, absent 1 over six checked days. */
export const AC04_ATT = ["present", "present", "present", "late", "leave", "absent"];

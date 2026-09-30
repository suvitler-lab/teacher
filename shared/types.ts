// Shared types between worker and client.

export const SCHEMA_VERSION = 6;

export type ID = string;

export type ScanMode = "full" | "type" | "later";
export type SubmissionStatus = "submitted" | "excused" | "void";
export type AttendanceStatus = "present" | "late" | "leave" | "sick" | "absent";
export type ScanMethod = "camera" | "hid" | "manual" | "grid" | "bulk" | "import" | "restore";
// finished = the academic year ended while they were still in the class (they are not taught by this teacher any more)
export type StudentStatus = "active" | "moved" | "inactive" | "finished";

export interface Settings {
  school_name: string;
  teacher_name: string;
  app_title: string;
  late_after: string; // "HH:MM"
  theme: "system" | "light" | "dark";
  accent: string;
  sound_enabled: boolean;
  accept_student_code_scan: boolean;
  parent_portal_enabled: boolean;
  onboarding_done: boolean; // the first-run welcome guide was finished or skipped
  last_backup_at: string;
  period_times: string; // JSON: {"1":"08:30",...}
}

export interface Term {
  id: ID;
  year: number;
  term: number;
  name: string;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  updated_at: number;
}

export interface Class {
  id: ID;
  name: string;
  grade: string | null;
  sort: number;
  archived: boolean;
  year: number | null; // academic year (พ.ศ.) the class belongs to; null = legacy (any year)
  updated_at: number;
}

export interface Subject {
  id: ID;
  code: string | null;
  name: string;
  color: string;
  sort: number;
  archived: boolean;
  updated_at: number;
}

export interface WorkType {
  id: ID;
  name: string;
  icon: string;
  color: string;
  is_exam: boolean;
  default_full: number;
  sort: number;
  archived: boolean;
  updated_at: number;
}

export interface Student {
  id: ID;
  code: string;
  qr_token: string;
  prefix: string | null;
  first_name: string;
  last_name: string;
  nickname: string | null;
  class_id: ID | null;
  number: number | null;
  status: StudentStatus;
  left_at: string | null; // YYYY-MM-DD the student stopped being in the class (moved / inactive)
  updated_at: number;
  // pin intentionally omitted from client-facing payloads
}

export interface Assignment {
  id: ID;
  term_id: ID | null;
  subject_id: ID | null;
  type_id: ID | null;
  title: string;
  unit: string | null;
  full_score: number;
  assigned_date: string | null;
  due_date: string | null;
  note: string | null;
  publish_scores: boolean;
  status: "open" | "closed";
  class_ids: ID[];
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface Submission {
  assignment_id: ID;
  student_id: ID;
  status: SubmissionStatus;
  score: number | null;
  late: boolean;
  submitted_at: number | null;
  method: ScanMethod | null;
  device_id: string | null;
  scan_session_id: string | null;
  updated_at: number;
}

export interface AttendanceSession {
  id: ID;
  date: string;
  class_id: ID;
  subject_id: ID | null;
  period: number | null;
  updated_at: number;
}

export interface AttendanceRow {
  session_id: ID;
  student_id: ID;
  status: AttendanceStatus;
  time: number | null;
  method: ScanMethod | null;
  device_id: string | null;
  updated_at: number;
}

// ---- scan resolution -----------------------------------------------------

export type ScanResolveKind =
  | "student"        // matched active qr_token or (allowed) student code
  | "revoked"        // matched a revoked token
  | "number"         // 1-2 digit class number, exactly one student has it
  | "ambiguous"      // 1-2 digit class number that MORE THAN ONE student has — never guessed
  | "not_found";

export interface ScanResolution {
  kind: ScanResolveKind;
  studentId?: ID;
  candidateIds?: ID[]; // for "ambiguous": who could it be
  raw: string;
}

// ---- submission batch ----------------------------------------------------

export interface SubmissionOp {
  opId: string;              // client ULID; idempotency key
  scanSessionId: string;
  assignmentId: ID;
  studentId: ID;
  status: SubmissionStatus;
  score: number | null;
  fullScoreAtScan: number;
  method: ScanMethod;
  // when the teacher did it, on the SERVER's clock (client time + known skew). This decides who wins
  // between two writes to the same cell — not the order in which requests happen to arrive.
  clientTs: number;
  // "receive" = accepting a hand-in (refused once the work is closed) · "grade" = the teacher
  // scoring/clearing in the gradebook (always allowed). Older clients omit it: derived from method.
  intent?: "receive" | "grade";
  // the data epoch the op was made in; a restore bumps it and held-over ops are not applied
  dataEpoch?: number;
}

export type SubmissionOpResult =
  | { opId: string; result: "ok"; submission: Submission }
  | { opId: string; result: "duplicate"; submission: Submission }
  | { opId: string; result: "not_in_class" }
  | { opId: string; result: "full_score_changed"; currentFullScore: number }
  | { opId: string; result: "assignment_closed" }
  | { opId: string; result: "superseded"; submission?: Submission } // the cell already holds something the teacher did LATER
  | { opId: string; result: "epoch_changed" }                        // made before the data was restored
  | { opId: string; result: "invalid"; reason: string };

export interface Bootstrap {
  settings: Settings;
  terms: Term[];
  currentTermId: ID | null;
  classes: Class[];
  subjects: Subject[];
  workTypes: WorkType[];
  students: Student[];
  revokedTokens: Record<string, ID>; // token -> student_id
  qrRotatedAt: Record<ID, number>;   // student_id -> most recent QR revoke time (ms), last 60 days
  assignments: Assignment[];
  dataEpoch: number;                 // bumped by every restore
  serverTime: number;
}

// ---- dashboard (home page) -----------------------------------------------

export interface ClassProgress {
  classId: ID;
  total: number;
  submitted: number;
  scored: number;
  awaiting: number;
  late: number;
  missing: number;
  excused: number;
}

export interface AssignmentDashboard {
  assignment: Assignment;
  perClass: ClassProgress[];
}

export interface AttendanceDay {
  date: string;      // YYYY-MM-DD
  classId: ID;
  present: number;
  late: number;
  leave: number;
  sick: number;
  absent: number;
  marked: number;    // total students with a row that day
  total: number;     // active students in the class
}

export interface DashboardPayload {
  date: string;
  termId: ID | null;
  openAssignments: AssignmentDashboard[];    // still collecting
  gradingAssignments: AssignmentDashboard[]; // closed, but some work is still waiting to be graded
  awaitingCount: number;   // submitted with no score: open AND closed work (it all needs grading)
  missingCount: number;    // overdue unsubmitted: open work only (closed = no longer being chased)
  attendanceToday: AttendanceDay[];
  followUp: { studentId: ID; classId: ID; missing: number }[];
  serverTime: number;
}

export interface DeviceInfo {
  id: ID;
  name: string;
  user_agent: string | null;
  revoked: number;
  first_seen: number;
  last_seen: number;
  current: boolean;
}

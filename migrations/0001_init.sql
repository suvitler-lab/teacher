-- งานครบ · schema v1
-- All IDs are TEXT (ULID) unless noted. Times are epoch ms (INTEGER, UTC).
-- Dates are TEXT 'YYYY-MM-DD' in Asia/Bangkok. Booleans are INTEGER 0/1.
-- Every mutable row carries updated_at (ms) for last-write-wins upserts.

PRAGMA foreign_keys = ON;

------------------------------------------------------------------- system
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

------------------------------------------------------------------- auth / devices
CREATE TABLE teacher (
  id            TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  iterations    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE devices (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  user_agent TEXT,
  revoked    INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  device_id  TEXT REFERENCES devices(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE login_attempts (
  key TEXT NOT NULL,          -- ip or device key
  at  INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts ON login_attempts(key, at);

------------------------------------------------------------------- academic structure
CREATE TABLE terms (
  id         TEXT PRIMARY KEY,
  year       INTEGER NOT NULL,   -- Thai B.E.
  term       INTEGER NOT NULL,   -- 1 or 2
  name       TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE classes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,      -- e.g. "ป.6/1"
  grade      TEXT,               -- e.g. "ป.6"
  sort       INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_classes_sort ON classes(archived, sort);

CREATE TABLE subjects (
  id         TEXT PRIMARY KEY,
  code       TEXT,               -- e.g. "ว16101"
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'blue',
  sort       INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_subjects_sort ON subjects(archived, sort);

CREATE TABLE work_types (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  icon         TEXT NOT NULL DEFAULT 'file-text',
  color        TEXT NOT NULL DEFAULT 'violet',
  is_exam      INTEGER NOT NULL DEFAULT 0,
  default_full INTEGER NOT NULL DEFAULT 10,
  sort         INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_work_types_sort ON work_types(archived, sort);

------------------------------------------------------------------- students / QR
CREATE TABLE students (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,        -- school student code, e.g. "10502"
  qr_token   TEXT NOT NULL UNIQUE,        -- "Q-XXXXXXXXXX" (uppercase Crockford)
  prefix     TEXT,                        -- ด.ช. / ด.ญ. / เด็กชาย ...
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  nickname   TEXT,
  class_id   TEXT REFERENCES classes(id),
  number     INTEGER,                     -- number within class
  pin        TEXT,                        -- 4-digit parent PIN (phase 2)
  status     TEXT NOT NULL DEFAULT 'active', -- active | moved | inactive
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_students_class ON students(class_id, number);
CREATE INDEX idx_students_status ON students(status);

CREATE TABLE revoked_qr_tokens (
  token      TEXT PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  revoked_at INTEGER NOT NULL
);
CREATE INDEX idx_revoked_student ON revoked_qr_tokens(student_id);

------------------------------------------------------------------- assignments
CREATE TABLE assignments (
  id            TEXT PRIMARY KEY,
  term_id       TEXT REFERENCES terms(id),
  subject_id    TEXT REFERENCES subjects(id),
  type_id       TEXT REFERENCES work_types(id),
  title         TEXT NOT NULL,
  unit          TEXT,
  full_score    INTEGER NOT NULL DEFAULT 10,
  assigned_date TEXT,                      -- YYYY-MM-DD
  due_date      TEXT,                      -- YYYY-MM-DD
  note          TEXT,
  publish_scores INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'open', -- open | closed
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX idx_assignments_subject ON assignments(subject_id, updated_at);
CREATE INDEX idx_assignments_term ON assignments(term_id, deleted_at);

CREATE TABLE assignment_classes (
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  class_id      TEXT NOT NULL REFERENCES classes(id),
  PRIMARY KEY (assignment_id, class_id)
);
CREATE INDEX idx_assignment_classes_class ON assignment_classes(class_id);

------------------------------------------------------------------- scan sessions
CREATE TABLE scan_sessions (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT REFERENCES assignments(id),
  class_id      TEXT REFERENCES classes(id),
  subject_id    TEXT REFERENCES subjects(id),
  mode          TEXT NOT NULL DEFAULT 'full', -- full | type | later
  full_score    INTEGER NOT NULL,
  device_id     TEXT REFERENCES devices(id),
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  scan_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_scan_sessions_assignment ON scan_sessions(assignment_id, started_at);

------------------------------------------------------------------- submissions
CREATE TABLE submissions (
  assignment_id   TEXT NOT NULL REFERENCES assignments(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  status          TEXT NOT NULL DEFAULT 'submitted', -- submitted | excused | void
  score           INTEGER,                            -- NULL = awaiting score
  late            INTEGER NOT NULL DEFAULT 0,
  submitted_at    INTEGER,
  method          TEXT,                               -- camera | hid | manual | grid | bulk | import
  device_id       TEXT,
  scan_session_id TEXT,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, student_id)
);
CREATE INDEX idx_submissions_student ON submissions(student_id);
CREATE INDEX idx_submissions_updated ON submissions(assignment_id, updated_at);

------------------------------------------------------------------- attendance
CREATE TABLE attendance_sessions (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,               -- YYYY-MM-DD
  class_id   TEXT NOT NULL REFERENCES classes(id),
  subject_id TEXT REFERENCES subjects(id),-- NULL = homeroom / daily
  period     INTEGER,                     -- NULL = daily
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_attendance_sessions_uniq
  ON attendance_sessions(date, class_id, IFNULL(subject_id, ''), IFNULL(period, 0));

CREATE TABLE attendance (
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  status     TEXT NOT NULL DEFAULT 'present', -- present | late | leave | sick | absent
  time       INTEGER,
  method     TEXT,
  device_id  TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX idx_attendance_student ON attendance(student_id);

------------------------------------------------------------------- audit log
CREATE TABLE audit_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id           TEXT UNIQUE,            -- client ULID; idempotency key
  at              INTEGER NOT NULL,       -- server time (ms)
  client_at       INTEGER,                -- client time (ms)
  device_id       TEXT,
  actor_id        TEXT NOT NULL DEFAULT 'teacher',
  scan_session_id TEXT,
  batch_id        TEXT,
  entity          TEXT NOT NULL,          -- submission | attendance | assignment | student | qr | settings | restore | auth
  entity_id       TEXT,
  assignment_id   TEXT,
  student_id      TEXT,
  action          TEXT NOT NULL,          -- create | update | void | bulk | rotate | restore
  before_json     TEXT,
  after_json      TEXT,
  method          TEXT
);
CREATE INDEX idx_audit_assignment ON audit_logs(assignment_id, student_id, at);
CREATE INDEX idx_audit_student ON audit_logs(student_id, at);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id, at);
CREATE INDEX idx_audit_at ON audit_logs(at);

------------------------------------------------------------------- restore jobs
CREATE TABLE restore_jobs (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'validated', -- validated | running | done | aborted
  manifest_json TEXT,
  progress_json TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

------------------------------------------------------------------- seed meta
INSERT INTO meta (key, value) VALUES ('schema_version', '1');
INSERT INTO meta (key, value) VALUES ('maintenance', '0');

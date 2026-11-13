-- งานครบ · schema v7 — the teacher's weekly timetable (job 2026-11-12-timetable, EP-11 / EP-12).
--
-- timetable_slots : one row per (term, weekday, period) — a slot holds at most one entry (BR-03).
--   kind 'class'    : teaches a class (class_id required, subject_id optional, label NULL).
--   kind 'activity' : a school activity with no class (class_id NULL, subject_id NULL, label 1–40 chars).
--   period 1–8, weekday 1–7 (ISO, 1 = Monday). Rows are replaced as a whole table per term by EP-11,
--   so there is no ON DELETE CASCADE: classes / subjects / terms are never hard-deleted by the app.
-- terms.timetable_rev : version of that term's timetable (optimistic concurrency, D50). 0 = never saved.
--
-- Rollback: there is no down migration (project convention). Restore the backup taken before migrating
-- and redeploy the previous build; see docs/team/database.md § Migrations for the manual SQL.
ALTER TABLE terms ADD COLUMN timetable_rev INTEGER NOT NULL DEFAULT 0;

CREATE TABLE timetable_slots (
  term_id    TEXT    NOT NULL REFERENCES terms(id),
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  period     INTEGER NOT NULL CHECK (period BETWEEN 1 AND 8),
  kind       TEXT    NOT NULL CHECK (kind IN ('class','activity')),
  class_id   TEXT    REFERENCES classes(id),
  subject_id TEXT    REFERENCES subjects(id),
  label      TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (term_id, weekday, period),
  CHECK (
    (kind = 'class' AND class_id IS NOT NULL AND label IS NULL)
    OR
    (kind = 'activity' AND class_id IS NULL AND subject_id IS NULL AND label IS NOT NULL
       AND length(trim(label)) BETWEEN 1 AND 800)
  )
);
CREATE INDEX idx_timetable_slots_class ON timetable_slots(class_id);

UPDATE meta SET value = '7' WHERE key = 'schema_version';

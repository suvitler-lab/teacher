-- งานครบ · schema v3 — restore is now staged, then swapped in ONE transaction.
-- Uploaded backup chunks land here first; live tables are untouched until commit,
-- so a cancelled or failed restore can never leave the data half-replaced.
-- Not part of a backup file.
CREATE TABLE restore_staging (
  job_id    TEXT    NOT NULL,
  tbl       TEXT    NOT NULL,
  seq       INTEGER NOT NULL,   -- chunk number within the table (re-sending a chunk replaces it)
  rows_json TEXT    NOT NULL,   -- JSON array of the chunk's rows
  PRIMARY KEY (job_id, tbl, seq)
);

-- anything the old multi-step restore left behind is void: it can't be resumed
UPDATE restore_jobs SET status = 'aborted' WHERE status IN ('validated', 'running');
UPDATE meta SET value = '0' WHERE key = 'maintenance';

UPDATE meta SET value = '3' WHERE key = 'schema_version';

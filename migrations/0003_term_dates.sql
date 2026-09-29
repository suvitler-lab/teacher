-- งานครบ · schema v2 — add start/end dates to terms (additive only)
ALTER TABLE terms ADD COLUMN start_date TEXT;  -- YYYY-MM-DD
ALTER TABLE terms ADD COLUMN end_date TEXT;    -- YYYY-MM-DD

UPDATE meta SET value = '2' WHERE key = 'schema_version';

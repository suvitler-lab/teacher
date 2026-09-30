-- งานครบ · schema v6 — the teacher signs in with an e-mail address and a password.
--
-- teacher.email : lower-cased login name. NULL on an account made before this change: the first
--   successful sign-in after the upgrade (right password) attaches the e-mail the teacher types.
ALTER TABLE teacher ADD COLUMN email TEXT;

UPDATE meta SET value = '6' WHERE key = 'schema_version';

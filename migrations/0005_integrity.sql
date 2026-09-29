-- งานครบ · schema v4 — data-integrity round.
--
-- submissions.event_at : WHEN THE TEACHER DID IT (server-comparable clock), not when the request
--   arrived. Last-write-wins is decided on this, so a score that sat in an offline queue can never
--   overwrite something the teacher did later — e.g. a "clear the whole class" made from another
--   screen while it was waiting.
-- meta.data_epoch      : bumped by every restore. Queued scores / attendance drafts remember the
--   epoch they were made in; after a restore they are held for review instead of being poured
--   into the freshly restored data.
ALTER TABLE submissions ADD COLUMN event_at INTEGER;
UPDATE submissions SET event_at = updated_at WHERE event_at IS NULL;

INSERT OR IGNORE INTO meta (key, value) VALUES ('data_epoch', '1');

UPDATE meta SET value = '4' WHERE key = 'schema_version';

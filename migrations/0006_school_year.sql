-- งานครบ · schema v5 — classes belong to one ACADEMIC YEAR.
--
-- Class names repeat every year (ป.6/1 again next June, with a new cohort). If "ป.6/1" were one
-- permanent row, importing the new cohort would push last year's children out of last year's
-- reports and put strangers in. So a class carries its year: the new year gets NEW classes with the
-- same names, the old ones are archived with their children and all their work — the two years can
-- never mix, by construction.
--
-- classes.year   : academic year (พ.ศ.) the class belongs to. NULL (legacy) = whatever year is current.
-- students.left_at : date (YYYY-MM-DD) a student stopped being in the class (moved / inactive), set by the
--   server. A child who left in term 2 still belongs in term 1's report, but not in term 2's.
ALTER TABLE classes ADD COLUMN year INTEGER;
ALTER TABLE students ADD COLUMN left_at TEXT;

UPDATE classes SET year = (SELECT year FROM terms WHERE is_current = 1 LIMIT 1) WHERE year IS NULL;

UPDATE meta SET value = '5' WHERE key = 'schema_version';

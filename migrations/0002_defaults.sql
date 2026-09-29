-- งานครบ · default settings + work types (schema v1)
-- Safe to run once after 0001. Uses fixed ids so re-runs are idempotent via INSERT OR IGNORE.

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('school_name', 'โรงเรียนบ้านตัวอย่าง'),
  ('teacher_name', 'ครูผู้สอน'),
  ('app_title', 'งานครบ'),
  ('late_after', '08:30'),           -- scans after this local time count as late
  ('theme', 'system'),               -- system | light | dark
  ('accent', 'blue'),
  ('sound_enabled', '1'),
  ('accept_student_code_scan', '0'), -- allow scanning legacy student-code barcodes
  ('parent_portal_enabled', '0'),    -- phase 2 toggle, default off
  ('last_backup_at', '');

-- 8 default work types (colors match approved mockup chips)
INSERT OR IGNORE INTO work_types (id, name, icon, color, is_exam, default_full, sort, updated_at) VALUES
  ('wt_exercise',  'แบบฝึกหัด',        'pencil',      'aqua',    0, 10, 10, 0),
  ('wt_worksheet', 'ใบงาน',            'file-text',   'violet',  0, 10, 20, 0),
  ('wt_activity',  'ใบกิจกรรม',        'flask',       'orange',  0, 10, 30, 0),
  ('wt_project',   'ชิ้นงาน/โครงงาน',  'palette',     'green',   0, 20, 40, 0),
  ('wt_homework',  'การบ้าน',          'backpack',    'blue',    0, 10, 50, 0),
  ('wt_quiz',      'สอบย่อย',          'certificate', 'magenta', 1, 20, 60, 0),
  ('wt_midterm',   'สอบกลางภาค',       'school',      'red',     1, 30, 70, 0),
  ('wt_final',     'สอบปลายภาค',       'trophy',      'red',     1, 40, 80, 0);

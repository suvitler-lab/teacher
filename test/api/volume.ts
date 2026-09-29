import { env } from "cloudflare:test";

export const VOLUME = {
  classes: 5,
  perClass: 40,        // → 200 students
  assignments: 40,     // each given to every class → 200 links
  days: 60,            // school days of attendance for every class
} as const;

/**
 * A school term's worth of data for one teacher, made in SQL so the tests stay fast:
 * 5 classes × 40 students, 40 assignments each scored for every student (8,000 rows), and 60 days of
 * daily attendance for every class (300 sessions, 12,000 marks). Call after login(); it does not use seed().
 * Scores and marks follow fixed formulas so a test can recompute what they must be.
 */
export async function seedVolume() {
  const { classes, perClass, assignments, days } = VOLUME;
  const nums = (name: string, n: number) => `${name}(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM ${name} WHERE i < ${n})`;
  const stmts = [
    `INSERT INTO terms (id, year, term, name, is_current, start_date, updated_at) VALUES ('t1', 2569, 1, '1/2569', 1, '2026-05-15', 1000)`,
    `INSERT INTO subjects (id, code, name, color, sort, archived, updated_at) VALUES ('s1', 'ว16101', 'วิทยาศาสตร์', 'blue', 10, 0, 1000), ('s2', 'ค16101', 'คณิตศาสตร์', 'green', 20, 0, 1000)`,
    `WITH RECURSIVE ${nums("k", classes)}
     INSERT INTO classes (id, name, grade, sort, archived, year, updated_at)
     SELECT 'c' || i, 'ป.6/' || i, 'ป.6', i * 10, 0, 2569, 1000 FROM k`,
    `WITH RECURSIVE ${nums("k", classes)}, ${nums("n", perClass)}
     INSERT INTO students (id, code, qr_token, prefix, first_name, last_name, class_id, number, status, updated_at)
     SELECT 'st' || k.i || '_' || n.i, printf('%d%02d', k.i, n.i), 'Q-V' || printf('%02d%03d', k.i, n.i) || 'ZZZZ',
            CASE WHEN n.i % 2 = 0 THEN 'ด.ญ.' ELSE 'ด.ช.' END, 'ชื่อ' || k.i || '_' || n.i, 'สกุล' || n.i,
            'c' || k.i, n.i, 'active', 1000
     FROM k, n`,
    `WITH RECURSIVE ${nums("a", assignments)}
     INSERT INTO assignments (id, term_id, subject_id, type_id, title, full_score, assigned_date, due_date, publish_scores, status, created_at, updated_at)
     SELECT 'a' || i, 't1', CASE WHEN i % 2 = 0 THEN 's2' ELSE 's1' END, 'wt_worksheet', 'งานที่ ' || i, 10,
            '2026-06-01', '2026-12-31', 1, 'open', 1000, 1000 FROM a`,
    `WITH RECURSIVE ${nums("a", assignments)}, ${nums("k", classes)}
     INSERT INTO assignment_classes (assignment_id, class_id) SELECT 'a' || a.i, 'c' || k.i FROM a, k`,
    // score(a, student) = (a*7 + class*5 + number*3) mod 11 — 0..10, never above the full score of 10
    `WITH RECURSIVE ${nums("a", assignments)}, ${nums("k", classes)}, ${nums("n", perClass)}
     INSERT INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at, event_at)
     SELECT 'a' || a.i, 'st' || k.i || '_' || n.i, 'submitted', (a.i * 7 + k.i * 5 + n.i * 3) % 11, 0,
            1780000000000 + a.i * 1000, 'grid', 2000 + a.i, 2000 + a.i FROM a, k, n`,
    `WITH RECURSIVE ${nums("d", days)}, ${nums("k", classes)}
     INSERT INTO attendance_sessions (id, date, class_id, subject_id, period, updated_at)
     SELECT 'as' || k.i || '_' || d.i, date('2026-05-15', '+' || d.i || ' days'), 'c' || k.i, NULL, NULL, 3000 + d.i FROM d, k`,
    // mark(day, student) = absent every 20th, late every 13th, else present
    `WITH RECURSIVE ${nums("d", days)}, ${nums("k", classes)}, ${nums("n", perClass)}
     INSERT INTO attendance (session_id, student_id, status, time, method, updated_at)
     SELECT 'as' || k.i || '_' || d.i, 'st' || k.i || '_' || n.i,
            CASE WHEN (d.i + n.i) % 20 = 0 THEN 'absent' WHEN (d.i + n.i) % 13 = 0 THEN 'late' ELSE 'present' END,
            1780000000000 + d.i * 86400000, 'grid', 3000 + d.i FROM d, k, n`,
  ];
  for (const sql of stmts) await env.DB.prepare(sql).run();
}

/** What the seeded data must add up to — recomputed independently of the app. */
export function expectedVolume() {
  const { classes, perClass, assignments, days } = VOLUME;
  let scoreSum = 0;
  for (let a = 1; a <= assignments; a++) for (let k = 1; k <= classes; k++) for (let n = 1; n <= perClass; n++) scoreSum += (a * 7 + k * 5 + n * 3) % 11;
  const marks = { absent: 0, late: 0, present: 0 };
  for (let d = 1; d <= days; d++) for (let n = 1; n <= perClass; n++) {
    const m = (d + n) % 20 === 0 ? "absent" : (d + n) % 13 === 0 ? "late" : "present";
    marks[m] += classes; // every class has the same pattern
  }
  return {
    students: classes * perClass, assignments, links: assignments * classes,
    submissions: assignments * classes * perClass, scoreSum,
    sessions: days * classes, attendance: days * classes * perClass, marks,
  };
}

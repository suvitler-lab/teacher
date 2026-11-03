import type { Env } from "../env";

/**
 * BR-04 — the one definition of "late" in SQL, over the `submissions` row being updated: 1 when the row is
 * submitted, has a submit time, its work has a due date, and the Bangkok (UTC+7, no DST) calendar date of
 * submitted_at is after that due date; else 0. The same rule as isLateSubmission() in ./time.ts:
 *   · CAST(... AS INTEGER) truncates a fractional ms the way JS Date does (SQLite's 'unixepoch' would round it)
 *   · NULLIF(due, '') treats an empty due date as "no due date", like isLateSubmission("")
 * The due date is read from the work as it is INSIDE the transaction, so whatever order a due-date edit and a
 * hand-in / undo commit in, the row ends up with the late value of the current due date. `due` is an SQL
 * expression for the due date (NULL = none).
 */
export function lateSql(due: string): string {
  return lateSqlOf("submissions.status", "submissions.submitted_at", due);
}
/** The same rule over any SQL expressions for status and submitted_at (e.g. the `after` of an audit line). */
export function lateSqlOf(status: string, submittedAt: string, due: string): string {
  return `(CASE WHEN ${status} = 'submitted' AND ${submittedAt} IS NOT NULL AND ${due} IS NOT NULL
  AND date(CAST(${submittedAt} AS INTEGER) / 1000 + 7 * 3600, 'unixepoch') > ${due} THEN 1 ELSE 0 END)`;
}
/** The due date of each row's own work (correlated: rows of several works in one statement). */
const DUE_OF_ROW = "NULLIF((SELECT a.due_date FROM assignments a WHERE a.id = submissions.assignment_id), '')";
/** The due date of work ?1 (not correlated: SQLite evaluates it once per statement, not once per row). */
const DUE_OF_WORK = "NULLIF((SELECT a.due_date FROM assignments a WHERE a.id = ?1), '')";

/**
 * Re-decide `late` for every row of one work (after its due date may have changed). Only rows whose value
 * changes are written; updated_at / event_at are left alone (nobody acted on those cells).
 */
export function lateFixForAssignment(env: Env, assignmentId: string): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE submissions SET late = ${lateSql(DUE_OF_WORK)} WHERE assignment_id = ?1 AND late IS NOT ${lateSql(DUE_OF_WORK)}`,
  ).bind(assignmentId);
}

/**
 * Re-decide `late` for the given (assignment, student) cells — the ones a write just touched, appended to the
 * same batch AFTER the write. Point lookups by primary key (the list is the outer loop, as in loadWorld).
 * RETURNING lists the cells whose value it corrected, so a reply can report what is really stored.
 */
export function lateFixForCells(env: Env, cells: { assignment_id: string; student_id: string }[]): D1PreparedStatement {
  const pairs = [...new Map(cells.map((c) => [`${c.assignment_id}\u0000${c.student_id}`, [c.assignment_id, c.student_id]])).values()];
  return env.DB.prepare(
    `UPDATE submissions SET late = ${lateSql(DUE_OF_ROW)}
     WHERE rowid IN (SELECT sub.rowid FROM json_each(?1) j
                     CROSS JOIN submissions sub
                       ON sub.assignment_id = json_extract(j.value, '$[0]') AND sub.student_id = json_extract(j.value, '$[1]'))
       AND late IS NOT ${lateSql(DUE_OF_ROW)}
     RETURNING assignment_id, student_id, late`,
  ).bind(JSON.stringify(pairs));
}

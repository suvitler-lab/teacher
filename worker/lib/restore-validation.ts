import { z } from "zod";
import type { Env } from "../env";

export interface RestoreIssue { table: string; rowId: string; field: string; code: string }
const text = z.string();
const key = text.min(1);
const integer = z.number().int();
const stamp = integer.min(0);
const optionalText = text.nullish();
const optionalKey = key.nullish();
const optionalStamp = stamp.nullish();
const flag = z.union([z.literal(0), z.literal(1)]);
const date = text.regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
});
const optionalDate = date.nullish();
const method = z.enum(["camera", "hid", "manual", "grid", "bulk", "import", "restore"]).nullish();
const dated = { updated_at: stamp };

// Validate stored SQLite row shapes, not public API payloads (booleans are 0/1 here).
// Columns introduced by old migrations remain optional, matching the restore defaults.
const schemas: Record<string, z.ZodType> = {
  settings: z.object({ key, value: text.nullable() }),
  terms: z.object({ id: key, year: integer, term: integer.min(1).max(3), name: key, is_current: flag, start_date: optionalDate, end_date: optionalDate, ...dated }),
  classes: z.object({ id: key, name: key, grade: optionalText, sort: integer, archived: flag, year: integer.nullish(), ...dated }),
  subjects: z.object({ id: key, code: optionalText, name: key, color: text, sort: integer, archived: flag, ...dated }),
  work_types: z.object({ id: key, name: key, icon: text, color: text, is_exam: flag, default_full: integer.min(1).max(100), sort: integer, archived: flag, ...dated }),
  students: z.object({ id: key, code: key, qr_token: key, prefix: optionalText, first_name: key, last_name: text, nickname: optionalText, class_id: optionalKey, number: integer.nullish(), pin: optionalText, status: z.enum(["active", "moved", "inactive", "finished"]), left_at: optionalDate, ...dated }),
  revoked_qr_tokens: z.object({ token: key, student_id: optionalKey, revoked_at: stamp }),
  assignments: z.object({ id: key, term_id: optionalKey, subject_id: optionalKey, type_id: optionalKey, title: key, unit: optionalText, full_score: integer.min(1).max(100), assigned_date: optionalDate, due_date: optionalDate, note: optionalText, publish_scores: flag, status: z.enum(["open", "closed"]), created_at: stamp, deleted_at: optionalStamp, ...dated }),
  assignment_classes: z.object({ assignment_id: key, class_id: key }),
  scan_sessions: z.object({ id: key, assignment_id: optionalKey, class_id: optionalKey, subject_id: optionalKey, mode: z.enum(["full", "type", "later"]), full_score: integer.min(1).max(100), device_id: optionalText, started_at: stamp, ended_at: optionalStamp, scan_count: integer.min(0) }),
  submissions: z.object({ assignment_id: key, student_id: key, status: z.enum(["submitted", "excused", "void"]), score: integer.min(0).nullable(), late: flag, submitted_at: optionalStamp, method, device_id: optionalText, scan_session_id: optionalText, event_at: optionalStamp, ...dated }),
  attendance_sessions: z.object({ id: key, date, class_id: key, subject_id: optionalKey, period: integer.nullish(), ...dated }),
  attendance: z.object({ session_id: key, student_id: key, status: z.enum(["present", "late", "leave", "sick", "absent"]), time: optionalStamp, method, device_id: optionalText, ...dated }),
};

export function restoreRowIssues(table: string, rows: Record<string, unknown>[]): RestoreIssue[] {
  const schema = schemas[table];
  if (!schema) return [{ table, rowId: "", field: "", code: "unknown_table" }];
  const issues: RestoreIssue[] = [];
  for (let i = 0; i < rows.length && issues.length < 50; i++) {
    const row = rows[i];
    const result = schema.safeParse(row);
    const rowId = String(row.id ?? row.key ?? row.student_id ?? i);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ table, rowId, field: issue.path.map(String).join("."), code: issue.code });
        if (issues.length === 50) break;
      }
      continue;
    }
    if (table === "terms" && row.start_date && row.end_date && String(row.end_date) < String(row.start_date)) {
      issues.push({ table, rowId, field: "end_date", code: "inverted_range" });
    }
  }
  return issues;
}

// One SQL query/guard covers the whole staged snapshot and stays within the restore query budget.
// Checking staged rows inside the swap transaction also protects against a replaced chunk after early validation.
const tables = Object.keys(schemas);
const ctes = tables.map((t) => {
  const schema = schemas[t] as z.ZodObject;
  const fields = Object.keys(schema.shape).map((field) => `json_extract(j.value, '$.${field}') AS "${field}"`);
  // Project once so SQLite can index relational keys rather than reparsing JSON for every comparison.
  return `${t} AS MATERIALIZED (SELECT j.value AS row, ${fields.join(",")} FROM restore_staging s, json_each(s.rows_json) j WHERE s.job_id=?1 AND s.tbl='${t}')`;
});
const val = (alias: string, field: string) => `${alias}."${field}"`;
const rules: string[] = [];
function rule(table: string, field: string, code: string, where: string, rowId = "id") {
  if (rowId === "id") rowId = ({ revoked_qr_tokens: "token", assignment_classes: "assignment_id" } as Record<string, string>)[table] ?? rowId;
  rules.push(`SELECT json_object('table','${table}','rowId',CAST(COALESCE(${val("x", rowId)}, '') AS TEXT),'field','${field}','code','${code}') FROM ${table} x WHERE ${where} LIMIT 1`);
}
const refs: Record<string, [string, string, string][]> = {
  students: [["class_id", "classes", "id"]],
  revoked_qr_tokens: [["student_id", "students", "id"]],
  assignments: [["term_id", "terms", "id"], ["subject_id", "subjects", "id"], ["type_id", "work_types", "id"]],
  assignment_classes: [["assignment_id", "assignments", "id"], ["class_id", "classes", "id"]],
  scan_sessions: [["assignment_id", "assignments", "id"], ["class_id", "classes", "id"], ["subject_id", "subjects", "id"]],
  submissions: [["assignment_id", "assignments", "id"], ["student_id", "students", "id"]],
  attendance_sessions: [["class_id", "classes", "id"], ["subject_id", "subjects", "id"]],
  attendance: [["session_id", "attendance_sessions", "id"], ["student_id", "students", "id"]],
};
for (const [table, fields] of Object.entries(refs)) for (const [field, parent, parentKey] of fields) {
  rule(table, field, "missing_reference", `${val("x", field)} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE ${val("p", parentKey)}=${val("x", field)})`, table === "submissions" || table === "attendance" ? "student_id" : "id");
}
rule("submissions", "score", "score_over_full", `EXISTS (SELECT 1 FROM assignments a WHERE ${val("a", "id")}=${val("x", "assignment_id")} AND ${val("x", "score")}>${val("a", "full_score")})`, "student_id");
rule("assignment_classes", "class_id", "wrong_school_year", `EXISTS (
  SELECT 1 FROM assignments a JOIN terms t ON t.id=a.term_id JOIN classes c ON c.id=x.class_id
  WHERE a.id=x.assignment_id AND c.year IS NOT NULL AND c.year!=t.year
)`);
// Legacy assignments with no room links are global, as in submissions.stillValid().
rule("submissions", "student_id", "not_in_assignment_class", `EXISTS (SELECT 1 FROM assignment_classes linked WHERE ${val("linked", "assignment_id")}=${val("x", "assignment_id")}) AND EXISTS (SELECT 1 FROM students p WHERE ${val("p", "id")}=${val("x", "student_id")} AND NOT EXISTS (SELECT 1 FROM assignment_classes ac WHERE ${val("ac", "assignment_id")}=${val("x", "assignment_id")} AND ${val("ac", "class_id")}=${val("p", "class_id")}))`, "student_id");
rule("attendance", "student_id", "not_in_session_class", `EXISTS (SELECT 1 FROM students p, attendance_sessions a WHERE ${val("p", "id")}=${val("x", "student_id")} AND ${val("a", "id")}=${val("x", "session_id")} AND ${val("p", "class_id")} IS NOT ${val("a", "class_id")})`, "student_id");
rule("terms", "term", "duplicate_term", `(SELECT COUNT(*) FROM terms p WHERE ${val("p", "year")}=${val("x", "year")} AND ${val("p", "term")}=${val("x", "term")})>1`);
rule("terms", "is_current", "multiple_current_terms", `${val("x", "is_current")}=1 AND (SELECT COUNT(*) FROM terms p WHERE ${val("p", "is_current")}=1)>1`);
rule("students", "number", "duplicate_active_number", `${val("x", "status")}='active' AND ${val("x", "class_id")} IS NOT NULL AND ${val("x", "number")} IS NOT NULL AND (SELECT COUNT(*) FROM students p WHERE ${val("p", "status")}='active' AND ${val("p", "class_id")}=${val("x", "class_id")} AND ${val("p", "number")}=${val("x", "number")})>1`);
// Row-level checks are repeated in SQL for values that a concurrent chunk replacement could invalidate.
rule("submissions", "score", "invalid_score", `${val("x", "score")} IS NOT NULL AND (json_type(x.row,'$.score') NOT IN ('integer','real') OR ${val("x", "score")}<0 OR ${val("x", "score")}!=CAST(${val("x", "score")} AS INTEGER))`, "student_id");
// D1 has a low compound-SELECT limit. Scalar subqueries avoid a large UNION and
// stop at the first actionable issue instead of generating an unbounded report.
const issueSql = `WITH ${ctes.join(",")}, issue AS (SELECT COALESCE(${rules.map((r) => `(${r})`).join(",")}) AS detail)`;

export const restoreDomainGuard = (env: Env, restoreId: string) => env.DB.prepare(
  `${issueSql} SELECT CASE WHEN detail IS NOT NULL THEN json('invalid_backup') ELSE 1 END FROM issue`,
).bind(restoreId);

export async function stagedRestoreIssues(env: Env, restoreId: string): Promise<RestoreIssue[]> {
  const row = await env.DB.prepare(`${issueSql} SELECT detail FROM issue`).bind(restoreId).first<{ detail: string | null }>();
  return row?.detail ? [JSON.parse(row.detail) as RestoreIssue] : [];
}

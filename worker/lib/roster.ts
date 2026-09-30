// The SQL side of shared/roster.ts — same rule, same results (test/api/school-year.test.ts checks them together).
import type { Env } from "../env";
import { classInYear } from "@shared/roster";

export interface TermInfo {
  id: string;
  year: number;
  end_date: string | null;
}

/** The term row for a term id; null for "no term yet" (unassigned / missing / unknown). */
export async function loadTerm(env: Env, termId: string | null | undefined): Promise<TermInfo | null> {
  if (!termId || termId === "unassigned") return null;
  return (await env.DB.prepare("SELECT id, year, end_date FROM terms WHERE id = ?").bind(termId).first<TermInfo>()) ?? null;
}

/** SQL condition: is student `alias` in the roster for `term`? (see shared/roster.ts inRoster) */
export function memberClause(alias: string, term: TermInfo | null): { sql: string; binds: unknown[] } {
  if (!term) return { sql: `${alias}.status = 'active'`, binds: [] };
  if (!term.end_date) return { sql: `${alias}.status IN ('active','finished')`, binds: [] };
  return {
    sql: `(${alias}.status IN ('active','finished') OR (${alias}.status IN ('moved','inactive') AND ${alias}.left_at IS NOT NULL AND ${alias}.left_at > ?))`,
    binds: [term.end_date],
  };
}

/** Does this class exist in the term's academic year? */
export async function classInTermYear(env: Env, classId: string, term: TermInfo | null): Promise<boolean> {
  if (!term) return true;
  const row = await env.DB.prepare("SELECT year FROM classes WHERE id = ?").bind(classId).first<{ year: number | null }>();
  return classInYear(row?.year, term.year);
}

/** The students of a class for a term (rows as stored), in class-number order. Empty if the class isn't in that year. */
export async function rosterRows(env: Env, classId: string, term: TermInfo | null, columns = "s.*") {
  if (!(await classInTermYear(env, classId, term))) return [] as any[];
  const m = memberClause("s", term);
  const res = await env.DB.prepare(
    `SELECT ${columns} FROM students s WHERE s.class_id = ? AND ${m.sql} ORDER BY s.number IS NULL, s.number`,
  ).bind(classId, ...m.binds).all<any>();
  return res.results ?? [];
}

/** The current term's academic year, if there is one. */
export async function currentYear(env: Env): Promise<number | null> {
  const r = await env.DB.prepare("SELECT year FROM terms WHERE is_current = 1 LIMIT 1").first<{ year: number }>();
  return r?.year ?? null;
}

/** First day of the current academic year (the earliest start date among its terms), if any term has one. */
export async function schoolYearStart(env: Env): Promise<string | null> {
  const r = await env.DB.prepare(
    "SELECT MIN(start_date) AS d FROM terms WHERE year = (SELECT year FROM terms WHERE is_current = 1 LIMIT 1) AND start_date IS NOT NULL",
  ).first<{ d: string | null }>();
  return r?.d ?? null;
}

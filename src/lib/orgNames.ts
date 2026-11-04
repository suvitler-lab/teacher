/**
 * The school name and the teacher's name. The values the app ships with ("โรงเรียนบ้านตัวอย่าง", "ครูผู้สอน") and the
 * words it falls back to ("โรงเรียน") are NOT text a teacher wants to type after — a form field shows them as a
 * placeholder (empty), and the fallback words are put in only when something is shown on a screen.
 */
export const DEFAULT_SCHOOL = "โรงเรียน";
export const DEFAULT_TEACHER = "ครูผู้สอน";
const SAMPLE_SCHOOL = "โรงเรียนบ้านตัวอย่าง";
const NOT_REAL = new Set([DEFAULT_SCHOOL, SAMPLE_SCHOOL, DEFAULT_TEACHER]);

/** What a form field holds for a stored name: "" for a built-in default (the field shows its placeholder instead). */
export function nameField(stored: string | null | undefined): string {
  const v = stored ?? "";
  return NOT_REAL.has(v.trim()) ? "" : v;
}

/** The school name to show on a screen: what was saved, or the fallback word when nothing was. */
export const schoolLabel = (stored: string | null | undefined): string => (stored ?? "").trim() || DEFAULT_SCHOOL;
/** The teacher's name to show on a screen: what was saved, or the fallback word when nothing was. */
export const teacherLabel = (stored: string | null | undefined): string => (stored ?? "").trim() || DEFAULT_TEACHER;

// "Who is in this class during this term?" — ONE rule, used by the client and (as SQL, in
// worker/lib/roster.ts) by the server, so every screen and the exports agree.
//
// A class belongs to one academic year (classes.year; NULL = legacy, matches every year), and its
// children go with it: when a new year starts the old classes are archived with their children and
// the new year gets new classes with the same names. So last year's report is last year's children,
// no matter who joined "ป.6/1" this June.

export interface RosterTerm {
  year: number;               // academic year (พ.ศ.)
  end_date: string | null;    // YYYY-MM-DD
}

export interface RosterStudent {
  status: string;             // active | moved | inactive | finished
  left_at?: string | null;    // YYYY-MM-DD, set when they moved/left
}

/** Does a class exist in this academic year? Legacy classes without a year belong to every year. */
export function classInYear(classYear: number | null | undefined, termYear: number): boolean {
  return classYear == null || classYear === termYear;
}

/**
 * Was this student in their class during the term?
 *  - active / finished (finished = the year ended while they were still there) → yes
 *  - moved / inactive → only if they left AFTER the term ended (so they were there for all of it).
 *    A child who left in term 2 stays in term 1's report and is not in term 2's.
 *  - no term (the "no term yet" bucket) → only children who are in the class today.
 */
export function inRoster(s: RosterStudent, term: RosterTerm | null): boolean {
  if (!term) return s.status === "active";
  if (s.status === "active" || s.status === "finished") return true;
  if (!term.end_date || !s.left_at) return false;
  return s.left_at > term.end_date;
}

/** The students of a class for a term, in class-number order. */
export function rosterOf<S extends RosterStudent & { class_id: string | null; number: number | null }>(
  students: S[],
  classId: string,
  classYear: number | null | undefined,
  term: RosterTerm | null,
): S[] {
  if (term && !classInYear(classYear, term.year)) return [];
  return students
    .filter((s) => s.class_id === classId && inRoster(s, term))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
}

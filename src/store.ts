import { signal, computed } from "@preact/signals";
import type {
  Bootstrap,
  Settings,
  Term,
  Class,
  Subject,
  WorkType,
  Student,
  Assignment,
} from "@shared/types";
import { classInYear, rosterOf } from "@shared/roster";
import { api } from "./lib/api";
import { kvGet, kvSet } from "./lib/idb";
import { serverSkewMs, dataEpoch, epochStale } from "./lib/session";
import { pauseSync } from "./lib/outbox";
import { stopAttSync } from "./lib/attSync";

export const authState = signal<"loading" | "setup" | "login" | "ready">("loading");
/** false only for an account made before e-mail sign-in: its next sign-in attaches the e-mail typed. */
/** The first-run welcome guide is showing (latched, so it stays while its own steps fill in the data it checks). */
export const onboardingOn = signal(false);
export const accountEmailSet = signal(true);
export const deviceLabel = signal<string>("");

export const settings = signal<Settings | null>(null);
export const terms = signal<Term[]>([]);
export const currentTermId = signal<string | null>(null);
export const classes = signal<Class[]>([]);
export const subjects = signal<Subject[]>([]);
export const workTypes = signal<WorkType[]>([]);
export const students = signal<Student[]>([]);
export const revokedTokens = signal<Record<string, string>>({});
export const qrRotatedAt = signal<Record<string, number>>({});
export const assignments = signal<Assignment[]>([]);
export { serverSkewMs };
// The term every page shares, persisted in kv. A real term id, or UNASSIGNED — the work that
// belongs to no term yet (sent to the API as term=unassigned, never as "no filter").
export const UNASSIGNED = "unassigned";
export const selectedTermId = signal<string | null>(null);
const validTerm = (id: string | null | undefined, list: Term[]) =>
  id === UNASSIGNED || (!!id && list.some((t) => t.id === id));

export const activeClasses = computed(() => classes.value.filter((c) => !c.archived));
export const activeSubjects = computed(() => subjects.value.filter((s) => !s.archived));
export const activeWorkTypes = computed(() => workTypes.value.filter((w) => !w.archived));

/** The "start a new term" window (opened from Settings and from the Home reminder; loaded on demand). */
export const startTermOpen = signal(false);
export const currentTerm = computed(() => terms.value.find((t) => t.id === currentTermId.value) ?? null);
/** The term the picker is on (null = "no term yet" bucket or nothing chosen). */
export const viewTerm = computed(() => terms.value.find((t) => t.id === selectedTermId.value) ?? null);
/** First day of the current academic year (earliest start date of its terms): attendance can't be taken before it. */
export const schoolYearStart = computed(() => {
  const y = currentTerm.value?.year;
  const ds = terms.value.filter((t) => t.year === y && t.start_date).map((t) => t.start_date as string).sort();
  return ds[0] ?? null;
});
/** The picker is on an earlier academic year than the current one: that year's classes and children, read and grade only. */
export const viewingPastYear = computed(() => {
  const v = viewTerm.value, c = currentTerm.value;
  return !!v && !!c && v.year < c.year;
});

/**
 * The classes that exist in a term's academic year. This year: the open classes. A past year: every
 * class of that year (they were archived when the new year started — the term picker is how you get back to them).
 */
export function classesForTerm(termId: string | null | undefined): Class[] {
  const t = terms.value.find((x) => x.id === termId);
  const cur = currentTerm.value;
  if (t && cur && t.year < cur.year) return classes.value.filter((c) => c.year === t.year);
  const year = t?.year ?? cur?.year;
  return classes.value.filter((c) => !c.archived && (year == null || classInYear(c.year, year)));
}
/** The classes for the term the picker is on — what the gradebook, reports and student pages list. */
export const viewClasses = computed(() => classesForTerm(selectedTermId.value));

/** Children of a class during a term (same rule as the server), from the copy the app already holds. */
export function rosterCount(classId: string, termId: string | null | undefined): number {
  const c = classes.value.find((x) => x.id === classId);
  const t = terms.value.find((x) => x.id === termId) ?? null;
  return rosterOf(students.value, classId, c?.year, t).length;
}

export const studentsById = computed(() => {
  const m = new Map<string, Student>();
  for (const s of students.value) m.set(s.id, s);
  return m;
});

export const studentsByClass = computed(() => {
  const m = new Map<string, Student[]>();
  for (const s of students.value) {
    if (!s.class_id || s.status !== "active") continue;
    const arr = m.get(s.class_id) ?? [];
    arr.push(s);
    m.set(s.class_id, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return m;
});

/** `live` = this came from the server just now (so its serverTime tells us the clock skew); false = a cached copy. */
export function applyBootstrap(b: Bootstrap, live = true) {
  settings.value = b.settings;
  terms.value = b.terms;
  currentTermId.value = b.currentTermId;
  classes.value = b.classes;
  subjects.value = b.subjects;
  workTypes.value = b.workTypes;
  students.value = b.students;
  revokedTokens.value = b.revokedTokens;
  qrRotatedAt.value = b.qrRotatedAt ?? {};
  assignments.value = b.assignments;
  dataEpoch.value = b.dataEpoch ?? null;
  if (live) epochStale.value = false; // we just looked at the server's data: no longer out of date
  if (live) {
    serverSkewMs.value = b.serverTime - Date.now();
    void kvSet("skew", serverSkewMs.value);
  }
  // keep the shared term valid; fall back to the current term
  if (!validTerm(selectedTermId.value, b.terms)) selectedTermId.value = b.currentTermId;
  applyTheme(b.settings.theme);
}

/** Restore the shared term choice saved on this device (call once at startup). */
export async function loadSelectedTerm() {
  const saved = await kvGet<string>("termId");
  if (validTerm(saved, terms.value)) selectedTermId.value = saved!;
}

export function setSelectedTerm(id: string | null) {
  selectedTermId.value = id;
  void kvSet("termId", id);
}

export async function loadBootstrap() {
  const b = await api.get<Bootstrap>("/api/bootstrap");
  applyBootstrap(b);
  kvSet("bootstrap", b);
}

/** Offline fallback: apply the last cached bootstrap. Returns true if applied. */
export async function loadBootstrapCached(): Promise<boolean> {
  // a deliberate logout must not be undone by the offline cache
  if (await kvGet<boolean>("loggedOut")) return false;
  const b = await kvGet<Bootstrap>("bootstrap");
  if (b) {
    applyBootstrap(b, false);
    // a cached bootstrap's serverTime is old — use the skew we measured the last time we were online
    serverSkewMs.value = (await kvGet<number>("skew")) ?? 0;
    return true;
  }
  return false;
}

/**
 * Sign out: drop cached student data but keep the unsent queue and drafts.
 * Every background sender stops first, and stays stopped until the next sign-in —
 * coming back online must not wake them (their requests would just 401, or worse,
 * ride a session that was meant to end).
 */
export async function logout() {
  pauseSync();
  stopAttSync();
  try { await api.post("/api/auth/logout"); } catch { /* offline: still clear locally; app start finishes it */ }
  await kvSet("bootstrap", null);
  await kvSet("loggedOut", true);
  authState.value = "login";
  location.hash = "";
}

/** Clear the logout flag after a fresh sign-in. */
export async function clearLoggedOut() {
  await kvSet("loggedOut", false);
}

export function applyTheme(theme: Settings["theme"]) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function upsertAssignment(a: Assignment) {
  const list = assignments.value.slice();
  const i = list.findIndex((x) => x.id === a.id);
  if (i >= 0) list[i] = a;
  else list.unshift(a);
  assignments.value = list;
}

/** The server said this assignment changed (closed/reopened/rescored) — every screen must see it, not a stale copy. */
export function patchAssignment(id: string, patch: Partial<Assignment>) {
  assignments.value = assignments.value.map((a) => (a.id === id ? { ...a, ...patch } : a));
}
/** The assignment was deleted (here or on another device). */
export function dropAssignment(id: string) {
  assignments.value = assignments.value.filter((a) => a.id !== id);
}

export function subjectById(idv: string | null) {
  return subjects.value.find((s) => s.id === idv) ?? null;
}
export function workTypeById(idv: string | null) {
  return workTypes.value.find((w) => w.id === idv) ?? null;
}
export function classById(idv: string | null) {
  return classes.value.find((c) => c.id === idv) ?? null;
}

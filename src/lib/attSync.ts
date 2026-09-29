// Attendance sync. The IndexedDB draft is the ONLY place unsaved attendance
// lives, and every draft carries the context (date / class / subject / period)
// it belongs to. The sender reads that context from the draft itself — never
// from whatever page or class the teacher happens to be looking at — so
// switching class, switching day or leaving the page can't file a row into the
// wrong room.
import { signal } from "@preact/signals";
import { api, ApiError } from "./api";
import { draftAll, draftGet, draftUpdate, type AttDraft, type AttConflict, type AttReviewRow } from "./idb";
import { authRequired, syncPaused, dataEpoch } from "./session";
import { classifyFailure } from "@shared/failure";
import { ulid } from "@shared/ids";
import type { AttendanceStatus } from "@shared/types";

export type AttMethod = "camera" | "hid" | "manual" | "grid" | "bulk";

export interface AttCtx {
  date: string;
  classId: string;
  subjectId: string | null;
  period: number | null;
}

export const ctxKey = (c: AttCtx) => `${c.date}|${c.classId}|${c.subjectId ?? ""}|${c.period ?? ""}`;

/** The context a draft belongs to (older drafts only have the key). */
export function ctxOf(d: AttDraft): AttCtx | null {
  if (d.ctx) return d.ctx;
  const [date, classId, subject, period] = d.key.split("|");
  if (!date || !classId) return null;
  return { date, classId, subjectId: subject || null, period: period ? Number(period) : null };
}

// ---- observable state ------------------------------------------------------
export type AttEvent =
  // acked = the status the SERVER holds for each confirmed student (not necessarily what this device sent);
  // changedByOthers = confirmed students whose server status differs from what this device sent (another device edited later)
  | { type: "saved"; key: string; acked: Record<string, AttendanceStatus>; versions: Record<string, number>; updatedAt: number; changedByOthers: string[] }
  | { type: "changed"; key: string }; // conflicts / dropped rows / error changed the draft

const listeners = new Set<(e: AttEvent) => void>();
export function onAttEvent(cb: (e: AttEvent) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(e: AttEvent) { for (const cb of listeners) cb(e); }

interface KeyState { running: Promise<void> | null; again: boolean; tries: number; nextAt: number }
const states = new Map<string, KeyState>();
const stateOf = (key: string): KeyState => {
  let s = states.get(key);
  if (!s) { s = { running: null, again: false, tries: 0, nextAt: 0 }; states.set(key, s); }
  return s;
};

/** key → { busy, tries, nextAt } — lets a page show "saving" / "will retry". */
export const attSync = signal<Record<string, { busy: boolean; tries: number; nextAt: number }>>({});
function publish(key: string) {
  const s = stateOf(key);
  attSync.value = { ...attSync.value, [key]: { busy: s.running !== null, tries: s.tries, nextAt: s.nextAt } };
}

export interface DraftSummary {
  key: string;
  ctx: AttCtx;
  rows: number;    // waiting to be sent (includes the ones held by a clash)
  held: number;    // of those: waiting for the teacher to pick a side
  review: number;  // set aside for the teacher to look at
}

/** Every draft with something in it — the "unsent attendance" list, across all days and rooms. */
export const attDrafts = signal<DraftSummary[]>([]);
/** Unsent attendance rows across every draft, including those set aside for review (for warnings). */
export const attDraftCount = signal(0);
export async function refreshAttDraftCount() {
  const all = await draftAll();
  const list: DraftSummary[] = [];
  for (const d of all) {
    const ctx = ctxOf(d);
    const rows = Object.keys(d.rows).length, review = d.review?.length ?? 0;
    if (ctx && (rows > 0 || review > 0)) list.push({ key: d.key, ctx, rows, held: d.conflicts?.length ?? 0, review });
  }
  attDrafts.value = list;
  attDraftCount.value = list.reduce((n, d) => n + d.rows + d.review, 0);
}

// a draft is finished only when it has neither taps waiting nor taps set aside
const isEmpty = (d: AttDraft) => Object.keys(d.rows).length === 0 && !(d.review && d.review.length);

// ---- edits -----------------------------------------------------------------
export interface AttEdit {
  studentId: string;
  status: AttendanceStatus;
  method: AttMethod;
  /** server updated_at the teacher was looking at for this student (null = saw nothing) */
  baseUpdatedAt: number | null;
}

/**
 * Record edits into the draft for `ctx`. Throws when the device can't store
 * them — the caller must then undo the tap, never show it as saved.
 */
export async function draftEdit(ctx: AttCtx, edits: AttEdit[]): Promise<AttDraft> {
  const key = ctxKey(ctx);
  const now = Date.now();
  const next = await draftUpdate(key, (cur) => {
    const rows = { ...(cur?.rows ?? {}) };
    for (const e of edits) {
      const prev = rows[e.studentId];
      rows[e.studentId] = {
        status: e.status, clientTs: now, method: e.method, opId: ulid(), epoch: dataEpoch.value ?? undefined,
        // keep the base of an edit that hasn't been acknowledged yet
        baseUpdatedAt: prev ? prev.baseUpdatedAt : e.baseUpdatedAt,
      };
    }
    return { ...cur, key, ctx, rows, rev: (cur?.rev ?? 0) + 1, updatedAt: now };
  });
  void refreshAttDraftCount();
  return next!;
}

/** Take a side on one clash. "server" drops our edit; "draft" re-bases it so it can go through. */
export async function resolveConflict(key: string, studentId: string, side: "server" | "draft"): Promise<AttDraft | undefined> {
  const next = await draftUpdate(key, (cur) => {
    if (!cur) return cur;
    const c = (cur.conflicts ?? []).find((x) => x.studentId === studentId);
    const rows = { ...cur.rows };
    if (c && side === "server") delete rows[studentId];
    else if (c && rows[studentId]) rows[studentId] = { ...rows[studentId], baseUpdatedAt: c.server.updatedAt };
    const conflicts = (cur.conflicts ?? []).filter((x) => x.studentId !== studentId);
    const out = { ...cur, rows, conflicts: conflicts.length ? conflicts : undefined };
    return isEmpty(out) ? null : out;
  });
  void refreshAttDraftCount();
  void flushDraft(key, { manual: true });
  return next;
}

/** Teacher pressed "try again": clear a permanent error and the backoff, send now. */
export async function retryDraft(key: string) {
  await draftUpdate(key, (cur) => (cur ? { ...cur, error: undefined } : cur)).catch(() => {});
  const s = stateOf(key);
  s.tries = 0; s.nextAt = 0;
  publish(key);
  await flushDraft(key, { manual: true });
}

// ---- sending ---------------------------------------------------------------
const BACKOFF = [1000, 3000, 8000, 20000, 60000];
const timers = new Map<string, number>();

function scheduleFlush(key: string, delay: number) {
  if (timers.has(key)) return;
  timers.set(key, window.setTimeout(() => { timers.delete(key); void flushDraft(key); }, delay + 50));
}

/**
 * Remove exactly the rows that were acknowledged; re-base rows edited while the
 * save was in flight. Returns false if storage refused — the rows then stay and
 * are simply re-sent later (same op id, same status: never a clash).
 */
async function ack(key: string, sent: Record<string, string>, versions: Record<string, number>, updatedAt: number): Promise<boolean> {
  try {
    await draftUpdate(key, (cur) => {
      if (!cur) return cur;
      const rows = { ...cur.rows };
      for (const [sid, opId] of Object.entries(sent)) {
        const row = rows[sid];
        if (!row) continue;
        if (row.opId === opId) delete rows[sid];
        // edited again meanwhile: it now builds on exactly the version we just wrote
        else rows[sid] = { ...row, baseUpdatedAt: versions[sid] ?? updatedAt };
      }
      const out = { ...cur, rows };
      return isEmpty(out) ? null : out;
    });
    return true;
  } catch {
    return false;
  }
}

/** Move taps out of the send queue into "needs your attention" — kept whole, never dropped. */
async function setAside(key: string, ids: Set<string> | null, reason: AttReviewRow["reason"]) {
  await patch(key, (cur) => {
    const rows = { ...cur.rows };
    const review = [...(cur.review ?? [])];
    for (const [sid, r] of Object.entries(cur.rows)) {
      if (ids && !ids.has(sid)) continue;
      delete rows[sid];
      const at = Date.now();
      const item: AttReviewRow = { studentId: sid, status: r.status, clientTs: r.clientTs, method: r.method, reason, at };
      const i = review.findIndex((x) => x.studentId === sid);
      if (i >= 0) review[i] = item; else review.push(item);
    }
    const conflicts = (cur.conflicts ?? []).filter((c) => !!rows[c.studentId]);
    const out = { ...cur, rows, review: review.length ? review : undefined, conflicts: conflicts.length ? conflicts : undefined };
    return isEmpty(out) ? null : out;
  });
}

/** The teacher decided a set-aside tap is still right: queue it again as a fresh tap (new op, current data). */
export async function reviewResend(key: string, studentId: string): Promise<AttDraft | undefined> {
  const next = await draftUpdate(key, (cur) => {
    if (!cur) return cur;
    const r = (cur.review ?? []).find((x) => x.studentId === studentId);
    if (!r) return cur;
    const review = (cur.review ?? []).filter((x) => x.studentId !== studentId);
    return {
      ...cur,
      rows: { ...cur.rows, [studentId]: { status: r.status, clientTs: Date.now(), method: r.method, opId: ulid(), baseUpdatedAt: null, epoch: dataEpoch.value ?? undefined } },
      review: review.length ? review : undefined,
      error: undefined,
    };
  });
  void refreshAttDraftCount();
  void flushDraft(key, { manual: true });
  return next;
}

/** The teacher decided a set-aside tap should go. */
export async function reviewDiscard(key: string, studentId: string): Promise<AttDraft | undefined> {
  const next = await draftUpdate(key, (cur) => {
    if (!cur) return cur;
    const review = (cur.review ?? []).filter((x) => x.studentId !== studentId);
    const out = { ...cur, review: review.length ? review : undefined };
    return isEmpty(out) ? null : out;
  });
  void refreshAttDraftCount();
  return next;
}

async function patch(key: string, fn: (cur: AttDraft) => AttDraft | null) {
  await draftUpdate(key, (cur) => (cur ? fn(cur) : cur)).catch(() => {});
  void refreshAttDraftCount();
  emit({ type: "changed", key });
}

// manual = the teacher pressed retry (also retries a permanent error) · skipBackoff = the network came back
interface FlushOpts { manual?: boolean; skipBackoff?: boolean }

/**
 * Send whatever is waiting in one draft. Safe to call any time, from anywhere;
 * resolves when the send in progress (and any repeat it was asked for) is done.
 */
export function flushDraft(key: string, opts: FlushOpts = {}): Promise<void> {
  if (syncPaused.value || authRequired.value) return Promise.resolve();
  const st = stateOf(key);
  if (st.running) { st.again = true; return st.running; }
  // the network just came back: whatever we were backing off from is worth trying now
  if (opts.skipBackoff) { st.tries = 0; st.nextAt = 0; }
  if (!opts.manual && st.nextAt > Date.now()) return Promise.resolve();

  st.running = runFlush(key, opts, st).finally(() => {
    st.running = null;
    publish(key);
    if (st.again) { st.again = false; void flushDraft(key); }
  });
  publish(key);
  return st.running;
}

async function runFlush(key: string, opts: FlushOpts, st: KeyState): Promise<void> {
  for (let pass = 0; pass < 6; pass++) {
    let d = await draftGet(key);
    if (!d) break;
    const ctx = ctxOf(d);
    if (!ctx) break;
    if (d.error && !opts.manual) break;

    // every edit needs an op id (drafts written by an older build have none)
    if (Object.values(d.rows).some((r) => !r.opId)) {
      d = await draftUpdate(key, (cur) => cur && ({
        ...cur, rows: Object.fromEntries(Object.entries(cur.rows).map(([sid, r]) => [sid, r.opId ? r : { ...r, opId: ulid() }])),
      })).catch(() => d);
      if (!d) break;
    }

    const held = new Set((d.conflicts ?? []).map((c) => c.studentId));
    const entries = Object.entries(d.rows).filter(([sid]) => !held.has(sid));
    if (entries.length === 0) break;

    const body: Record<string, unknown> = {
      date: ctx.date,
      classId: ctx.classId,
      rows: entries.map(([studentId, r]) => ({
        studentId, status: r.status, opId: r.opId, baseUpdatedAt: r.baseUpdatedAt, time: r.clientTs, method: r.method ?? "grid",
        dataEpoch: r.epoch,
      })),
    };
    if (ctx.subjectId) { body.subjectId = ctx.subjectId; body.period = ctx.period; }

    try {
      const res = await api.post<{ updatedAt: number; rows?: Record<string, number>; state?: Record<string, { status: string; updatedAt: number }> }>("/api/attendance/batch", body);
      const versions = res.rows ?? {};
      const held = res.state; // what the server actually holds, read after the write (absent = an older server)
      // Only rows the server CONFIRMED leave the draft. A row it says nothing about stays, and is sent again.
      const confirmed = held ? entries.filter(([sid]) => held[sid]) : entries;
      const cleared = await ack(key, Object.fromEntries(confirmed.map(([sid, r]) => [sid, r.opId!])), versions, res.updatedAt);
      st.tries = 0; st.nextAt = 0;
      emit({
        type: "saved", key, updatedAt: res.updatedAt, versions,
        // the screen shows what the SERVER holds: a retry of an edit that had already landed can find that another
        // device changed the student since — saying "present" then would be a lie
        acked: Object.fromEntries(confirmed.map(([sid, r]) => [sid, (held?.[sid]?.status ?? r.status) as AttendanceStatus])),
        changedByOthers: confirmed.filter(([sid, r]) => held?.[sid] && held[sid].status !== r.status).map(([sid]) => sid),
      });
      void refreshAttDraftCount();
      if (confirmed.length < entries.length) {
        // the server did not vouch for some rows: keep them (never drop a tap on a maybe) and try again shortly
        st.tries++; st.nextAt = Date.now() + BACKOFF[Math.min(st.tries - 1, BACKOFF.length - 1)];
        scheduleFlush(key, st.nextAt - Date.now());
        break;
      }
      if (!cleared) break; // couldn't clear the draft: don't loop on the same rows
      continue; // more may have been tapped while this was in flight
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.data?.conflicts)) {
        const fresh = e.data.conflicts as AttConflict[];
        const ids = new Set(fresh.map((c) => c.studentId));
        await patch(key, (cur) => ({ ...cur, conflicts: [...(cur.conflicts ?? []).filter((c) => !ids.has(c.studentId)), ...fresh] }));
        continue; // send the rest; the clashing rows wait for the teacher
      }
      if (e instanceof ApiError && e.status === 422 && e.data?.error === "not_in_class" && Array.isArray(e.data.studentIds)) {
        // these students are no longer in that room. They can't be filed there — but the teacher tapped them,
        // so they are SET ASIDE for a decision (kept whole, never dropped), and must not block the rest.
        await setAside(key, new Set<string>(e.data.studentIds), "not_in_class");
        continue;
      }
      if (e instanceof ApiError && e.status === 409 && e.data?.error === "epoch_changed") {
        // made before the data was restored: not sent into the new data by itself — the teacher looks first
        await setAside(key, Array.isArray(e.data.studentIds) ? new Set<string>(e.data.studentIds) : null, "epoch_changed");
        continue;
      }
      if (e instanceof ApiError && e.status === 422 && e.data?.error === "before_school_year") {
        // a draft for a day before the current school year (a new year has started since): kept for the teacher
        await setAside(key, null, "before_school_year");
        continue;
      }
      const status = e instanceof ApiError ? e.status : 0;
      const kind = classifyFailure(status);
      if (kind === "auth") break; // api.ts already raised the re-login prompt; the draft stays put
      if (kind === "failed") {
        await patch(key, (cur) => ({ ...cur, error: e instanceof ApiError ? e.code : "error" }));
        break;
      }
      st.tries++;
      st.nextAt = Date.now() + BACKOFF[Math.min(st.tries - 1, BACKOFF.length - 1)];
      scheduleFlush(key, st.nextAt - Date.now());
      break;
    }
  }
}

const debounced = new Map<string, number>();
/**
 * Send a draft shortly after the last tap. The timer belongs to the draft's key,
 * not to a page: leaving the page or switching class does not cancel it.
 */
export function requestFlush(key: string, delay = 600) {
  const t = debounced.get(key);
  if (t) clearTimeout(t);
  debounced.set(key, window.setTimeout(() => { debounced.delete(key); void flushDraft(key); }, delay));
}

/** Forget pending retries and backoff (sign-out, and tests). Drafts themselves stay in storage. */
export function stopAttSync() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  for (const t of debounced.values()) clearTimeout(t);
  debounced.clear();
  states.clear();
  attSync.value = {};
}

/** Background sweep: every draft on this device, whatever page is open. */
export async function flushAllDrafts(opts: { skipBackoff?: boolean } = {}): Promise<void> {
  if (syncPaused.value || authRequired.value) return;
  for (const d of await draftAll()) await flushDraft(d.key, opts);
  void refreshAttDraftCount();
}

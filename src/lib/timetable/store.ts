// Timetable store (EP-11 / EP-12 client side): loads a term's table, keeps one signal per term, saves every change as a
// whole-table PUT in the order the teacher tapped, puts the old value back on failure, and answers 409s as the contract says.
// Offline: read-only, nothing is queued (D38, Q4). The home page's now/next/shortcut come from `ttToday`.
import { computed, signal } from "@preact/signals";
import type { Bootstrap, Class, Subject, Term } from "@shared/types";
import {
  type Frame, type FrameInput, type FrameIssue, type Slot, type SlotIssue, type TimetablePayload, type Weekday,
  normalizeSlots, periodTimesOf, resolveFrame, serializeFrame, slotIssues, validateFrame,
} from "@shared/timetable";
import { api, ApiError } from "../api";
import { kvSet, kvUpdate } from "../idb";
import { dataEpoch } from "../session";
import { online } from "../outbox";
import { classes, currentTermId, loadBootstrap, settings, subjects, terms } from "../../store";
import { bangkokHM, initClockFromLocation, ttNowMs } from "./clock";
import { type CopyPlan, type CopySource, pickCopySource, planCopy } from "./copy";
import { type DaySnapshot, type TtInput, buildEntries, snapshot, summarize } from "./logic";
import { DAY_NAMES, MSG } from "./messages";
import {
  type TermTable, type LoadState, ttCounts, ttCountsKnown, ttLoad, ttResetAll, ttTables, dropTablesExcept, patchTable, setTable, tableFromPayload, tableOf,
} from "./state";

export { ttTables, ttLoad, ttCounts, ttResetAll };

// fixture/dev only: `?now=` pins the clock (never on the real site)
if (typeof location !== "undefined") initClockFromLocation();

// ---- derived ----------------------------------------------------------------------------------------------------
export const ttFrame = computed<Frame>(() => resolveFrame(settings.value?.period_frame, settings.value?.period_times ?? ""));
/** A stored `period_frame` that does not pass the check (D56): the page says "โครงเวลาที่บันทึกไว้อ่านไม่ได้" and offers the frame sheet. */
export const ttFrameBroken = computed<boolean>(() => !!(settings.value?.period_frame ?? "").trim() && !ttFrame.value.saved);

const termOf = (id: string | null | undefined): Term | null => terms.value.find((t) => t.id === id) ?? null;
const refs = (list: (Class | Subject)[]) => list.map((c) => ({ id: c.id, name: c.name, archived: !!c.archived }));

/** The input of every calculation in logic.ts for one term's table. */
export function ttInputFor(termId: string | null | undefined): TtInput | null {
  const table = tableOf(termId);
  if (!table) return null;
  const term = termOf(termId);
  return { slots: table.slots, frame: ttFrame.value, term: term ? { start_date: term.start_date, end_date: term.end_date } : null, classes: refs(classes.value), subjects: refs(subjects.value) };
}

export const ttCurrentTable = computed<TermTable | null>(() => tableOf(currentTermId.value));

/** Now / next / strip / shortcut / home rows for the CURRENT term, recalculated whenever the clock ticks. Null = nothing to show. */
export const ttToday = computed<DaySnapshot | null>(() => {
  const input = ttInputFor(currentTermId.value);
  if (!input) return null;
  const snap = snapshot(input, ttNowMs.value);
  return snap.visible ? snap : null;
});

/** Week totals of a term's table (BR-05). */
export const ttSummaryFor = (termId: string) => {
  const t = tableOf(termId);
  return t ? summarize(t.slots, ttFrame.value) : null;
};

/** "ออฟไลน์ · ข้อมูลเมื่อ 09:41" while offline (the copy on screen is the one kept on this device), else null. */
export function ttOfflineStamp(termId: string | null | undefined): string | null {
  const t = tableOf(termId);
  return t && !online.value ? MSG.offlineStamp(bangkokHM(t.loadedAt)) : null;
}

// ---- notices (toasts are the screens' job; this says what to show) ------------------------------------------------
export interface TtNotice {
  id: number;
  kind: "ok" | "error";
  text: string;
  detail?: string; // e.g. the list of slots a copy left out — stays until the teacher closes it
  retry?: boolean; // show [ลองอีกครั้ง] → retryLast()
  issues?: (SlotIssue | FrameIssue)[];
}
export const ttNotice = signal<TtNotice | null>(null);
let noticeId = 0;
function notice(n: Omit<TtNotice, "id">): void {
  ttNotice.value = { id: ++noticeId, ...n };
}
export const dismissNotice = () => { ttNotice.value = null; };

// ---- results -----------------------------------------------------------------------------------------------------
export type SaveResult =
  | { ok: true; changed: boolean; rev: number }
  | { ok: false; code: string; message: string; issues?: (SlotIssue | FrameIssue)[]; count?: number; removes?: FrameRemove[] };

export interface FrameRemove { termId: string; weekday: Weekday; period: number; kind: Slot["kind"]; classId: string | null; subjectId: string | null; label: string | null }

type Fail = Extract<SaveResult, { ok: false }>;
const fail = (code: string, message: string, extra: Partial<Fail> = {}): Fail => ({ ok: false, code, message, ...extra });

const isOffline = () => online.value === false;

// ---- the save queue ----------------------------------------------------------------------------------------------
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
const gens = new Map<string, number>(); // bumped when a term's pending changes are dropped (a failure put the old table back)
const genOf = (id: string) => gens.get(id) ?? 0;
const dropPending = (id: string) => gens.set(id, genOf(id) + 1);

let lastFailed: { termId: string; slots: Slot[]; reason: Reason; baseRev: number } | null = null; // baseRev = the one the failed request carried (D59 ก)

type Reason = "edit" | "undo" | "clear" | "copy";

interface PutResponse { ok: true; changed: boolean; timetable: TimetablePayload }
interface GetResponse extends TimetablePayload { frame: Frame; counts: { termId: string; slots: number }[] }

/** Keep the copy used by an offline start in step with what the server confirmed (only inside the same data epoch). */
function cacheBootstrap(change: (b: Bootstrap) => Bootstrap, epoch: number | null): void {
  void kvUpdate<Bootstrap | null>("bootstrap", (b) => (b && (b.dataEpoch ?? null) === epoch ? change(b) : b));
}
function cacheTable(p: TimetablePayload, epoch: number | null): void {
  if (p.termId !== currentTermId.value) return;
  cacheBootstrap((b) => ({ ...b, timetable: p }), epoch);
  void kvSet("ttAt", Date.now());
}

function adopt(p: TimetablePayload, source: TermTable["source"] = "server"): void {
  setTable(tableFromPayload(p, Date.now(), source));
}

/** Server answer applied: show it unless more changes of ours are still queued behind this one. */
function confirm(p: TimetablePayload, epoch: number | null): void {
  const cur = tableOf(p.termId);
  const left = Math.max(0, (cur?.pending ?? 1) - 1);
  setTable({
    termId: p.termId, rev: p.rev, readOnly: p.readOnly, confirmed: p.slots, pending: left, loadedAt: Date.now(), source: "server",
    slots: left > 0 && cur ? cur.slots : p.slots,
  });
  cacheTable(p, epoch);
  const n = p.slots.length;
  ttCounts.value = [...ttCounts.value.filter((c) => c.termId !== p.termId), ...(n > 0 ? [{ termId: p.termId, slots: n }] : [])];
}

/** After a failure: drop what was still queued for this term and show what the server has. */
function revert(termId: string): void {
  dropPending(termId);
  const t = tableOf(termId);
  if (t) patchTable(termId, { slots: t.confirmed, pending: 0 });
}

/** Get the newest settings (the frame) from the server; offline / failing = keep what is on screen. */
async function refreshFrame(): Promise<void> {
  try { await loadBootstrap(); } catch { /* offline: the next open reloads */ }
}

const sameSlots = (a: Slot[], b: Slot[]) => JSON.stringify(normalizeSlots(a)) === JSON.stringify(normalizeSlots(b));

async function afterEpochChange(termId: string): Promise<void> {
  notice({ kind: "error", text: MSG.epochChanged });
  try { await loadBootstrap(); } catch { /* offline now: the next open reloads */ }
  if (termId !== currentTermId.value) await loadTerm(termId, { force: true });
}

async function failureOf(e: unknown, termId: string, desired: Slot[], reason: Reason, baseRev: number, isRetry: boolean): Promise<SaveResult> {
  revert(termId);
  const err = e instanceof ApiError ? e : new ApiError(0, "network", MSG.saveFailed);
  const d = err.data ?? {};
  if (err.status === 409 && (err.code === "timetable_changed" || err.code === "frame_changed") && d.current) {
    const cur = d.current as TimetablePayload;
    // a retry whose first request had landed after all: the server already holds exactly what was wanted (D59 ก)
    if (isRetry && err.code === "timetable_changed" && sameSlots(cur.slots, desired)) {
      adopt(cur);
      cacheTable(cur, dataEpoch.value);
      return { ok: true, changed: false, rev: cur.rev };
    }
    adopt(cur);
    if (err.code === "frame_changed") await refreshFrame(); // the frame on screen is the old one (D57)
    const text = err.code === "frame_changed" ? (err.message || MSG.frameChangedElsewhere) : (err.message || MSG.changedElsewhere);
    notice({ kind: "error", text });
    return fail(err.code, text);
  }
  if (err.status === 409 && err.code === "epoch_changed") {
    await afterEpochChange(termId);
    return fail("epoch_changed", MSG.epochChanged);
  }
  if (err.status === 409 && err.code === "term_read_only") {
    patchTable(termId, { readOnly: true });
    notice({ kind: "error", text: MSG.readOnlyTerm });
    return fail("term_read_only", MSG.readOnlyTerm);
  }
  if (err.status === 422) {
    const issues = (d.issues ?? []) as SlotIssue[];
    let text = issues[0]?.message ?? err.message;
    if (issues.some((i) => i.code === "outside_frame")) {
      await refreshFrame(); // the screen may hold an old frame (D57)
      if (ttFrameBroken.value) text = MSG.frameBroken; // the stored frame is unreadable (D56)
    }
    notice({ kind: "error", text, issues });
    return fail(err.code, text, { issues });
  }
  if (err.status === 401) {
    notice({ kind: "error", text: err.message });
    return fail("unauthorized", err.message);
  }
  if (err.status === 404) {
    const text = err.code === "no_term" ? MSG.noTerm : err.message || MSG.termNotFound;
    notice({ kind: "error", text });
    return fail(err.code, text);
  }
  // 5xx / network / timeout: the old value is back; the teacher can try again
  lastFailed = { termId, slots: desired, reason, baseRev };
  if (err.code === "timeout") await loadTerm(termId, { force: true }); // it may have been saved after all (D08)
  notice({ kind: "error", text: MSG.saveFailed, retry: true });
  return fail(err.code || "error", MSG.saveFailed);
}

async function send(termId: string, desired: Slot[], reason: Reason, gen: number, retryRev?: number): Promise<SaveResult> {
  if (genOf(termId) !== gen) return fail("dropped", MSG.saveFailed); // an earlier change failed: this one rode on it
  const t = tableOf(termId);
  if (!t) return fail("no_table", MSG.loadFailed);
  const epoch = dataEpoch.value;
  const baseRev = retryRev ?? t.rev;
  let res: PutResponse;
  try {
    res = await api.put<PutResponse>("/api/timetable", { termId, baseRev, reason, slots: desired });
  } catch (e) {
    return failureOf(e, termId, desired, reason, baseRev, retryRev !== undefined);
  }
  if (dataEpoch.value !== epoch) return fail("stale", MSG.epochChanged); // the data was replaced while this was on its way
  confirm(res.timetable, epoch);
  lastFailed = null;
  return { ok: true, changed: res.changed, rev: res.timetable.rev };
}

/** Show the new table now, then save it behind any earlier change. */
function commitSlots(termId: string, desired: Slot[], reason: Reason, retryRev?: number): Promise<SaveResult> {
  const t = tableOf(termId);
  if (!t) return Promise.resolve(fail("no_table", MSG.loadFailed));
  if (t.readOnly) { notice({ kind: "error", text: MSG.readOnlyTerm }); return Promise.resolve(fail("term_read_only", MSG.readOnlyTerm)); }
  if (isOffline()) { notice({ kind: "error", text: MSG.offlineEdit }); return Promise.resolve(fail("offline", MSG.offlineEdit)); }
  const slots = normalizeSlots(desired);
  const issues = slotIssues(slots, ttFrame.value);
  if (issues.length > 0) return Promise.resolve(fail("bad_timetable", issues[0].message, { issues }));
  patchTable(termId, { slots, pending: t.pending + 1 });
  const gen = genOf(termId);
  return enqueue(() => send(termId, slots, reason, gen, retryRev));
}

// ---- reading -----------------------------------------------------------------------------------------------------
const setLoad = (id: string, s: LoadState | null) => {
  const next = { ...ttLoad.value };
  if (s) next[id] = s; else delete next[id];
  ttLoad.value = next;
};

/** Load a term's table (GET). Without `force` an already loaded term is left alone. Offline keeps what is on screen. */
export async function loadTerm(termId: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; message?: string }> {
  const have = tableOf(termId);
  if (have && !opts.force && (ttCountsKnown.value || isOffline())) return { ok: true };
  if (isOffline()) {
    if (have) return { ok: true }; // read-only copy from this device
    setLoad(termId, { state: "error", code: "offline", message: MSG.loadFailed });
    return { ok: false, message: MSG.loadFailed };
  }
  const epoch = dataEpoch.value;
  setLoad(termId, { state: "loading" });
  try {
    const res = await api.get<GetResponse>(`/api/timetable?term=${encodeURIComponent(termId)}`);
    if (dataEpoch.value !== epoch) return { ok: false, message: MSG.epochChanged };
    const cur = tableOf(res.termId);
    if (!cur || cur.pending === 0) {
      const p: TimetablePayload = { termId: res.termId, rev: res.rev, readOnly: res.readOnly, slots: res.slots };
      adopt(p);
      cacheTable(p, epoch);
    }
    ttCounts.value = res.counts ?? [];
    ttCountsKnown.value = true;
    setLoad(termId, null);
    return { ok: true };
  } catch (e) {
    const err = e instanceof ApiError ? e : null;
    const message = err?.code === "no_term" ? MSG.noTerm : err?.code === "term_not_found" ? MSG.termNotFound : MSG.loadFailed;
    setLoad(termId, { state: "error", code: err?.code ?? "error", message });
    return { ok: false, message };
  }
}

// ---- editing -----------------------------------------------------------------------------------------------------
const slotKey = (s: { weekday: number; period: number }) => `${s.weekday}:${s.period}`;

/** Clean a slot as the form meant it: an activity has a trimmed name and no room; a teaching slot has no name. */
function tidy(s: Slot): Slot {
  return s.kind === "activity"
    ? { weekday: s.weekday, period: s.period, kind: "activity", classId: null, subjectId: null, label: (s.label ?? "").trim() }
    : { weekday: s.weekday, period: s.period, kind: "class", classId: s.classId, subjectId: s.subjectId || null, label: null };
}

/** Add a slot, or replace the one in the same cell (BR-03: one item per cell). */
export async function upsertSlot(termId: string, slot: Slot): Promise<SaveResult> {
  const t = tableOf(termId);
  if (!t) return fail("no_table", MSG.loadFailed);
  const next = tidy(slot);
  const r = await commitSlots(termId, [...t.slots.filter((s) => slotKey(s) !== slotKey(next)), next], "edit");
  if (r.ok) notice({ kind: "ok", text: MSG.slotSaved });
  return r;
}

export interface UndoState { id: number; termId: string; slot: Slot; message: string }
export const ttUndo = signal<UndoState | null>(null);
export const UNDO_MS = 5000;
let undoId = 0;
let undoTimer: ReturnType<typeof setTimeout> | null = null;
const clearUndo = () => { if (undoTimer) clearTimeout(undoTimer); undoTimer = null; ttUndo.value = null; };

/** Delete one slot (AC-06): the cell is empty at once; for 5 s `ttUndo` offers to put it back. */
export async function removeSlot(termId: string, weekday: Weekday, period: number): Promise<SaveResult> {
  const t = tableOf(termId);
  const slot = t?.slots.find((s) => s.weekday === weekday && s.period === period);
  if (!t || !slot) return fail("not_found", MSG.saveFailed);
  const input = ttInputFor(termId);
  const entry = input ? buildEntries(input, { includeArchived: true }).find((e) => e.weekday === weekday && e.period === period) : undefined;
  const what = entry?.title || slot.label || "";
  const id = ++undoId;
  const pending = commitSlots(termId, t.slots.filter((s) => slotKey(s) !== slotKey(slot)), "edit");
  // commitSlots shows the change synchronously; if it did (not refused), offer the undo
  if ((tableOf(termId)?.pending ?? 0) > t.pending) {
    if (undoTimer) clearTimeout(undoTimer);
    ttUndo.value = { id, termId, slot, message: MSG.deleted(what, DAY_NAMES[slot.weekday], slot.period) };
    undoTimer = setTimeout(() => { if (ttUndo.value?.id === id) clearUndo(); }, UNDO_MS);
  }
  const r = await pending;
  if (!r.ok && ttUndo.value?.id === id) clearUndo();
  return r;
}

/** Put the deleted slot back (a new save with reason "undo", against the latest version). */
export async function undoRemove(): Promise<SaveResult> {
  const u = ttUndo.value;
  if (!u) return fail("nothing_to_undo", MSG.saveFailed);
  clearUndo();
  const t = tableOf(u.termId);
  if (!t) return fail("no_table", MSG.loadFailed);
  if (t.slots.some((s) => slotKey(s) === slotKey(u.slot))) return fail("cell_taken", MSG.saveFailed);
  const r = await commitSlots(u.termId, [...t.slots, u.slot], "undo");
  if (r.ok) notice({ kind: "ok", text: MSG.undone });
  return r;
}

/** Empty the whole term (S9-ก confirms first). The frame stays. */
export async function clearTerm(termId: string): Promise<SaveResult> {
  const r = await commitSlots(termId, [], "clear");
  if (r.ok) notice({ kind: "ok", text: MSG.cleared });
  return r;
}

/** Try the last save that failed (network / server error / timeout) once more with the SAME base version (D59 ก): never over another device's edit. */
export async function retryLast(): Promise<SaveResult> {
  const f = lastFailed;
  if (!f) return fail("nothing_to_retry", MSG.saveFailed);
  lastFailed = null;
  dismissNotice();
  const r = await commitSlots(f.termId, f.slots, f.reason, f.baseRev);
  if (r.ok && f.reason === "edit") notice({ kind: "ok", text: MSG.slotSaved });
  return r;
}

// ---- copy from the previous term (BR-07) -------------------------------------------------------------------------
export interface CopyPrepared { ok: true; plan: CopyPlan; source: CopySource; existing: number; needsConfirm: boolean; confirmText: string | null }

/** The earlier term to copy from for this term, or null (no button). */
export function copySourceFor(termId: string): CopySource | null {
  return pickCopySource(terms.value, ttCounts.value, termId);
}

/** Fetch the source term and work out what would carry over. Nothing is saved; the screen asks first when `needsConfirm`. */
export async function prepareCopy(targetId: string): Promise<CopyPrepared | Fail> {
  const target = termOf(targetId);
  const have = tableOf(targetId);
  const source = copySourceFor(targetId);
  if (!target || !have || !source) return fail("no_source", MSG.saveFailed);
  if (have.readOnly) return fail("term_read_only", MSG.readOnlyTerm);
  if (isOffline()) { notice({ kind: "error", text: MSG.offlineEdit }); return fail("offline", MSG.offlineEdit); }
  const srcTerm = termOf(source.termId);
  let res: GetResponse;
  try {
    res = await api.get<GetResponse>(`/api/timetable?term=${encodeURIComponent(source.termId)}`);
  } catch {
    notice({ kind: "error", text: MSG.loadFailed });
    return fail("load_failed", MSG.loadFailed);
  }
  if (!srcTerm) return fail("no_source", MSG.saveFailed);
  const plan = planCopy({ sourceSlots: res.slots, sourceTerm: srcTerm, targetTerm: target, frame: ttFrame.value, classes: classes.value, subjects: subjects.value });
  const existing = have.slots.length;
  return { ok: true, plan, source, existing, needsConfirm: existing > 0, confirmText: existing > 0 ? MSG.confirmReplace(existing, plan.copied, source.name) : null };
}

/** Save the planned copy in one PUT (reason "copy"). */
export async function commitCopy(targetId: string, plan: CopyPlan): Promise<SaveResult> {
  const r = await commitSlots(targetId, plan.slots, "copy");
  if (r.ok) notice({ kind: "ok", text: plan.message, detail: plan.skippedText ?? undefined });
  return r;
}

// ---- the frame (EP-12) -------------------------------------------------------------------------------------------
function applyFrame(f: Frame): void {
  const s = settings.value;
  if (!s) return;
  settings.value = { ...s, period_frame: serializeFrame(f, f.rev), period_times: periodTimesOf(f) };
}

/** "PLC กลุ่มสาระ (จันทร์), คณิตศาสตร์ ป.6/2 (พุธ)" items for the S9-ข confirmation. */
export function describeRemoves(removes: FrameRemove[]): string[] {
  const cls = new Map(classes.value.map((c) => [c.id, c.name]));
  const sub = new Map(subjects.value.map((s) => [s.id, s.name]));
  return removes.map((r) => {
    const title = r.kind === "activity" ? r.label ?? "" : [r.subjectId ? sub.get(r.subjectId) : null, r.classId ? cls.get(r.classId) : null].filter(Boolean).join(" ");
    return `${title} (${DAY_NAMES[r.weekday]})`;
  });
}

/** Removed slots grouped by term: the current term first, then year/term newest → oldest. Items keep the order given (R-04). */
export function removeGroups(removes: FrameRemove[], itemOf: (r: FrameRemove) => string = (r) => describeRemoves([r])[0]): { termId: string; name: string; items: string[] }[] {
  const by = new Map<string, FrameRemove[]>();
  for (const r of removes) by.set(r.termId, [...(by.get(r.termId) ?? []), r]);
  const rank = (id: string) => {
    const t = termOf(id);
    return id === currentTermId.value ? Infinity : t ? t.year * 10 + t.term : -1;
  };
  return [...by.entries()]
    .sort((a, b) => rank(b[0]) - rank(a[0]))
    .map(([termId, list]) => {
      const t = termOf(termId);
      return { termId, name: t ? `${t.term}/${t.year}` : "", items: list.map(itemOf) };
    });
}

/** The sentence of the S9-ข box: "จะลบ 4 คาบในคาบ 7 — ภาค 2/2569: … · ภาค 1/2569: …" (terms are named only when there are several). */
export function removeSummary(removes: FrameRemove[]): string {
  const periods = new Set(removes.map((r) => r.period));
  const period = periods.size === 1 ? [...periods][0] : undefined;
  const groups = removeGroups(removes);
  if (groups.length <= 1) return MSG.confirmRemoveSlots(groups[0]?.items ?? [], period);
  return MSG.confirmRemoveTerms(removes.length, groups, period);
}

/**
 * Save the time frame. Fewer periods / days that would delete slots answer `frame_removes_slots` (+ `count`, `removes`):
 * show the confirmation, then call again with `{ confirmRemove: count }`.
 */
export function saveFrame(frame: FrameInput, opts: { confirmRemove?: number } = {}): Promise<SaveResult> {
  if (isOffline()) { notice({ kind: "error", text: MSG.offlineEdit }); return Promise.resolve(fail("offline", MSG.offlineEdit)); }
  const issues = validateFrame(frame);
  if (issues.length > 0) return Promise.resolve(fail("bad_frame", issues[0].message, { issues }));
  return enqueue(async () => {
    const epoch = dataEpoch.value;
    const body: Record<string, unknown> = { baseRev: ttFrame.value.rev, frame: { periods: frame.periods, breaks: frame.breaks, days: frame.days } };
    if (opts.confirmRemove !== undefined) body.confirmRemove = opts.confirmRemove;
    let res: { ok: true; frame: Frame; removed: number; timetable: TimetablePayload | null };
    try {
      res = await api.put("/api/timetable/frame", body);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "network", MSG.saveFailed);
      const d = err.data ?? {};
      if (err.status === 409 && err.code === "frame_removes_slots") {
        return fail(err.code, err.message, { count: d.count as number, removes: (d.removes ?? []) as FrameRemove[] });
      }
      if (err.status === 409 && err.code === "frame_changed") {
        if (d.current?.saved) applyFrame(d.current as Frame);
        else await refreshFrame(); // unreadable stored frame: take the server's settings so the rev matches (D57)
        const text = err.message || MSG.frameChangedElsewhere;
        notice({ kind: "error", text });
        return fail(err.code, text);
      }
      if (err.status === 409 && err.code === "epoch_changed") {
        await afterEpochChange(currentTermId.value ?? "");
        return fail("epoch_changed", MSG.epochChanged);
      }
      if (err.status === 422) {
        const list = (d.issues ?? []) as FrameIssue[];
        return fail(err.code, list[0]?.message ?? err.message, { issues: list });
      }
      if (err.code === "timeout") { try { await loadBootstrap(); } catch { /* offline */ } } // it may have been saved (D08)
      notice({ kind: "error", text: err.status === 401 ? err.message : MSG.saveFailed, retry: false }); // the frame sheet has its own retry (D59)
      return fail(err.code || "error", MSG.saveFailed);
    }
    if (dataEpoch.value !== epoch) return fail("stale", MSG.epochChanged);
    applyFrame(res.frame);
    dropTablesExcept(res.timetable?.termId ?? null); // other loaded terms may have lost slots: they reload when opened
    if (res.timetable) {
      adopt(res.timetable);
      cacheTable(res.timetable, epoch);
    }
    cacheBootstrap((b) => ({ ...b, settings: { ...b.settings, period_frame: serializeFrame(res.frame, res.frame.rev), period_times: periodTimesOf(res.frame) } }), epoch);
    if (res.removed > 0 && currentTermId.value) void loadTerm(currentTermId.value, { force: true }); // refresh `counts`
    notice({ kind: "ok", text: MSG.frameSaved });
    return { ok: true, changed: true, rev: res.frame.rev };
  });
}

// ---- tests -------------------------------------------------------------------------------------------------------
export function resetTimetableStoreForTests(): void {
  ttResetAll();
  chain = Promise.resolve();
  gens.clear();
  lastFailed = null;
  ttNotice.value = null;
  clearUndo();
}

import { signal } from "@preact/signals";
import { api, ApiError } from "./api";
import {
  outboxAdd, outboxAll, outboxRemove, outboxUpdate,
  failedAll, failedRemove, moveOutboxToFailed, moveFailedToOutbox,
  type OutboxItem, type FailedItem,
} from "./idb";
import type { SubmissionOp, SubmissionOpResult } from "@shared/types";
import { classifyFailure } from "@shared/failure";
import { authRequired, syncPaused, dataEpoch, serverReachable } from "./session";
import { actionTime } from "./clock";
import { flushAllDrafts, refreshAttDraftCount } from "./attSync";

export const pendingCount = signal(0);
export const failedCount = signal(0);
export const syncing = signal(false);
export const online = signal(navigator.onLine);
export { authRequired };

/** Latest op still waiting to be delivered, per student+work — lets pages show "รอส่ง" and the value not yet on the server. */
export const pendingOps = signal<Map<string, SubmissionOp>>(new Map());
/** Student+work pairs with a parked failure (needs the teacher). */
export const failedPairKeys = signal<Set<string>>(new Set());

export const pairKey = (op: { assignmentId: string; studentId: string }) => `${op.assignmentId}\u0000${op.studentId}`;

// These parked ops do NOT hold back later ones for the same cell: "superseded" means the server already
// has something the teacher did LATER, and "epoch_changed" ones are all waiting for the same review.
const NON_BLOCKING = new Set(["superseded", "epoch_changed"]);

type ResultListener = (r: SubmissionOpResult, op: SubmissionOp) => void;
const listeners = new Set<ResultListener>();
export function onResult(cb: ResultListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(r: SubmissionOpResult, op: SubmissionOp) {
  for (const cb of listeners) cb(r, op);
}

const byCreated = (a: OutboxItem, b: OutboxItem) => a.createdAt - b.createdAt;

async function refreshCounts() {
  const [ob, fl] = await Promise.all([outboxAll(), failedAll()]);
  pendingCount.value = ob.length;
  failedCount.value = fl.length;
  const latest = new Map<string, SubmissionOp>();
  for (const it of ob.slice().sort(byCreated)) latest.set(pairKey(it.payload), it.payload);
  pendingOps.value = latest;
  // a superseded op isn't a problem cell — the cell simply shows what the server has
  failedPairKeys.value = new Set(fl.filter((f) => f.reason !== "superseded").map((f) => pairKey(f.payload)));
}

// strictly increasing, so two ops for one student+work can never tie and swap
let lastCreated = 0;
function nextCreatedAt(): number {
  lastCreated = Math.max(Date.now(), lastCreated + 1);
  return lastCreated;
}

export async function enqueueSubmission(op: SubmissionOp) {
  // remember which data this was made against — after a restore it is held for review, not applied
  const payload: SubmissionOp = { ...op, dataEpoch: op.dataEpoch ?? dataEpoch.value ?? undefined };
  // throws if IndexedDB can't be written — caller must not show "saved"
  await outboxAdd({ opId: payload.opId, kind: "submission", payload, tries: 0, nextAt: 0, createdAt: nextCreatedAt() });
  await refreshCounts();
  void flush();
}

let running: Promise<void> | null = null;
let again = false;
const BACKOFF = [0, 1000, 3000, 8000, 20000, 60000];
const MAX_NO_VERDICT = 8;

/** Deliver what's queued. Resolves when the pass in progress (and any it was asked to repeat) is done. */
export function flush(): Promise<void> {
  if (syncPaused.value || authRequired.value) return Promise.resolve();
  if (running) { again = true; return running; } // queued mid-flight: the running flush goes round again
  syncing.value = true;
  running = (async () => {
    try {
      do {
        again = false;
        await flushPass();
      } while (again && !syncPaused.value && !authRequired.value);
    } catch {
      // storage refused a write: everything stays queued and the next tick retries
    } finally {
      await refreshCounts();
      syncing.value = false;
      running = null;
    }
  })();
  return running;
}

async function flushPass(): Promise<void> {
  const now = Date.now();
  const queue = (await outboxAll()).filter((i) => i.kind === "submission").sort(byCreated);

  // pairs already parked in `failed` — later ops for the same student+work
  // must not jump ahead of an unresolved failure
  const failedPairs = new Set((await failedAll()).filter((f) => !NON_BLOCKING.has(f.reason)).map((f) => pairKey(f.payload)));

  // Strict order per student+work: an op that is waiting out a backoff holds
  // back every LATER op for the same pair, otherwise 3 → 9 could arrive as 9 → 3
  // and the old score would win.
  const held = new Set<string>();
  const ready: OutboxItem[] = [];
  for (const it of queue) {
    const k = pairKey(it.payload);
    if (held.has(k)) continue;
    if (it.nextAt > now) { held.add(k); continue; }
    ready.push(it);
  }

  async function backOff(items: OutboxItem[]) {
    for (const item of items) {
      const tries = item.tries + 1;
      held.add(pairKey(item.payload));
      await outboxUpdate({ ...item, tries, nextAt: Date.now() + BACKOFF[Math.min(tries, BACKOFF.length - 1)] });
    }
  }

  for (let i = 0; i < ready.length; i += 50) {
    const send: OutboxItem[] = [];
    const deferred: OutboxItem[] = [];
    for (const it of ready.slice(i, i + 50)) {
      const k = pairKey(it.payload);
      if (held.has(k)) continue; // an earlier op of this pair just failed to land
      if (failedPairs.has(k)) deferred.push(it);
      else send.push(it);
    }
    // an op whose earlier sibling already failed goes straight to failed too
    if (deferred.length) await moveOutboxToFailed(deferred, "blocked_by_earlier_failure");
    if (send.length === 0) continue;

    try {
      const res = await api.post<{ results: SubmissionOpResult[] }>("/api/submissions/batch", {
        ops: send.map((c) => c.payload),
      });
      const byId = new Map(res.results.map((r) => [r.opId, r]));
      for (const item of send) {
        const r = byId.get(item.opId);
        if (!r) {
          // the server gave no verdict for this op — never assume it landed
          if (item.tries + 1 >= MAX_NO_VERDICT) { await moveOutboxToFailed([item], "no_response"); failedPairs.add(pairKey(item.payload)); }
          else await backOff([item]);
          continue;
        }
        if (r.result === "ok" || r.result === "duplicate") {
          await outboxRemove(item.opId);
        } else {
          // per-item rejection (not_in_class / invalid / full_score_changed / …)
          await moveOutboxToFailed([item], r.result);
          if (!NON_BLOCKING.has(r.result)) failedPairs.add(pairKey(item.payload));
        }
        emit(r, item.payload);
      }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const kind = classifyFailure(status);
      if (kind === "auth") {
        // keep everything; prompt re-login, then a later flush resumes
        authRequired.value = true;
        return;
      }
      if (kind === "failed") {
        await moveOutboxToFailed(send, e instanceof ApiError ? e.code : "error");
        for (const it of send) failedPairs.add(pairKey(it.payload));
        continue;
      }
      // transient: back off and stop this pass
      await backOff(send);
      return;
    }
  }
}

/** Call after a successful re-login to resume delivery. */
export function resumeAfterAuth() {
  authRequired.value = false;
  void flush();
  void flushAllDrafts();
}

/** Sign-out: nothing may be sent until the next sign-in (coming back online must not wake it). */
export function pauseSync() {
  syncPaused.value = true;
}
/** Sign-in: deliver whatever was kept while signed out. */
export function resumeSync() {
  syncPaused.value = false;
  authRequired.value = false;
  void flush();
  void flushAllDrafts();
}

export async function listFailed(): Promise<FailedItem[]> {
  return failedAll();
}
export async function discardFailed(opId: string) {
  await failedRemove(opId);
  await refreshCounts();
}
/**
 * Retry a failed item under a fresh opId (so the server treats it as new).
 * Everything parked for the same student+work goes back together, oldest first —
 * retrying only the newest would let an older score land after it. The move is
 * one transaction: if storage refuses, the failed items are still there.
 */
export async function retryFailed(opId: string) {
  const all = await failedAll();
  const target = all.find((f) => f.opId === opId);
  if (!target) return;
  const k = pairKey(target.payload);
  const chain = all
    .filter((f) => pairKey(f.payload) === k)
    .sort((a, b) => a.payload.clientTs - b.payload.clientTs || a.failedAt - b.failedAt);
  await moveFailedToOutbox(chain.map((f) => {
    const newId = "op_" + crypto.randomUUID();
    return {
      failedOpId: f.opId,
      // a retry is a NEW decision by the teacher: a new time (so it wins over whatever superseded it)
      // and the current data epoch
      item: {
        opId: newId, kind: "submission" as const,
        payload: { ...f.payload, opId: newId, clientTs: actionTime(), dataEpoch: dataEpoch.value ?? undefined },
        tries: 0, nextAt: 0, createdAt: nextCreatedAt(),
      },
    };
  }));
  await refreshCounts();
  void flush();
}

/** The network is back: drop the backoff on everything queued and try right now. */
async function expedite() {
  try { for (const it of await outboxAll()) if (it.nextAt > 0) await outboxUpdate({ ...it, nextAt: 0 }); } catch { /* next tick */ }
  void flush();
  void flushAllDrafts({ skipBackoff: true });
}

let started = false;
export function startOutbox() {
  if (started) return;
  started = true;
  refreshCounts();
  void refreshAttDraftCount();
  const kick = () => { void flush(); void flushAllDrafts(); };
  window.addEventListener("online", () => { online.value = true; void expedite(); });
  window.addEventListener("offline", () => { online.value = false; });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") kick(); });
  setInterval(() => {
    if (!navigator.onLine) return;
    kick();
    // the server could not be reached last time: ask it something tiny, so the badge goes green again by itself
    // as soon as it answers (any answer counts, even an error status)
    if (!serverReachable.value) fetch("/api/health", { cache: "no-store" }).then(() => { serverReachable.value = true; }, () => {});
  }, 15000);
  kick();
}

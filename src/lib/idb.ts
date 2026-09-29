import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SubmissionOp } from "@shared/types";

export interface OutboxItem {
  opId: string;
  kind: "submission";
  payload: SubmissionOp;
  tries: number;
  nextAt: number;
  createdAt: number;
}

export interface FailedItem {
  opId: string;
  payload: SubmissionOp;
  reason: string;
  failedAt: number;
}

export interface AttConflict {
  studentId: string;
  draft: { status: string };
  server: { status: string; updatedAt: number; deviceName: string | null };
}

// A tap the server could not take and that must NOT be thrown away or resent on its own —
// the teacher looks at it and decides (e.g. the student has since moved to another room).
export interface AttReviewRow {
  studentId: string;
  status: string;
  clientTs: number;
  method?: string;
  reason: "not_in_class" | "epoch_changed" | "before_school_year";
  at: number;
}

export interface AttDraftRow {
  status: string;
  clientTs: number; // when the teacher tapped/scanned — becomes the attendance time
  baseUpdatedAt: number | null; // server updated_at this edit was made against
  method?: string;
  opId?: string; // one per edit; a retry re-sends it, and an ack removes only the row it matches
  epoch?: number; // the data epoch the tap was made in (a restore bumps it)
}

export interface AttDraft {
  key: string; // date|classId|subjectId|period
  // the context the rows belong to — the sender uses THIS, never the page's current state
  ctx?: { date: string; classId: string; subjectId: string | null; period: number | null };
  rows: Record<string, AttDraftRow>;
  rev: number; // bumped on every edit
  updatedAt: number;
  // rows the server refused because another device changed them — held back until the teacher picks a side
  conflicts?: AttConflict[];
  // a permanent (non-retryable) refusal; no auto-resend until the teacher retries
  error?: string;
  // taps set aside for the teacher to look at (never dropped, never resent by themselves)
  review?: AttReviewRow[];
}

interface GkDB extends DBSchema {
  outbox: { key: string; value: OutboxItem };
  failed: { key: string; value: FailedItem };
  attDrafts: { key: string; value: AttDraft };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<GkDB>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<GkDB>("ngankrob", 2, {
      upgrade(d, oldVersion) {
        if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "opId" });
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (oldVersion < 2) {
          if (!d.objectStoreNames.contains("failed")) d.createObjectStore("failed", { keyPath: "opId" });
          if (!d.objectStoreNames.contains("attDrafts")) d.createObjectStore("attDrafts", { keyPath: "key" });
        }
      },
    });
  }
  return dbp;
}

// ---- failed submissions (permanent errors, kept for review) ---------------
export async function failedAdd(items: FailedItem[]) {
  const d = await db();
  const tx = d.transaction("failed", "readwrite");
  for (const it of items) await tx.store.put(it);
  await tx.done;
}
export async function failedAll(): Promise<FailedItem[]> {
  try { return await (await db()).getAll("failed"); } catch { return []; }
}
export async function failedRemove(opId: string) {
  try { await (await db()).delete("failed", opId); } catch { /* ignore */ }
}

/**
 * Move items outbox → failed in ONE transaction: either both stores change or
 * neither does, so a storage error can never drop an item between the two.
 */
export async function moveOutboxToFailed(items: OutboxItem[], reason: string) {
  const d = await db();
  const tx = d.transaction(["outbox", "failed"], "readwrite");
  const now = Date.now();
  try {
    for (const it of items) {
      await tx.objectStore("failed").put({ opId: it.opId, payload: it.payload, reason, failedAt: now });
      await tx.objectStore("outbox").delete(it.opId);
    }
    await tx.done;
  } catch (e) {
    abortTx(tx);
    throw e;
  }
}

/** Move items failed → outbox (under new op ids) in ONE transaction. */
export async function moveFailedToOutbox(moves: { failedOpId: string; item: OutboxItem }[]) {
  const d = await db();
  const tx = d.transaction(["outbox", "failed"], "readwrite");
  try {
    for (const m of moves) {
      await tx.objectStore("outbox").put(m.item);
      await tx.objectStore("failed").delete(m.failedOpId);
    }
    await tx.done;
  } catch (e) {
    abortTx(tx);
    throw e;
  }
}

// a half-done transaction must roll back, not commit whatever ran before the error
function abortTx(tx: { abort(): void; done: Promise<void> }) {
  try { tx.abort(); } catch { /* already finished */ }
  tx.done.catch(() => {});
}

// ---- attendance drafts ----------------------------------------------------
export async function draftGet(key: string): Promise<AttDraft | undefined> {
  try { return await (await db()).get("attDrafts", key); } catch { return undefined; }
}
export async function draftPut(draft: AttDraft) {
  try { await (await db()).put("attDrafts", draft); } catch { /* ignore */ }
}
export async function draftAll(): Promise<AttDraft[]> {
  try { return await (await db()).getAll("attDrafts"); } catch { return []; }
}
/**
 * Read-modify-write one draft inside a single transaction, so an edit made
 * while a save is acknowledging can never be lost. Return the new draft, or
 * null/undefined to delete it. Throws if storage can't be written — callers
 * must not show "saved" in that case.
 */
export async function draftUpdate(
  key: string,
  fn: (cur: AttDraft | undefined) => AttDraft | null | undefined,
): Promise<AttDraft | undefined> {
  const d = await db();
  const tx = d.transaction("attDrafts", "readwrite");
  try {
    const cur = await tx.store.get(key);
    const next = fn(cur);
    if (next) await tx.store.put(next);
    else if (cur) await tx.store.delete(key);
    await tx.done;
    return next ?? undefined;
  } catch (e) {
    abortTx(tx);
    throw e;
  }
}

export async function outboxAdd(item: OutboxItem) {
  // must surface a write failure so the UI never shows "saved" when it wasn't
  await (await db()).put("outbox", item);
}

export async function outboxAll(): Promise<OutboxItem[]> {
  try {
    return await (await db()).getAll("outbox");
  } catch {
    return [];
  }
}

export async function outboxRemove(opId: string) {
  try {
    await (await db()).delete("outbox", opId);
  } catch {
    /* ignore */
  }
}

export async function outboxUpdate(item: OutboxItem) {
  return outboxAdd(item);
}

export async function outboxCount(): Promise<number> {
  try {
    return await (await db()).count("outbox");
  } catch {
    return 0;
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return (await (await db()).get("kv", key)) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown) {
  try {
    await (await db()).put("kv", value, key);
  } catch {
    /* ignore */
  }
}

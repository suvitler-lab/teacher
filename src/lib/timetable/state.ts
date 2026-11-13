// Timetable state that the app store (src/store.ts) and the timetable store both touch. Kept free of imports from
// src/store.ts so the two can see each other without a cycle.
import { signal } from "@preact/signals";
import type { Slot, TimetablePayload } from "@shared/timetable";

/** One term's table as the screen holds it. `slots` is what is shown (it may carry changes still on their way). */
export interface TermTable {
  termId: string;
  rev: number; // the server version the last answer carried (sent back as baseRev)
  readOnly: boolean;
  slots: Slot[];
  confirmed: Slot[]; // what the server has, as of `rev` — a failed change puts this back
  pending: number; // changes shown but not yet confirmed
  loadedAt: number; // when this copy was fetched (ms) — the "ข้อมูลเมื่อ HH:MM" of offline reading
  source: "bootstrap" | "cache" | "server";
}

export interface LoadState {
  state: "loading" | "error";
  code?: string;
  message?: string;
}

export const ttTables = signal<Record<string, TermTable>>({});
export const ttLoad = signal<Record<string, LoadState>>({});
/** Terms that have at least one slot, from the last GET (drives "คัดลอกจากภาค …"). */
export const ttCounts = signal<{ termId: string; slots: number }[]>([]);

/** True once ttCounts came from a GET in this data epoch (bootstrap seeds a table but not the counts). */
export const ttCountsKnown = signal(false);

let seededEpoch: number | null | undefined; // the data epoch the tables belong to

export const tableOf = (termId: string | null | undefined): TermTable | null => (termId ? ttTables.value[termId] ?? null : null);

export function setTable(t: TermTable): void {
  ttTables.value = { ...ttTables.value, [t.termId]: t };
}

export function patchTable(termId: string, patch: Partial<TermTable>): void {
  const cur = ttTables.value[termId];
  if (cur) ttTables.value = { ...ttTables.value, [termId]: { ...cur, ...patch } };
}

export function tableFromPayload(p: TimetablePayload, at: number, source: TermTable["source"]): TermTable {
  return { termId: p.termId, rev: p.rev, readOnly: p.readOnly, slots: p.slots, confirmed: p.slots, pending: 0, loadedAt: at, source };
}

export function dropTablesExcept(termId: string | null): void {
  const keep = termId ? ttTables.value[termId] : undefined;
  ttTables.value = keep ? { [termId as string]: keep } : {};
}

/** Forget everything (sign-out, restore, tests). */
export function ttResetAll(): void {
  ttTables.value = {};
  ttLoad.value = {};
  ttCounts.value = [];
  ttCountsKnown.value = false;
  seededEpoch = undefined;
}

/**
 * `GET /api/bootstrap` carries the current term's table. A live copy replaces the term's table (unless a change of
 * ours is still on its way); a cached copy is read-only data from `at`. A new data epoch (a restore) drops every table.
 */
export function ttSeedBootstrap(p: TimetablePayload | null | undefined, o: { live: boolean; at: number; epoch: number | null }): void {
  if (seededEpoch !== undefined && seededEpoch !== o.epoch) {
    ttTables.value = {};
    ttLoad.value = {};
    ttCounts.value = [];
    ttCountsKnown.value = false;
  }
  seededEpoch = o.epoch;
  if (!p) return; // null = no term, undefined = an old server: leave what we have
  const cur = ttTables.value[p.termId];
  if (cur && cur.pending > 0) return;
  setTable(tableFromPayload(p, o.at, o.live ? "bootstrap" : "cache"));
}

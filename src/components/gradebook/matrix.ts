import { workState, countWorkStates, studentSummary, type WorkState, type WorkStateCounts, type StudentSummary } from "@shared/metrics";
import type { Assignment, SubmissionOp } from "@shared/types";
import { pairKey } from "../../lib/outbox";

/** One cell of the grid as the server (or this device's newer edit) says it is. */
export interface Sub { status: string; score: number | null; late: boolean; submittedAt?: number | null }
export type CellMark = "pend" | "fail" | "unsaved" | null;
/** A score the device could not even store (kept on screen, outlined red). */
export interface UnsavedScore { score: number | null }

export interface GbCell { sub: Sub | undefined; state: WorkState; mark: CellMark }

export interface MatrixInput {
  assignments: Assignment[];
  students: { id: string }[];
  /** what the server holds */
  subs: Map<string, Sub>;
  /** scores the device could not store, by `${aid}:${sid}` */
  unsaved: Map<string, UnsavedScore>;
  /** edits waiting in the outbox, by pairKey */
  pend: Map<string, SubmissionOp>;
  /** edits the server refused, by pairKey */
  failed: Set<string>;
  today: string;
}

/** 12:00 Bangkok of a received day, the moment the server stores for a day that is not today (shared/received-date). */
export const receivedNoon = (d: string | null | undefined): number | null => (d ? Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), 5) : null);

/**
 * What a cell shows = the server's value, unless this device has a newer edit still waiting to be sent — then that
 * edit wins, so reloading or switching class never shows 3 again while 9 is still in the queue.
 */
function resolveSub(server: Sub | undefined, unsavedScore: UnsavedScore | undefined, op: SubmissionOp | undefined): Sub | undefined {
  if (unsavedScore) return { status: "submitted", score: unsavedScore.score, late: server?.late ?? false, submittedAt: server?.submittedAt };
  if (!op) return server;
  if (op.status === "void") return undefined;
  if (op.status === "excused") return { status: "excused", score: null, late: server?.late ?? false };
  // a queued re-date shows its day at once (12:00 of that day is what the server will store)
  const at = op.dateOnly || op.receivedDate ? receivedNoon(op.receivedDate) ?? server?.submittedAt : server?.submittedAt;
  return { status: "submitted", score: op.score, late: server?.late ?? false, submittedAt: at };
}

/** Test hook: how many matrices were built, and how many of them had at least one cell. */
export const matrixStats = { builds: 0, filled: 0 };

export interface GbMatrix {
  /** the cell, or undefined when the pair is not part of the grid (use sub()/state()/mark() for a value that always answers) */
  cell(aid: string, sid: string): GbCell | undefined;
  sub(aid: string, sid: string): Sub | undefined;
  state(aid: string, sid: string, a: Assignment): WorkState;
  mark(aid: string, sid: string): CellMark;
  /** seat counts of one column (all students of the roster) */
  counts(aid: string): WorkStateCounts | undefined;
  /** seat counts of the whole grid */
  total: WorkStateCounts;
  /** this student is overdue on at least one work */
  missing(sid: string): boolean;
  /** the running total of one student over the works whose scores are showing */
  summary(sid: string): StudentSummary | undefined;
  /** rounded average score of one column; null when nobody has a score */
  average(aid: string): number | null | undefined;
}

/**
 * The state of every (assignment × student) pair, computed ONCE for the inputs given. Cells, column headers, totals,
 * the average row, the strip and the bottom cards all read from here instead of re-deriving the same answer
 * (a 44 × 23 table used to ask ~10,000 times per render, each time building key strings).
 */
export function buildMatrix(inp: MatrixInput): GbMatrix {
  const { assignments, students, subs, unsaved, pend, failed, today } = inp;
  matrixStats.builds++;
  if (assignments.length && students.length) matrixStats.filled++;

  const cells = new Map<string, GbCell>();
  const countsBy = new Map<string, WorkStateCounts>();
  const avgBy = new Map<string, number | null>();
  const missingSids = new Set<string>();
  const everyState: WorkState[] = [];

  const markFor = (k: string, pk: string): CellMark => (unsaved.has(k) ? "unsaved" : failed.has(pk) ? "fail" : pend.has(pk) ? "pend" : null);

  for (const a of assignments) {
    const states: WorkState[] = [];
    let sum = 0, n = 0;
    for (const st of students) {
      const k = `${a.id}:${st.id}`;
      const pk = pairKey({ assignmentId: a.id, studentId: st.id });
      const sub = resolveSub(subs.get(k), unsaved.get(k), pend.get(pk));
      const state = workState(sub ? { status: sub.status, score: sub.score, late: sub.late } : null, a, today);
      cells.set(k, { sub, state, mark: markFor(k, pk) });
      states.push(state);
      if (state === "missing") missingSids.add(st.id);
      if (sub && sub.score != null) { sum += sub.score; n++; }
    }
    countsBy.set(a.id, countWorkStates(states));
    avgBy.set(a.id, n ? Math.round((sum / n) * 10) / 10 : null);
    for (const s of states) everyState.push(s);
  }

  // the running total counts only the work whose scores are showing, so it never gives a hidden score away
  const visibleWork = assignments.filter((a) => a.publish_scores);
  const summaries = new Map<string, StudentSummary>();
  for (const st of students) {
    summaries.set(st.id, studentSummary(visibleWork, (i) => {
      const s = cells.get(`${visibleWork[i].id}:${st.id}`)?.sub;
      return s ? { status: s.status, score: s.score, late: s.late } : undefined;
    }, today));
  }

  // a pair outside the grid (a roster that changed under an open editor) still answers, from the same rules
  const sub = (aid: string, sid: string): Sub | undefined => {
    const c = cells.get(`${aid}:${sid}`);
    if (c) return c.sub;
    const k = `${aid}:${sid}`;
    return resolveSub(subs.get(k), unsaved.get(k), pend.get(pairKey({ assignmentId: aid, studentId: sid })));
  };
  return {
    cell: (aid, sid) => cells.get(`${aid}:${sid}`),
    sub,
    state: (aid, sid, a) => {
      const c = cells.get(`${aid}:${sid}`);
      if (c) return c.state;
      const s = sub(aid, sid);
      return workState(s ? { status: s.status, score: s.score, late: s.late } : null, a, today);
    },
    mark: (aid, sid) => {
      const c = cells.get(`${aid}:${sid}`);
      return c ? c.mark : markFor(`${aid}:${sid}`, pairKey({ assignmentId: aid, studentId: sid }));
    },
    counts: (aid) => countsBy.get(aid),
    total: countWorkStates(everyState),
    missing: (sid) => missingSids.has(sid),
    summary: (sid) => summaries.get(sid),
    average: (aid) => avgBy.get(aid),
  };
}

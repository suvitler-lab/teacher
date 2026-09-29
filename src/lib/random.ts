// Picking names at random — pure, so the rules are unit-tested.

export function shuffle<T>(a: T[], rand: () => number = Math.random): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export interface Picked<T> {
  picks: T[];
  /** the round's history after this draw */
  called: Set<string>;
}

/**
 * Draw `count` names from `pool`.
 *
 * With `noRepeat`, nobody is drawn twice until everybody has been: the people still
 * left are ALL used first, and only then does a new round start — the remaining places
 * are filled from the full pool (never someone who was just drawn) and that fill becomes
 * the start of the new round. So asking for 3 when 1 is left gives that 1 person plus 2
 * from a fresh round, instead of wiping the history and possibly repeating them.
 */
export function pickNext<T extends { id: string }>(
  pool: T[],
  count: number,
  called: Set<string>,
  noRepeat: boolean,
  rand: () => number = Math.random,
): Picked<T> {
  const n = Math.min(count, pool.length);
  if (n <= 0) return { picks: [], called };

  if (!noRepeat) {
    const picks = shuffle(pool, rand).slice(0, n);
    return { picks, called: new Set([...called, ...picks.map((p) => p.id)]) };
  }

  const remaining = pool.filter((p) => !called.has(p.id));
  if (remaining.length >= n) {
    const picks = shuffle(remaining, rand).slice(0, n);
    return { picks, called: new Set([...called, ...picks.map((p) => p.id)]) };
  }

  // the round runs out: use everyone left, then start a new round for the rest
  const rest = shuffle(remaining, rand);
  const usedNow = new Set(rest.map((p) => p.id));
  const fill = shuffle(pool.filter((p) => !usedNow.has(p.id)), rand).slice(0, n - rest.length);
  return { picks: [...rest, ...fill], called: new Set(fill.map((p) => p.id)) };
}

/** How many in the pool haven't been drawn yet this round. */
export function remainingInRound<T extends { id: string }>(pool: T[], called: Set<string>): number {
  return pool.filter((p) => !called.has(p.id)).length;
}

export type PoolBlocker = "none" | "loading" | "error" | "unchecked" | "nobody";

/**
 * Who can be drawn when "only those who came" is on.
 * The old rule fell back to the WHOLE class whenever nobody was marked present — which
 * drew absent students, and drew from a class that simply hadn't been checked yet.
 * Now each situation is named and nothing is silently swapped.
 */
export function attendancePool<T extends { id: string }>(
  all: T[],
  att: { status: "loading" | "ready" | "error"; marked: number; present: Set<string> },
): { pool: T[]; blocker: PoolBlocker } {
  if (att.status === "loading") return { pool: [], blocker: "loading" };
  if (att.status === "error") return { pool: [], blocker: "error" };
  if (att.marked === 0) return { pool: [], blocker: "unchecked" };
  const pool = all.filter((s) => att.present.has(s.id));
  return { pool, blocker: pool.length === 0 ? "nobody" : "none" };
}

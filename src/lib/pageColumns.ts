// Wide-screen card layout: how many columns a region holds and which card goes into which column.
// Pure functions (unit-tested); the measuring lives in components/PageCols.tsx.

export const MIN_COL = 26; // rem
export const GAP = 0.75; // rem

/** columns that fit in a region of `widthRem`, never more than `max` or the number of cards */
export function colsFor(widthRem: number, max: number, count: number, minCol = MIN_COL): number {
  const fit = Math.floor((widthRem + GAP) / (minCol + GAP));
  return Math.max(1, Math.min(max, count, fit));
}

/** keys in the teacher's order -> n columns; the next card goes to the column with the least weight so far (a tie = the leftmost) */
export function splitColumns<K extends string>(keys: K[], n: number, weightOf: (k: K) => number): K[][] {
  const cols = Array.from({ length: Math.max(1, n) }, () => ({ h: 0, keys: [] as K[] }));
  for (const k of keys) {
    let t = cols[0];
    for (const c of cols) if (c.h < t.h) t = c;
    t.keys.push(k);
    t.h += weightOf(k);
  }
  return cols.map((c) => c.keys);
}

/** card weight ~ height / 8rem: a small tile row, a medium card, a large list (static on purpose: cards must not jump when they load) */
export const W = { S: 1, M: 2, L: 4 } as const;

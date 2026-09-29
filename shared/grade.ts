// Pure decision for committing a gradebook cell edit — no DOM, unit-tested.
// Scores accept half points (0, 0.5, 7.5); reject negatives, over-full, and
// other fractions like 7.3.

export interface CellState {
  status: "submitted" | "excused" | "void";
  score: number | null;
}

export type CellCommit =
  | { kind: "noop" }
  | { kind: "set"; score: number }
  | { kind: "clear" } // submitted, awaiting score again
  | { kind: "error"; message: string };

export function isHalfStep(n: number): boolean {
  return Number.isFinite(n) && Math.round(n * 2) === n * 2;
}

export function decideCellCommit(
  initial: string,
  value: string,
  cur: CellState | undefined,
  full: number,
): CellCommit {
  const trimmed = value.trim();
  if (trimmed === initial.trim()) return { kind: "noop" };

  if (trimmed === "") {
    // blank only means something on a cell that currently holds a score
    if (cur && cur.status === "submitted" && cur.score != null) return { kind: "clear" };
    return { kind: "noop" };
  }

  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > full || !isHalfStep(n)) {
    return { kind: "error", message: `คะแนนต้อง 0–${full} (ทีละ 0.5)` };
  }
  return { kind: "set", score: n };
}

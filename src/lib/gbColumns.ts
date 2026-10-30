// Gradebook column choices, minimap and jump maths: pure helpers (no DOM, no clock).
// Hiding a column is a DISPLAY choice only. Nothing here computes a score; callers keep passing the FULL list of work
// to สะสม and to the group totals, and use `isShown` only to decide which columns to draw.

export const COLUMNS_STORAGE_KEY = "ngankrob.gb.columns";

export interface ColumnPrefs {
  /** type keys (type_id, "" = no type) whose columns are not drawn */
  hiddenTypes: string[];
  /** the สะสม column */
  showTotal: boolean;
  /** the "handed in" bar in each column header */
  showBars: boolean;
}
export const DEFAULT_COLUMN_PREFS: ColumnPrefs = { hiddenTypes: [], showTotal: true, showBars: true };

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** The saved choice for this device. Missing / refusing storage / junk → show everything, never an error. */
export function loadColumnPrefs(storage?: StorageLike | null): ColumnPrefs {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    const raw = s?.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_PREFS };
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ...DEFAULT_COLUMN_PREFS };
    if (!Array.isArray(v.hiddenTypes) || !v.hiddenTypes.every((x: unknown) => typeof x === "string")) return { ...DEFAULT_COLUMN_PREFS };
    if (typeof v.showTotal !== "boolean" || typeof v.showBars !== "boolean") return { ...DEFAULT_COLUMN_PREFS };
    return { hiddenTypes: [...new Set<string>(v.hiddenTypes)], showTotal: v.showTotal, showBars: v.showBars };
  } catch { return { ...DEFAULT_COLUMN_PREFS }; }
}
export function saveColumnPrefs(p: ColumnPrefs, storage?: StorageLike | null): void {
  try { (storage === undefined ? globalThis.localStorage : storage)?.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(p)); } catch { /* only the memory of the choice is lost */ }
}

export const typeKeyOf = (a: { type_id: string | null }) => a.type_id ?? "";

/**
 * Which type keys are really hidden, given the types present now. Stale keys (a type with no work here) are ignored,
 * and if that would hide every type present, nothing is hidden (an empty table is never the answer).
 */
export function effectiveHidden(prefs: ColumnPrefs, presentKeys: string[]): Set<string> {
  const hidden = new Set(prefs.hiddenTypes.filter((k) => presentKeys.includes(k)));
  if (presentKeys.length > 0 && hidden.size >= presentKeys.length) return new Set();
  return hidden;
}

export function makeIsShown<A extends { type_id: string | null }>(hidden: Set<string>): (a: A) => boolean {
  return (a) => !hidden.has(typeKeyOf(a));
}

/** Show / hide one type. The last type still showing cannot be hidden. */
export function toggleType(prefs: ColumnPrefs, key: string, presentKeys: string[]): ColumnPrefs {
  const hidden = effectiveHidden(prefs, presentKeys);
  if (hidden.has(key)) hidden.delete(key);
  else if (presentKeys.filter((k) => !hidden.has(k)).length > 1) hidden.add(key);
  else return prefs;
  return { ...prefs, hiddenTypes: [...hidden] };
}

/** "n/N": columns drawn out of all work (not counting สะสม). */
export function columnCounts<A extends { type_id: string | null }>(list: A[], isShown: (a: A) => boolean): { shown: number; total: number } {
  return { shown: list.filter(isShown).length, total: list.length };
}


/** Keep the FULL group (for totals) and the part of it that is drawn; groups with nothing drawn drop out. */
export function displayGroups<A, G extends { items: A[] }>(groups: G[], isShown: (a: A) => boolean): { group: G; shown: A[] }[] {
  return groups.map((group) => ({ group, shown: group.items.filter(isShown) })).filter((x) => x.shown.length > 0);
}

/** Jump buttons: one per type that has at least one column drawn, in order of first appearance. */
export function jumpTargets<A extends { id: string; type_id: string | null }>(list: A[], isShown: (a: A) => boolean): { typeKey: string; firstId: string; count: number }[] {
  const out = new Map<string, { typeKey: string; firstId: string; count: number }>();
  for (const a of list) {
    if (!isShown(a)) continue;
    const k = typeKeyOf(a);
    const cur = out.get(k);
    if (cur) cur.count++;
    else out.set(k, { typeKey: k, firstId: a.id, count: 1 });
  }
  return [...out.values()];
}

/** Scroll position that puts a column (its left edge in the scrolled content) right after the locked name column. */
export function jumpScrollLeft(colLeft: number, nameW: number, scrollWidth: number, clientWidth: number): number {
  const max = Math.max(0, scrollWidth - clientWidth);
  return Math.min(max, Math.max(0, Math.round(colLeft - nameW)));
}

export interface ScrollInfo { scrollLeft: number; clientWidth: number; scrollWidth: number; nameW: number; totW: number }

/** Every column fits: there is nothing to scroll, so no minimap. */
export const fitsAll = (s: Pick<ScrollInfo, "clientWidth" | "scrollWidth">) => s.scrollWidth <= s.clientWidth + 1;

/** Width of the part of the table that slides (all but the locked sides), and how much of it the frame shows. */
function slidingSpan(s: ScrollInfo) {
  const content = Math.max(1, s.scrollWidth - s.nameW - s.totW);
  const view = Math.min(content, Math.max(1, s.clientWidth - s.nameW - s.totW));
  return { content, view };
}

/** The "what you see now" frame on the minimap, as fractions (0..1) of the track. */
export function minimapWindow(s: ScrollInfo): { left: number; width: number } {
  const { content, view } = slidingSpan(s);
  const width = view / content;
  const left = Math.min(1 - width, Math.max(0, s.scrollLeft / content));
  return { left, width };
}

/** Where to scroll so the frame is centred on a pointer at `frac` (0..1) of the track. */
export function minimapScrollFor(frac: number, s: ScrollInfo): number {
  const { content, view } = slidingSpan(s);
  const f = Math.min(1, Math.max(0, Number.isFinite(frac) ? frac : 0));
  const max = Math.max(0, s.scrollWidth - s.clientWidth);
  return Math.min(max, Math.max(0, Math.round(f * content - view / 2)));
}

/** Edge shadows: is there more to the left / right? */
export function edgeState(s: ScrollInfo): { left: boolean; right: boolean } {
  const max = s.scrollWidth - s.clientWidth;
  return { left: s.scrollLeft > 1, right: max > 1 && s.scrollLeft < max - 1 };
}

export interface Segment { key: string; color: string; label: string }

/** One minimap stripe per DRAWN column; a folded group is one stripe in its colour. Order = table order. */
export function minimapSegments<A extends { id: string; title: string; type_id: string | null }, G extends { key: string; label: string; color: string }>(
  dgroups: { group: G; shown: A[] }[], isFolded: (g: G) => boolean, colorOf: (a: A) => string,
): Segment[] {
  const out: Segment[] = [];
  for (const { group, shown } of dgroups) {
    if (isFolded(group)) out.push({ key: `g:${group.key}`, color: group.color, label: group.label });
    else for (const a of shown) out.push({ key: a.id, color: colorOf(a), label: a.title });
  }
  return out;
}

// Gradebook column grouping: pure helpers (no DOM, no clock — `today` is passed in, Bangkok date from shared/time).
// Nothing here computes a score: the group total comes from shared/metrics (groupScoreTotal).

export type GroupMode = "none" | "type" | "month";
export const GROUP_MODES: GroupMode[] = ["none", "type", "month"];
export const DEFAULT_GROUP_MODE: GroupMode = "none";
// v2: gb-1a saved its own default ("type") under the old key, so a saved value there cannot be told from a real choice.
// A new key means everyone starts on the plain table, and only a choice made from now on is remembered.
export const GROUP_STORAGE_KEY = "ngankrob.gb.groupMode.v2";

export interface GroupableAsg { id: string; type_id: string | null; assigned_date: string | null }
export interface Group<A extends GroupableAsg> {
  key: string;      // type id ("" = no type) or YYYY-MM
  label: string;    // "ใบงาน" / "ก.ย."
  color: string;    // tint name (violet, aqua, …)
  items: A[];
}

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** The saved choice for this device. Storage missing / refusing / holding junk → the default, never an error. */
export function loadGroupMode(storage?: StorageLike | null): GroupMode {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    try { (s as { removeItem?: (k: string) => void } | null | undefined)?.removeItem?.("ngankrob.gb.groupMode"); } catch { /* the old gb-1a key is only clutter */ }
    const v = s?.getItem(GROUP_STORAGE_KEY);
    return (GROUP_MODES as string[]).includes(v ?? "") ? (v as GroupMode) : DEFAULT_GROUP_MODE;
  } catch { return DEFAULT_GROUP_MODE; }
}
export function saveGroupMode(mode: GroupMode, storage?: StorageLike | null): void {
  try { (storage === undefined ? globalThis.localStorage : storage)?.setItem(GROUP_STORAGE_KEY, mode); } catch { /* a full or blocked store only costs the memory of the choice */ }
}

/** YYYY-MM of an assigned date; "" when the work has none. */
export const monthKey = (iso: string | null) => (iso ?? "").slice(0, 7);

/**
 * Split the (already ordered) assignments into groups, in order of first appearance.
 * "none" gives a single group with `flat` semantics left to the caller (key "all").
 */
export function buildGroups<A extends GroupableAsg>(
  list: A[], mode: GroupMode,
  typeInfo: (typeId: string | null) => { name: string; color: string },
  monthLabel: (ym: string) => string,
): Group<A>[] {
  if (mode === "none") return list.length ? [{ key: "all", label: "ทุกงาน", color: "violet", items: list }] : [];
  const out = new Map<string, Group<A>>();
  for (const a of list) {
    const key = mode === "type" ? (a.type_id ?? "") : monthKey(a.assigned_date);
    let g = out.get(key);
    if (!g) {
      const t = typeInfo(a.type_id);
      g = mode === "type"
        ? { key, label: t.name, color: t.color, items: [] }
        : { key, label: monthLabel(key), color: "aqua", items: [] };
      out.set(key, g);
    }
    g.items.push(a);
  }
  return [...out.values()];
}

/**
 * Folded groups = only the ones the teacher folded herself (true = folded, false = open). Nothing folds by itself:
 * every group starts open, so no score is ever hidden behind a group total the teacher cannot edit.
 */
export function isCollapsed(key: string, overrides: Map<string, boolean>): boolean {
  return overrides.get(key) === true;
}

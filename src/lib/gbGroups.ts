// Gradebook column grouping: pure helpers (no DOM, no clock — `today` is passed in, Bangkok date from shared/time).
// Nothing here computes a score: the group total comes from shared/metrics (groupScoreTotal).

export type GroupMode = "none" | "type" | "month";
export const GROUP_MODES: GroupMode[] = ["none", "type", "month"];
export const DEFAULT_GROUP_MODE: GroupMode = "type";
export const GROUP_STORAGE_KEY = "ngankrob.gb.groupMode";

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

/** The date one month before `today` (YYYY-MM-DD), day clamped to the target month's length. Pure string/UTC arithmetic. */
export function oneMonthBefore(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return `${py}-${String(pm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * Which groups start folded: those whose every piece of work is older than one month (by assigned date, Bangkok
 * `today`). The teacher never lands on a fully folded table: if every group is old, the newest one stays open.
 */
// work with no assigned date counts as recent, so it is never folded away by age
export function defaultCollapsed<A extends GroupableAsg>(groups: Group<A>[], today: string): Set<string> {
  if (groups.length <= 1) return new Set();
  const cutoff = oneMonthBefore(today);
  const newest = (g: Group<A>) => g.items.reduce((m, a) => (((a.assigned_date ?? "9999-12-31") > m) ? (a.assigned_date ?? "9999-12-31") : m), "");
  const old = groups.filter((g) => newest(g) < cutoff);
  const set = new Set(old.map((g) => g.key));
  if (set.size === groups.length) {
    const keep = groups.reduce((best, g) => (newest(g) > newest(best) ? g : best), groups[0]);
    set.delete(keep.key);
  }
  return set;
}

/** Folded groups = the default, with the teacher's own taps on top (true = folded, false = open). */
export function isCollapsed(key: string, defaults: Set<string>, overrides: Map<string, boolean>): boolean {
  return overrides.has(key) ? overrides.get(key)! : defaults.has(key);
}

// The cards of a page: which are shown and in what order. One saved text per page (settings.<page>_cards, a JSON
// string) so the one teacher sees the same page on every device. Pure functions only: no DOM, no signals, no network.
// The home page, the scan page, the attendance page and the random-name page all use this one shape.

export interface CardLayout<K extends string = string> { v: 1; order: K[]; hidden: K[] }

export interface CardDef<K extends string = string> {
  /** Every card of the page, in the default order. */
  keys: readonly K[];
  /** Cards that start off: they repeat something already on the page or are only needed now and then. */
  off: readonly K[];
}

const unique = <T,>(xs: T[]) => xs.filter((x, i) => xs.indexOf(x) === i);

export function defaultLayout<K extends string>(d: CardDef<K>): CardLayout<K> {
  return { v: 1, order: [...d.keys], hidden: [...d.off] };
}

/**
 * Saved text -> a valid layout. Anything missing, not JSON or of another version gives the default.
 * Unknown keys and repeats are dropped; a card that did not exist when the layout was saved is added at the end
 * (shown, unless it is one of the cards that start off).
 */
export function parseLayout<K extends string>(d: CardDef<K>, raw: string | null | undefined): CardLayout<K> {
  if (!raw || !raw.trim()) return defaultLayout(d);
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return defaultLayout(d); }
  if (!j || typeof j !== "object" || Array.isArray(j)) return defaultLayout(d);
  const o = j as { v?: unknown; order?: unknown; hidden?: unknown };
  if (o.v !== 1 || !Array.isArray(o.order) || !Array.isArray(o.hidden)) return defaultLayout(d);
  const isKey = (k: unknown): k is K => typeof k === "string" && (d.keys as readonly string[]).includes(k);
  const order = unique(o.order.filter(isKey));
  const hidden = unique(o.hidden.filter(isKey));
  for (const k of d.keys) {
    if (!order.includes(k)) { order.push(k); if (d.off.includes(k)) hidden.push(k); }
  }
  return { v: 1, order, hidden: unique(hidden) };
}

export function serializeLayout<K extends string>(p: CardLayout<K>): string {
  return JSON.stringify({ v: 1, order: p.order, hidden: p.hidden });
}

export const isHiddenCard = <K extends string>(p: CardLayout<K>, k: K) => p.hidden.includes(k);

export function toggleLayoutCard<K extends string>(p: CardLayout<K>, k: K): CardLayout<K> {
  return { ...p, order: [...p.order], hidden: isHiddenCard(p, k) ? p.hidden.filter((x) => x !== k) : [...p.hidden, k] };
}

/** Move one card a step up (-1) or down (+1); at either end nothing changes. */
export function moveLayoutCard<K extends string>(p: CardLayout<K>, k: K, dir: -1 | 1): CardLayout<K> {
  const i = p.order.indexOf(k), j = i + dir;
  if (i < 0 || j < 0 || j >= p.order.length) return p;
  const order = [...p.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...p, order, hidden: [...p.hidden] };
}

export function visibleCards<K extends string>(p: CardLayout<K>): K[] {
  return p.order.filter((k) => !isHiddenCard(p, k));
}

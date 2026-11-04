// The cards of the home page: which are shown and in what order. Saved as one setting (settings.home_cards, a JSON
// string) so the one teacher sees the same page on every device. Pure functions only: no DOM, no signals, no network.

export const HOME_CARD_KEYS = ["open", "att", "follow", "due", "absent", "classes", "queue", "backup", "term"] as const;
export type HomeCardKey = (typeof HOME_CARD_KEYS)[number];

/** Off until the teacher turns them on: they repeat what the banner already says or are only needed now and then. */
const OFF_BY_DEFAULT: readonly HomeCardKey[] = ["classes", "queue", "backup", "term"];

export interface HomeCardPrefs { v: 1; order: HomeCardKey[]; hidden: HomeCardKey[] }

export function defaultHomeCards(): HomeCardPrefs {
  return { v: 1, order: [...HOME_CARD_KEYS], hidden: [...OFF_BY_DEFAULT] };
}

const isKey = (k: unknown): k is HomeCardKey => typeof k === "string" && (HOME_CARD_KEYS as readonly string[]).includes(k);
const unique = <T,>(xs: T[]) => xs.filter((x, i) => xs.indexOf(x) === i);

/**
 * Saved text -> a valid layout. Anything missing, not JSON or of another version gives the default.
 * Unknown keys and repeats are dropped; a card that did not exist when the layout was saved is added at the end
 * (shown, unless it is one of the cards that start off).
 */
export function parseHomeCards(raw: string | null | undefined): HomeCardPrefs {
  if (!raw || !raw.trim()) return defaultHomeCards();
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return defaultHomeCards(); }
  if (!j || typeof j !== "object" || Array.isArray(j)) return defaultHomeCards();
  const o = j as { v?: unknown; order?: unknown; hidden?: unknown };
  if (o.v !== 1 || !Array.isArray(o.order) || !Array.isArray(o.hidden)) return defaultHomeCards();
  const order = unique(o.order.filter(isKey));
  const hidden = unique(o.hidden.filter(isKey));
  for (const k of HOME_CARD_KEYS) {
    if (!order.includes(k)) { order.push(k); if (OFF_BY_DEFAULT.includes(k)) hidden.push(k); }
  }
  return { v: 1, order, hidden: unique(hidden) };
}

export function serializeHomeCards(p: HomeCardPrefs): string {
  return JSON.stringify({ v: 1, order: p.order, hidden: p.hidden });
}

export const isHidden = (p: HomeCardPrefs, k: HomeCardKey) => p.hidden.includes(k);

export function toggleCard(p: HomeCardPrefs, k: HomeCardKey): HomeCardPrefs {
  return { ...p, order: [...p.order], hidden: isHidden(p, k) ? p.hidden.filter((x) => x !== k) : [...p.hidden, k] };
}

/** Move one card a step up (-1) or down (+1); at either end nothing changes. */
export function moveCard(p: HomeCardPrefs, k: HomeCardKey, dir: -1 | 1): HomeCardPrefs {
  const i = p.order.indexOf(k), j = i + dir;
  if (i < 0 || j < 0 || j >= p.order.length) return p;
  const order = [...p.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...p, order, hidden: [...p.hidden] };
}

export function visibleOrder(p: HomeCardPrefs): HomeCardKey[] {
  return p.order.filter((k) => !isHidden(p, k));
}

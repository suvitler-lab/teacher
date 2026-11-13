// The cards each home layout lets the teacher show / hide / reorder ("ปรับหน้าหลัก", BR-12), and where they are kept.
// Each layout (ก ข ค) keeps its own list inside the one setting `home_cards` (as fields a / b / c, next to the old
// `order` / `hidden` that an app that was not updated still reads), so changing layout never loses the other layouts' choices.
// The parts that are locked in every layout (today's list, quick actions, the numbers ...) are not here: they cannot be turned off.
import type { Layout } from "./appearance";
import { appearance } from "./appearance";
import { settings } from "../store";
import { parseHomeCards } from "./homeCards";
import { savedLayoutCards, saveLayoutCards, resetLayoutCards } from "./homePrefs";

export type LayoutCardKey = "timetable" | "open" | "att" | "follow" | "due" | "absent" | "classes";

/** Cards that have a fixed place (the "ตารางสอน" strip under the header, D53): they can be turned on / off but never moved or reordered. */
export const FIXED_CARDS: readonly LayoutCardKey[] = ["timetable"];
export const isFixedCard = (k: LayoutCardKey) => FIXED_CARDS.includes(k);

export const LAYOUT_NAME: Record<Layout, string> = { a: "วันนี้ของครู", b: "แผงรายห้อง", c: "โฟกัสงานถัดไป" };
export const LAYOUT_LETTER: Record<Layout, string> = { a: "ก", b: "ข", c: "ค" };
/** "โครง ข แผงรายห้อง" */
export const layoutTitle = (l: Layout) => `โครง ${LAYOUT_LETTER[l]} ${LAYOUT_NAME[l]}`;

/** What each layout can show (BR-12), in the default order. */
export const LAYOUT_CARDS: Record<Layout, readonly LayoutCardKey[]> = {
  a: ["timetable", "open", "follow", "absent", "due", "classes"],   // ความคืบหน้ารายห้อง · ต้องติดตาม · ไม่มาวันนี้ · ครบกำหนด · ห้องของฉัน
  b: ["timetable", "follow", "absent"],                            // in the room detail
  c: ["timetable", "att", "open", "follow"],                       // มาเรียนวันนี้ · งานแต่ละห้อง · ต้องติดตาม
};

/** Off until the teacher turns them on: they repeat what another card already says. */
const OFF_BY_DEFAULT: Record<Layout, readonly LayoutCardKey[]> = { a: ["classes"], b: [], c: [] };

/** The part that cannot be turned off, said in words under the list (the old "ปิดไม่ได้: ต้องทำตอนนี้ · ปุ่มลัด · ตัวเลข 4 ช่อง"). */
export const LAYOUT_LOCKED: Record<Layout, string> = {
  a: "ลำดับงานวันนี้ · ปุ่มลัด · ตัวเลขสรุป",
  b: "ปุ่มลัด · แถบต้องทำ · แผงห้อง",
  c: "กล่องโฟกัส · ต่อจากนี้ · ปุ่มลัด",
};

/** Names in the drawer: a card keeps its key but may be called differently in each layout (the key "open" is a different card in ก and ค). */
const TT_CARD = { title: "ตารางสอน (ตอนนี้/ต่อไป)", icon: "calendar-event", desc: "แถบใต้หัวหน้าหลัก · ตำแหน่งตายตัว เปิด/ปิดได้อย่างเดียว" };
export const LAYOUT_CARD_META: Record<Layout, Partial<Record<LayoutCardKey, { title: string; icon: string; desc: string }>>> = {
  a: {
    timetable: TT_CARD,
    open: { title: "ความคืบหน้ารายห้อง", icon: "clipboard-list", desc: "ส่งแล้ว รอตรวจ ค้าง แยกตามห้อง" },
    follow: { title: "ต้องติดตาม", icon: "flag", desc: "นักเรียนที่ค้างส่งมากที่สุด จัดกลุ่มตามจำนวนชิ้น" },
    absent: { title: "ไม่มาวันนี้", icon: "user-x", desc: "ขาด ลา ป่วย สาย รายห้อง หลังเช็คชื่อ" },
    due: { title: "ครบกำหนด", icon: "calendar-due", desc: "งานที่ครบกำหนดวันนี้/พรุ่งนี้ ใครยังไม่ส่ง" },
    classes: { title: "ห้องของฉัน", icon: "school", desc: "จำนวนคน อัตราส่ง และมาเรียนรายห้อง" },
  },
  b: {
    timetable: TT_CARD,
    follow: { title: "ต้องติดตาม", icon: "flag", desc: "ในรายละเอียดห้อง: นักเรียนที่ค้างส่งมากที่สุดของห้องนั้น" },
    absent: { title: "ไม่มาวันนี้", icon: "user-x", desc: "ในรายละเอียดห้อง: ขาด ลา ป่วย สาย ของห้องนั้น" },
  },
  c: {
    timetable: TT_CARD,
    att: { title: "มาเรียนวันนี้", icon: "user-check", desc: "ห้องไหนเช็คแล้ว ยังเหลือใคร" },
    open: { title: "งานแต่ละห้อง", icon: "clipboard-list", desc: "งานที่เปิดรับและความคืบหน้าแยกตามห้อง" },
    follow: { title: "ต้องติดตาม", icon: "flag", desc: "นักเรียนที่ค้างส่งมากที่สุด" },
  },
};

export interface LayoutCardPrefs { order: LayoutCardKey[]; hidden: LayoutCardKey[] }

const unique = <T,>(xs: T[]) => xs.filter((x, i) => xs.indexOf(x) === i);

export function defaultLayoutCards(layout: Layout): LayoutCardPrefs {
  return { order: [...LAYOUT_CARDS[layout]], hidden: [...OFF_BY_DEFAULT[layout]] };
}

/**
 * The saved `{order, hidden}` of one layout -> a valid list for that layout. Missing or not an object gives the default;
 * keys the layout does not have (or repeats) are dropped; a card that did not exist when the list was saved is added at the end
 * (shown, unless it starts off).
 */
export function parseLayoutCards(layout: Layout, raw: unknown): LayoutCardPrefs {
  const known = LAYOUT_CARDS[layout];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultLayoutCards(layout);
  const o = raw as { order?: unknown; hidden?: unknown };
  if (!Array.isArray(o.order) || !Array.isArray(o.hidden)) return defaultLayoutCards(layout);
  const isKey = (k: unknown): k is LayoutCardKey => typeof k === "string" && (known as readonly string[]).includes(k);
  const order = unique(o.order.filter(isKey));
  const hidden = unique(o.hidden.filter(isKey));
  for (const k of known) {
    if (!order.includes(k)) { order.push(k); if (OFF_BY_DEFAULT[layout].includes(k)) hidden.push(k); }
  }
  return { order, hidden: unique(hidden) };
}

export const isLayoutCardHidden = (p: LayoutCardPrefs, k: LayoutCardKey) => p.hidden.includes(k);
export const visibleLayoutCards = (p: LayoutCardPrefs): LayoutCardKey[] => p.order.filter((k) => !p.hidden.includes(k));

export function toggleLayoutCard(p: LayoutCardPrefs, k: LayoutCardKey): LayoutCardPrefs {
  return { order: [...p.order], hidden: isLayoutCardHidden(p, k) ? p.hidden.filter((x) => x !== k) : [...p.hidden, k] };
}

/** Move one card a step up (-1) or down (+1) among the cards that can move; at either end nothing changes (a fixed card never moves and is never swapped). */
export function moveLayoutCard(p: LayoutCardPrefs, k: LayoutCardKey, dir: -1 | 1): LayoutCardPrefs {
  if (isFixedCard(k)) return p;
  const slots = p.order.map((x, idx) => (isFixedCard(x) ? -1 : idx)).filter((idx) => idx >= 0); // positions of the movable cards
  const at = slots.findIndex((idx) => p.order[idx] === k), to = at + dir;
  if (at < 0 || to < 0 || to >= slots.length) return p;
  const order = [...p.order];
  [order[slots[at]], order[slots[to]]] = [order[slots[to]], order[slots[at]]];
  return { order, hidden: [...p.hidden] };
}

/** The saved list of one layout, read from the settings (reading it inside a component keeps the component up to date). */
export function layoutCardsOf(layout: Layout): LayoutCardPrefs {
  const saved = savedLayoutCards(layout);
  if (saved !== undefined && saved !== null) return parseLayoutCards(layout, saved);
  // this layout was never set: start from what the teacher chose in the app before the redesign (the old whole-page order / hidden),
  // for the cards that have the same name here, so a card they hid does not come back by itself (R-3304)
  const raw = settings.value?.home_cards;
  if (!raw || !raw.trim()) return defaultLayoutCards(layout);
  const old = parseHomeCards(raw);
  const known = LAYOUT_CARDS[layout] as readonly string[];
  return parseLayoutCards(layout, { order: old.order.filter((k) => known.includes(k)), hidden: old.hidden.filter((k) => known.includes(k)) });
}

/** The layout on screen and its saved cards. */
export function currentLayoutCards(): { layout: Layout; prefs: LayoutCardPrefs } {
  const layout = appearance.value.layout;
  return { layout, prefs: layoutCardsOf(layout) };
}

/** Show the new list at once and save it for every device (a failed or offline save goes back and says why: the saver does that). */
export function saveLayoutPrefs(layout: Layout, p: LayoutCardPrefs): Promise<boolean> {
  return saveLayoutCards(layout, p);
}

/** "คืนค่าเริ่มต้น" of the layout in use only (G10). */
export function resetLayoutPrefs(layout: Layout): Promise<boolean> {
  return resetLayoutCards(layout);
}

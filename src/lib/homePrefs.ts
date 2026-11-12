import { computed } from "@preact/signals";
import { settings } from "../store";
import { api } from "./api";
import { err, ok } from "./notify";
import { parseHomeCards, serializeHomeCards, defaultHomeCards, type HomeCardPrefs } from "./homeCards";
import { hideSignal, setHide } from "./hideNames";
import type { Layout } from "./appearance";

/** The card layout the teacher chose (the same on every device: it lives in the settings). */
export const homeCards = computed(() => parseHomeCards(settings.value?.home_cards));

// One save at a time, in the order the teacher tapped: two fast taps must not reach the server swapped.
let chain: Promise<unknown> = Promise.resolve();
// What the server last confirmed, and how many saves are still on their way: a failed save goes back to the confirmed
// layout, never to a middle one that another failed save had shown (T-29 R-03).
let confirmed = "";
let inFlight = 0;

/**
 * Show the new layout at once, save it in the background. If the save fails (offline, server down) the page goes
 * back to what it was and says why, so the screen never claims a layout the other devices will not see.
 */
export function saveHomeCardsText(text: string): Promise<boolean> {
  const before = settings.value;
  if (!before) return Promise.resolve(false);
  if (inFlight === 0) confirmed = before.home_cards; // nothing pending: what is shown is what the server has
  inFlight++;
  settings.value = { ...before, home_cards: text };
  const run = async (): Promise<boolean> => {
    try {
      await api.put("/api/settings", { home_cards: text });
      confirmed = text;
      ok("บันทึกแล้ว · ใช้กับทุกเครื่อง");
      return true;
    } catch {
      // only undo our own change (a later tap has already replaced it), back to what the server confirmed
      if (settings.value && settings.value.home_cards === text) settings.value = { ...settings.value, home_cards: confirmed };
      err(navigator.onLine ? "บันทึกการปรับหน้าหลักไม่สำเร็จ" : "ออฟไลน์ — ปรับหน้าหลักได้เมื่อออนไลน์");
      return false;
    } finally {
      inFlight--;
    }
  };
  const p = chain.then(run, run);
  chain = p;
  return p;
}

/** The old whole-page card layout (the fields `order` / `hidden`); the per-layout fields a / b / c are kept as they are. */
export function saveHomeCards(next: HomeCardPrefs): Promise<boolean> {
  const obj = currentObject();
  return saveHomeCardsText(JSON.stringify({ ...obj, v: 1, order: next.order, hidden: next.hidden }));
}

/** The saved home_cards as an object that always carries the old fields (an old app on another device reads those). */
function currentObject(): Record<string, unknown> {
  const raw = settings.value?.home_cards;
  let o: unknown = null;
  if (raw && raw.trim()) { try { o = JSON.parse(raw); } catch { o = null; } }
  if (!o || typeof o !== "object" || Array.isArray(o)) return JSON.parse(serializeHomeCards(defaultHomeCards()));
  const base = o as Record<string, unknown>;
  if (base.v !== 1 || !Array.isArray(base.order) || !Array.isArray(base.hidden)) return { ...JSON.parse(serializeHomeCards(defaultHomeCards())), a: base.a, b: base.b, c: base.c };
  return { ...base };
}

/** The raw cards chosen for one layout (a / b / c): `{order, hidden}` as saved, or undefined when never set. */
export function savedLayoutCards(layout: Layout): unknown {
  return currentObject()[layout];
}

/** Save the cards of ONE layout. The other layouts and the old fields stay exactly as they are. */
export function saveLayoutCards(layout: Layout, cards: { order: string[]; hidden: string[] }): Promise<boolean> {
  return saveHomeCardsText(JSON.stringify({ ...currentObject(), [layout]: { order: cards.order, hidden: cards.hidden } }));
}

/** "คืนค่าเริ่มต้น" of the layout in use (G10): forget only that layout's cards; the others stay. */
export function resetLayoutCards(layout: Layout): Promise<boolean> {
  const obj = currentObject();
  delete obj[layout];
  return saveHomeCardsText(JSON.stringify(obj));
}

// ---- hide student names, home page (this device only) -----------------------------------------------------------
// The registry for every page lives in lib/hideNames.ts; the home page keeps its old exports here.
export const hideNames = hideSignal("home");
export function setHideNames(on: boolean) { setHide("home", on); }

import { signal, computed } from "@preact/signals";
import { settings } from "../store";
import { api } from "./api";
import { err, ok } from "./notify";
import { parseHomeCards, serializeHomeCards, type HomeCardPrefs } from "./homeCards";

/** The card layout the teacher chose (the same on every device: it lives in the settings). */
export const homeCards = computed(() => parseHomeCards(settings.value?.home_cards));

// One save at a time, in the order the teacher tapped: two fast taps must not reach the server swapped.
let chain: Promise<unknown> = Promise.resolve();

/**
 * Show the new layout at once, save it in the background. If the save fails (offline, server down) the page goes
 * back to what it was and says why, so the screen never claims a layout the other devices will not see.
 */
export function saveHomeCards(next: HomeCardPrefs): Promise<boolean> {
  const before = settings.value;
  if (!before) return Promise.resolve(false);
  const text = serializeHomeCards(next);
  const was = before.home_cards;
  settings.value = { ...before, home_cards: text };
  const run = async (): Promise<boolean> => {
    try {
      await api.put("/api/settings", { home_cards: text });
      ok("บันทึกแล้ว · ใช้ทุกเครื่อง");
      return true;
    } catch {
      // only undo our own change: a later tap has already replaced it
      if (settings.value && settings.value.home_cards === text) settings.value = { ...settings.value, home_cards: was };
      err(navigator.onLine ? "บันทึกการปรับหน้าหลักไม่สำเร็จ" : "ออฟไลน์ — ปรับหน้าหลักได้เมื่อออนไลน์");
      return false;
    }
  };
  const p = chain.then(run, run);
  chain = p;
  return p;
}

// ---- hide student names (this device only) ---------------------------------------------------------------------
// For when the iPad is mirrored to the classroom TV: the cards that name children show only counts. It is a choice
// for the screen in front of the teacher right now, so it is kept per device (like the text size), not in the settings.
const HIDE_KEY = "ngankrob-hide-names";

function loadHide(): boolean {
  try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
}
export const hideNames = signal<boolean>(loadHide());

export function setHideNames(on: boolean) {
  hideNames.value = on;
  try { if (on) localStorage.setItem(HIDE_KEY, "1"); else localStorage.removeItem(HIDE_KEY); } catch { /* private window: the choice lasts until reload */ }
}

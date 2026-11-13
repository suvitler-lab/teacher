// Hide student names (this device only) — one switch per page, for when the iPad is mirrored to the classroom TV (D44 / BR-52).
// Kept per device like the text size, not in the settings. The projector screen has its own switch (lib/projector.ts).
import { signal, type ReadonlySignal, type Signal } from "@preact/signals";

export type HidePage = "home" | "scan" | "attendance" | "random" | "gradebook" | "reports" | "students";
export const HIDE_PAGES: readonly HidePage[] = ["home", "scan", "attendance", "random", "gradebook", "reports", "students"];

/** Home keeps the key it always had ("1" or absent); the others write "1" / "0" so "never set" can be told apart. */
export const hideKey = (page: HidePage): string => (page === "home" ? "ngankrob-hide-names" : `ngankrob-hide-names-${page}`);

const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private window: the choice lasts until reload */ }
};
const write = (page: HidePage, on: boolean) => put(hideKey(page), page === "home" ? (on ? "1" : null) : on ? "1" : "0");

/** The value of a page: its own key; a page that was never set copies the home value once and writes it down at once. */
function load(page: HidePage): boolean {
  if (page === "home") return get(hideKey("home")) === "1";
  const own = get(hideKey(page));
  if (own === "1" || own === "0") return own === "1";
  const copy = get(hideKey("home")) === "1";
  write(page, copy);
  return copy;
}

const sigs = new Map<HidePage, Signal<boolean>>();
function sig(page: HidePage): Signal<boolean> {
  let s = sigs.get(page);
  if (!s) { s = signal(load(page)); sigs.set(page, s); }
  return s;
}

/** Is this page hiding names right now? Read `.value` inside a component to follow changes. */
export function hideSignal(page: HidePage): ReadonlySignal<boolean> { return sig(page); }

export function setHide(page: HidePage, on: boolean): void {
  sig(page).value = on;
  write(page, on);
}

/** The privacy switch in Settings: every page at once. Not the projector screen. */
export function setHideAll(on: boolean): void {
  for (const p of HIDE_PAGES) setHide(p, on);
}

/** After the saved device values were cleared (BR-60): read every page again from storage. */
export function reloadHideFromStorage(): void {
  for (const p of HIDE_PAGES) { const s = sigs.get(p); if (s) s.value = load(p); }
}

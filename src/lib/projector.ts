import { signal } from "@preact/signals";
import { notify } from "./notify";

// Projector mode: the page shown full screen on the classroom TV. Nothing personal is on it (no scores, no
// percentages, no absence words). Theme and text size are the teacher's choice and are kept on this device;
// whether the mode is ON lasts only for this browser tab (a reload of the page does not leave it on forever).

export type PjTheme = "dark" | "light";
export type PjSize = 1 | 2 | 3;

const ON_KEY = "ngankrob-projector";
const THEME_KEY = "ngankrob-pj-theme";
const SIZE_KEY = "ngankrob-pj-size";

const read = (store: "local" | "session", key: string): string | null => {
  try { return (store === "local" ? localStorage : sessionStorage).getItem(key); } catch { return null; }
};
const write = (store: "local" | "session", key: string, v: string | null) => {
  try { const s = store === "local" ? localStorage : sessionStorage; if (v === null) s.removeItem(key); else s.setItem(key, v); } catch { /* private window: lasts until reload */ }
};

export const projectorOn = signal<boolean>(read("session", ON_KEY) === "1");
export const pjTheme = signal<PjTheme>(read("local", THEME_KEY) === "light" ? "light" : "dark");
export const pjSize = signal<PjSize>((() => { const n = Number(read("local", SIZE_KEY)); return n === 1 || n === 3 ? n : 2; })());
/** "Hide children's names" on the TV (scan / attendance): the last child shows as a tick and a number only. Kept on this device. */
const HIDE_KEY = "ngankrob-pj-hide-names";
export const pjHideNames = signal<boolean>(read("local", HIDE_KEY) === "1");
export function setPjHideNames(on: boolean) { pjHideNames.value = on; write("local", HIDE_KEY, on ? "1" : null); }
/** The "hold the × button for a second" reminder shows after a short tap. */
export const pjHint = signal(false);

export function setPjTheme(t: PjTheme) { pjTheme.value = t; write("local", THEME_KEY, t); }
export function setPjSize(n: PjSize) { pjSize.value = n; write("local", SIZE_KEY, String(n)); }
export function startProjector() {
  projectorOn.value = true; write("session", ON_KEY, "1");
  notify("info", `เปิดโหมดฉายจอแล้ว · คะแนนและเปอร์เซ็นต์รายคนถูกซ่อน${pjHideNames.value ? " · ซ่อนชื่อเด็กด้วย" : ""}`);
}
export function exitProjector() { projectorOn.value = false; pjHint.value = false; write("session", ON_KEY, null); }

/** How long the exit button must be held (ms). A child's tap on the TV must not leave the mode. */
export const PJ_HOLD_MS = 1000;

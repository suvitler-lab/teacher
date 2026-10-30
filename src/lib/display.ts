// Per-device display settings: text size (14-24 px) and row density. Kept in localStorage like the theme,
// applied to <html> before the first paint so a reload never flashes the wrong size.
// All CSS is in rem / var(--row-h), so changing html's font-size rescales the whole app.
export type Density = "compact" | "normal" | "roomy";

export const FONT_MIN = 14;
export const FONT_MAX = 24;
export const FONT_STEP = 1;
export const FONT_TOUCH_DEFAULT = 18;
export const FONT_DESKTOP_DEFAULT = 16;
export const DENSITY_DEFAULT: Density = "normal";
/** Row/button height as a multiple of the text size (ux.md section 3). */
export const DENSITY_K: Record<Density, number> = { compact: 2.6, normal: 3.2, roomy: 3.9 };
export const DENSITY_LABEL: Record<Density, string> = { compact: "กระชับ", normal: "ปกติ", roomy: "โปร่ง" };
export const MIN_TAP = 44;

const FONT_KEY = "ngankrob-font-size";
const DENSITY_KEY = "ngankrob-density";

export function clampFont(n: number): number {
  if (!Number.isFinite(n)) return defaultFont(isCoarse());
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));
}

export function defaultFont(coarse: boolean): number {
  return coarse ? FONT_TOUCH_DEFAULT : FONT_DESKTOP_DEFAULT;
}

/** Stored text -> a valid size. Anything missing, non-numeric or out of range falls back to the default. */
export function parseFont(raw: string | null | undefined, coarse: boolean): number {
  if (raw == null || !/^\d{1,3}$/.test(raw.trim())) return defaultFont(coarse);
  const n = Number(raw);
  return n >= FONT_MIN && n <= FONT_MAX ? n : defaultFont(coarse);
}

export function parseDensity(raw: string | null | undefined): Density {
  return raw === "compact" || raw === "normal" || raw === "roomy" ? raw : DENSITY_DEFAULT;
}

/** Row height in px; never below 44 on a touch screen. */
export function rowHeightPx(fs: number, density: Density, coarse: boolean): number {
  const h = Math.round(fs * DENSITY_K[density]);
  return coarse ? Math.max(MIN_TAP, h) : h;
}

export function isCoarse(): boolean {
  try { return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches; } catch { return false; }
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private window / blocked storage */ }
}

export function getFontSize(): number { return parseFont(read(FONT_KEY), isCoarse()); }
export function getDensity(): Density { return parseDensity(read(DENSITY_KEY)); }

export function applyDisplay(fs: number, density: Density, root: HTMLElement = document.documentElement) {
  root.style.fontSize = `${fs}px`;
  root.style.setProperty("--fs", `${fs}px`);
  root.style.setProperty("--row-k", String(DENSITY_K[density]));
  root.setAttribute("data-density", density);
}

export function applyStoredDisplay() {
  applyDisplay(getFontSize(), getDensity());
}

/** Save + apply at once (no Save button). Returns the size actually used. */
export function setFontSize(n: number): number {
  const fs = clampFont(n);
  write(FONT_KEY, String(fs));
  applyDisplay(fs, getDensity());
  return fs;
}

export function resetFontSize(): number {
  try { localStorage.removeItem(FONT_KEY); } catch { /* ignore */ }
  const fs = defaultFont(isCoarse());
  applyDisplay(fs, getDensity());
  return fs;
}

export function setDensity(d: Density): Density {
  const v = parseDensity(d);
  write(DENSITY_KEY, v);
  applyDisplay(getFontSize(), v);
  return v;
}

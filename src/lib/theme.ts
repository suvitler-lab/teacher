// The theme is kept on this device as well as on the server, so a reload paints the right colours at once
// (before the server's settings arrive) instead of flashing the default.
export type ThemeChoice = "system" | "light" | "dark";
const KEY = "ngankrob-theme";

export function setThemeAttr(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

export function saveThemeLocal(theme: ThemeChoice) {
  try { localStorage.setItem(KEY, theme); } catch { /* private window / blocked storage */ }
}

export function applyStoredTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark" || t === "system") setThemeAttr(t);
  } catch { /* nothing stored */ }
}

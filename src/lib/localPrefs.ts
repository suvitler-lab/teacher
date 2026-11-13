// "Clear what this device remembers" (T-55, BR-60, SGQ4, D44).
// Removes only the localStorage keys that start with `ngankrob` and are a remembered choice of this device (text size,
// hide names per page, projector look, the "ting" sound, the sort / class a page remembered ...). It never touches:
//  - the outbox, drafts and the offline cache (IndexedDB / Cache Storage - not localStorage at all),
//  - the sign-in (cookie) and the device id / name (`gk_*` keys),
//  - copies of values that live on the server (theme, skin, layout): clearing the copy would only flash the wrong look
//    until the server answers, and the server value stays whatever happens here,
//  - the projector switch of this browser tab (sessionStorage).
import { applyStoredDisplay } from "./display";
import { pjTheme, pjSize, pjHideNames } from "./projector";
import { reloadHideFromStorage } from "./hideNames";

/** Keys that start with `ngankrob` but must NOT be cleared (copies of synced values). */
export const LOCAL_PREF_KEEP: readonly string[] = ["ngankrob-theme", "ngankrob-skin", "ngankrob-layout", "ngankrob-timetable"];

const PREFIX = "ngankrob";

/** Which keys of this storage the clear button would remove right now. */
export function localPrefKeys(storage: Storage | null = safeStorage()): string[] {
  if (!storage) return [];
  const out: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX) && !LOCAL_PREF_KEEP.includes(k)) out.push(k);
    }
  } catch { /* blocked storage: nothing to list */ }
  return out;
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

/** Remove the remembered choices and make the screen show the defaults at once. Returns the keys that were removed. */
export function clearLocalPrefs(storage: Storage | null = safeStorage()): string[] {
  const keys = localPrefKeys(storage);
  for (const k of keys) { try { storage?.removeItem(k); } catch { /* ignore */ } }
  // what is held in memory is read again from the (now empty) storage
  pjTheme.value = "dark";
  pjSize.value = 2;
  pjHideNames.value = false;
  reloadHideFromStorage();
  applyStoredDisplay();
  return keys;
}

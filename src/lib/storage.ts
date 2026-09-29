// Unsent scores and attendance drafts live in the browser's IndexedDB. Safari
// (iPad!) may wipe a site's storage after ~7 days without a visit unless the
// app is installed to the home screen or the storage is marked persistent.

/** Ask the browser to keep this site's data. Resolves to whether it will. */
export async function requestPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** null = the browser can't tell us. */
export async function isPersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null;
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

/** Running as an installed app (home-screen icon), not a browser tab. */
export function isInstalledApp(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  } catch {
    return false;
  }
}

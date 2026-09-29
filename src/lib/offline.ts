// Is THIS device ready to work with no network — and is a newer version waiting?
// The worker itself (public/sw.js) does the keeping; this only watches it and tells the screen.
import { signal } from "@preact/signals";

export type OfflineState =
  | "unsupported" // this page can't (no service worker in the browser, an insecure address, a dev build)
  | "preparing"   // the files are being downloaded (first visit)
  | "ready"       // everything is on this device: the app opens with no network
  | "update"      // a newer version is downloaded and waits for the teacher
  | "error";      // preparing failed — the reason is in offlineNote; it tries again on the next visit

export const offlineState = signal<OfflineState>("unsupported");
export const offlineNote = signal("");

/** What the screen shows, from what the registration says. (Only for a page that has a service worker at all.) */
export function offlineStateOf(s: { active: boolean; waiting: boolean; failed: boolean }): OfflineState {
  if (s.active && s.waiting) return "update";
  if (s.active) return "ready";
  return s.failed ? "error" : "preparing";
}

let reg: ServiceWorkerRegistration | null = null;
let failed = false;
let reloadWhenTaken = false;

function refresh() {
  if (!reg) return;
  offlineState.value = offlineStateOf({ active: reg.active?.state === "activated", waiting: !!reg.waiting, failed });
}

function watch(w: ServiceWorker | null) {
  if (!w) return;
  w.addEventListener("statechange", () => {
    if (w.state === "redundant") {
      if (!reg?.active) { failed = true; offlineNote.value = "ดาวน์โหลดไฟล์สำหรับใช้ออฟไลน์ไม่ครบ — ต่อเน็ตแล้วเปิดแอปใหม่อีกครั้ง"; }
      else offlineNote.value = "เวอร์ชันใหม่โหลดไม่ครบ — ใช้เวอร์ชันเดิมต่อ และจะลองใหม่เมื่อเปิดแอปครั้งหน้า";
    }
    refresh();
  });
}

/** Start the service worker (production build over https only) and follow its progress. */
export function initOffline(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  offlineState.value = "preparing";

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadWhenTaken) location.reload(); // the teacher chose to update: come back on the new version
    else refresh();
  });

  const start = () => {
    navigator.serviceWorker.register("/sw.js").then((r) => {
      reg = r;
      watch(r.installing);
      watch(r.waiting);
      r.addEventListener("updatefound", () => { watch(r.installing); refresh(); });
      refresh();
    }).catch((e) => {
      failed = true;
      offlineNote.value = "เตรียมใช้ออฟไลน์ไม่ได้: " + String(e?.message ?? e);
      offlineState.value = "error";
    });
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });

  // The browser only looks for a new version when a page is opened — a tablet left open all week would never see one.
  const look = () => { reg?.update().catch(() => {}); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") look(); });
  setInterval(look, 60 * 60 * 1000);
}

/** Take the waiting version now. The page reloads once it has taken over; unsent work lives in IndexedDB and stays. */
export function applyUpdate(): void {
  const waiting = reg?.waiting;
  if (!waiting) return;
  reloadWhenTaken = true;
  waiting.postMessage({ type: "SKIP_WAITING" });
}

// งานครบ · service worker — after the first visit the app opens and works with no network at all.
//
// The build (scripts/sw-precache.ts) fills in the two placeholders below: every file of THIS build, and a
// version derived from their content. Install downloads ALL of them into one cache; if any one fails the
// install fails as a whole and the previous version keeps serving — the cache is never half a release.
//
//  · pages (navigations): always this version's cached app shell. Instant, works offline, and always
//    consistent with the assets beside it. A new release arrives as a new service worker, not as a
//    "fresher" index.html mixed in with old assets.
//  · assets: from the cache; anything else same-origin (never /api) may go to the network.
//  · /api/*: never touched — the app's own outbox is what handles offline writes.
//  · an UPDATE waits until the teacher says so (the "มีเวอร์ชันใหม่" banner): swapping the files under a page
//    that is open would break its lazy chunks. A first install has nothing to protect and takes over at once.

const VERSION = "__BUILD_ID__";
const FILES = "__PRECACHE__";
const PREFIX = "ngankrob-";
const CACHE = PREFIX + VERSION;
const SHELL = "/__shell"; // the key the app shell (the answer for "/") is kept under
const PARALLEL = 4;       // a classroom wifi does not like 40 requests at once

// Vite names its output files by content (`index-CLZ3UQkT.css`): the same name is the same bytes, so a
// file the previous version already holds does not have to be downloaded again.
const HASHED = /^\/assets\/.+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

const isHtml = (res) => (res.headers.get("content-type") || "").includes("text/html");

/** A response that is safe to keep and to hand to a navigation: a redirected one is not allowed there. */
async function plain(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function download(url) {
  const res = await fetch(new Request(url, { cache: "reload" })); // past the browser's own HTTP cache
  if (!res.ok) throw new Error(url + " → " + res.status);
  return plain(res);
}

async function reuse(url) {
  if (!HASHED.test(url)) return null;
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || name === CACHE) continue;
    const hit = await (await caches.open(name)).match(url);
    if (hit) return hit;
  }
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.put(SHELL, await download("/"));
    const todo = Array.isArray(FILES) ? [...FILES] : [];
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      for (let url = todo.shift(); url; url = todo.shift()) {
        if (await cache.match(url)) continue; // an interrupted install picks up where it stopped
        const have = await reuse(url);
        const res = have ?? (await download(url));
        // the app's fallback answers a missing file with its HTML page — kept as a script it would break the app
        if (!have && isHtml(res)) throw new Error(url + " came back as a page");
        await cache.put(url, res);
      }
    }));
    // first install: nothing is open that could be broken, so start serving now. An update waits for the teacher.
    if (!self.registration.active) self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name); // includes the old "ngankrob-v1"
    }
    await self.clients.claim();
    for (const client of await self.clients.matchAll()) client.postMessage({ type: "ACTIVE", version: VERSION });
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return; // the network's business
  event.respondWith(req.mode === "navigate" ? page(req) : asset(req));
});

async function page(req) {
  const shell = await (await caches.open(CACHE)).match(SHELL);
  if (shell) return shell;
  try { return await fetch(req); } catch { return Response.error(); } // not installed yet: the network is all there is
}

async function asset(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && !isHtml(res)) cache.put(req, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  else if (data.type === "VERSION" && event.source) event.source.postMessage({ type: "VERSION", version: VERSION });
});

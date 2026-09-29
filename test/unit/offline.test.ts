// Round 3 — the app must open and keep working with no network after the first visit, and must never
// serve half a release. The real public/sw.js is run here against a small in-memory Cache/fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fillServiceWorker, precacheOf } from "../../scripts/sw-precache";
import { readFileSync } from "node:fs";
import { offlineStateOf } from "@client/lib/offline";
import { retryUntilReachable } from "@client/lib/reconnect";

const ORIGIN = "https://app.test";
const TEMPLATE = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");

const res = (body: string, type: string, status = 200) => new Response(body, { status, headers: { "content-type": type } });
const js = (body = "//js") => () => res(body, "text/javascript");
const html = (body = "<html>shell</html>") => () => res(body, "text/html");

class FakeCache {
  store = new Map<string, Response>();
  private key(r: unknown) { const u = typeof r === "string" ? r : (r as { url: string }).url; return u.replace(/^https?:\/\/[^/]+/, ""); }
  async match(r: unknown) { return this.store.get(this.key(r))?.clone(); }
  async put(r: unknown, response: Response) { this.store.set(this.key(r), response); }
  paths() { return [...this.store.keys()].sort(); }
}
class FakeCaches {
  all = new Map<string, FakeCache>();
  async open(name: string) { if (!this.all.has(name)) this.all.set(name, new FakeCache()); return this.all.get(name)!; }
  async keys() { return [...this.all.keys()]; }
  async delete(name: string) { return this.all.delete(name); }
}
class FakeRequest {
  url: string; method = "GET"; mode = "cors";
  constructor(url: string, public init?: unknown) { this.url = new URL(url, ORIGIN).href; }
}

type Pages = Record<string, () => Response>;

/** Run public/sw.js as the browser would, for a build that has `files` and is called `version`. */
function boot(o: { files: string[]; version: string; pages: Pages; active?: boolean; caches?: FakeCaches }) {
  const handlers: Record<string, (e: any) => void> = {};
  const caches = o.caches ?? new FakeCaches();
  const fetchLog: string[] = [];
  const skipWaiting = vi.fn();
  const claim = vi.fn(async () => {});
  const client = { postMessage: vi.fn() };
  const self = {
    addEventListener: (type: string, fn: (e: any) => void) => { handlers[type] = fn; },
    registration: { active: o.active ? {} : null },
    skipWaiting,
    clients: { claim, matchAll: async () => [client] },
  };
  const network = vi.fn(async (req: unknown) => {
    const p = new URL(typeof req === "string" ? req : (req as { url: string }).url, ORIGIN).pathname;
    fetchLog.push(p);
    const make = o.pages[p];
    return make ? make() : res("not found", "text/plain", 404);
  });
  const source = fillServiceWorker(TEMPLATE, o.files, o.version);
  new Function("self", "caches", "fetch", "location", "Response", "Request", source)(self, caches, network, { origin: ORIGIN }, Response, FakeRequest);

  const lifecycle = async (type: "install" | "activate") => {
    let done: Promise<unknown> = Promise.resolve();
    handlers[type]({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  };
  const fetchEvent = (url: string, init: { mode?: string; method?: string } = {}) => {
    let answered: Promise<Response> | undefined;
    handlers.fetch({
      request: { url: new URL(url, ORIGIN).href, method: init.method ?? "GET", mode: init.mode ?? "cors" },
      respondWith: (p: Promise<Response>) => { answered = Promise.resolve(p); },
    });
    return answered;
  };
  const message = (data: unknown, source?: unknown) => handlers.message({ data, source });
  return { caches, fetchLog, skipWaiting, claim, client, lifecycle, fetchEvent, message, network };
}

const FILES = ["/assets/index-AAAAAAAA.js", "/assets/index-BBBBBBBB.css", "/zxing/zxing_reader.wasm"];
const PAGES = (): Pages => ({
  "/": html(),
  "/assets/index-AAAAAAAA.js": js("//app"),
  "/assets/index-BBBBBBBB.css": () => res("body{}", "text/css"),
  "/zxing/zxing_reader.wasm": () => res("wasm", "application/wasm"),
});

describe("service worker: install", () => {
  it("downloads the shell and every file of the build into one cache named for the version", async () => {
    const sw = boot({ files: FILES, version: "v2", pages: PAGES() });
    await sw.lifecycle("install");
    const cache = sw.caches.all.get("ngankrob-v2")!;
    expect(cache.paths()).toEqual(["/__shell", ...FILES].sort());
    expect(await (await cache.match("/__shell"))!.text()).toContain("shell");
  });

  it("is all-or-nothing: one file that cannot be fetched fails the whole install (the old version keeps serving)", async () => {
    const pages = PAGES();
    delete pages["/assets/index-BBBBBBBB.css"];
    const sw = boot({ files: FILES, version: "v2", pages });
    await expect(sw.lifecycle("install")).rejects.toThrow(/index-BBBBBBBB\.css/);
    expect(sw.skipWaiting).not.toHaveBeenCalled();
  });

  it("refuses a missing file that the app's fallback answered with its HTML page", async () => {
    const pages = PAGES();
    pages["/assets/index-AAAAAAAA.js"] = html();
    const sw = boot({ files: FILES, version: "v2", pages });
    await expect(sw.lifecycle("install")).rejects.toThrow(/came back as a page/);
  });

  it("keeps the shell as a plain response even when the host answered with a redirect", async () => {
    const pages = PAGES();
    pages["/"] = () => Object.defineProperty(res("<html>redirected shell</html>", "text/html"), "redirected", { value: true });
    const sw = boot({ files: FILES, version: "v2", pages });
    await sw.lifecycle("install");
    const shell = (await sw.caches.all.get("ngankrob-v2")!.match("/__shell"))!;
    expect(shell.redirected).toBe(false);
    expect(await shell.text()).toContain("redirected shell");
  });

  it("does not download again what the previous version already holds under the same content-hashed name", async () => {
    const caches = new FakeCaches();
    (await caches.open("ngankrob-v1")).put("/assets/index-AAAAAAAA.js", js("//kept")());
    const sw = boot({ files: FILES, version: "v2", pages: PAGES(), caches });
    await sw.lifecycle("install");
    expect(sw.fetchLog).not.toContain("/assets/index-AAAAAAAA.js");
    expect(sw.fetchLog).toEqual(expect.arrayContaining(["/", "/assets/index-BBBBBBBB.css", "/zxing/zxing_reader.wasm"]));
    expect(await (await caches.all.get("ngankrob-v2")!.match("/assets/index-AAAAAAAA.js"))!.text()).toBe("//kept");
  });

  it("always re-downloads files whose names are not content hashes (a wasm or icon can change under one name)", async () => {
    const caches = new FakeCaches();
    (await caches.open("ngankrob-v1")).put("/zxing/zxing_reader.wasm", res("old wasm", "application/wasm"));
    (await caches.open("ngankrob-v1")).put("/icon-maskable.svg", res("old", "image/svg+xml")); // "-maskable." looks like a hash but is not under /assets
    const pages = { ...PAGES(), "/icon-maskable.svg": () => res("new", "image/svg+xml") };
    const sw = boot({ files: [...FILES, "/icon-maskable.svg"], version: "v2", pages, caches });
    await sw.lifecycle("install");
    expect(await (await caches.all.get("ngankrob-v2")!.match("/zxing/zxing_reader.wasm"))!.text()).toBe("wasm");
    expect(await (await caches.all.get("ngankrob-v2")!.match("/icon-maskable.svg"))!.text()).toBe("new");
  });

  it("a first install takes over at once; an update waits for the teacher", async () => {
    const first = boot({ files: FILES, version: "v1", pages: PAGES(), active: false });
    await first.lifecycle("install");
    expect(first.skipWaiting).toHaveBeenCalledTimes(1);

    const update = boot({ files: FILES, version: "v2", pages: PAGES(), active: true });
    await update.lifecycle("install");
    expect(update.skipWaiting).not.toHaveBeenCalled();
    update.message({ type: "SKIP_WAITING" }); // …until they say so
    expect(update.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("an interrupted install picks up where it stopped", async () => {
    const caches = new FakeCaches();
    (await caches.open("ngankrob-v2")).put("/assets/index-BBBBBBBB.css", res("already", "text/css"));
    const sw = boot({ files: FILES, version: "v2", pages: PAGES(), caches });
    await sw.lifecycle("install");
    expect(sw.fetchLog).not.toContain("/assets/index-BBBBBBBB.css");
  });
});

describe("service worker: activate", () => {
  it("drops every older version's cache (and the old un-versioned one), leaves other caches alone, and takes the open pages", async () => {
    const caches = new FakeCaches();
    for (const n of ["ngankrob-v1", "ngankrob-old", "ngankrob-v2", "somebody-else"]) await caches.open(n);
    const sw = boot({ files: FILES, version: "v2", pages: PAGES(), caches });
    await sw.lifecycle("activate");
    expect(await caches.keys()).toEqual(["ngankrob-v2", "somebody-else"]);
    expect(sw.claim).toHaveBeenCalled();
    expect(sw.client.postMessage).toHaveBeenCalledWith({ type: "ACTIVE", version: "v2" });
  });
});

describe("service worker: serving", () => {
  let sw: ReturnType<typeof boot>;
  beforeEach(async () => {
    sw = boot({ files: FILES, version: "v2", pages: PAGES() });
    await sw.lifecycle("install");
    sw.fetchLog.length = 0;
  });

  it("every page (whatever the address) is the cached shell — no network involved", async () => {
    for (const url of ["/", "/scan", "/index.html", "/?x=1"]) {
      const r = await sw.fetchEvent(url, { mode: "navigate" })!;
      expect(await r.text()).toContain("shell");
    }
    expect(sw.fetchLog).toEqual([]);
  });

  it("a navigation while the network is dead still opens the app", async () => {
    sw.network.mockRejectedValue(new TypeError("offline"));
    const r = await sw.fetchEvent("/", { mode: "navigate" })!;
    expect(r.ok).toBe(true);
  });

  it("precached assets come from the cache", async () => {
    sw.network.mockRejectedValue(new TypeError("offline"));
    const r = await sw.fetchEvent("/assets/index-AAAAAAAA.js")!;
    expect(await r.text()).toBe("//app");
  });

  it("an unknown asset goes to the network and is kept; an HTML answer for a missing file is not kept", async () => {
    sw.network.mockImplementation(async (req: any) => {
      const p = new URL(req.url).pathname;
      return p === "/extra.png" ? res("png", "image/png") : html()();
    });
    expect(await (await sw.fetchEvent("/extra.png")!).text()).toBe("png");
    expect(await sw.caches.all.get("ngankrob-v2")!.match("/extra.png")).toBeDefined();
    await (await sw.fetchEvent("/assets/gone-ZZZZZZZZ.js")!).text();
    expect(await sw.caches.all.get("ngankrob-v2")!.match("/assets/gone-ZZZZZZZZ.js")).toBeUndefined();
  });

  it("an asset that is neither cached nor reachable is a clean network error, not a crash", async () => {
    sw.network.mockRejectedValue(new TypeError("offline"));
    const r = await sw.fetchEvent("/never-seen.js")!;
    expect(r.type).toBe("error");
  });

  it("leaves the API, writes, the worker script and other origins entirely to the browser", () => {
    expect(sw.fetchEvent("/api/bootstrap")).toBeUndefined();
    expect(sw.fetchEvent("/scan", { method: "POST" })).toBeUndefined();
    expect(sw.fetchEvent("/sw.js")).toBeUndefined();
    expect(sw.fetchEvent("https://elsewhere.test/x.js")).toBeUndefined();
  });

  it("answers a version question, for the page that asks", () => {
    const source = { postMessage: vi.fn() };
    sw.message({ type: "VERSION" }, source);
    expect(source.postMessage).toHaveBeenCalledWith({ type: "VERSION", version: "v2" });
  });
});

describe("offline status shown to the teacher", () => {
  it.each([
    [{ active: false, waiting: false, failed: false }, "preparing"],
    [{ active: false, waiting: false, failed: true }, "error"],
    [{ active: true, waiting: false, failed: false }, "ready"],
    [{ active: true, waiting: false, failed: true }, "ready"],   // an update that failed does not un-ready what already works
    [{ active: true, waiting: true, failed: false }, "update"],
    [{ active: false, waiting: true, failed: false }, "preparing"], // nothing active yet: not ready, whatever waits
  ] as const)("%j → %s", (s, expected) => {
    expect(offlineStateOf(s)).toBe(expected);
  });
});

describe("retryUntilReachable", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("keeps trying while the server is out of reach and stops after the first success", async () => {
    const probe = vi.fn().mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    retryUntilReachable(probe, 1000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(probe).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(probe).toHaveBeenCalledTimes(3); // done — no more calls
  });

  it("tries the moment the browser says it is online, without waiting for the next tick", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    retryUntilReachable(probe, 60_000);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("never runs two probes at once", async () => {
    let release!: () => void;
    const probe = vi.fn(() => new Promise<void>((r) => { release = r; }));
    retryUntilReachable(probe, 1000);
    await vi.advanceTimersByTimeAsync(5000); // five ticks while the first probe is still waiting
    expect(probe).toHaveBeenCalledTimes(1);
    release();
  });

  it("stop() ends it", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("down"));
    const stop = retryUntilReachable(probe, 1000);
    await vi.advanceTimersByTimeAsync(2000);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe("build step: what goes into the offline list", () => {
  const dir = path.resolve(__dirname, "../../node_modules/.sw-precache-test");
  const put = (rel: string, body: string) => { const p = path.join(dir, rel); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, body); };
  beforeEach(() => {
    rmSync(dir, { recursive: true, force: true });
    put("index.html", "<html>");
    put("sw.js", TEMPLATE);
    put("_headers", "/*");
    put("assets/index-AAAAAAAA.js", "app");
    put("assets/index-AAAAAAAA.js.map", "map");
    put("assets/font-CCCCCCCC.woff2", "w2");
    put("assets/font-CCCCCCCC.woff", "w1");
    put("assets/font-CCCCCCCC.ttf", "ttf");
    put("zxing/zxing_reader.wasm", "wasm");
    put("manifest.webmanifest", "{}");
    put(".assetsignore", "_headers"); // Cloudflare's own file — it is in the build output but never served
    put("assets/.DS_Store", "x");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("lists what the app needs offline, and not maps, fallback font formats, host config, dotfiles, the worker or the shell page", () => {
    expect(precacheOf(dir, TEMPLATE).files).toEqual([
      "/assets/font-CCCCCCCC.woff2",
      "/assets/index-AAAAAAAA.js",
      "/manifest.webmanifest",
      "/zxing/zxing_reader.wasm",
    ]);
  });

  it("the version is stable for the same build and changes when any file — hashed or not — or the worker changes", () => {
    const base = precacheOf(dir, TEMPLATE).version;
    expect(precacheOf(dir, TEMPLATE).version).toBe(base);
    put("zxing/zxing_reader.wasm", "wasm v2");
    const wasm = precacheOf(dir, TEMPLATE).version;
    expect(wasm).not.toBe(base);
    put("index.html", "<html>changed");
    expect(precacheOf(dir, TEMPLATE).version).not.toBe(wasm);
    expect(precacheOf(dir, TEMPLATE + "// edit").version).not.toBe(precacheOf(dir, TEMPLATE).version);
  });

  it("the version does not depend on the worker file already being filled in (a rebuild in place gives the same id)", () => {
    const before = precacheOf(dir, TEMPLATE);
    put("sw.js", fillServiceWorker(TEMPLATE, before.files, before.version));
    expect(precacheOf(dir, TEMPLATE).version).toBe(before.version);
  });

  it("refuses a worker file that is not the template", () => {
    expect(() => fillServiceWorker("self.x = 1;", [], "v")).toThrow(/placeholders/);
  });
});

// Build step: turn public/sw.js into the service worker of THIS build — the list of every file to keep for
// offline use, and a version that changes exactly when any of them (or the worker itself) changes.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

const PLACEHOLDER_FILES = '"__PRECACHE__"';
const PLACEHOLDER_VERSION = '"__BUILD_ID__"';

/** Never worth sending to a phone: source maps, and the font formats a browser only asks for when it can't read woff2. */
const SKIP = /\.(map|ttf|woff|eot)$/;
/** Not fetched by the app (the shell is downloaded from "/", the worker updates itself, the rest are host config). */
const NEVER = new Set(["index.html", "sw.js", "_headers", "_redirects"]);
/**
 * Dotfiles (`.assetsignore`, `.DS_Store`…) are for the build and the host, never served: asking for one gets the app's
 * HTML page back, and an install that includes it could never succeed.
 */
const isDotfile = (url: string) => url.split("/").some((part) => part.startsWith("."));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Put the file list and version into the worker's source. Throws if the source is not the template. */
export function fillServiceWorker(source: string, files: string[], version: string): string {
  if (!source.includes(PLACEHOLDER_FILES) || !source.includes(PLACEHOLDER_VERSION)) {
    throw new Error("sw.js does not contain the __PRECACHE__ / __BUILD_ID__ placeholders");
  }
  return source.replace(PLACEHOLDER_FILES, JSON.stringify(files)).replace(PLACEHOLDER_VERSION, JSON.stringify(version));
}

/** The files to precache (as URLs) and the build id, for the output folder `out`. */
export function precacheOf(out: string, template: string): { files: string[]; version: string } {
  const all = walk(out)
    .map((p) => ({ p, url: "/" + relative(out, p).split(sep).join("/") }))
    .filter((f) => !isDotfile(f.url))
    .sort((a, b) => (a.url < b.url ? -1 : 1));
  const sha = createHash("sha256");
  sha.update(template);
  // every file counts towards the version — index.html and the unhashed ones (wasm, manifest, icons) included
  for (const f of all) if (f.url !== "/sw.js") sha.update(f.url + "\t" + createHash("sha1").update(readFileSync(f.p)).digest("hex") + "\n");
  const files = all
    .filter((f) => !NEVER.has(f.url.slice(1)) && !SKIP.test(f.url))
    .map((f) => f.url);
  return { files, version: sha.digest("hex").slice(0, 12) };
}

export function swPrecache(): Plugin {
  return {
    name: "ngankrob-sw-precache",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    writeBundle(options) {
      const out = options.dir;
      if (!out) return this.error("sw-precache: no output directory");
      const swPath = join(out, "sw.js");
      let template: string;
      try {
        template = readFileSync(swPath, "utf8");
      } catch {
        return this.error("sw-precache: sw.js is not in the build output (public/sw.js was not copied)");
      }
      const { files, version } = precacheOf(out, template);
      let filled: string;
      try {
        filled = fillServiceWorker(template, files, version);
      } catch (e) {
        return this.error("sw-precache: " + (e as Error).message);
      }
      writeFileSync(swPath, filled);
      const bytes = files.reduce((n, u) => n + statSync(join(out, u)).size, 0);
      console.log(`[sw-precache] version ${version} · ${files.length} files · ${(bytes / 1024).toFixed(0)} kB for offline use`);
    },
  };
}

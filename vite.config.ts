import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolve } from "node:path";
import { swPrecache } from "./scripts/sw-precache";

export default defineConfig({
  plugins: [preact(), cloudflare(), swPrecache()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "shared"),
      "@client": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist/client",
    sourcemap: false,
    target: "es2022",
    // Vite pastes files under 4 kB into the CSS as data: URLs. The site's Content-Security-Policy (public/_headers) has no
    // font-src, so it refuses a data: FONT — the small Cyrillic subset of IBM Plex was blocked on every load. Fonts stay
    // real files (which the offline worker keeps too); everything else keeps Vite's default.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf|eot)$/i.test(file) ? false : undefined),
  },
});

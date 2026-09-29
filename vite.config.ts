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
  },
});

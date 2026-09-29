import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";

const alias = {
  "@shared": path.resolve(__dirname, "shared"),
  "@client": path.resolve(__dirname, "src"),
};

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    resolve: { alias },
    test: {
      projects: [
        {
          // API + D1 integration, runs in the Workers runtime
          resolve: { alias },
          plugins: [
            cloudflareTest({
              miniflare: {
                compatibilityDate: "2025-09-01",
                compatibilityFlags: ["nodejs_compat"],
                d1Databases: ["DB"],
                bindings: {
                  SETUP_CODE: "test-code",
                  SESSION_PEPPER: "test-pepper",
                  TEST_MIGRATIONS: migrations,
                },
              },
            }),
          ],
          test: {
            name: "workers",
            include: ["test/api/**/*.test.ts"],
            setupFiles: ["./test/apply-migrations.ts"],
          },
        },
        {
          // pure logic + Preact component tests, run in jsdom
          resolve: { alias },
          test: {
            name: "dom",
            include: ["test/unit/**/*.test.{ts,tsx}"],
            environment: "jsdom",
            setupFiles: ["./test/dom-setup.ts"],
          },
        },
      ],
    },
  };
});

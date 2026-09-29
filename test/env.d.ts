/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    SETUP_CODE: string;
    SESSION_PEPPER: string;
    TEST_MIGRATIONS: unknown;
  }
}

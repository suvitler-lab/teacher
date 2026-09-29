import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";
import { reset } from "./api/helpers";

// Apply real migrations once, then reset all data before each test so tests
// are independent (pool-workers v4 no longer auto-isolates storage per test).
await applyD1Migrations(env.DB, (env as any).TEST_MIGRATIONS);

beforeEach(async () => {
  await reset();
});

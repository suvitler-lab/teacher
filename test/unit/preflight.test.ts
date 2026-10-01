// scripts/preflight.cjs — the checks that stop a deploy before it goes wrong. Each is run against a small copy of the
// files it reads, so a broken example is really broken.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pre = require("../../scripts/preflight.cjs");

const REPO = path.resolve(__dirname, "../..");
// a folder of its own per test: two runs at once (a watcher and a `npm test`) must not share one
let dir = "";
const put = (rel: string, body: string) => { const p = path.join(dir, rel); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, body); };
const GOOD_ID = "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b";

beforeEach(() => {
  dir = mkdtempSync(path.join(REPO, "node_modules", ".preflight-test-"));
  cpSync(path.join(REPO, "migrations"), path.join(dir, "migrations"), { recursive: true });
  mkdirSync(path.join(dir, "shared"));
  cpSync(path.join(REPO, "shared/types.ts"), path.join(dir, "shared/types.ts"));
  const pkg = readFileSync(path.join(REPO, "package.json"), "utf8");
  put("package.json", pkg);
  // the database the repo's own scripts migrate, whatever it is called (it was renamed when the data moved region)
  const DB_NAME = /migrations apply (\S+)/.exec(pkg)![1];
  put("wrangler.jsonc", `{
    // comments and trailing commas are fine, as for wrangler itself
    "name": "ngankrob",
    "d1_databases": [{ "binding": "DB", "database_name": "${DB_NAME}", "database_id": "${GOOD_ID}", "migrations_dir": "migrations", }],
  }`);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("preflight: source", () => {
  it("passes for the real repository's migrations and schema version", () => {
    expect(pre.checkMigrations(REPO)).toEqual([]);
  });

  it("wrangler config: a real database id passes", () => {
    expect(pre.checkWranglerConfig(dir)).toEqual([]);
  });

  it("wrangler config: the placeholder id stops the deploy and says what to run", () => {
    put("wrangler.jsonc", `{ "d1_databases": [{ "binding": "DB", "database_name": "kru-db", "database_id": "REPLACE_WITH_DATABASE_ID_FROM_wrangler_d1_create", "migrations_dir": "migrations" }] }`);
    const [p] = pre.checkWranglerConfig(dir);
    expect(p).toMatch(/placeholder database_id/);
    expect(p).toMatch(/wrangler d1 create kru-db/);
  });

  it("wrangler config: something that is not a database id is caught", () => {
    put("wrangler.jsonc", `{ "d1_databases": [{ "binding": "DB", "database_name": "kru-db", "database_id": "kru-db", "migrations_dir": "migrations" }] }`);
    expect(pre.checkWranglerConfig(dir).join()).toMatch(/is not a database id/);
  });

  it("wrangler config: migrating a different database than the one deployed is caught", () => {
    put("wrangler.jsonc", `{ "d1_databases": [{ "binding": "DB", "database_name": "other-db", "database_id": "${GOOD_ID}", "migrations_dir": "migrations" }] }`);
    expect(pre.checkWranglerConfig(dir).join()).toMatch(/migrates a different database/);
  });

  it("migrations: a gap in the numbering is caught", () => {
    rmSync(path.join(dir, "migrations/0003_term_dates.sql"));
    expect(pre.checkMigrations(dir).join()).toMatch(/expected a file numbered 0003/);
  });

  it("migrations: a schema version the app does not expect is caught (it would answer schema_mismatch to everyone)", () => {
    const types = readFileSync(path.join(dir, "shared/types.ts"), "utf8").replace(/SCHEMA_VERSION\s*=\s*\d+/, "SCHEMA_VERSION = 9");
    put("shared/types.ts", types);
    expect(pre.checkMigrations(dir).join()).toMatch(/expects 9/);
  });

  it("migrations: a migration that forgets to set the schema version is caught", () => {
    put("migrations/0008_forgot.sql", "ALTER TABLE meta ADD COLUMN note TEXT;");
    expect(pre.checkMigrations(dir).join()).toMatch(/0008_forgot\.sql does not set meta\.schema_version/);
  });
});

describe("preflight: build output", () => {
  const built = (o: { sw?: string; deploy?: object | null } = {}) => {
    put("dist/client/client/index.html", "<html>");
    put("dist/client/client/_headers", "/*");
    put("dist/client/client/sw.js", o.sw ?? `const VERSION = "abc";\nconst FILES = ["/assets/a-AAAAAAAA.js"];`);
    if (o.deploy !== null) put("dist/client/ngankrob/wrangler.json", JSON.stringify(o.deploy ?? { d1_databases: [{ binding: "DB", database_id: GOOD_ID }] }));
  };

  it("a complete build passes", () => {
    built();
    expect(pre.checkBuilt(dir)).toEqual([]);
  });

  it("a worker whose placeholders were never filled in is caught", () => {
    built({ sw: `const VERSION = "__BUILD_ID__";\nconst FILES = "__PRECACHE__";` });
    expect(pre.checkBuilt(dir).join()).toMatch(/placeholders/);
  });

  it("an offline list with nothing in it is caught", () => {
    built({ sw: `const VERSION = "abc";\nconst FILES = [];` });
    expect(pre.checkBuilt(dir).join()).toMatch(/lists no files/);
  });

  it("a missing deploy config, or one carrying the placeholder id, is caught", () => {
    built({ deploy: null });
    expect(pre.checkBuilt(dir).join()).toMatch(/wrangler\.json is missing/);
    built({ deploy: { d1_databases: [{ binding: "DB", database_id: "REPLACE_WITH_DATABASE_ID_FROM_wrangler_d1_create" }] } });
    expect(pre.checkBuilt(dir).join()).toMatch(/placeholder database_id/);
  });

  it("a font pasted into the CSS as a data: URL is caught — the site's CSP would refuse it", () => {
    built();
    put("dist/client/client/assets/index-AAAAAAAA.css", "@font-face{font-family:X;src:url(data:font/woff2;base64,d09GMgAB) format(\"woff2\")}");
    expect(pre.checkBuilt(dir).join()).toMatch(/font inlined as a data: URL/);
    put("dist/client/client/assets/index-AAAAAAAA.css", "@font-face{font-family:X;src:url(/assets/x-BBBBBBBB.woff2)} .i{background:url(data:image/svg+xml;base64,PHN2Zz4=)}");
    expect(pre.checkBuilt(dir)).toEqual([]); // an inlined IMAGE is allowed by the policy (img-src data:)
  });

  it("an empty folder reports everything that is missing rather than crashing", () => {
    expect(pre.checkBuilt(dir).length).toBeGreaterThanOrEqual(3);
  });
});

describe("preflight: a running deploy", () => {
  const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const healthy = { ok: true, schema: 6, db: { reachable: true, schema: 6, schemaOk: true }, config: { pepper: true, setupCode: true } };

  it("a healthy deploy passes", async () => {
    expect(await pre.checkHealth("https://x.test/", answer(healthy))).toEqual([]);
  });

  it("says a missing pepper in words, and how to set it", async () => {
    const p = await pre.checkHealth("https://x.test", answer({ ...healthy, ok: false, config: { pepper: false, setupCode: true } }, 503));
    expect(p.join()).toMatch(/SESSION_PEPPER is not set.*wrangler secret put SESSION_PEPPER/);
  });

  it("says an empty or old database in words, and what to run", async () => {
    expect((await pre.checkHealth("https://x.test", answer({ ...healthy, ok: false, db: { reachable: true, schema: null, schemaOk: true } }, 503))).join()).toMatch(/database is empty.*db:migrate:remote/);
    expect((await pre.checkHealth("https://x.test", answer({ ...healthy, ok: false, db: { reachable: true, schema: 4, schemaOk: false } }, 503))).join()).toMatch(/schema 4 but this build expects 6/);
  });

  it("says an unreachable database, an unreachable host and a wrong address plainly", async () => {
    expect((await pre.checkHealth("https://x.test", answer({ ...healthy, ok: false, db: { reachable: false, schema: null, schemaOk: false } }, 503))).join()).toMatch(/database is not reachable/);
    expect((await pre.checkHealth("https://x.test", vi.fn(async () => { throw new Error("ENOTFOUND"); }))).join()).toMatch(/cannot be reached: ENOTFOUND/);
    expect((await pre.checkHealth("https://x.test", vi.fn(async () => new Response("<html>", { status: 200 })))).join()).toMatch(/not with the app's JSON/);
  });
});

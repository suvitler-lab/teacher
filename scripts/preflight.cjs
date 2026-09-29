// Checks a deploy before it can go wrong — none of them needs a network or a secret, except `--health`.
//
//   node scripts/preflight.cjs            # the source: wrangler config, migrations, schema version
//   node scripts/preflight.cjs --built    # the build output: the offline worker is filled in, the deploy config is there
//   node scripts/preflight.cjs --health https://…workers.dev   # a running deploy: database, schema and secrets
//
// `npm run deploy` runs the first two around the build. Exit code 1 if anything is wrong, with what to do about it.
const fs = require("node:fs");
const path = require("node:path");

const PLACEHOLDER_ID = "REPLACE_WITH_DATABASE_ID_FROM_wrangler_d1_create";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

/** wrangler.jsonc → object (comments and trailing commas allowed, like wrangler itself) */
function parseJsonc(text) {
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => str || "");
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, "$1"));
}

/** wrangler.jsonc: a real database id, and the same database name the npm scripts migrate. */
function checkWranglerConfig(root) {
  const problems = [];
  let cfg;
  try { cfg = parseJsonc(read(root, "wrangler.jsonc")); } catch (e) { return ["wrangler.jsonc cannot be read: " + e.message]; }
  const db = (cfg.d1_databases || []).find((d) => d.binding === "DB");
  if (!db) return ["wrangler.jsonc has no D1 database bound as DB"];
  if (!db.database_id || db.database_id === PLACEHOLDER_ID) {
    problems.push("wrangler.jsonc still has the placeholder database_id — run `npx wrangler d1 create kru-db` and paste the id it prints (README, step 2)");
  } else if (!UUID.test(db.database_id)) {
    problems.push(`wrangler.jsonc: database_id "${db.database_id}" is not a database id (a UUID like 1b2c3d4e-…)`);
  }
  const scripts = JSON.parse(read(root, "package.json")).scripts || {};
  for (const name of ["db:migrate:remote", "db:migrate:local"]) {
    if (scripts[name] && !scripts[name].includes(` ${db.database_name} `)) {
      problems.push(`package.json "${name}" migrates a different database than wrangler.jsonc's "${db.database_name}"`);
    }
  }
  if (!db.migrations_dir) problems.push("wrangler.jsonc: the D1 binding has no migrations_dir");
  return problems;
}

/** migrations/: numbered without gaps, and the last one leaves the schema version the app expects. */
function checkMigrations(root) {
  const problems = [];
  const files = fs.readdirSync(path.join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) return ["migrations/ has no .sql files"];
  files.forEach((f, i) => {
    const want = String(i + 1).padStart(4, "0");
    if (!f.startsWith(want + "_")) problems.push(`migrations/: expected a file numbered ${want}_… at position ${i + 1}, found ${f} (a gap or a duplicate number)`);
  });
  const last = read(root, path.join("migrations", files[files.length - 1]));
  const set = [...last.matchAll(/UPDATE\s+meta\s+SET\s+value\s*=\s*'(\d+)'\s+WHERE\s+key\s*=\s*'schema_version'/gi)].pop();
  const appVersion = /export const SCHEMA_VERSION\s*=\s*(\d+)/.exec(read(root, "shared/types.ts"));
  if (!set) problems.push(`${files[files.length - 1]} does not set meta.schema_version — every migration must`);
  else if (!appVersion) problems.push("shared/types.ts has no SCHEMA_VERSION");
  else if (set[1] !== appVersion[1]) {
    problems.push(`the last migration leaves schema_version ${set[1]} but the app (shared/types.ts SCHEMA_VERSION) expects ${appVersion[1]} — a deploy would answer schema_mismatch to everyone`);
  }
  return problems;
}

/** The build output: the offline worker was filled in, and the deploy config wrangler will read exists. */
function checkBuilt(root) {
  const problems = [];
  const sw = "dist/client/client/sw.js";
  if (!exists(root, sw)) problems.push(`${sw} is missing — the build did not produce the offline worker`);
  else {
    const text = read(root, sw);
    if (/"__(PRECACHE|BUILD_ID)__"/.test(text)) problems.push(`${sw} still has its placeholders — the offline list was not filled in (scripts/sw-precache.ts did not run)`);
    const files = /const FILES = (\[.*\]);/.exec(text);
    if (files) { try { if (JSON.parse(files[1]).length === 0) problems.push(`${sw} lists no files to keep offline`); } catch { problems.push(`${sw}: the file list is not valid`); } }
  }
  for (const f of ["dist/client/client/index.html", "dist/client/client/_headers"]) {
    if (!exists(root, f)) problems.push(`${f} is missing from the build`);
  }
  const deployCfg = "dist/client/ngankrob/wrangler.json";
  if (!exists(root, deployCfg)) problems.push(`${deployCfg} is missing — \`npm run deploy\` reads it`);
  else {
    try {
      const id = (JSON.parse(read(root, deployCfg)).d1_databases || []).find((d) => d.binding === "DB")?.database_id;
      if (!id || id === PLACEHOLDER_ID) problems.push(`${deployCfg} carries the placeholder database_id`);
    } catch { problems.push(`${deployCfg} cannot be read`); }
  }
  return problems;
}

/** A running deploy: GET <base>/api/health. Says what is wrong in words; never prints a secret (there is none in the answer). */
async function checkHealth(base, fetchImpl = fetch) {
  const problems = [];
  let res;
  try { res = await fetchImpl(base.replace(/\/+$/, "") + "/api/health"); } catch (e) { return [`${base} cannot be reached: ${e.message}`]; }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!body) return [`${base}/api/health answered ${res.status} but not with the app's JSON — is this the right address?`];
  if (!body.db?.reachable) problems.push("the database is not reachable from the Worker (wrangler.jsonc database_id, or the database was not created)");
  else if (body.db.schema === null) problems.push("the database is empty — run `npm run db:migrate:remote`");
  else if (!body.db.schemaOk) problems.push(`the database is on schema ${body.db.schema} but this build expects ${body.schema} — run \`npm run db:migrate:remote\``);
  if (!body.config?.pepper) problems.push("SESSION_PEPPER is not set — `npx wrangler secret put SESSION_PEPPER` (nobody can sign in or be set up until it is)");
  if (!body.config?.setupCode && body.db?.reachable) problems.push("SETUP_CODE is not set — needed once, to create the teacher's password (ignore if the account already exists)");
  return problems;
}

function report(title, problems) {
  if (problems.length === 0) { console.log(`✔ ${title}`); return true; }
  console.error(`✘ ${title}`);
  for (const p of problems) console.error("   - " + p);
  return false;
}

async function main(argv, root = path.resolve(__dirname, "..")) {
  const healthAt = argv.indexOf("--health");
  if (healthAt >= 0) {
    const base = argv[healthAt + 1];
    if (!base) { console.error("usage: preflight.cjs --health https://your-app.workers.dev"); return 2; }
    return report(`health of ${base}`, await checkHealth(base)) ? 0 : 1;
  }
  if (argv.includes("--built")) return report("build output", checkBuilt(root)) ? 0 : 1;
  const ok = [report("wrangler.jsonc", checkWranglerConfig(root)), report("migrations and schema version", checkMigrations(root))];
  if (ok.every(Boolean)) console.log("\nBefore deploying: download a backup (Settings), and run `npm run db:migrate:remote` if migrations/ changed.");
  return ok.every(Boolean) ? 0 : 1;
}

module.exports = { checkWranglerConfig, checkMigrations, checkBuilt, checkHealth, parseJsonc, main };

if (require.main === module) main(process.argv.slice(2)).then((code) => process.exit(code));

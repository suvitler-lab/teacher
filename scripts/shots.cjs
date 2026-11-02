// Screenshots of the app at every target device (docs/team/context.md "## อุปกรณ์เป้าหมาย"): starts the fictional fixture,
// runs the dev-team skill's shots.mjs against docs/team/pages.json, stops the fixture. No browser code lives here.
//
//   npm run build && node scripts/shots.cjs --label before|after [--job <dir>] [--assets <dir>] [--pages <file>] [--port <n>] [--out <dir>] [--devices k1,k2]
//
// Defaults: job = docs/team/jobs/2026-10-31-fix-fill-and-portrait, port 4101, assets = dist/client/client (--assets: another build, e.g. main).
// Output: <job>/evidence/shots/<label>/<page>-<WxH>.png (git-ignored; PNG never goes in the repo).
// Env: SHOTS_BROWSER=<exe> picks the browser; DEV_TEAM_SKILL_DIR=<dir> locates the skill. No browser -> message + exit code 2.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { startFixtureServer } = require("./fixture-server.cjs");

const root = path.resolve(__dirname, "..");
const arg = (name, d) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const label = arg("--label", "after");
const job = path.resolve(root, arg("--job", "docs/team/jobs/2026-10-31-fix-fill-and-portrait"));
const pages = path.resolve(root, arg("--pages", "docs/team/pages.json"));
const assets = path.resolve(root, arg("--assets", "dist/client/client"));
const port = Number(arg("--port", "4101"));
const skillDir = process.env.DEV_TEAM_SKILL_DIR || path.join(os.homedir(), ".claude/skills/dev-team");
const shotsMjs = path.join(skillDir, "scripts/shots.mjs");

function fail(msg, code = 1) { console.error("FAILED: " + msg); process.exit(code); }

async function main() {
  if (!["before", "after"].includes(label)) fail("--label must be before or after");
  if (process.env.SHOTS_BROWSER && !fs.existsSync(process.env.SHOTS_BROWSER)) fail(`SHOTS_BROWSER points to a missing file: ${process.env.SHOTS_BROWSER} (install Chrome or Edge, or fix the path)`, 2);
  if (!fs.existsSync(shotsMjs)) fail(`shots.mjs not found at ${shotsMjs} (set DEV_TEAM_SKILL_DIR)`);
  if (!fs.existsSync(path.join(assets, "index.html"))) fail(`no build at ${assets} - run npm run build first`);
  if (!fs.existsSync(pages)) fail(`pages file missing: ${pages}`);
  const srv = await startFixtureServer({ port, assetsDir: assets, layout: true });
  let code = 1;
  try {
    const args = [shotsMjs, "--job", job, "--pages", pages, "--label", label, "--url", srv.url, "--project", root];
    if (arg("--out")) args.push("--out", path.resolve(root, arg("--out")));
    if (arg("--devices")) args.push("--devices", arg("--devices"));
    if (process.env.SHOTS_BROWSER) args.push("--browser", process.env.SHOTS_BROWSER);
    code = await new Promise((res) => spawn(process.execPath, args, { stdio: "inherit" }).on("exit", (c) => res(c ?? 1)).on("error", () => res(1)));
  } finally {
    await srv.close();
  }
  process.exit(code);
}

main().catch((e) => fail(e.message));

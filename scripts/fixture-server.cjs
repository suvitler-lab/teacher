// Disposable app server for browser checks: the real built assets (dist/client/client) and the real worker code,
// on an in-memory D1 filled with fictional students. Never reads .dev.vars, a real database or the network.
//
//   npm run build && node scripts/fixture-server.cjs        # by hand: http://127.0.0.1:5194
//   node scripts/offline-e2e.cjs                             # uses startFixtureServer() in-process
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const Module = require("node:module");
const ts = require("typescript");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

const root = path.resolve(__dirname, "..");
const PASSWORD = "FixturePassword2026";
const EMAIL = "fixture@example.com";

// run the worker's TypeScript directly (it imports "@shared/…")
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolveFilename.call(this, name.startsWith("@shared/") ? path.join(root, "shared", name.slice(8) + ".ts") : name, ...args);
};
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      fileName: f,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
};

/** public/_headers the way the host applies it: every matching block counts, later ones win per header. */
function headerRules(file) {
  const rules = [];
  let cur = null;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) { cur = { pattern: raw.trim(), headers: {} }; rules.push(cur); continue; }
    const m = /^\s+([^:]+):\s*(.+)$/.exec(raw);
    if (m && cur) cur.headers[m[1].trim()] = m[2].trim();
  }
  return rules;
}
const matches = (pattern, pathname) =>
  pattern.endsWith("*") ? pathname.startsWith(pattern.slice(0, -1)) : pattern === pathname;

/**
 * Wrap a D1 binding so every round trip to it costs `latency.ms` (like a database on another continent) and is
 * counted. A batch is ONE round trip, as on the real thing. Statements stay real objects; only the methods that
 * actually go to the database (first / all / run / raw / batch) are delayed.
 */
function timedDb(DB, latency, stats) {
  const real = new WeakMap(); // wrapper -> real statement (batch() needs the real ones)
  const trip = async (label, fn) => {
    stats.count++; stats.log.push(label);
    if (latency.ms > 0) await new Promise((r) => setTimeout(r, latency.ms));
    return fn();
  };
  const wrapStmt = (stmt, sql) => {
    const w = new Proxy(stmt, {
      get(t, prop) {
        if (prop === "bind") return (...a) => wrapStmt(t.bind(...a), sql);
        if (["first", "all", "run", "raw"].includes(prop)) return (...a) => trip(String(sql).replace(/\s+/g, " ").slice(0, 70), () => t[prop](...a));
        const v = Reflect.get(t, prop);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    real.set(w, stmt);
    return w;
  };
  return new Proxy(DB, {
    get(t, prop) {
      if (prop === "prepare") return (sql) => wrapStmt(t.prepare(sql), sql);
      if (prop === "batch") return (stmts) => trip(`batch(${stmts.length})`, () => t.batch(stmts.map((x) => real.get(x) ?? x)));
      const v = Reflect.get(t, prop);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

async function startFixtureServer({
  port = 5194,
  assetsDir = path.join(root, "dist/client/client"),
  headersFile = path.join(root, "public/_headers"),
  seed = true, // false: an empty school (only the migrations' defaults), for first-run checks
} = {}) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("fixture"); } }',
    compatibilityDate: "2025-09-01", d1Databases: ["DB"], d1Persist: false, cf: false,
  }));
  const DB = await mf.getD1Database("DB");
  const latency = { ms: 0 };                 // per D1 round trip, settable at run time (setDbLatency)
  const stats = { count: 0, log: [] };       // D1 round trips since resetDbStats()
  const env = { DB, SETUP_CODE: "fixture-setup", SESSION_PEPPER: "fixture-pepper-not-secret" };
  const timedEnv = { ...env, DB: timedDb(DB, latency, stats) }; // what the app sees, from the browser
  const files = [
    ...fs.readdirSync(path.join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(root, "migrations", f)),
    ...(seed ? [path.join(root, "scripts/seed-demo.sql")] : []),
  ];
  for (const file of files) {
    const sql = fs.readFileSync(file, "utf8").replace(/--[^\n]*/g, "");
    await DB.batch(sql.split(";").map((s) => s.trim()).filter(Boolean).map((s) => DB.prepare(s)));
  }
  const { app } = require(path.join(root, "worker/app.ts"));
  const setup = await app.request("/api/setup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupCode: "fixture-setup", email: EMAIL, password: PASSWORD, deviceId: "fixture", deviceName: "Fixture" }),
  }, env);
  if (setup.status !== 200) throw new Error("fixture setup failed: " + setup.status);

  const rules = headerRules(headersFile);
  let dir = path.resolve(assetsDir);
  const apiLog = []; // every API call: { method, path, status, ms, db } — db = round trips counted while it ran (exact when calls don't overlap)
  const hits = []; // every path the server was asked for — proof of what really reached the network
  let down = false; // "the network is dead": connections are cut, for the page AND the service worker (browser emulation of
                    // offline does not reliably cover requests the worker makes itself)
  const server = http.createServer(async (req, res) => {
    if (down) { req.socket.destroy(); return; }
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      hits.push(url.pathname);
      if (url.pathname.startsWith("/api/")) {
        const parts = [];
        for await (const part of req) parts.push(part);
        const t0 = Date.now(), before = stats.count;
        const out = await app.request(url.href, { method: req.method, headers: req.headers, ...(parts.length ? { body: Buffer.concat(parts) } : {}) }, timedEnv);
        apiLog.push({ at: t0, method: req.method, path: url.pathname, status: out.status, ms: Date.now() - t0, db: stats.count - before });
        res.writeHead(out.status, Object.fromEntries(out.headers));
        res.end(Buffer.from(await out.arrayBuffer()));
        return;
      }
      // like the host: a file if there is one, else the app itself (single-page-app fallback, answered 200)
      let file = path.resolve(dir, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(dir + path.sep) && file !== dir) { res.writeHead(400); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, "index.html");
      const stat = fs.statSync(file);
      // the host's own defaults for static files: always ask again (with an ETag), unless a rule in _headers says otherwise —
      // without these a browser may quietly reuse files from its HTTP cache and hide what the app itself keeps
      const headers = {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "public, max-age=0, must-revalidate",
        ETag: `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`,
      };
      for (const r of rules) if (matches(r.pattern, url.pathname)) Object.assign(headers, r.headers);
      if (req.headers["if-none-match"] === headers.ETag) { res.writeHead(304, headers); res.end(); return; }
      res.writeHead(200, headers);
      res.end(fs.readFileSync(file));
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end("fixture error");
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${port}`,
    DB,
    hits,
    apiLog,
    dbStats: stats,
    /** every D1 round trip from now on costs this many ms (a database on another continent ≈ 200) */
    setDbLatency(ms) { latency.ms = ms; },
    resetDbStats() { stats.count = 0; stats.log.length = 0; apiLog.length = 0; },
    email: EMAIL,
    password: PASSWORD,
    /** cut (true) or restore (false) the network for everyone */
    setDown(value) { down = !!value; },
    /** serve another build (a "new release") from now on */
    setAssetsDir(next) { dir = path.resolve(next); },
    async close() { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await mf.dispose(); },
  };
}

module.exports = { startFixtureServer, PASSWORD, EMAIL };

if (require.main === module) {
  startFixtureServer().then((s) => {
    console.log(`fixture server on ${s.url} — password: ${s.password} — synthetic data only`);
    for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await s.close(); process.exit(0); });
  }).catch((e) => { console.error(e); process.exitCode = 1; });
}

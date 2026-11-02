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

/**
 * Opt-in (--gb14): a gradebook with 14 pieces of work (4 types, Aug-Oct 2026) and 44 children in ป.6/1, for คณิตศาสตร์.
 * Fictional and deterministic. Not part of the default seed so other checks keep their numbers.
 */
async function addGradebook14(DB) {
  const have = (await DB.prepare("SELECT COUNT(*) n FROM students WHERE class_id = 'cls_61' AND status = 'active'").first()).n;
  const stmts = [];
  const names = ["สมมติ", "ทดลอง", "ตัวอย่าง", "จำลอง"];
  for (let i = have + 1; i <= 44; i++) {
    stmts.push(DB.prepare("INSERT OR REPLACE INTO students (id, code, qr_token, prefix, first_name, last_name, nickname, class_id, number, status, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0)")
      .bind(`stu_gb_${i}`, `19${String(i).padStart(3, "0")}`, `Q-GB${String(i).padStart(8, "0")}`, "ด.ช.", `เด็ก${i}`, names[i % 4], `น้อง${i}`, "cls_61", i, "active"));
  }
  const types = { w: "wt_worksheet", e: "wt_exercise", q: "wt_quiz", p: "wt_project" };
  const defs = [
    ["w", "ใบงาน 1 เลขยกกำลัง", 10, "2026-08-04"], ["w", "ใบงาน 2 เศษส่วน", 10, "2026-08-18"], ["e", "แบบฝึกหัด 1.1", 10, "2026-08-25"],
    ["w", "ใบงาน 3 ทศนิยม", 10, "2026-09-02"], ["e", "แบบฝึกหัด 1.2", 10, "2026-09-09"], ["q", "สอบย่อย บทที่ 1", 20, "2026-09-16"],
    ["w", "ใบงาน 4 ร้อยละ", 10, "2026-09-23"], ["e", "แบบฝึกหัด 2.1", 10, "2026-10-01"], ["w", "ใบงาน 5 อัตราส่วน", 10, "2026-10-06"],
    ["e", "แบบฝึกหัด 2.2", 10, "2026-10-13"], ["q", "สอบย่อย บทที่ 2", 20, "2026-10-16"], ["p", "โครงงานคณิตศาสตร์ในชีวิตประจำวัน", 20, "2026-10-20"],
    ["w", "ใบงาน 6 สมการ", 10, "2026-10-27"], ["e", "แบบฝึกหัด 3.1", 10, "2026-10-28"],
  ];
  const rnd = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  defs.forEach(([t, title, full, date], j) => {
    const id = `asg_gb_${j + 1}`;
    const due = date.slice(0, 8) + String(Math.min(28, Number(date.slice(8)) + 5)).padStart(2, "0");
    stmts.push(DB.prepare("INSERT OR REPLACE INTO assignments (id, term_id, subject_id, type_id, title, unit, full_score, assigned_date, due_date, note, publish_scores, status, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL,?,?,?,NULL,1,'open',0,0,NULL)")
      .bind(id, "term_demo", "sub_math", types[t], title, full, date, due));
    stmts.push(DB.prepare("INSERT OR REPLACE INTO assignment_classes (assignment_id, class_id) VALUES (?, 'cls_61')").bind(id));
  });
  await DB.batch(stmts);
  const rows = (await DB.prepare("SELECT id FROM students WHERE class_id = 'cls_61' AND status = 'active' ORDER BY number").all()).results;
  const subs = [];
  defs.forEach(([, , full], j) => rows.forEach((st, i) => {
    const r = rnd((i + 1) * 13 + j * 7);
    if (i === 6) { subs.push(DB.prepare("INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at) VALUES (?,?,'excused',NULL,0,NULL,'grid',1)").bind(`asg_gb_${j + 1}`, st.id)); return; }
    if (r > (j > 11 ? 0.45 : 0.9)) return; // not handed in
    const score = r < 0.1 ? null : Math.round(full * (0.5 + rnd(i * 3 + j) * 0.5) * 2) / 2;
    subs.push(DB.prepare("INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at) VALUES (?,?,'submitted',?,?,1,'grid',1)").bind(`asg_gb_${j + 1}`, st.id, score, r > 0.8 ? 1 : 0));
  }));
  for (let k = 0; k < subs.length; k += 80) await DB.batch(subs.slice(k, k + 80));
}

const LONG_TITLE = "ใบงานที่ 7 การวิเคราะห์ระบบนิเวศในท้องถิ่นของเรา"; // 40 graphemes, fictional

/**
 * Opt-in (--layout, implies gradebook14): data for column-fill / long-text / status layout checks. All fictional.
 *  F-2 science in ป.6/1 keeps 2 works of different types, one with a long title
 *  F-3 ภาษาอังกฤษ with 6 works (3 types)   F-4 ศิลปะ with 1 work
 *  F-5 children no. 2-5 get short/long/emoji names, asg_gb_12 gets the long title
 *  F-6 asg_gb_13 has every status at least once; no. 1 and 2 have not handed in
 */
async function addLayout(DB) {
  const rnd = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  const kids = (await DB.prepare("SELECT id, number FROM students WHERE class_id = 'cls_61' AND status = 'active' ORDER BY number").all()).results;
  const idOf = (no) => kids.find((k) => k.number === no).id;
  await DB.batch([
    DB.prepare("DELETE FROM assignment_classes WHERE class_id = 'cls_61' AND assignment_id IN ('asg_quiz', 'asg_hw', 'asg_proj')"),
    DB.prepare("UPDATE assignments SET title = ? WHERE id IN ('asg_ws4', 'asg_gb_12')").bind(LONG_TITLE),
    DB.prepare("INSERT OR REPLACE INTO subjects (id, code, name, color, sort, archived, updated_at) VALUES ('sub_eng', 'อ16101', 'ภาษาอังกฤษ', 'green', 30, 0, 0), ('sub_art', 'ศ16101', 'ศิลปะ', 'orange', 40, 0, 0)"),
    DB.prepare("UPDATE students SET nickname = 'นวพล' WHERE id = ?").bind(idOf(2)),
    DB.prepare("UPDATE students SET nickname = 'กมลชนก' WHERE id = ?").bind(idOf(3)),
    DB.prepare("UPDATE students SET nickname = 'กมลวรรณชนกพร', first_name = 'กมลวรรณชนกพรนภสรอร', last_name = 'วงศสกลนครพนมบรรพตชยกรณ' WHERE id = ?").bind(idOf(4)),
    DB.prepare("UPDATE students SET nickname = 'ข้าวหอม🌾' WHERE id = ?").bind(idOf(5)),
  ]);
  const works = [
    ["asg_en_1", "sub_eng", "wt_worksheet", "Worksheet 1 Greetings", 10, "2026-08-05"], ["asg_en_2", "sub_eng", "wt_exercise", "Exercise 1 Colours", 10, "2026-08-26"],
    ["asg_en_3", "sub_eng", "wt_worksheet", "Worksheet 2 Family", 10, "2026-09-09"], ["asg_en_4", "sub_eng", "wt_quiz", "Quiz Unit 1", 20, "2026-09-23"],
    ["asg_en_5", "sub_eng", "wt_exercise", "Exercise 2 Animals", 10, "2026-10-07"], ["asg_en_6", "sub_eng", "wt_worksheet", "Worksheet 3 Food", 10, "2026-10-21"],
    ["asg_art_1", "sub_art", "wt_project", "วาดภาพทิวทัศน์", 20, "2026-10-14"],
  ];
  const stmts = [];
  for (const [id, sub, type, title, full, date] of works) {
    stmts.push(DB.prepare("INSERT OR REPLACE INTO assignments (id, term_id, subject_id, type_id, title, unit, full_score, assigned_date, due_date, note, publish_scores, status, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL,?,?,?,NULL,1,'open',0,0,NULL)")
      .bind(id, "term_demo", sub, type, title, full, date, date));
    stmts.push(DB.prepare("INSERT OR REPLACE INTO assignment_classes (assignment_id, class_id) VALUES (?, 'cls_61')").bind(id));
  }
  await DB.batch(stmts);
  const subs = [];
  works.forEach(([id, , , , full], j) => kids.forEach((k, i) => {
    const r = rnd((i + 1) * 17 + j * 5 + 3);
    if (r > (id === "asg_art_1" ? 0.3 : 0.88)) return;
    subs.push(DB.prepare("INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at) VALUES (?,?,'submitted',?,?,1,'grid',1)")
      .bind(id, k.id, Math.round(full * (0.5 + rnd(i * 3 + j + 40) * 0.5) * 2) / 2, r > 0.8 ? 1 : 0));
  }));
  // F-6: asg_gb_13 has every status; no. 1 and 2 have not handed in
  const nums = [1, 2, 3, 4, 5, 6, 7];
  subs.push(DB.prepare(`DELETE FROM submissions WHERE assignment_id = 'asg_gb_13' AND student_id IN (${nums.map(() => "?").join(",")})`).bind(...nums.map(idOf)));
  const gb = (no, status, score, late) => DB.prepare("INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at) VALUES ('asg_gb_13',?,?,?,?,?,'grid',1)")
    .bind(idOf(no), status, score, late, status === "excused" ? null : 1);
  subs.push(gb(3, "submitted", 9, 0), gb(4, "submitted", 6, 1), gb(5, "submitted", null, 0), gb(6, "excused", null, 0));
  for (let k = 0; k < subs.length; k += 80) await DB.batch(subs.slice(k, k + 80));
}

async function startFixtureServer({
  port = 5194,
  assetsDir = path.join(root, "dist/client/client"),
  headersFile = path.join(root, "public/_headers"),
  seed = true, // false: an empty school (only the migrations' defaults), for first-run checks
  layout = false, // true: gradebook14 + layout data sets (see addLayout)
  gradebook14 = false, // true: 14 pieces of work x 44 children for คณิตศาสตร์ in ป.6/1 (gradebook layout checks)
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
  if ((gradebook14 || layout) && seed) await addGradebook14(DB);
  if (layout && seed) await addLayout(DB);
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
  const opt = (name) => { const i = process.argv.indexOf(name); return i === -1 ? undefined : process.argv[i + 1]; };
  const port = opt("--port") ? Number(opt("--port")) : undefined;
  startFixtureServer({
    gradebook14: process.argv.includes("--gb14"), layout: process.argv.includes("--layout"),
    ...(port ? { port } : {}), ...(opt("--assets") ? { assetsDir: path.resolve(opt("--assets")) } : {}),
  }).then((s) => {
    console.log(`fixture server on ${s.url} — password: ${s.password} — synthetic data only`);
    for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await s.close(); process.exit(0); });
  }).catch((e) => { console.error(e); process.exitCode = 1; });
}

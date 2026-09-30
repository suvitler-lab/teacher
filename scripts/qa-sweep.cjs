// QA sweep: every page of the real built app, in a real browser, on a disposable server (scripts/fixture-server.cjs:
// real worker code, in-memory D1, fictional data). Nothing here touches the real site or its database.
//
//   npm run build && node scripts/qa-sweep.cjs --label=before --latency=200
//
// --latency=N   every D1 round trip costs N ms (the real database is on another continent: ~200). 0 = no delay.
// --label=NAME  results land in docs/qa-2026-10-01/results/NAME.json and shots in $QA_SHOTS (default: os tmp dir)
//
// What it checks, per page × screen size × theme: console/page errors, failed API calls, sideways scrolling,
// tap targets that are too small, controls with no name, and a screenshot. Then it measures the things a teacher
// feels: how long after a click the screen answers, and how many database round trips a click costs.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { startFixtureServer } = require("./fixture-server.cjs");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }

const arg = (name, dflt) => { const m = process.argv.find((a) => a.startsWith(`--${name}=`)); return m ? m.split("=")[1] : dflt; };
const LATENCY = Number(arg("latency", "200"));
const LABEL = arg("label", "run");
const SHOTS = process.env.QA_SHOTS || path.join(os.tmpdir(), "qa-shots-" + LABEL);
const OUT = path.join(__dirname, "..", "docs", "qa-2026-10-01", "results");
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: "home", hash: "/home" },
  { name: "scan", hash: "/scan" },
  { name: "attendance", hash: "/attendance" },
  { name: "gradebook", hash: "/gradebook" },
  { name: "random", hash: "/random" },
  { name: "reports", hash: "/reports" },
  { name: "students", hash: "/students" },
  { name: "settings-general", hash: "/settings?section=general" },
  { name: "settings-time", hash: "/settings?section=time" },
  { name: "settings-scan", hash: "/settings?section=scan" },
  { name: "settings-catalog", hash: "/settings?section=catalog" },
  { name: "settings-devices", hash: "/settings?section=devices" },
  { name: "settings-backup", hash: "/settings?section=backup" },
  { name: "settings-history", hash: "/settings?section=history" },
];
const SIZES = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 768, height: 1024 }, { name: "phone", width: 390, height: 844 }];
const THEMES = ["light", "dark"];
const SKIP_STATIC = process.argv.includes("--timing-only"); // just the click timings (quick, for checking a speed-up)

const findings = [];      // things that are wrong
const timings = [];       // things that are slow
const pageInfo = [];      // what each page looks like (heading, controls)
const note = (sev, where, what, extra = {}) => { findings.push({ sev, where, what, ...extra }); console.log(`  [${sev}] ${where}: ${what}`); };

/** Page-side audit: sideways scroll, small tap targets, unnamed controls, broken images. */
const audit = () => {
  const vw = window.innerWidth;
  const out = { overflowX: document.documentElement.scrollWidth - vw, small: [], unnamed: [], wide: [], imgNoAlt: 0, h1: null, hasHeader: !!document.querySelector(".uh"), title: document.querySelector(".uh-title")?.textContent || null };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const label = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
  for (const el of document.querySelectorAll("button, a[href], [role=button], select, input:not([type=hidden])")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (el.tagName === "INPUT" && /checkbox|radio/.test(el.type)) continue;
    if ((r.height < 32 || r.width < 32) && !(el.tagName === "SELECT" || el.tagName === "INPUT") && out.small.length < 12) out.small.push(`${label(el) || el.className}  ${Math.round(r.width)}×${Math.round(r.height)}`);
    const named = el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").trim() || el.getAttribute("placeholder") || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
    if (!named && out.unnamed.length < 12) out.unnamed.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`);
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 && out.wide.length < 6 && !el.closest(".gb-scroll, .gb-mchips, .set-nav-chips, .chips-row, [style*='overflow']")) out.wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} → ${Math.round(r.right)}px`);
  }
  out.imgNoAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
  return out;
};

(async () => {
  const server = await startFixtureServer({ port: 5310 });
  const browser = await playwright.chromium.launch();
  const apiFailures = () => server.apiLog.filter((c) => c.status >= 400 && c.status !== 401);

  // sign in once, reuse the session for every context
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await loginCtx.newPage();
  await lp.goto(server.url);
  await lp.waitForSelector("input[type=email]");
  await lp.fill("input[type=email]", server.email);
  await lp.fill("input[type=password]", server.password);
  await lp.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await lp.waitForSelector(".rail, .bottom-tabs", { state: "attached", timeout: 20000 });
  const storage = await loginCtx.storageState();
  await loginCtx.close();
  // ---------------------------------------------------------------- 1. static sweep (no artificial delay: this is about what is on screen)
  server.setDbLatency(0);
  console.log(`\n== sweep: ${PAGES.length} pages × ${SIZES.length} sizes × ${THEMES.length} themes`);
  for (const theme of SKIP_STATIC ? [] : THEMES) for (const size of SIZES) {
    const ctx = await browser.newContext({ storageState: storage, viewport: { width: size.width, height: size.height }, colorScheme: theme, locale: "th-TH" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
    // first load, then route by hash like a teacher would
    await page.goto(server.url + "/#/home");
    await page.waitForSelector(".rail, .bottom-tabs", { state: "attached", timeout: 20000 });
    for (const p of PAGES) {
      const where = `${p.name} @${size.name}/${theme}`;
      server.resetDbStats(); errs.length = 0;
      const t0 = Date.now();
      await page.evaluate((h) => { location.hash = h; }, p.hash);
      await page.waitForTimeout(150);
      await page.waitForFunction(() => document.querySelectorAll(".spin").length === 0, null, { timeout: 8000 }).catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(300);
      const settle = Date.now() - t0;
      const a = await page.evaluate(audit);
      const calls = server.apiLog.slice();
      const loading = await page.locator(".spin").count();
      if (theme === "light" && size.name === "desktop") pageInfo.push({ page: p.name, title: a.title, hasHeader: a.hasHeader, calls: calls.length, dbTrips: calls.reduce((n, c) => n + c.db, 0), settleMs: settle });
      if (a.overflowX > 2) note("P2", where, `page scrolls sideways (${a.overflowX}px wider than the screen)`, { wide: a.wide });
      else if (a.wide.length && size.name !== "desktop") note("P3", where, "element sticks out past the right edge", { wide: a.wide });
      if (size.name === "phone" && a.small.length > 3) note("P3", where, `${a.small.length}+ tap targets smaller than 32px`, { examples: a.small.slice(0, 6) });
      if (a.unnamed.length) note("P3", where, `${a.unnamed.length} control(s) without a name for screen readers`, { examples: a.unnamed.slice(0, 5) });
      if (a.imgNoAlt) note("P3", where, `${a.imgNoAlt} image(s) without alt text`);
      if (!a.hasHeader && size.name === "desktop" && theme === "light") note("P3", where, "no page header (icon + title) like the other pages");
      if (loading > 0) note("P2", where, `a loading spinner is still showing ${settle}ms after navigating (with no artificial delay)`);
      for (const c of calls.filter((c) => c.status >= 400 && c.status !== 401)) note("P1", where, `API ${c.method} ${c.path} answered ${c.status}`);
      for (const e of errs) note("P1", where, e);
      const file = path.join(SHOTS, `${p.name}__${size.name}__${theme}.jpg`);
      if (size.name !== "tablet") await page.screenshot({ path: file, fullPage: true, type: "jpeg", quality: 55 }).catch(() => {});
    }
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2. what a click costs
  server.setDbLatency(LATENCY);
  // (the app's Content-Security-Policy forbids eval, so the page-side checks are real functions, not strings)
  console.log("\n== click timing (desktop, light)");
  const ctx = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 900 }, locale: "th-TH" });
  const page = await ctx.newPage();
  await page.goto(server.url + "/#/home");
  await page.waitForSelector(".rail", { timeout: 20000 });
  const quiet = async () => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(LATENCY * 12 + 600); };

  /** click something, wait for `pred(arg)` to become true in the page (the screen answered), then for the network to go quiet. */
  async function measure(name, action, pred, arg = null, { expectCalls = true } = {}) {
    await quiet();
    server.resetDbStats();
    const start = Date.now();
    await action();
    let feedback = null;
    try { await page.waitForFunction(pred, arg, { timeout: 15000, polling: 16 }); feedback = Date.now() - start; }
    catch (e) { if (!/Timeout/.test(e.message)) console.log("    (check failed: " + e.message.split("\n")[0] + ")"); }
    await quiet();
    const total = Date.now() - start - (LATENCY * 12 + 600);
    const calls = server.apiLog.slice();
    const row = { action: name, feedbackMs: feedback, settledMs: null, apiCalls: calls.length, dbTrips: calls.reduce((n, c) => n + c.db, 0), serverMs: calls.reduce((n, c) => n + c.ms, 0), calls: calls.map((c) => `${c.method} ${c.path} ${c.ms}ms/${c.db}db`) };
    timings.push(row);
    console.log(`  ${name.padEnd(46)} screen answers after: ${String(feedback ?? "never").padStart(5)} ms   api ${row.apiCalls}  db round trips ${String(row.dbTrips).padStart(2)}  server time ${row.serverMs} ms`);
    if (feedback === null) note("P1", name, "the screen never answered the click");
    return row;
  }
  const go = async (hash, ready) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(ready, { timeout: 20000 }); await quiet(); };

  // moving between pages: how long until the next page has its content
  for (const [label, hash, pred] of [
    ["open สมุดคะแนน", "/gradebook", () => document.querySelectorAll("table.gb tbody tr").length > 5],
    ["open รายงาน", "/reports", () => !!document.querySelector(".rp-range")],
    ["open เช็คชื่อ", "/attendance", () => document.querySelectorAll(".att-tile").length > 5],
    ["open นักเรียน", "/students", () => document.querySelectorAll(".stu-lrow").length > 5],
    ["open หน้าหลัก", "/home", () => !!document.querySelector(".hm-action")],
  ]) {
    await go("/settings?section=general", ".set-cols");
    await measure(label, () => page.evaluate((h) => { location.hash = h; }, hash), pred);
  }

  // gradebook: the eye that hides an assignment's scores
  await go("/gradebook", "table.gb tbody tr");
  const eye = page.locator("table.gb thead .hs-eye").first();
  if (await eye.count()) {
    const off = () => page.locator("table.gb thead .hs-eye.off").count();
    // the first eye may already be "off" (an exam the demo data keeps hidden): expect the count to move the other way
    const wasOff = await eye.evaluate((el) => el.classList.contains("off"));
    const n0 = await off();
    await measure("gradebook: click the eye (toggle)", () => eye.click(), (n) => document.querySelectorAll("table.gb thead .hs-eye.off").length === n, wasOff ? n0 - 1 : n0 + 1);
    await measure("gradebook: click the eye again (toggle back)", () => eye.click(), (n) => document.querySelectorAll("table.gb thead .hs-eye.off").length === n, n0);
    // an impatient teacher taps twice: whatever the screen ends up showing must be what the server holds
    await eye.click(); await eye.click(); await quiet();
    const shownState = await page.evaluate(() => [...document.querySelectorAll("table.gb thead th")].filter((th) => th.querySelector(".hs-eye")).map((th) => ({ title: th.getAttribute("title"), off: th.querySelector(".hs-eye").classList.contains("off") })));
    const held = await server.DB.prepare("SELECT title, publish_scores FROM assignments WHERE deleted_at IS NULL").all();
    const heldMap = new Map(held.results.map((r) => [r.title, r.publish_scores === 0]));
    const wrong = shownState.filter((x) => heldMap.has(x.title) && heldMap.get(x.title) !== x.off).map((x) => x.title);
    if (wrong.length) note("P1", "gradebook: eye tapped twice quickly", `the screen and the server disagree about: ${wrong.join(", ")}`);
  } else note("P2", "gradebook", "no eye button found in the column headers");
  await go("/gradebook", "table.gb tbody tr");
  await measure("gradebook: click a column header (select)", () => page.locator("table.gb thead th").nth(2).click(), () => document.querySelectorAll("table.gb thead th.sel").length === 1 && !document.querySelector("table.gb thead th:nth-child(2).sel"), null, { expectCalls: false });
  const openCells = await page.locator("table.gb td .wcell.missing, table.gb td .wcell.pending").count();
  await measure("gradebook: “ทั้งห้องส่งแล้ว” (whole class)", () => page.getByRole("button", { name: /ทั้งห้องส่งแล้ว/ }).click(), (n) => document.querySelectorAll("table.gb td .wcell.missing, table.gb td .wcell.pending").length !== n, openCells);

  // attendance
  await go("/attendance", ".att-tile");
  const c0 = await page.locator(".att-tile").nth(3).getAttribute("class");
  await measure("attendance: tap one student", () => page.locator(".att-tile").nth(3).click(), (c) => document.querySelectorAll(".att-tile")[3].className !== c, c0);
  const present0 = await page.locator(".att-tile.present").count();
  await measure("attendance: “มาทั้งหมด”", () => page.getByRole("button", { name: /มาทั้งหมด/ }).click(), (n) => document.querySelectorAll(".att-tile.present").length > n, present0);

  // students
  await go("/students", ".stu-lrow");
  await measure("students: open a student's drawer", () => page.locator(".stu-lrow").first().click(), () => !!document.querySelector(".drawer"));
  await page.locator(".drawer-scrim").click({ position: { x: 4, y: 4 } }).catch(() => {});
  await measure("students: open นำเข้า Excel", () => page.getByRole("button", { name: /นำเข้า Excel/ }).click(), () => !!document.querySelector(".modal"));
  await page.keyboard.press("Escape"); await page.locator(".modal-overlay").click({ position: { x: 4, y: 4 } }).catch(() => {});

  // settings: theme (applies + saves)
  await go("/settings?section=general", ".set-cols");
  await measure("settings: pick the dark theme", () => page.getByRole("button", { name: "มืด", exact: true }).click(), () => document.documentElement.getAttribute("data-theme") === "dark");
  await measure("settings: pick the light theme", () => page.getByRole("button", { name: "สว่าง", exact: true }).click(), () => document.documentElement.getAttribute("data-theme") === "light");

  // reports: month view
  await go("/reports", ".rp-range");
  await measure("reports: switch to รายเดือน", () => page.getByRole("button", { name: "รายเดือน" }).click(), () => document.querySelectorAll("button.on, .seg .on, [aria-pressed=true]").length > 0 && /รายเดือน/.test(document.body.innerText));
  await ctx.close();

  await browser.close();
  await server.close();

  // ---------------------------------------------------------------- 3. summary
  const bySev = (s) => findings.filter((f) => f.sev === s).length;
  const result = { label: LABEL, latencyMs: LATENCY, at: new Date().toISOString(), counts: { P0: bySev("P0"), P1: bySev("P1"), P2: bySev("P2"), P3: bySev("P3") }, pageInfo, timings, findings };
  fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify(result, null, 2));
  console.log(`\nfindings: P1 ${bySev("P1")} · P2 ${bySev("P2")} · P3 ${bySev("P3")}   → ${path.join(OUT, LABEL + ".json")}\nshots: ${SHOTS}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

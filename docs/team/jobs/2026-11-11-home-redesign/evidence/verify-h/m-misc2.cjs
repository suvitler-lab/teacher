// follow-up: 7107/7304 per-page hide via each page's own button; 7106 section links; home-b contrast sanity screenshot
const L = require("./lib.cjs"); const fs = require("fs");
(async () => {
  const out = {}; const log = (k, v) => { out[k] = v; console.log(k, JSON.stringify(v)); };
  const server = await L.startFixtureServer({ port: 4220, assetsDir: process.env.QA_ASSETS, layout: true, lateAfter: "00:00" });
  const kids = (await server.DB.prepare("SELECT first_name, nickname FROM students WHERE status='active'").all()).results;
  const names = [...new Set(kids.flatMap((k) => [k.first_name, k.nickname]).filter((x) => x && x.length >= 3))];
  const browser = await L.pw.chromium.launch();
  const count = (page) => page.evaluate((ns) => { const hay = [document.body.innerText, ...[...document.querySelectorAll("[aria-label],[title],[alt],input,[placeholder]")].map((e) => [e.getAttribute("aria-label"), e.title, e.getAttribute("alt"), e.value, e.placeholder].join(" "))].join(" \n "); return ns.filter((n) => hay.includes(n)).length; }, names);
  const { ctx, page } = await L.newPage(browser, server, "desk");
  const pages = [["home", "#/"], ["scan", "#/scan"], ["attendance", "#/attendance"], ["random", "#/random"], ["gradebook", "#/gradebook?subject=sub_math"], ["reports", "#/reports"], ["students", "#/students"]];
  const before = {}, after = {}, btn = {};
  for (const [n, h] of pages) {
    await L.go(page, h, null); await L.sleep(1500); before[n] = await count(page);
    const b = page.locator('button[aria-label*="ซ่อนชื่อ"], button:has-text("ซ่อนชื่อ")').first();
    if (await b.count()) { btn[n] = (await b.innerText()).trim() + " pressed=" + (await b.getAttribute("aria-pressed")); if ((await b.getAttribute("aria-pressed")) !== "true") await b.click(); await L.sleep(900); } else btn[n] = "none";
    after[n] = await count(page);
  }
  log("7107.before", before); log("7107.buttons", btn); log("7107.after-own-button", after);
  // second pass: all pages already hidden (state persisted), re-visit
  const again = {}; for (const [n, h] of pages) { await L.go(page, h, null); await L.sleep(1200); again[n] = await count(page); } log("7107.revisit", again);
  const prt = {}; await page.emulateMedia({ media: "print" });
  for (const [n, h] of pages.filter((p) => ["reports", "students", "attendance", "gradebook"].includes(p[0]))) { await L.go(page, h, null); await L.sleep(1500); prt[n] = { names: await count(page), hasNumberHeader: await page.evaluate(() => /เลขที่/.test(document.body.innerText)) }; } log("7304.print", prt);
  await page.emulateMedia({ media: "screen" });
  await L.go(page, "#/settings?section=backup", null); await L.sleep(900);
  const heads = {}; for (const k of ["backup", "worktypes", "catalog&tab=types", "device", "devices", "danger", "nonsense"]) { await L.go(page, "#/settings?section=" + k, null); await L.sleep(800); heads[k] = (await page.locator("main h2, .set-body h2, section h2").first().innerText().catch(() => "?")).slice(0, 40) + " | hash=" + (await page.evaluate(() => location.hash)); } log("7106.sections", heads);
  await ctx.close(); await browser.close(); await server.close?.();
  fs.writeFileSync(__dirname + "/misc2-result.json", JSON.stringify(out, null, 1)); process.exit(0);
})();

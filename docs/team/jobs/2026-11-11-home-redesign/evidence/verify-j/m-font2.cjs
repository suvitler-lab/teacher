// T-89: AC-36 (returning device): skin already chosen + remembered on this device, empty HTTP cache -> only that skin's fonts are requested.
const L = require("./lib.cjs");
(async () => {
  setTimeout(() => { console.error("HARD TIMEOUT"); process.exit(2); }, 120000);
  const server = await L.startFixtureServer({ port: +process.env.QA_PORT || 4264, assetsDir: process.env.QA_ASSETS });
  const browser = await L.pw.chromium.launch(); const out = {};
  const c0 = await browser.newContext({ viewport: { width: 1536, height: 729 }, locale: "th-TH" }); const p0 = await c0.newPage();
  await p0.goto(server.url); await p0.fill("input[type=email]", server.email); await p0.fill("input[type=password]", server.password); await p0.getByRole("button", { name: "เข้าสู่ระบบ" }).click(); await p0.waitForSelector("nav", { timeout: 20000 });
  await p0.evaluate(() => { location.hash = "#/settings?section=appearance"; }); await L.sleep(1500);
  await p0.getByRole("radio", { name: /ธีมสดใส/ }).first().click(); await L.sleep(1500); await c0.close();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 729 }, locale: "th-TH" });
  await ctx.addInitScript(() => { try { localStorage.setItem("ngankrob-skin", "playful"); } catch {} });
  const page = await ctx.newPage(); const reqs = []; page.on("request", (r) => reqs.push(r.url()));
  await page.goto(server.url); await L.sleep(1500);
  const loginFonts = [...new Set(reqs.filter((u) => /\.(woff2?)(\?|$)/.test(u)).map((u) => u.split("/").pop().replace(/-[A-Za-z0-9_-]{8}\.woff2?$/, "")))];
  await page.fill("input[type=email]", server.email); await page.fill("input[type=password]", server.password); await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click(); await page.waitForSelector("nav", { timeout: 20000 }); await L.sleep(3000);
  const all = [...new Set(reqs.filter((u) => /\.(woff2?)(\?|$)/.test(u)).map((u) => u.split("/").pop().replace(/-[A-Za-z0-9_-]{8}\.woff2?$/, "")))];
  out.playfulRemembered = { loginScreenFonts: loginFonts, allFontsAfterSignIn: all, otherSkinFonts: all.filter((f) => /^(sarabun|mitr|ibm-plex|Phosphor-(Duotone|Bold))/.test(f)) };
  require("fs").writeFileSync(__dirname + "/font2-result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out)); await browser.close(); await server.close?.(); process.exit(0);
})();

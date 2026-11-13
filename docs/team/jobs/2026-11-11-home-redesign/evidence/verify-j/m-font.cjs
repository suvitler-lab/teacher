// T-89: AC-36 fonts. Choose the skin through the Settings UI (saved on the fixture server), then a FRESH browser context (empty cache) signs in:
// which font files does the page request, any external host, are fonts still shown offline. Frozen build + fixture-server only.
const L = require("./lib.cjs");
const login = async (page, server) => { await page.goto(server.url); await page.fill("input[type=email]", server.email); await page.fill("input[type=password]", server.password); await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click(); await page.waitForFunction(() => !!document.querySelector("nav"), null, { timeout: 20000 }); };
(async () => {
  setTimeout(() => { console.error("HARD TIMEOUT"); process.exit(2); }, 170000);
  const server = await L.startFixtureServer({ port: +process.env.QA_PORT || 4262, assetsDir: process.env.QA_ASSETS });
  const browser = await L.pw.chromium.launch(); const out = {};
  for (const [skin, label] of [["warm", "อบอุ่น"], ["pro", "มืออาชีพ"], ["playful", "สดใส"]]) {
    const c0 = await browser.newContext({ viewport: { width: 1536, height: 729 }, locale: "th-TH" }); const p0 = await c0.newPage();
    await login(p0, server); await L.sleep(800); await p0.evaluate(() => { location.hash = "#/settings?section=appearance"; }); await L.sleep(1500);
    await p0.getByRole("radio", { name: new RegExp("ธีม" + label) }).first().click({ timeout: 8000 }); await L.sleep(1500);
    const saved = await p0.evaluate(() => document.documentElement.getAttribute("data-skin")); await c0.close();
    const ctx = await browser.newContext({ viewport: { width: 1536, height: 729 }, locale: "th-TH" }); const page = await ctx.newPage(); const reqs = [];
    page.on("request", (r) => reqs.push(r.url()));
    await login(page, server); await L.sleep(3000);
    const fonts = [...new Set(reqs.filter((u) => /\.(woff2?|ttf|otf)(\?|$)/.test(u)).map((u) => u.split("/").pop().replace(/-[A-Za-z0-9_-]{8}\.woff2?$/, "")))];
    const external = reqs.filter((u) => !u.startsWith(server.url) && !u.startsWith("data:") && !u.startsWith("blob:"));
    const dataSkin = await page.evaluate(() => document.documentElement.getAttribute("data-skin"));
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily.split(",")[0]);
    await L.sleep(1500); await ctx.setOffline(true); await page.reload(); await L.sleep(2500);
    const off = await page.evaluate(() => ({ bodyChars: document.body.innerText.length, loaded: [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family))], failed: [...document.fonts].filter((f) => f.status === "error").map((f) => f.family) }));
    out[skin] = { savedSkinAttr: saved, freshContextSkinAttr: dataSkin, bodyFont, fontFilesRequestedByPage: fonts, externalRequests: external, offline: off };
    await ctx.close();
  }
  require("fs").writeFileSync(__dirname + "/font-result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out)); await browser.close(); await server.close?.(); process.exit(0);
})();

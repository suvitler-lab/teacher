const L = require("./lib.cjs");
(async () => {
  const server = await L.startFixtureServer({ port: 4263, assetsDir: process.env.QA_ASSETS });
  const browser = await L.pw.chromium.launch(); const { ctx, page } = await L.newPage(browser, server, "desk");
  await L.go(page, "#/settings?section=appearance", null); await L.sleep(1500);
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[role=radio],input[type=radio]")].map((e) => (e.getAttribute("aria-label") || e.textContent || e.value || "").trim().slice(0, 40) + "|" + (e.getAttribute("aria-checked") ?? e.checked)))));
  await ctx.close(); await browser.close(); await server.close?.(); process.exit(0);
})();

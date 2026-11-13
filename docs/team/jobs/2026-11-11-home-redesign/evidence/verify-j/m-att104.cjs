// T-89: AC-104 attendance grid re-measure on the frozen build, 45 children (layout fixture), 4 devices. Fixture-server only.
const L = require("./lib.cjs");
(async () => {
  const server = await L.startFixtureServer({ port: +process.env.QA_PORT || 4261, assetsDir: process.env.QA_ASSETS, layout: true });
  const browser = await L.pw.chromium.launch(); const out = {};
  for (const dev of ["desk", "ipadL", "ipadP", "phone"]) {
    const { ctx, page } = await L.newPage(browser, server, dev);
    await L.go(page, "#/attendance", ".att-tile"); await L.sleep(1500);
    out[dev] = await page.evaluate(() => {
      const vh = innerHeight; const el = [...document.querySelectorAll(".att-tile")]; const t = el.map((e) => e.getBoundingClientRect());
      const hero = document.querySelector(".att-hero")?.getBoundingClientRect();
      const nm = el[0]?.querySelector(".att-name, .nm, b, span");
      const rail = document.querySelector("nav.rail, .tabbar, nav.tabs");
      const cols = new Set(t.map((b) => Math.round(b.left))).size;
      return { vh, tiles: t.length, visibleFully: t.filter((b) => b.top >= 0 && b.bottom <= vh + 1).length, cols, minTileH: Math.round(Math.min(...t.map((b) => b.height))), minTileW: Math.round(Math.min(...t.map((b) => b.width))), hero: hero ? Math.round(hero.height) : null, hOverflow: document.documentElement.scrollWidth > innerWidth + 1, pageH: document.documentElement.scrollHeight, nameFs: nm ? getComputedStyle(nm).fontSize : null };
    });
    await ctx.close();
  }
  require("fs").writeFileSync(__dirname + "/att104-result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out)); await browser.close(); await server.close?.(); process.exit(0);
})();

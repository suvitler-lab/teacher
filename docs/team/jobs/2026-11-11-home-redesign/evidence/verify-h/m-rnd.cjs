// Q-7007 AC-122 random page: hero / stage / go button / name, after a real draw (pool = whole room, 45 children)
const L = require("./lib.cjs"); const fs = require("fs");
(async () => {
  const server = await L.startFixtureServer({ port: 4224, assetsDir: process.env.QA_ASSETS, layout: true, lateAfter: "00:00" });
  const browser = await L.pw.chromium.launch(); const out = {};
  for (const dev of ["desk", "ipadL", "ipadP", "phone"]) {
    const { ctx, page } = await L.newPage(browser, server, dev);
    await L.go(page, "#/random", null); await L.sleep(1500);
    await page.getByRole("button", { name: /ใช้ทั้งห้อง/ }).click(); await L.sleep(600);
    await page.locator("button.rnd-go").click(); await L.sleep(4500);
    out[dev] = await page.evaluate(() => { const bx = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
      return { vh: innerHeight, hero: bx(".rnd-hero"), stage: bx(".rnd-stage"), go: bx(".rnd-go"), goPos: getComputedStyle(document.querySelector(".rnd-go").parentElement).position + "/" + getComputedStyle(document.querySelector(".rnd-go")).position, nameFs: parseFloat(getComputedStyle(document.querySelector(".rnd-name")).fontSize), name: document.querySelector(".rnd-name").textContent.trim().slice(0, 14), pageH: document.documentElement.scrollHeight, hOverflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
    await ctx.close();
  }
  fs.writeFileSync(__dirname + "/rnd-result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out)); await browser.close(); await server.close?.(); process.exit(0);
})();

// T-89: AC-46 rail fits without scroll (desk 1536x729, iPad landscape 1180x820) + tap size; max font -> rail scrolls, no overlap, active item visible.
// AC-104 (re-measure on frozen build): attendance tiles visible without scrolling, hero height, hOverflow. Fixture-server only.
const L = require("./lib.cjs");
(async () => {
  const server = await L.startFixtureServer({ port: +process.env.QA_PORT || 4260, assetsDir: process.env.QA_ASSETS, layout: true });
  const browser = await L.pw.chromium.launch(); const out = { rail: {}, railMax: {}, att: {} };
  const pages = { home: "#/home", attendance: "#/attendance", random: "#/random", gradebook: "#/gradebook", reports: "#/reports", students: "#/students", settings: "#/settings", scan: "#/scan" };
  const railProbe = () => {
    const r = document.querySelector("nav.rail"); if (!r) return { noRail: true };
    const rb = r.getBoundingClientRect(); const cs = getComputedStyle(r);
    const items = [...r.querySelectorAll(".rail-group .rail-item")]; const labels = [...r.querySelectorAll(".rail-gl")];
    const all = [...r.querySelectorAll(".rail-item, .rail-gl, .rail-logo, .rail-sync")];
    const boxes = all.map((e) => e.getBoundingClientRect());
    const clipped = boxes.filter((b) => b.height > 0 && (b.bottom > Math.min(rb.bottom, innerHeight) + 1 || b.top < rb.top - 1)).length;
    const its = items.map((e) => e.getBoundingClientRect());
    const overlap = its.some((a, i) => its.some((b, j) => j > i && a.left < b.right && b.left < a.right && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    const cur = r.querySelector("[aria-current=page]"); const cb = cur?.getBoundingClientRect();
    return { items: items.length, labels: labels.length, labelTexts: labels.map((e) => e.textContent.trim()), scrollH: r.scrollHeight, clientH: r.clientHeight, overflowY: cs.overflowY, scrolls: r.scrollHeight > r.clientHeight + 1, clipped, overlap, minItemH: Math.min(...its.map((b) => Math.round(b.height))), minItemW: Math.min(...its.map((b) => Math.round(b.width))), curVisible: cb ? cb.top >= rb.top - 1 && cb.bottom <= rb.bottom + 1 : null, hasAriaCurrent: !!cur };
  };
  for (const dev of ["desk", "ipadL"]) {
    out.rail[dev] = {};
    const { ctx, page } = await L.newPage(browser, server, dev);
    for (const [k, h] of Object.entries(pages)) { await L.go(page, h, null); await L.sleep(900); out.rail[dev][k] = await page.evaluate(railProbe); }
    // attendance tiles visible without scrolling (AC-104)
    await L.go(page, "#/attendance", null); await L.sleep(2000);
    out.att[dev] = await page.evaluate(() => {
      const vh = innerHeight; const t = [...document.querySelectorAll(".stu-tile")].map((e) => e.getBoundingClientRect());
      const hero = document.querySelector(".att-hero, [class*=hero]")?.getBoundingClientRect();
      return { vh, tiles: t.length, visibleFully: t.filter((b) => b.top >= 0 && b.bottom <= vh + 1).length, cols: new Set(t.map((b) => Math.round(b.left))).size, hero: hero ? Math.round(hero.height) : null, hOverflow: document.documentElement.scrollWidth > innerWidth + 1, pageH: document.documentElement.scrollHeight };
    });
    // max font
    await page.evaluate(() => { localStorage.setItem("ngankrob-font-size", "24"); }); await page.reload(); await page.waitForSelector("nav.rail", { timeout: 20000 }); await L.sleep(1200);
    out.railMax[dev] = {};
    for (const k of ["home", "attendance", "settings"]) { await L.go(page, pages[k], null); await L.sleep(900); out.railMax[dev][k] = await page.evaluate(railProbe); }
    // scroll rail to bottom: last item reachable
    out.railMax[dev].bottomReach = await page.evaluate(() => { const r = document.querySelector("nav.rail"); r.scrollTop = r.scrollHeight; const last = [...r.querySelectorAll(".rail-item")].pop().getBoundingClientRect(); const rb = r.getBoundingClientRect(); return { lastBottom: Math.round(last.bottom), railBottom: Math.round(rb.bottom), reachable: last.bottom <= rb.bottom + 1 }; });
    await ctx.close();
  }
  require("fs").writeFileSync(__dirname + "/rail-result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out)); await browser.close(); await server.close?.(); process.exit(0);
})();

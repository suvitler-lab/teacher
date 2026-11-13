// Q-7604: 200-char work names on home and scan; no horizontal overflow; titles clamp
const L = require("./lib.cjs"); const fs = require("fs");
const LONG = "ใบงานชื่อยาวมากเพื่อทดสอบการตัดข้อความ" + "ก".repeat(160) + "จบ"; // 200 chars
(async () => {
  const out = {};
  for (const ds of ["home", "scan"]) {
    const server = await L.startFixtureServer({ port: ds === "home" ? 4242 : 4243, assetsDir: process.env.QA_ASSETS, dataset: ds, lateAfter: "00:00", afterSeed: async (DB) => { await DB.prepare("UPDATE assignments SET title = ? WHERE id IN (SELECT id FROM assignments ORDER BY id LIMIT 6)").bind(LONG + "").run(); await DB.prepare("UPDATE assignments SET title = substr(?,1,200) WHERE 1=0").bind(LONG).run(); } });
    const n = (await server.DB.prepare("SELECT COUNT(*) n, MAX(length(title)) m FROM assignments WHERE length(title)>=190").first());
    out[ds + "_longRows"] = n;
    const browser = await L.pw.chromium.launch();
    for (const dev of ["phone375", "ipadP", "w1536"]) {
      const { ctx, page } = await L.newPage(browser, server, dev);
      await L.go(page, ds === "home" ? "#/" : "#/scan", null); await L.sleep(1500);
      out[ds + "_" + dev] = await page.evaluate((pre) => {
        const els = [...document.querySelectorAll("body *")].filter((e) => e.children.length === 0 && (e.textContent || "").includes(pre));
        const info = els.slice(0, 40).map((e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return { cls: e.className?.toString().slice(0, 30), h: Math.round(b.height), clamp: cs.webkitLineClamp, lh: cs.lineHeight, ov: cs.overflow }; });
        return { n: els.length, minH: Math.min(...info.map((i) => i.h)), maxH: Math.max(...info.map((i) => i.h)), clamps: [...new Set(info.map((i) => i.clamp))], sample: info.slice(0, 3), pageH: document.documentElement.scrollHeight, hOverflow: document.documentElement.scrollWidth > innerWidth + 1, scrollW: document.documentElement.scrollWidth, iw: innerWidth };
      }, "ใบงานชื่อยาวมากเพื่อทดสอบ");
      await ctx.close();
    }
    await browser.close(); await server.close?.();
  }
  fs.writeFileSync(__dirname + "/long-result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out)); process.exit(0);
})();

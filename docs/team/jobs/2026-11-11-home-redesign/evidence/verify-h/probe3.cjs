const L = require("./lib.cjs"); const LONG = "ใบงานชื่อยาวมากเพื่อทดสอบการตัดข้อความ" + "ก".repeat(160) + "จบ";
(async () => {
  const server = await L.startFixtureServer({ port: 4222, assetsDir: process.env.QA_ASSETS, dataset: "home", lateAfter: "00:00", afterSeed: async (DB) => { await DB.prepare("UPDATE assignments SET title = ? WHERE id IN (SELECT id FROM assignments ORDER BY id LIMIT 6)").bind(LONG).run(); } });
  const browser = await L.pw.chromium.launch(); const { ctx, page } = await L.newPage(browser, server, "phone375");
  await L.go(page, "#/", null); await L.sleep(1500);
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.children.length === 0 && e.textContent.includes("ใบงานชื่อยาวมาก") && getComputedStyle(e).webkitLineClamp === "none").map((e) => { const p = []; let n = e; for (let i = 0; i < 4 && n; i++, n = n.parentElement) p.push(n.tagName + "." + n.className); const b = e.getBoundingClientRect(); return { path: p.join(" < "), top: Math.round(b.top + scrollY), h: Math.round(b.height), w: Math.round(b.width), tag: e.tagName, vis: getComputedStyle(e).visibility, op: getComputedStyle(e).opacity, text: e.textContent.slice(0, 30) }; }))));
  await page.screenshot({ path: __dirname + "/long-home-375.png", fullPage: false });
  await browser.close(); await server.close?.(); process.exit(0);
})();

const L = require("./lib.cjs");
(async () => {
  const ds = process.argv[2] || "layout"; const dev = process.argv[3] || "ipadL";
  const opts = ds === "layout" ? { layout: true } : { dataset: ds };
  const server = await L.startFixtureServer({ port: 4240, assetsDir: process.env.QA_ASSETS, ...opts });
  const browser = await L.pw.chromium.launch();
  const { ctx, page } = await L.newPage(browser, server, dev);
  await L.go(page, "#/gradebook" + (process.argv[4] || ""), "table.gb tbody tr");
  const r = await page.evaluate(() => {
    const out = []; let el = document.querySelector(".gb-scroll");
    const kids = [...document.querySelector(".gb-page").children].map((c) => c.className + ":" + Math.round(c.getBoundingClientRect().height) + "@" + Math.round(c.getBoundingClientRect().top));
    const tb = [...document.querySelector(".gb-toolbar").children].map((c) => { const b = c.getBoundingClientRect(); return c.className + ":" + Math.round(b.width) + "x" + Math.round(b.height) + "@" + Math.round(b.top) + " " + c.innerText.replace(/\s+/g, " ").slice(0, 40); });
    return { tb, kids, cols: document.querySelectorAll("th.col-w").length, rows: document.querySelectorAll("table.gb tbody tr").length, top: document.querySelector(".gb-scroll").getBoundingClientRect().top, sel: [...document.querySelectorAll("select")].map(s=>s.getAttribute("aria-label")+"="+s.value) };
  });
  console.log(ds, dev, JSON.stringify(r, null, 1));
  await browser.close(); await server.close?.(); process.exit(0);
})();

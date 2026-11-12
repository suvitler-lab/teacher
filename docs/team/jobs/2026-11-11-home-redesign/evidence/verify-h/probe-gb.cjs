const L = require("./lib.cjs");
(async () => {
  const server = await L.startFixtureServer({ port: 4220, assetsDir: process.env.QA_ASSETS, layout: true });
  const browser = await L.pw.chromium.launch();
  for (const dev of ["desk", "ipadL", "ipadP", "phone"]) {
    const { ctx, page } = await L.newPage(browser, server, dev);
    await L.go(page, "#/gradebook?subject=sub_math", dev==="phone"?null:"table.gb tbody tr");
    const r = await page.evaluate(() => {
      const vh = innerHeight; const rows = [...document.querySelectorAll("table.gb tbody tr")].map((t) => t.getBoundingClientRect());
      const fully = rows.filter((b) => b.top >= 0 && b.bottom <= vh).length;
      const cols = document.querySelectorAll("table.gb thead th.col-w").length;
      const sc = document.querySelector(".gb-scroll")?.getBoundingClientRect();
      return { vh, rows: rows.length, fully, cols, rowH: rows[0]?.height, scrollTop: sc?.top, scrollBottom: sc?.bottom, pageH: document.documentElement.scrollHeight, coarse: matchMedia("(pointer:coarse)").matches, fs: getComputedStyle(document.documentElement).fontSize };
    });
    console.log(dev, JSON.stringify(r)); await ctx.close();
  }
  await browser.close(); await server.close?.(); process.exit(0);
})();

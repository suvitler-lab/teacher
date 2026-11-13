// AC-171 reports table share + rows (Q-7602), AC-185 students rows (Q-7603) -- layout fixture: 45 children in ป.6/1
const L = require("./lib.cjs");
(async () => {
  const server = await L.startFixtureServer({ port: 4241, assetsDir: process.env.QA_ASSETS, layout: true });
  const browser = await L.pw.chromium.launch(); const out = { reports: {}, students: {} };
  for (const dev of ["desk", "ipadL", "ipadP", "phone"]) {
    const { ctx, page } = await L.newPage(browser, server, dev);
    await L.go(page, "#/reports", null); await L.sleep(1500);
    out.reports[dev] = await page.evaluate(() => {
      const vh = innerHeight, t = document.querySelector("table.rp-table"); if (!t) return { noTable: true, pageH: document.documentElement.scrollHeight, text: document.body.innerText.slice(0, 80) };
      let f = t.parentElement; while (f && f !== document.body && !/(auto|scroll)/.test(getComputedStyle(f).overflowY + getComputedStyle(f).overflowX)) f = f.parentElement;
      const fb = (f || t).getBoundingClientRect(); const mEl = document.querySelector("main") || document.body; const mcs = getComputedStyle(mEl); const mainContentW = mEl.getBoundingClientRect().width - parseFloat(mcs.paddingLeft) - parseFloat(mcs.paddingRight); const main = { width: mainContentW };
      const rows = [...t.querySelectorAll("tbody tr")].map((r) => r.getBoundingClientRect());
      return { vh, tableW: Math.round(fb.width), mainW: Math.round(main.width), ratio: +(fb.width / main.width).toFixed(3), tableTop: Math.round(fb.top), rows: rows.length, fullRowsInFrame: rows.filter((b) => b.top >= fb.top - 1 && b.bottom <= Math.min(fb.bottom, vh) + 1).length, rowH: Math.round(rows[0]?.height || 0), frameH: Math.round(fb.height), capacity: Math.floor((fb.height - (t.querySelector("thead")?.getBoundingClientRect().height || 0)) / (rows[0]?.height || 1)), pageScrollY: document.documentElement.scrollHeight - vh, hOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    await L.go(page, "#/students", ".stu-rowwrap"); await L.sleep(700);
    out.students[dev] = await page.evaluate(() => {
      const vh = innerHeight; const rows = [...document.querySelectorAll(".stu-rowwrap")].map((r) => r.getBoundingClientRect());
      let f = document.querySelector(".stu-rowwrap")?.parentElement; while (f && f !== document.body && !/(auto|scroll)/.test(getComputedStyle(f).overflowY)) f = f.parentElement;
      const fb = f && f !== document.body ? f.getBoundingClientRect() : { top: 0, bottom: vh };
      return { vh, rows: rows.length, fullRows: rows.filter((b) => b.top >= fb.top - 1 && b.bottom <= Math.min(fb.bottom, vh) + 1).length, rowH: Math.round(rows[0]?.height || 0), firstTop: Math.round(rows[0]?.top || 0), innerScroller: !!(f && f !== document.body), hOverflow: document.documentElement.scrollWidth > innerWidth + 1, pageH: document.documentElement.scrollHeight };
    });
    await ctx.close();
  }
  require("fs").writeFileSync(__dirname + "/rs-result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out)); await browser.close(); await server.close?.(); process.exit(0);
})();

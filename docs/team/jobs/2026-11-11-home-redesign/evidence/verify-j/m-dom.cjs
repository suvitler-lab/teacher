// T-89: DOM facts on the frozen build (fixture-server): AC-10 home quick buttons, AC-83 attendance room chips / ?class=, AC-98 period mode.
const L = require("./lib.cjs");
(async () => {
  setTimeout(() => { console.error("HARD TIMEOUT"); process.exit(2); }, 100000);
  const server = await L.startFixtureServer({ port: +process.env.QA_PORT || 4265, assetsDir: process.env.QA_ASSETS });
  const browser = await L.pw.chromium.launch(); const { ctx, page } = await L.newPage(browser, server, "desk"); const out = {};
  await L.go(page, "#/home", null); await L.sleep(2000);
  out.homeQuick = await page.evaluate(() => [...document.querySelectorAll("a[href^='#/']")].filter((a) => /สแกนส่งงาน|เช็คชื่อ|สุ่มชื่อ|สร้างงาน/.test(a.textContent)).map((a) => ({ t: a.textContent.trim().replace(/\s+/g, " ").slice(0, 60), href: a.getAttribute("href") })));
  await L.go(page, "#/attendance", null); await L.sleep(2000);
  out.attChips = await page.evaluate(() => [...document.querySelectorAll("button.pill, [role=group] button")].map((b) => ({ t: (b.getAttribute("aria-label") || b.textContent).trim().replace(/\s+/g, " ").slice(0, 70), p: b.getAttribute("aria-pressed") })).slice(0, 24));
  out.attHash = await page.evaluate(() => location.hash);
  // period mode
  const per = page.getByRole("button", { name: "รายคาบ" }); if (await per.count()) { await per.first().click(); await L.sleep(1200); }
  out.period = await page.evaluate(() => ({ pills: [...document.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent.trim().slice(0, 14) + ":" + b.getAttribute("aria-pressed")).slice(0, 30), week: !!document.querySelector("#att-week-h, .att-week"), month: !!document.getElementById("att-month-h"), warn: /ยังไม่ได้ตั้งเวลาเริ่ม/.test(document.body.innerText) }));
  require("fs").writeFileSync(__dirname + "/dom-result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out)); await ctx.close(); await browser.close(); await server.close?.(); process.exit(0);
})();

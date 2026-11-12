const L = require("./lib.cjs");
(async () => {
  const dev = process.argv[2] || "desk";
  const server = await L.startFixtureServer({ port: 4224, assetsDir: process.env.QA_ASSETS, layout: true, lateAfter: "00:00" });
  const browser = await L.pw.chromium.launch(); const { ctx, page } = await L.newPage(browser, server, dev);
  await L.go(page, "#/random", null); await L.sleep(1500);
  const dump = () => page.evaluate(() => { const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return [...document.querySelectorAll('[class*="rnd-"]')].filter((e) => e.getBoundingClientRect().height > 20).slice(0, 40).map((e) => e.tagName + "." + e.className.toString().slice(0, 28) + " " + r(e).join(",") + " fs" + parseFloat(getComputedStyle(e).fontSize)); });
  console.log("BEFORE", JSON.stringify(await dump(), null, 0));
  console.log("NOTICE",await page.locator(".rnd-notice").innerText(),"| chips",JSON.stringify(await page.locator(".rnd-poolchip").allInnerTexts()));await page.getByRole("button",{name:/ใช้ทั้งห้อง/}).click();await L.sleep(600);console.log("go disabled?",await page.locator("button.rnd-go").isDisabled());await page.locator("button.rnd-go").click(); await L.sleep(4500);
  console.log("AFTER", JSON.stringify(await dump(), null, 0));
  await browser.close(); await server.close?.(); process.exit(0);
})();

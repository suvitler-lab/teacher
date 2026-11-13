const path = require("node:path"); const { execSync } = require("node:child_process");
const R = "C:/Users/User/Desktop/teacher";
const { startFixtureServer } = require(R + "/scripts/fixture-server.cjs");
const pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEV = { desk: [1536, 729, false, 1], ipadL: [1180, 820, true, 2], ipadP: [820, 1180, true, 2], phone: [390, 844, true, 3], phone375: [375, 812, true, 3], w1536: [1536, 729, false, 1] };
async function newPage(browser, server, dev, { login = true, locale = "th-TH" } = {}) {
  const [w, h, touch, dpr] = DEV[dev];
  const ctx = await browser.newContext({ viewport: null, locale, acceptDownloads: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: touch });
  await cdp.send("Emulation.setTouchEmulationEnabled", touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  page.on("pageerror", (e) => (page._errs ||= []).push(e.message));
  await page.goto(server.url);
  if (login) {
    await page.fill("input[type=email]", server.email); await page.fill("input[type=password]", server.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await page.waitForFunction(() => /หน้าหลัก/.test(document.body.innerText) || !!document.querySelector("nav"), null, { timeout: 20000 });
    await sleep(800);
  }
  return { ctx, page, cdp };
}
const go = async (page, hash, sel) => { await page.evaluate((x) => { location.hash = x; }, hash); if (sel) await page.waitForSelector(sel, { timeout: 15000 }); await sleep(700); };
const res = [];
const check = (n, ok, d = "") => { res.push({ n, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
module.exports = { R, startFixtureServer, pw, sleep, DEV, newPage, go, check, res };

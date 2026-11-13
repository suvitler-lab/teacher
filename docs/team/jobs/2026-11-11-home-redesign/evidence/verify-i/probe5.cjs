const L = require("./lib.cjs");
(async () => {
  const server = await L.startFixtureServer({ port: 4240, assetsDir: process.env.QA_ASSETS, layout: true, lateAfter: "00:00", settings: { accent: JSON.stringify({ v: 1, skin: "pro", layout: "b" }) } });
  const kids = (await server.DB.prepare("SELECT first_name, nickname FROM students WHERE status='active'").all()).results;
  const names = [...new Set(kids.flatMap((k) => [k.first_name, k.nickname]).filter((x) => x && x.length >= 3))];
  const browser = await L.pw.chromium.launch(); const { ctx, page } = await L.newPage(browser, server, "desk");
  for (const h of ["#/students", "#/reports", "#/gradebook?subject=sub_math", "#/scan"]) {
    await L.go(page, h, null); await L.sleep(1500);
    console.log(h, JSON.stringify(await page.evaluate((ns) => { const hay = [document.body.innerText, ...[...document.querySelectorAll("[aria-label],[title],input")].map((e) => [e.getAttribute("aria-label"), e.title, e.value].join(" "))].join("\n"); return ns.filter((n) => hay.includes(n)).map((n) => n + "@" + hay.indexOf(n) + ":" + hay.slice(Math.max(0, hay.indexOf(n) - 25), hay.indexOf(n) + 25).replace(/\n/g, " ")); }, names)));
  }
  await L.go(page, "#/", null); await L.sleep(1800);
  await page.screenshot({ path: __dirname + "/home-b-pro-light.png" });
  console.log("b bg of first .nm:", await page.evaluate(() => { const e = document.querySelector("span.nm"); if (!e) return "none"; const cs = getComputedStyle(e); const chain = []; for (let n = e; n && chain.length < 6; n = n.parentElement) chain.push(n.tagName + "." + n.className + " bg=" + getComputedStyle(n).backgroundColor + " img=" + getComputedStyle(n).backgroundImage.slice(0, 40)); return cs.color + " | " + chain.join(" < "); }));
  await browser.close(); await server.close?.(); process.exit(0);
})();

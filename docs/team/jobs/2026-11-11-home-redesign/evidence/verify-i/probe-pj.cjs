const L = require("./lib.cjs");
(async () => {
  const server = await L.startFixtureServer({ port: 4245, assetsDir: process.env.QA_ASSETS, layout: true, lateAfter: "00:00" });
  const browser = await L.pw.chromium.launch(); const { page } = await L.newPage(browser, server, "desk");
  await page.evaluate(() => sessionStorage.setItem("ngankrob-projector", "1")); await page.reload(); await L.sleep(2500);
  console.log("pj-on?", await page.evaluate(() => ({ ss: sessionStorage.getItem("ngankrob-projector"), cls: document.documentElement.className + "|" + document.body.className, exitBtn: !![...document.querySelectorAll("button")].find((b) => /ออกจากโหมดฉาย|ปิดโหมดฉาย/.test(b.innerText + b.getAttribute("aria-label"))) })));
  await L.go(page, "#/settings?section=catalog&tab=terms", null); await L.sleep(1500);
  console.log("url after nav", await page.evaluate(() => location.hash + " | " + document.body.innerText.slice(0, 120).replace(/\n/g, " ")));
  const opener = page.getByRole("button", { name: /ภาคเรียน/ }).filter({ hasText: /(ตั้ง|เริ่ม)/ }).first();
  console.log("hint text", await page.evaluate(() => document.body.innerText.includes("ปิดอยู่ตอนฉายจอ")));console.log("opener", await opener.innerText().catch(() => "none"), "disabled=", await opener.isDisabled().catch(() => "n/a"));
  await opener.click({ force: true, timeout: 3000 }).catch((e) => console.log("click err", String(e).slice(0, 80))); await L.sleep(1000);
  console.log("dialog", await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); return d ? { text: d.innerText.slice(0, 300).replace(/\n/g, " / "), prim: [...d.querySelectorAll("button")].map((b) => b.innerText.trim().slice(0, 25) + ":dis=" + b.disabled) } : null; }));
  await browser.close(); await server.close?.(); process.exit(0);
})();

// Q-7007 random, Q-7008 scan result name + taps, Q-7009 tap sizes on 8 pages  (touch devices via CDP)
const L = require("./lib.cjs"); const fs = require("fs");
const tapScan = () => {
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [role=link]';
  const bad = []; let total = 0;
  for (const e of document.querySelectorAll(sel)) {
    if (e.closest(".sr-only, [aria-hidden=true], [hidden], [inert]")) continue;
    const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const b = e.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue;
    if (/^(1px|0px)$/.test(cs.clip === "auto" ? "" : "")) continue;
    total++;
    if (Math.min(b.width, b.height) < 43.5) bad.push((e.tagName + "." + (e.className || "").toString().split(" ")[0] + "[" + (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 14) + "]") + " " + Math.round(b.width) + "x" + Math.round(b.height));
  }
  return { total, small: bad.length, sample: bad.slice(0, 8), hOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
};
(async () => {
  const out = { taps: {}, random: {}, scan: {} };
  const browser = await L.pw.chromium.launch();
  const server = await L.startFixtureServer({ port: 4224, assetsDir: process.env.QA_ASSETS, layout: true, lateAfter: "00:00" });
  const hs = await L.startFixtureServer({ port: 4225, assetsDir: process.env.QA_ASSETS, dataset: "home", lateAfter: "00:00" });
  const kid = (await server.DB.prepare("SELECT first_name, number FROM students WHERE class_id='cls_61' AND status='active' AND number=7").first());
  for (const dev of ["desk", "ipadL", "ipadP", "phone"]) {
    const { ctx, page } = await L.newPage(browser, server, dev);
    for (const [name, hash] of [["attendance", "#/attendance"], ["random", "#/random"], ["gradebook", "#/gradebook?subject=sub_math"], ["reports", "#/reports"], ["students", "#/students"], ["settings", "#/settings"], ["scan-setup", "#/scan"]]) {
      console.error(dev, name, Date.now()); await L.go(page, hash, null); await L.sleep(1300);
      out.taps[dev + ":" + name] = await page.evaluate(tapScan);
      if (name === "random") {
        const go = page.locator(".rnd-gobtn").first();
        await go.click(); await L.sleep(4500);
        out.random[dev] = await page.evaluate(() => {
          const b = document.querySelector(".rnd-gobtn")?.getBoundingClientRect(); const st = [...document.querySelectorAll('[class*="rnd-stage"]')].filter((e) => !/timer|-/.test(e.className.toString().replace("rnd-stage", "")) || e.className.toString().split(" ").includes("rnd-stage"))[0];
          const hero = document.querySelector(".rnd-hero")?.getBoundingClientRect(); const sb = st?.getBoundingClientRect();
          let nameFs = 0, nameTxt = ""; if (st) for (const e of st.querySelectorAll("*")) { if (e.children.length === 0 && e.textContent.trim().length > 1) { const f = parseFloat(getComputedStyle(e).fontSize); if (f > nameFs) { nameFs = f; nameTxt = e.textContent.trim().slice(0, 12); } } }
          return { vh: innerHeight, hero: hero && Math.round(hero.height), stageH: sb && Math.round(sb.height), btn: b && [Math.round(b.width), Math.round(b.height), Math.round(b.top), Math.round(b.bottom)], btnVisibleNoScroll: !!b && b.bottom <= innerHeight, nameFs: +nameFs.toFixed(1), nameTxt, pageH: document.documentElement.scrollHeight, stageCls: st?.className.toString() };
        });
      }
      if (name === "scan-setup") {
        const asg = page.locator(".sc-asg").first(); if (await asg.count()) await asg.click();
        const st = page.getByRole("button", { name: /เริ่มสแกน/ }); if (await st.count()) { await st.click(); await L.sleep(800); }
        out.taps[dev + ":scan-run"] = await page.evaluate(tapScan);
        const inp = page.locator('input[aria-label="รหัสนักเรียน"]');
        if (await inp.count()) {
          await inp.fill(String(kid.number)); await inp.press("Enter"); await L.sleep(900);
          out.scan[dev] = await page.evaluate((nm) => {
            let best = 0, tx = ""; for (const e of document.querySelectorAll("body *")) { if (e.children.length === 0 && e.textContent.includes(nm) && e.getBoundingClientRect().width > 0) { const f = parseFloat(getComputedStyle(e).fontSize); if (f > best) { best = f; tx = e.className.toString().slice(0, 20) + ":" + e.textContent.trim().slice(0, 16); } } }
            return { nameFs: +best.toFixed(1), el: tx, hOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
          }, kid.first_name);
          out.taps[dev + ":scan-result"] = await page.evaluate(tapScan);
        } else out.scan[dev] = { noInput: true };
      }
    }
    await ctx.close();
    const h = await L.newPage(browser, hs, dev); await L.go(h.page, "#/", null); await L.sleep(1500);
    out.taps[dev + ":home"] = await h.page.evaluate(tapScan); await h.ctx.close();
  }
  fs.writeFileSync(__dirname + "/ui-result.json", JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out)); await browser.close(); await server.close?.(); await hs.close?.(); process.exit(0);
})();

// Q-7010 / Q-7605: computed-colour contrast, 3 skins x light/dark, home a/b/c + settings + scan, desk + phone; + .stu-tile:disabled; + att-week disabled chip (clock faked to a Wednesday)
const L = require("./lib.cjs"); const fs = require("fs");
const measure = (opt) => { const scope = (opt && opt.scope) || "body", incDis = !!(opt && opt.incDis);
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const blend = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (e) => { const chain = []; for (let n = e; n; n = n.parentElement) chain.push(n); let base = { r: 255, g: 255, b: 255, a: 1 }; let grad = false;
    for (let i = chain.length - 1; i >= 0; i--) { const cs = getComputedStyle(chain[i]); if (cs.backgroundImage !== "none" && /gradient/.test(cs.backgroundImage)) grad = true; const c = parse(cs.backgroundColor); if (c.a > 0) base = blend(c, base); } return { base, grad }; };
  const fails = []; let min = 99, n = 0, skipped = 0;
  for (const e of document.querySelectorAll(scope + " *")) {
    let t = ""; for (const c of e.childNodes) if (c.nodeType === 3) t += c.textContent; t = t.trim(); if (!t) continue;
    const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") continue;
    const b = e.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue;
    if (e.closest(".sr-only, [aria-hidden=true]")) continue;
    if (!incDis && e.closest(":disabled, [aria-disabled=true]")) { skipped++; continue; }
    let op = 1; for (let k = e; k; k = k.parentElement) op *= +getComputedStyle(k).opacity; if (op < 0.05) continue;
    const { base, grad } = bgOf(e); if (grad) { skipped++; continue; }
    let fg = parse(cs.color); fg = { ...fg, a: fg.a * op }; const f = blend(fg, base);
    const L1 = lum(f), L2 = lum(base); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
    n++; if (ratio < min) min = ratio; if (ratio < need) fails.push(`${e.tagName}.${(e.className || "").toString().split(" ")[0]} "${t.slice(0, 16)}" ${ratio.toFixed(2)}<${need}`);
  }
  return { n, tags: undefined, min: +min.toFixed(2), skipped, fails: fails.length, sample: fails.slice(0, 5) };
};
const setLook = (page, skin, theme) => page.evaluate(([s, t]) => { const r = document.documentElement; r.setAttribute("data-skin", s); r.setAttribute("data-theme", t); }, [skin, theme]);
(async () => {
  const out = { con: {}, tile: {}, tile0: {}, week: {} }; const browser = await L.pw.chromium.launch();
  for (const layout of ["a", "b", "c"]) {
    const server = await L.startFixtureServer({ port: 4226, assetsDir: process.env.QA_ASSETS, dataset: "home", lateAfter: "00:00", settings: { accent: JSON.stringify({ v: 1, skin: "pro", layout }) } });
    for (const dev of ["desk", "phone"]) {
      const { ctx, page } = await L.newPage(browser, server, dev);
      const pages = layout === "a" ? [["home-a", "#/"], ["settings", "#/settings"], ["scan", "#/scan"]] : [["home-" + layout, "#/"]];
      for (const [nm, hash] of pages) {
        await L.go(page, hash, null); await L.sleep(1500);
        console.error(layout, dev, nm, "layout attr", await page.evaluate(() => document.documentElement.getAttribute("data-layout")));
        for (const skin of ["pro", "warm", "playful"]) for (const theme of ["light", "dark"]) { await setLook(page, skin, theme); await L.sleep(250); out.con[`${nm}|${dev}|${skin}|${theme}`] = await page.evaluate(measure); }
      }
      if (layout === "a") { // students tile disabled
        await L.go(page, "#/students", null); await L.sleep(1500);
        for (const skin of ["pro", "warm", "playful"]) for (const theme of ["light", "dark"]) { await setLook(page, skin, theme); await L.sleep(200);
          out.tile0[`${dev}|${skin}|${theme}`] = await page.evaluate(() => { const els = [...document.querySelectorAll(".stu-tile:disabled")]; if (!els.length) return { count: 0 };
            const parse = (c) => c.match(/[\d.]+/g).map(Number); const lum = (m) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
            return { count: els.length, ratios: els.flatMap((e) => [...e.querySelectorAll("*"), e].filter((x) => [...x.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((x) => { let bg = "rgba(0, 0, 0, 0)", n = x; while (n && /rgba\(.*, 0\)|transparent/.test(bg)) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; } const op = +getComputedStyle(e).opacity; const a = parse(getComputedStyle(x).color), b = parse(bg); const m = a.map((v, i) => i < 3 ? v * op + b[i] * (1 - op) : 1); const L1 = lum(m), L2 = lum(b); return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2); })) }; }); }
      }
      await ctx.close();
    }
    if (layout === "a") { // attendance week chip with a fake Wednesday
      const { ctx, page } = await L.newPage(browser, server, "desk", { login: false });
      await page.clock.install({ time: new Date("2026-11-11T05:00:00Z") });
      await page.goto(server.url); await page.fill("input[type=email]", server.email); await page.fill("input[type=password]", server.password); await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click(); await L.sleep(2500);
      await L.go(page, "#/attendance", null); await L.sleep(2500);
      for (const skin of ["pro", "warm", "playful"]) for (const theme of ["light", "dark"]) { await setLook(page, skin, theme); await L.sleep(200);
        out.week[`${skin}|${theme}`] = await page.evaluate(() => { const ch = [...document.querySelectorAll(".att-week button:disabled, .att-week [aria-disabled=true]")]; return { disabledChips: ch.length, texts: ch.slice(0, 3).map((c) => c.textContent.trim().slice(0, 20)) }; }); out.week[`${skin}|${theme}`].contrast = await page.evaluate(measure, { scope: ".att-week button:disabled", incDis: true }); }
      // contrast for the disabled chip, light/pro
      await ctx.close();
    }
    await server.close?.();
  }
  { const server = await L.startFixtureServer({ port: 4226, assetsDir: process.env.QA_ASSETS, dataset: "home-clear", lateAfter: "00:00" }); for (const dev of ["desk", "phone"]) { const { ctx, page } = await L.newPage(browser, server, dev); await L.go(page, "#/students", null); await L.sleep(1800); for (const skin of ["pro", "warm", "playful"]) for (const theme of ["light", "dark"]) { await setLook(page, skin, theme); await L.sleep(200); out.tile[`${dev}|${skin}|${theme}`] = await page.evaluate(measure, { scope: ".stu-tile:disabled", incDis: true }); } await ctx.close(); } await server.close?.(); }
  fs.writeFileSync(__dirname + "/con-result.json", JSON.stringify(out, null, 1)); console.log("done"); await browser.close(); process.exit(0);
})();

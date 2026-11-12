// Q-7102 xlsx offline · Q-7106 clear local prefs keeps failed-queue + ?section= links · Q-7107 hide-names PII on 7 pages · Q-7304 print media · Q-7305 StartTermModal + projector
const L = require("./lib.cjs"); const fs = require("fs");
(async () => {
  const out = {}; const log = (k, v) => { out[k] = v; console.log(k, JSON.stringify(v)); };
  const server = await L.startFixtureServer({ port: 4220, assetsDir: process.env.QA_ASSETS, layout: true, lateAfter: "00:00" });
  const kids = (await server.DB.prepare("SELECT first_name, last_name, nickname FROM students WHERE status='active'").all()).results;
  const names = [...new Set(kids.flatMap((k) => [k.first_name, k.nickname]).filter((x) => x && x.length >= 3))];
  const browser = await L.pw.chromium.launch();
  const countNames = (page) => page.evaluate((ns) => { const hay = [document.body.innerText, ...[...document.querySelectorAll("[aria-label],[title],[alt],input,[placeholder]")].map((e) => [e.getAttribute("aria-label"), e.title, e.getAttribute("alt"), e.value, e.placeholder].join(" "))].join(" \n "); return ns.filter((n) => hay.includes(n)).length; }, names);
  // ---- 7102
  {
    const { ctx, page } = await L.newPage(browser, server, "desk");
    await L.go(page, "#/students", ".stu-rowwrap"); await page.evaluate(async () => { await navigator.serviceWorker?.ready; }); await L.sleep(2500);
    const sw = await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? -1);
    await page.getByRole("button", { name: /นำเข้า Excel/ }).first().click(); await L.sleep(800);
    await ctx.setOffline(true); await L.sleep(500);
    let r; try { const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator(".stu-tplbtn").first().click()]); const p = await dl.path(); const buf = fs.readFileSync(p); r = { file: dl.suggestedFilename(), bytes: buf.length, zip: buf.slice(0, 2).toString() === "PK" }; } catch (e) { r = { error: String(e).slice(0, 200) }; }
    log("7102", { swRegistrations: sw, ...r }); await ctx.close();
  }
  // ---- 7106
  {
    const { ctx, page } = await L.newPage(browser, server, "desk");
    await L.go(page, "#/settings", null); await L.sleep(1000);
    await page.evaluate(() => new Promise((res, rej) => { const q = indexedDB.open("ngankrob"); q.onsuccess = () => { const d = q.result; const t = d.transaction("failed", "readwrite"); const s = t.objectStore("failed"); s.put({ opId: "qa_h_1", kind: "submission", payload: { assignmentId: "x", studentId: "y" }, reason: "rejected", at: Date.now() }); s.put({ opId: "qa_h_2", kind: "submission", payload: { assignmentId: "x", studentId: "z" }, reason: "rejected", at: Date.now() }); t.oncomplete = () => { d.close(); res(); }; t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); }));
    await page.evaluate(() => { localStorage.setItem("ngankrob-font-size", "20"); });
    const failedN = () => page.evaluate(() => new Promise((res) => { const q = indexedDB.open("ngankrob"); q.onsuccess = () => { const d = q.result; const c = d.transaction("failed").objectStore("failed").count(); c.onsuccess = () => { d.close(); res(c.result); }; }; }));
    const before = await failedN(); const prefsBefore = await page.evaluate(() => Object.keys(localStorage).length);
    await L.go(page, "#/settings?section=device", null); await L.sleep(1200);
    await page.getByRole("button", { name: /ล้างค่าที่จำ/ }).first().click(); await L.sleep(500);
    await page.getByRole("button", { name: "ล้างค่าในเครื่องนี้" }).click(); await L.sleep(1200);
    const after = await failedN(); const fs20 = await page.evaluate(() => localStorage.getItem("ngankrob-font-size"));
    const sections = {}; for (const k of ["backup", "worktypes", "catalog&tab=types", "devices", "danger", "nonsense"]) { await L.go(page, "#/settings?section=" + k, null); await L.sleep(700); sections[k] = (await page.locator("h1, h2.set-section-title").first().innerText().catch(() => "?")).slice(0, 40) + " | " + (await page.locator('[aria-current="page"], [aria-current=true], .set-nav .on').first().innerText().catch(() => "?")).replace(/\s+/g, " ").slice(0, 30); }
    log("7106", { failedBefore: before, failedAfter: after, fontPrefAfterClear: fs20, localKeysBefore: prefsBefore, sections }); await ctx.close();
  }
  // ---- 7107 + 7304
  {
    const { ctx, page } = await L.newPage(browser, server, "desk");
    const pages = [["home", "#/"], ["scan", "#/scan"], ["attendance", "#/attendance"], ["random", "#/random"], ["gradebook", "#/gradebook?subject=sub_math"], ["reports", "#/reports"], ["students", "#/students"]];
    await L.go(page, "#/students", ".stu-rowwrap"); const control = await countNames(page); log("7107.control(students, names shown)", control);
    const hideBtn = page.getByRole("button", { name: /ซ่อนชื่อ/ }).first(); log("7107.hideBtn", await hideBtn.innerText().catch(() => "none"));
    await hideBtn.click(); await L.sleep(1000);
    const hit = {}; for (const [n, h] of pages) { await L.go(page, h, null); await L.sleep(1500); hit[n] = await countNames(page); } log("7107.after-hide", hit);
    const prt = {}; await page.emulateMedia({ media: "print" });
    for (const [n, h] of pages.filter((p) => ["reports", "students", "attendance", "gradebook"].includes(p[0]))) { await L.go(page, h, null); await L.sleep(1500); prt[n] = { names: await countNames(page), chars: await page.evaluate(() => document.body.innerText.length) }; } log("7304.print-hide", prt);
    await page.emulateMedia({ media: "screen" }); await ctx.close();
  }
  // ---- 7305
  {
    const { ctx, page } = await L.newPage(browser, server, "desk");
    await L.go(page, "#/attendance", null); await L.sleep(1200);
    const pj = page.getByRole("button", { name: /โหมดฉายจอ/ }).first(); await pj.click().catch((e) => log("7305.pjclick", String(e).slice(0, 100))); await L.sleep(1000);
    log("7305.session", await page.evaluate(() => JSON.stringify(Object.entries(sessionStorage).filter(([k]) => /proj|pj/i.test(k)))));
    await L.go(page, "#/settings?section=catalog&tab=terms", null); await L.sleep(1500);
    const opener = page.getByRole("button", { name: /ภาคเรียน/ }).filter({ hasText: /(ตั้ง|เริ่ม)/ }).first();
    log("7305.opener", await opener.innerText().catch(() => "none"));
    await opener.focus(); await opener.click({ force: true }).catch(() => {}); await L.sleep(1000);
    const info = await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); if (!d) return { dialog: false }; const prim = [...d.querySelectorAll("button.primary")].map((b) => b.innerText.trim().slice(0, 30) + ":disabled=" + b.disabled); return { dialog: true, primary: prim, active: document.activeElement?.tagName + ":" + (document.activeElement?.getAttribute("type") || "") + ":autofocus=" + document.activeElement?.hasAttribute("data-autofocus"), note: (d.innerText.match(/ฉายจอ.{0,60}/) || [""])[0] }; });
    log("7305.modal(projector on)", info);
    await page.keyboard.press("Escape"); await L.sleep(600);
    log("7305.after-close", await page.evaluate(() => ({ dialog: !!document.querySelector("[role=dialog]"), active: document.activeElement?.tagName + ":" + (document.activeElement?.innerText || "").trim().slice(0, 25) })));
    await ctx.close();
  }
  fs.writeFileSync(__dirname + "/misc-result.json", JSON.stringify(out, null, 1)); await browser.close(); await server.close?.(); process.exit(0);
})();

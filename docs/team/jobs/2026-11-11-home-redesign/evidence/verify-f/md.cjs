// multi-device QA: two browser contexts on one fixture server
const path = require("node:path"); const { execSync } = require("node:child_process");
const R = "C:/Users/User/Desktop/teacher";
const { startFixtureServer } = require(R + "/scripts/fixture-server.cjs");
let pw; try { pw = require("playwright"); } catch { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
const res = []; const check = (n, ok, d = "") => { res.push({ n, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, t = 20000) => { const e = Date.now() + t; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > e) return false; await sleep(250); } };
(async () => {
  const server = await startFixtureServer({ port: Number(process.env.QA_PORT || 4200), assetsDir: process.env.QA_ASSETS });
  const sql = async (q, ...b) => (await server.DB.prepare(q).bind(...b).all()).results;
  const browser = await pw.chromium.launch();
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: "th-TH" });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(server.url);
    await page.fill("input[type=email]", server.email); await page.fill("input[type=password]", server.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await page.waitForFunction(() => /หน้าหลัก/.test(document.body.innerText), null, { timeout: 20000 });
    return { name, ctx, page, errs };
  };
  const A = await mk("A"), B = await mk("B");
  const go = (d, h) => d.page.evaluate((x) => { location.hash = x; }, h);
  const kids = await sql("SELECT id, number, first_name FROM students WHERE class_id='cls_61' AND status='active' ORDER BY number LIMIT 20");
  const first = (n) => kids.find((k) => k.number === n).first_name;
  const badge = async (d) => (await d.page.locator(".rail-sync .sync").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  const attRows = (sid) => sql("SELECT a.student_id, a.status FROM attendance a JOIN attendance_sessions s ON s.id=a.session_id WHERE s.class_id='cls_61' AND s.subject_id IS NULL AND s.date=? AND a.student_id=?", server.info.today, sid);
  const openAtt = async (d) => { await go(d, "#/attendance"); await d.page.waitForSelector(".att-tiles:not(.loading) .att-tile", { timeout: 15000 }); await sleep(300); };
  const tile = (d, n) => d.page.locator(".att-tile").nth(n - 1);
  const cls = async (d, n) => await tile(d, n).getAttribute("class");
  const asgId = (await server.DB.prepare("SELECT id FROM assignments WHERE instr(title, ?)").bind("โมเดลระบบย่อยอาหาร").first()).id;
  const subs = (nums) => sql(`SELECT st.number, s.status FROM submissions s JOIN students st ON st.id=s.student_id WHERE s.assignment_id=? AND st.class_id='cls_61' AND st.number IN (${nums.join(",")}) ORDER BY st.number`, asgId);
  const startScan = async (d) => { await go(d, "#/scan"); await sleep(800); if (await d.page.locator('input[aria-label="รหัสนักเรียน"]').count()) return; await d.page.locator(".sc-asg", { hasText: "โมเดลระบบย่อยอาหาร" }).click(); await d.page.getByRole("button", { name: /เริ่มสแกน/ }).click(); await sleep(500); };
  const scan = async (d, n) => { const i = d.page.locator('input[aria-label="รหัสนักเรียน"]'); await i.fill(String(n)); await i.press("Enter"); await sleep(400); };
  const radio = (d, re) => d.page.getByRole("radio", { name: re }).first().click();
  try {
    // (a) A offline: attendance + scan, then online
    await openAtt(A); await openAtt(B);
    await A.ctx.setOffline(true); await sleep(500);
    await tile(A, 3).click();
    await radio(A, /ขาด/);
    await tile(A, 4).click();
    await sleep(2500);
    check("(ก) offline: nothing reached the server", (await attRows(kids[2].id)).length === 0 && (await attRows(kids[3].id)).length === 0);
    check("(ก) offline: tiles show the marks locally", /present/.test(await cls(A, 3)) && /absent/.test(await cls(A, 4)), (await cls(A, 3)) + " | " + (await cls(A, 4)));
    await startScan(A); await scan(A, 11); await scan(A, 12);
    check("(ก) offline scan queued (รอส่ง 2)", await until(async () => /รอส่ง 2/.test(await badge(A)), 10000), await badge(A));
    check("(ก) offline: no submission on server yet", (await subs([11, 12])).length === 0);
    await A.ctx.setOffline(false);
    check("(ก) online: attendance lands once each", await until(async () => (await attRows(kids[2].id)).length === 1 && (await attRows(kids[3].id)).length === 1, 40000));
    const a3 = await attRows(kids[2].id), a4 = await attRows(kids[3].id);
    check("(ก) statuses right (present/absent)", a3[0]?.status === "present" && a4[0]?.status === "absent", JSON.stringify([a3, a4]));
    check("(ก) scans land exactly 2, no duplicates", await until(async () => (await subs([11, 12])).length === 2, 40000), JSON.stringify(await subs([11, 12])));
    check("(ก) queue empties", await until(async () => !/รอส่ง/.test(await badge(A)), 20000), await badge(A));
    await sleep(3000);
    check("(ก) still exactly 2 submissions after settle", (await subs([11, 12])).length === 2);
    await B.page.reload(); await B.page.waitForSelector(".att-tiles:not(.loading) .att-tile"); await sleep(500);
    check("(ก) B after refresh sees A's marks", /present/.test(await cls(B, 3)) && /absent/.test(await cls(B, 4)), (await cls(B, 3)) + " | " + (await cls(B, 4)));
    // (b) different rows at once
    await openAtt(A); await openAtt(B);
    await radio(A, /มา/).catch(() => {});
    await radio(B, /ขาด/);
    await Promise.all([tile(A, 5).click(), tile(B, 6).click()]);
    check("(ข) both edits land, neither overwrites", await until(async () => (await attRows(kids[4].id)).length === 1 && (await attRows(kids[5].id)).length === 1, 30000), JSON.stringify([await attRows(kids[4].id), await attRows(kids[5].id)]));
    const a5 = await attRows(kids[4].id), a6 = await attRows(kids[5].id);
    check("(ข) values: #5 present(A) / #6 absent(B)", a5[0]?.status === "present" && a6[0]?.status === "absent", JSON.stringify([a5, a6]));
    // (c) same row, B stale
    await openAtt(A); await openAtt(B);
    await radio(A, /มา/).catch(() => {});
    await tile(A, 7).click(); await sleep(3000);
    const a7a = await attRows(kids[6].id);
    check("(ค) A's edit saved first", a7a.length === 1 && a7a[0].status === "present", JSON.stringify(a7a));
    await radio(B, /ขาด/); await tile(B, 7).click(); await sleep(4000);
    const a7 = await attRows(kids[6].id);
    const bTxt = (await B.page.locator("body").innerText()).replace(/\s+/g, " ");
    console.log("INFO (ค) server row:", JSON.stringify(a7), "| B tile:", await cls(B, 7), "| B notice:", (bTxt.match(/.{0,50}(ชน|อีกเครื่อง|ขัดแย้ง|เปลี่ยนโดย).{0,80}/) || [""])[0], "| badge:", await badge(B));
    check("(ค) exactly one row for the child (no duplicate)", a7.length === 1);
    await B.page.screenshot({ path: process.env.OUT + "/c-B.png" });
    await B.page.getByRole("button", { name: "ใช้ของเครื่องนี้" }).click(); await sleep(4000);
    const a7r = await attRows(kids[6].id);
    check("(ค) resolve 'use this device': server = absent, still 1 row, queue clears", a7r.length === 1 && a7r[0].status === "absent" && !/รอส่ง/.test(await badge(B)), JSON.stringify(a7r) + " " + await badge(B));
    await A.page.reload(); await A.page.waitForSelector(".att-tiles:not(.loading) .att-tile"); await sleep(400);
    check("(ค) A after refresh sees B's resolved value (absent)", /absent/.test(await cls(A, 7)), await cls(A, 7));
    // (d) retry idempotency: response lost after the server processed
    let dropped = 0;
    await A.ctx.route("**/api/attendance/batch", async (r) => { if (dropped < 1) { dropped++; await r.fetch(); await r.abort("failed"); } else await r.continue(); });
    await openAtt(A);
    await radio(A, /มา/).catch(() => {});
    await tile(A, 8).click();
    check("(ง) attendance: first response dropped", await until(async () => dropped === 1, 10000));
    await sleep(15000);
    const a8 = await attRows(kids[7].id);
    check("(ง) attendance retry: exactly 1 row, present", a8.length === 1 && a8[0].status === "present", JSON.stringify(a8));
    check("(ง) attendance retry: badge settles", await until(async () => !/รอส่ง|ไม่สำเร็จ/.test(await badge(A)), 20000), await badge(A));
    await A.ctx.unroute("**/api/attendance/batch");
    let dropped2 = 0;
    await A.ctx.route("**/api/submissions/batch", async (r) => { if (dropped2 < 1) { dropped2++; await r.fetch(); await r.abort("failed"); } else await r.continue(); });
    await startScan(A); await scan(A, 13);
    check("(ง) scan: first response dropped", await until(async () => dropped2 === 1, 10000));
    await sleep(15000);
    const s13 = await subs([13]);
    check("(ง) scan retry: exactly 1 submission", s13.length === 1, JSON.stringify(s13));
    check("(ง) scan retry: queue empties", await until(async () => !/รอส่ง|ไม่สำเร็จ/.test(await badge(A)), 20000), await badge(A));
    await A.ctx.unroute("**/api/submissions/batch");
    // same child scanned on both devices
    await startScan(A); await startScan(B);
    await Promise.all([scan(A, 14), scan(B, 14)]); await sleep(5000);
    const s14 = await subs([14]);
    check("(ค) scan same child from both devices: 1 row", s14.length === 1, JSON.stringify(s14));
    check("page errors A/B = 0", A.errs.length === 0 && B.errs.length === 0, JSON.stringify([A.errs.slice(0, 2), B.errs.slice(0, 2)]));
  } catch (e) { check("script error", false, String(e.stack || e).slice(0, 500)); }
  await browser.close(); await (server.close && server.close());
  console.log(`\n${res.filter((r) => r.ok).length}/${res.length} PASS`); process.exit(0);
})();

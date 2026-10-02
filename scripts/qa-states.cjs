// QA states: every SCREEN a teacher can reach, not just every page — menus, dialogs, drawers, modes, empty / loading /
// failed versions — each in a real browser on a disposable server (scripts/fixture-server.cjs: real worker code,
// in-memory D1, fictional data). Per scene it takes screenshots (desktop + phone, light + dark) and runs the same
// page audit as qa-sweep (sideways scroll, tap targets, unnamed controls, console errors). It also builds the
// "consistency matrix": what each page has in common with the others, and where one differs.
//
//   npm run build && node scripts/qa-states.cjs [--label=states] [--only=gradebook,students]
//   shots: $QA_SHOTS or the OS temp dir · results: docs/qa-2026-10-02/results/<label>.json
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { startFixtureServer } = require("./fixture-server.cjs");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }

const arg = (name, dflt) => { const m = process.argv.find((a) => a.startsWith(`--${name}=`)); return m ? m.split("=")[1] : dflt; };
const LABEL = arg("label", "states");
const ONLY = arg("only", "");
const SHOTS = process.env.QA_SHOTS || path.join(os.tmpdir(), "qa-shots-" + LABEL);
const OUT = path.join(__dirname, "..", "docs", "qa-2026-10-02", "results");
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

const SIZES = [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }];
const THEMES = ["light", "dark"];
const findings = [];
const scenesRun = [];
const note = (sev, where, what, extra = {}) => { findings.push({ sev, where, what, ...extra }); console.log(`  [${sev}] ${where}: ${what}`); };

const audit = () => {
  const vw = window.innerWidth;
  const out = { overflowX: document.documentElement.scrollWidth - vw, small: [], unnamed: [], wide: [] };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const label = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
  for (const el of document.querySelectorAll("button, a[href], [role=button], select, input:not([type=hidden])")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (el.tagName === "INPUT" && /checkbox|radio/.test(el.type)) continue;
    if ((r.height < 32 || r.width < 32) && !(el.tagName === "SELECT" || el.tagName === "INPUT") && out.small.length < 12) out.small.push(`${label(el) || el.className}  ${Math.round(r.width)}×${Math.round(r.height)}`);
    const named = el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").trim() || el.getAttribute("placeholder") || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
    if (!named && out.unnamed.length < 12) out.unnamed.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`);
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 && out.wide.length < 6 && !el.closest(".gb-scroll, .gb-mchips, .set-nav-chips, .chips-row, [style*='overflow']")) out.wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} → ${Math.round(r.right)}px`);
  }
  return out;
};

/** what a page has, for the consistency matrix */
const traits = () => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => document.querySelectorAll(s).length;
  const uh = q(".uh");
  return {
    header: !!uh, icon: !!q(".uh-ic"), sub: !!q(".uh-sub"),
    headerButtons: [...document.querySelectorAll(".uh-act button, .uh-act label, .uh-act select")].map((e) => (e.textContent || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 18)).filter(Boolean),
    termPicker: !!q(".uh-act select") || !!q(".uh-act .pill select"),
    classChips: !!q('[aria-label="เลือกห้อง"]'),
    filterBar: qa(".gb-toolbar, .seg") > 0,
    statCards: qa(".uc-stat"),
    summaryLine: qa(".gb-summary, .stu-summary, .page-sub") > 0,
    cards: qa(".card"),
    primaryButtons: qa("button.primary"),
    rowStyles: ["stu-lrow", "gb-mrow", "rp-table", "att-tile", "sc-cell", "hm-asg", "set-cols"].filter((c) => q("." + c) || q("table." + c)),
    emptyOrLoading: qa(".uc-empty, .spin"),
  };
};

(async () => {
  const browser = await playwright.chromium.launch();
  const matrix = {};

  // ================================================================ scenes on the demo school
  const server = await startFixtureServer({ port: 5330 });
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await loginCtx.newPage();
  await lp.goto(server.url);
  await lp.waitForSelector("input[type=email]");
  await lp.fill("input[type=email]", server.email);
  await lp.fill("input[type=password]", server.password);
  await lp.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await lp.waitForSelector(".rail, .bottom-tabs", { state: "attached", timeout: 20000 });
  const storage = await loginCtx.storageState();
  await loginCtx.close();

  const nav = async (page, hash, ready) => {
    await page.evaluate((h) => { location.hash = h; }, hash);
    if (ready) await page.waitForSelector(ready, { timeout: 10000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(250);
  };
  const click = (page, name, opts = {}) => page.getByRole("button", { name, ...opts }).first().click({ timeout: 4000 });
  const phone = (page) => page.viewportSize().width < 700;

  // {id, hash, ready, act(page), modal: true → viewport shot, only: "desktop"|"phone"}
  const SCENES = [
    { id: "home", hash: "/home", ready: ".hm-action" },
    { id: "home-menu-sheet", hash: "/home", ready: ".hm-action", only: "phone", act: async (p) => { await p.locator(".bottom-tabs .tab-item", { hasText: "เมนู" }).click(); await p.locator(".menu-sheet").waitFor(); }, modal: true },
    { id: "scan-choose", hash: "/scan", ready: ".sc-asg" },
    { id: "scan-mode-later", hash: "/scan", ready: ".sc-asg", act: async (p) => { await p.getByText("รับงานก่อน").first().click(); } },
    { id: "scan-live", hash: "/scan", ready: ".sc-asg", act: async (p) => { await p.getByRole("button", { name: /เริ่มสแกน/ }).click(); await p.waitForTimeout(700); } },
    { id: "gradebook", hash: "/gradebook", ready: "table.gb, .gb-mrow" },
    { id: "gradebook-menu", hash: "/gradebook", ready: "table.gb, .gb-mrow", act: async (p) => { await (phone(p) ? p.getByRole("button", { name: /จัดการงาน/ }) : p.getByRole("button", { name: "จัดการงาน" })).click(); await p.waitForTimeout(200); } },
    { id: "gradebook-create", hash: "/gradebook", ready: "table.gb, .gb-mrow", act: async (p) => { await click(p, /สร้างงาน/); await p.locator(".modal").waitFor(); }, modal: true },
    { id: "gradebook-edit", hash: "/gradebook", ready: "table.gb, .gb-mrow", act: async (p) => { await (phone(p) ? p.getByRole("button", { name: /จัดการงาน/ }) : p.getByRole("button", { name: "จัดการงาน" })).click(); await p.getByRole("button", { name: /แก้ไข/ }).first().click(); await p.locator(".modal").waitFor(); }, modal: true },
    { id: "gradebook-cell-edit", hash: "/gradebook", ready: "table.gb, .gb-mrow", act: async (p) => { if (phone(p)) await p.locator(".gb-mrow button").first().click(); else await p.locator("table.gb td.cell").nth(7).click(); await p.locator("input.cell-input").waitFor(); } },
    { id: "gradebook-missing", hash: "/gradebook", ready: "table.gb, .gb-mrow", act: async (p) => { await click(p, /ค้างส่ง/); await p.waitForTimeout(250); } },
    { id: "gradebook-month", hash: "/gradebook", ready: "table.gb, .gb-mrow", act: async (p) => { await click(p, "รายเดือน"); await p.waitForTimeout(600); } },
    { id: "attendance", hash: "/attendance", ready: ".att-tile" },
    { id: "attendance-tapped", hash: "/attendance", ready: ".att-tile", act: async (p) => { for (const i of [0, 1, 2]) await p.locator(".att-tile").nth(i).click(); await p.locator(".att-tile").nth(2).click(); await p.waitForTimeout(300); } },
    { id: "attendance-all-present", hash: "/attendance", ready: ".att-tile", act: async (p) => { await click(p, /มาทั้งหมด/); await p.waitForTimeout(500); } },
    { id: "attendance-qr", hash: "/attendance", ready: ".att-tile", act: async (p) => { await click(p, /สแกน QR/); await p.waitForTimeout(300); } },
    { id: "attendance-period", hash: "/attendance", ready: ".att-tile", act: async (p) => { await click(p, "รายคาบ"); await p.waitForTimeout(400); } },
    { id: "random", hash: "/random", ready: ".uh" },
    { id: "random-whole-class", hash: "/random", ready: ".uh", act: async (p) => { await p.getByLabel(/เฉพาะคนที่มา/).uncheck(); await p.waitForTimeout(300); } },
    { id: "random-result", hash: "/random", ready: ".uh", act: async (p) => { await p.getByLabel(/เฉพาะคนที่มา/).uncheck(); await click(p, /สุ่มเลย/); await p.waitForTimeout(2500); } },
    { id: "random-groups", hash: "/random", ready: ".uh", act: async (p) => { await p.getByLabel(/เฉพาะคนที่มา/).uncheck(); await click(p, /จับกลุ่ม/); await p.waitForTimeout(400); } },
    { id: "reports", hash: "/reports", ready: ".rp-range" },
    { id: "reports-month", hash: "/reports", ready: ".rp-range", act: async (p) => { await click(p, "รายเดือน"); await p.waitForTimeout(900); } },
    { id: "reports-line-copy", hash: "/reports", ready: ".rp-range", act: async (p) => { await click(p, /คัดลอกไป LINE/); await p.waitForTimeout(400); } },
    { id: "students", hash: "/students", ready: ".stu-lrow" },
    { id: "students-search", hash: "/students", ready: ".stu-lrow", act: async (p) => { await p.locator("input[placeholder^='ค้นหา']").fill("ภูมิ"); await p.waitForTimeout(300); } },
    { id: "students-drawer", hash: "/students", ready: ".stu-lrow", act: async (p) => { await p.locator(".stu-lrow").first().click(); await p.locator(".drawer").waitFor(); await p.waitForTimeout(500); }, modal: true },
    { id: "students-import", hash: "/students", ready: ".stu-lrow", act: async (p) => { await click(p, /นำเข้า Excel/); await p.locator(".modal").waitFor(); }, modal: true },
    { id: "students-add", hash: "/students", ready: ".stu-lrow", act: async (p) => { await click(p, /เพิ่มนักเรียน/); await p.locator(".modal").waitFor(); }, modal: true },
    { id: "students-menu", hash: "/students", ready: ".stu-lrow", act: async (p) => { await p.getByRole("button", { name: "เพิ่มเติม" }).click(); await p.waitForTimeout(200); } },
    { id: "settings-general", hash: "/settings?section=general", ready: ".set-cols" },
    { id: "settings-time", hash: "/settings?section=time", ready: ".set-cols" },
    { id: "settings-scan", hash: "/settings?section=scan", ready: ".set-cols" },
    { id: "settings-catalog-rooms", hash: "/settings?section=catalog", ready: ".set-cols" },
    { id: "settings-catalog-subjects", hash: "/settings?section=catalog", ready: ".set-cols", act: async (p) => { await p.getByRole("button", { name: "วิชา", exact: true }).click(); await p.waitForTimeout(250); } },
    { id: "settings-catalog-types", hash: "/settings?section=catalog", ready: ".set-cols", act: async (p) => { await p.getByRole("button", { name: "ประเภทงาน" }).click(); await p.waitForTimeout(250); } },
    { id: "settings-catalog-terms", hash: "/settings?section=catalog", ready: ".set-cols", act: async (p) => { await p.getByRole("button", { name: "ภาคเรียน", exact: true }).click(); await p.waitForTimeout(250); } },
    { id: "settings-devices", hash: "/settings?section=devices", ready: ".set-cols" },
    { id: "settings-password", hash: "/settings?section=devices", ready: ".set-cols", act: async (p) => { await click(p, /เปลี่ยนรหัสผ่าน/); await p.waitForTimeout(250); } },
    { id: "settings-device-check", hash: "/settings?section=devices", ready: ".set-cols", act: async (p) => { await click(p, /ตรวจเครื่องนี้/); await p.waitForTimeout(2500); } },
    { id: "settings-backup", hash: "/settings?section=backup", ready: ".set-cols" },
    { id: "settings-restore", hash: "/settings?section=backup", ready: ".set-cols", act: async (p) => { await click(p, /กู้คืน/); await p.locator(".modal").waitFor(); }, modal: true },
    { id: "settings-reset-data", hash: "/settings?section=backup", ready: ".set-cols", act: async (p) => { await p.getByRole("button", { name: /ล้างข้อมูล$/ }).first().click(); await p.locator(".modal").waitFor(); }, modal: true },
    { id: "settings-reset-all", hash: "/settings?section=backup", ready: ".set-cols", act: async (p) => { await p.getByRole("button", { name: /ล้างทั้งหมด/ }).first().click(); await p.locator(".modal").waitFor(); }, modal: true },
    { id: "settings-history", hash: "/settings?section=history", ready: ".set-cols" },
  ];
  const scenes = SCENES.filter((s) => !ONLY || ONLY.split(",").some((o) => s.id.startsWith(o)));

  console.log(`\n== ${scenes.length} scenes × ${SIZES.length} sizes × ${THEMES.length} themes (demo school)`);
  for (const theme of THEMES) for (const size of SIZES) {
    const ctx = await browser.newContext({ storageState: storage, viewport: { width: size.width, height: size.height }, colorScheme: theme, locale: "th-TH", hasTouch: size.name === "phone", acceptDownloads: true });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.url }).catch(() => {});
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(`error: ${m.text().slice(0, 160)}`); });
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    await page.goto(server.url + "/#/home");
    await page.waitForSelector(".rail, .bottom-tabs", { state: "attached", timeout: 20000 });
    for (const sc of scenes) {
      if (sc.only && sc.only !== size.name) continue;
      const where = `${sc.id} @${size.name}/${theme}`;
      errs.length = 0;
      server.resetDbStats();
      try {
        await nav(page, sc.hash, sc.ready);
        if (sc.act) await sc.act(page);
      } catch (e) {
        note("P2", where, "could not reach this screen: " + String(e.message).split("\n")[0].slice(0, 140));
        await page.keyboard.press("Escape").catch(() => {});
        continue;
      }
      await page.waitForTimeout(150);
      const a = await page.evaluate(audit);
      if (a.overflowX > 2) note("P2", where, `page scrolls sideways (${a.overflowX}px)`, { wide: a.wide });
      if (a.unnamed.length) note("P3", where, `${a.unnamed.length} control(s) without a name`, { examples: a.unnamed.slice(0, 5) });
      if (size.name === "phone" && a.small.length > 3) note("P3", where, `${a.small.length}+ tap targets under 32px`, { examples: a.small.slice(0, 6) });
      for (const c of server.apiLog.filter((c) => c.status >= 400 && c.status !== 401 && c.status !== 409)) note("P1", where, `API ${c.method} ${c.path} answered ${c.status}`);
      for (const e of errs.filter((e) => !/Failed to load resource/.test(e))) note("P1", where, e);
      if (theme === "light" && size.name === "desktop" && !sc.act && !sc.hash.includes("section=")) { matrix[sc.id] = await page.evaluate(traits); }
      await page.screenshot({ path: path.join(SHOTS, `${sc.id}__${size.name}__${theme}.jpg`), fullPage: !sc.modal, type: "jpeg", quality: 60 }).catch(() => {});
      scenesRun.push(where);
      // leave menus, modals and drawers behind us: a fresh page for the next scene (an open menu would block its clicks)
      if (sc.act) { await page.goto(server.url + "/#/home"); await page.reload(); await page.waitForSelector(".rail, .bottom-tabs", { state: "attached", timeout: 20000 }); }
    }
    await ctx.close();
  }

  // ================================================================ the server cannot be reached: each page's "could not load" screen
  console.log("\n== failed to load (server unreachable)");
  for (const size of SIZES) {
    const ctx = await browser.newContext({ storageState: storage, viewport: { width: size.width, height: size.height }, locale: "th-TH", hasTouch: size.name === "phone" });
    const page = await ctx.newPage();
    await page.goto(server.url + "/#/home");
    await page.waitForSelector(".rail, .bottom-tabs", { state: "attached", timeout: 20000 });
    await page.waitForTimeout(800);
    server.setDown(true);
    for (const [id, hash] of [["gradebook", "/gradebook"], ["reports", "/reports"], ["students", "/students"], ["attendance", "/attendance"]]) {
      if (ONLY && !ONLY.split(",").some((o) => "down".startsWith(o) || id.startsWith(o))) continue;
      const where = `${id}-down @${size.name}/light`;
      await page.evaluate((h) => { location.hash = h; }, "/settings?section=general").catch(() => {});
      await page.waitForTimeout(200);
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForTimeout(3500);
      const a = await page.evaluate(audit);
      if (a.overflowX > 2) note("P2", where, `page scrolls sideways (${a.overflowX}px)`);
      const t = await page.evaluate(() => ({ err: !!document.querySelector(".uc-empty, .stu-lrow, .att-tile"), spin: document.querySelectorAll(".spin").length, text: document.body.innerText.slice(0, 120).replace(/\s+/g, " ") }));
      if (!t.err) note("P2", where, "server unreachable but the page shows neither the saved data nor a 'could not load' message: " + t.text);
      await page.screenshot({ path: path.join(SHOTS, `${id}-down__${size.name}__light.jpg`), fullPage: true, type: "jpeg", quality: 60 }).catch(() => {});
      scenesRun.push(where);
    }
    server.setDown(false);
    await ctx.close();
  }
  await server.close();

  // ================================================================ an empty school: onboarding and every empty state
  console.log("\n== empty school");
  for (const size of SIZES) {
    const empty = await startFixtureServer({ port: 5331, seed: false });
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: "th-TH", hasTouch: size.name === "phone" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    await page.goto(empty.url);
    await page.waitForSelector("input[type=email]");
    await page.screenshot({ path: path.join(SHOTS, `login__${size.name}__light.jpg`), type: "jpeg", quality: 60 });
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click(); // nothing typed
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, `login-empty-submit__${size.name}__light.jpg`), type: "jpeg", quality: 60 });
    await page.fill("input[type=email]", empty.email);
    await page.fill("input[type=password]", empty.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await page.getByText("ยินดีต้อนรับสู่งานครบ").waitFor({ timeout: 15000 }).catch(() => note("P1", `onboarding @${size.name}`, "the welcome guide did not open for an empty school"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, `onboarding-1__${size.name}__light.jpg`), type: "jpeg", quality: 60 });
    const a0 = await page.evaluate(audit);
    if (a0.overflowX > 2) note("P2", `onboarding @${size.name}`, `page scrolls sideways (${a0.overflowX}px)`);
    scenesRun.push(`onboarding @${size.name}`);
    // leave the guide (skip) and look at every page with nothing in it
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /ข้าม/ }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
    for (const [id, hash, ready] of [["home", "/home", ".uh"], ["scan", "/scan", ".uh"], ["gradebook", "/gradebook", ".uh"], ["attendance", "/attendance", ".uh"], ["random", "/random", ".uh"], ["reports", "/reports", ".uh"], ["students", "/students", ".uh"]]) {
      const where = `${id}-empty @${size.name}/light`;
      try { await nav(page, hash, ready); } catch (e) { note("P2", where, "could not open: " + String(e.message).split("\n")[0]); continue; }
      const a = await page.evaluate(audit);
      if (a.overflowX > 2) note("P2", where, `page scrolls sideways (${a.overflowX}px)`);
      const t = await page.evaluate(() => ({ spin: document.querySelectorAll(".spin").length, empty: document.querySelectorAll(".uc-empty").length, text: document.body.innerText.slice(0, 160).replace(/\s+/g, " ") }));
      if (t.spin) note("P2", where, "still shows a loading spinner on an empty school");
      await page.screenshot({ path: path.join(SHOTS, `${id}-empty__${size.name}__light.jpg`), fullPage: true, type: "jpeg", quality: 60 });
      scenesRun.push(where);
    }
    for (const e of errs) note("P1", `empty school @${size.name}`, e);
    await ctx.close();
    await empty.close();
  }

  // ================================================================ first use: no account yet
  console.log("\n== first use (no account)");
  const fresh = await startFixtureServer({ port: 5332, seed: false, account: false });
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: "th-TH", hasTouch: size.name === "phone" });
    const page = await ctx.newPage();
    await page.goto(fresh.url);
    await page.waitForSelector("input[type=email]");
    await page.waitForTimeout(300);
    const a = await page.evaluate(audit);
    if (a.overflowX > 2) note("P2", `setup @${size.name}`, `page scrolls sideways (${a.overflowX}px)`);
    await page.screenshot({ path: path.join(SHOTS, `setup__${size.name}__light.jpg`), type: "jpeg", quality: 60 });
    scenesRun.push(`setup @${size.name}`);
    await ctx.close();
  }
  await fresh.close();
  await browser.close();

  const bySev = (s) => findings.filter((f) => f.sev === s).length;
  fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify({ label: LABEL, at: new Date().toISOString(), scenes: scenesRun.length, counts: { P1: bySev("P1"), P2: bySev("P2"), P3: bySev("P3") }, matrix, findings }, null, 2));
  console.log(`\n${scenesRun.length} screens captured · findings: P1 ${bySev("P1")} · P2 ${bySev("P2")} · P3 ${bySev("P3")}\nshots: ${SHOTS}\nresults: ${path.join(OUT, LABEL + ".json")}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

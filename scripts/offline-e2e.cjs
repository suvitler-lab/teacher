// Real-browser check of the offline promise (Chromium via Playwright, a fixture server with fictional data):
//   first visit → cut the network → reload → scan into the queue → back online → it lands;
//   the session ending while offline; closing the app with work waiting; a new release; a network that is
//   "connected" but dead.
//
//   npm run build && node scripts/offline-e2e.cjs
// Needs Playwright with a Chromium (global install is fine). Exits non-zero if any check fails.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { startFixtureServer } = require("./fixture-server.cjs");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist/client/client");
const PORT = 5195;

let playwright;
try {
  playwright = require("playwright");
} catch {
  try { playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
  catch { console.error("Playwright is not installed (npm i -g playwright, then npx playwright install chromium)"); process.exit(2); }
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 30000, step = 250) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return false;
    await sleep(step);
  }
}

(async () => {
  if (!fs.existsSync(path.join(dist, "sw.js")) || /__BUILD_ID__/.test(fs.readFileSync(path.join(dist, "sw.js"), "utf8"))) {
    console.error("dist/client/client/sw.js is missing or is not the built one — run `npm run build` first");
    process.exit(2);
  }
  // "release B": the same app with another version id and a marker in the page, to see an update arrive
  const B = fs.mkdtempSync(path.join(root, "node_modules", ".e2e-release-"));
  fs.cpSync(dist, B, { recursive: true });
  const swA = fs.readFileSync(path.join(dist, "sw.js"), "utf8");
  const versionA = /const VERSION = "([^"]+)"/.exec(swA)[1];
  fs.writeFileSync(path.join(B, "sw.js"), swA.replace(`"${versionA}"`, `"${versionA}-B"`));
  fs.writeFileSync(path.join(B, "index.html"), fs.readFileSync(path.join(B, "index.html"), "utf8") + "\n<!-- release-B -->");

  const server = await startFixtureServer({ port: PORT, assetsDir: dist });
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const pageErrors = [];
  const watch = (p) => p.on("pageerror", (e) => pageErrors.push(String(e.message || e).slice(0, 200)));
  let page = await context.newPage();
  watch(page);

  // (instr, not LIKE: D1 refuses a LIKE pattern over 50 bytes and Thai is 3 bytes a letter)
  const asgId = (await server.DB.prepare("SELECT id FROM assignments WHERE instr(title, ?)").bind("โมเดลระบบย่อยอาหาร").first()).id;
  const landed = async (numbers) => {
    const r = await server.DB.prepare(
      `SELECT COUNT(*) AS n FROM submissions s JOIN students st ON st.id = s.student_id
       WHERE s.assignment_id = ? AND st.class_id = (SELECT id FROM classes WHERE name = 'ป.6/1' LIMIT 1)
         AND st.number IN (${numbers.join(",")})`,
    ).bind(asgId).first();
    return r.n;
  };
  const badge = async (p) => (await p.locator(".rail-sync .sync").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  const go = (p, hash) => p.evaluate((h) => { location.hash = h; }, hash);
  const shellUp = (p) => p.waitForFunction(() => /หน้าหลัก/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true, () => false);
  const cacheNames = (p) => p.evaluate(() => caches.keys());
  // "offline" = the network is really dead (the server cuts every connection — page and service worker alike) and the
  // browser is told, so navigator.onLine and the online/offline events behave. Playwright's own emulation alone does not
  // reliably cover requests the service worker makes.
  const offline = async (on) => { server.setDown(on); await context.setOffline(on); };
  // what reached the server while the network was down: static files must be zero — the app's own copy served them
  let mark = 0;
  const goDark = async () => { mark = server.hits.length; await offline(true); };
  const staticLeaks = () => [...new Set(server.hits.slice(mark))].filter((p) => !p.startsWith("/api/") && p !== "/sw.js");

  try {
    // 1 ─ first visit: the app prepares itself for offline use
    await page.goto(server.url);
    await page.fill("input[type=email]", server.email);
    await page.fill("input[type=password]", server.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    check("signs in", await shellUp(page));
    const prepared = await page.waitForFunction(async () => {
      const key = (await caches.keys()).find((n) => n.startsWith("ngankrob-"));
      if (!key || !navigator.serviceWorker.controller) return false;
      return !!(await (await caches.open(key)).match("/__shell"));
    }, null, { timeout: 60000 }).then(() => true, () => false);
    check("first visit: the shell and assets are kept on the device", prepared);
    await go(page, "#/settings");
    check("Settings says the device is ready for offline use", await until(async () => /เปิดแอปและสแกนได้แม้ไม่มีอินเทอร์เน็ต/.test(await page.locator("body").innerText()), 15000));

    // Settings ▸ Devices ▸ "check this device" — on a device that is fine
    const runDeviceCheck = async () => {
      await go(page, "#/settings");
      await page.locator("button.pill", { hasText: "อุปกรณ์และรหัสผ่าน" }).click(); // the tab, as a teacher would
      await page.getByRole("button", { name: /ตรวจเครื่องนี้|ตรวจอีกครั้ง/ }).first().click();
      await until(async () => /พร้อมใช้งาน|ใช้ได้ แต่มีข้อควรดู|ยังไม่พร้อม/.test(await page.locator("body").innerText()), 20000);
      return (await page.locator("body").innerText()).replace(/\s+/g, " ");
    };
    let checked = await runDeviceCheck();
    check("device check (online): not 'not ready', the server and the offline files are reported fine", !/ยังไม่พร้อม — แก้/.test(checked) && /เซิร์ฟเวอร์พร้อม/.test(checked) && /เปิดแอปและสแกนได้แม้ไม่มีอินเทอร์เน็ต/.test(checked), checked.slice(checked.indexOf("ตรวจเครื่องนี้"), checked.indexOf("ตรวจเครื่องนี้") + 500));
    check("device check: the clock of this device matches the server's (measured from the HTTP Date header)", /ตรงกับเซิร์ฟเวอร์/.test(checked));

    // 2 ─ cut the network, reload: the app must open, with its data
    await goDark();
    await page.reload({ waitUntil: "domcontentloaded" });
    check("offline reload opens the app", await shellUp(page));
    await go(page, "#/students"); // (the gradebook reads scores from the server; the student list is what the device keeps)
    const sawStudents = await until(async () => /ภูมิพัฒน์/.test(await page.locator("body").innerText()), 15000);
    check("offline reload shows the saved data (students)", sawStudents, sawStudents ? "" : (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160));
    // (a moment of "saving" right after a reload is fine; stuck there with the network dead would not be)
    check("the sync badge says offline", await until(async () => /ออฟไลน์/.test(await badge(page)), 10000), await badge(page));
    check("…and no static file was fetched from the network — everything came from the device", staticLeaks().length === 0, staticLeaks().join(", "));
    checked = await runDeviceCheck();
    check("device check (network dead): says it is offline but that scanning still works, and the offline files are still 'ready'", /ออฟไลน์อยู่/.test(checked) && /สแกนและเช็คชื่อต่อได้/.test(checked) && /เปิดแอปและสแกนได้แม้ไม่มีอินเทอร์เน็ต/.test(checked) && !/ยังไม่พร้อม — แก้/.test(checked), checked.slice(checked.indexOf("ตรวจเครื่องนี้"), checked.indexOf("ตรวจเครื่องนี้") + 400));

    // 3 ─ scan offline: it goes into the queue
    await go(page, "#/scan");
    await page.locator(".sc-asg", { hasText: "โมเดลระบบย่อยอาหาร" }).click();
    await page.getByRole("button", { name: /เริ่มสแกน/ }).click();
    const input = page.locator('input[aria-label="รหัสนักเรียน"]');
    for (const n of ["5", "6"]) { await input.fill(n); await input.press("Enter"); await sleep(400); }
    check("scanning offline queues the work on the device", await until(async () => /ค้าง 2/.test(await badge(page)), 10000), await badge(page));
    check("nothing has reached the server yet", (await landed([5, 6])) === 0);

    // 4 ─ back online: the queue is sent by itself
    await offline(false);
    check("back online: the queued scans land on the server", await until(async () => (await landed([5, 6])) === 2, 40000));
    check("the queue empties", await until(async () => !/ค้าง/.test(await badge(page)), 20000), await badge(page));

    // 5 ─ the session ends while offline: sign in again, nothing is lost
    await goDark();
    await input.fill("7"); await input.press("Enter"); await sleep(400);
    check("(session test) one scan waits offline", await until(async () => /ค้าง 1/.test(await badge(page)), 10000), await badge(page));
    await server.DB.prepare("DELETE FROM sessions").run();
    await offline(false);
    check("session ended: the sign-in prompt appears", await page.locator("input[type=password]").first().waitFor({ timeout: 40000 }).then(() => true, () => false));
    check("…and the waiting scan is still on the device", /ค้าง 1/.test(await badge(page)) || (await page.locator("body").innerText()).includes("ค้าง"), await badge(page));
    await page.locator("input[type=password]").first().fill(server.password);
    await page.locator("input[type=password]").first().press("Enter");
    check("after signing in again the waiting scan lands", await until(async () => (await landed([7])) === 1, 40000));

    // 6 ─ close the app with work waiting, open it again offline
    await goDark();
    await input.fill("8"); await input.press("Enter"); await sleep(400);
    await page.close();
    page = await context.newPage();
    watch(page);
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    check("closed and reopened offline: the app opens", await shellUp(page));
    check("…with the waiting scan still there", await until(async () => /ค้าง 1/.test(await badge(page)), 15000), await badge(page));
    check("…having fetched no static file from the network", staticLeaks().length === 0, staticLeaks().join(", "));
    await offline(false);
    check("…and it lands when the network is back", await until(async () => (await landed([8])) === 1, 40000));

    // 7 ─ a new release arrives while work is waiting: offered, never forced; work survives the update
    await context.route("**/api/submissions/batch", (r) => r.abort()); // keeps the queue from draining while we test
    await go(page, "#/scan");
    await page.locator(".sc-asg", { hasText: "โมเดลระบบย่อยอาหาร" }).click().catch(() => {});
    const start = page.getByRole("button", { name: /เริ่มสแกน/ });
    if (await start.count()) await start.click();
    const input2 = page.locator('input[aria-label="รหัสนักเรียน"]');
    await input2.fill("9"); await input2.press("Enter"); await sleep(600);
    const before = await cacheNames(page);
    server.setAssetsDir(B);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    check("a new release is offered (banner), not swapped in", await until(async () => /มีเวอร์ชันใหม่ของแอปพร้อมใช้/.test(await page.locator("body").innerText()), 60000));
    const both = await cacheNames(page);
    check("until accepted, the old version's files stay (open pages keep working)", both.length === 2 && before.length === 1, both.join(", "));
    await go(page, "#/settings");
    await page.getByRole("button", { name: /อัปเดตเลย/ }).first().click();
    await page.waitForEvent("load", { timeout: 30000 }).catch(() => {});
    // ask the worker that now controls the page which release it is (also exercises the VERSION message)
    const controllerVersion = () => page.evaluate(() => new Promise((resolve) => {
      const c = navigator.serviceWorker.controller;
      if (!c) return resolve(null);
      navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "VERSION") resolve(e.data.version); });
      c.postMessage({ type: "VERSION" });
      setTimeout(() => resolve(null), 3000);
    }));
    const nowVersion = await until(async () => { const v = await controllerVersion().catch(() => null); return v && v.endsWith("-B") ? v : false; }, 20000);
    check("after accepting: the page comes back on the new release", !!nowVersion, String(nowVersion));
    const after = await cacheNames(page);
    check("only the new version's files remain", after.length === 1 && after[0].endsWith("-B"), after.join(", "));
    check("the waiting scan survived the update", await until(async () => /ค้าง 1/.test(await badge(page)), 20000), await badge(page));
    await context.unroute("**/api/submissions/batch");
    check("…and lands afterwards", await until(async () => (await landed([9])) === 1, 40000));

    // 8 ─ a network that is "connected" but dead: the app must not sit on a spinner
    await context.route("**/api/auth/me", () => { /* never answers */ });
    const dead = await context.newPage();
    watch(dead);
    const t0 = Date.now();
    await dead.goto(server.url, { waitUntil: "domcontentloaded" });
    const opened = await shellUp(dead);
    const took = Math.round((Date.now() - t0) / 1000);
    check("dead network: the app still opens from saved data", opened, `${took}s`);
    check("…within seconds, not minutes", opened && took < 20, `${took}s`);
    const bootstraps = [];
    dead.on("request", (r) => { if (r.url().endsWith("/api/bootstrap")) bootstraps.push(1); });
    await context.unroute("**/api/auth/me");
    await dead.evaluate(() => window.dispatchEvent(new Event("online")));
    check("when the server answers again the app switches to live data by itself", await until(async () => bootstraps.length > 0, 20000));
  } catch (e) {
    check("no unexpected error in the script", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    fs.rmSync(B, { recursive: true, force: true });
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }
})();

// First-run guide in a real browser: an empty school gets the welcome guide after creating the account, each step
// saves, the guide never comes back, and a school that already has data never sees it.
//   npm run build && node scripts/onboarding-e2e.cjs
const path = require("node:path");
const { execSync } = require("node:child_process");
const { startFixtureServer } = require("./fixture-server.cjs");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const rows = async (server, sql) => (await server.DB.prepare(sql).all()).results;

(async () => {
  const server = await startFixtureServer({ seed: false, port: 5196 });
  const browser = await playwright.chromium.launch();
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(server.url);
    // the fixture already made an account; sign in, as the teacher would
    await page.waitForSelector("input[type=email]");
    await page.fill("input[type=email]", server.email);
    await page.fill("input[type=password]", server.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();

    check("an empty school opens the welcome guide", await page.getByText("ยินดีต้อนรับสู่งานครบ").waitFor({ timeout: 15000 }).then(() => true, () => false));

    // 1 school
    await page.fill("input[placeholder^='เช่น โรงเรียน']", "โรงเรียนทดสอบ");
    await page.fill("input[placeholder='เช่น ครูสมชาย']", "ครูใจดี");
    await page.getByRole("button", { name: "ถัดไป" }).click();
    // 2 term
    await page.getByText("ภาคเรียนปัจจุบัน").waitFor();
    await page.getByRole("button", { name: "ถัดไป" }).click();
    // 3 classes: generated + typed
    await page.getByText("ห้องเรียนที่สอน").waitFor();
    await page.getByRole("button", { name: /เพิ่ม ป\.6\/1/ }).click();
    await page.fill("input[placeholder^='หรือพิมพ์ชื่อห้อง']", "ป.5/2, ป.5/3");
    await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
    check("the chosen rooms show as chips", (await page.locator(".ob-chip").count()) === 3);
    await page.getByRole("button", { name: "บันทึกห้องเรียน" }).click();
    // 4 subjects
    await page.getByText("วิชาที่สอน").waitFor();
    await page.getByRole("button", { name: "คณิตศาสตร์" }).click();
    await page.getByRole("button", { name: "วิทยาศาสตร์" }).click();
    await page.getByRole("button", { name: "บันทึกวิชา" }).click();
    check("the last step says it is ready", await page.getByText("พร้อมใช้งานแล้ว").waitFor({ timeout: 10000 }).then(() => true, () => false));

    const settings = Object.fromEntries((await rows(server, "SELECT key, value FROM settings")).map((r) => [r.key, r.value]));
    check("school and teacher name saved", settings.school_name === "โรงเรียนทดสอบ" && settings.teacher_name === "ครูใจดี");
    const terms = await rows(server, "SELECT name, is_current FROM terms");
    check("one current term created", terms.length === 1 && terms[0].is_current === 1, JSON.stringify(terms));
    const classes = (await rows(server, "SELECT name FROM classes ORDER BY name")).map((r) => r.name);
    check("three classes created", classes.join() === ["ป.5/2", "ป.5/3", "ป.6/1"].join(), classes.join(", "));
    const subs = (await rows(server, "SELECT name FROM subjects ORDER BY name")).map((r) => r.name);
    check("two subjects created", subs.length === 2, subs.join(", "));

    await page.screenshot({ path: process.env.OB_SHOT ? path.join(process.env.OB_SHOT, "ob-done.png") : "/dev/null" }).catch(() => {});
    await page.getByRole("button", { name: "ไปหน้าหลัก" }).click();
    check("finishing lands on the home page with the school's name", await page.getByText("โรงเรียนทดสอบ").first().waitFor({ timeout: 10000 }).then(() => true, () => false));
    check("the guide is marked done on the server", (await rows(server, "SELECT value FROM settings WHERE key='onboarding_done'"))[0]?.value === "1");

    await page.reload();
    await page.waitForSelector(".rail, .bottom-tabs", { timeout: 15000 });
    check("after a reload the guide does not come back", (await page.getByText("ยินดีต้อนรับสู่งานครบ").count()) === 0);
    check("nothing was created twice", (await rows(server, "SELECT COUNT(*) AS n FROM classes"))[0].n === 3 && (await rows(server, "SELECT COUNT(*) AS n FROM terms"))[0].n === 1);
  } catch (e) {
    check("the script ran to the end", false, e.message.split("\n")[0]);
  } finally {
    check("no uncaught page errors", errors.length === 0, errors.join(" | "));
    await browser.close(); await server.close();
  }

  // a school that already has its data (the demo seed) must never see the guide
  const seeded = await startFixtureServer({ port: 5197 });
  const b2 = await playwright.chromium.launch();
  try {
    const page = await (await b2.newContext()).newPage();
    await page.goto(seeded.url);
    await page.waitForSelector("input[type=email]");
    await page.fill("input[type=email]", seeded.email);
    await page.fill("input[type=password]", seeded.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await page.waitForSelector(".rail, .bottom-tabs", { timeout: 15000 });
    check("a school with data goes straight to the app", (await page.getByText("ยินดีต้อนรับสู่งานครบ").count()) === 0);
  } finally { await b2.close(); await seeded.close(); }

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} checks passed`);
  process.exit(ok === results.length ? 0 : 1);
})();

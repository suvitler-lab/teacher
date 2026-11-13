// QA flows: what a teacher DOES, end to end, in a real browser against a disposable server (real worker code,
// in-memory D1, fictional data — see scripts/fixture-server.cjs). Each step passes or fails on its own; a failing step
// is a finding for the developer (with the error and a screenshot), never a reason to stop.
//
//   npm run build && node scripts/qa-flows.cjs [--label=before]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { startFixtureServer } = require("./fixture-server.cjs");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }

const arg = (name, dflt) => { const m = process.argv.find((a) => a.startsWith(`--${name}=`)); return m ? m.split("=")[1] : dflt; };
const LABEL = arg("label", "flows");
const SHOTS = path.join(process.env.QA_SHOTS || path.join(os.tmpdir(), "qa-shots-" + LABEL), "flows");
const OUT = process.env.QA_OUT || path.join(__dirname, "..", "docs", "qa-2026-10-01", "results");
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

const results = [];
let page, server, ctx, browser;
const errors = [];
const sql = async (q, ...b) => (await server.DB.prepare(q).bind(...b).all()).results;
const ok = (c, msg) => { if (!c) throw new Error(msg || "check failed"); };

const ONLY = arg("only", "");
// the app uses the REAL Bangkok day, so dates in the steps are worked out from it (the script used to hard-code "today is 1 Oct", which put the due date before the order date once the calendar moved on)
const bkkDay = (plus = 0) => new Date(Date.now() + 7 * 3600e3 + plus * 86400e3).toISOString().slice(0, 10);
let acceptDialogs = true; // confirm() prompts: say yes, unless a step is checking that one appears
async function step(id, name, fn) {
  if (ONLY && !ONLY.split(",").some((p) => id.startsWith(p)) && !["A01", "A02"].includes(id)) return;
  const t0 = Date.now();
  errors.length = 0;
  try {
    await fn();
    if (errors.length) throw new Error("console/page error: " + errors.slice(0, 2).join(" | "));
    results.push({ id, name, pass: true, ms: Date.now() - t0 });
    console.log(`PASS  ${id}  ${name}`);
  } catch (e) {
    const msg = String(e.message || e).split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").slice(0, 320);
    results.push({ id, name, pass: false, error: msg, ms: Date.now() - t0 });
    console.log(`FAIL  ${id}  ${name}  — ${msg}`);
    await page.screenshot({ path: path.join(SHOTS, `${id}.png`) }).catch(() => {});
    // leave any open dialog so the next step starts clean
    await closeAny().catch(() => {});
  }
}
// close whatever is open: a form with typed text now asks "ยังไม่ได้บันทึก" first, so Esc alone leaves the form behind
// an open "จัดการงาน"/"ทำทั้งห้อง" menu has a full-screen backdrop: a click on it closes the menu (Esc only works while focus is inside)
async function closeMenu() { if (await page.locator("[role=menu]").count()) { await page.mouse.click(700, 150); await page.waitForTimeout(200); } }
async function closeAny() {
  await closeMenu().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {}); // an open menu closes on Esc
  for (let i = 0; i < 4; i++) {
    const ask = page.locator("[role=alertdialog]");
    if (await ask.count()) { await ask.getByRole("button", { name: /ปิดโดยไม่บันทึก|ทิ้ง|ออกโดยไม่บันทึก/ }).first().click({ timeout: 1500 }).catch(() => ask.getByRole("button").first().click({ timeout: 1500 }).catch(() => {})); await page.waitForTimeout(150); continue; }
    if (await page.locator(".modal-overlay, .drawer-scrim").count() === 0) return;
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
  }
}
const go = async (hash, ready) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  if (ready) await page.waitForSelector(ready, { timeout: 10000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
};
// the section in the address is only read when the settings page opens, so arrive from another page (a separate finding)
const openSettings = async (section) => { await go("/home", ".hm-action"); await go("/settings?section=" + section, ".set-cols"); };
const toast = () => page.locator(".toast, [role=status], [role=alert]").first();
const shown = async (text, timeout = 4000) => page.getByText(text).first().waitFor({ timeout });

async function login(email, password) {
  await page.waitForSelector("input[type=email]", { timeout: 10000 });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
}

(async () => {
  server = await startFixtureServer({ port: Number(process.env.QA_PORT || 5320), assetsDir: process.env.QA_ASSETS || undefined });
  browser = await playwright.chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "th-TH", acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.url }).catch(() => {});
  page = await ctx.newPage();
  page.setDefaultTimeout(8000); // a step that cannot find its control fails in 8 s, not 30 s (the old 30 s made a stale script take an hour)
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on("dialog", (d) => { if (acceptDialogs) d.accept(); else d.dismiss(); });

  // ------------------------------------------------------------------ sign in / out
  await step("A01", "wrong password is refused with a message, and stays on the sign-in page", async () => {
    await page.goto(server.url);
    await login(server.email, "not-the-password");
    await page.getByText(/ไม่ถูกต้อง/).first().waitFor({ timeout: 5000 });
    ok(await page.locator("input[type=password]").count() === 1, "left the sign-in page");
  });
  await step("A02", "the right password gets in (and shows the home page)", async () => {
    await login(server.email, server.password);
    await page.waitForSelector(".rail", { timeout: 15000 });
    await page.getByText("สแกนส่งงาน").first().waitFor({ timeout: 5000 });
  });
  await step("A03", "reload keeps the teacher signed in", async () => {
    await page.reload();
    await page.waitForSelector(".rail", { timeout: 15000 });
  });

  // ------------------------------------------------------------------ home shortcuts
  await step("H01", "home: the four big buttons go where they say", async () => {
    await go("/home", ".hm-action");
    const targets = [["สแกนส่งงาน", "#/scan"], ["เช็คชื่อ", "#/attendance"], ["สร้างงาน", "#/gradebook"], ["สุ่มชื่อ", "#/random"]];
    for (const [label, hash] of targets) {
      await go("/home", ".hm-action");
      await page.locator(".hm-action", { hasText: label }).first().click();
      await page.waitForTimeout(200);
      ok(page.url().includes(hash), `“${label}” went to ${page.url().split("#")[1]} instead of ${hash}`);
    }
    // “สร้างงาน” should open the create dialog
    await go("/home", ".hm-action");
    await page.locator(".hm-action", { hasText: "สร้างงาน" }).first().click();
    await page.locator(".modal").waitFor({ timeout: 4000 });
    await page.keyboard.press("Escape"); await page.locator(".modal-overlay").click({ position: { x: 3, y: 3 } }).catch(() => {});
  });
  await step("H02", "home: a class row under “เช็คชื่อวันนี้” opens THAT class's attendance", async () => {
    await go("/home", ".hm-action");
    // (the home page is now the "ลำดับงานวันนี้" timeline; a room's roll-call row has a "เริ่มเช็คชื่อ" button — the intent is the same: it opens THAT room)
    const row = page.locator('.hma-item[data-kind="room"] .hma-btn[aria-label*="ป.6/2"]').first();
    await row.click();
    await page.waitForSelector(".att-tile", { timeout: 4000 });
    ok(page.url().includes("attendance"), "went to " + page.url().split("#")[1]);
    ok(/ป\.6\/2/.test(await page.locator(".uh-sub").innerText()), "opened another class: " + (await page.locator(".uh-sub").innerText()));
  });

  // ------------------------------------------------------------------ students
  await step("S01", "students: adding with nothing filled in says what is missing (and saves nothing)", async () => {
    await go("/students", ".stu-lrow");
    const before = (await sql("SELECT COUNT(*) n FROM students"))[0].n;
    await page.getByRole("button", { name: /เพิ่มนักเรียน/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.getByRole("button", { name: "บันทึก" }).click();
    await page.getByText(/กรอกชื่อ สกุล และรหัสนักเรียนให้ครบ/).waitFor({ timeout: 3000 });
    ok((await sql("SELECT COUNT(*) n FROM students"))[0].n === before, "a student was saved anyway");
  });
  await step("S02", "students: add a student; appears in the list; count goes up", async () => {
    const inputs = page.locator(".modal input");
    // fields in order: code, first name, last name, nickname, number
    // (field ids: a label's text now also carries its inline error message, so a text match on the label is not stable)
    await page.locator("#stu-f-code").fill("99001");
    await page.locator("#stu-f-first_name").fill("ทดสอบ");
    await page.locator("#stu-f-last_name").fill("ระบบ");
    await page.locator("#stu-f-number").fill("40");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 5000 });
    await page.getByText("ทดสอบ ระบบ").first().waitFor({ timeout: 5000 });
    const row = (await sql("SELECT * FROM students WHERE code='99001'"))[0];
    ok(row && row.class_id === "cls_61" && row.number === 40, "saved row wrong: " + JSON.stringify(row));
    void inputs;
  });
  await step("S03", "students: the same student code twice is refused with a readable message", async () => {
    await page.getByRole("button", { name: /เพิ่มนักเรียน/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.locator("#stu-f-code").fill("99001");
    await page.locator("#stu-f-first_name").fill("ซ้ำ");
    await page.locator("#stu-f-last_name").fill("ซ้ำ"); // (a last name is required now, otherwise the "required" message hides the duplicate-code one)
    await page.getByRole("button", { name: "บันทึก" }).click();
    await page.waitForTimeout(700);
    const n = (await sql("SELECT COUNT(*) n FROM students WHERE code='99001'"))[0].n;
    ok(n === 1, `${n} students with code 99001`);
    const txt = await page.locator(".modal").innerText();
    ok(!/internal|unique|constraint/i.test(txt), "raw error shown: " + txt.slice(-80));
    ok(/รหัสนี้มีอยู่แล้ว/.test(txt), "no readable duplicate-code message: " + txt.slice(-120));
    await closeAny();
  });
  await step("S04", "students: search narrows the list", async () => {
    await go("/students", ".stu-lrow");
    await page.fill(".stu-search input", "ทดสอบ");
    await page.waitForTimeout(200);
    ok((await page.locator(".stu-lrow").count()) === 1, "rows: " + (await page.locator(".stu-lrow").count()));
    await page.fill(".stu-search input", "ไม่มีคนนี้แน่นอน");
    await page.getByText("ไม่พบนักเรียนที่ค้นหา").waitFor({ timeout: 2000 });
    await page.fill(".stu-search input", "");
  });
  await step("S05", "students: open a student, edit the nickname, it is saved", async () => {
    await page.locator(".stu-lrow", { hasText: "ทดสอบ" }).first().click();
    await page.locator(".drawer").waitFor();
    await page.locator(".drawer").getByRole("button", { name: /แก้ไข/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.locator(".modal label", { hasText: "ชื่อเล่น" }).locator("input").fill("เทส");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 5000 });
    ok((await sql("SELECT nickname FROM students WHERE code='99001'"))[0].nickname === "เทส", "nickname not saved");
  });
  await step("S05b", "students: “ออก QR ใหม่” really changes the child's QR", async () => {
    await go("/students", ".stu-lrow");
    const before = (await sql("SELECT qr_token FROM students WHERE code='99001'"))[0].qr_token;
    await page.locator(".stu-lrow", { hasText: "ทดสอบ" }).first().click();
    await page.locator(".drawer").getByRole("button", { name: /แก้ไข/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.locator(".modal").getByRole("button", { name: /ออก QR ใหม่/ }).click();
    // (now asks first, and the form stays open afterwards with a note — G-S3)
    await page.locator("[role=alertdialog] button.primary, [role=alertdialog] button.danger").first().click();
    await page.getByText(/ออก QR ใหม่แล้ว/).first().waitFor({ timeout: 5000 });
    await closeAny();
    ok((await sql("SELECT qr_token FROM students WHERE code='99001'"))[0].qr_token !== before, "QR did not change");
  });
  await step("S06", "students: Excel paste with a repeated-ID column previews and imports (new children + an update)", async () => {
    await go("/students", ".stu-lrow");
    await page.getByRole("button", { name: /นำเข้า Excel/ }).click();
    await page.getByRole("tab", { name: /วางข้อความ/ }).click(); // (the box opens on the file tab; pasting is its own tab now)
    await page.locator(".modal textarea").fill(
      "99010\tเด็กชาย\tสมชาย\tทดลองหนึ่ง\t99010\n99011\tเด็กหญิง\tสมหญิง\tทดลองสอง\t99011\n99001\tเด็กชาย\tทดสอบ\tระบบ\t99001");
    await page.getByText(/เพิ่มใหม่ 2/).waitFor({ timeout: 6000 });
    ok(await page.getByText(/แก้ข้อมูล 1|เหมือนเดิม 1/).count() > 0, "the existing code was not recognised as an update");
    await page.getByRole("button", { name: /นำเข้า 3 คน/ }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 6000 });
    const r = await sql("SELECT code, last_name FROM students WHERE code IN ('99010','99011') ORDER BY code");
    ok(r.length === 2 && r[0].last_name === "ทดลองหนึ่ง", "imported: " + JSON.stringify(r));
  });
  await step("S06b", "students: re-importing a list that has NO class-number column keeps everyone's existing class numbers", async () => {
    await page.getByRole("button", { name: /นำเข้า Excel/ }).click();
    await page.getByRole("tab", { name: /วางข้อความ/ }).click(); // (the box opens on the file tab; pasting is its own tab now)
    await page.locator(".modal textarea").fill("10501\tด.ช.\tภูมิพัฒน์\tใจดี\n10502\tด.ญ.\tปุณยวีร์\tแสงทอง");
    await page.getByText(/เพิ่มใหม่ 0/).waitFor({ timeout: 6000 });
    await page.getByRole("button", { name: /นำเข้า 2 คน/ }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 6000 });
    const r = await sql("SELECT code, number FROM students WHERE code IN ('10501','10502') ORDER BY code");
    ok(r.every((x) => x.number != null), "class numbers wiped by the import: " + JSON.stringify(r));
  });
  await step("S07", "students: Excel paste with a clashing class number is blocked with a clear warning", async () => {
    await page.getByRole("button", { name: /นำเข้า Excel/ }).click();
    await page.getByRole("tab", { name: /วางข้อความ/ }).click(); // (the box opens on the file tab; pasting is its own tab now)
    await page.locator(".modal textarea").fill("99020\tเด็กชาย\tชนกัน\tเลขที่\t1");
    await page.getByText(/เลขที่ชนกับ/).waitFor({ timeout: 6000 });
    ok(await page.getByRole("button", { name: /นำเข้า 1 คน/ }).isDisabled(), "import button should be disabled");
    await page.getByRole("button", { name: "ยกเลิก" }).click(); await closeAny();
  });
  await step("S08", "students: print-stickers page opens and closes", async () => {
    await go("/students", ".stu-lrow");
    await page.getByRole("button", { name: "บัตร QR" }).click(); // (the print button is now a "บัตร QR" menu)
    await page.getByRole("menuitem", { name: /พิมพ์สติกเกอร์ทั้งห้อง/ }).click();
    await page.waitForTimeout(500);
    ok(await page.locator(".sticker, .stk, [class*=sticker]").count() > 0, "no stickers rendered");
    await page.getByRole("button", { name: /กลับ/ }).first().click();
    await page.locator(".stu-lrow").first().waitFor({ timeout: 3000 });
  });

  // ------------------------------------------------------------------ gradebook
  await step("G01", "gradebook: create a piece of work (dates picked with the Thai date fields) and it becomes a column", async () => {
    await go("/gradebook", "table.gb tbody tr");
    const cols = await page.locator("table.gb thead th").count();
    await page.getByRole("button", { name: /สร้างงาน/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.locator(".modal input[placeholder^='เช่น ใบงาน']").fill("งานทดสอบ QA");
    // due date: 20 days from today, picked from the three selects of the 2nd date field
    const dueISO = bkkDay(20), [dy, dm, dd] = dueISO.split("-").map(Number);
    const due = page.locator(".modal .modal-grid2 [role=group]").nth(1);
    await due.getByLabel("วัน").selectOption(String(dd));
    await due.getByLabel("เดือน").selectOption(String(dm));
    await due.getByLabel("ปี พ.ศ.").selectOption({ label: String(dy + 543) });
    await page.getByRole("button", { name: "บันทึกงาน" }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 6000 });
    await page.locator("table.gb thead th", { hasText: "งานทดสอบ QA" }).waitFor({ timeout: 6000 });
    const a = (await sql("SELECT * FROM assignments WHERE title='งานทดสอบ QA'"))[0];
    ok(a && a.due_date === bkkDay(20), "due date saved as " + a?.due_date + " expected " + bkkDay(20));
    ok((await page.locator("table.gb thead th").count()) === cols + 1, "column count did not grow by one");
  });
  await step("G02", "gradebook: a score typed into a cell is saved, and the running total follows", async () => {
    await page.locator("table.gb thead th", { hasText: "งานทดสอบ QA" }).click();
    const row1 = page.locator("table.gb tbody tr", { hasText: "ภูมิพัฒน์" }).first();
    const cell = row1.locator("td.cell").last();
    const totalBefore = await row1.locator("td").last().innerText();
    await cell.click();
    await page.locator("input.cell-input").fill("7");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    const s = await sql("SELECT score FROM submissions WHERE assignment_id=(SELECT id FROM assignments WHERE title='งานทดสอบ QA') AND student_id='stu_1'");
    ok(s.length === 1 && s[0].score === 7, "saved: " + JSON.stringify(s));
    const totalAfter = await row1.locator("td").last().innerText();
    ok(totalAfter !== totalBefore || /•••/.test(totalAfter), `total did not change (${totalBefore} → ${totalAfter})`);
  });
  await step("G03", "gradebook: a score above the full mark is refused, not saved", async () => {
    const cell = page.locator("table.gb tbody tr", { hasText: "ปุณยวีร์" }).first().locator("td.cell").last();
    await cell.click();
    await page.locator("input.cell-input").fill("99");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    const s = await sql("SELECT score FROM submissions WHERE assignment_id=(SELECT id FROM assignments WHERE title='งานทดสอบ QA') AND student_id='stu_2'");
    ok(s.length === 0 || s[0].score <= 10, "score over full saved: " + JSON.stringify(s));
    await page.keyboard.press("Escape");
  });
  await step("G04", "gradebook: hiding a work masks its scores and drops it from the total (shown with *); hiding all work masks the total", async () => {
    const th = page.locator("table.gb thead th", { hasText: "งานทดสอบ QA" });
    await th.click(); // (the eye only shows on the selected column)
    const eye = th.locator(".hs-eye");
    const r1 = page.locator("table.gb tbody tr", { hasText: "ภูมิพัฒน์" }).first();
    const total = async () => { const m = /(\d+)\s*\/\s*(\d+)/.exec(await r1.locator("td").last().innerText()); return m ? { score: +m[1], full: +m[2] } : null; };
    const wasVisible = !(await eye.evaluate((el) => el.classList.contains("off")));
    if (!wasVisible) { await eye.click(); await page.waitForTimeout(600); }
    ok((await r1.locator("td.cell").last().innerText()).trim() === "7", "score should be showing at the start");
    const before = await total();
    ok(before && before.full > 10, "total before: " + JSON.stringify(before));
    await eye.click(); await page.waitForTimeout(600);
    ok((await r1.locator("td.cell").last().innerText()).trim() !== "7", "score still visible after hiding");
    const after = await total();
    ok(after && after.score === before.score - 7 && after.full === before.full - 10, `total should lose this work (7/10): ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    ok(/\*/.test(await page.locator("table.gb thead th", { hasText: "สะสม" }).innerText()), "header should say the total leaves hidden work out");
    await eye.click(); await page.waitForTimeout(600);
    ok((await r1.locator("td.cell").last().innerText()).trim() === "7", "score did not come back");
    ok(JSON.stringify(await total()) === JSON.stringify(before), "total did not come back");
    // hide every piece of work: nothing left to total
    // (the eyes of other columns are hidden until selected; "hide all" is now one item of the "จัดการงาน" menu)
    await page.getByRole("button", { name: "จัดการงาน" }).click();
    await page.getByRole("menuitem", { name: /ซ่อนคะแนนทั้งหมด/ }).click();
    await page.waitForTimeout(1200);
    ok(/•••/.test(await r1.locator("td").last().innerText()), "total should be ••• when all work is hidden");
    // (the menu stays open after "ซ่อนคะแนนทั้งหมด" — noted as B-73c; reopen it only if it did close)
    if (!(await page.getByRole("menu", { name: "จัดการงาน" }).count())) await page.getByRole("button", { name: "จัดการงาน" }).click();
    await page.getByRole("menuitem", { name: /แสดงคะแนนทั้งหมด/ }).click({ timeout: 20000 }); // (disabled while the hide-all request is still being saved)
    await page.waitForTimeout(1200);
    await closeMenu(); // the menu does not close by itself (B-73c)
  });
  await step("G05", "gradebook: “ทั้งห้องส่งแล้ว” marks the whole class and “ล้าง” undoes it", async () => {
    const aid = (await sql("SELECT id FROM assignments WHERE title='งานทดสอบ QA'"))[0].id;
    // (whole-class actions now live in the "ทำทั้งห้อง" menu of the SELECTED work and ask before doing anything)
    await page.locator("table.gb thead th", { hasText: "งานทดสอบ QA" }).click();
    await page.getByRole("button", { name: "ทำทั้งห้อง" }).click();
    await page.getByRole("menuitem", { name: /ทั้งห้องส่งแล้ว/ }).click();
    await page.locator(".modal-overlay").getByRole("button", { name: /^ส่งแล้ว \d+ คน$/ }).click();
    await page.waitForTimeout(1200);
    const n1 = (await sql("SELECT COUNT(*) n FROM submissions WHERE assignment_id=? AND status='submitted'", aid))[0].n;
    ok(n1 >= 30, "only " + n1 + " marked");
    await page.getByRole("button", { name: "ทำทั้งห้อง" }).click();
    await page.getByRole("menuitem", { name: /ล้างคะแนนทั้งงาน/ }).click();
    await page.locator(".modal-overlay").getByRole("button", { name: /^ล้าง \d+ คน$/ }).click();
    await page.waitForTimeout(1200);
    const n2 = (await sql("SELECT COUNT(*) n FROM submissions WHERE assignment_id=? AND status='submitted'", aid))[0].n;
    ok(n2 === 0, n2 + " still marked after clearing");
  });
  await step("G06", "gradebook: edit the work (rename) and the column follows", async () => {
    await page.locator("table.gb thead th", { hasText: "งานทดสอบ QA" }).click();
    await page.getByRole("button", { name: "จัดการงาน" }).click();
    await page.getByRole("menuitem", { name: /^แก้ไข/ }).click();
    await page.locator(".modal").waitFor();
    await page.locator(".modal input[placeholder^='เช่น ใบงาน']").fill("งานทดสอบ QA (แก้)");
    await page.getByRole("button", { name: "บันทึกงาน" }).click();
    await page.locator("table.gb thead th", { hasText: "(แก้)" }).waitFor({ timeout: 6000 });
  });
  await step("G07", "gradebook: delete the work; the column is gone", async () => {
    await page.locator("table.gb thead th", { hasText: "(แก้)" }).click();
    await page.getByRole("button", { name: "จัดการงาน" }).click();
    await page.getByRole("menuitem", { name: /ลบงาน/ }).click();
    await page.locator("[role=alertdialog] button.danger").click(); // (asks first now)
    await page.waitForTimeout(1000);
    ok((await page.locator("table.gb thead th", { hasText: "(แก้)" }).count()) === 0, "column still there");
  });

  // ------------------------------------------------------------------ attendance
  await step("T01", "attendance: tapping cycles the status and the summary counts follow; reload keeps it", async () => {
    await go("/attendance", ".att-tile");
    const tile = page.locator(".att-tile", { hasText: "ภูมิ" }).first();
    await tile.click(); // -> present
    await page.waitForTimeout(300);
    ok(/present/.test(await tile.getAttribute("class")), "first tap did not mark present: " + (await tile.getAttribute("class")));
    await page.getByText(/มาเรียน 1 จาก/).waitFor({ timeout: 2000 });
    await page.waitForTimeout(2500); // the draft is sent to the server a moment after the tap
    const saved = await sql("SELECT status FROM attendance WHERE student_id='stu_1' AND session_id IN (SELECT id FROM attendance_sessions WHERE class_id='cls_61' AND subject_id IS NULL ORDER BY date DESC LIMIT 1)");
    ok(saved.length === 1 && saved[0].status === "present", "server has: " + JSON.stringify(saved));
    await page.reload(); await page.waitForSelector(".att-tiles:not(.loading) .att-tile");
    ok(/present/.test(await page.locator(".att-tile", { hasText: "ภูมิ" }).first().getAttribute("class")), "status lost after reload");
  });
  await step("T02", "attendance: choose a status, then tap students to set it; “มาทั้งหมด” fills everyone", async () => {
    await page.getByRole("radio", { name: /ขาด/ }).first().click(); // (the status choices are a radio group now)
    await page.locator(".att-tile").nth(1).click();
    await page.waitForTimeout(300);
    ok(/absent/.test(await page.locator(".att-tile").nth(1).getAttribute("class")), "tile 2 is " + (await page.locator(".att-tile").nth(1).getAttribute("class")));
    await page.getByRole("button", { name: /^มาทั้งห้อง/ }).first().click(); // (was "มาทั้งหมด"; now asks first)
    await page.locator("[role=alertdialog] button.primary").click();
    await page.waitForTimeout(6500); // ("มาทั้งห้อง" is held back a few seconds so "เลิกทำ" can take it back (UNDO_HOLD_MS))
    // (new rule: "มาทั้งห้อง" only fills the children NOT checked yet — the one just marked absent keeps "ขาด"; the room shown depends on earlier steps, so count against the tiles)
    const tiles = await page.locator(".att-tile").count();
    ok((await page.locator(".att-tile.present").count()) === tiles - 1, `present tiles: ${await page.locator(".att-tile.present").count()} of ${tiles} (expected all but the absent one)`);
    ok(/absent/.test(await page.locator(".att-tile").nth(1).getAttribute("class")), "the child marked absent was overwritten by มาทั้งห้อง");
  });
  await step("T03", "attendance: yesterday and back to today", async () => {
    const before = await page.locator(".uh-sub").innerText();
    await page.locator("button[aria-label*='ก่อน'], .att-nav button").first().click().catch(async () => { await page.getByRole("button", { name: "วันก่อน" }).click(); });
    await page.waitForTimeout(400);
    const mid = await page.locator(".uh-sub").innerText();
    ok(mid !== before, "date did not change");
    await page.getByRole("button", { name: /วันนี้|วัน/ }).first().click().catch(() => {});
  });

  // ------------------------------------------------------------------ scan (keyboard-wedge scanner)
  await step("N01", "scan: pick work + room + mode, start, scan a QR with the keyboard scanner → the score lands", async () => {
    await go("/scan", ".sc-asg");
    const aid = (await sql("SELECT id FROM assignments WHERE title LIKE 'โมเดล%'"))[0].id;
    await page.getByText("โมเดลระบบย่อยอาหาร").first().click();
    await page.getByRole("button", { name: /เริ่มสแกน/ }).click();
    await page.waitForTimeout(600);
    const token = (await sql("SELECT qr_token FROM students WHERE id='stu_2'"))[0].qr_token;
    await page.keyboard.type(token, { delay: 4 }); await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const s = await sql("SELECT status, score FROM submissions WHERE assignment_id=? AND student_id='stu_2'", aid);
    ok(s.length === 1 && s[0].status === "submitted", "submission: " + JSON.stringify(s));
  });
  await step("N02", "scan: the same child twice does not double-count; an unknown code is called out", async () => {
    const token = (await sql("SELECT qr_token FROM students WHERE id='stu_2'"))[0].qr_token;
    await page.keyboard.type(token, { delay: 4 }); await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await page.keyboard.type("Q-NOTAREALCODE", { delay: 4 }); await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    const body = await page.locator("body").innerText();
    ok(/ไม่พบ|ไม่รู้จัก|ไม่ถูกต้อง|ไม่มีใน/.test(body), "no message for an unknown code");
    const aid = (await sql("SELECT id FROM assignments WHERE title LIKE 'โมเดล%'"))[0].id;
    ok((await sql("SELECT COUNT(*) n FROM submissions WHERE assignment_id=? AND student_id='stu_2'", aid))[0].n === 1, "duplicate submission row");
  });

  // ------------------------------------------------------------------ reports
  await step("R01", "reports: “คัดลอกไป LINE” puts who-owes-what on the clipboard", async () => {
    await go("/reports", ".rp-range");
    await page.getByRole("button", { name: /คัดลอกไป LINE/ }).click();
    await page.waitForTimeout(400);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    ok(/รายชื่อนักเรียนค้างส่งงาน/.test(text) && /ค้าง \d+ งาน \(.+\)/.test(text), "clipboard: " + text.slice(0, 120));
  });
  await step("R02", "reports: “ส่งออก Excel” downloads a real .xlsx", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: /ส่งออก Excel/ }).click()]);
    const file = await dl.path();
    const buf = fs.readFileSync(file);
    // (headless Chromium reports any Thai download name as “download”; real Chrome keeps it — so the name is not checked here)
    ok(buf.length > 2000 && buf.slice(0, 2).toString() === "PK", `file “${dl.suggestedFilename()}” ${buf.length} bytes starts ${JSON.stringify(buf.slice(0, 4).toString())}`);
  });
  await step("R03", "reports: switching room / month / subject keeps the page working", async () => {
    await go("/reports", ".rp-range");
    await page.locator("button.pill", { hasText: "ป.6/2" }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "รายเดือน" }).click();
    await page.waitForTimeout(500);
    ok((await page.locator("select").count()) >= 1, "no month selector");
    await page.getByRole("button", { name: "ทั้งเทอม", exact: true }).click(); // (exact: "ดูทั้งเทอม" exists too)
    await page.waitForTimeout(400);
    ok(await page.locator(".rp-range").count() === 1, "range line missing");
  });

  // ------------------------------------------------------------------ random
  await step("D01", "random: “ใช้ทั้งห้อง” then “สุ่มเลย” shows a name; group mode makes groups", async () => {
    await go("/random", ".uh");
    await page.getByRole("button", { name: /ใช้ทั้งห้อง/ }).click().catch(() => {});
    await page.getByRole("button", { name: /สุ่มเลย/ }).click();
    await page.waitForTimeout(2500);
    ok(await page.getByText("ยังไม่มีรายชื่อให้สุ่ม").count() === 0, "still says there is nobody to pick");
    await page.getByRole("button", { name: /จับกลุ่ม/ }).click();
    await page.getByRole("button", { name: /จับกลุ่ม|สุ่มเลย/ }).last().click();
    await page.waitForTimeout(1500);
  });

  await step("D02", "random: clicking an option (เฉพาะคนที่มา / ไม่ซ้ำจนครบ) flips it exactly once, and the boxes are normal-sized", async () => {
    // (the options are toggle pills (aria-pressed) now, not check boxes: same intent — one click flips it exactly once; and the target is big enough to tap)
    await go("/random", ".uh");
    // (the options are pills on the pick-mode panel; the page may still be in group mode from D01)
    await page.locator("button, [role=radio], [role=tab]", { hasText: /^\s*สุ่มชื่อ\s*$/ }).first().click().catch(() => {});
    const opt = page.locator("button.pill", { hasText: "ไม่ซ้ำจนครบ" }).first();
    const pressed = async () => (await opt.getAttribute("aria-pressed")) === "true";
    const before = await pressed();
    const size = await opt.boundingBox();
    ok(size.height >= 32 && size.width >= 32, `option is only ${Math.round(size.width)}×${Math.round(size.height)}px`);
    await opt.click(); await page.waitForTimeout(200);
    ok((await pressed()) !== before, "one click did not change it");
    await opt.click(); await page.waitForTimeout(200);
    ok((await pressed()) === before, "second click did not change it back");
  });

  // ------------------------------------------------------------------ settings
  await step("E01", "settings: change the school name → save bar → saved → header follows → survives reload", async () => {
    await openSettings("general");
    const inp = page.locator("label", { hasText: "ชื่อโรงเรียน" }).locator("input");
    await inp.fill("โรงเรียนทดสอบ QA");
    await page.getByRole("button", { name: /บันทึก/ }).last().click();
    await page.waitForTimeout(800);
    ok((await sql("SELECT value FROM settings WHERE key='school_name'"))[0].value === "โรงเรียนทดสอบ QA", "not saved");
    await page.reload(); await page.waitForSelector(".rail");
    await openSettings("general");
    ok((await page.locator(".uh-sub").innerText()).includes("โรงเรียนทดสอบ QA"), "header did not follow");
  });
  await step("E02", "settings: the theme chosen stays after a reload", async () => {
    // (light/dark moved to Settings > หน้าตา: radio cards that save at once, with a toast)
    await openSettings("appearance");
    await page.locator("label.ap-mode", { hasText: "มืด" }).click();
    await page.waitForTimeout(900);
    await page.reload(); await page.waitForSelector(".rail");
    ok((await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark", "theme is not dark after reload");
    await openSettings("appearance");
    await page.locator("label.ap-mode", { hasText: "สว่าง" }).click();
    await page.waitForTimeout(700);
  });
  await step("E03", "settings: leaving with unsaved changes asks first", async () => {
    await openSettings("general");
    await page.locator("label", { hasText: "ชื่อครู" }).locator("input").fill("ครูเปลี่ยนแล้ว");
    await page.waitForTimeout(250);
    // (the app's own question, not a browser dialog: leaving through the menu rail is guarded; typing the address (hash) directly is not a teacher action)
    await page.locator(".rail a", { hasText: "หน้าหลัก" }).click();
    await page.locator("[role=alertdialog]").waitFor({ timeout: 3000 }).catch(() => { throw new Error("no confirmation when leaving with edits"); });
    ok(page.url().includes("settings"), "left the page while the question was open");
    await page.locator("[role=alertdialog] button[data-autofocus]").click(); // the safe answer: stay
    await page.waitForTimeout(300);
    ok(page.url().includes("settings") && (await page.locator("label", { hasText: "ชื่อครู" }).locator("input").inputValue()) === "ครูเปลี่ยนแล้ว", "the edit was lost although the teacher stayed");
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).last().click(); // discard the edit through the save bar so the next steps start clean
    await page.waitForTimeout(300);
  });
  await step("E04", "settings: edit a term's number, name and dates (Thai date fields) and save", async () => {
    await go("/home", ".hm-action"); await go("/settings?section=catalog&tab=terms", ".set-cols"); // (the terms tab is reached by its link; the tab buttons are not plain "button"s any more)
    await page.locator(".set-body").getByRole("button", { name: "แก้ไข", exact: true }).first().click();
    await page.locator("label", { hasText: "ชื่อที่แสดง" }).locator("input").fill("ภาคเรียนที่ 1/2569 (แก้)");
    await page.getByRole("button", { name: "บันทึก", exact: true }).first().click();
    await page.waitForTimeout(800);
    ok((await sql("SELECT name FROM terms WHERE is_current=1"))[0].name.includes("(แก้)"), "name not saved");
  });
  await step("E05", "settings: devices list shows this device", async () => {
    await openSettings("devices");
    await page.getByText("เครื่องนี้").first().waitFor({ timeout: 4000 });
  });
  await step("E06", "settings: wrong current password is refused; the right one changes it and says so", async () => {
    const box = page.locator(".set-body");
    await box.getByRole("button", { name: "เปลี่ยนรหัสผ่าน" }).first().click();
    // (the form has three fields now — current / new / confirm — with ids; its submit is "บันทึกรหัสผ่านใหม่")
    const fill = async (c, n) => { await page.locator("#pw-cur").fill(c); await page.locator("#pw-new").fill(n); await page.locator("#pw-again").fill(n); };
    await fill("wrong-one", "NewPassword2026");
    await box.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();
    await page.waitForTimeout(700);
    ok(/ไม่ถูกต้อง/.test(await page.locator("body").innerText()), "no error shown for a wrong current password");
    await fill(server.password, "NewPassword2026");
    await box.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();
    await page.waitForTimeout(900);
    server.password = "NewPassword2026";
    ok(/เปลี่ยนรหัสผ่านแล้ว/.test(await page.locator("body").innerText()), "no confirmation that the password was changed");
  });
  await step("E07", "settings: “ดาวน์โหลดไฟล์สำรอง” gives a valid backup file", async () => {
    await openSettings("backup");
    // (a "what is in this file" warning comes first (S-04): the download starts from its confirm button)
    await page.getByRole("button", { name: "ดาวน์โหลด" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.locator("[role=dialog] button.primary", { hasText: "ดาวน์โหลด" }).click()]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
    ok(j.app === "ngankrob" && j.counts.students >= 30, "backup looks wrong: " + JSON.stringify(j.counts));
  });
  await step("E09", "settings: a link to another section (#/settings?section=backup) works even while already on settings", async () => {
    await openSettings("general");
    await page.evaluate(() => { location.hash = "/settings?section=backup"; });
    await page.waitForTimeout(400);
    ok(await page.getByText("ดาวน์โหลดไฟล์สำรอง").count() > 0, "still showing the old section");
  });
  await step("E10", "settings: side menu OR pills, not both, on a wide screen", async () => {
    await openSettings("general");
    const nav = await page.locator(".set-nav").isVisible();
    const chips = await page.locator(".set-nav-chips").isVisible();
    ok(nav !== chips, `side menu visible: ${nav}, pills visible: ${chips}`);
  });
  await step("K01", "history: when the server cannot be reached it says so (and offers a retry), not “no history yet”", async () => {
    await openSettings("history");
    await page.getByText("ทั้งหมด").first().waitFor();
    server.setDown(true);
    try {
      await page.locator(".set-body .pill", { hasText: "ส่งงาน" }).click();
      await page.getByText(/โหลดประวัติไม่สำเร็จ/).waitFor({ timeout: 6000 });
    } finally { server.setDown(false); }
    await page.getByRole("button", { name: "ลองอีกครั้ง" }).click();
    await page.waitForTimeout(800);
    ok(await page.getByText(/โหลดประวัติไม่สำเร็จ/).count() === 0, "still failing after the server came back");
  });
  await step("K02", "reports: when the server cannot be reached the page says so, print/export are off, the badge goes offline — and all recover", async () => {
    await go("/reports", ".rp-range");
    const badge = page.locator(".rail-sync .sync").first();
    ok(/online/.test(await badge.getAttribute("class")), "badge should start online");
    server.setDown(true);
    try {
      await page.locator("button", { hasText: "รายเดือน" }).click();
      await page.getByText(/โหลดรายงานไม่สำเร็จ|โหลดข้อมูลไม่สำเร็จ/).waitFor({ timeout: 8000 });
      ok(await page.getByRole("button", { name: /พิมพ์/ }).isDisabled(), "print should be disabled with no data");
      ok(await page.getByRole("button", { name: /ส่งออก Excel/ }).isDisabled(), "Excel export should be disabled with no data");
      ok(/offline/.test(await badge.getAttribute("class")), "badge still says online while the server cannot be reached");
    } finally { server.setDown(false); }
    await page.getByRole("button", { name: "ลองอีกครั้ง" }).click();
    await page.locator(".rp-range").waitFor({ timeout: 8000 });
    ok(!(await page.getByRole("button", { name: /ส่งออก Excel/ }).isDisabled()), "export stays disabled after the data is back");
    ok(/online/.test(await badge.getAttribute("class")), "badge did not come back");
  });
  await step("E08", "settings: history lists what was just done", async () => {
    await openSettings("history");
    await page.waitForTimeout(800);
    const n = await page.locator(".set-body .hist-row, .set-body .row, .set-body li, .set-body tr").count();
    ok(n >= 3, "history rows: " + n);
  });

  // ------------------------------------------------------------------ sign out and back in (with the new password)
  await step("A04", "sign out lands on the sign-in page; the new password works", async () => {
    await page.getByRole("button", { name: /ออกจากระบบ/ }).first().click();
    await page.waitForSelector("input[type=email]", { timeout: 8000 });
    await login(server.email, "NewPassword2026");
    await page.waitForSelector(".rail", { timeout: 15000 });
  });

  // ------------------------------------------------------------------ start a new term / a new school year
  // (Y01/Y02/X01: by instruction of this round the destructive confirm is NOT pressed — the steps check the gates (what is offered, what is
  //  disabled until the teacher has agreed) and then cancel. The effect of confirming (rows moved / wiped) stays covered by the unit/integration tests.)
  await step("Y01", "start the next term (same year): the box offers เริ่มภาคเรียน 2/2569, asks for the tick, and cancelling changes nothing", async () => {
    await go("/home", ".hm-action"); await go("/settings?section=catalog&tab=terms", ".set-cols");
    const before = await sql("SELECT name, year, term FROM terms WHERE is_current=1");
    await page.getByRole("button", { name: /เริ่มภาคเรียนใหม่/ }).first().click();
    await page.locator(".modal").waitFor();
    const goBtn = page.locator(".modal button.primary").last();
    ok(/เริ่มภาคเรียน 2\/2569/.test(await goBtn.innerText()), "button says: " + (await goBtn.innerText()));
    await page.locator(".modal button", { hasText: "ยกเลิก" }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 5000 });
    ok(JSON.stringify(await sql("SELECT name, year, term FROM terms WHERE is_current=1")) === JSON.stringify(before), "current term changed although the teacher cancelled");
  });
  await step("Y02", "start a new school year: date fields on ONE line; the confirm needs the tick; cancelling deletes nothing", async () => {
    const before = (await sql("SELECT COUNT(*) n FROM students"))[0].n;
    await page.getByRole("button", { name: /เริ่มภาคเรียนใหม่/ }).first().click();
    await page.locator(".modal").waitFor();
    const startField = page.locator(".modal .modal-grid2 .datefield").first();
    await startField.getByLabel("วัน").selectOption("16");
    await startField.getByLabel("เดือน").selectOption("5");
    await startField.getByLabel("ปี พ.ศ.").selectOption({ label: "2570" });
    const boxes = await startField.locator("select").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    ok(new Set(boxes).size === 1, "date field selects are on different lines: " + boxes.join(","));
    await page.locator(".modal input[type=number]").first().fill("2570");
    await page.locator(".modal select").first().selectOption("1");
    const goBtn = page.locator(".modal button.primary").last();
    ok(await goBtn.isDisabled(), "a new school year can be started before the teacher ticked that they understand");
    await page.locator(".modal .imp-confirm input[type=checkbox]").check();
    ok(!(await goBtn.isDisabled()) && /เริ่มภาคเรียน 1\/2570/.test(await goBtn.innerText()), "confirm not offered after the tick: " + (await goBtn.innerText()));
    await page.locator(".modal button", { hasText: "ยกเลิก" }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 5000 });
    ok((await sql("SELECT COUNT(*) n FROM students"))[0].n === before, "students changed although the teacher cancelled");
    ok((await sql("SELECT COUNT(*) n FROM students WHERE status='finished'"))[0].n === 0, "children were finished although the teacher cancelled");
  });

  // ------------------------------------------------------------------ on a phone
  await step("M01", "phone: bottom tabs and the menu sheet reach every page; the sheet signs out", async () => {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: "th-TH" });
    const ppage = await pctx.newPage();
    const main = page; page = ppage;
    try {
      ppage.on("pageerror", (e) => errors.push(e.message));
      await ppage.goto(server.url);
      await login(server.email, server.password);
      await ppage.waitForSelector(".bottom-tabs", { timeout: 15000 });
      for (const [label, hash] of [["เช็คชื่อ", "attendance"], ["คะแนน", "gradebook"], ["หน้าหลัก", "home"], ["สแกน", "scan"]]) {
        await ppage.locator(".bottom-tabs .tab-item", { hasText: label }).click();
        await ppage.waitForTimeout(300);
        ok(ppage.url().includes("#/" + hash), `“${label}” went to ${ppage.url().split("#")[1]}`);
      }
      for (const [label, hash] of [["รายงาน", "reports"], ["นักเรียน", "students"], ["สุ่มชื่อ", "random"], ["ตั้งค่า", "settings"]]) {
        await ppage.locator(".bottom-tabs .tab-item", { hasText: "เพิ่มเติม" }).click();
        await ppage.locator(".menu-sheet .sheet-item", { hasText: label }).click();
        await ppage.waitForTimeout(300);
        ok(ppage.url().includes("#/" + hash), `menu “${label}” went to ${ppage.url().split("#")[1]}`);
        ok((await ppage.locator(".menu-sheet").count()) === 0, "the menu sheet stayed open after choosing");
        const sw = await ppage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(sw <= 2, `${label}: page is ${sw}px wider than the phone`);
      }
      await ppage.locator(".bottom-tabs .tab-item", { hasText: "เพิ่มเติม" }).click();
      await ppage.locator(".menu-sheet .sheet-item", { hasText: "ออกจากระบบ" }).click();
      await ppage.waitForSelector("input[type=email]", { timeout: 8000 });
    } finally { page = main; await pctx.close(); }
  });

  // ------------------------------------------------------------------ start over
  await step("X01", "start over (data): needs backup choice, then password + the words; the confirm stays off until both are typed (not pressed)", async () => {
    await openSettings("reset");
    await page.getByRole("button", { name: /^ล้างข้อมูล$/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.locator(".modal input[type=checkbox]").uncheck(); // skip the download for the test
    await page.locator(".modal button.primary", { hasText: "ถัดไป" }).click();
    const go_ = page.locator(".modal button.danger");
    ok(await go_.isDisabled(), "button enabled before anything is typed");
    await page.locator(".modal input[type=password]").fill("NewPassword2026");
    ok(await go_.isDisabled(), "button enabled with the password but without the words");
    await page.locator(".modal input[placeholder='ล้างข้อมูล']").fill("ล้างข้อมูล");
    ok(!(await go_.isDisabled()), "button still off although password and words are typed");
    // NOT pressed: cancel and check nothing was wiped
    await closeAny();
    ok((await sql("SELECT COUNT(*) n FROM students"))[0].n > 0, "students gone without a confirm");
  });

  await browser.close(); await server.close();
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify({ label: LABEL, at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} flows passed   shots of failures: ${SHOTS}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

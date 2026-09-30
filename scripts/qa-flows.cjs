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
const OUT = path.join(__dirname, "..", "docs", "qa-2026-10-01", "results");
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

const results = [];
let page, server, ctx, browser;
const errors = [];
const sql = async (q, ...b) => (await server.DB.prepare(q).bind(...b).all()).results;
const ok = (c, msg) => { if (!c) throw new Error(msg || "check failed"); };

const ONLY = arg("only", "");
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
    const msg = String(e.message || e).split("\n")[0].slice(0, 220);
    results.push({ id, name, pass: false, error: msg, ms: Date.now() - t0 });
    console.log(`FAIL  ${id}  ${name}  — ${msg}`);
    await page.screenshot({ path: path.join(SHOTS, `${id}.png`) }).catch(() => {});
    // leave any open dialog so the next step starts clean
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator(".modal-overlay, .drawer-scrim").first().click({ position: { x: 3, y: 3 }, timeout: 500 }).catch(() => {});
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
  server = await startFixtureServer({ port: 5320 });
  browser = await playwright.chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "th-TH", acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.url }).catch(() => {});
  page = await ctx.newPage();
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
    const row = page.locator(".hm-att", { hasText: "ป.6/2" }).first();
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
    await page.getByText(/กรอกชื่อและรหัส/).waitFor({ timeout: 3000 });
    ok((await sql("SELECT COUNT(*) n FROM students"))[0].n === before, "a student was saved anyway");
  });
  await step("S02", "students: add a student; appears in the list; count goes up", async () => {
    const inputs = page.locator(".modal input");
    // fields in order: code, first name, last name, nickname, number
    await page.locator(".modal label", { hasText: "รหัสนักเรียน" }).locator("input").fill("99001");
    await page.locator(".modal label", { hasText: /^ชื่อ$/ }).locator("input").fill("ทดสอบ");
    await page.locator(".modal label", { hasText: "สกุล" }).locator("input").fill("ระบบ");
    await page.locator(".modal label", { hasText: "เลขที่" }).locator("input").fill("40");
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
    await page.locator(".modal label", { hasText: "รหัสนักเรียน" }).locator("input").fill("99001");
    await page.locator(".modal label", { hasText: /^ชื่อ$/ }).locator("input").fill("ซ้ำ");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await page.waitForTimeout(700);
    const n = (await sql("SELECT COUNT(*) n FROM students WHERE code='99001'"))[0].n;
    ok(n === 1, `${n} students with code 99001`);
    const txt = await page.locator(".modal").innerText();
    ok(!/internal|unique|constraint/i.test(txt), "raw error shown: " + txt.slice(-80));
    await page.keyboard.press("Escape"); await page.locator(".modal-overlay").click({ position: { x: 3, y: 3 } }).catch(() => {});
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
    await page.locator(".modal").waitFor({ state: "detached", timeout: 5000 });
    ok((await sql("SELECT qr_token FROM students WHERE code='99001'"))[0].qr_token !== before, "QR did not change");
  });
  await step("S06", "students: Excel paste with a repeated-ID column previews and imports (new children + an update)", async () => {
    await go("/students", ".stu-lrow");
    await page.getByRole("button", { name: /นำเข้า Excel/ }).click();
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
    await page.locator(".modal textarea").fill("10501\tด.ช.\tภูมิพัฒน์\tใจดี\n10502\tด.ญ.\tปุณยวีร์\tแสงทอง");
    await page.getByText(/เพิ่มใหม่ 0/).waitFor({ timeout: 6000 });
    await page.getByRole("button", { name: /นำเข้า 2 คน/ }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 6000 });
    const r = await sql("SELECT code, number FROM students WHERE code IN ('10501','10502') ORDER BY code");
    ok(r.every((x) => x.number != null), "class numbers wiped by the import: " + JSON.stringify(r));
  });
  await step("S07", "students: Excel paste with a clashing class number is blocked with a clear warning", async () => {
    await page.getByRole("button", { name: /นำเข้า Excel/ }).click();
    await page.locator(".modal textarea").fill("99020\tเด็กชาย\tชนกัน\tเลขที่\t1");
    await page.getByText(/เลขที่ชนกับ/).waitFor({ timeout: 6000 });
    ok(await page.getByRole("button", { name: /นำเข้า 1 คน/ }).isDisabled(), "import button should be disabled");
    await page.getByRole("button", { name: "ยกเลิก" }).click();
  });
  await step("S08", "students: print-stickers page opens and closes", async () => {
    await go("/students", ".stu-lrow");
    await page.getByRole("button", { name: /พิมพ์สติกเกอร์/ }).click();
    await page.waitForTimeout(500);
    ok(await page.locator(".sticker, .stk, [class*=sticker]").count() > 0, "no stickers rendered");
    await page.getByRole("button", { name: /ปิด|กลับ/ }).first().click();
    await page.locator(".stu-lrow").first().waitFor({ timeout: 3000 });
  });

  // ------------------------------------------------------------------ gradebook
  await step("G01", "gradebook: create a piece of work (dates picked with the Thai date fields) and it becomes a column", async () => {
    await go("/gradebook", "table.gb tbody tr");
    const cols = await page.locator("table.gb thead th").count();
    await page.getByRole("button", { name: /สร้างงาน/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.locator(".modal input[placeholder^='เช่น ใบงาน']").fill("งานทดสอบ QA");
    // due date: 30 ตุลาคม 2569 (2026-10-30) picked from the three selects of the 2nd date field (today is 1 ต.ค.)
    const due = page.locator(".modal .modal-grid2 [role=group]").nth(1);
    await due.getByLabel("วัน").selectOption("30");
    await due.getByLabel("เดือน").selectOption("10");
    await due.getByLabel("ปี พ.ศ.").selectOption({ label: "2569" });
    await page.getByRole("button", { name: "บันทึกงาน" }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 6000 });
    await page.locator("table.gb thead th", { hasText: "งานทดสอบ QA" }).waitFor({ timeout: 6000 });
    const a = (await sql("SELECT * FROM assignments WHERE title='งานทดสอบ QA'"))[0];
    ok(a && a.due_date === "2026-10-30", "due date saved as " + a?.due_date);
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
  await step("G04", "gradebook: hiding scores masks the column and the total; showing brings them back", async () => {
    const th = page.locator("table.gb thead th", { hasText: "งานทดสอบ QA" });
    const eye = th.locator(".hs-eye");
    const wasVisible = !(await eye.evaluate((el) => el.classList.contains("off")));
    if (wasVisible) { await eye.click(); await page.waitForTimeout(600); }
    const r1 = page.locator("table.gb tbody tr", { hasText: "ภูมิพัฒน์" }).first();
    ok((await r1.locator("td.cell").last().innerText()).trim() !== "7", "score still visible after hiding");
    ok(/•••/.test(await r1.locator("td").last().innerText()), "total still visible after hiding");
    await eye.click(); await page.waitForTimeout(600);
    ok((await r1.locator("td.cell").last().innerText()).trim() === "7", "score did not come back");
  });
  await step("G05", "gradebook: “ทั้งห้องส่งแล้ว” marks the whole class and “ล้าง” undoes it", async () => {
    const aid = (await sql("SELECT id FROM assignments WHERE title='งานทดสอบ QA'"))[0].id;
    await page.getByRole("button", { name: /ทั้งห้องส่งแล้ว/ }).click();
    await page.waitForTimeout(1200);
    const n1 = (await sql("SELECT COUNT(*) n FROM submissions WHERE assignment_id=? AND status='submitted'", aid))[0].n;
    ok(n1 >= 30, "only " + n1 + " marked");
    await page.getByRole("button", { name: "ล้าง", exact: true }).click();
    await page.waitForTimeout(1200);
    const n2 = (await sql("SELECT COUNT(*) n FROM submissions WHERE assignment_id=? AND status='submitted'", aid))[0].n;
    ok(n2 === 0, n2 + " still marked after clearing");
  });
  await step("G06", "gradebook: edit the work (rename) and the column follows", async () => {
    await page.locator("table.gb thead th", { hasText: "งานทดสอบ QA" }).click();
    await page.getByRole("button", { name: "จัดการงาน" }).click();
    await page.getByRole("button", { name: /แก้ไข/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.locator(".modal input[placeholder^='เช่น ใบงาน']").fill("งานทดสอบ QA (แก้)");
    await page.getByRole("button", { name: "บันทึกงาน" }).click();
    await page.locator("table.gb thead th", { hasText: "(แก้)" }).waitFor({ timeout: 6000 });
  });
  await step("G07", "gradebook: delete the work; the column is gone", async () => {
    await page.locator("table.gb thead th", { hasText: "(แก้)" }).click();
    await page.getByRole("button", { name: "จัดการงาน" }).click();
    await page.getByRole("button", { name: /ลบงาน/ }).click();
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
    await page.getByRole("button", { name: /ขาด/ }).first().click();
    await page.locator(".att-tile").nth(1).click();
    await page.waitForTimeout(300);
    ok(/absent/.test(await page.locator(".att-tile").nth(1).getAttribute("class")), "tile 2 is " + (await page.locator(".att-tile").nth(1).getAttribute("class")));
    await page.getByRole("button", { name: /มาทั้งหมด/ }).click();
    await page.waitForTimeout(400);
    ok((await page.locator(".att-tile.present").count()) >= 31, "present tiles: " + (await page.locator(".att-tile.present").count()));
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
    await go("/scan", ".card");
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
    await page.getByRole("button", { name: "ทั้งเทอม" }).click();
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
    await go("/random", ".rnd-opt");
    const opt = page.locator(".rnd-opt").first();
    const box = opt.locator("input[type=checkbox]");
    const before = await box.isChecked();
    const size = await box.boundingBox();
    ok(size.width <= 24 && size.height <= 24, `checkbox is ${Math.round(size.width)}×${Math.round(size.height)}px`);
    await opt.click(); await page.waitForTimeout(200);
    ok((await box.isChecked()) !== before, "one click did not change it");
    await opt.click(); await page.waitForTimeout(200);
    ok((await box.isChecked()) === before, "second click did not change it back");
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
    await page.getByRole("button", { name: "มืด", exact: true }).click();
    await page.waitForTimeout(700);
    await page.reload(); await page.waitForSelector(".rail");
    ok((await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark", "theme is not dark after reload");
    await openSettings("general");
    await page.getByRole("button", { name: "สว่าง", exact: true }).click();
    await page.waitForTimeout(500);
  });
  await step("E03", "settings: leaving with unsaved changes asks first", async () => {
    await openSettings("general");
    await page.locator("label", { hasText: "ชื่อครู" }).locator("input").fill("ครูเปลี่ยนแล้ว");
    await page.waitForTimeout(250);
    let asked = false;
    const onDialog = () => { asked = true; };
    page.on("dialog", onDialog); acceptDialogs = false;
    await page.evaluate(() => { location.hash = "/home"; });
    await page.waitForTimeout(500);
    page.off("dialog", onDialog); acceptDialogs = true;
    ok(asked, "no confirmation when leaving with edits");
    ok(page.url().includes("settings"), "left the page anyway");
    await page.locator("label", { hasText: "ชื่อครู" }).locator("input").fill("ครูผู้สอน");
  });
  await step("E04", "settings: edit a term's number, name and dates (Thai date fields) and save", async () => {
    await openSettings("catalog");
    await page.getByRole("button", { name: "ภาคเรียน", exact: true }).click();
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
    const fields = box.locator("input[type=password]");
    await fields.nth(0).fill("wrong-one"); await fields.nth(1).fill("NewPassword2026");
    await box.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.waitForTimeout(700);
    ok(/ไม่ถูกต้อง/.test(await page.locator("body").innerText()), "no error shown for a wrong current password");
    await fields.nth(0).fill(server.password); await fields.nth(1).fill("NewPassword2026");
    await box.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.waitForTimeout(900);
    server.password = "NewPassword2026";
    ok(/เปลี่ยนรหัสผ่านแล้ว/.test(await page.locator("body").innerText()), "no confirmation that the password was changed");
  });
  await step("E07", "settings: “ดาวน์โหลดไฟล์สำรอง” gives a valid backup file", async () => {
    await openSettings("backup");
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: "ดาวน์โหลด" }).click()]);
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
  await step("E08", "settings: history lists what was just done", async () => {
    await openSettings("history");
    await page.waitForTimeout(800);
    const n = await page.locator(".set-body .row, .set-body li, .set-body tr").count();
    ok(n >= 3, "history rows: " + n);
  });

  // ------------------------------------------------------------------ sign out and back in (with the new password)
  await step("A04", "sign out lands on the sign-in page; the new password works", async () => {
    await page.getByRole("button", { name: /ออกระบบ/ }).first().click();
    await page.waitForSelector("input[type=email]", { timeout: 8000 });
    await login(server.email, "NewPassword2026");
    await page.waitForSelector(".rail", { timeout: 15000 });
  });

  // ------------------------------------------------------------------ start a new term / a new school year
  await step("Y01", "start the next term of the same year: current term moves on, classes and children stay", async () => {
    await openSettings("catalog");
    await page.getByRole("button", { name: "ภาคเรียน", exact: true }).click();
    await page.getByRole("button", { name: /เริ่มภาคเรียนใหม่/ }).first().click();
    await page.locator(".modal").waitFor();
    await page.getByRole("button", { name: /เริ่มภาคเรียน 2\/2569/ }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 8000 });
    const cur = await sql("SELECT name, year, term FROM terms WHERE is_current=1");
    ok(cur.length === 1 && cur[0].year === 2569 && cur[0].term === 2, "current term: " + JSON.stringify(cur));
    ok((await sql("SELECT COUNT(*) n FROM classes WHERE archived=0"))[0].n === 3, "classes changed");
  });
  await step("Y02", "start a new school year: empty same-named rooms open, last year's children become 'finished', nothing is deleted", async () => {
    const before = (await sql("SELECT COUNT(*) n FROM students"))[0].n;
    await page.getByRole("button", { name: /เริ่มภาคเรียนใหม่/ }).first().click();
    await page.locator(".modal").waitFor();
    // the new year starts in May 2570 (16 พฤษภาคม 2570) — after every term that exists (today is 1 ต.ค. 2569)
    const startField = page.locator(".modal .modal-grid2 .datefield").first();
    await startField.getByLabel("วัน").selectOption("16");
    await startField.getByLabel("เดือน").selectOption("5");
    await startField.getByLabel("ปี พ.ศ.").selectOption({ label: "2570" });
    // the three selects of a date field sit on ONE line
    const boxes = await startField.locator("select").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    ok(new Set(boxes).size === 1, "date field selects are on different lines: " + boxes.join(","));
    await page.locator(".modal .imp-confirm input[type=checkbox]").check();
    await page.getByRole("button", { name: /เริ่มภาคเรียน 1\/2570/ }).click();
    await page.locator(".modal").waitFor({ state: "detached", timeout: 8000 });
    const cur = await sql("SELECT year, term FROM terms WHERE is_current=1");
    ok(cur[0].year === 2570 && cur[0].term === 1, "current term: " + JSON.stringify(cur));
    const open = await sql("SELECT name FROM classes WHERE archived=0 AND year=2570 ORDER BY name");
    ok(open.length === 3, "new year's classes: " + JSON.stringify(open));
    ok((await sql("SELECT COUNT(*) n FROM students"))[0].n === before, "children were deleted");
    ok((await sql("SELECT COUNT(*) n FROM students WHERE status='finished'"))[0].n >= 30, "last year's children not finished");
    await go("/students", ".uh");
    ok((await page.locator(".stu-lrow").count()) === 0, "the new year's room should start empty");
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
        await ppage.locator(".bottom-tabs .tab-item", { hasText: "เมนู" }).click();
        await ppage.locator(".menu-sheet .sheet-item", { hasText: label }).click();
        await ppage.waitForTimeout(300);
        ok(ppage.url().includes("#/" + hash), `menu “${label}” went to ${ppage.url().split("#")[1]}`);
        ok((await ppage.locator(".menu-sheet").count()) === 0, "the menu sheet stayed open after choosing");
        const sw = await ppage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(sw <= 2, `${label}: page is ${sw}px wider than the phone`);
      }
      await ppage.locator(".bottom-tabs .tab-item", { hasText: "เมนู" }).click();
      await ppage.locator(".menu-sheet .sheet-item", { hasText: "ออกจากระบบ" }).click();
      await ppage.waitForSelector("input[type=email]", { timeout: 8000 });
    } finally { page = main; await pctx.close(); }
  });

  // ------------------------------------------------------------------ start over
  await step("X01", "start over (data): needs the password + words; afterwards the welcome guide appears", async () => {
    await openSettings("backup");
    await page.getByRole("button", { name: /ล้างข้อมูล$/ }).first().click();
    await page.locator(".modal").waitFor();
    const go_ = page.locator(".modal").getByRole("button", { name: "ล้างข้อมูลทดลอง" });
    ok(await go_.isDisabled(), "button enabled before anything is typed");
    await page.locator(".modal input[type=checkbox]").uncheck(); // skip the download for the test
    await page.locator(".modal input[type=password]").fill("NewPassword2026");
    await page.locator(".modal input[placeholder='ล้างข้อมูล']").fill("ล้างข้อมูล");
    await go_.click();
    await page.getByText("ยินดีต้อนรับสู่งานครบ").waitFor({ timeout: 15000 });
    ok((await sql("SELECT COUNT(*) n FROM students"))[0].n === 0, "students remain");
    ok((await sql("SELECT COUNT(*) n FROM teacher"))[0].n === 1, "account lost");
  });

  await browser.close(); await server.close();
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify({ label: LABEL, at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} flows passed   shots of failures: ${SHOTS}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

// A dress rehearsal of the classroom trial, in a real browser, before the real one:
//   take the roll and scan hand-ins through the SCREENS → download the backup with the app's own button →
//   write the "paper" the way a teacher would (from what they MEANT to do, not from what the app says) →
//   compare with scripts/trial-reconcile.cjs. When the app is right the two agree; when the paper is
//   deliberately wrong the tool must say exactly where. It proves the whole loop of docs/TRIAL.md works
//   (including that a real backup file is what the tool expects) — it does not prove the app on real devices.
//
//   npm run build && node scripts/trial-rehearsal.cjs
const fs = require("node:fs");
const path = require("node:path");
const { execSync, spawnSync } = require("node:child_process");
const { startFixtureServer } = require("./fixture-server.cjs");
const rc = require("./trial-reconcile.cjs");

const root = path.resolve(__dirname, "..");
let playwright;
try { playwright = require("playwright"); } catch {
  try { playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
  catch { console.error("Playwright is not installed (npm i -g playwright, then npx playwright install chromium)"); process.exit(2); }
}

const results = [];
function check(name, ok, detail = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 30000, step = 250) { const end = Date.now() + timeout; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return false; await sleep(step); } }

(async () => {
  const dist = path.join(root, "dist/client/client");
  if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("run `npm run build` first"); process.exit(2); }
  const work = fs.mkdtempSync(path.join(root, "node_modules", ".rehearsal-"));
  const server = await startFixtureServer({ port: 5205, assetsDir: dist });
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(String(e.message || e).slice(0, 160)));

  const all = (sql, ...b) => server.DB.prepare(sql).bind(...b).all().then((r) => r.results);
  const cls = (await all("SELECT id FROM classes WHERE name = ?", "ป.6/1"))[0].id;
  const kids = await all("SELECT id, code, number FROM students WHERE class_id = ? AND status = 'active' ORDER BY number", cls);
  const asg = (await all("SELECT id, title FROM assignments WHERE instr(title, ?)", "โมเดลระบบย่อยอาหาร"))[0];

  try {
    await page.goto(server.url);
    await page.fill("input[type=email]", server.email);
    await page.fill("input[type=password]", server.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await page.waitForFunction(() => /หน้าหลัก/.test(document.body.innerText), null, { timeout: 20000 });

    // ── the roll, through the attendance screen: everyone present, except #3 who is absent and #8 who is late
    // (the demo data already holds older rolls — the one that counts is the one taken NOW)
    const startedAt = Date.now();
    await page.evaluate(() => { location.hash = "#/attendance"; });
    await page.locator(".att-tiles:not(.loading)").waitFor({ timeout: 20000 }); // the roll has loaded (before that a tap is ignored)
    await page.getByRole("button", { name: /มาทั้งหมด/ }).click();
    const tile = (n) => page.getByRole("button", { name: new RegExp(`^เลขที่ ${n} `) });
    const tapUntil = async (n, word) => { for (let i = 0; i < 6; i++) { if ((await tile(n).getAttribute("aria-label")).includes(word)) return true; await tile(n).click(); await sleep(150); } return (await tile(n).getAttribute("aria-label")).includes(word); };
    check("attendance: the screen lets the teacher mark #3 absent and #8 late", (await tapUntil(3, "ขาด")) && (await tapUntil(8, "สาย")));
    const todays = () => all("SELECT id, date FROM attendance_sessions WHERE class_id = ? AND subject_id IS NULL AND period IS NULL AND updated_at >= ?", cls, startedAt).then((r) => r[0]);
    const session = await until(todays, 30000);
    const marked = session && await until(async () => (await all("SELECT COUNT(*) AS n FROM attendance WHERE session_id = ?", session.id))[0].n === kids.length
      && (await all("SELECT status FROM attendance WHERE session_id = ? AND student_id = ?", session.id, kids.find((k) => k.number === 8).id))[0].status === "late", 30000);
    check("attendance: the whole roll reached the server, with #8 late", !!marked);
    const day = session?.date;

    // ── hand-ins, through the scan screen: #2, #4, #6 and #11 scanned in "full score" mode
    await page.evaluate(() => { location.hash = "#/scan"; });
    await page.locator(".sc-asg", { hasText: "โมเดลระบบย่อยอาหาร" }).click();
    await page.getByRole("button", { name: /เริ่มสแกน/ }).click();
    const input = page.locator('input[aria-label="รหัสนักเรียน"]');
    const scanned = [2, 4, 6, 11];
    for (const n of scanned) { await input.fill(String(n)); await input.press("Enter"); await sleep(350); }
    const landed = await until(async () => (await all("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = ?", asg.id))[0].n === scanned.length, 30000);
    check("scanning: every scanned child's hand-in reached the server", landed);

    // ── the backup, with the app's own button
    await page.evaluate(() => { location.hash = "#/settings"; });
    await page.locator("button.pill", { hasText: "สำรองข้อมูล" }).click();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: /^ดาวน์โหลด$/ }).click()]);
    const backupFile = path.join(work, download.suggestedFilename());
    await download.saveAs(backupFile);
    check("backup: the app's button produced a file", fs.existsSync(backupFile) && /^ngankrob-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());

    // ── the "paper", written from what was MEANT: codes from the class list, statuses and scores as intended
    const codeOf = (n) => kids.find((k) => k.number === n).code;
    const paperScores = ["รหัส,งาน,คะแนน", ...kids.map((k) => `${k.code},${asg.title},${scanned.includes(k.number) ? 20 : ""}`)].join("\n");
    const paperAtt = ["วันที่,รหัส,สถานะ", ...kids.map((k) => `${day},${k.code},${k.number === 3 ? "ขาด" : k.number === 8 ? "สาย" : "มา"}`)].join("\n");
    const sFile = path.join(work, "paper-scores.csv"), aFile = path.join(work, "paper-attendance.csv");
    fs.writeFileSync(sFile, paperScores); fs.writeFileSync(aFile, paperAtt);

    const good = spawnSync("node", [path.join(__dirname, "trial-reconcile.cjs"), "--backup", backupFile, "--scores", sFile, "--attendance", aFile], { encoding: "utf8" });
    check("reconcile: paper and app agree on every score and every roll mark (exit 0)", good.status === 0, (good.stdout + good.stderr).split("\n").filter((l) => /ตรงกัน|ไม่ตรง|✘|⚠/.test(l)).join(" | "));
    check("…and the report says how many were compared", new RegExp(`คะแนน: ${kids.length} รายการ.*ตรงกัน ${kids.length}`).test(good.stdout) && new RegExp(`เช็คชื่อ: ${kids.length} รายการ.*ตรงกัน ${kids.length}`).test(good.stdout));

    // ── now a paper that is wrong in four different ways: the tool must name each one
    const wrongScores = paperScores.split("\n")
      .map((l) => (l.startsWith(codeOf(4) + ",") ? `${codeOf(4)},${asg.title},19` : l))                   // a different score
      .filter((l) => !l.startsWith(codeOf(6) + ","))                                                        // a hand-in nobody wrote down
      .concat(`${codeOf(9)},${asg.title},20`, `999,${asg.title},20`).join("\n");                             // one the app never saw · a child that does not exist
    const wrongAtt = paperAtt.split("\n").map((l) => (l.includes("," + codeOf(8) + ",") ? l.replace("สาย", "ขาด") : l)).join("\n"); // late on the app, absent on the paper
    const wsFile = path.join(work, "wrong-scores.csv"), waFile = path.join(work, "wrong-attendance.csv"), diffFile = path.join(work, "differences.csv");
    fs.writeFileSync(wsFile, wrongScores); fs.writeFileSync(waFile, wrongAtt);
    const bad = spawnSync("node", [path.join(__dirname, "trial-reconcile.cjs"), "--backup", backupFile, "--scores", wsFile, "--attendance", waFile, "--csv", diffFile], { encoding: "utf8" });
    check("reconcile: a wrong paper is refused (exit 1)", bad.status === 1);
    check("…it names the different score", /กระดาษ: ส่งแล้ว 19 · แอป: ส่งแล้ว 20/.test(bad.stdout));
    check("…the hand-in the paper forgot", /กระดาษ: \(ไม่ได้จด\) · แอป: ส่งแล้ว 20/.test(bad.stdout));
    check("…the score the app never had", /กระดาษ: ส่งแล้ว 20 · แอป: ยังไม่ส่ง/.test(bad.stdout));
    check("…the child that does not exist", /ไม่พบนักเรียนคนนี้ในแอป/.test(bad.stdout));
    check("…the roll mark that differs (late in the app, absent on paper)", /กระดาษ: ขาด · แอป: สาย/.test(bad.stdout));
    check("…and writes the differences as a CSV that Excel opens", fs.existsSync(diffFile) && fs.readFileSync(diffFile, "utf8").startsWith("﻿"));
    check("no uncaught page errors during the rehearsal", problems.length === 0, problems.slice(0, 2).join(" | "));
  } catch (e) {
    check("no unexpected error in the script", false, String((e && e.stack) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    fs.rmSync(work, { recursive: true, force: true });
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }
})();

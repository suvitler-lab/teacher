// The camera path, in a real browser, with a REAL QR code as the camera's picture.
//
// Chromium can play a video file in place of a camera. This makes one (a Y4M of a student's actual QR), points Chromium's
// fake camera at it, and drives the scan page: the reader has to find the code in real video frames, through the same
// Content-Security-Policy the deployed site sends, and the score has to land. It also checks what a teacher sees when the
// camera is missing or refused. It does NOT replace trying a real phone/iPad — lighting, focus and Safari's own
// BarcodeDetector/permissions behaviour only exist on the device — but everything short of that is proven here.
//
//   npm run build && node scripts/camera-e2e.cjs
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const QRCode = require("qrcode");
const { startFixtureServer } = require("./fixture-server.cjs");

const root = path.resolve(__dirname, "..");
let playwright;
try { playwright = require("playwright"); } catch {
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
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return false; await sleep(step); }
}

/**
 * A Y4M video (raw I420 frames) whose every frame shows `text` as a QR code, dark on a light background, centred.
 * `size` scales the code within the 640×480 picture (modules per pixel). Ten frames; Chromium loops it.
 */
function qrVideo(file, text, { pixelsPerModule = 10, tilt = false } = {}) {
  const W = 640, H = 480;
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, quiet = 4, full = n + quiet * 2, px = pixelsPerModule;
  const left = Math.floor((W - full * px) / 2), top = Math.floor((H - full * px) / 2);
  const y = Buffer.alloc(W * H, 235); // white-ish, like a lit sheet of paper
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.modules.get(r, c)) continue;
    for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
      const yy = top + (r + quiet) * px + dy, xx = left + (c + quiet) * px + dx + (tilt ? Math.floor((r * px + dy) / 40) : 0);
      if (yy >= 0 && yy < H && xx >= 0 && xx < W) y[yy * W + xx] = 20;
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma, chroma]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]));
}

(async () => {
  const dist = path.join(root, "dist/client/client");
  if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("run `npm run build` first"); process.exit(2); }
  const work = fs.mkdtempSync(path.join(root, "node_modules", ".camera-e2e-"));
  const server = await startFixtureServer({ port: 5203, assetsDir: dist, ...(process.env.E2E_HEADERS ? { headersFile: process.env.E2E_HEADERS } : {}) });
  const one = (sql, ...b) => server.DB.prepare(sql).bind(...b).first();
  const asg = (await one("SELECT id FROM assignments WHERE instr(title, ?)", "โมเดลระบบย่อยอาหาร")).id;
  const student = (n) => one("SELECT s.id, s.qr_token, s.first_name FROM students s WHERE s.number = ? AND s.class_id = (SELECT id FROM classes WHERE name = ?)", n, "ป.6/1");
  const rowsFor = async (sid) => (await server.DB.prepare("SELECT status, score FROM submissions WHERE assignment_id = ? AND student_id = ?").bind(asg, sid).all()).results;
  const auditFor = async (sid) => (await one("SELECT COUNT(*) AS n FROM audit_logs WHERE assignment_id = ? AND student_id = ?", asg, sid)).n;

  const open = async (browser, { granted, hideNativeReader }) => {
    const context = await browser.newContext({ viewport: { width: 420, height: 900 }, permissions: granted ? ["camera"] : [] });
    if (hideNativeReader) await context.addInitScript(() => { delete window.BarcodeDetector; }); // force the WASM reader iPads depend on
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e.message || e).slice(0, 160)));
    page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push("CSP: " + m.text().slice(0, 200)); });
    await page.goto(server.url);
    await page.fill("input[type=email]", server.email);
    await page.fill("input[type=password]", server.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await page.waitForFunction(() => /หน้าหลัก/.test(document.body.innerText), null, { timeout: 20000 });
    await page.evaluate(() => { location.hash = "#/scan"; });
    await page.locator(".sc-asg", { hasText: "โมเดลระบบย่อยอาหาร" }).click();
    await page.getByRole("button", { name: /เริ่มสแกน/ }).click();
    await page.locator('input[aria-label="รหัสนักเรียน"]').waitFor();
    return { context, page, problems };
  };
  const cameraOn = (page) => page.getByRole("button", { name: "สแกนด้วยกล้อง" }).click();

  const launch = (video) => playwright.chromium.launch({
    args: video ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${video}`] : [],
  });

  try {
    // 1 ─ a valid QR in front of the camera, native reader removed → the WASM reader, under the production CSP
    const s12 = await student(12);
    const good = path.join(work, "good.y4m");
    qrVideo(good, s12.qr_token);
    let browser = await launch(good);
    let { context, page, problems } = await open(browser, { granted: true, hideNativeReader: true });
    await cameraOn(page);
    const landed = await until(async () => (await rowsFor(s12.id)).length === 1, 40000);
    check("camera: the QR in the picture is read and the score lands", landed, landed ? JSON.stringify(await rowsFor(s12.id)) : "nothing arrived in 40 s");
    check("…as a full-score hand-in (the round's mode)", (await rowsFor(s12.id))[0]?.status === "submitted" && (await rowsFor(s12.id))[0]?.score === 20);
    check("…through the WASM reader (its file was fetched) — the CSP let it compile", server.hits.includes("/zxing/zxing_reader.wasm"));
    await sleep(7000); // the same code stays in front of the camera for a while, like a child holding the card up
    check("holding the card up does not record it again", (await rowsFor(s12.id)).length === 1 && (await auditFor(s12.id)) === 1, `rows=${(await rowsFor(s12.id)).length}, audit=${await auditFor(s12.id)}`);
    check("the screen said what happened", /ส่งแล้ว|ไม่บันทึกซ้ำ|20\/20/.test(await page.locator("body").innerText()));
    // the Settings "test the camera" walk-through, on this same device
    await page.evaluate(() => { location.hash = "#/settings?section=scan"; });
    await page.getByRole("button", { name: /เริ่มทดสอบกล้อง/ }).click();
    const walked = await until(async () => /ผ่านทุกขั้น|มีขั้นที่ไม่ผ่าน/.test(await page.locator("body").innerText()), 20000);
    const walkText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    check("Settings ▸ test the camera: every step passes", walked && /ผ่านทุกขั้น/.test(walkText), /ผ่านทุกขั้น/.test(walkText) ? "" : walkText.slice(walkText.indexOf("ทดสอบกล้อง"), walkText.indexOf("ทดสอบกล้อง") + 700));
    check("…and it says the device's own reader is absent as information (the WASM reader is used)", /ซึ่งเป็นเรื่องปกติ/.test(walkText));
    check("no security-policy violation and no uncaught error during all of it", problems.length === 0, problems.slice(0, 2).join(" | "));
    await context.close(); await browser.close();

    // 2 ─ a code that is not in the class: nothing is recorded, and the teacher is told
    const stranger = path.join(work, "stranger.y4m");
    qrVideo(stranger, "Q-NOTAREALTOKEN");
    const before = (await one("SELECT COUNT(*) AS n FROM submissions")).n;
    browser = await launch(stranger);
    ({ context, page, problems } = await open(browser, { granted: true, hideNativeReader: true }));
    await cameraOn(page);
    check("an unknown QR is refused on screen", await until(async () => /ไม่พบรหัส/.test(await page.locator("body").innerText()), 40000));
    check("…and nothing is recorded", (await one("SELECT COUNT(*) AS n FROM submissions")).n === before);
    await context.close(); await browser.close();

    // 3 ─ a smaller, slightly skewed code (a card held at arm's length, a bit crooked)
    const s20 = await student(20);
    const small = path.join(work, "small.y4m");
    qrVideo(small, s20.qr_token, { pixelsPerModule: 6, tilt: true });
    browser = await launch(small);
    ({ context, page, problems } = await open(browser, { granted: true, hideNativeReader: true }));
    await cameraOn(page);
    check("a small, skewed code still reads", await until(async () => (await rowsFor(s20.id)).length === 1, 40000));
    await context.close(); await browser.close();

    // 4 ─ what the teacher sees when the camera is refused, and when there is none
    browser = await playwright.chromium.launch({ args: ["--use-fake-device-for-media-stream"] });
    ({ context, page } = await open(browser, { granted: false, hideNativeReader: true }));
    // a browser whose user pressed "Block" (or an iPad with camera access off): the call is rejected with NotAllowedError
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")); });
    await cameraOn(page);
    const refused = await until(async () => /อนุญาต|ไม่ได้รับอนุญาต/.test(await page.locator('[role="alert"]').allInnerTexts().then((a) => a.join(" ")).catch(() => "")), 15000);
    check("camera refused: the screen says permission is missing and what to do", refused);
    await context.close(); await browser.close();

    browser = await playwright.chromium.launch({ args: [] }); // no camera at all
    ({ context, page } = await open(browser, { granted: true, hideNativeReader: true }));
    await cameraOn(page);
    check("no camera: the screen says so instead of silently doing nothing", await until(async () => /ไม่พบกล้อง|ไม่พบ/.test(await page.locator('[role="alert"]').allInnerTexts().then((a) => a.join(" ")).catch(() => "")), 15000));
    check("…and typing a class number still works as the fallback", await (async () => {
      const s5 = await student(5);
      const input = page.locator('input[aria-label="รหัสนักเรียน"]');
      await input.fill("5"); await input.press("Enter");
      return until(async () => (await rowsFor(s5.id)).length === 1, 20000);
    })());
    await context.close(); await browser.close();

    // 5 ─ a keyboard-wedge scanner on a Thai-layout computer: the browser reports Thai letters, the key CODES are Latin
    browser = await playwright.chromium.launch();
    ({ context, page } = await open(browser, { granted: false, hideNativeReader: false }));
    const s7 = await student(7);
    // what a scanner "types" for the token, as a Thai-layout OS would deliver it: key = a Thai letter, code = the physical key
    const THAI = { a: "ฟ", b: "ิ", c: "แ", d: "ก", e: "ำ", f: "ด", g: "เ", h: "้", i: "ร", j: "่", k: "า", l: "ส", m: "ท", n: "ื", o: "น", p: "ย", q: "ๆ", r: "พ", s: "ห", t: "ะ", u: "ี", v: "อ", w: "ไ", x: "ป", y: "ั", z: "ผ" };
    await page.evaluate(async ({ token, THAI }) => {
      const burst = async (keys) => {
        for (const k of keys) {
          document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: k.key, code: k.code, bubbles: true, cancelable: true }));
          await new Promise((r) => setTimeout(r, 8)); // a scanner's ~10 ms between keys
        }
      };
      const keys = [...token].map((ch) => {
        if (ch === "-") return { key: "ข", code: "Minus" };
        if (/[0-9]/.test(ch)) return { key: ch, code: "Digit" + ch };
        const low = ch.toLowerCase();
        return { key: THAI[low] ?? ch, code: "Key" + ch.toUpperCase(), shift: ch === ch.toUpperCase() };
      });
      keys.push({ key: "Enter", code: "Enter" });
      document.body.focus();
      await burst(keys);
    }, { token: s7.qr_token, THAI });
    check("a keyboard scanner on a Thai layout: the code is understood and the score lands", await until(async () => (await rowsFor(s7.id)).length === 1, 15000));
    await context.close(); await browser.close();
  } catch (e) {
    check("no unexpected error in the script", false, String((e && e.stack) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await server.close().catch(() => {});
    fs.rmSync(work, { recursive: true, force: true });
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }
})();

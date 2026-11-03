// ประกอบ design/preview-round2.html จาก preview.html (รอบ 1) + ชิ้นส่วนรอบ 2
// ใช้: node build.cjs   (รันจากโฟลเดอร์ round2-wip)
const fs = require("fs"), path = require("path");
const W = __dirname, D = path.join(W, "..");
const rd = (f) => fs.readFileSync(f, "utf8");
const p1 = rd(path.join(D, "preview.html"));
const lines = p1.split("\n");

// --- ส่วนประกอบของรอบ 1 ---
const iStyleA = lines.findIndex((l) => l.startsWith("<style>"));
const iStyleB = lines.findIndex((l) => l.startsWith("</style>"));
const css1 = lines.slice(iStyleA + 1, iStyleB).join("\n");
const iScriptA = lines.findIndex((l) => l.startsWith("<script>"));
const iScriptB = lines.findIndex((l, i) => i > iScriptA && l.startsWith("</script>"));
let js1 = lines.slice(iScriptA + 1, iScriptB).join("\n");
const bodyHtml = lines.slice(iStyleB + 1, iScriptA).join("\n").replace(/<\/?body>|<\/?head>|<script>/g, "").trim();

// --- ไอคอน: รวม 3 แหล่ง ---
const ev = (s) => { const f = new Function(s.replace(/^const ICONS=/, "return ") + ""); return f(); };
const icons1 = ev(js1.match(/^const ICONS=.*$/m)[0].replace(/;\s*$/, ""));
const icons2 = ev(rd(path.join(W, "icons2.js")).trim().replace(/;\s*$/, ""));
const icons0 = ev(rd(path.join(W, "icons.js")).trim().replace(/;\s*$/, ""));
const ICONS = Object.assign({}, icons0, icons1, icons2);
const iconsJs = "const ICONS=" + JSON.stringify(ICONS) + ";";

// --- แปลงสคริปต์รอบ 1 เป็น IIFE `H` ---
const cut = (s, a, b, rep) => { const i = s.indexOf(a); if (i < 0) throw new Error("marker missing: " + a); const j = b ? s.indexOf(b, i + a.length) : s.length; if (j < 0) throw new Error("marker missing: " + b); return s.slice(0, i) + rep + s.slice(b ? j : s.length); };
js1 = js1.replace(/^const ICONS=.*$/m, "");
js1 = js1.replace(/^const ic=.*$/m, "");
// ตัด render + ctl ของรอบ 1 แล้วให้ render เรียกตัวรวม
js1 = cut(js1, "/* ===== render ===== */", "function toast(t)", "function render(){window.R2render()}\n");
// click handler -> act(e,t)
js1 = cut(js1, "document.addEventListener('click',e=>{", "const t=e.target.closest('[data-a]');if(!t)return;e.preventDefault();const a=t.dataset.a,k=t.dataset.k;", "function act(e,t){const a=t.dataset.a,k=t.dataset.k;");
js1 = js1.replace(/const t=e\.target\.closest\('\[data-a\]'\);if\(!t\)return;e\.preventDefault\(\);const a=t\.dataset\.a,k=t\.dataset\.k;/, "");
js1 = js1.replace("});\nfunction save()", "}\nfunction save()");
// nav -> R2nav
js1 = js1.replace(/  if\(a==='nav'\)\{.*\n/, "  if(a==='nav'){window.R2nav(k);return}\n");
// logout/term -> toast ของรอบ 1 ใช้ได้เอง; ตัด listeners ท้ายไฟล์
js1 = cut(js1, "document.addEventListener('keydown'", null, "");
js1 += "\nreturn {S,homeHtml,prefsHtml,listHtml,act,DEFAULT_PREFS};\n";
if (!/function act\(e,t\)/.test(js1)) throw new Error("act not created");
const H = "const H=(function(){\n" + js1 + "\n})();\n";

// --- สคริปต์รอบ 2 ---
const r = (f) => rd(path.join(W, f));
let j1 = r("r2-js-1.js").replace("__ICONS__", "");
let j2 = r("r2-js-2.js"), j3 = r("r2-js-3.js"), j4 = r("r2-js-4.js"), j5 = r("r2-js-5.js");
j3 = j3.replace('class="pbar"', 'class="pbar2"').replace('class="stack"', 'class="stack2"');
let css2 = r("r2-css.css");
css2 = css2.replace(/^\.stack\{/m, ".stack2{").replace(/\.stack>i/, ".stack2>i").replace(/^\.pbar\{(.*?)\}\.pbar>div/m, ".pbar2{$1}.pbar2>div");
css2 += "\n.phone .startbar,.phone .savebar{bottom:64px}\n";

const hash = "";
const out = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ui-redesign รอบ 2 — สแกน · เช็คชื่อ · สุ่มชื่อ (mockup กดได้จริง · ชื่อสมมติ)</title>
<!--
  ไฟล์เดียว เปิดจากดิสก์ได้ ไม่โหลดอะไรจากอินเทอร์เน็ต · ข้อมูลและชื่อนักเรียนสมมติทั้งหมด
  รวมหน้าหลัก (รอบ 1) + สแกน + เช็คชื่อ + สุ่มชื่อ + โหมดฉายจอ · สลับหน้าด้วยแถบควบคุมด้านบน เมนูในกรอบ หรือ hash (#scan/type #attendance/tap #random/pick)
  ประกอบโดย design/round2-wip/build.cjs  (อย่าแก้ไฟล์นี้ตรง ๆ — แก้ชิ้นส่วนแล้วรันใหม่)
-->
<style>
${css1}
${css2}
</style>
</head>
<body>
${bodyHtml}
<script>
${iconsJs}
${j1.replace(/^const ic=.*$/m, (m) => m)}
${H}
${j2}
${j3}
${j4}
${j5}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(D, "preview-round2.html"), out);
console.log("wrote preview-round2.html", out.length, "bytes; icons", Object.keys(ICONS).length);

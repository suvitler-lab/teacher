// สร้างไฟล์สำหรับเผยแพร่เป็น Artifact จาก design/preview-round2.html
// ใช้: node make-artifact.cjs <ไฟล์ปลายทาง>
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "preview-round2.html"), "utf8");
const out = process.argv[2];
if (!out) throw new Error("usage: node make-artifact.cjs <out.html>");
let s = src;
s = s.replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/i, "");
s = s.replace(/<title>[\s\S]*?<\/title>/, '<title>mockup หน้าหลักใหม่</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
s = s.replace("</head>\n<body>", "").replace(/<\/body>\s*<\/html>\s*$/, "");
const stage = `:root{--stage:#d9dde4;--stage-fg:#1a1f29;--note-bg:#fff7d6;--note-fg:#5a4200}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--stage:#0f1216;--stage-fg:#eef1f6;--note-bg:#3a2a08;--note-fg:#f0c674;color-scheme:dark}}
:root[data-theme="dark"]{--stage:#0f1216;--stage-fg:#eef1f6;--note-bg:#3a2a08;--note-fg:#f0c674;color-scheme:dark}
`;
s = s.replace("<style>\n", "<style>\n" + stage);
s = s.replace(/body\{margin:0;([^}]*?)background:#d9dde4;color:#1a1f29;line-height:1\.6\}/,
  "body{margin:0;$1background:var(--stage);color:var(--stage-fg);line-height:1.6;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}");
s = s.replace(/\.note\{([^}]*?)background:#fff7d6;color:#5a4200;/, ".note{$1background:var(--note-bg);color:var(--note-fg);");
s = s.replace(".ctl{position:sticky;top:0;", ".ctl{position:sticky;top:env(safe-area-inset-top,0px);");
if (!/var\(--stage\)/.test(s) || !/var\(--note-bg\)/.test(s)) throw new Error("token replace failed");
fs.writeFileSync(out, s);
console.log("wrote", out, s.length);

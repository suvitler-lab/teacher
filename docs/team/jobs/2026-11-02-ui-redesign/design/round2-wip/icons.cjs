const fs = require('fs');
const names = process.argv.slice(2);
const dir = '/home/user/teacher/node_modules/@tabler/icons/icons/outline/';
const out = {}; const missing = [];
for (const n of names) {
  const p = dir + n + '.svg';
  if (!fs.existsSync(p)) { missing.push(n); continue; }
  const s = fs.readFileSync(p, 'utf8');
  const body = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '').trim();
  out[n] = body;
}
if (missing.length) { console.error('MISSING:', missing.join(' ')); process.exit(1); }
console.log('const ICONS=' + JSON.stringify(out) + ';');

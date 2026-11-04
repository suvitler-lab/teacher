// Playwright audit of the mockup: devices × themes × pages × fonts. Writes a markdown table + screenshots (for my own review).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file:///home/user/teacher/docs/team/jobs/2026-11-02-ui-redesign/design/preview.html';
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const DEVS = ['ipadP', 'ipadL', 'desk', 'phone'];
const PAGES = ['home', 'prefs', 'list', 'sheet'];
const SCENS = (process.env.SCENS || 'normal,offline,morning,empty,termend').split(',');
const FONTS = (process.env.FONTS || '0,24').split(',').map(Number);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1300 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(FILE);
  const rows = [];
  for (const dev of DEVS) for (const theme of ['light', 'dark']) for (const font of FONTS) for (const scen of SCENS) for (const pg of PAGES) {
    if (pg === 'sheet' && dev !== 'phone') continue;
    if (pg !== 'home' && scen !== 'normal' && scen !== 'offline') continue;
    const r = await page.evaluate(({ dev, theme, font, scen, pg }) => {
      S.dev = dev; S.theme = theme; S.font = font; S.scen = scen; S.page = pg; S.toast = ''; render();
      const fr = document.getElementById('frame');
      const d = F();
      const main = fr.querySelector('#main');
      const rail = fr.querySelector('.rail');
      const probs = [];
      // horizontal overflow
      if (main.scrollWidth > main.clientWidth + 1) probs.push(`main h-scroll ${main.scrollWidth}>${main.clientWidth}`);
      if (fr.scrollWidth > fr.clientWidth + 1) probs.push(`frame h-scroll ${fr.scrollWidth}>${fr.clientWidth}`);
      // rail overflow
      let railNote = '';
      if (rail) { const sp = rail.querySelector('.rail-spacer'); railNote = `${rail.scrollHeight}/${rail.clientHeight}${fr.classList.contains('hide-gl') ? ' (ซ่อนหัวกลุ่ม)' : ''}`; if (rail.scrollHeight > rail.clientHeight + 1 && sp.offsetHeight === 0) probs.push(`rail เลื่อนได้ ${railNote}`); }
      // hit targets on touch (visible interactive)
      const sc = parseFloat(getComputedStyle(fr).transform === 'none' ? 1 : fr.style.transform.replace(/[^0-9.]/g, '')) || 1;
      const small = [];
      fr.querySelectorAll('button, a, [role=button], [role=switch]').forEach((el) => {
        const b = el.getBoundingClientRect(); if (b.width === 0 || b.height === 0) return;
        const w = b.width / sc, h = b.height / sc;
        if (d.touch && (h < 43.5 || w < 43.5)) small.push(`${(el.className || '').toString().split(' ')[0] || el.tagName}:${el.textContent.trim().slice(0, 12)} ${Math.round(w)}x${Math.round(h)}`);
      });
      // font sizes
      const tiny = new Set();
      fr.querySelectorAll('*').forEach((el) => {
        if (!el.textContent.trim() || el.children.length && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
        const fs = parseFloat(getComputedStyle(el).fontSize); if (fs > 0 && fs < 12.9) tiny.add(`${el.className || el.tagName}:${Math.round(fs)}`);
      });
      // text clipped in rail / tabs
      const clipped = [];
      fr.querySelectorAll('.rail-item span, .tab, .rail-gl').forEach((el) => { if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim()); });
      const cols = main.querySelector('.cols'); const colsN = cols ? getComputedStyle(cols).gridTemplateColumns.split(' ').length : 0;
      const h1 = fr.querySelectorAll('h1').length;
      return { u: d.u, probs, small, tiny: [...tiny], clipped, railNote, colsN, h1, mainH: main.scrollHeight };
    }, { dev, theme, font, scen, pg });
    rows.push({ dev, theme, font, scen, pg, ...r });
    if (scen === 'normal' || (scen === 'offline' && pg === 'home') || (scen !== 'normal' && pg === 'home' && theme === 'light' && font === 0)) {
      const fr = await page.$('#frame');
      await fr.screenshot({ path: path.join(OUT, `${dev}-${theme}-f${font}-${scen}-${pg}.png`) });
    }
  }
  const md = ['| อุปกรณ์ | ธีม | ตัวอักษร | สถานการณ์ | หน้า | คอลัมน์ | rail สูง/พื้นที่ | ปัญหา |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const issues = [...r.probs, ...r.small.map((s) => 'เล็ก<44: ' + s), ...r.tiny.map((s) => 'อักษร<13: ' + s), ...r.clipped.map((s) => 'ตัดคำ: ' + s), ...(r.h1 !== 1 ? [`h1=${r.h1}`] : [])];
    md.push(`| ${r.dev} | ${r.theme} | ${r.u} | ${r.scen} | ${r.pg} | ${r.colsN} | ${r.railNote || '—'} | ${issues.length ? issues.join('; ') : 'ผ่าน'} |`);
  }
  fs.writeFileSync(path.join(__dirname, 'audit.md'), md.join('\n'));
  const bad = rows.filter((r) => r.probs.length || r.small.length || r.tiny.length || r.clipped.length || r.h1 !== 1);
  console.log(`rows=${rows.length} failing=${bad.length} errors=${errors.length}`);
  for (const r of bad) console.log(r.dev, r.theme, r.u, r.scen, r.pg, JSON.stringify({ probs: r.probs, small: r.small, tiny: r.tiny, clipped: r.clipped, h1: r.h1 }));
  if (errors.length) console.log('ERRORS', errors);
  await browser.close();
})();

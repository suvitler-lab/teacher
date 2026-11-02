// Measures the gradebook header on the fictional fixture at every target device (headless Chrome/Edge via CDP, no dependencies).
//   node measure.mjs --assets <dist/client/client> --out <json> [--port 4121]
// Fixture data only. Reuses the setups of ../pages.json so the page state matches the screenshots.
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { findBrowser } from "file:///C:/Users/User/.claude/skills/dev-team/scripts/shots.mjs";

const require = createRequire("C:/Users/User/Desktop/teacher/scripts/x.cjs");
const { startFixtureServer } = require("C:/Users/User/Desktop/teacher/scripts/fixture-server.cjs");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const spec = JSON.parse(fs.readFileSync(path.join(here, "..", "pages.json"), "utf8"));
const PAGES = ["gradebook-1", "gradebook-2", "gradebook-2-type", "gradebook-6", "gradebook-6-type", "gradebook-14", "gradebook-14-type"];
const DEVICES = [["iPad ตั้ง", 820, 1180, 2, true], ["iPad นอน", 1180, 820, 2, true], ["คอม", 1536, 729, 2, false], ["มือถือ", 390, 844, 3, true]];

const MEASURE = `(()=>{
const sc=document.querySelector('.gb-scroll'); const tb=sc&&sc.querySelector('table'); if(!tb) return {table:false};
const rgb=s=>{const m=s.match(/[\\d.]+/g).map(Number);return {r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1}};
const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
const bgOf=el=>{let layers=[];for(let e=el;e;e=e.parentElement){const c=rgb(getComputedStyle(e).backgroundColor);if(c.a>0){layers.push(c);if(c.a>=1)break}}let base={r:255,g:255,b:255};for(const c of layers.reverse()){base={r:base.r*(1-c.a)+c.r*c.a,g:base.g*(1-c.a)+c.g*c.a,b:base.b*(1-c.a)+c.b*c.a}}return base};
const ratio=(el)=>{const f=rgb(getComputedStyle(el).color),b=bgOf(el);const L1=lum(f),L2=lum(b);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)};
const th=[...tb.querySelectorAll('thead th.col-w')]; const gh=[...tb.querySelectorAll('thead tr.gh th.gh-cell')];
const texts=[...tb.querySelectorAll('thead th.col-w .ht, thead th.col-w .hs > span, thead tr.gh .gh-label, thead tr.gh .gh-cnt, thead .tot-col, thead .name-col')].filter(e=>e.offsetParent!==null&&e.getClientRects().length);
const fs=texts.map(e=>parseFloat(getComputedStyle(e).fontSize));
const cr=texts.map(e=>({t:(e.textContent||'').trim().slice(0,18),c:ratio(e)}));
const worst=cr.reduce((a,b)=>b.c<a.c?b:a,{c:99});
const sr=sc.getBoundingClientRect(); const thead=tb.querySelector('thead').getBoundingClientRect();
const rows=[...tb.querySelectorAll('tbody tr:not(.avg)')];
const full=rows.filter(r=>{const b=r.getBoundingClientRect();return b.top>=thead.bottom-1&&b.bottom<=sr.bottom+0.5}).length;
const clamped=th.filter(t=>{const h=t.querySelector('.ht');return h&&h.scrollHeight>h.clientHeight+1}).length;
const hsOver=th.filter(t=>{const s=t.querySelector('.hs > span');return s&&s.scrollWidth>s.clientWidth+1}).length;
const ghOver=[...tb.querySelectorAll('thead tr.gh .gh-label')].filter(l=>l.offsetParent&&(l.scrollWidth>l.clientWidth+1||l.scrollHeight>l.clientHeight+1)).length;
const eye=[...tb.querySelectorAll('thead .hs-eye')].filter(e=>e.offsetParent!==null).map(e=>{const b=e.getBoundingClientRect();return Math.min(b.width,b.height)});
const ghb=[...tb.querySelectorAll('thead .gh-btn')].map(e=>e.getBoundingClientRect().height);
const heights=th.map(t=>t.getBoundingClientRect().height);
const ghH=gh.length?gh[0].getBoundingClientRect().height:0;
const colTh=th[0]; const cs=colTh?getComputedStyle(colTh):null;
sc.scrollLeft=(sc.scrollWidth-sc.clientWidth)/2; const nm=tb.querySelector('tbody td.name-col'),tt=tb.querySelector('tbody td.tot-col'); const nb=nm.getBoundingClientRect(),tbb=tt?tt.getBoundingClientRect():null;
const sticky={name:Math.abs(nb.left-sr.left)<=1.5,total:tbb?Math.abs(tbb.right-(sr.right-(sc.offsetWidth-sc.clientWidth)))<=2.5:null,scrolled:sc.scrollLeft>0};
sc.scrollLeft=0;
const legend=document.querySelector('.gb-tlegend');
return {table:true,theadH:+thead.height.toFixed(1),colHmax:+Math.max(0,...heights).toFixed(1),colHmin:+Math.min(...heights).toFixed(1),ghH:+ghH.toFixed(1),cols:th.length,rowsFullyVisible:full,rowH:+rows[0].getBoundingClientRect().height.toFixed(1),
 clampedTitles:clamped,hsOverflow:hsOver,ghOverflow:ghOver,minFontPx:Math.min(...fs),worstContrast:{t:worst.t,c:+worst.c.toFixed(2)},eyeMin:eye.length?Math.min(...eye):null,ghBtnMinH:ghb.length?Math.min(...ghb):null,
 pageScrollX:document.documentElement.scrollWidth>innerWidth,sticky,legend:legend?{h:+legend.getBoundingClientRect().height.toFixed(1),n:legend.children.length}:null,scrollH:+sr.height.toFixed(1)};})()`;

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  return { send, ev, close: () => ws.close() };
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
async function until(fn, ms = 15000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return false; await sleep(150); } }

const srv = await startFixtureServer({ port: Number(arg("--port", "4121")), assetsDir: path.resolve(arg("--assets")), layout: true });
const port = await freePort();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gbm-"));
const proc = spawn(findBrowser(), ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "--force-color-profile=srgb", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const result = {};
try {
  const target = await until(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page") || false; } catch { return false; } }, 20000);
  const p = await connect(target.webSocketDebuggerUrl);
  await p.send("Page.enable"); await p.send("Runtime.enable");
  let first = true;
  for (const [name, w, h, dpr, touch] of DEVICES) {
    await p.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: touch, screenWidth: w, screenHeight: h });
    await p.send("Emulation.setTouchEmulationEnabled", touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    for (const pg of spec.pages.filter((x) => PAGES.includes(x.name))) {
      await p.send("Page.navigate", { url: new URL(pg.path, srv.url + "/").href });
      await until(async () => (await p.ev("document.readyState")) === "complete");
      if (first) { await p.ev(spec.beforeAll); first = false; await sleep(300); }
      await p.ev(pg.setup);
      await until(() => p.ev(pg.ready));
      await sleep(900);
      result[`${pg.name}|${w}x${h}`] = await p.ev(MEASURE);
      console.log(pg.name, w + "x" + h, JSON.stringify(result[`${pg.name}|${w}x${h}`]));
    }
  }
  p.close();
} finally {
  proc.kill(); await srv.close(); await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
fs.writeFileSync(arg("--out"), JSON.stringify(result, null, 2));
process.exit(0);

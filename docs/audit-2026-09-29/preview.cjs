// Optional disposable UI audit server. Uses built assets and an in-memory D1 with fictional seed data.
// Run after npm run build. This never opens the live/local application's database or .dev.vars.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), Module = require('node:module');
const ts = require('typescript');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = path.resolve(__dirname, '../..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@shared/') ? path.join(root, 'shared', name.slice(8) + '.ts') : name, ...args); };
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { fileName: f, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
async function main() {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("audit"); } }', compatibilityDate: '2025-09-01', d1Databases: ['DB'], d1Persist: false, cf: false }));
  const DB = await mf.getD1Database('DB');
  const env = { DB, SETUP_CODE: 'audit-only', SESSION_PEPPER: 'disposable-fixture' };
  for (const file of [...fs.readdirSync(path.join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort().map(f => path.join(root, 'migrations', f)), path.join(root, 'scripts/seed-demo.sql')]) {
    const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
    await DB.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => DB.prepare(s)));
  }
  await DB.prepare("UPDATE settings SET value='ข้อมูลสมมติสำหรับตรวจระบบ' WHERE key='school_name'").run();
  const { app } = require(path.join(root, 'worker/app.ts'));
  const setup = await app.request('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setupCode: 'audit-only', password: 'AuditFixture2026', deviceId: 'audit', deviceName: 'Audit fixture' }) }, env);
  if (setup.status !== 200) throw new Error('Fixture setup failed: ' + setup.status);
  const assets = path.join(root, 'dist/client/client');
  const headers = {};
  for (const line of fs.readFileSync(path.join(root, 'public/_headers'), 'utf8').split(/\r?\n/)) {
    const match = /^\s+([^:]+):\s*(.+)$/.exec(line);
    if (match) headers[match[1]] = match[2];
  }
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost:5194');
      if (url.pathname.startsWith('/api/')) {
        const parts = []; for await (const part of req) parts.push(part);
        const result = await app.request(url.href, { method: req.method, headers: req.headers, ...(parts.length ? { body: Buffer.concat(parts) } : {}) }, env);
        res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer())); return;
      }
      if (url.pathname === '/audit-wasm.html') {
        res.writeHead(200, { ...headers, 'Content-Type': mime['.html'] });
        res.end('<!doctype html><meta charset="utf-8"><h1>WASM test with project CSP</h1><p id="result">Testing...</p><script src="/audit-wasm.js"></script>'); return;
      }
      if (url.pathname === '/audit-wasm.js') {
        res.writeHead(200, { ...headers, 'Content-Type': mime['.js'] });
        res.end('WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])).then(()=>{document.getElementById("result").textContent="PASS"}).catch(e=>{document.getElementById("result").textContent=e.name+": "+e.message});'); return;
      }
      let file = path.resolve(assets, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(assets + path.sep) && file !== assets) { res.writeHead(400); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(assets, 'index.html');
      res.writeHead(200, { ...headers, 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
    } catch (e) { console.error(e); res.writeHead(500); res.end('Audit fixture error'); }
  });
  server.listen(5194, '127.0.0.1', () => console.log('Disposable preview ready at http://localhost:5194 — synthetic data only'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await mf.dispose(); process.exit(0); });
}
main().catch(e => { console.error(e); process.exitCode = 1; });

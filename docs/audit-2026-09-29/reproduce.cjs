// Isolated audit: creates only an in-memory Miniflare D1 database.
// Does not read .dev.vars or connect to localhost / production.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = path.resolve(__dirname, '../..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  if (name.startsWith('@shared/')) name = path.join(root, 'shared', name.slice(8) + '.ts');
  return originalResolve.call(this, name, ...args);
};
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: f,
}).outputText, f);
let env;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'cloudflare:test') return { env };
  return originalLoad.call(this, name, ...args);
};
const output = (name, result) => console.log(JSON.stringify({ name, ...result }));
async function main() {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("audit"); } }', compatibilityDate: '2025-09-01', d1Databases: ['DB'], d1Persist: false, cf: false }));
  try {
    const DB = await mf.getD1Database('DB');
    env = { DB, SETUP_CODE: 'test-code', SESSION_PEPPER: 'isolated-test-only' };
    for (const file of fs.readdirSync(path.join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(path.join(root, 'migrations', file), 'utf8').replace(/--[^\n]*/g, '');
      await DB.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => DB.prepare(s)));
    }
    const { app } = require(path.join(root, 'worker/app.ts'));
    const { reset, seed, login, call, json } = require(path.join(root, 'test/api/helpers.ts'));
    const { BACKUP_TABLES } = require(path.join(root, 'worker/routes/backup.ts'));
    let cookie;
    const fresh = async () => { await reset(); cookie = await login(); await seed(); };
    const op = (extra = {}) => ({ opId: Math.random().toString(36), scanSessionId: 'audit', assignmentId: 'a1', studentId: 'st1', status: 'submitted', score: 3, fullScoreAtScan: 10, method: 'grid', clientTs: Date.now(), dataEpoch: 1, ...extra });
    const post = async (url, body, targetEnv = env) => {
      const res = await app.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) }, targetEnv);
      return { http: res.status, body: await res.json() };
    };
    const cell = () => DB.prepare("SELECT status,score,event_at,updated_at FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first();
    const gate = () => {
      let release, reached;
      const ready = new Promise(r => reached = r), wait = new Promise(r => release = r);
      const wrapped = new Proxy(DB, { get(target, prop) {
        if (prop === 'batch') return async (stmts) => { reached(); await wait; return target.batch(stmts); };
        const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value;
      } });
      return { env: { ...env, DB: wrapped }, ready, release };
    };
    const assignment = (extra = {}) => ({ id: 'a1', term_id: 't1', subject_id: 's1', type_id: 'wt_worksheet', title: 'Audit assignment', full_score: 10, class_ids: ['c1'], ...extra });
    const backup = async () => {
      const data = {};
      for (const table of BACKUP_TABLES) data[table] = (await (await call('/api/backup?table=' + table, {}, cookie)).json()).rows;
      return data;
    };
    const stage = async data => {
      const counts = Object.fromEntries(BACKUP_TABLES.map(t => [t, data[t].length]));
      const result = await post('/api/restore/validate', { manifest: { schema_version: 5, counts } });
      if (result.http !== 200) throw new Error(JSON.stringify(result));
      const restoreId = result.body.restoreId;
      for (const table of BACKUP_TABLES) if (data[table].length) {
        const chunk = await post('/api/restore/execute', { restoreId, step: 'chunk', table, seq: 0, rows: data[table] });
        if (chunk.http !== 200) throw new Error(JSON.stringify(chunk));
      }
      return restoreId;
    };

    await fresh();
    const attBody = { date: '2026-09-29', classId: 'c1', rows: [{ studentId: 'st1', status: 'present', baseUpdatedAt: null, opId: 'lost-reply' }] };
    const first = await post('/api/attendance/batch', attBody);
    const changed = await post('/api/attendance/batch', { ...attBody, rows: [{ studentId: 'st1', status: 'absent', baseUpdatedAt: first.body.rows.st1, opId: 'other-device' }] });
    const duplicate = await post('/api/attendance/batch', attBody);
    const actualAttendance = await DB.prepare("SELECT status,updated_at FROM attendance WHERE student_id='st1'").first();
    output('attendance-lost-reply', { first: first.http, changed: changed.http, retry: duplicate, database: actualAttendance, clientAckFromSentEntry: attBody.rows[0].status });

    await fresh();
    const t = Date.now(), g1 = gate();
    const older = post('/api/submissions/batch', { ops: [op({ opId: 'older', score: 3, clientTs: t - 500 })] }, g1.env);
    await g1.ready;
    const newer = await post('/api/submissions/batch', { ops: [op({ opId: 'newer', score: 9, clientTs: t })] });
    g1.release();
    output('concurrent-score-ack', { newer, older: await older, database: await cell(), oldAudit: await DB.prepare("SELECT after_json FROM audit_logs WHERE op_id='older'").first() });

    await fresh();
    const cross = await post('/api/assignments/a1/bulk', { action: 'all-submitted', classId: 'c2' });
    output('bulk-wrong-class', { result: cross, linked: (await DB.prepare("SELECT class_id FROM assignment_classes WHERE assignment_id='a1'").all()).results, created: (await DB.prepare("SELECT student_id,status FROM submissions").all()).results });

    await fresh();
    const g2 = gate();
    const inFlight = post('/api/submissions/batch', { ops: [op({ score: 9 })] }, g2.env);
    await g2.ready;
    const lower = await post('/api/assignments', assignment({ full_score: 5 }));
    g2.release();
    output('full-score-race', { lower: lower.http, grade: await inFlight, stored: await DB.prepare("SELECT a.full_score,s.score FROM assignments a JOIN submissions s ON a.id=s.assignment_id").first() });

    await fresh();
    await post('/api/submissions/batch', { ops: [op({ score: 5, clientTs: Date.now() - 10000 })] });
    const snapshot = await backup(), restoreId = await stage(snapshot), g3 = gate();
    const stale = post('/api/submissions/batch', { ops: [op({ score: 9, dataEpoch: 1 })] }, g3.env);
    await g3.ready;
    const restore = await post('/api/restore/execute', { restoreId, step: 'commit' });
    const afterRestore = await cell();
    g3.release();
    output('restore-inflight-write', { restore, afterRestore, oldRequest: await stale, final: await cell(), epoch: await DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first() });

    await fresh();
    await DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('t2',2570,1,'1/2570',0,0)").run();
    const moved = await post('/api/assignments', assignment({ term_id: 't2' }));
    output('assignment-wrong-year', { result: moved.http, stored: await DB.prepare("SELECT t.year AS term_year,c.year AS class_year FROM assignments a JOIN terms t ON t.id=a.term_id JOIN assignment_classes ac ON ac.assignment_id=a.id JOIN classes c ON c.id=ac.class_id WHERE a.id='a1'").first() });
  } finally { await mf.dispose(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

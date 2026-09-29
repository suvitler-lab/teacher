// Executes the actual frontend controller source in memory with isolated API/storage mocks.
// Does not access browser storage or the running app.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const signals = require('@preact/signals');
const root = path.resolve(__dirname, '../..');
function compile(relative, mocks, expose = '') {
  const file = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8') + expose, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: 'preact' },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name === '@preact/signals') return signals;
    if (name in mocks) return mocks[name];
    if (name === 'preact/jsx-runtime') return require(name);
    return {};
  }, module, module.exports);
  return module.exports;
}
async function main() {
  const { signal } = signals;
  let mode = 'a', release;
  const queued = [];
  const scan = compile('src/pages/Scan.tsx', {
    '../store': { assignments: signal([{ id: 'a', full_score: 10, status: 'open' }, { id: 'b', full_score: 10, status: 'open' }]) },
    '../lib/api': { api: { post: async () => ({}), get: async () => {
      if (mode === 'offline') throw new Error('offline');
      if (mode === 'delayed-a') return new Promise(r => release = r);
      return { submissions: mode === 'a' ? [{ student_id: 'st1', status: 'submitted', score: 8, updated_at: 100 }] : [], serverTime: 100 };
    } } },
    '../lib/idb': { kvGet: async () => undefined, kvSet: async () => {} },
    '../lib/clock': { actionTime: () => Date.now(), serverNow: () => Date.now() },
    '../lib/outbox': { onResult: () => {}, pendingOps: signal(new Map()), pairKey: op => op.assignmentId + ':' + op.studentId, enqueueSubmission: async op => queued.push(op) },
    '../lib/sound': { beep: { err() {}, dup() {}, ok() {} }, vibrate() {} },
    '../lib/names': { fullName: () => 'Test student' },
    '@shared/ids': { ulid: () => 'isolated' },
  }, '\nexport const audit = { startSession, loadSubs, commitStudent, effSub, session, feedback };');
  await scan.audit.startSession('a', 'c1', 'full');
  mode = 'offline';
  await scan.audit.startSession('b', 'c1', 'full');
  scan.audit.commitStudent({ id: 'st1', class_id: 'c1' }, 'manual');
  console.log(JSON.stringify({ name: 'scan-switch-offline', assignment: scan.audit.session.value.assignmentId, feedback: scan.audit.feedback.value, enqueued: queued.length, displayed: scan.audit.effSub('st1') }));
  mode = 'delayed-a';
  const lateA = scan.audit.loadSubs('a');
  mode = 'b';
  await scan.audit.startSession('b', 'c1', 'full');
  release({ submissions: [{ student_id: 'st1', status: 'submitted', score: 8, updated_at: 100 }], serverTime: 100 });
  await lateA;
  console.log(JSON.stringify({ name: 'scan-stale-response', assignment: scan.audit.session.value.assignmentId, displayed: scan.audit.effSub('st1') }));

  const key = '2026-09-29|c1||';
  let draft = { key, ctx: { date: '2026-09-29', classId: 'c1', subjectId: null, period: null }, rows: { st1: { status: 'present', clientTs: 10, opId: 'lost-reply', baseUpdatedAt: null, epoch: 1 } }, rev: 1, updatedAt: 10 };
  const sync = compile('src/lib/attSync.ts', {
    './idb': { draftAll: async () => draft ? [draft] : [], draftGet: async () => draft, draftUpdate: async (_key, fn) => (draft = fn(draft)) },
    './session': { authRequired: signal(false), syncPaused: signal(false), dataEpoch: signal(1) },
    // `state` = what the server holds after the write (another device made it "absent"); an older server sends only `rows`
    './api': { api: { post: async () => ({ ok: true, changed: 0, updatedAt: 30, rows: { st1: 20 }, ...(process.env.OLD_SERVER ? {} : { state: { st1: { status: 'absent', updatedAt: 20 } } }) }) } },
  });
  const events = [];
  sync.onAttEvent(e => events.push(e));
  await sync.flushDraft(key);
  console.log(JSON.stringify({ name: 'attendance-client-duplicate-ack', serverActualStatus: 'absent', events, remainingDraft: draft }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });

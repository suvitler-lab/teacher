// Audit evidence only: real routes against disposable in-memory D1; never reads .dev.vars.
const { startFixtureServer } = require('../../../../../scripts/fixture-server.cjs');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const fixture = await startFixtureServer({ port: 0 });
  const { app } = require('../../../../../worker/app.ts');
  const { BACKUP_TABLES } = require('../../../../../worker/routes/backup.ts');
  const env = { DB: fixture.DB, SETUP_CODE: 'fixture-setup', SESSION_PEPPER: 'fixture-pepper-not-secret' };
  let cookie = '';
  const results = [];
  const note = (id, evidence) => { results.push({ id, ...evidence }); console.log(JSON.stringify(results.at(-1))); };
  async function call(route, body, method = body ? 'POST' : 'GET', via = env, auth = true) {
    const res = await app.request('http://audit.local' + route, {
      method, headers: { 'Content-Type': 'application/json', ...(auth && cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, via);
    const data = await res.json();
    return { status: res.status, data, headers: res.headers };
  }
  async function backup() {
    const data = {}, counts = {};
    for (const table of BACKUP_TABLES) {
      data[table] = [];
      let cursor = 0;
      do { const r = await call(`/api/backup?table=${table}&cursor=${cursor}`); data[table].push(...r.data.rows); cursor = r.data.nextCursor; } while (cursor !== null);
      counts[table] = data[table].length;
    }
    return { data, counts };
  }
  async function restore(b) {
    const v = await call('/api/restore/validate', { manifest: { schema_version: 6, counts: b.counts } });
    if (v.status !== 200) throw new Error('validate ' + JSON.stringify(v.data));
    for (const table of BACKUP_TABLES) {
      for (let i = 0, seq = 0; i < b.data[table].length; i += 500, seq++) {
        const r = await call('/api/restore/execute', { restoreId: v.data.restoreId, step: 'chunk', table, seq, rows: b.data[table].slice(i, i + 500) });
        if (r.status !== 200) throw new Error('chunk ' + JSON.stringify(r.data));
      }
    }
    return call('/api/restore/execute', { restoreId: v.data.restoreId, step: 'commit' });
  }
  try {
    const login = await call('/api/auth/login', { email: fixture.email, password: fixture.password, deviceId: 'audit-evidence', deviceName: 'Audit evidence' });
    cookie = login.headers.get('set-cookie').split(';')[0];
    const protectedPaths = ['/api/bootstrap','/api/gradebook','/api/reports/summary?class=none','/api/backup?table=students','/api/audit'];
    note('AUTH-CHECK', { statuses: await Promise.all(protectedPaths.map(async p => ({ path: p, status: (await call(p, undefined, 'GET', env, false)).status }))) });
    const initial = await backup();
    const term = initial.data.terms.find(t => t.is_current);
    const dup = await call('/api/terms', { year: term.year, term: term.term, name: 'Duplicate audit term', is_current: false });
    const duplicateCount = await env.DB.prepare('SELECT COUNT(*) n FROM terms WHERE year=? AND term=?').bind(term.year,term.term).first();
    note('DUPLICATE-TERM', { status: dup.status, sameYearTermRows: duplicateCount.n });
    await restore(initial);
    const invalid = structuredClone(initial);
    invalid.data.submissions[0].score = 999;
    const restored = await restore(invalid);
    const invalidRows = await env.DB.prepare('SELECT COUNT(*) n FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.score>a.full_score').first();
    note('RESTORE-DOMAIN', { status: restored.status, scoreAboveMaximumRows: invalidRows.n });
    await restore(initial);
    let intercepted = false;
    const wrappedDb = new Proxy(env.DB, { get(target, key) {
      if (key === 'batch') return async (stmts) => {
        if (!intercepted) { intercepted = true; const r = await restore(initial); if (r.status !== 200) throw new Error('restore failed during race'); }
        return target.batch(stmts);
      };
      const value = Reflect.get(target,key); return typeof value === 'function' ? value.bind(target) : value;
    }});
    const epochBefore = await env.DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first();
    const settingsRace = await call('/api/settings', { school_name: 'STALE WRITE AFTER RESTORE' }, 'PUT', {...env, DB:wrappedDb});
    const settingsAfter = await env.DB.prepare("SELECT value FROM settings WHERE key='school_name'").first();
    const epochAfter = await env.DB.prepare("SELECT value FROM meta WHERE key='data_epoch'").first();
    note('SETTINGS-RESTORE-RACE', { status: settingsRace.status, epochBefore: epochBefore.value, epochAfter: epochAfter.value, staleValueCommitted: settingsAfter.value === 'STALE WRITE AFTER RESTORE' });
    await restore(initial);
    const sub = initial.data.submissions[0];
    const student = initial.data.students.find(s => s.id === sub.student_id);
    const oldQuery = `/api/gradebook?class=${student.class_id}&term=${term.id}`;
    const before = await call(oldQuery);
    const next = await call('/api/terms/start', { expectedCurrentTermId:term.id, year:term.year+1, term:1, name:'Audit next year', start_date:'2027-05-01', end_date:'2027-10-01', keepClasses:[student.class_id], closeOpenWork:true });
    if (next.status !== 200) throw new Error('start term ' + JSON.stringify(next.data));
    const moved = await call('/api/students/import', { class_id:next.data.classes[0].id, students:[{code:student.code,first_name:student.first_name,last_name:student.last_name,number:student.number}] });
    const after = await call(oldQuery);
    note('HISTORY-MOVE', { importStatus:moved.status, oldRosterBefore:before.data.students.length, oldRosterAfter:after.data.students.length, targetPresentBefore:before.data.students.some(s=>s.id===student.id), targetPresentAfter:after.data.students.some(s=>s.id===student.id), oldScoresBefore:before.data.submissions.length, oldScoresAfter:after.data.submissions.length });
    // This fixture is disposable; clear only its teacher row to reproduce simultaneous first setup.
    await env.DB.prepare('DELETE FROM teacher').run();
    const setup = await Promise.all([1,2].map(n=>call('/api/setup',{setupCode:'fixture-setup',email:`audit${n}@example.com`,password:'AuditPassword2026',deviceId:`race-${n}`},'POST',env,false)));
    const teachers = await env.DB.prepare('SELECT COUNT(*) n FROM teacher').first();
    note('SETUP-RACE', {statuses:setup.map(r=>r.status), teacherRows:teachers.n});
    fs.writeFileSync(path.join(__dirname,'reproduction-results.json'),JSON.stringify({date:'2026-10-23',environment:'isolated in-memory D1, synthetic students',results},null,2));
  } finally { await fixture.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

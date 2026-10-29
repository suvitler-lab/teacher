// Review the supplied ZIP in an isolated, in-memory D1; no real database or secrets.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const ts = require('typescript');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = path.resolve(__dirname, '../../.audit/ce751ea/teacher');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@shared/') ? path.join(root, 'shared', name.slice(8) + '.ts') : name, ...args); };
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { fileName: f, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
let env;
const load = Module._load;
Module._load = function(name, ...args) { return name === 'cloudflare:test' ? { env } : load.call(this, name, ...args); };
async function main() {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules:true, script:'export default {fetch(){return new Response("audit")}}', compatibilityDate:'2025-09-01', d1Databases:['DB'], d1Persist:false, cf:false }));
  try {
    const DB = await mf.getD1Database('DB');
    env = { DB, SETUP_CODE:'test-code', SESSION_PEPPER:'isolated-audit' };
    for (const file of fs.readdirSync(path.join(root,'migrations')).filter(f=>f.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(path.join(root,'migrations',file),'utf8').replace(/--[^\n]*/g,'');
      await DB.batch(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>DB.prepare(s)));
    }
    const { app } = require(path.join(root,'worker/app.ts'));
    const { reset,seed,login,gateBatch } = require(path.join(root,'test/api/helpers.ts'));
    let cookie;
    const fresh = async()=>{await reset();cookie=await login();await seed();};
    const request = async(url,body,target=env)=>{
      const res = await app.request(url,{method:body ? 'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)}:{})},target);
      return {http:res.status,body:await res.json()};
    };
    const op = (extra={})=>({opId:Math.random().toString(36),scanSessionId:'audit',assignmentId:'a1',studentId:'st1',status:'submitted',score:9,fullScoreAtScan:10,method:'grid',intent:'grade',clientTs:Date.now(),dataEpoch:1,...extra});
    const cell=()=>DB.prepare("SELECT score,status,submitted_at,late,updated_at,event_at FROM submissions WHERE assignment_id='a1' AND student_id='st1'").first();
    const out=(name,result)=>console.log(JSON.stringify({name,...result}));

    await fresh();
    await request('/api/submissions/batch',{ops:[op()]});
    const clear=await request('/api/assignments/a1/bulk',{action:'clear',classId:'c1'});
    const lower=await request('/api/assignments',{id:'a1',term_id:'t1',subject_id:'s1',type_id:'wt_worksheet',title:'Audit assignment',full_score:5,class_ids:['c1']});
    const undo=await request('/api/assignments/a1/bulk-undo',{batchId:clear.body.batchId});
    out('undo-score-over-full',{clear,lower,undo,stored:await DB.prepare("SELECT a.full_score,s.score FROM assignments a JOIN submissions s ON s.assignment_id=a.id WHERE a.id='a1'").first()});

    await fresh();
    let release,reached;
    const ready=new Promise(r=>reached=r),wait=new Promise(r=>release=r);
    const readDB=new Proxy(DB,{get(target,prop){
      if(prop==='prepare')return(sql)=>{
        let stmt=target.prepare(sql);
        if(!sql.startsWith('SELECT * FROM submissions WHERE assignment_id'))return stmt;
        return {bind(...args){stmt=stmt.bind(...args);return this;},async all(){const data=await stmt.all();reached();await wait;return data;}};
      };
      const v=Reflect.get(target,prop);return typeof v==='function'?v.bind(target):v;
    }});
    const polling=request('/api/assignments/a1/submissions',null,{...env,DB:readDB});
    await ready;
    const save=await request('/api/submissions/batch',{ops:[op()]});
    release();const first=await polling;
    const next=await request('/api/assignments/a1/submissions?since='+first.body.serverTime);
    out('poll-misses-between-read-and-response',{save,first,next,stored:await cell()});

    await fresh();
    const g1=gateBatch();
    const writing=request('/api/submissions/batch',{ops:[op()]},g1.env);
    await g1.ready;
    const during=await request('/api/assignments/a1/submissions');
    g1.release();const saved=await writing;
    const after=await request('/api/assignments/a1/submissions?since='+during.body.serverTime);
    out('poll-misses-inflight-write',{during,saved,after,stored:await cell()});

    await fresh();
    await DB.prepare("UPDATE assignments SET due_date='2026-09-29' WHERE id='a1'").run();
    const t=Date.parse('2026-09-30T00:00:00.005+07:00'),g2=gateBatch();
    const grading=request('/api/submissions/batch',{ops:[op({clientTs:t,score:8})]},g2.env);
    await g2.ready;
    const receiving=await request('/api/submissions/batch',{ops:[op({clientTs:t-10000,score:null,intent:'receive',method:'manual'})]});
    const received=await cell();
    g2.release();const graded=await grading;
    out('grading-resets-first-handin',{receiving,received,graded,final:await cell()});

    await fresh();
    const start=Date.now();
    await request('/api/submissions/batch',{ops:[op({score:5,clientTs:start-20000})]});
    const g3=gateBatch();
    const clearing=request('/api/assignments/a1/bulk',{action:'clear',classId:'c1'},g3.env);
    await g3.ready;
    const intervening=await request('/api/submissions/batch',{ops:[op({score:7,clientTs:start-10000})]});
    const beforeClear=await cell();
    g3.release();const cleared=await clearing;
    const undone=await request('/api/assignments/a1/bulk-undo',{batchId:cleared.body.batchId});
    out('stale-audit-undo',{intervening,beforeClear,cleared,undone,final:await cell()});
  } finally { await mf.dispose(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

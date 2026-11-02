// node qa-feat.cjs <assets> <probe|run>
const fs=require('fs'),os=require('os'),path=require('path'),net=require('net');const {spawn}=require('child_process');
const root='C:/Users/User/Desktop/teacher';
const {startFixtureServer}=require(root+'/scripts/fixture-server.cjs');
const [,, assets, mode, W='1180', H='820']=process.argv;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const spec=JSON.parse(fs.readFileSync(root+'/docs/team/pages.json','utf8'));
const freePort=()=>new Promise((res)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p))})});
async function connect(u){const ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}};const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}))});const ev=async ex=>{const r=await send('Runtime.evaluate',{expression:ex,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('eval '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result.value};return{send,ev,close:()=>ws.close()}}
(async()=>{
 const exe=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f=>fs.existsSync(f));
 const srv=await startFixtureServer({port:4201,assetsDir:path.resolve(assets),layout:true});
 const port=await freePort();const prof=fs.mkdtempSync(path.join(os.tmpdir(),'qa-'));
 const proc=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${prof}`,'--no-first-run','--disable-extensions','--hide-scrollbars','about:blank'],{stdio:'ignore'});
 try{
  let t;for(let i=0;i<100&&!t;i++){try{t=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');}catch{}await sleep(200)}
  const p=await connect(t.webSocketDebuggerUrl);await p.send('Page.enable');await p.send('Runtime.enable');
  await p.send('Emulation.setDeviceMetricsOverride',{width:+W,height:+H,deviceScaleFactor:1,mobile:true,screenWidth:+W,screenHeight:+H});
  await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const pg=spec.pages.find(x=>x.name==='gradebook-14');
  await p.send('Page.navigate',{url:new URL(pg.path,'http://127.0.0.1:4201/').href});
  for(let i=0;i<100&&(await p.ev('document.readyState'))!=='complete';i++)await sleep(150);
  await p.ev(spec.beforeAll);await sleep(300);await p.ev(pg.setup);for(let i=0;i<100&&!(await p.ev(pg.ready));i++)await sleep(150);await sleep(700);
  const code=fs.readFileSync(path.join(__dirname,mode+'.js'),'utf8');
  console.log(JSON.stringify(await p.ev(code),null,1));
  p.close();
 }finally{proc.kill();await sleep(500);try{fs.rmSync(prof,{recursive:true,force:true})}catch{};await srv.close();}
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});

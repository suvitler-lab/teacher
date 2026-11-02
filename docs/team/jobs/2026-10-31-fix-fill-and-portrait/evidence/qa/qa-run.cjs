// usage: node qa-run.cjs <label> <assetsDir> <out.json> [pageNames]
const fs=require('fs'),os=require('os'),path=require('path'),net=require('net');const {spawn}=require('child_process');
const root='C:/Users/User/Desktop/teacher';
const {startFixtureServer}=require(root+'/scripts/fixture-server.cjs');
const [,, label, assets, outFile, onlyPages]=process.argv;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const spec=JSON.parse(fs.readFileSync(root+'/docs/team/pages.json','utf8'));
const DEV=[{n:'820x1180',w:820,h:1180,touch:true},{n:'1180x820',w:1180,h:820,touch:true},{n:'1536x729',w:1536,h:729,touch:false},{n:'390x844',w:390,h:844,touch:true}];
const MEAS=fs.readFileSync(path.join(__dirname,'meas.js'),'utf8');
const freePort=()=>new Promise((res)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p))})});
async function connect(u){const ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}};const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}))});const ev=async ex=>{const r=await send('Runtime.evaluate',{expression:ex,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('eval '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result.value};return{send,ev,close:()=>ws.close()}}
(async()=>{
 const exe=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(f=>fs.existsSync(f));
 const srv=await startFixtureServer({port:4201,assetsDir:path.resolve(assets),layout:true});
 const port=await freePort();const prof=fs.mkdtempSync(path.join(os.tmpdir(),'qa-'));
 const proc=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${prof}`,'--no-first-run','--disable-extensions','--force-color-profile=srgb','--hide-scrollbars','about:blank'],{stdio:'ignore'});
 const out={};
 try{
  let t;for(let i=0;i<100&&!t;i++){try{t=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');}catch{}await sleep(200)}
  const p=await connect(t.webSocketDebuggerUrl);await p.send('Page.enable');await p.send('Runtime.enable');
  const pages=spec.pages.filter(x=>!onlyPages||onlyPages.split(',').includes(x.name));
  for(const d of DEV){
   await p.send('Emulation.setDeviceMetricsOverride',{width:d.w,height:d.h,deviceScaleFactor:1,mobile:d.touch,screenWidth:d.w,screenHeight:d.h});
   await p.send('Emulation.setTouchEmulationEnabled',d.touch?{enabled:true,maxTouchPoints:5}:{enabled:false});
   let first=true;
   for(const pg of pages){
    await p.send('Page.navigate',{url:new URL(pg.path,'http://127.0.0.1:4201/').href});
    for(let i=0;i<100&&(await p.ev('document.readyState'))!=='complete';i++)await sleep(150);
    if(first&&spec.beforeAll){await p.ev(spec.beforeAll);first=false;await sleep(300)}
    if(pg.setup)await p.ev(pg.setup);
    let ok=false;for(let i=0;i<130&&!ok;i++){ok=await p.ev(pg.ready);if(!ok)await sleep(150)}
    await sleep(pg.wait??600);
    const key=pg.name+'|'+d.n;
    try{out[key]=await p.ev(MEAS.replace('__PAGE__',JSON.stringify(pg.name)));out[key].ready=ok}catch(e){out[key]={err:e.message,ready:ok}}
    console.log(key,ok?'':'NOT READY');
   }
  }
  p.close();
 }finally{proc.kill();await sleep(500);try{fs.rmSync(prof,{recursive:true,force:true})}catch{};await srv.close();}
 fs.writeFileSync(outFile,JSON.stringify(out,null,1));console.log('done',label);process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});

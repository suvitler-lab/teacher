/* ===================== เหตุการณ์ · hash · เริ่มต้น ===================== */
S.pjPref={th:'dark',sz:2};
const PJ_DEFAULT_SUB={scan:'type',attendance:'tap',random:'pick'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const LBL={gradebook:'คะแนน',reports:'รายงาน',students:'นักเรียน',settings:'ตั้งค่า',work:'งาน'};
window.R2render=()=>render();
window.R2nav=k=>{
  if(['home','scan','attendance','random','gradebook'].includes(k)){go(k);render();return}
  toast2(`เปิดหน้า “${LBL[k]||k}” (หน้านี้อยู่นอกขอบเขต mockup รอบนี้)`);render();
};
function closeAll(){S.prefsOpen=false;S.sheetMenu=false;S.menu=null;S.dlg=null;if(S.sc)S.sc.sheet=null;S.pjOther=false;if(S.gb){if(S.gb.pop||S.gb.sheet)S.gb.refocus='cell';S.gb.pop=null;S.gb.sheet=null;S.gb.form=null}}
function exitPj(){S.sub[S.page]=PJ_DEFAULT_SUB[S.page];S.pjOther=false;S.pjHint=false;if(S.page==='attendance')S.at.mode='tap';render()}
let rdTimer=null;
function rdTick(){const R=S.rd;if(!R.run){clearInterval(rdTimer);rdTimer=null;return}R.left=Math.max(0,R.left-1);if(R.left===0){R.run=false;clearInterval(rdTimer);rdTimer=null}render()}
function liveSub(){return ['type','full'].includes(curSub())}
function ensureLive(){if(S.page==='scan'&&!liveSub()&&curSub()!=='pj'){S.sub.scan=S.sc.mode==='full'?'full':'type'}}

function onAct(a,k,t,e){
  const sc=S.sc,A=S.at,R=S.rd;
  switch(a){
  /* --- เปลือก --- */
  case 'nav':window.R2nav(k);return;
  case 'logout':toast2('ออกจากระบบ (จำลอง)');break;
  case 'toast':toast2(k);break;
  case 'prefs':S.prefsOpen=true;S.menu=null;break;
  case 'sheetmenu':S.sheetMenu=!S.sheetMenu;break;
  case 'closeov':if(e.target!==t&&t.tagName!=='BUTTON')return;closeAll();break;
  case 'menu':S.menu=S.menu===k?null:k;break;
  case 'toastact':{const f=S.toast&&S.toast.action;if(f)f.fn();break}
  case 'dlgno':S.dlg=null;break;
  /* --- ปรับการ์ด --- */
  case 'pt':{const h=S.prefs[prefKey()].hidden,i=h.indexOf(k);if(i>=0)h.splice(i,1);else h.push(k);toast2('บันทึกแล้ว · ใช้กับทุกเครื่อง');break}
  case 'pm':{const o=S.prefs[prefKey()].order,i=o.indexOf(k),j=i+(+t.dataset.d);if(j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];toast2('บันทึกแล้ว · ใช้กับทุกเครื่อง');break}
  case 'preset':S.prefs[prefKey()]=defPrefs(prefKey());toast2('คืนค่าเริ่มต้นแล้ว');break;
  /* --- ฉายจอ --- */
  case 'pjmenu':S.menu=S.menu==='pj'?null:'pj';break;
  case 'pjth':S.pjPref={...S.pjPref,th:k};break;
  case 'pjsz':S.pjPref={...S.pjPref,sz:+k};break;
  case 'pjstart':S.menu=null;S.sub[S.page]='pj';applySub();break;
  case 'pjother':S.pjOther=!S.pjOther;break;
  case 'pjgo':S.pjOther=false;go(k,'pj');break;
  case 'pjexitnow':exitPj();return;
  case 'pjhold':return; // จัดการด้วย pointer ด้านล่าง
  /* --- สแกน: ตั้งค่ารอบ --- */
  case 'pickasg':{sc.asg=k;const a2=AS(k);if(!a2.per[sc.cls])sc.cls=Object.keys(a2.per)[0];sc.seats=seatsInit(sc.asg,sc.cls);sc.recent=[];sc.fb=null;break}
  case 'pickcls':sc.cls=k;sc.seats=seatsInit(sc.asg,k);sc.recent=[];sc.fb=null;break;
  case 'pickmode':sc.mode=k;break;
  case 'showall':sc.showAll=true;break;
  case 'startround':{sc.recent=[];sc.fb=null;sc.cur=null;sc.ended=false;sc.pend=sc.mode==='type'&&!sc.closed?{n:nextMiss(sc.seats)}:null;sc.entry='';sc.err='';S.sub.scan=sc.mode==='full'?'full':'type';break}
  /* --- สแกน: ระหว่างรอบ --- */
  case 'swcls':sc.cls=k;sc.seats=seatsInit(sc.asg,k);sc.recent=[];sc.fb=null;sc.pend=null;S.menu=null;break;
  case 'swmode':sc.mode=k;S.menu=null;sc.pend=k==='type'&&!sc.closed?(sc.pend||{n:nextMiss(sc.seats)}):null;if(k!=='type')sc.entry='';S.sub.scan=k==='full'?'full':'type';break;
  case 'recv':sc.recvDate=k;sc.recv=k===TODAY?'today':'pick';S.menu=null;break;
  case 'endround':S.sub.scan='summary';S.menu=null;break;
  case 'backscan':S.sub.scan=sc.mode==='full'?'full':'type';break;
  case 'closeasg':S.dlg={t:'close'};break;
  case 'allp':{const m=curMap(),n=CL(A.cls).total-Object.keys(m).length;if(!n){toast2('เช็คครบทุกคนแล้ว');break}S.dlg={t:'allp',n};break}
  case 'dlgyes':{
    const d=S.dlg;S.dlg=null;
    if(d.t==='close'){sc.closed=true;toast2('ปิดรับงานแล้ว · ทุกห้อง')}
    else if(d.t==='allp'){const m=curMap(),added=[];for(let n=1;n<=CL(A.cls).total;n++)if(!m[n]){m[n]='p';added.push(n)}
      A.saving=true;setTimeout(()=>{S.at.saving=false;render()},900);
      toast2(`ให้ “มา” ${added.length} คนแล้ว`,{label:'เลิกทำ',fn:()=>{added.forEach(n=>delete m[n]);S.toast=null;render()}})}
    break}
  case 'copymiss':case 'copygrp':toast2('คัดลอกแล้ว');break;
  case 'seat':{const n=+k,st=sc.seats[n];if(['scored','late','await'].includes(st)){sc.sheet=n;break}scanCommit(n,'tap');break}
  case 'key':{if(k==='bk')sc.entry=sc.entry.slice(0,-1);else if(k==='.5'){if(!sc.entry.includes('.'))sc.entry=(sc.entry||'0')+'.5'}else if(sc.entry.length<4)sc.entry+=k;sc.err='';break}
  case 'quick':sc.entry=String(k);sc.err='';break;
  case 'savescore':scanSave();break;
  case 'later':{const p=sc.pend;if(!p)break;const a2=AS(sc.asg);sc.seats[p.n]='await';sc.recent=sc.recent.filter(r=>r.n!==p.n);sc.recent.unshift({n:p.n,state:'await',score:null,full:a2.full,recv:recvOpts()});
    sc.fb={kind:'acc',icon:'inbox',title:`${nick(p.n)} · เลขที่ ${p.n}`,sub:'รับงานแล้ว · รอคะแนน'};sc.pend=null;sc.entry='';break}
  case 'rsheet':sc.sheet=+k;break;
  case 'shundo':scanUndo(+k);break;
  case 'shedit':{const n=+k;sc.sheet=null;sc.pend={n,edit:true};sc.entry='';sc.err='';sc.cur=n;ensureLive();break}
  case 'excyes':{const n=sc.excAsk;sc.excAsk=null;sc.seats[n]='miss';scanCommit(n,'qr');break}
  case 'excno':sc.excAsk=null;break;
  case 'hidtest':toast2('เครื่องยิงตอบสนองปกติ');break;
  case 'drop':sc.confirmDrop=+k;break;
  case 'dropno':sc.confirmDrop=null;break;
  case 'dropyes':{const id=+k,r=sc.failed.find(x=>x.id===id);sc.failed=sc.failed.filter(x=>x.id!==id);sc.confirmDrop=null;if(r)sc.dots.fail=sc.dots.fail.filter(n=>n!==r.n);toast2('ทิ้งรายการแล้ว');break}
  case 'retry':{const id=+k,r=sc.failed.find(x=>x.id===id);sc.failed=sc.failed.filter(x=>x.id!==id);if(r)sc.dots.fail=sc.dots.fail.filter(n=>n!==r.n);toast2('ส่งใหม่สำเร็จ');break}
  /* --- เช็คชื่อ --- */
  case 'atcls':A.cls=k;break;
  case 'date':A.date=shift(A.date,+k);if(A.date>TODAY)A.date=TODAY;break;
  case 'atday':A.date=k;break;
  case 'atper':A.mode=k==='1'?'period':'tap';S.sub.attendance=k==='1'?'period':'tap';break;
  case 'atp':A.period=+k;break;
  case 'brush':A.brush=k;A.cycle=false;break;
  case 'cycle':A.cycle=!A.cycle;break;
  case 'tile':attTap(+k);break;
  case 'jump':{const n=+k;A.flash=n;const el=document.getElementById('t'+n);if(el&&el.scrollIntoView)el.scrollIntoView({block:'center'});setTimeout(()=>{S.at.flash=null;render()},1200);break}
  /* --- สุ่มชื่อ --- */
  case 'rdcls':R.cls=k;R.called=[];R.cur=null;R.groups=null;break;
  case 'rdmode':R.mode=k;S.sub.random=k;break;
  case 'rdgo':rdPick();break;
  case 'rdnorep':R.norepeat=!R.norepeat;break;
  case 'rdpresent':R.presentOnly=!R.presentOnly;break;
  case 'rdall':R.presentOnly=false;break;
  case 'rdpair':R.pair=!R.pair;break;
  case 'rdlead':R.leaders=!R.leaders;break;
  case 'rdstep':{const d=+k;if(R.mode==='group'){if(R.byGroups)R.ngroups=clamp(R.ngroups+d,2,10);else R.gsize=clamp(R.gsize+d,2,8)}else R.count=clamp(R.count+d,1,5);break}
  case 'rdby':R.byGroups=k==='1';break;
  case 'rduse':R.useRange=!R.useRange;break;
  case 'rdr':{const [i,d]=k.split(',').map(Number),tot=CL(R.cls).total;R.range[i]=clamp(R.range[i]+d,1,tot);if(R.range[0]>R.range[1]){if(i===0)R.range[1]=R.range[0];else R.range[0]=R.range[1]}break}
  case 'rdundo':rdUndo();break;
  case 'rdpass':rdPass();break;
  case 'rdreset':R.called=[];R.cur=null;R.groups=null;R.msg='';break;
  case 'tsec':R.timerSec=+k;R.left=R.timerSec;R.run=false;break;
  case 'trun':{R.run=!R.run;if(R.run){if(R.left<=0)R.left=R.timerSec;clearInterval(rdTimer);rdTimer=setInterval(rdTick,1000)}break}
  case 'tres':R.left=R.timerSec;R.run=false;break;
  default:if(gbAct(a,k,t,e))return;return;
  }
  render();
}
function onCtl(c){
  const a=c.dataset.c,k=c.dataset.k;
  if(a==='page'){go(k)}
  else if(a==='sub'){
    if(S.page==='home'){H.S.page=k==='main'?'home':k;if(k==='sheet')S.dev='phone'}
    else{closeAll();S.sub[S.page]=k;applySub()}
    if(S.page==='home')closeAll()}
  else if(a==='dev')S.dev=k;
  else if(a==='theme')S.theme=k;
  else if(a==='font')S.font=+k;
  else if(a==='scen'){S.scen=k;initAll();H.S.confirmReset=false}
  else if(a==='reset'){clearInterval(rdTimer);S.sub={scan:'type',attendance:'tap',random:'pick',gradebook:'table'};S.page='home';S.prefs={scan:defPrefs('scan'),att:defPrefs('att'),random:defPrefs('random'),gradebook:defPrefs('gradebook')};S.pjPref={th:'dark',sz:2};S.toast=null;closeAll();initAll();H.S.page='home';H.S.prefs=H.DEFAULT_PREFS();H.S.showAll=false;H.S.filter='open';H.S.hideNames=false}
  else if(a==='sim'){
    if(S.page==='scan'){
      ensureLive();const sc2=S.sc;
      if(k==='scan-next'){if(!sc2.pend){const n=nextMiss(sc2.seats);if(n)scanCommit(n,'qr')}}
      else if(k==='scan-dup'){const n=Object.keys(sc2.seats).map(Number).find(x=>['scored','late','await'].includes(sc2.seats[x]));if(n)scanCommit(n,'qr')}
      else if(k==='scan-bad'){sc2.pend=null;scanCommit(99,'qr')}
      else if(k==='scan-exc'){sc2.pend=null;sc2.seats[EXC[0]]='exc';scanCommit(EXC[0],'qr')}
    }else if(S.page==='attendance'){S.at.mode='scan';S.sub.attendance='scan';attScanNext()}
    else if(S.page==='random')rdPick();
    else if(S.page==='gradebook')gbSim(k);
  }
  render();
}
document.addEventListener('click',e=>{
  const c=e.target.closest('[data-c]');
  if(c){onCtl(c);return}
  if(S.menu&&!e.target.closest('.menu')){S.menu=null;if(!e.target.closest('[data-a]')){render();return}}
  const t=e.target.closest('[data-a]');if(!t)return;
  e.preventDefault();
  const a=t.dataset.a,k=t.dataset.k;
  if(S.page==='home'&&!['nav','logout','sheetmenu','closeov','toastact','menu','toast'].includes(a)){H.act(e,t);return}
  onAct(a,k,t,e);
});
document.addEventListener('change',e=>{const t=e.target.closest('[data-a="atsubj"]');if(t){S.at.subj=t.value;render()}});
/* กดค้างปุ่ม × 1 วินาทีเพื่อออกจากโหมดฉายจอ */
let hold=null;
function holdStart(btn){
  holdEnd(true);const t0=performance.now();hold={btn,raf:0,t0};
  const step=()=>{if(!hold)return;const p=Math.min(100,(performance.now()-hold.t0)/10);btn.style.setProperty('--p',p);if(p>=100){hold=null;exitPj();return}hold.raf=requestAnimationFrame(step)};
  hold.raf=requestAnimationFrame(step);
}
function holdEnd(silent){
  if(!hold)return;cancelAnimationFrame(hold.raf);const b=hold.btn,short=performance.now()-hold.t0<1000;hold=null;b.style.setProperty('--p',0);
  if(!silent&&short){S.pjHint=true;render();clearTimeout(holdEnd.h);holdEnd.h=setTimeout(()=>{S.pjHint=false;render()},3000)}
}
document.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-a="pjhold"]');if(b)holdStart(b)});
['pointerup','pointercancel','pointerleave'].forEach(ev=>document.addEventListener(ev,()=>holdEnd(false),true));
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(S.dlg||S.prefsOpen||S.sheetMenu||S.menu||(S.sc&&S.sc.sheet!=null)||(S.gb&&(S.gb.pop||S.gb.sheet))){closeAll();render();return}
    if(pjOn()){exitPj();return}
    if(S.page==='home'&&H.S.page!=='home'){H.S.page='home';H.S.confirmReset=false;render()}
    return}
  if(e.key===' '&&S.page==='random'&&!S.prefsOpen&&(e.target===document.body)){e.preventDefault();rdPick();render()}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[data-a="pjhold"]')&&!e.repeat){e.preventDefault();holdStart(e.target)}
});
document.addEventListener('keyup',e=>{if((e.key==='Enter'||e.key===' ')&&hold)holdEnd(false)});
window.addEventListener('resize',render);
function fromHash(){
  const [p,s]=location.hash.replace('#','').split('-');
  if(!['home','scan','attendance','random','gradebook'].includes(p))return false;
  if(p===S.page&&(!s||s===curSub()))return false;
  const ok=p==='home'||(SUBS[p]&&SUBS[p][s]);
  go(p,ok?s:undefined);return true;
}
window.addEventListener('hashchange',()=>{if(fromHash())render()});
initAll();
S.page='home';
fromHash();
render();

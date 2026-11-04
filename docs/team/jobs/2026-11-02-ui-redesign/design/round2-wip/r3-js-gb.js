/* ===================== รอบ 3 · สมุดคะแนน (gradebook) ===================== */
/* คำนำหน้า gb = ของหน้านี้ · ห้ามชนชื่อกับรอบ 1–2 (CL, ASGS, ST, S, counts ฯลฯ) */

const GBT={
  wk:{n:'ใบงาน',ic:'file-text',tc:'violet'},
  hw:{n:'การบ้าน',ic:'notebook',tc:'orange'},
  ex:{n:'แบบฝึกหัด',ic:'pencil',tc:'aqua'},
  qz:{n:'สอบ',ic:'star',tc:'magenta',exam:true},
  pj:{n:'ชิ้นงาน',ic:'puzzle',tc:'green'},
  ac:{n:'กิจกรรม',ic:'flag',tc:'blue'},
};
const GBSUBJ=['คณิตศาสตร์','วิทยาศาสตร์'];
const GBMON={'2026-09':'ก.ย.','2026-10':'ต.ค.','2026-11':'พ.ย.'};
/* งานสมมติ: rate = % ที่ส่งแล้ว · aw = จำนวนที่รับไว้ยังไม่ให้คะแนน */
const GBW0=[
  {id:'m1',t:'wk',title:'ใบงาน 1 จำนวนเต็ม',subj:'คณิตศาสตร์',full:10,assigned:'2026-09-14',due:'2026-09-21',closed:true,rate:98,aw:0},
  {id:'m2',t:'hw',title:'การบ้าน บทที่ 1 จำนวนเต็ม',subj:'คณิตศาสตร์',full:10,assigned:'2026-09-21',due:'2026-09-28',closed:true,rate:96,aw:0},
  {id:'m3',t:'ex',title:'แบบฝึกหัด 3 บวกลบ',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-05',due:'2026-10-12',closed:true,rate:95,aw:0},
  {id:'m4',t:'qz',title:'สอบย่อย บทที่ 1',subj:'คณิตศาสตร์',full:20,assigned:'2026-10-12',due:'2026-10-14',closed:true,hid:true,rate:100,aw:0},
  {id:'m5',t:'wk',title:'ใบงาน 4 ร้อยละ',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-26',due:'2026-10-30',closed:false,rate:90,aw:0},
  {id:'m6',t:'hw',title:'การบ้าน บทที่ 3 ทศนิยม',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-20',due:'2026-10-27',closed:true,rate:95,aw:0},
  {id:'m7',t:'ex',title:'แบบฝึกหัด 5 เศษส่วน',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-28',due:'2026-11-02',closed:false,rate:85,aw:4},
  {id:'m8',t:'hw',title:'การบ้าน บทที่ 4 เศษส่วน',subj:'คณิตศาสตร์',full:10,assigned:'2026-11-02',due:'2026-11-04',closed:false,rate:68,aw:2},
  {id:'m9',t:'wk',title:'ใบงาน 6 สมการ',subj:'คณิตศาสตร์',full:10,assigned:'2026-11-02',due:'2026-11-05',closed:false,rate:28,aw:0},
  {id:'m10',t:'pj',title:'ชิ้นงาน โมเดลเรขาคณิต',subj:'คณิตศาสตร์',full:30,assigned:'2026-10-29',due:'2026-11-12',closed:false,rate:18,aw:8},
  {id:'m11',t:'wk',title:'ใบงาน 7 อัตราส่วน',subj:'คณิตศาสตร์',full:10,assigned:'2026-11-03',due:'2026-11-14',closed:false,rate:0,aw:0},
  {id:'m12',t:'ac',title:'กิจกรรม สำรวจรูปทรง',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-10',due:null,closed:false,rate:40,aw:0},
  {id:'s1',t:'ex',title:'แบบฝึกหัด 12 แรงและการเคลื่อนที่',subj:'วิทยาศาสตร์',full:20,assigned:'2026-10-28',due:'2026-11-02',closed:false,rate:70,aw:0},
  {id:'s2',t:'pj',title:'ชิ้นงาน โมเดลระบบสุริยะ',subj:'วิทยาศาสตร์',full:30,assigned:'2026-10-29',due:'2026-11-12',closed:false,rate:18,aw:3},
  {id:'s3',t:'qz',title:'สอบย่อย บทที่ 2',subj:'วิทยาศาสตร์',full:20,assigned:'2026-11-03',due:'2026-11-06',closed:false,rate:0,aw:0},
  {id:'s4',t:'ac',title:'กิจกรรม สำรวจพืช',subj:'วิทยาศาสตร์',full:10,assigned:'2026-10-10',due:null,closed:false,rate:40,aw:0},
  {id:'m13',t:'hw',title:'การบ้าน บทที่ 2 เลขยกกำลัง',subj:'คณิตศาสตร์',full:10,assigned:'2026-09-28',due:'2026-10-05',closed:true,rate:92,aw:0},
  {id:'m14',t:'ex',title:'แบบฝึกหัด 4 คูณหาร',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-14',due:'2026-10-19',closed:true,rate:88,aw:0},
  {id:'m15',t:'wk',title:'ใบงาน 5 ตัวประกอบ',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-19',due:'2026-10-26',closed:true,rate:58,aw:0},
  {id:'s5',t:'wk',title:'ใบงาน แรงเสียดทานและแรงโน้มถ่วง',subj:'วิทยาศาสตร์',full:10,assigned:'2026-10-05',due:'2026-10-12',closed:true,rate:93,aw:0},
  {id:'s6',t:'hw',title:'การบ้าน สารและการเปลี่ยนแปลง',subj:'วิทยาศาสตร์',full:10,assigned:'2026-10-14',due:'2026-10-21',closed:true,rate:74,aw:0},
  {id:'s7',t:'ex',title:'แบบฝึกหัด 10 วัฏจักรของน้ำ',subj:'วิทยาศาสตร์',full:10,assigned:'2026-09-21',due:'2026-09-28',closed:true,rate:97,aw:0},
  {id:'s8',t:'wk',title:'ใบงาน 9 ห่วงโซ่อาหาร',subj:'วิทยาศาสตร์',full:10,assigned:'2026-10-26',due:'2026-11-01',closed:false,rate:62,aw:0},
];
const GBEXC={c1:{m7:[7],m10:[30],s1:[7]}};
const dayDiff=(a,b)=>Math.round((Date.parse(a)-Date.parse(b))/864e5);
const gbRound=x=>Math.round(x*2)/2;
const gbTouch=()=>S.dev!=='desk';
const gbPortrait=()=>S.dev==='ipadP';
const gbList=()=>S.dev==='phone'||(S.dev==='ipadP'&&S.gb.lay==='C');

function gbGenCells(cid,w,k){
  const tot=CL(cid).total,cidx=CLASSES.findIndex(c=>c.id===cid),arr=[null];
  const exc=((GBEXC[cid]||{})[w.id])||[];
  let aw=w.aw;
  const order=ord(tot);
  const subbed=new Set();
  for(let n=1;n<=tot;n++){const h=(n*37+k*11+cidx*13)%100;if(h<w.rate)subbed.add(n)}
  const awSet=new Set(order.filter(n=>subbed.has(n)&&!exc.includes(n)).slice(0,aw));
  for(let n=1;n<=tot;n++){
    if(exc.includes(n)){arr.push({k:'exc',score:null,recv:null});continue}
    if(!subbed.has(n)){arr.push({k:'none',score:null,recv:null});continue}
    let recv=w.due?shift(w.due,((n+k)%5)-2):shift(w.assigned,n%6);
    if(recv<w.assigned)recv=w.assigned;if(recv>TODAY)recv=TODAY;
    const score=awSet.has(n)?null:Math.max(0,gbRound(w.full-((n*3+k)%5)*(w.full/10)));
    arr.push({k:'sub',score,recv});
  }
  return arr;
}
function gbCells(cid,aid){
  const key=cid+'|'+aid;
  if(!S.gb.cells[key]){const k=S.gb.works.findIndex(x=>x.id===aid);S.gb.cells[key]=gbGenCells(cid,S.gb.works[k],k<0?0:k)}
  return S.gb.cells[key];
}
const gbWork=id=>S.gb.works.find(w=>w.id===id);
function gbSt(w,c){
  if(c.k==='exc')return'exc';
  if(c.k==='sub'){if(c.score==null)return'await';return(w.due&&c.recv>w.due)?'late':'ok'}
  return((w.due&&w.due<TODAY)||w.closed)?'miss':'pend';
}
function gbCount(cid,w){
  const cs=gbCells(cid,w.id),tot=CL(cid).total;let sub=0,exc=0,aw=0,miss=0;
  for(let n=1;n<=tot;n++){const s=gbSt(w,cs[n]);if(s==='exc')exc++;else if(s==='await'){sub++;aw++}else if(s==='ok'||s==='late')sub++;else if(s==='miss')miss++}
  return{sub,exc,aw,miss,tot:tot-exc,all:tot};
}
function gbVisible(){
  const g=S.gb;
  return g.works.filter(w=>(!g.subj||w.subj===g.subj)&&(!g.type||w.t===g.type)&&!g.hidT.includes(w.t)&&(g.period==='term'||(w.assigned||'').slice(0,7)===g.month))
    .sort((a,b)=>a.assigned.localeCompare(b.assigned)||a.id.localeCompare(b.id,'en',{numeric:true}));
}
function gbRowsList(ws){
  const g=S.gb,cid=g.cls,tot=CL(cid).total,out=[];
  for(let n=1;n<=tot;n++){
    if(g.rows!=='all'){
      const st=ws.map(w=>gbSt(w,gbCells(cid,w.id)[n]));
      if(g.rows==='miss'&&!st.includes('miss'))continue;
      if(g.rows==='aw'&&!st.includes('await'))continue;
    }
    out.push(n);
  }
  return out;
}
function gbTotal(cid,n,ws){
  let sc=0,fs=0,star=false;
  ws.forEach(w=>{
    if(w.hid){star=true;return}
    const c=gbCells(cid,w.id)[n],s=gbSt(w,c);
    if(s==='ok'||s==='late'){sc+=c.score;fs+=w.full}else if(s==='miss'){fs+=w.full}
  });
  return{sc,fs,star,pct:fs?Math.round(sc/fs*100):null};
}
function gbNameCell(n){
  const full=fullName(n);
  return gbPortrait()||gbList()?`<span class="gb-no">${n}</span><span class="gb-nm" title="${full}">${nick(n)} ส.</span>`:`<span class="gb-no">${n}</span><span class="gb-nm" title="${full}">${full}</span>`;
}
function gbDueText(w){
  if(!w.due)return{t:'ไม่มีกำหนดส่ง',over:false};
  const d=dayDiff(TODAY,w.due);
  if(w.closed)return{t:fmtS(w.due),over:false,lock:true};
  if(d>0)return{t:`เลยกำหนด ${d} วัน`,short:fmtS(w.due),over:true};
  if(d===0)return{t:'ครบกำหนดวันนี้',short:fmtS(w.due),over:false,today:true};
  return{t:`กำหนด ${fmtS(w.due)}`,short:fmtS(w.due),over:false};
}
function gbDateText(w,recv){
  if(!w.due)return`ไม่มีกำหนดส่ง · รับ ${fmt(recv)}`;
  if(recv<=w.due)return`ส่งทันกำหนด · รับ ${fmt(recv)}`;
  return`ส่งช้า ${dayDiff(recv,w.due)} วัน · รับ ${fmt(recv)}`;
}

/* ---------- สถานะ ---------- */
function initGb(){
  const works=GBW0.map(w=>({...w}));
  S.gb={cls:'c1',subj:'คณิตศาสตร์',type:'',period:'term',month:'2026-11',group:'none',hidT:[],tot:true,bars:true,lay:'A',rows:'all',
    sel:'m8',foc:{aid:'m8',n:1},pop:null,sheet:null,form:null,works:S.scen==='empty'?[]:works,cells:{},log:[
      {t:'10:31',x:'ตั้ง “ยกเว้น” เลขที่ 7 · แบบฝึกหัด 5 เศษส่วน'},{t:'10:12',x:'ให้คะแนน เลขที่ 21 · 8/10 · การบ้าน บทที่ 4'},{t:'09:48',x:'อีกเครื่อง: ปิดรับ ใบงาน 4 ร้อยละ'}],
    folded:{},marks:{pend:[],fail:[],unsaved:[]},msg:'',gfold:{}};
  if(S.scen==='closed'){const w=gbWork('m8');if(w)w.closed=true}
  if(S.scen==='backdated'){const w=gbWork('m8');if(w){w.due='2026-10-30';w.assigned='2026-10-28'}}
  if(S.scen==='offline')S.gb.marks={pend:[['m8',5],['m8',9],['m7',3],['m10',12],['m10',13]],fail:[['m7',14],['m8',33]],unsaved:[['m8',21]]};
}
const gbMark=(aid,n)=>{const m=S.gb.marks;return m.fail.some(x=>x[0]===aid&&x[1]===n)?'fail':m.pend.some(x=>x[0]===aid&&x[1]===n)?'pend':m.unsaved.some(x=>x[0]===aid&&x[1]===n)?'uns':''};

/* ---------- หัวหน้า / แถบเครื่องมือ ---------- */
function gbHead(){
  const g=S.gb,c=CL(g.cls);
  return `<header class="pghead"><div class="hr"><span class="pgtile">${ic('notebook',24)}</span><div><h1>สมุดคะแนน</h1><div class="tip">${c.name} · ${g.subj||'ทุกวิชา'}</div></div></div>
   <div class="act">${syncBadge()}<button class="pill gb-term" aria-haspopup="listbox" data-a="toast" data-k="เลือกภาคเรียน (ของเดิม)">${ic('calendar-stats',16)}${gbTouch()?'เทอม 2/2569':'ภาคเรียนที่ 2/2569 · ปัจจุบัน'} ${ic('chevron-down',16)}</button>${prefsBtn()}<button class="primary" data-a="gbnew">${ic('plus',20)}สร้างงาน</button></div></header>`;
}
function gbToolbar(ws){
  const g=S.gb,rows=ws.length?null:null;
  const cnt={miss:0,aw:0};
  ws.forEach(w=>{const k=gbCount(g.cls,w);cnt.miss+=k.miss;cnt.aw+=k.aw});
  const nfilt=(g.type?1:0)+(g.period!=='term'?1:0)+(g.group!=='none'?1:0)+g.hidT.length+(g.tot?0:1)+(g.bars?0:1);
  const chips=CLASSES.map(x=>{
    const ws2=g.works.filter(w=>!g.subj||w.subj===g.subj);let s=0,t=0;ws2.forEach(w=>{const k=gbCount(x.id,w);s+=k.sub;t+=k.tot});
    const r=t?s/t:0,mark=r>=.85?ic('check',16):ic('circle-half-2',16);
    return `<button class="pill${x.id===g.cls?' on':''}" data-a="gbcls" data-k="${x.id}" aria-pressed="${x.id===g.cls}">${mark}${x.name} <span class="n">${x.total}</span></button>`}).join('');
  const subjMenu=`<span class="menu"><button data-a="menu" data-k="gbsubj" aria-haspopup="menu" aria-expanded="${S.menu==='gbsubj'}">วิชา: ${g.subj||'ทุกวิชา'} ${ic('chevron-down',16)}</button>${S.menu==='gbsubj'?`<div class="pop" role="menu">${['',...GBSUBJ].map(s=>`<button role="menuitem" class="${g.subj===s?'on':''}" data-a="gbsubj" data-k="${s}">${s||'ทุกวิชา'}</button>`).join('')}</div>`:''}</span>`;
  const seg=`<div class="seg" role="group" aria-label="กรองแถว"><button class="${g.rows==='all'?'on':''}" data-a="gbrows" data-k="all">ทุกคน</button><button class="${g.rows==='miss'?'on':''}" data-a="gbrows" data-k="miss">ค้างส่ง ${cnt.miss}</button><button class="${g.rows==='aw'?'on':''}" data-a="gbrows" data-k="aw">รอตรวจ ${cnt.aw}</button></div>`;
  return `<div class="gb-bar"><div class="chiprow gb-chips" role="group" aria-label="เลือกห้อง">${chips}</div>
   <div class="gb-tb">${subjMenu}<button data-a="gbfilter" aria-haspopup="dialog">${ic('adjustments',20)}ตัวกรอง${nfilt?` (${nfilt})`:''}</button>${seg}</div></div>`;
}

/* ---------- การ์ดแถบ ---------- */
function gbStrip(ws,zone){
  const g=S.gb,keys=cardOrder('gradebook',zone);if(!keys.length)return'';
  const sel=gbWork(g.sel);
  let sumS=0,sumT=0,aw=0,miss=0;ws.forEach(w=>{const k=gbCount(g.cls,w);sumS+=k.sub;sumT+=k.tot;aw+=k.aw;miss+=k.miss});
  const rate=sumT?Math.round(sumS/sumT*100):0;
  const awList=ws.map(w=>({w,k:gbCount(g.cls,w)})).filter(x=>x.k.aw>0);
  const clList=g.works.filter(w=>!w.closed&&((!w.due&&dayDiff(TODAY,w.assigned)>=14)||(w.due&&dayDiff(TODAY,w.due)>=7)));
  const tile=(k)=>{
    if(k==='sum')return `<div class="gb-tile sum" role="group" aria-label="สรุปห้อง">${gbTouch()?'':`<span>งาน <b>${ws.length}</b></span>`}<span>อัตราส่ง <b>${rate}%</b></span><button class="gb-n" data-a="gbrows" data-k="aw">รอตรวจ <b>${aw}</b></button><button class="gb-n" data-a="gbrows" data-k="miss">ค้างส่ง <b>${miss}</b> ชิ้น</button></div>`;
    if(k==='await')return `<span class="menu"><button class="gb-tile" data-a="menu" data-k="gbc-await" aria-expanded="${S.menu==='gbc-await'}">${ic('hourglass-empty',20)}รอตรวจ ${awList.length} งาน ${ic('chevron-down',16)}</button>${S.menu==='gbc-await'?`<div class="pop gb-list" role="menu">${awList.length?awList.map(x=>`<button role="menuitem" data-a="gbpickaw" data-k="${x.w.id}"><span class="grow">${x.w.title}</span><b>${x.k.aw}</b></button>`).join(''):'<div class="tip" style="padding:8px 10px">ไม่มีงานที่รอตรวจ</div>'}</div>`:''}</span>`;
    if(k==='closing')return `<span class="menu"><button class="gb-tile" data-a="menu" data-k="gbc-closing" aria-expanded="${S.menu==='gbc-closing'}">${ic('lock',20)}ควรปิดรับ ${clList.length} งาน ${ic('chevron-down',16)}</button>${S.menu==='gbc-closing'?`<div class="pop gb-list" role="menu">${clList.length?clList.map(w=>`<div class="gb-li"><span class="grow">${w.title}<div class="tip">${w.due?`เลยกำหนด ${dayDiff(TODAY,w.due)} วัน`:'ไม่มีกำหนด · สั่งมานานแล้ว'}</div></span><button data-a="gbclose" data-k="${w.id}">ปิดรับ</button></div>`).join(''):'<div class="tip" style="padding:8px 10px">ไม่มีงานที่ควรปิดรับ</div>'}</div>`:''}</span>`;
    if(k==='follow'){
      const rows=[];for(let n=1;n<=CL(g.cls).total;n++){let m=0;ws.forEach(w=>{if(gbSt(w,gbCells(g.cls,w.id)[n])==='miss')m++});if(m)rows.push([n,m])}
      rows.sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
      return `<span class="menu"><button class="gb-tile" data-a="menu" data-k="gbc-follow" aria-expanded="${S.menu==='gbc-follow'}">${ic('flag',20)}ต้องติดตาม ${rows.length} คน ${ic('chevron-down',16)}</button>${S.menu==='gbc-follow'?`<div class="pop gb-list" role="menu">${rows.slice(0,8).map(r=>`<button role="menuitem" data-a="gbrows" data-k="miss"><span class="grow">${r[0]} ${nick(r[0])}</span><b>ค้าง ${r[1]}</b></button>`).join('')}</div>`:''}</span>`;
    }
    return'';
  };
  const bottom=k=>{
    if(k==='dist'){
      if(!sel)return'';const cs=gbCells(g.cls,sel.id),bins=[0,0,0,0,0];let sc=0,c=0;
      for(let n=1;n<=CL(g.cls).total;n++){const x=cs[n];if(x.k==='sub'&&x.score!=null){const p=x.score/sel.full*100;bins[p<50?0:p<60?1:p<70?2:p<80?3:4]++;sc+=x.score;c++}}
      const mx=Math.max(1,...bins);
      return `<section class="card gb-bcard" aria-label="การกระจายคะแนน"><b>${ic('chart-histogram',20)} การกระจายคะแนน · ${sel.title}</b> <span class="tip">เฉลี่ย ${c?(sc/c).toFixed(1):'–'}/${sel.full}</span><div class="gb-hist">${['<50','50–59','60–69','70–79','80+'].map((l,i)=>`<div><i style="height:${Math.round(bins[i]/mx*48)+2}px"></i><small>${bins[i]}</small><small>${l}</small></div>`).join('')}</div></section>`;
    }
    if(k==='recent')return `<section class="card gb-bcard" aria-label="แก้ไขล่าสุด"><b>${ic('clock',20)} แก้ไขล่าสุด</b>${g.log.slice(0,5).map(r=>`<div class="gb-log"><span class="tip">${r.t}</span> ${r.x}</div>`).join('')}</section>`;
    if(k==='legend')return `<div class="gb-legend" role="note" aria-label="คำอธิบายสัญลักษณ์"><span><i class="lg ok"></i>มีคะแนน</span><span><i class="lg late"></i>ส่งช้า</span><span><i class="lg aw">✓</i>รอตรวจ</span><span><i class="lg miss">–</i>ค้างส่ง</span><span><i class="lg pend">·</i>ยังไม่ถึงกำหนด</span><span><i class="lg exc"></i>ไม่นับ (ยกเว้น)</span><span><i class="lg pd"></i>รอส่งขึ้นระบบ</span><span><i class="lg fl"></i>ส่งไม่สำเร็จ</span><span><i class="lg us"></i>ยังไม่ได้บันทึก</span></div>`;
    if(k==='help'&&!gbTouch())return `<div class="tip gb-help">${ic('keyboard',16)} ลูกศร เลื่อนช่อง · Enter หรือพิมพ์ตัวเลข กรอกคะแนน · Enter ไปคนถัดไป · Esc ปิด · Alt+Enter ดูสถานะ/วันที่รับ · Space ที่หัวคอลัมน์ = เลือกงาน</div>`;
    return'';
  };
  if(zone==='top')return `<div class="gb-strip" role="group" aria-label="การ์ดสรุป">${keys.map(tile).join('')}</div>`;
  return keys.map(bottom).join('');
}

/* ---------- แผงงานที่เลือก ---------- */
function gbWorkPanel(){
  const g=S.gb,w=gbWork(g.sel);
  if(!w)return `<div class="gb-work empty tip">แตะหัวคอลัมน์เพื่อเลือกงาน</div>`;
  const k=gbCount(g.cls,w),d=gbDueText(w),T=GBT[w.t],pct=k.tot?Math.round(k.sub/k.tot*100):0;
  const chip=w.closed?badge('muted',`ปิดรับ`,'lock'):d.over?badge('danger',d.t,'calendar-event'):d.today?badge('warning',d.t,'clock'):badge('muted',d.t,'calendar-event');
  return `<section class="gb-work" aria-label="งานที่เลือก">
   <div class="gb-wl"><span class="chip ${T.tc}">${ic(T.ic,14)} ${T.n}</span><b class="gb-wt" title="${w.title}">${w.title}</b><span class="tip">เต็ม ${w.full}</span>${chip}${w.hid?badge('warning','ซ่อนคะแนนบนจอ','eye-off'):''}</div>
   <div class="gb-wn"><span>ส่งแล้ว <b>${k.sub}/${k.tot}</b> (${pct}%)</span><span>รอตรวจ <b>${k.aw}</b></span><span>ค้าง <b>${k.miss}</b></span>${k.exc?`<span class="tip">ยกเว้น ${k.exc}</span>`:''}</div>
   <div class="gb-wb">
    <span class="menu"><button data-a="menu" data-k="gbbulk" aria-haspopup="menu" aria-expanded="${S.menu==='gbbulk'}">${ic('checks',20)}ทำทั้งห้อง ${ic('chevron-down',16)}</button>${S.menu==='gbbulk'?`<div class="pop" role="menu"><button role="menuitem" data-a="gbbulkgo" data-k="all">${ic('circle-check',20)}ทั้งห้องส่งแล้ว…</button><button role="menuitem" data-a="gbbulkgo" data-k="full">${ic('star',20)}ให้เต็มคนที่ส่ง…</button><button role="menuitem" class="dan" data-a="gbbulkgo" data-k="clear">${ic('eraser',20)}ล้างคะแนนทั้งงาน…</button></div>`:''}</span>
    <button data-a="gbclose" data-k="${w.id}">${ic(w.closed?'lock-open':'lock',20)}${w.closed?'เปิดรับงาน':'ปิดรับงาน'}</button>
    <button class="ib" data-a="gbeye" aria-label="${w.hid?'แสดงคะแนนบนจอ':'ซ่อนคะแนนบนจอ'}" aria-pressed="${!!w.hid}" title="${w.hid?'แสดงคะแนนบนจอ':'ซ่อนคะแนนบนจอ'}">${ic(w.hid?'eye-off':'eye',20)}</button>
    <span class="menu"><button class="ib" data-a="menu" data-k="gbmore" aria-label="จัดการงาน" aria-haspopup="menu" aria-expanded="${S.menu==='gbmore'}">${ic('dots-vertical',20)}</button>${S.menu==='gbmore'?`<div class="pop right" role="menu"><button role="menuitem" data-a="gbedit">${ic('edit',20)}แก้ไข</button><button role="menuitem" data-a="gbcopy">${ic('copy',20)}คัดลอกงาน</button><button role="menuitem" data-a="gbeyeall">${ic('eye-off',20)}ซ่อน/แสดงคะแนนทุกงาน</button><button role="menuitem" class="dan" data-a="gbdel">${ic('trash',20)}ลบงาน…</button></div>`:''}</span>
   </div></section>`;
}
function gbBanner(){
  const m=S.gb.marks,w=gbWork(S.gb.sel);const out=[];
  if(m.pend.length+m.fail.length+m.unsaved.length>0)out.push(`<div class="banner" role="status">${ic('cloud-upload',20)}<span class="grow"><b>ค้างในเครื่องนี้</b> · รอส่งขึ้นระบบ ${m.pend.length} · ส่งไม่สำเร็จ ${m.fail.length} · ยังไม่ได้บันทึก ${m.unsaved.length}</span><button data-a="gbretry">ลองใหม่</button></div>`);
  if(S.scen==='closed'&&w&&w.closed)out.push(`<div class="banner gb-closedbar" role="alert">${ic('lock',20)}<span class="grow"><b>งานนี้ถูกปิดรับจากอีกเครื่อง</b> — ให้คะแนนในสมุดคะแนนได้ แต่สแกนรับงานเพิ่มไม่ได้</span></div>`);
  return out.join('');
}

/* ---------- ตาราง ---------- */
function gbCols(ws){
  const g=S.gb;
  if(g.group==='none')return ws.map(w=>({t:'w',w}));
  const key=w=>g.group==='type'?w.t:(w.assigned||'').slice(0,7);
  const label=k=>g.group==='type'?GBT[k].n:(GBMON[k]||k);
  const order=[...new Set(ws.map(key))],out=[];
  order.forEach(k=>{const items=ws.filter(w=>key(w)===k);const folded=!!g.gfold[g.group+k];out.push({t:'g',k,label:label(k),items,folded});if(!folded)items.forEach(w=>out.push({t:'w',w,gk:k}))});
  return out;
}
function gbHeadCell(w,sel){
  const T=GBT[w.t],g=S.gb,k=gbCount(g.cls,w),d=gbDueText(w),pct=k.tot?Math.round(k.sub/k.tot*100):0;
  const corner=w.closed?`<span class="gb-cn" title="ปิดรับ">${ic('lock',14)}</span>`:'';
  const eye=(sel||w.hid)?`<button class="gb-eye" data-a="gbeye2" data-k="${w.id}" aria-label="${w.hid?'แสดงคะแนนบนจอ':'ซ่อนคะแนนบนจอ'}">${ic(w.hid?'eye-off':'eye',16)}</button>`:'';
  return `<th class="gb-colw t-${T.tc}${sel?' sel':''}" scope="col" data-aid="${w.id}"><button class="gb-hbtn" data-a="gbsel" data-k="${w.id}" aria-pressed="${sel}" aria-label="${T.n}: ${w.title} · เต็ม ${w.full} · ${d.t} · ส่งแล้ว ${pct}%">
   <span class="gb-ht"><i class="gb-shape">${ic(T.ic,14)}</i><b>${w.title}</b></span>
   <span class="gb-hm">เต็ม ${w.full} · <u class="${d.over?'over':''}">${d.short||d.t}</u></span>
   ${gbTouch()?`<span class="gb-h3">ส่งแล้ว ${k.sub}/${k.tot}</span>`:''}</button>${corner}${eye}<span class="gb-hbar"${g.bars?'':' hidden'}><i style="width:${pct}%"></i></span></th>`;
}
function gbCellBtn(w,n){
  const g=S.gb,cs=gbCells(g.cls,w.id),c=cs[n],st=gbSt(w,c),mk=gbMark(w.id,n),foc=g.foc.aid===w.id&&g.foc.n===n;
  let tx=st==='ok'||st==='late'?c.score:st==='await'?'✓':st==='miss'?'–':st==='pend'?'·':'ยกเว้น';
  if(w.hid&&(st==='ok'||st==='late'))tx='•••';
  const lab={ok:`${c.score} คะแนน`,late:`${c.score} คะแนน ส่งช้า`,await:'รับงานแล้ว รอตรวจ',miss:'ค้างส่ง',pend:'ยังไม่ถึงกำหนด',exc:'ยกเว้น'}[st];
  return `<td role="gridcell"><button class="gbc ${st}${mk?' mk-'+mk:''}${g.pop&&g.pop.aid===w.id&&g.pop.n===n?' open':''}" data-a="gbcell" data-k="${w.id}|${n}" data-cell="${w.id}|${n}" tabindex="${foc?0:-1}" aria-label="เลขที่ ${n} ${nick(n)} · ${w.title}: ${lab}${mk==='pend'?' · รอส่งขึ้นระบบ':mk==='fail'?' · ส่งไม่สำเร็จ':mk==='uns'?' · ยังไม่ได้บันทึก':''}">${tx}</button></td>`;
}
function gbTable(ws){
  const g=S.gb,cid=g.cls,cols=gbCols(ws),rows=gbRowsList(ws),tot=CL(cid).total;
  const showTot=g.tot&&!(gbPortrait()&&g.lay==='B');
  const grouped=g.group!=='none';
  const gh=grouped?`<tr class="gb-gh">${'<th class="gb-name gb-corner"></th>'}${cols.map(c=>c.t==='g'?`<th class="gb-gcell" colspan="${c.folded?1:c.items.length}"><button class="gb-gbtn" data-a="gbfold" data-k="${g.group}${c.k}" aria-expanded="${!c.folded}">${ic(c.folded?'chevron-right':'chevron-down',16)}${c.label} · ${c.items.length} งาน</button></th>`:'').join('')}${showTot?'<th class="gb-tot"></th>':''}</tr>`:'';
  const head=`<tr><th class="gb-name gb-corner" scope="col">เลขที่ · ชื่อ</th>${cols.map(c=>c.t==='w'?gbHeadCell(c.w,c.w.id===g.sel):`<th class="gb-colw gb-fold" scope="col"><div class="gb-ht"><b>รวม ${c.label}</b></div><span class="gb-hm">${c.items.length} งาน</span></th>`).join('')}${showTot?'<th class="gb-tot" scope="col"><div class="gb-ht"><b>สะสม</b></div></th>':''}</tr>`;
  const body=rows.map(n=>{
    const t=gbTotal(cid,n,ws),miss=ws.some(w=>gbSt(w,gbCells(cid,w.id)[n])==='miss');
    return `<tr class="gb-row"><th class="gb-name" scope="row"><div class="gb-nmw">${miss?'<i class="gb-red" aria-label="มีงานค้าง"></i>':''}${gbNameCell(n)}</div></th>${cols.map(c=>{
      if(c.t==='w')return gbCellBtn(c.w,n);
      let sc=0,fs=0;c.items.forEach(w=>{const x=gbCells(cid,w.id)[n],s=gbSt(w,x);if(!w.hid&&(s==='ok'||s==='late')){sc+=x.score;fs+=w.full}});
      return `<td class="gb-sumc"><button class="gbc ok" data-a="gbfold" data-k="${g.group}${c.k}" aria-label="เปิดกลุ่ม ${c.label}">${fs?sc+'/'+fs:'–'}</button></td>`}).join('')}${showTot?`<td class="gb-tot">${t.pct==null?'–':`<b>${t.pct}%</b><small>${t.sc}/${t.fs}${t.star?'*':''}</small>`}</td>`:''}</tr>`}).join('');
  const avg=`<tr class="gb-avg"><th class="gb-name" scope="row">เฉลี่ย · ส่งแล้ว</th>${cols.map(c=>{
    if(c.t!=='w')return'<td></td>';const k=gbCount(cid,c.w),cs=gbCells(cid,c.w.id);let s=0,m=0;for(let n=1;n<=tot;n++){const x=cs[n];if(x.k==='sub'&&x.score!=null){s+=x.score;m++}}
    return `<td><b>${m?(s/m).toFixed(1):'–'}</b><small>${k.sub}/${k.tot}${k.exc?' · ย '+k.exc:''}</small></td>`}).join('')}${showTot?'<td class="gb-tot"></td>':''}</tr>`;
  if(!rows.length)return `<div class="card empty gb-emptyrows">ไม่มีนักเรียนที่ตรงกับตัวกรองนี้ <button data-a="gbrows" data-k="all">ดูทุกคน</button></div>`;
  return `<div class="gb-scroll" id="gb-scroll" tabindex="-1"><table class="gb-t" role="grid" aria-label="สมุดคะแนน ${CL(cid).name}"><thead>${gh}${head}</thead><tbody>${body}</tbody><tfoot>${avg}</tfoot></table></div>`;
}
function gbMini(ws){
  const g=S.gb,w=gbWork(g.sel);if(!w)return'';
  const cid=g.cls,rows=gbRowsList(ws);
  return `<div class="gb-mlist">
   <div class="gb-pills" role="tablist" aria-label="เลือกงาน">${ws.map(x=>`<button class="pill${x.id===g.sel?' on':''}" role="tab" aria-selected="${x.id===g.sel}" data-a="gbsel" data-k="${x.id}">${x.title.length>12?x.title.slice(0,12)+'…':x.title}</button>`).join('')}</div>
   ${rows.map(n=>{const c=gbCells(cid,w.id)[n],st=gbSt(w,c),mk=gbMark(w.id,n);const tx=st==='ok'||st==='late'?(w.hid?'•••':c.score):st==='await'?'✓':st==='miss'?'–':st==='pend'?'·':'ยกเว้น';
    return `<div class="gb-mrow"><span class="gb-no">${n}</span><span class="gb-nm">${fullName(n)}</span><button class="gbc ${st}${mk?' mk-'+mk:''}" data-a="gbcell" data-k="${w.id}|${n}" data-cell="${w.id}|${n}" aria-label="เลขที่ ${n} ${nick(n)}: ${tx}">${tx}</button></div>`}).join('')}</div>`;
}

/* ---------- หน้า ---------- */
function gbHtml(){
  const g=S.gb;
  if(!g.works.length)return `<div class="gb-page">${gbHead()}${gbToolbar([])}<div class="card empty gb-empty"><div class="ei">${ic('notebook',32)}</div><b>ยังไม่มีงานในเงื่อนไขนี้</b><div class="tip">สร้างงานแรก แล้วค่อยให้คะแนนในตาราง</div><div style="margin-top:8px"><button class="primary" data-a="gbnew">${ic('plus',20)}สร้างงาน</button></div></div></div>`;
  const ws=gbVisible();
  if(!ws.find(w=>w.id===g.sel))g.sel=ws[0]?ws[0].id:null;
  if(!g.foc||!ws.find(w=>w.id===g.foc.aid))g.foc={aid:g.sel,n:1};
  return `<div class="gb-page">${gbHead()}${gbToolbar(ws)}${gbBanner()}${gbStrip(ws,'top')}${gbWorkPanel()}${ws.length?(gbList()?gbMini(ws):gbTable(ws)):'<div class="card empty">ไม่มีงานในเงื่อนไขนี้ <button data-a="gbfilter">เปลี่ยนตัวกรอง</button></div>'}${gbStrip(ws,'bottom')}</div>`;
}

/* ---------- ตัวแก้ไขช่อง ---------- */
function gbOpenPop(aid,n,opts={}){
  const g=S.gb,w=gbWork(aid),c=gbCells(g.cls,aid)[n];
  g.sel=aid;g.foc={aid,n};
  g.pop={aid,n,entry:c.score!=null?String(c.score):'',st:c.k==='sub'?'sub':c.k==='exc'?'exc':'none',recv:c.recv||null,dateOpen:false,err:'',conv:false,focus:'score',was:c.k};
  if(opts.digit!=null){g.pop.entry=String(opts.digit);if(g.pop.st!=='sub'){g.pop.conv=g.pop.st==='exc';g.pop.st='sub';g.pop.recv=g.pop.recv||TODAY}}
  if(opts.focus)g.pop.focus=opts.focus;
  S.menu=null;
}
function gbPopHtml(){
  const g=S.gb,p=g.pop;if(!p)return'';
  const w=gbWork(p.aid),T=GBT[w.t],c=gbCells(g.cls,p.aid)[p.n],mk=gbMark(p.aid,p.n);
  const recv=p.recv||TODAY;
  const days=[];for(let d=shift(TODAY,-6);d<=TODAY;d=shift(d,1))if(d>=w.assigned)days.push(d);
  const st=[['none','ยังไม่ส่ง','x'],['sub','ส่งแล้ว','check'],['exc','ยกเว้น','ban']];
  const inner=`<div class="gb-pophd"><b>เลขที่ ${p.n} ${fullName(p.n)}</b><div class="tip">${T.n}: ${w.title} · เต็ม ${w.full}</div></div>
   <div class="gb-pe"><input id="gb-entry" class="gb-entry" inputmode="decimal" autocomplete="off" aria-label="คะแนน" aria-invalid="${!!p.err}" value="${p.entry}" ${p.st==='sub'?'':'placeholder="–"'}><span class="gb-full">/ ${w.full}</span></div>
   ${p.err?`<div class="gb-err" role="alert">${p.err}</div>`:''}
   <div class="gb-quick" role="group" aria-label="คะแนนลัด">${[w.full,w.full-1,w.full-2,Math.round(w.full/2)].filter((x,i,a)=>x>=0&&a.indexOf(x)===i).map(x=>`<button data-a="gbquick" data-k="${x}">${x===w.full?'เต็ม ':''}${x}</button>`).join('')}</div>
   <div class="gb-state" role="radiogroup" aria-label="สถานะ">${st.map(s=>`<button role="radio" aria-checked="${p.st===s[0]}" class="${p.st===s[0]?'on':''}" data-a="gbstate" data-k="${s[0]}">${ic(s[2],18)}${s[1]}</button>`).join('')}</div>
   ${p.conv?`<div class="gb-note">${ic('info-circle',16)} จะเปลี่ยนจากยกเว้นเป็นส่งแล้ว</div>`:''}
   ${p.st==='sub'?`<div class="gb-date"><button data-a="gbdate" aria-expanded="${p.dateOpen}">${ic('calendar-event',16)}${gbDateText(w,recv)} ${ic('chevron-down',14)}</button>${p.dateOpen?`<div class="dgrid" role="group" aria-label="วันที่รับงาน">${days.map(d=>`<button class="${d===recv?'on':''}" data-a="gbrecv" data-k="${d}">${fmtS(d)}</button>`).join('')}</div>${w.due&&w.due<=TODAY&&w.due>=w.assigned?`<button class="gb-ondue" data-a="gbrecv" data-k="${w.due}">${ic('calendar-due',16)}ตามกำหนดส่ง · ${fmtS(w.due)}</button>`:''}`:''}</div>`:''}
   ${mk?`<div class="gb-mk ${mk}">${mk==='pend'?'รอส่งขึ้นระบบ':mk==='fail'?'ส่งไม่สำเร็จ — ':'ยังไม่ได้บันทึกลงเครื่อง'}${mk==='fail'?'<button data-a="gbretry">ลองใหม่</button>':''}</div>`:''}
   <div class="gb-popft"><button class="ghost" data-a="gbpopx">ปิด (Esc)</button><button class="primary" data-a="gbsave">${ic('check',20)}บันทึก${gbTouch()?'':' (Enter → คนถัดไป)'}</button></div>`;
  if(S.dev==='phone')return `<div class="sheetov" data-a="gbpopbg"><div class="asheet gb-sheet" role="dialog" aria-modal="true" aria-label="ให้คะแนน เลขที่ ${p.n}">${inner}</div></div>`;
  return `<div class="gb-popwrap" role="dialog" aria-label="ให้คะแนน เลขที่ ${p.n}">${inner}</div>`;
}
function gbSaveCell(next){
  const g=S.gb,p=g.pop;if(!p)return;
  const w=gbWork(p.aid),cs=gbCells(g.cls,p.aid),before={...cs[p.n]};
  const entryEl=document.getElementById('gb-entry');if(entryEl)p.entry=entryEl.value.trim();
  let cell;
  if(p.st==='none')cell={k:'none',score:null,recv:null};
  else if(p.st==='exc')cell={k:'exc',score:null,recv:null};
  else{
    let score=null;
    if(p.entry!==''){const v=parseFloat(p.entry);if(isNaN(v)||v<0||v>w.full||(v*2)%1!==0){p.err=`คะแนนต้อง 0–${w.full} (ทีละ 0.5)`;render();return}score=v}
    cell={k:'sub',score,recv:p.recv||(before.k==='sub'?before.recv:TODAY)};
  }
  cs[p.n]=cell;
  g.marks.unsaved=g.marks.unsaved.filter(x=>!(x[0]===p.aid&&x[1]===p.n));
  const stChanged=before.k!==cell.k,dateChanged=before.k==='sub'&&cell.k==='sub'&&before.recv!==cell.recv;
  g.log.unshift({t:'10:4'+(g.log.length%10),x:`${cell.k==='exc'?'ตั้ง “ยกเว้น”':cell.k==='none'?'ตั้ง “ยังไม่ส่ง”':cell.score==null?'รับงาน':'ให้คะแนน '+cell.score+'/'+w.full} เลขที่ ${p.n} · ${w.title}`});
  const prevPop=p;
  if(stChanged&&before.k!=='none'||dateChanged||(stChanged&&cell.k!=='sub')){
    const msg=dateChanged?`แก้วันที่รับเป็น ${fmtS(cell.recv)} แล้ว · ${gbDateText(w,cell.recv).split(' · ')[0]}`:cell.k==='exc'?`ตั้ง “ยกเว้น” เลขที่ ${p.n} แล้ว`:cell.k==='none'?`ตั้ง “ยังไม่ส่ง” เลขที่ ${p.n} แล้ว`:`บันทึกเลขที่ ${p.n} แล้ว`;
    const cid=g.cls,aid=p.aid,n=p.n;
    toast2(msg,{label:'เลิกทำ',fn:()=>{gbCells(cid,aid)[n]=before;S.toast=null;render()}});
  }
  if(next){
    const ws=gbVisible(),rows=gbRowsList(ws),i=rows.indexOf(p.n),nn=rows[i+1];
    if(nn!=null){gbOpenPop(p.aid,nn);g.foc={aid:p.aid,n:nn};render();return}
  }
  g.pop=null;g.refocus='cell';render();
}

/* ---------- dialogs / sheets ---------- */
function gbBulkCount(kind,w){
  const cs=gbCells(S.gb.cls,w.id),tot=CL(S.gb.cls).total;let n=0;
  for(let i=1;i<=tot;i++){const c=cs[i];
    if(kind==='all'&&c.k==='none')n++;
    if(kind==='full'&&c.k==='sub'&&c.score!==w.full)n++;
    if(kind==='clear'&&c.k==='sub')n++}
  return n;
}
function gbOverlays(){
  const g=S.gb;if(!g)return'';let o='';
  if(S.dlg&&S.dlg.t==='gbbulk'&&!gbWork(g.sel))S.dlg=null;
  if(S.dlg&&S.dlg.t==='gbbulk'){
    const d=S.dlg,w=gbWork(g.sel),n=gbBulkCount(d.kind,w),T={all:`ทั้งห้องส่งแล้ว ${n} คน?`,full:`ให้เต็ม ${n} คน?`,clear:`ล้างคะแนนทั้งงาน ${n} คน?`}[d.kind];
    const body={all:'ทำเครื่องหมายว่าส่งแล้วให้คนที่ยังไม่ส่ง · คนที่ยกเว้นไม่ถูกแตะ',full:`ให้คะแนนเต็ม ${w.full} กับคนที่ส่งแล้ว · คนที่ยกเว้นไม่ถูกแตะ`,clear:'เอาคะแนนและการส่งของทุกคนออก (ย้อนกลับได้ 5 วินาที) · คนที่ยกเว้นไม่ถูกแตะ'}[d.kind];
    const days=[];for(let x=shift(TODAY,-6);x<=TODAY;x=shift(x,1))if(x>=w.assigned)days.push(x);
    o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="gb-dh"><h2 id="gb-dh">${T}</h2><div><b>${w.title}</b> · ${CL(g.cls).name}</div><div class="tip">${body}</div>
     ${d.kind==='all'?`<div class="gb-dr"><b>วันที่รับงาน</b><div class="seg" role="group"><button class="${d.recv===TODAY?'on':''}" data-a="gbdrecv" data-k="${TODAY}">วันนี้</button><button class="${d.recv===shift(TODAY,-1)?'on':''}" data-a="gbdrecv" data-k="${shift(TODAY,-1)}">เมื่อวาน</button></div><div class="dgrid">${days.map(x=>`<button class="${x===d.recv?'on':''}" data-a="gbdrecv" data-k="${x}">${fmtS(x)}</button>`).join('')}</div><div class="tip">→ ${gbDateText(w,d.recv).split(' · ')[0]}</div></div>`:''}
     <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="gbdlgno" autofocus>ยกเลิก</button><button class="${d.kind==='clear'?'dan':'primary'}" data-a="gbdlgyes" ${n?'':'disabled'}>${n?({all:`ส่งแล้ว ${n} คน`,full:`ให้เต็ม ${n} คน`,clear:`ล้าง ${n} คน`}[d.kind]):'ไม่มีรายการที่ต้องเปลี่ยน'}</button></div></div></div>`;
  }
  if(S.dlg&&S.dlg.t==='gbclose'){
    const w=gbWork(S.dlg.aid),k=gbCount(g.cls,w);
    o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="gb-dh"><h2 id="gb-dh">ปิดรับ “${w.title}” ทุกห้อง?</h2><div>ยังไม่ส่ง ${k.miss+(w.due&&w.due>=TODAY?k.all-k.sub-k.exc-k.miss:0)} คน จะนับเป็นค้างส่ง</div><div class="tip">เปิดรับอีกครั้งได้ที่ปุ่มเดิม · สแกนรับงานเพิ่มไม่ได้เมื่อปิดรับ แต่ให้คะแนนในสมุดคะแนนได้</div><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="gbdlgno" autofocus>ยังไม่ปิด</button><button class="primary" data-a="gbdlgyes">ปิดรับงาน</button></div></div></div>`;
  }
  if(S.dlg&&S.dlg.t==='gbdel'){
    const w=gbWork(S.dlg.aid);
    o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="gb-dh"><h2 id="gb-dh">ลบงาน “${w.title}”?</h2><div class="tip">คะแนนที่บันทึกไว้จะถูกซ่อน · ลบแล้วกู้คืนในหน้านี้ไม่ได้</div><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="gbdlgno" autofocus>ยกเลิก</button><button class="dan" data-a="gbdlgyes">ลบงาน</button></div></div></div>`;
  }
  if(S.dlg&&S.dlg.t==='gbraise'){
    const d=S.dlg;
    o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="gb-dh"><h2 id="gb-dh">ปรับคนที่ได้เต็ม ${d.n} คน?</h2><div>คะแนนเต็มเพิ่มจาก ${d.from} เป็น ${d.to}</div><div class="tip">คนที่เคยได้เต็ม ${d.from}/${d.from} จะ…</div><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="ghost" data-a="gbdlgno" autofocus>ยกเลิก</button><button data-a="gbraise" data-k="keep">คงไว้ ${d.from}/${d.to}</button><button class="primary" data-a="gbraise" data-k="adj">ปรับเป็น ${d.to}/${d.to}</button></div></div></div>`;
  }
  if(g.sheet==='filter')o+=gbFilterHtml();
  if(g.sheet==='asg')o+=gbFormHtml();
  o+=gbPopHtml();
  return o;
}
function gbFilterHtml(){
  const g=S.gb;
  const row=(l,h)=>`<div class="gb-fr"><div class="tip">${l}</div>${h}</div>`;
  const types=Object.entries(GBT);
  return `<div class="drawer-scrim" data-a="closeov"><div class="drawer gb-filter" role="dialog" aria-modal="true" aria-labelledby="gb-fh"><div class="drawer-head"><div><h2 class="t" id="gb-fh">ตัวกรองและคอลัมน์</h2><div class="xs">ใช้กับเครื่องนี้เท่านั้น</div></div><button class="icon ghost" data-a="closeov" aria-label="ปิด">${ic('x',20)}</button></div>
   ${row('ประเภทงาน',`<div class="chiprow"><button class="pill${g.type===''?' on':''}" data-a="gbtype" data-k="">ทุกประเภท</button>${types.map(([k,v])=>`<button class="pill${g.type===k?' on':''}" data-a="gbtype" data-k="${k}">${v.n}</button>`).join('')}</div>`)}
   ${row('ช่วงเวลา',`<div class="seg"><button class="${g.period==='term'?'on':''}" data-a="gbperiod" data-k="term">ทั้งเทอม</button><button class="${g.period==='month'?'on':''}" data-a="gbperiod" data-k="month">รายเดือน</button></div>${g.period==='month'?`<div class="chiprow" style="margin-top:6px">${Object.entries(GBMON).map(([k,v])=>`<button class="pill${g.month===k?' on':''}" data-a="gbmonth" data-k="${k}">${v}</button>`).join('')}</div>`:''}`)}
   ${row('จัดกลุ่มคอลัมน์',`<div class="seg"><button class="${g.group==='none'?'on':''}" data-a="gbgroup" data-k="none">ไม่จัดกลุ่ม</button><button class="${g.group==='type'?'on':''}" data-a="gbgroup" data-k="type">ตามประเภท</button><button class="${g.group==='month'?'on':''}" data-a="gbgroup" data-k="month">ตามเดือน</button></div>`)}
   ${row(`คอลัมน์ที่แสดง (${types.length-g.hidT.length}/${types.length})`,`<div class="gb-checks">${types.map(([k,v])=>`<button role="checkbox" aria-checked="${!g.hidT.includes(k)}" class="${g.hidT.includes(k)?'':'on'}" data-a="gbhidt" data-k="${k}">${ic(g.hidT.includes(k)?'plus':'check',16)}${v.n}</button>`).join('')}<button role="checkbox" aria-checked="${g.tot}" class="${g.tot?'on':''}" data-a="gbtot">${ic(g.tot?'check':'plus',16)}สะสม</button><button role="checkbox" aria-checked="${g.bars}" class="${g.bars?'on':''}" data-a="gbbars">${ic(g.bars?'check':'plus',16)}แถบความคืบหน้า</button></div><div class="tip">ซ่อนคอลัมน์เป็นแค่การแสดงผล · คะแนนสะสมยังคิดรวมทุกงาน</div>`)}
   ${S.dev==='ipadP'?row('iPad ตั้ง — ทางเลือกให้เทียบ <span class="badge-sa">ตัวเลือก</span>',`<div class="seg"><button class="${g.lay==='A'?'on':''}" data-a="gblay" data-k="A">ตารางแคบ (แนะนำ)</button><button class="${g.lay==='B'?'on':''}" data-a="gblay" data-k="B">ซ่อนสะสม</button><button class="${g.lay==='C'?'on':''}" data-a="gblay" data-k="C">ทีละงาน</button></div>`):''}
   <div class="row" style="justify-content:space-between;margin-top:10px"><button class="ghost" data-a="gbfreset">${ic('history',20)}คืนค่า</button><button class="primary" data-a="closeov">เสร็จ</button></div></div></div>`;
}
function gbOpenForm(mode){
  const g=S.gb,w=gbWork(g.sel);
  if(mode==='create')g.form={mode,t:'wk',title:'',subj:g.subj||'คณิตศาสตร์',full:10,unit:'',assigned:TODAY,due:shift(TODAY,3),cls:[g.cls],note:'',err:''};
  else g.form={mode,id:w.id,t:w.t,title:(mode==='copy'?w.title+' (สำเนา)':w.title),subj:w.subj,full:w.full,unit:'',assigned:mode==='copy'?TODAY:w.assigned,due:w.due,cls:[g.cls],note:'',err:'',orig:w.full};
  g.sheet='asg';S.menu=null;
}
function gbFormHtml(){
  const f=S.gb.form;if(!f)return'';
  const T=GBT[f.t];
  return `<div class="modal gb-modal"><div class="dlg gb-asg" role="dialog" aria-modal="true" aria-labelledby="gb-ah"><div class="row" style="justify-content:space-between"><h2 id="gb-ah">${f.mode==='edit'?'แก้ไขงาน':f.mode==='copy'?'คัดลอกงาน':'สร้างงานใหม่'}</h2><button class="icon ghost" data-a="closeov" aria-label="ปิด">${ic('x',20)}</button></div>
   <div class="gb-fr"><div class="tip">ประเภทงาน</div><div class="chiprow">${Object.entries(GBT).map(([k,v])=>`<button class="chip ${v.tc}${f.t===k?' gb-on':''}" data-a="gbftype" data-k="${k}" aria-pressed="${f.t===k}">${ic(v.ic,14)} ${v.n}</button>`).join('')}</div>${T.exam?`<div class="tip gb-examline">${ic('info-circle',14)} ประเภทสอบ: แสดงคะแนนบนจอตามปกติ — ซ่อนได้ที่ไอคอนตา <span class="badge-sa">ตัวเลือก</span></div>`:''}</div>
   <label class="gb-fl">ชื่องาน / เรื่อง<input data-f="title" value="${f.title.replace(/"/g,'&quot;')}" placeholder="เช่น ใบงาน 8 การบวกเศษส่วน"></label>
   <div class="gb-f3"><label class="gb-fl">วิชา<select data-f="subj">${GBSUBJ.map(s=>`<option${s===f.subj?' selected':''}>${s}</option>`).join('')}</select></label><label class="gb-fl">คะแนนเต็ม<input data-f="full" inputmode="numeric" value="${f.full}"></label><label class="gb-fl">หน่วย/บท<input data-f="unit" value="${f.unit}" placeholder="–"></label></div>
   <div class="gb-fr"><div class="tip">วันที่สั่งงาน: <b>${fmt(f.assigned)}</b></div><div class="tip">กำหนดส่ง: <b>${f.due?fmt(f.due):'ไม่มีกำหนด'}</b></div><div class="chiprow"><button class="pill${f.due===TODAY?' on':''}" data-a="gbfdue" data-k="0">วันนี้</button><button class="pill${f.due===shift(TODAY,3)?' on':''}" data-a="gbfdue" data-k="3">+3 วัน</button><button class="pill${f.due===shift(TODAY,7)?' on':''}" data-a="gbfdue" data-k="7">+7 วัน</button><button class="pill${f.due===null?' on':''}" data-a="gbfdue" data-k="none">ไม่มีกำหนด</button></div>${f.due===null?'<div class="tip">ไม่มีกำหนด = นับเป็นค้างเมื่อปิดรับงาน</div>':''}</div>
   <div class="gb-fr"><div class="tip">มอบหมายให้ห้อง</div><div class="chiprow">${CLASSES.map(c=>`<button class="pill${f.cls.includes(c.id)?' on':''}" data-a="gbfcls" data-k="${c.id}" aria-pressed="${f.cls.includes(c.id)}">${f.cls.includes(c.id)?ic('check',14):''}${c.name}</button>`).join('')}</div></div>
   <label class="gb-fl">หมายเหตุ<input data-f="note" value="${f.note}" placeholder="–"></label>
   ${f.err?`<div class="gb-err" role="alert">${f.err}</div>`:''}
   <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px"><button class="ghost" data-a="closeov">ยกเลิก</button><button class="primary" data-a="gbfsave">บันทึกงาน</button></div></div></div>`;
}
function gbFormSave(){
  const g=S.gb,f=g.form;
  if(!f.title.trim()){f.err='ใส่ชื่องาน';return false}
  if(!(f.full>=1&&f.full<=100)){f.err='คะแนนเต็ม 1–100';return false}
  if(f.due&&f.due<f.assigned){f.err='วันกำหนดส่งต้องไม่ก่อนวันสั่งงาน';return false}
  if(!f.cls.length){f.err='เลือกอย่างน้อย 1 ห้อง';return false}
  f.err='';
  if(f.mode==='edit'&&f.full>f.orig){
    let n=0;CLASSES.forEach(c=>{const cs=gbCells(c.id,f.id);for(let i=1;i<=c.total;i++)if(cs[i].k==='sub'&&cs[i].score===f.orig)n++});
    if(n){S.dlg={t:'gbraise',n,from:f.orig,to:f.full};return 'raise'}
  }
  gbApplyForm(false);return true;
}
function gbApplyForm(adjust){
  const g=S.gb,f=g.form;
  if(f.mode==='edit'){
    const w=gbWork(f.id);
    if(adjust)CLASSES.forEach(c=>{const cs=gbCells(c.id,f.id);for(let i=1;i<=c.total;i++)if(cs[i].k==='sub'&&cs[i].score===f.orig)cs[i].score=f.full});
    Object.assign(w,{t:f.t,title:f.title.trim(),subj:f.subj,full:f.full,due:f.due});
    toast2(`แก้ไขงานแล้ว · ${w.title}`);
  }else{
    const id='n'+(g.works.length+1)+'_'+f.full;
    g.works.push({id,t:f.t,title:f.title.trim(),subj:f.subj,full:f.full,assigned:f.assigned,due:f.due,closed:false,rate:0,aw:0});
    g.sel=id;if(g.subj&&g.subj!==f.subj)g.subj=f.subj;
    toast2(`สร้างงานแล้ว · ${f.title.trim()}`);
  }
  g.sheet=null;g.form=null;S.dlg=null;
}

/* ---------- การกระทำ ---------- */
function gbSyncEntry(){const el=document.getElementById('gb-entry');if(el&&S.gb&&S.gb.pop)S.gb.pop.entry=el.value}
function gbAct(a,k,t,e){
  if(!a.startsWith('gb'))return false;
  const g=S.gb;gbSyncEntry();
  switch(a){
  case 'gbcls':g.cls=k;g.pop=null;break;
  case 'gbsubj':g.subj=k;S.menu=null;g.sel=null;break;
  case 'gbrows':g.rows=k;S.menu=null;break;
  case 'gbfilter':g.sheet='filter';S.menu=null;break;
  case 'gbtype':g.type=k;break;
  case 'gbperiod':g.period=k;break;
  case 'gbmonth':g.month=k;break;
  case 'gbgroup':g.group=k;break;
  case 'gbhidt':{const i=g.hidT.indexOf(k);if(i>=0)g.hidT.splice(i,1);else if(g.hidT.length<Object.keys(GBT).length-1)g.hidT.push(k);break}
  case 'gbtot':g.tot=!g.tot;break;
  case 'gbbars':g.bars=!g.bars;break;
  case 'gblay':g.lay=k;break;
  case 'gbfreset':g.type='';g.period='term';g.group='none';g.hidT=[];g.tot=true;g.bars=true;g.lay='A';break;
  case 'gbfold':g.gfold[k]=!g.gfold[k];break;
  case 'gbsel':g.sel=k;S.menu=null;break;
  case 'gbpickaw':g.sel=k;g.rows='aw';S.menu=null;break;
  case 'gbeye':case 'gbeye2':{const w=gbWork(a==='gbeye2'?k:g.sel);w.hid=!w.hid;toast2(w.hid?'ซ่อนคะแนนบนจอแล้ว · งานนี้ ('+w.title+')':'แสดงคะแนนบนจอแล้ว');break}
  case 'gbeyeall':{const all=g.works.every(w=>w.hid);g.works.forEach(w=>w.hid=!all);S.menu=null;toast2(all?'แสดงคะแนนบนจอทุกงานแล้ว':'ซ่อนคะแนนบนจอทุกงานแล้ว');break}
  case 'gbbulkgo':S.menu=null;S.dlg={t:'gbbulk',kind:k,recv:TODAY};break;
  case 'gbdrecv':S.dlg.recv=k;break;
  case 'gbclose':{const w=gbWork(k||g.sel);S.menu=null;if(w.closed){w.closed=false;toast2(`เปิดรับงานแล้ว · ${w.title}`)}else S.dlg={t:'gbclose',aid:w.id};break}
  case 'gbdel':S.menu=null;S.dlg={t:'gbdel',aid:g.sel};break;
  case 'gbdlgno':S.dlg=null;g.refocus='work';break;
  case 'gbdlgyes':{
    const d=S.dlg;S.dlg=null;
    if(d.t==='gbclose'){const w=gbWork(d.aid);w.closed=true;toast2(`ปิดรับงานแล้ว · ${w.title}`)}
    else if(d.t==='gbdel'){g.works=g.works.filter(w=>w.id!==d.aid);g.sel=null;toast2('ลบงานแล้ว')}
    else if(d.t==='gbbulk'){
      const w=gbWork(g.sel),cs=gbCells(g.cls,w.id),tot=CL(g.cls).total,snap=cs.map(x=>x&&{...x});let n=0;
      for(let i=1;i<=tot;i++){const c=cs[i];
        if(d.kind==='all'&&c.k==='none'){cs[i]={k:'sub',score:null,recv:d.recv};n++}
        else if(d.kind==='full'&&c.k==='sub'&&c.score!==w.full){cs[i]={...c,score:w.full};n++}
        else if(d.kind==='clear'&&c.k==='sub'){cs[i]={k:'none',score:null,recv:null};n++}}
      const lbl={all:`ทั้งห้องส่งแล้ว ${n} คน · รับ ${fmtS(d.recv)}`,full:`ให้เต็ม ${n} คน`,clear:`ล้างแล้ว ${n} รายการ`}[d.kind];
      g.log.unshift({t:'10:4'+(g.log.length%10),x:lbl+' · '+w.title});
      const key=g.cls+'|'+w.id;
      toast2(lbl,{label:'ย้อนกลับ',fn:()=>{S.gb.cells[key]=snap;S.toast=null;render()}});
    }
    g.refocus='work';break}
  case 'gbnew':gbOpenForm('create');break;
  case 'gbedit':gbOpenForm('edit');break;
  case 'gbcopy':gbOpenForm('copy');break;
  case 'gbftype':g.form.t=k;break;
  case 'gbfdue':g.form.due=k==='none'?null:shift(TODAY,+k);break;
  case 'gbfcls':{const c=g.form.cls,i=c.indexOf(k);if(i>=0)c.splice(i,1);else c.push(k);break}
  case 'gbfsave':{const r=gbFormSave();if(r===true){}break}
  case 'gbraise':{S.dlg=null;gbApplyForm(k==='adj');break}
  case 'gbretry':{g.marks={pend:g.marks.pend,fail:[],unsaved:[]};toast2('ส่งใหม่แล้ว');break}
  /* ตัวแก้ไขช่อง */
  case 'gbcell':{const [aid,n]=k.split('|');gbOpenPop(aid,+n);break}
  case 'gbpopx':g.pop=null;g.refocus='cell';break;
  case 'gbpopbg':if(e.target!==t)return true;g.pop=null;break;
  case 'gbquick':{g.pop.entry=String(k);if(g.pop.st!=='sub'){g.pop.conv=g.pop.st==='exc';g.pop.st='sub';g.pop.recv=g.pop.recv||TODAY}break}
  case 'gbstate':{const p=g.pop;p.st=k;p.conv=false;if(k==='sub'){p.recv=p.recv||TODAY}if(k!=='sub')p.entry='';p.focus='state';break}
  case 'gbdate':g.pop.dateOpen=!g.pop.dateOpen;break;
  case 'gbrecv':g.pop.recv=k;g.pop.dateOpen=false;break;
  case 'gbsave':gbSaveCell(!gbTouch());return true;
  default:return false;
  }
  render();return true;
}
function gbSim(k){
  const g=S.gb,ws=gbVisible();if(!ws.length)return;
  if(k==='gb-type'){
    const w=gbWork(g.sel)||ws[0],cs=gbCells(g.cls,w.id),tot=CL(g.cls).total;
    let n=0;for(let i=1;i<=tot;i++)if(cs[i].k==='sub'&&cs[i].score==null){n=i;break}
    if(!n)for(let i=1;i<=tot;i++)if(cs[i].k==='none'){n=i;break}
    if(!n){toast2('งานนี้กรอกครบทุกคนแล้ว');return}
    const was=cs[n].k;cs[n]={k:'sub',score:gbRound(w.full-1),recv:cs[n].recv||TODAY};g.foc={aid:w.id,n};
    g.log.unshift({t:'10:4'+(g.log.length%10),x:`ให้คะแนน ${cs[n].score}/${w.full} เลขที่ ${n} · ${w.title}`});
    toast2(`กรอกคะแนนเลขที่ ${n} แล้ว · ${cs[n].score}/${w.full}`);
  }else if(k==='gb-pick'){const i=ws.findIndex(w=>w.id===g.sel);g.sel=ws[(i+1)%ws.length].id}
  else if(k==='gb-exc'){const w=gbWork(g.sel),cs=gbCells(g.cls,w.id),before={...cs[7]};cs[7]={k:'exc',score:null,recv:null};const cid=g.cls,aid=w.id;toast2('ตั้ง “ยกเว้น” เลขที่ 7 แล้ว',{label:'เลิกทำ',fn:()=>{gbCells(cid,aid)[7]=before;S.toast=null;render()}})}
  else if(k==='gb-date'){const w=gbWork(g.sel),cs=gbCells(g.cls,w.id);let n=0;for(let i=1;i<=CL(g.cls).total;i++)if(cs[i].k==='sub'){n=i;break}if(!n)return;const before={...cs[n]};const nr=w.due&&w.due<=TODAY?w.due:shift(TODAY,-1);cs[n]={...before,recv:nr};g.foc={aid:w.id,n};const cid=g.cls,aid=w.id;toast2(`แก้วันที่รับเป็น ${fmtS(nr)} แล้ว · ${gbDateText(w,nr).split(' · ')[0]}`,{label:'เลิกทำ',fn:()=>{gbCells(cid,aid)[n]=before;S.toast=null;render()}})}
  else if(k==='gb-bulk'){if(gbWork(g.sel))S.dlg={t:'gbbulk',kind:'all',recv:TODAY}}
  else if(k==='gb-close'){const w=gbWork(g.sel);if(w&&!w.closed)S.dlg={t:'gbclose',aid:w.id};else toast2('งานนี้ปิดรับอยู่แล้ว')}
  else if(k==='gb-keys'){const w=gbWork(g.sel)||ws[0];g.foc={aid:w.id,n:Math.min(CL(g.cls).total,(g.foc.n||1)+2)};g.refocus='cell'}
}
function gbApplySub(){
  const g=S.gb,sub=curSub();
  g.pop=null;g.sheet=null;g.form=null;S.dlg=null;S.menu=null;
  if(S.scen==='empty'&&sub!=='table'&&sub!=='create'){}
  if(sub==='cell'){const w=gbWork(g.sel)||gbVisible()[0];if(w)gbOpenPop(w.id,12,{})}
  else if(sub==='work')S.menu='gbbulk';
  else if(sub==='bulk'){if(gbWork(g.sel))S.dlg={t:'gbbulk',kind:'all',recv:TODAY}}
  else if(sub==='close'){const w=gbWork(g.sel);if(w&&!w.closed)S.dlg={t:'gbclose',aid:w.id}}
  else if(sub==='filter')g.sheet='filter';
  else if(sub==='create')gbOpenForm('create');
  else if(sub==='edit'&&gbWork(g.sel))gbOpenForm('edit');
}

/* ---------- ตำแหน่ง popover + โฟกัส + ความสูงตาราง (เรียกหลัง render) ---------- */
function gbBeforeRender(){
  const sc=document.getElementById('gb-scroll');
  if(sc&&S.gb)S.gb._sc=[sc.scrollLeft,sc.scrollTop];
}
function gbAfterRender(){
  const g=S.gb,fr=$('#frame'),m=fr.querySelector('#main');if(!m)return;
  const sc=fr.querySelector('#gb-scroll');
  if(sc){
    const page=m.querySelector('.gb-page');let after=0;let el=sc.nextElementSibling;
    while(el){const cs=getComputedStyle(el);after+=el.offsetHeight+parseFloat(cs.marginTop||0)+parseFloat(cs.marginBottom||0);el=el.nextElementSibling}
    const avail=m.clientHeight-(sc.offsetTop-m.offsetTop)-after-parseFloat(getComputedStyle(m).paddingBottom)-8;
    const minH=Math.round(parseFloat(getComputedStyle(fr).getPropertyValue('--u'))*14);
    sc.style.height=Math.max(minH,avail)+'px';
    if(g._sc){sc.scrollLeft=g._sc[0];sc.scrollTop=g._sc[1]}
  }
  const wrap=fr.querySelector('.gb-popwrap');
  if(wrap&&g.pop){
    const cell=fr.querySelector(`[data-cell="${g.pop.aid}|${g.pop.n}"]`);
    const fb=fr.getBoundingClientRect(),scale=fb.width/fr.offsetWidth||1;
    if(cell){
      const cr=cell.getBoundingClientRect(),W=fr.offsetWidth,H=fr.offsetHeight,pw=wrap.offsetWidth,ph=wrap.offsetHeight;
      let x=(cr.left-fb.left)/scale,y=(cr.bottom-fb.top)/scale+4;
      if(y+ph>H-8)y=(cr.top-fb.top)/scale-ph-4;
      if(y<8)y=Math.max(8,H-ph-8);
      x=Math.min(Math.max(8,x),W-pw-8);
      wrap.style.left=x+'px';wrap.style.top=y+'px';
    }else{wrap.style.left='24px';wrap.style.top='80px'}
  }
  if(g.pop){
    const inp=document.getElementById('gb-entry');
    if(inp&&g.pop.focus==='score'){inp.focus();const l=inp.value.length;inp.setSelectionRange(l,l)}
    else if(g.pop.focus==='state'){const b=fr.querySelector('.gb-state button.on')||fr.querySelector('.gb-state button');if(b)b.focus()}
  }else if(g.refocus){
    const r=g.refocus;g.refocus=null;
    let target=null;
    if(r==='cell')target=fr.querySelector(`[data-cell="${g.foc.aid}|${g.foc.n}"]`);
    else if(r==='work')target=fr.querySelector('.gb-wb button');
    if(target)target.focus();
  }
}

/* ---------- คีย์บอร์ด (คอม) ---------- */
function gbCellEls(){return null}
R3ACT.push(gbAct);
document.addEventListener('keydown',e=>{
  if(S.page!=='gradebook'||!S.gb||S.dlg||S.prefsOpen)return;
  const g=S.gb,tg=e.target;
  if(g.pop){
    if(e.key==='Enter'&&tg&&tg.id==='gb-entry'){e.preventDefault();gbSyncEntry();gbSaveCell(!gbTouch())}
    return;
  }
  const cb=tg&&tg.closest?tg.closest('[data-cell]'):null;
  if(!cb)return;
  const [aid,ns]=cb.dataset.cell.split('|'),n=+ns;
  const ws=gbVisible(),cols=gbCols(ws).filter(c=>c.t==='w').map(c=>c.w.id),rows=gbRowsList(ws);
  let ci=cols.indexOf(aid),ri=rows.indexOf(n);
  const move=(nci,nri)=>{
    nci=Math.max(0,Math.min(cols.length-1,nci));nri=Math.max(0,Math.min(rows.length-1,nri));
    const na=cols[nci],nn=rows[nri],el=document.querySelector(`[data-cell="${na}|${nn}"]`);
    g.foc={aid:na,n:nn};
    if(el){cb.tabIndex=-1;el.tabIndex=0;el.focus();el.scrollIntoView&&el.scrollIntoView({block:'nearest',inline:'nearest'})}
  };
  if(S.dev==='desk'){
    if(e.key==='ArrowRight'){e.preventDefault();move(ci+1,ri);return}
    if(e.key==='ArrowLeft'){e.preventDefault();move(ci-1,ri);return}
    if(e.key==='ArrowDown'){e.preventDefault();move(ci,ri+1);return}
    if(e.key==='ArrowUp'){e.preventDefault();move(ci,ri-1);return}
    if(e.key==='Home'){e.preventDefault();move(0,ri);return}
    if(e.key==='End'){e.preventDefault();move(cols.length-1,ri);return}
    if(e.key==='PageDown'){e.preventDefault();move(ci,ri+10);return}
    if(e.key==='PageUp'){e.preventDefault();move(ci,ri-10);return}
  }
  if(e.key==='Enter'&&e.altKey){e.preventDefault();gbOpenPop(aid,n,{focus:'state'});render();return}
  if(/^[0-9.]$/.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();gbOpenPop(aid,n,{digit:e.key});render();return}
});
document.addEventListener('input',e=>{
  const t=e.target;if(!S.gb)return;
  if(t.id==='gb-entry'&&S.gb.pop){
    const p=S.gb.pop;p.entry=t.value;p.err='';
    if(t.value!==''&&p.st!=='sub'){p.conv=p.st==='exc';p.st='sub';p.recv=p.recv||TODAY;render()}
    return}
  if(t.dataset&&t.dataset.f&&S.gb.form){const f=t.dataset.f;S.gb.form[f]=f==='full'?(parseInt(t.value,10)||0):t.value}
});
document.addEventListener('change',e=>{const t=e.target;if(S.gb&&S.gb.form&&t.dataset&&t.dataset.f==='subj'){S.gb.form.subj=t.value}});

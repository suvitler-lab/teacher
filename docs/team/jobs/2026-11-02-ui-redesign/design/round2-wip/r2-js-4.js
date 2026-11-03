/* ===================== โหมดฉายจอ (D27) ===================== */
const PJPAGE={scan:['สแกนส่งงาน','scan'],attendance:['เช็คชื่อ','user-check'],random:['สุ่มชื่อ','dice-3'],reports:['รายงาน','chart-bar']};
function pjHtml(K){
  const P=S.pjPref||{th:'dark',sz:2},sz=+P.sz;
  const k=x=>Math.round(x*K);
  const [title,icon]=PJPAGE[S.page];
  let body='';
  if(S.page==='scan'){
    const sc=S.sc,a=AS(sc.asg),c=counts(sc.seats),last=sc.recent[0];
    body=`<div class="row" style="justify-content:space-between;align-items:flex-end;gap:16px">
      <div style="min-width:0"><div class="s2">${CL(sc.cls).name} · ${a.title}</div>${last?`<div class="big" style="font-size:${k(64)}px">น้อง${nick(last.n)} <span class="okmark" style="font-size:${k(40)}px">${ic('check',k(44))}ส่งแล้ว</span></div>`:`<div class="big" style="font-size:${k(64)}px;color:var(--pj-t2)">รอสแกน…</div>`}</div>
      <div style="text-align:right;flex:none"><div class="stat">ส่งแล้ว ${c.sub} จาก ${c.counted} คน</div><div class="pbar" style="margin-top:${k(8)}px"><div style="width:${c.counted?c.sub*100/c.counted:0}%"></div></div></div></div>
     <div class="seatp" role="group" aria-label="ผังเลขที่">${Object.keys(sc.seats).map(n=>{const s=sc.seats[n],d=['scored','late','await'].includes(s);return `<div class="${d?'d':''}" ${s==='exc'?'style="opacity:.35"':''}>${d?ic('check',k(26)):''}${n}</div>`}).join('')}</div>`;
  }else if(S.page==='attendance'){
    const A=S.at,m=curMap(),cls=CL(A.cls),c=attCounts(m,cls.total),here=c.p+c.l;
    const lastN=A.scans[0]?A.scans[0].n:Object.keys(m).filter(n=>m[n]==='p'||m[n]==='l').map(Number).slice(-1)[0];
    body=`<div class="row" style="justify-content:space-between;align-items:flex-end;gap:16px"><div style="min-width:0"><div class="s2">${cls.name} · ${dow(A.date)} ${fmtS(A.date)}</div>${lastN?`<div class="big" style="font-size:${k(48)}px">น้อง${nick(lastN)} <span class="okmark" style="font-size:${k(36)}px">${ic('check',k(40))}มาแล้ว</span></div>`:''}</div>
      <div style="text-align:right;flex:none"><div class="stat">มาแล้ว ${here} จาก ${cls.total} คน</div></div></div>
     <div class="seatp" role="group" aria-label="ผังเลขที่">${Array.from({length:cls.total},(_,i)=>i+1).map(n=>{const d=m[n]==='p'||m[n]==='l';return `<div class="${d?'d':''}">${d?`${n}${sz===1?`<small>${nick(n)}</small>`:''}`:n}</div>`}).join('')}</div>`;
  }else if(S.page==='reports'){
    body=rpPjBody(k);
  }else{
    const R=S.rd,cur=R.cur,block=rdBlock();
    if(block)body=`<div class="empty">ยังไม่มีรายชื่อ</div>`;
    else if(R.mode==='group'&&R.groups)body=`<div class="pgroups">${R.groups.map((g,i)=>`<div class="pcard"><b>กลุ่ม ${i+1}</b><div>${g.map(n=>nick(n)).join(' · ')}</div></div>`).join('')}</div>`;
    else if(R.mode==='pick'&&cur)body=`<div class="pcard" style="margin:auto;width:100%;display:flex;flex-direction:column;align-items:center;gap:${k(12)}px;padding:${k(30)}px"><span class="rbadge">${cur[0]}</span><div class="big">${cur.length>1?cur.map(n=>nick(n)).join(' · '):'น้อง'+nick(cur[0])}</div><div class="s2">เลขที่ ${cur.join(' · ')} · ${CL(R.cls).name}</div></div>`;
    else body=`<div class="empty">พร้อมสุ่ม — กด “${R.mode==='group'?'จับกลุ่ม':'สุ่มคนต่อไป'}”</div>`;
    body+=`<div style="display:flex;justify-content:center"><button class="pjbtn" data-a="rdgo">${ic(R.mode==='group'?'users-group':'dice-3',k(40))}${R.mode==='group'?'จับกลุ่ม':'สุ่มคนต่อไป'}</button></div>`;
  }
  const other=`<div class="other">${S.pjOther?`<div class="menu4" role="menu">${['scan','attendance','random','reports'].filter(p=>p!==S.page).map(p=>`<button role="menuitem" data-a="pjgo" data-k="${p}">${ic(PJPAGE[p][1],k(32))}${PJPAGE[p][0]}</button>`).join('')}<button role="menuitem" data-a="pjexitnow">${ic('x',k(32))}ออกจากโหมดฉายจอ</button></div>`:''}<button class="pjbtn sec" data-a="pjother" aria-expanded="${S.pjOther}" style="height:${k(64)}px;font-size:${k(26)}px">${ic('arrow-right',k(30))}ไปหน้าอื่น</button></div>`;
  return `<div class="pj" data-th="${P.th}" data-sz="${sz}" style="--k:${K}" role="region" aria-label="โหมดฉายจอ: ${title}"><div class="pjbar"><h1>${ic(icon,k(44))}${title}</h1><div class="row" style="gap:${k(16)}px">${offline()?`<span style="color:var(--pj-warn)">${ic('wifi-off',k(40))}</span>`:''}<span class="live"><i></i>กำลังฉายจอ</span><button class="exit" data-a="pjhold" aria-label="ออกจากโหมดฉายจอ — กดค้าง 1 วินาที">${ic('x',k(34))}</button></div></div>${S.pjHint?`<div class="hint" role="status">กดค้างเพื่อออกจากโหมดฉายจอ</div>`:''}<div class="body">${body}</div>${other}</div>`;
}
/* ===================== ปรับการ์ด (ทุกหน้า) ===================== */
function prefsDrawer(p){
  const P=S.prefs[p],defs=CARDS[p].keys;
  const rows=P.order.map((k,i)=>{const m=defs.find(x=>x.key===k),on=!P.hidden.includes(k);
    return `<div class="pref${on?'':' off'}"><span class="ic">${ic(on?m.icon:'eye-off',20)}</span><span class="grow"><div class="nm">${m.title}${m.sa?'<span class="badge-sa">ข้อเสนอ SA</span>':''}</div><div class="ds">${m.ds}</div></span>
     <button class="switch ${on?'on':''}" role="switch" aria-checked="${on}" aria-label="แสดงการ์ด ${m.title}" data-a="pt" data-k="${k}"><span class="knob"></span></button>
     <span class="mv"><button class="icon ghost" data-a="pm" data-k="${k}" data-d="-1" aria-label="เลื่อน ${m.title} ขึ้น" ${i===0?'disabled':''}>${ic('chevron-up',20)}</button><button class="icon ghost" data-a="pm" data-k="${k}" data-d="1" aria-label="เลื่อน ${m.title} ลง" ${i===P.order.length-1?'disabled':''}>${ic('chevron-down',20)}</button></span></div>`}).join('');
  return `<div class="drawer-scrim" data-a="closeov"><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="pd-h"><div class="drawer-head"><div><h2 class="t" id="pd-h">ปรับการ์ด · ${CARDS[p].title}</h2><div class="xs">เปิด/ปิดและเรียงการ์ด · บันทึกทันที ใช้กับทุกเครื่องที่เข้าสู่ระบบ</div></div><button class="icon ghost" aria-label="ปิด" data-a="closeov">${ic('x',20)}</button></div>
   <div class="lock">${ic('info-circle',16)} ปิดไม่ได้ (เพื่อกันข้อมูลหาย): ${p==='scan'?'ช่องสแกน · ผังเลขที่ · รายการส่งไม่สำเร็จ · แถบวันที่รับงาน':p==='att'?'ปุ่มสถานะ · ช่องเด็ก · แถบบันทึก · การ์ดข้อมูลชนกัน':p==='gradebook'?'ตาราง · แผงงานที่เลือก · ค้างในเครื่องนี้ · ตัวกรอง':p==='reports'?'ตัวกรอง · ชิปสถานะอัปเดต · ตารางรายบุคคล · ปุ่มพิมพ์/Excel/ฉายจอ':p==='students'?'ค้นหา · รายชื่อ · เลขที่ซ้ำ (เมื่อมี) · ปุ่มเพิ่ม/นำเข้า/สติกเกอร์':p==='settings'?'เมนูหมวด · แถบบันทึก · กู้คืน/ล้างข้อมูล':'เวทีสุ่ม · ปุ่มสุ่ม · แถบเหตุผลที่สุ่มไม่ได้'}</div>${rows}
   <div class="row" style="justify-content:space-between;margin-top:10px;flex-wrap:wrap"><button class="ghost" data-a="preset">${ic('history',20)}คืนค่าเริ่มต้น</button><button class="primary" data-a="closeov">เสร็จ</button></div></div></div>`;
}
const prefKey=()=>({scan:'scan',attendance:'att',random:'random',gradebook:'gradebook',reports:'reports',students:'students',settings:'settings'}[S.page]);
function overlays(){
  let o='';
  if(S.prefsOpen&&S.page!=='home')o+=prefsDrawer(prefKey());
  if(S.sheetMenu&&isNarrow())o+=sheetHtml();
  if(S.page==='gradebook'&&S.gb)o+=gbOverlays();
  if(S.page==='reports'&&S.rp)o+=rpOverlays();
  if(S.page==='students'&&S.st)o+=stOverlays();
  if(S.page==='settings'&&S.se)o+=seOverlays();
  if(S.page==='scan'&&S.sc.sheet!=null){
    const n=S.sc.sheet,r=S.sc.recent.find(x=>x.n===n),st=S.sc.seats[n],a=AS(S.sc.asg);
    o+=`<div class="sheetov" data-a="closeov"><div class="asheet" role="dialog" aria-modal="true" aria-label="ตัวเลือก เลขที่ ${n}"><div class="hd">เลขที่ ${n} ${nick(n)}</div><div class="tip">${st==='await'?'รับงานแล้ว · รอคะแนน':`ส่งแล้ว · ได้ ${r?r.score:'8'}/${a.full} · ${st==='late'?'ส่งช้า':'ตรงเวลา'}`}${r&&r.recv?' · รับ '+fmtS(r.recv):''}</div>
     <button data-a="shedit" data-k="${n}">${ic('pencil',24)}แก้คะแนน</button><button class="dan" data-a="shundo" data-k="${n}">${ic('arrow-back-up',24)}ยกเลิกการส่ง</button><button data-a="closeov">${ic('x',24)}ปิด</button></div></div>`;
  }
  if(S.dlg){
    if(S.dlg.t==='close'){const c=counts(S.sc.seats);o+=`<div class="modal"><div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dl-h"><h2 id="dl-h">ปิดรับ “${AS(S.sc.asg).title}” ทุกห้อง?</h2><div>ยังไม่ส่ง ${c.miss} คน จะนับเป็นค้าง · ปิดแล้วเปิดรับใหม่ได้ในสมุดคะแนน</div><div class="row" style="justify-content:flex-end"><button data-a="dlgno" autofocus>ยังไม่ปิด</button><button class="primary" data-a="dlgyes">ปิดรับงาน</button></div></div></div>`}
    if(S.dlg.t==='allp'){o+=`<div class="modal"><div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dl-h"><h2 id="dl-h">ให้ “มา” ${S.dlg.n} คนที่ยังไม่เช็ค?</h2><div>คนที่เช็คไว้แล้ว (สาย ลา ป่วย ขาด) ไม่ถูกเปลี่ยน</div><div class="row" style="justify-content:flex-end"><button data-a="dlgno" autofocus>ยกเลิก</button><button class="primary" data-a="dlgyes">ให้ “มา”</button></div></div></div>`}
  }
  if(S.toast)o+=`<div class="toast2" role="status"><span class="grow">${S.toast.text}</span>${S.toast.action?`<button data-a="toastact">${S.toast.action.label} (5)</button>`:''}</div>`;
  return o;
}
let toastT=null;
function toast2(text,action){S.toast={text,action};clearTimeout(toastT);toastT=setTimeout(()=>{S.toast=null;render()},action?5000:2600)}
/* ===================== render ===================== */
function curSub(){return S.sub[S.page]}
function pjOn(){return S.page!=='home'&&curSub()==='pj'}
function mainHtml(d){
  if(S.page==='home'){syncHome();return H.homeHtml(d)}
  if(S.page==='scan'){const s=curSub();return s==='setup'?setupHtml():s==='summary'?summaryHtml():liveHtml()}
  if(S.page==='attendance')return attHtml();
  if(S.page==='gradebook')return gbHtml();
  if(S.page==='reports')return rpHtml();
  if(S.page==='students')return stHtml();
  if(S.page==='settings')return seHtml();
  return randomHtml();
}
function render(){
  const d=F(),fr=$('#frame'),fit=$('#fit');
  fr.style.width=d.w+'px';fr.style.height=d.h+'px';fr.style.setProperty('--u',d.u+'px');fr.dataset.theme=S.theme;
  fr.className='frame '+S.dev+(d.touch?' touch':'')+(S.dev==='phone'?' phone narrow':'')+(isWide()?' wide':'');
  const avail=Math.min(window.innerWidth-24,1536);const sc=d.w>avail?avail/d.w:1;
  fr.style.transform=`scale(${sc})`;fit.style.width=(d.w*sc)+'px';fit.style.height=(d.h*sc)+'px';
  if(S.page==='gradebook'&&S.gb)gbBeforeRender();
  const old=fr.querySelector('#main');const st=old?old.scrollTop:0;
  const padx=S.dev==='phone'?14:(S.page==='gradebook'&&S.dev==='ipadP'?16:24),pady=S.dev==='phone'?96:40;
  if(pjOn()){
    const K=Math.min(d.h/768,d.w/1024);
    fr.innerHTML=pjHtml(K)+(S.toast?`<div class="toast2" role="status">${S.toast.text}</div>`:'');
  }else{
    const shell=d.shell==='rail'?railHtml():'';
    let ov=overlays();
    if(S.page==='home'){syncHome();
      if(H.S.page==='prefs')ov+=H.prefsHtml();if(H.S.page==='list')ov+=H.listHtml();if(H.S.page==='sheet'&&isNarrow())ov+=sheetHtml();
      if(H.S.toast)ov+=`<div class="toast" role="status">${ic('circle-check',18)}${H.S.toast}</div>`}
    fr.innerHTML=shell+`<main class="main" id="main" style="--padx:${padx}px;--pady:${pady}px">${mainHtml(d)}</main>`+(d.shell==='tabs'?tabsHtml():'')+ov;
    const rail=fr.querySelector('.rail');if(rail){fr.classList.remove('hide-gl');if(rail.scrollHeight>rail.clientHeight)fr.classList.add('hide-gl')}
    const nm=fr.querySelector('#main');if(nm)nm.scrollTop=st;
    if(S.page==='gradebook'&&S.gb)gbAfterRender();
  }
  ctl();
}
function ctl(){
  const g=(label,obj,cur,act)=>`<div class="g"><b>${label}</b>${Object.entries(obj).map(([k,v])=>`<button class="${k===String(cur)?'on':''}" data-c="${act}" data-k="${k}">${v}</button>`).join('')}</div>`;
  const pg={home:'หน้าหลัก',...PAGES};
  const subs=S.page==='home'?{main:'หน้าหลัก',prefs:'แผงปรับหน้าหลัก',list:'รายการจากตัวเลข',sheet:'เมนูมือถือ'}:SUBS[S.page];
  const cs=S.page==='home'?(H.S.page==='home'?'main':H.S.page):curSub();
  const sims={scan:[['scan-next','ยิงคนถัดไป'],['scan-dup','ยิงซ้ำ'],['scan-bad','ยิงเลขที่ไม่มี'],['scan-exc','ยิงเด็กที่ยกเว้น']],attendance:[['att-scan','ยิง QR ถัดไป']],random:[['rd-go','สุ่ม']],settings:[['se-dirty','แก้ชื่อโรงเรียน/เวลาสาย (แถบบันทึก)'],['se-stale','สลับสำรองเก่า/ใหม่'],['se-save','บันทึก']],students:[['st-dup','สลับเลขที่ซ้ำ'],['st-qr','ออก QR ใหม่ เลขที่ 17'],['st-search','ค้นหา “ฟ้า”'],['st-qrall','ออก QR ทั้งห้อง']],reports:[['rp-refresh','โหลดใหม่'],['rp-sort','เรียงตามสะสม'],['rp-follow','เปิดคนที่ค้างมากสุด'],['rp-stale','สลับอัปเดตไม่สำเร็จ']],gradebook:[['gb-type','กรอกคะแนนคนถัดไป'],['gb-pick','เลือกงานถัดไป'],['gb-exc','ตั้งยกเว้น เลขที่ 7'],['gb-date','แก้วันที่รับ (AC-16)'],['gb-bulk','ทั้งห้องส่งแล้ว'],['gb-close','ปิดรับงาน'],['gb-keys','ลูกศร → 2 ช่อง (คอม)']],home:[]}[S.page];
  $('#ctl').innerHTML=g('หน้า',pg,S.page,'page')+g('จอ',subs,cs,'sub')+g('อุปกรณ์',Object.fromEntries(Object.entries(DEV).map(([k,v])=>[k,v.label])),S.dev,'dev')+g('ธีม',{light:'สว่าง',dark:'มืด'},S.theme,'theme')+g('ตัวอักษร',{0:'ค่าเครื่อง',16:'16',18:'18',24:'24'},S.font,'font')+g('สถานการณ์',SCEN,S.scen,'scen')+(sims&&sims.length?`<div class="g sim"><b>จำลอง</b>${sims.map(s=>`<button data-c="sim" data-k="${s[0]}">${s[1]}</button>`).join('')}</div>`:'')+`<div class="g"><button data-c="reset">เริ่มใหม่</button></div>`;
  const d=F();$('#note').textContent=`${d.label} · ตัวอักษร ${d.u}px · ${S.theme==='dark'?'มืด':'สว่าง'} · ${SCEN[S.scen]} — ข้อมูลและชื่อสมมติ (วันนี้ = พุธ 4 พ.ย. 2569) · ปุ่มทุกอันกดได้ · ป้าย "ข้อเสนอ SA" / "ตัวเลือก" = ของที่รอตัดสินที่ Gate 2 · ฉายจอ: แนวนอนเหมาะที่สุด (D27)`;
  {const h=S.page==='home'?'home':S.page+(curSub()?'-'+curSub():'');if(location.hash!=='#'+h)history.replaceState(null,'','#'+h)}
}
function syncHome(){H.S.dev=S.dev;H.S.theme=S.theme;H.S.font=S.font;H.S.menu9=false;H.S.scen={offline:'offline',unchecked:'morning'}[S.scen]||'normal'}
function applySub(){
  if(S.page==='scan'){
    const s=S.sc;const sub=curSub();s.ended=false;
    if(sub==='type'){s.mode='type';s.started=true;if(!s.pend&&!s.closed){s.pend={n:nextMiss(s.seats)};s.entry='';s.err=''}}
    if(sub==='full'){s.mode='full';s.pend=null;s.started=true;if(!s.fb){const n=nextMiss(s.seats);scanCommit(n,'qr')}}
    if(sub==='pj'){if(s.mode==='type'){s.mode='later';toast2('โหมดกรอกคะแนนถูกสลับเป็น “รับงานก่อน” ระหว่างฉายจอ')}s.pend=null}
  }
  if(S.page==='attendance'){if(curSub()==='period')S.at.mode='period';else if(curSub()==='scan')S.at.mode='scan';else if(curSub()==='tap')S.at.mode='tap'}
  if(S.page==='random'){if(curSub()==='group')S.rd.mode='group';else if(curSub()==='pick')S.rd.mode='pick'}
  if(S.page==='gradebook'&&S.gb)gbApplySub();
  if(S.page==='reports'&&S.rp)rpApplySub();
  if(S.page==='students'&&S.st)stApplySub();
  if(S.page==='settings'&&S.se)seApplySub();
  if(curSub()==='pj'&&S.page!=='home')toast2('เปิดโหมดฉายจอแล้ว · คะแนนและเปอร์เซ็นต์รายคนถูกซ่อน');
}
function go(page,sub){
  S.page=page;S.menu=null;S.prefsOpen=false;S.sheetMenu=false;S.pjOther=false;S.dlg=null;
  if(page==='home'){if(sub)H.S.page=sub==='main'?'home':sub}
  else{S.sub[page]=sub||((S.sub[page]==='pj'||page==='gradebook'||page==='students'||page==='settings')?{scan:'type',attendance:'tap',random:'pick',gradebook:'table',reports:'main',students:'list',settings:'general'}[page]:S.sub[page]);applySub()}
}
function initAll(){initSc();initAt();initRd();initGb();initRp();initSt();initSe()}

/* ===================== รอบ 3 ภาค 2 · นักเรียน (st-) ===================== */
const ST_STATUS={active:'กำลังเรียน',moved:'ย้ายออก',inactive:'ไม่ใช้งาน',finished:'จบปีการศึกษา'};
const stCode=(cid,n)=>`${CLASSES.findIndex(c=>c.id===cid)+6}${String(n).padStart(3,'0')}`;
function initSt(){
  const roster={};
  CLASSES.forEach(c=>{roster[c.id]=[];for(let n=1;n<=c.total;n++)roster[c.id].push({n,code:stCode(c.id,n),status:'active',qrNew:n===3||n===17,left:null})});
  S.st={cls:'c1',q:'',sort:'n',dir:1,drawer:null,showMoved:false,form:null,imp:null,dup:false,roster:S.scen==='empty'?{c1:[],c2:[],c3:[]}:roster,
    moved:{c1:[{n:45,code:'6045',name:'ด.ช. ธนา สมมติ',status:'moved',left:'2026-10-20'},{n:46,code:'6046',name:'ด.ญ. ปลายฟ้า สมมติ',status:'inactive',left:'2026-09-30'}],c2:[],c3:[]},
    stats:S.scen==='offline'?'error':'ready',stk:{lay:21,scope:'all'},log:[{t:'วันนี้ 09:12',x:'ออก QR ใหม่ เลขที่ 17'},{t:'เมื่อวาน',x:'แก้ชื่อเล่น เลขที่ 8'},{t:'20 ต.ค.',x:'ย้ายออก เลขที่ 45'}]};
}
function stRows(){
  const s=S.st,cid=s.cls,ws=S.gb?S.gb.works:[];
  let rows=(s.roster[cid]||[]).map(r=>({...r,name:fullName(r.n),nick:nick(r.n),x:rpStudent(cid,r.n,ws)}));
  if(s.q.trim()){const q=s.q.trim().toLowerCase();rows=rows.filter(r=>r.name.toLowerCase().includes(q)||r.nick.toLowerCase().includes(q)||r.code.includes(q)||String(r.n)===q)}
  const key={n:r=>r.n,name:r=>r.nick,att:r=>r.x.attPct,miss:r=>r.x.miss}[s.sort];
  rows.sort((a,b)=>{const A=key(a),B=key(b);return(typeof A==='string'?A.localeCompare(B,'th'):A-B)*s.dir||a.n-b.n});
  return rows;
}
function stHead(){
  const s=S.st,c=CL(s.cls),n=(s.roster[s.cls]||[]).length;
  return `<header class="pghead"><div class="hr"><span class="pgtile">${ic('users',24)}</span><div><h1>นักเรียน</h1><div class="tip">${c.name} · ${n} คน</div></div></div>
   <div class="act">${syncBadge()}${prefsBtn()}<button class="${isNarrow()?'ib':''}" data-a="stimport" aria-label="นำเข้า Excel">${ic('table-import',20)}${isNarrow()?'':'นำเข้า Excel'}</button><button class="${isNarrow()?'ib':''}" data-a="ststickers" aria-label="พิมพ์สติกเกอร์ QR">${ic('printer',20)}${isNarrow()?'':'พิมพ์สติกเกอร์ QR'}</button><button class="primary" data-a="stadd">${ic('user-plus',20)}${isNarrow()?'เพิ่ม':'เพิ่มนักเรียน'}</button></div></header>`;
}
function stToolbar(){
  const s=S.st;
  const chips=CLASSES.map(x=>`<button class="pill${x.id===s.cls?' on':''}" data-a="stcls" data-k="${x.id}" aria-pressed="${x.id===s.cls}">${x.name} <span class="n">${(s.roster[x.id]||[]).length}</span></button>`).join('');
  const SORT={n:'เลขที่',name:'ชื่อ',att:'มาเรียน',miss:'ค้างส่ง'};
  const sort=`<span class="menu"><button data-a="menu" data-k="stsort" aria-haspopup="menu" aria-expanded="${S.menu==='stsort'}">${ic('arrows-sort',18)}เรียง: ${SORT[s.sort]}${s.dir===-1?' ↓':''} ${ic('chevron-down',16)}</button>${S.menu==='stsort'?`<div class="pop" role="menu">${Object.entries(SORT).map(([k,v])=>`<button role="menuitem" class="${s.sort===k?'on':''}" data-a="stsort" data-k="${k}">${v}${s.sort===k?(s.dir===1?' ↑':' ↓'):''}</button>`).join('')}</div>`:''}</span>`;
  return `<div class="gb-bar"><div class="chiprow" role="group" aria-label="เลือกห้อง">${chips}</div><div class="gb-tb"><label class="st-search">${ic('search',18)}<input aria-label="ค้นหานักเรียน" placeholder="ค้นหาชื่อ ชื่อเล่น รหัส หรือเลขที่" value="${s.q}" data-st="q"></label>${sort}<button class="pill${s.showMoved?' on':''}" data-a="stmoved" aria-pressed="${s.showMoved}">${ic(s.showMoved?'eye':'eye-off',16)}${s.showMoved?'ซ่อน':'แสดง'}คนที่ย้ายออก</button></div></div>`;
}
function stCards(rows){
  const s=S.st,cid=s.cls,all=s.roster[cid]||[];
  const def={
    sum:()=>{if(s.stats==='error')return `<div class="gb-tile sum" role="status">${ic('cloud-off',18)}โหลดสถิติไม่สำเร็จ (ออฟไลน์) <button class="gb-n" data-a="ststats">ลองอีกครั้ง</button></div>`;
      const full=all.filter(r=>rpStudent(cid,r.n,S.gb.works).miss===0).length,att=all.length?Math.round(all.reduce((a,r)=>a+rpStudent(cid,r.n,S.gb.works).attPct,0)/all.length):0,qr=all.filter(r=>r.qrNew).length;
      return `<div class="gb-tile sum" role="group" aria-label="สรุปห้อง"><span>ส่งงานครบ <b>${full}</b> คน</span><button class="gb-n" data-a="stsort" data-k="miss">มีงานค้าง <b>${all.length-full}</b> คน</button><span>มาเรียนเฉลี่ย <b>${att}%</b></span>${qr?`<span>${ic('qrcode',16)} QR ใหม่ <b>${qr}</b></span>`:''}</div>`},
    qr:()=>{const n=s.stk.scope==='new'?all.filter(r=>r.qrNew).length:all.length;return `<div class="gb-tile" role="group" aria-label="สติกเกอร์ QR">${ic('printer',18)}<div class="seg"><button class="${s.stk.lay===10?'on':''}" data-a="stlay" data-k="10">10 ดวง</button><button class="${s.stk.lay===21?'on':''}" data-a="stlay" data-k="21">21 ดวง</button><button class="${s.stk.lay===40?'on':''}" data-a="stlay" data-k="40">40 ดวง</button></div><div class="seg"><button class="${s.stk.scope==='all'?'on':''}" data-a="stscope" data-k="all">ทั้งห้อง</button><button class="${s.stk.scope==='new'?'on':''}" data-a="stscope" data-k="new">เฉพาะ QR ใหม่</button></div><span class="tip">${n} ดวง · ${Math.ceil(n/s.stk.lay)} แผ่น</span><button data-a="ststickers">พิมพ์</button></div>`},
    moved:()=>`<section class="card rp-card" aria-labelledby="st-mh"><h2 id="st-mh">${ic('user-off',20)} ย้ายออก / ไม่ใช้งาน (${(s.moved[cid]||[]).length})</h2>${(s.moved[cid]||[]).length?(s.moved[cid]).map(m=>`<div class="st-mrow"><span class="rp-frow"><span class="no">${m.n}</span><span class="grow">${m.name}<div class="tip">${ST_STATUS[m.status]} · ${fmtS(m.left)}</div></span><button class="ghost" data-a="stedit" data-k="${m.n}">แก้ไข</button></span></div>`).join(''):'<div class="tip">ไม่มี</div>'}</section>`,
    recent:()=>`<section class="card rp-card" aria-labelledby="st-rh"><h2 id="st-rh">${ic('history',20)} เพิ่ม/แก้ล่าสุด <span class="badge-sa">ข้อเสนอ SA</span></h2>${s.log.map(x=>`<div class="gb-log"><span class="tip">${x.t}</span> ${x.x}</div>`).join('')}</section>`,
  };
  const top=cardOrder('students','top').map(k=>def[k]?def[k]():'').join('');
  const side=cardOrder('students','side').map(k=>def[k]?def[k]():'').join('');
  return{top:top?`<div class="gb-strip">${top}</div>`:'',side};
}
function stRowMenu(r){
  const id='strow'+r.n,open=S.menu===id;
  return `<span class="menu"><button class="ib ghost" data-a="menu" data-k="${id}" aria-label="จัดการ ${r.name}" aria-haspopup="menu" aria-expanded="${open}">${ic('dots-vertical',20)}</button>${open?`<div class="pop right" role="menu"><button role="menuitem" data-a="stedit" data-k="${r.n}">${ic('edit',20)}แก้ไขข้อมูล</button><button role="menuitem" data-a="stqr" data-k="${r.n}">${ic('qrcode',20)}ออก QR ใหม่</button><button role="menuitem" data-a="stmove" data-k="${r.n}">${ic('arrow-right',20)}ย้ายห้อง</button><button role="menuitem" class="dan" data-a="stleave" data-k="${r.n}">${ic('user-off',20)}ย้ายออก / ไม่ใช้งาน</button></div>`:''}</span>`;
}
function stList(rows){
  const s=S.st,cid=s.cls;
  if(!CLASSES.length)return'';
  if(!(s.roster[cid]||[]).length)return `<div class="card empty gb-empty"><div class="ei">${ic('users',32)}</div><b>ยังไม่มีนักเรียนในห้องนี้</b><div class="tip">เพิ่มทีละคน หรือนำเข้าจากไฟล์ Excel/CSV ที่โรงเรียนให้มา</div><div class="row" style="justify-content:center;gap:8px;margin-top:8px"><button class="primary" data-a="stadd">${ic('user-plus',20)}เพิ่มนักเรียน</button><button data-a="stimport">${ic('table-import',20)}นำเข้า Excel</button></div></div>`;
  if(!rows.length)return `<div class="card empty">ไม่พบนักเรียนที่ค้นหา “${s.q}” <button class="ghost" data-a="stclearq">ล้างคำค้น</button></div>`;
  const head=isNarrow()?'':`<div class="st-h" role="row"><span class="c-no">เลขที่</span><span class="c-nm">ชื่อ - สกุล</span><span class="c-sub">ส่งงาน</span><span class="c-miss">ค้าง</span><span class="c-att">มาเรียน</span><span class="c-menu"></span></div>`;
  return `<div class="st-list" role="table" aria-label="รายชื่อ ${CL(cid).name}">${head}${rows.map(r=>{
    const pct=r.x.app?Math.round(r.x.sub/r.x.app*100):100;
    return `<div class="st-row${s.dup&&(r.n===12||r.n===21)?' dup':''}" role="row"><span class="c-no"><span class="av">${r.n}</span></span>
     <button class="c-nm st-name" data-a="stdrawer" data-k="${r.n}" aria-label="ดูข้อมูล ${r.name} เลขที่ ${r.n}"><span class="nm">${r.name}${r.qrNew?`<span class="hm-chip accent st-qrnew">${ic('qrcode',12)}QR ใหม่</span>`:''}</span><span class="tip">“${r.nick}” · รหัส ${r.code}</span></button>
     ${isNarrow()?`<span class="c-stat">${r.x.sub}/${r.x.app}${r.x.miss?` <b class="bad">ค้าง ${r.x.miss}</b>`:''} · มา ${r.x.attPct}%</span>`:`<span class="c-sub"><span class="mini"><i style="width:${pct}%;background:${pct>=85?'var(--fill-success)':'var(--fill-warning)'}"></i></span>${r.x.sub}/${r.x.app}</span><span class="c-miss">${r.x.miss?badge('danger',`ค้าง ${r.x.miss}`):''}</span><span class="c-att">${r.x.attPct}%</span>`}
     <span class="c-menu">${stRowMenu(r)}</span></div>`}).join('')}</div>`;
}
function stHtml(){
  const s=S.st;if(!S.gb)initGb();
  if(curSub()==='stickers')return stStickersHtml();
  const rows=stRows(),cards=stCards(rows);
  const dup=s.dup?`<div class="banner gb-closedbar" role="alert">${ic('alert-triangle',20)}<span class="grow"><b>เลขที่ซ้ำในห้องนี้:</b> เลขที่ 12 (ดวงดาว สมมติ, ปลาทอง สมมติ) — แก้เลขที่ให้ไม่ซ้ำ ไม่เช่นนั้นสแกนด้วยเลขที่จะเลือกคนไม่ได้</span><button data-a="stedit" data-k="12">แก้เลขที่</button></div>`:'';
  const movedInline=s.showMoved&&(s.moved[s.cls]||[]).length?`<div class="st-list" aria-label="ย้ายออก / ไม่ใช้งาน">${(s.moved[s.cls]).map(m=>`<div class="st-row off" role="row"><span class="c-no"><span class="av">${m.n}</span></span><span class="c-nm"><span class="nm">${m.name} ${badge('muted',ST_STATUS[m.status])}</span><span class="tip">รหัส ${m.code} · ออกเมื่อ ${fmtS(m.left)}</span></span><span class="c-sub"></span><span class="c-miss"></span><span class="c-att"></span><span class="c-menu"><button class="ib ghost" data-a="stedit" data-k="${m.n}" aria-label="แก้ไข ${m.name}">${ic('edit',20)}</button></span></div>`).join('')}</div>`:'';
  const body=isWide()&&cards.side?`<div class="st-grid two"><div>${stList(rows)}${movedInline}</div><div class="st-side">${cards.side}</div></div>`:`${stList(rows)}${movedInline}${cards.side}`;
  return `<div class="rp-page st-page">${stHead()}${stToolbar()}${dup}${cards.top}${body}</div>`;
}
function stStickersHtml(){
  const s=S.st,all=s.roster[s.cls]||[],list=s.stk.scope==='new'?all.filter(r=>r.qrNew):all,per=s.stk.lay;
  const cols=per===10?2:per===21?3:4;
  return `<div class="rp-page">${stHead()}
   <div class="banner" role="status">${ic('printer',20)}<button class="ghost" data-a="stback">${ic('arrow-left',18)}กลับ</button><div class="seg"><button class="${per===10?'on':''}" data-a="stlay" data-k="10">บัตร 10 ดวง</button><button class="${per===21?'on':''}" data-a="stlay" data-k="21">21 ดวง</button><button class="${per===40?'on':''}" data-a="stlay" data-k="40">40 ดวง</button></div><div class="seg"><button class="${s.stk.scope==='all'?'on':''}" data-a="stscope" data-k="all">ทั้งห้อง</button><button class="${s.stk.scope==='new'?'on':''}" data-a="stscope" data-k="new">เฉพาะ QR ใหม่</button></div><span class="grow tip">${list.length} ดวง · ${Math.ceil(list.length/per)} แผ่น</span><button class="primary" data-a="toast" data-k="เปิดหน้าต่างพิมพ์ของเครื่อง (จำลอง)">${ic('printer',20)}พิมพ์</button></div>
   ${list.length?`<div class="st-sheet" style="grid-template-columns:repeat(${cols},1fr)">${list.slice(0,per).map(r=>`<div class="st-qr${per===40?' s':''}"><div class="tip">${per===40?'':'โรงเรียนสมมติวิทยา'}</div><b>${fullName(r.n)}</b><div class="tip">ชั้น ${CL(s.cls).name} · เลขที่ ${r.n}</div><div class="tip">${r.code}</div><div class="st-qrimg" aria-hidden="true"></div></div>`).join('')}</div>${list.length>per?`<div class="tip" style="text-align:center">… อีก ${Math.ceil(list.length/per)-1} แผ่น</div>`:''}`:'<div class="card empty">ไม่มีบัตรให้พิมพ์ในเงื่อนไขนี้</div>'}</div>`;
}
function stDrawerHtml(){
  const s=S.st;if(s.drawer==null)return'';
  const n=s.drawer,r=(s.roster[s.cls]||[]).find(x=>x.n===n),x=rpStudent(s.cls,n,S.gb.works),a=x.att;
  return `<div class="drawer-scrim" data-a="closeov"><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="st-dh"><div class="drawer-head"><div><h2 class="t" id="st-dh">${fullName(n)}</h2><div class="xs">“${nick(n)}” · ${CL(s.cls).name} เลขที่ ${n} · รหัส ${r?r.code:''}${r&&r.qrNew?' · QR ใหม่':''}</div></div><button class="icon ghost" data-a="closeov" aria-label="ปิด">${ic('x',20)}</button></div>
   <div class="rp-tiles"><div><div class="l">ส่งงาน</div><div class="v">${x.sub}/${x.app}</div></div><div><div class="l">คะแนนสะสม</div><div class="v">${x.scorePct==null?'—':x.scorePct+'%'}</div></div><div><div class="l">มาเรียน</div><div class="v">${x.attPct}%</div></div></div>
   <div class="row" style="justify-content:space-between;margin-top:10px"><b>งานค้างส่ง ${x.missing.length} ชิ้น</b>${x.missing.length?`<button class="ghost" data-a="stline">${ic('copy',18)}คัดลอกไป LINE</button>`:''}</div>
   ${x.missing.length?x.missing.map(t=>`<div class="rp-mrow">${ic('alert-circle',16)} ${t}</div>`).join(''):`<div class="tip" style="color:var(--text-success)">ส่งงานครบ</div>`}
   <div style="margin-top:12px"><b>เช็คชื่อเทอมนี้</b><div class="legend2" style="margin-top:4px">${[['p','มา'],['l','สาย'],['v','ลา'],['k','ป่วย'],['a','ขาด']].map(([q,l])=>`<span><i style="background:var(--fill-${{p:'success',l:'warning',v:'accent',k:'purple',a:'danger'}[q]})"></i>${l} ${a[q]}</span>`).join('')}</div></div>
   <div style="margin-top:12px"><b>ประวัติล่าสุด</b>${(S.gb.log||[]).slice(0,3).map(y=>`<div class="gb-log"><span class="tip">${y.t}</span> ${y.x}</div>`).join('')}</div>
   <div class="row" style="justify-content:flex-end;margin-top:12px;gap:6px;flex-wrap:wrap"><button data-a="stqr" data-k="${n}">${ic('qrcode',20)}ออก QR ใหม่</button><button class="primary" data-a="stedit" data-k="${n}">${ic('edit',20)}แก้ไขข้อมูล</button></div></div></div>`;
}
function stFormHtml(){
  const f=S.st.form;if(!f)return'';
  const hist=f.mode==='edit'&&f.n<=40;
  return `<div class="modal gb-modal"><div class="dlg gb-asg" role="dialog" aria-modal="true" aria-labelledby="st-fh"><div class="row" style="justify-content:space-between"><h2 id="st-fh">${f.mode==='edit'?'แก้ไขนักเรียน':'เพิ่มนักเรียน'}</h2><button class="icon ghost" data-a="closeov" aria-label="ปิด">${ic('x',20)}</button></div>
   <div class="gb-f3"><label class="gb-fl">คำนำหน้า<select data-f="prefix">${['ด.ช.','ด.ญ.','นาย','น.ส.'].map(p=>`<option${p===f.prefix?' selected':''}>${p}</option>`).join('')}</select></label><label class="gb-fl">รหัสนักเรียน<input data-f="code" value="${f.code}"></label><label class="gb-fl">เลขที่<input data-f="number" inputmode="numeric" value="${f.number}"></label></div>
   <div class="gb-f3" style="grid-template-columns:1fr 1fr 1fr"><label class="gb-fl">ชื่อ<input data-f="first" value="${f.first}"></label><label class="gb-fl">สกุล<input data-f="last" value="${f.last}"></label><label class="gb-fl">ชื่อเล่น<input data-f="nick" value="${f.nick}"></label></div>
   <div class="gb-fr"><div class="tip">ห้อง</div><div class="chiprow">${CLASSES.map(c=>`<button class="pill${f.cls===c.id?' on':''}" data-a="stfcls" data-k="${c.id}" aria-pressed="${f.cls===c.id}" ${hist&&c.id!==f.cls?'disabled':''}>${c.name}</button>`).join('')}</div>${hist?`<div class="tip">${ic('lock',14)} ย้ายห้องไม่ได้ — มีประวัติส่งงาน/เช็คชื่อในห้องนี้แล้ว (D06) · ขึ้นปีใหม่ใช้ “เริ่มภาคเรียนใหม่” ในตั้งค่า</div>`:''}</div>
   <div class="gb-fr"><div class="tip">สถานะ</div><div class="chiprow">${Object.entries(ST_STATUS).map(([k,v])=>`<button class="pill${f.status===k?' on':''}" data-a="stfstatus" data-k="${k}" aria-pressed="${f.status===k}">${v}</button>`).join('')}</div>${f.status==='moved'||f.status==='inactive'?`<label class="gb-fl">ออกเมื่อ (เว้นว่าง = วันนี้)<input type="date" data-f="left" value="${f.left||''}" max="${TODAY}"></label>`:''}</div>
   ${f.mode==='edit'?`<div class="tip">QR ปัจจุบัน: •••• ${f.code} <button class="ghost" data-a="stqr" data-k="${f.n}">${ic('qrcode',16)}ออก QR ใหม่</button></div>`:''}
   ${f.err?`<div class="gb-err" role="alert">${f.err}</div>`:''}
   <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px"><button class="ghost" data-a="closeov">ยกเลิก</button><button class="primary" data-a="stfsave">บันทึก</button></div></div></div>`;
}
function stImportHtml(){
  const im=S.st.imp;if(!im)return'';
  const c=CL(S.st.cls);
  const preview=im.rows?`<div class="st-prev">
   <div class="chiprow">${badge('success','เพิ่มใหม่ 3','user-plus')}${badge('accent','แก้ข้อมูล 2','edit')}${badge('muted','เหมือนเดิม 39')}${badge('warning','ย้ายห้อง 1','arrow-right')}${badge('muted','กลับมาใช้งาน 0')}</div>
   ${im.checking?`<div class="tip">${ic('loader-2',16,'spin')} กำลังตรวจกับข้อมูลในระบบ…</div>`:im.fail?`<div class="gb-err" role="alert">ตรวจกับระบบไม่ได้ <button class="ghost" data-a="stimpcheck">ตรวจอีกครั้ง</button></div>`:''}
   <div class="gb-err" role="alert">${ic('alert-triangle',16)} ย้ายไม่ได้ 1 คน — เลขที่ 45 มีประวัติในห้อง ป.6/2 (D06) · ลบแถวนี้ออกก่อน หรือใช้ “เริ่มภาคเรียนใหม่”</div>
   <div class="gb-note">${ic('info-circle',16)} เลขที่ซ้ำกันในรายการ: 12 (2 คน) — แก้ในไฟล์แล้วนำเข้าใหม่ หรือแก้ทีหลังในหน้านี้</div>
   <div class="rp-tw st-ptw"><table class="rp-t"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>เลขที่</th><th>ผล</th></tr></thead><tbody>${[[6001,'ด.ช. ฟ้า สมมติ',1,'เหมือนเดิม'],[6002,'ด.ญ. ใบบัว สมมติ',2,'แก้ข้อมูล (ชื่อเล่น)'],[6045,'ด.ช. ธนา สมมติ',45,'ย้ายห้อง จาก ป.6/2 — ย้ายไม่ได้'],[6047,'ด.ญ. มะปราง สมมติ',12,'เพิ่มใหม่ · เลขที่ซ้ำ'],[6048,'ด.ช. ข้าวโพด สมมติ',47,'เพิ่มใหม่']].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="${/ไม่ได้|ซ้ำ/.test(r[3])?'bad':''}">${r[3]}</td></tr>`).join('')}<tr><td colspan="4" class="tip">… อีก 40 แถว</td></tr></tbody></table></div>
   <label class="st-conf"><input type="checkbox" data-st="confirm" ${im.confirm?'checked':''}> ตรวจแล้ว — ยอมรับการย้ายห้อง 1 คน และการแก้ข้อมูล 2 คน</label></div>`:'';
  const blocked=!im.rows||im.checking||im.fail||!im.confirm||true;
  return `<div class="modal gb-modal"><div class="dlg gb-asg st-imp" role="dialog" aria-modal="true" aria-labelledby="st-ih"><div class="row" style="justify-content:space-between"><h2 id="st-ih">นำเข้านักเรียน → ${c.name}</h2><button class="icon ghost" data-a="closeov" aria-label="ปิด">${ic('x',20)}</button></div>
   <div class="seg" role="tablist"><button role="tab" aria-selected="${im.tab==='file'}" class="${im.tab==='file'?'on':''}" data-a="stimptab" data-k="file">${ic('file-type-xls',16)}ไฟล์ .xlsx / .csv</button><button role="tab" aria-selected="${im.tab==='paste'}" class="${im.tab==='paste'?'on':''}" data-a="stimptab" data-k="paste">${ic('clipboard-text',16)}วางข้อความจาก Excel</button></div>
   ${im.tab==='file'?`<button class="st-drop" data-a="stimpfile">${ic('upload',28)}<b>${im.file?im.file:'เลือกไฟล์ .xlsx หรือ .csv'}</b><span class="tip">${im.file?'อ่านได้ 45 รายการ · แตะเพื่อเปลี่ยนไฟล์':'หรือลากไฟล์มาวางที่นี่ · ใช้ไฟล์รายชื่อจากโรงเรียนได้เลย'}</span></button><div class="tip">คอลัมน์ที่อ่าน: รหัส | คำนำหน้า ชื่อ สกุล | เลขที่ (ชื่อเล่นถ้ามี) · รหัสที่มีอยู่แล้วจะถูกอัปเดต · เกิน 200 แถวให้แบ่งไฟล์</div>`
   :`<textarea class="st-ta" aria-label="รายชื่อนักเรียนที่คัดลอกจาก Excel" placeholder="คัดลอกจาก Excel แล้ววางที่นี่&#10;6001\tด.ช. ฟ้า สมมติ\t1" data-st="paste">${im.paste||''}</textarea><div class="tip">คอลัมน์: รหัส | คำนำหน้า ชื่อ สกุล | เลขที่ · รหัสที่มีอยู่แล้วจะถูกอัปเดต</div>`}
   ${preview}
   <div class="row" style="justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap"><span class="tip">${im.rows?'อ่านได้ 45 รายการ':''}</span><span class="row" style="gap:6px"><button class="ghost" data-a="closeov">ยกเลิก</button><button class="primary" data-a="stimpgo" ${im.rows&&im.confirm&&!im.checking&&!im.fail?'':'disabled'} title="${blocked?'ยังมีรายการที่ย้ายไม่ได้ — ลบออกก่อน':''}">นำเข้า 44 คน</button></span></div>
   ${im.rows?`<div class="tip">ปุ่มนำเข้าถูกปิดไว้ตราบที่ยังมี “ย้ายไม่ได้” — เหมือนของจริง (เทสต์ล็อก)</div>`:''}</div></div>`;
}
function stOverlays(){
  const s=S.st;let o=stDrawerHtml()+stFormHtml()+stImportHtml();
  if(S.dlg&&S.dlg.t==='stqrall'){const n=(s.roster[s.cls]||[]).length;o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="st-qh"><h2 id="st-qh">ออก QR ใหม่ทั้งห้อง ${CL(s.cls).name} (${n} คน)?</h2><div class="tip">บัตรเดิมทุกใบจะใช้ไม่ได้ทันที · ต้องพิมพ์สติกเกอร์ใหม่ให้ทุกคน</div><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="stdlgno" autofocus>ยกเลิก</button><button class="dan" data-a="stdlgyes">ออกใหม่ ${n} คน</button></div></div></div>`}
  if(S.dlg&&S.dlg.t==='stleave'){const n=S.dlg.n;o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="st-lh"><h2 id="st-lh">${fullName(n)} ย้ายออกหรือไม่ใช้งาน?</h2><div class="tip">สแกนรับงานใหม่ไม่ได้ แต่คะแนนและประวัติยังอยู่ แก้ย้อนหลังได้ (D15) · ย้อนกลับได้ที่ “แก้ไขข้อมูล”</div><div class="chiprow" style="margin-top:8px"><button class="pill${S.dlg.k==='moved'?' on':''}" data-a="stleavek" data-k="moved">ย้ายออก</button><button class="pill${S.dlg.k==='inactive'?' on':''}" data-a="stleavek" data-k="inactive">ไม่ใช้งาน</button></div><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="stdlgno" autofocus>ยกเลิก</button><button class="primary" data-a="stdlgyes">บันทึก</button></div></div></div>`}
  return o;
}
function stOpenForm(n){
  const s=S.st,r=(s.roster[s.cls]||[]).find(x=>x.n===n)||(s.moved[s.cls]||[]).find(x=>x.n===n);
  if(n==null)s.form={mode:'add',n:null,prefix:'ด.ช.',code:'60'+String((s.roster[s.cls]||[]).length+1).padStart(2,'0'),number:(s.roster[s.cls]||[]).length+1,first:'',last:'',nick:'',cls:s.cls,status:'active',left:null,err:''};
  else s.form={mode:'edit',n,prefix:n%2?'ด.ช.':'ด.ญ.',code:r?r.code:stCode(s.cls,n),number:n,first:nick(n),last:'สมมติ',nick:nick(n),cls:s.cls,status:r?r.status:'active',left:r?r.left:null,err:''};
  s.drawer=null;S.menu=null;
}
function stAct(a,k,t,e){
  if(!a.startsWith('st'))return false;
  const s=S.st;
  switch(a){
  case 'stcls':s.cls=k;s.drawer=null;break;
  case 'stsort':if(s.sort===k)s.dir=-s.dir;else{s.sort=k;s.dir=1}S.menu=null;break;
  case 'stmoved':s.showMoved=!s.showMoved;break;
  case 'stclearq':s.q='';break;
  case 'ststats':s.stats='ready';toast2('โหลดสถิติแล้ว');break;
  case 'stlay':s.stk.lay=+k;break;
  case 'stscope':s.stk.scope=k;break;
  case 'ststickers':S.sub.students='stickers';break;
  case 'stback':S.sub.students='list';break;
  case 'stdrawer':s.drawer=+k;break;
  case 'stadd':stOpenForm(null);break;
  case 'stedit':stOpenForm(+k);break;
  case 'stmove':stOpenForm(+k);toast2('ย้ายห้อง: เลือกห้องในฟอร์ม (ปิดถ้ามีประวัติ D06)');break;
  case 'stleave':S.menu=null;S.dlg={t:'stleave',n:+k,k:'moved'};break;
  case 'stleavek':S.dlg.k=k;break;
  case 'stqr':{S.menu=null;const r=(s.roster[s.cls]||[]).find(x=>x.n===+k);if(r)r.qrNew=true;s.log.unshift({t:'เมื่อกี้',x:`ออก QR ใหม่ เลขที่ ${k}`});toast2(`ออก QR ใหม่ให้ ${fullName(+k)} แล้ว — บัตรเดิมใช้ไม่ได้ พิมพ์สติกเกอร์ใหม่`,{label:'เลิกทำ',fn:()=>{if(r)r.qrNew=false;S.toast=null;render()}});break}
  case 'stqrall':S.dlg={t:'stqrall'};break;
  case 'stdlgno':S.dlg=null;break;
  case 'stdlgyes':{const d=S.dlg;S.dlg=null;
    if(d.t==='stqrall'){(s.roster[s.cls]||[]).forEach(r=>r.qrNew=true);toast2('ออก QR ใหม่ทั้งห้องแล้ว · พิมพ์สติกเกอร์ใหม่ให้ทุกคน')}
    else if(d.t==='stleave'){const i=(s.roster[s.cls]||[]).findIndex(r=>r.n===d.n);if(i>=0){const r=s.roster[s.cls].splice(i,1)[0];s.moved[s.cls].unshift({n:r.n,code:r.code,name:fullName(r.n),status:d.k,left:TODAY});s.drawer=null;toast2(`${fullName(d.n)} → ${ST_STATUS[d.k]} แล้ว`,{label:'เลิกทำ',fn:()=>{s.moved[s.cls].shift();s.roster[s.cls].splice(i,0,r);S.toast=null;render()}})}}
    break}
  case 'stline':toast2('คัดลอกรายการค้างส่งไป LINE แล้ว');break;
  case 'stfcls':s.form.cls=k;break;
  case 'stfstatus':s.form.status=k;break;
  case 'stfsave':{const f=s.form;if(!f.first.trim()||!f.code.trim()){f.err='กรอกชื่อและรหัสนักเรียน';break}
    if(f.mode==='add'){const n=+f.number||((s.roster[s.cls]||[]).length+1);s.roster[s.cls].push({n,code:f.code,status:'active',qrNew:true,left:null});s.log.unshift({t:'เมื่อกี้',x:`เพิ่ม เลขที่ ${n}`});toast2(`เพิ่ม ${f.prefix} ${f.first} แล้ว · QR ออกให้แล้ว`)}
    else{s.log.unshift({t:'เมื่อกี้',x:`แก้ข้อมูล เลขที่ ${f.n}`});toast2('บันทึกแล้ว')}
    s.form=null;break}
  case 'stimport':s.imp={tab:'file',file:null,paste:'',rows:false,checking:false,fail:false,confirm:false};break;
  case 'stimptab':s.imp.tab=k;break;
  case 'stimpfile':{s.imp.file='รายชื่อ ป.6-1 ปี 2569.xlsx';s.imp.rows=true;s.imp.checking=true;setTimeout(()=>{if(S.st.imp){S.st.imp.checking=false;S.st.imp.fail=S.scen==='offline';render()}},800);break}
  case 'stimpcheck':s.imp.fail=false;s.imp.checking=true;setTimeout(()=>{if(S.st.imp){S.st.imp.checking=false;render()}},800);break;
  case 'stimpgo':toast2('นำเข้า 44 คนแล้ว');s.imp=null;break;
  default:return false;
  }
  render();return true;
}
function stSim(k){
  const s=S.st;
  if(k==='st-dup')s.dup=!s.dup;
  else if(k==='st-qr')stAct('stqr','17');
  else if(k==='st-search'){s.q=s.q?'':'ฟ้า'}
  else if(k==='st-qrall')S.dlg={t:'stqrall'};
}
function stApplySub(){
  const s=S.st,sub=curSub();s.drawer=null;s.form=null;s.imp=null;S.menu=null;
  if(sub==='drawer')s.drawer=2;
  else if(sub==='add')stOpenForm(null);
  else if(sub==='edit')stOpenForm(2);
  else if(sub==='import'){s.imp={tab:'file',file:'รายชื่อ ป.6-1 ปี 2569.xlsx',paste:'',rows:true,checking:false,fail:false,confirm:false}}
  else if(sub==='menu')S.menu='strow2';
  else if(sub==='qrall')S.dlg={t:'stqrall'};
}
document.addEventListener('input',e=>{const t=e.target;if(!S.st)return;
  if(t.dataset&&t.dataset.st==='q'){S.st.q=t.value;const pos=t.selectionStart;render();const el=document.querySelector('[data-st="q"]');if(el){el.focus();el.setSelectionRange(pos,pos)}}
  if(t.dataset&&t.dataset.st==='paste'&&S.st.imp){S.st.imp.paste=t.value;if(t.value.trim()&&!S.st.imp.rows){S.st.imp.rows=true;S.st.imp.checking=true;setTimeout(()=>{if(S.st.imp){S.st.imp.checking=false;render()}},800);render()}}
  if(t.dataset&&t.dataset.f&&S.st.form&&S.page==='students'){S.st.form[t.dataset.f]=t.value}});
document.addEventListener('change',e=>{const t=e.target;if(!S.st)return;
  if(t.dataset&&t.dataset.st==='confirm'&&S.st.imp){S.st.imp.confirm=t.checked;render()}
  if(t.dataset&&t.dataset.f==='prefix'&&S.st.form&&S.page==='students'){S.st.form.prefix=t.value}});
R3ACT.push(stAct);

/* ===================== เปลือกแอป (rail / แท็บ / sheet) ===================== */
const NAV=[
  {label:'วันนี้',items:[{k:'home',l:'หน้าหลัก',i:'home'}]},
  {label:'ในห้องเรียน',items:[{k:'scan',l:'สแกน',i:'scan'},{k:'attendance',l:'เช็คชื่อ',i:'user-check'},{k:'random',l:'สุ่มชื่อ',i:'dice-3'}]},
  {label:'ตรวจงาน',items:[{k:'gradebook',l:'คะแนน',i:'notebook'},{k:'reports',l:'รายงาน',i:'chart-bar'}]},
  {label:'จัดการ',items:[{k:'students',l:'นักเรียน',i:'users'},{k:'settings',l:'ตั้งค่า',i:'settings'}]},
];
function syncBadge(){
  const n=S.sc&&S.sc.dots?S.sc.dots.pend.length:0;
  if(offline())return `<span class="sync offline">${ic('wifi-off',16)}ออฟไลน์ · รอส่ง ${n||7}</span>`;
  return `<span class="sync online">${ic('cloud-check',16)}ออนไลน์</span>`;
}
function railHtml(){
  const g=NAV.map(x=>`<div class="rail-group" role="group" aria-label="${x.label}"><div class="rail-gl" aria-hidden="true">${x.label}</div>${x.items.map(it=>`<a class="rail-item${it.k===S.page?' on':''}" href="#${it.k}" data-a="nav" data-k="${it.k}" ${it.k===S.page?'aria-current="page"':''}>${ic(it.i,24)}<span>${it.l}</span></a>`).join('')}</div>`).join('');
  return `<nav class="rail" aria-label="เมนูหลัก"><div class="rail-logo">${ic('checks',24)}</div>${g}<div class="rail-spacer"></div><div class="rail-sync">${syncBadge()}</div><button class="rail-item" data-a="logout">${ic('logout',24)}<span>ออกจากระบบ</span></button></nav>`;
}
function tabsHtml(){
  const t=[{k:'home',l:'หน้าหลัก',i:'home'},{k:'attendance',l:'เช็คชื่อ',i:'user-check'},{k:'scan'},{k:'gradebook',l:'คะแนน',i:'notebook'},{k:'more'}];
  const more=['random','reports','students','settings'].includes(S.page);
  return `<nav class="tabs" aria-label="เมนู">${t.map(x=>x.k==='scan'?`<a class="tab tab-scan${S.page==='scan'?' on':''}" href="#scan" data-a="nav" data-k="scan"><span class="tab-scan-btn">${ic('scan',24)}</span>สแกน</a>`
   :x.k==='more'?`<button class="tab${(S.sheetMenu||more)?' on':''}" data-a="sheetmenu" aria-expanded="${S.sheetMenu}" aria-haspopup="dialog" aria-controls="menu-sheet"><span class="pip" aria-hidden="true"></span>${ic('menu-2',24)}เมนู</button>`
   :`<a class="tab${x.k===S.page?' on':''}" href="#${x.k}" data-a="nav" data-k="${x.k}" ${x.k===S.page?'aria-current="page"':''}><span class="pip" aria-hidden="true"></span>${ic(x.i,24)}${x.l}</a>`).join('')}</nav>`;
}
function sheetHtml(){
  const groups=[{label:'ในห้องเรียน',items:[{k:'random',l:'สุ่มชื่อ',i:'dice-3'}]},{label:'ตรวจงาน',items:[{k:'reports',l:'รายงาน',i:'chart-bar'}]},{label:'จัดการ',items:[{k:'students',l:'นักเรียน',i:'users'},{k:'settings',l:'ตั้งค่า',i:'settings'}]}];
  return `<div class="sheet-overlay" data-a="closeov"><div class="sheet" id="menu-sheet" role="dialog" aria-modal="true" aria-label="เมนู"><div class="sheet-grab"></div><div class="sheet-top">${syncBadge()}</div>
   ${groups.map(g=>`<div class="sheet-gl" style="font-size:var(--fs-xs);color:var(--text-muted);padding:4px 4px 0">${g.label}</div><div class="sheet-grid">${g.items.map(x=>`<a class="sheet-item${x.k===S.page?' on':''}" href="#${x.k}" data-a="nav" data-k="${x.k}">${ic(x.i,24)}${x.l}</a>`).join('')}</div>`).join('')}
   <button class="sheet-item danger ghost" data-a="logout">${ic('logout',20)}ออกจากระบบ</button></div></div>`;
}
const badge=(cls,txt,i)=>`<span class="hm-chip ${cls}">${i?ic(i,16):''}${txt}</span>`;
const chipBtn=(cls,txt,i,a,k,extra='')=>`<button class="hm-chip ${cls}" data-a="${a}" ${k!=null?`data-k="${k}"`:''} ${extra}>${i?ic(i,16):''}${txt}</button>`;
function pageHead(icon,title,sub){
  return `<header class="pghead"><div class="hr"><span class="pgtile">${ic(icon,24)}</span><div><h1>${title}</h1>${sub?`<div class="tip">${sub}</div>`:''}</div></div><div class="act">${syncBadge()}${prefsBtn()}${pjBtn()}</div></header>`;
}
const prefsBtn=()=>`<button class="ghost ${isNarrow()?'ib':''}" data-a="prefs" aria-label="ปรับการ์ด">${ic('layout-grid',20)}${isNarrow()?'':'ปรับการ์ด'}</button>`;
function pjBtn(){
  const P=S.pjPref||{th:'dark',sz:2};
  return `<span class="menu"><button class="${isNarrow()?'ib':''}" data-a="pjmenu" aria-haspopup="dialog" aria-expanded="${S.menu==='pj'}" aria-label="โหมดฉายจอ">${ic('presentation',20)}${isNarrow()?'':'โหมดฉายจอ'}</button>
   ${S.menu==='pj'?`<div class="pop right pjpre" role="dialog" aria-label="ตั้งค่าโหมดฉายจอ"><div class="hd">ธีมหน้าจอ</div><div class="seg"><button class="${P.th==='dark'?'on':''}" data-a="pjth" data-k="dark">เข้ม</button><button class="${P.th==='light'?'on':''}" data-a="pjth" data-k="light">สว่าง</button></div>
   <div class="hd">ขนาดตัวอักษร</div><div class="seg"><button class="${P.sz==1?'on':''}" data-a="pjsz" data-k="1">มาตรฐาน</button><button class="${P.sz==2?'on':''}" data-a="pjsz" data-k="2">ใหญ่</button><button class="${P.sz==3?'on':''}" data-a="pjsz" data-k="3">ใหญ่มาก</button></div>
   <button class="primary" data-a="pjstart" style="margin-top:6px">${ic('presentation',20)}เริ่มฉายจอ</button><div class="tip">คะแนนและเปอร์เซ็นต์รายคนจะถูกซ่อน · กดค้างปุ่ม × 1 วินาทีเพื่อออก</div></div>`:''}</span>`;
}

/* ===================== สแกน ===================== */
const recvText=()=>S.sc.recvDate===TODAY?'วันนี้':fmtS(S.sc.recvDate);
const recvBack=()=>S.sc.recvDate!==TODAY;
function ringSvg(frac,size=72,color='var(--fill-success)'){
  const r=size/2-6,c=2*Math.PI*r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="8"/><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c*frac} ${c}" transform="rotate(-90 ${size/2} ${size/2})"/></svg>`;
}
function setupHtml(){
  const sc=S.sc,a=AS(sc.asg);
  const list=[...ASGS].sort((x,y)=>(x.due||'9999').localeCompare(y.due||'9999'));
  const shown=sc.showAll?list:list.slice(0,5);
  const xy=(aa,cid)=>{const p=aa.per[cid],t=CL(cid).total;return `${CL(cid).name} <b>${p.s}/${t-p.x}</b>`};
  const cards=shown.map(aa=>`<button class="sc-asg${aa.id===sc.asg?' on':''}" data-a="pickasg" data-k="${aa.id}" aria-pressed="${aa.id===sc.asg}">${aa.id===sc.asg?`<span class="tick">${ic('circle-check',20)}</span>`:''}
    <div class="row" style="gap:6px;flex-wrap:wrap"><span class="chip ${aa.tc}">${aa.type}</span><span class="tip">${aa.subj} · เต็ม ${aa.full}</span></div><div class="ttl">${aa.title}</div>
    <div class="pc">${Object.keys(aa.per).map(c=>`<span class="xy">${xy(aa,c)}</span>`).join('')}${aa.due?`<span class="xy">${ic('calendar-event',14)}ส่ง ${fmtS(aa.due)}</span>`:''}</div></button>`).join('');
  const modes=[['full','circle-check','ให้คะแนนเต็ม','ยิงแล้วได้เต็มทันที'],['type','pencil','กรอกทีละคน','ยิงแล้วพิมพ์คะแนน'],['later','inbox','รับงานก่อน','ตรวจแล้วค่อยให้คะแนน']];
  return `${pageHead('scan','สแกนส่งงาน','เลือกงาน ห้อง และวิธีให้คะแนน')}
  <div class="sc-step"><span class="sn">1</span>เลือกงาน <span class="tip" style="margin-left:auto">${ic('refresh',14)} ตัวเลขอัปเดตสดจากงานที่เลือก</span></div>
  <div class="asg-grid" role="group" aria-label="เลือกงาน">${cards}</div>
  ${list.length>5&&!sc.showAll?`<button class="ghost" style="width:100%;margin:-4px 0 10px" data-a="showall">ดูทั้งหมด (${list.length}) ${ic('chevron-down',20)}</button>`:''}
  <div class="sc-step"><span class="sn">2</span>เลือกห้อง</div>
  <div class="chiprow" style="margin-bottom:12px">${Object.keys(a.per).map(c=>{const p=a.per[c],t=CL(c).total;return `<button class="pill${c===sc.cls?' on':''}" data-a="pickcls" data-k="${c}" aria-pressed="${c===sc.cls}">${CL(c).name} <span class="n">ส่งแล้ว ${p.s}/${t-p.x}${p.x?` · ยกเว้น ${p.x}`:''}</span></button>`}).join('')}</div>
  <div class="sc-step"><span class="sn">3</span>วิธีให้คะแนน</div>
  <div class="modes" role="group" aria-label="วิธีให้คะแนน">${modes.map(m=>`<button class="mode${sc.mode===m[0]?' on':''}" data-a="pickmode" data-k="${m[0]}" aria-pressed="${sc.mode===m[0]}">${ic(m[1],24)}<span><div class="t">${m[2]}</div><div class="s">${m[3]}</div></span></button>`).join('')}
   <button class="mode opt4" data-a="toast" data-k="ตรวจบัตร: ข้อเสนอ ยังไม่รวมในรอบนี้ (สแกนทั้งห้องโดยไม่บันทึกงาน เพื่อเช็กสติกเกอร์ผิดเล่ม)" title="ตัวเลือก">${ic('qrcode',24)}<span><div class="t">ตรวจบัตร <span class="badge-sa">ตัวเลือก</span></div><div class="s">สแกนทั้งห้อง ไม่บันทึกงาน</div></span></button></div>
  <div class="startbar"><div class="grow"><div style="font-weight:500">รอบนี้: ${a.title}</div><div class="tip">${CL(sc.cls).name} · ${a.subj} · เต็ม ${a.full} · ${{full:'ให้คะแนนเต็ม',type:'กรอกทีละคน',later:'รับงานก่อน'}[sc.mode]}</div></div>
   <span class="tip">${ic('barcode',16)} เครื่องยิง · ${ic('camera',16)} กล้อง</span><button class="primary" data-a="startround">${ic('player-play',20)}เริ่มสแกน ${CL(sc.cls).name}</button></div>`;
}
function ctxHtml(){
  const sc=S.sc,a=AS(sc.asg);
  const clsMenu=`<span class="menu"><button data-a="menu" data-k="cls" aria-haspopup="menu" aria-expanded="${S.menu==='cls'}">${CL(sc.cls).name} ${ic('chevron-down',16)}</button>${S.menu==='cls'?`<div class="pop" role="menu"><div class="hd">เปลี่ยนห้อง (งานเดียวกัน)</div>${Object.keys(a.per).map(c=>`<button role="menuitem" class="${c===sc.cls?'on':''}" data-a="swcls" data-k="${c}">${CL(c).name}</button>`).join('')}</div>`:''}</span>`;
  const modeLbl={full:'ให้คะแนนเต็ม',type:'กรอกทีละคน',later:'รับงานก่อน'}[sc.mode];
  const modeMenu=`<span class="menu"><button data-a="menu" data-k="mode" aria-haspopup="menu" aria-expanded="${S.menu==='mode'}">เต็ม ${a.full} · ${modeLbl} ${ic('chevron-down',16)}</button>${S.menu==='mode'?`<div class="pop" role="menu"><div class="hd">ใช้กับการสแกนครั้งถัดไป</div>${[['full','ให้คะแนนเต็ม'],['type','กรอกทีละคน'],['later','รับงานก่อน']].map(m=>`<button role="menuitem" class="${sc.mode===m[0]?'on':''}" data-a="swmode" data-k="${m[0]}">${m[1]}</button>`).join('')}</div>`:''}</span>`;
  const days=[];for(let d=a.assigned;d<=TODAY;d=shift(d,1))days.push(d);
  const dateMenu=`<span class="menu"><button data-a="menu" data-k="date" aria-haspopup="dialog" aria-expanded="${S.menu==='date'}">${ic('calendar-event',16)}วันที่รับ: ${recvText()} ${ic('chevron-down',16)}</button>${S.menu==='date'?`<div class="pop" role="dialog" aria-label="วันที่รับงาน"><div class="hd">รับงานเมื่อวันที่ (${fmtS(a.assigned)} – วันนี้)</div>
    <div class="seg" style="margin:2px"><button class="${sc.recvDate===TODAY?'on':''}" data-a="recv" data-k="${TODAY}">วันนี้</button><button class="${sc.recvDate===shift(TODAY,-1)?'on':''}" data-a="recv" data-k="${shift(TODAY,-1)}">เมื่อวาน</button></div>
    <div class="dgrid">${days.map(d=>`<button class="${d===sc.recvDate?'on':''}" data-a="recv" data-k="${d}" aria-label="${fmt(d)}">${fmtS(d)}</button>`).join('')}</div>
    <div class="tip" style="padding:4px 8px">เลือกวันอนาคตหรือก่อนวันมอบหมายไม่ได้ · เปลี่ยนได้ระหว่างรอบ มีผลกับงานที่สแกนหลังจากนั้น · จบรอบแล้วกลับเป็นวันนี้</div></div>`:''}</span>`;
  const back=recvBack();
  return `<div class="ctx${back?' back':''}" role="group" aria-label="รอบสแกน">
   <div class="r">${clsMenu}<span class="chip aqua">${a.subj}</span><span class="chip ${a.tc}">${a.type}</span><span style="flex:1"></span>
     <button class="ib" data-a="prefs" aria-label="ปรับการ์ด" style="padding:0">${ic('layout-grid',20)}</button>${pjBtn()}<button data-a="endround" style="font-weight:600">${ic('flag-check',20)}จบรอบนี้</button></div>
   <div class="r">${modeMenu}${dateMenu}${back?`<span class="backtxt">${ic('alert-triangle',20)}กำลังรับงานย้อนหลัง · ${fmt(sc.recvDate)}</span><button data-a="recv" data-k="${TODAY}">กลับเป็นวันนี้</button>`:''}</div></div>`;
}
function fbHtml(){
  const f=S.sc.fb||{kind:'idle',title:'พร้อมสแกน',sub:'ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter',icon:'scan'};
  return `<div class="fb ${f.kind}" role="status" aria-live="polite"><span class="ic">${ic(f.icon||'check',26)}</span><div style="min-width:0"><div class="nm">${f.title}</div><div class="sb">${f.sub||''}</div></div>${f.score?`<div class="sc">${f.score}</div>`:''}</div>`;
}
function padHtml(){
  const sc=S.sc,a=AS(sc.asg),p=sc.pend,full=a.full;
  const late=isLate(sc.recvDate,a.due);
  const quick=[[full,`${full}/${full}`,'เต็ม'],[full-1,`${full-1}/${full}`,''],[full-2,`${full-2}/${full}`,''],[full/2,`${full/2}/${full}`,'ครึ่ง'],[sc.lastScore,`${sc.lastScore}/${full}`,'ล่าสุด']];
  return `<section class="card padcard pad" aria-label="ให้คะแนน เลขที่ ${p.n}"><div class="head"><span class="nm">${nick(p.n)} ${nick(p.n)==='มะม่วง'?'':''}</span><span class="no">เลขที่ ${p.n}</span>${late?badge('warning','ส่งช้า','clock'):badge('success','ทันกำหนด','circle-check')}${recvBack()?badge('muted','รับ '+fmtS(sc.recvDate),'calendar-event'):''}<button class="ghost later" data-a="later">${ic('inbox',20)}ให้คะแนนทีหลัง</button></div>
   <div class="padbody"><div class="padl"><div class="entry"><div class="box" aria-label="คะแนน" aria-live="polite">${sc.entry||'<span style="color:var(--text-muted)">–</span>'}</div><span class="full">/ ${full}</span></div><div class="err" role="alert">${sc.err}</div>
     <div class="quick">${quick.map(q=>`<button data-a="quick" data-k="${q[0]}"><b>${q[1]}</b>${q[2]?`<small>${q[2]}</small>`:''}</button>`).join('')}</div></div>
    <div class="padr"><div class="keys">${[1,2,3,4,5,6,7,8,9].map(k=>`<button data-a="key" data-k="${k}">${k}</button>`).join('')}<button data-a="key" data-k=".5">.5</button><button data-a="key" data-k="0">0</button><button data-a="key" data-k="bk" aria-label="ลบ">${ic('backspace',24)}</button></div>
     <button class="primary save" data-a="savescore">${ic('check',24)} บันทึก ${sc.entry||'–'}/${full}</button></div></div></section>`;
}
function gridHtml(){
  const sc=S.sc,a=AS(sc.asg),c=counts(sc.seats),total=Object.keys(sc.seats).length;
  const pend=sc.dots.pend,fail=sc.dots.fail;
  const sym={scored:'check',late:'clock',await:'pencil',exc:'ban',miss:''};
  const lab={scored:'ส่งแล้ว',late:'ส่งช้า',await:'รอคะแนน',miss:'ยังไม่ส่ง',exc:'ยกเว้น'};
  const cells=Array.from({length:total},(_,i)=>i+1).map(n=>{const s=sc.seats[n];
    return `<button class="cell ${s}${sc.cur===n?' cur':''}" data-a="seat" data-k="${n}" ${sc.closed?'disabled':''} aria-label="เลขที่ ${n} ${nick(n)} ${lab[s]}${pend.includes(n)?' รอส่งขึ้นระบบ':''}${fail.includes(n)?' ส่งไม่สำเร็จ':''}"><span class="t"><span>${n}</span>${sym[s]?ic(sym[s],16):''}</span><span class="nm">${nick(n)}</span>${pend.includes(n)?'<i class="dot pend"></i>':''}${fail.includes(n)?'<i class="dot fail"></i>':''}</button>`}).join('');
  const leg=[['scored','var(--fill-success)'],['late','var(--fill-warning)'],['await','var(--accent)'],['miss','var(--fill-danger)'],['exc','var(--text-muted)']].filter(l=>c[l[0]]>0).map(l=>`<span><i style="background:${l[1]}"></i>${lab[l[0]]} ${c[l[0]]}</span>`).join('');
  return `<section class="card gcard" aria-labelledby="gh"><div class="ghead"><div class="ring">${ringSvg(c.counted?c.sub/c.counted:0)}<div class="cap">${c.sub}/${c.counted}</div></div><div style="min-width:0;flex:1"><h2 id="gh" style="font-size:1rem">ผังเลขที่ ${CL(sc.cls).name}</h2><div class="legend">${leg}${pend.length?`<span>${ic('cloud-upload',14)} รอส่งขึ้นระบบ ${pend.length}</span>`:''}</div><div class="tip">แตะช่องว่าง = รับงานให้คนนั้น · แตะช่องที่ส่งแล้ว = แก้/ยกเลิก</div></div></div><div class="seat" role="group" aria-label="ผังเลขที่ ${CL(sc.cls).name}">${cells}</div></section>`;
}
function recentHtml(){
  const sc=S.sc,list=sc.recent;
  const item=r=>`${r.state==='await'?badge('accent','รอคะแนน','pencil'):badge(r.state==='late'?'warning':'success',`${r.score}/${r.full}`,r.state==='late'?'clock':'check')}`;
  if(!isWide()){
    return `<section class="card" aria-labelledby="rh" style="padding:8px 12px"><div class="row" style="justify-content:space-between"><h2 id="rh" style="font-size:var(--fs-sm)">${ic('clock',16)} สแกนล่าสุด <span class="tip">${list.length?`รอบนี้ ${list.length} คน`:'ยังไม่มีใครสแกนในรอบนี้'}</span></h2></div>
      ${list.length?`<div class="rstrip" role="list">${list.slice(0,6).map(r=>`<button class="hm-chip muted" role="listitem" data-a="rsheet" data-k="${r.n}" aria-label="เลขที่ ${r.n} ${nick(r.n)} ตัวเลือก">${r.n} ${nick(r.n)} · ${r.state==='await'?'รอคะแนน':r.score+'/'+r.full}${r.recv?' · รับ '+fmtS(r.recv):''}</button>`).join('')}</div>`:''}</section>`;
  }
  return `<section class="card" aria-labelledby="rh"><div class="row" style="justify-content:space-between"><h2 id="rh" style="font-size:1rem">${ic('clock',20)} สแกนล่าสุด</h2><span class="tip">รอบนี้ ${list.length} คน</span></div>
    ${list.length?list.slice(0,6).map(r=>`<div class="rrow"><span class="hm-chip accent" style="min-width:2.4em;justify-content:center">${r.n}</span><span class="nm">${nick(r.n)}${r.recv?` <span class="tip">· รับ ${fmtS(r.recv)}</span>`:''}</span>${item(r)}<button class="ghost ib" data-a="rsheet" data-k="${r.n}" aria-label="ตัวเลือก เลขที่ ${r.n}">${ic('dots-vertical',20)}</button></div>`).join(''):'<div class="tip" style="padding:8px 0">ยังไม่มีใครสแกนในรอบนี้</div>'}</section>`;
}
function failedHtml(){
  const f=S.sc.failed;if(!f.length)return '';
  return `<section class="card failcard" aria-labelledby="fh"><div class="row" style="justify-content:space-between"><h2 id="fh" style="font-size:1rem;color:var(--text-danger)">${ic('cloud-x',20)} ส่งไม่สำเร็จ ${f.length} รายการ</h2><span class="tip">แสดงเองเมื่อมี</span></div>
   ${f.map(r=>`<div class="failrow"><div class="t"><b>เลขที่ ${r.n} ${nick(r.n)}</b> · ${r.asg} · ${r.t}<div class="tip" style="color:var(--text-danger)">${r.reason}</div>${S.sc.confirmDrop===r.id?`<div class="tip" style="margin-top:4px">ทิ้งรายการนี้? ข้อมูลส่งงานของเลขที่ ${r.n} จะหายไป</div>`:''}</div>
     ${S.sc.confirmDrop===r.id?`<button class="ghost" data-a="dropno">ไม่ทิ้ง</button><button class="dan" style="color:var(--text-danger)" data-a="dropyes" data-k="${r.id}">ทิ้ง</button>`:`<button data-a="retry" data-k="${r.id}">ลองใหม่</button><button class="ghost" data-a="drop" data-k="${r.id}">ทิ้ง</button>`}</div>`).join('')}</section>`;
}
function liveHtml(){
  const sc=S.sc,a=AS(sc.asg);
  const closedBar=sc.closed?`<div class="banner" style="background:var(--bg-danger);color:var(--text-danger);border-color:var(--border-danger)" role="alert">${ic('lock',20)}<span><b>งานนี้ปิดรับแล้ว</b> · อีกเครื่องปิดรับงานไปเมื่อสักครู่ — สแกนเพิ่มไม่ได้ ผังด้านล่างแสดงตามที่ระบบเก็บ</span></div>`:'';
  const hid=cardOn('scan','hid')?`<span class="hm-chip success">${ic('barcode',16)}เครื่องยิงพร้อม</span><button class="hm-chip muted" data-a="hidtest" style="cursor:pointer">ทดสอบ</button>`:'';
  const title=`<div class="sc-title"><span class="t">${a.title}</span>${hid}</div>`;
  const input=`<div class="scanrow"><label class="scanin${sc.closed?' dis':''}" aria-label="ช่องสแกน — ยิง QR หรือพิมพ์เลขที่"><span>${ic('scan',24)}</span><span>${sc.closed?'ปิดรับงานแล้ว — สแกนไม่ได้':'ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter'}</span></label><button class="cam ib" style="width:calc(var(--u)*3.6);height:calc(var(--u)*3.6)" data-a="toast" data-k="เปิดกล้อง (ค่านี้จำต่อเครื่อง)" aria-label="เปิดกล้อง">${ic('camera',24)}</button></div>`;
  const mid=sc.excAsk?`<section class="card" style="border:2px solid var(--border-warning);background:var(--bg-warning);color:var(--text-warning)" role="alertdialog" aria-label="เด็กที่ยกเว้น"><b>เลขที่ ${sc.excAsk} ${nick(sc.excAsk)} ถูกตั้งเป็น "ยกเว้น" งานนี้</b><div class="sb">รับงานแล้วจะเปลี่ยนเป็น "ส่งแล้ว" — ต้องการรับไหม</div><div class="row" style="margin-top:8px"><button class="primary" data-a="excyes">รับงานแล้ว</button><button data-a="excno">ไม่รับ</button></div></section>`
    :sc.pend?padHtml():fbHtml()+(cardOn('scan','hint')?`<div class="hintline">${{full:'โหมดให้คะแนนเต็ม: ยิงแล้วได้คะแนนเต็มทันที · แตะช่องที่ส่งแล้วเพื่อแก้',type:'โหมดกรอกทีละคน: ยิงแล้วพิมพ์คะแนน กด "บันทึก" หรือ Enter',later:'โหมดรับงานก่อน: ยิงแล้วเป็น "รอคะแนน" ไปให้คะแนนทีหลังในสมุดคะแนน'}[sc.mode]}</div>`:'');
  const showRecent=cardOn('scan','recent');
  const col1=input+mid+failedHtml();
  const col2=gridHtml()+(showRecent?recentHtml():'');
  return `${closedBar}${ctxHtml()}${title}<div class="sc-layout"><div class="sc-left">${col1}</div><div class="sc-right">${isWide()?col2:''}</div>${isWide()?'':''}</div>${isWide()?'':`<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${col2}</div>`}`;
}
function summaryHtml(){
  const sc=S.sc,a=AS(sc.asg),c=counts(sc.seats);
  const names=st=>Object.keys(sc.seats).filter(n=>sc.seats[n]===st).map(Number);
  const aw=names('await'),ms=names('miss');
  return `<div class="sum"><div class="card"><div class="big"><div class="ring" style="width:7.5rem;height:7.5rem">${ringSvg(c.counted?c.sub/c.counted:0,120)}<div class="cap" style="font-size:1.4rem">${c.sub}/${c.counted}</div></div>
   <div><h2>จบรอบแล้ว · ${a.title}</h2><div class="tip">${CL(sc.cls).name} · เต็ม ${a.full}${c.exc?` · ไม่นับยกเว้น ${c.exc} คน`:''}</div><div class="legend" style="margin-top:6px"><span><i style="background:var(--fill-success)"></i>ส่งแล้ว ${c.scored+c.late}</span><span><i style="background:var(--accent)"></i>รอคะแนน ${c.await}</span><span><i style="background:var(--fill-danger)"></i>ยังไม่ส่ง ${c.miss}</span><span><i style="background:var(--text-muted)"></i>ยกเว้น ${c.exc}</span>${offline()?`<span>${ic('cloud-upload',14)} รอส่งขึ้นระบบ ${sc.dots.pend.length}</span>`:''}</div></div></div>
   <div class="sumsec"><div class="row" style="justify-content:space-between"><b>ยังไม่มีคะแนน (${aw.length})</b>${aw.length?`<button data-a="toast" data-k="ไปให้คะแนนในสมุดคะแนน (หน้าอื่นอยู่ใน preview.html รอบ 1)">ให้คะแนนตอนนี้</button>`:''}</div>${aw.length?`<div class="namechips">${aw.map(n=>`<span class="hm-chip accent">${n} ${nick(n)}</span>`).join('')}</div>`:'<div class="tip">ครบทุกคนแล้ว</div>'}</div>
   <div class="sumsec"><div class="row" style="justify-content:space-between"><b>ยังไม่ส่ง (${ms.length})</b>${ms.length?`<button data-a="copymiss">${ic('copy',20)}คัดลอกรายชื่อ</button>`:''}</div>${ms.length?`<div class="namechips">${ms.slice(0,18).map(n=>`<span class="hm-chip danger">${n} ${nick(n)}</span>`).join('')}${ms.length>18?`<span class="hm-chip muted">และอีก ${ms.length-18} คน</span>`:''}</div>`:'<div class="tip">ไม่มีใครค้าง</div>'}</div>
   <div class="row" style="flex-wrap:wrap;margin-top:6px"><button class="primary" data-a="backscan">${ic('player-play',20)}กลับไปสแกนต่อ</button><button data-a="closeasg" ${offline()?'disabled':''}>${ic('lock',20)}ปิดรับงาน</button><button class="ghost" data-a="toast" data-k="ไปสมุดคะแนน (หน้าอื่นอยู่ใน preview.html รอบ 1)">ไปที่สมุดคะแนน</button></div>
   ${offline()?`<div class="tip" style="margin-top:6px">${ic('wifi-off',14)} ต้องออนไลน์ถึงปิดรับงานได้</div>`:''}</div></div>`;
}
/* --- กระทำ: รับงาน / คะแนน / ยกเลิก --- */
function recvOpts(){const r=S.sc.recvDate;return r===TODAY?null:r}
function scanCommit(n,how){
  const sc=S.sc,a=AS(sc.asg);
  if(sc.closed){S.sc.fb={kind:'danger',icon:'lock',title:'งานนี้ปิดรับแล้ว',sub:'สแกนเพิ่มไม่ได้'};return}
  if(!sc.seats[n]){sc.fb={kind:'danger',icon:'x',title:`ไม่มีเลขที่ ${n} ใน ${CL(sc.cls).name}`,sub:'ตรวจเลขที่ หรือเลือกห้องให้ตรงกับบัตร'};return}
  if(sc.seats[n]==='exc'){sc.excAsk=n;return}
  if(['scored','late','await'].includes(sc.seats[n])){sc.fb={kind:'warning',icon:'alert-triangle',title:`เลขที่ ${n} ${nick(n)}`,sub:'ส่งไปแล้ว — ไม่บันทึกซ้ำ'};sc.cur=n;return}
  sc.cur=n;
  if(sc.mode==='type'){sc.pend={n};sc.entry='';sc.err='';return}
  const late=isLate(sc.recvDate,a.due);
  if(sc.mode==='full'){sc.seats[n]=late?'late':'scored';sc.recent.unshift({n,state:late?'late':'scored',score:a.full,full:a.full,recv:recvOpts()});
    sc.fb={kind:late?'warning':'success',icon:'check',title:`${nick(n)} · เลขที่ ${n}`,sub:`ส่งแล้ว · ${late?'ส่งช้า':'ทันกำหนด'}${recvBack()?' · รับ '+fmtS(sc.recvDate):''}`,score:`${a.full}/${a.full}`}}
  else{sc.seats[n]='await';sc.recent.unshift({n,state:'await',score:null,full:a.full,recv:recvOpts()});sc.fb={kind:'acc',icon:'inbox',title:`${nick(n)} · เลขที่ ${n}`,sub:`รับงานแล้ว · รอคะแนน${recvBack()?' · รับ '+fmtS(sc.recvDate):''}`}}
}
function scanSave(){
  const sc=S.sc,a=AS(sc.asg),p=sc.pend;if(!p)return;
  const v=parseFloat(sc.entry);
  if(sc.entry===''||isNaN(v)){sc.err='พิมพ์คะแนนก่อน';return}
  if(v>a.full){sc.err=`คะแนนต้องไม่เกิน ${a.full}`;return}
  if((v*2)%1!==0){sc.err='ใส่ได้ทีละ 0.5 เช่น 7 หรือ 7.5';return}
  const late=isLate(sc.recvDate,a.due);
  const prev=sc.seats[p.n];
  sc.seats[p.n]=late?'late':'scored';
  sc.recent=sc.recent.filter(r=>r.n!==p.n);sc.recent.unshift({n:p.n,state:late?'late':'scored',score:v,full:a.full,recv:recvOpts()});
  sc.lastScore=v;sc.fb={kind:late?'warning':'success',icon:'check',title:`${nick(p.n)} · เลขที่ ${p.n}`,sub:`${p.edit?'แก้คะแนนแล้ว':'ส่งแล้ว'} · ${late?'ส่งช้า':'ทันกำหนด'}${recvBack()?' · รับ '+fmtS(sc.recvDate):''}`,score:`${v}/${a.full}`};
  sc.pend=null;sc.entry='';sc.err='';
}
function scanUndo(n){
  const sc=S.sc,prev={state:sc.seats[n],rec:sc.recent.find(r=>r.n===n)};
  sc.seats[n]='miss';sc.recent=sc.recent.filter(r=>r.n!==n);sc.sheet=null;
  toast2(`ยกเลิกการส่งของเลขที่ ${n} ${nick(n)} แล้ว`,{label:'เลิกทำ',fn:()=>{sc.seats[n]=prev.state;if(prev.rec)sc.recent.unshift(prev.rec);S.toast=null;render()}});
}

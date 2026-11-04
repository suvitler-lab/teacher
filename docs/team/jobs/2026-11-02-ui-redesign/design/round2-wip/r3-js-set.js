/* ===================== รอบ 3 ภาค 2 · ตั้งค่า (se-) ===================== */
const SE_SECS={general:['ทั่วไป','school'],time:['เวลาเรียน','clock'],scan:['การสแกน','barcode'],catalog:['ข้อมูลพื้นฐาน','books'],devices:['อุปกรณ์และรหัสผ่าน','shield-lock'],backup:['สำรองข้อมูล','database-export'],history:['ประวัติการแก้ไข','history']};
const SE_FORM0=()=>({school:'โรงเรียนสมมติวิทยา',teacher:'ครูสมมติ',late:'08:30',p1:'08:30',p2:'09:20',p3:'10:10',p4:'11:00',p5:'12:50',p6:'13:40',p7:'14:30',p8:''});
function initSe(){
  S.se={sec:'general',form:SE_FORM0(),saved:SE_FORM0(),sound:true,code:false,theme:'system',font:18,dens:'normal',cat:'class',
    backupDays:S.scen==='offline'?12:3,devices:[{id:1,n:'iPad ห้อง ป.6/1',ua:'Safari · iPadOS',last:'เมื่อกี้',cur:true},{id:2,n:'คอมห้องพักครู',ua:'Chrome · Windows',last:'เมื่อวาน 16:20'},{id:3,n:'มือถือครู',ua:'Safari · iOS',last:'30 ต.ค.'}],
    classes:CLASSES.map(c=>({n:c.name,arch:false,y:2569})),subjects:[{n:'คณิตศาสตร์',c:'MA'},{n:'วิทยาศาสตร์',c:'SC'},{n:'ภาษาอังกฤษ',c:'EN'},{n:'ศิลปะ',c:'AR'}],types:[{n:'ใบงาน',f:10,exam:false},{n:'การบ้าน',f:10,exam:false},{n:'สอบ',f:20,exam:true},{n:'ชิ้นงาน',f:30,exam:false}],
    terms:[{n:'1/2569',cur:false,s:'2026-05-16',e:'2026-10-31'},{n:'2/2569',cur:true,s:'2026-11-01',e:'2027-03-31'}],
    hist:'all',email:'teacher@example.com',emailEdit:false,pw:{open:false,a:'',b:''},tf:{step:1,year:2569,term:2,start:'2026-11-01',end:'',keep:['c1','c2','c3'],close:false,ok:false,newyear:false},rs:{step:1,typed:''},rtype:'data',rtyped:'',hid:'',cam:false,errmsg:''};
}
const seDirty=()=>{const s=S.se;return Object.keys(s.form).filter(k=>s.form[k]!==s.saved[k]).length};
function seSet(label,prev,apply){
  apply();toast2(`บันทึกแล้ว · ${label}`,{label:'เลิกทำ',fn:()=>{prev();S.toast=null;render()}});
}
function seNav(){
  const s=S.se,items=Object.entries(SE_SECS);
  if(isNarrow())return `<div class="chiprow se-chips" role="tablist" aria-label="หมวดตั้งค่า">${items.map(([k,v])=>`<button class="pill${s.sec===k?' on':''}" role="tab" aria-selected="${s.sec===k}" data-a="sesec" data-k="${k}">${v[0]}${k==='backup'&&s.backupDays>7?' <i class="se-dot"></i>':''}</button>`).join('')}</div>`;
  return `<nav class="se-nav" aria-label="หมวดตั้งค่า">${items.map(([k,v])=>`<button class="se-ni${s.sec===k?' on':''}" ${s.sec===k?'aria-current="page"':''} data-a="sesec" data-k="${k}">${ic(v[1],20)}<span>${v[0]}</span>${k==='backup'&&s.backupDays>7?'<i class="se-dot" aria-label="ควรสำรองข้อมูล"></i>':''}</button>`).join('')}</nav>`;
}
const seRow=(l,h,right='',dev=false)=>`<div class="se-row"><div class="se-l"><div>${l}</div>${h?`<div class="tip">${h}</div>`:''}${dev?'<span class="hm-chip muted">เครื่องนี้เท่านั้น</span>':''}</div><div class="se-r">${right}</div></div>`;
const seSw=(k,on,label)=>`<button class="switch ${on?'on':''}" role="switch" aria-checked="${on}" aria-label="${label}" data-a="seswitch" data-k="${k}"><span class="knob"></span></button>`;
const seIn=(k,label,type='text',w='')=>`<label class="gb-fl se-f ${w}">${label}<input data-se="${k}" type="${type}" value="${S.se.form[k]}"></label>`;
function seCards(){
  const s=S.se,keys=cardOrder('settings');if(!keys.length)return'';
  const def={
    status:()=>`<div class="gb-tile">${ic(offline()?'cloud-off':'cloud-check',20)}เครื่องนี้: ${offline()?'ออฟไลน์':'ออนไลน์'} · รอส่ง ${offline()?7:0} · ที่เก็บข้อมูล <b>ขอเก็บถาวรแล้ว</b></div>`,
    backup:()=>`<div class="gb-tile${s.backupDays>7?' warn':''}">${ic('database-export',20)}สำรองล่าสุด ${s.backupDays} วันที่แล้ว <button class="gb-n" data-a="sesec" data-k="backup">สำรองเลย</button></div>`,
    term:()=>`<div class="gb-tile">${ic('calendar-stats',20)}ภาคเรียน 2/2569 · เหลือ 148 วัน <button class="gb-n" data-a="seterm">เริ่มภาคเรียนใหม่</button></div>`,
    devices:()=>`<div class="gb-tile">${ic('devices',20)}อุปกรณ์ ${s.devices.length} เครื่อง · ล่าสุด ${s.devices[0].n}</div>`,
    history:()=>`<div class="gb-tile">${ic('history',20)}แก้ไขล่าสุด: ${(S.gb&&S.gb.log[0])?S.gb.log[0].x:'—'}</div>`,
  };
  return `<div class="gb-strip" role="group" aria-label="การ์ดสรุป">${keys.map(k=>def[k]?def[k]():'').join('')}</div>`;
}
function seGeneral(){
  const s=S.se,themeSeg=`<div class="seg"><button class="${s.theme==='system'?'on':''}" data-a="setheme" data-k="system">ตามเครื่อง</button><button class="${s.theme==='light'?'on':''}" data-a="setheme" data-k="light">สว่าง</button><button class="${s.theme==='dark'?'on':''}" data-a="setheme" data-k="dark">มืด</button></div>`;
  return `${seCards()}<section class="card se-card" aria-labelledby="se-gh"><h2 id="se-gh">ข้อมูลโรงเรียน</h2><div class="gb-f3" style="grid-template-columns:1fr 1fr">${seIn('school','ชื่อโรงเรียน')}${seIn('teacher','ชื่อครู')}</div>
   ${seRow('ธีม','ใช้กับทุกเครื่อง · บันทึกทันที',themeSeg)}</section>
   <section class="card se-card" aria-labelledby="se-dh"><h2 id="se-dh">การแสดงผลบนเครื่องนี้</h2>
   ${seRow('ขนาดตัวอักษร','14–24 · iPad แนะนำ 18',`<div class="row" style="gap:6px"><button class="ib" data-a="sefont" data-k="-1" aria-label="ลด">${ic('minus',20)}</button><b style="min-width:2.4em;text-align:center">${s.font}px</b><button class="ib" data-a="sefont" data-k="1" aria-label="เพิ่ม">${ic('plus',20)}</button><button class="ghost" data-a="sefont" data-k="0">ค่าเริ่มต้น</button></div>`,true)}
   ${seRow('ความหนาแน่น','แถวต่ำสุด 44px เสมอบนจอสัมผัส',`<div class="seg"><button class="${s.dens==='compact'?'on':''}" data-a="sedens" data-k="compact">กระชับ</button><button class="${s.dens==='normal'?'on':''}" data-a="sedens" data-k="normal">ปกติ</button><button class="${s.dens==='roomy'?'on':''}" data-a="sedens" data-k="roomy">โปร่ง</button></div>`,true)}
   ${seRow('ใช้ออฟไลน์','ติดตั้งข้อมูลไว้ในเครื่องแล้ว เปิดตอนไม่มีเน็ตได้',badge('success','พร้อม','circle-check'),true)}
   ${seRow('ที่เก็บข้อมูลในเครื่องนี้','กันระบบลบข้อมูลที่ยังไม่ส่งขึ้นระบบ',badge('success','ขอเก็บถาวรแล้ว','circle-check'),true)}</section>`;
}
function seTime(){
  const s=S.se;
  return `<section class="card se-card" aria-labelledby="se-th"><h2 id="se-th">เวลาเรียน</h2>${seRow('เริ่มนับสาย (เช็คชื่อรายวัน)','สแกนหลังเวลานี้ = สาย',seIn('late','','time','se-t'))}
   <div class="se-ptitle">เวลาเริ่มคาบ <span class="tip">เว้นว่างได้ · ใช้ตอนเช็คชื่อรายคาบ</span></div>
   <div class="se-pgrid">${[1,2,3,4,5,6,7,8].map(p=>`<label class="gb-fl">คาบ ${p}<input data-se="p${p}" type="time" value="${s.form['p'+p]}"></label>`).join('')}</div></section>`;
}
function seScan(){
  const s=S.se;
  return `<section class="card se-card" aria-labelledby="se-sh"><h2 id="se-sh">การสแกน</h2>${seRow('เสียงตอบรับ','เสียงสั้นเมื่อสแกนสำเร็จ / ผิดพลาด',seSw('sound',s.sound,'เสียงตอบรับ'))}
   ${seRow('รับบาร์โค้ดบัตรนักเรียนเดิม','เปิดเมื่อบัตรเดิมยังใช้รหัสนักเรียน',seSw('code',s.code,'รับบาร์โค้ดบัตรนักเรียนเดิม'))}
   ${seRow('ทดสอบเครื่องยิง','ยิงแล้วดูค่าที่อ่านได้ — ไม่บันทึกอะไร',`<button data-a="sehid">${ic('barcode',20)}ทดสอบ</button>`)}${s.hid?`<div class="se-test">อ่านได้: <b>${s.hid}</b></div>`:''}
   ${seRow('ทดสอบกล้อง','ใช้กับ iPad/มือถือ',`<button data-a="secam">${ic('camera',20)}${s.cam?'หยุดทดสอบ':'เริ่มทดสอบกล้อง'}</button>`)}${s.cam?`<div class="se-test">${ic('camera',20)} กล้องพร้อม — ส่องบัตร QR ได้เลย (จำลอง)</div>`:''}</section>`;
}
function seCatalog(){
  const s=S.se,tabs={class:'ห้องเรียน',subj:'วิชา',type:'ประเภทงาน',term:'ภาคเรียน'};
  const tab=`<div class="seg" role="tablist">${Object.entries(tabs).map(([k,v])=>`<button role="tab" aria-selected="${s.cat===k}" class="${s.cat===k?'on':''}" data-a="secat" data-k="${k}">${v}</button>`).join('')}</div>`;
  let body='';
  if(s.cat==='class')body=s.classes.map((c,i)=>`<div class="se-li"><span class="mv"><button class="ib ghost" aria-label="ขึ้น" data-a="semv" data-k="${i}|-1" ${i===0?'disabled':''}>${ic('chevron-up',20)}</button><button class="ib ghost" aria-label="ลง" data-a="semv" data-k="${i}|1" ${i===s.classes.length-1?'disabled':''}>${ic('chevron-down',20)}</button></span><span class="grow">${c.n}${c.arch?' <span class="tip">(เก็บแล้ว)</span>':''} <span class="tip">· ปีการศึกษา ${c.y}</span></span><button class="ghost" data-a="seedit" data-k="${i}">แก้ไข</button><button class="ghost" data-a="search" data-k="${i}">${c.arch?'นำกลับ':'เก็บ'}</button></div>`).join('')+`<div class="se-li"><input class="se-add" aria-label="ชื่อห้องใหม่" placeholder="เพิ่มห้อง เช่น ป.6/4" data-se="newclass"><button data-a="seaddclass">เพิ่ม</button></div>`;
  else if(s.cat==='subj')body=s.subjects.map(x=>`<div class="se-li"><span class="chip aqua">${x.c}</span><span class="grow">${x.n}</span><button class="ghost" data-a="toast" data-k="แก้ไขวิชา (ของเดิม)">แก้ไข</button></div>`).join('');
  else if(s.cat==='type')body=s.types.map(x=>`<div class="se-li"><span class="grow">${x.n}</span><span class="tip">เต็มเริ่มต้น ${x.f}${x.exam?' · เป็นการสอบ':''}</span><button class="ghost" data-a="toast" data-k="แก้ไขประเภทงาน (ใช้กับงานที่สร้างใหม่เท่านั้น)">แก้ไข</button></div>`).join('')+'<div class="tip">แก้เต็มเริ่มต้นมีผลกับงานที่สร้างใหม่เท่านั้น</div>';
  else body=`<div class="se-li"><span class="grow">ภาคเรียนปัจจุบัน: <b>2/2569</b></span><button class="primary" data-a="seterm">${ic('calendar-stats',20)}เริ่มภาคเรียนใหม่</button></div>`+s.terms.map(t=>`<div class="se-li"><span class="grow">${t.n}${t.cur?' '+badge('success','ปัจจุบัน'):''}<div class="tip">${fmtS(t.s)} – ${fmtS(t.e)}</div></span>${t.cur?'':`<button class="ghost" data-a="setermcur" data-k="${t.n}">ตั้งเป็นปัจจุบัน</button>`}<button class="ghost" data-a="toast" data-k="แก้ไขวันที่ภาคเรียน (ของเดิม)">แก้ไข</button></div>`).join('');
  return `<section class="card se-card" aria-labelledby="se-ch"><h2 id="se-ch">ห้องเรียน วิชา และภาคเรียน</h2>${tab}<div class="se-lst">${body}</div></section>`;
}
function seDevices(){
  const s=S.se;
  return `<section class="card se-card" aria-labelledby="se-vh"><h2 id="se-vh">อุปกรณ์ที่เข้าสู่ระบบ</h2>${s.devices.map(d=>`<div class="se-li"><span class="grow">${d.n} ${d.cur?badge('success','เครื่องนี้'):''}<div class="tip">${d.ua} · ใช้ล่าสุด ${d.last}</div></span>${d.cur?'':`<button class="ghost" data-a="sesignout" data-k="${d.id}">ออกจากระบบ</button>`}</div>`).join('')}
   ${seRow('ตรวจเครื่องนี้','ที่เก็บข้อมูล เน็ต กล้อง เครื่องยิง',`<button data-a="toast" data-k="ตรวจเครื่องนี้: ผ่านทุกข้อ (จำลอง)">ตรวจ</button><button class="ghost" data-a="toast" data-k="คัดลอกผลตรวจแล้ว">คัดลอกผล</button>`)}</section>
   <section class="card se-card" aria-labelledby="se-ph"><h2 id="se-ph">บัญชีและรหัสผ่าน</h2>
   ${seRow('อีเมลเข้าสู่ระบบ',s.emailEdit?'':'ใช้ยืนยันตัวตนตอนเข้าสู่ระบบ',s.emailEdit?`<input class="se-add" data-se="email" value="${s.email}" aria-label="อีเมลใหม่"><button class="primary" data-a="seemailsave">บันทึก</button><button class="ghost" data-a="seemailx">ยกเลิก</button>`:`<span>${s.email}</span><button class="ghost" data-a="seemail">เปลี่ยน</button>`)}
   <div class="gb-note">${ic('info-circle',16)} เปลี่ยนอีเมล <span class="badge-sa">ต้องมี API ใหม่</span> — ตอนนี้ระบบมีเฉพาะการผูกอีเมลครั้งแรก (worker/routes/auth.ts)</div>
   ${s.pw.open?`<div class="se-pw"><label class="gb-fl">รหัสผ่านเดิม<input type="password" data-se="pwa" value="${s.pw.a}" autocomplete="current-password"></label><label class="gb-fl">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)<input type="password" data-se="pwb" value="${s.pw.b}" autocomplete="new-password"></label><div class="row" style="gap:6px"><button class="primary" data-a="sepwsave" ${s.pw.a&&s.pw.b.length>=6?'':'disabled'}>บันทึก</button><button class="ghost" data-a="sepwx">ยกเลิก</button></div></div>`:seRow('รหัสผ่าน','เปลี่ยนแล้วอุปกรณ์อื่นยังเข้าได้',`<button data-a="sepw">เปลี่ยนรหัสผ่าน</button>`)}</section>`;
}
function seBackup(){
  const s=S.se;
  return `${s.backupDays>7?`<div class="banner" role="status">${ic('alert-triangle',20)}<span class="grow">สำรองล่าสุด ${s.backupDays} วันที่แล้ว · ควรสำรองสัปดาห์ละครั้ง</span><button data-a="sebackup">สำรองเลย</button></div>`:''}
   <section class="card se-card" aria-labelledby="se-bh"><h2 id="se-bh">สำรองและกู้คืน</h2>
   ${seRow('ดาวน์โหลดไฟล์สำรอง (JSON)',`สำรองล่าสุด: ${s.backupDays} วันที่แล้ว`,`<button class="primary" data-a="sebackup">${ic('download',20)}ดาวน์โหลด</button>`)}
   <div class="se-pdpa" role="note">${ic('alert-triangle',20)}<div><b>ไฟล์สำรองมีข้อมูลส่วนบุคคลของนักเรียน (ผู้เยาว์) และไม่ได้เข้ารหัส</b><div class="tip">เก็บไว้ในที่ปลอดภัย อย่าส่งต่อทาง LINE/อีเมลสาธารณะ — จะมีหน้าต่างเตือนอีกครั้งก่อนดาวน์โหลด</div></div></div>
   ${seRow('กู้คืนจากไฟล์สำรอง','แทนที่ข้อมูลปัจจุบันทั้งหมด · ระบบสำรองให้อัตโนมัติก่อนกู้',`<button data-a="serestore">${ic('upload',20)}กู้คืน</button>`)}</section>
   <section class="card se-card se-danger" aria-labelledby="se-zh"><h2 id="se-zh">${ic('alert-triangle',20)} เริ่มใหม่ (ล้างข้อมูล)</h2>
   ${seRow('ล้างข้อมูลทดลอง','ลบงาน คะแนน เช็คชื่อ — เก็บห้องและนักเรียน',`<button class="dan" data-a="sereset" data-k="data">ล้างข้อมูลทดลอง…</button>`)}
   ${seRow('ล้างทั้งหมด','เริ่มใหม่ตั้งแต่ต้น (ต้องใส่รหัสผ่าน)',`<button class="dan" data-a="sereset" data-k="all">ล้างทั้งหมด…</button>`)}</section>`;
}
function seHistory(){
  const s=S.se,ents={all:'ทั้งหมด',sub:'ส่งงาน',att:'เช็คชื่อ',stu:'นักเรียน',qr:'บัตร QR'};
  const rows=[['10:31','ส่งงาน','ตั้ง “ยกเว้น” เลขที่ 7 · แบบฝึกหัด 5'],['10:12','ส่งงาน','ให้คะแนน เลขที่ 21 · 8/10'],['09:48','ส่งงาน','อีกเครื่อง: ปิดรับ ใบงาน 4 ร้อยละ'],['08:40','เช็คชื่อ','เช็คชื่อ ป.6/2 · 32 คน'],['เมื่อวาน','นักเรียน','แก้ชื่อเล่น เลขที่ 8'],['เมื่อวาน','บัตร QR','ออก QR ใหม่ เลขที่ 17']].filter(r=>s.hist==='all'||ents[s.hist]===r[1]);
  return `<section class="card se-card" aria-labelledby="se-yh"><h2 id="se-yh">ประวัติการแก้ไข</h2><div class="chiprow">${Object.entries(ents).map(([k,v])=>`<button class="pill${s.hist===k?' on':''}" data-a="sehist" data-k="${k}">${v}</button>`).join('')}</div>${rows.map(r=>`<div class="se-li"><span class="tip" style="min-width:5em">${r[0]}</span><span class="chip">${r[1]}</span><span class="grow">${r[2]}</span></div>`).join('')}</section>`;
}
function seHtml(){
  const s=S.se,d=seDirty();
  const head=`<header class="pghead"><div class="hr"><span class="pgtile">${ic('settings',24)}</span><div><h1>ตั้งค่า</h1><div class="tip">${s.form.school} · ${s.form.teacher}</div></div></div><div class="act">${syncBadge()}${s.sec==='general'?prefsBtn():''}</div></header>`;
  const body={general:seGeneral,time:seTime,scan:seScan,catalog:seCatalog,devices:seDevices,backup:seBackup,history:seHistory}[s.sec]();
  const bar=d?`<div class="se-bar" role="status" aria-live="polite"><span class="grow">แก้ไขแล้ว <b>${d}</b> รายการ ยังไม่บันทึก</span><button class="ghost" data-a="sebarcancel">ยกเลิก</button><button class="primary" data-a="sebarsave">${ic('device-floppy',20)}บันทึก</button></div>`:'';
  return `<div class="rp-page se-page">${head}<div class="se-wrap${isNarrow()?' phone':''}">${seNav()}<div class="se-body">${body}</div></div>${bar}</div>`;
}
function seOverlays(){
  const s=S.se;let o='';const d=S.dlg;
  if(d&&d.t==='sesignout'){const x=s.devices.find(v=>v.id===d.id);o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="se-d"><h2 id="se-d">ออกจากระบบ “${x.n}”?</h2><div class="tip">เครื่องนั้นต้องเข้าสู่ระบบใหม่ · ข้อมูลที่ยังไม่ส่งในเครื่องนั้นไม่หาย</div><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="sedlgno" autofocus>ยกเลิก</button><button class="dan" data-a="sedlgyes">ออกจากระบบ</button></div></div></div>`}
  if(d&&d.t==='sepdpa')o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="se-d"><h2 id="se-d">ก่อนดาวน์โหลดไฟล์สำรอง</h2><div class="se-pdpa">${ic('alert-triangle',20)}<div><b>ไฟล์นี้มีข้อมูลส่วนบุคคลของนักเรียน (ผู้เยาว์) และไม่ได้เข้ารหัส</b></div></div><p><b>ในไฟล์มี:</b> ชื่อ รหัส เลขที่ คะแนน การเช็คชื่อ</p><p><b>เก็บให้ปลอดภัย:</b> ในเครื่องหรือไดรฟ์ที่มีรหัสผ่าน ไม่ส่งต่อทางแชตสาธารณะ</p><p><b>ถ้าไฟล์หลุดไป:</b> แจ้งผู้บริหารโรงเรียนตามขั้นตอนข้อมูลส่วนบุคคล</p><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="sedlgno" autofocus>ยกเลิก</button><button class="primary" data-a="sedlgyes">เข้าใจแล้ว ดาวน์โหลด</button></div></div></div>`;
  if(d&&d.t==='serestore'){const r=s.rs;o+=`<div class="modal"><div class="dlg gb-dlg" role="dialog" aria-modal="true" aria-labelledby="se-d"><h2 id="se-d">กู้คืนจากไฟล์สำรอง</h2>
   ${r.step===1?`<button class="st-drop" data-a="sersfile">${ic('upload',28)}<b>เลือกไฟล์ .json</b><span class="tip">ตรวจความถูกต้องของไฟล์ก่อนแทนข้อมูล</span></button>`:r.step===2?`<div class="gb-note">${ic('alert-triangle',16)} ไฟล์สำรองเมื่อ 31 ต.ค. 2569 · นักเรียน 129 · งาน 16 · ส่งงาน 1,980 · เช็คชื่อ 4,830 · รวม 7,2xx แถว<br>กู้คืนจะ<b>แทนที่ข้อมูลปัจจุบันทั้งหมด</b> (ระบบสำรองข้อมูลปัจจุบันให้ก่อนอัตโนมัติ)</div><label class="gb-fl">พิมพ์ “ยืนยัน” เพื่อกู้คืน<input data-se="rstyped" value="${r.typed}"></label>`:`<div class="se-test">${ic('check',20)} กู้คืนข้อมูลสำเร็จ</div>`}
   <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="sedlgno">${r.step===3?'เสร็จสิ้น':'ยกเลิก'}</button>${r.step===2?`<button class="dan" data-a="serestorego" ${r.typed==='ยืนยัน'?'':'disabled'}>กู้คืน</button>`:''}</div></div></div>`}
  if(d&&d.t==='sereset'){const all=s.rtype==='all';o+=`<div class="modal"><div class="dlg gb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="se-d"><h2 id="se-d">${all?'ล้างทั้งหมด เริ่มใหม่ตั้งแต่ต้น':'ล้างข้อมูลทดลอง'}</h2><div class="tip"><b>ที่จะถูกลบ:</b> ${all?'ทุกอย่าง รวมห้องและนักเรียน':'งาน คะแนน เช็คชื่อ'} · <b>ที่เก็บไว้:</b> ${all?'บัญชีครู':'ห้อง นักเรียน ตั้งค่า'}</div><label class="se-conf"><input type="checkbox" data-se="rbackup" checked> ดาวน์โหลดไฟล์สำรองก่อนลบ (แนะนำ)</label><label class="gb-fl">รหัสผ่าน<input type="password" data-se="rpw"></label><label class="gb-fl">พิมพ์ “${all?'ล้างทั้งหมด':'ล้างข้อมูล'}” เพื่อยืนยัน<input data-se="rtyped" value="${s.rtyped}"></label><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="ghost" data-a="sedlgno" autofocus>ยกเลิก</button><button class="dan" data-a="seresetgo" ${s.rtyped===(all?'ล้างทั้งหมด':'ล้างข้อมูล')?'':'disabled'}>ล้างข้อมูล</button></div></div></div>`}
  if(d&&d.t==='seterm'){const t=s.tf;const newYear=t.newyear;
    o+=`<div class="modal gb-modal"><div class="dlg gb-asg" role="dialog" aria-modal="true" aria-labelledby="se-d"><div class="row" style="justify-content:space-between"><h2 id="se-d">เริ่มภาคเรียนใหม่</h2><button class="icon ghost" data-a="sedlgno" aria-label="ปิด">${ic('x',20)}</button></div>
    <div class="tip">ภาคเรียนปัจจุบัน: 2/2569 · สิ่งที่ทำไว้ในภาคเรียนเดิมไม่ถูกลบหรือแก้</div>
    <div class="gb-f3" style="grid-template-columns:1fr 1fr"><label class="gb-fl">ปีการศึกษา (พ.ศ.)<input data-se="tfyear" inputmode="numeric" value="${t.year}"></label><div class="gb-fl">ภาคเรียน<div class="seg"><button class="${t.term===1?'on':''}" data-a="setfterm" data-k="1">1</button><button class="${t.term===2?'on':''}" data-a="setfterm" data-k="2">2</button></div></div></div>
    <div class="gb-f3" style="grid-template-columns:1fr 1fr"><label class="gb-fl">วันเริ่ม<input type="date" data-se="tfstart" value="${t.start}"></label><label class="gb-fl">วันสิ้นสุด (ใส่ทีหลังได้)<input type="date" data-se="tfend" value="${t.end}"></label></div>
    ${newYear?`<div class="gb-note">${ic('info-circle',16)} เป็นปีการศึกษาใหม่ (${t.year}) — ห้องว่างชื่อเดิม นักเรียนปี ${t.year-1} จะเป็น “จบปีการศึกษา”</div><div class="gb-fr"><div class="tip">ห้องที่เปิดต่อในปี ${t.year} (ห้องว่าง ชื่อเดิม)</div><div class="chiprow">${CLASSES.map(c=>`<button class="pill${t.keep.includes(c.id)?' on':''}" data-a="setfkeep" data-k="${c.id}" aria-pressed="${t.keep.includes(c.id)}">${t.keep.includes(c.id)?ic('check',14):''}${c.name}</button>`).join('')}</div></div><label class="se-conf"><input type="checkbox" data-se="tfclose" ${t.close?'checked':''}> ปิดรับงานที่ยังเปิดอยู่ของปี ${t.year-1} (7 งาน)</label><label class="se-conf"><input type="checkbox" data-se="tfok" ${t.ok?'checked':''}> ตรวจแล้ว — เริ่มปีการศึกษา ${t.year} ย้อนกลับเองไม่ได้</label>`:`<div class="gb-note">${ic('info-circle',16)} ปีการศึกษาเดิม — ห้องและนักเรียนเหมือนเดิม เปลี่ยนเฉพาะภาคเรียน</div>`}
    ${offline()?`<div class="gb-err" role="alert">เครื่องนี้ยังมีข้อมูลรอส่ง 7 รายการ — ส่งให้เสร็จก่อนเริ่มภาคเรียนใหม่</div>`:''}
    <div class="row" style="justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="ghost" data-a="setfyear">${newYear?'ใช้ปีเดิม':'ตั้งเป็นปีการศึกษาใหม่'}</button><span class="row" style="gap:6px"><button class="ghost" data-a="sedlgno">ยกเลิก</button><button class="primary" data-a="setfgo" ${(!newYear||t.ok)&&!offline()?'':'disabled'}>เริ่มภาคเรียน ${t.term}/${t.year}</button></span></div></div></div>`}
  return o;
}
function seAct(a,k,t,e){
  if(!a.startsWith('se'))return false;
  const s=S.se;
  switch(a){
  case 'sesec':s.sec=k;S.sub.settings=k;break;
  case 'seswitch':{const was=s[k];seSet(k==='sound'?'เสียงตอบรับ':'รับบาร์โค้ดบัตรเดิม',()=>{s[k]=was},()=>{s[k]=!was});break}
  case 'setheme':{const was=s.theme;seSet('ธีม',()=>{s.theme=was},()=>{s.theme=k});break}
  case 'sefont':{const was=s.font;const v=k==='0'?18:Math.max(14,Math.min(24,s.font+(+k)));seSet('ขนาดตัวอักษร (เครื่องนี้)',()=>{s.font=was},()=>{s.font=v});break}
  case 'sedens':{const was=s.dens;seSet('ความหนาแน่น (เครื่องนี้)',()=>{s.dens=was},()=>{s.dens=k});break}
  case 'sebarsave':{const n=seDirty();s.saved={...s.form};toast2(`บันทึกแล้ว · ${n} รายการ`,{label:'เลิกทำ',fn:()=>{S.toast=null;render()}});break}
  case 'sebarcancel':s.form={...s.saved};break;
  case 'sehid':s.hid=s.hid?'':'6012 (QR)';break;
  case 'secam':s.cam=!s.cam;break;
  case 'secat':s.cat=k;break;
  case 'semv':{const [i,d]=k.split('|').map(Number),j=i+d;[s.classes[i],s.classes[j]]=[s.classes[j],s.classes[i]];toast2('บันทึกลำดับห้องแล้ว');break}
  case 'seedit':toast2('แก้ชื่อห้อง (ของเดิม — แก้ในแถวแล้วบันทึกทันที)');break;
  case 'search':{const c=s.classes[+k];c.arch=!c.arch;toast2(c.arch?`เก็บ ${c.n} แล้ว · ห้องที่เก็บไม่ขึ้นในรายการ`:`นำ ${c.n} กลับแล้ว`,{label:'เลิกทำ',fn:()=>{c.arch=!c.arch;S.toast=null;render()}});break}
  case 'seaddclass':{const el=document.querySelector('[data-se="newclass"]');const v=(el&&el.value||'').trim();if(!v){toast2('พิมพ์ชื่อห้องก่อน');break}s.classes.push({n:v,arch:false,y:2569});toast2(`เพิ่ม ${v} แล้ว`);break}
  case 'setermcur':{s.terms.forEach(t=>t.cur=t.n===k);toast2(`ตั้ง ${k} เป็นภาคเรียนปัจจุบันแล้ว`);break}
  case 'seterm':S.dlg={t:'seterm'};break;
  case 'setfterm':s.tf.term=+k;break;
  case 'setfkeep':{const i=s.tf.keep.indexOf(k);if(i>=0)s.tf.keep.splice(i,1);else s.tf.keep.push(k);break}
  case 'setfyear':s.tf.newyear=!s.tf.newyear;s.tf.ok=false;s.tf.year=s.tf.newyear?2570:2569;s.tf.term=1;break;
  case 'setfgo':{const t=s.tf;S.dlg=null;s.terms.forEach(x=>x.cur=false);s.terms.push({n:`${t.term}/${t.year}`,cur:true,s:t.start,e:t.end||t.start});toast2(t.newyear?`เริ่มปีการศึกษา ${t.year} แล้ว — เปิดห้องใหม่ ${t.keep.length} ห้อง · นักเรียนจบปีการศึกษา`:`เริ่มภาคเรียน ${t.term}/${t.year} แล้ว`);break}
  case 'sesignout':S.dlg={t:'sesignout',id:+k};break;
  case 'sedlgno':S.dlg=null;s.rs={step:1,typed:''};s.rtyped='';break;
  case 'sedlgyes':{const d=S.dlg;S.dlg=null;if(d.t==='sesignout'){s.devices=s.devices.filter(v=>v.id!==d.id);toast2('ออกจากระบบอุปกรณ์นั้นแล้ว')}else if(d.t==='sepdpa'){s.backupDays=0;toast2('ดาวน์โหลด ngankrob-backup-2026-11-04.json แล้ว · บันทึกเวลาสำรอง')}break}
  case 'sebackup':S.dlg={t:'sepdpa'};break;
  case 'serestore':s.rs={step:1,typed:''};S.dlg={t:'serestore'};break;
  case 'sersfile':s.rs.step=2;break;
  case 'serestorego':s.rs.step=3;break;
  case 'sereset':s.rtype=k;s.rtyped='';S.dlg={t:'sereset'};break;
  case 'seresetgo':S.dlg=null;s.rtyped='';toast2(s.rtype==='all'?'ล้างทั้งหมดแล้ว (จำลอง) — เริ่มใหม่ตั้งแต่ต้น':'ล้างข้อมูลทดลองแล้ว (จำลอง)');break;
  case 'sehist':s.hist=k;break;
  case 'seemail':s.emailEdit=true;break;
  case 'seemailx':s.emailEdit=false;break;
  case 'seemailsave':s.emailEdit=false;toast2('ต้องมี API ใหม่ — ยังบันทึกอีเมลไม่ได้ (mockup)');break;
  case 'sepw':s.pw.open=true;break;
  case 'sepwx':s.pw={open:false,a:'',b:''};break;
  case 'sepwsave':s.pw={open:false,a:'',b:''};toast2('เปลี่ยนรหัสผ่านแล้ว');break;
  default:return false;
  }
  render();return true;
}
function seSim(k){
  const s=S.se;
  if(k==='se-dirty'){s.form.school='โรงเรียนสมมติวิทยา (ปรับ)';s.form.late='08:45'}
  else if(k==='se-stale'){s.backupDays=s.backupDays>7?3:12}
  else if(k==='se-save'){seAct('sebarsave')}
}
function seApplySub(){
  const s=S.se,sub=curSub();S.dlg=null;S.menu=null;
  if(SE_SECS[sub])s.sec=sub;
  else if(sub==='term'){S.dlg={t:'seterm'}}
  else if(sub==='reset'){s.sec='backup';s.rtype='data';s.rtyped='';S.dlg={t:'sereset'}}
}
document.addEventListener('input',e=>{const t=e.target;if(!S.se||S.page!=='settings'||!t.dataset||!t.dataset.se)return;
  const k=t.dataset.se;let focusKey=k;
  if(k in S.se.form){S.se.form[k]=t.value}
  else if(k==='email')S.se.email=t.value;
  else if(k==='pwa')S.se.pw.a=t.value;
  else if(k==='pwb')S.se.pw.b=t.value;
  else if(k==='rstyped')S.se.rs.typed=t.value;
  else if(k==='rtyped')S.se.rtyped=t.value;
  else if(k==='tfyear')S.se.tf.year=parseInt(t.value,10)||S.se.tf.year;
  else if(k==='tfstart')S.se.tf.start=t.value;
  else if(k==='tfend')S.se.tf.end=t.value;
  else return;
  const pos=t.selectionStart;render();const el=document.querySelector(`[data-se="${focusKey}"]`);if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(_){}}});
document.addEventListener('change',e=>{const t=e.target;if(!S.se||S.page!=='settings'||!t.dataset||!t.dataset.se)return;
  if(t.dataset.se==='tfclose'){S.se.tf.close=t.checked;render()}
  if(t.dataset.se==='tfok'){S.se.tf.ok=t.checked;render()}});
R3ACT.push(seAct);

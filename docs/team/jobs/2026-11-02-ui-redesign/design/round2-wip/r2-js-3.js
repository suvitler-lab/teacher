/* ===================== เช็คชื่อ ===================== */
const ST={p:['มา','check','p'],l:['สาย','clock','l'],v:['ลา','file-text','v'],k:['ป่วย','thermometer','k'],a:['ขาด','x','a']};
const ST_ORDER=['p','l','v','k','a'];
const curMap=()=>{const A=S.at;return A.mode==='period'?(A.per[A.cls+'|'+A.period]||(A.per[A.cls+'|'+A.period]={})):A.map[A.cls]};
function attCounts(m,total){const c={p:0,l:0,v:0,k:0,a:0};Object.values(m).forEach(s=>c[s]++);c.marked=c.p+c.l+c.v+c.k+c.a;c.total=total;c.unmarked=total-c.marked;return c}
function tileHtml(n,m){
  const s=m[n],A=S.at;
  const cls=s?ST[s][2]:'u';
  return `<button class="tile ${cls}${A.flash===n?' flash':''}" id="t${n}" data-a="tile" data-k="${n}" aria-label="เลขที่ ${n} ${nick(n)} ${s?ST[s][0]:'ยังไม่ได้เช็ค'}"><span class="no">${n}</span><span class="tx"><span class="nk">${nick(n)}</span><span class="st">${s?ic(ST[s][1],16)+ST[s][0]:'แตะเพื่อเช็ค'}</span></span></button>`;
}
function attSaveBadge(){
  const A=S.at;
  if(offline())return `<span class="sync offline">${ic('wifi-off',16)}ออฟไลน์ · รอส่ง ${A.pendN+4} รายการ — จะส่งเองเมื่อมีเน็ต</span>`;
  if(A.saving)return `<span class="sync saving">${ic('loader-2',16)}กำลังบันทึก</span>`;
  return `<span class="sync online">${ic('cloud-check',16)}บันทึกแล้ว</span>`;
}
function attHtml(){
  const A=S.at,cls=CL(A.cls),m=curMap(),c=attCounts(m,cls.total);
  const chips=CLASSES.map(x=>{const mm=A.map[x.id]||{},k=Object.keys(mm).length;const mark=k===0?'<span style="width:8px;height:8px;border-radius:50%;background:var(--fill-warning)"></span>':k<x.total?ic('circle-half-2',16):ic('check',16);return `<button class="pill${x.id===A.cls?' on':''}" data-a="atcls" data-k="${x.id}" aria-pressed="${x.id===A.cls}">${mark}${x.name} <span class="n">${x.total}</span></button>`}).join('');
  const tb=`<div class="toolbar"><div class="chiprow" role="group" aria-label="เลือกห้อง">${chips}</div>
   <div class="datenav"><button class="ib" data-a="date" data-k="-1" aria-label="วันก่อนหน้า">${ic('chevron-left',20)}</button><span class="d">${A.date===TODAY?'วันนี้ ':''}${dow(A.date)} ${fmtS(A.date)}</span><button class="ib" data-a="date" data-k="1" aria-label="วันถัดไป" ${A.date>=TODAY?'disabled':''}>${ic('chevron-right',20)}</button></div>
   <div class="seg" role="group" aria-label="รายวันหรือรายคาบ"><button class="${A.mode!=='period'?'on':''}" data-a="atper" data-k="0">รายวัน</button><button class="${A.mode==='period'?'on':''}" data-a="atper" data-k="1">รายคาบ</button></div></div>`;
  let row2='';
  if(A.mode==='period'){
    row2=`<div class="toolbar" role="group" aria-label="เลือกคาบ"><div class="chiprow">${[1,2,3,4,5,6,7,8].map(p=>`<button class="pill${p===A.period?' on':''}" data-a="atp" data-k="${p}" aria-pressed="${p===A.period}">คาบ ${p}</button>`).join('')}</div><select aria-label="วิชา" style="width:auto;min-height:var(--tap)" data-a="atsubj"><option>วิทยาศาสตร์</option><option>คณิตศาสตร์</option></select><span class="tip">คาบ ${A.period} เริ่ม ${['08:30','09:20','10:10','11:00','12:50','13:40','14:30','15:20'][A.period-1]}</span></div>`;
  }else if(cardOn('att','week')){
    const days=[0,1,2,3,4].map(i=>shift('2026-11-02',i));
    row2=`<div class="wk" role="group" aria-label="สัปดาห์นี้">${days.map(d=>{const fut=d>TODAY,sel=d===A.date;const mm=d===TODAY?m:(d<TODAY?{}:null);let t,i;
      if(fut){t='ยังไม่ถึง';i='';}else if(d===TODAY){t=c.marked===0?'ยังไม่เช็ค':c.marked<cls.total?`เช็ค ${c.marked}/${cls.total}`:`มา ${c.p+c.l}`;i=c.marked===0?'':(c.marked<cls.total?ic('circle-half-2',16):ic('check',16))}else{t=`มา ${cls.total-2} · ขาด 2`;i=ic('check',16)}
      return `<button class="${sel?'on':''}" data-a="atday" data-k="${d}" ${fut?'disabled':''} aria-label="${dow(d)} ${fmtS(d)} ${t}"><span>${dow(d)} ${+d.slice(8)} ${i}</span><small>${t}</small></button>`}).join('')}</div>`;
  }
  const sum=cardOn('att','sum')?`<section class="card sumcard" aria-labelledby="sh"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2 id="sh" style="font-size:1rem">มาเรียน ${c.p+c.l} จาก ${cls.total} คน${c.marked?` (${Math.round((c.p+c.l)*100/c.marked)}%)`:''}</h2><span class="tip">${c.unmarked?`ยังไม่เช็ค ${c.unmarked} คน`:'ครบทุกคนแล้ว'}</span></div>
    <div class="stack" aria-hidden="true">${ST_ORDER.map(s=>c[s]?`<i style="flex:${c[s]};background:var(--fill-${{p:'success',l:'warning',v:'accent',k:'purple',a:'danger'}[s]})"></i>`:'').join('')}${c.unmarked?`<i style="flex:${c.unmarked};background:var(--border-strong)"></i>`:''}</div>
    <div class="legend">${ST_ORDER.map(s=>`<span>${ic(ST[s][1],14)} ${ST[s][0]} ${c[s]}</span>`).join('')}<span><i style="border:1.5px dashed var(--text-muted);background:none"></i>ยังไม่เช็ค ${c.unmarked}</span></div></section>`:'';
  const brush=A.mode==='scan'?'':`<div class="brush"><div class="lbl">${A.cycle?'แตะชื่อเพื่อวนสถานะ มา → สาย → ลา → ป่วย → ขาด':'เลือกสถานะ แล้วแตะชื่อเด็ก'}</div><div class="stbtns" role="group" aria-label="สถานะที่จะใช้">${ST_ORDER.map(s=>`<button class="stbtn ${ST[s][2]}${!A.cycle&&A.brush===s?' on':''}" data-a="brush" data-k="${s}" aria-pressed="${!A.cycle&&A.brush===s}">${ic(ST[s][1],24)}${ST[s][0]}</button>`).join('')}<button class="allp" data-a="allp">${ic('user-check',20)}มาทั้งห้อง</button></div>
    <div class="row" style="margin-top:6px"><button class="hm-chip muted" data-a="cycle" aria-pressed="${A.cycle}" style="cursor:pointer">${ic('refresh',16)}${A.cycle?'ใช้ปุ่มสถานะ':'วนสถานะ'}</button><span class="badge-sa">ตัวเลือก — รอตัดสินที่ Gate 2</span></div></div>`;
  const scanCard=A.mode==='scan'?`<section class="card scancard" aria-labelledby="qh"><h2 id="qh" style="font-size:1rem">${ic('qrcode',20)} ยิง QR เพื่อเช็คชื่อ</h2><label class="scanin"><span>${ic('scan',24)}</span><span>ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter (หลัง ${'08:30'} = สาย)</span></label><div class="${A.scanMsg?'fb success':'tip'}" role="status" aria-live="polite" style="${A.scanMsg?'min-height:3rem':''}">${A.scanMsg?`<span class="ic">${ic('check',22)}</span><div><div class="nm" style="font-size:1.1rem">${A.scanMsg}</div></div>`:'ยังไม่มีใครสแกนในรอบนี้'}</div></section>`:'';
  const todoNums=Array.from({length:cls.total},(_,i)=>i+1).filter(n=>!m[n]);
  const away=Object.keys(m).filter(n=>['a','v','k'].includes(m[n])).map(Number);
  const cardsSide=cardOrder('att','side').map(k=>{
    if(k==='scans')return A.mode==='scan'&&A.scans.length?`<section class="card" aria-labelledby="lh"><h2 id="lh" style="font-size:1rem">${ic('qrcode',20)} สแกนล่าสุด</h2>${A.scans.slice(0,5).map(s=>`<div class="rrow"><span class="hm-chip accent">${s.n}</span><span class="nm">${nick(s.n)}</span>${badge(s.late?'warning':'success',s.late?'สาย':'มา',s.late?'clock':'check')}<span class="tip">${s.t}</span></div>`).join('')}</section>`:'';
    if(k==='todo')return `<section class="card" aria-labelledby="th"><h2 id="th" style="font-size:1rem">${ic('user-off',20)} ใครยังไม่เช็ค <span class="badge-sa">ข้อเสนอ SA</span></h2>${todoNums.length?`<div class="numchips">${todoNums.slice(0,30).map(n=>`<button class="hm-chip muted" data-a="jump" data-k="${n}" aria-label="ไปที่เลขที่ ${n}">${n}</button>`).join('')}${todoNums.length>30?`<span class="tip">+${todoNums.length-30}</span>`:''}</div>`:'<div class="tip" style="color:var(--text-success)">เช็คครบทุกคนแล้ว</div>'}</section>`;
    if(k==='away')return `<section class="card" aria-labelledby="ah"><h2 id="ah" style="font-size:1rem">${ic('user-x',20)} ขาดวันนี้ <span class="badge-sa">ข้อเสนอ SA</span></h2>${away.length?away.map(n=>`<div class="rrow"><span class="hm-chip accent">${n}</span><span class="nm">${fullName(n)}</span>${badge(m[n]==='a'?'danger':m[n]==='v'?'accent':'warning',ST[m[n]][0],ST[m[n]][1])}</div>`).join(''):'<div class="tip">ไม่มีใครขาด ลา หรือป่วย</div>'}</section>`:'';
    return '';}).join('');
  const warns=[];
  const tiles=`<div class="tiles" role="group" aria-label="รายชื่อ ${cls.name}">${Array.from({length:cls.total},(_,i)=>tileHtml(i+1,m)).join('')}</div>`;
  const top=cardOrder('att','top').map(k=>k==='sum'?sum:'').join('');
  const side=cardsSide.trim();
  const main=`${brush}${tiles}`;
  const body=isWide()&&side?`<div class="attgrid two"><div>${main}</div><div class="attside">${scanCard}${cardsSide}</div></div>`:`<div class="attgrid">${scanCard}${top?'':''}${main}${cardsSide?`<div class="attside" style="margin-top:8px">${cardsSide}</div>`:''}</div>`;
  const conflicts=S.scen==='offline'?`<section class="card" style="border-left:4px solid var(--fill-warning);padding:8px 14px;margin-bottom:8px" role="status"><b>มีเช็คชื่อที่ยังไม่ได้ส่งในที่อื่น</b><div class="rrow"><span class="nm">ป.6/3 · 3 พ.ย. · คาบ 2 — รอส่ง</span><button data-a="toast" data-k="เปิดรายการนั้น (ลิงก์ลึก ?class&date&subject&period)">เปิด</button></div></section>`:'';
  return `${pageHead('user-check','เช็คชื่อ',`${cls.name} · ${fmt(A.date)}`)}${tb}${row2}${conflicts}${isWide()&&side?'':''}${top}${body}
  <div class="savebar" role="status" aria-live="polite">${attSaveBadge()}<span class="tip">แตะแล้วบันทึกเอง ไม่ต้องกดบันทึก · ${c.marked}/${cls.total} คน</span></div>`;
}
function attTap(n){
  const A=S.at,m=curMap();
  const cur=m[n];
  if(A.cycle){const i=cur?ST_ORDER.indexOf(cur):-1;m[n]=ST_ORDER[(i+1)%5]}
  else if(cur===A.brush)delete m[n];else m[n]=A.brush;
  A.flash=n;A.saving=true;A.pendN++;
  setTimeout(()=>{S.at.saving=false;S.at.flash=null;render()},900);
}
function attScanNext(){
  const A=S.at,m=curMap(),cls=CL(A.cls);
  const n=ord(cls.total).find(x=>!m[x]);if(!n){A.scanMsg='';return toast2('เช็คครบทุกคนแล้ว')}
  const late=true;m[n]=late?'l':'p';A.scans.unshift({n,late,t:'10:4'+(A.scans.length%10)});A.scanMsg=`${nick(n)} · เลขที่ ${n} · ${late?'สาย':'มา'}`;A.flash=n;
  setTimeout(()=>{S.at.flash=null;render()},1200);
}

/* ===================== สุ่มชื่อ ===================== */
function rdPool(){
  const R=S.rd,total=CL(R.cls).total,m=S.at.map[R.cls]||{};
  const marked=Object.keys(m).length;
  let pool=Array.from({length:total},(_,i)=>i+1);
  if(R.presentOnly)pool=pool.filter(n=>m[n]==='p'||m[n]==='l');
  if(R.useRange)pool=pool.filter(n=>n>=R.range[0]&&n<=R.range[1]);
  return {pool,marked,total};
}
function rdBlock(){const R=S.rd,p=rdPool();if(R.presentOnly&&p.marked===0)return 'unchecked';if(!p.pool.length)return 'nobody';return null}
function rdPick(){
  const R=S.rd,{pool}=rdPool();if(rdBlock())return;
  const k=R.mode==='group'?0:(R.pair?2:R.count);
  if(R.mode==='group'){
    let ns=[...pool].sort(()=>Math.random()-.5);const g=R.byGroups?R.ngroups:Math.max(1,Math.round(ns.length/R.gsize));
    R.groups=Array.from({length:g},()=>[]);ns.forEach((n,i)=>R.groups[i%g].push(n));return;
  }
  let avail=R.norepeat?pool.filter(n=>!R.called.includes(n)):pool;
  if(avail.length<k&&R.norepeat){R.called=[];avail=pool;R.msg='ครบรอบแล้ว — เริ่มรอบใหม่'}else R.msg='';
  const picks=[...avail].sort(()=>Math.random()-.5).slice(0,Math.min(k,avail.length));
  R.called.push(...picks);R.cur=picks;R.left=R.timerSec;R.run=false;
}
function rdPass(){const R=S.rd;if(!R.cur)return;R.called=R.called.filter(n=>!R.cur.includes(n));rdPick()}
function rdUndo(){const R=S.rd;if(!R.cur)return;R.called=R.called.filter(n=>!R.cur.includes(n));R.cur=R.called.length?[R.called[R.called.length-1]]:null}
function randomHtml(){
  const R=S.rd,cls=CL(R.cls),{pool,marked}=rdPool(),block=rdBlock(),inRound=R.called.length,remain=Math.max(0,pool.length-R.called.filter(n=>pool.includes(n)).length);
  const chips=CLASSES.map(x=>`<button class="pill${x.id===R.cls?' on':''}" data-a="rdcls" data-k="${x.id}" aria-pressed="${x.id===R.cls}">${x.name} <span class="n">${x.total}</span></button>`).join('');
  const notice=block?`<div class="rnotice" role="status">${ic('alert-triangle',20)}<div class="grow">${block==='unchecked'?'<b>วันนี้ยังไม่ได้เช็คชื่อห้องนี้</b> — สุ่มเฉพาะคนที่มาไม่ได้':'<b>ไม่มีใครมาเรียนวันนี้</b> หรือไม่มีเลขที่ในช่วงที่เลือก'}</div>${block==='unchecked'?`<button data-a="toast" data-k="ไปหน้าเช็คชื่อ" ><span data-a="nav" data-k="attendance" style="display:contents">ไปเช็คชื่อ</span></button>`:''}<button data-a="rdall">ใช้ทั้งห้อง (${cls.total})</button></div>`:'';
  const cur=R.cur;
  let stage;
  if(block)stage=`<div class="rstage idle" aria-live="polite"><span class="poolchip hm-chip muted">${ic('users',16)}เฉพาะคนที่มา (${pool.length})</span>${ic('mood-empty',40)}<div class="rname" style="font-size:1.3rem;color:var(--text-secondary)">ยังไม่มีรายชื่อให้สุ่ม</div><div class="tip">ดูข้อความด้านบน</div></div>`;
  else if(R.mode==='group'){
    stage=R.groups?`<div class="rstage" style="align-items:stretch;text-align:left" aria-live="polite"><span class="hm-chip muted" style="align-self:flex-start">${ic('users',16)}${R.groups.length} กลุ่ม · ${pool.length} คน</span><div class="groups">${R.groups.map((g,i)=>`<div class="grp"><b><i style="background:${['#2f6fde','#148352','#e79a1c','#7c5cd6','#c93a3a','#0d6e6a','#9c2b63','#4b7314'][i%8]}"></i>กลุ่ม ${i+1} (${g.length})</b><div>${g.map((n,j)=>`${R.leaders&&j===0&&cardOn('random','gopts')?ic('crown',14)+' ':''}${n} ${nick(n)}`).join(' · ')}</div></div>`).join('')}</div></div>`:`<div class="rstage idle"><span class="poolchip hm-chip muted">${ic('users',16)}เฉพาะคนที่มา (${pool.length})</span>${ic('users-group',40)}<div class="rname" style="font-size:1.3rem;color:var(--text-secondary)">พร้อมจับกลุ่ม</div><div class="tip">กดปุ่ม หรือกด Space</div></div>`;
  }else if(cur){
    stage=`<div class="rstage" aria-live="polite"><span class="poolchip hm-chip muted">${ic('users',16)}${R.presentOnly?'เฉพาะคนที่มา':'ทั้งห้อง'} (${pool.length})</span>${cur.length===1?`<span class="rbadge">${cur[0]}</span><div class="rname">${fullName(cur[0])}</div><div class="tip">“${nick(cur[0])}” · เลขที่ ${cur[0]} · ${cls.name}</div>`
      :R.pair&&cardOn('random','pair')?`<div class="row" style="gap:18px;flex-wrap:wrap;justify-content:center">${cur.map(n=>`<div><span class="rbadge">${n}</span><div class="rname" style="font-size:calc(var(--u)*1.6)">${nick(n)}</div></div>`).join('<div class="tip" style="font-size:1.2rem">คู่กับ</div>')}</div>`
      :`<div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">${cur.map(n=>`<span class="hchip" style="min-height:calc(var(--u)*3)"><i>${n}</i>${nick(n)}</span>`).join('')}</div>`}${R.msg?`<div class="tip" style="color:var(--text-warning)">${R.msg}</div>`:''}</div>`;
  }else stage=`<div class="rstage idle" aria-live="polite"><span class="poolchip hm-chip muted">${ic('users',16)}${R.presentOnly?'เฉพาะคนที่มา':'ทั้งห้อง'} (${pool.length})</span>${ic('dice-3',40)}<div class="rname" style="font-size:1.3rem;color:var(--text-secondary)">พร้อมสุ่ม</div><div class="tip">กดปุ่ม หรือกด Space</div></div>`;
  const go=`<button class="primary go" data-a="rdgo" ${block?'disabled':''}>${ic(R.mode==='group'?'users-group':'dice-3',24)}${R.mode==='group'?'จับกลุ่ม':'สุ่มเลย'} <span style="opacity:.8;font-weight:400">(Space)</span></button>`;
  const seg=`<div class="seg" role="group" aria-label="โหมด"><button class="${R.mode==='pick'?'on':''}" data-a="rdmode" data-k="pick">สุ่มคน</button><button class="${R.mode==='group'?'on':''}" data-a="rdmode" data-k="group">จับกลุ่ม</button></div>`;
  const cardDefs={
    hist:()=>R.mode==='pick'?`<section class="card" aria-labelledby="hh"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2 id="hh" style="font-size:1rem">${ic('users',20)} เรียกแล้ว ${inRound} · เหลือ ${remain} คนในรอบนี้</h2>${inRound?`<button class="ghost" data-a="rdreset">เริ่มรอบใหม่</button>`:''}</div><div class="pbar" role="progressbar" aria-valuenow="${inRound}" aria-valuemax="${pool.length}"><div style="width:${pool.length?Math.min(100,inRound*100/pool.length):0}%"></div></div>${inRound?`<div class="hist">${R.called.map((n,i)=>`<span class="hchip${i===R.called.length-1?' last':''}"><i>${n}</i>${nick(n)}</span>`).join('')}</div>`:'<div class="tip">ยังไม่มีใครถูกเรียก</div>'}</section>`:'',
    opts:()=>`<section class="card" aria-labelledby="oh"><h2 id="oh" style="font-size:1rem">${ic('list-numbers',20)} ตัวเลือก</h2><div class="rctl" style="margin:6px 0 0"><button class="pill${R.presentOnly?' on':''}" data-a="rdpresent" aria-pressed="${R.presentOnly}">${ic(R.presentOnly?'check':'plus',16)}เฉพาะคนที่มา (${pool.length})</button>${R.mode==='pick'?`<button class="pill${R.norepeat?' on':''}" data-a="rdnorep" aria-pressed="${R.norepeat}">${ic(R.norepeat?'check':'plus',16)}ไม่ซ้ำจนครบ</button>`:''}<span class="step" role="group" aria-label="${R.mode==='group'?'กลุ่มละ':'จำนวน'}"><span class="tip">${R.mode==='group'?'กลุ่มละ':'จำนวน'}</span><button class="ib" data-a="rdstep" data-k="-1" aria-label="ลด">${ic('minus',20)}</button><b>${R.mode==='group'?(R.byGroups?R.ngroups:R.gsize):R.count}</b><button class="ib" data-a="rdstep" data-k="1" aria-label="เพิ่ม">${ic('plus',20)}</button></span></div></section>`,
    timer:()=>`<section class="card" aria-labelledby="tmh"><h2 id="tmh" style="font-size:1rem">${ic('stopwatch',20)} จับเวลาตอบ <span class="badge-sa">ข้อเสนอ SA</span></h2><div class="timer"><div class="tring">${ringSvg(R.timerSec?R.left/R.timerSec:0,96,R.left<=5?'var(--fill-danger)':'var(--accent)')}<div class="cap">${R.left}</div></div><div><div class="seg" role="group" aria-label="เวลา">${[10,30,60].map(s=>`<button class="${R.timerSec===s?'on':''}" data-a="tsec" data-k="${s}">${s} วิ</button>`).join('')}</div><div class="row" style="margin-top:8px"><button class="primary" data-a="trun">${ic(R.run?'player-stop':'player-play',20)}${R.run?'หยุด':'เริ่มจับเวลา'}</button><button class="ghost" data-a="tres">ตั้งใหม่</button></div></div></div></section>`,
    pass:()=>`<section class="card" aria-labelledby="psh"><h2 id="psh" style="font-size:1rem">${ic('arrow-back-up',20)} ข้าม / เลิกทำ <span class="badge-sa">ข้อเสนอ SA</span></h2><div class="row" style="flex-wrap:wrap;margin-top:6px"><button data-a="rdpass" ${R.cur?'':'disabled'}>${ic('player-skip-forward',20)}ข้ามคนนี้ (ไม่นับว่าเรียกแล้ว)</button><button data-a="rdundo" ${R.cur?'':'disabled'}>${ic('arrow-back-up',20)}เลิกทำครั้งล่าสุด</button></div></section>`,
    range:()=>`<section class="card" aria-labelledby="rgh"><h2 id="rgh" style="font-size:1rem">${ic('selector',20)} ช่วงเลขที่ <span class="badge-sa">ข้อเสนอ SA</span></h2><div class="rctl" style="margin:6px 0 0"><button class="pill${R.useRange?' on':''}" data-a="rduse" aria-pressed="${R.useRange}">${ic(R.useRange?'check':'plus',16)}ใช้ช่วงเลขที่</button><span class="step"><button class="ib" data-a="rdr" data-k="0,-1">${ic('minus',20)}</button><b>${R.range[0]}</b><button class="ib" data-a="rdr" data-k="0,1">${ic('plus',20)}</button></span><span>ถึง</span><span class="step"><button class="ib" data-a="rdr" data-k="1,-1">${ic('minus',20)}</button><b>${R.range[1]}</b><button class="ib" data-a="rdr" data-k="1,1">${ic('plus',20)}</button></span></div></section>`,
    pair:()=>`<section class="card" aria-labelledby="prh"><h2 id="prh" style="font-size:1rem">${ic('users-group',20)} จับคู่ <span class="badge-sa">ข้อเสนอ SA</span></h2><div class="rctl" style="margin:6px 0 0"><button class="pill${R.pair?' on':''}" data-a="rdpair" aria-pressed="${R.pair}">${ic(R.pair?'check':'plus',16)}สุ่ม 2 คน แสดงเป็นคู่</button></div></section>`,
    gopts:()=>R.mode==='group'?`<section class="card" aria-labelledby="gph"><h2 id="gph" style="font-size:1rem">${ic('crown',20)} ตัวเลือกกลุ่ม <span class="badge-sa">ข้อเสนอ SA</span></h2><div class="rctl" style="margin:6px 0 0"><div class="seg"><button class="${!R.byGroups?'on':''}" data-a="rdby" data-k="0">กลุ่มละกี่คน</button><button class="${R.byGroups?'on':''}" data-a="rdby" data-k="1">กี่กลุ่ม</button></div><button class="pill${R.leaders?' on':''}" data-a="rdlead" aria-pressed="${R.leaders}">${ic('crown',16)}หัวหน้ากลุ่ม</button><button data-a="copygrp" ${R.groups?'':'disabled'}>${ic('copy',20)}คัดลอกกลุ่ม</button></div></section>`:'',
  };
  const cards=cardOrder('random').map(k=>cardDefs[k]?cardDefs[k]():'').join('');
  return `${pageHead('dice-3','สุ่มชื่อ',`${cls.name} · มาเรียนวันนี้ ${marked?pool.length+' คน':'ยังไม่ได้เช็คชื่อ'}`)}<div class="chiprow" style="margin-bottom:8px" role="group" aria-label="เลือกห้อง">${chips}</div>${notice}
   <div class="rcols"><div class="rcol">${stage}<div class="rctl">${seg}${go}</div></div><div class="rcol">${cards||'<div class="card tip">ปิดการ์ดทั้งหมดอยู่ — กด "ปรับการ์ด" เพื่อเปิด</div>'}</div></div>`;
}

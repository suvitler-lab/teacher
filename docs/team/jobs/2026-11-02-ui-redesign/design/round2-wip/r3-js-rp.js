/* ===================== รอบ 3 ภาค 2 · รายงาน (rp-) ===================== */
/* ใช้ข้อมูลงาน/ช่องคะแนนร่วมกับหน้าคะแนน (GBW0 / gbCells / gbSt) และเช็คชื่อสมมติทั้งเทอม 38 วัน */
const RP_DAYS=38;
function rpAtt(cid,n){
  const o=CLASSES.findIndex(c=>c.id===cid)*3+n;
  const a=o%9===0?3:0,k=o%7===0?2:0,v=o%11===0?1:0,l=o%4===0?3:(o%6===0?1:0);
  return{p:RP_DAYS-a-k-v-l,l,v,k,a,days:RP_DAYS};
}
function initRp(){
  S.rp={cls:'c1',subj:'',period:'term',month:'2026-11',attMode:'daily',sort:'sub',dir:1,drawer:null,followAll:false,worksAll:false,updated:'10:32',busy:false,stale:S.scen==='offline',copied:'',printFrom:null};
}
function rpWorks(){
  const r=S.rp;
  return(S.gb?S.gb.works:[]).filter(w=>(!r.subj||w.subj===r.subj)&&(r.period==='term'||(w.assigned||'').slice(0,7)===r.month));
}
function rpStudent(cid,n,ws){
  let sub=0,app=0,miss=0,pend=0,sc=0,fs=0;const missing=[];
  ws.forEach(w=>{const c=gbCells(cid,w.id)[n],s=gbSt(w,c);
    if(s==='exc')return;
    if(s==='pend'){pend++;return}
    app++;
    if(s==='miss'){miss++;fs+=w.full;missing.push(w.title);return}
    sub++;if(s==='ok'||s==='late'){sc+=c.score;fs+=w.full}});
  const att=rpAtt(cid,n);
  return{n,sub,app,miss,pend,sc,fs,pct:app?Math.round(sub/app*100):null,scorePct:fs?Math.round(sc/fs*100):null,att,attPct:Math.round((att.p+att.l)/att.days*100),missing};
}
function rpModel(){
  const r=S.rp,cid=r.cls,tot=CL(cid).total,ws=rpWorks();
  const rows=[];for(let n=1;n<=tot;n++)rows.push(rpStudent(cid,n,ws));
  const works=ws.map(w=>{const k=gbCount(cid,w),cs=gbCells(cid,w.id);let s=0,m=0;for(let n=1;n<=tot;n++){const c=cs[n];if(c.k==='sub'&&c.score!=null){s+=c.score;m++}}
    const due=!!w.due&&w.due<=TODAY||w.closed;return{w,k,rate:k.tot?Math.round(k.sub/k.tot*100):0,avg:m?Math.round(s/m/w.full*100):null,due}});
  const dueW=works.filter(x=>x.due);
  const sub=dueW.reduce((a,x)=>a+x.k.sub,0),den=dueW.reduce((a,x)=>a+x.k.tot,0),notYet=works.length-dueW.length;
  const missing=rows.reduce((a,x)=>a+x.miss,0),missStu=rows.filter(x=>x.miss>0).length;
  const sc=rows.reduce((a,x)=>a+x.sc,0),fs=rows.reduce((a,x)=>a+x.fs,0);
  const attSum={p:0,l:0,v:0,k:0,a:0};rows.forEach(x=>{for(const q in attSum)attSum[q]+=x.att[q]});
  const attDen=rows.length*RP_DAYS;
  return{rows,works,sub,den,notYet,rate:den?Math.round(sub/den*100):null,missing,missStu,avg:fs?Math.round(sc/fs*100):null,attSum,attDen,attPct:attDen?Math.round((attSum.p+attSum.l)/attDen*100):null,follow:rows.filter(x=>x.miss>0).sort((a,b)=>b.miss-a.miss||a.n-b.n)};
}
function rpSorted(rows){
  const r=S.rp,key={n:x=>x.n,sub:x=>x.pct==null?101:x.pct,sc:x=>x.scorePct==null?-1:x.scorePct,att:x=>x.attPct}[r.sort]||(x=>x.n);
  return[...rows].sort((a,b)=>(key(a)-key(b))*r.dir||a.n-b.n);
}
const rpBarTone=p=>p>=85?'var(--fill-accent)':p>=60?'var(--fill-warning)':'var(--fill-danger)';
function rpHead(){
  const r=S.rp,c=CL(r.cls);
  return `<header class="pghead"><div class="hr"><span class="pgtile">${ic('chart-bar',24)}</span><div><h1>รายงานสรุป</h1><div class="tip">${c.name} · ${r.subj||'ทุกวิชา'} · ${r.period==='term'?'ทั้งเทอม':GBMON[r.month]}</div></div></div>
   <div class="act">${syncBadge()}<button class="ghost ${isNarrow()?'ib':''}" data-a="rprefresh" aria-label="โหลดใหม่">${ic('refresh',20,r.busy?'spin':'')}${isNarrow()?'':'โหลดใหม่'}</button><button class="ghost ${isNarrow()?'ib':''}" data-a="rpprint" aria-label="พิมพ์">${ic('printer',20)}${isNarrow()?'':'พิมพ์'}</button><button class="${isNarrow()?'ib':''}" data-a="rpexcel" aria-label="ส่งออก Excel">${ic('file-spreadsheet',20)}${isNarrow()?'':'ส่งออก Excel'}</button>${pjBtn()}${prefsBtn()}</div></header>`;
}
function rpToolbar(){
  const r=S.rp;
  const chips=CLASSES.map(x=>`<button class="pill${x.id===r.cls?' on':''}" data-a="rpcls" data-k="${x.id}" aria-pressed="${x.id===r.cls}">${x.name} <span class="n">${x.total}</span></button>`).join('');
  const subjMenu=`<span class="menu"><button data-a="menu" data-k="rpsubj" aria-haspopup="menu" aria-expanded="${S.menu==='rpsubj'}">วิชา: ${r.subj||'ทุกวิชา'} ${ic('chevron-down',16)}</button>${S.menu==='rpsubj'?`<div class="pop" role="menu">${['',...GBSUBJ].map(s=>`<button role="menuitem" class="${r.subj===s?'on':''}" data-a="rpsubj" data-k="${s}">${s||'ทุกวิชา'}</button>`).join('')}</div>`:''}</span>`;
  const per=`<div class="seg" role="group" aria-label="ช่วงเวลา"><button class="${r.period==='term'?'on':''}" data-a="rpperiod" data-k="term">ทั้งเทอม</button><button class="${r.period==='month'?'on':''}" data-a="rpperiod" data-k="month">รายเดือน</button></div>${r.period==='month'?`<span class="menu"><button data-a="menu" data-k="rpmonth" aria-haspopup="menu">${GBMON[r.month]} ${ic('chevron-down',16)}</button>${S.menu==='rpmonth'?`<div class="pop" role="menu">${Object.entries(GBMON).map(([k,v])=>`<button role="menuitem" class="${r.month===k?'on':''}" data-a="rpmonth" data-k="${k}">${v}</button>`).join('')}</div>`:''}</span>`:''}`;
  const att=`<span class="tip">เช็คชื่อ:</span><div class="seg" role="group" aria-label="แบบเช็คชื่อ"><button class="${r.attMode==='daily'?'on':''}" data-a="rpatt" data-k="daily">รายวัน</button><button class="${r.attMode==='period'?'on':''}" data-a="rpatt" data-k="period" ${r.subj?'':'disabled'}>รายคาบ${r.subj?' ('+r.subj+')':''}</button></div>`;
  const status=r.busy?`<span class="hm-chip muted">${ic('loader-2',16,'spin')}กำลังอัปเดตรายงาน…</span>`:r.stale?`<span class="hm-chip warning">${ic('cloud-off',16)}อัปเดตไม่สำเร็จ — ยังแสดงข้อมูลครั้งก่อน (${r.updated})</span>`:`<span class="hm-chip success">${ic('cloud-check',16)}ข้อมูลล่าสุด ${r.updated} · อัปเดตเองทุก 1 นาที</span>`;
  return `<div class="gb-bar"><div class="chiprow" role="group" aria-label="เลือกห้อง">${chips}</div><div class="gb-tb">${subjMenu}${per}${att}</div></div><div class="rp-status">${status}</div>`;
}
function rpCards(M){
  const r=S.rp,cid=r.cls,tot=CL(cid).total;
  const def={
    stats:()=>`<div class="rp-stats">
      <div class="rp-stat"><div class="l">อัตราส่งงาน</div><div class="v">${M.rate==null?'—':M.rate+'%'}</div><div class="h">ส่งแล้ว ${M.sub} จาก ${M.den} ที่ถึงกำหนด${M.notYet?` · ยังไม่ถึงกำหนด ${M.notYet}`:''}</div></div>
      <div class="rp-stat ${M.missing?'danger':''}"><div class="l">งานค้าง</div><div class="v">${M.missing} <small>ชิ้น</small></div><div class="h">นักเรียน ${M.missStu} คน</div></div>
      <div class="rp-stat"><div class="l">คะแนนเฉลี่ย</div><div class="v">${M.avg==null?'—':M.avg+'%'}</div><div class="h">คะแนนสะสม · ค้างส่งนับ 0</div></div>
      <div class="rp-stat"><div class="l">มาเรียน</div><div class="v">${M.attPct==null?'—':M.attPct+'%'}</div><div class="h">จาก ${RP_DAYS} ${r.attMode==='daily'?'วัน':'คาบ'} · ขาดรวม ${M.attSum.a} ครั้ง</div></div></div>`,
    works:()=>{const sorted=[...M.works].sort((x,y)=>{const g=q=>!q.due?2:q.rate<85?0:1;return g(x)-g(y)||(g(x)===0?x.rate-y.rate:0)});
      const lim=6,list=r.worksAll?sorted:sorted.slice(0,lim),low=M.works.filter(x=>x.due&&x.rate<85).length;
      return `<section class="card rp-card rp-works" aria-labelledby="rp-wh"><div class="rp-ch"><h2 id="rp-wh">${ic('clipboard-list',20)} อัตราส่งแต่ละงาน</h2><span class="tip">${M.works.length} งาน${low?` · ต่ำกว่า 85% ${low} งาน`:''}</span></div>
      <div class="rp-list${r.worksAll?' scroll':''}">${list.length?list.map(x=>`<button class="rp-wrow" data-a="rpwork" data-k="${x.w.id}" aria-label="${x.w.title} ส่งแล้ว ${x.k.sub} จาก ${x.k.tot}${x.k.exc?' ยกเว้น '+x.k.exc:''}"><span class="t"><b>${x.w.title}</b><small>${x.k.sub}/${x.k.tot}${x.k.exc?' · ยกเว้น '+x.k.exc:''}</small></span><span class="bar"><i style="width:${x.rate}%;background:${x.due?rpBarTone(x.rate):'var(--border-strong)'}"></i></span><span class="p">${x.due?x.rate+'%':'เก็บอยู่'}</span></button>`).join(''):'<div class="tip">ไม่มีงานในช่วงนี้</div>'}</div>
      ${M.works.length>lim?`<button class="ghost rp-more" data-a="rpworksall" aria-expanded="${r.worksAll}">${r.worksAll?`แสดงเฉพาะที่ต้องสนใจ ${lim} งาน`:`ดูทั้งหมด (${M.works.length})`} ${ic(r.worksAll?'chevron-up':'chevron-down',16)}</button>`:''}
      <div class="gb-legend"><span><i class="lg" style="background:var(--fill-accent)"></i>85% ขึ้นไป</span><span><i class="lg" style="background:var(--fill-warning)"></i>60–84%</span><span><i class="lg" style="background:var(--fill-danger)"></i>ต่ำกว่า 60%</span><span><i class="lg" style="background:var(--border-strong)"></i>ยังไม่ถึงกำหนด</span></div></section>`},
    att:()=>{const a=M.attSum,den=M.attDen;return `<section class="card rp-card" aria-labelledby="rp-ah"><div class="rp-ch"><h2 id="rp-ah">${ic('user-check',20)} การมาเรียน${r.attMode==='period'?' (รายคาบ)':''}</h2><span class="tip">${M.attPct==null?'—':M.attPct+'%'} · ${RP_DAYS} ${r.attMode==='daily'?'วัน':'คาบ'}</span></div>
      <div class="stack2" aria-hidden="true">${['p','l','v','k','a'].map(q=>a[q]?`<i style="flex:${a[q]};background:var(--fill-${{p:'success',l:'warning',v:'accent',k:'purple',a:'danger'}[q]})"></i>`:'').join('')}</div>
      <div class="legend2">${[['p','มา'],['l','สาย'],['v','ลา'],['k','ป่วย'],['a','ขาด']].map(([q,l])=>`<span><i style="background:var(--fill-${{p:'success',l:'warning',v:'accent',k:'purple',a:'danger'}[q]})"></i>${l} ${a[q]}</span>`).join('')}</div></section>`},
    hist:()=>{const bins=[0,0,0,0,0];M.rows.forEach(x=>{if(x.scorePct==null)return;const p=x.scorePct;bins[p<50?0:p<60?1:p<70?2:p<80?3:4]++});const mx=Math.max(1,...bins);
      return `<section class="card rp-card" aria-labelledby="rp-hh"><h2 id="rp-hh">${ic('chart-histogram',20)} การกระจายคะแนนสะสม</h2><div class="gb-hist">${['<50','50–59','60–69','70–79','80+'].map((l,i)=>`<div><i style="height:${Math.round(bins[i]/mx*48)+2}px"></i><small>${bins[i]}</small><small>${l}</small></div>`).join('')}</div></section>`},
    follow:()=>{const lim=4,list=M.follow.slice(0,lim);
      return `<section class="card rp-card rp-follow" aria-labelledby="rp-fh"><div class="rp-ch"><h2 id="rp-fh">${ic('flag',20)} ต้องติดตาม <span class="tip">${M.follow.length} คน</span></h2>${M.follow.length?`<button class="ghost" data-a="rpline" data-k="class">${ic(r.copied==='class'?'check':'copy',20)}${r.copied==='class'?'คัดลอกแล้ว':'คัดลอกไป LINE'}</button>`:''}</div>
      ${M.follow.length?`<div class="rp-list">${list.map(x=>`<button class="rp-frow" data-a="rpdrawer" data-k="${x.n}"><span class="no">${x.n}</span><span class="grow"><b>${fullName(x.n)}</b><small>${x.missing.slice(0,2).join(' · ')}${x.missing.length>2?' …':''}</small></span>${badge('danger',`ค้าง ${x.miss}`)}</button>`).join('')}</div>${M.follow.length>lim?`<button class="ghost rp-more" data-a="rpfollowfull">ดูทั้งหมด (${M.follow.length}) ${ic('chevron-right',16)}</button>`:''}`:`<div class="tip" style="color:var(--text-success)">${ic('circle-check',16)} ส่งงานครบทุกคน</div>`}</section>`},
    audit:()=>`<section class="card rp-card" aria-labelledby="rp-au"><h2 id="rp-au">${ic('history',20)} แก้ไขล่าสุด <span class="badge-sa">ข้อเสนอ SA</span></h2>${(S.gb?S.gb.log:[]).slice(0,5).map(x=>`<div class="gb-log"><span class="tip">${x.t}</span> ${x.x}</div>`).join('')}</section>`,
  };
  const ord=cardOrder('reports'),L=ord.filter(k=>k==='works'),R=ord.filter(k=>k!=='works'&&k!=='stats');
  const html=k=>def[k]?def[k]():'';
  const stats=ord.includes('stats')?html('stats'):'';
  const bento=(L.length||R.length)?`<div class="rp-bento${L.length&&R.length?'':' one'}">${L.length?`<div class="rp-col">${L.map(html).join('')}</div>`:''}${R.length?`<div class="rp-col">${R.map(html).join('')}</div>`:''}</div>`:'';
  return stats+bento;
}
function rpTable(M){
  const r=S.rp,rows=rpSorted(M.rows);
  const th=(k,l,cls='')=>`<th scope="col" class="${cls}" aria-sort="${r.sort===k?(r.dir===1?'ascending':'descending'):'none'}"><button class="rp-sort${r.sort===k?' on':''}" data-a="rpsort" data-k="${k}">${l}${r.sort===k?ic(r.dir===1?'chevron-up':'chevron-down',14):ic('arrows-sort',14)}</button></th>`;
  return `<section class="card rp-card" aria-labelledby="rp-th"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2 id="rp-th">${ic('users',20)} รายบุคคล</h2><span class="tip">แตะหัวตารางเพื่อเรียง · แตะชื่อเพื่อดูรายละเอียด</span></div>
   <div class="rp-tw"><table class="rp-t"><thead><tr>${th('n','#','c-no')}${th('n','ชื่อ','c-nm')}${th('sub','ส่ง','c-sub')}${th('sc','สะสม','c-sc')}${th('att','มา','c-att')}</tr></thead><tbody>
   ${rows.map(x=>`<tr><td class="c-no">${x.n}</td><td class="c-nm"><button class="rp-name" data-a="rpdrawer" data-k="${x.n}">${fullName(x.n)}</button></td><td class="c-sub ${x.miss?'bad':''}">${x.sub}/${x.app}</td><td class="c-sc"><span class="mini"><i style="width:${x.scorePct??0}%"></i></span>${x.scorePct==null?'—':x.scorePct+'%'}</td><td class="c-att">${x.attPct}%</td></tr>`).join('')}</tbody></table></div></section>`;
}
function rpHtml(){
  const r=S.rp;if(!S.gb)initGb();
  const M=rpModel();
  if(curSub()==='print')return rpPrintHtml(M);
  const termWarn=S.scen==='empty'?`<div class="banner" role="status">${ic('alert-triangle',20)}<span class="grow">เทอมนี้ยังไม่ได้ตั้งช่วงวันที่ การนับเช็คชื่ออาจไม่ครบ — ตั้งวันเริ่ม/สิ้นสุดในหน้าตั้งค่า</span><button data-a="nav" data-k="settings">ไปตั้งค่า</button></div>`:'';
  const range=`<div class="tip rp-range">ช่วงข้อมูล 1 พ.ย. 2569 – ปัจจุบัน · งาน ${M.works.length} ชิ้น · เช็คชื่อ ${RP_DAYS} ${r.attMode==='daily'?'วัน':'คาบ'}</div>`;
  return `<div class="rp-page">${rpHead()}${rpToolbar()}${termWarn}${range}${rpCards(M)}${rpTable(M)}</div>`;
}
function rpPrintHtml(M){
  const r=S.rp,c=CL(r.cls);
  const rows=rpSorted(M.rows);
  return `<div class="rp-page">${rpHead()}
   <div class="banner" role="status">${ic('printer',20)}<span class="grow"><b>ตัวอย่างก่อนพิมพ์ (A4 แนวตั้ง)</b> · พิมพ์เฉพาะสรุป + รายบุคคล · ไม่พิมพ์ปุ่ม ตัวกรอง เมนู</span><button class="primary" data-a="toast" data-k="เปิดหน้าต่างพิมพ์ของเครื่อง (จำลอง)">${ic('printer',20)}พิมพ์</button><button class="ghost" data-a="rpback">กลับ</button></div>
   <div class="rp-paper" role="document" aria-label="หน้าพิมพ์">
    <div class="rp-ph"><b>รายงานสรุป ${c.name}</b> · ${r.subj||'ทุกวิชา'} · ภาคเรียนที่ 2/2569${r.period==='month'?' · '+GBMON[r.month]:''}<br><span class="tip">โรงเรียนสมมติวิทยา · ครูสมมติ · ข้อมูล ณ ${fmt(TODAY)} 10:32</span></div>
    <div class="rp-pstats"><span>อัตราส่งงาน <b>${M.rate==null?'—':M.rate+'%'}</b></span><span>งานค้าง <b>${M.missing} ชิ้น</b> (${M.missStu} คน)</span><span>คะแนนเฉลี่ย <b>${M.avg==null?'—':M.avg+'%'}</b></span><span>มาเรียน <b>${M.attPct==null?'—':M.attPct+'%'}</b></span></div>
    <table class="rp-pt"><thead><tr><th>งาน</th><th>เต็ม</th><th>ส่ง</th><th>%</th><th>เฉลี่ย</th></tr></thead><tbody>${M.works.map(x=>`<tr><td>${x.w.title}</td><td>${x.w.full}</td><td>${x.k.sub}/${x.k.tot}</td><td>${x.due?x.rate+'%':'เก็บอยู่'}</td><td>${x.avg==null?'—':x.avg+'%'}</td></tr>`).join('')}</tbody></table>
    <div class="rp-pbreak">— ขึ้นหน้าใหม่ —</div>
    <table class="rp-pt"><thead><tr><th>#</th><th>ชื่อ</th><th>ส่ง</th><th>ค้าง</th><th>สะสม</th><th>มา</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.n}</td><td>${fullName(x.n)}</td><td>${x.sub}/${x.app}</td><td>${x.miss||''}</td><td>${x.scorePct==null?'—':x.scorePct+'%'}</td><td>${x.attPct}%</td></tr>`).join('')}</tbody></table>
   </div></div>`;
}
function rpDrawerHtml(){
  const r=S.rp;if(r.drawer==null)return'';
  if(r.drawer==='all'){const M=rpModel();return `<div class="drawer-scrim" data-a="closeov"><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="rp-dh"><div class="drawer-head"><div><h2 class="t" id="rp-dh">ต้องติดตามทั้งหมด (${M.follow.length} คน)</h2><div class="xs">${CL(r.cls).name} · ${r.subj||'ทุกวิชา'} · เรียงตามงานค้างมากสุด</div></div><button class="icon ghost" data-a="closeov" aria-label="ปิด">${ic('x',20)}</button></div><div class="row" style="justify-content:flex-end;margin-bottom:6px"><button class="ghost" data-a="rpline" data-k="class">${ic(r.copied==='class'?'check':'copy',20)}${r.copied==='class'?'คัดลอกแล้ว':'คัดลอกไป LINE'}</button></div><div class="rp-list scroll tall">${M.follow.map(x=>`<button class="rp-frow" data-a="rpdrawer" data-k="${x.n}"><span class="no">${x.n}</span><span class="grow"><b>${fullName(x.n)}</b><small>${x.missing.slice(0,2).join(' · ')}${x.missing.length>2?' …':''}</small></span>${badge('danger',`ค้าง ${x.miss}`)}</button>`).join('')}</div></div></div>`}
  const n=r.drawer,ws=rpWorks(),x=rpStudent(r.cls,n,ws),a=x.att;
  return `<div class="drawer-scrim" data-a="closeov"><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="rp-dh"><div class="drawer-head"><div><h2 class="t" id="rp-dh">${fullName(n)}</h2><div class="xs">“${nick(n)}” · ${CL(r.cls).name} เลขที่ ${n} · รหัส 6${String(n).padStart(3,'0')}</div></div><button class="icon ghost" data-a="closeov" aria-label="ปิด">${ic('x',20)}</button></div>
   <div class="hm-chip muted" style="margin-bottom:8px">${ic('filter',16)}ขอบเขต: ${r.subj||'ทุกวิชา'} · ${r.period==='term'?'ทั้งเทอม':GBMON[r.month]} (ตามตัวกรองหน้านี้)</div>
   <div class="rp-tiles"><div><div class="l">ส่งงาน</div><div class="v">${x.sub}/${x.app}</div></div><div><div class="l">คะแนนสะสม</div><div class="v">${x.scorePct==null?'—':x.scorePct+'%'}</div></div><div><div class="l">มาเรียน</div><div class="v">${x.attPct}%</div></div></div>
   <div class="row" style="justify-content:space-between;margin-top:10px"><b>งานค้างส่ง ${x.missing.length} ชิ้น</b>${x.missing.length?`<button class="ghost" data-a="rpline" data-k="${n}">${ic(r.copied===String(n)?'check':'copy',18)}${r.copied===String(n)?'คัดลอกแล้ว':'คัดลอกไป LINE'}</button>`:''}</div>
   ${x.missing.length?x.missing.map(t=>`<div class="rp-mrow">${ic('alert-circle',16)} ${t}</div>`).join(''):`<div class="tip" style="color:var(--text-success)">ส่งงานครบ</div>`}
   <div style="margin-top:12px"><b>เช็คชื่อ${r.period==='term'?'เทอมนี้':GBMON[r.month]}</b><div class="legend2" style="margin-top:4px">${[['p','มา'],['l','สาย'],['v','ลา'],['k','ป่วย'],['a','ขาด']].map(([q,l])=>`<span><i style="background:var(--fill-${{p:'success',l:'warning',v:'accent',k:'purple',a:'danger'}[q]})"></i>${l} ${a[q]}</span>`).join('')}</div></div>
   <div style="margin-top:12px"><b>ประวัติล่าสุด</b>${(S.gb.log||[]).slice(0,3).map(y=>`<div class="gb-log"><span class="tip">${y.t}</span> ${y.x}</div>`).join('')}</div>
   <div class="row" style="justify-content:flex-end;margin-top:12px;gap:6px"><button data-a="nav" data-k="students">${ic('edit',20)}แก้ไขข้อมูล</button><button class="primary" data-a="closeov">ปิด</button></div></div></div>`;
}
function rpOverlays(){return S.rp?rpDrawerHtml():''}
function rpPjBody(k){
  const M=rpModel(),r=S.rp,c=CL(r.cls),two=M.works.length>8;
  const row=x=>`<div class="rp-pjrow"><span class="t">${x.w.title}</span><span class="pbar"><div style="width:${x.k.tot?x.k.sub*100/x.k.tot:0}%"></div></span><span class="n">ส่งแล้ว ${x.k.sub} จาก ${x.k.tot}</span></div>`;
  return `<div class="row" style="justify-content:space-between;align-items:flex-end;gap:16px"><div><div class="s2">${c.name} · ${r.subj||'ทุกวิชา'} · ${r.period==='term'?'ทั้งเทอม':GBMON[r.month]}</div><div class="stat">ค้างส่ง ${M.missing} ชิ้น</div></div><div style="text-align:right"><div class="s2">มาเรียนวันนี้</div><div class="stat">${S.at?(()=>{const m=S.at.map[r.cls]||{};return Object.values(m).filter(v=>v==='p'||v==='l').length})():0} จาก ${c.total} คน</div></div></div>
   <div class="rp-pjlist${two?' two':''}">${M.works.map(row).join('')||'<div class="empty">ไม่มีงานในช่วงนี้</div>'}</div>`;
}
function rpAct(a,k,t,e){
  if(!a.startsWith('rp'))return false;
  const r=S.rp;
  switch(a){
  case 'rpcls':r.cls=k;r.drawer=null;break;
  case 'rpsubj':r.subj=k;S.menu=null;if(!k)r.attMode='daily';break;
  case 'rpperiod':r.period=k;break;
  case 'rpmonth':r.month=k;S.menu=null;break;
  case 'rpatt':r.attMode=k;break;
  case 'rprefresh':r.busy=true;setTimeout(()=>{r.busy=false;r.stale=false;r.updated='10:4'+((S.gb?S.gb.log.length:0)%10);render()},900);break;
  case 'rpprint':S.sub.reports='print';break;
  case 'rpback':S.sub.reports='main';break;
  case 'rpexcel':toast2('ดาวน์โหลด สรุปงาน_ป.6-1_ทุกวิชา_ทั้งเทอม.xlsx แล้ว (จำลอง · 4 ชีต)');break;
  case 'rpsort':if(r.sort===k)r.dir=-r.dir;else{r.sort=k;r.dir=1}break;
  case 'rpdrawer':r.drawer=+k;S.sub.reports='main';break;
  case 'rpworksall':r.worksAll=!r.worksAll;break;
  case 'rpfollowfull':r.drawer='all';break;
  case 'rpwork':{if(S.gb){S.gb.sel=k}go('gradebook','table');break}
  case 'rpline':{r.copied=k;toast2(k==='class'?'คัดลอกรายชื่อค้างส่งทั้งห้องไป LINE แล้ว':'คัดลอกรายการค้างส่งของคนนี้แล้ว');setTimeout(()=>{r.copied='';render()},2000);break}
  default:return false;
  }
  render();return true;
}
function rpSim(k){
  const r=S.rp;
  if(k==='rp-refresh')rpAct('rprefresh');
  else if(k==='rp-sort'){r.sort='sc';r.dir=1}
  else if(k==='rp-follow'){const M=rpModel();if(M.follow.length)r.drawer=M.follow[0].n}
  else if(k==='rp-stale')r.stale=!r.stale;
}
function rpApplySub(){
  const r=S.rp,sub=curSub();r.drawer=null;S.menu=null;
  if(sub==='drawer'){const M=rpModel();r.drawer=M.follow.length?M.follow[0].n:1}
  else if(sub==='sort'){r.sort='sc';r.dir=1}
}
R3ACT.push(rpAct);

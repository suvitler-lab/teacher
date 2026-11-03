__ICONS__
const ic=(n,s=20,cls='')=>`<svg class="ti${cls?' '+cls:''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;
const $=s=>document.querySelector(s);

/* ===================== ข้อมูลสมมติ (วันนี้ = พุธ 4 พ.ย. 2569) ===================== */
const TODAY='2026-11-04';
const MON=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DOW=['อา','จ','อ','พ','พฤ','ศ','ส'];
const shift=(iso,d)=>new Date(Date.parse(iso)+d*864e5).toISOString().slice(0,10);
const fmt=iso=>{const [y,m,d]=iso.split('-').map(Number);return `${d} ${MON[m-1]} ${y+543}`};
const fmtS=iso=>{const [,m,d]=iso.split('-').map(Number);return `${d} ${MON[m-1]}`};
const dow=iso=>DOW[new Date(iso+'T00:00:00Z').getUTCDay()];
const CLASSES=[{id:'c1',name:'ป.6/1',total:44},{id:'c2',name:'ป.6/2',total:42},{id:'c3',name:'ป.6/3',total:43}];
const CL=id=>CLASSES.find(c=>c.id===id);
const NICK=['ฟ้า','ใบบัว','มินนี่','ภูผา','น้ำใส','พลอย','กานต์','ต้นไม้','เมฆา','ข้าวหอม','ปลาทอง','ดวงดาว','แจ๋ว','ไอซ์','นุ่น','บีม','เจ','ต้นกล้า','มะลิ','ธารา','มะม่วง','สายฟ้า','พิมพ์','โอ๊ต','ขนมจีน','เฟิร์น','กัปตัน','น้ำหวาน','ภีม','มาย','อุ้ม','ปั้น','ต้า','แพรว','ก้อง','ฝ้าย','นนท์','ปุยฝ้าย','ชิน','ออม','วิน','ไข่มุก','ตะวัน','เบ๊น'];
const nick=n=>NICK[(n-1)%NICK.length];
const fullName=n=>`${n%2?'ด.ช.':'ด.ญ.'} ${nick(n)} สมมติ`;
const ASGS=[
  {id:'a2',title:'การบ้าน บทที่ 3 ทศนิยม',type:'การบ้าน',tc:'orange',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-20',due:'2026-10-27',per:{c1:{s:42,x:0},c2:{s:40,x:0}}},
  {id:'a3',title:'ใบงาน 4 ร้อยละ',type:'ใบงาน',tc:'violet',subj:'คณิตศาสตร์',full:10,assigned:'2026-10-26',due:'2026-10-30',per:{c1:{s:40,x:0},c2:{s:38,x:0},c3:{s:35,x:0}}},
  {id:'a12',title:'แบบฝึกหัด 12 แรงและการเคลื่อนที่',type:'แบบฝึกหัด',tc:'aqua',subj:'วิทยาศาสตร์',full:20,assigned:'2026-10-28',due:'2026-11-02',per:{c1:{s:30,x:0}}},
  {id:'a4',title:'การบ้าน บทที่ 4 เศษส่วน',type:'การบ้าน',tc:'orange',subj:'คณิตศาสตร์',full:10,assigned:'2026-11-02',due:'2026-11-04',per:{c1:{s:30,x:0},c2:{s:35,x:0}}},
  {id:'a6',title:'ใบงาน 6 สมการ',type:'ใบงาน',tc:'violet',subj:'คณิตศาสตร์',full:10,assigned:'2026-11-02',due:'2026-11-05',per:{c1:{s:37,x:1},c2:{s:12,x:0},c3:{s:0,x:0}}},
  {id:'a7',title:'ชิ้นงาน โมเดลระบบสุริยะ',type:'ชิ้นงาน',tc:'green',subj:'วิทยาศาสตร์',full:30,assigned:'2026-10-29',due:'2026-11-12',per:{c1:{s:8,x:0},c3:{s:3,x:0}}},
  {id:'a8',title:'ใบงาน 7 อัตราส่วน',type:'ใบงาน',tc:'violet',subj:'คณิตศาสตร์',full:10,assigned:'2026-11-03',due:'2026-11-14',per:{c1:{s:0,x:0}}},
  {id:'a9',title:'กิจกรรม สำรวจพืชในโรงเรียน',type:'กิจกรรม',tc:'blue',subj:'วิทยาศาสตร์',full:10,assigned:'2026-10-10',due:null,per:{c2:{s:20,x:0}}},
];
const AS=id=>ASGS.find(a=>a.id===id);
const EXC=[7,30];
const ord=total=>Array.from({length:total},(_,k)=>((k*17)%total)+1);
function seatsInit(aid,cid){
  const a=AS(aid),per=a.per[cid]||{s:0,x:0},total=CL(cid).total,seats={};
  for(let n=1;n<=total;n++)seats[n]='miss';
  EXC.slice(0,per.x).forEach(n=>seats[n]='exc');
  ord(total).filter(n=>seats[n]!=='exc').slice(0,per.s).forEach((n,i)=>{seats[n]=(a.due&&a.due<TODAY&&i%9===4)?'late':(i===7||i===19)&&per.s>10?'await':'scored'});
  return seats;
}
const counts=seats=>{const c={scored:0,late:0,await:0,miss:0,exc:0};Object.values(seats).forEach(v=>c[v]++);c.sub=c.scored+c.late+c.await;c.counted=c.sub+c.miss;return c};
const nextMiss=seats=>ord(Object.keys(seats).length).find(n=>seats[n]==='miss');
const isLate=(recv,due)=>!!due&&recv>due;

/* ===================== การ์ดต่อหน้า (ปรับการ์ด) ===================== */
const CARDS={
 scan:{title:'หน้าสแกน',keys:[
  {key:'recent',title:'สแกนล่าสุด',icon:'clock',ds:'รายการที่สแกนในรอบนี้ · ยกเลิกผ่านเมนู',on:true},
  {key:'hid',title:'ป้ายเครื่องยิง + ทดสอบ',icon:'barcode',ds:'บอกว่าเครื่องยิงพร้อมไหม และปุ่มทดสอบ',on:true},
  {key:'hint',title:'คำแนะนำโหมด',icon:'info-circle',ds:'บรรทัดช่วยใต้ผลสแกน (เหมาะกับครูที่เพิ่งเริ่มใช้)',on:false},
 ]},
 att:{title:'หน้าเช็คชื่อ',keys:[
  {key:'sum',title:'สรุปวันนี้',icon:'chart-bar',ds:'มา x จาก y คน แถบสี และตัวเลขแต่ละสถานะ',on:true,zone:'top'},
  {key:'week',title:'แถบสัปดาห์',icon:'calendar',ds:'จันทร์–ศุกร์ ห้องนี้เช็คแล้วหรือยัง',on:true,zone:'top'},
  {key:'scans',title:'สแกนล่าสุด',icon:'qrcode',ds:'แสดงเฉพาะตอนใช้โหมดสแกน QR',on:true,zone:'side'},
  {key:'todo',title:'ใครยังไม่เช็ค',icon:'user-off',ds:'รายเลขที่ แตะแล้วเลื่อนไปช่องนั้น',on:false,zone:'side',sa:true},
  {key:'away',title:'ขาดวันนี้',icon:'user-x',ds:'ขาด ลา ป่วย รายชื่อ (ใช้ตอนยืนหน้าห้อง)',on:false,zone:'side',sa:true},
 ]},
 gradebook:{title:'หน้าสมุดคะแนน',keys:[
  {key:'sum',title:'สรุปห้อง',icon:'chart-bar',ds:'งาน · อัตราส่ง · รอตรวจ · ค้างส่ง (ตัวเลขกดกรองแถวได้)',on:true,zone:'top'},
  {key:'await',title:'รอตรวจ',icon:'hourglass-empty',ds:'งานไหนรับไว้แล้วยังไม่ให้คะแนน',on:true,zone:'top'},
  {key:'closing',title:'ควรปิดรับ',icon:'lock',ds:'งานที่เปิดค้างนานจนตัวเลขค้างไม่จริง (D31) · ปิดรับได้ทันที',on:true,zone:'top'},
  {key:'follow',title:'ต้องติดตาม',icon:'flag',ds:'ใครค้างมากสุดในวิชานี้ (มีในหน้าหลัก/รายงานแล้ว)',on:false,zone:'top'},
  {key:'dist',title:'การกระจายคะแนน',icon:'chart-histogram',ds:'งานที่เลือกยากไป/ง่ายไปไหม',on:false,zone:'bottom'},
  {key:'recent',title:'แก้ไขล่าสุด',icon:'clock',ds:'เมื่อกี้แก้อะไรไป / อีกเครื่องแก้อะไร',on:false,zone:'bottom',sa:true},
  {key:'legend',title:'คำอธิบายสัญลักษณ์',icon:'info-circle',ds:'สัญลักษณ์ในช่องคะแนนแปลว่าอะไร (ปิดได้เมื่อจำได้แล้ว)',on:true,zone:'bottom'},
  {key:'help',title:'ปุ่มลัดคีย์บอร์ด',icon:'keyboard',ds:'แสดงเฉพาะบนคอม',on:true,zone:'bottom'},
 ]},
 random:{title:'หน้าสุ่มชื่อ',keys:[
  {key:'hist',title:'เรียกแล้ว',icon:'users',ds:'ชิปคนที่ถูกเรียก เหลือกี่คนในรอบนี้ เริ่มรอบใหม่',on:true},
  {key:'opts',title:'ตัวเลือก',icon:'list-numbers',ds:'ไม่ซ้ำจนครบ · จำนวนคน/กลุ่มละ',on:true},
  {key:'timer',title:'จับเวลาตอบ',icon:'stopwatch',ds:'นับถอยหลัง 10/30/60 วินาทีหลังสุ่ม',on:false,sa:true},
  {key:'pass',title:'ข้าม / เลิกทำ',icon:'arrow-back-up',ds:'ข้ามคนนี้ (ไม่นับว่าเรียกแล้ว) หรือเลิกทำครั้งล่าสุด',on:false,sa:true},
  {key:'range',title:'ช่วงเลขที่',icon:'selector',ds:'สุ่มเฉพาะเลขที่ x ถึง y',on:false,sa:true},
  {key:'pair',title:'จับคู่',icon:'users-group',ds:'สุ่ม 2 คน แสดงเป็นคู่ "A คู่กับ B"',on:false,sa:true},
  {key:'gopts',title:'ตัวเลือกกลุ่ม',icon:'crown',ds:'เลือกจำนวนกลุ่ม · หัวหน้ากลุ่ม · คัดลอก',on:false,sa:true},
 ]},
};
const defPrefs=p=>({order:CARDS[p].keys.map(k=>k.key),hidden:CARDS[p].keys.filter(k=>!k.on).map(k=>k.key)});
const cardOn=(p,k)=>!S.prefs[p].hidden.includes(k);
const cardOrder=(p,zone)=>S.prefs[p].order.filter(k=>cardOn(p,k)&&(!zone||(CARDS[p].keys.find(x=>x.key===k).zone===zone)));

/* ===================== สถานะ ===================== */
const DEV={
  ipadP:{w:820,h:1180,label:'iPad ตั้ง 820×1180',u:18,touch:true,shell:'rail'},
  ipadL:{w:1180,h:820,label:'iPad นอน 1180×820',u:18,touch:true,shell:'rail'},
  desk:{w:1536,h:729,label:'คอม 1536×729',u:16,touch:false,shell:'rail'},
  phone:{w:390,h:844,label:'มือถือ 390×844',u:18,touch:true,shell:'tabs'},
};
const PAGES={scan:'สแกน',attendance:'เช็คชื่อ',random:'สุ่มชื่อ',gradebook:'คะแนน'};
const SUBS={
  scan:{setup:'ตั้งค่ารอบ',type:'ระหว่างรอบ: กรอกทีละคน',full:'ระหว่างรอบ: ให้เต็ม',summary:'สรุปรอบ',pj:'ฉายจอ'},
  attendance:{tap:'แตะเลือก',scan:'สแกน QR',period:'รายคาบ',pj:'ฉายจอ'},
  random:{pick:'สุ่มคน',group:'จับกลุ่ม',pj:'ฉายจอ'},
  gradebook:{table:'ตาราง',cell:'ช่องคะแนน',work:'งานที่เลือก',bulk:'ทั้งห้องส่งแล้ว',close:'ปิดรับงาน',filter:'ตัวกรอง/คอลัมน์',create:'สร้างงาน',edit:'แก้ไขงาน'},
};
const SCEN={normal:'วันปกติ (10:40)',offline:'ออฟไลน์ + ค้างส่ง',closed:'งานปิดรับจากอีกเครื่อง',unchecked:'ยังไม่เช็คชื่อ',backdated:'รับงานย้อนหลัง (C-03)',empty:'ไม่มีงาน (ห้องใหม่)'};
const S={page:'scan',sub:{scan:'type',attendance:'tap',random:'pick',gradebook:'table'},dev:'ipadP',theme:'light',font:0,scen:'normal',
  prefs:{scan:defPrefs('scan'),att:defPrefs('att'),random:defPrefs('random'),gradebook:defPrefs('gradebook')},prefsOpen:false,
  pj:null,pjPre:false,pjOther:false,pjHint:false,toast:null,menu:null,sheetMenu:false,dlg:null,
  sc:null,at:null,rd:null,gb:null};
const F=()=>({...DEV[S.dev],u:S.font||DEV[S.dev].u});
const isWide=()=>S.dev==='ipadL'||S.dev==='desk';
const isNarrow=()=>S.dev==='phone';
const offline=()=>S.scen==='offline';

function initSc(){
  S.sc={asg:'a12',cls:'c1',mode:'type',recv:S.scen==='backdated'?'pick':'today',recvDate:S.scen==='backdated'?'2026-11-02':TODAY,showAll:false,started:true,ended:false,
    seats:null,recent:[],fb:null,pend:null,entry:'',err:'',lastScore:7.5,sheet:null,undo:null,excAsk:null,closed:S.scen==='closed',failed:[],cur:null,confirmDrop:null,time:'10:42'};
  S.sc.seats=seatsInit('a12','c1');
  S.sc.failed=offline()?[
    {id:1,n:14,asg:'แบบฝึกหัด 12',t:'10:12',reason:'งานปิดรับแล้ว — เปิดรับงานอีกครั้งในสมุดคะแนน แล้วกด "ลองใหม่"'},
    {id:2,n:33,asg:'แบบฝึกหัด 12',t:'10:18',reason:'วันที่รับงานเป็นวันในอนาคต — แก้วันที่แล้วสแกนใหม่'},
    {id:3,n:9,asg:'แบบฝึกหัด 12',t:'10:21',reason:'วันที่รับงานอยู่ก่อนวันมอบหมายงาน (28 ต.ค.)'},
  ]:[];
  if(offline()){[3,18,25,36].forEach(n=>{if(S.sc.seats[n]==='scored')S.sc.seats[n]='scored'});S.sc.dots={pend:[18,25,36,40,41,42,43],fail:[14,33,9]}}else S.sc.dots={pend:[],fail:[]};
}
function initAt(){
  const mk=(cid,p,l,v,k,a)=>{const m={};let i=0;const o=ord(CL(cid).total);[[p,'p'],[l,'l'],[v,'v'],[k,'k'],[a,'a']].forEach(([n,s])=>{for(let j=0;j<n;j++)m[o[i++]]=s});return m};
  S.at={cls:'c2',date:TODAY,mode:'tap',brush:'p',cycle:false,period:3,subj:'วิทยาศาสตร์',flash:null,scans:[],scanMsg:'',saving:false,pendN:0,
    map:S.scen==='unchecked'?{c1:{},c2:{},c3:{}}:{c1:mk('c1',40,2,1,0,1),c2:mk('c2',30,1,0,1,0),c3:{}},per:{}};
  S.at.map.c2=S.scen==='unchecked'?{}:S.at.map.c2;
  if(S.sub.attendance==='period'){S.at.mode='period'}
}
function initRd(){
  S.rd={cls:'c1',mode:'pick',count:1,norepeat:true,presentOnly:true,called:[11,3,28],cur:null,groups:null,timerSec:30,left:30,run:false,range:[1,44],useRange:false,byGroups:false,gsize:4,ngroups:5,leaders:true,pair:false,rolling:false,msg:''};
  S.rd.cur=[28];
}
const absentSet=cid=>{const m=S.at.map[cid]||{};return Object.keys(m).filter(n=>m[n]==='a'||m[n]==='v'||m[n]==='k').map(Number)};

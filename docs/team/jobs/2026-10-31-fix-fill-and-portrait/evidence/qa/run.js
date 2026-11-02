(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const q=s=>document.querySelector(s);const qa=s=>[...document.querySelectorAll(s)];const o={};
const sc=q('.gb-scroll');const tb=sc.querySelector('table');
const btn=(re,sel='button')=>qa(sel).find(b=>re.test((b.getAttribute('aria-label')||'')+' '+b.textContent)&&b.offsetWidth);
// 1 sticky
sc.scrollLeft=600;await w(300);const sr=sc.getBoundingClientRect();const nc=tb.querySelector('tbody .name-col').getBoundingClientRect();const tc=tb.querySelector('tbody .tot-col').getBoundingClientRect();const th=tb.querySelector('thead th.col-w').getBoundingClientRect();
o.sticky={sl:Math.round(sc.scrollLeft),nameLeftOffset:Math.round(nc.left-sr.left),totRightOffset:Math.round(sr.right-tc.right),theadTop:Math.round(th.top-sr.top),docX:document.documentElement.scrollWidth-innerWidth};
const y0=scrollY;window.scrollBy(0,250);await w(300);const th2=tb.querySelector('thead th.col-w').getBoundingClientRect();o.sticky.theadAfterPageScroll=Math.round(th2.top);o.sticky.pageScrolled=Math.round(scrollY-y0);window.scrollTo(0,0);
// 2 jump
sc.scrollLeft=0;await w(200);const jb=btn(/ไปที่สอบย่อย/);const before=sc.scrollLeft;jb&&jb.click();await w(900);o.jump={found:!!jb,before,after:Math.round(sc.scrollLeft),w:jb&&Math.round(jb.getBoundingClientRect().width),h:jb&&Math.round(jb.getBoundingClientRect().height)};
// 3 mini strip
const mn=q('.gb-mini');o.mini=mn?{w:Math.round(mn.getBoundingClientRect().width),win:!!q('.gb-mini-win'),segs:mn.children.length}:null;
if(mn){sc.scrollLeft=0;await w(300);const win0=q('.gb-mini-win')?.style.cssText;const r=mn.getBoundingClientRect();const x=r.left+r.width*0.8,y=r.top+r.height/2;for(const type of ['mousePressed']){}
 mn.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,bubbles:true,pointerId:1,isPrimary:true}));mn.dispatchEvent(new PointerEvent('pointerup',{clientX:x,clientY:y,bubbles:true,pointerId:1,isPrimary:true}));mn.click();await w(600);o.mini.scrollAfterTap=Math.round(sc.scrollLeft);}
// 4 columns menu
const cb=q('.gb-cols-btn');cb.click();await w(400);const menu=q('.gb-cols-wrap [role=menu],.gb-cols-wrap .gb-menu,.gb-cols-wrap [role=dialog]');o.cols={menu:!!menu,items:menu?menu.querySelectorAll('input,button,label').length:0,txt:menu?menu.innerText.slice(0,120):''};
const chk=menu&&menu.querySelector('input[type=checkbox]');if(chk){chk.click();await w(500);o.cols.afterToggle=q('.gb-cols-btn').innerText;chk.click();await w(500);o.cols.afterRestore=q('.gb-cols-btn').innerText;}
document.body.click();await w(200);
// 5 group by type, collapse, tap รวม
const g=btn(/^\s*ตามประเภท\s*$/);g.click();await w(700);o.grp={headers:qa('thead th.gh-cell').map(x=>x.innerText.trim().slice(0,20)),n:qa('thead th.col-w').length};
const gh=qa('thead th.gh-cell')[0];const ghb=gh.querySelector('button')||gh;ghb.click();await w(600);o.grp.afterCollapse={n:qa('thead th.col-w').length,sumc:qa('td.sumc').length,hs:sc.scrollWidth>sc.clientWidth+1};
const s=q('td.sumc');if(s){const before=qa('thead th.col-w').length;s.click();await w(700);o.grp.afterTapSum={n:qa('thead th.col-w').length,expanded:qa('thead th.col-w').length>before,editing:!!q('.cell-input')};
 const inp=q('.cell-input');if(inp){const old=inp.value;o.grp.inputVal=old;inp.blur();await w(300);} }
// 6 default restore: ไม่จัดกลุ่ม
const g2=btn(/^\s*ไม่จัดกลุ่ม\s*$/);g2.click();await w(600);o.back={n:qa('thead th.col-w').length,hs:sc.scrollWidth>sc.clientWidth+1};
return o})()

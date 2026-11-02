(async()=>{
const page=__PAGE__;const r={page,vw:innerWidth,vh:innerHeight,fs:parseFloat(getComputedStyle(document.documentElement).fontSize),coarse:matchMedia('(pointer: coarse)').matches,docX:document.documentElement.scrollWidth-innerWidth};
const vis=e=>{const b=e.getBoundingClientRect();if(b.width<=0||b.height<=0)return null;const cs=getComputedStyle(e);if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)return null;return b};
const small=[];for(const e of document.querySelectorAll('body *')){if(!vis(e))continue;let own='';for(const n of e.childNodes)if(n.nodeType===3)own+=n.textContent;own=own.trim();if(!own)continue;const f=parseFloat(getComputedStyle(e).fontSize);if(f<13)small.push({t:e.tagName+'.'+String(e.className).slice(0,30),fs:f,x:own.slice(0,20)})}
r.smallN=small.length;r.small=small.slice(0,6);
const tg=[];for(const e of document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],summary')){const b=vis(e);if(!b)continue;if(e.closest('.sc-grid'))continue;if(Math.min(b.width,b.height)<43.5)tg.push({t:e.tagName+'.'+String(e.className).slice(0,24),w:Math.round(b.width),h:Math.round(b.height),x:(e.innerText||e.getAttribute('aria-label')||'').slice(0,14)})}
r.tgN=tg.length;r.tg=tg.slice(0,8);
if(!/mid/.test(page)){let bad=[];const leaves=[...document.querySelectorAll('body *')].filter(e=>e.children.length===0&&(e.innerText||'').trim()&&vis(e));let chk=0;for(const e of leaves){const b=e.getBoundingClientRect();const cx=b.left+b.width/2,cy=b.top+b.height/2;if(cx<0||cy<0||cx>innerWidth||cy>innerHeight)continue;chk++;const top=document.elementFromPoint(cx,cy);if(top&&top!==e&&!e.contains(top)&&!top.contains(e)){bad.push((e.tagName+'.'+String(e.className).slice(0,20)+':'+e.innerText.trim().slice(0,12)+' <- '+top.tagName+'.'+String(top.className).slice(0,20)))}}r.ovN=bad.length;r.ov=bad.slice(0,6);r.ovChecked=chk}
const sc=document.querySelector('.gb-scroll'),tb=sc&&sc.querySelector('table');
if(tb){const sr=sc.getBoundingClientRect();const te=tb.querySelector('thead th.tot-col:not(.gh-tot)');const cr=sr.left+sc.clientLeft+sc.clientWidth;const edge=te?te.getBoundingClientRect().right:tb.getBoundingClientRect().right;const work=[...tb.querySelectorAll('thead th.col-w')].map(x=>Math.round(x.getBoundingClientRect().width*10)/10);const nm=tb.querySelector('thead th.name-col:not(.gh-corner)').getBoundingClientRect().width;const rh=[...tb.querySelectorAll('tbody tr')].map(x=>Math.round(x.getBoundingClientRect().height*10)/10);
 r.gb={hs:sc.scrollWidth>sc.clientWidth+1,gap:Math.round((cr-edge)*10)/10,n:work.length,work:[...new Set(work)],nameRem:Math.round(nm/r.fs*10)/10,rowH:[...new Set(rh)],sl:Math.round(sc.scrollLeft),sw:sc.scrollWidth,cw:sc.clientWidth,rows:rh.length};
 r.dump=[...tb.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>c.innerText.replace(/\s+/g,' ').trim()).join('|'));
 const nc=tb.querySelector('tbody .name-col');const tc=tb.querySelector('tbody .tot-col');r.sticky={name:nc?getComputedStyle(nc).position:null,tot:tc?getComputedStyle(tc).position:null,thead:getComputedStyle(tb.querySelector('thead th')).position};
}else if(page.startsWith('gradebook')){r.dump=[(document.querySelector('main')||document.body).innerText.replace(/\s+/g,' ')]}
const cells=[...document.querySelectorAll('.sc-cell')];
if(cells.length){const g=document.querySelector('.sc-grid');const gb=g.getBoundingClientRect();const cols=getComputedStyle(g).gridTemplateColumns.split(' ').length;const card=document.querySelector('.sc-gridcard').getBoundingClientRect();
 const main=document.querySelector('.sc-page')||document.querySelector('main');const mb=main.getBoundingClientRect();
 const vc=(el,txt)=>{const nb=el.getBoundingClientRect();const tn=[...el.childNodes].find(n=>n.nodeType===3);if(!tn)return [...txt].length;if(!(el.scrollWidth>el.clientWidth+1))return [...txt].length;const rg=document.createRange();let n=0;const chars=[...txt];let off=0;for(let i=1;i<=chars.length;i++){const end=chars.slice(0,i).join('').length;rg.setStart(tn,off);rg.setEnd(tn,end);const rr=rg.getBoundingClientRect();if(rr.right<=nb.right+0.5)n=i;else break}return n};
 const nms=cells.map(c=>{const e=c.querySelector('.nm');if(!e)return null;const t=e.textContent.trim();return{len:[...t].length,vis:vc(e,t),cut:e.scrollWidth>e.clientWidth+1}}).filter(Boolean);
 const byLen={};for(const n of nms){(byLen[n.len]??=[]).push(n.vis)}
 const cw=cells[0].getBoundingClientRect().width;
 let ov=0;const rs=cells.map(c=>c.getBoundingClientRect());for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i],b=rs[j];if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)ov++}
 const q=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return[Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]};
 r.scan={cols,cells:cells.length,gridW:Math.round(gb.width),cardW:Math.round(card.width),contentW:Math.round(mb.width),cellW:Math.round(cw*10)/10,cellH:Math.round(rs[0].height),minNmFs:Math.min(...[...document.querySelectorAll('.sc-cell .nm')].map(e=>parseFloat(getComputedStyle(e).fontSize))),cellOv:ov,
  vis:Object.fromEntries(Object.entries(byLen).map(([k,v])=>[k,{n:v.length,min:Math.min(...v),max:Math.max(...v)}])),
  gridcard:q('.sc-gridcard'),scanbox:q('input[aria-label="รหัสนักเรียน"]'),pad:q('.sc-pad'),colorStates:[...new Set(cells.map(c=>c.className.replace(/sc-cell| hit/g,'').trim()))],
  queue:/รอคะแนน \(\d+\)/.test(document.body.innerText),cameraBtn:[...document.querySelectorAll('button')].some(b=>/กล้อง/.test(b.textContent+(b.getAttribute('aria-label')||''))),
  kids:[...(document.querySelector('.sc-page')?.children||[])].map(c=>String(c.className).slice(0,24)+'@'+Math.round(c.getBoundingClientRect().left)+','+Math.round(c.getBoundingClientRect().top)+','+Math.round(c.getBoundingClientRect().width)+'x'+Math.round(c.getBoundingClientRect().height))};
}
return r})()

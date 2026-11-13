const path=require("path");const {execSync}=require("child_process");
const {startFixtureServer}=require("C:/Users/User/Desktop/teacher/scripts/fixture-server.cjs");
const pw=require(path.join(execSync("npm root -g").toString().trim(),"playwright"));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const server=await startFixtureServer({port:4246,assetsDir:process.env.QA_ASSETS,dataset:"home",lateAfter:"00:00",settings:{accent:JSON.stringify({v:1,skin:"warm",layout:"c"})}});
 const browser=await pw.chromium.launch();
 for (const [w,h,label] of [[1180,820,"desk"],[820,1180,"ipadP"],[375,812,"phone"]]) {
  const ctx=await browser.newContext({viewport:{width:w,height:h},locale:"th-TH",hasTouch:w<900});const p=await ctx.newPage();
  await p.goto(server.url);await p.fill("input[type=email]",server.email);await p.fill("input[type=password]",server.password);await p.getByRole("button",{name:"เข้าสู่ระบบ"}).click();
  await p.waitForFunction(()=>/หน้าหลัก/.test(document.body.innerText));await sleep(1500);
  console.log(label,"data-layout=",await p.evaluate(()=>document.documentElement.getAttribute("data-layout")));
  let found=null;
  for(let i=0;i<12;i++){
    const btn=p.locator('button[aria-label^="ปิดรับงานนี้"]');
    if(await btn.count()){found=btn.first();break;}
    const skip=p.locator("button.skip");if(!(await skip.count()))break;await skip.first().click();await sleep(300);
  }
  if(!found){console.log(label,"NO lock button; headings:",(await p.locator(".hmc-f-t").allInnerTexts()).join("|"));await ctx.close();continue;}
  const info=await found.evaluate((el)=>{const r=el.getBoundingClientRect();const cs=getComputedStyle(el);const svg=el.querySelector("svg");
   const lum=(c)=>{const m=c.match(/[\d.]+/g).map(Number);const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2])};
   let bg=cs.backgroundColor,n=el;while(/rgba\(.*, 0\)|transparent/.test(bg)&&n.parentElement){n=n.parentElement;bg=getComputedStyle(n).backgroundColor}
   const L1=lum(cs.color),L2=lum(bg);return{w:Math.round(r.width),h:Math.round(r.height),name:el.getAttribute("aria-label"),text:el.innerText.trim(),tag:el.tagName,type:el.type,svgHidden:svg?.getAttribute("aria-hidden"),color:cs.color,bg,contrast:+((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2),fs:cs.fontSize}});
  console.log(label,JSON.stringify(info));
  // keyboard: focus ring + Enter activates
  await found.focus();await p.keyboard.press("Tab");await p.keyboard.press("Shift+Tab");
  const foc=await found.evaluate((el)=>{const cs=getComputedStyle(el);return{focused:document.activeElement===el,outline:cs.outlineStyle+" "+cs.outlineWidth+" "+cs.outlineColor,shadow:cs.boxShadow.slice(0,60)}});
  console.log(label,"focus",JSON.stringify(foc));
  await found.screenshot({path:process.env.OUT+`/lock-c-${label}.png`});
  await p.screenshot({path:process.env.OUT+`/lock-c-page-${label}.png`});
  if(label==="desk"){await p.keyboard.press("Enter");await sleep(1200);console.log("after Enter url:",await p.evaluate(()=>location.hash));}
  await ctx.close();
 }
 await browser.close();process.exit(0);
})();

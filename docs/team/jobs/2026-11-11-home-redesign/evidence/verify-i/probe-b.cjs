const L=require("./lib.cjs");
(async()=>{const server=await L.startFixtureServer({port:4246,assetsDir:process.env.QA_ASSETS,dataset:"home",lateAfter:"00:00",settings:{accent:JSON.stringify({v:1,skin:"pro",layout:"b"})}});
const browser=await L.pw.chromium.launch();const {page}=await L.newPage(browser,server,"desk");
await L.go(page,"#/",null);await L.sleep(1500);
const r=await page.evaluate(()=>{const e=document.querySelector("span.nm");const out=[];let n=e;while(n){const s=getComputedStyle(n);out.push({t:n.tagName+"."+n.className,color:s.color,bg:s.backgroundColor,bgi:s.backgroundImage.slice(0,60),op:s.opacity,tf:s.webkitTextFillColor});n=n.parentElement;if(out.length>8)break}return {theme:document.documentElement.dataset.theme||document.documentElement.className,out}});
console.log(JSON.stringify(r,null,0));await page.screenshot({path:__dirname+"/probe-b.png",clip:{x:0,y:0,width:1536,height:729}});await browser.close();await server.close();process.exit(0)})();

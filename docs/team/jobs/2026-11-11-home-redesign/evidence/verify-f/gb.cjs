const path = require("node:path"); const { execSync } = require("node:child_process");
const { startFixtureServer } = require("C:/Users/User/Desktop/teacher/scripts/fixture-server.cjs");
const pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const res=[];const check=(n,ok,d="")=>{res.push(ok);console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  — "+d:""}`)};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,t=30000)=>{const e=Date.now()+t;for(;;){const v=await fn();if(v)return v;if(Date.now()>e)return false;await sleep(250)}};
(async()=>{
 const server=await startFixtureServer({port:4202,assetsDir:process.env.QA_ASSETS});
 const sql=async(q,...b)=>(await server.DB.prepare(q).bind(...b).all()).results;
 const browser=await pw.chromium.launch();
 const mk=async()=>{const ctx=await browser.newContext({viewport:{width:1180,height:820},locale:"th-TH"});const page=await ctx.newPage();
  await page.goto(server.url);await page.fill("input[type=email]",server.email);await page.fill("input[type=password]",server.password);await page.getByRole("button",{name:"เข้าสู่ระบบ"}).click();
  await page.waitForFunction(()=>/หน้าหลัก/.test(document.body.innerText));return{ctx,page}};
 const A=await mk(),B=await mk();
 const asg=(await server.DB.prepare("SELECT id FROM assignments WHERE instr(title, ?)").bind("โมเดลระบบย่อยอาหาร").first()).id;
 const kid=(await sql("SELECT id, first_name FROM students WHERE class_id='cls_61' AND number=20"))[0];
 const sc=()=>sql("SELECT score,status FROM submissions WHERE assignment_id=? AND student_id=?",asg,kid.id);
 const open=async(d)=>{await d.page.evaluate(()=>{location.hash="#/gradebook"});await d.page.waitForSelector("table.gb tbody tr");await sleep(500)};
 const setScore=async(d,v)=>{
   const idx=await d.page.locator("table.gb thead th").evaluateAll((ths)=>ths.findIndex(t=>/โมเดลระบบย่อยอาหาร/.test(t.innerText)));
   await d.page.locator("table.gb thead th",{hasText:"โมเดลระบบย่อยอาหาร"}).first().click().catch(()=>{});
   const row=d.page.locator("table.gb tbody tr",{hasText:kid.first_name}).first();
   const cell=row.locator("td").nth(idx);
   await cell.click(); await d.page.locator("input.cell-input").fill(String(v)); await d.page.keyboard.press("Enter"); await sleep(500);
   return idx;
 };
 try{
  await open(A);await open(B);
  await A.ctx.setOffline(true);await sleep(500);
  const idx=await setScore(A,"7");
  console.log("col idx",idx);
  await sleep(2000);
  check("grade offline: not on server yet",(await sc()).length===0,JSON.stringify(await sc()));
  const badge=async(d)=>(await d.page.locator(".rail-sync .sync").first().innerText().catch(()=>"")).replace(/\s+/g," ");
  console.log("A badge offline:",await badge(A));
  await A.ctx.setOffline(false);
  check("grade lands once after reconnect (score 7)",await until(async()=>{const r=await sc();return r.length===1&&r[0].score===7}),JSON.stringify(await sc()));
  check("queue empties",await until(async()=>!/รอส่ง/.test(await badge(A))),await badge(A));
  await B.page.reload();await B.page.waitForSelector("table.gb tbody tr");await sleep(600);
  const bt=await B.page.locator("table.gb tbody tr",{hasText:kid.first_name}).first().innerText();
  check("B sees 7 after refresh",/\b7\b/.test(bt),bt.replace(/\s+/g," ").slice(0,100));
  // concurrent same cell: B stale (sees 7), A sets 8, B sets 9
  await open(A);await open(B);
  await setScore(A,"8");await sleep(2500);
  await setScore(B,"9");await sleep(4000);
  const r=await sc();
  console.log("INFO same-cell final server:",JSON.stringify(r),"| B badge:",await badge(B),"| B text:",(await B.page.locator("body").innerText()).replace(/\s+/g," ").match(/.{0,40}(ชน|อีกเครื่อง|ขัดแย้ง).{0,80}/)?.[0]);
  check("same cell: exactly one row",r.length===1);
  await B.page.screenshot({path:process.env.OUT+"/gb-B.png"});
 }catch(e){check("script error",false,String(e.stack||e).slice(0,400))}
 await browser.close();console.log(`${res.filter(Boolean).length}/${res.length}`);process.exit(0);
})();

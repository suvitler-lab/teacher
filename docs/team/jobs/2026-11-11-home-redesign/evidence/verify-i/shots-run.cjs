const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const R="C:/Users/User/Desktop/teacher",J=R+"/docs/team/jobs/2026-11-11-home-redesign",I=J+"/evidence/verify-i";
const {startFixtureServer}=require(R+"/scripts/fixture-server.cjs");
const base=JSON.parse(fs.readFileSync(J+"/pages.json","utf8"));
const pick=(names,rename)=>({...base,pages:base.pages.filter(p=>names.includes(p.name)).map(p=>rename?{...p,name:rename,path:p.path.replace("pg="+p.name,"pg="+rename)}:p)});
const run=(url,pg,out)=>new Promise(res=>{fs.writeFileSync(I+"/shots/pg-"+out+".json",JSON.stringify({...pg,base:url}));
 spawn(process.execPath,["C:/Users/User/.claude/skills/dev-team/scripts/shots.mjs","--job",J,"--pages",I+"/shots/pg-"+out+".json","--label","after","--url",url,"--project",R,"--out",I+"/shots/"+out],{stdio:"inherit"}).on("exit",c=>res(c));});
const skin=l=>({accent:JSON.stringify({v:1,skin:"warm",layout:l})});
(async()=>{
 const A=process.env.QA_ASSETS;
 const jobs=[
  ["A",{port:4243,dataset:"home",lateAfter:"00:00"},pick(["home","attendance","random","reports","students","settings","settings-appearance","settings-catalog"])],
  ["S",{port:4243,dataset:"scan"},pick(["scan"])],
  ["G",{port:4243,gradebook14:true},pick(["gradebook"])],
  ["B",{port:4243,dataset:"home",lateAfter:"00:00",settings:skin("b")},pick(["home"],"home-b")],
  ["C",{port:4243,dataset:"home",lateAfter:"00:00",settings:skin("c")},pick(["home"],"home-c")],
 ];
 for(const [n,opt,pg] of jobs){const s=await startFixtureServer({assetsDir:A,...opt});console.log("RUN",n,s.url);const c=await run(s.url,pg,n);console.log("EXIT",n,c);await s.close();}
})().catch(e=>{console.error(e);process.exit(1)});

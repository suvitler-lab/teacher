// usage: node rec.cjs <id> <status> <command> <artifact> [--keep ac/kind from existing record]
const fs=require("fs"),cp=require("child_process");
const J="C:/Users/User/Desktop/teacher/docs/team/jobs/2026-11-11-home-redesign";
const [id,status,command,artifact,reason]=process.argv.slice(2);
const e=JSON.parse(fs.readFileSync(J+"/evidence/evidence.json","utf8"));const arr=Array.isArray(e)?e:(e.items||e.evidence);
const x=arr.find(i=>i.check===id);if(!x){console.error("no",id);process.exit(1)}
const a=["C:/Users/User/.claude/skills/dev-team/scripts/evidence.mjs","add",J,"--check",id,"--kind",x.kind,"--status",status,"--by","team-qa-tester","--command","[T-85 tree:2df7c74d2598] "+command];
if(x.ac.length)a.push("--ac",x.ac.join(","));if(artifact)a.push("--artifact",artifact);if(x.mandatory)a.push("--mandatory");if(reason)a.push("--reason",reason);
const r=cp.spawnSync("node",a,{encoding:"utf8"});console.log(id,status,(r.stdout+r.stderr).trim().split("\n").pop());

// Tiny CLI for c01-control.cjs (QA, fictional fixture only).
//   node qa.cjs cell <no> [asg]            stored cell + audit of child no. N (ป.6/1)
//   node qa.cjs void <no> [asg]            "the other computer" cancels the hand-in (grid void)
//   node qa.cjs grid <no> <score> [asg]    "the other computer" types a score in the gradebook (method grid)
//   node qa.cjs bulk <action> [asg]        "the other computer" presses a whole-class button (all-submitted / full-score / clear)
//   node qa.cjs down 1|0                   cut / restore the app's network
//   node qa.cjs log                        API calls the browser made
const C = process.env.QA_CTL || "http://127.0.0.1:4121";
const [cmd, a1, a2, a3] = process.argv.slice(2);
const j = (p, body) => fetch(C + p, body ? { method: "POST", body: JSON.stringify(body) } : {}).then((r) => r.json());
const sid = async (no, asg) => (await j(`/cell?asg=${asg}&no=${no}`)).studentId;
const op = (studentId, asg, o) => ({ opId: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, scanSessionId: "gb-qa-other", assignmentId: asg,
  studentId, fullScoreAtScan: 10, clientTs: Date.now(), ...o });
(async () => {
  let out;
  if (cmd === "cell") out = await j(`/cell?asg=${a2 || "asg_gb_13"}&no=${a1}`);
  else if (cmd === "void") { const asg = a2 || "asg_gb_13"; out = await j("/other", { path: "/api/submissions/batch", method: "POST", body: { ops: [op(await sid(a1, asg), asg, { status: "void", score: null, method: "grid" })] } }); }
  else if (cmd === "grid") { const asg = a3 || "asg_gb_13"; out = await j("/other", { path: "/api/submissions/batch", method: "POST", body: { ops: [op(await sid(a1, asg), asg, { status: "submitted", score: Number(a2), method: "grid", intent: "grade" })] } }); }
  else if (cmd === "bulk") out = await j("/other", { path: `/api/assignments/${a2 || "asg_gb_13"}/bulk`, method: "POST", body: { action: a1, classId: "cls_61" } });
  else if (cmd === "down") out = await j("/down", { on: a1 === "1" });
  else if (cmd === "log") out = (await j("/log")).slice(-Number(a1 || 15));
  console.log(JSON.stringify(out));
})().catch((e) => { console.error(e); process.exit(1); });

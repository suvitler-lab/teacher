// T-03 black-box HTTP checks against the fixture server (fictional data, localhost only).
import { client, DAY, bkkDate, noon } from "./lib.mjs";
import fs from "node:fs";
const out = []; let fails = 0;
const check = (id, name, ok, detail) => { out.push({ id, name, ok: !!ok, detail }); if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", id, name, ok ? "" : JSON.stringify(detail).slice(0, 1500)); };
const X = client("qa-dev-X"), Y = client("qa-dev-Y");
await X.login(); await Y.login();
const boot = (await X.call("GET", "/api/bootstrap")).body;
const NOW0 = boot.serverTime, TODAY = bkkDate(NOW0), YEST = bkkDate(NOW0 - DAY), TOMORROW = bkkDate(NOW0 + DAY);
console.log({ NOW0, TODAY, YEST });
const c61 = boot.students.filter((s) => s.class_id === "cls_61" && s.status === "active").map((s) => s.id);
const c62 = boot.students.filter((s) => s.class_id === "cls_62" && s.status === "active").map((s) => s.id);
console.log("cls_61", c61.length, "cls_62", c62.length);
let n = 0;
async function mkAsg(o) {
  const r = await X.call("POST", "/api/assignments", { term_id: "term_demo", subject_id: "sub_sci", type_id: "wt_worksheet", title: "QA c03 " + (++n), full_score: 10,
    assigned_date: "2026-10-26", due_date: YEST, status: "open", class_ids: ["cls_61"], publish_scores: true, ...o });
  if (r.status !== 200) throw new Error("asg " + r.status + JSON.stringify(r.body));
  return r.body.assignment.id;
}
let seq = 0;
const op = (o) => ({ opId: `qa-${Date.now()}-${++seq}`, scanSessionId: "scn_qa", status: "submitted", score: null, fullScoreAtScan: 10, method: "hid", clientTs: Date.now() - 1000, ...o });
const batch = async (cl, ops) => cl.call("POST", "/api/submissions/batch", { ops });
const cells = async (aid) => Object.fromEntries((await X.call("GET", `/api/assignments/${aid}/submissions`)).body.submissions.map((s) => [s.student_id, s]));
const auditList = async (q) => { const b = (await X.call("GET", `/api/audit?${q}&limit=200`)).body; return Array.isArray(b) ? b : (b.rows ?? b.items ?? b.entries ?? b.audit ?? []); };

// ---------- Q-05 expected-from-br (EP-01 first hand-in, re-date, invalid) ----------
const A = await mkAsg({});
const NOON_Y = noon(YEST);
{
  const [s1, s2] = c61;
  const o1 = op({ assignmentId: A, studentId: s1, receivedDate: YEST });
  const o2 = op({ assignmentId: A, studentId: s2 }); // old client, no field
  const r = await batch(X, [o1, o2]);
  const [a, b] = r.body.results;
  check("Q05-1", "hid + receivedDate yesterday -> noon yesterday, late false (due = yesterday)", a.result === "ok" && a.submission.submitted_at === NOON_Y && a.submission.late === false, a);
  check("Q05-2", "old client op without fields -> submitted_at = clientTs, late true (as before)", b.result === "ok" && b.submission.submitted_at === o2.clientTs && b.submission.late === true, { b, clientTs: o2.clientTs });
  const c = await cells(A);
  check("Q05-3", "EP-02 reads the same submitted_at/late", c[s1].submitted_at === NOON_Y && c[s1].late === false && c[s2].late === true, { s1: c[s1], s2: c[s2] });
  const e = op({ assignmentId: A, studentId: s2, method: "grid", scanSessionId: "gb", score: 7, receivedDate: YEST });
  const re = (await batch(X, [e])).body.results[0];
  check("Q05-4", "grid score edit on submitted cell ignores receivedDate (submitted_at unchanged)", re.result === "ok" && re.submission.score === 7 && re.submission.submitted_at === o2.clientTs && re.submission.late === true, re);
  const d = op({ assignmentId: A, studentId: s2, method: "grid", scanSessionId: "gb", score: 9, dateOnly: true, receivedDate: YEST });
  const rd = (await batch(X, [d])).body.results[0];
  check("Q05-5", "dateOnly yesterday -> ok, score stays 7 (op said 9), noon yesterday, late false", rd.result === "ok" && rd.submission.score === 7 && rd.submission.submitted_at === NOON_Y && rd.submission.late === false && rd.submission.status === "submitted", rd);
  const list = await auditList(`assignment=${A}&student=${s2}`);
  const row = list.find((x) => x.op_id === d.opId);
  const bj = row && row.before, aj = row && row.after;
  check("Q05-6", "audit row for re-date: update/grid, before 7 late true @clientTs, after 7 late false @noon", row && row.action === "update" && row.method === "grid" && bj.submitted_at === o2.clientTs && !!bj.late === true && aj.submitted_at === NOON_Y && !!aj.late === false && bj.score === 7 && aj.score === 7,
    { n: list.length, row: row && { action: row.action, method: row.method, before: bj && { s: bj.score, at: bj.submitted_at, late: bj.late }, after: aj && { s: aj.score, at: aj.submitted_at, late: aj.late } } });
  const d2 = op({ assignmentId: A, studentId: s2, method: "grid", scanSessionId: "gb", score: 7, dateOnly: true, receivedDate: TODAY });
  const rd2 = (await batch(X, [d2])).body.results[0];
  check("Q05-7", "dateOnly back to today -> submitted_at = clientTs of re-date op, late true", rd2.result === "ok" && rd2.submission.submitted_at === d2.clientTs && rd2.submission.late === true && rd2.submission.score === 7, rd2);
  const d3 = op({ assignmentId: A, studentId: s2, method: "grid", scanSessionId: "gb", score: 7, dateOnly: true, receivedDate: TODAY });
  const rd3 = (await batch(X, [d3])).body.results[0];
  check("Q05-8", "dateOnly to the same Thai day keeps stored ms", rd3.result === "ok" && rd3.submission.submitted_at === d2.clientTs, rd3);
  const bad = [[TOMORROW, "received_date_future"], ["2026-10-25", "received_date_before_assigned"], ["2026-02-30", "received_date_invalid"], ["30/10/2026", "received_date_invalid"], ["", "received_date_invalid"], [" " + YEST, "received_date_invalid"], [YEST + " ", "received_date_invalid"], ["2569-10-30", "received_date_invalid"], [YEST + "T00:00:00", "received_date_invalid"]];
  const ops = bad.map(([v], i) => op({ assignmentId: A, studentId: c61[3 + i], receivedDate: v }));
  const rr = (await batch(X, ops)).body.results;
  const c2 = await cells(A);
  bad.forEach(([v, want], i) => check("Q05-9." + i, `receivedDate ${JSON.stringify(v)} -> invalid ${want}, no row`, rr[i].result === "invalid" && rr[i].reason === want && !c2[c61[3 + i]], rr[i]));
  const as = (await batch(X, [op({ assignmentId: A, studentId: s1, receivedDate: TOMORROW })])).body.results[0];
  check("Q05-10", "hand-in again with a future date on submitted cell -> already_submitted", as.result === "already_submitted" && as.submission.submitted_at === NOON_Y, as);
}

// ---------- Q-06 offline replay ----------
const B = await mkAsg({});
{
  const s = c61[0];
  const o = op({ assignmentId: B, studentId: s, receivedDate: YEST, clientTs: Date.now() - 3 * 3600000 });
  const r1 = (await batch(X, [o])).body.results[0];
  const r2 = (await batch(X, [o])).body.results[0];
  const r3 = (await batch(Y, [o])).body.results[0];
  const list = await auditList(`assignment=${B}&student=${s}`);
  check("Q06-1", "same opId sent 3x (2 devices) -> ok, duplicate, duplicate; 1 audit; same submitted_at", r1.result === "ok" && r2.result === "duplicate" && r3.result === "duplicate" && r1.submission.submitted_at === NOON_Y && (r2.submission?.submitted_at ?? NOON_Y) === NOON_Y && list.filter((x) => x.op_id === o.opId).length === 1, { r1, r2, r3, audits: list.length });
  const d = op({ assignmentId: B, studentId: s, method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: "2026-10-28" });
  const a1 = (await batch(X, [d])).body.results[0], a2 = (await batch(X, [d])).body.results[0];
  check("Q06-2", "dateOnly replay -> ok then duplicate, date stays noon 10-28", a1.result === "ok" && a2.result === "duplicate" && (await cells(B))[s].submitted_at === noon("2026-10-28"), { a1, a2 });
  const s2 = c61[1];
  const old = op({ assignmentId: B, studentId: s2, receivedDate: "2026-10-27", clientTs: Date.now() - 9 * DAY });
  const ro = (await batch(X, [old])).body.results[0];
  check("Q06-3", "op queued 9 days (clamped) keeps receivedDate 10-27 -> noon 10-27", ro.result === "ok" && ro.submission.submitted_at === noon("2026-10-27") && ro.submission.late === false, ro);
  const retry = op({ assignmentId: B, studentId: s2, receivedDate: "2026-10-27" });
  const rr = (await batch(X, [retry])).body.results[0];
  check("Q06-4", "retry (new opId, same date) after ok -> already_submitted, unchanged", rr.result === "already_submitted" && rr.submission.submitted_at === noon("2026-10-27"), rr);
}

// ---------- Q-07 multi-device ----------
const C = await mkAsg({});
{
  const s = c61[0];
  await batch(X, [op({ assignmentId: C, studentId: s, score: 5, clientTs: Date.now() - 60000 })]);
  const T = Date.now();
  const ry = (await batch(Y, [op({ assignmentId: C, studentId: s, method: "grid", scanSessionId: "gbY", score: 8, clientTs: T - 10000 })])).body.results[0];
  const before = (await cells(C))[s];
  const rx = (await batch(X, [op({ assignmentId: C, studentId: s, method: "grid", scanSessionId: "gbX", score: 5, dateOnly: true, receivedDate: YEST, clientTs: T - 20000 })])).body.results[0];
  const after = (await cells(C))[s];
  check("Q07-1", "older re-date arriving after newer score edit -> superseded, score 8 + date kept", ry.result === "ok" && rx.result === "superseded" && after.score === 8 && after.submitted_at === before.submitted_at, { ry, rx, after });
  const rx2 = (await batch(X, [op({ assignmentId: C, studentId: s, method: "grid", scanSessionId: "gbX", score: 8, dateOnly: true, receivedDate: YEST, clientTs: T - 2000 })])).body.results[0];
  const ry2 = (await batch(Y, [op({ assignmentId: C, studentId: s, method: "grid", scanSessionId: "gbY", score: 3, clientTs: T - 5000 })])).body.results[0];
  const af2 = (await cells(C))[s];
  check("Q07-2", "newer re-date wins over older score edit sent later (superseded), score 8 noon yesterday", rx2.result === "ok" && ry2.result === "superseded" && af2.score === 8 && af2.submitted_at === NOON_Y, { rx2, ry2, af2 });
  let raceOk = 0; const raceDetail = [];
  for (let i = 0; i < 10; i++) {
    const st = c61[1 + i];
    await batch(X, [op({ assignmentId: C, studentId: st, score: 4, clientTs: Date.now() - 60000 })]);
    const t = Date.now();
    const redateNewer = i % 2 === 0;
    const pr = await Promise.all([
      batch(X, [op({ assignmentId: C, studentId: st, method: "grid", scanSessionId: "gbX", score: 4, dateOnly: true, receivedDate: "2026-10-28", clientTs: redateNewer ? t - 1000 : t - 3000 })]),
      batch(Y, [op({ assignmentId: C, studentId: st, method: "grid", scanSessionId: "gbY", score: 9, clientTs: redateNewer ? t - 3000 : t - 1000 })]),
    ]);
    const res = pr.map((p) => (p.status === 200 ? p.body.results[0].result : p.status));
    const fin = (await cells(C))[st];
    const consistent = (res[0] === "ok" ? fin.submitted_at === noon("2026-10-28") : fin.submitted_at !== noon("2026-10-28")) && (res[1] === "ok" ? fin.score === 9 : fin.score === 4)
      && fin.late === (bkkDate(fin.submitted_at) > YEST);
    const newerApplied = redateNewer ? res[0] === "ok" : res[1] === "ok";
    if (consistent && newerApplied) raceOk++;
    raceDetail.push({ redateNewer, res, score: fin.score, at: fin.submitted_at, late: fin.late });
  }
  check("Q07-3", "10 concurrent re-date vs score-edit races: newer op always applied, cell consistent", raceOk === 10, raceDetail);
  fs.writeFileSync("race.json", JSON.stringify(raceDetail, null, 1));
  const st = c61[12];
  await batch(X, [op({ assignmentId: C, studentId: st, clientTs: Date.now() - 60000 })]);
  const t = Date.now();
  const pr = await Promise.all([
    batch(X, [op({ assignmentId: C, studentId: st, method: "grid", scanSessionId: "gbX", dateOnly: true, receivedDate: "2026-10-27", clientTs: t - 3000 })]),
    batch(Y, [op({ assignmentId: C, studentId: st, method: "grid", scanSessionId: "gbY", dateOnly: true, receivedDate: "2026-10-29", clientTs: t - 1000 })]),
  ]);
  const fin = (await cells(C))[st];
  check("Q07-4", "two devices re-date same cell at once -> newer (10-29) wins", fin.submitted_at === noon("2026-10-29") && pr[1].body.results[0].result === "ok", { r: pr.map((p) => p.body.results?.[0]?.result ?? p.status), fin });
}

// ---------- bulk (EP-03/04) ----------
const D = await mkAsg({ class_ids: ["cls_62"] });
{
  const [e, sub, v] = c62;
  await batch(X, [op({ assignmentId: D, studentId: e, status: "excused", method: "grid", scanSessionId: "gb" }), op({ assignmentId: D, studentId: sub, score: 6 }), op({ assignmentId: D, studentId: v, status: "void", method: "grid", scanSessionId: "gb" })]);
  const pre = await cells(D);
  const bk = await X.call("POST", `/api/assignments/${D}/bulk`, { action: "all-submitted", classId: "cls_62", receivedDate: YEST });
  const mid = await cells(D);
  const changedIds = c62.filter((id) => id !== e && id !== sub);
  check("BK-1", `bulk all-submitted + yesterday -> changed ${changedIds.length}, noon yesterday, late false; excused/submitted untouched`,
    bk.status === 200 && bk.body.changed === changedIds.length && changedIds.every((id) => mid[id].status === "submitted" && mid[id].submitted_at === NOON_Y && mid[id].late === false)
    && JSON.stringify(mid[e]) === JSON.stringify(pre[e]) && JSON.stringify(mid[sub]) === JSON.stringify(pre[sub]), { bk: bk.body, sample: mid[changedIds[0]] });
  const list = await auditList(`assignment=${D}`);
  const bl = list.filter((x) => x.batch_id === bk.body.batchId);
  check("BK-2", "audit bulk rows: one per changed cell, after.submitted_at = noon yesterday", bl.length === changedIds.length && bl.every((x) => x.after.submitted_at === NOON_Y), { n: bl.length });
  const un = await X.call("POST", `/api/assignments/${D}/bulk-undo`, { batchId: bk.body.batchId });
  const post = await cells(D);
  const same = c62.every((id) => (pre[id] ? post[id] && post[id].status === pre[id].status && post[id].submitted_at === pre[id].submitted_at && post[id].score === pre[id].score : !post[id] || (post[id].status === "void" && post[id].submitted_at === null)));
  check("BK-3", "bulk-undo restores every cell (status/score/submitted_at to the ms)", un.status === 200 && un.body.changed === changedIds.length && same, { un: un.body, v: [pre[v], post[v]] });
  const bk2 = await X.call("POST", `/api/assignments/${D}/bulk`, { action: "all-submitted", classId: "cls_62", receivedDate: "2026-10-28" });
  await batch(X, [op({ assignmentId: D, studentId: changedIds[0], method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: "2026-10-29" })]);
  const before409 = await cells(D);
  const un2 = await X.call("POST", `/api/assignments/${D}/bulk-undo`, { batchId: bk2.body.batchId });
  const after409 = await cells(D);
  check("BK-4", "re-date a cell after bulk -> undo 409 modified_since, nothing restored", un2.status === 409 && JSON.stringify(un2.body).includes("modified_since") && JSON.stringify(before409) === JSON.stringify(after409), un2);
  const errs = [
    [{ action: "clear", classId: "cls_62", receivedDate: YEST }, 400, "received_date_not_applicable"],
    [{ action: "full-score", classId: "cls_62", receivedDate: YEST }, 400, "received_date_not_applicable"],
    [{ action: "all-submitted", classId: "cls_62", receivedDate: TOMORROW }, 400, "received_date_future"],
    [{ action: "all-submitted", classId: "cls_62", receivedDate: "2026-10-25" }, 400, "received_date_before_assigned"],
    [{ action: "all-submitted", classId: "cls_62", receivedDate: "2569-10-30" }, 400, "received_date_invalid"],
    [{ action: "all-submitted", classId: "cls_62", receivedDate: 20261030 }, 422, "validation"],
  ];
  const b0 = JSON.stringify(await cells(D));
  for (const [body, st, code] of errs) {
    const r = await X.call("POST", `/api/assignments/${D}/bulk`, body);
    check("BK-5." + code + "." + body.action, `bulk ${body.action} ${JSON.stringify(body.receivedDate)} -> ${st} ${code}`, r.status === st && JSON.stringify(r.body).includes(code), r);
  }
  check("BK-6", "no cell changed by any rejected bulk", JSON.stringify(await cells(D)) === b0, null);
  const clr = await X.call("POST", `/api/assignments/${D}/bulk`, { action: "clear", classId: "cls_62", receivedDate: null });
  check("BK-7", "bulk clear with receivedDate null -> 200 (as before)", clr.status === 200, clr.body);
}

// ---------- break it ----------
const E = await mkAsg({});
{
  const mid = noon(TODAY) - 12 * 3600000; // today 00:00 Bangkok
  const t1 = mid - 1000, t2 = mid + 1000;
  const ops = [
    op({ assignmentId: E, studentId: c61[0], clientTs: t1, receivedDate: YEST }),
    op({ assignmentId: E, studentId: c61[1], clientTs: t2, receivedDate: YEST }),
    op({ assignmentId: E, studentId: c61[2], clientTs: t1, receivedDate: TODAY }),
    op({ assignmentId: E, studentId: c61[3], clientTs: t2, receivedDate: TODAY }),
    op({ assignmentId: E, studentId: c61[4], clientTs: t1 }),
    op({ assignmentId: E, studentId: c61[5], clientTs: t2 }),
  ];
  const r = (await batch(X, ops)).body.results;
  const exp = [[t1, false], [NOON_Y, false], [noon(TODAY), true], [t2, true], [t1, false], [t2, true]];
  r.forEach((x, i) => check("MID-" + i, `midnight edge op ${i}: clientTs ${i % 2 ? "00:00:01" : "23:59:59 (prev day)"} received ${ops[i].receivedDate ?? "-"} -> ${exp[i][0]} late ${exp[i][1]}`,
    x.result === "ok" && x.submission.submitted_at === Math.min(exp[i][0], Date.now()) && x.submission.late === exp[i][1], x.submission ?? x));
  const far = bkkDate(NOW0 - 30000 * DAY);
  const F = await mkAsg({ assigned_date: null });
  const rf = (await batch(X, [op({ assignmentId: F, studentId: c61[0], receivedDate: far })])).body.results[0];
  check("FAR-1", `30000 days back (${far}), no assigned date -> accepted (no ceiling, Q2) at noon`, rf.result === "ok" && rf.submission.submitted_at === noon(far), { rf, noon: noon(far) });
  const rf2 = (await batch(X, [op({ assignmentId: E, studentId: c61[6], receivedDate: far })])).body.results[0];
  check("FAR-2", `30000 days back with assigned 10-26 -> before_assigned`, rf2.result === "invalid" && rf2.reason === "received_date_before_assigned", rf2);
  const r1900 = (await batch(X, [op({ assignmentId: F, studentId: c61[1], receivedDate: "1900-01-01" }), op({ assignmentId: F, studentId: c61[2], receivedDate: "1899-12-31" })])).body.results;
  check("FAR-3", "1900-01-01 ok / 1899-12-31 invalid on work with no assigned date", r1900[0].result === "ok" && r1900[1].reason === "received_date_invalid", r1900);
  fs.writeFileSync("far.json", JSON.stringify({ F, far, rf, r1900 }, null, 1));
  const types = [["number", { receivedDate: 20261101 }], ["33 chars", { receivedDate: "2026-11-01" + " ".repeat(23) }], ["dateOnly string", { dateOnly: "true" }], ["dateOnly 1", { dateOnly: 1 }], ["array", { receivedDate: [YEST] }], ["object", { receivedDate: { d: YEST } }], ["bool", { receivedDate: true }]];
  for (const [nm, f] of types) {
    const good = op({ assignmentId: E, studentId: c61[10] });
    const r2 = await batch(X, [good, op({ assignmentId: E, studentId: c61[11], ...f })]);
    const cc = await cells(E);
    check("TYPE-" + nm, `${nm} -> 422 whole request, no row`, r2.status === 422 && !cc[c61[10]] && !cc[c61[11]], { status: r2.status });
  }
  const ok32 = await batch(X, [op({ assignmentId: E, studentId: c61[12], receivedDate: "2026-11-01" + " ".repeat(22) })]);
  check("TYPE-32", "32-char string (trailing spaces) passes schema, then invalid", ok32.status === 200 && ok32.body.results[0].reason === "received_date_invalid", ok32.body);
  const nul = (await batch(X, [op({ assignmentId: E, studentId: c61[13], receivedDate: null, clientTs: Date.now() - 5000 })])).body.results[0];
  check("TYPE-null", "receivedDate null on hand-in = no date (event time)", nul.result === "ok" && bkkDate(nul.submission.submitted_at) === TODAY, nul);
  const G = await mkAsg({});
  await batch(X, [op({ assignmentId: G, studentId: c61[0], status: "void", method: "grid", scanSessionId: "gb" }), op({ assignmentId: G, studentId: c61[1], status: "excused", method: "grid", scanSessionId: "gb" }), op({ assignmentId: G, studentId: c61[3], score: 6 })]);
  const g0 = await cells(G);
  const dr = (await batch(X, [
    op({ assignmentId: G, studentId: c61[0], method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: YEST }),
    op({ assignmentId: G, studentId: c61[1], method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: YEST }),
    op({ assignmentId: G, studentId: c61[2], method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: YEST }),
    op({ assignmentId: G, studentId: c61[3], method: "hid", dateOnly: true, receivedDate: YEST }),
    op({ assignmentId: G, studentId: c61[3], method: "grid", scanSessionId: "gb", dateOnly: true }),
    op({ assignmentId: G, studentId: c61[3], method: "grid", scanSessionId: "gb", status: "void", dateOnly: true, receivedDate: YEST }),
    op({ assignmentId: G, studentId: c61[3], method: "grid", scanSessionId: "gb", dateOnly: true, receivedDate: YEST, score: 999 }),
  ])).body.results;
  const g1 = await cells(G);
  const want = ["cell_not_submitted", "cell_not_submitted", "cell_not_submitted", "redate_not_allowed", "received_date_invalid", "redate_not_allowed"];
  want.forEach((w, i) => check("DO-" + i, `dateOnly edge ${i} -> invalid ${w}`, dr[i].result === "invalid" && dr[i].reason === w, dr[i]));
  check("DO-6", "dateOnly with score 999 (out of range) -> ok, score stays 6", dr[6].result === "ok" && g1[c61[3]].score === 6 && g1[c61[3]].submitted_at === NOON_Y, dr[6]);
  check("DO-7", "void/excused/empty cells unchanged", JSON.stringify(g1[c61[0]]) === JSON.stringify(g0[c61[0]]) && JSON.stringify(g1[c61[1]]) === JSON.stringify(g0[c61[1]]) && !g1[c61[2]], null);
  const H = await mkAsg({});
  const vals = [YEST, TOMORROW, "2026-10-25", "bad", "2026-10-28", TODAY, null, "2026-02-29", "2028-02-29"];
  const expect1 = (v) => (v === null || v === YEST || v === "2026-10-28" || v === TODAY ? "ok" : "invalid");
  const ops50 = []; for (let i = 0; i < 50; i++) ops50.push(op({ assignmentId: H, studentId: c61[i % c61.length], receivedDate: vals[i % vals.length] }));
  const r50 = await batch(X, ops50);
  const res50 = r50.body.results ?? [];
  const mism = []; let good = 0;
  ops50.forEach((o, i) => {
    const seen = ops50.slice(0, i).some((p) => p.studentId === o.studentId && expect1(p.receivedDate) === "ok");
    const w = seen ? "already_submitted" : expect1(o.receivedDate);
    if (res50[i]?.result === w) good++; else mism.push({ i, v: o.receivedDate, got: res50[i]?.result, reason: res50[i]?.reason, w });
  });
  const c50 = await cells(H);
  check("B50", `50-op batch (${c61.length} children, mixed dates): each op judged alone`, r50.status === 200 && res50.length === 50 && mism.length === 0, { status: r50.status, mism: mism.slice(0, 5), good, rows: Object.keys(c50).length });
  const I = await mkAsg({});
  await batch(X, [op({ assignmentId: I, studentId: c61[0], score: 6 })]);
  const cl = await X.call("POST", "/api/assignments", { id: I, term_id: "term_demo", subject_id: "sub_sci", type_id: "wt_worksheet", title: "QA c03 closed", full_score: 10, assigned_date: "2026-10-26", due_date: YEST, status: "closed", class_ids: ["cls_61"], publish_scores: true });
  const rc = (await batch(X, [op({ assignmentId: I, studentId: c61[0], method: "grid", scanSessionId: "gb", score: 6, dateOnly: true, receivedDate: YEST }), op({ assignmentId: I, studentId: c61[1], receivedDate: YEST })])).body.results;
  check("CLOSED", "closed work: re-date ok, new hand-in with date -> assignment_closed", cl.status === 200 && rc[0].result === "ok" && rc[1].result === "assignment_closed", rc);
}

// ---------- AC-20 metrics via endpoints ----------
const M = await mkAsg({ title: "QA c03 metrics" });
{
  const kids = c61.slice(0, 20);
  await batch(X, kids.map((s) => op({ assignmentId: M, studentId: s, score: 8, method: "manual" })));
  const gb = async () => (await X.call("GET", `/api/gradebook?class=cls_61&subject=sub_sci&term=term_demo`)).body;
  const rep = async () => (await X.call("GET", `/api/reports/summary?class=cls_61&subject=sub_sci&term=term_demo`)).body;
  const dash = async () => (await X.call("GET", `/api/dashboard`)).body;
  const sum = (g) => { const s = (g.submissions ?? []).filter((x) => x.assignment_id === M); return { n: s.filter((x) => x.status === "submitted").length, late: s.filter((x) => x.late).length, score: s.reduce((a, x) => a + (x.score ?? 0), 0) }; };
  const g0 = sum(await gb()), r0 = sum(await rep()), d0 = await dash();
  const redo = kids.slice(0, 15).map((s) => op({ assignmentId: M, studentId: s, method: "grid", scanSessionId: "gb", score: 8, dateOnly: true, receivedDate: "2026-10-28" }));
  const rr = (await batch(X, redo)).body.results;
  const g1 = sum(await gb()), r1 = sum(await rep()), d1 = await dash();
  check("AC20-1", "gradebook: late 20 -> 5, submitted 20 -> 20, score sum 160 -> 160", rr.every((x) => x.result === "ok") && g0.late === 20 && g1.late === 5 && g0.n === 20 && g1.n === 20 && g0.score === 160 && g1.score === 160, { g0, g1 });
  check("AC20-2", "reports/summary: same late change, same score sum", r0.late === 20 && r1.late === 5 && r0.score === 160 && r1.score === 160, { r0, r1 });
  fs.writeFileSync("dash.json", JSON.stringify({ M, d0, d1 }, null, 1));
}
fs.writeFileSync("results.json", JSON.stringify({ NOW0, TODAY, out }, null, 1));
console.log("fails", fails, "of", out.length);

// T-03 follow-ups: BK-4 with a re-date made after the bulk; backup -> restore with a pre-1970 received date.
import { client, DAY, bkkDate, noon } from "./lib.mjs";
import fs from "node:fs";
const X = client("qa-dev-X2"); await X.login();
const boot = (await X.call("GET", "/api/bootstrap")).body;
const NOW0 = boot.serverTime, YEST = bkkDate(NOW0 - DAY);
const c62 = boot.students.filter((s) => s.class_id === "cls_62" && s.status === "active").map((s) => s.id);
const res = {};
const D = (await X.call("POST", "/api/assignments", { term_id: "term_demo", subject_id: "sub_sci", type_id: "wt_worksheet", title: "QA c03 bk4", full_score: 10, assigned_date: "2026-10-26", due_date: YEST, status: "open", class_ids: ["cls_62"], publish_scores: true })).body.assignment.id;
const cells = async (aid) => Object.fromEntries((await X.call("GET", `/api/assignments/${aid}/submissions`)).body.submissions.map((s) => [s.student_id, s]));
const bk = await X.call("POST", `/api/assignments/${D}/bulk`, { action: "all-submitted", classId: "cls_62", receivedDate: "2026-10-28" });
await new Promise((r) => setTimeout(r, 50));
const rd = await X.call("POST", "/api/submissions/batch", { ops: [{ opId: "qa-bk4-" + Date.now(), scanSessionId: "gb", assignmentId: D, studentId: c62[0], status: "submitted", score: null, fullScoreAtScan: 10, method: "grid", clientTs: Date.now(), dateOnly: true, receivedDate: "2026-10-29" }] });
const b409 = await cells(D);
const un = await X.call("POST", `/api/assignments/${D}/bulk-undo`, { batchId: bk.body.batchId });
const a409 = await cells(D);
res.BK4 = { pass: rd.body.results[0].result === "ok" && un.status === 409 && JSON.stringify(un.body).includes("modified_since") && JSON.stringify(b409) === JSON.stringify(a409), redate: rd.body.results[0].result, undo: [un.status, un.body] };
console.log("BK-4", res.BK4.pass ? "PASS" : "FAIL", JSON.stringify(res.BK4).slice(0, 400));

// backup the whole fixture (it now holds a cell received 1944-09-13 => negative submitted_at) and try to restore it
const tables = ["terms", "classes", "subjects", "work_types", "settings", "students", "assignments", "assignment_classes", "submissions", "scan_sessions", "attendance_sessions", "attendance", "audit_logs", "revoked_qr_tokens"];
const neg = (await X.call("GET", "/api/backup?table=submissions&cursor=0")).body;
console.log("backup page keys", Object.keys(neg));
const all = []; for (let cur = 0; cur !== null;) { const p = (await X.call("GET", `/api/backup?table=submissions&cursor=${cur}`)).body; all.push(...p.rows); cur = p.nextCursor; }
const negRows = all.filter((r) => typeof r.submitted_at === "number" && r.submitted_at < 0);
res.negativeRows = negRows.map((r) => ({ a: r.assignment_id, s: r.student_id, submitted_at: r.submitted_at }));
console.log("submissions in backup", all.length, "negative submitted_at", negRows.length, JSON.stringify(res.negativeRows));
fs.writeFileSync("run2.json", JSON.stringify(res, null, 1));

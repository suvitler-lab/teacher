import { client } from "./lib.mjs";
const X = client("qa-dev-X3"); await X.login();
const tables = ["settings","terms","classes","subjects","work_types","students","revoked_qr_tokens","assignments","assignment_classes","scan_sessions","submissions","attendance_sessions","attendance",];
const counts = {}; let negs = [];
for (const t of tables) { const rows = []; for (let cur = 0; cur !== null;) { const p = (await X.call("GET", `/api/backup?table=${t}&cursor=${cur}`)).body; rows.push(...p.rows); cur = p.nextCursor; } counts[t] = rows.length; if (t === "submissions") negs = rows.filter((r) => r.submitted_at < 0); }
const v = await X.call("POST", "/api/restore/validate", { manifest: { schema_version: 6, counts } });
console.log("validate", v.status, v.body.ok);
const ch = await X.call("POST", "/api/restore/execute", { restoreId: v.body.restoreId, step: "chunk", table: "submissions", seq: 0, rows: negs });
console.log("chunk with the", negs.length, "pre-1970 rows ->", ch.status, JSON.stringify(ch.body).slice(0, 600));
const ab = await X.call("POST", "/api/restore/execute", { restoreId: v.body.restoreId, step: "abort" });
console.log("abort", ab.status);

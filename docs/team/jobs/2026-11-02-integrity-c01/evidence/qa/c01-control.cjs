// QA helper for integrity-c01 browser checks (fictional fixture data only, 127.0.0.1 only).
// Starts scripts/fixture-server.cjs (layout data) on --port P and a small control server on P+1:
//   POST /down        {"on":true|false}      cut / restore the network for the app (page + service worker)
//   GET  /cell?asg=asg_gb_13&no=4            the stored submission of child no. N in ป.6/1 + its audit rows
//   POST /other       {"path","method","body"} call the API in-process as ANOTHER device (own login), even while
//                                             the app's network is cut — "the computer's gradebook"
//   GET  /log                                API calls seen from the browser (method, path, status)
//   POST /quit                               stop everything
// Usage: node c01-control.cjs --port 4120 [--assets <dir>] [--fixture <scripts/fixture-server.cjs of another tree>]
const path = require("node:path");
const http = require("node:http");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const port = Number(arg("--port", "4120"));
const fixturePath = path.resolve(arg("--fixture", path.join(__dirname, "../../../../../../scripts/fixture-server.cjs")));
const { startFixtureServer } = require(fixturePath);
const root = path.resolve(path.dirname(fixturePath), "..");

(async () => {
  const srv = await startFixtureServer({ port, layout: true, ...(arg("--assets") ? { assetsDir: path.resolve(arg("--assets")) } : {}) });
  const { app } = require(path.join(root, "worker/app.ts")); // same module instance the fixture uses
  const env = { DB: srv.DB, SETUP_CODE: "fixture-setup", SESSION_PEPPER: "fixture-pepper-not-secret" };
  let cookie = "";
  const other = async (p, method = "GET", body) => {
    if (!cookie) {
      const r = await app.request("http://127.0.0.1/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: srv.email, password: srv.password, deviceId: "qa-other-pc", deviceName: "QA other PC" }) }, env);
      cookie = (r.headers.get("set-cookie") || "").split(";")[0];
      if (r.status !== 200) throw new Error("other-device login " + r.status);
    }
    const r = await app.request("http://127.0.0.1" + p, { method, headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}) }, env);
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const cell = async (asg, no) => {
    const st = await srv.DB.prepare("SELECT id FROM students WHERE class_id = 'cls_61' AND number = ?").bind(no).first();
    const sub = await srv.DB.prepare("SELECT status, score, late, submitted_at, method, device_id, scan_session_id, updated_at, event_at FROM submissions WHERE assignment_id = ? AND student_id = ?").bind(asg, st.id).first();
    const audit = (await srv.DB.prepare("SELECT op_id, action, device_id, scan_session_id FROM audit_logs WHERE assignment_id = ? AND student_id = ? ORDER BY id").bind(asg, st.id).all()).results;
    return { studentId: st.id, sub, audit };
  };
  const ctl = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const parts = []; for await (const c of req) parts.push(c);
      const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
      let out;
      if (url.pathname === "/down") { srv.setDown(!!body.on); out = { down: !!body.on }; }
      else if (url.pathname === "/cell") out = await cell(url.searchParams.get("asg") || "asg_gb_13", Number(url.searchParams.get("no") || 4));
      else if (url.pathname === "/other") out = await other(body.path, body.method || "GET", body.body);
      else if (url.pathname === "/log") out = srv.apiLog.map((x) => `${x.method} ${x.path} ${x.status}`);
      else if (url.pathname === "/quit") { res.end("bye"); await srv.close(); ctl.close(); process.exit(0); }
      else { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
  });
  ctl.listen(port + 1, "127.0.0.1");
  console.log(`fixture on ${srv.url} · control on http://127.0.0.1:${port + 1} · synthetic data only`);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await srv.close(); process.exit(0); });
})().catch((e) => { console.error(e); process.exit(1); });

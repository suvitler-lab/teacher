// QA T-04 (continued) browser helpers for integrity-c02 — paste into the page (fixture server only, fictional data).
// Stored as localStorage.qaH and re-run with eval(localStorage.qaH) after each reload.
// qa.reset(AID, CLS, full, numbers, score)  -> clear class, set full (raise_choice keep), grade numbers via /api/submissions/batch
// qa.raise(AID, to, 'adjust'|'keep')        -> UI: click column head -> "จัดการงาน" -> "แก้ไข" -> type full -> "บันทึกงาน" -> choose in the ask dialog
// qa.subs(AID)                               -> { full, rows: ["stu_x=score"] } from EP-02
// window.__qaLog                             -> every non-GET /api call made by the page { u, m, s, b }
window.qa = {};
qa.w = (t) => new Promise((r) => setTimeout(r, t));
qa.W = async (f, n = 100) => { for (let i = 0; i < n && !f(); i++) await qa.w(100); return f(); };
qa.q = (s) => document.querySelector(s);
qa.api = (p, b, m = "POST") => fetch(p, { method: m, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
qa.boot = () => fetch("/api/bootstrap", { credentials: "same-origin" }).then((r) => r.json());
qa.reset = async (AID, CLS, full, nums, score) => {
  const boot = await qa.boot(); const a = boot.assignments.find((x) => x.id === AID);
  await qa.api("/api/assignments/" + AID + "/bulk", { action: "clear", classId: CLS });
  const body = { id: a.id, term_id: a.term_id, subject_id: a.subject_id, type_id: a.type_id, title: a.title, unit: a.unit ?? null, full_score: full, assigned_date: a.assigned_date, due_date: a.due_date, note: a.note ?? null, publish_scores: !!a.publish_scores, status: "open", class_ids: a.class_ids };
  const s = await qa.api("/api/assignments", { ...body, raise_choice: "keep", raise_from: a.full_score });
  const kids = boot.students.filter((x) => x.class_id === CLS && nums.includes(x.number));
  const g = nums.length ? await qa.api("/api/submissions/batch", { ops: kids.map((k) => ({ opId: "qa-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8), scanSessionId: "qa-c02", assignmentId: AID, studentId: k.id, status: "submitted", score, fullScoreAtScan: full, method: "grid", clientTs: Date.now() })) }) : { status: 0 };
  return { save: s.status, grade: g.status };
};
qa.subs = async (AID) => {
  const r = await fetch("/api/assignments/" + AID + "/submissions", { credentials: "same-origin" }).then((r) => r.json());
  const boot = await qa.boot(); const a = boot.assignments.find((x) => x.id === AID);
  return { full: a.full_score, rows: (r.submissions || r.rows || r).filter((x) => x.score != null).map((x) => x.student_id + "=" + x.score) };
};
window.__qaLog = window.__qaLog || [];
if (!window.__qaF) {
  window.__qaF = 1; const of = window.fetch;
  window.fetch = async (...a) => { const r = await of(...a); try { const u = String(a[0].url || a[0]); const m = a[1]?.method || "GET"; if (u.includes("/api/") && m !== "GET") window.__qaLog.push({ u: u.replace(location.origin, ""), m, s: r.status, b: String(a[1]?.body || "").slice(0, 120) }); } catch {} return r; };
}
qa.field = (re) => [...document.querySelectorAll("label.field")].find((l) => re.test(l.textContent))?.querySelector("input,textarea");
qa.set = (inp, v) => { const P = inp.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(inp, v); inp.dispatchEvent(new Event("input", { bubbles: true })); };
qa.btn = (re, root = document) => [...root.querySelectorAll("button")].find((b) => re.test(b.textContent.trim()));
qa.ask = () => [...document.querySelectorAll("[role=dialog]")].find((d) => /คงไว้/.test(d.textContent));
qa.menu = async () => { const t = await qa.W(() => qa.q('button[aria-label="จัดการงาน"]')); if (!t) return "no menu"; t.click(); return true; };
qa.openEdit = async (AID) => {
  if (!location.hash.startsWith("#/gradebook")) { location.hash = "#/gradebook?class=cls_61&subject=sub_math"; await qa.w(900); }
  const th = await qa.W(() => qa.q('th[data-aid="' + AID + '"]')); if (!th) return "no th";
  th.click(); await qa.w(300);
  const m = await qa.menu(); if (m !== true) return m;
  const e = await qa.W(() => [...document.querySelectorAll(".gb-menu button,[role=menu] button")].find((b) => /^\s*แก้ไข(งาน)?\s*$/.test(b.textContent)), 30);
  if (!e) return "no edit"; e.click();
  return !!(await qa.W(() => qa.field(/คะแนนเต็ม/)));
};
qa.raise = async (AID, to, choice) => {
  const ok = await qa.openEdit(AID); qa.set(qa.field(/คะแนนเต็ม/), String(to)); await qa.w(200);
  qa.btn(/บันทึกงาน/).click();
  const d = await qa.W(qa.ask, 60); if (!d) return { ok, ask: false };
  const dt = d.textContent; qa.btn(choice === "keep" ? /^คงไว้/ : /^ปรับ/, d).click(); await qa.w(1200);
  return { ok, dt };
};

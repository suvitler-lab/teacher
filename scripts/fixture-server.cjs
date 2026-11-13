// Disposable app server for browser checks: the real built assets (dist/client/client) and the real worker code,
// on an in-memory D1 filled with fictional students. Never reads .dev.vars, a real database or the network.
//
//   npm run build && node scripts/fixture-server.cjs        # by hand: http://127.0.0.1:5194
//   node scripts/offline-e2e.cjs                             # uses startFixtureServer() in-process
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const Module = require("node:module");
const ts = require("typescript");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

const root = path.resolve(__dirname, "..");
const PASSWORD = "FixturePassword2026";
const EMAIL = "fixture@example.com";

// run the worker's TypeScript directly (it imports "@shared/…")
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolveFilename.call(this, name.startsWith("@shared/") ? path.join(root, "shared", name.slice(8) + ".ts") : name, ...args);
};
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      fileName: f,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f,
  );

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
};

/** public/_headers the way the host applies it: every matching block counts, later ones win per header. */
function headerRules(file) {
  const rules = [];
  let cur = null;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) { cur = { pattern: raw.trim(), headers: {} }; rules.push(cur); continue; }
    const m = /^\s+([^:]+):\s*(.+)$/.exec(raw);
    if (m && cur) cur.headers[m[1].trim()] = m[2].trim();
  }
  return rules;
}
const matches = (pattern, pathname) =>
  pattern.endsWith("*") ? pathname.startsWith(pattern.slice(0, -1)) : pattern === pathname;

/**
 * Wrap a D1 binding so every round trip to it costs `latency.ms` (like a database on another continent) and is
 * counted. A batch is ONE round trip, as on the real thing. Statements stay real objects; only the methods that
 * actually go to the database (first / all / run / raw / batch) are delayed.
 */
function timedDb(DB, latency, stats) {
  const real = new WeakMap(); // wrapper -> real statement (batch() needs the real ones)
  const trip = async (label, fn) => {
    stats.count++; stats.log.push(label);
    if (latency.ms > 0) await new Promise((r) => setTimeout(r, latency.ms));
    return fn();
  };
  const wrapStmt = (stmt, sql) => {
    const w = new Proxy(stmt, {
      get(t, prop) {
        if (prop === "bind") return (...a) => wrapStmt(t.bind(...a), sql);
        if (["first", "all", "run", "raw"].includes(prop)) return (...a) => trip(String(sql).replace(/\s+/g, " ").slice(0, 70), () => t[prop](...a));
        const v = Reflect.get(t, prop);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    real.set(w, stmt);
    return w;
  };
  return new Proxy(DB, {
    get(t, prop) {
      if (prop === "prepare") return (sql) => wrapStmt(t.prepare(sql), sql);
      if (prop === "batch") return (stmts) => trip(`batch(${stmts.length})`, () => t.batch(stmts.map((x) => real.get(x) ?? x)));
      const v = Reflect.get(t, prop);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

/**
 * Opt-in (--gb14): a gradebook with 14 pieces of work (4 types, Aug-Oct 2026) and 44 children in ป.6/1, for คณิตศาสตร์.
 * Fictional and deterministic. Not part of the default seed so other checks keep their numbers.
 */
async function addGradebook14(DB) {
  const have = (await DB.prepare("SELECT COUNT(*) n FROM students WHERE class_id = 'cls_61' AND status = 'active'").first()).n;
  const stmts = [];
  const names = ["สมมติ", "ทดลอง", "ตัวอย่าง", "จำลอง"];
  for (let i = have + 1; i <= 44; i++) {
    stmts.push(DB.prepare("INSERT OR REPLACE INTO students (id, code, qr_token, prefix, first_name, last_name, nickname, class_id, number, status, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0)")
      .bind(`stu_gb_${i}`, `19${String(i).padStart(3, "0")}`, `Q-GB${String(i).padStart(8, "0")}`, "ด.ช.", `เด็ก${i}`, names[i % 4], `น้อง${i}`, "cls_61", i, "active"));
  }
  const types = { w: "wt_worksheet", e: "wt_exercise", q: "wt_quiz", p: "wt_project" };
  const defs = [
    ["w", "ใบงาน 1 เลขยกกำลัง", 10, "2026-08-04"], ["w", "ใบงาน 2 เศษส่วน", 10, "2026-08-18"], ["e", "แบบฝึกหัด 1.1", 10, "2026-08-25"],
    ["w", "ใบงาน 3 ทศนิยม", 10, "2026-09-02"], ["e", "แบบฝึกหัด 1.2", 10, "2026-09-09"], ["q", "สอบย่อย บทที่ 1", 20, "2026-09-16"],
    ["w", "ใบงาน 4 ร้อยละ", 10, "2026-09-23"], ["e", "แบบฝึกหัด 2.1", 10, "2026-10-01"], ["w", "ใบงาน 5 อัตราส่วน", 10, "2026-10-06"],
    ["e", "แบบฝึกหัด 2.2", 10, "2026-10-13"], ["q", "สอบย่อย บทที่ 2", 20, "2026-10-16"], ["p", "โครงงานคณิตศาสตร์ในชีวิตประจำวัน", 20, "2026-10-20"],
    ["w", "ใบงาน 6 สมการ", 10, "2026-10-27"], ["e", "แบบฝึกหัด 3.1", 10, "2026-10-28"],
  ];
  const rnd = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  defs.forEach(([t, title, full, date], j) => {
    const id = `asg_gb_${j + 1}`;
    const due = date.slice(0, 8) + String(Math.min(28, Number(date.slice(8)) + 5)).padStart(2, "0");
    stmts.push(DB.prepare("INSERT OR REPLACE INTO assignments (id, term_id, subject_id, type_id, title, unit, full_score, assigned_date, due_date, note, publish_scores, status, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL,?,?,?,NULL,1,'open',0,0,NULL)")
      .bind(id, "term_demo", "sub_math", types[t], title, full, date, due));
    stmts.push(DB.prepare("INSERT OR REPLACE INTO assignment_classes (assignment_id, class_id) VALUES (?, 'cls_61')").bind(id));
  });
  await DB.batch(stmts);
  const rows = (await DB.prepare("SELECT id FROM students WHERE class_id = 'cls_61' AND status = 'active' ORDER BY number").all()).results;
  const subs = [];
  defs.forEach(([, , full], j) => rows.forEach((st, i) => {
    const r = rnd((i + 1) * 13 + j * 7);
    if (i === 6) { subs.push(DB.prepare("INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at) VALUES (?,?,'excused',NULL,0,NULL,'grid',1)").bind(`asg_gb_${j + 1}`, st.id)); return; }
    if (r > (j > 11 ? 0.45 : 0.9)) return; // not handed in
    const score = r < 0.1 ? null : Math.round(full * (0.5 + rnd(i * 3 + j) * 0.5) * 2) / 2;
    subs.push(DB.prepare("INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at) VALUES (?,?,'submitted',?,?,1,'grid',1)").bind(`asg_gb_${j + 1}`, st.id, score, r > 0.8 ? 1 : 0));
  }));
  for (let k = 0; k < subs.length; k += 80) await DB.batch(subs.slice(k, k + 80));
}

const LONG_TITLE = "ใบงานที่ 7 การวิเคราะห์ระบบนิเวศในท้องถิ่นของเรา"; // 40 graphemes, fictional

/**
 * Opt-in (--layout, implies gradebook14): data for column-fill / long-text / status layout checks. All fictional.
 *  F-2 science in ป.6/1 keeps 2 works of different types, one with a long title
 *  F-3 ภาษาอังกฤษ with 6 works (3 types)   F-4 ศิลปะ with 1 work
 *  F-5 children no. 2-5 get short/long/emoji names, asg_gb_12 gets the long title
 *  F-6 asg_gb_13 has every status at least once; no. 1 and 2 have not handed in
 */
async function addLayout(DB) {
  const rnd = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  const kids = (await DB.prepare("SELECT id, number FROM students WHERE class_id = 'cls_61' AND status = 'active' ORDER BY number").all()).results;
  const idOf = (no) => kids.find((k) => k.number === no).id;
  await DB.batch([
    DB.prepare("DELETE FROM assignment_classes WHERE class_id = 'cls_61' AND assignment_id IN ('asg_quiz', 'asg_hw', 'asg_proj')"),
    DB.prepare("UPDATE assignments SET title = ? WHERE id IN ('asg_ws4', 'asg_gb_12')").bind(LONG_TITLE),
    DB.prepare("INSERT OR REPLACE INTO subjects (id, code, name, color, sort, archived, updated_at) VALUES ('sub_eng', 'อ16101', 'ภาษาอังกฤษ', 'green', 30, 0, 0), ('sub_art', 'ศ16101', 'ศิลปะ', 'orange', 40, 0, 0)"),
    DB.prepare("UPDATE students SET nickname = 'นวพล' WHERE id = ?").bind(idOf(2)),
    DB.prepare("UPDATE students SET nickname = 'กมลชนก' WHERE id = ?").bind(idOf(3)),
    DB.prepare("UPDATE students SET nickname = 'กมลวรรณชนกพร', first_name = 'กมลวรรณชนกพรนภสรอร', last_name = 'วงศสกลนครพนมบรรพตชยกรณ' WHERE id = ?").bind(idOf(4)),
    DB.prepare("UPDATE students SET nickname = 'ข้าวหอม🌾' WHERE id = ?").bind(idOf(5)),
  ]);
  const works = [
    ["asg_en_1", "sub_eng", "wt_worksheet", "Worksheet 1 Greetings", 10, "2026-08-05"], ["asg_en_2", "sub_eng", "wt_exercise", "Exercise 1 Colours", 10, "2026-08-26"],
    ["asg_en_3", "sub_eng", "wt_worksheet", "Worksheet 2 Family", 10, "2026-09-09"], ["asg_en_4", "sub_eng", "wt_quiz", "Quiz Unit 1", 20, "2026-09-23"],
    ["asg_en_5", "sub_eng", "wt_exercise", "Exercise 2 Animals", 10, "2026-10-07"], ["asg_en_6", "sub_eng", "wt_worksheet", "Worksheet 3 Food", 10, "2026-10-21"],
    ["asg_art_1", "sub_art", "wt_project", "วาดภาพทิวทัศน์", 20, "2026-10-14"],
  ];
  const stmts = [];
  for (const [id, sub, type, title, full, date] of works) {
    stmts.push(DB.prepare("INSERT OR REPLACE INTO assignments (id, term_id, subject_id, type_id, title, unit, full_score, assigned_date, due_date, note, publish_scores, status, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL,?,?,?,NULL,1,'open',0,0,NULL)")
      .bind(id, "term_demo", sub, type, title, full, date, date));
    stmts.push(DB.prepare("INSERT OR REPLACE INTO assignment_classes (assignment_id, class_id) VALUES (?, 'cls_61')").bind(id));
  }
  await DB.batch(stmts);
  const subs = [];
  works.forEach(([id, , , , full], j) => kids.forEach((k, i) => {
    const r = rnd((i + 1) * 17 + j * 5 + 3);
    if (r > (id === "asg_art_1" ? 0.3 : 0.88)) return;
    subs.push(DB.prepare("INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at) VALUES (?,?,'submitted',?,?,1,'grid',1)")
      .bind(id, k.id, Math.round(full * (0.5 + rnd(i * 3 + j + 40) * 0.5) * 2) / 2, r > 0.8 ? 1 : 0));
  }));
  // F-6: asg_gb_13 has every status; no. 1 and 2 have not handed in
  const nums = [1, 2, 3, 4, 5, 6, 7];
  subs.push(DB.prepare(`DELETE FROM submissions WHERE assignment_id = 'asg_gb_13' AND student_id IN (${nums.map(() => "?").join(",")})`).bind(...nums.map(idOf)));
  const gb = (no, status, score, late) => DB.prepare("INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at) VALUES ('asg_gb_13',?,?,?,?,?,'grid',1)")
    .bind(idOf(no), status, score, late, status === "excused" ? null : 1);
  subs.push(gb(3, "submitted", 9, 0), gb(4, "submitted", 6, 1), gb(5, "submitted", null, 0), gb(6, "excused", null, 0));
  for (let k = 0; k < subs.length; k += 80) await DB.batch(subs.slice(k, k + 80));
}

// =====================================================================================================================
// Opt-in data sets for the home-redesign job (docs/team/jobs/2026-11-11-home-redesign/fixtures.md, X-1 .. X-6).
// Every date is relative to "today" in Asia/Bangkok at start (T), so "due today", "tomorrow", "5 days overdue" stay true
// whenever the server is started. All names are fictional. None of this runs unless a data set flag is given.
// =====================================================================================================================
const { bkkToday } = require(path.join(root, "shared/time.ts"));
const { percentOf, attendancePercent, attendanceProgress } = require(path.join(root, "shared/metrics.ts"));

const HOME_DATASETS = ["home", "home-empty-year", "home-no-students", "home-clear", "home-many", "home-extra", "home-extra-b", "home-one"];
const SCAN_DATASETS = ["scan", "scan-all-62", "scan-noroom", "scan-empty"];
const TIMETABLE_DATASETS = ["timetable"]; // F-T1 + F-T4 (job 2026-11-12-timetable): the reference timetable, schema 7
const DATASETS = ["demo", "empty", ...HOME_DATASETS, ...SCAN_DATASETS, ...TIMETABLE_DATASETS];

const DAY_MS = 86_400_000;
/** The calendar day `n` days after (or before, n < 0) a YYYY-MM-DD date. */
const dayAdd = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
/** 12:00 Bangkok on a YYYY-MM-DD date, in epoch ms. */
const noonOf = (d) => Date.parse(d + "T12:00:00+07:00");
const rndAt = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** n in the QR alphabet, 9 characters ("Q-F" + this = a well-formed, unique, deterministic token). */
function crockford(n) { let out = ""; do { out = CROCKFORD[n % 32] + out; n = Math.floor(n / 32); } while (n > 0); return out.padStart(9, "0"); }

const TERM = { old: "term_h0", prev: "term_h1", cur: "term_h2" };
// class ids sort in the order the rooms are listed (assignment_classes is read back in primary-key order, and the
// scan page's "next room" follows that order)
const CLS = {
  g61: "cls_a_g61", g62: "cls_b_g62", g51: "cls_c_g51", g63: "cls_c_g63", g41: "cls_d_g41", g64: "cls_d_g64",
  g42: "cls_e_g42", g65: "cls_e_g65", g66: "cls_f_g66", old51: "cls_o_g51", old52: "cls_p_g52",
};
/** A card that was reissued (X-6). The text in fixtures.md ("Q-OLDCARD0002") is not a valid token shape (O and L are not
 *  in the QR alphabet, so the app never looks it up as a revoked card); the valid-shaped one below is what really resolves
 *  to "revoked". Both are kept in revoked_qr_tokens. */
const OLD_CARD_VALID = "Q-ZCARD00002";
const OLD_CARD_LITERAL = "Q-OLDCARD0002";
const NEW_CARD = "Q-NCARD00002";
const HOME_DEFAULTS = { teacher_name: "ครูสมมติ ใจดี", late_after: "08:30" };
const DEFAULT_BACKUP_DAYS = { "home-clear": 0 }; // everything else: home sets 9 days ago (BR-01 example), scan sets 1 day ago

function newCtx(DB, T) { return { DB, T, stmts: [], seq: 0 }; }
function put(ctx, sql, ...binds) { ctx.stmts.push(ctx.DB.prepare(sql).bind(...binds)); }
async function flush(ctx) {
  for (let k = 0; k < ctx.stmts.length; k += 80) await ctx.DB.batch(ctx.stmts.slice(k, k + 80));
  ctx.stmts.length = 0;
}

function addTerm(ctx, { id, year, term, name, current, start, end }) {
  put(ctx, "INSERT OR REPLACE INTO terms (id, year, term, name, is_current, start_date, end_date, updated_at) VALUES (?,?,?,?,?,?,?,0)",
    id, year, term, name, current ? 1 : 0, start, end);
}

/** 1..n as student specs */
const seqSpecs = (n) => Array.from({ length: n }, (_, i) => ({ number: i + 1 }));

/**
 * A class with its children. `specs` = [{ number, status?, first?, last?, nickname?, qr?, tag? }] in the order the ids
 * stu_<key>_<index> are numbered. Returns { id, key, name, students: [{ id, number }] } — students = the ACTIVE ones.
 */
function addClass(ctx, c, specs = []) {
  put(ctx, "INSERT OR REPLACE INTO classes (id, name, grade, sort, archived, year, updated_at) VALUES (?,?,?,?,?,?,0)",
    c.id, c.name, c.grade ?? c.name.split("/")[0], c.sort, c.archived ? 1 : 0, c.year ?? 2569);
  const cls = { ...c, students: [] };
  specs.forEach((s, i) => {
    const n = ++ctx.seq;
    const id = `stu_${c.key}_${i + 1}`;
    const status = s.status ?? "active";
    const tag = s.tag ?? "";
    put(ctx, "INSERT OR REPLACE INTO students (id, code, qr_token, prefix, first_name, last_name, nickname, class_id, number, status, left_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)",
      id, String(30000 + n), s.qr ?? "Q-F" + crockford(n),
      (s.number ?? i + 1) % 2 ? "ด.ช." : "ด.ญ.", s.first ?? `สมมติ${s.number}${tag}`, s.last ?? `ทดลอง${c.key.replace(/^[a-z]+/, "")}`,
      s.nickname ?? `น้อง${s.number}${tag}`, c.id, s.number ?? null, status, s.left_at ?? null);
    if (status === "active") cls.students.push({ id, number: s.number });
  });
  return cls;
}

/** Who did what on one piece of work in one class. See the rule keys in addWork. */
function decide(students, rule) {
  const sorted = [...students].sort((a, b) => a.number - b.number);
  const decision = new Map();
  const excused = new Set(rule.excused ?? []);
  const live = [];
  for (const s of sorted) (excused.has(s.number) ? decision.set(s.id, "excused") : live.push(s));
  const none = new Set();
  if (rule.none) {
    for (const s of live) if (rule.none.includes(s.number)) none.add(s.id);
    if (none.size < rule.none.length) throw new Error("fixture rule names a child number that does not exist: " + rule.none.join(","));
  } else if (rule.noneCount) {
    for (const s of live.slice(live.length - rule.noneCount)) none.add(s.id);
  }
  const sent = live.filter((s) => !none.has(s.id));
  const awaiting = rule.awaiting ?? 0, late = rule.late ?? 0;
  if (awaiting + late > sent.length) throw new Error("fixture rule has more awaiting+late than children who handed in");
  sent.forEach((s, i) => decision.set(s.id, i < awaiting ? "awaiting" : i < awaiting + late ? "late" : "scored"));
  return { sorted, decision };
}

/**
 * One piece of work, linked to `classes` (in this order), with every child's state set from a rule per class:
 *   none: [numbers] | noneCount: k (the last k) — not handed in   excused: [numbers]
 *   awaiting: k — the first k who handed in have no score yet     late: k — the next k are scored with late = 1
 *   everyone else handed in on time and is scored.
 */
function addWork(ctx, w) {
  const T = ctx.T;
  const assigned = w.assigned ?? dayAdd(T, -10);
  put(ctx, "INSERT OR REPLACE INTO assignments (id, term_id, subject_id, type_id, title, unit, full_score, assigned_date, due_date, note, publish_scores, status, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL,?,?,?,NULL,1,?,?,?,NULL)",
    w.id, w.termId ?? TERM.cur, w.subject ?? "sub_math", w.type ?? "wt_worksheet", w.title, w.full ?? 10, assigned, w.due ?? null, w.status ?? "open",
    noonOf(assigned), noonOf(assigned));
  const onTime = noonOf(w.due ? dayAdd(w.due < T ? w.due : T, -1) : dayAdd(T, -1));
  const lateAt = noonOf(w.due ? (dayAdd(w.due, 1) < T ? dayAdd(w.due, 1) : T) : dayAdd(T, -1));
  for (const { cls, ...rule } of w.classes) {
    put(ctx, "INSERT OR REPLACE INTO assignment_classes (assignment_id, class_id) VALUES (?,?)", w.id, cls.id);
    const { sorted, decision } = decide(cls.students, rule);
    for (const s of sorted) {
      const d = decision.get(s.id);
      if (!d) continue; // not handed in
      const at = d === "late" ? lateAt : onTime;
      const score = d === "excused" || d === "awaiting" ? null : Math.round((w.full ?? 10) * (0.6 + 0.4 * rndAt(++ctx.seq)));
      put(ctx, "INSERT OR REPLACE INTO submissions (assignment_id, student_id, status, score, late, submitted_at, method, updated_at, event_at) VALUES (?,?,?,?,?,?,?,?,?)",
        w.id, s.id, d === "excused" ? "excused" : "submitted", score, d === "late" ? 1 : 0, d === "excused" ? null : at,
        d === "excused" ? "grid" : w.method ?? "grid", at, at);
    }
  }
}

/** Today's roll call (daily, no subject / period) for a class; children are marked in number order: present, late, leave, sick, absent. */
function addAttendance(ctx, cls, c) {
  const order = ["present", "late", "leave", "sick", "absent"];
  const sorted = [...cls.students].sort((a, b) => a.number - b.number);
  const sid = `att_${cls.key}`;
  const at = noonOf(ctx.T) - 4 * 3600_000; // 08:00
  put(ctx, "INSERT OR REPLACE INTO attendance_sessions (id, date, class_id, subject_id, period, updated_at) VALUES (?,?,?,NULL,NULL,?)", sid, ctx.T, cls.id, at);
  let i = 0;
  for (const status of order) {
    for (let k = 0; k < (c[status] ?? 0); k++, i++) {
      if (!sorted[i]) throw new Error(`fixture attendance for ${cls.name} marks more children than the class has`);
      put(ctx, "INSERT OR REPLACE INTO attendance (session_id, student_id, status, time, method, device_id, updated_at) VALUES (?,?,?,?,'grid',NULL,?)", sid, sorted[i].id, status, at, at);
    }
  }
}

function addSubjects(ctx) {
  put(ctx, "INSERT OR REPLACE INTO subjects (id, code, name, color, sort, archived, updated_at) VALUES ('sub_sci','ว16101','วิทยาศาสตร์','blue',10,0,0), ('sub_math','ค16101','คณิตศาสตร์','magenta',20,0,0)");
}

function addCurrentTerm(ctx) {
  addTerm(ctx, { id: TERM.cur, year: 2569, term: 2, name: "ภาคเรียนที่ 2/2569", current: true, start: dayAdd(ctx.T, -30), end: dayAdd(ctx.T, 120) });
}

/** F-H8 old year: 2568 with its own (archived) rooms and a closed term 2/2568. Never touches this year's numbers. */
function addOldYear(ctx) {
  addTerm(ctx, { id: TERM.old, year: 2568, term: 2, name: "ภาคเรียนที่ 2/2568", start: dayAdd(ctx.T, -380), end: dayAdd(ctx.T, -200) });
  const a = addClass(ctx, { id: CLS.old51, key: "o51", name: "ป.5/1", sort: 10, year: 2568, archived: 1 }, seqSpecs(4).map((s) => ({ ...s, status: "finished" })));
  const b = addClass(ctx, { id: CLS.old52, key: "o52", name: "ป.5/2", sort: 20, year: 2568, archived: 1 }, seqSpecs(4).map((s) => ({ ...s, status: "finished" })));
  // finished children are not "active": hand them to the rule by hand (everything handed in and scored: no effect on any count)
  const kids = (cls) => ["1", "2", "3", "4"].map((n) => ({ id: `stu_${cls.key}_${n}`, number: Number(n) }));
  a.students = kids(a); b.students = kids(b);
  addWork(ctx, { id: "asg_old_1", termId: TERM.old, title: "ใบงานปีก่อน 1", due: dayAdd(ctx.T, -300), assigned: dayAdd(ctx.T, -310), status: "closed", classes: [{ cls: a }, { cls: b }] });
  addWork(ctx, { id: "asg_old_2", termId: TERM.old, title: "แบบฝึกหัดปีก่อน 2", due: dayAdd(ctx.T, -250), assigned: dayAdd(ctx.T, -260), status: "closed", classes: [{ cls: a }, { cls: b }] });
}

/** F-H8 previous term of this year: 1/2569 with P1, P2 (awaiting 3, missing 4 across the old rooms). */
function addPrevTerm(ctx, g61, g62) {
  addTerm(ctx, { id: TERM.prev, year: 2569, term: 1, name: "ภาคเรียนที่ 1/2569", start: dayAdd(ctx.T, -190), end: dayAdd(ctx.T, -31) });
  addWork(ctx, { id: "asg_h_p1", termId: TERM.prev, title: "แบบฝึกหัดบทที่ 1", type: "wt_exercise", due: dayAdd(ctx.T, -60), assigned: dayAdd(ctx.T, -100),
    classes: [{ cls: g61, none: [31, 32], awaiting: 2 }] });
  addWork(ctx, { id: "asg_h_p2", termId: TERM.prev, title: "ใบงานบทที่ 1", due: dayAdd(ctx.T, -45), assigned: dayAdd(ctx.T, -90),
    classes: [{ cls: g62, none: [29, 30], awaiting: 1 }] });
}

const ATT_61 = { present: 28, late: 2, leave: 1, sick: 1 };
const ATT_62 = { present: 26, late: 1, leave: 1, absent: 2 };

/** F-H1 works (BR-01/03/04/05/06 examples). `clear` = the F-H4 variant: nothing waiting, nothing late, nothing to grade. */
function homeWorks(ctx, g61, g62, g51, clear = false) {
  const T = ctx.T;
  const w = (id, title, type, full, due, assigned, classes) => addWork(ctx, { id, title, type, full, due, assigned, classes });
  w("asg_h_a1", "ใบงานเศษส่วน", "wt_worksheet", 10, T, dayAdd(T, -5), g61 && g62 ? [{ cls: g61, noneCount: clear ? 0 : 5 }, { cls: g62, noneCount: clear ? 0 : 9 }] : [{ cls: g61, noneCount: 5 }]);
  if (g51) w("asg_h_a2", "การบ้านทศนิยม", "wt_homework", 10, dayAdd(T, 1), dayAdd(T, -2), [{ cls: g51, noneCount: 12, awaiting: clear ? 0 : 4 }]);
  // O1 is 7 days overdue on purpose: it meets the old "forgotten work" rule (shouldClose, >= 7 days) so its close button shows (AC-20)
  w("asg_h_o1", "แบบฝึกหัดร้อยละ", "wt_exercise", 10, dayAdd(T, -7), dayAdd(T, -20),
    g62 ? [{ cls: g61, none: clear ? [] : [1, 2, 3, 4], awaiting: clear ? 0 : 8 }, { cls: g62, none: clear ? [] : [1, 2, 3, 4, 5, 6] }] : [{ cls: g61, none: [1, 2, 3, 4], awaiting: 8 }]);
  if (g62) {
    w("asg_h_o2", "ใบงานอัตราส่วน", "wt_worksheet", 10, dayAdd(T, -3), dayAdd(T, -14),
      [{ cls: g61, none: clear ? [] : [1, 2, 3], awaiting: clear ? 0 : 12 }, { cls: g62, none: clear ? [] : [1, 2, 7, 8], late: 3 }]);
  }
  if (g51) w("asg_h_o3", "สอบย่อยบทที่ 3", "wt_quiz", 20, dayAdd(T, -2), dayAdd(T, -9), [{ cls: g51, none: clear ? [] : [1, 2, 3, 4, 5], awaiting: clear ? 0 : 6 }]);
}

function addManyRooms(ctx) {
  const T = ctx.T;
  const rooms = [];
  for (let i = 1; i <= 8; i++) {
    const specs = seqSpecs(30);
    if (i === 1) specs[0] = { number: 1, first: "ปภาวรินทร์", last: "ศรีสุวรรณรัตนา", nickname: "ข้าวหอม🌾" };
    rooms.push(addClass(ctx, { id: `cls_m${i}`, key: `m${i}`, name: `ห้องพิเศษวิทยาศาสตร์ภาษา${i}`, grade: "ป.6", sort: i * 10 }, specs));
  }
  const at = (k) => rooms[k % 8];
  for (let j = 0; j < 30; j++) {
    const id = `asg_m_${j + 1}`, title = `งานทดสอบข้อความยาวหลายห้อง ${j + 1}`;
    if (j < 3) addWork(ctx, { id, title, due: T, classes: [{ cls: at(j), noneCount: 10 }, { cls: at(j + 1), noneCount: 10 }] });
    else if (j < 10) addWork(ctx, { id, title, due: dayAdd(T, -(j - 1)), classes: [{ cls: rooms[0], none: [1, j + 1] }, { cls: at(((j - 3) % 7) + 1), none: [j + 1] }] });
    else if (j < 15) addWork(ctx, { id, title, due: dayAdd(T, 2), classes: [{ cls: at(j), awaiting: 5, noneCount: 6 }, { cls: at(j + 1), awaiting: 5, noneCount: 6 }] });
    else addWork(ctx, { id, title, due: dayAdd(T, 2 + (j - 15)), classes: [{ cls: at(j), noneCount: 8 }, { cls: at(j + 3), noneCount: 8 }] });
  }
}

/** Fill the database for one data set. Returns what the self-check needs. */
/**
 * F-T1 / F-T4: the reference week as 14 periods of term 2/2569 (9 teaching + 5 activity), the same 14 in term 1/2569, and 6 in the
 * closed term 2/2568 (read-only year). Synthetic: no person's name. Slot = [weekday, period, kind, classKey|null, subjectId|null, label|null].
 */
const TT_WEEK = [
  [1, 2, "class", "g62", "sub_math"], [1, 5, "class", "g64", "sub_music"], [1, 7, "activity", null, null, "PLC กลุ่มสาระ"],
  [2, 2, "class", "g61", "sub_math"], [2, 6, "class", "g62", "sub_math"],
  [3, 2, "class", "g64", "sub_math"], [3, 4, "class", "g63", "sub_math"],
  [4, 2, "class", "g63", "sub_math"], [4, 6, "activity", null, null, "ลูกเสือ"],
  [5, 3, "class", "g64", "sub_math"], [5, 4, "class", "g61", "sub_math"],
  [5, 5, "activity", null, null, "ชุมนุม"], [5, 6, "activity", null, null, "สวดมนต์"], [5, 7, "activity", null, null, "PLC สายชั้น"],
];
const TT_OLD = [
  [1, 1, "class", "o51", "sub_math"], [1, 3, "class", "o52", "sub_math"], [2, 2, "class", "o51", "sub_math"],
  [3, 4, "class", "o52", "sub_math"], [4, 5, "activity", null, null, "ลูกเสือ"], [5, 6, "activity", null, null, "สวดมนต์"],
];
function addTimetableSlots(ctx, termId, rows, classIds) {
  for (const [wd, pd, kind, key, sub, label] of rows) {
    put(ctx, "INSERT INTO timetable_slots (term_id, weekday, period, kind, class_id, subject_id, label, updated_at) VALUES (?,?,?,?,?,?,?,0)",
      termId, wd, pd, kind, key ? classIds[key] : null, sub, label ?? null);
  }
  put(ctx, "UPDATE terms SET timetable_rev = 7 WHERE id = ?", termId); // rev 7 as in AC-52
}
// ---- timetable sets (selected with --tt-set=<name> / startFixtureServer({ dataset: "timetable", ttSet })) --------------
// `want` = rows the self-check reads back: termId -> [slots, teaching, activity].
const { serializeFrame, periodTimesOf } = require(path.join(root, "shared/timetable.ts"));
const hourAfter = (s) => `${String(Number(s.slice(0, 2)) + 1).padStart(2, "0")}:${s.slice(3)}`;
const mkPeriods = (starts) => starts.map((s) => ({ start: s, end: hourAfter(s) }));
const FRAME_8 = { // F-T2: 7 days, 8 periods of 60 min from 08:30, lunch after period 3
  periods: mkPeriods(["08:30", "09:30", "10:30", "12:30", "13:30", "14:30", "15:30", "16:30"]),
  breaks: [{ name: "พักกลางวัน", start: "11:30", end: "12:30" }], days: [1, 2, 3, 4, 5, 6, 7],
};
const FRAME_T8 = { // F-T8 (a): 8 periods, a morning break, school days Mon-Sat
  periods: mkPeriods(["08:00", "09:00", "10:10", "11:10", "13:00", "14:00", "15:00", "16:00"]),
  breaks: [{ name: "พักเช้า", start: "10:00", end: "10:10" }, { name: "พักกลางวัน", start: "12:10", end: "13:00" }], days: [1, 2, 3, 4, 5, 6],
};
/** F-T2 longest activity label: exactly 40 UTF-16 units (LABEL_MAX counts .length), ends with the emoji pair */
const LONG_LABEL = (() => {
  const tail = "🏕️✅"; let s = "";
  for (const ch of "ประชุมกลุ่มสาระการเรียนรู้ภาษาไทยและคณิตศาสตร์") if ((s + ch).length <= 40 - tail.length) s += ch;
  while (s.length < 40 - tail.length) s += "ๆ";
  return s + tail;
})();
const ACCENTS = { // F-T9: the `accent` setting exactly as stored
  "t9-blue": { accent: "blue" },
  "t9-warm": { accent: '{"v":1,"skin":"warm","layout":"b"}' },
  "t9-c": { accent: '{"v":1,"skin":"pro","layout":"b","timetable":"c"}' },
  "t9-z": { accent: '{"v":1,"skin":"pro","layout":"b","timetable":"z"}' },
  "t9-bad": { accent: "{{" },
};
const NAMES = { // F-T9 / TC-065 (a)..(f)
  "t9-names-a": { teacher_name: "ครูทดสอบ", school_name: "โรงเรียนบ้านตัวอย่าง" },
  "t9-names-b": { teacher_name: "ครูทดสอบ", school_name: "" },
  "t9-names-c": { teacher_name: "", school_name: "โรงเรียนบ้านตัวอย่าง" },
  "t9-names-d": { teacher_name: "   ", school_name: "   " },
  "t9-names-e": { teacher_name: "  ครูทดสอบ ", school_name: "  โรงเรียนบ้านตัวอย่าง " },
  "t9-names-f": { teacher_name: "ครูทดสอบ", school_name: "โรงเรียนตัวอย่าง".padEnd(80, "ๆ") },
};
const W14 = [14, 9, 5], WOLD = [6, 4, 2];
const TT_SETS = {
  t1: { text: "F-T1 + F-T4 (default): 2/2569 and 1/2569 with 14 each, closed 2/2568 with 6", want: { "t2569-2": W14, "t2569-1": W14, "t2568-2": WOLD } },
  "t1-archr": { text: "F-T1-archR (= F-T5): t1 + room ป.6/3 archived", want: { "t2569-2": W14, "t2569-1": W14, "t2568-2": WOLD } },
  "t1-archs": { text: "F-T1-archS (= F-T5): t1 + subject คณิตศาสตร์ archived (8 faded slots)", want: { "t2569-2": W14, "t2569-1": W14, "t2568-2": WOLD } },
  t0: { text: "F-T0: current term has no slots", want: { "t2569-2": [0, 0, 0] } },
  t2: { text: "F-T2 stress: 7 days x 8 periods = 56 slots, 5 rooms, 40-unit label", want: { "t2569-2": [56, 28, 28] } },
  t3: { text: "F-T3: one slot (พ ค2 ป.6/4 คณิต)", want: { "t2569-2": [1, 1, 0] } },
  t4: { text: "F-T4: 1/2569 has 14, 2/2569 empty, 2/2568 has 6", want: { "t2569-2": [0, 0, 0], "t2569-1": W14, "t2568-2": WOLD } },
  t4b: { text: "F-T4 variant: as t4 but 2/2569 already has 3 slots (TC-039)", want: { "t2569-2": [3, 2, 1], "t2569-1": W14, "t2568-2": WOLD } },
  t6: { text: "F-T6 cross-year: current term 1/2570 (empty), source 2/2569 (14); 2570 rooms 'ป.6/1 ' ป.6/2 ป.6/3", want: { "t2569-2": W14, "t2570-1": [0, 0, 0] } },
  t7: { text: "F-T7: t1 + legacy period_times {1:08:00,2:09:00}, no period_frame", want: { "t2569-2": W14, "t2569-1": W14, "t2568-2": WOLD } },
  t8: { text: "F-T8 (a): t1 + saved frame (8 periods, morning break, Mon-Sat); (b) old-format file at GET /__fixture/backup-file?variant=old", want: { "t2569-2": W14, "t2569-1": W14, "t2568-2": WOLD } },
  t10a: { text: "F-T10 (a): no terms and no rooms at all", want: {} },
  t10b: { text: "F-T10 (b): terms exist, this year has no rooms", want: {} },
  t11: { text: "F-T11: t1 + period_times empty, no period_frame", want: { "t2569-2": W14, "t2569-1": W14, "t2568-2": WOLD } },
  twoterm: { text: "F4 delete-confirm: 2/2569 (14) and 1/2569 (15) both have period-7 slots; no closed year", want: { "t2569-2": W14, "t2569-1": [15, 9, 6] } },
  ...Object.fromEntries(Object.keys({ ...ACCENTS, ...NAMES }).map((k) => [k, { text: "F-T9 settings variant on t1", want: { "t2569-2": W14, "t2569-1": W14, "t2568-2": WOLD } }])),
};
const BACKUP_FILE_TABLES = ["settings", "terms", "classes", "subjects", "work_types", "students", "revoked_qr_tokens", "assignments", "assignment_classes", "scan_sessions", "submissions", "attendance_sessions", "attendance", "timetable_slots"];
const TT_SET_NAMES = Object.keys(TT_SETS);
const TT_ALIASES = { "t1-archR": "t1-archr", "t1-archS": "t1-archs", t5: "t1-archr", "t5-archr": "t1-archr", "t5-archs": "t1-archs", t9: "t9-warm" };
const ttKey = (name) => TT_ALIASES[name] ?? name;

function seedTimetable(ctx, setName = "t1") {
  const key = ttKey(setName);
  if (!TT_SETS[key]) throw new Error(`unknown tt-set "${setName}" — one of: ${TT_SET_NAMES.join(", ")}`);
  const extra = {}, unset = []; // settings written after the base ones / removed
  const t = (id, term, name, current, start, end) => addTerm(ctx, { id, year: term.year, term: term.t, name, current, start, end });
  const subs = (archivedMath) => put(ctx, `INSERT OR REPLACE INTO subjects (id, code, name, color, sort, archived, updated_at) VALUES ('sub_math','ค16101','คณิตศาสตร์','magenta',20,${archivedMath ? 1 : 0},0), ('sub_music','ศ16101','ดนตรี','blue',30,0,0)`);
  const ids = {};
  const rooms = (list, year, archived) => list.forEach(([k, name, sort]) => {
    ids[k] = `cls_tt_${k}`;
    addClass(ctx, { id: ids[k], key: "tt" + k, name, sort, year, archived: archived ? 1 : 0 }, seqSpecs(5));
  });
  const R69 = [["g61", "ป.6/1", 10], ["g62", "ป.6/2", 20], ["g63", "ป.6/3", 30], ["g64", "ป.6/4", 40]];
  const oldRooms = () => [["o51", "ป.5/1", 10], ["o52", "ป.5/2", 20]].forEach(([k, name, sort]) => {
    ids[k] = `cls_tt_${k}`;
    addClass(ctx, { id: ids[k], key: "tt" + k, name, sort, year: 2568, archived: true }, seqSpecs(3).map((s) => ({ ...s, status: "finished" })));
  });
  const terms3 = () => {
    t("t2569-2", { year: 2569, t: 2 }, "ภาคเรียนที่ 2/2569", true, "2026-10-26", "2027-03-12");
    t("t2569-1", { year: 2569, t: 1 }, "ภาคเรียนที่ 1/2569", false, "2026-05-16", "2026-10-10");
    t("t2568-2", { year: 2568, t: 2 }, "ภาคเรียนที่ 2/2568", false, "2025-11-03", "2026-03-13");
  };
  /** F-T1's two older home rows (TC-054): only ป.6/4 has no roll call today, and one piece of work is due today */
  const homeRows = () => {
    const cls = (k, name) => ({ id: ids[k], key: "tt" + k, name, students: Array.from({ length: 5 }, (_, i) => ({ id: `stu_tt${k}_${i + 1}`, number: i + 1 })) });
    ["g61", "g62", "g63"].forEach((k, i) => addAttendance(ctx, cls(k, R69[i][1]), { present: 5 }));
    addWork(ctx, { id: "asg_tt_today", termId: "t2569-2", title: "ใบงานทดสอบ ครบกำหนดวันนี้", due: ctx.T, classes: [{ cls: cls("g64", "ป.6/4"), none: [1, 2] }] });
  };
  const t1 = (o = {}) => {
    subs(o.archS); terms3(); rooms(R69, 2569, false); oldRooms();
    if (o.archR) put(ctx, "UPDATE classes SET archived = 1 WHERE id = ?", ids.g63);
    addTimetableSlots(ctx, "t2569-2", TT_WEEK, ids); addTimetableSlots(ctx, "t2569-1", TT_WEEK, ids); addTimetableSlots(ctx, "t2568-2", TT_OLD, ids);
    homeRows();
  };
  switch (key) {
    case "t1": t1(); break;
    case "t1-archr": t1({ archR: true }); break;
    case "t1-archs": t1({ archS: true }); break;
    case "t0": subs(); terms3(); rooms(R69, 2569); oldRooms(); homeRows(); break;
    case "t2": {
      subs(); terms3(); rooms([...R69, ["g65", "ห้องเรียนพิเศษ ป.6/5", 50]], 2569); oldRooms();
      const rows = []; let n = 0, c = 0;
      for (let wd = 1; wd <= 7; wd++) for (let p = 1; p <= 8; p++) {
        if ((wd + p) % 2) { c++; rows.push([wd, p, "class", ["g61", "g62", "g63", "g64", "g65"][c % 5], c % 3 ? "sub_math" : "sub_music"]); }
        else rows.push([wd, p, "activity", null, null, ++n === 1 ? LONG_LABEL : `กิจกรรม ${n}`]);
      }
      addTimetableSlots(ctx, "t2569-2", rows, ids);
      extra.period_frame = serializeFrame(FRAME_8, 1); extra.period_times = periodTimesOf(FRAME_8);
      break;
    }
    case "t3": subs(); terms3(); rooms(R69, 2569); oldRooms(); addTimetableSlots(ctx, "t2569-2", [[3, 2, "class", "g64", "sub_math"]], ids); homeRows(); break;
    case "t4": case "t4b":
      subs(); terms3(); rooms(R69, 2569); oldRooms();
      addTimetableSlots(ctx, "t2569-1", TT_WEEK, ids); addTimetableSlots(ctx, "t2568-2", TT_OLD, ids);
      if (key === "t4b") addTimetableSlots(ctx, "t2569-2", [[1, 2, "class", "g62", "sub_math"], [3, 2, "class", "g64", "sub_math"], [5, 6, "activity", null, null, "สวดมนต์"]], ids);
      break;
    case "t6":
      subs();
      t("t2570-1", { year: 2570, t: 1 }, "ภาคเรียนที่ 1/2570", true, "2027-05-17", "2027-10-10");
      t("t2569-2", { year: 2569, t: 2 }, "ภาคเรียนที่ 2/2569", false, "2026-10-26", "2027-03-12");
      rooms(R69, 2569, true); // last year's rooms: archived, with the 14 slots
      rooms([["n61", "ป.6/1 ", 10], ["n62", "ป.6/2", 20], ["n63", "ป.6/3", 30]], 2570);
      addTimetableSlots(ctx, "t2569-2", TT_WEEK, ids);
      break;
    case "t7": t1(); extra.period_times = JSON.stringify({ 1: "08:00", 2: "09:00" }); unset.push("period_frame"); break;
    case "t11": t1(); extra.period_times = ""; unset.push("period_frame"); break;
    case "t8": t1(); extra.period_frame = serializeFrame(FRAME_T8, 3); extra.period_times = periodTimesOf(FRAME_T8); break;
    case "t10a": break;
    case "t10b": subs(); terms3(); oldRooms(); break;
    case "twoterm":
      subs();
      t("t2569-2", { year: 2569, t: 2 }, "ภาคเรียนที่ 2/2569", true, "2026-10-26", "2027-03-12");
      t("t2569-1", { year: 2569, t: 1 }, "ภาคเรียนที่ 1/2569", false, "2026-05-16", "2026-10-10");
      rooms(R69, 2569);
      addTimetableSlots(ctx, "t2569-2", TT_WEEK, ids); addTimetableSlots(ctx, "t2569-1", [...TT_WEEK, [3, 7, "activity", null, null, "ชมรม"]], ids);
      break;
    default: t1(); Object.assign(extra, ACCENTS[key] ?? NAMES[key] ?? {}); // F-T9
  }
  ctx.ttExtra = extra; ctx.ttUnset = unset;
}

/** names used by every timetable set (fixtures.md: "ครูทดสอบ" / "โรงเรียนบ้านตัวอย่าง") */
const TT_DEFAULT_SETTINGS = { teacher_name: "ครูทดสอบ", school_name: "โรงเรียนบ้านตัวอย่าง" };

function seedDataset(ctx, dataset, ttSet) {
  const T = ctx.T;
  if (dataset === "timetable") return seedTimetable(ctx, ttSet);
  if (SCAN_DATASETS.includes(dataset)) return seedScan(ctx, dataset);
  addSubjects(ctx);
  addCurrentTerm(ctx);
  const room = (id, key, name, sort, specs) => addClass(ctx, { id, key, name, sort }, specs);
  switch (dataset) {
    case "home": case "home-extra": case "home-clear": {
      const clear = dataset === "home-clear";
      const g61 = room(CLS.g61, "g61", "ป.6/1", 10, seqSpecs(32));
      const g62 = room(CLS.g62, "g62", "ป.6/2", 20, seqSpecs(30));
      const g51 = room(CLS.g51, "g51", "ป.5/1", 30, seqSpecs(28));
      homeWorks(ctx, g61, g62, g51, clear);
      addAttendance(ctx, g61, ATT_61);
      addAttendance(ctx, g62, ATT_62);
      if (clear) addAttendance(ctx, g51, { present: 28 });
      if (dataset === "home-extra") {
        const g41 = room(CLS.g41, "g41", "ป.4/1", 40, seqSpecs(10));
        room(CLS.g42, "g42", "ป.4/2", 50, []);
        addAttendance(ctx, g41, { present: 10 });
      }
      if (!clear) { addOldYear(ctx); addPrevTerm(ctx, g61, g62); }
      break;
    }
    case "home-one": {
      const g61 = room(CLS.g61, "g61", "ป.6/1", 10, seqSpecs(32));
      homeWorks(ctx, g61, null, null);
      addAttendance(ctx, g61, ATT_61);
      break;
    }
    case "home-extra-b": {
      const g61 = room(CLS.g61, "g61", "ป.6/1", 10, seqSpecs(32));
      room(CLS.g62, "g62", "ป.6/2", 20, seqSpecs(30));
      room(CLS.g63, "g63", "ป.6/3", 30, []);
      addAttendance(ctx, g61, ATT_61); // ป.6/1 fully checked · ป.6/2 not checked · ป.6/3 has no children
      break;
    }
    case "home-empty-year": addOldYear(ctx); break;
    case "home-no-students":
      room(CLS.g61, "g61", "ป.6/1", 10, []);
      room(CLS.g62, "g62", "ป.6/2", 20, []);
      break;
    case "home-many": addManyRooms(ctx); break;
    default: throw new Error("unknown data set " + dataset);
  }
}

const LONG_SCAN_TITLE = "ใบงานที่ 12 การสำรวจความหลากหลายทางชีวภาพในชุมชนรอบโรงเรียนฯ"; // 60 UTF-16 units (String.length), as AC-78 counts

/** F-S1 + F-S2 (+ F-S1b / F-S3 / F-S4 variants): rooms and 7 open pieces of work for the scan page. */
function seedScan(ctx, dataset) {
  const T = ctx.T;
  addSubjects(ctx);
  addCurrentTerm(ctx);
  addOldYear(ctx);
  // ป.6/1: 33 active (1-8, 10-34) + no. 9 moved out. ids stu_g61_<n> = the number, special children below.
  const specs61 = [];
  for (let n = 1; n <= 34; n++) {
    if (n === 9) specs61.push({ number: 9, status: "moved", left_at: dayAdd(T, -20) });
    else if (n === 2) specs61.push({ number: 2, qr: OLD_CARD_VALID });
    else if (n === 4) specs61.push({ number: 4, first: "ปภาวรินทร์", last: "ศรีสุวรรณรัตนา" });
    else if (n === 5) specs61.push({ number: 5, nickname: "ข้าวหอม🌾" });
    else specs61.push({ number: n });
  }
  const g61 = addClass(ctx, { id: CLS.g61, key: "g61", name: "ป.6/1", sort: 10 }, specs61);
  const g62 = addClass(ctx, { id: CLS.g62, key: "g62", name: "ป.6/2", sort: 20 }, seqSpecs(30));
  // ป.5/1: 28 children, two of them numbered 7
  const specs51 = [];
  for (let n = 1; n <= 27; n++) { specs51.push({ number: n }); if (n === 7) specs51.push({ number: 7, tag: "ข" }); }
  const g51 = addClass(ctx, { id: CLS.g51, key: "g51", name: "ป.5/1", sort: 30 }, specs51);
  const g64 = addClass(ctx, { id: CLS.g64, key: "g64", name: "ป.6/4", sort: 40 }, seqSpecs(40));
  const g65 = addClass(ctx, { id: CLS.g65, key: "g65", name: "ป.6/5", sort: 50 }, []);
  if (dataset === "scan-empty") return;

  const w = (id, title, subject, full, due, classes, assigned) =>
    addWork(ctx, { id, title, subject, type: /สอบ/.test(title) ? "wt_quiz" : /โครงงาน/.test(title) ? "wt_project" : /แบบฝึกหัด/.test(title) ? "wt_exercise" : "wt_worksheet", full, due, assigned: assigned ?? dayAdd(T, -6), method: "camera", classes });
  const s1g62 = dataset === "scan-all-62" ? { cls: g62 } : { cls: g62, noneCount: 30 };
  w("asg_s1", "ใบงานวิทย์ S1", "sub_sci", 20, T, [
    { cls: g61, none: [3, 7, 11, 15, 19], excused: [33, 34], awaiting: 4, late: 3 }, s1g62, { cls: g51, noneCount: 15 }]);
  w("asg_s2", "แบบฝึกหัดคณิต S2", "sub_math", 10, dayAdd(T, 1), [{ cls: g51, noneCount: 28 }, { cls: g65 }]);
  w("asg_s3", "ใบงานวิทย์ S3", "sub_sci", 10, dayAdd(T, 2), [{ cls: g61, excused: [7], noneCount: 32 }]);
  w("asg_s4", "สอบย่อยคณิต S4", "sub_math", 20, dayAdd(T, -2), [{ cls: g64, excused: [39, 40], none: [31, 32, 33, 34, 35, 36, 37, 38], awaiting: 5, late: 5 }], dayAdd(T, -9));
  w("asg_s5", "ใบงานวิทย์ S5", "sub_sci", 10, null, [{ cls: g61, noneCount: 33 }]);
  w("asg_s6", LONG_SCAN_TITLE, "sub_sci", 10, dayAdd(T, 10), [{ cls: g64, noneCount: 40 }]);
  w("asg_s7", "โครงงานคณิต S7", "sub_math", 20, dayAdd(T, 20), [{ cls: g62, noneCount: 30 }]);
  if (dataset === "scan-noroom") {
    // F-S3: the only room of this work has been archived ("no room in use")
    const g66 = addClass(ctx, { id: CLS.g66, key: "g66", name: "ป.6/6", sort: 60, archived: 1 }, seqSpecs(5));
    w("asg_s8", "ใบงานวิทย์ S8", "sub_sci", 10, dayAdd(T, 3), [{ cls: g66, noneCount: 5 }]);
  }
}

// ---- X-5: self-check. The numbers below are the ones in fixtures.md §3 / §4, read back through EP-06 -------------

/** What EP-06 must answer, per data set. Returns a list of "label: expected … got …" lines (empty = all good). */
function dashboardProblems(dataset, d, T) {
  const bad = [];
  const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${label}: expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`); };
  const asg = (id) => [...d.openAssignments, ...d.gradingAssignments].find((a) => a.assignment.id === id);
  const room = (classId) => {
    const r = { works: 0, submitted: 0, awaiting: 0, missing: 0, late: 0 };
    for (const a of d.openAssignments) for (const p of a.perClass) if (p.classId === classId) {
      r.works++; r.submitted += p.submitted; r.awaiting += p.awaiting; r.missing += p.missing; r.late += p.late;
    }
    for (const a of d.gradingAssignments) for (const p of a.perClass) if (p.classId === classId) r.awaiting += p.awaiting;
    r.rate = percentOf(r.submitted, r.submitted + r.missing);
    return r;
  };
  const att = (classId) => d.attendanceToday.find((a) => a.classId === classId);
  const attPct = (classId) => { const a = att(classId); return a ? attendancePercent(a) : undefined; };
  const headline = () => {
    const rows = d.attendanceToday.filter((a) => a.total > 0);
    if (rows.length === 0) return "เช็คชื่อประจำวัน";
    const prog = rows.map((a) => attendanceProgress(a.marked, a.total));
    const complete = prog.filter((p) => p === "complete").length;
    if (prog.every((p) => p === "none")) return `ยังไม่ได้เช็คชื่อ ${rows.length} ห้อง`;
    return complete === rows.length ? "วันนี้เช็คครบทุกห้อง" : `ยังเหลือ ${rows.length - complete} ห้อง`;
  };
  const dueSizes = (assignmentId) => d.dueSoon.filter((x) => x.assignmentId === assignmentId).map((x) => [x.classId, x.studentIds.length]);
  eq("date", d.date, T);

  const h1 = (extra) => {
    eq("awaitingCount", d.awaitingCount, 30);
    eq("missingCount", d.missingCount, 22);
    eq("followUp.length", d.followUp.length, 8);
    eq("followUp with 2 missing", d.followUp.filter((f) => f.missing === 2).length, 5);
    eq("followUp with 1 missing", d.followUp.filter((f) => f.missing === 1).length, 3);
    eq("open works", d.openAssignments.length, 5);
    eq("grading works", d.gradingAssignments.length, 0);
    eq("A1 due_date", asg("asg_h_a1")?.assignment.due_date, T);
    eq("A2 due_date", asg("asg_h_a2")?.assignment.due_date, dayAdd(T, 1));
    eq("O1 due_date (7 days overdue)", asg("asg_h_o1")?.assignment.due_date, dayAdd(T, -7));
    eq("O2 due_date", asg("asg_h_o2")?.assignment.due_date, dayAdd(T, -3));
    eq("O3 due_date", asg("asg_h_o3")?.assignment.due_date, dayAdd(T, -2));
    eq("dueSoon today (A1)", dueSizes("asg_h_a1"), [[CLS.g61, 5], [CLS.g62, 9]]);
    eq("dueSoon tomorrow (A2)", dueSizes("asg_h_a2"), [[CLS.g51, 12]]);
    eq("dueSoon rows", d.dueSoon.length, 3);
    eq("ป.6/1 progress", room(CLS.g61), { works: 3, submitted: 84, awaiting: 20, missing: 7, late: 0, rate: 92 });
    eq("ป.6/2 progress", room(CLS.g62), { works: 3, submitted: 71, awaiting: 0, missing: 10, late: 3, rate: 88 });
    eq("ป.5/1 progress", room(CLS.g51), { works: 2, submitted: 39, awaiting: 10, missing: 5, late: 0, rate: 89 });
    const a61 = att(CLS.g61), a62 = att(CLS.g62), a51 = att(CLS.g51);
    eq("ป.6/1 attendance", a61 && [a61.present, a61.late, a61.leave, a61.sick, a61.absent, a61.marked, a61.total], [28, 2, 1, 1, 0, 32, 32]);
    eq("ป.6/2 attendance", a62 && [a62.present, a62.late, a62.leave, a62.sick, a62.absent, a62.marked, a62.total], [26, 1, 1, 0, 2, 30, 30]);
    eq("ป.5/1 attendance", a51 && [a51.marked, a51.total], [0, 28]);
    eq("attendance % ป.6/1 · ป.6/2 · ป.5/1", [attPct(CLS.g61), attPct(CLS.g62), attPct(CLS.g51)], [94, 90, null]);
    if (!extra) eq("attendance % all checked rooms", (() => { const r = [att(CLS.g61), att(CLS.g62)].filter((a) => a && a.marked > 0); return percentOf(r.reduce((n, a) => n + a.present + a.late, 0), r.reduce((n, a) => n + a.marked, 0)); })(), 92);
    eq("attendance headline", headline(), "ยังเหลือ 1 ห้อง");
  };

  switch (dataset) {
    case "home": h1(false); break;
    case "home-extra": {
      h1(true);
      const a41 = att(CLS.g41), a42 = att(CLS.g42);
      eq("ป.4/1 attendance", a41 && [a41.present, a41.marked, a41.total], [10, 10, 10]);
      eq("ป.4/2 children", a42?.total, 0);
      eq("ป.4/1 progress (no work)", room(CLS.g41), { works: 0, submitted: 0, awaiting: 0, missing: 0, late: 0, rate: null });
      break;
    }
    case "home-clear":
      eq("awaitingCount", d.awaitingCount, 0);
      eq("missingCount", d.missingCount, 0);
      eq("followUp", d.followUp, []);
      eq("dueSoon rows", d.dueSoon.length, 1);
      eq("dueSoon tomorrow (A2)", dueSizes("asg_h_a2"), [[CLS.g51, 12]]);
      eq("every room fully checked", d.attendanceToday.every((a) => a.marked === a.total && a.total > 0), true);
      eq("attendance headline", headline(), "วันนี้เช็คครบทุกห้อง");
      break;
    case "home-one":
      eq("awaitingCount", d.awaitingCount, 8);
      eq("missingCount", d.missingCount, 4);
      eq("rooms", d.attendanceToday.map((a) => a.classId), [CLS.g61]);
      eq("dueSoon today (A1)", dueSizes("asg_h_a1"), [[CLS.g61, 5]]);
      eq("ป.6/1 progress", room(CLS.g61), { works: 2, submitted: 28 + 27, awaiting: 8, missing: 4, late: 0, rate: 93 });
      break;
    case "home-extra-b": {
      eq("works", d.openAssignments.length, 0);
      eq("rooms", d.attendanceToday.map((a) => [a.classId, a.marked, a.total]), [[CLS.g61, 32, 32], [CLS.g62, 0, 30], [CLS.g63, 0, 0]]);
      eq("attendance headline", headline(), "ยังเหลือ 1 ห้อง");
      break;
    }
    case "home-empty-year":
      eq("rooms this year", d.attendanceToday.length, 0);
      eq("works", d.openAssignments.length + d.gradingAssignments.length, 0);
      break;
    case "home-no-students":
      eq("rooms", d.attendanceToday.map((a) => [a.classId, a.total]), [[CLS.g61, 0], [CLS.g62, 0]]);
      eq("awaitingCount", d.awaitingCount, 0);
      break;
    case "home-many": {
      eq("rooms", d.attendanceToday.length, 8);
      eq("every room unchecked, 30 children", d.attendanceToday.every((a) => a.marked === 0 && a.total === 30), true);
      eq("open works", d.openAssignments.length, 30);
      eq("works due today", new Set(d.dueSoon.filter((x) => asg(x.assignmentId)?.assignment.due_date === T).map((x) => x.assignmentId)).size, 3);
      eq("awaitingCount > 0", d.awaitingCount > 0, true);
      eq("missingCount > 0", d.missingCount > 0, true);
      eq("followUp.length", d.followUp.length, 8);
      eq("followUp[0] = the long-named child", d.followUp[0]?.studentId, "stu_m1_1");
      break;
    }
    case "scan": case "scan-all-62": case "scan-noroom": case "scan-empty": {
      const per = (id, classId) => asg(id)?.perClass.find((p) => p.classId === classId);
      const pick = (p) => p && [p.total, p.submitted, p.awaiting, p.late, p.missing, p.excused];
      if (dataset === "scan-empty") {
        eq("open works", d.openAssignments.length, 0);
        eq("rooms in use", d.attendanceToday.map((a) => a.classId), [CLS.g61, CLS.g62, CLS.g51, CLS.g64, CLS.g65]);
        break;
      }
      // [total, submitted, awaiting, late, missing, excused]
      eq("S1 ป.6/1", pick(per("asg_s1", CLS.g61)), [33, 26, 4, 3, 0, 2]);
      eq("S1 ป.6/2", pick(per("asg_s1", CLS.g62)), dataset === "scan-all-62" ? [30, 30, 0, 0, 0, 0] : [30, 0, 0, 0, 0, 0]);
      eq("S1 ป.5/1", pick(per("asg_s1", CLS.g51)), [28, 13, 0, 0, 0, 0]);
      eq("S3 ป.6/1", pick(per("asg_s3", CLS.g61)), [33, 0, 0, 0, 0, 1]);
      eq("S4 ป.6/4", pick(per("asg_s4", CLS.g64)), [40, 30, 5, 5, 8, 2]);
      eq("S4 rate", (() => { const p = per("asg_s4", CLS.g64); return p && percentOf(p.submitted, p.total - p.excused); })(), 79);
      eq("S6 title length", asg("asg_s6")?.assignment.title.length, 60);
      eq("S5 due_date", asg("asg_s5")?.assignment.due_date, null);
      eq("S2 rooms", asg("asg_s2")?.assignment.class_ids, [CLS.g51, CLS.g65]);
      eq("S1 rooms (next-room order)", asg("asg_s1")?.assignment.class_ids, [CLS.g61, CLS.g62, CLS.g51]);
      eq("open works", d.openAssignments.length, dataset === "scan-noroom" ? 8 : 7);
      eq("awaitingCount", d.awaitingCount, 9);
      eq("missingCount", d.missingCount, 8);
      if (dataset === "scan-noroom") eq("S8 room is archived", d.attendanceToday.some((a) => a.classId === CLS.g66), false);
      break;
    }
    default: break;
  }
  return bad;
}

/** The EP-06 requests a data set is checked with: [{ query, check(payload) }]. */
function selfCheckPlan(dataset, T, termDate) {
  const q = (term) => `?term=${term}${termDate ? `&date=${T}` : ""}`;
  const plan = [{ label: `EP-06 ${dataset}`, query: q(TERM.cur), check: (d) => dashboardProblems(dataset, d, T) }];
  if (dataset === "home" || dataset === "home-extra") {
    // F-H8: the previous term shows its own work (awaiting 3 · missing 4), today's attendance is today's
    plan.push({
      label: "EP-06 previous term (F-H8)", query: q(TERM.prev),
      check: (d) => {
        const bad = [];
        if (d.awaitingCount !== 3) bad.push(`awaitingCount: expected 3 got ${d.awaitingCount}`);
        if (d.missingCount !== 4) bad.push(`missingCount: expected 4 got ${d.missingCount}`);
        if (d.openAssignments.length !== 2) bad.push(`open works: expected 2 got ${d.openAssignments.length}`);
        return bad;
      },
    });
  }
  return plan;
}

/** Settings a data set starts with, then the caller's overrides (X-4). `undefined` in `set` = leave the default; a key in `unset` is deleted. */
function startSettings(dataset, o, nowMs) {
  const set = {};
  if (HOME_DATASETS.includes(dataset) || SCAN_DATASETS.includes(dataset) || TIMETABLE_DATASETS.includes(dataset)) Object.assign(set, HOME_DEFAULTS);
  if (TIMETABLE_DATASETS.includes(dataset)) Object.assign(set, TT_DEFAULT_SETTINGS);
  Object.assign(set, o.ttExtra ?? {});
  if (o.teacherName !== undefined) set.teacher_name = o.teacherName;
  if (o.lateAfter !== undefined) set.late_after = o.lateAfter;
  const days = o.backupDaysAgo !== undefined ? o.backupDaysAgo : DEFAULT_BACKUP_DAYS[dataset] ?? (SCAN_DATASETS.includes(dataset) ? 1 : HOME_DATASETS.includes(dataset) ? 9 : undefined);
  if (days === null) set.last_backup_at = "";
  else if (days !== undefined) set.last_backup_at = String(nowMs - days * DAY_MS);
  Object.assign(set, o.settings ?? {});
  return set;
}

async function startFixtureServer({
  port = 5194,
  assetsDir = path.join(root, "dist/client/client"),
  headersFile = path.join(root, "public/_headers"),
  seed = true, // false: an empty school (only the migrations' defaults), for first-run checks
  layout = false, // true: gradebook14 + layout data sets (see addLayout)
  gradebook14 = false, // true: 14 pieces of work x 44 children for คณิตศาสตร์ in ป.6/1 (gradebook layout checks)
  dataset, // one of DATASETS (X-2). Default: "demo" (the old seed) or "empty" when seed is false
  today, // YYYY-MM-DD override of "today in Bangkok" (X-1) — for unit tests; the app itself always uses the real day
  teacherName, lateAfter, // X-4
  backupDaysAgo, // X-4: days since the last backup (number), or null = never
  settings: settingsOverride, // X-4: { key: value } written to the settings table after the data set (e.g. accent: "luxe")
  unsetSettings = [], // X-4: keys removed from the settings table
  ttSet = "t1", // --tt-set=<name> for dataset "timetable": see TT_SETS (F-T0 .. F-T11, twoterm)
  ttFail, // "500" | "timeout" (+ ":get" / ":put"): every matching /api/timetable* request fails (AC-43) until /__fixture/fault is cleared
  ttConflict = false, // true | "once": a PUT /api/timetable first gets overtaken by "another device" so the app answers 409 timetable_changed
  selfCheck = true, // X-5: leave on; only a test of the check itself turns it off
  afterSeed, // optional async (DB) => void: extra rows after the data set, before the self-check (also how the check itself is tested)
} = {}) {
  if (dataset === undefined) dataset = seed ? "demo" : "empty";
  if (!DATASETS.includes(dataset)) throw new Error(`unknown data set "${dataset}" — one of: ${DATASETS.join(", ")}`);
  if (dataset !== "demo" && (gradebook14 || layout)) throw new Error("--gb14 / --layout only go with the default data set");
  if (dataset === "empty") seed = false;
  if (dataset === "timetable" && !TT_SETS[ttKey(ttSet)]) throw new Error(`unknown tt-set "${ttSet}" — one of: ${TT_SET_NAMES.join(", ")}`);
  if (ttFail !== undefined && !/^(500|timeout)(:(get|put))?$/i.test(String(ttFail))) throw new Error(`ttFail must be 500 or timeout (optionally :get / :put), got "${ttFail}"`);
  if (ttSet !== "t1" && dataset !== "timetable") throw new Error("--tt-set only goes with --timetable");
  if (today !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(today) && new Date(today + "T00:00:00Z").toISOString().slice(0, 10) === today)) throw new Error(`today must be a real YYYY-MM-DD date, got "${today}"`);
  const T = today ?? bkkToday();
  const demo = dataset === "demo";
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("fixture"); } }',
    compatibilityDate: "2025-09-01", d1Databases: ["DB"], d1Persist: false, cf: false,
  }));
  const DB = await mf.getD1Database("DB");
  const latency = { ms: 0 };                 // per D1 round trip, settable at run time (setDbLatency)
  const stats = { count: 0, log: [] };       // D1 round trips since resetDbStats()
  const env = { DB, SETUP_CODE: "fixture-setup", SESSION_PEPPER: "fixture-pepper-not-secret" };
  const timedEnv = { ...env, DB: timedDb(DB, latency, stats) }; // what the app sees, from the browser
  const files = [
    ...fs.readdirSync(path.join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(root, "migrations", f)),
    ...(demo ? [path.join(root, "scripts/seed-demo.sql")] : []),
  ];
  const nowMs = Date.now();
  let app, cookie, info = { dataset, today: T }, ttExtra = {}, ttUnset = [];
  if (dataset === "timetable") info.ttSet = ttKey(ttSet);
  try {
    for (const file of files) {
      const sql = fs.readFileSync(file, "utf8").replace(/--[^\n]*/g, "");
      await DB.batch(sql.split(";").map((s) => s.trim()).filter(Boolean).map((s) => DB.prepare(s)));
    }
    if ((gradebook14 || layout) && demo) await addGradebook14(DB);
    if (layout && demo) await addLayout(DB);
    if (!demo && dataset !== "empty") {
      const ctx = newCtx(DB, T);
      seedDataset(ctx, dataset, ttSet);
      await flush(ctx);
      ttExtra = ctx.ttExtra ?? {}; ttUnset = ctx.ttUnset ?? [];
    }
    if (afterSeed) await afterSeed(DB);
    ({ app } = require(path.join(root, "worker/app.ts")));
    const setup = await app.request("/api/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupCode: "fixture-setup", email: EMAIL, password: PASSWORD, deviceId: "fixture", deviceName: "Fixture" }),
    }, env);
    if (setup.status !== 200) throw new Error("fixture setup failed: " + setup.status);
    cookie = (setup.headers.get("set-cookie") ?? "").split(";")[0];
    const asTeacher = (p, init = {}) => app.request(p, { ...init, headers: { Cookie: cookie, ...(init.headers ?? {}) } }, env);

    // X-6: the card of ป.6/1 no. 2 was reissued through the app's own mechanism — the old token lands in revoked_qr_tokens
    if (SCAN_DATASETS.includes(dataset)) {
      const rotated = await asTeacher("/api/students/stu_g61_2/qr/rotate", { method: "POST" });
      if (rotated.status !== 200) throw new Error("fixture card reissue failed: " + rotated.status);
      await DB.batch([
        DB.prepare("UPDATE students SET qr_token = ? WHERE id = 'stu_g61_2'").bind(NEW_CARD),
        DB.prepare("INSERT OR IGNORE INTO revoked_qr_tokens (token, student_id, revoked_at) VALUES (?, 'stu_g61_2', ?)").bind(OLD_CARD_LITERAL, nowMs),
      ]);
      info.cards = { revoked: OLD_CARD_VALID, revokedLiteral: OLD_CARD_LITERAL, current: NEW_CARD };
    }

    // X-4: settings the data set starts with, then the caller's overrides
    const set = startSettings(dataset, { teacherName, lateAfter, backupDaysAgo, settings: settingsOverride, ttExtra }, nowMs);
    const settingStmts = Object.entries(set).map(([k, v]) => DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(k, String(v)));
    for (const k of [...ttUnset, ...unsetSettings]) settingStmts.push(DB.prepare("DELETE FROM settings WHERE key = ?").bind(k));
    if (settingStmts.length) await DB.batch(settingStmts);

    // X-5: read the numbers back through EP-06 and compare with the tables in fixtures.md — never test on wrong data
    // F-T1 / F-T4: read the table back and compare with fixtures.md (14 periods = 9 teaching + 5 activity; 14; 6)
    if (selfCheck && TIMETABLE_DATASETS.includes(dataset)) {
      const rows = (await DB.prepare("SELECT term_id, COUNT(*) n, SUM(kind = 'class') c, SUM(kind = 'activity') a FROM timetable_slots GROUP BY term_id").all()).results;
      const want = TT_SETS[ttKey(ttSet)].want;
      const problems = Object.entries(want).filter(([id, w]) => { const r = rows.find((x) => x.term_id === id); return !(r ? [r.n, r.c, r.a] : [0, 0, 0]).every((v, i) => v === w[i]); }).map(([id]) => `timetable ${id}: slot counts differ from fixtures.md`);
      for (const r of rows) if (!(r.term_id in want)) problems.push(`timetable ${r.term_id}: has ${r.n} slots but fixtures.md says none`);
      const nTerms = (await DB.prepare("SELECT COUNT(*) n FROM terms").first()).n;
      if (ttKey(ttSet) === "t10a" && nTerms !== 0) problems.push("t10a must have no terms");
      if (["t2", "t8"].includes(ttKey(ttSet))) { // the app must accept the saved frame (not fall back to the default)
        const fr = await (await asTeacher("/api/timetable")).json();
        if (!fr.frame?.saved) problems.push("the saved frame was refused by the app (frame.saved is false)");
        else if (ttKey(ttSet) === "t2" && (fr.frame.periods.length !== 8 || fr.frame.days.length !== 7)) problems.push("t2 frame is not 8 periods x 7 days");
      }
      if (ttKey(ttSet) === "t2") {
        const lab = (await DB.prepare("SELECT label FROM timetable_slots WHERE label LIKE '%🏕%'").first())?.label;
        if (!lab || lab.length !== 40) problems.push("t2 long label is not 40 UTF-16 units");
        const room = (await DB.prepare("SELECT name FROM classes WHERE name LIKE 'ห้องเรียนพิเศษ%'").first())?.name;
        if (!room || room.length !== 20) problems.push("t2 special room name is not 20 chars");
      }
      if (problems.length) { const err = new Error(`fixture self-check FAILED for data set "${dataset}": ` + problems.join("; ")); err.code = "FIXTURE_SELF_CHECK"; err.problems = problems; throw err; }
      info.selfCheck = "ok";
    }
    if (selfCheck && dataset !== "demo" && dataset !== "empty" && !TIMETABLE_DATASETS.includes(dataset)) {
      const problems = [];
      for (const step of selfCheckPlan(dataset, T, today !== undefined)) {
        const res = await asTeacher("/api/dashboard" + step.query);
        if (res.status !== 200) { problems.push(`${step.label}: HTTP ${res.status}`); continue; }
        for (const line of step.check(await res.json())) problems.push(`${step.label} · ${line}`);
      }
      if (problems.length) {
        const err = new Error(`fixture self-check FAILED for data set "${dataset}" (today ${T}):\n  - ${problems.join("\n  - ")}`);
        err.code = "FIXTURE_SELF_CHECK";
        err.problems = problems;
        throw err;
      }
      info.selfCheck = "ok";
    }
  } catch (e) {
    await mf.dispose();
    throw e;
  }

  const rules = headerRules(headersFile);
  let dir = path.resolve(assetsDir);
  const apiLog = []; // every API call: { method, path, status, ms, db } — db = round trips counted while it ran (exact when calls don't overlap)
  const hits = []; // every path the server was asked for — proof of what really reached the network
  let down = false; // "the network is dead": connections are cut, for the page AND the service worker (browser emulation of
                    // offline does not reliably cover requests the worker makes itself)
  // R-6502: T is fixed at start; the worker follows the real Bangkok day, so a server left running past midnight serves
  // numbers that no longer match the tables. Say so (state.stale + one warning) instead of going stale silently.
  const isStale = () => today === undefined && bkkToday() !== T;
  let staleWarned = false;
  const warnIfStale = () => {
    if (staleWarned || !isStale()) return;
    staleWarned = true;
    console.warn(`fixture WARNING: the day changed (data set built for ${T}, now ${bkkToday()}) — the numbers on screen no longer match fixtures.md. Restart the fixture server.`);
  };
  const faults = []; // X-3: { method, path, status, times } — the next `times` matching API requests fail with `status` (null = until cleared)

  if (ttFail !== undefined) {
    const [kind, only] = String(ttFail).toLowerCase().split(":");
    for (const m of only ? [only.toUpperCase()] : ["*"]) faults.push({ method: m, path: "/api/timetable*", status: kind === "timeout" ? "hang" : 500, times: null });
  }
  const ttConflictState = { on: !!ttConflict, once: ttConflict === "once" };

  /** X-3: /__fixture/* — controls for the checks themselves, outside /api/ (the app never calls them). Answered even while "down". */
  async function control(req, res, url) {
    const reply = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
    const parts = [];
    for await (const part of req) parts.push(part);
    // a page on another site cannot send these: a JSON content type (or X-Fixture) forces a pre-flight the server never answers
    if (req.method !== "GET" && !/application\/json/i.test(req.headers["content-type"] ?? "") && !req.headers["x-fixture"]) return reply(415, { error: "send Content-Type: application/json" });
    let body = {};
    try { if (parts.length) body = JSON.parse(Buffer.concat(parts).toString("utf8")) ?? {}; } catch { return reply(400, { error: "bad json" }); }
    const route = `${req.method} ${url.pathname}`;
    const state = () => { warnIfStale(); return { ok: true, down, latencyMs: latency.ms, stale: isStale(), faults: faults.map((f) => ({ ...f })) }; };
    if (route === "POST /__fixture/down") { down = !!body.on; return reply(200, state()); }
    if (route === "POST /__fixture/latency") {
      const ms = Number(body.ms);
      if (!Number.isFinite(ms) || ms < 0 || ms > 60_000) return reply(422, { error: "ms must be 0..60000" });
      latency.ms = ms;
      return reply(200, state());
    }
    if (route === "POST /__fixture/fault" || route === "DELETE /__fixture/fault") {
      if (route.startsWith("DELETE") || body.clear) { faults.length = 0; return reply(200, state()); }
      const method = String(body.method ?? "*").toUpperCase();
      const status = Number(body.status ?? 500);
      const times = body.times == null ? null : Number(body.times);
      if (typeof body.path !== "string" || !body.path.startsWith("/")) return reply(422, { error: "path must start with /" });
      const hang = body.status === "hang"; // never answers: the app's own load timeout fires (AC-43)
      if (!hang && (!Number.isInteger(status) || (status !== 0 && (status < 100 || status > 599)))) return reply(422, { error: "status must be 100..599 (0 = cut the connection, \"hang\" = never answer)" });
      if (times !== null && (!Number.isInteger(times) || times < 1)) return reply(422, { error: "times must be a positive integer (or left out)" });
      faults.push({ method, path: body.path, status: hang ? "hang" : status, times });
      return reply(200, state());
    }
    if (route === "POST /__fixture/tt-conflict") { ttConflictState.on = !!body.on; ttConflictState.once = !!body.once; return reply(200, { ok: true, ...ttConflictState }); }
    if (route === "GET /__fixture/backup-file") { // F-T8: the data as a backup file; ?variant=old = an old-format file (no timetable table, schema 6, legacy period_times only)
      const old = url.searchParams.get("variant") === "old";
      const data = {};
      for (const tb of BACKUP_FILE_TABLES) { if (old && tb === "timetable_slots") continue; data[tb] = ((await DB.prepare(`SELECT * FROM ${tb}`).all()).results ?? []); }
      if (old) {
        data.settings = data.settings.filter((r) => r.key !== "period_frame");
        if (!data.settings.some((r) => r.key === "period_times")) data.settings.push({ key: "period_times", value: JSON.stringify({ 1: "08:00", 2: "09:00" }) });
        data.terms = data.terms.map(({ timetable_rev, ...r }) => r);
      }
      const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
      const sha256 = require("node:crypto").createHash("sha256").update(JSON.stringify(data)).digest("hex");
      return reply(200, { app: "ngankrob", schema_version: old ? 6 : 7, exported_at: Date.now(), counts, sha256, data });
    }
    if (route === "POST /__fixture/kill-sessions") {
      const out = await DB.prepare("DELETE FROM sessions").run();
      return reply(200, { ...state(), removed: out.meta?.changes ?? 0 });
    }
    if (route === "GET /__fixture/settings") {
      const rows = (await DB.prepare("SELECT key, value FROM settings").all()).results ?? [];
      return reply(200, { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
    }
    if (route === "POST /__fixture/settings") { // extra: change what the server holds (late_after, accent, …) without a page
      const stmts = Object.entries(body.set ?? {}).map(([k, v]) => DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(k, String(v)));
      for (const k of body.unset ?? []) stmts.push(DB.prepare("DELETE FROM settings WHERE key = ?").bind(String(k)));
      if (stmts.length) await DB.batch(stmts);
      return reply(200, { ok: true });
    }
    if (route === "GET /__fixture/state") return reply(200, { ...state(), dataset, today: T });
    return reply(404, { error: "unknown fixture endpoint" });
  }
  /** the first armed fault that matches this API request (and uses one of its `times`), or undefined */
  function takeFault(method, pathname) {
    const i = faults.findIndex((f) => (f.method === "*" || f.method === method) && (f.path.endsWith("*") ? pathname.startsWith(f.path.slice(0, -1)) : f.path === pathname));
    if (i === -1) return undefined;
    const f = faults[i];
    if (f.times !== null && --f.times <= 0) faults.splice(i, 1);
    return f;
  }

  const server = http.createServer(async (req, res) => {
    warnIfStale();
    if ((req.url ?? "").startsWith("/__fixture/")) {
      try { await control(req, res, new URL(req.url, `http://127.0.0.1:${port}`)); }
      catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end("fixture error"); }
      return;
    }
    if (down) { req.socket.destroy(); return; }
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      hits.push(url.pathname);
      if (url.pathname.startsWith("/api/")) {
        const parts = [];
        for await (const part of req) parts.push(part);
        const fault = takeFault(req.method, url.pathname);
        if (fault) {
          apiLog.push({ at: Date.now(), method: req.method, path: url.pathname, status: fault.status, ms: 0, db: 0, fault: true });
          if (fault.status === 0) { req.socket.destroy(); return; }
          if (fault.status === "hang") return; // leave the request open; close() drops it
          res.writeHead(fault.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "fixture_fault", message: "failure injected by /__fixture/fault" }));
          return;
        }
        if (ttConflictState.on && req.method === "PUT" && url.pathname === "/api/timetable") {
          // "another device" saves first: the term's version moves (and one slot appears), so the app's own check answers 409 timetable_changed + current
          let termId = null;
          try { termId = JSON.parse(Buffer.concat(parts).toString("utf8")).termId; } catch { /* the app will answer 4xx */ }
          const term = termId ? await DB.prepare("SELECT id FROM terms WHERE id = ?").bind(termId).first() : null;
          if (term) {
            await DB.batch([
              DB.prepare("INSERT OR IGNORE INTO timetable_slots (term_id, weekday, period, kind, class_id, subject_id, label, updated_at) VALUES (?, 3, 7, 'activity', NULL, NULL, 'จากเครื่องอื่น', ?)").bind(term.id, Date.now()),
              DB.prepare("UPDATE terms SET timetable_rev = timetable_rev + 1 WHERE id = ?").bind(term.id),
            ]);
            if (ttConflictState.once) ttConflictState.on = false;
          }
        }
        const t0 = Date.now(), before = stats.count;
        const out = await app.request(url.href, { method: req.method, headers: req.headers, ...(parts.length ? { body: Buffer.concat(parts) } : {}) }, timedEnv);
        apiLog.push({ at: t0, method: req.method, path: url.pathname, status: out.status, ms: Date.now() - t0, db: stats.count - before });
        res.writeHead(out.status, Object.fromEntries(out.headers));
        res.end(Buffer.from(await out.arrayBuffer()));
        return;
      }
      // like the host: a file if there is one, else the app itself (single-page-app fallback, answered 200)
      let file = path.resolve(dir, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(dir + path.sep) && file !== dir) { res.writeHead(400); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, "index.html");
      const stat = fs.statSync(file);
      // the host's own defaults for static files: always ask again (with an ETag), unless a rule in _headers says otherwise —
      // without these a browser may quietly reuse files from its HTTP cache and hide what the app itself keeps
      const headers = {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "public, max-age=0, must-revalidate",
        ETag: `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`,
      };
      for (const r of rules) if (matches(r.pattern, url.pathname)) Object.assign(headers, r.headers);
      if (req.headers["if-none-match"] === headers.ETag) { res.writeHead(304, headers); res.end(); return; }
      res.writeHead(200, headers);
      res.end(fs.readFileSync(file));
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end("fixture error");
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const boundPort = server.address().port; // differs from `port` only when port is 0 (a free one, for tests)
  return {
    url: `http://127.0.0.1:${boundPort}`,
    DB,
    dataset,
    /** T: today in Asia/Bangkok that every relative date in the data set was built from (X-1) */
    today: T,
    info, // { dataset, today, selfCheck?: "ok", cards?: {…} }
    ttConflict: ttConflictState, // { on, once } — live
    faults, // armed /__fixture/fault entries (live array)
    hits,
    apiLog,
    dbStats: stats,
    /** every D1 round trip from now on costs this many ms (a database on another continent ≈ 200) */
    setDbLatency(ms) { latency.ms = ms; },
    resetDbStats() { stats.count = 0; stats.log.length = 0; apiLog.length = 0; },
    email: EMAIL,
    password: PASSWORD,
    /** cut (true) or restore (false) the network for everyone */
    setDown(value) { down = !!value; },
    /** serve another build (a "new release") from now on */
    setAssetsDir(next) { dir = path.resolve(next); },
    async close() { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await mf.dispose(); },
  };
}

module.exports = { TT_SETS, TT_SET_NAMES, startFixtureServer, PASSWORD, EMAIL, DATASETS, CLS, TERM, dayAdd, dashboardProblems, LONG_SCAN_TITLE, OLD_CARD_VALID, OLD_CARD_LITERAL, NEW_CARD };

if (require.main === module) {
  // node scripts/fixture-server.cjs [--home | --home-empty-year | --home-no-students | --home-clear | --home-many | --home-extra | --home-extra-b | --home-one
  //                                  | --scan | --scan-all-62 | --scan-noroom | --scan-empty | --timetable [--tt-set=NAME] [--tt-fail=500|timeout[:get|:put]] [--tt-conflict[=once]] | --empty | --gb14 | --layout]
  //   [--port N] [--assets DIR] [--teacher-name TEXT] [--late-after HH:MM] [--backup-days N|never] [--set key=value ...] [--unset key ...]
  // (no --today: the app always asks for the real Bangkok day, so a fixture built for another day would only look checked — R-6501)
  const argv = process.argv.slice(2);
  const fail = (m) => { console.error("fixture-server: " + m); process.exit(2); };
  const WITH_VALUE = new Set(["--port", "--assets", "--teacher-name", "--late-after", "--backup-days", "--set", "--unset"]);
  const SWITCHES = new Set(["--gb14", "--layout", ...DATASETS.filter((d) => d !== "demo").map((d) => "--" + d)]);
  const values = {}; // flag -> [values]
  let ttSetArg, ttFailArg, ttConflictArg;
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === "--today") fail("--today is not supported: the app uses the real Bangkok day, so the data set must be built for it");
    if (a.startsWith("--tt-set=")) { ttSetArg = a.slice(9); continue; }
    if (a.startsWith("--tt-fail=")) { ttFailArg = a.slice(10); continue; }
    if (a === "--tt-conflict" || a === "--tt-conflict=once") { ttConflictArg = a.endsWith("once") ? "once" : true; continue; }
    if (WITH_VALUE.has(a)) {
      if (k + 1 >= argv.length) fail(a + " needs a value");
      (values[a] ??= []).push(argv[++k]);
    } else if (!SWITCHES.has(a)) fail("unknown option " + a);
  }
  const opt = (name) => values[name]?.[values[name].length - 1];
  const flags = DATASETS.filter((d) => d !== "demo" && argv.includes("--" + d));
  if (flags.length > 1) fail("pick one data set flag, got: " + flags.map((f) => "--" + f).join(" "));
  const settings = {};
  for (const kv of values["--set"] ?? []) { const i = kv.indexOf("="); if (i < 1) fail("--set wants key=value"); settings[kv.slice(0, i)] = kv.slice(i + 1); }
  const backup = opt("--backup-days");
  if (backup !== undefined && backup !== "never" && !/^\d+$/.test(backup)) fail("--backup-days wants a whole number of days or \"never\", got \"" + backup + "\"");
  const port = opt("--port");
  if (port !== undefined && !(/^\d+$/.test(port) && Number(port) <= 65535)) fail("--port wants a number 0..65535, got \"" + port + "\"");
  const lateAfter = opt("--late-after");
  if (lateAfter !== undefined && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(lateAfter)) fail("--late-after wants HH:MM, got \"" + lateAfter + "\"");
  if ((ttSetArg !== undefined || ttFailArg !== undefined || ttConflictArg) && flags[0] !== "timetable") fail("--tt-set / --tt-fail / --tt-conflict only go with --timetable");
  startFixtureServer({
    ...(flags[0] ? { dataset: flags[0] } : {}),
    ...(ttSetArg !== undefined ? { ttSet: ttSetArg } : {}), ...(ttFailArg !== undefined ? { ttFail: ttFailArg } : {}), ...(ttConflictArg ? { ttConflict: ttConflictArg } : {}),
    gradebook14: argv.includes("--gb14"), layout: argv.includes("--layout"),
    ...(port !== undefined ? { port: Number(port) } : {}), ...(opt("--assets") ? { assetsDir: path.resolve(opt("--assets")) } : {}),
    ...(opt("--teacher-name") !== undefined ? { teacherName: opt("--teacher-name") } : {}),
    ...(lateAfter !== undefined ? { lateAfter } : {}),
    ...(backup !== undefined ? { backupDaysAgo: backup === "never" ? null : Number(backup) } : {}),
    settings, unsetSettings: values["--unset"] ?? [],
  }).then((s) => {
    console.log(`fixture server on ${s.url} — data set: ${s.dataset}${s.info.ttSet ? " (tt-set " + s.info.ttSet + ")" : ""} — today (Bangkok): ${s.today}${s.info.selfCheck ? " — self-check ok" : ""} — password: ${s.password} — synthetic data only`);
    for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await s.close(); process.exit(0); });
  }).catch((e) => { console.error(e.code === "FIXTURE_SELF_CHECK" ? e.message : e); process.exit(1); });
}

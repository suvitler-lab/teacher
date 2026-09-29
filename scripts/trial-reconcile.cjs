// Compares what the teacher wrote on paper (the parallel record kept during the classroom trial) with what the app holds.
//
//   node scripts/trial-reconcile.cjs --backup ngankrob-backup-2026-10-05.json \
//        [--scores paper-scores.csv] [--attendance paper-attendance.csv] [--csv differences.csv] [--json]
//
// The backup is the file from Settings ▸ Backup. The paper record is typed in afterwards — as CSV, or pasted from a
// spreadsheet (tab-separated works too). Templates: docs/trial/*.template.csv. Exits 1 if anything differs, so "the
// results agree" is a fact this prints, not an impression.
//
// Scores file      columns: code (or class + number) · assignment (title or id) · score
//                  score: a number · "ส่ง" (handed in, no score yet) · "ยกเว้น" · blank / "-" / "ไม่ส่ง" (not handed in)
// Attendance file  columns: date (YYYY-MM-DD) · code (or class + number) · status (มา สาย ลา ป่วย ขาด, or / ✓ x)
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// ---- reading a table -----------------------------------------------------------------------------

/** CSV (quotes, CRLF, BOM) or TSV — whichever the first line uses — into rows of {header: value}. */
function parseTable(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => { endCell(); if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) endCell();
    else if (ch === "\n") endRow();
    else if (ch === "\r") { /* CRLF: the \n ends the row */ }
    else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  if (rows.length === 0) return [];
  const head = rows[0].map((h) => canonicalHeader(h));
  return rows.slice(1).map((r, i) => Object.fromEntries([["_line", i + 2], ...head.map((h, k) => [h, (r[k] ?? "").trim()])]));
}

const HEADERS = {
  code: ["code", "รหัส", "รหัสนักเรียน", "student", "student_code"],
  class: ["class", "ห้อง", "ชั้น", "classroom"],
  number: ["number", "เลขที่", "no", "no."],
  assignment: ["assignment", "งาน", "ชื่องาน", "assignment_id", "work"],
  score: ["score", "คะแนน", "mark"],
  date: ["date", "วันที่"],
  status: ["status", "สถานะ", "attendance"],
};
function canonicalHeader(h) {
  const k = h.trim().toLowerCase();
  for (const [name, aliases] of Object.entries(HEADERS)) if (aliases.includes(k)) return name;
  return k;
}

const ATTENDANCE_WORDS = {
  present: ["มา", "ม", "/", "✓", "✔", "present", "p"],
  late: ["สาย", "ส", "late", "l"],
  leave: ["ลา", "ล", "ลากิจ", "leave"],
  sick: ["ป่วย", "ป", "ลาป่วย", "sick"],
  absent: ["ขาด", "ข", "x", "absent", "a"],
};
const STATUS_LABEL = { present: "มา", late: "สาย", leave: "ลา", sick: "ป่วย", absent: "ขาด" };
function attendanceStatus(raw) {
  const k = String(raw).trim().toLowerCase();
  for (const [status, words] of Object.entries(ATTENDANCE_WORDS)) if (words.includes(k)) return status;
  return null;
}

/** What the paper says about one hand-in: {kind: "score", value} | "submitted" | "excused" | "none", or null if unreadable. */
function paperScore(raw) {
  const t = String(raw).trim();
  if (t === "" || t === "-" || t === "–" || /^(ไม่ส่ง|ขาดส่ง|none|no)$/i.test(t)) return { kind: "none" };
  if (/^(ส่ง|ส่งแล้ว|submitted|yes)$/i.test(t)) return { kind: "submitted" };
  if (/^(ยกเว้น|excused)$/i.test(t)) return { kind: "excused" };
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? { kind: "score", value: n } : null;
}

// ---- the app's side --------------------------------------------------------------------------------

function indexBackup(backup) {
  const d = backup.data || {};
  const students = d.students || [];
  const byCode = new Map(students.map((s) => [String(s.code), s]));
  const classes = new Map((d.classes || []).map((c) => [c.id, c]));
  const nameOf = (s) => [s.prefix, s.first_name, s.last_name].filter(Boolean).join("").trim() || s.code;
  const byClassNumber = (className, number) => {
    const cls = [...classes.values()].filter((c) => c.name === className);
    const hits = students.filter((s) => cls.some((c) => c.id === s.class_id) && Number(s.number) === Number(number));
    return hits.find((s) => s.status === "active") ?? hits[0] ?? null;
  };
  const live = (d.assignments || []).filter((a) => !a.deleted_at);
  const asgById = new Map((d.assignments || []).map((a) => [a.id, a]));
  const asgByTitle = (title) => live.filter((a) => a.title.replace(/\s+/g, " ").trim() === title.replace(/\s+/g, " ").trim());
  const subs = new Map((d.submissions || []).map((s) => [s.assignment_id + "\u0000" + s.student_id, s]));
  const sessionOf = new Map(); // `${class}\0${date}` → the daily (no subject, no period) session
  for (const s of d.attendance_sessions || []) if (s.subject_id == null && s.period == null) sessionOf.set(s.class_id + "\u0000" + s.date, s);
  const marks = new Map((d.attendance || []).map((m) => [m.session_id + "\u0000" + m.student_id, m]));
  return { students, byCode, byClassNumber, classes, nameOf, asgById, asgByTitle, subs, sessionOf, marks, data: d };
}

function findStudent(ix, row) {
  if (row.code) return ix.byCode.get(row.code) ?? null;
  if (row.class && row.number) return ix.byClassNumber(row.class, row.number);
  return null;
}
const who = (ix, row, st) => (st ? `${ix.nameOf(st)}${st.number != null ? ` (เลขที่ ${st.number})` : ""}` : row.code || `${row.class ?? "?"} เลขที่ ${row.number ?? "?"}`);

// ---- reconciling -----------------------------------------------------------------------------------

/**
 * @returns {{ scores: Section, attendance: Section }} each with `paper`, `matched`, `differences[]`. Nothing here reads a file.
 * A difference is {kind, line, who, what, paper, app}. `kind` says which way it differs:
 *   unknown_student / unknown_assignment / ambiguous_assignment / unreadable — the paper row could not even be matched (a typo?)
 *   missing_in_app   the paper has it, the app has nothing        extra_in_app    the app has it, the paper says none
 *   differs          both have it, not the same                   not_on_paper    the app has it for a child of a listed class, the paper never mentioned
 */
function reconcile({ backup, scores, attendance }) {
  const ix = indexBackup(backup);
  const out = { scores: { paper: 0, matched: 0, differences: [] }, attendance: { paper: 0, matched: 0, differences: [] } };

  if (scores) {
    const sec = out.scores;
    const seen = new Set(); // (assignment, student) pairs the paper covers
    const classesOnPaper = new Set();
    const asgOnPaper = new Set();
    const bad = (kind, row, what, paper = "", app = "", st = null) => sec.differences.push({ kind, line: row._line, who: who(ix, row, st), what, paper, app });
    for (const row of scores) {
      sec.paper++;
      const st = findStudent(ix, row);
      if (!st) { bad("unknown_student", row, row.assignment, "", "ไม่พบนักเรียนคนนี้ในแอป (พิมพ์รหัส/เลขที่ผิด?)"); continue; }
      let asg = ix.asgById.get(row.assignment);
      if (!asg) {
        const hits = ix.asgByTitle(row.assignment);
        if (hits.length > 1) { bad("ambiguous_assignment", row, row.assignment, "", `มีงานชื่อนี้ ${hits.length} งาน — ใส่รหัสงาน (assignment id) แทนชื่อ`, st); continue; }
        asg = hits[0];
      }
      if (!asg) { bad("unknown_assignment", row, row.assignment, "", "ไม่พบงานชื่อนี้ในแอป", st); continue; }
      const want = paperScore(row.score);
      if (!want) { bad("unreadable", row, asg.title, row.score, "อ่านคะแนนในกระดาษไม่ออก (ต้องเป็นตัวเลข, ส่ง, ยกเว้น หรือเว้นว่าง/-)", st); continue; }
      seen.add(asg.id + "\u0000" + st.id);
      classesOnPaper.add(st.class_id);
      asgOnPaper.add(asg.id);
      const have = ix.subs.get(asg.id + "\u0000" + st.id);
      const inApp = have && have.status !== "void" ? have : null;
      const describe = (s) => (!s ? "ยังไม่ส่ง" : s.status === "excused" ? "ยกเว้น" : s.score == null ? "ส่งแล้ว (ยังไม่ให้คะแนน)" : `ส่งแล้ว ${s.score}`);
      let ok, kind;
      if (want.kind === "none") { ok = !inApp; kind = "extra_in_app"; }
      else if (want.kind === "excused") { ok = inApp?.status === "excused"; kind = inApp ? "differs" : "missing_in_app"; }
      else if (want.kind === "submitted") { ok = inApp?.status === "submitted"; kind = inApp ? "differs" : "missing_in_app"; }
      else { ok = inApp?.status === "submitted" && inApp.score != null && Math.abs(inApp.score - want.value) < 1e-9; kind = inApp ? "differs" : "missing_in_app"; }
      if (ok) sec.matched++;
      else bad(kind, row, asg.title, want.kind === "score" ? `ส่งแล้ว ${want.value}` : want.kind === "none" ? "ไม่ส่ง" : row.score, describe(inApp), st);
    }
    // what the app holds for children of the classes the paper covers, on the assignments the paper covers, that the paper never mentioned
    for (const [key, s] of ix.subs) {
      const [aid, sid] = key.split("\u0000");
      if (seen.has(key) || !asgOnPaper.has(aid) || s.status === "void") continue;
      const st = ix.students.find((x) => x.id === sid);
      if (!st || !classesOnPaper.has(st.class_id)) continue;
      const asg = ix.asgById.get(aid);
      sec.differences.push({ kind: "not_on_paper", line: 0, who: who(ix, {}, st), what: asg.title, paper: "(ไม่ได้จด)", app: s.status === "excused" ? "ยกเว้น" : s.score == null ? "ส่งแล้ว (ยังไม่ให้คะแนน)" : `ส่งแล้ว ${s.score}` });
    }
  }

  if (attendance) {
    const sec = out.attendance;
    const seen = new Set();
    const daysOnPaper = new Set(); // `${class}\0${date}`
    const bad = (kind, row, what, paper, app, st = null) => sec.differences.push({ kind, line: row._line, who: who(ix, row, st), what, paper, app });
    for (const row of attendance) {
      sec.paper++;
      const st = findStudent(ix, row);
      if (!st) { bad("unknown_student", row, row.date, "", "ไม่พบนักเรียนคนนี้ในแอป (พิมพ์รหัส/เลขที่ผิด?)"); continue; }
      const want = attendanceStatus(row.status);
      if (!want) { bad("unreadable", row, row.date, row.status, "อ่านสถานะไม่ออก (มา สาย ลา ป่วย ขาด)", st); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) { bad("unreadable", row, row.date, row.date, "วันที่ต้องเป็น ปปปป-ดด-วว (ค.ศ.เท่านั้น เช่น 2026-10-05)", st); continue; }
      const session = ix.sessionOf.get(st.class_id + "\u0000" + row.date);
      const mark = session ? ix.marks.get(session.id + "\u0000" + st.id) : null;
      seen.add((session?.id ?? "-") + "\u0000" + st.id);
      daysOnPaper.add(st.class_id + "\u0000" + row.date);
      if (mark && mark.status === want) sec.matched++;
      else bad(mark ? "differs" : "missing_in_app", row, row.date, STATUS_LABEL[want], mark ? STATUS_LABEL[mark.status] ?? mark.status : "ไม่ได้เช็คในแอป", st);
    }
    for (const key of daysOnPaper) {
      const [classId, date] = key.split("\u0000");
      const session = ix.sessionOf.get(key);
      if (!session) continue;
      for (const m of ix.data.attendance || []) {
        if (m.session_id !== session.id || seen.has(session.id + "\u0000" + m.student_id)) continue;
        const st = ix.students.find((x) => x.id === m.student_id);
        sec.differences.push({ kind: "not_on_paper", line: 0, who: who(ix, {}, st), what: date, paper: "(ไม่ได้จด)", app: STATUS_LABEL[m.status] ?? m.status });
      }
      void classId;
    }
  }
  return out;
}

const KIND_TEXT = {
  unknown_student: "จับคู่นักเรียนไม่ได้", unknown_assignment: "จับคู่งานไม่ได้", ambiguous_assignment: "ชื่องานซ้ำ", unreadable: "อ่านค่าไม่ออก",
  missing_in_app: "กระดาษมี แอปไม่มี", extra_in_app: "แอปมี กระดาษบอกไม่ส่ง", differs: "ไม่ตรงกัน", not_on_paper: "แอปมี กระดาษไม่ได้จด",
};

function summarize(result) {
  const s = (sec) => ({ paper: sec.paper, matched: sec.matched, differences: sec.differences.length, rate: sec.paper ? sec.matched / sec.paper : null });
  return { scores: s(result.scores), attendance: s(result.attendance) };
}

function formatReport(result, meta = {}) {
  const lines = [];
  lines.push(`เทียบกับบันทึกกระดาษ${meta.backupName ? " — ไฟล์สำรอง " + meta.backupName : ""}${meta.exportedAt ? " (ส่งออก " + new Date(meta.exportedAt + 7 * 3600_000).toISOString().replace("T", " ").slice(0, 16) + ")" : ""}`);
  for (const w of meta.warnings ?? []) lines.push("⚠ " + w);
  const sum = summarize(result);
  for (const [key, title] of [["scores", "คะแนน"], ["attendance", "เช็คชื่อ"]]) {
    const s = sum[key];
    if (!s.paper && !result[key].differences.length) continue;
    lines.push("", `${title}: ${s.paper} รายการในกระดาษ · ตรงกัน ${s.matched}${s.rate != null ? ` (${(s.rate * 100).toFixed(1)}%)` : ""} · ต่างกัน/ไม่ตรง ${s.differences}`);
    const byKind = {};
    for (const d of result[key].differences) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
    if (s.differences) lines.push("  " + Object.entries(byKind).map(([k, n]) => `${KIND_TEXT[k]} ${n}`).join(" · "));
    for (const d of result[key].differences) {
      lines.push(`  - ${d.line ? `บรรทัด ${d.line}: ` : ""}${d.who} · ${d.what} · กระดาษ: ${d.paper || "—"} · แอป: ${d.app || "—"}  [${KIND_TEXT[d.kind]}]`);
    }
  }
  const total = sum.scores.differences + sum.attendance.differences;
  lines.push("", total === 0 && (sum.scores.paper || sum.attendance.paper) ? "✔ ตรงกันทุกรายการ" : total === 0 ? "ไม่มีข้อมูลในกระดาษให้เทียบ" : `✘ ไม่ตรง ${total} รายการ — ตรวจต้นฉบับกระดาษก่อนว่าจดผิดหรือแอปผิด แล้วบันทึกไว้ในแบบบันทึกการทดลอง`);
  return lines.join("\n");
}

function differencesCsv(result) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["ชนิด", "ประเภทความต่าง", "บรรทัดในไฟล์กระดาษ", "นักเรียน", "งาน/วันที่", "กระดาษ", "แอป"]];
  for (const [key, title] of [["scores", "คะแนน"], ["attendance", "เช็คชื่อ"]]) {
    for (const d of result[key].differences) rows.push([title, KIND_TEXT[d.kind], d.line || "", d.who, d.what, d.paper, d.app]);
  }
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n"; // BOM: Excel reads the Thai correctly
}

/** Read the app's backup file; says what is wrong with it rather than crashing on the first missing field. */
function loadBackup(file) {
  let backup;
  try { backup = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new Error(`อ่านไฟล์สำรอง ${file} ไม่ได้: ${e.message}`); }
  if (backup.app !== "ngankrob" || !backup.data) throw new Error(`${file} ไม่ใช่ไฟล์สำรองของระบบนี้ (ต้องเป็นไฟล์ .json จาก ตั้งค่า → สำรองข้อมูล)`);
  const warnings = [];
  if (backup.sha256 && crypto.createHash("sha256").update(JSON.stringify(backup.data)).digest("hex") !== backup.sha256) {
    warnings.push("ผลตรวจความสมบูรณ์ของไฟล์ (sha256) ไม่ตรง — ไฟล์อาจถูกแก้หรือเสียหาย ผลเทียบอาจไม่น่าเชื่อถือ");
  }
  for (const t of ["students", "assignments", "submissions", "attendance_sessions", "attendance", "classes"]) {
    if (!Array.isArray(backup.data[t])) warnings.push(`ไฟล์สำรองไม่มีตาราง ${t}`);
  }
  return { backup, warnings };
}

function argValue(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

function main(argv) {
  const backupFile = argValue(argv, "--backup");
  const scoresFile = argValue(argv, "--scores");
  const attFile = argValue(argv, "--attendance");
  if (!backupFile || (!scoresFile && !attFile)) {
    console.error("usage: node scripts/trial-reconcile.cjs --backup <ไฟล์สำรอง.json> [--scores คะแนนกระดาษ.csv] [--attendance เช็คชื่อกระดาษ.csv] [--csv ความต่าง.csv] [--json]");
    return 2;
  }
  try {
    const { backup, warnings } = loadBackup(backupFile);
    const result = reconcile({
      backup,
      scores: scoresFile ? parseTable(fs.readFileSync(scoresFile, "utf8")) : null,
      attendance: attFile ? parseTable(fs.readFileSync(attFile, "utf8")) : null,
    });
    const csvFile = argValue(argv, "--csv");
    if (csvFile) fs.writeFileSync(csvFile, differencesCsv(result));
    if (argv.includes("--json")) console.log(JSON.stringify({ summary: summarize(result), ...result }, null, 2));
    else console.log(formatReport(result, { backupName: path.basename(backupFile), exportedAt: backup.exported_at, warnings }));
    const s = summarize(result);
    return s.scores.differences + s.attendance.differences === 0 ? 0 : 1;
  } catch (e) {
    console.error(e.message);
    return 2;
  }
}

module.exports = { parseTable, paperScore, attendanceStatus, reconcile, formatReport, differencesCsv, summarize, loadBackup, main };

if (require.main === module) process.exit(main(process.argv.slice(2)));

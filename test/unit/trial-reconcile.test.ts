// scripts/trial-reconcile.cjs — the tool that says whether the classroom trial's results agree with the teacher's paper.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const require = createRequire(import.meta.url);
const rc = require("../../scripts/trial-reconcile.cjs");

// a small class: two children in ป.6/1, one in ป.6/2, three assignments (one deleted, two sharing a title)
const backup: any = {
  app: "ngankrob",
  schema_version: 5,
  exported_at: Date.parse("2026-10-05T10:00:00Z"),
  data: {
    classes: [{ id: "c1", name: "ป.6/1" }, { id: "c2", name: "ป.6/2" }],
    students: [
      { id: "s1", code: "101", prefix: "ด.ช.", first_name: "ก", last_name: "ข", class_id: "c1", number: 1, status: "active" },
      { id: "s2", code: "102", prefix: "ด.ญ.", first_name: "ค", last_name: "ง", class_id: "c1", number: 2, status: "active" },
      { id: "s3", code: "103", prefix: "ด.ช.", first_name: "จ", last_name: "ฉ", class_id: "c1", number: 3, status: "active" },
      { id: "s9", code: "201", prefix: "ด.ช.", first_name: "ซ", last_name: "ฌ", class_id: "c2", number: 1, status: "active" },
    ],
    assignments: [
      { id: "a1", title: "ใบงาน 1", deleted_at: null },
      { id: "a2", title: "ใบงาน 2", deleted_at: null },
      { id: "a3", title: "ใบงาน 2", deleted_at: null },      // same title as a2: ambiguous by name
      { id: "a4", title: "ใบงานที่ลบแล้ว", deleted_at: 5 },
    ],
    submissions: [
      { assignment_id: "a1", student_id: "s1", status: "submitted", score: 8 },
      { assignment_id: "a1", student_id: "s2", status: "submitted", score: 9.5 },
      { assignment_id: "a1", student_id: "s3", status: "void", score: null },       // cleared: same as not handed in
      { assignment_id: "a1", student_id: "s9", status: "submitted", score: 5 },     // another class
      { assignment_id: "a2", student_id: "s1", status: "submitted", score: null },  // received, not graded yet
      { assignment_id: "a3", student_id: "s2", status: "excused", score: null },
    ],
    attendance_sessions: [
      { id: "d1", date: "2026-10-05", class_id: "c1", subject_id: null, period: null },
      { id: "p1", date: "2026-10-05", class_id: "c1", subject_id: "sub1", period: 2 },   // a per-period session: not the day's roll
    ],
    attendance: [
      { session_id: "d1", student_id: "s1", status: "present" },
      { session_id: "d1", student_id: "s2", status: "late" },
      { session_id: "d1", student_id: "s3", status: "absent" },
      { session_id: "p1", student_id: "s1", status: "absent" },
    ],
  },
};
backup.sha256 = createHash("sha256").update(JSON.stringify(backup.data)).digest("hex");

const scores = (csv: string) => rc.parseTable(csv);
const run = (csv: string) => rc.reconcile({ backup, scores: scores(csv) }).scores;
const kinds = (sec: any) => sec.differences.map((d: any) => d.kind);

describe("reading the teacher's table", () => {
  it("reads CSV, with the Thai header names, a BOM, CRLF and quoted commas/newlines", () => {
    const rows = rc.parseTable('﻿รหัส,งาน,คะแนน\r\n101,"ใบงาน, ชุด ""A""",8\r\n102,"สองบรรทัด\nในช่องเดียว",\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ code: "101", assignment: 'ใบงาน, ชุด "A"', score: "8", _line: 2 });
    expect(rows[1]).toMatchObject({ code: "102", assignment: "สองบรรทัด\nในช่องเดียว", score: "" });
  });

  it("reads what was pasted from a spreadsheet (tab-separated), English headers, blank lines", () => {
    const rows = rc.parseTable("code\tassignment\tscore\n101\tใบงาน 1\t8\n\n102\tใบงาน 1\t9.5\n");
    expect(rows.map((r: any) => [r.code, r.score])).toEqual([["101", "8"], ["102", "9.5"]]);
  });

  it("knows the header words in either language", () => {
    const r = rc.parseTable("ห้อง,เลขที่,ชื่องาน,คะแนน\nป.6/1,1,ใบงาน 1,8")[0];
    expect(r).toMatchObject({ class: "ป.6/1", number: "1", assignment: "ใบงาน 1", score: "8" });
  });

  it.each([
    ["8", { kind: "score", value: 8 }], ["8.5", { kind: "score", value: 8.5 }], ["8,5", { kind: "score", value: 8.5 }], ["0", { kind: "score", value: 0 }],
    ["", { kind: "none" }], ["-", { kind: "none" }], ["ไม่ส่ง", { kind: "none" }],
    ["ส่ง", { kind: "submitted" }], ["ยกเว้น", { kind: "excused" }], ["แปดคะแนน", null],
  ])("paper score %j", (raw, want) => expect(rc.paperScore(raw)).toEqual(want));

  it.each([["มา", "present"], ["/", "present"], ["✓", "present"], ["สาย", "late"], ["ลา", "leave"], ["ป่วย", "sick"], ["ขาด", "absent"], ["x", "absent"], ["Absent", "absent"], ["บางที", null]])(
    "attendance word %j → %s", (raw, want) => expect(rc.attendanceStatus(raw)).toBe(want));
});

describe("scores: paper against the app", () => {
  it("everything agreeing is 100% — with decimals, 'not handed in' as blank / '-' / void, 'submitted' and 'excused'", () => {
    const sec = run("รหัส,งาน,คะแนน\n101,ใบงาน 1,8\n102,ใบงาน 1,\"9,5\"\n103,ใบงาน 1,-\n101,a2,ส่ง\n102,a3,ยกเว้น");
    expect(sec).toMatchObject({ paper: 5, matched: 5 });
    expect(sec.differences).toEqual([]);
  });

  it("says which way each difference goes", () => {
    const sec = run([
      "รหัส,งาน,คะแนน",
      "101,ใบงาน 1,9",     // both have it, not the same
      "103,ใบงาน 1,7",     // the paper has a score; the app's is cleared
      "102,ใบงาน 1,",      // the paper says not handed in; the app has 9.5
      "101,a2,6",          // the paper has a score; the app has "received, not graded"
      "102,a3,10",         // the paper has a score; the app says excused
    ].join("\n"));
    expect(sec.matched).toBe(0);
    expect(kinds(sec)).toEqual(["differs", "missing_in_app", "extra_in_app", "differs", "differs"]);
    expect(sec.differences[0]).toMatchObject({ line: 2, paper: "ส่งแล้ว 9", app: "ส่งแล้ว 8", what: "ใบงาน 1" });
    expect(sec.differences[1].app).toBe("ยังไม่ส่ง");
    expect(sec.differences[3].app).toBe("ส่งแล้ว (ยังไม่ให้คะแนน)");
    expect(sec.differences[4].app).toBe("ยกเว้น");
  });

  it("finds a child by class + number as well as by code", () => {
    expect(run("ห้อง,เลขที่,งาน,คะแนน\nป.6/1,1,ใบงาน 1,8\nป.6/1,2,ใบงาน 1,9.5")).toMatchObject({ paper: 2, matched: 2 });
  });

  it("cannot match a typo, and says so rather than guessing: unknown child, unknown / deleted / ambiguous assignment, unreadable score", () => {
    const sec = run([
      "รหัส,งาน,คะแนน",
      "999,ใบงาน 1,8",          // no such child
      "101,ใบงาน 9,8",          // no such assignment
      "101,ใบงานที่ลบแล้ว,8",   // deleted assignments are not matched by name
      "101,ใบงาน 2,8",          // two assignments called that
      "101,ใบงาน 1,แปด",        // unreadable
    ].join("\n"));
    expect(kinds(sec)).toEqual(["unknown_student", "unknown_assignment", "unknown_assignment", "ambiguous_assignment", "unreadable"]);
    expect(sec.differences[3].app).toMatch(/assignment id/);
  });

  it("an assignment can be named by its id (the way out of an ambiguous title)", () => {
    expect(run("รหัส,งาน,คะแนน\n101,a2,ส่ง")).toMatchObject({ matched: 1 });
  });

  it("notices what the app holds that the paper never mentioned — only for the classes and assignments the paper covers", () => {
    const sec = run("รหัส,งาน,คะแนน\n101,ใบงาน 1,8"); // the paper lists only s1 on a1
    const extras = sec.differences.filter((d: any) => d.kind === "not_on_paper");
    // s2's 9.5 on a1 is a child of the same class, on the same assignment → reported; s9 (another class) and the void row are not
    expect(extras.map((d: any) => d.who)).toEqual([expect.stringContaining("ด.ญ.ค")]);
    expect(extras[0]).toMatchObject({ what: "ใบงาน 1", paper: "(ไม่ได้จด)", app: "ส่งแล้ว 9.5" });
  });
});

describe("attendance: paper against the app", () => {
  const att = (csv: string) => rc.reconcile({ backup, attendance: rc.parseTable(csv) }).attendance;

  it("the day's roll matches — and a per-period session on the same day is not mistaken for it", () => {
    const sec = att("วันที่,รหัส,สถานะ\n2026-10-05,101,มา\n2026-10-05,102,สาย\n2026-10-05,103,ขาด");
    expect(sec).toMatchObject({ paper: 3, matched: 3 });
    expect(sec.differences).toEqual([]);
  });

  it("says what differs, what the app never marked, and what the paper never mentioned", () => {
    const sec = att("วันที่,รหัส,สถานะ\n2026-10-05,101,ขาด\n2026-10-06,101,มา\n2026-10-05,102,สาย");
    expect(kinds(sec)).toEqual(["differs", "missing_in_app", "not_on_paper"]);
    expect(sec.differences[0]).toMatchObject({ paper: "ขาด", app: "มา" });
    expect(sec.differences[1].app).toBe("ไม่ได้เช็คในแอป");
    expect(sec.differences[2]).toMatchObject({ what: "2026-10-05", app: "ขาด" }); // s3 was marked absent in the app, the paper skipped them
  });

  it("refuses a date that is not year-month-day (a Buddhist-era year would silently match nothing)", () => {
    const sec = att("วันที่,รหัส,สถานะ\n5/10/2569,101,มา\n2569-10-05,101,มา");
    expect(sec.differences.map((d: any) => d.kind)).toEqual(["unreadable", "missing_in_app"]);
    expect(sec.differences[0].app).toMatch(/ปปปป-ดด-วว/);
  });

  it("an unreadable status and an unknown child are reported, not skipped", () => {
    expect(kinds(att("วันที่,รหัส,สถานะ\n2026-10-05,101,บางที\n2026-10-05,555,มา"))).toEqual(["unreadable", "unknown_student"]);
  });
});

describe("the report", () => {
  it("says 'all agree' when the paper covers the class and matches, with the counts", () => {
    const paper = scores("รหัส,งาน,คะแนน\n101,ใบงาน 1,8\n102,ใบงาน 1,9.5\n103,ใบงาน 1,-");
    const text = rc.formatReport(rc.reconcile({ backup, scores: paper }), { backupName: "b.json", exportedAt: backup.exported_at });
    expect(text).toContain("เทียบกับบันทึกกระดาษ — ไฟล์สำรอง b.json (ส่งออก 2026-10-05 17:00)");
    expect(text).toMatch(/คะแนน: 3 รายการในกระดาษ · ตรงกัน 3 \(100\.0%\)/);
    expect(text).toContain("✔ ตรงกันทุกรายการ");
  });

  it("a paper that skips a child the app has a hand-in for is NOT 'all agree'", () => {
    const text = rc.formatReport(rc.reconcile({ backup, scores: scores("รหัส,งาน,คะแนน\n101,ใบงาน 1,8") }));
    expect(text).not.toContain("✔ ตรงกันทุกรายการ");
    expect(text).toMatch(/แอปมี กระดาษไม่ได้จด 1/);
  });

  it("lists every difference with the line in the paper file, and ends with what to do", () => {
    const text = rc.formatReport(rc.reconcile({ backup, scores: scores("รหัส,งาน,คะแนน\n101,ใบงาน 1,9\n102,ใบงาน 1,9.5") }));
    expect(text).toMatch(/ตรงกัน 1 \(50\.0%\)/);
    expect(text).toMatch(/บรรทัด 2: .*ใบงาน 1 · กระดาษ: ส่งแล้ว 9 · แอป: ส่งแล้ว 8/);
    expect(text).toMatch(/✘ ไม่ตรง 1 รายการ — ตรวจต้นฉบับกระดาษก่อน/);
  });

  it("an empty paper file is not 'all agree'", () => {
    expect(rc.formatReport(rc.reconcile({ backup, scores: [] }))).toContain("ไม่มีข้อมูลในกระดาษให้เทียบ");
  });

  it("the CSV of differences opens correctly in Excel (BOM), with quotes escaped", () => {
    const csv = rc.differencesCsv(rc.reconcile({ backup, scores: scores('รหัส,งาน,คะแนน\n101,"ใบงาน, ""1""",9') }));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"ไม่พบ');
    expect(csv.split("\r\n")[0]).toContain("ประเภทความต่าง");
  });
});

describe("the command line", () => {
  let dir = ""; // its own folder per test, so two runs at once cannot collide
  const put = (name: string, body: string) => { const p = path.join(dir, name); writeFileSync(p, body); return p; };
  beforeEach(() => { dir = mkdtempSync(path.resolve(__dirname, "../../node_modules/.trial-reconcile-test-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const quiet = async <T,>(fn: () => T) => { const log = console.log, error = console.error; const out: string[] = []; console.log = (...a) => out.push(a.join(" ")); console.error = (...a) => out.push(a.join(" ")); try { return { code: fn(), out: out.join("\n") }; } finally { console.log = log; console.error = error; } };

  it("exit 0 when everything agrees, 1 when anything differs, 2 when it cannot even start", async () => {
    const b = put("b.json", JSON.stringify(backup));
    const good = put("good.csv", "รหัส,งาน,คะแนน\n101,ใบงาน 1,8\n102,ใบงาน 1,9.5\n103,ใบงาน 1,-");
    const bad = put("bad.csv", "รหัส,งาน,คะแนน\n101,ใบงาน 1,7");
    expect((await quiet(() => rc.main(["--backup", b, "--scores", good]))).code).toBe(0);
    const r = await quiet(() => rc.main(["--backup", b, "--scores", bad, "--csv", path.join(dir, "d.csv")]));
    expect(r.code).toBe(1);
    expect(readFileSync(path.join(dir, "d.csv"), "utf8")).toContain("ไม่ตรงกัน");
    expect((await quiet(() => rc.main(["--scores", good]))).code).toBe(2);
    expect((await quiet(() => rc.main(["--backup", path.join(dir, "missing.json"), "--scores", good]))).code).toBe(2);
    expect((await quiet(() => rc.main(["--backup", put("x.json", "{}"), "--scores", good]))).out).toMatch(/ไม่ใช่ไฟล์สำรอง/);
  });

  it("warns when the backup file fails its own integrity check", async () => {
    const tampered = JSON.parse(JSON.stringify(backup));
    tampered.data.submissions[0].score = 10; // edited after the file was made
    const b = put("t.json", JSON.stringify(tampered));
    const csv = put("s.csv", "รหัส,งาน,คะแนน\n101,ใบงาน 1,10");
    const r = await quiet(() => rc.main(["--backup", b, "--scores", csv]));
    expect(r.out).toMatch(/sha256\) ไม่ตรง/);
  });

  it("--json gives machine-readable output", async () => {
    const b = put("b.json", JSON.stringify(backup));
    const csv = put("s.csv", "รหัส,งาน,คะแนน\n101,ใบงาน 1,8");
    const r = await quiet(() => rc.main(["--backup", b, "--scores", csv, "--json"]));
    expect(JSON.parse(r.out).summary.scores).toMatchObject({ paper: 1, matched: 1, differences: 1 }); // s2's hand-in is not on this paper
  });
});

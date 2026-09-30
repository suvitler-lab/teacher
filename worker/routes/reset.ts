import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth, clearSession, checkLoginRate, recordLoginFailure, clearLoginFailures, clientKey } from "../lib/auth";
import { readJson, tooMany, bad, ApiError } from "../lib/http";
import { verifyPassword } from "../lib/crypto";
import { pepperOf } from "../lib/config";

export const resetRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
resetRoutes.use("/api/admin/*", requireAuth);

// The words the teacher types to confirm (the screen shows the same ones).
export const RESET_PHRASE = { data: "ล้างข้อมูล", all: "ล้างทั้งหมด" } as const;

const schema = z.object({
  mode: z.enum(["data", "all"]),
  password: z.string().min(1),
  confirm: z.string(),
});

// What "all" puts back: the same defaults a brand-new database starts with (migrations/0002_defaults.sql).
const DEFAULT_SETTINGS: [string, string][] = [
  ["school_name", "โรงเรียนบ้านตัวอย่าง"], ["teacher_name", "ครูผู้สอน"], ["app_title", "งานครบ"], ["late_after", "08:30"],
  ["theme", "system"], ["accent", "blue"], ["sound_enabled", "1"], ["accept_student_code_scan", "0"],
  ["parent_portal_enabled", "0"], ["last_backup_at", ""],
];
const DEFAULT_WORK_TYPES: [string, string, string, string, number, number, number][] = [
  ["wt_exercise", "แบบฝึกหัด", "pencil", "aqua", 0, 10, 10],
  ["wt_worksheet", "ใบงาน", "file-text", "violet", 0, 10, 20],
  ["wt_activity", "ใบกิจกรรม", "flask", "orange", 0, 10, 30],
  ["wt_project", "ชิ้นงาน/โครงงาน", "palette", "green", 0, 20, 40],
  ["wt_homework", "การบ้าน", "backpack", "blue", 0, 10, 50],
  ["wt_quiz", "สอบย่อย", "certificate", "magenta", 1, 20, 60],
  ["wt_midterm", "สอบกลางภาค", "school", "red", 1, 30, 70],
  ["wt_final", "สอบปลายภาค", "trophy", "red", 1, 40, 80],
];

/**
 * Start over — for a teacher who has been trying the app out, or is handing it to someone new.
 *  - data: every class, child, term, subject, piece of work, score and roll-call goes; the account, the
 *    signed-in devices and the settings stay, and the welcome guide comes back.
 *  - all:  the above AND the account, devices, settings and work types → the first-run screen again.
 * The password is asked again (a signed-in but unattended tablet must not be able to do this) and the
 * confirmation words are checked here, not just on screen. One batch: it happens completely or not at all.
 */
resetRoutes.post("/api/admin/reset", async (c) => {
  const b = schema.parse(await readJson(c));
  if (b.confirm.trim() !== RESET_PHRASE[b.mode]) throw bad("bad_confirm", `พิมพ์ “${RESET_PHRASE[b.mode]}” ให้ตรง`);

  const key = "reset:" + clientKey(c);
  if (!(await checkLoginRate(c.env, key))) throw tooMany("ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่");
  const row = await c.env.DB.prepare("SELECT id, password_hash AS hash, salt, iterations FROM teacher LIMIT 1")
    .first<{ id: string; hash: string; salt: string; iterations: number }>();
  if (!row || !(await verifyPassword(b.password, pepperOf(c.env), row))) {
    await recordLoginFailure(c.env, key);
    throw new ApiError(403, "wrong_password", "รหัสผ่านไม่ถูกต้อง"); // 403: still signed in (a 401 would pop the sign-in box)
  }
  await clearLoginFailures(c.env, key);

  const db = c.env.DB;
  const del = (t: string) => db.prepare(`DELETE FROM ${t}`);
  const stmts = [
    db.prepare("PRAGMA defer_foreign_keys = on"),
    // children first
    ...["audit_logs", "attendance", "attendance_sessions", "submissions", "scan_sessions", "assignment_classes",
      "assignments", "revoked_qr_tokens", "students", "subjects", "classes", "terms", "restore_staging", "restore_jobs"].map(del),
    // queued work on other devices belongs to the data that just went: hold it for review, don't apply it
    db.prepare("INSERT INTO meta (key, value) VALUES ('data_epoch', '2') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1"),
  ];
  if (b.mode === "data") {
    stmts.push(db.prepare("INSERT INTO settings (key, value) VALUES ('onboarding_done', '0') ON CONFLICT(key) DO UPDATE SET value = '0'"));
  } else {
    stmts.push(...["sessions", "devices", "login_attempts", "teacher", "settings", "work_types"].map(del));
    for (const [k, v] of DEFAULT_SETTINGS) stmts.push(db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").bind(k, v));
    for (const w of DEFAULT_WORK_TYPES) {
      stmts.push(db.prepare("INSERT INTO work_types (id, name, icon, color, is_exam, default_full, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0)").bind(...w));
    }
  }
  await db.batch(stmts);
  if (b.mode === "all") await clearSession(c); // this device's session went with the account: drop its cookie too
  return c.json({ ok: true, mode: b.mode });
});

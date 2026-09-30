import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { readJson, bad, conflict, ApiError } from "../lib/http";
import { setSetting, boolKey, getEpoch } from "../lib/db";
import { batchAtEpoch, epochChanged, epochGuard, requestEpoch } from "../lib/guard";
import { id } from "@shared/ids";
import { writeAudit, auditInsertStmt } from "../lib/audit";
import { currentYear } from "../lib/roster";

export const catalogRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
catalogRoutes.use("/api/settings", requireAuth);
catalogRoutes.use("/api/settings/*", requireAuth);
catalogRoutes.use("/api/terms", requireAuth);
catalogRoutes.use("/api/terms/*", requireAuth);
catalogRoutes.use("/api/classes", requireAuth);
catalogRoutes.use("/api/classes/*", requireAuth);
catalogRoutes.use("/api/subjects", requireAuth);
catalogRoutes.use("/api/subjects/*", requireAuth);
catalogRoutes.use("/api/work-types", requireAuth);
catalogRoutes.use("/api/work-types/*", requireAuth);

// ---- settings ------------------------------------------------------------
const ALLOWED_SETTINGS = new Set([
  "school_name",
  "teacher_name",
  "app_title",
  "late_after",
  "theme",
  "accent",
  "sound_enabled",
  "accept_student_code_scan",
  "parent_portal_enabled",
  "onboarding_done",
  "last_backup_at",
  "period_times",
]);

catalogRoutes.put("/api/settings", async (c) => {
  const body = (await readJson(c)) as Record<string, unknown>;
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_SETTINGS.has(k)) continue;
    const value = boolKey(k) ? Boolean(v) : String(v ?? "");
    await setSetting(c.env, k, value);
  }
  await writeAudit(c.env, [
    { entity: "settings", action: "update", device_id: c.get("deviceId"), after: body },
  ]);
  return c.json({ ok: true });
});

// ---- terms ---------------------------------------------------------------
const termSchema = z.object({
  id: z.string().optional(),
  year: z.number().int(),
  term: z.number().int().min(1).max(3),
  name: z.string().min(1),
  is_current: z.boolean().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

catalogRoutes.post("/api/terms", async (c) => {
  const b = termSchema.parse(await readJson(c));
  if (b.start_date && b.end_date && b.end_date < b.start_date) throw bad("bad_range", "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  const now = Date.now();
  const tid = b.id ?? id("term");
  const existing = await c.env.DB.prepare("SELECT year FROM terms WHERE id = ?").bind(tid).first<{ year: number }>();
  // classes and their children are filed under the term's YEAR — changing it would strand them
  if (existing && existing.year !== b.year) {
    throw conflict("term_year_locked", "เปลี่ยนปีการศึกษาของภาคเรียนที่มีอยู่ไม่ได้ — สร้างภาคเรียนใหม่ด้วย “เริ่มภาคเรียนใหม่” แทน");
  }
  if (b.is_current) {
    const cur = await c.env.DB.prepare("SELECT id, year FROM terms WHERE is_current = 1 AND id != ?").bind(tid).first<{ id: string; year: number }>();
    if (cur && cur.year !== b.year) {
      // moving to another academic year also means new classes and finishing the old ones — one guided step
      throw conflict("use_start_term", "การเปลี่ยนไปปีการศึกษาอื่นต้องใช้ “เริ่มภาคเรียนใหม่” (สร้างห้องปีใหม่ให้พร้อมกัน)");
    }
  }
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO terms (id, year, term, name, is_current, start_date, end_date, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET year=excluded.year, term=excluded.term, name=excluded.name, is_current=excluded.is_current, start_date=excluded.start_date, end_date=excluded.end_date, updated_at=excluded.updated_at`,
    ).bind(tid, b.year, b.term, b.name, b.is_current ? 1 : 0, b.start_date ?? null, b.end_date ?? null, now),
  ];
  if (b.is_current) {
    stmts.push(c.env.DB.prepare("UPDATE terms SET is_current = 0 WHERE id != ?").bind(tid));
  }
  await batchAtEpoch(c.env, await requestEpoch(c), stmts);
  return c.json({ ok: true, id: tid });
});

// Start a new term. Within one academic year (1/2569 → 2/2569) it only adds the term and makes it
// current. Across years (2/2569 → 1/2570) it also opens the new year's classes (same names, empty),
// archives last year's classes and marks the children still in them "finished" — last year's classes,
// children and work stay exactly as they were, so last year's reports never change.
const startTermSchema = z.object({
  expectedCurrentTermId: z.string().nullable(),
  year: z.number().int().min(2400).max(2700),
  term: z.number().int().min(1).max(3),
  name: z.string().min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  keepClasses: z.array(z.string()).max(100).optional(),   // last year's classes to open again this year
  closeOpenWork: z.boolean().optional(),                  // close last year's work that is still open
});

catalogRoutes.post("/api/terms/start", async (c) => {
  const b = startTermSchema.parse(await readJson(c));
  const db = c.env.DB;
  const epoch = await requestEpoch(c);
  if (b.end_date && b.end_date < b.start_date) throw bad("bad_range", "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");

  const cur = await db.prepare("SELECT id, year, term FROM terms WHERE is_current = 1 LIMIT 1")
    .first<{ id: string; year: number; term: number }>();
  const curId = cur?.id ?? null;
  const changed = () => conflict("term_changed", "ภาคเรียนปัจจุบันเปลี่ยนไปแล้ว (อาจมีการกดซ้ำหรือทำจากอีกเครื่อง) — โหลดข้อมูลใหม่แล้วดูอีกครั้ง");
  if (b.expectedCurrentTermId !== curId) throw changed(); // a second tap, another device, or a page opened before the last change
  if (cur && (b.year < cur.year || (b.year === cur.year && b.term <= cur.term))) {
    throw new ApiError(422, "term_backwards", "ภาคเรียนใหม่ต้องมาหลังภาคเรียนปัจจุบัน");
  }
  const dup = await db.prepare("SELECT id FROM terms WHERE year = ? AND term = ?").bind(b.year, b.term).first();
  if (dup) throw conflict("term_exists", `มีภาคเรียน ${b.term}/${b.year} อยู่แล้ว — ตั้งเป็นภาคเรียนปัจจุบันจากหน้าตั้งค่าได้เลย`);

  // dates must not run into another term (a term with no end date only claims its start day)
  const others = await db.prepare("SELECT name, start_date, end_date FROM terms WHERE start_date IS NOT NULL")
    .all<{ name: string; start_date: string; end_date: string | null }>();
  const newEnd = b.end_date ?? "9999-12-31";
  for (const t of others.results ?? []) {
    const tEnd = t.end_date ?? t.start_date;
    if (t.start_date <= newEnd && b.start_date <= tEnd) {
      throw new ApiError(422, "terms_overlap", `วันที่ทับกับภาคเรียน ${t.name} (${t.start_date} – ${t.end_date ?? "ไม่ระบุวันสิ้นสุด"}) — แก้วันที่ก่อน`);
    }
  }

  const newYear = !cur || b.year > cur.year;
  const now = Date.now();
  const tid = id("term");
  const stmts: D1PreparedStatement[] = [
    epochGuard(c.env, epoch), // a restore since this request began: the term list it saw is gone
    // the guard INSIDE the batch: if another request moved "current" since the check above, json() raises
    // and the whole batch rolls back — two starts can never both apply
    db.prepare("SELECT CASE WHEN COALESCE((SELECT id FROM terms WHERE is_current = 1 LIMIT 1), '') = ?1 THEN 1 ELSE json('term_changed') END")
      .bind(curId ?? ""),
    db.prepare("UPDATE terms SET is_current = 0 WHERE is_current = 1"),
    db.prepare("INSERT INTO terms (id, year, term, name, is_current, start_date, end_date, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)")
      .bind(tid, b.year, b.term, b.name, b.start_date, b.end_date ?? null, now),
  ];

  let opened: { id: string; from: string; name: string }[] = [];
  let finished = 0;
  if (newYear) {
    // last year's classes = the current year's (a legacy class with no year counts as belonging to it)
    const oldYear = cur?.year ?? null;
    const olds = await db.prepare(
      "SELECT id, name, grade, sort FROM classes WHERE archived = 0 AND (?1 IS NULL OR year IS NULL OR year = ?1)",
    ).bind(oldYear).all<{ id: string; name: string; grade: string | null; sort: number }>();
    const oldList = olds.results ?? [];
    const oldIds = new Set(oldList.map((x) => x.id));
    for (const k of b.keepClasses ?? []) {
      if (!oldIds.has(k)) throw bad("bad_class", "ห้องที่เลือกไม่ใช่ห้องของปีการศึกษาปัจจุบัน");
    }
    const keep = oldList.filter((x) => (b.keepClasses ?? []).includes(x.id));
    opened = keep.map((x) => ({ id: id("cls"), from: x.id, name: x.name }));
    const idOf = new Map(opened.map((o) => [o.from, o.id]));

    const cnt = await db.prepare(
      "SELECT COUNT(*) AS n FROM students s WHERE s.class_id IN (SELECT value FROM json_each(?1)) AND s.status = 'active'",
    ).bind(JSON.stringify([...oldIds])).first<{ n: number }>();
    finished = cnt?.n ?? 0;

    if (keep.length > 0) {
      stmts.push(db.prepare(
        `INSERT INTO classes (id, name, grade, sort, archived, year, updated_at)
         SELECT json_extract(j.value,'$.id'), json_extract(j.value,'$.name'), json_extract(j.value,'$.grade'),
                json_extract(j.value,'$.sort'), 0, ?2, ?3 FROM json_each(?1) j`,
      ).bind(JSON.stringify(keep.map((x) => ({ id: idOf.get(x.id), name: x.name, grade: x.grade, sort: x.sort }))), b.year, now));
    }
    if (oldIds.size > 0) {
      const oldJson = JSON.stringify([...oldIds]);
      stmts.push(
        db.prepare("UPDATE students SET status = 'finished', left_at = NULL, updated_at = ?2 WHERE status = 'active' AND class_id IN (SELECT value FROM json_each(?1))").bind(oldJson, now),
        db.prepare("UPDATE classes SET archived = 1, year = COALESCE(year, ?3), updated_at = ?2 WHERE id IN (SELECT value FROM json_each(?1))").bind(oldJson, now, oldYear),
      );
    }
    if (b.closeOpenWork && oldYear != null) {
      stmts.push(db.prepare(
        "UPDATE assignments SET status = 'closed', updated_at = ?2 WHERE status = 'open' AND deleted_at IS NULL AND term_id IN (SELECT id FROM terms WHERE year = ?1)",
      ).bind(oldYear, now));
    }
  }
  stmts.push(auditInsertStmt(c.env, [{
    entity: "term", entity_id: tid, action: newYear ? "start_year" : "start_term", device_id: c.get("deviceId") ?? null,
    before: cur ? { id: cur.id, year: cur.year, term: cur.term } : null,
    after: { id: tid, year: b.year, term: b.term, opened: opened.length, finished, closeOpenWork: !!b.closeOpenWork },
    method: "manual",
  }], now));

  try {
    await db.batch(stmts);
  } catch (e) {
    // an in-batch guard fired: a restore landed, or someone else started a term between our check and the write
    if ((await getEpoch(c.env)) !== epoch) throw epochChanged();
    const after = await db.prepare("SELECT id FROM terms WHERE is_current = 1 LIMIT 1").first<{ id: string }>();
    if ((after?.id ?? null) !== curId) throw changed();
    throw e;
  }
  return c.json({ ok: true, termId: tid, newYear, classes: opened, finished });
});

// ---- classes -------------------------------------------------------------
const classSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  grade: z.string().optional().nullable(),
  sort: z.number().int().optional(),
  archived: z.boolean().optional(),
});

catalogRoutes.post("/api/classes", async (c) => {
  const b = classSchema.parse(await readJson(c));
  const now = Date.now();
  const cid = b.id ?? id("cls");
  // a class belongs to one academic year: a new class is filed under the current year, an existing one keeps its own
  const existing = await c.env.DB.prepare("SELECT year FROM classes WHERE id = ?").bind(cid).first<{ year: number | null }>();
  const cur = await currentYear(c.env);
  if (existing && existing.year != null && cur != null && existing.year !== cur && !b.archived) {
    throw conflict("class_of_past_year", "ห้องนี้เป็นของปีการศึกษาที่ผ่านมา นำกลับมาใช้ไม่ได้ — เพิ่มห้องใหม่ในปีนี้แทน");
  }
  await batchAtEpoch(c.env, await requestEpoch(c), [c.env.DB.prepare(
    `INSERT INTO classes (id, name, grade, sort, archived, year, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, grade=excluded.grade, sort=excluded.sort, archived=excluded.archived, updated_at=excluded.updated_at`,
  )
    .bind(cid, b.name, b.grade ?? null, b.sort ?? 0, b.archived ? 1 : 0, existing ? existing.year : cur, now)]);
  return c.json({ ok: true, id: cid });
});

// ---- subjects ------------------------------------------------------------
const subjectSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional().nullable(),
  name: z.string().min(1),
  color: z.string().optional(),
  sort: z.number().int().optional(),
  archived: z.boolean().optional(),
});

catalogRoutes.post("/api/subjects", async (c) => {
  const b = subjectSchema.parse(await readJson(c));
  const now = Date.now();
  const sid = b.id ?? id("sub");
  await batchAtEpoch(c.env, await requestEpoch(c), [c.env.DB.prepare(
    `INSERT INTO subjects (id, code, name, color, sort, archived, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, color=excluded.color, sort=excluded.sort, archived=excluded.archived, updated_at=excluded.updated_at`,
  )
    .bind(sid, b.code ?? null, b.name, b.color ?? "blue", b.sort ?? 0, b.archived ? 1 : 0, now)]);
  return c.json({ ok: true, id: sid });
});

// ---- work types ----------------------------------------------------------
const workTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  is_exam: z.boolean().optional(),
  default_full: z.number().int().min(1).max(100).optional(),
  sort: z.number().int().optional(),
  archived: z.boolean().optional(),
});

catalogRoutes.post("/api/work-types", async (c) => {
  const b = workTypeSchema.parse(await readJson(c));
  const now = Date.now();
  const wid = b.id ?? id("wt");
  await batchAtEpoch(c.env, await requestEpoch(c), [c.env.DB.prepare(
    `INSERT INTO work_types (id, name, icon, color, is_exam, default_full, sort, archived, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon, color=excluded.color, is_exam=excluded.is_exam, default_full=excluded.default_full, sort=excluded.sort, archived=excluded.archived, updated_at=excluded.updated_at`,
  )
    .bind(
      wid,
      b.name,
      b.icon ?? "file-text",
      b.color ?? "violet",
      b.is_exam ? 1 : 0,
      b.default_full ?? 10,
      b.sort ?? 0,
      b.archived ? 1 : 0,
      now,
    )]);
  return c.json({ ok: true, id: wid });
});

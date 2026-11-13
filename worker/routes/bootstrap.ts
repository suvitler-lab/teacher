import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireAuth } from "../lib/auth";
import { getSettings, getEpoch } from "../lib/db";
import { mapTerm, mapClass, mapSubject, mapWorkType, mapStudent, mapAssignment } from "../lib/rows";
import { mapSlot, SLOT_COLUMNS, DEFAULT_TERM_SQL } from "../lib/timetable";
import type { Bootstrap } from "@shared/types";

export const bootstrapRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

bootstrapRoutes.get("/api/bootstrap", requireAuth, async (c) => {
  const db = c.env.DB;
  const sixtyDaysAgo = Date.now() - 60 * 24 * 3600 * 1000;
  const [settings, terms, classes, subjects, workTypes, students, assignments, links, revoked, rotated, ttSlots] =
    await Promise.all([
      getSettings(c.env),
      db.prepare("SELECT * FROM terms ORDER BY year DESC, term DESC").all(),
      db.prepare("SELECT * FROM classes ORDER BY archived, sort, name").all(),
      db.prepare("SELECT * FROM subjects ORDER BY archived, sort, name").all(),
      db.prepare("SELECT * FROM work_types ORDER BY archived, sort").all(),
      db
        .prepare(
          "SELECT id, code, qr_token, prefix, first_name, last_name, nickname, class_id, number, status, left_at, updated_at FROM students WHERE status != 'inactive' ORDER BY class_id, number IS NULL, number",
        )
        .all(),
      db.prepare("SELECT * FROM assignments WHERE deleted_at IS NULL ORDER BY updated_at DESC").all(),
      db.prepare("SELECT assignment_id, class_id FROM assignment_classes").all(),
      db.prepare("SELECT token, student_id FROM revoked_qr_tokens").all(),
      db.prepare(
        "SELECT student_id, MAX(revoked_at) AS at FROM revoked_qr_tokens WHERE revoked_at >= ? GROUP BY student_id",
      ).bind(sixtyDaysAgo).all<{ student_id: string; at: number }>(),
      // the current term's timetable (EP-11): the term is picked in SQL so this runs beside the other reads
      db.prepare(
        `SELECT t.id AS term_id, t.timetable_rev AS rev, ${SLOT_COLUMNS.split(", ").map((c) => `s.${c}`).join(", ")}
         FROM (${DEFAULT_TERM_SQL}) t LEFT JOIN timetable_slots s ON s.term_id = t.id ORDER BY s.weekday, s.period`,
      ).all(),
    ]);

  const linkMap = new Map<string, string[]>();
  for (const l of (links.results ?? []) as any[]) {
    const arr = linkMap.get(l.assignment_id) ?? [];
    arr.push(l.class_id);
    linkMap.set(l.assignment_id, arr);
  }

  const revokedTokens: Record<string, string> = {};
  for (const r of (revoked.results ?? []) as any[]) revokedTokens[r.token] = r.student_id;

  const qrRotatedAt: Record<string, number> = {};
  for (const r of rotated.results ?? []) qrRotatedAt[r.student_id] = r.at;

  // read BEFORE the data above (by the app's preamble): if a restore lands in between, the screen holds newer data under an
  // older epoch and its next write is refused and reloaded — never the reverse
  const dataEpoch = c.get("dataEpoch") ?? (await getEpoch(c.env));
  const termList = (terms.results ?? []).map(mapTerm);
  const currentTerm = termList.find((t) => t.is_current) ?? termList[0];
  // term, rev and slots come from one statement (one snapshot): a PUT between two reads can't pair a new rev with old slots
  const ttRows = (ttSlots.results ?? []) as any[];

  const payload: Bootstrap = {
    settings,
    terms: termList,
    currentTermId: currentTerm?.id ?? null,
    classes: (classes.results ?? []).map(mapClass),
    subjects: (subjects.results ?? []).map(mapSubject),
    workTypes: (workTypes.results ?? []).map(mapWorkType),
    students: (students.results ?? []).map(mapStudent),
    revokedTokens,
    qrRotatedAt,
    assignments: (assignments.results ?? []).map((a: any) =>
      mapAssignment(a, linkMap.get(a.id) ?? []),
    ),
    timetable: ttRows.length
      ? { termId: ttRows[0].term_id, rev: ttRows[0].rev ?? 0, readOnly: false, slots: ttRows.filter((r) => r.weekday != null).map(mapSlot) }
      : null,
    dataEpoch,
    serverTime: Date.now(),
  };
  return c.json(payload);
});

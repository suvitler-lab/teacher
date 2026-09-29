import type { Env } from "../env";
import type { Settings } from "@shared/types";

export async function getMeta(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

/** Bumped by every restore; queued work made under an older epoch is held for review, not applied. */
export async function getEpoch(env: Env): Promise<number> {
  return Number((await getMeta(env, "data_epoch")) ?? "1") || 1;
}

export async function setMeta(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(key, value)
    .run();
}

const BOOL_KEYS = new Set(["sound_enabled", "accept_student_code_scan", "parent_portal_enabled"]);

export async function getSettings(env: Env): Promise<Settings> {
  const rows = await env.DB.prepare("SELECT key, value FROM settings").all<{
    key: string;
    value: string;
  }>();
  const map: Record<string, string> = {};
  for (const r of rows.results ?? []) map[r.key] = r.value;
  const b = (k: string) => map[k] === "1";
  return {
    school_name: map.school_name ?? "",
    teacher_name: map.teacher_name ?? "",
    app_title: map.app_title ?? "งานครบ",
    late_after: map.late_after ?? "08:30",
    theme: (map.theme as Settings["theme"]) ?? "system",
    accent: map.accent ?? "blue",
    sound_enabled: b("sound_enabled"),
    accept_student_code_scan: b("accept_student_code_scan"),
    parent_portal_enabled: b("parent_portal_enabled"),
    last_backup_at: map.last_backup_at ?? "",
    period_times: map.period_times ?? "",
  };
}

export async function setSetting(env: Env, key: string, value: string | boolean): Promise<void> {
  const v = typeof value === "boolean" ? (value ? "1" : "0") : value;
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(key, v)
    .run();
}

export function boolKey(key: string): boolean {
  return BOOL_KEYS.has(key);
}

export async function teacherExists(env: Env): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS x FROM teacher LIMIT 1").first();
  return !!row;
}

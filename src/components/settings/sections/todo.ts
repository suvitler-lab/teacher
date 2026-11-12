import { backupLine, termLine } from "../SettingsCards";
import type { SectionKey, CatalogTab } from "./registry";

/** One thing on the "ต้องทำ" strip (BR-56 / P10): what is wrong, and the button that goes where it is fixed. */
export interface TodoItem { id: "no-term" | "backup" | "term-ended"; text: string; cta: string; go: { section: SectionKey; tab?: CatalogTab } }

/** The strip's items, in the order of BR-56: no term, backup due, current term ended. Nothing to do = an empty list (no strip). */
export function todoItems(term: { name: string; end_date: string | null } | null, lastBackup: number, now = Date.now(), today?: string): TodoItem[] {
  const out: TodoItem[] = [];
  const t = termLine(term, today);
  if (t.none) out.push({ id: "no-term", text: "ยังไม่ได้ตั้งภาคเรียน", cta: "ตั้งภาคเรียน", go: { section: "catalog", tab: "terms" } });
  const b = backupLine(lastBackup, now);
  if (b.stale) out.push({ id: "backup", text: b.text, cta: "ไปสำรองข้อมูล", go: { section: "backup" } });
  if (t.ended) out.push({ id: "term-ended", text: t.text, cta: "เริ่มภาคเรียนใหม่", go: { section: "catalog", tab: "terms" } });
  return out;
}

/** The yellow dot on the backup entry = item 2 only (BR-56). */
export const backupDue = (lastBackup: number, now = Date.now()): boolean => backupLine(lastBackup, now).stale;

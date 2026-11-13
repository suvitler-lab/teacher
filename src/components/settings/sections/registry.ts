/** The settings sections, their groups and deep links (AC-207, AC-210). One entry per section: a later section only adds a line here. */
export type SectionKey = "general" | "time" | "scan" | "catalog" | "worktypes" | "appearance" | "privacy" | "device" | "devices" | "backup" | "history" | "reset";
export type GroupKey = "often" | "teach" | "device" | "account" | "danger";

export interface SectionDef { key: SectionKey; label: string; icon: string; group: GroupKey }
export const GROUPS: { key: GroupKey; label: string; icon: string }[] = [
  { key: "often", label: "ใช้บ่อย", icon: "star" },
  { key: "teach", label: "การสอน", icon: "books" },
  { key: "device", label: "เครื่องนี้", icon: "device-mobile" },
  { key: "account", label: "บัญชีและข้อมูล", icon: "shield-lock" },
  { key: "danger", label: "โซนอันตราย", icon: "alert-triangle" },
];
export const SECTIONS: SectionDef[] = [
  { key: "general", label: "ภาพรวม", icon: "school", group: "often" },
  { key: "time", label: "เวลาเรียน", icon: "clock", group: "often" },
  { key: "scan", label: "การสแกน", icon: "barcode", group: "often" },
  { key: "catalog", label: "ห้องเรียน วิชา ภาคเรียน", icon: "books", group: "teach" },
  { key: "worktypes", label: "ประเภทงาน", icon: "file-text", group: "teach" },
  { key: "appearance", label: "หน้าตา", icon: "palette", group: "device" },
  { key: "privacy", label: "ความเป็นส่วนตัวและเสียง", icon: "eye-off", group: "device" },
  { key: "device", label: "ตรวจเครื่องและออฟไลน์", icon: "device-mobile-check", group: "device" },
  { key: "devices", label: "บัญชีและอุปกรณ์", icon: "shield-lock", group: "account" },
  { key: "backup", label: "สำรองและกู้คืน", icon: "database-export", group: "account" },
  { key: "history", label: "ประวัติการแก้ไข", icon: "history", group: "account" },
  { key: "reset", label: "เริ่มใหม่ (ล้างข้อมูล)", icon: "trash", group: "danger" },
];

/** Keys of sections that belong to later tasks: a link to one opens the nearest section that exists today (AC-210). */
const ALIAS: Record<string, SectionKey> = { danger: "reset" };

/** Tabs of the catalog editor. (`types` is only accepted in a link: it opens the work types section.) */
export type CatalogTab = "classes" | "subjects" | "terms";

/** `?section=` (+ `&tab=`) to a section: an unknown key -> general; `catalog&tab=types` and the old `worktypes` key -> the work types section. */
export function resolveSection(key: string | undefined, tab?: string): { section: SectionKey; tab?: CatalogTab } {
  if (!key) return { section: "general" };
  const direct = SECTIONS.find((s) => s.key === key)?.key;
  const section = direct ?? (Object.prototype.hasOwnProperty.call(ALIAS, key) ? ALIAS[key] : undefined);
  if (!section) return { section: "general" };
  const t = tab === "terms" || tab === "subjects" || tab === "classes" ? tab : undefined;
  if (section === "catalog" && tab === "types") return { section: "worktypes" };
  if (section === "catalog" && t) return { section, tab: t };
  return { section };
}
export const sectionDef = (k: SectionKey): SectionDef => SECTIONS.find((s) => s.key === k)!;

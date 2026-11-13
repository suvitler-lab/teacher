// Every Thai sentence of the timetable in one place (ux.part-2 microcopy). Screens and the store use these — never their own.
import type { Weekday } from "@shared/timetable";

export const DAY_NAMES: Record<Weekday, string> = { 1: "จันทร์", 2: "อังคาร", 3: "พุธ", 4: "พฤหัส", 5: "ศุกร์", 6: "เสาร์", 7: "อาทิตย์" };
export const DAY_SHORT: Record<Weekday, string> = { 1: "จ.", 2: "อ.", 3: "พ.", 4: "พฤ.", 5: "ศ.", 6: "ส.", 7: "อา." };
export const dayName = (w: Weekday) => DAY_NAMES[w];
export const dayWord = (w: Weekday) => `วัน${DAY_NAMES[w]}`;

export const MSG = {
  pageTitle: "ตารางสอน",
  saveFailed: "บันทึกตารางสอนไม่สำเร็จ",
  retry: "ลองอีกครั้ง",
  changedElsewhere: "ตารางสอนถูกแก้จากเครื่องอื่น — โหลดฉบับล่าสุดแล้ว ลองแก้อีกครั้ง",
  frameChangedElsewhere: "โครงเวลาถูกแก้จากเครื่องอื่น — โหลดใหม่แล้ว ลองอีกครั้ง",
  epochChanged: "ข้อมูลถูกกู้คืนจากไฟล์สำรอง — โหลดตารางใหม่แล้ว",
  readOnlyTerm: "ภาคเรียนของปีการศึกษาที่ผ่านมา ดูได้อย่างเดียว",
  offlineEdit: "ออฟไลน์ — แก้ตารางสอนได้เมื่อออนไลน์",
  noTerm: "ยังไม่มีภาคเรียน — สร้างภาคเรียนก่อนกรอกตารางสอน",
  termNotFound: "ไม่พบภาคเรียนนี้",
  loadFailed: "โหลดตารางสอนไม่สำเร็จ",
  slotSaved: "บันทึกคาบแล้ว",
  undone: "เลิกทำแล้ว",
  frameSaved: "บันทึกเวลาคาบแล้ว",
  emptySummary: "ยังไม่มีคาบ",
  offlineStamp: (hm: string) => `ออฟไลน์ · ข้อมูลเมื่อ ${hm}`,
  pastYear: "ปีการศึกษาที่ผ่านมา · ดูอย่างเดียว",
  archivedBadge: "เก็บแล้ว",
  archivedPrint: "(เก็บแล้ว)",
  deleted: (what: string, dayText: string, period: number) => `ลบคาบ ${what} (${dayText} คาบ ${period}) แล้ว`,
  copied: (n: number) => `คัดลอก ${n} คาบแล้ว`,
  cleared: "ล้างตารางภาคนี้แล้ว",
  copyButton: (termName: string, n: number) => `คัดลอกจากภาค ${termName} (${n} คาบ)`,
  confirmClear: (n: number, termName: string) => `ลบทั้ง ${n} คาบของภาค ${termName}? โครงเวลาไม่เปลี่ยน`,
  confirmReplace: (existing: number, incoming: number, fromName: string) => `แทนที่ ${existing} คาบเดิมด้วย ${incoming} คาบจากภาค ${fromName}?`,
  confirmRemoveSlots: (items: string[], period?: number) => `จะลบ ${items.length} คาบ${period ? `ในคาบ ${period}` : ""}: ${items.join(", ")}`,
  confirmRemoveTerms: (n: number, groups: { name: string; items: string[] }[], period?: number) =>
    `จะลบ ${n} คาบ${period ? `ในคาบ ${period}` : ""} — ${groups.map((g) => `ภาค ${g.name}: ${g.items.join(", ")}`).join(" · ")}`,
  frameBroken: "โครงเวลาที่บันทึกไว้อ่านไม่ได้ — ตั้งเวลาคาบใหม่",
  shortcutAttendance: (room: string, later: boolean) => `เช็คชื่อ ${room}${later ? " (คาบต่อไป)" : ""}`,
  shortcutScan: "สแกนงาน",
  menuAttendance: (room: string) => `เช็คชื่อ ${room}`,
  menuScan: (room: string) => `สแกนส่งงาน ${room}`,
  menuEdit: "แก้คาบนี้",
  menuDelete: "ลบคาบนี้",
  fromTimetable: "จากตารางสอน",
  nowWord: "ตอนนี้",
  nextWord: "ต่อไป",
  passedWord: "ผ่านแล้ว",
  freeWord: "ว่าง",
  stripOpenWeek: "ดูทั้งสัปดาห์",
} as const;

/** "คาบ 2" */
export const periodWord = (n: number) => `คาบ ${n}`;

/** Day label of a "next" line: "" today · "พรุ่งนี้ (อังคาร)" the next calendar day · "วันจันทร์" later. */
export function nextDayLabel(offset: number, weekday: Weekday): string {
  if (offset <= 0) return "";
  return offset === 1 ? `พรุ่งนี้ (${DAY_NAMES[weekday]})` : dayWord(weekday);
}

/** "ตอนนี้ · คาบ 2 · ถึง 10:30 · คณิตศาสตร์ ป.6/4" · break: "ตอนนี้ · พักกลางวัน · ถึง 12:30" */
export function nowLine(p: { kind: "period"; period: number; end: string; title: string } | { kind: "break"; name: string; end: string }): string {
  return p.kind === "break"
    ? `ตอนนี้ · ${p.name} · ถึง ${p.end}`
    : `ตอนนี้ · ${periodWord(p.period)} · ถึง ${p.end} · ${p.title}`;
}

/** "ต่อไป · คาบ 4 · 12:30 · …" · other day: "ต่อไป · พรุ่งนี้ (อังคาร) · คาบ 2 · 09:30 · …" */
export function nextLine(n: { dayLabel: string; period: number; start: string; title: string }): string {
  return ["ต่อไป", n.dayLabel, periodWord(n.period), n.start, n.title].filter(Boolean).join(" · ");
}

/** The one-sentence screen-reader text of the strip. */
export function stripSentence(now: string | null, next: string | null): string {
  return [now, next].filter(Boolean).join(" ");
}

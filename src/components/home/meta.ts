import type { HomeCardKey } from "../../lib/homeCards";
import { W } from "../../lib/pageColumns";

/** What each card is called and does, for the "ปรับหน้าหลัก" list. `fresh` = a card added after the first design round. */
export const CARD_META: Record<HomeCardKey, { title: string; icon: string; desc: string; fresh?: boolean }> = {
  open: { title: "งานที่กำลังเก็บ", icon: "clipboard-list", desc: "ความคืบหน้าทุกห้อง เรียงใกล้กำหนดก่อน" },
  att: { title: "เช็คชื่อวันนี้", icon: "user-check", desc: "ห้องไหนเช็คแล้ว ยังเหลือใคร" },
  follow: { title: "ต้องติดตาม", icon: "flag", desc: "นักเรียนที่ค้างส่งมากที่สุด" },
  due: { title: "ครบกำหนดวันนี้/พรุ่งนี้", icon: "calendar-due", desc: "ใครยังไม่ส่ง จะได้เตือนก่อนเลิกเรียน · คัดลอกไป LINE ได้", fresh: true },
  absent: { title: "ใครไม่มาวันนี้", icon: "user-x", desc: "ขาด ลา ป่วย สาย รายห้อง หลังเช็คชื่อ", fresh: true },
  classes: { title: "ห้องของฉัน", icon: "school", desc: "จำนวนคน อัตราส่ง และมาเรียนรายห้อง" },
  queue: { title: "ค้างในเครื่องนี้", icon: "device-mobile", desc: "รายการที่ยังไม่ขึ้นระบบ / ส่งไม่สำเร็จ" },
  backup: { title: "สำรองข้อมูล", icon: "database-export", desc: "สำรองล่าสุดและปุ่มดาวน์โหลด" },
  term: { title: "ภาคเรียน", icon: "calendar-stats", desc: "เทอมปัจจุบัน ช่วงวัน สัปดาห์ที่ผ่านไป" },
};

/** Rough height of each card (~ height / 8rem) so the columns on a wide screen come out level. Static on purpose: cards must not jump when they load. */
export const CARD_WEIGHT: Record<HomeCardKey, number> = {
  open: W.L, att: W.M, follow: W.M, due: W.M, absent: W.S, classes: W.L, queue: W.S, backup: W.S, term: W.S,
};

import type { CardMeta } from "./PageCardSettings";
import { W } from "../../lib/pageColumns";

/** What each card of the scan, attendance and random-name pages is called and does, for the "ปรับการ์ด" drawer. */
export const SCAN_CARD_META: Record<string, CardMeta> = {
  recent: { title: "สแกนล่าสุด", icon: "clock", desc: "รายการที่สแกนในรอบนี้ · ยกเลิกได้จากรายการ" },
  hid: { title: "ป้ายเครื่องยิง + ทดสอบ", icon: "barcode", desc: "บอกว่าเครื่องยิงพร้อมไหม" },
  hint: { title: "คำแนะนำโหมด", icon: "info-circle", desc: "บรรทัดช่วยใต้ผลสแกน (เหมาะกับครูที่เพิ่งเริ่มใช้)" },
};
export const SCAN_LOCKED = "ช่องสแกน · ผังเลขที่ · รายการส่งไม่สำเร็จ · แถบวันที่รับงาน";

export const ATT_CARD_META: Record<string, CardMeta> = {
  sum: { title: "สรุปวันนี้", icon: "chart-bar", desc: "มา x จาก y คน แถบสี และตัวเลขแต่ละสถานะ" },
  week: { title: "แถบสัปดาห์", icon: "calendar", desc: "จันทร์–ศุกร์ ห้องนี้เช็คแล้วหรือยัง" },
  scans: { title: "สแกนล่าสุด", icon: "qrcode", desc: "แสดงเฉพาะตอนใช้โหมดสแกน QR" },
  todo: { title: "ใครยังไม่เช็ค", icon: "user-off", desc: "รายเลขที่ แตะแล้วเลื่อนไปช่องนั้น", fresh: true },
  away: { title: "ขาดวันนี้", icon: "user-x", desc: "ขาด ลา ป่วย รายชื่อ (ใช้ตอนยืนหน้าห้อง)", fresh: true },
};
export const ATT_LOCKED = "ปุ่มสถานะ · ช่องรายชื่อ · แถบบันทึก · รายการชนกัน/ต้องตรวจสอบ";

export const RANDOM_CARD_META: Record<string, CardMeta> = {
  hist: { title: "เรียกแล้ว", icon: "users", desc: "ชิปคนที่ถูกเรียก เหลือกี่คนในรอบนี้ เริ่มรอบใหม่" },
  opts: { title: "ตัวเลือก", icon: "list-numbers", desc: "ไม่ซ้ำจนครบ · จำนวนคน/กลุ่มละ" },
  timer: { title: "จับเวลาตอบ", icon: "stopwatch", desc: "นับถอยหลัง 10/30/60 วินาทีหลังสุ่ม", fresh: true },
  pass: { title: "ข้าม / เลิกทำ", icon: "arrow-back-up", desc: "ข้ามคนนี้ (ไม่นับว่าเรียกแล้ว) หรือเลิกทำครั้งล่าสุด", fresh: true },
  range: { title: "ช่วงเลขที่", icon: "selector", desc: "สุ่มเฉพาะเลขที่ x ถึง y", fresh: true },
  pair: { title: "จับคู่", icon: "users-group", desc: "สุ่ม 2 คน แสดงเป็นคู่ \"A คู่กับ B\"", fresh: true },
  gopts: { title: "ตัวเลือกกลุ่ม", icon: "crown", desc: "เลือกจำนวนกลุ่ม · หัวหน้ากลุ่ม · คัดลอก", fresh: true },
};
export const RANDOM_LOCKED = "ชิปห้อง · แถบเหตุผล · เวทีแสดงชื่อ · ปุ่มสุ่ม/จับกลุ่ม";

export const SETTINGS_CARD_META: Record<string, CardMeta> = {
  status: { title: "เครื่องนี้", icon: "device-mobile-check", desc: "ออนไลน์ไหม มีงานค้างส่งกี่รายการ เก็บข้อมูลถาวรและใช้ออฟไลน์ได้ไหม", fresh: true },
  backup: { title: "สำรองล่าสุด", icon: "database-export", desc: "สำรองเมื่อไร เลยกำหนด 7 วันไหม", fresh: true },
  term: { title: "ภาคเรียนปัจจุบัน", icon: "calendar-stats", desc: "เทอมไหน เหลือกี่วัน เริ่มภาคเรียนใหม่ได้จากที่นี่", fresh: true },
  devices: { title: "อุปกรณ์ล่าสุด", icon: "devices", desc: "เครื่องที่เข้าสู่ระบบล่าสุด 3 เครื่อง", fresh: true },
  history: { title: "แก้ไขล่าสุด", icon: "history", desc: "5 รายการแก้ไขล่าสุด", fresh: true },
};
export const SETTINGS_LOCKED = "เมนู 7 หมวด · ฟอร์มและสวิตช์ทุกตัว · ปุ่มสำรอง/กู้คืน/ล้างข้อมูล (การ์ดอยู่บนหมวด \"ทั่วไป\" เท่านั้น)";

export const GRADEBOOK_CARD_META: Record<string, CardMeta> = {
  summary: { title: "สรุปห้อง", icon: "chart-bar", desc: "งาน · อัตราส่ง · รอตรวจ · ค้างส่ง (ตัวเลขกดกรองแถวได้)", fresh: true },
  awaiting: { title: "รอตรวจ n งาน", icon: "hourglass-empty", desc: "งานไหนรับไว้แล้วยังไม่ให้คะแนน แตะเพื่อเลือกงาน", fresh: true },
  close: { title: "ควรปิดรับ n งาน", icon: "lock", desc: "งานที่เลยกำหนดแล้วแต่ยังเปิดรับอยู่ · ปิดรับได้ทันที", fresh: true },
  legend: { title: "คำอธิบายสัญลักษณ์", icon: "info-circle", desc: "สัญลักษณ์ในช่องคะแนนแปลว่าอะไร (ปิดได้เมื่อจำได้แล้ว)", fresh: true },
  shortcuts: { title: "ปุ่มลัดคีย์บอร์ด", icon: "keyboard", desc: "บรรทัดบอกปุ่มบนคอม (ไม่แสดงบนจอสัมผัส)", fresh: true },
  follow: { title: "ต้องติดตาม", icon: "flag", desc: "เด็กที่ค้างส่งมากที่สุด 5 คน", fresh: true },
  dist: { title: "การกระจายคะแนน", icon: "chart-histogram", desc: "คะแนนของงานที่เลือก แบ่งเป็นช่วง", fresh: true },
  recent: { title: "แก้ไขล่าสุด", icon: "history", desc: "5 รายการล่าสุดของงานที่เลือก", fresh: true },
};
export const GRADEBOOK_LOCKED = "ตาราง · แผงงานที่เลือก · ตัวกรอง · ปุ่มทำทั้งห้อง · แถบแจ้งเตือน";

export const REPORTS_CARD_META: Record<string, CardMeta> = {
  stats: { title: "ตัวเลขสรุป", icon: "chart-bar", desc: "อัตราส่ง งานค้าง คะแนนเฉลี่ย มาเรียน", fresh: true },
  works: { title: "อัตราการส่งรายงาน", icon: "clipboard-list", desc: "งานไหนส่งน้อย แตะแล้วไปสมุดคะแนน", fresh: true },
  att: { title: "การมาเรียน", icon: "user-check", desc: "มา สาย ลา ป่วย ขาด รวมเท่าไร", fresh: true },
  follow: { title: "ต้องติดตาม", icon: "flag", desc: "ใครค้างอะไร คัดลอกไป LINE ได้", fresh: true },
  hist: { title: "การกระจายคะแนนสะสม", icon: "chart-histogram", desc: "คะแนนสะสมกระจายเป็นช่วง", fresh: true },
};
export const REPORTS_LOCKED = "ตัวกรอง · ตาราง \"รายบุคคล\" (เนื้อหาหลักของหน้า) · ปุ่มพิมพ์/ส่งออก Excel";
/** Weight of each report card when the cards are spread over columns (S = 1, M = 2, L = 4; static, so a card never jumps while it loads) */
export const REPORTS_WEIGHT: Record<string, number> = { stats: W.S, works: W.L, att: W.S, follow: W.L, hist: W.M };

export const STUDENTS_CARD_META: Record<string, CardMeta> = {
  sum: { title: "สรุปห้อง", icon: "chart-bar", desc: "ส่งงานครบกี่คน มีงานค้างกี่คน มาเรียนเฉลี่ย", fresh: true },
  qr: { title: "สติกเกอร์ / QR ใหม่", icon: "qrcode", desc: "QR ที่ออกใหม่ใน 60 วัน และปุ่มพิมพ์", fresh: true },
  moved: { title: "ย้ายออก / ไม่ใช้งาน", icon: "user-off", desc: "ใครออกไปแล้ว แก้ไขหรือให้กลับมาใช้งานได้", fresh: true },
  recent: { title: "เพิ่ม/แก้ล่าสุด", icon: "history", desc: "5 รายการล่าสุดของนักเรียนทุกห้อง", fresh: true },
};
export const STUDENTS_LOCKED = "ชิปห้อง · ค้นหา · เรียง · รายชื่อนักเรียน · แถบเลขที่ซ้ำ · ปุ่มเพิ่ม/นำเข้า/พิมพ์";
/** Weight of each students card when the cards are spread over columns (the "sum" card is pinned first, so its place is fixed) */
export const STUDENTS_WEIGHT: Record<string, number> = { sum: W.M, qr: W.S, moved: W.M, recent: W.M };
/** Cards that always sit first on their page: their up / down arrows are off in "ปรับการ์ด" */
export const STUDENTS_PINNED = ["sum"];

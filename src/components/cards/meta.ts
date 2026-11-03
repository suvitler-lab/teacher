import type { CardMeta } from "./PageCardSettings";

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

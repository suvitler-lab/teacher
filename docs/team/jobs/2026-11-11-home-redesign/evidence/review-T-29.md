# Review T-29 (PM คัดลอกจากรายงาน Code Reviewer opus — hook บล็อกไฟล์)

ผล: ผ่านแบบมีเงื่อนไข · High 0 · Med 3 · Low 4 · ไม่พบปัญหาความปลอดภัย · evidence Q-2901 regression FAIL, Q-2902 a11y-audit FAIL

## ต้องแก้ (Med)
- R-01 bug · src/lib/appearance.ts:74-81 — รับ accent จาก settings ชุดแรกที่ไม่ null ซึ่งอาจเป็น bootstrap เก่าใน IndexedDB (loadBootstrapCached → store.ts:118) และ saveAppearance ไม่อัปเดตสำเนา → เปิดตอนออฟไลน์สีสลับ + เขียนทับ ngankrob-skin · เน็ตกลับมาไม่แก้เพราะ adopted=true (ขัด AC-04, EP-07 v10) · แก้: รับเฉพาะ bootstrap สด และ/หรืออัปเดต kv("bootstrap") เมื่อบันทึกสำเร็จ · theme มีอาการเดียวกันมาก่อน
- R-02 a11y · src/styles/tokens.css:117,140 (warm), :328,351 (pro) — ตัวหนังสือบนปุ่มอันตราย (base.css:184, Gradebook.tsx:1096) 4.49 / 4.44 < 4.5 (AC-37) · เดิม ~4.9 = ถดถอย · เทสต์ hr-theme-tokens.test.ts:133 ตรวจ on-*/fill-* แค่ ≥3
- R-03 bug · src/lib/appearance.ts:117-126 — เปลี่ยนธีมเร็ว 2 ครั้ง บันทึกล้มทั้งคู่ → ย้อนไปค่ากลาง ไม่ใช่ค่าที่เซิร์ฟเวอร์ยืนยัน · รูปแบบเดียวกันใน homePrefs.ts:31 / pageCards.ts:80

## Low
- R-04 ไอคอนหายชั่วครู่ก่อน CSS ธีมโหลด (appearance.ts:49, Icon.tsx:23)
- R-05 --fill-warning บนพื้นการ์ด ~1.8–2.1:1 (tokens.css:114,325; เดิมก็ต่ำ) → QA ตัดสินว่า AC-37 นับแถบ/จุดข้อมูลเป็น "ไอคอน ≥3:1" ไหม
- R-06 ชื่อไอคอนใน work_types จาก DB ที่ Phosphor ไม่มี → ว่าง (hr-theme-icons.test.tsx:18-31)
- R-07 home.css:3 import Plex 600 ทุกธีม → AC-36 ปิดไม่ได้จน T-33 ลบ

## ไม่พบปัญหา
parseAppearance/AC-06 · ออฟไลน์ไม่ส่ง/ไม่เข้าคิว (D38) · homePrefs เข้ากันได้ย้อนหลัง · G10 resetLayoutCards ล้างเฉพาะโครงที่ระบุ · hideNames 7 คีย์ · localStorage ไม่มีข้อมูลส่วนตัว · ไม่มี Tabler หลงเหลือ · CSP ผ่าน · precache ตัดเฉพาะ Phosphor .svg
หลักฐาน reviewer: vitest 9 ไฟล์ T-29 114/115 · typecheck PASS · ไม่ได้รัน build/audit

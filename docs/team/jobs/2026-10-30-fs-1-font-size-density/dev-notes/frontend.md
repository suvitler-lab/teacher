# dev-notes: Front-End (fs-1 ขนาดตัวอักษร/ความหนาแน่น)

## ไฟล์ที่เปลี่ยน
- ใหม่: `src/lib/display.ts` (ขนาด 14-24, ความหนาแน่น, localStorage ห่อ try/catch, apply ลง html), `test/unit/display.test.ts`, `test/unit/no-fixed-font-size.test.ts`
- `src/main.tsx` (เรียก applyStoredDisplay ก่อน render), `src/pages/Settings.tsx` (DisplayRows ในแท็บทั่วไป), `src/styles/settings.css`
- `src/styles/tokens.css` (--fs-xs/--fs-sm/--row-k/--row-h), `base.css` (กติกา touch min 44px, switch ใหม่เป็น rem), `home.css` (แก้ grid ล้นที่ 18/24px)
- แปลง font-size px -> rem/var และ height px -> rem อัตโนมัติ: styles ทั้งหมดยกเว้น print.css; TSX ใน src/components + src/pages; `Icon.tsx` (ไอคอนเป็น rem), `ui.tsx` Avatar
- `.claude/launch.json` เพิ่ม ngankrob-fixture (พอร์ต 5194)

## สิ่งที่ยกเว้น/ข้อสังเกต
- `print.css` ไม่แตะ (ตามขอบเขต)
- ข้อความเล็กสุด = `max(13px, 0.85rem)` ผ่าน --fs-xs/--fs-sm (13px คือพื้น ไม่ใช่ขนาดตายตัว; test อนุญาตรูปแบบนี้)
- ปุ่ม `.hs-eye` (ตาในหัวคอลัมน์สมุดคะแนน, gb-1) ไม่บังคับ 44px; ช่องคะแนนในตาราง/แถว td สมุดคะแนนยังสูง ~2.3-2.4rem
- px ที่คงไว้: width/height ของจุดสี/แถบ (<16px), ขนาดกล่อง QR/ring/กราฟแท่งใน TSX (ไม่ใช่ตัวอักษร), grid column px บางจุด
- ความหนาแน่น: --row-h = max(44px บน touch, 2.6/3.2/3.9 x ขนาด) ใช้กับแถวหลัก (.hm-follow, .rp-follow, .att-week>button, .stu-lrow, แถวตัวอย่าง); ปุ่ม/ช่องใช้ 44px floor บน touch, บนคอมสเกลตาม rem (ไม่บังคับ 44)
- เพิ่ม line-height body 1.5 -> 1.6 ตาม ux.md

## หลักฐาน
- `npm run typecheck` PASS · `npm test` PASS 78 ไฟล์ / 922 เทสต์ · `npm run build` PASS
- Browser (fixture server 127.0.0.1:5194, ข้อมูลสมมติ, ปิด server แล้ว): 8 หน้า (home, gradebook, scan, attendance, random, reports, students, settings) ที่ 390 (touch emulation), 820, 1440 x ขนาด 14/18/24: ไม่มีข้อความ <13px, ไม่เลื่อนแนวนอนทั้งหน้า (หลังแก้ home.css), ที่ 390 ปุ่ม <44px = 0 ทุกหน้า
- ที่ 820/1440 เบราว์เซอร์ไม่ใช่ pointer: coarse จึงมีปุ่ม <44px (ถูกต้องตามออกแบบสำหรับคอม) — ไม่ได้ตรวจ iPad จริง (coarse ที่ 820/1180) ขอให้ QA
- ทดสอบ + บน Settings: 18 -> 19 เปลี่ยนทันที เก็บใน localStorage ปุ่มสูง 56px
- ภาพหน้าจอ: ไม่ได้บันทึกลง evidence/ (ดูด้วย pane เท่านั้น); ไม่ได้ดู 1180, modal/หน้าย่อย (สแกน-ตั้งค่า, เลือกนักเรียน), ไม่ได้ตรวจทับกันด้วยสายตาทุกภาพ (ตรวจอัตโนมัติ + 1 ภาพตั้งค่า 1440)

## แก้ตาม code-review (รอบ 2)
- R-01: กฎ touch 44px ใน base.css ไม่ทับ `button.hm-follow, button.rp-follow, .att-week > button, button.stu-lrow` (ใช้ --row-h ซึ่งมีพื้น 44px บน touch) ความหนาแน่นจึงมีผลจริง; `.lk` กลับไปไม่บังคับสูง (เหมือนเดิมที่ยกเว้น)
- R-02: print.css เหลือเฉพาะ `@media print`; กฎหน้าจอ stu-row ย้ายไป students.css (rem), ชุดพรีวิวสติกเกอร์ QR ย้ายไป `stickers.css` (px คงเดิม เพราะเลียนขนาดสติกเกอร์พิมพ์ — ยกเว้นใน test พร้อมเหตุผล); test ตรวจว่า print.css ไม่มีกฎนอก @media print. พื้นข้อความ 13px ที่ 14px คือค่าที่ตั้งใจ (ที่ 18/24 วัดแล้วไม่มีข้อความ <13)
- R-03: ช่องคะแนนสแกน width/min-width 6rem
- R-04: ยอมรับ — ความหนาแน่นมีผลกับแถวรายการ ปุ่มทั่วไปคงขั้นต่ำ 44px บน touch
- เล็ก: Icon ใช้ /15 (สัดส่วนเดียวกับข้อความ), clampFont(NaN) คืนค่าเริ่มต้นตามชนิดจอ, การ์ดตัวอย่างสดมี role="group"
- ผล: typecheck PASS · npm test PASS 78 ไฟล์/923 · build PASS (ยังไม่ได้ดู browser ซ้ำหลังรอบนี้)

## แก้ตาม QA (รอบ 3)
- B-01: `--rail-w` = max(64px, 4.5rem) (แถบข้างโตตามขนาดตัวอักษร); ชิป sync ในแถบเรียงแนวตั้ง ตัดคำได้; `.sheet-term` ห่อบรรทัดได้ → วัดแล้ว 820 @14/18/24 ไม่ล้นแถบ (64/81/108px), เมนูมือถือ 390 @14/24 ไม่ล้น
- B-02: บน coarse ทุกปุ่ม (ยกเว้น .hs-eye) min-width 44px, `.lk` min-height 44px (ยกเลิกข้อยกเว้นเดิม); วัดที่ 390 @14/24 เมนู: ไม่มีปุ่ม <44
- B-06: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` ใน base.css
- Known issue ส่งต่อ scan-1: B-03 `.sc-cell` ผังเลขที่หน้าสแกนกว้าง ~28px (เจ้าของงานให้คงผังเดิม); B-05 หัวขั้นสแกน/ลิ้นชักนักเรียนบีบที่ 390@24 (ข้ามได้)
- ผล: typecheck PASS · npm test PASS 79 ไฟล์/936 · build PASS

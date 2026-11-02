# dev-notes: T-04 หน้าสแกน (Front-End)

สถานะ: โค้ด + unit เสร็จ · ภาพ before/after ยังไม่ถ่าย (รอ T-02; ดูท้ายไฟล์)

## สิ่งที่ทำ (src/pages/Scan.tsx เท่านั้น)

- ตัวฟัง `onResult`: `already_submitted` →
  - อัปเดต `subsBox` จาก `submission` เสมอ (เมื่อ aid ตรงกัน) ไม่ว่าหน้าจะเปิดอยู่หรือไม่
  - ถ้ามีรอบเปิดอยู่ + `op.assignmentId` ตรงรอบ + หน้าสแกนไม่ได้ถูกปิด (`scanViewLeft`): เอารายการล่าสุดของ op นี้ออก (เก็บ `opId` ใน `recent`), ปิดแป้นคะแนนถ้า `pending === op.studentId`, แสดงการ์ด warning เดิม ("ส่งไปแล้ว — ไม่บันทึกซ้ำ" + คะแนนจากระบบ) + `beep.dup()` + `vibrate(60)`
  - หลายผลของเด็กคนเดียวห่างกัน < 3 วินาที (รอบส่งเดียว: รับงาน + คะแนนที่พิมพ์) แสดงการ์ด/เสียงครั้งเดียว (`alreadyShownAt`, ล้างเมื่อเริ่มรอบใหม่)
  - ไม่เรียกข้อความ "ส่งไม่สำเร็จ" และไม่เรียก beep.err
- `scanViewLeft`: ตั้งใน useEffect ของ `ScanView` (mount = false, unmount = true) → ออกจากหน้าแล้วผลมา = แคชอัปเดต ไม่มีการ์ด/เสียง
- `pushRecent` รับ `opId` (ทางเลือก); `commitStudent` / `submitTypedScore` สร้าง op ก่อนแล้วส่ง opId
- ไม่เพิ่มข้อความ/หน้าจอใหม่ (ใช้ข้อความเดิมทั้งหมด) → ไม่ต้องเปิด Gate V

## หลักฐาน

- `npx vitest run test/unit/c01-scan-already-submitted.test.ts` → 1 file, 5/5 PASS (หมายเหตุ: ผมแก้โค้ดก่อนรันครั้งแรก จึงไม่ได้เห็นผล FAIL ก่อนแก้ด้วยตัวเอง; เทสต์เขียนโดย QA ระบุว่าล้มบน main)
- `npm run typecheck` → PASS (ไม่มี error)
- `npx vitest run test/unit` → 51 files, 522/522 PASS (รวม scan.test, scan-controller, m1-05-scan, scan-score-entry)

## ภาพ (ค้าง)

- ภาพ after ของ *-stale ต้องใช้ worker ที่ T-02 แก้แล้ว (ตอนตรวจ `worker/routes/submissions.ts` ยังไม่มี `already_submitted`) → NOT RUN
- ภาพ before: ยังไม่ถ่าย (ต้อง build main จาก git archive; PM จัดการหรือสั่งต่อ) · pages.json ของ job มีอยู่แล้ว ไม่ได้แก้
- ยังไม่ได้เขียน visual-check.json / ไม่ได้ add evidence visual-before-after

## ขอเปลี่ยนนอกขอบเขต

ไม่มี

## รอบแก้ R-01 + ภาพ (อัปเดต)

- `scanViewLeft` เริ่มเป็น true (ไม่อยู่หน้าสแกน) → false เมื่อ `ScanView` mount หรือเมื่อ `startSession` (เริ่มรอบจากหน้าสแกน) → true เมื่อ unmount · รอบที่กู้จาก storage แต่ไม่เคย mount = เงียบ (แคชอัปเดต) · เหตุที่ตั้งใน startSession: เทสต์ QA c01-scan-already-submitted ไม่ render หน้า แต่เริ่มรอบผ่าน startSession
- เทสต์ใหม่ test/unit/c01-scan-view-lifecycle.test.tsx (a ไม่เคย mount, b mount→unmount, c mount อยู่) · unit ทั้งชุด 52 files / 525 tests PASS · typecheck PASS
- ภาพ: before = main 18759a2 (build ผ่าน git archive, ลบ tmp+junction แล้ว), after = build ปัจจุบัน · 5 หน้า × 4 อุปกรณ์ · sheet --diff PASS 20/20
- before เห็นบั๊ก: การ์ดแดง "already_submitted — ยังไม่ได้บันทึกบนระบบ" + รายการล่าสุด 10/10 · after: การ์ดเหลืองสแกนซ้ำ "ส่งไปแล้ว — ไม่บันทึกซ้ำ" 7/10, รายการล่าสุดว่าง, ชื่อ 30 ตัวอักษรขึ้นบรรทัดใหม่ไม่ล้น · scan-type/scan-later เปลี่ยน 0.6–2.2% (ข้อมูลผังต่างตามสถานะ fixture)
- แก้ pages.json: regex ปุ่ม "จบรอบ" ของ 3 หน้า stale (`\s` ถูก escape ผิด → รอบที่ 2 ค้าง) · shots.mjs เขียน index.json ทับต่อรอบ จึงถ่ายทีละอุปกรณ์แล้ว merge index.json เอง
- ดูภาพจริง 6 ภาพ (before stale-full 820, after stale-full 820/1536, stale-type 390, stale-later 1180 + ก่อนหน้า) ส่วนที่เหลือเทียบผ่าน % diff

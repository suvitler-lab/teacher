# Board: 2026-10-30-m1-02-inactive-student-guard

**ขั้นถัดไป:** งานปิดแล้ว — merge เข้า main ตาม D19 → เปิด job M1-03 (guard เข้า transaction)

- รอบแก้ (Verify): 1/3 (เริ่มรอบ 1)
- PM ตรวจ diff รอบ 2: judge (isReceive + inRoster) กับ stillValid (SQL) ใช้นิยามเดียวกัน · ชุดตรวจหลัก PM รันเอง typecheck PASS · 59 ไฟล์ / 634 tests PASS · snapshot `tree:6031def764ff` (`evidence/pm-main-checks.txt`) · ไฟล์ที่เปลี่ยนอยู่ในขอบเขตที่สั่งทั้งหมด

- รอบ 1 ของ Full-Stack: guard ใน judge/stillValid + `student_inactive` · test ล้มก่อน 16/22 → ผ่าน 22/22 · ชุดเต็ม 59 ไฟล์/626 · PM ตรวจ diff พบว่ากฎ "แก้ได้เฉพาะแถวที่มี" ขัด README (แก้คะแนนปีเก่า) เมื่อเด็กรุ่นเก่าเป็น finished → ปรับ BR-02 ตาม D23 + ให้ judge/stillValid ใช้นิยาม "รับงาน" เดียวกัน

- session: `2026-10-program-20261029-1200`
- รอบแก้ (Verify): 0/3
- snapshot ล่าสุดที่รันชุดตรวจหลัก: main @ `0020a93` — 58 ไฟล์ / 603 tests PASS (ชุดเดียวกับ M1-01 ปิดงาน)
- branch: `team/2026-10-30-m1-02-inactive-student-guard` แตกจาก `main` @ `0020a93`

| Task | ตำแหน่ง | สถานะ | AC | หลักฐาน |
|---|---|---|---|---|
| T-01 test ล้มก่อน + guard ใน judge/stillValid + type + ข้อความ client | Full-Stack (opus·medium) | กำลังทำ | AC-01..07 | |
| T-02 ทดสอบตาม AC + race + offline replay | QA (opus·high) | เสร็จ (รอบ 1) → รอตรวจซ้ำหลังแก้ | AC-01..09 | `qa-report.md` Q-01..Q-04 PASS (expected-from-br ตรงทุกกรณี, offline-replay, multi-device) · B-01 กลาง = R-01 · test ถาวร qa-m1-02 (47) + qa-m1-02-outbox (4) |
| T-03 code review | Code Reviewer (opus·high) | เสร็จ (รอบ 1) | — | `code-review.md`: ต้องแก้ R-01 (bulk ปีเก่าเงียบ ไม่บันทึก — regression) · เสนอ R-02..R-05 · probe 256 กรณี judge=stillValid ไม่ตรงกัน 0 · volume 7/7 · PM ตัดสินใน brief |

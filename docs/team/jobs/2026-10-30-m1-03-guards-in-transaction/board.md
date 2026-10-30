# Board: 2026-10-30-m1-03-guards-in-transaction

**ขั้นถัดไป:** งานปิดแล้ว — รอเจ้าของงานตัดสิน merge `team/2026-10-30-m1-03-guards-in-transaction` เข้า main → จากนั้นเปิด M1-04 (late flag) ∥ M1-05 (นิยาม %)

- T-01 เสร็จ: guard ใน batch 3 จุด + AC-07 (นำเข้ารหัสซ้ำ) · ล้มก่อนแก้ 6/7 (+AC-07 500) · mutation 8/8 · PM รันเอง typecheck PASS + 62 ไฟล์ / 701 PASS · snapshot `tree:056cc5eff158` (`evidence/pm-main-checks.txt`) · ไฟล์ที่เปลี่ยนอยู่ในขอบเขต
- รอบแก้ (Verify): 1/3 (เริ่มรอบ 1)

- session: `2026-10-program-20261029-1200`
- รอบแก้ (Verify): 0/3
- snapshot ล่าสุดที่รันชุดตรวจหลัก: main @ `92fc2c9` — 61 ไฟล์ / 693 tests PASS (PM รันตอนปิด M1-02)
- branch: `team/2026-10-30-m1-03-guards-in-transaction` แตกจาก `main` @ `92fc2c9`
- merge เข้า main: ถามเจ้าของงานก่อนทุกครั้ง (เจ้าของงานรับ merge M1-02 แล้วโดยสั่ง "เริ่ม M1-03")

| Task | ตำแหน่ง | สถานะ | AC | หลักฐาน |
|---|---|---|---|---|
| T-01 test race ล้มก่อน + guard ใน batch 3 จุด | Full-Stack (opus·medium) | กำลังทำ | AC-01..06 | |
| T-02 ทดสอบตาม AC + concurrency | QA (sonnet·medium) | เสร็จ | AC-01..07 | `qa-report.md` บั๊ก 0 · Q-01 concurrency, Q-02 multi-device, Q-03 regression 63 ไฟล์ / 713 · test ถาวร qa-m1-03 (12) |
| T-03 code review | Code Reviewer (opus·medium) | เสร็จ (รอบ 1) | — | `code-review.md` ต้องแก้ 0 · ควรแก้ R-01 (นำเข้า: เด็ก moved กลับมาพร้อมเลขเดิมชนเด็กใหม่ — ปัญหาเดิม) · เสนอ R-02..R-05 → PM รับ R-01..R-04 เข้า Verify รอบ 1 (AC-08) |
| T-04 แก้ Verify รอบ 1 (R-01..R-04) | Full-Stack | รอตรวจ | AC-08 | ล้มก่อน Q-97 · Q-91..Q-95 PASS ที่ `tree:31d5e5b6bffc` · 63 ไฟล์ / 718 · mutation 10/10 · EXPLAIN ใช้ idx_students_class ทั้งมี/ไม่มีสถิติ · PM รับข้อสังเกต 3 ข้อ (clash→dup, กรณีฐานมีเลขซ้ำเดิม, year guard SCAN ตารางเล็ก) |

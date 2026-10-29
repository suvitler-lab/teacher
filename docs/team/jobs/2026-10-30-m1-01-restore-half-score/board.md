# Board: 2026-10-30-m1-01-restore-half-score

**ขั้นถัดไป:** งานปิดแล้ว — รอเจ้าของงานตัดสิน merge `team/2026-10-30-m1-01-restore-half-score` เข้า `main` (ไม่ deploy จนครบ M1) → เปิด job M1-02

- ปิดงาน 2026-10-30: quality-gate PASS (evidence 12, snapshot tree:12e2987d1501) · trace-check close PASS · PM รันเอง typecheck PASS + 58 ไฟล์/603 tests PASS (`evidence/pm-main-checks-final.txt`) · B-01 ต่ำ รับเป็น known issue · Q-05 FAIL (ไม่บังคับ) = B-01

- รอบ 1 ของ Full-Stack: แก้ restore-validation.ts (zod halfStep + SQL score*2) · test ใหม่ 7 ตัวผ่าน · ชุดเต็ม 576/577 เพราะ `audit-restore-domain.test.ts:33` ยึดพฤติกรรมบั๊กเดิม (1.5 ต้องถูกปฏิเสธ) → PM อนุมัติแก้เป็น 1.25 → รอบ 2 ผ่าน 577/577
- session: `2026-10-program-20261029-1200`
- รอบแก้ (Verify): 1/3 (เริ่มรอบ 1)
- snapshot ล่าสุดที่รันชุดตรวจหลัก: `tree:0f06f02107ef403a9d308ba944f3e4a5778b0d70` — PM รันเอง typecheck PASS · 57 ไฟล์ / 577 tests PASS (`evidence/pm-main-checks.txt`)
- ownership: S ไม่มี plan/ownership.json → PM ตรวจด้วย `git status`: ไฟล์ที่เปลี่ยนทั้งหมดอยู่ในขอบเขตที่สั่ง ไม่มีไฟล์นอกขอบเขต
- branch: `team/2026-10-30-m1-01-restore-half-score` แตกจาก `main` @ `a44c89b`

| Task | ตำแหน่ง | สถานะ | AC | หลักฐาน |
|---|---|---|---|---|
| T-01 regression test (ล้มก่อน) + แก้ restore-validation + client + doc | Full-Stack (opus·medium) | รอตรวจ | AC-01..05 | Q-90 PASS · Q-91 PASS (577/577) · Q-92 N/A (AC-04) · `dev-notes/fullstack.md` · `evidence/before-fix.txt` (ล้มก่อนแก้) |
| T-02 ทดสอบตาม AC + ซ้อม restore บน local D1 | QA (opus·high) | เสร็จ | AC-01..05 | `qa-report.md` Q-01..Q-09 (expected-from-br 17/17 ตรง, atomicity, 520 แถวหลาย chunk, รายงาน 75%) · B-01 ต่ำ (PM รับ) · test ถาวร `test/api/qa-m1-01.test.ts` |
| T-03 code review diff | Code Reviewer (opus·high) | เสร็จ | — | `code-review.md`: ต้องแก้ 0 · ควรแก้ 0 · เสนอ R-01 (zod float tolerance ฝั่งบันทึก → ส่งต่อ M1-05) R-02/R-03 (assertion ใน test ใหม่ — QA ครอบคลุม) · probe SQLite 3.51.3 + zod 4.6.7 แล้ว |

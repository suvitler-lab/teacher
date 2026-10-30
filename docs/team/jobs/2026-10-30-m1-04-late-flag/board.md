# Board: 2026-10-30-m1-04-late-flag

**ขั้นถัดไป:** งานปิดแล้ว — รอเจ้าของงานตัดสิน merge `team/2026-10-30-m1-04-late-flag` เข้า main → เปิด M1-05 (นิยาม % แหล่งเดียว + isHalfStep + legend R-07)

- T-01 เสร็จ: UPDATE late ใน batch (เวลาไทย) + audit due_date + Scan ใช้ late จริง + สี `.sc-cell.late` + legend "ส่งช้า N" (อนุมัติขอเปลี่ยนนอกขอบเขต) + ลบ hmToMinutes · ล้มก่อน 12/41 · mutation 3/3 · PM รันเอง typecheck PASS + 64 ไฟล์ / 738 · snapshot `tree:526c0dfa8a40`
- รอบแก้ (Verify): 1/3 (เริ่มรอบ 1)

- session: `2026-10-program-20261029-1200`
- รอบแก้ (Verify): 0/3
- snapshot ล่าสุดที่รันชุดตรวจหลัก: M1-03 ปิดงาน — 63 ไฟล์ / 722 PASS (main @ `2aba109` = เนื้อหาเดียวกัน)
- branch: `team/2026-10-30-m1-04-late-flag` แตกจาก `main` @ `2aba109`
- merge เข้า main: ถามเจ้าของงานก่อน

| Task | ตำแหน่ง | สถานะ | AC | หลักฐาน |
|---|---|---|---|---|
| T-01 test ล้มก่อน + late ใน batch + audit + Scan + ลบ hmToMinutes | Full-Stack (opus·medium) | กำลังทำ | AC-01..09 | |
| T-02 ผลที่คาดจาก BR-04 + ทดสอบ | QA (opus·high) | เสร็จ | AC-01..09 | `qa-report.md` บั๊ก 0 · Q-01 expected-from-br (E01–E17 ตรง) · Q-02 65 ไฟล์/750 · Q-03 ภาพ 375/1024 (PM ดูแล้ว) · Q-04 · ตัวเลขช้า gradebook=reports=dashboard ทุกขั้น · server ปิดแล้ว |
| T-03 code review | Code Reviewer (opus·high) | เสร็จ (รอบ 1) | — | `code-review.md` ต้องแก้ R-01 (ย้อนกลับการล้างหลังเลื่อนกำหนดส่งคืน late เดิม) · ควรแก้ R-02 · เสนอ R-03..R-06 · probe 601,116 คู่ · **process probe ของ Reviewer (PID 34560) ค้าง — Reviewer หยุดเองไม่ได้เพราะสิทธิ์ถูกปฏิเสธ PM ไม่หยุดแทน แจ้งเจ้าของงานแล้ว** |
| T-04 แก้ Verify รอบ 1 (R-01..R-06 + AC-10, AC-11) | Full-Stack | เสร็จ | AC-10, AC-11 | late.ts กลาง ต่อท้าย 4 เส้นทาง · mutation 9/9 · 65 ไฟล์ / 758 · PM รันเอง PASS `tree:dcdd2d40ef99` |
| T-05 QA ตรวจซ้ำ Verify 1 | QA | เสร็จ | AC-10 | AC-10 ผ่าน · **B-01 กลาง**: due_date ปี พ.ศ. ผ่านได้ → แก้รอบ 2 · 763/764 (ล้มเฉพาะ test B-01) |
| T-06 Reviewer รอบ 2 | Code Reviewer | เสร็จ | — | ต้องแก้ 0 · R-01..R-06 ปิด · เสนอ R-07 (→M1-05), R-08 (แก้รอบ 2), R-09 (= B-01), R-10 (→M1-08) |
| T-07 แก้ Verify รอบ 2 (B-01/R-09, R-08 + fixture 3 บรรทัด + กติกาวันที่เดิม) | Full-Stack | เสร็จ | AC-04 | ล้มก่อน Q-96 · Q-91/Q-94 PASS · PM รันเอง 65 ไฟล์ / 767 PASS `tree:e1bf18bc21da` |
| T-08 QA ∥ Reviewer ตรวจ Verify รอบ 2 | QA, Reviewer | กำลังทำ | — | รอบแก้ (Verify): 2/3 |

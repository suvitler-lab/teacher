# Board: 2026-10-30-m1-05-metrics-single-source

**ขั้นถัดไป:** งานปิดแล้ว — รอเจ้าของงานตัดสิน merge + นิยาม "มาเรียนเฉลี่ย" → เปิด M1-06 (server intent + bulk excused M1-07 + audit M1-08)

- T-01 เสร็จ (ชน maxTurns 1 ครั้ง สั่งต่อขอบเขตแคบ): ฟังก์ชันกลาง + shared/time.ts + แทนสูตร 8 หน้า + legend/วงแหวนสแกน + isHalfStep ทั้งระบบ + README · ล้มก่อน 8 · mutation 4/4 · PM รันเอง typecheck PASS + 68 ไฟล์ / 804 `tree:b71e5e8b3a99`
- รอบแก้ (Verify): 1/3 (เริ่มรอบ 1)

- session: `2026-10-program-20261029-1200`
- รอบแก้ (Verify): 0/3
- snapshot ล่าสุดที่รันชุดตรวจหลัก: M1-04 ปิดงาน — 65 ไฟล์ / 772 PASS (main @ `b9483ba` = เนื้อหาเดียวกัน)
- branch: `team/2026-10-30-m1-05-metrics-single-source` แตกจาก `main` @ `b9483ba`
- merge เข้า main: ถามเจ้าของงานก่อน

| Task | ตำแหน่ง | สถานะ | AC | หลักฐาน |
|---|---|---|---|---|
| T-01 ฟังก์ชันกลาง + แทนสูตรใน pages + isHalfStep + วันนี้ + legend + README | Full-Stack (opus·medium) | กำลังทำ | AC-01..08 | |
| T-02 ผลที่คาดจาก BR-05 + ทดสอบทุกหน้า | QA (opus·high) | เสร็จ (รอบ 1) | AC-01..08 | ผ่าน AC-01..08 · B-01 กลาง (ปัด 57.5→57) · B-03/B-04/B-05 ต่ำ (บั๊กเดิม) · Q-01, Q-02 (70 ไฟล์/817 + 2 expected-fail), Q-04, Q-05 PASS · Q-03 FAIL = B-01 |
| T-04 แก้ Verify รอบ 1 (R-01..R-03, B-01, B-03..B-05, AC-09..11) | Full-Stack | เสร็จ | AC-09..11 | Q-94: 71 ไฟล์ / 832 + 2 "it.fails ที่ผ่านแล้ว" ของ QA · mutation M-4/M-5 จับได้ · grep ขยายครอบ src/components, src/lib |
| T-05 QA ตรวจซ้ำ ∥ Reviewer รอบ 2 | QA, Reviewer | กำลังทำ | — | |
| T-03 code review | Code Reviewer (opus·high) | เสร็จ (รอบ 1) | — | ต้องแก้ 0 · ควรแก้ R-01 (เศษส่วน 6/10 คู่ 75%), R-02 (StudentDrawer สูตรเอง) · เสนอ R-03 (Excel % มาเรียน), R-04 (รหัส issue zod) · ไม่พบการเปลี่ยนนิยาม → PM ตัดสินใน brief (AC-09) |

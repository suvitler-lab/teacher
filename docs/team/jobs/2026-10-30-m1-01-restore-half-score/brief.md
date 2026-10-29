# Brief: กู้คืนไฟล์สำรองที่มีคะแนนครึ่ง (.5) ได้

- งาน: `2026-10-30-m1-01-restore-half-score` · branch: `team/2026-10-30-m1-01-restore-half-score` (แตกจาก `main` @ `2c3bbde` + docs checkpoint) · เริ่ม: 2026-10-30
- สถานะ: ปิดแล้ว (2026-10-30 — quality-gate PASS, trace-check close PASS, 58 ไฟล์/603 tests; รอ merge เข้า main ตามคำตัดสินเจ้าของงาน)
- ขนาด: S · ธง: 💰
<!-- ไม่ติด 🗑: งานนี้ไม่ลบ/ไม่ migrate ข้อมูล (แก้ตัวตรวจไฟล์สำรองให้รับค่าที่ระบบบันทึกได้อยู่แล้ว) · การซ้อม restore ทำโดย QA ผ่าน flow จริงบน local D1 ใน AC-01 -->
- ซ้อม restore: QA ผ่าน flow backup→restore จริงบน local D1 (AC-01) · Reviewer คง opus·high
- เจ้าของงาน (Product Owner): ผู้ใช้ · โปรแกรม: 2026-10-program (M1-01, epic E-01)

## โจทย์ (คำของเจ้าของงาน)

> ความถูกต้องของข้อมูลการลงคะแนนของนักเรียน … แก้ข้อมูลคะแนนก่อน (Gate P 29 ต.ค.)

บั๊กที่ยืนยันจากโค้ด: ระบบให้คะแนนเป็นขั้น 0.5 ได้ (`worker/routes/submissions.ts:61` `multipleOf(0.5)`, `shared/grade.ts`, ScorePad มีปุ่ม .5) แต่ `worker/lib/restore-validation.ts:34` ใช้ `integer` และ `:101` ตรวจ `score != CAST(score AS INTEGER)` → ไฟล์สำรองที่มีคะแนน 7.5 แม้แถวเดียวถูกปฏิเสธ 422 `invalid_backup` ตอนกู้คืน · precheck production 30 ต.ค.: ยังไม่มีคะแนนครึ่งในฐานจริง (0 แถว) จึงไม่ใช่ hotfix แต่ต้องปิดก่อนครูเริ่มใช้ .5

## เป้าหมาย / ถือว่าสำเร็จเมื่อ

- backup ที่มีคะแนน .5 กู้คืนได้ค่าเดิมครบ โดยคะแนนที่ไม่ถูกต้องจริง (7.25, ติดลบ, string, เกินคะแนนเต็ม) ยังถูกปฏิเสธ
- มี regression test ที่ **ล้มก่อนแก้** และผ่านหลังแก้ ใน test/api
- ไม่มี migration (SQLite เก็บ REAL ในคอลัมน์ INTEGER affinity ได้ — ค่า 7.5 ที่บันทึกผ่าน API อยู่แล้ววันนี้คงรูปเดิม)

## AC

| AC | สถานะเริ่มต้น (Given) | เมื่อ (When) | ผลที่ต้องได้ (Then) | BR | ระดับ |
|---|---|---|---|---|---|
| AC-01 | งานคะแนนเต็ม 10 มีนักเรียนได้ 7.5 ผ่าน `POST /api/submissions/batch` | สำรองข้อมูล (`/api/backup` ทุกหน้า) แล้วกู้คืนด้วย flow จริง (create job → chunks → commit) | commit ตอบ ok · `submissions.score` ของคนนั้น = 7.5 · fingerprint/จำนวนแถวตรง · data_epoch เพิ่ม 1 | BR-01 | ต้องมี |
| AC-02 | ไฟล์สำรองเดียวกันแต่แก้ score เป็น 7.25 / -0.5 / "7.5" (string) / 10.5 (เกินเต็ม 10) | กู้คืน | ทุกกรณีได้ 422 `invalid_backup` ระบุ table `submissions` field `score` (ชื่อ code ภายในไม่บังคับ — ดู B-01 ที่ PM รับ) · ข้อมูลเดิมไม่เปลี่ยน · epoch ไม่เปลี่ยน | BR-01 | ต้องมี |
| AC-03 | ไฟล์สำรองที่มีเฉพาะคะแนนจำนวนเต็มและ null (รูปแบบเดิม) | กู้คืน | ยังกู้คืนได้เหมือนเดิม (regression ชุด restore/backup-consistency/volume ผ่านครบ) | — | ต้องมี |
| AC-04 | restore validation ฝั่ง client (`src/lib/backup.ts`) ถ้ามีการตรวจ score | เลือกไฟล์ที่มี 7.5 | ไม่ถูกบล็อกฝั่ง client ก่อนถึง server (ถ้าไม่มีการตรวจฝั่ง client ให้บันทึกว่า N/A พร้อม file:line) | — | ต้องมี |
| AC-05 | เอกสาร | — | README §สำรองและกู้คืน หรือ OPERATIONS ระบุว่าคะแนนครึ่งกู้คืนได้ตั้งแต่รุ่นนี้ (1 บรรทัด) | — | ควรมี |

BR-01: คะแนนที่ถูกต้อง = null หรือจำนวนที่ 0 ≤ score ≤ full_score ของงานนั้น และ score × 2 เป็นจำนวนเต็ม (ขั้น 0.5) — นิยามเดียวกับ `shared/grade.ts` และ `opSchema` ใน `submissions.ts:61`

## ทีมที่ใช้

| ตำแหน่ง | ทำอะไรในงานนี้ |
|---|---|
| Full-Stack (opus·medium เพราะ 💰🗑) | เขียน regression test ที่ล้มก่อน → แก้ `restore-validation.ts` (zod + SQL rule) → ตรวจ client → เอกสาร 1 บรรทัด |
| QA (opus·high เพราะ 💰) | คำนวณผลที่คาดจาก BR-01 ก่อน → รันชุดทดสอบ + ซ้อม backup→restore บน local D1 → qa-report + evidence |
| Code Reviewer (opus·high เพราะ 💰🗑) | ตรวจ diff: ความถูกต้องของ SQL rule, ไม่เปิดช่องรับค่าผิด, test ครอบคลุม |

## Gate

| Gate | สถานะ | วันที่ | คำตอบเจ้าของงาน |
|---|---|---|---|
| 1 ขอบเขต | ไม่ใช้ (S) | | |
| 2 หน้าตา | ไม่ใช้ | | |
| 3 ปล่อยงาน | รอ (deploy รวมใน release train ของ M1) | | |

## N/A ที่รับ

| check | เหตุผล | วันที่ |
|---|---|---|
| Q-08 | AC-04 (QA): ฝั่ง client ไม่มีการตรวจ score ในไฟล์สำรองเลย (`src/lib/backup.ts:1-103` ไม่ตรวจแถว; `src/components/RestoreModal.tsx:58-61` ตรวจเฉพาะ app และ sha256) จึงไม่มีอะไรบล็อก 7.5 ก่อนถึง server — PM ตรวจแล้วรับ | 2026-10-30 |
| Q-92 | AC-04 (Full-Stack): เหตุผลเดียวกับ Q-08 | 2026-10-30 |

## Known issue ที่ PM รับ (2026-10-30)

- B-01 (ต่ำ): code ของ issue ที่ field `submissions.score` เป็นชื่อจาก zod (`not_multiple_of`/`too_small`/`invalid_type`) หรือ `score_over_full` แทน `invalid_score` — พฤติกรรมเดิมก่อนงานนี้ ครูไม่เห็น code (RestoreModal ไม่ใช้) ทุกกรณียัง 422 และข้อมูลไม่ถูกแตะ → รับไว้ ปรับถ้อยคำ AC-02 แทน
- เก็บ `test/api/qa-m1-01.test.ts` (26 tests ของ QA) ไว้ในชุดทดสอบถาวร เพราะครอบคลุมขอบ/หลาย chunk/ตัวเลขรายงาน มากกว่าของ dev

## ขอเปลี่ยนนอกขอบเขตที่ PM อนุมัติ

- 2026-10-30: ให้ Full-Stack แก้ `test/api/audit-restore-domain.test.ts:33` ค่า `1.5` → `1.25` (test เดิมยึดพฤติกรรมบั๊ก: 1.5 เป็นคะแนนที่ถูกต้องตาม BR-01; 1.25 คงเจตนาว่าเศษที่ไม่ใช่ขั้น 0.5 ต้องถูกปฏิเสธ)

## ข้อจำกัด / สมมติฐาน / คำสั่งพิเศษจากเจ้าของงาน

- ห้ามเพิ่ม migration · ห้ามแตะ production · ห้ามเปลี่ยนสัญญา API (schema ของ backup JSON คงเดิม)
- พอร์ตถ้าต้องเปิด server: Full-Stack 4103 · QA 4105

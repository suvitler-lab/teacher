# รายงานปิดงาน (S): กู้คืนไฟล์สำรองที่มีคะแนนครึ่ง (.5) ได้

2026-10-30 · branch `team/2026-10-30-m1-01-restore-half-score` · commit (checkpoint ท้ายงาน ดู board.md) · โปรแกรม 2026-10-program · M1-01

## ทำอะไร

ตัวตรวจไฟล์สำรองยอมรับเฉพาะคะแนนจำนวนเต็ม ทั้งที่ระบบให้คะแนนครึ่ง (เช่น 7.5) ได้ ทำให้ไฟล์สำรองที่มีคะแนนครึ่งแม้แถวเดียวกู้คืนไม่ได้ (422) แก้ให้ตัวตรวจทั้งสองชั้น (zod ตอนรับ chunk และ SQL guard ตอน commit) ใช้นิยามเดียวกับตอนบันทึก (ขั้น 0.5, 0 ≤ score ≤ คะแนนเต็ม) โดยไม่ต้อง migration และยังปฏิเสธค่าผิดจริงทั้งไฟล์

## ผลตาม AC (จาก brief.md)

| AC | ผล | หลักฐาน (Q-xx) |
|---|---|---|
| AC-01 7.5 → backup → restore ได้ค่าเดิม, epoch +1, รายงาน/สมุดคะแนนแสดง 7.5 | ผ่าน | Q-01/Q-02 (QA ผลที่คาดจาก BR-01 ตรง 17/17) · Q-90 (dev) · `evidence/before-fix.txt` (ล้มก่อนแก้) |
| AC-02 7.25 / -0.5 / "7.5" / 10.5 → 422 ที่ field score, ข้อมูล/epoch/audit ไม่เปลี่ยน รวมแถวผิดใน chunk ที่ 2 | ผ่าน (B-01 ต่ำ: ชื่อ code ภายในต่างจากที่ AC เขียน — PM รับ) | Q-03 atomicity · Q-05 |
| AC-03 ไฟล์รูปแบบเดิม (จำนวนเต็ม/null/excused) และไฟล์ 520 แถวข้าม chunk ยังกู้ได้ | ผ่าน | Q-04 · Q-06/Q-07 regression |
| AC-04 ฝั่ง client ไม่บล็อก 7.5 | N/A (client ไม่ตรวจ score เลย) | Q-08 · Q-92 |
| AC-05 README ระบุว่ากู้คืนคะแนนครึ่งได้ | ผ่าน | Q-09 · README บรรทัด 113 |

ชุดตรวจหลัก: typecheck PASS · `npm test` 58 ไฟล์ / 603 tests PASS (baseline 56/570 + dev 7 + QA 26) · Code Reviewer: ต้องแก้ 0 · ควรแก้ 0 · เสนอ 3 (R-01 ส่งต่อ M1-05)

## ไฟล์ที่เปลี่ยน

- `worker/lib/restore-validation.ts` — zod `halfStep` + SQL rule `invalid_score` ใช้ `score*2`
- `test/api/restore-half-score.test.ts` (ใหม่, 7 tests) · `test/api/qa-m1-01.test.ts` (ใหม่, 26 tests ของ QA เก็บถาวร)
- `test/api/audit-restore-domain.test.ts:33` — 1.5 → 1.25 (test เดิมยึดพฤติกรรมบั๊ก)
- `README.md` — 1 บรรทัดใน §สำรองและกู้คืนข้อมูล
- docs ของงาน: brief/board/dev-notes/qa-report/code-review/evidence

## ปัญหาที่ยังรู้อยู่

- B-01 (ต่ำ): code ภายในของ issue ที่ `submissions.score` เป็นชื่อจาก zod หรือ `score_over_full` แทน `invalid_score` — ครูไม่เห็น ข้อมูลปลอดภัย รับไว้
- R-01 (เสนอ): ฝั่งบันทึก `submissions.ts:61` zod `multipleOf(0.5)` มีค่าเผื่อทศนิยมลอย (UI ยังสร้างไม่ได้) → รวมใน M1-05 ใช้ `isHalfStep` เป็นนิยามเดียว

## วิธีลองใช้เอง

1. `npm test -- test/api/restore-half-score.test.ts test/api/qa-m1-01.test.ts`
2. ในแอป (local): ให้คะแนน 7.5 ในสมุดคะแนน → ตั้งค่า → สำรองข้อมูล → ดาวน์โหลด → กู้คืนไฟล์นั้น → คะแนนยังเป็น 7.5

## ต้นทุน

- เรียก agent: 4 ครั้ง (FS 1 + ต่อ 1 · QA 1 · Reviewer 1) · รอบแก้ (Verify): 1/3 (ไม่มีข้อ "ต้องแก้") · token: `usage.md`

## เจ้าของงานตัดสินต่อ

- merge เข้า `main` ตอนปิด M1 (release train ของ M1 → Gate 3) หรือ merge ทันทีเพื่อลดความเสี่ยง branch ค้าง — ค่าแนะนำ: merge เข้า main ทันที (ไม่ deploy จนกว่าจะครบ M1)

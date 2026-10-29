# QA: ผลที่คาดจาก BR-01 (คำนวณก่อนดูโค้ดและก่อนรันจริง)

เขียนเมื่อ 2026-10-30 โดย team-qa-tester ก่อนเปิดอ่าน diff / restore-validation.ts / test ของ dev และก่อนรันเทสต์ใด ๆ

BR-01: คะแนนที่ถูกต้อง = null หรือ "จำนวน" (JSON number) ที่ 0 <= score <= full_score ของงาน และ score x 2 เป็นจำนวนเต็ม

วิธีคิดต่อค่า: (1) เป็น null -> ถูกต้อง (2) ไม่ใช่ JSON number -> ผิด (invalid_score)
(3) score < 0 -> ผิด (invalid_score) (4) score x 2 ไม่เป็นจำนวนเต็ม -> ผิด (invalid_score)
(5) score > full_score -> ผิด (score_over_full) (6) นอกนั้นถูกต้อง -> กู้คืนได้ ค่าเดิมเป๊ะ

ผลเมื่อผิด: HTTP 422, error `invalid_backup`, issue ระบุ table `submissions` field `score`, code `invalid_score` หรือ `score_over_full`
(AC-02 รับได้ทั้งสอง code; คอลัมน์ "code ที่คาด" คือ code ที่สมเหตุสมผลที่สุดตาม BR — ถ้าค่าผิดหลายข้อพร้อมกัน เช่น 7.25 ไม่ผิดเรื่องเกินเต็ม จึงคาด invalid_score)
ข้อมูลเดิม / data_epoch / audit restore ต้องไม่เปลี่ยนเมื่อถูกปฏิเสธ

## งานคะแนนเต็ม 10

| ค่า | score x 2 | 0 <= s <= 10 | เป็น number | ผลที่คาด | code ที่คาด |
|---|---|---|---|---|---|
| null | - | - | (null) | กู้คืนได้ score = null | - |
| 0 | 0 (เต็ม) | ใช่ | ใช่ | กู้คืนได้ score = 0 | - |
| 0.5 | 1 (เต็ม) | ใช่ | ใช่ | กู้คืนได้ score = 0.5 | - |
| 7 | 14 (เต็ม) | ใช่ | ใช่ | กู้คืนได้ score = 7 | - |
| 7.5 | 15 (เต็ม) | ใช่ | ใช่ | กู้คืนได้ score = 7.5 (ไม่ถูกปัดเป็น 7/8) | - |
| 10 | 20 (เต็ม) | ใช่ (= เต็ม) | ใช่ | กู้คืนได้ score = 10 | - |
| 10.5 | 21 (เต็ม) | ไม่ (> 10) | ใช่ | 422 invalid_backup submissions.score | score_over_full |
| 7.25 | 14.5 (ไม่เต็ม) | ใช่ | ใช่ | 422 invalid_backup submissions.score | invalid_score |
| -0.5 | -1 (เต็ม) | ไม่ (< 0) | ใช่ | 422 invalid_backup submissions.score | invalid_score |
| "7.5" | - | - | ไม่ (string) | 422 invalid_backup submissions.score | invalid_score |
| 100.5 | 201 (เต็ม) | ไม่ (> 10) | ใช่ | 422 invalid_backup submissions.score | score_over_full |
| 0.1 (เพิ่ม) | 0.2 (ไม่เต็ม) | ใช่ | ใช่ | 422 | invalid_score |
| true (เพิ่ม) | - | - | ไม่ (boolean) | 422 | invalid_score |
| 11 (เพิ่ม) | 22 | ไม่ (> 10) | ใช่ | 422 | score_over_full |

## งานคะแนนเต็ม 1

| ค่า | score x 2 | 0 <= s <= 1 | ผลที่คาด | code ที่คาด |
|---|---|---|---|---|
| 0.5 | 1 | ใช่ | กู้คืนได้ score = 0.5 | - |
| 1 | 2 | ใช่ (= เต็ม) | กู้คืนได้ score = 1 | - |
| 1.5 | 3 | ไม่ (> 1) | 422 invalid_backup submissions.score | score_over_full |

## ตรวจเพิ่ม (ผลที่คาด)

- (ก) หลัง restore งานเต็ม 10 ที่มีนักเรียนคนเดียวได้ 7.5: GET /api/gradebook แสดงคะแนนคนนั้น 7.5 (คะแนนรวมของนักเรียน = 7.5 ถ้ามีงานเดียว) และ /api/reports/summary เฉลี่ยรวม = 7.5 / 1 คน = 7.5 (ไม่ถูกปัดเป็น 7 หรือ 8)
- (ข) restore ที่ล้มเพราะค่าผิด: แถว submissions เดิมไม่เปลี่ยน, data_epoch เท่าเดิม, ไม่มี audit restore ใหม่
- (ค) ไฟล์สำรองรูปแบบเดิม (จำนวนเต็ม/null ล้วน): กู้คืนได้ commit ok, data_epoch +1
- AC-01: หลังกู้คืน 7.5 data_epoch = ก่อน + 1, จำนวนแถว/fingerprint ตรงกับไฟล์

## ตัวเลขที่คาดของ (ก) — คำนวณมือ (เพิ่มก่อนรัน หลังอ่านนิยามตัวชี้วัดใน shared/metrics.ts / src/lib/report.ts ซึ่งเป็นนิยามที่อนุมัติแล้ว ไม่ใช่โค้ดของงานนี้)

ข้อมูล: ห้อง c1 มี st1, st2 · งาน a1 เต็ม 10 ครบกำหนด 2569-12-31 (ยังไม่ถึงกำหนด) · st1 ได้ 7.5 · st2 ยังไม่ส่ง (= pending ไม่นับ)

- gradebook: submissions ของ st1/a1 score = 7.5 (ไม่ใช่ 7 หรือ 8)
- รายงาน (computeReport จาก /api/reports/summary):
  - คะแนนรวมของ st1 = 7.5, คะแนนเต็มที่นับ = 10
  - คะแนนรวมทั้งห้อง = 7.5 + 0 (pending ไม่นับ) = 7.5 · คะแนนเต็มรวม = 10
  - เฉลี่ยดิบต่อคนที่มีคะแนน = 7.5 / 1 = 7.5
  - avgScorePercent = round(7.5 / 10 x 100) = round(75) = 75 (ถ้าถูกปัดเป็น 7 -> 70, เป็น 8 -> 80)
  - average ของงาน a1 = round((7.5/10 x 100) / 1) = 75 · scoredCount = 1

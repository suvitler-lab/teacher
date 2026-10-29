# QA: ผลจริงเทียบผลที่คาดจาก BR-01 (T-02)

ผลที่คาด: `evidence/qa-expected-from-br.md` (เขียนก่อนรัน) · ผลจริง: `evidence/qa-m1-01-run.txt`
คำสั่ง: `npx vitest run test/api/qa-m1-01.test.ts --silent=false --reporter=verbose` → 26/26 passed (Workers runtime + local D1 ของ vitest)
Flow: บันทึกคะแนนผ่าน `POST /api/submissions/batch` → `takeBackup` (/api/backup ทุกหน้า) → แก้ score ในไฟล์ → validate → chunk x N (500 แถว) → commit

## ตาราง BR-01

| ค่า | เต็ม | คาด | ได้ | ขั้นที่หยุด | code ที่คาด | code ที่ได้ | ข้อมูลเดิม/epoch/audit | ตรง? |
|---|---|---|---|---|---|---|---|---|
| null | 10 | กู้ได้ | 200 ok, null | commit | - | - | epoch +1, audit +1 | ตรง |
| 0 | 10 | กู้ได้ | 200, 0 (integer) | commit | - | - | +1/+1 | ตรง |
| 0.5 | 10 | กู้ได้ | 200, 0.5 (real) | commit | - | - | +1/+1 | ตรง |
| 7 | 10 | กู้ได้ | 200, 7 (integer) | commit | - | - | +1/+1 | ตรง |
| 7.5 | 10 | กู้ได้ | 200, 7.5 (real) | commit | - | - | +1/+1 | ตรง |
| 10 | 10 | กู้ได้ | 200, 10 | commit | - | - | +1/+1 | ตรง |
| 10.5 | 10 | 422 | 422 invalid_backup submissions.score | commit | score_over_full | score_over_full | ไม่เปลี่ยน | ตรง |
| 7.25 | 10 | 422 | 422 invalid_backup submissions.score | chunk | invalid_score | **not_multiple_of** | ไม่เปลี่ยน | ผล 422 ตรง · code ไม่ตรง (B-01) |
| -0.5 | 10 | 422 | 422 invalid_backup submissions.score | chunk | invalid_score | **too_small** | ไม่เปลี่ยน | ผล 422 ตรง · code ไม่ตรง (B-01) |
| "7.5" | 10 | 422 | 422 invalid_backup submissions.score | chunk | invalid_score | **invalid_type** | ไม่เปลี่ยน | ผล 422 ตรง · code ไม่ตรง (B-01) |
| 100.5 | 10 | 422 | 422 invalid_backup submissions.score | commit | score_over_full | score_over_full | ไม่เปลี่ยน | ตรง |
| 0.1 | 10 | 422 | 422 submissions.score | chunk | invalid_score | not_multiple_of | ไม่เปลี่ยน | ผล 422 ตรง · code ไม่ตรง (B-01) |
| true | 10 | 422 | 422 submissions.score | chunk | invalid_score | invalid_type | ไม่เปลี่ยน | ผล 422 ตรง · code ไม่ตรง (B-01) |
| 11 | 10 | 422 | 422 submissions.score | commit | score_over_full | score_over_full | ไม่เปลี่ยน | ตรง |
| 0.5 | 1 | กู้ได้ | 200, 0.5 (real) | commit | - | - | +1/+1 | ตรง |
| 1 | 1 | กู้ได้ | 200, 1 | commit | - | - | +1/+1 | ตรง |
| 1.5 | 1 | 422 | 422 submissions.score | commit | score_over_full | score_over_full | ไม่เปลี่ยน | ตรง |

"ไม่เปลี่ยน" = takeBackup ทุกตารางเท่าเดิม, /api/backup/fingerprint เท่าเดิม, data_epoch เท่าเดิม, audit `entity='restore'` ไม่เพิ่ม, score ของ st1 ยังเป็น 1 (integer)

สรุป: กู้ได้/ถูกปฏิเสธ ตรงกับ BR-01 ครบ 17/17 · code ใน issue ตรง 11/17 (ทุกค่าที่หยุดที่ commit ตรง; ค่าที่หยุดที่ chunk ได้ code ของ zod)

## SQL guard ล้วน (แก้ restore_staging ตรง ๆ หลังผ่าน chunk — ทางเลี่ยง zod)

| ค่า | ได้ | code |
|---|---|---|
| 7.25 | 422 | invalid_score |
| -0.5 | 422 | invalid_score |
| "7.5" | 422 | **score_over_full** (ควรเป็น invalid_score — SQLite เทียบ TEXT > INTEGER เป็นจริงเสมอ และ rule score_over_full อยู่ก่อนใน COALESCE) |
| true | 422 | invalid_score |
| 10.5 | 422 | score_over_full |
| 7.5 | 200 กู้ได้ 7.5 (real) | - |

## (ก) อ่าน 7.5 กลับหลัง restore

gradebook score = 7.5 · report: st1 score 7.5 / เต็ม 10 · คะแนนรวม 7.5 · เฉลี่ยดิบ 7.5 · avgScorePercent 75 · average งาน a1 75 · scoredCount 1 — ตรงกับที่คำนวณมือทุกตัว
fingerprint ส่วนข้อมูล (ไม่นับ audit max id และ data_epoch) หลัง restore = ตอนสำรอง

## (ข) restore ล้มไม่เปลี่ยนอะไร

ทุกค่าผิดในตาราง + กรณีหลาย chunk (แถวผิดที่ index 510 อยู่ chunk #1, chunk #0 ผ่านไปแล้ว) → 422 ที่ `chunk:submissions#1`, ข้อมูล/fingerprint/epoch เท่าเดิม

## (ค) ไฟล์รูปแบบเดิม

คะแนน 8 (integer), null, แถว excused score null → 200 ok, ข้อมูลตรงไฟล์, epoch +1

## หลาย chunk

520 แถว คะแนน (i mod 21)/2 → ผลรวมคำนวณมือ 24 x 105 + 60 = 2580, แถวทศนิยม .5 = 24 x 10 + 8 = 248 → หลัง restore SUM = 2580, real = 248, ทุกแถวตรงไฟล์

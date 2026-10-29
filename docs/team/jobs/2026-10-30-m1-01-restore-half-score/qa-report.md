# รายงานทดสอบ (QA): กู้คืนไฟล์สำรองที่มีคะแนนครึ่ง (.5) ได้

ทดสอบเมื่อ 2026-10-30 · snapshot `tree:12e2987d1501` · รอบแก้ (Verify) 0/3 · สภาพแวดล้อม: local D1 ใน Workers runtime ของ vitest (`@cloudflare/vitest-pool-workers`) ผ่าน endpoint จริง ไม่เปิด server/เบราว์เซอร์ (งานนี้ไม่มีหน้าจอเปลี่ยน — AC-04 เป็น N/A)

สถานะ: **ผ่าน AC-01, AC-03, AC-05 · AC-02 ผ่านเรื่องข้อมูล แต่ชื่อ code ใน issue ไม่ตรงตัวอักษรของ AC (B-01 ระดับต่ำ รอ PM ตัดสิน) · AC-04 N/A**

## 0. แผนทดสอบย่อ

ผลที่คาดคำนวณจาก BR-01 ก่อนอ่านโค้ด/รัน: `evidence/qa-expected-from-br.md` (Q-01 บันทึกเป็น NOT RUN ก่อน แล้วจึงแทนด้วยผลจริง)

| TC | AC | ทดสอบ | ผลที่คาด |
|---|---|---|---|
| TC-01 | AC-01 | 7.5 บันทึกผ่าน batch → backup ทุกหน้า → drift เป็น 3 → validate/chunk/commit | ok · score 7.5 (real) · แถว/fingerprint ส่วนข้อมูลตรง · epoch +1 |
| TC-02 | AC-01 (ก) | หลัง TC-01 อ่าน `/api/gradebook` และ `/api/reports/summary` → `computeReport` | 7.5 · รวม 7.5 · เฉลี่ย 7.5 · 75% |
| TC-03 | AC-01/02 💰 | ตาราง BR-01: null, 0, 0.5, 7, 7.5, 10, 10.5, 7.25, -0.5, "7.5", 100.5, 0.1, true, 11 (เต็ม 10) และ 0.5, 1, 1.5 (เต็ม 1) | ตามตารางใน qa-expected-from-br.md |
| TC-04 | AC-02 (ข) | restore ที่ล้ม: ข้อมูล, fingerprint, data_epoch, audit restore | ไม่เปลี่ยนเลย |
| TC-05 | AC-02 | แถวผิดอยู่ chunk ที่ 2 (index 510 จาก 520) | ปฏิเสธทั้งไฟล์ ไม่เหลือครึ่งเดียว |
| TC-06 | AC-02 | SQL guard ล้วน (แก้ restore_staging หลังผ่าน chunk) | 7.25/-0.5/"7.5"/true/10.5 → 422 · 7.5 กู้ได้ |
| TC-07 | AC-03 (ค) | ไฟล์รูปแบบเดิม: 8, null, excused+null | กู้ได้เหมือนเดิม |
| TC-08 | AC-03 | 520 แถว คะแนน (i mod 21)/2 ข้าม chunk 500 แถว | SUM 2580, แถว .5 = 248 ก่อน=หลัง |
| TC-09 | ทุก AC | `npm run typecheck`, `npm test` | PASS · ≥ 56/570 + test ใหม่ |
| TC-10 | AC-04 | grep การตรวจ score ฝั่ง client | ไม่มี → N/A |
| TC-11 | AC-05 | README §สำรองและกู้คืน | มี 1 บรรทัด |

## 1. สรุปผู้บริหาร

พบ **1 ข้อ**: สูง 0 · กลาง 0 · ต่ำ 1 (ทำซ้ำได้ 1 ข้อ, จากโค้ดอย่างเดียว 0 ข้อ)

- ไฟล์สำรองที่มีคะแนนครึ่ง (7.5, 0.5) กู้คืนได้ค่าเดิมเป๊ะแล้ว ไม่ถูกปัดเป็น 7 หรือ 8 และหน้าสมุดคะแนน/รายงานแสดง 7.5 และ 75% ถูกต้องหลังกู้คืน
- คะแนนที่ผิดจริง (7.25, ติดลบ, ตัวหนังสือ "7.5", เกินคะแนนเต็ม) ยังถูกปฏิเสธทั้งไฟล์ และข้อมูลเดิมไม่ถูกแตะเลยแม้แต่แถวเดียว รวมถึงกรณีที่แถวผิดอยู่ในส่วนที่สองของไฟล์ใหญ่
- ไฟล์สำรองแบบเดิม (คะแนนจำนวนเต็ม/ว่าง) ยังกู้คืนได้ ชุดเทสต์ทั้งหมดผ่าน 58 ไฟล์ / 603 tests
- ข้อสังเกตเดียว: รหัสเหตุผล (code) ในคำตอบ 422 ของบางค่าเป็นชื่อทางเทคนิคของ zod ไม่ใช่ `invalid_score` ตามที่ AC-02 เขียนไว้ — ครูไม่เห็นรหัสนี้ (หน้าจอแสดงข้อความรวม) ไม่กระทบข้อมูล

**เรื่องที่ควรแก้ก่อน**

1. **ชื่อ code ใน issue ของ AC-02 ไม่ตรงตัวอักษร** (B-01, ต่ำ): PM เลือก (ก) รับว่า AC-02 หมายถึง "ปฏิเสธที่ field score" แล้วปรับถ้อยคำ AC — แนะนำ เพราะไม่กระทบผู้ใช้และเป็นพฤติกรรมเดิมก่อนงานนี้ หรือ (ข) ให้ Full-Stack แปลง issue ของ zod ที่ `submissions.score` เป็น `invalid_score` ใน `restoreRowIssues`

## 2. ผลตาม AC

| AC | ผล | TC | หลักฐาน (Q-xx) | บั๊ก |
|---|---|---|---|---|
| AC-01 | ผ่าน | TC-01, TC-02, TC-03 | Q-01, Q-02, Q-06, Q-07 | |
| AC-02 | ผ่านเรื่องผลลัพธ์และความปลอดภัยข้อมูล · ชื่อ code ไม่ตรงใน 3/4 ค่าของ AC (7.25, -0.5, "7.5") — รอ PM ตัดสิน | TC-03, TC-04, TC-05, TC-06 | Q-01, Q-03, Q-05 (FAIL ไม่บังคับ) | B-01 |
| AC-03 | ผ่าน | TC-07, TC-08, TC-09 | Q-01, Q-04, Q-06, Q-07 | |
| AC-04 | N/A (รับใน brief.md) — QA ยืนยัน: ไม่มีคำว่า score ใน `src/lib/backup.ts` และ `src/components/RestoreModal.tsx`; `RestoreModal.tsx:58-61` ตรวจเฉพาะ app + sha256 | TC-10 | Q-08 (+ Q-92 ของ dev) | |
| AC-05 | ผ่าน — `README.md:113` | TC-11 | Q-09 | |

หลักฐานทุกรายการบันทึกผ่าน `evidence.mjs add` ตรงกับ `evidence.mjs list` (Q-01..Q-09 ของ QA)

## 3. ขอบเขตและวิธีทดสอบ

- เขียนเทสต์ black-box ของ QA `test/api/qa-m1-01.test.ts` (26 tests) เรียก endpoint จริงทั้งหมด: `POST /api/submissions/batch` → `takeBackup` (`/api/backup` ทุกหน้า) → `/api/restore/validate` → `/api/restore/execute` step chunk (500 แถวต่อ chunk แบบแอป) → commit แล้วตรวจฐานด้วย SQL (`typeof(score)`), `/api/backup/fingerprint`, `meta.data_epoch`, `audit_logs entity='restore'`, `/api/gradebook`, `/api/reports/summary` + `computeReport`
- ข้อมูลจำลองจาก `seed()` (ห้อง c1, นักเรียน st1/st2, งาน a1 เต็ม 10) + นักเรียนจำลอง 520 คน (ชื่อมีอีโมจิ) สำหรับกรณีหลาย chunk · ไม่มีข้อมูลจริง ไม่แตะ production
- ผลดิบ: `evidence/qa-m1-01-run.txt` (บรรทัด `QA-ROW`) · ตารางเทียบ: `evidence/qa-br01-results.md`
- สถานะของแต่ละข้อ: **ทำซ้ำได้** = เห็นผลจริงในแอปหรือเทสต์จริง · **จากโค้ด** = ยืนยันด้วยการอ่านโค้ดเท่านั้น
- ไม่ได้ทดสอบในเบราว์เซอร์ 360/1280px: งานนี้ไม่มี UI เปลี่ยน และ client ไม่ตรวจ score (AC-04 N/A)

## 4. สิ่งที่ถูกต้อง

- ตาราง BR-01 ตรงที่คาด 17/17 เรื่องกู้ได้/ปฏิเสธ: null, 0, 0.5, 7, 7.5, 10 (เต็ม 10) และ 0.5, 1 (เต็ม 1) กู้ได้ค่าเดิม · 0.5/7.5 เก็บเป็น REAL ไม่ถูกปัด · 10.5, 7.25, -0.5, "7.5", 100.5, 0.1, true, 11 และ 1.5 (เต็ม 1) ถูกปฏิเสธ 422 `invalid_backup` ที่ `submissions.score`
- ขอบคะแนนเต็มพอดี (10/10, 1/1) ผ่าน และเกินครึ่งแต้ม (10.5, 1.5) ถูกปฏิเสธ — ตรง BR-01
- (ก) หลังกู้คืน: gradebook 7.5 · รายงาน st1 7.5/10 · คะแนนรวม 7.5 · เฉลี่ยดิบ 7.5 · avgScorePercent 75 · average งาน 75 (คำนวณมือ 75; ถ้าถูกปัดจะได้ 70/80)
- (ข) ทุกกรณีที่ล้ม: แถวทุกตาราง, fingerprint, data_epoch, audit restore ไม่เปลี่ยน · แถวผิดใน chunk ที่ 2 (index 510) ถูกหยุดที่ `chunk:submissions#1` และไม่มีอะไรถูกเขียน
- SQL guard ใหม่ (`score*2 != CAST(score*2 AS INTEGER)`) ปฏิเสธ 7.25/-0.5/true/"7.5"/10.5 ได้เองแม้ข้าม zod และยอมรับ 7.5 — ไม่เปิดช่องรับค่าผิด
- (ค) ไฟล์รูปแบบเดิม (8, null, excused+null) กู้คืนได้ · 520 แถวข้าม chunk: SUM 2580 และแถว .5 = 248 ก่อน = หลัง (คำนวณมือ 24×105+60 = 2580, 24×10+8 = 248)
- fingerprint ส่วนข้อมูลหลังกู้คืนเท่ากับตอนสำรอง (ต่างเฉพาะ audit id และ epoch ตามออกแบบ)

## 5. บั๊ก

### B-01 code ใน issue ของคะแนนผิดไม่ใช่ `invalid_score` ตามที่ AC-02 เขียน — ต่ำ · ทำซ้ำได้ · AC-02

- ขั้นตอนทำซ้ำ:
  1. สำรองข้อมูลที่มีคะแนน st1/a1 แล้วแก้ score ในไฟล์เป็น 7.25 (หรือ -0.5 หรือ "7.5")
  2. `/api/restore/validate` → `/api/restore/execute` step chunk ของตาราง submissions
- ผลที่ได้: 422 `invalid_backup` issue `{ table: "submissions", field: "score", code: "not_multiple_of" }` (-0.5 → `too_small`, "7.5" → `invalid_type`, 0.1 → `not_multiple_of`, true → `invalid_type`) · ข้อมูลไม่เปลี่ยน (ถูกต้อง)
  - ทางเลี่ยง zod (แก้ staging ตรง ๆ): "7.5" ได้ code `score_over_full` เพราะ SQLite เทียบ TEXT > INTEGER เป็นจริงเสมอ และ rule `score_over_full` (restore-validation.ts:91) อยู่ก่อน `invalid_score` (:103) ใน COALESCE — ยังปฏิเสธถูกต้อง แค่เหตุผลผิด และเกิดได้เฉพาะกรณีแก้ staging ซึ่งผู้ใช้ทำไม่ได้
- ผลที่ควรได้ (ตามตัวอักษร AC-02): code `invalid_score` หรือ `score_over_full`
- ผลกระทบ: ไม่มีต่อครู — `RestoreModal.tsx` ไม่ได้ใช้ issue code (แสดงข้อความรวมจาก server) · พฤติกรรมเดิมก่อนงานนี้ (ขั้น chunk รายงาน code ของ zod มาตลอด เช่นก่อนแก้ 7.25 ได้ `invalid_type`)
- หลักฐาน: `evidence/qa-br01-results.md`, `evidence/qa-m1-01-run.txt` (Q-05 FAIL ไม่บังคับ)
- ไฟล์ที่น่าจะเกี่ยว: `worker/lib/restore-validation.ts:41-61` (`restoreRowIssues` ส่ง `issue.code` ของ zod ตรง ๆ), `:91` และ `:103` (ลำดับ rule)
- ตัวเลือก: (ก) รับ — ปรับถ้อยคำ AC-02 เป็น "field score" (แนะนำ ไม่ต้องแก้โค้ด) · (ข) ใน `restoreRowIssues` ถ้า `table==="submissions" && field==="score"` ให้ใช้ code `invalid_score` และย้าย rule `invalid_score` ขึ้นก่อน `score_over_full` (แก้เล็ก ต้องเพิ่ม assertion code ใน test)
- สถานะ: เปิด (รอ PM ตัดสิน)

ระดับความรุนแรง: **สูง** = ข้อมูลผิด/หาย, เงินผิด, ความปลอดภัย, ใช้งานหลักไม่ได้ · **กลาง** = ผิดบางกรณีและมีทางเลี่ยง · **ต่ำ** = หน้าตา/ข้อความ

## 6. ชุดเทสต์อัตโนมัติ

| คำสั่ง | baseline | รอบนี้ |
|---|---|---|
| `npm run typecheck` | PASS | PASS (`evidence/qa-typecheck.txt`) |
| `npm test` | ผ่าน 56 ไฟล์ / 570 tests | ผ่าน 58 ไฟล์ / 603 tests, ไม่ผ่าน 0 (= 570 เดิม + dev 7 + QA 26) (`evidence/qa-npm-test.txt`) |
| `npx vitest run test/api/qa-m1-01.test.ts --silent=false --reporter=verbose` | — | ผ่าน 26/26 (`evidence/qa-m1-01-run.txt`) |

- เทสต์ของ QA `test/api/qa-m1-01.test.ts` **เก็บไว้** เพราะครอบคลุมมากกว่าของ dev: ขอบ 0/10/เต็ม 1, null, 0.1, true, 11, 100.5, ตัวเลขรายงาน 75%, fingerprint, หลาย chunk 520 แถว, SQL guard รายค่า · ไม่ assert ชื่อ code (บันทึกผลจริงในบรรทัด `QA-ROW` ซึ่งเงียบในการรันปกติ) · ถ้า PM ไม่ต้องการ ลบได้ — แต่ snapshot ของ evidence Q-01..Q-09 นับไฟล์นี้อยู่ (ลบแล้ว snapshot กลับเป็น `tree:0f06f02107ef` ของ dev และหลักฐาน QA จะหมดอายุ ต้องบันทึกใหม่)

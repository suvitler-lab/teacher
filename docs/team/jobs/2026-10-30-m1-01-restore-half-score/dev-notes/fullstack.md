# Dev notes: Full-Stack · งาน `2026-10-30-m1-01-restore-half-score`

## T-01 กู้คืนไฟล์สำรองที่มีคะแนนครึ่ง (.5) ได้ — 2026-10-30

- ทำอะไร:
  - สาเหตุ: ตัวตรวจไฟล์สำรองใช้นิยามคะแนนคนละแบบกับตอนบันทึก — `restore-validation.ts` zod `score: integer` (ขั้น chunk) และ SQL rule `invalid_score` ตรวจ `score != CAST(score AS INTEGER)` (ขั้น commit) ขณะที่ `submissions.ts:61` รับ `multipleOf(0.5)` → คะแนน 7.5 ถูกปฏิเสธ 422 `invalid_backup` ตั้งแต่ส่ง chunk แรกของตาราง submissions
  - แก้: zod `score: halfStep.min(0).nullable()` (`halfStep = z.number().multipleOf(0.5)`) และ SQL `score*2 != CAST(score*2 AS INTEGER)` · การตรวจ json_type (ปฏิเสธ string) / `<0` / rule `score_over_full` คงเดิม · ไม่แตะ rule อื่น ไม่มี migration
  - README §สำรองและกู้คืนข้อมูล เพิ่ม 1 บรรทัด (AC-05)
- ไฟล์: `worker/lib/restore-validation.ts`, `test/api/restore-half-score.test.ts` (ใหม่), `README.md`
- เทสต์ที่เพิ่ม (`test/api/restore-half-score.test.ts`, 7 tests):
  - AC-01: บันทึก 7.5 ผ่าน `POST /api/submissions/batch` (a1 เต็ม 10) → `takeBackup` ทุกหน้า → แก้ข้อมูลเป็น 3 → `restoreFrom` (validate → chunks → commit) → ok, score = 7.5 (`typeof` = real), counts และแถว submissions ตรงกับไฟล์, data_epoch +1
  - AC-02: 7.25 / -0.5 / "7.5" / 10.5 → 422 `invalid_backup` issue `submissions.score` · ข้อมูลเดิม/epoch/audit restore ไม่เปลี่ยน (3 ค่าแรกถูกจับที่ chunk, 10.5 ที่ commit ด้วย `score_over_full`)
  - AC-02 (SQL guard): ส่ง chunk ที่ถูกต้องแล้วแก้ `restore_staging.rows_json` ตรง ๆ เป็นทั้ง 4 ค่า → commit ต้อง 422 (พิสูจน์ว่า rule SQL ใหม่ยังปฏิเสธเองโดยไม่พึ่ง zod)
  - AC-03: คะแนนจำนวนเต็ม + null กู้คืนได้เหมือนเดิม
- คำสั่งที่รัน → ผล:
  - ก่อนแก้ `npx vitest run test/api/restore-half-score.test.ts` → **FAIL ตามคาด** 2 failed / 5 passed: AC-01 `expected 422 to be 200` ที่ `backup-helpers.ts:35` (chunk ของ submissions ถูกปฏิเสธ `invalid_backup`) และ test SQL guard ล้มที่จุดเดียวกัน (chunk 7.5 ไม่ผ่าน) · หลักฐาน `evidence/before-fix.txt`
  - หลังแก้ `npx vitest run test/api/restore-half-score.test.ts test/api/restore.test.ts test/api/backup-consistency.test.ts` → PASS 3 ไฟล์ / 49 tests (`evidence/after-fix-restore.txt`, Q-90)
  - `npm run typecheck` → PASS (`evidence/typecheck.txt`)
  - `npm test` → **FAIL 1** — 56 passed / 1 failed ไฟล์, 576 passed / 1 failed tests (baseline 56/570; +7 test ใหม่) (`evidence/npm-test.txt`, Q-91)
    - ตัวที่ล้ม: `test/api/audit-restore-domain.test.ts:33` `it.each([999, -1, 1.5])("refuses invalid score %s …")` — ค่า 1.5 ถูกต้องตาม BR-01 (งานเต็ม 10) test นี้จึงล็อกพฤติกรรมบั๊กเดิมไว้ · ไฟล์อยู่นอกขอบเขตที่เขียนได้ จึงไม่แก้
    - ข้อเสนอ: เปลี่ยน `1.5` เป็น `1.25` (คงเจตนา "เศษที่ไม่ใช่ขั้น 0.5 ต้องถูกปฏิเสธ") — หลังเปลี่ยนคาดว่า 57 ไฟล์ / 577 tests ผ่าน
  - volume.test.ts, restore.test.ts, backup-consistency.test.ts ผ่านในการรันทั้งชุด
- AC ที่ครอบคลุม: AC-01, AC-02, AC-03 (เทสต์), AC-04 (N/A ด้านล่าง), AC-05 (README บรรทัด 113)
- AC-04 ตรวจฝั่ง client: ไม่มีการตรวจ score → N/A
  - `src/lib/backup.ts:1-103` — มีแค่อ่าน/สร้างไฟล์สำรอง (readAll, fingerprint, sha256) ไม่มีคำว่า score หรือการตรวจแถว
  - `src/components/RestoreModal.tsx:58-61` — ตรวจเฉพาะ `parsed.app === "ngankrob"` และ sha256 แล้วส่ง manifest ไป `/api/restore/validate` (บรรทัด 63-64) · แถวข้อมูลถูกส่งไป server ตรง ๆ ไม่ตรวจค่า
  - (PM: N/A ต้องอยู่ในตาราง `## N/A ที่รับ` ของ brief ถึงจะนับ — ยังไม่ได้บันทึก evidence N/A)
- mock/ชั่วคราวที่ต้องถอด: ไม่มี
- ข้อจำกัด/สิ่งที่ยังไม่ทำ:
  - ไม่ได้แก้ `audit-restore-domain.test.ts` (นอกขอบเขต) → ชุดเต็มยังแดง 1 test
  - Git Bash `sed -i` แปลง CRLF→LF ใน working copy ของ README.md / restore-validation.ts — repo เก็บ LF และ `core.autocrlf=true` จึงไม่มีผลกับ diff (diff = เนื้อหาเท่านั้น)
  - จุดอื่นที่นิยามคะแนนเป็นจำนวนเต็มแบบเดียวกัน: ไม่พบใน restore-validation (score ใน `scan_sessions.full_score`/`assignments.full_score` เป็นคะแนนเต็ม ซึ่งเป็นจำนวนเต็มถูกแล้ว)
- ถึง QA:
  - ค่า boundary: 0, 0.5, 10 (= เต็ม) ต้องผ่าน · 10.5, 7.25, 0.1, -0.5, "7.5", true ต้องถูกปฏิเสธ
  - คะแนน 7.5 ที่ restore แล้วต้องเป็น REAL (`typeof(score)='real'`) ไม่ถูกปัดเป็น 7/8 ในคอลัมน์ INTEGER affinity
  - ไฟล์สำรองเก่า (คะแนนจำนวนเต็มล้วน) ยังกู้คืนได้

## T-01 (ต่อ) แก้ test ที่ยึดพฤติกรรมเดิม — 2026-10-30

- PM อนุมัติขอเปลี่ยนนอกขอบเขต ตัวเลือก (ก): `test/api/audit-restore-domain.test.ts:33` เปลี่ยน `it.each([999, -1, 1.5])` เป็น `it.each([999, -1, 1.25])` แก้แค่บรรทัดนี้บรรทัดเดียว
- คำสั่งที่รัน → ผล:
  - `npm run typecheck` → PASS (`evidence/typecheck.txt`)
  - `npm test` → PASS 57 ไฟล์ / 577 tests (baseline 56 / 570 + ไฟล์ใหม่ 1 ไฟล์ / 7 tests) (`evidence/npm-test.txt`)
- evidence: Q-90 PASS (บันทึก snapshot ใหม่), Q-91 PASS (`--mandatory`, แทนผล FAIL เดิม), Q-92 N/A AC-04 (PM รับไว้ในตาราง N/A ของ brief แล้ว)

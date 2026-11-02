# Dev notes: Back-End · งาน `2026-11-02-integrity-c01`

## T-02 server judge `already_submitted` + ข้อยกเว้นรอบเดียวกัน + เส้นทาง lost — 2026-11-02

**สรุป 10 บรรทัด (สำหรับ PM)**

1. สถานะ: เสร็จ (มีคำขอเปลี่ยนนอกขอบเขต 1 ข้อ: `test/api/volume.test.ts`)
2. ก่อนแก้ `c01-no-overwrite`: 20 failed | 15 passed (35) — ตรงกับที่ QA คาด
3. หลังแก้ `c01-no-overwrite` + `server-intent`: 52 passed (52) (35 + 17 รวมเทสต์ใหม่ 3 ข้อของ T-02)
4. ชุดเต็มก่อนแก้: Tests 20 failed | 1048 passed (1068), Files 1 failed | 88 passed (89)
5. ชุดเต็มหลังแก้: Tests 1 failed | 1070 passed (1071), Files 1 failed | 88 passed (89)
6. เทสต์เดิมที่ล้ม: `volume.test.ts > writing at school size > scanning: one child, and a whole class or more in one request` — สแกน (camera) ช่อง a1 ที่ seed ไว้เป็น submitted (grid) ทุกช่อง แล้วคาด `ok` → ตอนนี้ได้ `already_submitted` ตาม BR-01 (ไม่ได้แก้เอง)
7. `npm run typecheck` → exit 0 (PASS) · ไม่มีสคริปต์ lint ในโปรเจกต์ (N/A — ไม่มีให้รัน)
8. R-01 ใน server-intent: op manual ใส่ `score: 8` ตามที่ PM ยืนยัน (D-integrity-c01-04) + ตรวจว่าช่อง st2 = 8
9. ไม่แตะ SQL `stillValid`, `/bulk`, `/bulk-undo`, GET, migration, ไฟล์เทสต์ของ QA
10. ความเสี่ยง: ดูหัวข้อ "ข้อจำกัด" (ช่องที่ได้ `already_submitted` จากค่าที่อ่าน ไม่อยู่ใน `cellsGuard`)

### ทำอะไร

- `worker/routes/submissions.ts`
  - เพิ่ม `alreadySubmitted(op, cell)` = op เป็นรับงาน (`isReceive` — ตัดสินจาก method ไม่เชื่อ intent) + ช่อง `status = submitted` + **ไม่**เข้าข้อยกเว้น BR-02 ครบ 3 ข้อ (ช่อง method camera/hid/manual และ `scan_session_id = op.scanSessionId` · ช่อง `score` null · `op.score != null`)
  - ในลูป `apply()` เรียกหลังเช็ก `superseded` → ตอบ `{ opId, result: "already_submitted", submission: mapSubmission(before) }` ไม่เข้า `pending` ไม่มี audit ไม่เปลี่ยน `effective` · ลำดับจึงเป็น duplicate → epoch_changed → judge (ผลปฏิเสธเดิม) → superseded → already_submitted → ok (BR-06)
  - ถ้า `before` เป็นแถว pending ของคำขอเดียวกัน (ไม่ใช่ค่าใน DB) จดไว้ใน `onPending`: หลังเขียน ถ้าแถวนั้นลงจริง → ตอบด้วยค่าที่ลงจริง (late หลัง lateFix เหมือน `ok` ของ op ที่เขียน) · ถ้าไม่ลง → ตัดสินใหม่กับค่าปัจจุบัน · ถ้า epoch เปลี่ยนจนทั้ง batch ไม่ลง → `epoch_changed` เหมือน op ที่ pending
  - เส้นทาง lost: แทน `judge ?? superseded` ด้วย `judgeUnwritten()` = judge → (ช่องมี event_at ใหม่กว่า → `superseded`) → (`alreadySubmitted` → `already_submitted`) → `superseded` ตามสัญญา EP-01
  - การแข่งสองเครื่อง: ใช้ `cellsGuard` เดิม (abort → อ่าน/ตัดสินใหม่ ≤ 3 รอบ) — พิสูจน์ด้วย AC-11 (gated)
- `test/api/server-intent.test.ts`
  - R-01: op `manual` ของ st2 ใส่ `score: 8` + assert ช่อง = submitted 8 manual
  - เพิ่ม describe "integrity-c01 BR-01 / BR-06" 3 ข้อ: (ก) `[R1 hid null, R2 hid 10]` คำขอเดียว → `[ok, already_submitted]` submission = แถวของ R1, audit 1 แถว · (ข) แถวแรกไม่ลงเพราะงานถูกปิดระหว่างตัดสินกับเขียน (gateBatch) → ทั้งสอง `assignment_closed` ไม่มีอะไรถูกเขียน · (ค) `[hid null, grid 7]` → ok, ok (การให้คะแนนไม่ได้ผลนี้)
  - ยืนยันว่า (ข) จับบั๊กได้จริง: ปิดการตัดสินใหม่ของ `onPending` ชั่วคราว → เทสต์ล้ม (ได้ `already_submitted`) แล้วคืนโค้ด

### คำสั่งที่รัน → ผล

| คำสั่ง | ผล | ไฟล์ |
|---|---|---|
| `npx vitest run test/api/c01-no-overwrite.test.ts` (ก่อนแก้) | FAIL ตามคาด: 20 failed / 15 passed (35) | `evidence/t02-before-fix.txt` |
| `npm test` (ก่อนแก้, baseline) | Files 1 failed / 88 passed · Tests 20 failed / 1048 passed (1068) — ที่ล้มคือ c01 ทั้ง 20 | `evidence/t02-baseline-full.txt` |
| `npx vitest run test/api/c01-no-overwrite.test.ts test/api/server-intent.test.ts` | PASS 52/52 | `evidence/t02-after-fix-api.txt` |
| `npm test` (หลังแก้) | Files 1 failed / 88 passed · Tests 1 failed / 1070 passed (1071) — ล้มเฉพาะ volume (ด้านล่าง) | `evidence/t02-after-fix-full.txt` |
| `npm run typecheck` | PASS (exit 0) | `evidence/t02-typecheck.txt` |

หมายเหตุ: ไม่ได้บันทึก `evidence.json` — ชนิดหลักฐานใน `evidence.mjs kinds` ไม่มีของ Back-End และ `evidence.json` อยู่นอกไฟล์ที่ได้รับ (`evidence/t02-*`) → ให้ PM/QA บันทึกโดยอ้างไฟล์ด้านบน

### เทสต์เดิมที่ล้ม (ขอเปลี่ยนนอกขอบเขต — ไม่ได้แก้เอง)

- `test/api/volume.test.ts` › "writing at school size" › "scanning: one child, and a whole class or more in one request"
  - เหตุ: `seedVolume()` ใส่ทุกช่องของทุกงานเป็น `submitted` (method grid) แล้วเทสต์ส่ง op `camera` score 3 / 6 เข้า a1 คาด `ok` และคาดว่าคะแนนถูกทับ + audit 51 แถว → ตาม BR-01 ได้ `already_submitted` ไม่มีการเขียน (ตัววัด rows written ของเทสต์นี้จึงไม่ได้วัดการเขียนแล้วด้วย)
  - ข้อเสนอ (แนะนำ ก): ก) ก่อนส่ง scan ลบแถว a1 ของ st1_* .. st3_* (`DELETE FROM submissions WHERE assignment_id='a1' AND (student_id LIKE 'st1\_%' ESCAPE '\' OR …)`) ให้เป็น "ยังไม่ส่ง" ซึ่งตรงกับการสแกนจริง ผลคาด/ตัวเลข audit 51 คงเดิม · ข) เปลี่ยน method ใน `scanOps` เป็น `grid` (แต่ชื่อเทสต์คือการสแกน) · ค) seed แถว a1 เป็น void
  - ผู้แก้: QA/เจ้าของไฟล์ตามที่ PM มอบ
  - **แก้แล้ว (PM เพิ่มไฟล์ใน ownership ของ T-02):** เพิ่มบรรทัด DELETE ด้านล่างหลัง `await seedVolume();` ในเทสต์นี้ ไม่แตะ assertion → `npm test` → **Files 89 passed (89) · Tests 1071 passed (1071)** (exit 0) · `npm run typecheck` → PASS (exit 0) · `evidence/t02-after-fix-full.txt`, `evidence/t02-typecheck.txt`
  - (ประวัติ) อัปเดต 2026-11-02: PM อนุมัติตัวเลือก (ก) ในข้อความ แต่ hook ownership ปฏิเสธการแก้ (`test/api/volume.test.ts` ไม่อยู่ในขอบเขตของ team-backend-dev ใน ownership.json) → **BLOCKED**: ยังไม่ได้แก้ · รันซ้ำ: `npm test` → Files 1 failed / 88 passed · Tests 1 failed / 1070 passed (1071) (ล้มเฉพาะ volume ข้อนี้) · `npm run typecheck` → PASS · แก้ที่เตรียมไว้ (ใส่หลัง `await seedVolume();` ในเทสต์นี้ เท่านั้น ไม่แตะ assertion): `await env.DB.prepare("DELETE FROM submissions WHERE assignment_id = 'a1' AND student_id IN (SELECT id FROM students WHERE class_id IN ('c1','c2','c3'))").run();`

### AC ที่ครอบคลุม

AC-01, 02, 03, 04, 05, 06, 07, 08, 09 (ฝั่ง server), 10, 11, 13, 14 — ผ่านใน `c01-no-overwrite.test.ts` 35/35 · BR-02/R-01 ใน `server-intent.test.ts`

### ข้อจำกัด / ความเสี่ยง

- `cellsGuard` ครอบเฉพาะช่องที่ถูกเขียน: op ที่ได้ `already_submitted` จากค่าที่อ่าน (ไม่มีการเขียนช่องนั้น) ไม่ถูก guard — ถ้าช่องถูก void จากอีกเครื่องในเสี้ยววินาทีหลังอ่าน คำตอบจะเป็น `already_submitted` (ลำดับ "สแกนก่อน void" ที่ถูกต้องตามเวลาที่ server เห็น) client เอาออกจากคิว — ไม่ทับข้อมูล แต่การสแกนนั้นไม่ถูกบันทึก ความเสี่ยงต่ำ (ต้องชนกันในระดับ ms) · ไม่ได้ขยาย guard เพราะสัญญาให้ใช้ cellsGuard เดิม
- `already_submitted` ไม่มี audit → ส่ง opId เดิมซ้ำถูกตัดสินใหม่ (ตามสัญญา D-integrity-c01-03)
- ไม่มี migration · ไม่เปลี่ยน request schema · ผลอื่นทุกชนิดและ HTTP status เดิม

### ถึง QA

- คำขอเดียวที่มีหลาย op ของช่องเดียวกัน: `[void, รับงาน]` บนช่อง submitted → ok, ok · `[รับงาน R1, รับงาน R2]` บนช่องว่าง → ok, already_submitted (submission = แถว R1) · `[รับงาน, รับงาน, grid]`
- แข่งสองเครื่อง (AC-11 gated) และกรณีงานถูกปิดระหว่างตัดสินกับเขียน (เส้นทาง lost)
- R-01 (camera แล้ว manual รอบเดียวกัน score 8) ยัง ok; manual score null รอบเดียวกัน → already_submitted (ตามกฎข้อ 3)
- `volume.test.ts` ต้องปรับตามข้อเสนอด้านบนก่อน CP-2 จะเขียวทั้งชุด

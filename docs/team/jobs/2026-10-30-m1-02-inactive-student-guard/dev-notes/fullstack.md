# Dev notes: Full-Stack · งาน `2026-10-30-m1-02-inactive-student-guard`

## T-01 ไม่รับงานใหม่ของนักเรียนที่ status ≠ active — 2026-10-30

- ทำอะไร:
  - สาเหตุ: `loadWorld` อ่านนักเรียนแค่ `id, class_id` และทั้ง `judge()` กับ `stillValid()` ไม่ดู `students.status` เลย เด็กที่ย้าย/ไม่ใช้งาน/จบปีแต่ `class_id` ยังตรงกับงานจึงยังถูกรับงานได้
  - `loadWorld` อ่าน `s.status` เพิ่ม
  - `judge()` (ตรวจหลัง `not_in_class` และก่อน score range): ถ้า status ≠ active และ (`opIntent(op) === 'receive'` หรือยังไม่มีแถวของคู่ งาน+นักเรียน ในตาราง ไม่ว่าสถานะใด) → `student_inactive`
  - `stillValid()` (ใช้ทั้ง upsert และ audit): ใน EXISTS ของ students เพิ่ม `st.status = 'active' OR (receive = 0 AND EXISTS แถวเดิม)` ดังนั้นถ้า status เปลี่ยนระหว่าง judge กับ batch ทั้งแถวและ audit จะไม่ถูกเขียน แล้ว route จะ re-judge กับข้อมูลสด (โค้ดเดิม) ได้ `student_inactive`
  - bulk: ไม่ต้องแก้ เพราะ roster ใช้ `memberClause` ซึ่งไม่รวม moved/inactive (ยืนยันด้วย test AC-05)
  - `SubmissionOpResult` เพิ่ม `{ opId; result: "student_inactive" }`
  - client: outbox ไม่ต้องแก้ เพราะผลที่ไม่ใช่ ok/duplicate ไปทาง `moveOutboxToFailed` อยู่แล้ว (`outbox.ts:153-157`) และไม่อยู่ใน `NON_BLOCKING` จึงกัน op ถัดไปของช่องเดียวกัน · เพิ่มข้อความไทยใน `REJECTED` (Scan.tsx) และ `REASON` (Overlays.tsx)
- ไฟล์: `worker/routes/submissions.ts`, `shared/types.ts`, `src/pages/Scan.tsx` (REJECTED), `src/components/Overlays.tsx` (REASON), `test/api/inactive-student.test.ts` (ใหม่), `test/unit/outbox-order.test.ts` (+1 test)
- เทสต์ที่เพิ่ม: `test/api/inactive-student.test.ts` 22 tests (AC-01 moved/inactive/finished × hid/camera/manual, grid+intent receive, แถว void เดิม · AC-02 · AC-03 ×3 status · not_in_class มาก่อน · active ไม่กระทบ · AC-04 race ×3 · AC-05 bulk ×2) · unit: student_inactive ไปอยู่ failed ทันที ไม่ส่งซ้ำ
- คำสั่งที่รัน → ผล:
  - ก่อนแก้ `npx vitest run test/api/inactive-student.test.ts` → 16 failed / 6 passed (`evidence/before-fix.txt`) — ที่ผ่านอยู่แล้วคือ AC-02, AC-05 ×2, not_in_class, active, AC-04 แถวเดิม
  - หลังแก้ `npm run typecheck` → exit 0 · `npm test` → 59 ไฟล์ / 626 tests ผ่าน (baseline 58 / 603) (`evidence/after-fix.txt`)
  - ลองถอดเงื่อนไขใน stillValid ชั่วคราว → AC-04 ล้ม 2 ตัว (ยืนยันว่าเทสต์ race จับ guard ในธุรกรรมจริง) แล้วคืนโค้ด
  - evidence: Q-90 (FAIL ก่อนแก้), Q-91, Q-92 (PASS)
- AC ที่ครอบคลุม: AC-01..AC-07
- mock/ชั่วคราวที่ต้องถอดตอนเชื่อมระบบ: ไม่มี
- ข้อจำกัด/สิ่งที่ยังไม่ทำ:
  - `judge` ใช้ `opIntent(op) === 'receive'` ตามคำสั่ง จึงเข้มกว่า `stillValid` (ซึ่งใช้ `receive` = submitted และ intent receive): op `void`/`excused` ที่ method `manual`/`hid`/`camera` (เช่น ยกเลิกการส่งในหน้าสแกน) ของเด็กที่ไม่ active จะได้ `student_inactive` แม้มีแถวเดิม — ไม่ทำให้ข้อมูลผิด แต่ครูยกเลิกจากหน้าสแกนไม่ได้ (ทำในสมุดคะแนนได้)
  - bulk ใช้ `memberClause` ซึ่ง **รวม `finished`** (และ moved/inactive ที่ `left_at` หลังวันจบเทอม) โดยตั้งใจตาม school-year model — bulk `all-submitted` จึงยังรับงานให้เด็ก finished ได้ ไม่ได้แก้เพราะเป็นการตัดสินใจเชิงผลิตภัณฑ์
- ถึง QA: race ระหว่าง judge กับ batch (gateBatch) · offline replay ของ op ที่ค้างในคิวตอนเด็กยัง active · grade บนแถว void ของเด็ก moved (ควรได้ ok ตาม "มีแถวไม่ว่าสถานะใด") · bulk กับเด็ก finished

## T-01 รอบ 2 — BR-02 ปรับตาม D23 (AC-08, AC-09) — 2026-10-30

- ทำอะไร (เฉพาะ `worker/routes/submissions.ts`):
  - helper `isReceive(op)` = `status === "submitted" && opIntent(op) === "receive"` ใช้ทั้งใน judge (assignment_closed, student_inactive) และฟิลด์ `receive` ของแถว guard ทำให้ judge กับ stillValid ใช้นิยาม "รับงาน" เดียวกัน (คำถาม 1 → ข)
  - op ที่ไม่ใช่รับงานของเด็ก status ≠ active: อนุญาตเมื่อมีแถวเดิม **หรือ** เด็กอยู่ในรายชื่อห้องของเทอมของงาน
    - judge ใช้ `inRoster` จาก `@shared/roster` (เรียกใช้ ไม่แก้)
    - `loadWorld` LEFT JOIN `terms` ใน query assignments (`term_year`, `term_end`) และอ่าน `students.left_at` ไม่เพิ่ม round trip
    - stillValid เป็น SQL นิยามเดียวกับ `memberClause`: JOIN assignments→terms; finished หรือ moved/inactive ที่ `left_at > end_date`; ไม่มีเทอม → active เท่านั้น
  - bulk คงเดิม (คำถาม 2)
- เทสต์ที่เพิ่ม/ปรับใน `test/api/inactive-student.test.ts` (รวม 30):
  - AC-03 แยก moved/inactive ในเทอมที่ยังไม่มี end_date, moved ที่ left_at < end_date (grade + excused), งานไม่มีเทอม + finished → `student_inactive`
  - finished ในเทอมปัจจุบัน grade ช่องว่าง = ok แต่สแกนไม่ได้
  - AC-08 ปีก่อน: finished / moved ที่ left_at > end_date = ok · moved ที่ left_at < end_date = `student_inactive` · สแกนงานปีก่อน = `student_inactive` · race แก้ left_at ระหว่าง judge กับ batch → ไม่มีแถว/audit
  - AC-09 void manual ของเด็ก moved ที่มีแถว = ok
- คำสั่งที่รัน → ผล (`evidence/after-fix-r2.txt`):
  - `npm run typecheck` → exit 0
  - `npm test` → 59 ไฟล์ / 634 ผ่าน
  - test ใหม่ 30/30
  - ทดสอบแบบ mutation บน stillValid: M1 ปิดเงื่อนไข status → ล้ม 3 (AC-04 ×2, AC-08 race) · M2 ให้สาขา roster เป็นจริงเสมอ → ล้ม 2 (AC-04 grade ช่องว่าง, AC-08 race) · คืนโค้ดแล้ว
- evidence: Q-90 (FAIL ก่อนแก้, mandatory=false), Q-91, Q-92 (PASS) บันทึกทับที่ snapshot ใหม่
- ข้อจำกัด: ส่วน "ข้อจำกัด" ของรอบ 1 เรื่อง judge เข้มกว่า stillValid และ bulk กับเด็ก finished ไม่ใช้แล้ว (ตัดสินแล้วตาม D23) · judge/stillValid ไม่ตรวจ `classInYear` (กติกาเดิมไม่ตรวจ ห้องผูกกับงานผ่าน assignment_classes อยู่แล้ว)
- ถึง QA: AC-08 ที่ขอบ `left_at = end_date` (ต้องเป็น `student_inactive` เพราะใช้ `>`) · offline replay ของ op void/grade ที่ค้างคิวตอนเด็กถูกย้าย

## T-01 รอบแก้ Verify 1/3 (R-01..R-05, B-01) — 2026-10-30

- ทำอะไร:
  - R-01/B-01: แยกฟิลด์ guard `hand_in` ออกจาก `receive`
    - `receive` ใช้ตรวจงานปิดรับเท่านั้นเหมือนเดิม
    - เงื่อนไข status ใน stillValid ใช้ `hand_in = 0`
    - batch ตั้ง `hand_in = isReceive(op)` · bulk ตั้ง `hand_in = 0` ทุก action (การปิดรับยังกันด้วย 409 เดิมของ all-submitted)
  - R-05(ข): "มีแถวอยู่แล้ว" = แถวที่ status ≠ void · judge ดู `cell.status` · stillValid เพิ่ม `s0.status <> 'void'`
  - R-03: stillValid ใช้ `NULLIF(t.end_date, '')` ให้ตรงกับ `inRoster`
  - R-02: `commitStudent` ใน Scan.tsx ถ้า `student.status !== "active"` → beep.err + vibrate + feedback danger ข้อความ `REJECTED.student_inactive` ทันที และไม่เข้าคิว
- ไฟล์: `worker/routes/submissions.ts`, `src/pages/Scan.tsx` (เฉพาะ commitStudent), `test/api/inactive-student.test.ts`, `test/unit/scan-controller.test.ts`
- เทสต์ที่เพิ่ม:
  - `test/api/inactive-student.test.ts` (36 ตัว) เพิ่ม:
    - grade แถว void ของเด็ก moved = `student_inactive`
    - `left_at = end_date` = `student_inactive`
    - race: finished ระหว่างตัดสินกับเขียน + สแกน → ไม่มีแถว/audit
    - race: แถวถูก void ระหว่างนั้น
    - race: end_date ถูกตั้งเป็น '' (R-03)
    - bulk all-submitted + full-score บนงานปีก่อน: finished และ moved ที่ออกหลังจบเทอมได้แถว + audit, `changed = 2`, เด็กที่ออกก่อนจบเทอมไม่ถูกแตะ
  - วันที่ fixture เปลี่ยนเป็น ค.ศ. ทั้งหมด (`seed()` ใน helpers.ts ไม่ได้แตะ)
  - `test/unit/scan-controller.test.ts` +1: moved/inactive/finished → ไม่ enqueue, เสียง error, ข้อความถูก · เด็ก active ยังเข้าคิว
- คำสั่งที่รัน → ผล (`evidence/after-fix-v1.txt`):
  - `npm run typecheck` → exit 0 (Q-94)
  - `npm test` → 61 ไฟล์ / 692: ผ่าน 687 / ล้ม 5 ทั้งหมดอยู่ใน `test/api/qa-m1-02.test.ts` ของ QA ซึ่งตรึงพฤติกรรมก่อนแก้ (Q-95 FAIL; สคริปต์ไม่ยอมบันทึก FAIL แบบ mandatory)
    - `B-01: ended term: a child who left AFTER the end is on the list, so all-submitted should mark them` (it.fails ที่ตอนนี้ผ่านจริง)
    - `B-01: 'ทั้งห้องส่งแล้ว' on last year's work marks last year's (finished) children` (it.fails)
    - `B-01 (what happens today): the dropped child gets no row and no audit; the active ones land`
    - `B-01 (what happens today): all-submitted answers ok with changed 0 and writes nothing`
    - `a voided cell is still an existing cell: the gradebook can score it again` (ขัดกับ R-05(ข))
  - test ใหม่ + scan-controller → 61/61 (Q-93)
- ทดสอบแบบ mutation (คืนโค้ดแล้ว):
  - M1 ปิดเงื่อนไข status → ล้ม 5
  - M2 ให้สาขา roster เป็นจริงเสมอ → ล้ม 3
  - M3 ใช้ `receive` แทน `hand_in` → ล้ม 1 (bulk ปีก่อน)
  - M5 ไม่ใช้ NULLIF → ล้ม 1 (R-03 race)
  - Scan: ถอดการตรวจ → ล้ม 1
  - M4 ถอด `s0.status <> 'void'` → **ไม่มี test ล้ม** เพราะการเปลี่ยนแถวใด ๆ ระหว่างตัดสินกับเขียนถูก `cellsGuard` จับก่อน (batch abort → อ่านใหม่ → judge ตอบ `student_inactive`) เงื่อนไขนี้ใน stillValid จึงเป็นชั้นสำรอง ที่คงไว้เพื่อให้นิยาม judge = stillValid
- ถึง QA:
  - ต้องปรับ 5 test ข้างบนใน `qa-m1-02.test.ts`
  - offline replay: grade บนแถว void ของเด็กที่เพิ่งย้าย ควรได้ `student_inactive`
  - หน้าสแกนกับเด็กที่ไม่ active: ไม่มีเสียงสำเร็จ และไม่มีรายการเข้าคิว

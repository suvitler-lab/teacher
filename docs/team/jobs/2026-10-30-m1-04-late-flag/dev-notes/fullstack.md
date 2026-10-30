# Dev notes: Full-Stack · งาน `2026-10-30-m1-04-late-flag`

## T-01 สถานะส่งช้าตามกำหนดส่งปัจจุบัน + ผังเลขที่หน้าสแกน — 2026-10-30

- ทำอะไร:
  - `POST /api/assignments`: เพิ่ม `UPDATE submissions SET late = <BR-04> WHERE assignment_id = ?1 AND late IS NOT <BR-04>` ใน batch เดียวกับ upsert งาน (หลัง guard `lowersBelowScores` / class-year / epoch จึง rollback พร้อมกันได้) · วันที่ไทยใน SQL = `date(submitted_at / 1000 + 7 * 3600, 'unixepoch')` เทียบสตริงกับ due_date · ไม่แตะ `updated_at` / `event_at`
  - audit ของงาน: `before` และ `after` มี `due_date` แล้ว (งานใหม่ `before` = null เหมือนเดิม)
  - `Scan.tsx`: `SubState` มี `late?` · `reconcileSubs` อ่าน `row.late` จาก server (`mapSubmission` ส่งเป็น boolean) · ผังเลขที่ส่ง `late: sub.late === true` ให้ `workState`
  - ลบ `hmToMinutes` (grep `src worker shared test scripts` ไม่พบที่ใช้; เจอเฉพาะสำเนาใน `.audit/` ซึ่งไม่ใช่โค้ดที่รัน)
- ไฟล์: `worker/routes/assignments.ts`, `src/pages/Scan.tsx`, `worker/lib/time.ts`, `test/api/late-flag.test.ts` (ใหม่), `test/unit/scan-controller.test.ts` (เพิ่ม 1 test)
- เทสต์ที่เพิ่ม: `late-flag.test.ts` 15 tests (AC-01..07, 09 รวมการเทียบ SQL กับ `isLateSubmission` 11 นาทีขอบ) · `scan-controller.test.ts` 1 test (AC-08)
- คำสั่งที่รัน → ผล:
  - ก่อนแก้ `npx vitest run test/api/late-flag.test.ts test/unit/scan-controller.test.ts` → 12 failed / 29 passed (`evidence/before-fix.txt`) · AC-06 3 ข้อผ่านตั้งแต่ก่อนแก้ (เป็น guard ว่า late ไม่เปลี่ยนเมื่อถูกปฏิเสธ — จะล้มถ้า UPDATE ถูกย้ายออกนอก batch)
  - หลังแก้ → 41/41 (`evidence/after-fix.txt`)
  - `npm run typecheck` → PASS · `npm test` → 64 ไฟล์ / 738 passed (baseline 63 / 722 + ใหม่ 1 ไฟล์ / 16 tests) (`evidence/regression.txt`) · `volume.test.ts` 7/7 (`evidence/volume.txt`) · โปรเจกต์ไม่มีสคริปต์ lint
- Mutation (`evidence/mutation.txt`, คืนไฟล์แล้วด้วย cmp ตรงกับต้นฉบับ):
  - M1 ถอด UPDATE (`SET late = late`) → late-flag 9 failed
  - M2 ใช้ UTC (`submitted_at / 1000` ไม่บวก 7 ชม.) → 3 failed (AC-04 ทั้งสาม)
  - M3 Scan กลับเป็น `late: false` → scan-controller 1 failed (AC-08)
- AC ที่ครอบคลุม: AC-01..AC-09 (AC-08 ดูข้อจำกัดเรื่อง CSS)
- mock/ชั่วคราวที่ต้องถอดตอนเชื่อมระบบ: ไม่มี
- ข้อจำกัด/สิ่งที่ยังไม่ทำ:
  - **ไม่มี CSS `.sc-cell.late`** ใน `src/styles/scan.css` (นอกขอบเขต) → ตอนนี้ช่องที่ช้าได้ class `late` ถูกต้องแต่แสดงเป็นช่องพื้นธรรมดา (ไม่เขียวเหมือน scored) · เสนอเพิ่ม 1 บรรทัดแบบเดียวกับ `.wcell.late` ใน `ui.css`: `.sc-cell.late { background: var(--bg-warning); border-color: var(--border-warning); color: var(--text-warning); }`
  - การสแกนที่ยังรอส่ง (pending op ใน `effSub`) ไม่มี late จนกว่า server ตอบ/poll รอบถัดไป (≤ 60 วินาที) — ไม่คำนวณฝั่ง client เพื่อไม่สร้างกฎซ้ำ
  - race นอกขอบเขต: `submissions.ts` อ่าน due_date แล้วค่อยเขียน late ของการส่งครั้งแรก — ถ้าครูแก้กำหนดส่งระหว่างนั้น แถวใหม่จะได้ late ตามกำหนดส่งเดิม (guard ของ submissions ตรวจ full_score แต่ไม่ตรวจ due_date) · ทิศกลับ (UPDATE ของงานนี้แทรกระหว่าง read/write ของ submissions) ปลอดภัย เพราะ `CELL_FIELDS` รวม `late` ทำให้การเขียนนั้นถูกปฏิเสธ `modified_since`
- ถึง QA: ขอบ 23:59:59.999 / 00:00 ไทย, due_date null, status void/excused ที่มี late=1 ค้าง, งานอื่นของนักเรียนเดียวกันต้องไม่ถูกแตะ, การ rollback เมื่อ score_over_full แทรกกลาง (gateBatch) และ epoch_changed, dashboard/report/gradebook ก่อน-หลังเลื่อน

## T-01 (ต่อ) สีและคำอธิบาย "ส่งช้า" ในผังเลขที่ — 2026-10-30 (PM อนุมัตินอกขอบเขต)

- `src/styles/scan.css`: เพิ่ม `.sc-cell.late` (token warning เหมือน `.wcell.late`) · ตรวจแล้วไม่ถูกทับ: `button:hover` (0,1,1) อ่อนกว่า `.sc-cell.late` (0,2,0) · `.hit` ใช้ outline · `.pend`/`.fail` ใช้จุด `::after` จึงยังเห็นซ้อนบนช่องสีเหลืองได้
- `Scan.tsx` legend: เพิ่มแถว "ส่งช้า N" (สี bg/border warning) · N นับด้วย `workState(...) === "late"` แบบเดียวกับที่ผังตัดสิน
- เทสต์: AC-08 ใน `scan-controller.test.ts` ตรวจ legend "ส่งช้า 1" เพิ่ม
- รันใหม่: typecheck PASS · `npm test` 64 ไฟล์ / 738 passed · ชุดเฉพาะ 41/41 → บันทึกทับ Q-91, Q-94

## T-01 Verify รอบ 1 — R-01..R-06 + AC-10 — 2026-10-30

- R-01 / AC-10: SQL กลางของ BR-04 อยู่ที่ `worker/lib/late.ts` (`lateSql(due)`) และมี statement 2 แบบ
  - `lateFixForAssignment(aid)`: ทุกแถวของงาน · อ่าน due_date ของงานแบบ subquery ที่ไม่ผูกกับแถว (SQLite คำนวณครั้งเดียวต่อ statement)
  - `lateFixForCells(cells)`: เฉพาะคู่ (งาน, นักเรียน) ที่เพิ่งเขียน · ค้นด้วย PK โดยให้รายการเป็นวงนอก (แบบเดียวกับ loadWorld) · `RETURNING` คืนแถวที่ถูกแก้
  - ทั้งสองแบบอ่าน due_date จากฐาน **ภายในธุรกรรม** และเขียนเฉพาะแถวที่ค่าเปลี่ยน · ไม่แตะ updated_at/event_at
  - ต่อท้าย batch (หลัง upsert+audit) ใน 4 จุด: แก้งาน, `/api/submissions/batch`, `/bulk`, `/bulk-undo` → cellsGuard/stillValid/การตรวจ landed ผ่าน audit ไม่เปลี่ยนความหมาย
  - ลำดับใดก็ได้ถูกต้อง: D1 ทำ batch ทีละธุรกรรม ถ้าการแก้งาน commit ก่อน → UPDATE ต่อท้ายของการเขียนเห็นกำหนดส่งใหม่ · ถ้า commit ทีหลัง → UPDATE ของการแก้งานแก้แถวที่เพิ่งเขียน
- ค่าใน response / audit:
  - `/api/submissions/batch`: `submission.late` ใน result `ok` ใช้ค่าจาก `RETURNING` ถ้าถูกแก้ จึงตรงกับฐาน (มี test)
  - `/bulk`, `/bulk-undo` ไม่ส่งแถวกลับ (ตอบแค่ changed/batchId) · แต่ `after` ใน audit รายแถวยังเป็นค่า late ที่คำนวณก่อน UPDATE ต่อท้าย (เช่น undo คืน late เดิมใน audit แต่ฐานถูกแก้แล้ว) — ไม่แก้เพราะต้องเปลี่ยนตรรกะ bulk/undo นอกจุดต่อท้าย · ผลข้างเคียง: ถ้าย้อนกลับ (undo) แถวที่ late ถูกแก้แล้วอีกที การเทียบ after_json จะได้ `modified_since` (ปฏิเสธเกินจำเป็น ไม่ทำข้อมูลผิด) — กรณีนี้เกิดเฉพาะ undo ของ undo ซึ่งไม่มีใน UI
  - `/batch` ที่แก้ late ของแถวที่ op ไม่ได้เขียน (stillValid ไม่ผ่าน) ก็ถูกต้องตาม BR-04 เสมอ ไม่มี audit รายแถว (เหมือนการแก้งาน)
- R-02: `assigned_date`/`due_date` ต้องเป็น `YYYY-MM-DD` (regex เดียวกับ left_at) · `""` แปลงเป็น null (หน้าจอเดิม `AssignmentModal` ส่ง null แล้ว, Gradebook `saveAsgPatch` ส่งค่าที่เก็บไว้กลับ — กันข้อมูลเก่าที่อาจเป็น `""`) · รูปแบบผิดได้ 422 (ตามตัวจัดการ zod ของแอป) · `DateField` ส่ง `YYYY-MM-DD` · test เดิมทั้งหมดใช้รูปแบบนี้
- R-03: `CAST(submitted_at AS INTEGER)` + `NULLIF(due,'')` ใน SQL กลาง (มี test ms เศษส่วน + mutation M9)
- R-04: `effSub` ของ op ที่รอส่งพก `late` จากสำเนา server ถ้าแถวนั้น submitted อยู่แล้ว (server เก็บ late เดิมเมื่อให้คะแนนซ้ำ) · `submitTypedScore` พก `prev.late`
- R-05: legend "ส่งแล้ว" = ส่งทัน (`submittedCount - lateCount`) + "ส่งช้า" + "ยังไม่ส่ง" = ทั้งห้อง · วงแหวนยังแสดงที่ส่งทั้งหมด
- R-06 (volume, 5 ห้อง × 40 = 200 แถว ของงาน a1):

| กรณี | statements | rows read | rows written | งบเดิมของ "แก้งาน" |
|---|---|---|---|---|
| แก้กำหนดส่งจนพลิกทุกแถว | 17 | 652 | 230 | read 500 · written 200 → **เกินทั้งสอง** |
| บันทึกซ้ำ (ไม่มีแถวพลิก) | 17 | 251 | 30 | ภายในงบ |

  ไม่ได้เปลี่ยนงบ ใส่เป็นการวัด + console.log ใน test · ครั้งแรกที่ใช้ subquery ผูกแถว อ่าน 1,448 จึงเปลี่ยนเป็น subquery ไม่ผูกแถวสำหรับทั้งงาน (ลดเหลือ 652) · bulk / bulk-undo / batch ยังอยู่ในงบเดิมของ volume test
- คำสั่ง → ผล: ก่อนแก้ AC-10 → 5 failed / 15 passed (`evidence/before-fix-ac10.txt`) · `npm run typecheck` PASS · `npm test` 65 ไฟล์ / 758 passed · late-flag + scan-controller 49/49 · volume 7/7
- Mutation (`evidence/mutation.txt`, คืนไฟล์และ cmp ตรงทุกไฟล์): M1 แก้งานไม่มี UPDATE → 9 ล้ม · M2 UTC → 3 · M3 ผัง late:false → 1 · M4 bulk-undo ไม่ต่อท้าย → 2 · M5 batch ไม่ต่อท้าย → 2 · M6 bulk ไม่ต่อท้าย → 1 · M7 effSub ไม่พก late → 1 · M8 legend ซ้อน → 1 · M9 ไม่ CAST → 1
- ไม่แตะ `test/api/qa-m1-04.test.ts`

## T-01 Verify รอบ 2 — B-01/R-09, R-08 — 2026-10-30

- B-01/R-09: `assignmentSchema` ใช้ `ceDate` ที่ประกาศใน `assignments.ts` คือ regex ปี `19xx|20xx` + ตรวจวันมีจริงด้วยวิธีเดียวกับ `date` ใน restore-validation · ไม่แก้ restore-validation (restore ไม่มีช่วงปี ถ้าใช้ร่วมจะเปลี่ยนพฤติกรรม restore) · `""` → null คงเดิม
  - test: QA "R-02 (B-01)" + ของ dev "B-01/R-09" ตรวจ 2569-10-20, 2026-02-30, 2026-13-01, 1899-12-31, 2100-01-01 → 422 ทั้ง due/assigned · 2028-02-29, 1900-01-01, 2099-12-31 → 200
  - แก้ test ของตัวเอง 1 จุด: "2999-12-31" → "2099-12-31" (ตอนนี้เกินช่วงที่รับ)
- R-08: `onResult` ของ Scan เมื่อได้ `ok` พร้อม `submission` และงานตรงกับสำเนาบนจอ → ใส่ status/score/late ของ server ลงช่องทันที (op ที่ยังรอส่งยังอยู่บนสุดผ่าน effSub) · unit test ดัก listener ผ่าน mock ของ outbox
- ก่อนแก้ → 3 failed (`evidence/before-fix-b01.txt`) · หลังแก้ → 69/69 · mutation M10 (regex เดิม) → B-01 ล้ม 2 ข้อ
- **ติด: test เดิม 3 ไฟล์ล้ม 14 ข้อ** (`backup-consistency.test.ts:34`, `integrity-d.test.ts:22`, `race-r1.test.ts:17`) เพราะ fixture ส่ง `assigned_date: "2569-09-01", due_date: "2569-12-31"` ผ่าน API ซึ่งตอนนี้ถูกปฏิเสธ 422 ตามกติกา B-01 — อยู่นอกขอบเขตการเขียน จึงไม่ได้แก้
- (PM อนุมัติ) แก้ fixture เป็น ค.ศ. เฉพาะบรรทัด `backup-consistency.test.ts:34`, `integrity-d.test.ts:22`, `race-r1.test.ts:17`
- กติกาเพิ่ม: schema รับ string (`""` → null) แล้วตรวจ ค.ศ. ใน route หลังอ่าน `existing` (`newDates.parse`, ZodError → 422 แบบเดิม) · ค่าที่ตรงกับค่าเดิมของงานนั้นทุกตัวอักษรได้รับยกเว้น · งานใหม่ไม่มีค่าเดิม จึงตรวจทุกค่า · test "B-01 a date the work already holds…": ปิดรับด้วย 2569-10-20 เดิม = 200 · 2569-10-21 = 422 · assigned_date เปลี่ยน = 422 · งานใหม่ 2569 = 422
- typecheck PASS · `npm test` 65 ไฟล์ / 767 passed → Q-91, Q-94 ทับ

## T-01 Verify รอบ 3 — R-11, R-12 — 2026-10-30

- R-11: คืน fixture 3 บรรทัดเป็น "2569-09-01"/"2569-12-31" · `git diff main -- <3 ไฟล์>` ว่าง · ผ่านด้วยกติกา "ค่าเท่าค่าเดิม"
- R-12: unit test 2 ข้อ — ACK ของงานอื่นไม่เปลี่ยนช่อง · op ใหม่ที่รอส่งยังแสดงอยู่เมื่อ ACK ของ op ก่อนหน้ามาถึง
- typecheck PASS · `npm test` 65 ไฟล์ / 772 passed → Q-91, Q-94 ทับ

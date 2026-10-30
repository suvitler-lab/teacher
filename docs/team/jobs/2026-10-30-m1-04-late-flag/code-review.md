# Code review: สถานะ "ส่งช้า" ตามกำหนดส่งปัจจุบัน และแสดงในหน้าสแกน (M1-04)

โดย Code Reviewer · 2026-10-30 · ช่วง diff: `main(2aba109)..working tree` (ยังไม่ commit: `worker/routes/assignments.ts`, `worker/lib/time.ts`, `src/pages/Scan.tsx`, `src/styles/scan.css`, `test/unit/scan-controller.test.ts`, ใหม่ `test/api/late-flag.test.ts`) · รอบแก้ (Verify) 2/3 (รอบ 2, รอบ 3 ต่อท้ายด้านล่าง)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่านแบบมีเงื่อนไข

ต้องแก้ 1 ข้อ · แนะนำ 5 ข้อ (ควรแก้ 1 · เสนอ 4)

ส่วนหลักของงานถูกต้อง: SQL วันที่เวลาไทยตรงกับ `isLateSubmission` ในทุกค่าที่ระบบสร้างได้จริง, UPDATE อยู่ใน batch เดียวกับการแก้งาน (rollback พร้อม guard), ใช้ index, เขียนเฉพาะแถวที่ค่าเปลี่ยน, test ครอบ AC และมี mutation จริง
R-01 เป็นช่องโหว่ข้อมูลที่ขัดกับเป้าหมายของงาน ("late = BR-04 เสมอ") ขอบเขตแคบ แก้เฉพาะจุด ไม่ต้องตรวจใหม่ทั้งหมด

## ต้องแก้ก่อนปล่อย

### R-01 ย้อนกลับ "ล้างทั้งห้อง" หลังเลื่อนกำหนดส่ง คืนค่า late ตามกำหนดส่งเดิม — data · `worker/routes/submissions.ts:606` (bulk-undo)

- ปัญหา: bulk-undo คืน `late: before.late ? 1 : 0` จาก before_json ที่บันทึกไว้ตอนล้าง ซึ่งคำนวณจากกำหนดส่ง**เดิม** ส่วน UPDATE ของงานนี้ไม่แตะแถว void (LATE_SQL ของ void = 0 = ค่าเดิม) จึงไม่มีอะไรเปลี่ยนในแถวที่ถูกล้าง → after_json ยังตรงกับแถวปัจจุบัน (`submissions.ts:592-597`) → การย้อนกลับ**ไม่**ถูกปฏิเสธ (ไม่เกิด `modified_since`) และเขียน late เก่ากลับ
- สถานการณ์ที่พัง: งานกำหนดส่ง 2026-10-20 · เด็ก A ส่ง 10-22 (late=1) · ครูกด "ล้าง" ทั้งห้องใน Gradebook (toast "ย้อนกลับ" เป็น `sticky: true` อยู่ค้าง — `src/pages/Gradebook.tsx:224`) · ครูแก้กำหนดส่งเป็น 10-25 · ครูกด "ย้อนกลับ" → A กลับเป็น submitted, submitted_at 10-22, **late=1** ทั้งที่กำหนดส่ง 10-25 → Gradebook/รายงาน/แดชบอร์ด/หน้าสแกนนับ A เป็น "ส่งช้า" ผิด จนกว่าจะมีการบันทึกงานครั้งถัดไป (ทิศกลับก็เกิดได้: เลื่อนกำหนดส่งเข้ามา → แถวที่ควรช้าได้ late=0)
- ข้อสังเกตประกอบ: undo ของ "ส่งครบ/คะแนนเต็ม" (มีเฉพาะทาง API — UI เปิดปุ่มย้อนกลับเฉพาะ "ล้าง") หลังเลื่อนกำหนดส่ง แถว submitted ที่ late พลิกจะไม่ตรง after_json → ได้ `modified_since` = ปฏิเสธเกินจำเป็นแต่ไม่ทำข้อมูลผิด (ถ้าปล่อยผ่านก็จะคืน late เก่าเหมือนกัน)
- แนวทางแก้: ใน bulk-undo ตัดสิน late ของแถวที่คืนจากกำหนดส่ง**ปัจจุบัน** ภายในธุรกรรมเดียวกัน — เช่น ย้าย `LATE_SQL` เป็นฟังก์ชันกลาง (เช่น `worker/lib/late.ts` รับ expression ของ due date) แล้วต่อท้าย batch ของ undo ด้วย `UPDATE submissions SET late = <BR-04 โดยใช้ (SELECT due_date FROM assignments WHERE id = ?1)> WHERE assignment_id = ?1 AND student_id IN (SELECT value FROM json_each(?2)) AND late IS NOT <...>` · หรือทำใน JS ด้วย `isLateSubmission(a.due_date, before.submitted_at)` (เฉพาะ status submitted) โดยใช้ assignment ที่ `undoProblem()` อ่านอยู่แล้ว + เพิ่ม `abortIf` ว่า due_date ยังเท่าเดิมใน batch (audit `after` ของ restore จะได้บันทึกค่าที่ตัดสินจริง) · เพิ่ม test: ล้าง → เลื่อนกำหนดส่ง → ย้อนกลับ → late ตรงกำหนดส่งใหม่ · กลไกเดียวกันนี้ใช้ปิด known issue M1-06 ได้ด้วย
- สถานะ: เปิด

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

- R-02 due_date สตริงว่างให้ผลต่างจาก isLateSubmission · `worker/routes/assignments.ts:33` + `:21-22` — schema รับ `z.string()` ไม่ตรวจรูปแบบ · ถ้า due_date = `""` SQL ถือว่ามีกำหนดส่ง (`'' IS NOT NULL` และทุกวันที่ > `''`) → ทุกแถว submitted ได้ late=1 แต่ `isLateSubmission("")` = false และ `workState` ถือ `""` = ไม่มีกำหนดส่ง (probe ยืนยัน: SQL 1 / JS 0) · หน้าจอแปลง `""` → null แล้ว (`AssignmentModal.tsx:94`) และ restore ตรวจรูปแบบวันที่ จึงเกิดได้ทาง API ตรงเท่านั้น · แก้: `due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()` (หรือ `NULLIF(?2,'')` ใน SQL)

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-03 ms เศษส่วนในครึ่ง ms สุดท้ายก่อนเที่ยงคืนไทย · `worker/routes/assignments.ts:22` — SQLite `unixepoch` ปัดเป็น ms ที่ใกล้สุด ส่วน JS `Date` ตัดทิ้ง → `submitted_at` = 23:59:59.999 + 0.5 ms ไทย: SQL ได้วันถัดไป (late=1) JS ได้วันเดิม (probe: 3 กรณีจาก 601,116) · เกิดได้เฉพาะ `clientTs` เศษส่วนจาก API ตรง (`opSchema.clientTs` = `z.number()`; client ส่ง `Date.now()` จำนวนเต็ม) · แก้: `CAST(submitted_at AS INTEGER) / 1000` หรือ `clientTs: z.number().int()` · ค่าเกินช่วง Date (>= 8.64e15) ก็ต่างกัน แต่เกิดไม่ได้จริง (clamp 7 วัน)
- R-04 แก้คะแนนของเด็กที่ส่งช้าในหน้าสแกน → ช่องเป็นสีเขียวชั่วคราว · `src/pages/Scan.tsx:375` (`submitTypedScore` → `updateSub` ไม่พก `late`) และ `effSub` (:236) — server เก็บ late เดิม (`submissions.ts:350`) แต่หน้าจอแสดง "ไม่ช้า" จน poll ถัดไป (<= 60 วินาที) · ใกล้เคียงข้อยอมรับใน brief · แก้ง่ายด้วยการพก `prev?.late` เมื่อเด็กเคย submitted อยู่แล้ว
- R-05 legend "ส่งช้า" เป็นส่วนหนึ่งของ "ส่งแล้ว" · `src/pages/Scan.tsx:781-783` — สามบรรทัดรวมกันเกินจำนวนเด็ก (เช่น 30 + 5 + 10 = 45 จาก 40) · ตรงนิยาม metrics (late ⊂ submitted) จึงตัวเลขไม่ผิด แต่อาจอ่านผิด → พิจารณาข้อความ "ในนั้นส่งช้า N"
- R-06 volume test ไม่วัดกรณีแย่สุด · `test/api/volume.test.ts:149` — การแก้งานในเทสต์ไม่ส่ง due_date และ seed ไม่มีแถวช้า → UPDATE ไม่เขียนเลย · กรณีทุกแถวพลิก (5 ห้อง × 40 = 200 แถว) จะเขียน ~200 + ~10 แถว เกินงบ `written: 200` ของเทสต์นั้นเล็กน้อย (ไม่กระทบโควตา D1 รายวัน) · เสนอเพิ่ม case พลิกทั้งหมดและตั้งงบตามจริง

## คำตอบประเด็นที่ PM ถาม

1. **SQL วันที่ไทย = bkkToday?** ใช่ สำหรับทุกค่าที่ระบบสร้างได้ (submitted_at เป็นจำนวนเต็ม ms, clamp 7 วัน, restore บังคับ `integer.min(0)`) — probe ด้วย node:sqlite เทียบ `isLateSubmission` 601,116 คู่ (ขอบเที่ยงคืนไทย ±1 ms/±1 s/±1 h ใน 12 วันรวม 29 ก.พ., สิ้นปี, 2038, 2100 + สุ่ม 100,000 ค่าทั้งเต็มและเศษ × กำหนดส่ง 6 ค่า): ไม่ตรงเฉพาะ ms เศษส่วนก่อนเที่ยงคืน (R-03) และค่าเกินช่วง Date · `due_date = ""` ต่างกัน (R-02) · ค่าก่อน 1970 ต่างจาก integer division (เกิดไม่ได้)
2. **ธุรกรรม + ผลกระทบ:** UPDATE อยู่ใน `batchAtEpoch` หลัง `abortIf` ทั้งสอง → score_over_full / class_year / epoch_changed ยกเลิกพร้อม (AC-06 มี test 3 ข้อ) · ไม่แตะ `updated_at`/`event_at` (AC-01 ตรวจ)
   - bulk-undo: undo ของ "ล้าง" **ไม่**ได้ `modified_since` (แถว void ไม่ถูกแตะ) และคืน late ตามกำหนดส่งเดิม = **ผิด** → R-01 · undo ของ "ส่งครบ/คะแนนเต็ม" (API) ได้ `modified_since` = ปฏิเสธเกินจำเป็นแต่ไม่ทำข้อมูลผิด
   - การเขียนคะแนนที่ค้าง: `CELL_FIELDS` มี `late` → ถ้า UPDATE พลิกแถวระหว่างที่ batch ของคะแนนอ่าน-เขียน `cellsGuard` จะ abort → `/api/submissions/batch` ลองใหม่ <= 2 ครั้งด้วยค่าใหม่ แล้วจึงตอบ 503 `write_busy` (outbox เก็บคิวไว้) · `/bulk` ตอบ 409 `modified_since` ให้ครูกดใหม่ — ถูกต้อง ไม่มีการเขียนทับ · ทิศกลับ (แถวที่ไม่พลิก/แถวใหม่) = known issue M1-06
   - backup fingerprint: การแก้งานเปลี่ยน `assignments.updated_at` และเพิ่ม `audit_logs` ในธุรกรรมเดียวกับ UPDATE late → fingerprint เปลี่ยนเสมอ → backup ที่อ่านคร่อมการแก้จะอ่านใหม่ · restore คืน due_date และ late ที่สอดคล้องกันจากไฟล์เดียวกัน
3. **ไม่แตะ updated_at แต่ late เปลี่ยน:** ไม่พบ client ที่ใช้ `submissions.updated_at` ตรวจการเปลี่ยนแปลง — หน้าสแกนอ่าน snapshot เต็มทุก poll (`Scan.tsx:192`; server ไม่สนใจ `since` `submissions.ts:37`), Gradebook `load(true)` หลังบันทึกงาน (`Gradebook.tsx:483`), dashboard/reports ดึงใหม่ทุกครั้ง (cache IndexedDB ของ dashboard ใช้เฉพาะตอน offline), service worker ไม่แคช `/api/*` (`public/sw.js:85`) · ผลข้างเคียงเดียว: audit รายแถวไม่มีบรรทัดการพลิก late (มี due_date ก่อน/หลังใน audit ของงาน — รับได้)
4. **Scan.tsx:** `reconcileSubs` รับ late จาก server (boolean จาก `mapSubmission`) และคงค่าท้องถิ่นที่เปลี่ยนระหว่าง request · `effSub` ให้ op ที่รอส่งอยู่บนสุดโดยไม่มี late (brief ยอมรับ) · `lateCount` ใช้ `effSub` + `workState` แบบเดียวกับช่อง → ตรงกับสีช่องเสมอ · CSS: สถานะจาก `workState` มีค่าเดียวต่อช่อง, `.hit` ใช้ outline, `.pend/.fail` ใช้จุด `::after` — ไม่ทับกัน · ข้อสังเกต R-04, R-05
5. **performance:** EXPLAIN QUERY PLAN = `SEARCH submissions USING INDEX idx_submissions_updated (assignment_id=?)` · `late IS NOT <BR-04>` เขียนเฉพาะแถวที่พลิก (probe: 200 แถว → 180 พลิก, รันซ้ำ 0) · อ่าน ≈ จำนวนแถวของงาน · volume.test 7/7 ผ่าน แต่ไม่วัดกรณีพลิกทั้งหมด (R-06)
6. **test:** `late-flag.test.ts` 15 ข้อครอบ AC-01..07, 09 รวมการเทียบกับ `isLateSubmission` ที่ขอบนาที, งานอื่นไม่ถูกแตะ, rollback 3 ทาง (gateBatch) · AC-08 ใน `scan-controller.test.ts` ตรวจ class `late`/`scored` และ legend · mutation M1 (ถอด UPDATE → 9 ล้ม), M2 (UTC → 3 ล้ม), M3 (`late:false` → 1 ล้ม) สมเหตุสมผล · ช่องว่าง: ไม่มี test bulk-undo หลังเลื่อนกำหนดส่ง (R-01), due_date `""` (R-02) · `hmToMinutes` ไม่มีที่ใช้

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร
- [ ] ตรวจ input ฝั่ง server ทุกจุด — `due_date` ไม่ตรวจรูปแบบ (R-02 — มีอยู่เดิม แต่ตอนนี้มีผลต่อ late)
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล — `/api/assignments` อยู่หลัง `requireAuth` (`assignments.ts:12`) ไม่มี endpoint ใหม่
- [x] ป้องกัน injection (SQL/NoSQL/command), XSS, CSRF — `LATE_SQL` เป็นค่าคงที่ ค่าจากผู้ใช้ผ่าน bind ทั้งหมด · legend แสดงตัวเลข
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น — audit เพิ่มเพียง due_date
- [x] error ไม่เปิดเผยรายละเอียดภายใน — ไม่มี error path ใหม่
- [x] dependency ใหม่น่าเชื่อถือ — ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] เงิน: ไม่เกี่ยว (ธง 💰 ในงานนี้ = ความถูกต้องของตัวเลข "ส่งช้า" ในรายงาน)
- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำ — UPDATE idempotent (รันซ้ำ 0 แถว)
- [x] การเขียนหลายตารางอยู่ใน transaction — assignments + assignment_classes + submissions.late + audit ใน `batchAtEpoch` เดียว
- [ ] ข้อมูลที่ผูกกันไม่ค้าง — late ใน before_json ที่ bulk-undo นำกลับมาค้างตามกำหนดส่งเดิม (R-01)
- [x] วันที่/timezone/พ.ศ. ถูกต้อง — UTC+7 คงที่ เทียบสตริง ค.ศ. YYYY-MM-DD ตรงกับ `isLateSubmission` (ข้อยกเว้นที่เกิดไม่ได้จริง: R-03)

Checklist data-integrity: คาดผลจาก BR-04 ก่อน (probe เทียบนิยาม JS) PASS · atomicity PASS · ทำพร้อมกัน แก้งาน × เขียนคะแนน PASS (cellsGuard), แก้งาน × bulk-undo FAIL (R-01) · reconciliation เป็นเทสต์ที่รันซ้ำได้ PASS (late-flag + qa-m1-04)

## หลักฐาน

- `npx vitest run test/api/late-flag.test.ts test/unit/scan-controller.test.ts test/api/qa-m1-04.test.ts` → 3 ไฟล์ / 53 passed
- `npm run typecheck` → PASS (ไม่มี error)
- grep `hmToMinutes` ใน `src worker shared test scripts` → 0
- probe node:sqlite (`probe2.mts` ใน scratchpad) → เทียบ 601,116 คู่ ไม่ตรง 15 (3 = ms เศษส่วนก่อนเที่ยงคืน, 12 = ค่าเกินช่วง Date) · `due_date=''` → SQL 1 / JS 0
- probe EXPLAIN QUERY PLAN (`plan.mts`) → ใช้ `idx_submissions_updated` · พลิก 180/200 → ซ้ำ 0 · null → 0 · งานอื่นไม่ถูกแตะ
- R-01 ยืนยันจากการอ่านโค้ด: `submissions.ts:592-597` (เทียบ after_json), `:604-607` (คืน before.late), `assignments.ts:117-120` (ไม่แตะแถว void), `Gradebook.tsx:222-227` (ปุ่มย้อนกลับเฉพาะ "ล้าง", toast sticky) — ยังไม่ได้รันเป็น test เพราะห้ามเพิ่มไฟล์ test

---

## รอบ 2 (Verify 1/3) — 2026-10-30

ช่วง diff: `main(2aba109)..working tree` เน้นส่วนที่เปลี่ยนหลังรอบ 1: ใหม่ `worker/lib/late.ts` · `worker/routes/submissions.ts` (`/batch`, `/bulk`, `/bulk-undo`) · `worker/routes/assignments.ts` (schema `ymd`, `lateFixForAssignment`) · `src/pages/Scan.tsx` (R-04, R-05) · `test/api/late-flag.test.ts` (AC-10) · `test/api/volume.test.ts` (AC-11) · `worker/lib/time.ts` (ลบ `hmToMinutes` ที่ไม่มีที่ใช้)

### สรุปรอบ 2: ผ่าน

ต้องแก้ 0 ข้อ · แนะนำ 4 ข้อ (ควรแก้ 0 · เสนอ 4) · R-01..R-06 ปิดทั้งหมด

### สถานะข้อเดิม

| ข้อ | สถานะ | หลักฐานจากการอ่านโค้ด/เทสต์ |
|---|---|---|
| R-01 (ต้องแก้) | **ปิด** | ดูข้อยืนยัน 1 ด้านล่าง · test AC-10 5 ข้อ (`late-flag.test.ts:249-310`) ผ่าน ครอบ undo ทั้งสองทิศและ race ทั้งสองทิศ + bulk |
| R-02 | ปิด | `assignments.ts:19,29-30` regex `^\d{4}-\d{2}-\d{2}$` + `""` → null · SQL มี `NULLIF(due,'')` กันข้อมูลเก่าอีกชั้น (`late.ts:18,20`) |
| R-03 | ปิด | `late.ts:15` `CAST(submissions.submitted_at AS INTEGER)` · test `late-flag.test.ts:125` |
| R-04 | ปิด | `Scan.tsx:236-238` (`effSub` พก `server.late` เมื่อแถวเป็น submitted อยู่แล้ว) · `:379` (`submitTypedScore` พก `prev.late`) |
| R-05 | ปิด | `Scan.tsx:624-629,784-786` ส่งแล้ว = `submittedCount - lateCount` + ส่งช้า + ยังไม่ส่ง (`missing` = ไม่ใช่ submitted) = ทั้งห้อง · วงแหวนยังใช้ `submittedCount` (ข้อสังเกต R-07) |
| R-06 | ปิด | `volume.test.ts:153-172` วัดกรณีพลิกทุกแถว (≤ 1,000 / ≤ 300 ตาม AC-11) + บันทึกซ้ำไม่พลิก (≤ 500 / ≤ 200) |

### ยืนยันตามที่ PM ถาม

1. **UPDATE ต่อท้ายอยู่ในธุรกรรมเดียวกัน หลัง upsert+audit และไม่เปลี่ยนความหมายของ guard — PASS**
   - `/batch` `submissions.ts:398`: `DB.batch([cellsGuard(epoch), guardedAuditStmt, submissionUpsertStmt, lateFixForCells])` — ตัวต่อท้ายเป็นตัวสุดท้าย · cellsGuard ยังประเมินก่อนการเขียนใด ๆ (snapshot เทียบกับสภาพก่อน batch) · `stillValid` ของ audit/upsert ไม่อ่าน `late` จึงไม่ได้รับผล · การตัดสิน `landed` ยังมาจาก `existingOpIds` (audit) — ตัวต่อท้ายไม่เขียน audit
   - `/bulk` `:542-543`: `batchAtEpoch` = `[epochGuard, cellsGuard, audit, upsert, lateFix]` · `changed` นับจาก `audit_logs WHERE batch_id AND action='bulk'` (`:550`) — ตัวต่อท้ายไม่เพิ่ม audit จึงนับเท่าเดิม
   - `/bulk-undo` `:645-657`: abortIf(undone) → cellsGuard → abortIf(score/deleted) → upsert → audit → lateFix · guard ทั้งหมดอยู่ก่อน · `changed: upserts.length` ไม่เปลี่ยน
   - แก้งาน `assignments.ts:109-113,127-132`: `lateFixForAssignment` อยู่หลัง upsert งานและ class links ใน `batchAtEpoch` เดียวกับ abortIf ทั้งสอง → rollback พร้อมกัน (test AC-06 3 ข้อ)
   - ลำดับสลับ: D1 batch = ธุรกรรมเดียว ทำทีละรายการ → ฝั่งที่ commit ทีหลังเห็น due_date/แถวของอีกฝั่งแล้วแก้ late ให้ตรง · การแก้งานที่พลิก late ของแถวที่ `/batch` อ่านไว้ทำให้ cellsGuard abort → ตัดสินใหม่ (≤ 2 ครั้ง แล้ว 503 `write_busy`, outbox เก็บไว้) — ไม่มีการเขียนทับ
2. **RETURNING ใน `/batch` — PASS**
   - `late.ts:39-50` คืน `assignment_id, student_id, late` เฉพาะแถวที่ถูกแก้ · `submissions.ts:399-400` อ่าน `res[3].results` (index 3 = statement ที่ 4 ตรงกับ array — `/batch` เรียก `DB.batch` ตรง ไม่ผ่าน `batchAtEpoch` จึงไม่มี offset) · `:422-423` ใช้เฉพาะ op ที่ landed · แถวที่ไม่ถูกแก้ = ค่าที่ upsert เขียน = `p.row.late` ถูกแล้ว
   - D1 รองรับ `UPDATE ... RETURNING` (SQLite ≥ 3.35) และคืนแถวใน `results` ของแต่ละ statement ใน batch · test race ทั้งสองทิศตรวจ `out.results[0].submission.late` (`late-flag.test.ts:284,298`) ผ่านบน workerd/miniflare (SQLite ชุดเดียวกับ D1)
   - คีย์ map คั่นด้วยช่องว่าง (`${aid} ${sid}`) — id สร้างโดยระบบ ไม่มีช่องว่าง จึงไม่ชนกัน
3. **SQL กลาง = `isLateSubmission` — PASS** (`late.ts:13-16` เทียบ `time.ts:30-33`)
   - JS `!dueDate` → false (ครอบ null และ `""`) ↔ SQL `NULLIF(due,'') IS NOT NULL`
   - JS `new Date(ms + 7h)` ตัดเศษ ms → วันที่ ↔ SQL `CAST(ms AS INTEGER) / 1000 + 7*3600` → `date(…,'unixepoch')` — วันเดียวกันทุกค่า ms ≥ 0 (floor(floor(ms)/1000) วินาที + 25,200 ≡ วันของ floor(ms) + 25,200,000 ms) · เทียบสตริง `YYYY-MM-DD` แบบเดียวกัน
   - เงื่อนไขเพิ่มใน SQL (`status='submitted' AND submitted_at IS NOT NULL`) ตรงกับฝั่ง JS ที่ตัดสินเฉพาะตอนเป็น submitted ครั้งแรก · แถว submitted ที่ไม่มี submitted_at (ข้อมูลเก่า) ได้ 0 ตาม BR-04
   - `DUE_OF_WORK` ไม่ผูกแถว (คำนวณครั้งเดียว) · `DUE_OF_ROW` ผูกแถวแต่ใช้กับคู่ที่เพิ่งเขียนเท่านั้น (PK lookup) · test เทียบขอบนาที (`late-flag.test.ts:101`) ผ่าน
4. **regex และ `""` → null ไม่ทำให้ client เดิม/ข้อมูลเก่าพัง — PASS**
   - client: `AssignmentModal.tsx:94` ส่ง `dueDate || null` จาก date input (ค.ศ. `YYYY-MM-DD`) · `Gradebook.tsx:252` ส่งค่าที่เก็บไว้กลับ (`""` เก่า → null ผ่าน preprocess) · key ที่ไม่ส่ง → undefined → optional ผ่าน
   - ข้อมูลเก่า: restore บังคับรูปแบบเดียวกัน + ตรวจวันที่จริง (`restore-validation.ts:15-19`) · ค่ารูปแบบอื่นมาได้เฉพาะ API ตรงก่อนงานนี้ — ถ้ามี การบันทึกงานนั้นได้ 422 (ปฏิเสธ ไม่ทำข้อมูลผิด) · ไม่พบเส้นทางเขียน due_date อื่นใน `worker/`
   - ข้อสังเกต: regex รับวันที่ที่ไม่มีจริง/ปี พ.ศ. (R-09)
5. **Scan legend และ late เดิม — PASS** (ข้อสังเกต R-07, R-08)
   - `effSub` op ที่รอส่งบนแถวที่ server เป็น submitted → พก `server.late` (server เก็บ late เดิมเมื่อให้คะแนนซ้ำ `submissions.ts:351`) · แถวใหม่ → `undefined` (ยังไม่รู้) · `submitTypedScore` พก `prev.late` เฉพาะเมื่อ prev เป็น submitted
   - `lateCount` ใช้ `effSub` + `workState` แบบเดียวกับสีช่อง (`:796`) → legend ตรงกับช่องเสมอ · ส่งแล้ว + ส่งช้า + ยังไม่ส่ง = `classStudents.length` (`missing` = ทุกคนที่ไม่ใช่ submitted รวม excused/void)
6. **งบ volume AC-11 — สมเหตุสมผล**
   - 200 แถวพลิก → written 230 ≈ submissions 200 แถว + upsert งาน + ลบ/เพิ่ม class link 5 ห้อง + audit + ส่วนของ index — สอดคล้องกับการเขียนเฉพาะแถวที่พลิก (`late IS NOT …`) · read 652 ≈ 3 รอบของ 200 แถวของงาน + งาน/ห้อง — ไม่อ่านข้ามงาน
   - 230 / 100,000 ต่อวัน (free tier) ≈ 0.23% และเกิดเฉพาะเมื่อเลื่อนกำหนดส่งจนทุกแถวพลิก · กรณีไม่พลิกยังอยู่ในงบเดิม 500/200 → งบ 1,000/300 มีที่ว่างพอ แต่ไม่หลวมจนจับ regression ไม่ได้ (ถ้ากลับไปใช้ subquery ผูกแถวทั้งงาน อ่าน ~1,448 จะล้ม)

### ต้องแก้

ไม่มี

### ควรแก้

ไม่มี

### เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-07 legend "ส่งช้า" ไม่นับคนที่ส่งช้าแต่ยังไม่มีคะแนน · `src/pages/Scan.tsx:626-629` + `shared/metrics.ts:31` — `workState` ให้ "late" เฉพาะเมื่อมีคะแนน (นิยามที่อนุมัติแล้ว: late = submitted + มีคะแนน + หลังกำหนดส่ง) → โหมด "รับงานก่อน" หลังเลยกำหนดส่ง: เด็ก 10 คนส่งช้าไม่มีคะแนน → legend "ส่งแล้ว 10 · ส่งช้า 0" ขณะที่ PM ตั้งความหมาย "ส่งแล้ว = ส่งทัน" · ตัวเลขตรงกับสีช่องและนิยาม metrics จึงไม่ใช่ข้อมูลผิด · ถ้าต้องการให้ตรงข้อความ: ปรับคำ legend หรือพิจารณาใน M1-05 (metrics) — ไม่ควรแก้นิยามในงานนี้
- R-08 hand-in ใหม่ที่ช้าแสดงเป็นไม่ช้าจนถึง poll ถัดไป (≤ 60 วินาที) · `src/pages/Scan.tsx:342` (`updateSub` ไม่มี late) + `:412` (ACK `ok` ไม่นำ `submission.late` มาใช้) — ตอนนี้ server ตอบค่า late ที่เก็บจริงแล้ว (RETURNING) จึงอัปเดตได้ทันที · โหมดให้คะแนนเต็ม: ช่องเป็นสีเขียวและ legend นับเป็น "ส่งแล้ว" ชั่วคราว · brief ยอมรับ "op ที่รอส่งไม่รู้ late" ไว้แล้ว
- R-09 `ymd` รับวันที่ที่ไม่มีจริงหรือปี พ.ศ. · `worker/routes/assignments.ts:19` — เช่น `2569-10-20` (พ.ศ.) ผ่าน regex → `"2026-…" > "2569-…"` เป็นเท็จเสมอ → ไม่มีใครช้า · `2026-02-30` ผ่านเช่นกัน · หน้าจอส่ง ค.ศ. จาก date input จึงเกิดได้ทาง API ตรงเท่านั้น · ตรงตามที่ PM สั่ง ("แบบเดียวกับ left_at") · เสนอใช้ schema `date` ตัวเดียวกับ `restore-validation.ts:15-18` (มี refine วันที่จริง) และจำกัดช่วงปี
- R-10 undo ของ "ส่งครบ/คะแนนเต็ม" (ทาง API) หลังเลื่อนกำหนดส่งได้ `modified_since` · `worker/routes/submissions.ts:600-604` — เทียบ `after_json.late` กับแถวปัจจุบันซึ่ง `lateFixForAssignment` อาจพลิกไปแล้ว (และ known issue M1-08: `after.late` เป็นค่าก่อน UPDATE ต่อท้าย) · UI เปิดย้อนกลับเฉพาะ "ล้าง" (`Gradebook.tsx:223-227`; แถว void late = 0 เสมอ ไม่พลิก) จึงไม่กระทบผู้ใช้ตอนนี้ · ถ้า M1-08 หรือภายหลังเปิด undo แบบอื่น: ข้ามคีย์ `late` ในการเทียบ (late คำนวณจาก due_date + submitted_at ซึ่งเทียบอยู่แล้ว และ `lateFixForCells` ตัดสินใหม่ใน batch อยู่แล้ว)

ข้อสังเกตอื่น (ไม่ใช่ข้อแก้): ลบ `hmToMinutes` จาก `worker/lib/time.ts` — grep ทั้ง repo (ยกเว้นสำเนา `.audit/`) ไม่มีที่ใช้ ไม่กระทบการตัดสินสายของการเช็คชื่อ แต่อยู่นอกขอบเขต brief เล็กน้อย

### เช็กลิสต์ความปลอดภัย (รอบ 2)

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร
- [x] ตรวจ input ฝั่ง server — `assigned_date`/`due_date` ตรวจรูปแบบแล้ว (R-02 ปิด · R-09 เสนอให้เข้มขึ้น)
- [x] ตรวจสิทธิ์ — ไม่มี endpoint ใหม่ เส้นทางที่แก้อยู่หลัง `requireAuth` (`submissions.ts:18-20`, `assignments.ts:13-16`)
- [x] injection — `lateSql(due)` รับเฉพาะค่าคงที่ในโมดูล (`DUE_OF_ROW`/`DUE_OF_WORK`) ไม่ใช่ค่าจากผู้ใช้ · คู่ (งาน, นักเรียน) ส่งผ่าน bind เป็น JSON
- [x] ข้อมูลส่วนบุคคลไม่ถูก log — ไม่มี log ใหม่ใน worker (console.log อยู่ใน test เท่านั้น)
- [x] error ไม่เปิดเผยรายละเอียดภายใน — 422 จาก zod ตามตัวจัดการเดิม
- [x] dependency ใหม่ — ไม่มี

### ความถูกต้องของข้อมูล (ธง 💰) รอบ 2

- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำ — UPDATE idempotent (`late IS NOT …`) · `changed` ของ bulk นับจาก audit ไม่ถูกกระทบ
- [x] transaction — การเขียนทุกเส้นทาง + UPDATE late อยู่ใน batch เดียว (4 จุด)
- [x] ข้อมูลที่ผูกกันไม่ค้าง — late ของแถวที่ undo คืนตัดสินจากกำหนดส่งปัจจุบันแล้ว (R-01 ปิด) · ค้างเฉพาะ `after.late` ใน audit (known issue M1-08 ที่ PM รับ)
- [x] race — แก้งาน × `/batch` × `/bulk` × `/bulk-undo` ลำดับใดก็ได้ late = BR-04 (test race 3 ข้อ)
- [x] วันที่/timezone — UTC+7 คงที่ ตัดเศษเหมือน JS (R-03 ปิด) · พ.ศ. ผ่าน API ตรงได้ (R-09 เสนอ)

Checklist data-integrity: คาดผลจาก BR-04 PASS · atomicity PASS · concurrency (แก้งาน × ทุกเส้นทางเขียน) PASS · reconciliation (test รันซ้ำได้) PASS

### หลักฐาน (รอบ 2)

- `npx vitest run test/api/late-flag.test.ts` → 1 ไฟล์ / 22 passed (2.8 วินาที)
- `npx vitest run test/api/volume.test.ts test/unit/scan-controller.test.ts` → 2 ไฟล์ / 34 passed (รวม AC-11 ≤ 1,000 / ≤ 300 และกรณีไม่พลิก ≤ 500 / ≤ 200)
- `npm run typecheck` → PASS (ไม่มี error)
- grep `hmToMinutes` (ไม่รวม `.audit/`) → ไม่มีที่ใช้
- อ่านโค้ด: `late.ts:1-50`, `submissions.ts:22-35,103-188,388-430,440-563,566-666`, `assignments.ts:19-30,90-140`, `Scan.tsx:136-149,229-239,330-380,619-629,781-796`, `metrics.ts:24-36`, `restore-validation.ts:15-19`, `Gradebook.tsx:205-230`
- ไม่ได้บันทึกผ่าน `evidence.mjs` เพราะคำสั่ง PM รอบนี้ให้เขียนได้เฉพาะ `code-review.md`

---

## รอบ 3 (Verify 2/3) — 2026-10-30

ช่วง diff ใหม่ (เทียบกับรอบ 2): `worker/routes/assignments.ts` (ตัวตรวจ ค.ศ. + กติกา "เท่าค่าเดิม") · `src/pages/Scan.tsx` (R-08 ใช้ ACK) · fixture วันที่ใน `test/api/backup-consistency.test.ts:34`, `test/api/integrity-d.test.ts:22`, `test/api/race-r1.test.ts:17` · test ใหม่ `late-flag.test.ts:125-147` และ `scan-controller.test.ts:425-437`

### สรุปรอบ 3: ผ่าน

ต้องแก้ 0 ข้อ · แนะนำ 2 ข้อ (ควรแก้ 1 · เสนอ 1) · B-01/R-09 ปิด · R-08 ปิด

### ยืนยันตามที่ PM ถาม

1. **ตัวตรวจ ค.ศ. และกติกา "เท่าค่าเดิม" — PASS**
   - `assignments.ts:20-23` `ceDate`: regex `^(19|20)\d{2}-\d{2}-\d{2}$` = ปี 1900–2099 · refine เดียวกับ `restore-validation.ts:15-18` (วันจริงตามปฏิทิน เช่น 02-30, 13-01 ตก) · `ymd` preprocess `""` → null ยังเหมือนเดิม (`:25`)
   - `changed(v, stored)` (`:28`) คืน null (ข้ามการตรวจ) เฉพาะเมื่อ `v != null && v === stored` ของ**ฟิลด์เดียวกันของงานเดียวกัน** (`existing` อ่านจาก `aid` ของคำขอ `:56`) → ใส่ปี พ.ศ. ใหม่ไม่ได้ในทุกกรณี:
     - งานใหม่: `existing` = null → ตรวจเต็ม (test `late-flag.test.ts:144` งาน a7 ยืม "2569-10-20" ไม่ได้ → 422)
     - ค่าที่เปลี่ยนแม้ 1 วัน หรือเปลี่ยนเพียงฟิลด์เดียว → ตรวจเต็ม (test `:141-142`)
     - ย้ายค่าข้ามฟิลด์ (assigned → due) ไม่ได้ เพราะเทียบรายฟิลด์
     - งานที่ย้ายเทอม: ไม่มีทางพิเศษ — ค่า พ.ศ. ที่เก็บอยู่แล้วคงอยู่ได้ (ตามกติกา PM) แต่ใส่ค่า พ.ศ. ใหม่ไม่ได้
     - `existing` อ่านนอกธุรกรรม: ถ้ามีการบันทึกอื่นแทรกระหว่างอ่านกับเขียน ผลสูงสุดคือเขียนค่าที่เคยเก็บไว้กลับ (last-write-wins เหมือนฟิลด์อื่น) ไม่ใช่ค่าใหม่ · restore แทรก → `batchAtEpoch` ยกเลิก
2. **ย้ายการตรวจจาก schema ไป route ไม่ข้าม path ใด — PASS**
   - เส้นทางเขียน `assigned_date`/`due_date` มีเพียง `POST /api/assignments` (grep `INSERT INTO assignments|UPDATE assignments SET` ใน `worker/`: อีกสองจุดคือ ลบงาน และปิดงานทั้งปี `catalog.ts:213` ไม่แตะวันที่ · restore ตรวจด้วย schema ของตัวเอง)
   - `newDates.parse` (`:65-68`) อยู่หลังการอ่านรอบเดียว และก่อนการตรวจอื่นและก่อน batch ทุกตัว → ไม่มีการเขียนก่อนตรวจ · ZodError → 422 ผ่าน `api.onError` (`worker/app.ts:114-116`) เหมือนเดิม
3. **R-08 — PASS**
   - `Scan.tsx:411-423` ใช้ `r.submission` เฉพาะ `result === "ok"` และ `subsBox.aid === op.assignmentId` (งานที่อยู่บนจอเท่านั้น) · `duplicate` ไม่มี submission → ไม่แตะ
   - ไม่ทับ op ที่รอส่ง: ACK เขียนลง**สำเนาฝั่ง server** (`subsBox.map`) ไม่ใช่ `pendingOps` · `effSub` (`:233-238`) ยังให้ op ที่รอส่งอยู่บนสุด (`pendingOps` เก็บ op ล่าสุดต่อคู่จาก outbox `outbox.ts:46-49`) และพก `late` จากสำเนาที่ ACK เพิ่งเติมเมื่อแถวเป็น submitted — ตรงกับที่ server เก็บ late เดิมเมื่อให้คะแนนซ้ำ
   - poll ที่ค้างอยู่ไม่ทับค่า ACK: `reconcileSubs` (`:137-148`) เก็บรายการที่เปลี่ยนระหว่าง request (ACK สร้าง object ใหม่) ไว้เหนือคำตอบเก่า
4. **fixture 3 บรรทัด — วันนี้ไม่ลดสิ่งที่ test พิสูจน์ แต่มีข้อควรแก้ (R-11)**
   - ทุกจุดใช้กับงาน a1 ที่ seed ไว้เป็น `'2569-09-01','2569-12-31'` (`test/api/helpers.ts:61`) · ก่อนแก้ ค่าที่ส่งเท่ากับค่าใน seed = การแก้ชื่อ/คะแนนเต็ม/สถานะล้วน ๆ · หลังแก้ ทุกการบันทึกในเทสต์เหล่านี้**เลื่อนกำหนดส่ง**จาก 2569-12-31 เป็น 2026-12-31 ไปด้วย
   - วันนี้ (ก่อน 2026-12-31) ไม่มีแถวพลิก → ผลเหมือนเดิม: 5 ไฟล์ / 116 passed

### ต้องแก้

ไม่มี

### ควรแก้

- R-11 fixture ใหม่ทำให้ 3 ไฟล์เทสต์ขึ้นกับวันที่รัน (time bomb ตั้งแต่ 2027-01-01) · `test/api/race-r1.test.ts:17`, `test/api/integrity-d.test.ts:22`, `test/api/backup-consistency.test.ts:34`
  - สถานการณ์: รันเทสต์ตั้งแต่ 2027-01-01 · `/batch` ตัดสิน late จาก due ใน seed (`2569-12-31` → late=0) แล้วเทสต์บันทึกงานด้วย fixture `2026-12-31` → `lateFixForAssignment` พลิก hand-in ทุกแถวเป็น late=1 และเขียน submissions ในธุรกรรมของการแก้งาน · เทสต์ที่ตั้งใจพิสูจน์ "แก้ชื่อเฉย ๆ" (`race-r1.test.ts:256`), race แก้งาน × เขียนคะแนน (`:57`, `:110`), หรือ fingerprint ของ backup จะมีการเขียนแถวเพิ่มและ cellsGuard ของ `/batch` ที่ค้างอยู่อาจ abort/retry ต่างจากวันนี้
  - ไม่แน่ใจว่าจะมีเทสต์ล้มจริงไหม เพราะรันด้วยนาฬิกาปี 2027 ไม่ได้ภายใต้ข้อจำกัด probe · ที่แน่นอนคือรูปของสิ่งที่เทสต์พิสูจน์จะเปลี่ยนตามวันที่
  - การแก้ไม่จำเป็นด้วย: ด้วยกติกา "เท่าค่าเดิมยอมรับ" ค่าเดิม `2569-…` เท่ากับ seed ทุกตัวอักษร จึงผ่าน 200 อยู่แล้ว (`assignments.ts:28,65-68` + `helpers.ts:61`)
  - แนวทางแก้ (เลือกหนึ่ง): (ก) คืน 3 บรรทัดเป็น `2569-09-01`/`2569-12-31` ให้ตรง seed — เทสต์เดิมกลับเป็นการแก้งานล้วนและได้ทดสอบกติกาเท่าค่าเดิมไปด้วย · หรือ (ข) แก้ทั้ง seed และ fixture เป็น ค.ศ. ที่ไม่มีวันผ่าน เช่น `2099-12-31` ให้ตรงกัน
  - เจ้าของไฟล์: Full-Stack (PM อนุมัติให้แก้ 3 บรรทัดนี้อยู่แล้ว)

### เสนอ

- R-12 test ของ R-08 ครอบเฉพาะกรณีหลัก · `test/unit/scan-controller.test.ts:425-437` — ยังไม่มีกรณี (a) ACK ของงานอื่นต้องไม่แตะจอ (เงื่อนไข `box.aid === op.assignmentId`) และ (b) มี op ใหม่ของเด็กคนเดียวกันรอส่งอยู่ ช่องต้องยังแสดง op ใหม่ · โค้ดถูกจากการอ่าน แต่ถ้ามีคนลบเงื่อนไขในอนาคต ไม่มีเทสต์จับ

### เช็กลิสต์ (รอบ 3)

- [x] input ฝั่ง server — วันที่ใหม่/ที่เปลี่ยนต้องเป็น ค.ศ. 1900–2099 และวันจริง · ข้อยกเว้นเดียวคือค่าเท่าค่าเดิมของงานเดียวกัน (ตามที่ PM ตัดสิน)
- [x] ไม่มี endpoint ใหม่ · ไม่มี secrets · ไม่มี dependency ใหม่ · error 422 เดิม (`issues` ของ zod ไม่มีข้อมูลภายใน)
- [x] ข้อมูล: ใส่ พ.ศ. ใหม่ไม่ได้ → late ไม่ถูกปิดเงียบ ๆ · ค่า พ.ศ. เก่า (จาก restore) ยังทำงานต่อได้และไม่เปลี่ยน
- [ ] เทสต์ไม่ขึ้นกับวันที่รัน — R-11

### หลักฐาน (รอบ 3)

- `npx vitest run test/api/late-flag.test.ts test/unit/scan-controller.test.ts test/api/race-r1.test.ts test/api/integrity-d.test.ts test/api/backup-consistency.test.ts` → 5 ไฟล์ / 116 passed (8 วินาที)
- `npm run typecheck` → PASS
- grep เส้นทางเขียน assignments ใน `worker/` → `assignments.ts:108` (ตรวจแล้ว), `:167` (ลบ), `catalog.ts:213` (ปิดทั้งปี) — ไม่มีจุดอื่นเขียนวันที่
- อ่านโค้ด: `assignments.ts:18-70`, `Scan.tsx:136-149,229-239,409-425`, `outbox.ts:25-50`, `app.ts:108-117`, `test/api/helpers.ts:61`, `late-flag.test.ts:116-147`, `scan-controller.test.ts:425-437`, การใช้ fixture ใน 3 ไฟล์
- R-11 ยืนยันจากการอ่านโค้ด (seed + กติกาเท่าค่าเดิม) · ยังไม่ได้รันด้วยนาฬิกาปี 2027

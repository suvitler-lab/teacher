# Dev notes: Back-End · งาน `2026-11-02-c03-submit-date`

## T-02 server EP-01/EP-03 v3 + `shared/received-date.ts` + type — 2026-11-02

- ทำอะไร:
  - `shared/received-date.ts` (ใหม่): `isCeDate`, `bkkNoonMs`, `checkReceivedDate`, `receivedAtMs`, type `ReceivedDateProblem` — signature ตรงสัญญา v3 · pure (import `bkkToday` จาก `shared/time.ts` เท่านั้น) · `isCeDate` ใช้กฎเดียวกับ `ceDate` ของ EP-05 (regex 1900–2099 + วันจริง)
  - `shared/types.ts`: `SubmissionOp` + `receivedDate?: string | null`, `dateOnly?: boolean` · export `SubmissionInvalidReason` (7 ค่า) · `reason` ใน `SubmissionOpResult` คง `string`
  - `worker/routes/submissions.ts`:
    - `opSchema` + `receivedDate: z.string().max(32).nullish()`, `dateOnly: z.boolean().optional()` (ตรวจชนิดเท่านั้น → 422)
    - `loadWorld` อ่าน `a.assigned_date` เพิ่มใน SELECT เดิม (ไม่มีคำสั่งใหม่)
    - `judge()` ขั้นแรก: `dateOnly` + (method ≠ grid หรือ status ≠ submitted) → `invalid redate_not_allowed` · ข้าม `score_out_of_range` เมื่อ `dateOnly`
    - ลูปหลัก (หลัง `superseded` → `already_submitted`): `dateOnly` และช่อง (ตาม `effective`) ไม่ใช่ submitted → `invalid cell_not_submitted` → ถ้าเป็น op A (submitted ครั้งแรก ทุก method, มี `receivedDate` ≠ null) หรือ op B (`dateOnly`) → `checkReceivedDate(receivedDate, { today: bkkToday(now), assignedDate })` → `invalid received_date_*`
    - `submitted_at`: op A = `receivedAtMs(receivedDate, eventAt, now)` (ไม่มีวันที่ = `eventAt` = `clampClientTs` เดิม → ผลเดิมทุก byte) · op B = วันไทยเดียวกับ `before.submitted_at` → คงค่าเดิมถึง ms · นอกนั้น `receivedAtMs` · status/score ของ op B มาจากแถว (`before`) ไม่ใช้ score ใน op · `late` คำนวณด้วย `isLateSubmission` แล้ว `lateFixForCells` ใน batch ตัดสินซ้ำเหมือนเดิม (ไม่มีใครตั้ง late — BR-04) · op C (แก้คะแนน/void/excused) ไม่แตะ ไม่ตรวจวันที่
    - audit op B = แถว `update` 1 แถว method grid before/after ผ่าน `guardedAuditStmt` เดิม (atomic กับการเขียน)
    - EP-03 `bulkSchema` + `receivedDate` (string ≤ 32 | null) · ลำดับ error: 422 → `400 received_date_not_applicable` → `400 received_date_invalid` → `400 received_date_future` → 404 → 409 `assignment_closed` → `400 class_not_assigned` → `400 received_date_before_assigned` → `400 no_students` · message ไทยตามสัญญา · `submitted_at = receivedAtMs(receivedDate, now, now)` · `late` จากค่านั้น · `event_at`/`updated_at` = now · SELECT งานเดิมอ่าน `assigned_date` เพิ่ม
  - ไม่แตะ: `stillValid`, `cellsGuard`, `CHANGED_CELLS`, `late.ts`, EP-04 (bulk-undo), `src/`, `migrations/`
- ไฟล์: `shared/received-date.ts` (ใหม่), `shared/types.ts`, `worker/routes/submissions.ts`
- เทสต์ที่เพิ่ม: ไม่มี (เทสต์ c03 ทั้ง 5 ไฟล์เป็นของ QA T-01 — ไม่ได้แก้)
- คำสั่งที่รัน → ผล:
  - `npx vitest run test/api/c03- test/unit/c03-` → PASS 5 files / 117 tests (`evidence/t02-c03.txt`)
  - `npm run typecheck` → PASS exit 0 (`evidence/t02-typecheck.txt`)
  - `npx vitest run` → PASS 103 files / 1272 tests (baseline 98/1155 + c03 5/117) (`evidence/t02-full-suite.txt`)
  - AC-24 (`evidence/t02-ac24-meter.txt`): bulk 32 plain/dated = 15 queries · 1138 rows read · 267 written (เท่ากัน) · batch 50 op plain/dated = 12 queries · 2696 read · 501 written (เท่ากัน)
  - evidence Q-20 regression PASS (snapshot tree:a399c5a3b7f1)
- AC ที่ครอบคลุม: AC-01..16, 18, 21, 22, 23, 24 (ส่วนหลังบ้าน) — ผ่านเทสต์ c03 ของ QA
- mock/ชั่วคราว: ไม่มี
- ข้อจำกัด/สิ่งที่ยังไม่ทำ:
  - UI ทั้งหมด (ตัวเลือกวันที่, แถบเตือน, toast, ข้อความไทยของ reason 5 ค่า) อยู่ใน ui-redesign ตาม plan
  - EP-03: `today` คำนวณครั้งเดียวตอนเริ่มคำขอ (ก่อนอ่านฐานข้อมูล) ใช้ทั้งการตรวจ invalid/future และ before_assigned; `now` ของการเขียนคงตำแหน่งเดิม — ข้ามเที่ยงคืนระหว่างคำขอ: วันที่ที่ผ่านการตรวจจะกลายเป็นเที่ยงของวันนั้น (ไม่เกิน now) ไม่มีผลเสีย
  - วันมอบหมายที่ถูกแก้พร้อมกันกับการเขียนไม่ได้ guard ใน SQL (ยอมรับตาม plan "จุดเสี่ยง")
- ถึง QA:
  - op B บนช่องที่เป็น pending row ในคำขอเดียวกัน (เช่น [hid รับงาน, grid dateOnly] ช่องเดียวกัน) — ใช้สภาพ `effective` จึงได้ `ok` และ `submitted_at` ของ op B
  - op B ที่ `before.submitted_at` เป็น null (ข้อมูลเก่าผิดรูป) → ใช้ `receivedAtMs` (ไม่ล้ม)
  - ทาง "lost" (stillValid ไม่ผ่าน) ของ op dateOnly → `judgeUnwritten` เดิม (`superseded`)

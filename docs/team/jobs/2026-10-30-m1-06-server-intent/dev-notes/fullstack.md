# Dev notes: Full-Stack · งาน `2026-10-30-m1-06-server-intent`

## T-01 server ตัดสิน intent เอง + judge ตามสถานะในคำขอ + ปุ่มทั้งห้องไม่แตะ excused + มาเรียนเฉลี่ยแบบรวม — 2026-10-30

- ทำอะไร:
  - `opIntent()` ใช้ `method` อย่างเดียว (camera/hid/manual = รับงาน, ที่เหลือ = ให้คะแนน) · schema ยังรับฟิลด์ `intent` ได้ (client เก่าไม่พัง) แต่ไม่อ่าน (BR-06) · `isReceive` จึงไม่อ่าน intent ด้วย และค่า `receive`/`hand_in` ที่ส่งให้ `stillValid` ฝั่ง SQL มาจาก method เช่นกัน
  - `judge(op, w, cells = w.existing)` — route batch ส่ง `effective` (สถานะหลัง op ก่อนหน้าในคำขอเดียวกัน) เข้าไปตัดสิน "มีแถวที่ไม่ใช่ void" · ตอน re-judge หลังแพ้ race ยังใช้ `fresh.world.existing` ตามเดิม · `stillValid` ฝั่ง SQL ไม่ได้แก้ (ไม่หลวมลง)
  - bulk: "ทั้งห้องส่งแล้ว" ข้ามแถว `excused` · "ล้าง" ข้ามแถว `excused` · "ให้เต็มคนที่ส่ง" แตะเฉพาะ `submitted` อยู่แล้ว (ยืนยันด้วยเทสต์ + คอมเมนต์) · `changed` นับจาก audit ของ batch ตามเดิม จึงนับเฉพาะแถวที่เปลี่ยนจริง
  - `averageAttendancePercent` = `attendancePercent` ของผลรวม counts ทุกคน (D24) · `Students.tsx` ไม่ต้องแก้ (เรียกฟังก์ชันเดิม ได้ค่าใหม่)
- ไฟล์: `worker/routes/submissions.ts`, `shared/metrics.ts`, `test/api/server-intent.test.ts` (ใหม่), `test/unit/metrics.test.ts`, `test/api/integrity-d.test.ts`
- เทสต์ที่เพิ่ม: `server-intent.test.ts` — AC-01 (hid/camera/manual + intent grade บนงานปิด → assignment_closed ไม่มีแถว/audit), AC-02 (grid ไม่มี intent / grade / receive → ok), AC-03 (op จริงของ Scan/Gradebook บนงานเปิด), AC-04 (`[void, grade 8]` ของเด็ก moved → ok / student_inactive, แถวเป็น void, ไม่มี audit ของ grade), AC-05 (excused 1 / submitted 2 / ว่าง 2: changed = 2, 4, 4 · excused ไม่เปลี่ยนทุกปุ่ม · undo การล้างคืนครบ) · unit AC-06 (4/6 + 1/2 → 63, ไม่มีการเช็ค → null)
- เทสต์เดิมที่ปรับ:
  - `test/unit/metrics.test.ts` — assertion เดิมยืนยันค่าเฉลี่ยรายคน 58 → เปลี่ยนเป็น 63 ตาม D24 (ขัดกับ D24 โดยตรง)
  - `test/api/integrity-d.test.ts` "intent overrides the guess from the method" — เดิมยืนยัน grid+receive = ปิดรับ และ manual+grade = ok ซึ่งขัด BR-06 ตรง ๆ → กลับด้านทั้งสอง assertion (grid+receive = ok, manual+grade = assignment_closed) เปลี่ยนชื่อเทสต์ ไม่แตะเทสต์อื่น
- คำสั่งที่รัน → ผล:
  - ก่อนแก้ `npx vitest run test/api/server-intent.test.ts test/unit/metrics.test.ts test/api/integrity-d.test.ts` → 7 failed / 47 passed (`evidence/before-fix.txt`)
  - หลังแก้ คำสั่งเดียวกัน → 54/54 passed (`evidence/after-fix.txt`)
  - `npm run typecheck && npm test` → typecheck PASS · 72 ไฟล์ / 850 tests: 849 ผ่าน, **1 ล้ม** ที่ `test/api/qa-m1-02.test.ts:67` (`evidence/full-suite.txt`)
  - mutation ทีละจุด (`evidence/mutation.txt`): M1 opIntent อ่าน op.intent → 5 เทสต์ล้ม · M2 bulk all-submitted+clear แตะ excused → AC-05 ล้ม · M2b เฉพาะ clear แตะ excused → AC-05 ล้ม · คืนไฟล์แล้ว `cmp` ตรงทุกครั้ง
- เทสต์ที่ล้มและเหตุผล: `qa-m1-02.test.ts` E-05/E-06 วนเคส `{ method: "grid", intent: "receive" }` และคาดว่าเป็น "รับงาน" → `student_inactive` สำหรับเด็ก finished ในรายชื่อเทอมที่จบแล้ว · ตาม BR-06 grid = ให้คะแนน จึงได้ `ok` (ตรงกับกติกาเดิมที่ `inactive-student.test.ts` "a finished student ... can be graded on an empty cell") → assertion ขัด BR-06 ไฟล์ของ QA นอกขอบเขต ต้องให้ QA เอาเคสนี้ออก หรือเปลี่ยนเป็นคาด `ok`
- AC ที่ครอบคลุม: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06 · AC-07 ยังไม่ผ่านจนกว่า QA ปรับ qa-m1-02
- mock/ชั่วคราวที่ต้องถอดตอนเชื่อมระบบ: ไม่มี
- ข้อจำกัด/สิ่งที่ยังไม่ทำ:
  - Q-91 (mandatory) ยังไม่บันทึกใน evidence.json — `evidence.mjs` ไม่ยอมบันทึก FAIL ที่เป็น mandatory · ต้องรันชุดเต็มใหม่หลัง QA แก้ แล้วบันทึกเป็น PASS
  - จุดที่ปัญหาคล้ายกัน (ไม่ได้แก้ นอกขอบเขต): `inactive-student.test.ts:42` "a tap on the grid sent as a hand-in (intent receive)" ยังผ่าน แต่ผ่านเพราะเด็ก moved ไม่อยู่ในรายชื่อเทอม ไม่ใช่เพราะ intent — ชื่อเทสต์ทำให้เข้าใจผิด ควรให้เจ้าของไฟล์เปลี่ยนชื่อ · re-judge หลังแพ้ race (`fresh.world`) ยังตัดสินจากแถวในฐานข้อมูลอย่างเดียว (ถูกต้อง เพราะ op ก่อนหน้าที่ไม่ลงจริงไม่ควรนับ)
- ถึง QA: ลองคำขอประกอบเองแบบอื่น — `bulk`/`import`/`restore` method บน batch route (ทุกตัวถือเป็นให้คะแนน → ผ่านงานปิด แต่ยังติด student_inactive ถ้าไม่มีแถว/ไม่อยู่ในรายชื่อเทอม) · `[void, grade]` ข้ามคำขอสองครั้ง · `[grade, void, grade]` ในคำขอเดียว · bulk-undo ของ "ทั้งห้องส่งแล้ว" เมื่อมี excused

## T-01 Verify รอบ 1 (R-01..R-04) — 2026-10-30

- ทำอะไร:
  - R-01 `opSchema.method` = `camera | hid | manual | grid` เท่านั้น · method อื่นส่งผ่าน batch → ZodError → 422 `validation` (ตัวจัดการ error เดิมใน `worker/app.ts`) · `opIntent` เหมือนเดิม
  - R-03 `batchSchema` refine ให้ opId ไม่ซ้ำในคำขอเดียว → 422 ไม่มีอะไรถูกเขียน
  - R-02 `Gradebook.tsx` เพิ่ม `export function clearableCount()` (นับเฉพาะแถวที่ไม่ใช่ void/excused) และให้กล่องยืนยัน "ล้าง" เรียกใช้
  - R-04 `report.ts` ใช้ `averageAttendancePercent(students.map(s => s.attendance))` แทน `attendancePercent(totCounts)` (`totCounts` ยังใช้นับ `marks`) ผลเท่าเดิม
- เทสต์ที่เพิ่ม: `server-intent.test.ts` R-01 (bulk/import/restore → 422 ไม่มีแถว/audit · 4 method ของหน้าจอยังผ่าน), R-03 (opId ซ้ำ → 422 ไม่มีแถว/audit) · `test/unit/gradebook-clear-count.test.ts` (ใหม่) R-02
- คำสั่งที่รัน → ผล:
  - ก่อนแก้: 5 ล้ม (`evidence/before-fix-verify1.txt`) · หลังแก้: 15/15 (`evidence/after-fix-verify1.txt`)
  - `npm run typecheck && npm test` (1 ครั้ง) → typecheck PASS · 74 ไฟล์ / 868: 865 ผ่าน, 3 ล้ม ทั้งหมดอยู่ใน `qa-m1-06.test.ts` ซึ่งส่ง bulk/import/restore ผ่าน batch และตอนนี้ได้ 422 ตามกติกาใหม่ (`evidence/full-suite-verify1.txt`)
  - mutation M3 คืน enum 7 ค่า → เทสต์ R-01 ล้ม 3 ตัว · คืนไฟล์แล้ว cmp ตรง (`evidence/mutation.txt`)
- ถึง QA: ปรับ 3 เทสต์ใน `qa-m1-06.test.ts` ให้ bulk/import/restore คาด 422 (`GRADE_METHODS` บรรทัด 35 และเคสบรรทัด 113/116)

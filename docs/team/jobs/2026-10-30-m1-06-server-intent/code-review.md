# Code review: M1-06 server ตัดสิน "รับงาน/ให้คะแนน" เอง + ปุ่มทั้งห้องไม่แตะ excused + มาเรียนเฉลี่ยแบบรวม

โดย Code Reviewer · 2026-10-30 · ช่วง diff: `main (c69b9fd)..HEAD` + ที่ยังไม่ commit (`worker/routes/submissions.ts`, `shared/metrics.ts`, `test/api/integrity-d.test.ts`, `test/unit/metrics.test.ts`, ไฟล์ใหม่ `test/api/server-intent.test.ts`) · รอบแก้ (Verify) 0/3 (ตรวจรอบแรก) · ธง 💰 🔐

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่าน

ต้องแก้ 0 ข้อ · แนะนำ 4 ข้อ (ควรแก้ 1 · เสนอ 3)

## คำตอบประเด็นที่ PM ถาม

### 1. 🔐 ไม่เหลือทางให้ client กำหนด "รับงาน/ให้คะแนน" ด้วย `intent` แล้ว

- `opIntent()` (`worker/routes/submissions.ts:197-199`) อ่าน `method` อย่างเดียว · `isReceive()` (`:202-204`) เรียกมันต่อ · ทุกจุดที่ใช้การตัดสินนี้ผ่านสองฟังก์ชันนี้ทั้งหมด:
  - `judge()` ตรวจงานปิด (`:270`) และเด็กที่ไม่ active (`:280`)
  - ค่า `receive` / `hand_in` ที่ส่งเข้า `stillValid` ใน SQL (`:375-376`)
  - การตัดสินซ้ำหลังแพ้ race (`:436`) ใช้ `judge()` ตัวเดียวกัน
- `grep -an intent worker/routes/submissions.ts` เจอแค่ schema (`:67`, ยังรับค่าได้เพื่อให้ client เก่าไม่พัง) กับคอมเมนต์ · ใน `worker/` และ `shared/` ไม่มีโค้ดส่วนอื่นอ่าน `intent`
- client จริงส่ง intent ตรงกับ method มาตั้งแต่ initial commit (`git log -S'intent:' -- src` เจอ `89c729c` อย่างเดียว · `Scan.tsx:256-263` camera/hid/manual + receive · `Gradebook.tsx:153-155` grid + grade) → คิวออฟไลน์ที่ค้างจากเวอร์ชันเก่าจึงไม่ได้ผลต่างจากเดิม
- **ข้อจำกัดที่ต้องรู้ (ตั้งใจตาม BR-06 ไม่ใช่บั๊ก):** `method` ก็เป็นค่าที่ client ส่งมาเช่นกัน คำขอที่ประกอบเองแค่เปลี่ยนเป็น `method: "grid"` ก็ "ให้คะแนน" งานที่ปิดแล้วได้ และได้แถว submitted ใหม่ (AC-02 ต้องการแบบนี้) การปิดรับงานจึงเป็นกติกาขั้นตอนงานของครูที่ login อยู่ (ทุก route มี `requireAuth`) ไม่ได้เป็นเส้นแบ่งสิทธิ์ ผลจริงของงานนี้คือ op ที่ติดป้าย "รับงาน" (camera/hid/manual) จะไม่หลุดผ่านการปิดรับอีก
- **method `bulk`/`import`/`restore` ผ่าน `/api/submissions/batch` ได้** (`:65`) และนับเป็น "ให้คะแนน" ได้สิทธิ์เท่ากับ `grid` ทุกอย่าง:
  - งานปิด: ผ่าน (เหมือน grid)
  - เด็กที่ไม่อยู่ในห้องที่มอบงาน: `not_in_class` (`:273`) และ SQL `assignment_classes` (`:110-111`)
  - เด็กที่ไม่ active และไม่อยู่ในรายชื่อเทอม และไม่มีแถวที่ไม่ใช่ void: `student_inactive` (`:280-283`) และ SQL ซ้ำอีกชั้น (`:112-121`)
  - สรุป: ใช้ method พวกนี้ "ให้คะแนน" งานปิดได้เท่ากับ grid แต่ให้คะแนนเด็กที่ไม่อยู่ในรายชื่อ**ไม่ได้** ไม่มีสิทธิ์อะไรเพิ่มจาก grid · ใน `src/` `worker/` `shared/` ไม่มีโค้ดอ่านค่า `submissions.method` เพื่อตัดสินอะไร และ bulk-undo ดูจาก `batch_id` ที่ batch route ไม่ได้ใส่ จึงย้อนแถวพวกนี้ไม่ได้
  - ผลเสียเดียวคือป้าย method ใน `submissions`/`audit_logs` ผิดได้ (เช่น op จากหน้าจอแต่ติดป้าย `restore`) → ควรจำกัด ดู R-01

### 2. `judge` ใช้ `effective` ถูกต้อง และ `stillValid` ไม่หลวมลง

- ลำดับ op: `effective` เริ่มจาก `world.existing` (`:312`) และอัปเดตเฉพาะ op ที่ผ่าน judge และไม่ถูก superseded (`:379`) · op ที่ถูกปฏิเสธ/superseded/epoch_changed/duplicate ไม่แตะ `effective` ถูกต้อง
- `effective` ทำให้ judge **หลวมลงไม่ได้**: ช่องเดียวที่ `cells` มีผลคือเด็กที่ไม่ active และไม่อยู่ในรายชื่อ ซึ่ง op ก่อนหน้าในคำขอเดียวกันสร้างแถวที่ไม่ใช่ void ให้เด็กกลุ่มนี้ไม่ได้ (receive โดนปฏิเสธ · grade/excused บนช่องว่างหรือ void ก็โดนปฏิเสธ) → `effective` เข้มขึ้นได้อย่างเดียว (กรณี `[void, grade]`)
- SQL `stillValid` (`:104-123`) ไม่ได้แก้ และยังตัดสินจากแถวในฐานข้อมูลเป็นอีกชั้น ถ้า op ก่อนหน้าผ่านใน JS แต่ไม่ลง SQL, op ถัดไปก็ยังโดน SQL ตรวจจากข้อมูลจริง
- re-judge หลังแพ้ race (`:436`) ใช้ `fresh.world.existing` (ข้อมูลที่อ่านใหม่) ถูกต้อง เพราะ op ที่ไม่ลงจริงไม่ควรนับ · ถ้า cell เปลี่ยนระหว่างนั้น `cellsGuard` จะ abort ทั้ง batch แล้ว `apply` ใหม่จาก world ใหม่
- op ที่ส่งซ้ำ: ถ้า opId เคยลงแล้ว (`applied`) จะตอบ duplicate จาก `world.existing` และไม่แตะ `effective` ถูกต้อง · ส่วนกรณี opId ซ้ำ**ในคำขอเดียวกัน**เป็นปัญหาที่มีอยู่ก่อนแล้ว ไม่ได้มาจาก diff นี้ และ `effective` ไม่ได้ทำให้แย่ลง (R-03)

### 3. ปุ่มทั้งห้องไม่แตะ excused (BR-07)

- "ทั้งห้องส่งแล้ว" ข้าม excused (`:508`) · "ให้เต็มคนที่ส่ง" แตะเฉพาะ submitted อยู่แล้ว (`:515`) · "ล้าง" ข้าม excused (`:520`)
- แถว excused ไม่อยู่ใน `upserts`/`audits` → `changed` (นับ audit ตาม `batch_id` ที่ `:558`) นับเฉพาะแถวที่เปลี่ยนจริง · bulk-undo (`:590-674`) คืนค่าเฉพาะแถวที่มี audit ใน batch นั้น จึงไม่แตะ excused
- race: ถ้ามีเครื่องอื่นเปลี่ยนแถวเป็น excused ระหว่างอ่านกับเขียน, `cellsGuard` จะเห็น snapshot เปลี่ยนแล้วตอบ 409 `modified_since` ไม่ได้ทับแถว excused
- เทสต์ AC-05 ครอบทั้ง 3 ปุ่ม + undo (`server-intent.test.ts:104-131`)

### 4. `averageAttendancePercent` แบบรวม (D24)

- `shared/metrics.ts:217-223` รวม counts ของทุกคนแล้วส่งให้ `attendancePercent` → `percentOf` (คูณก่อนหาร, `Math.round` ที่เดียว `:38-40`)
- ไม่มีการเช็คเลย (`[]` หรือทุกคนเป็น 0) → ตัวหาร 0 → `null` ("—") ✔ · 4/6 + 1/2 → 5/8 = 62.5 → 63 ✔
- ได้ค่าเท่ากับการ์ด "มาเรียน" ของหน้ารายงาน (`src/lib/report.ts:114-132` totCounts → `attendancePercent`) และเรียกจาก population เดียวกัน (`Students.tsx:99` ใช้ `model.students` ตัวเดียวกัน) ตรงตาม D24

### 5. การกลับด้าน assertion ใน `integrity-d.test.ts:167-172` สมเหตุสมผล

- เทสต์เดิม "intent overrides the guess from the method" ยืนยันพฤติกรรมที่ BR-06 ห้ามไว้ตรง ๆ (เชื่อ intent) · ค่าใหม่ grid+receive = ok (AC-02) และ manual+grade = assignment_closed (AC-01) · เทสต์อื่นในไฟล์ไม่ได้แตะ (camera/hid/manual ปฏิเสธ · grid ok · void ok · bulk all-submitted 409 ยังเหมือนเดิม)
- `metrics.test.ts:155-163` 58 → 63 ตรงกับ D24 และเพิ่มกรณี `[]` → null
- ทราบไว้: `qa-m1-02.test.ts:67` (ของ QA) ยังคาดว่า grid+receive เป็น "รับงาน" ซึ่งขัด BR-06 แบบเดียวกัน ต้องให้ QA ปรับ (Full-Stack แจ้งแล้วใน dev-notes)

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

- R-01 จำกัด method ที่ `/api/submissions/batch` รับเหลือ `camera | hid | manual | grid` · `worker/routes/submissions.ts:65` — ประเภท security/data
  - ปัญหา: schema รับ `bulk`/`import`/`restore` ด้วย แต่ไม่มี client ส่งค่าพวกนี้ผ่าน batch เลย (ตรวจ `src/` ทั้งหมดและ history ตั้งแต่ initial commit) · ปุ่มทั้งห้อง/นำเข้า/กู้คืน มี route ของตัวเอง
  - สถานการณ์: คำขอที่ประกอบเอง `{method:"restore", status:"submitted", score:8}` บนงานปิด → ok · แถวและ audit ติดป้าย `restore` ทั้งที่ไม่ได้มาจากการกู้คืน → คนที่อ่านประวัติจะเข้าใจผิดว่าแถวนี้มาจากไหน · สิทธิ์ไม่ได้เพิ่มจาก grid (ดูข้อ 1)
  - แนวทางแก้: `method: z.enum(["camera","hid","manual","grid"])` → op อื่นได้ 400 · `opIntent` ยังเหมือนเดิม · ไม่กระทบ client จริงหรือคิวเก่า · เพิ่มเทสต์ว่า `bulk`/`import`/`restore` ผ่าน batch แล้วได้ 400
  - ไม่จัดเป็นต้องแก้ เพราะยังไม่เห็นเส้นทางที่ทำให้ข้อมูลคะแนนหรือสิทธิ์ผิด ผลเสียมีแค่ป้ายใน audit

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-02 จำนวนในกล่องยืนยัน "ล้าง" นับ excused ด้วย · `src/pages/Gradebook.tsx:204` — นับทุกแถวที่ไม่ใช่ void แต่ server ข้าม excused แล้ว (BR-07) → ห้องที่มี excused 1 คน กล่องยืนยันจะขึ้น "(3 รายการ)" แต่ล้างจริง 2 · toast หลังทำใช้ `res.changed` ที่ถูกต้องอยู่แล้ว · แก้ด้วยการเพิ่ม `&& s.status !== "excused"` ในตัวกรอง · ตอนนี้ UI ยังสร้าง excused ไม่ได้ ผลกระทบจึงต่ำ (ไฟล์อยู่นอก diff)
- R-03 opId ซ้ำ**ในคำขอเดียวกัน**ไม่ถูกกันไว้ · `worker/routes/submissions.ts:70`, `:314-395` — ปัญหานี้มีอยู่ก่อนแล้ว ไม่ได้มาจาก diff นี้ · สองแถวผ่าน judge (ตัวที่สองตัดสินบนแถวของตัวแรก ไม่หลวมลง) · audit เป็น `INSERT OR IGNORE` จึงเก็บไว้แค่ตัวแรก แต่ upsert เขียนทั้งคู่ และทั้งคู่ตอบ ok → ถ้าเนื้อหาสองตัวต่างกัน แถวในฐานข้อมูลจะไม่ตรงกับ audit · client จริงสร้าง opId ใหม่ทุก op (ulid) จึงเกิดได้เฉพาะคำขอที่ประกอบเอง · แนวทางแก้: เพิ่มใน `batchSchema` ให้ opId ห้ามซ้ำ หรือตอบ `duplicate` ให้ตัวที่สองเป็นต้นไป
- R-04 สูตรมาเรียนแบบรวมเขียนไว้สองที่ · `src/lib/report.ts:114-132` กับ `shared/metrics.ts:217-223` — ตอนนี้ผลเท่ากัน แต่ถ้าวันหน้าแก้แค่ที่เดียว (เช่นเปลี่ยนว่า "ลา" นับเป็นวันที่เช็คหรือไม่) หน้านักเรียนกับหน้ารายงานจะได้ค่าไม่ตรงกัน · ให้ `report.ts` เรียก `averageAttendancePercent(students.map(s => s.attendance))` แทน (นอก diff)

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร — diff ไม่มีค่าลับ
- [x] ตรวจ input ฝั่ง server ทุกจุด — zod schema เดิม · intent ไม่ถูกใช้แล้ว · method ยังกว้างเกินที่ใช้จริง (R-01 ควรแก้)
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล (ไม่พึ่งการซ่อนปุ่มใน UI) — `requireAuth` ครอบทั้ง 4 route · กติกางานปิด/เด็กที่ไม่ active ถูกบังคับฝั่ง server ทั้งใน JS judge และ SQL `stillValid`
- [x] ป้องกัน injection (SQL/NoSQL/command), XSS, CSRF — SQL ใน diff ไม่ได้เปลี่ยน ใช้ bind/json_each ตามเดิม · ไม่มีส่วน UI ใน diff
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น — ไม่มีการเปลี่ยนแปลง
- [x] error ไม่เปิดเผยรายละเอียดภายใน — ผลลัพธ์ยังเป็นรหัส `assignment_closed`/`student_inactive` เหมือนเดิม
- [x] dependency ใหม่น่าเชื่อถือ — ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] เงิน/ตัวเลข: % มาเรียนปัดครั้งเดียวใน `percentOf` (คูณก่อนหาร) · ไม่มีการปัดผลที่ปัดแล้วซ้ำ · คะแนนไม่ได้แตะ
- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำเมื่อกดซ้ำหรือ sync ซ้ำ — idempotency ข้ามคำขอเหมือนเดิม · `changed` นับจาก audit จริง · ยกเว้น opId ซ้ำในคำขอเดียว (R-03 มีอยู่ก่อนแล้ว)
- [x] การเขียนหลายตารางอยู่ใน transaction — `DB.batch` / `batchAtEpoch` เหมือนเดิม (audit + upsert + lateFix ใช้ guard เดียวกัน)
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง — ไม่เกี่ยวกับงานนี้
- [x] วันที่/timezone/พ.ศ. ถูกต้อง — ไม่มีการเปลี่ยนแปลง (late/submitted_at ใช้ logic เดิม)

## หลักฐาน (อ่านอย่างเดียว)

- `npx vitest run test/api/server-intent.test.ts test/unit/metrics.test.ts test/api/integrity-d.test.ts` → 3 ไฟล์ / 54 tests PASS
- `npm run typecheck` → PASS (ไม่มี error)
- `grep -an intent worker/routes/submissions.ts` → ใช้แค่ที่ schema `:67` กับคอมเมนต์
- `git log -S'intent:' -- src` → มีแค่ `89c729c` (client ส่ง intent ตรงกับ method มาตลอด)
- `grep` หา `method: "bulk|import|restore"` ใน `src/` และ `test/` → ไม่มีการส่งค่าพวกนี้ผ่าน batch
- ไม่ได้รันชุดเต็มตามที่ PM สั่ง (QA กำลังรัน) · ไม่ได้บันทึก evidence.json เพราะ PM ให้เขียนได้เฉพาะไฟล์นี้

---

## รอบ 2 (Verify 1/3) — 2026-10-30

ช่วงที่ตรวจ: เฉพาะ diff ใหม่ที่ยังไม่ commit · `worker/routes/submissions.ts:65-76` (enum method + opId ห้ามซ้ำ) · `src/pages/Gradebook.tsx:34-37, 209` (`clearableCount`) · `src/lib/report.ts:4, 132` · เทสต์ `server-intent.test.ts:134-165` และ `test/unit/gradebook-clear-count.test.ts`

### สรุปรอบ 2: ผ่าน — ต้องแก้ 0 · ไม่มีข้อใหม่

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| R-01 batch รับแค่ camera/hid/manual/grid | ยืนยันแล้ว | `submissions.ts:67` enum เหลือ 4 ค่า · เทสต์ bulk/import/restore ได้ 422 ไม่มีแถว/audit · 4 method ของหน้าจอยัง ok |
| R-02 จำนวนในกล่องยืนยัน "ล้าง" | ยืนยันแล้ว | `clearableCount` ตัด void/excused/ว่าง ตรงกับเงื่อนไขข้ามของ server (`submissions.ts` clear: `!before / void / excused`) |
| R-03 opId ซ้ำในคำขอเดียว | ยืนยันแล้ว | `batchSchema` refine ขนาด Set = จำนวน op → 422 ทั้งคำขอ ไม่มีการเขียน/audit |
| R-04 สูตรมาเรียนที่เดียว | ยืนยันแล้ว | `report.ts:132` เรียก `averageAttendancePercent` |

### คำตอบที่ PM ให้ยืนยัน

1. **คิวค้างจะกลายเป็น 422 ถาวรไหม — ไม่มีโอกาส**
   - ผู้ส่งไป `/api/submissions/batch` มีแค่ `src/lib/outbox.ts:139`
   - payload มาจาก `Scan.tsx makeOp` (ชนิด method จำกัดไว้ที่ camera/hid/manual) และ `Gradebook.tsx` (grid) เท่านั้น ส่วน retry (`outbox.ts:212-231`) คัดลอก payload เดิมโดยไม่เปลี่ยน method
   - client ส่งแค่ 4 ค่านี้มาตั้งแต่ initial commit จึงไม่มีคิวในเครื่องใดที่มี bulk/import/restore
   - ข้อสังเกต (ไม่ใช่ข้อใหม่): ถ้าคำขอได้ 4xx ทั้งก้อน outbox จะย้ายทั้งชุด (สูงสุด 50 op) ไปที่ failed (`outbox.ts:168-171`, `classifyFailure` 422 = failed) เป็นพฤติกรรมเดิมของ validation ทุกชนิด และครูกด retry ได้
   - ข้อสังเกตด้านดูแลรักษา: `shared/types.ts:10` ชนิด `ScanMethod` ที่ใช้กับ `SubmissionOp.method` (`:165`) ยังมี bulk/import/restore ถ้าวันหน้ามีโค้ดฝั่ง client ส่งค่าพวกนี้ผ่าน batch, typecheck จะไม่เตือน (ระดับเสนอ ไม่บังคับ)
2. **opId ซ้ำ 422 ไม่กระทบ outbox ที่ retry — ยืนยัน**
   - store `outbox` ใช้ `keyPath: "opId"` (`src/lib/idb.ts:74`) คิวจึงมี opId ซ้ำไม่ได้ และคำขอหนึ่ง (`send`) ก็ไม่มี opId ซ้ำ
   - การส่งซ้ำด้วย opId เดิมเป็นคนละคำขอ server จะตอบ `duplicate` ผ่าน `existingOpIds` (ไม่ได้ผ่าน schema) และ outbox ลบออกจากคิว (`:151`)
   - `retryFailed` สร้าง opId ใหม่ (`:221`)
3. **`clearableCount` ตรงกับที่ server ล้างจริง — ยืนยันในแง่สถานะ**
   - status มีแค่ submitted/excused/void (zod `:62`) ทั้งสองฝั่งจึงนับเฉพาะ submitted
   - `subOf` สะท้อน op ที่ยังไม่ส่ง แต่ถ้ายังมีคิวค้าง ปุ่มทั้งห้องจะยกเลิกก่อนส่งอยู่แล้ว (`Gradebook.tsx` waiting > 0)
   - ส่วนที่ยังต่างได้ (มีอยู่ก่อนแล้ว นอก R-02): รายชื่อ `students` บนจอกับรายชื่อเทอมที่ server ใช้ (`memberClause`) อาจไม่ตรงกันในบางกรณี · toast หลังทำใช้ `res.changed` จึงแสดงจำนวนจริงเสมอ
4. **`report.ts` ได้ผลเท่าเดิม — ยืนยัน**
   - `averageAttendancePercent(students.map(s => s.attendance))` รวม 5 ช่องจาก `students` ชุดเดียวกับ `totCounts` แล้วเรียก `attendancePercent` ตัวเดิม
   - เป็นผลรวมจำนวนเต็ม จึงเท่ากันทุกกรณีรวมถึง null
   - `totCounts` ยังใช้กับ `marks` (`:125`, `:137`)

### หลักฐานรอบ 2 (อ่านอย่างเดียว)

- `npx vitest run test/api/server-intent.test.ts test/unit/gradebook-clear-count.test.ts test/unit/metrics.test.ts` → 3 ไฟล์ / 35 tests PASS
- `npx vitest run` ไฟล์ที่ใช้ `computeReport`/`attendanceRate` (dashboard, m1-05-metrics, qa-m1-01, qa-m1-05 api+unit, school-year, excel-attendance, m1-05-verify1, metrics) → 9 ไฟล์ / 122 tests PASS
- `npm run typecheck` → PASS
- ไม่ได้รันชุดเต็ม (QA กำลังรัน)

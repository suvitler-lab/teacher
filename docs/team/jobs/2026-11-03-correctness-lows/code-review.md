# Code review: ข้อสังเกตเล็กที่กระทบความถูกต้อง (correctness-lows)

โดย Code Reviewer · 2026-11-03 · ช่วง diff: `b16af7f..` (ยังไม่ commit: `git diff` + ไฟล์ใหม่ `test/api/lows-assignments.test.ts`, `test/api/lows-submissions.test.ts`, `test/unit/lows-gradebook-patch.test.tsx`) · รอบแก้ (Verify) 0/3 (ตัวนับเดียวกับ QA)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

ไฟล์ที่ตรวจ: `worker/routes/assignments.ts`, `worker/routes/submissions.ts`, `shared/received-date.ts`, `src/pages/Gradebook.tsx`, `docs/team/api-contract.md` (v4), `test/api/c03-verify-edges.test.ts`, เทสต์ใหม่ 3 ไฟล์ · โค้ดรอบ ๆ: `worker/lib/late.ts`, `worker/lib/audit.ts`, `worker/lib/guard.ts`, `worker/lib/time.ts`, `worker/app.ts` (onError), `wrangler.jsonc`

## สรุป: ผ่านแบบมีเงื่อนไข

ต้องแก้ 0 ข้อ · ควรแก้ 1 ข้อ (R-01) · เสนอ 4 ข้อ (R-02 ถึง R-05)

ภาพรวม: AC-01, 03, 04, 06, 07 และ 09 ถูกต้องตามที่อ่านโค้ด ส่วน AC-08 แก้ตรงกรณีที่ตั้งใจแก้ได้ แต่ทำให้เกิดผลข้างเคียงใหม่เมื่อคำขอเดียวมีหลาย op ลงช่องเดียวกัน (R-01)

## ต้องแก้ก่อนปล่อย

(ไม่มี)

## ควรแก้ (กลาง: ค้างหลังรอบ 3 ได้ถ้าเจ้าของงานรับเป็น known issue)

### R-01 AC-08 เขียน `after.late` ของทุก op ในช่องเดียวกันเป็นค่าสุดท้ายของช่อง ทำให้ประวัติของ op ก่อนหน้าผิด · ประเภท data · `worker/routes/submissions.ts:178-186`, `:518-519`

- ปัญหา: `auditLateSyncStmt` หาแถว audit จาก `op_id` แล้วใส่ค่า `late` ที่อ่านจาก**ช่อง** (`stored` = `submissions.late` ของ assignment+student) ใน EP-01 คำขอเดียวมีหลาย op ลงช่องเดียวกันได้ (`effective` ออกแบบมาให้ทำแบบนี้ เช่น `[hid รับงาน, grid คะแนน]`, `[hid รับงาน, grid dateOnly]` ของ AC-09 หรือ `[grid ส่ง, grid ล้าง]` จากคิวออฟไลน์) op_id ทุกตัวจึงถูกเขียนเป็น `late` สุดท้ายของช่อง ไม่ใช่ `late` ของแถวที่ op นั้นเขียน ก่อน diff นี้ ประวัติของแต่ละ op ตรงกับแถวที่ op นั้นเขียน (ผิดเฉพาะตอนที่ชนกับการเลื่อนกำหนดส่ง) แต่ตอนนี้ผิดทุกครั้งที่หลาย op ลงช่องเดียวกันและค่า late ต่างกัน ข้อนี้จึงเป็นการถดถอย (regression) ของประวัติที่ diff นี้ทำให้เกิด
- สถานการณ์ที่พัง: งาน a1 กำหนดส่ง 2026-10-30 วันนี้ 11-02 คิวออฟไลน์ของเครื่องเดียวส่ง `[op1 hid รับงาน (submitted_at = now 11-02 → late 1), op2 grid dateOnly receivedDate 2026-10-29]` ช่องเดียวกัน ทั้งสองลงสำเร็จ ช่องสุดท้ายมี late 0 แล้ว `auditLateSyncStmt` ตั้ง `after.late = 0` ให้ op1 ผล: แถว audit ของ op1 บอก `submitted_at` = 11-02 (หลังกำหนดส่ง) แต่ `late = 0` ซึ่งขัดกันเองในแถวเดียว อีกกรณี `[grid ส่ง (late 1), grid ล้าง]` ทำให้ประวัติของการส่งกลายเป็น late 0 ตอนนี้ยังไม่มีหน้าจอไหนแสดง `late` จากประวัติ (`AuditHistory`/`StudentDrawer` แสดงแค่ score/status) แต่ค่านี้ออกไปทาง `/api/audit` และไฟล์สำรอง
- แนวทางแก้ (เลือกอย่างใดอย่างหนึ่ง):
  - (ก) คำนวณ `late` ของแต่ละแถว audit จาก `after` ของแถวนั้นกับกำหนดส่งปัจจุบัน ใช้กฎเดียวกับ `lateSql` เช่น `CASE WHEN json_extract(after_json,'$.status')='submitted' AND json_extract(after_json,'$.submitted_at') IS NOT NULL AND <due ของงาน> IS NOT NULL AND date(CAST(json_extract(after_json,'$.submitted_at') AS INTEGER)/1000 + 25200,'unixepoch') > <due> THEN 1 ELSE 0 END` วิธีนี้ถูกทั้งกรณีชนกับการเลื่อนกำหนดส่ง และกรณีหลาย op ในช่องเดียว
  - (ข) ส่งเข้า `auditLateSyncStmt` เฉพาะ op_id ของแถว**สุดท้าย**ต่อช่อง (ตัดซ้ำตาม pairKey แล้วเก็บตัวท้าย) วิธีนี้แก้ง่ายกว่า แต่ op ก่อนหน้าในช่องเดียวกันจะยังมีค่าเดิมเมื่อชนกับการเลื่อนกำหนดส่ง
  - ควรเพิ่มเทสต์ `[hid รับงาน, grid dateOnly ย้อนก่อนกำหนดส่ง]` แล้วตรวจว่า `after.late` ของ op1 = 1 และของ op2 = 0
- สถานะ: เปิด

## เสนอ (ต่ำ: เจ้าของงานเลือกได้)

- R-02 AC-07 no-op ไม่ขยับ `event_at` ทำให้ op เก่าจากคิวออฟไลน์อีกเครื่องชนะการกระทำที่ใหม่กว่า (🔄) · `worker/routes/submissions.ts:442-446` · ช่องเก็บวันที่ D1 (`event_at` = e0) เครื่อง B ส่ง re-date เป็น D1 ตอน t2 → ตอบ `ok` โดยไม่เขียน ต่อมาเครื่อง A ซึ่งออฟไลน์ส่ง op ที่ทำไว้ตอน t1 (e0 < t1 < t2 เช่น re-date เป็น D2 หรือ ล้าง) → `before.event_at = e0 < t1` จึงลง ผลสุดท้ายเป็นค่าของ A แม้ครูกดยืนยัน D1 ทีหลัง ถ้าไม่มี no-op แถวของ B จะเขียน `event_at = t2` และ A จะได้ `superseded` · หน้าจอไม่ส่ง re-date วันเดิมอยู่แล้ว (C-03 AC-16) จึงเกิดเฉพาะตอนที่หน้าจอถือข้อมูลเก่า และต้องมีคิวออฟไลน์อีกเครื่องที่แตะช่องเดียวกัน โอกาสเกิดต่ำมาก · ข้อเสนอ: บันทึกเป็น known limitation คู่กับ AC-02 / dev-notes ข้อ 4 (ข้อ 4 พูดถึงช่วงอ่านถึงตอบ แต่ไม่ได้พูดถึงลำดับ `event_at`) ถ้าจะแก้ต้องเลือกกติกาก่อน: จะยอมเขียน `event_at` อย่างเดียวหรือไม่ ซึ่งจะทำให้ bulk-undo ได้ 409 อีก (`CELL_FIELDS` มี `event_at`)
- R-03 AC-06 ช่วง 23:55–23:59 re-date เป็น "วันพรุ่งนี้" ของช่องที่ลงวันที่วันนี้อยู่แล้ว ไม่เข้า no-op และเลื่อนเวลาในวันเดียวกัน · `worker/routes/submissions.ts:442-443`, `:456-458`, `shared/received-date.ts:64-68` · `receivedDate` = พรุ่งนี้ ≠ `bkkToday(before.submitted_at)` = วันนี้ จึงไปที่ `receivedAtMs` → `min(เที่ยงพรุ่งนี้, now)` = now ทำให้ `submitted_at` ย้ายจาก 09:00 เป็น 23:57 ในวันเดียวกัน เขียน audit และทำให้ bulk-undo ที่คลุมช่องนี้ได้ `409 modified_since` ค่า late ไม่เปลี่ยน (วันเดียวกัน) และไม่มีค่าใดเกิน now · ข้อเสนอ: ก่อนเทียบ no-op/วันเดียวกัน ให้ปรับ `receivedDate` ที่ `> today` (ผ่าน skew มาแล้ว) เป็น `today` ก่อน แล้วจึงตัดสิน (`op.receivedDate > today ? today : op.receivedDate`)
- R-04 AC-04 เมื่อ rollback server แอปใหม่ที่ cache ไว้จะปิดรับงาน/ซ่อนคะแนนไม่ได้ (422) · `src/pages/Gradebook.tsx:298-302`, `worker/routes/assignments.ts:39` · แอปกับ API อยู่ใน Worker เดียวกัน (`wrangler.jsonc` มี `assets`) deploy ปกติจึงไปพร้อมกัน แต่ถ้า `wrangler rollback` ไปเวอร์ชันก่อน v4 ขณะที่ service worker ของเครื่องครู cache แอปใหม่ไว้ `saveAsgPatch` จะได้ 422 `validation` หน้าจอย้อนกลับและแสดงข้อความ จึงเป็นการล้มที่มองเห็น ไม่ใช่ข้อมูลผิด · ข้อเสนอ: ใส่ใน release note / แผน rollback ว่า rollback ข้าม v4 ต้องบังคับอัปเดตแอปด้วย · แอปเก่าที่ยังส่ง `full_score` จากรายการเก่ายังมีพฤติกรรมเดิมอยู่จนกว่าจะอัปเดต (ได้ 409 เมื่อค่าเก่าต่ำกว่า หรือลดคะแนนเต็มโดยไม่ตั้งใจเมื่อค่าเก่าต่ำกว่าแต่ไม่มีคะแนนเกิน) ข้อนี้มีมาก่อน diff นี้และหายไปเมื่ออัปเดตแอป
- R-05 คำขอที่มี `raise_choice`/`raise_from` แต่ไม่ส่ง `full_score` · `worker/routes/assignments.ts:129`, `:185-186` · `raise` = null (ไม่ใช่การเพิ่มคะแนนเต็ม) แต่ guard `FULL_NOW IS NOT raise_from` ยังอยู่ใน batch ถ้าค่าที่เก็บไม่เท่ากับ `raise_from` จะได้ `409 full_score_changed` ไม่มีหน้าจอไหนส่งคำขอแบบนี้ ข้อมูลจึงไม่ผิด แต่สัญญา v4 ไม่ได้ระบุกรณีนี้ · ข้อเสนอ: ข้ามคำตอบเมื่อ `keepFull` (เหมือน case 9) หรือเขียนในสัญญาว่าเป็นพฤติกรรมที่ตั้งใจ

## ตรวจตามจุดที่ PM ขอ

| จุด | ผล | หลักฐานจากโค้ด |
|---|---|---|
| AC-03 `holdsFull(full, keep)` ใช้ครบทุกทางที่นับ/ปรับ | ถูก | ทุกจุดส่ง keep และลำดับ placeholder ตรง: อ่านรอบแรก `:105` (?2), raiseGuard `:188` (?3), holdersNow `:192` (?3), adjust.audit/cells `:204`/`:207` (?6), auditCount keep `:265` (?4, bind ใหม่ ?1=aid ?2=workOpId), ดูใหม่หลังล้ม `:314` (?2) · `student_id` ที่ไม่ระบุตาราง resolve ไปที่ `submissions` ทุกจุด (students ไม่มีคอลัมน์นี้ และ submissions อยู่ใน scope ที่ใกล้กว่า audit_logs ใน auditCount) |
| AC-03 ย้ายลำดับ audit | ถูก | `audit` + `auditCount` อยู่ก่อน `stmts` (DELETE/INSERT assignment_classes) จึงเห็น link เดิม · บรรทัด audit ของช่อง (adjust.audit) ยังมาก่อนบรรทัดงาน ลำดับ id จึงเหมือนเดิม · `upsertAt` นับจาก `write` ถูกต้อง เพราะ `batchAtEpoch` ตัดผลของ epoch guard ออก (`slice(1)`) |
| AC-04 full_score ไม่บังคับ | ถูก | งานใหม่ที่ไม่ส่ง full_score → `newWorkFullScore.parse({})` → ZodError → 422 (`worker/app.ts:114`) · ค่าที่เก็บตัดสินใน upsert (`?15` = 15 หลัง `?` 14 ตัว ตามกติกา SQLite) · ข้าม guard ลด/เพิ่ม · `RETURNING full_score` → คำตอบ และ `saveAsgPatch` เอาค่าที่ได้ไปทับรายการในเครื่อง (`Gradebook.tsx:313-314`) ค่าเก่าในเครื่องจึงหาย · `auditFull` แก้ `after.full_score` เป็นค่าจริง · `AssignmentModal` ยังส่ง full_score ตามที่ครูกรอก (ตั้งใจ) |
| AC-06 ยอมคลาดเคลื่อน 5 นาที | ถูก ไม่มีค่าใดเกิน now | ทุกทางที่ได้ `submitted_at` ≤ now: `receivedAtMs` คืน `eventAt` (ถูกบีบ ≤ now ด้วย `clampClientTs`) หรือ `min(noon, now)` · bulk ใช้ `receivedAtMs(rd, now, now)` · กรณีวันพรุ่งนี้ที่ผ่าน skew จะถูกเก็บที่ now (วันนี้) late คิดจากวันนี้ · พื้นวันมอบหมายยังใช้ `today` จริง · มีผลข้างเคียงเล็กน้อยใน R-03 |
| AC-07 no-op | ถูกตาม AC | ตัดสินหลัง superseded / cell_not_submitted / received_date_* · `before === world.existing.get(pairKey)` (identity) แปลว่าไม่มี op ก่อนหน้าในคำขอเดียวกันแตะช่องนี้ · ไม่มีแถว audit จึงไม่ได้ `duplicate` เมื่อส่ง op ซ้ำ จะถูกตัดสินใหม่ (ถ้าช่องเปลี่ยนไปแล้ว LWW ตาม event_at ยังใช้ได้) · late ไม่ต้องคำนวณใหม่ เพราะค่าที่เก็บดูแลด้วย `lateFixForAssignment` ทุกครั้งที่เปลี่ยนกำหนดส่ง · ข้อจำกัดอยู่ใน R-02 |
| AC-08 sync late ใน audit | ถูกเฉพาะ op เดียวต่อช่อง | รูป 0/1 ตรงกับ after เดิมของ EP-01 · index `res[3]` ของ `corrected` ไม่เปลี่ยน เพราะเพิ่มท้าย batch · ปัญหาหลาย op ต่อช่องอยู่ใน R-01 |
| AC-09 guard ของ re-date จากแถวรับงานในคำขอเดียวกัน | ถูก | `madeBy` หาด้วย identity แล้วได้ `receive`/`hand_in` = 1 → `stillValid` ตัดพร้อมแถวรับงาน (ปิดรับ / เด็กไม่ active) · ต่อกันเป็นทอดได้ (re-date ซ้อนก็รับค่าที่สืบทอดมา) · `judgeUnwritten` ตอบ `cell_not_submitted` เฉพาะ dateOnly ที่ไม่มีสิ่งใหม่กว่าและช่องตอนนี้ไม่ submitted |
| AC-01 | ถูก | `pending.find(p => p.row === before)` + ตรวจ undefined |

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร (diff ไม่มี key หรือ token)
- [x] ตรวจ input ฝั่ง server ทุกจุด: `full_score` ยังเป็น int 1–100 เมื่อส่งมา และบังคับเมื่อสร้างงานใหม่ (422) · `receivedDate` ผ่าน `checkReceivedDate` ทุกทาง
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล: ไม่เปลี่ยน (`requireAuth` เดิม)
- [x] ป้องกัน injection: SQL ที่ประกอบใหม่ (`holdsFull`, `removedClasses`, `auditLateSyncStmt`) ใส่เฉพาะชื่อ placeholder/ข้อความคงที่ ค่าจากผู้ใช้ทั้งหมดผ่าน bind · ไม่มี XSS/CSRF ใหม่
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น (ไม่เปลี่ยน)
- [x] error ไม่เปิดเผยรายละเอียดภายใน (422 `validation` แบบเดิม)
- [x] dependency ใหม่: ไม่มี

## ความถูกต้องของข้อมูล (ธง 💰 🔄)

- [x] คะแนน: ไม่มีการคำนวณ float ใหม่ · คะแนนเต็มไม่ถูกทับด้วยค่าเก่าจากหน้าสมุดคะแนนอีกแล้ว (AC-04) · การนับ/ปรับคนที่ได้เต็มเดิมใช้นิยามเดียวกันทุกจุด (AC-03)
- [ ] ไม่นับซ้ำ / ไม่บันทึกซ้ำเมื่อกดซ้ำหรือ sync ซ้ำ: ไม่บันทึกซ้ำ (no-op ไม่มีแถว และส่งซ้ำแล้วถูกตัดสินใหม่) · ลำดับ LWW เมื่อเป็น no-op เปลี่ยนไปเล็กน้อย (R-02)
- [x] การเขียนหลายตารางอยู่ใน transaction: ทุกอย่างอยู่ใน `DB.batch` เดียว (auditFull, auditCount และ auditLateSync อยู่ใน batch เดียวกับการเขียน)
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง: ไม่เกี่ยว (ไม่มีการลบใหม่)
- [x] วันที่/timezone/พ.ศ.: ทุกค่าอิงวันไทยของ server · `submitted_at` ไม่เกิน now · มีผลข้างเคียงเล็กน้อยที่ขอบเที่ยงคืน (R-03)
- [ ] ประวัติ (audit) ตรงกับแถวที่ op เขียน: R-01

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `npm run typecheck` | PASS |
| `npx vitest run test/api/lows-assignments.test.ts test/api/lows-submissions.test.ts test/unit/lows-gradebook-patch.test.tsx test/api/c03-verify-edges.test.ts` | PASS 4 ไฟล์ / 37 เทสต์ |
| `npx vitest run` (ทั้งชุด) | PASS 108 ไฟล์ / 1312 เทสต์ (ตรงกับ dev-notes) |

R-01 ยืนยันจากการอ่าน SQL (`op_id IN (...)` + ค่าจากช่อง) ยังไม่ได้รันเทสต์ เพราะ reviewer สร้างไฟล์เทสต์ในโปรเจกต์ไม่ได้ ชนิดหลักฐานใน `evidence.mjs kinds` ไม่มีชนิดของ code reviewer จึงไม่ได้บันทึก evidence

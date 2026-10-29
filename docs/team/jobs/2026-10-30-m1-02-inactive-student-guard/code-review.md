# Code review: ไม่รับงานใหม่ของนักเรียนที่ย้ายออก/ไม่ใช้งาน/จบปี (M1-02)

โดย Code Reviewer · 2026-10-30 · ช่วง diff: `main (0020a93)..working tree` (ยังไม่ commit) — `worker/routes/submissions.ts`, `shared/types.ts`, `src/pages/Scan.tsx`, `src/components/Overlays.tsx`, `test/unit/outbox-order.test.ts`, `test/api/inactive-student.test.ts` (ใหม่) · รอบแก้ (Verify) 1/3 (ตัวนับเดียวกับ QA)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

หมายเหตุ: `test/api/qa-m1-02.test.ts` (ไฟล์ใหม่ของ QA ที่โผล่ระหว่างตรวจ) ไม่อยู่ในขอบเขตรอบนี้ · `docs/team/decisions.md` และ `program.md` เป็นเอกสาร PM ไม่ได้ตรวจ

## สรุป: ผ่านแบบมีเงื่อนไข

ต้องแก้ 1 ข้อ (ระดับกลาง ไม่ใช่ปัญหาความปลอดภัย และไม่ได้ทำให้ข้อมูลผิด เป็นพฤติกรรมเดิมที่หายไปเงียบ ๆ) · แนะนำ 4 ข้อ (เสนอ)

ส่วนหลักของงานถูกต้อง: judge กับ stillValid ใช้นิยามเดียวกันจริง (ไล่ครบ 256 กรณีแล้วไม่มีจุดที่ไม่ตรงกัน), race ถูกกันในธุรกรรม และ re-judge ตอบ `student_inactive`, query ใหม่ใช้ index ทุกจุด และฝั่ง client ถือเป็น failure ถาวร

## ต้องแก้ก่อนปล่อย

### R-01 bulk "ทั้งห้องส่งแล้ว" ของเด็ก finished (และ moved/inactive ที่ออกหลังจบเทอม) ไม่ถูกบันทึก แต่ตอบ ok — bug/data · `worker/routes/submissions.ts:109-110` คู่กับ `:515`, `:468-472`, `:538-550`

- ปัญหา: bulk ไม่มี judge ใช้ stillValid เป็นตัวกรองตัวเดียว และส่ง `receive: action === "all-submitted" ? 1 : 0` (`:515`) เงื่อนไขใหม่ใน stillValid `st.status = 'active' OR (receive = 0 AND …)` (`:109-110`) จึงตัดแถว all-submitted ของเด็กที่ไม่ active ทุกคนทิ้ง ทั้งที่รายชื่อ bulk ดึงด้วย `memberClause` (`:468-472`) ซึ่ง**รวม finished** และ moved/inactive ที่ `left_at > end_date` ผลคือ list กับ guard ไม่ตรงกัน และแถวหายแบบเงียบ ๆ
  - ขัดกับ BR-02 ใน brief: "bulk ใช้ `memberClause` อยู่แล้ว จึงสอดคล้องโดยไม่ต้องแก้" และ dev-notes รอบ 2 ที่บอกว่า "bulk คงเดิม" ทั้งที่ใน `main` stillValid ไม่ตรวจ status จึงบันทึกแถวให้เด็กกลุ่มนี้ได้ จึงถือเป็น regression ของพฤติกรรม
  - ขัดกับตัวเองด้วย: ใน Gradebook ถ้าแตะทีละช่อง (`grid`/`grade`, status submitted) ให้เด็ก finished คนเดียวกัน ระบบยอมรับ (AC-08) แต่กดปุ่ม "ทั้งห้องส่งแล้ว" กลับไม่ได้ผล
  - หัวไฟล์ test (`test/api/inactive-student.test.ts:2`) เขียนว่า "whole-class bulk" ห้ามรับงาน แต่ไม่มี test ของกรณีนี้ เจตนาจึงไม่ชัดว่าจะเอาแบบไหน
- สถานการณ์ที่พัง: ขึ้นปีการศึกษาใหม่ไปแล้ว (`catalog.ts:207` เปลี่ยนเด็กห้องเก่าเป็น `finished`) ครูเปิดสมุดคะแนนงานปีก่อน แล้วกด "ทั้งห้องส่งแล้ว" (`Gradebook.tsx:358`) → list = เด็ก finished ทั้งห้อง → upsert และ audit ถูก stillValid ตัดทิ้งทุกแถว → `changed = 0` → ผ่านทางที่ไม่มีอะไรผิด (`:538-547`) → ตอบ `{ ok: true, changed: 0 }` → `Gradebook.tsx:221-229` ไม่แสดงข้อความอะไรเลยสำหรับ all-submitted ครูเห็นว่ากดแล้วไม่มีอะไรเกิดขึ้น ไม่มีคำอธิบาย ถ้าเป็นห้องที่มีเด็ก active ปนอยู่ จะบันทึกเฉพาะเด็ก active และเงียบเหมือนกัน
  - ยืนยันด้วยการอ่านโค้ด และรัน SQL ของ stillValid จริงใน sqlite (probe ด้านล่าง): `receive=1` กับ status ≠ active ได้ `false` ทุกกรณี
- แนวทางแก้ (PM/เจ้าของงานเลือกทางเดียว แล้วเพิ่ม test ของกรณีนี้):
  - (ก) ตาม BR-02 ที่เขียนไว้: bulk เป็นงานในสมุดคะแนน จึงไม่ต้องบังคับ active ให้แยกฟิลด์ใน `GuardedRow` ออกเป็นสองตัว ได้แก่ `receive` (ใช้ตรวจงานปิดรับ เหมือนเดิม) และ `hand_in` (ต้อง active) แล้วใช้ `hand_in` ในเงื่อนไข status บรรทัด `:110` · batch ใส่ `hand_in = isReceive(op)` ส่วน bulk ใส่ `hand_in = 0` (list กรองด้วย memberClause แล้ว)
  - (ข) ถ้าถือว่า bulk all-submitted เป็นการ "รับงาน": ต้องปรับ BR-02 ให้ตรง กรอง list ของ all-submitted เหลือเฉพาะ active ก่อนสร้างแถว (ไม่ปล่อยให้ guard ตัดเงียบ ๆ) และให้ client บอกครูเมื่อ `changed` น้อยกว่าที่คาด หรือเท่ากับ 0
  - test ที่ต้องมีไม่ว่าเลือกทางไหน: งานปีก่อน (เทอม t0 มี end_date) + ห้อง c0 ที่เด็ก finished/moved-หลังจบเทอม → bulk all-submitted → ตรวจค่า `changed` และแถวตามทางที่เลือก
- สถานะ: ยืนยันแล้ว (รอบ 2 — ดูท้ายไฟล์)

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

- ไม่มี

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-02 หน้าสแกนส่งเสียงสำเร็จก่อน แล้วค่อยแจ้งว่าล้มเหลว · `src/pages/Scan.tsx:310-330` — client มี `student.status` อยู่แล้ว (bootstrap ส่ง moved/finished มาด้วย) แต่ `commitStudent` ไม่ได้ตรวจ จึงขึ้น "ส่งแล้ว" + เสียงสำเร็จไปก่อน แล้วเพิ่งเปลี่ยนเป็น danger หลัง flush ตอน**ออฟไลน์** ครูจะเชื่อไปจนกว่าเน็ตกลับมาว่าเด็กที่ย้ายออกส่งงานแล้ว เสนอให้ตรวจ `status !== "active"` ใน `commitStudent` แล้วแสดง `REJECTED.student_inactive` ทันที (ให้ server เป็นผู้ตัดสินขั้นสุดท้ายเหมือนเดิม) — อยู่นอก AC-06 ที่ขอแค่ข้อความ
- R-03 ถ้า `end_date = ''` judge กับ stillValid จะตัดสินไม่ตรงกัน · `worker/routes/catalog.ts:61` (เดิม) คู่กับ `worker/routes/submissions.ts:116-117` — `POST /api/terms` รับ `end_date` เป็น string อะไรก็ได้ (ไม่มี regex ต่างจาก `:127`) ฝั่ง TS (`inRoster`) และ `memberClause` ถือ `''` เป็น "ไม่มีวันจบ" แต่ stillValid ถือเป็นวันที่ (`left_at > ''` เป็นจริงเสมอ) probe ยืนยันว่า SQL = 1, TS = false ผลที่เกิดได้คือ guard ในธุรกรรมหลวมกว่า judge (judge ยังกันไว้ก่อน ข้อมูลจึงไม่ผิด) client จริงส่ง `null` แทนค่าว่าง (`CatalogEditor.tsx:303,336`) จึงเกิดได้เฉพาะเมื่อยิง API ตรง เสนอให้ใส่ regex ที่ `:61` หรือใช้ `NULLIF(t.end_date,'')` ใน stillValid
- R-04 จุดที่ test ยังไม่ครอบคลุม · `test/api/inactive-student.test.ts`
  - ยังไม่มี test ของ R-01 (bulk all-submitted ของเด็ก finished)
  - ยังไม่มี race ของ "รับงาน" ที่เด็กอยู่ในรายชื่อเทอม (เช่น active → finished ระหว่าง judge กับ batch แล้วสแกน hid) ถ้ามีคนลบ `receive = 0` ออกจาก `:110` เทสต์ชุดนี้จะยังผ่านทั้งหมด (AC-04 ที่มีอยู่ใช้ moved ในเทอมที่ไม่มี end_date ซึ่งสาขา roster เป็นเท็จอยู่แล้ว) เมื่อดูตามนี้ mutation M1/M2 ที่ dev อ้างสมเหตุสมผลและตรงกับที่คาด แต่ยังไม่ครอบคลุม mutation ตัวนี้
  - ยังไม่มีกรณีขอบ `left_at = end_date` (ควรได้ `student_inactive` เพราะใช้ `>`) ส่วน probe ยืนยันแล้วว่า TS กับ SQL ให้ผลเดียวกัน
  - fixture ใช้วันที่แบบ พ.ศ. (`'2569-10-15'` `:21`, `'2569-11-30'` `:89`, `:186-190`) แต่ระบบจริงเก็บ ค.ศ. (`bkkToday`, `end_date "2027-03-15"` ใน school-year.test) ความหมายของการเทียบยังเหมือนเดิมเพราะใช้ พ.ศ. ทั้งสองฝั่ง แต่อาจทำให้คนอ่านเข้าใจรูปแบบที่เก็บผิด เสนอให้ใช้ ค.ศ.
- R-05 ความเสี่ยงที่ยังเหลือ (ให้ PM รับทราบ ไม่ใช่บั๊กตาม BR-02) · `worker/routes/submissions.ts:189-197, 268-272`
  - (ก) server เชื่อ `intent` ที่ client ส่งมา: op `method: "hid", intent: "grade"` จะไม่ถือว่าเป็นการรับงาน เด็ก finished ในเทอมปัจจุบัน หรือเด็ก moved ที่มีแถว void อยู่แล้ว จะถูกเปลี่ยนเป็น `submitted` ได้ ทางนี้เกิดเฉพาะเมื่อยิง API ด้วย session ครูเอง (client จริงส่ง `receive` จาก Scan `:261` และส่ง `grade` จาก Gradebook `:157`) และ M1-06 จะแก้
  - (ข) "มีแถวอยู่แล้ว" รวมแถว `void` ด้วย op จากสมุดคะแนนที่ค้างคิวออฟไลน์ หรือมาจากหน้าที่เปิดค้างไว้ จึงเปลี่ยนแถว void ของเด็กที่เพิ่งย้ายเป็น `submitted` ได้ พร้อม `submitted_at`/`late` ใหม่ ซึ่ง BR-02 ตามตัวอักษรอนุญาต แต่ในทางปฏิบัติเท่ากับรับงานใหม่ผ่านสมุดคะแนน ให้ PM ยืนยันว่ารับได้

## คำตอบประเด็นที่ PM ถาม

1. **judge (TS) กับ stillValid (SQL) ตรงกันไหม** — ตรงกัน ดึงข้อความ SQL ของ `stillValid()` จากไฟล์จริงมารันใน sqlite (node:sqlite + migrations ทั้งชุด) แล้วเทียบกับเงื่อนไขของ judge (`status !== active && (isReceive || (!มีแถว && !inRoster))`) ไล่ครบ 4 เทอม (ไม่มี term_id / term_id ชี้เทอมที่ไม่มีอยู่ / เทอมไม่มี end_date / end_date 2026-03-15) × 4 status × left_at (null, <, =, >) × receive 0/1 × มี/ไม่มีแถว = **256 กรณี ไม่ตรงกัน 0**
   - term_id ชี้เทอมที่ไม่มีอยู่: TS ใช้ LEFT JOIN ได้ `term_year = null` แล้วถือเป็น "ไม่มีเทอม" (active เท่านั้น) ส่วน SQL ใช้ JOIN ไม่เจอแถวจึงได้ EXISTS เป็นเท็จ (active เท่านั้น) ผลตรงกัน (`terms.year` เป็น NOT NULL ดังนั้น `term_year = null` เกิดได้ก็ต่อเมื่อไม่มีแถวเทอมเท่านั้น) และในระบบจริงมี FK `assignments.term_id → terms(id)` กันกรณีนี้อยู่แล้ว
   - การเทียบวันที่: ทั้งสองฝั่งเทียบ string แบบ binary คอลัมน์เป็น TEXT รูปแบบ `YYYY-MM-DD` (`students.ts:50` บังคับด้วย regex และเขียนด้วย `bkkToday`) จึงเรียงลำดับเหมือนกัน กรณี `=` ได้เท็จทั้งคู่
   - จุดที่ไม่ตรงกันจริงอยู่นอกตาราง: `end_date = ''` (R-03) · status ที่ไม่อยู่ใน 4 ค่า (TS ยอมถ้า left_at > end_date แต่ SQL ไม่ยอม ถ้าเกิดจะได้คำตอบ `superseded` ที่ผิดความหมาย) ซึ่ง API กันไว้แล้วด้วย zod enum (`students.ts:48`, `restore-validation.ts:31`) จึงไปถึงไม่ได้
2. **ช่องหลุด** — op จาก batch ทุก op ผ่าน judge และ stillValid ด้วย `isReceive` ตัวเดียวกัน (`:195-197`, `:259`, `:363`) ช่องที่เหลืออยู่ที่ R-05(ก) intent ที่ client กำหนดเอง (M1-06) ส่วน bulk เป็นจุดที่พฤติกรรมเปลี่ยนแบบเงียบ (R-01) ไม่ใช่ช่องรั่ว: moved ในเทอมปัจจุบันไม่อยู่ใน list อยู่แล้ว (AC-05 ผ่าน) · bulk-undo (`:640`) เขียนโดยไม่ผ่าน stillValid แต่เป็นการคืนค่าเดิมของแถวที่ bulk สร้างไว้ ไม่ใช่การรับงานใหม่ · ไม่มีเส้นทางอื่นที่เขียน `submissions` (grep `INTO submissions` แล้ว)
3. **race** — stillValid อ่าน `st.status`, `st.left_at`, แถว `s0` และ `terms.end_date` ณ เวลาเขียน ในคำสั่งเดียวกับ upsert และ audit (`:390`) ถ้าค่าใดเปลี่ยนจะไม่มีทั้งแถวและ audit แล้ว `existingOpIds` จะไม่พบ op → `loadWorld` อ่านใหม่ → judge ด้วยนิยามเดียวกันตอบ `student_inactive` (ไม่ตกไปเป็น `superseded` หรือ `ok`) เพราะ TS = SQL ตามข้อ 1 test ครอบคลุม AC-04 ×3 และ AC-08 race (ช่องที่ยังไม่มี test ดู R-04)
4. **performance** — `EXPLAIN QUERY PLAN` ของ upsert ที่มี stillValid: ทุก subquery เป็น SEARCH ด้วย PK (`submissions(assignment_id,student_id)` COVERING, `assignments.id`, `terms.id`, `students.id`, `assignment_classes` COVERING) ไม่มี SCAN ตาราง และ `st.status = 'active'` อยู่ซ้ายสุดของ OR ทำให้เด็ก active ไม่ต้องรัน subquery ใหม่ · `test/api/volume.test.ts` 7/7 ผ่าน
5. **client** — `outbox.ts:153-157` ผลที่ไม่ใช่ ok/duplicate จะไปที่ `moveOutboxToFailed` และ `student_inactive` ไม่อยู่ใน `NON_BLOCKING` (`:29`) จึงกัน op ถัดไปของคู่เดียวกันด้วย ซึ่งถูกต้อง เพราะ op ถัดไปจะถูกปฏิเสธอยู่ดี และไม่ไปทับลำดับ · unit test ยืนยันว่าไม่ retry · client รุ่นเก่าตกไปทาง `else` เดียวกัน และแสดง `REASON[...] ?? it.reason` / `REJECTED[...] ?? r.result` เป็นข้อความดิบโดยไม่พัง · ค่าที่เพิ่มใน union ไม่ทำให้ `SubmissionOpResult` เดิมเสีย
6. **test** — ครอบคลุม AC-01 (3 status × 3 method + grid/receive + แถว void), AC-02, AC-03 (ไม่มีวันจบเทอม / ออกก่อนจบเทอม / ไม่มีเทอม), AC-04 ×3, AC-05 ×2 (เฉพาะ moved), AC-08 ×5, AC-09 และ unit ของ AC-06 · mutation M1 (ล้ม 3) และ M2 (ล้ม 2) ตรงกับที่คาดจากการไล่ test · ช่องว่างดู R-04

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร (ไม่มีอะไรใหม่ใน diff)
- [x] ตรวจ input ฝั่ง server ทุกจุด — schema ของ op เหมือนเดิม และ guard ใหม่อ่านจาก DB ไม่ได้เชื่อ client (ยกเว้น `intent` ที่มีอยู่เดิม R-05ก)
- [x] ตรวจสิทธิ์ทุก endpoint — `requireAuth` เหมือนเดิม (`:16-19`)
- [x] ป้องกัน injection — SQL ใหม่ใช้ `json_extract` จากแถวที่ server สร้าง ไม่มีการต่อ string จาก input
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น — ผลใหม่มีแค่ opId/result
- [x] error ไม่เปิดเผยรายละเอียดภายใน
- [x] dependency ใหม่น่าเชื่อถือ — ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] เงิน/คะแนน: ไม่มีการคำนวณคะแนนใหม่ ตรวจช่วงคะแนนเหมือนเดิม และ `submitted_at`/`late` เดิมคงอยู่เมื่อแก้คะแนน (AC-02)
- [x] ไม่นับซ้ำ/ไม่บันทึกซ้ำ — idempotency ผ่าน `existingOpIds` เหมือนเดิม
- [x] การเขียนหลายตารางอยู่ใน transaction — audit กับ upsert อยู่ใน batch เดียว ใช้ guard ข้อความเดียวกัน
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง — ไม่เกี่ยว (ไม่มีการลบ)
- [x] วันที่/timezone/พ.ศ. — เทียบ `YYYY-MM-DD` แบบ ค.ศ. ทั้งสองฝั่ง ไม่ใช้ `terms.year` (พ.ศ.) ในการเทียบ (fixture ใช้ พ.ศ. ดู R-04)
- [ ] 🔄 offline replay / สองอุปกรณ์ — เป็นงานของ QA (T-02) ส่วนที่เกี่ยวกับ reviewer ดู R-02, R-05(ข)

## หลักฐานที่รัน (อ่านอย่างเดียว)

| คำสั่ง | ผล |
|---|---|
| `git diff main -- <5 ไฟล์>` + อ่าน `test/api/inactive-student.test.ts` | ตรวจครบทุกไฟล์ใน diff |
| `npx vitest run` | 59 ไฟล์ / 634 tests PASS |
| `npx vitest run test/api/volume.test.ts` | 7/7 PASS |
| `npm run typecheck` | exit 0 |
| probe ใน scratchpad: SQL ของ `stillValid()` ดึงจากไฟล์จริง รันบน node:sqlite + migrations ทั้งชุด เทียบกับ `inRoster` จาก `shared/roster.ts` | 256 กรณี ไม่ตรงกัน 0 · `end_date=''` SQL=1 / TS=false · query plan: SEARCH ด้วย PK ทั้งหมด |

ไม่ได้บันทึกลง `evidence.json` เพราะไม่มี kind สำหรับ Code Reviewer และคำสั่งของ PM อนุญาตให้เขียนได้เฉพาะไฟล์นี้

---

## รอบ 2 — Verify 1/3 (2026-10-30)

ช่วงที่ตรวจ: diff ใหม่ตั้งแต่รอบ 1 ใน `worker/routes/submissions.ts`, `src/pages/Scan.tsx`, `test/api/inactive-student.test.ts`, `test/unit/scan-controller.test.ts` ตามที่ PM ตัดสินใน brief §"PM ตัดสินข้อ review" (R-01 → ก, R-05(ข) แถว void ไม่นับ, R-02/R-03/R-04 รับ)

### สรุปรอบ 2: ผ่าน

ต้องแก้ 0 ข้อ · ควรแก้ 0 ข้อ · เสนอ 1 ข้อใหม่ (R-06)

| ข้อเดิม | สถานะ | หลักฐาน |
|---|---|---|
| R-01 bulk all-submitted ของเด็ก finished/ออกหลังจบเทอม | **ยืนยันแล้ว** | ฟิลด์ `hand_in` แยกจาก `receive` (`submissions.ts:86`, `:111`) · batch ใช้ `hand_in = isReceive(op)` (`:367`) · bulk ใช้ `hand_in: 0` (`:520`) · test `R-01: whole-class bulk on last year's work…` ได้ `changed = 2`, เด็ก st7 ที่ออกก่อนจบเทอมไม่ถูกแตะ, audit 2 แถว · probe: bulk ปีก่อน finished = 1, moved ที่ออกก่อนจบเทอม = 0 |
| R-02 หน้าสแกนส่งเสียงสำเร็จก่อน | **ยืนยันแล้ว** | `Scan.tsx:319-325` (เงื่อนไขที่ `:321`) |
| R-03 `end_date = ''` | **ยืนยันแล้ว** | `NULLIF(t.end_date,'')` (`:118-119`) · probe กรณี `''` ไม่ต่างกันแล้ว · test R-03 race |
| R-04 จุดที่ test ยังไม่ครอบคลุม | **ยืนยันแล้ว** | race ของเด็ก finished ที่สแกน (จับ mutation ที่ถอด `hand_in = 0` ได้), `left_at = end_date`, fixture เป็น ค.ศ. แล้ว |
| R-05(ข) แถว void นับเป็น "มีแถว" | **ยืนยันแล้ว** (ตามที่ PM ตัดสิน) | judge `:270-275` ดู `cell.status === "void"` · stillValid `s0.status <> 'void'` (`:114`) · test R-05 และ R-05 race |
| R-05(ก) intent มาจาก client | รับทราบ — ยกไป M1-06 | — |

### คำตอบประเด็นที่ PM ถาม (รอบ 2)

1. **R-01 ปิดจริง และ bulk ไม่เปิดช่องใหม่**
   - งานปิดรับ: all-submitted ยังส่ง `receive = 1` จึงถูกกันทั้งที่ 409 ก่อนเขียน (`:459`) และใน stillValid (`NOT (closed AND receive = 1)`) · probe: งานปิดรับ + เด็ก finished + `receive=1, hand_in=0` ได้ 0
   - เด็กที่ไม่อยู่ใน roster: รายชื่อ bulk ยังกรองด้วย `memberClause` (`:472-476`) ส่วน stillValid ตรวจซ้ำ ณ เวลาเขียนว่าเด็ก active หรืออยู่ในรายชื่อเทอม หรือมีแถวที่ไม่ใช่ void ถ้าเด็กออกจาก roster ระหว่างอ่านกับเขียนและไม่มีแถว จะถูกตัด (`changed` นับตาม audit จึงตรงความจริง) · ยังเขียนได้เฉพาะเมื่อมีแถวที่ไม่ใช่ void (เช่น excused) ซึ่งตรงกับ BR-02 (ก) · AC-05 (moved ในเทอมปัจจุบันไม่ถูกแตะ) ยังผ่าน
2. **judge กับ stillValid ยังนิยามเดียวกัน** — รัน probe ซ้ำ (`probe2.mjs`) ด้วย SQL ของ `stillValid()` ที่ดึงจากไฟล์ปัจจุบัน ไล่ 5 แบบเทอม (ไม่มี / ชี้เทอมที่ไม่มีอยู่ / ไม่มี end_date / มี end_date / end_date `''`) × 4 status × 4 left_at (null, <, =, >) × hand_in 0/1 × แถว (ไม่มี / void / submitted / excused) = **640 กรณี ไม่ตรงกัน 0** · query plan ยังเป็น SEARCH ด้วย PK ทุกจุด (s0 ใช้ PK index ที่ไม่ใช่ covering แล้วเพราะต้องอ่าน status ซึ่งยังเป็น point lookup) · volume.test ผ่าน
3. **M4 (`s0.status <> 'void'` ทดสอบแยกผ่าน API ไม่ได้)** — **รับได้** เหตุผลของ dev ถูกต้อง: ทั้ง batch และ bulk ใส่ `cellsGuard` ไว้หน้าคำสั่งเขียนใน batch เดียวกัน ถ้าแถวเปลี่ยนจาก non-void เป็น void ระหว่างตัดสินกับเขียน batch จะ abort ก่อน แล้วอ่านใหม่ และ judge ตอบ `student_inactive` (test R-05 race ยืนยันผลนี้) เงื่อนไขใน SQL จึงเป็นชั้นสำรองที่ทำให้นิยามตรงกับ judge · ส่วนนี้ยืนยันในระดับ SQL ด้วย probe แล้ว (แถว void + เด็กไม่อยู่ใน roster + `hand_in = 0` ได้ 0 ส่วนแถว submitted/excused ได้ 1) · เสนอเพิ่มเติมได้ แต่ไม่บังคับ: ให้ dev เก็บ probe แบบนี้ไว้เป็น unit test ของ SQL
4. **R-02 ไม่กระทบเด็ก active**
   - เงื่อนไขอยู่หลังการตรวจห้องและก่อนการตรวจ "ส่งไปแล้ว" (`Scan.tsx:321`) เด็ก active ผ่านลงไปตามทางเดิม
   - unit test ยืนยันว่าเด็ก active ยังเข้าคิว 1 ครั้ง ส่วนเด็กที่ไม่ active ไม่เข้าคิว ได้เสียง error และไม่มีเสียงสำเร็จ
   - `status` มาจาก `mapStudent` (`worker/lib/rows.ts`) ซึ่งเป็นคอลัมน์ NOT NULL DEFAULT 'active' จึงไม่มีเด็กที่ไม่มีค่า status แล้วถูกปฏิเสธผิด
   - ทางอื่นในหน้าสแกนที่สร้าง op `submitted` (`submitTypedScore`) ต้องผ่าน `commitStudent` ก่อนเสมอ (ได้ `pending` มาจากที่นั่น) ส่วน `undo` (void) ไม่ถูกบล็อก ซึ่งถูกต้องตาม AC-09

### เสนอ (ต่ำ) — ใหม่ในรอบ 2

- R-06 ใน batch เดียวกัน `[void, grade]` ของเด็กที่ไม่อยู่ใน roster ยังผ่านทั้งคู่ · `worker/routes/submissions.ts:270-272` — judge ดูแถวจาก `w.existing` (สถานะก่อน batch) ไม่ใช่ `effective` และ upsert แบบ INSERT…SELECT อ่าน `s0` จากสถานะก่อนคำสั่ง (probe3 ยืนยัน)
  - ตัวอย่าง: เด็ก moved ในเทอมปัจจุบันมีแถว submitted (คะแนน 6) แล้วคิวส่ง void ตามด้วย grade 8 มาในคำขอเดียวกัน → ทั้งคู่ได้ ok → แถวเป็น submitted คะแนน 8 แต่ `submitted_at` เป็นเวลาใหม่ และ `late` คำนวณใหม่ (อาจกลายเป็นส่งช้า) เพราะ `before` ของ op ที่สองคือแถว void
  - ไม่ได้สร้างงานจากความว่างเปล่า (มีแถว submitted อยู่ก่อน batch) และต้องมี op สองตัวของคู่เดียวกันค้างในคิวพร้อมกัน (ยกเลิกในหน้าสแกน แล้วให้คะแนนในสมุดคะแนนที่เปิดค้างไว้) จึงเกิดได้ยาก
  - ถ้าจะปิด: ให้ judge ใช้ `effective` ในการตัดสินว่ามีแถวที่ไม่ใช่ void หรือไม่ (judge เข้มกว่า SQL ได้อย่างปลอดภัย เพราะกรณีที่ judge ปฏิเสธจะไม่ถูกส่งไปเขียน)

### หลักฐานรอบ 2 (อ่านอย่างเดียว)

| คำสั่ง | ผล |
|---|---|
| `git diff main -- worker/routes/submissions.ts src/pages/Scan.tsx test/unit/scan-controller.test.ts` + อ่าน test ใหม่ | ตรวจครบ |
| `npx vitest run` | 61 ไฟล์ / 693 tests PASS (ตอนที่รันไม่มี test ของ QA ล้ม) |
| `npx vitest run test/api/inactive-student.test.ts test/unit/scan-controller.test.ts test/api/volume.test.ts` | 3 ไฟล์ / 68 PASS |
| `npm run typecheck` | exit 0 |
| scratchpad `probe/probe2.mjs` | 640 กรณี ไม่ตรงกัน 0 · bulk ของงานปิดรับได้ 0 · bulk ปีก่อน: finished 1 / ออกก่อนจบเทอม 0 · plan ใช้ PK ทั้งหมด |
| scratchpad `probe/probe3.mjs` | batch `[void, grade]` ของเด็ก moved → แถวเป็น submitted คะแนน 8 และ `submitted_at` ใหม่ (R-06) |

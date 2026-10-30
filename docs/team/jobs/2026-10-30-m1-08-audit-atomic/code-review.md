# Code review: ประวัติการแก้ไข (audit) บันทึกพร้อมข้อมูลเสมอ และครอบคลุมขึ้น (M1-08)

โดย Code Reviewer · 2026-10-30 · ช่วง diff: `main (11a4d2b)..HEAD` + ที่ยังไม่ commit (ทั้งหมดอยู่ใน working tree) · รอบแก้ (Verify) 0/3 (ตัวนับเดียวกับ QA)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

ไฟล์ที่ตรวจ: `worker/lib/audit.ts`, `worker/routes/{assignments,auth,catalog,students,submissions}.ts`, `test/api/audit-atomic.test.ts` (ใหม่), `test/api/audit-concurrency.test.ts`, `test/unit/{excel-attendance,m1-05-verify1}.test.*` (เพิ่ม timeout ระดับ describe), `README.md`, `docs/OPERATIONS.md` · อ่านประกอบ: `worker/lib/guard.ts` (batchAtEpoch), `worker/lib/late.ts` (lateFixForCells), `worker/lib/rows.ts` (mapStudent), `migrations/0001_init.sql` (audit_logs ไม่มี FK), `src/components/AuditHistory.tsx`

## สรุป: ผ่าน

ต้องแก้ 0 ข้อ · ควรแก้ 1 ข้อ · เสนอ 6 ข้อ

ไม่ได้รันเทสต์ตามคำสั่ง PM (QA กำลังรัน) — ตรวจจากการอ่านโค้ดและหลักฐานของ Full-Stack (`evidence/before-fix.txt`, `volume-before-after.txt`)

### ผลตามประเด็นที่ PM ให้ตรวจ

1. **audit อยู่ใน batch เดียวกับการเขียน และเงื่อนไขตรงกัน** — ตรงตามตาราง dev-notes §1 ทุกจุด
   - students POST (`students.ts:118-123`): audit อยู่ใน `batchAtEpoch` เดียวกับ upsert + guard ทั้งหมด · guard ใดล้ม → audit ถูก rollback ด้วย · before ผ่าน `studentForAudit` (ตัด qr_token; `mapStudent` ไม่มี pin อยู่แล้ว) · after สร้างจากค่าที่ bind เข้า upsert (class: year ไม่ถูก update ตอน conflict และ after ใช้ `existing.year` — ตรงกัน)
   - ลบงาน (`assignments.ts:168-174`): audit วางก่อน UPDATE มีเงื่อนไข `EXISTS (... id = ?2 AND deleted_at IS NULL)` ตรงกับ WHERE ของ UPDATE เป๊ะ ทั้งสองคำสั่งอยู่ในธุรกรรมเดียวกัน จึงเห็นสถานะเดียวกัน → ลบซ้ำ = ไม่มี audit + 404 · `[, r]` ถูกต้อง เพราะ `batchAtEpoch` ตัดผลของ epoch guard ออกแล้ว (`guard.ts:45`)
   - PIN (`students.ts:402-408`): audit มีเงื่อนไข `EXISTS students id` ตรงกับ UPDATE (`WHERE id = ?`) · ไม่มีค่า PIN (มีเฉพาะ action `pin_set`/`pin_clear`)
   - setup (`auth.ts:79-87`): บัญชี + audit อยู่ใน batch เดียว audit มีเงื่อนไข `EXISTS teacher WHERE id = ?2` (tid ของคำขอนี้) → คำขอที่แพ้ race ไม่มี audit · **การเขียนเครื่องต่อท้ายแยก (`auth.ts:88`) ปลอดภัย**: (ก) ถ้าล้ม จะยังไม่ออก session/cookie (createSession อยู่หลังจากนั้น) ครูเข้าระบบใหม่ได้ เพราะ login ทำ upsert เครื่องเอง (`auth.ts:126`) (ข) `audit_logs.device_id` ไม่มี FK ไปที่ devices จึงไม่มีปัญหาลำดับ (ค) ทำงานเหมือนเดิมก่อนแก้ (เดิมก็แยก) (ง) คำขอที่แพ้ไม่สร้างเครื่อง (เทสต์ `devices id='loser'` = 0 ยังยืนยัน) — ดู R-03
   - signout / change-password (`auth.ts:168-174`, `191-198`): อยู่ใน batch เดียวกัน · action ใหม่ `device_signout`/`password_change` · ไม่มี hash/salt/token
   - catalog terms/classes/subjects/work-types: `catalogAudit` อยู่ใน batch เดียวกับ upsert และ abortIf ทุกตัว (term: abortIf เรื่อง current/year/คู่ซ้ำ ล้ม → audit rollback ด้วย) · settings: after เหลือเฉพาะคีย์ที่อนุญาต
   - QR rotate: เหลือ `after: { reissued: true }` ไม่มี token
2. **bulk / bulk-undo**
   - `auditLateSyncStmt` (`submissions.ts:172-179`) อยู่หลัง `lateFixForCells` ในธุรกรรมเดียวกัน (`:570-572`, `:686-688`) อ่าน late จากตาราง submissions ตอนนั้นจริง · ค้นด้วย op_id (UNIQUE) ที่สร้างใหม่ทุกครั้ง (`id("op")`) จึงไม่ไปแก้บรรทัดเก่า · บรรทัดที่ guard ไม่ให้ลง (ไม่มี op_id ในตาราง) จะไม่ถูกแตะ · `json(CASE ... 'true'/'false')` ให้ boolean ตรงชนิดกับ `mapSubmission.late` · เปรียบเทียบด้วย `IS NOT` จึงจัดการ NULL/คีย์ขาดได้ · เขียนเฉพาะบรรทัดที่ต่างกัน → rows written ของ bulk/undo เท่าเดิม (volume ยืนยัน)
   - undo ข้ามเฉพาะคีย์ `late` (`:635`) ส่วนคีย์อื่นยังเทียบครบ รวม `updated_at`, `status`, `score`, `submitted_at`, `method`, `device_id`, `scan_session_id` · `lateFixForCells` ไม่แตะ `updated_at` (`late.ts:37-47`) การเลื่อนกำหนดส่งจึงเปลี่ยนเฉพาะ late ขณะที่การแก้จริงทุกทางเปลี่ยน `updated_at` → ยังปฏิเสธ (มีเทสต์คะแนนและสถานะ) · ใน transaction ยังมี `cellsGuard` ที่รวม late จึงไม่มีช่องให้เขียนทับงานที่เปลี่ยนระหว่างอ่านกับเขียน · ค่า late ที่คืนกลับถูกคิดใหม่จากกำหนดส่งปัจจุบัน ไม่ได้ใช้ before.late ตรง ๆ
3. **audit-concurrency.test.ts** — ไม่ได้ลดสิ่งที่เทสต์พิสูจน์: action ของ start คือ `start_year`/`start_term` (`catalog.ts:233`) `LIKE 'start%'` จึงยังจับ start ที่ถูกปฏิเสธได้ครบ · การตัด `entity='term'` = 0 จำเป็น เพราะ create ของผู้ชนะมี audit แล้ว · เทสต์แก้ชื่อเพิ่ม assertion `update = 1` (แข็งขึ้น) · gate ของ setup ยังกั้น batch ที่มี INSERT teacher ได้ (ดู R-06 เรื่องคอมเมนต์)
4. **volume** — ทุกเส้นทางที่เพิ่ม audit เพิ่ม 1 statement และประมาณ 7 rows written (1 แถว + index 3 ตัว + autoincrement/อื่น ๆ) เป็นงานที่ครูทำด้วยมือ ความถี่ต่ำ · bulk/undo: +1 statement, rows read +145..161, rows written เท่าเดิม — สมเหตุสมผล
5. **regression จากการลบ `writeAudit`** — grep ใน `worker/` ไม่เหลือผู้เรียก · login/logout ไม่เคยมี audit (เดิมก็ไม่มี) · typecheck PASS (evidence ของ Full-Stack)
6. **ข้อความ error** — ไม่มีข้อความเดิมเปลี่ยน (`already_setup`, `modified_since`, term/class/code/number conflict ยังเหมือนเดิมทุกตัวอักษร)

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

- R-01 หน้าประวัติแสดง action/entity ใหม่เป็นภาษาอังกฤษดิบ · `src/components/AuditHistory.tsx:40`, `:82` — `describe()` ตกไปที่ `return r.action` และป้าย entity ใช้ `ENTITY_LABEL[r.entity] ?? r.entity` ครูจึงเห็น `pin_set`, `pin_clear`, `password_change`, `device_signout`, `class`/`subject`/`work_type`/`term` + `create`/`update` (หน้าประวัติของนักเรียนใน StudentDrawer ก็จะมีบรรทัด `pin_set` ด้วย) · ไม่ทำให้ข้อมูลผิดหรือหน้าพัง แต่ AC-02/AC-03 คือ "ดูประวัติ" ในแอปภาษาไทย · dev-notes ระบุไว้แล้ว — แก้ด้วยการเพิ่มป้ายภาษาไทยใน `ENTITY_LABEL` และ `describe()` หรือให้เจ้าของงานรับเป็น known issue/งานต่อ

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-02 signout เขียน audit แม้ไม่มี session ถูกลบ · `worker/routes/auth.ts:168-173` — `POST /api/devices/<id ที่ไม่มี>/signout` ได้บรรทัด `device_signout` ทั้งที่ไม่มีอะไรเปลี่ยน (เหมือนก่อนแก้) ไม่สอดคล้องกับหลัก "เขียนเฉพาะเมื่อเขียนจริง" ที่ใช้กับลบงาน/PIN · ถ้าต้องการ ให้วาง audit ก่อน DELETE พร้อม `only: EXISTS (SELECT 1 FROM sessions WHERE device_id = ?2)`
- R-03 setup: upsert เครื่องอยู่นอก batch · `worker/routes/auth.ts:88` — ปลอดภัยตามเหตุผลในข้อ 1 แต่ `upsertDeviceStmt` (`:25`) ถูกสร้างไว้แล้วกลับไม่ได้ใช้ใน batch · ถ้าต้องการ all-or-nothing ครบ ให้ใส่ในรูป `INSERT ... SELECT ... WHERE EXISTS (SELECT 1 FROM teacher WHERE id = ?)` ใน batch เดียวกัน (คำขอที่แพ้จะไม่สร้างเครื่อง) — ไม่จำเป็นในงานนี้
- R-04 ยกเลิก "ภาคเรียนปัจจุบัน" ของเทอมอื่นไม่มีบรรทัดประวัติ · `worker/routes/catalog.ts:110` — `UPDATE terms SET is_current = 0 WHERE id != ?` เปลี่ยนเทอมเดิมแต่ audit มีเฉพาะเทอม tid · ดูย้อนหลังได้ว่าเทอมใหม่ is_current=1 จึงอนุมานได้ ไม่เร่ง
- R-05 `before` และ create/update อ่านนอก transaction · `students.ts:71`, `catalog.ts:83`, `:267`, `:298`, `:326` — ถ้ามีเครื่องอื่นแก้แถวเดียวกันระหว่างอ่านกับเขียน before ในประวัติจะเป็นค่าก่อนหน้าหนึ่งรุ่น (ข้อมูลจริงไม่ผิด) · เป็นรูปแบบเดิมของโปรเจกต์ ความเสี่ยงต่ำสำหรับครูคนเดียว
- R-06 คอมเมนต์ gate ของ setup ไม่ตรงกับพฤติกรรม · `test/api/audit-concurrency.test.ts:17-29` — `bind` ไม่ห่อ (`wrap`) ผลลัพธ์แล้ว ทางที่ใช้ `.run()` จึงไม่ถูกกั้นอีก แม้คอมเมนต์บอกว่า "hold either" · ถ้าโค้ดถอยกลับไปใช้ `.run()` เทสต์จะค้างที่ `gate.ready` (timeout = ล้ม) ไม่ใช่ผ่านหลอก จึงไม่ลดสิ่งที่พิสูจน์ — แก้คอมเมนต์หรือให้ `bind` คืน `wrap(b)` พร้อม add เข้า set
- R-07 (รับทราบ — known issue ใน dev-notes §4) `POST /api/submissions/batch` ยังเก็บ `after.late` ก่อน lateFix · นอกขอบเขต AC-04 ใช้ `auditLateSyncStmt` ตัวเดียวกันได้เมื่อวัด volume ของเส้นทางนี้แล้ว · ข้อสังเกตเพิ่มเติม: undo ที่ชนกับการเลื่อนกำหนดส่ง "พอดีระหว่างอ่านกับเขียน" จะได้ 409 `modified_since` เพราะ `cellsGuard` (`submissions.ts:679`) รวม late — กดใหม่ก็สำเร็จ ยอมรับได้

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร — audit ใหม่ไม่มี PIN/hash/salt/session token/qr_token (ตรวจ students.ts:40-43, 360-365, 402-408; auth.ts:79-87, 168-198) · หมายเหตุ: setup audit ไม่เก็บอีเมล
- [x] ตรวจ input ฝั่ง server ทุกจุด — schema zod เดิมไม่เปลี่ยน · settings audit เก็บเฉพาะคีย์ที่อนุญาต (ปิดช่องเก็บข้อมูลขยะลงประวัติ)
- [x] ตรวจสิทธิ์ทุก endpoint — ไม่มี endpoint ใหม่ · route ที่แก้ยังอยู่หลัง requireAuth เหมือนเดิม (setup เป็นแบบไม่ล็อกอินตามเดิม คุมด้วย setupCode) · สิทธิ์ดู /api/audit เป็นของ Security Reviewer
- [x] ป้องกัน injection — SQL ใหม่ใช้ bind ทั้งหมด · `${stored}` ใน auditLateSyncStmt เป็นค่าคงที่ในโค้ด ไม่ใช่ input
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น — before/after ของนักเรียนมีชื่อ/รหัส (จำเป็นต่อประวัติ เหมือนเดิม) · ตัด qr_token แล้ว · audit ไม่อยู่ในไฟล์สำรอง (README/OPERATIONS ระบุแล้ว)
- [x] error ไม่เปิดเผยรายละเอียดภายใน — ไม่มีข้อความ error ใหม่
- [x] dependency ใหม่น่าเชื่อถือ — N/A ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 🗑 👤)

- [x] เงิน — N/A (ไม่มีเงินในงานนี้)
- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำ — ลบงานซ้ำไม่เพิ่มบรรทัด · setup ที่แพ้ไม่เพิ่มบรรทัด · audit ใช้ INSERT OR IGNORE + op_id ใหม่ · undo ซ้ำยังกันด้วย abortIf `restore` เดิม
- [x] การเขียนหลายตารางอยู่ใน transaction — ทุกจุดในตาราง dev-notes §1 · ข้อยกเว้นเดียวคือ upsert เครื่องตอน setup (R-03, ปลอดภัย)
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง — ลบงานเป็น soft delete เดิม · reset ลบ audit_logs ทั้งหมด (ตั้งใจ มีเอกสารแล้ว)
- [x] วันที่/timezone/พ.ศ. — ไม่เปลี่ยน · late ยังคิดจาก lateSql เดิมใน transaction

## หลักฐาน

| คำสั่ง (อ่านอย่างเดียว) | ผล |
|---|---|
| `git diff main --stat` / `git diff main -- worker test README.md docs/OPERATIONS.md` | 11 ไฟล์ +148/-75 ตรวจครบ |
| `grep -rn writeAudit worker src shared test` | ไม่เหลือผู้เรียก — PASS |
| อ่าน `migrations/0001_init.sql` audit_logs | ไม่มี FK device_id → ลำดับ setup ปลอดภัย — PASS |
| อ่าน `worker/lib/late.ts:37-47` | lateFixForCells ไม่แตะ updated_at → undo ที่ข้าม late ยังจับการแก้จริงได้ — PASS |
| `evidence/volume-before-after.txt` | rows written bulk/undo เท่าเดิม · เส้นทาง catalog/PIN +1 stmt, +7 rows written — PASS (ในงบ) |
| เทสต์ | NOT RUN — PM สั่งห้ามรัน (QA รันอยู่) |

หมายเหตุ: ไม่ได้บันทึกผ่าน `evidence.mjs add` เพราะ PM จำกัดให้เขียนได้เฉพาะไฟล์นี้

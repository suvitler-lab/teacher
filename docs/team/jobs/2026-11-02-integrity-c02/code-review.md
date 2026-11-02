# Code review: เพิ่มคะแนนเต็มแล้วถามปรับคนที่ได้เต็มเดิม (integrity-c02)

โดย Code Reviewer · 2026-11-02 · ช่วง diff: `2285c17..HEAD` (HEAD = 2285c17 ยังไม่มี commit ใหม่) + ที่ยังไม่ commit: `worker/routes/assignments.ts`, `src/components/AssignmentModal.tsx`, `docs/team/api-contract.md` + ไฟล์ใหม่ `test/api/c02-raise-full-score.test.ts`, `test/unit/assignment-modal-raise.test.tsx` · รอบแก้ (Verify) 0/3 (รอบตรวจแรก)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่านแบบมีเงื่อนไข

ต้องแก้ (สูง) 0 ข้อ · ควรแก้ (กลาง) 2 ข้อ (R-01, R-02) · เสนอ (ต่ำ) 5 ข้อ (R-03..R-07)

เงื่อนไข: R-01 และ R-02 แก้ หรือเจ้าของงานรับเป็น known issue (R-02 เป็นงานที่ plan T-02 กำหนดไว้แต่ยังไม่ได้ทำ) · ไม่ต้องตรวจทั้งหมดใหม่

ฝั่ง server ถูกต้องตามที่อ่านมา: ความอะตอมิก, เกณฑ์ "คนที่ได้เต็มเดิม", การเลือกช่องด้วย SQL ตอนเขียน, guard `raise_from`, keep/adjust, 409/422, audit 10 ฟิลด์ที่ EP-04 ย้อนได้ และกรณีลดคะแนนเต็มที่คงพฤติกรรมเดิม (รายละเอียดอยู่ในหัวข้อ "สิ่งที่ตรวจแล้วถูกต้อง") ทุกข้อที่พบอยู่ฝั่ง client/การวัดผล และไม่มีข้อไหนทำให้คะแนนในฐานข้อมูลผิด

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

### R-01 ปุ่ม "ย้อนกลับ" เรียก `onSaved` ของฟอร์มที่ปิดไปแล้ว — bug (UI) · `src/components/AssignmentModal.tsx:113` (ผลที่ `src/pages/Gradebook.tsx:705`)

- ปัญหา: toast ค้างอยู่ตลอด (sticky) และ z-index ของ toast (300) สูงกว่า modal-overlay (100) จึงกดได้ แม้มีฟอร์มอื่นเปิดอยู่ · action เรียก `onSaved(saved)` ซึ่ง Gradebook ส่งมาเป็น `() => { setEditAsg(null); load(true); }` จาก render ตอนที่ฟอร์มนี้ยังเปิด
- สถานการณ์ที่พัง:
  1. ครูปรับ a1 เป็น 20 → ขึ้น toast → ครูเปิด "แก้ไขงาน" ของ a5 แล้วพิมพ์ชื่อหรือวันใหม่ → กด "ย้อนกลับ" บน toast → `setEditAsg(null)` ปิดฟอร์ม a5 และ**ค่าที่พิมพ์ไว้หายโดยไม่ได้บันทึก**
  2. ครูปรับ a1 (อยู่ห้อง 1) → กดชิปห้อง 2 → กด "ย้อนกลับ" → `load(true)` ใน closure เก่ายังใช้ `classId` = ห้อง 1 และ `begin()` ทำให้รอบโหลดนี้เป็นรอบล่าสุด (`src/lib/loader.ts:11`) → ตารางกลายเป็นรายชื่อ/งาน/คะแนนของห้อง 1 แต่หัวหน้าและชิปยังบอกห้อง 2 (`Gradebook.tsx:443`) ค้างจนกว่าจะเปลี่ยนตัวกรอง · ข้อมูลใน DB ไม่ผิด (ช่องอ้างด้วย id) แต่ครูเห็นคะแนนผิดห้อง
  - ข้อ 2 เป็นรูปแบบเดียวกับ undo ของ "ล้างทั้งห้อง" เดิม (`Gradebook.tsx:266-268`) · ข้อ 1 เกิดใหม่จากงานนี้ เพราะ callback ที่เรียกคือ `onSaved` ของฟอร์มแก้ไข
- แนวทางแก้: ถ้าแก้ได้เฉพาะ `AssignmentModal.tsx` (D-integrity-c02-04) อย่าใช้ `onSaved` ตอนย้อนกลับ ให้ส่งสัญญาณกลางแทน เช่นยิง signal หรือ event "assignments changed" ใน store แล้วให้หน้าที่ mount อยู่โหลดใหม่ด้วยตัวกรองปัจจุบัน แต่ต้องมีผู้ฟังใน Gradebook ซึ่งต้องรอ C-01 merge · อีกทางคือเพิ่ม prop `onReload` ใน Gradebook ที่อ่าน `load` ล่าสุดผ่าน ref (ตามทางสำรองของ D-04 บรรทัด 704–706 หลัง C-01 merge) · อย่างน้อยที่สุดให้แยก callback ตอนย้อนกลับออกจาก `onSaved` เพื่อไม่ให้ไปปิดฟอร์มอื่น
- สถานะ: เปิด

### R-02 ยังไม่ได้วัดงบของการปรับ 200 ช่อง และมี 2 คำสั่งที่สแกน audit ทั้งงาน — performance · `worker/routes/assignments.ts:177-181`, `:225-232` · `test/api/volume.test.ts` (ไม่มีการเปลี่ยน)

- ปัญหา: plan T-02 กำหนดให้เพิ่มกรณี "เพิ่มเต็ม + ปรับ 200 ช่อง (5 ห้อง × 40)" ใน `volume.test.ts` (read ≤ 2,000 / written ≤ 1,000 / statements ≤ `MAX_QUERIES`) แต่ `git diff 2285c17 --stat -- test` ไม่มีการเปลี่ยน และ dev-notes/backend.md ก็ไม่ได้พูดถึง · `audit_logs` ไม่มี index บน `batch_id` (migrations/0001_init.sql:206-227) ทำให้ `adjust.after` (UPDATE … WHERE assignment_id AND batch_id) กับ `auditCount` (COUNT … WHERE assignment_id AND batch_id) ต้องอ่าน**ทุกแถว audit ของงานนั้น** ผ่าน `idx_audit_assignment` รวม 2 รอบ ยิ่งงานมีประวัติสแกน/แก้มากยิ่งแพง
- สถานการณ์ที่พัง: งานที่มี 200 ช่องและประวัติราว 1,000 แถว → แค่ 2 คำสั่งนี้ก็อ่านราว 2,000 แถว บวก INSERT…SELECT/UPDATE/lateFix/holders อีกราว 1,000 แถว ซึ่งอาจเกินงบที่ plan แนะนำ · rows written คาดราว 200 (submissions) + 200 (insert audit + 4 index + unique op_id) + 200 (update after_json) → เกินงบ "แก้งาน" เดิม (≤ 200) ตามที่ plan เตือนไว้ · ยังไม่มีตัวเลขจริง (NOT RUN)
- แนวทางแก้: (1) BE เพิ่มกรณีใน `volume.test.ts` ตาม plan แล้วรายงานตัวเลขจริง · (2) ลดการสแกนโดยไม่ต้องเพิ่ม migration: เลือกแถว audit ของ batch ด้วยช่วง `op_id` ที่ใช้ UNIQUE index ได้ (`op_id >= ?b || ':' AND op_id < ?b || ';'` เพราะ op_id = `<batchId>:<sid>`) ทั้งใน `adjust.after` และ `auditCount` · หรือให้ `auditCount` ของกรณี adjust ใช้ผลจาก `holdersNow`/COUNT บน submissions แทนการนับ audit
- สถานะ: เปิด

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-03 ถ้า `upsertAssignment` คืน false หลัง server ปรับสำเร็จ ปุ่มย้อนกลับจะหาย · `src/components/AssignmentModal.tsx:104-119` — server commit การปรับไปแล้ว แต่บรรทัด 104 throw ก่อนสร้าง toast ทำให้ batchId หาย ครูย้อนผ่าน UI ไม่ได้ และ `onSaved` ก็ไม่ถูกเรียก (สมุดไม่โหลดใหม่) · เกิดได้น้อย (ข้อมูลในเครื่องเปลี่ยนระหว่างบันทึก) · แก้โดยสร้าง toast ย้อนกลับจาก `res.raise` ก่อนตรวจ `upsertAssignment` หรือสร้างในทั้งสองทาง
- R-04 ข้อความ "อัปเดตแอป" ขึ้นผิดบริบทกับการเปิด/ปิดงานหรือซ่อนคะแนนที่ใช้ข้อมูลเก่า · `src/pages/Gradebook.tsx:291-296` + `worker/routes/assignments.ts:138-142` — `saveAsgPatch` ส่ง `full_score` จากรายการในเครื่อง ถ้าอีกเครื่องลดเต็มลง (เช่นตาม BR-09: ย้อนแล้วลด 20→10) แล้วเครื่องนี้กดปิดรับงาน server จะมองเป็นการเพิ่มเต็ม 10→20 ที่มีคนได้เต็ม และตอบ 409 "มี N คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง" ทั้งที่แอปเป็นรุ่นล่าสุดแล้ว · ปลอดภัยกว่าก่อนงานนี้ (เดิมจะคืนเต็มเป็น 20 แบบเงียบ) แต่ข้อความชี้ผิดทาง · Gradebook.tsx เป็นไฟล์ของ C-01 จึงควรเปิดงานตามแก้ (ไม่ส่ง `full_score` ใน patch หรือจับ `raise_choice_required` แล้วบอกให้โหลดใหม่)
- R-05 นับรวมช่องของห้องที่ถูกถอดออกในคำขอเดียวกัน · `worker/routes/assignments.ts:55` — `holdsFull` ไม่ได้จำกัดเฉพาะห้องใน `class_ids` ใหม่ ถ้าครูเพิ่มเต็มและเอาห้อง 2 ออกในการบันทึกครั้งเดียว ซ (ห้อง 2) ก็ยังถูกนับและถูกปรับ ทำให้ตัวเลขในกล่องมากกว่าจำนวนที่ครูเห็นในสมุด · BR-01 เขียนว่า "ทุกห้องที่มอบงาน" ซึ่งตีความได้สองแบบ ให้ SA ตัดสิน · ไม่ทำให้ข้อมูลเสีย (ย้อนได้)
- R-06 focus หลังปิดกล่องถามอาจไม่กลับไปที่ฟอร์ม (ไม่แน่ใจ) · `src/components/AssignmentModal.tsx:93`, `src/components/Dialog.tsx:16,51` — ตอนกล่องถาม mount ปุ่ม "บันทึกงาน" ยัง disabled อยู่ (`busy`) ในเบราว์เซอร์ที่ใช้ focus fixup `previous` อาจเป็น `body` พอปิดกล่อง focus จึงหลุดจากฟอร์ม (กด Tab แล้ว `contain` ดึงกลับมาได้) · jsdom ไม่จำลองพฤติกรรมนี้จึงยืนยันจากโค้ดไม่ได้ · ควรตรวจบนเบราว์เซอร์ใน T-04 · plan T-03 ขอ unit "ปิดกล่องคืน focus ให้ปุ่มบันทึก" และ "แตะนอกกล่อง" แต่ `test/unit/assignment-modal-raise.test.tsx` ยังไม่มีทั้งสองกรณี
- R-07 ช่องว่างของเทสต์ (ไม่ใช่บั๊กในโค้ด) — ไม่มีเทสต์ "ปรับ + แก้กำหนดส่งในคำขอเดียว แล้ว EP-04 ย้อนได้" (dev-notes ขอ QA ไว้แล้ว) · jsdom `test/unit/c02-*.test.tsx` ของ QA ยังไม่มี (test-plan.md:188 รอ PM สั่ง) · ส่วนกล่องถาม (overlay click, Tab วน) ยังพึ่งเบราว์เซอร์ TC-37..39

## สิ่งที่ตรวจแล้วถูกต้อง (หลักฐานจากการอ่านโค้ด + เทสต์)

- **ความอะตอมิก (BR-04)**: guard (epoch → ลดต่ำกว่าคะแนน → ห้องผิดปี → raise guard) → นับ holders → INSERT…SELECT audit ช่อง → UPDATE ช่อง → upsert งาน/ห้อง/lateFix → เติม `after` → audit งาน → `raise.count` ทั้งหมดอยู่ใน `batchAtEpoch` เดียว (`assignments.ts:234-252`) และ audit ช่องกับ audit งานใช้ `batchId` เดียวกัน · TC-07/08/09 ใช้ trigger บังคับให้ล้มกลางทางแล้วยืนยันว่าไม่มีอะไรลงเลย
- **เกณฑ์ BR-01**: `assignment_id = ?1 AND status='submitted' AND score = X` ไม่รวม excused/void และ NULL (NULL = X เป็น NULL) · ไม่ join ตารางนักเรียน จึงนับ moved/finished และทุก method · 9.5 ไม่นับ (TC-05) · late นับ
- **เลือกตอนเขียน (BR-05)**: audit และ UPDATE ใช้เงื่อนไขเดียวกันกับ `raise_from` ใน transaction เดียว ไม่มีรายชื่อจาก client · guard `FULL_NOW IS NOT raise_from` อยู่ก่อนทั้งสองคำสั่ง · TC-11/12 (ฌ สแกนเข้ามาระหว่างถาม ได้ 4) · TC-13/14/15 (เต็มถูกแก้เป็น 15 ได้ 409 `full_score_changed`) · TC-33/34 (กดซ้ำ/สองเครื่องพร้อมกัน ลงชุดเดียว)
- **ไม่มีทางเลือก (BR-10)**: ก่อนเขียนได้ 409 `raise_choice_required` และใน batch ก็มี guard ซ้ำ (TC-36) · ข้อความไทยตรง BR-10 ตัวต่อตัว (`:140`) · ไม่มีคนได้เต็ม/สร้างใหม่/เท่าเดิม → 200 (TC-17..20, 31)
- **ลดคะแนนเต็ม (BR-07)**: โค้ดเดิมไม่เปลี่ยน ลำดับใน catch ยังเป็น full_score_changed → score_over_full → class_year → raise ตาม EP-05 (TC-21, 22)
- **audit ↔ EP-04**: `SUBMISSION_JSON` ให้ 10 ฟิลด์ตรงกับ `mapSubmission` (`submissions.ts:23-36`) late เป็น JSON boolean, NULL เป็น null, score INTEGER · `after` เติมหลัง lateFix · EP-04 เทียบทุกฟิลด์ยกเว้น late จึงไม่ตอบ modified_since ผิด (TC-27/28/29) · audit งานเป็น action `update` ซึ่ง EP-04 ไม่อ่าน คะแนนเต็มจึงคงค่าใหม่ · op_id `<batchId>:<sid>` ไม่ซ้ำ
- **schema/สิทธิ์**: refine ให้ต้องมีครบคู่ (422, TC-35) · `requireAuth` ครอบ `/api/assignments` และ `/bulk-undo` (401, TC-32) · ระบบมีครูคนเดียว ไม่มีการแยกสิทธิ์ข้ามครู · SQL ที่ประกอบเป็นข้อความใช้ค่าคงที่เท่านั้น ค่าจากผู้ใช้ผ่าน bind ทั้งหมด · CSRF ใช้ `assertSameOrigin` เดิม
- **metrics (BR-03)**: ไม่แตะ `shared/metrics` · TC-24/25/26 ได้ 90%→78%/93% (ปรับ) และ 45%/60% (คงไว้) ตรงกับตัวอย่างใน requirements
- **client**: กล่องถามซ้อนด้วย `Dialog` เดิม (stack ทำให้ Esc ปิดเฉพาะกล่องบน) · คลิกที่ overlay ของกล่องบนไม่ทะลุไปปิดฟอร์ม (เช็ก `e.target === e.currentTarget` แยกกันทั้งสองชั้น) · `inFlight` ref + `busy` กันกดซ้ำ · ยกเลิกหรือ error ไม่ล้าง state ของฟอร์ม · ตัวเลขในกล่องมาจาก server · ข้อความตรงกับ BR-08/D-06 · ปุ่มยกเลิก → คงไว้ → ปรับ (`primary`) · ปุ่มบนจอสัมผัสสูง ≥ 44px ตาม `base.css:170-172` (รวมปุ่มใน toast) · ไม่มีสไตล์ใหม่นอกจาก inline แบบ BulkConfirm
- **ขอบเขต (C-01)**: diff มีแค่ `assignments.ts`, `AssignmentModal.tsx`, `api-contract.md` (+ไฟล์เทสต์ใหม่ 2 ไฟล์) · ไม่แตะ `submissions.ts`, `outbox.ts`, `Scan.tsx`, `Gradebook.tsx`, `Overlays.tsx`, `shared/`, migrations, package*.json · AC-07 `full_score_changed` ของ op ค้างคิวยังทำงานเหมือนเดิม (TC-16)
- **เทสต์เดิม**: `git diff 2285c17 --stat -- test` ว่าง ไม่มีเทสต์เดิมถูกแก้หรือลดความเข้ม (ตรงกับ dev-notes)

## หลักฐาน (คำสั่งที่รัน)

| คำสั่ง | ผล |
|---|---|
| `npx vitest run test/api/c02-raise-full-score.test.ts test/unit/assignment-modal-raise.test.tsx` | PASS — 2 files, 47 tests passed |
| `git diff 2285c17 --stat -- test` | ไม่มีการเปลี่ยน (ไม่ได้แก้เทสต์เดิม) |
| `git diff 2285c17 --stat -- migrations package.json package-lock.json shared worker/routes/submissions.ts src/lib/outbox.ts src/pages` | ว่าง (ไม่มี migration/dependency และไม่ทับไฟล์ของ C-01) |
| ชุดเต็ม `npm test` | ไม่ได้รันซ้ำ — อ้างอิง `evidence/t02-full-suite.txt` ของ BE (92 files / 1123 tests) |
| volume 200 ช่อง | NOT RUN — ยังไม่มีเทสต์ (R-02) |
| `evidence.mjs add` | ไม่ได้บันทึก — ไม่มี kind สำหรับ code reviewer · ผลอยู่ในตารางนี้ |

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร
- [x] ตรวจ input ฝั่ง server ทุกจุด (zod + refine คู่ `raise_choice`/`raise_from`; ค่าที่ไม่ตรงถูกตรวจด้วย guard ใน DB)
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล (`requireAuth` บน `/api/assignments*`; ระบบครูคนเดียว)
- [x] ป้องกัน injection (SQL ประกอบจากค่าคงที่; ค่าผู้ใช้ผ่าน bind), XSS (Preact escape; ชื่องานแสดงเป็นข้อความ), CSRF (`assertSameOrigin` เดิม)
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น (audit เก็บ student_id/คะแนนแบบเดียวกับ bulk เดิม)
- [x] error ไม่เปิดเผยรายละเอียดภายใน (batch ล้มด้วยเหตุอื่นโยนเป็น 5xx ผ่าน handler เดิม)
- [x] dependency ใหม่น่าเชื่อถือ — ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] เงิน/คะแนน: ไม่มีการคำนวณ float ใหม่ score เป็นจำนวนเต็ม (เต็ม 1–100) เทียบแบบตรงตัว · ร้อยละใช้ `shared/metrics` เดิม ผลตรงตัวอย่าง BR-03
- [x] ไม่นับซ้ำ/บันทึกซ้ำ: กดซ้ำได้ 409 full_score_changed (TC-33) · สองเครื่องลงชุดเดียว (TC-34) · ย้อนซ้ำได้ alreadyUndone (TC-29) · client มี `inFlight`
- [x] การเขียนหลายตารางอยู่ใน transaction เดียว (`batchAtEpoch`) (TC-07..09)
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง — ไม่มีการลบ · ย้อนกลับผ่าน EP-04 เดิม · 🗑 dry-run/restore = N/A ที่ PM รับใน Gate 1 (ไม่มี migration)
- [x] วันที่/timezone/พ.ศ.: ไม่เปลี่ยน `submitted_at` · `late` ตัดสินใหม่ด้วย `lateFixForAssignment` เดิม · updated_at/event_at = เวลา server
- [ ] งบ rows read/written ของการปรับ 200 ช่อง — ยังไม่ได้วัด (R-02)

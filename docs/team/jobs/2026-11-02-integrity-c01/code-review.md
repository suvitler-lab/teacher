# Code review: คะแนนไม่ถูกเขียนทับเมื่อสแกนช่องที่ส่งแล้ว (integrity-c01)

โดย Code Reviewer · 2026-11-02 · ช่วง diff: `main(18759a2)..working tree` (ยังไม่ commit: worker/routes/submissions.ts, shared/types.ts, src/lib/outbox.ts, src/pages/Gradebook.tsx, src/pages/Scan.tsx, src/components/Overlays.tsx, test/api/server-intent.test.ts, test/api/volume.test.ts + ไฟล์ใหม่ test/api/c01-no-overwrite.test.ts, test/unit/c01-*.test.ts) · รอบแก้ (Verify) 0/3 (รอบตรวจแรก)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่านแบบมีเงื่อนไข

ต้องแก้ (สูง) 0 ข้อ · ควรแก้ (กลาง) 2 ข้อ (R-01, R-02) · เสนอ (ต่ำ) 5 ข้อ (R-03..R-07)

ฝั่ง server ถูกต้องตาม BR-01..BR-08: ไม่พบเส้นทางที่การสแกนเขียนทับช่องที่ส่งแล้ว ไม่พบ write/audit เมื่อ `already_submitted` และลำดับการตัดสินตรง BR-06 · ไม่มีปัญหาข้อมูลผิดหรือความปลอดภัยระดับสูง · ข้อกลางทั้งสองข้ออยู่ฝั่งจอ/เทสต์: R-01 การ์ดและเสียงขึ้นตอนไม่ได้อยู่หน้าสแกน (ขัด Gate 1 Q2 / D-integrity-c01-06) และ R-02 ไม่มีเทสต์ `[void, รับงาน]` ในคำขอเดียว ซึ่ง D-integrity-c01-02 ใช้เป็นเหตุผลหลัก

หลักฐานที่รันเอง:
- `npx vitest run test/api/c01-no-overwrite.test.ts test/api/server-intent.test.ts test/api/volume.test.ts test/unit/c01-outbox-already-submitted.test.ts test/unit/c01-scan-already-submitted.test.ts` → 5 files, 68/68 PASS
- `npm run typecheck` → PASS (exit 0)
- ชุดเต็ม: อ้างจาก `evidence/t02-after-fix-full.txt` (89 files / 1071 PASS) ไม่ได้รันซ้ำ
- `evidence.mjs kinds` ไม่มีชนิดสำหรับ Code Reviewer จึงไม่ได้ `evidence.mjs add` (ผลบันทึกไว้ในไฟล์นี้)

## ต้องแก้ก่อนปล่อย

(ไม่มี)

## ควรแก้ (กลาง: ค้างหลังรอบ 3 ได้ถ้าเจ้าของงานรับเป็น known issue)

### R-01 การ์ด/เสียง "ส่งไปแล้ว" ขึ้นทั้งที่ยังไม่เคยเปิดหน้าสแกนในรอบเปิดแอปนี้ · bug (UX, ขัด Gate 1 Q2) · `src/pages/Scan.tsx:412`

- ปัญหา: `let scanViewLeft = false` เป็นค่าตั้งต้นระดับ module · `Scan.tsx` ถูก import ทันทีตอนเปิดแอป (`src/app.tsx:15`) จึงลงทะเบียน `onResult` ไว้ตั้งแต่ต้น · `session` ถูกคืนค่าจาก `kvGet("scanSession")` ตอนโหลด module (`Scan.tsx:128-130`) · `startOutbox()` ส่งคิวทันทีที่เปิดแอป (`app.tsx:62/74`) · ค่าจะเป็น `true` ได้ก็ต่อเมื่อ `ScanView` mount แล้ว unmount (`Scan.tsx:629`) → ถ้ายังไม่เคยเปิดหน้าสแกนเลยตั้งแต่เปิดแอป เงื่อนไข `scanViewLeft` ที่ `Scan.tsx:425` จะไม่กันอะไรเลย
- สถานการณ์ที่พัง: iPad ออฟไลน์ ครูสแกน ก ในรอบ R2 (ข้อมูลเก่า ในระบบ ก = 7) แล้วปิดแอป → เปิดแอปใหม่ที่หน้าแรก/สมุดคะแนน และเน็ตกลับมา → outbox ส่ง op → server ตอบ `already_submitted` → `beep.dup()` + `vibrate(60)` ดังขึ้นที่หน้าอื่น และ `feedback` ถูกตั้งค่าไว้ → เปิดหน้าสแกนภายหลังจะเห็นการ์ด "ส่งไปแล้ว — ไม่บันทึกซ้ำ" ค้างอยู่ (ไม่มีการล้าง `feedback` ตอน mount; ล้างเฉพาะใน `startSession` ที่ `:473`) ซึ่งขัดคำตอบ Q2 "เอาออกจากคิวเงียบๆ แจ้งเฉพาะถ้าหน้าสแกนเปิดอยู่" และขัด D-integrity-c01-06 · ข้อมูลไม่ผิด (แคช `subsBox` ยังอัปเดตถูก)
- แนวทางแก้: ให้ค่าตั้งต้นเป็น `let scanViewLeft = true;` (หน้าสแกนยังไม่ได้อยู่บนจอจนกว่า `ScanView` จะ mount) · เพิ่ม unit test ที่ plan T-04 กำหนดไว้แต่ยังไม่มี: (ก) ไม่ mount `ScanView` แล้ว emit `already_submitted` → ไม่มี `beep.dup`/การ์ด แต่ `subsBox` อัปเดต (ข) mount แล้ว unmount แล้ว emit → ผลเดียวกัน
- สถานะ: เปิด · เจ้าของไฟล์: Front-End (T-04)

### R-02 ไม่มีเทสต์ `[void, รับงาน]` ของช่องเดียวกันในคำขอเดียวบนช่องที่ส่งแล้ว · test gap (data) · `test/api/c01-no-overwrite.test.ts:289-310`

- ปัญหา: plan T-01 กำหนดให้มี "AC-07 … + `[void, รับงาน]` คำขอเดียวบนช่อง submitted = ok, ok" และ D-integrity-c01-02 ใช้กรณีนี้เป็นเหตุผลที่ไม่แตะ `stillValid` · ค้นใน `test/api` แล้วไม่พบเทสต์นี้ (มีแค่ void กับรับงานแยกคำขอ ที่ `:295` และ `[void, grade]` ใน `qa-m1-06`/`server-intent`)
- สถานการณ์ที่พัง (ถ้าภายหลังมีคนย้ายการกันไปไว้ใน SQL หรือแก้ `effective`): ครูแตะยกเลิก ก บนผังเลขที่ตอนออฟไลน์แล้วสแกน ก ใหม่ → คิวส่ง `[void, hid 10]` ในคำขอเดียว → op ที่สองถูกตัดสินกับช่อง submitted เดิมแทนแถว void → ได้ `already_submitted` และช่องค้างเป็น void (งานที่ส่งจริงหาย) โดยเทสต์ทั้งชุดยังผ่าน · โค้ดปัจจุบันถูกต้องแล้ว: `effective` ถูกตั้งเป็นแถว void ที่ `submissions.ts:443` ก่อน `alreadySubmitted` ที่ `:400` แต่ยังไม่มีอะไรกันไม่ให้ถอยหลัง
- แนวทางแก้: เพิ่มเทสต์: ก = submitted 7 (grid) → คำขอเดียว `[R1 void manual t+1, R1 hid 10 t+2]` → `["ok","ok"]` · ช่อง = submitted 10, `submitted_at` = เวลาของ hid · audit 2 แถว (void, update) · ใครเพิ่มเทสต์ให้ PM ตัดสินตามเจ้าของไฟล์ (QA เขียนไฟล์นี้)
- สถานะ: เปิด

## เสนอ (ต่ำ: เจ้าของงานเลือกได้)

- **R-03 การเอารายการล่าสุดออกและการปิดแป้นถูกกันไว้หลัง `scanViewLeft`** · `src/pages/Scan.tsx:425-427` — ถ้าคำตอบมาถึงตอนครูอยู่หน้าอื่นในรอบเดียวกัน แถว "10/10" ของ op นั้นจะค้างใน `recent` (นับรวมใน "รอบนี้ N คน" ที่ `:806`) และถ้า `pending === ก` แป้นของ ก จะยังเปิดเมื่อกลับเข้าหน้า ครูพิมพ์คะแนนก็จะได้ `already_submitted` อีกครั้ง (ข้อมูลไม่ผิด) · ทางแก้: ย้าย 2 บรรทัด `recent`/`pending` ขึ้นไปก่อนเงื่อนไข `scanViewLeft` และกันเฉพาะการ์ด/เสียง (ยังต้องเช็กว่า `s.assignmentId === op.assignmentId`)
- **R-04 ใช้ `before.op_id != null` แยก "แถว pending" กับ "ค่าใน DB" และตามด้วย `find(...)!`** · `worker/routes/submissions.ts:404-406` — ตอนนี้ถูก เพราะตาราง `submissions` ไม่มีคอลัมน์ `op_id` (migrations 0001–0007) แต่ถ้าวันหน้า migration เพิ่ม `op_id` ให้ `submissions` ทุกแถวที่อ่านจาก `SELECT sub.*` จะมี `op_id` แล้ว `find` จะได้ `undefined` → TypeError → 500 ทุกครั้งที่สแกนช่องที่ส่งแล้ว · ทางแก้: `const wrote = pending.find((p) => p.row === before); if (wrote) onPending.push(...)` (ไม่ต้องพึ่ง op_id)
- **R-05 แอปรุ่นเก่า: `already_submitted` กั้น op ถัดไปของช่องเดียวกันบนเครื่องนั้นด้วย** · outbox ของ main (`NON_BLOCKING` = superseded, epoch_changed เท่านั้น) — Q3 ที่เจ้าของงานตอบพูดถึงแค่ "แสดงใน ส่งไม่สำเร็จ" · ผลจริงในแอปเก่า: (1) การ์ดหน้าสแกนขึ้นข้อความดิบ `already_submitted — ยังไม่ได้บันทึกบนระบบ` + เสียง error เพราะ `REJECTED` ของรุ่นเก่าไม่มีคีย์นี้ (2) คะแนนที่ครูแก้ในสมุดคะแนน**บนเครื่องเดียวกัน**หลังจากนั้นถูกพักเป็น `blocked_by_earlier_failure` จนกว่าครูจะกด "ส่งใหม่" (ส่งใหม่ได้ผล เพราะรายการในสายเดียวกันออกไปในคำขอเดียว grid ได้ `ok`) ถ้าครูกด "ทิ้ง" ทั้งหมด คะแนนนั้นจะหาย · ไม่ต้องแก้โค้ด: ให้ PM เขียนลงบันทึกการปล่อย/คำแนะนำ "กดอัปเดตแอปทุกเครื่องก่อนใช้งาน" และแจ้งเจ้าของงานเรื่องข้อ (2)
- **R-06 การ์ดของ ก ทับขณะแป้นของ ข เปิดอยู่** · `src/pages/Scan.tsx:434` — โหมดทีละคน: สแกน ก (ข้อมูลเก่า) → สแกน ข → แป้นของ ข เปิด → คำตอบของ ก มาถึง → การ์ด warning ของ ก แสดง (ไม่มี `awaitScore` จึงไม่ถูกซ่อนที่ `:783`) พร้อมแป้นของ ข · หัวแป้นแสดงชื่อ ข (`:954`) ความเสี่ยงพิมพ์ผิดคนจึงต่ำ · เสนอให้ QA ดูบน iPad ว่าชัดพอไหม (ไม่ต้องแก้ถ้าชัด)
- **R-07 `already_submitted` ตัดสินจากช่องที่อ่านมา ไม่อยู่ใน `cellsGuard`** · `worker/routes/submissions.ts:400` + `:465` — ช่องที่ได้ `already_submitted` ไม่มี snapshot · ลำดับนี้ทำให้การสแกนหาย: ก = 7 (09:00) · เครื่อง B ออฟไลน์กดยกเลิก ก ตอน 09:01 · เครื่อง A สแกน ก ตอน 09:05 ถึง server ก่อน → `already_submitted` (ไม่เขียน) · void ของ B ถึงทีหลัง (09:01 > 09:00) → ช่องเป็น void ทั้งที่มีการสแกนตอน 09:05 (ก่อนแก้: สแกนชนะ void แล้วตอบ superseded) · เป็นไปตาม BR-01 ("ตัดสินกับค่าในฐานข้อมูลตอนเขียน") และ dev-notes บันทึกความเสี่ยงไว้แล้ว · เสนอให้ระบุเป็น known limitation ใน report

## คำตอบตามโฟกัสที่ PM สั่ง

1. **`alreadySubmitted` (server)**: ถูกต้อง
   - ลำดับ: duplicate (`:369`) → epoch (`:379`) → `judge` (`:383`) → superseded (`:394`) → already_submitted (`:400`) → เขียน · ตรง BR-06 และ AC-08
   - BR-02: ใช้ครบ 3 ข้อ (ช่องมาจากรับงาน + `scan_session_id` เดียวกัน, ช่อง score null, op มี score) · ไล่ดูแล้วไม่มีเส้นทางที่ op รอบเดียวกันเข้าข้อยกเว้นผิด ๆ: โหมดเต็ม ช่องมีคะแนนเสมอ · โหมดทีหลัง op ไม่มีคะแนน · grid/bulk ทำให้ข้อ (1) ไม่จริง · ช่องที่ bulk-undo คืนค่าเป็น `method: "manual"` (`:700`) ยังคง `scan_session_id` เดิม จึงตรงกับสภาพก่อน bulk
   - ฉ6 สองเครื่องคนละรอบ: `scan_session_id` ไม่ตรง → `already_submitted` (เทสต์ `:94` ผ่าน)
   - เส้นทาง lost/`judgeUnwritten`: op ที่ตอบไว้แล้วโดยอิงแถว pending ที่ไม่ลง ถูกตัดสินใหม่กับ `fresh.world` · กรณี epoch เปลี่ยนตอบ `epoch_changed` ทั้ง pending และ onPending (`:476`, `:505`) · เทสต์ gateBatch ใน server-intent ครอบไว้
   - แข่งกับ `cellsGuard`: ช่องที่จะเขียนมี snapshot 9 ฟิลด์ → abort แล้วตัดสินใหม่ (AC-11 แบบ gated ผ่าน) · ฝั่งที่ไม่เขียนดู R-07
   - ไม่มี write/audit: `continue` ก่อน `pending.push`/`audits.push` และไม่แตะ `effective` · opId ซ้ำ: ไม่มี audit จึงตัดสินใหม่ได้ผลเดิม (AC-10)
   - void/excused (C-06): `isReceive` ไม่นับ void/excused · ช่อง excused ไม่ใช่ submitted จึงรับงานได้เหมือนเดิม (AC-07(3))
   - grid/bulk/bulk-undo/void ไม่ถูกบล็อก: grid ไม่ใช่ receive · `/bulk` และ `/bulk-undo` ไม่ถูกแตะ
2. **เส้นทางเขียนอื่นที่อาจทับช่องที่ส่งแล้ว** (grep ทุก `INSERT/UPDATE submissions` ใน worker): มีแค่ `submissionUpsertStmt` (batch/bulk/bulk-undo), `late.ts` (แตะเฉพาะ `late`), restore (`backup.ts` แทนทั้งชุดโดยตั้งใจ) และ reset
   - `/bulk all-submitted` ข้ามช่อง submitted/excused (`:582`) ปลอดภัย
   - `/bulk full-score` ทับคะแนนที่ให้แล้ว (เช่น 7 → 10) ของทุกช่อง submitted (`:589-591`) เป็นคำสั่งตั้งใจ ใช้ค่าปัจจุบันใน server มี `cellsGuard` และย้อนกลับได้ ไม่ใช่ปัญหาข้อมูลเก่า (ข้อความยืนยันที่ `Gradebook.tsx:713` ไม่ได้บอกว่าจะทับคะแนนที่ให้ไว้แล้ว: นอกขอบเขต ถ้าจะทำให้เปิดงานแยก)
   - `/bulk-undo` เทียบทุกฟิลด์ก่อนคืนค่า (`:686-690`)
   - grid จากสมุดคะแนนเป็นการแก้โดยตั้งใจ ตัดสิน last-write-wins ด้วย `event_at`
   - void จากผังเลขที่บนจอที่ข้อมูลเก่า ≤ 60 วิ ลบคะแนนที่ให้จากเครื่องอื่นได้ (เป็นคำสั่งตั้งใจ ตาม BR-03 มี audit)
   - เปลี่ยนคะแนนเต็ม: ลดต่ำกว่าคะแนนที่มีถูกกันไว้ (`assignments.ts:72-75`) ส่วนเพิ่มเป็นงาน C-02
   - outbox replay: opId กันซ้ำและได้ `already_submitted` แล้ว
   - **ไม่พบเส้นทางที่ทับช่องที่ส่งแล้วแบบเงียบ ๆ เหลืออยู่**
3. **client**
   - outbox: `already_submitted` ถูกเอาออกเหมือน ok และ `emit` แล้ว · `NON_BLOCKING`/`failedPairKeys` จัดการรายการที่แอปเก่าพักไว้ถูก · `retryFailed` ของรายการเก่าได้ `already_submitted` แล้วหายไป
   - Gradebook รับค่าจาก server ตามลำดับ emit: ถ้ามี grid ของช่องเดียวกันในคำขอเดียวกัน ok มาทีหลังและชนะ · listener ถูกถอดตอน unmount
   - Scan: dedupe 3 วินาทีต่อคน (Map ล้างตอน `startSession` ไม่โตเกินจำนวนเด็ก) · ใช้ opId ใน recent · ปิดแป้นเฉพาะเมื่อ `pending === op.studentId` (ไม่ปิดแป้นของคนอื่น) · โหมดทีละคน R1 ไม่กระทบ (เทสต์ AC-04 และ R-01 ผ่าน) · ออฟไลน์: แคชอัปเดตเมื่อคำตอบมา · ปัญหา: R-01 และ R-03 · listener ระดับ module ลงครั้งเดียว ไม่ค้างเพิ่ม
4. **เทสต์เดิมที่ถูกแก้**
   - `server-intent` R-01: ใส่ `score: 8` ให้ op manual ตาม D-integrity-c01-04 ที่ PM ยืนยัน และ**เพิ่ม** assert ช่อง st2 = submitted 8 manual · เข้มขึ้น ไม่ได้ลด · เพิ่ม 3 เทสต์ใหม่ (onPending ลง/ไม่ลง, grid ตามหลังรับงาน)
   - `volume.test.ts`: ลบแถว a1 ของห้อง 1–3 ก่อนวัด ไม่แตะ assertion/งบ rows ที่วัด · ถ้าไม่ลบ op ทั้งหมดจะได้ `already_submitted` และไม่ได้วัดการเขียนเลย · เปลี่ยนจาก "สแกนทับ" เป็น "สแกนครั้งแรก" ซึ่งตรงการใช้งานจริงกว่า · ถูกวิธี
5. **หน้าตา/ข้อความ (D29) และ migration**: ไม่มี CSS/คอมโพเนนต์ใหม่ · ข้อความที่เพิ่มมีอย่างเดียวคือ `Overlays.tsx` `already_submitted: "ส่งไปแล้ว — ไม่บันทึกซ้ำ"` ซึ่งเป็นข้อความเดิมของหน้าสแกน และแสดงเฉพาะรายการที่แอปเก่าพักไว้ · ไม่มีไฟล์ใน `migrations/` เปลี่ยน · request schema (`opSchema`) ไม่เปลี่ยน

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร (diff ไม่มี key/token)
- [x] ตรวจ input ฝั่ง server ทุกจุด (`opSchema`/`batchSchema` เดิม ไม่เปลี่ยน)
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล (`requireAuth` บน `/api/submissions/*` เดิม · ระบบครูคนเดียว)
- [x] ป้องกัน injection (SQL/NoSQL/command), XSS, CSRF (ไม่มี SQL ใหม่ · ข้อความแสดงผลผ่าน JSX)
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น (คำตอบ `submission` เป็นแถวของช่องที่ผู้เรียกส่งมาเอง)
- [x] error ไม่เปิดเผยรายละเอียดภายใน (ไม่มี error ใหม่ · R-04 เป็นความเสี่ยงในอนาคต)
- [x] dependency ใหม่น่าเชื่อถือ (ไม่มี dependency ใหม่)

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] เงิน/คะแนน: ไม่มีการคำนวณใหม่ · คะแนนสะสม BR-04 คงที่ 15/20 (เทสต์ `c01-no-overwrite:140-175` ผ่าน)
- [x] ไม่นับซ้ำ/ไม่บันทึกซ้ำเมื่อกดหรือ sync ซ้ำ (opId + `already_submitted` ไม่มี audit, AC-10 · ไม่มี audit/แถวเมื่อไม่เขียน)
- [x] การเขียนหลายตารางอยู่ใน transaction (`DB.batch` เดิม: guard + audit + upsert + lateFix)
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง (งานนี้ไม่มีการลบ · ไม่มี migration · N/A dry-run/restore ตาม brief)
- [x] วันที่/timezone/พ.ศ. ถูกต้อง (ไม่แตะ `submitted_at`/`late` ของช่องที่ส่งแล้ว · lateFix เฉพาะแถวที่เขียน)
- [ ] 🔄 offline→online / สองอุปกรณ์: ข้อมูลถูก (AC-09/AC-11) · ฝั่งจอติด R-01 · ขอบ R-07
- [ ] reconciliation/เทสต์ที่รันซ้ำได้: ครบ ยกเว้น R-02 (`[void, รับงาน]` คำขอเดียว)

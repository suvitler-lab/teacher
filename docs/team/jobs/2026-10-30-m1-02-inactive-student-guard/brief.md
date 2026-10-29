# Brief: ไม่รับงานใหม่ของนักเรียนที่ย้ายออก/ไม่ใช้งาน/จบปี

- งาน: `2026-10-30-m1-02-inactive-student-guard` · branch: `team/2026-10-30-m1-02-inactive-student-guard` (แตกจาก `main` @ `0020a93`) · เริ่ม: 2026-10-30
- สถานะ: ปิดแล้ว (2026-10-30 — quality-gate PASS, trace-check close PASS, 61 ไฟล์/693 tests)
- ขนาด: S · ธง: 💰 🔄
- เจ้าของงาน (Product Owner): ผู้ใช้ · โปรแกรม: 2026-10-program (M1-02, epic E-01)

## โจทย์ (คำของเจ้าของงาน)

> ความถูกต้องของข้อมูลการลงคะแนนของนักเรียน (29 ต.ค.)
> D15 (30 ต.ค.): "ห้ามสแกนรับงานใหม่ แต่แก้คะแนนเดิมในสมุดได้"

บั๊กที่ยืนยันจากโค้ด: `POST /api/submissions/batch` อ่านนักเรียนแค่ `id, class_id` (`worker/routes/submissions.ts:205-206`) และ `judge()` (`:232-246`) กับ `stillValid()` (`:98-108`) ไม่ดู `students.status` → เด็ก status `moved`/`inactive`/`finished` ที่ `class_id` ยังตรงกับงาน ยังถูกรับงาน/ให้คะแนนได้ (ฝั่งเช็คชื่อตรวจ status แล้วที่ `attendance.ts:188,294`) · precheck production 30 ต.ค.: ยังไม่มีแถวแบบนี้ (0) จึงไม่ต้องแก้ข้อมูลย้อนหลัง

## เป้าหมาย / ถือว่าสำเร็จเมื่อ

- server ปฏิเสธการ "รับงาน" (intent receive) ของเด็กที่ status ≠ active ด้วยผลใหม่ `student_inactive` ทั้งตอนตัดสิน (judge) และในธุรกรรม (stillValid)
- การแก้คะแนนในสมุดคะแนน (intent grade) ของเด็กที่ status ≠ active ทำได้ **เฉพาะแถวที่มีอยู่แล้ว** (แก้คะแนนเดิม) — ถ้ายังไม่มีแถว ให้ปฏิเสธ `student_inactive`
- ฝั่ง client แสดงเหตุผลภาษาไทย และ outbox ถือเป็นความล้มเหลวถาวร (ไม่ retry) ไปอยู่ "ส่งไม่สำเร็จ"
- bulk (`/api/assignments/:id/bulk`) ไม่แตะเด็กที่ status ≠ active (ยืนยันด้วย test — roster ใช้ `memberClause` อยู่แล้ว ถ้าพบว่าแตะ ให้แก้)

## AC

| AC | สถานะเริ่มต้น (Given) | เมื่อ (When) | ผลที่ต้องได้ (Then) | BR | ระดับ |
|---|---|---|---|---|---|
| AC-01 | เด็ก st1 อยู่ห้องของงาน a1 แต่ status = `moved` (ทดสอบซ้ำกับ `inactive` และ `finished`) ยังไม่มีแถว submission | ส่ง op `submitted` method `hid`/`camera`/`manual` (intent receive) | ผล `student_inactive` · ไม่มีแถว submission · ไม่มี audit ว่าเขียน | BR-02 | ต้องมี |
| AC-02 | เด็ก st1 status `moved` มีแถว submitted คะแนน 6 อยู่แล้ว (ก่อนย้าย) | ส่ง op จากสมุดคะแนน method `grid` intent `grade` คะแนน 8 | ผล `ok` · คะแนนเป็น 8 · เวลาส่ง/late เดิมคงอยู่ | BR-02 | ต้องมี |
| AC-03 | เด็ก st1 status `moved` ไม่มีแถว | ส่ง op `grid`/`grade` คะแนน 8 | ผล `student_inactive` · ไม่มีแถวใหม่ | BR-02 | ต้องมี |
| AC-04 | เด็ก st1 active ตอนตัดสิน แต่ถูกเปลี่ยนเป็น `moved` ก่อน D1 batch เขียน (race) | ส่ง op receive | ไม่มีแถวและไม่มี audit (stillValid กันในธุรกรรม) · ผลตอบกลับไม่ใช่ `ok` (`student_inactive`) | BR-02 | ต้องมี |
| AC-05 | ห้องมีเด็ก active 3 คน + moved 1 คน | bulk `all-submitted` / `full-score` / `clear` | เด็ก moved ไม่ถูกแตะ | BR-02 | ต้องมี |
| AC-06 | client ได้ผล `student_inactive` | outbox flush | ย้ายไป "ส่งไม่สำเร็จ" ทันที (ไม่ retry) · ข้อความ "นักเรียนไม่อยู่ในห้องแล้ว (ย้าย/ไม่ใช้งาน/จบปี)" ใน Overlays และ feedback หน้าสแกน · `npm run typecheck` ผ่าน | BR-02 | ต้องมี |
| AC-07 | เด็ก active ปกติ | ทุกกรณีเดิม | regression ทั้งชุดผ่าน ≥ baseline (58 ไฟล์ / 603 tests) | — | ต้องมี |
| AC-08 | ขึ้นปีใหม่แล้ว เด็กห้องปีก่อน status `finished` ไม่มีแถวในงานปีก่อน (เทอมปีก่อนมี end_date) | ส่ง op `grid`/`grade` คะแนน 7 ที่งานปีก่อน | ผล `ok` (เทียบ README "ยังตรวจและแก้คะแนนงานปีเก่าได้") · ทำซ้ำกับเด็ก moved ที่ `left_at` > วันจบเทอมนั้น = ok | BR-02 | ต้องมี |
| AC-09 | เด็ก moved ที่มีแถว submitted จากการสแกน | ส่ง op `void` method `manual` (ยกเลิกการสแกน) | ผล `ok` แถวเป็น void (judge และ stillValid ใช้นิยาม "รับงาน" เดียวกัน = status submitted + intent receive) | BR-02 | ต้องมี |

BR-02 (ปรับ 30 ต.ค. ตาม D23): 
- **รับงาน** (op `submitted` ที่ intent receive = สแกน/ยิง/พิมพ์เลข/แตะผัง): นักเรียนต้อง `status = active`
- **ให้/แก้คะแนนในสมุดคะแนน และยกเลิก/ยกเว้น** (ทุก op ที่ไม่ใช่รับงาน): ทำได้เมื่อ (ก) มีแถวของคู่ งาน+นักเรียน อยู่แล้ว หรือ (ข) นักเรียนอยู่ใน**รายชื่อห้องของเทอมของงานนั้น** ตามกติกาเดียวกับ `memberClause` (`worker/lib/roster.ts:18-25`): active หรือ finished หรือ moved/inactive ที่ `left_at` > วันจบเทอม · งานที่ไม่มีเทอม = active เท่านั้น
- bulk ใช้ `memberClause` เลือกรายชื่อ และนับเป็นงานในสมุดคะแนน (ไม่ต้อง active — ดู PM ตัดสิน R-01)
- "มีแถวอยู่แล้ว" = แถวที่ status ≠ `void`
- การตรวจต้องเกิดทั้งใน `judge` และ `stillValid` (ธุรกรรมเดียวกับการเขียน) ด้วยนิยามเดียวกัน
- ตัวอย่าง: ปีก่อน เด็ก finished ไม่มีแถว → ครูใส่ 7 ในสมุดคะแนนปีเก่า = **ได้** · เทอมนี้ (ยังไม่จบ) เด็กย้ายออกวันนี้ ไม่มีแถว → ใส่ 7 = **ไม่ได้** (`student_inactive`) · มีแถว 6 อยู่ → แก้เป็น 8 = ได้ · สแกนรับงานเด็ก moved = ไม่ได้ · กดยกเลิกการสแกนของเด็กที่เพิ่งย้าย (มีแถว) = ได้

## ทีมที่ใช้

| ตำแหน่ง | ทำอะไรในงานนี้ |
|---|---|
| Full-Stack (opus·medium เพราะ 💰🔄) | test ล้มก่อน → แก้ submissions.ts (loadWorld/judge/stillValid) + types + outbox/Scan/Overlays ข้อความ |
| QA (opus·high เพราะ 💰) | ผลที่คาดจาก BR-02 ก่อน → ทดสอบตาม AC รวม race และ offline replay (op ค้างในคิวของเด็กที่ถูกย้ายระหว่างออฟไลน์) |
| Code Reviewer (opus·high เพราะ 💰) | ตรวจ diff: SQL ใน stillValid, การแยก receive/grade, ไม่มีช่องหลุด |

## Gate

| Gate | สถานะ | วันที่ | คำตอบเจ้าของงาน |
|---|---|---|---|
| 1 ขอบเขต | ไม่ใช้ (S) — กฎมาจาก D15 | | |
| 2 หน้าตา | ไม่ใช้ (เพิ่มข้อความเท่านั้น) | | |
| 3 ปล่อยงาน | รอ (release train ของ M1) | | |

## PM ตัดสินข้อ review (2026-10-30, Verify รอบ 1)

- R-01 → (ก): ปุ่ม bulk ในสมุดคะแนน ("ทั้งห้องส่งแล้ว"/"ให้เต็ม"/"ล้าง") เป็นงานในสมุดคะแนนตาม D23 ไม่ใช่การสแกนรับงาน → แยกฟิลด์ guard `hand_in` (ต้อง active) ออกจาก `receive` (ใช้ตรวจงานปิดรับเท่านั้น) · batch: `hand_in = isReceive(op)` · bulk: `hand_in = 0` · ต้องมี test bulk all-submitted บนงานปีก่อน = บันทึกได้
- R-05(ข) → "มีแถวอยู่แล้ว" หมายถึงแถวที่ status ≠ `void` (แถว void = ไม่มีงาน จึงไม่นับเป็นคะแนนเดิม) ทั้งใน judge และ stillValid
- R-02 → รับ: หน้าสแกนตรวจ `status` ของนักเรียนฝั่ง client ก่อนส่งเสียงสำเร็จ (ไม่ active = แจ้งเตือนทันทีด้วยข้อความเดียวกัน ไม่เข้าคิว)
- R-03 → รับ: SQL ใช้ `NULLIF(t.end_date,'')` ให้ตรงกับ `inRoster`
- R-04 → รับ: เพิ่ม test race ของ finished ที่สแกนรับงาน, `left_at = end_date`, fixture วันที่ ค.ศ.

## Known issue ที่ PM รับ / ส่งต่อ (2026-10-30)

- R-06 (เสนอ, ต่ำ): judge ดูแถวจาก `w.existing` (ก่อน batch) ไม่ใช่ `effective` → ถ้า `[void, grade]` ของเด็ก moved มาในคำขอเดียวกัน แถวกลับเป็น submitted ด้วย submitted_at ใหม่ · เกิดได้ยาก ไม่สร้างงานจากความว่าง → **ส่งต่อรวมใน M1-06** (ซึ่งแก้ judge/intent อยู่แล้ว)
- R-05(ก): server ยังเชื่อ `intent` จาก client → M1-06 ตามแผน

## N/A ที่รับ

| check | เหตุผล | วันที่ |
|---|---|---|

## ข้อจำกัด / สมมติฐาน / คำสั่งพิเศษจากเจ้าของงาน

- **เปลี่ยนสัญญา API ที่ PM อนุมัติ:** เพิ่มค่า `{ opId; result: "student_inactive" }` ใน `SubmissionOpResult` (`shared/types.ts`) — ค่าเพิ่ม ไม่ลบของเดิม client รุ่นเก่าจะเห็นเป็นผลที่ไม่รู้จักและย้ายไป "ส่งไม่สำเร็จ" ตามกติกาเดิม (`outbox.ts:155-157`)
- ไม่แตะ `intent` (งาน M1-06 แยก) · ไม่มี migration · ไม่แตะ production
- พอร์ตถ้าต้องเปิด server: Full-Stack 4103 · QA 4105

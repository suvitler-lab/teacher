# Code review: ตัวเลขร้อยละ/สถานะงานใช้นิยามเดียวทุกหน้า + คะแนนครึ่งนิยามเดียวทั้งระบบ (M1-05)

โดย Code Reviewer · 2026-10-30 · ช่วง diff: `main (b9483ba)..working tree` (ยังไม่ commit: `shared src worker README.md` + `shared/time.ts` ใหม่) · รอบแก้ (Verify) 1/3 (ตัวนับเดียวกับ QA)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่าน

ต้องแก้ 0 ข้อ · แนะนำ 4 ข้อ (ควรแก้ 2 · เสนอ 2)

ไม่พบการเปลี่ยนนิยาม BR-05 แบบแอบแฝง ทุกจุดที่แทนสูตรให้ผลเท่าเดิม (ทั้งสูตรและลำดับการคำนวณทศนิยม) ยกเว้นจุดที่ตั้งใจเปลี่ยนตาม BR-05 และ PM ตัดสินไว้แล้ว ได้แก่ หักเด็กยกเว้นในอัตราส่งต่องาน และถังคะแนนในรายงานที่ใช้ % ที่ปัดแล้ว

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

- **R-01 เศษส่วนที่แสดงคู่กับ % ไม่ตรงกับวงแหวนหน้าสแกน** · `src/pages/Home.tsx:175`, `src/pages/Reports.tsx:205`, `src/lib/excel.ts:124` เทียบกับ `src/pages/Scan.tsx:797,847`
  - ใช้ข้อมูลชุด AC-01 (10 คน, ยกเว้น 2, ส่ง 6): หน้าหลักแสดงแถบ 75% แต่ตัวเลขข้างแถบเป็น `6/10` เพราะใช้ `{p.submitted}/{p.total}` ซึ่ง total รวมเด็กยกเว้น ส่วนรายงานและ Excel ก็แสดง `6/10 · 75%` (มีมาก่อนงานนี้) แต่วงแหวนหน้าสแกนแสดง `6/8` งานชิ้นเดียวกันจึงขึ้นตัวหารต่างกันสองแบบ ครูที่เอา 6 ÷ 10 ไปเทียบกับ 75% จะเห็นว่าไม่ตรงกัน
  - ข้อนี้ไม่ผิด AC เพราะ AC-01 กำหนดเฉพาะ % และ AC-02 กำหนดให้วงแหวนเป็น 6/8 แต่ขัดกับเป้าหมาย "ตัวเลขชุดเดียวกันได้ค่าเท่ากันทุกหน้า"
  - แนวทาง: ให้ทุกจุดแสดง `submitted/(total − excused)` หรือแสดง `6/10 (ยกเว้น 2)` · ต้องถามเจ้าของงาน เพราะกระทบไฟล์ Excel ที่ครูส่งต่อ (ถ้าไม่มีเด็กยกเว้น ตัวเลขยังเท่าเดิม AC-08 จึงไม่กระทบ)
- **R-02 ลิ้นชักข้อมูลนักเรียนยังคำนวณ % เอง** · `src/components/StudentDrawer.tsx:86` (คะแนนสะสม) และ `:87` (มาเรียน)
  - ทั้งสองจุดใช้ `Math.round(... * 100)` แบบ inline ลิ้นชักนี้เปิดจากหน้ารายงานและหน้านักเรียน ซึ่งเป็นตัวเลขที่ครูเห็นบนจอ ตอนนี้ได้ค่าเท่ากับ `scorePercent` และ `attendancePercent` (`daysMarked` = ผลรวม 5 สถานะ, `src/lib/report.ts:69`) แต่ไม่ผ่านจุดปัดเศษจุดเดียว ถ้าภายหลังมีการแก้นิยามใน `shared/metrics.ts` ลิ้นชักจะแสดงค่าไม่ตรงกับตารางในรายงาน
  - AC-07 grep เฉพาะ `src/pages` จึงหลุดการตรวจ
  - แนวทาง: เปลี่ยนเป็น `scorePercent(report.score, report.fullScore)` และ `attendancePercent(att)` แล้วแสดง "—" เมื่อได้ null · หรือส่งเข้า backlog ร่วมกับรายการ "วันนี้" ที่ยังซ้ำอยู่

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- **R-03 Excel แผ่นเช็คชื่อคำนวณ % มาเรียนเอง** · `src/lib/excel.ts:103` — ได้ค่าเท่ากับ `attendancePercent(tally)` ทุกกรณี และแสดง "—" เมื่อยังไม่มีการเช็คเหมือนกัน ควรเรียก helper เพื่อให้ปัดเศษอยู่จุดเดียวจริง
- **R-04 รหัส issue ของ zod เปลี่ยนจาก `not_multiple_of` เป็น `custom`** · `worker/routes/submissions.ts:63`, `worker/lib/restore-validation.ts:10` — ค่าที่ปฏิเสธยังได้ HTTP 422 เหมือนเดิม: batch ตอบ `{error:"validation"}` (`worker/app.ts:114`) และกู้คืนตอบ `invalid_backup` (`worker/routes/backup.ts:320`) แต่ `issues[].code` / `RestoreIssue.code` จะเปลี่ยนเป็น `custom` และข้อความเปลี่ยนเป็น "Invalid input" · grep แล้วไม่พบ client หรือ test ที่อ่านรหัสนี้ ถ้าต้องการให้วินิจฉัยง่ายขึ้น ใส่ `{ message: "half_step" }` ใน `refine`

## คำตอบประเด็นที่ PM ถาม

1. **ฟังก์ชันเดิมให้ผลเท่าเดิม**: PASS
   - `percentOf` ใช้นิพจน์ `(part / whole) * 100` แล้ว `Math.round` เหมือนของเดิมทุกตัว และคืน null เมื่อตัวหาร ≤ 0 แล้วแต่ละจุดเติม `?? 0` จึงให้ผลเท่าเดิม ได้แก่ `assignmentProgress.rate`, `studentSummary.submitRate/scorePercent`, `attendanceRate`
   - `average` ยังเป็น `Math.round(scoreSum / scored)` และ `workState` ไม่เปลี่ยน
   - `averageAttendancePercent` คำนวณ `(Σratio / n) * 100` ลำดับเดียวกับโค้ดเดิมใน Students
2. **แต่ละจุดเลือกนิยามถูกตัว**: PASS
   - อัตราส่งต่องาน (`assignmentRate`) ใช้ที่ Home:169 และหัวคอลัมน์ Gradebook:401
   - อัตราส่งรายคน/ทั้งห้อง (`classSubmitRate`) ใช้ที่แถบเครื่องมือ Gradebook:300 และ `report.ts:127` ทั้งสองจุดรวมทุกคนก่อนหาร (Σ ไม่ใช่เฉลี่ย %) ตรงกับโค้ดเดิม
   - % มาเรียน (`attendancePercent`) ใช้ที่ Home, Attendance, Reports, Students และ report.ts
   - dashboard ฝั่ง server (`worker/routes/dashboard.ts:107` ใช้ `assignmentProgress`) กับหน้าหลักฝั่ง client (`assignmentRate(p)`) ใช้ตัวหาร `total − excused` เดียวกัน ฟิลด์ `excused` มีอยู่ใน `ClassProgress` (`shared/types.ts:212`) และ server ส่งมา (`dashboard.ts:121`) จึงไม่มีกรณี NaN
   - % มาเรียนที่หน้าหลัก: ผลรวม 5 สถานะเท่ากับ `marked` เดิม (`dashboard.ts:139`)
3. **หน้าสแกน**: PASS
   - legend คำนวณจาก `workState` ด้วยนิพจน์เดียวกับสีช่อง (`Scan.tsx:633` เทียบกับ `:810`) จำนวนรวมจึงเท่าทั้งห้อง
   - swatch "ยังไม่ส่ง" ใช้เงื่อนไข `today > due_date` เดียวกับ `workState` จึงตรงกับ `.missing` / `.pending`
   - swatch "ยกเว้น" ตรงกับช่องพื้นฐานใน `scan.css:33`
   - `effSub` ใช้ค่าที่รอส่งก่อนค่าจาก server จึงไม่ทับค่าที่รอส่ง และ "รอส่งขึ้นระบบ" ยังแสดงแยก
   - หน้าจบรอบ: `missing` ไม่รวม excused แต่รวม void และคนที่ไม่มีแถว ข้อความที่คัดลอกไป LINE ใช้ `missing` ชุดเดียวกัน วงแหวนใช้ `submitted + missing` = ทั้งห้อง − ยกเว้น ตรงกับระหว่างสแกน
4. **`refine(isHalfStep)`**: PASS ทดสอบด้วย zod 4.6.7
   - 7.5 / 0.5 / null ผ่าน
   - 7.500000000000001 / 7.25 ถูกปฏิเสธ
   - ใน restore `-0.5` ถูกปฏิเสธด้วย `.min(0)` ที่ต่อท้าย refine ได้ใน v4
   - ค่า null / void ไม่เปลี่ยน เพราะ `.nullable()` อยู่หลัง refine
   - SQL guard `invalid_score` (`restore-validation.ts:104`) เข้มเท่ากันอยู่แล้ว ไฟล์สำรองเก่าจึงไม่เสียความเข้ากันได้เพิ่ม
   - HTTP 422 เดิม แต่รหัส issue เปลี่ยน ดู R-04
   - ฝั่ง batch ยังตรวจช่วงคะแนนที่ `submissions.ts:278`
5. **เวลา**: PASS
   - `shared/time.ts` เป็นโค้ดเดิมทุกบรรทัดและไม่มี import จึงไม่มีวงจร import
   - `worker/lib/time.ts` import และ re-export ส่วน `isLateSubmission` ใช้ `bkkToday` ตัวเดียวกัน
   - `src` ไม่มีการ import จาก `worker/`
   - `todayBkk` เดิม (`toISOString().slice(0,10)`) และ `nowMinutesBkk` ให้ค่าเท่ากับ `bkkParts` สำหรับปี 1000–9999
6. **README**: PASS หัวข้อ "ตัวเลขในระบบคิดอย่างไร" ตรงกับ BR-05 ทุกข้อ ได้แก่ สถานะงาน อัตราส่งต่องาน อัตราส่งรายคน/ห้อง คะแนนสะสม % มาเรียน และการปัดจุดเดียว (README ไม่ได้กล่าวถึง "คะแนนเฉลี่ยงานที่ตรวจแล้ว" ซึ่งเป็นการละไว้ ไม่ได้เขียนผิด)

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร
- [x] ตรวจ input ฝั่ง server ทุกจุด (คะแนนครึ่งเข้มขึ้นทั้ง batch และ restore)
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล — ไม่มีการเปลี่ยน endpoint หรือสิทธิ์
- [x] ป้องกัน injection, XSS, CSRF — legend ใช้ `style` จากค่าคงที่ในโค้ด ไม่มีข้อมูลผู้ใช้
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น — รายชื่อที่คัดลอกไป LINE ลดลง (ไม่รวมเด็กยกเว้น)
- [x] error ไม่เปิดเผยรายละเอียดภายใน — ไม่เปลี่ยน
- [x] dependency ใหม่น่าเชื่อถือ — ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] ตัวเลข/ปัดเศษ: ปัดด้วย `Math.round` จุดเดียวที่ `roundPercent` สำหรับทุกจุดใน `src/pages` และ `report.ts` (ยกเว้น R-02, R-03 นอก AC-07) · ผลรวมใน legend เท่ากับทั้งห้อง
- [x] ไม่นับซ้ำ: `countWorkStates` นับหนึ่งช่องต่อหนึ่งสถานะ ส่วน `submitted` นับเฉพาะ scored + late + awaiting
- [x] transaction: ไม่มีการเปลี่ยนการเขียนข้อมูล
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง: ไม่เกี่ยว
- [x] วันที่/timezone: ใช้ "วันนี้" เวลาไทยจาก helper เดียวใน 8 จุดที่แทน · จุดที่ยังซ้ำอยู่ถูกส่ง backlog ตาม PM
- [x] 🔄 offline: `effSub` ใช้ค่าที่รอส่งก่อน ทั้ง legend และหน้าจบรอบ

## หลักฐาน (อ่านอย่างเดียว)

| คำสั่ง | ผล |
|---|---|
| `git diff main -- shared src worker README.md` + `cat shared/time.ts` | อ่านครบ 15 ไฟล์ |
| `npx vitest run test/unit/metrics.test.ts test/unit/m1-05-scan.test.tsx test/unit/m1-05-screens.test.tsx` | PASS 3 ไฟล์ / 32 tests (1.4 วินาที) |
| `node -e` ทดสอบ zod refine กับ 7.5, 0.5, 7.500000000000001, 7.25, null, -0.5, "7.5" | ผลตามข้อ 4 · `multipleOf` เดิมให้รหัส `not_multiple_of` |
| `grep "* 100" src/lib src/components` | พบ `StudentDrawer.tsx:86-87` และ `excel.ts:103` (R-02, R-03) |
| `grep not_multiple_of\|issues src test` | ไม่มี client หรือ test ที่อ่านรหัสนี้ |

---

## รอบ 2 (Verify 1/3) · 2026-10-30

ตรวจเฉพาะ diff ใหม่: `shared/metrics.ts`, `src/lib/report.ts`, `src/lib/excel.ts`, `src/components/StudentDrawer.tsx`, `src/pages/{Home,Reports,Gradebook}.tsx`, `test/unit/m1-05-verify1.test.tsx`

### สรุปรอบ 2: ผ่าน — ต้องแก้ 0 · ควรแก้ 1 ข้อใหม่ (R-05) · เสนอ 1 ข้อใหม่ (R-06)

### สถานะข้อเดิม

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| R-01 เศษส่วนไม่ตรงกับวงแหวน | ยืนยันแล้ว | `assignmentFraction` ใช้ตัวหาร `total − excused` ตัวเดียวกับ `assignmentRate` · ใช้ที่ Home:175, Reports:205, Gradebook (ท้ายคอลัมน์ + แถบงานที่เลือก), excel:125 · ถ้าไม่มีเด็กยกเว้นได้ `6/10` เหมือนเดิม |
| R-02 StudentDrawer คำนวณ % เอง | ยืนยันแล้ว | `StudentDrawer.tsx:87-88` ใช้ `scorePercent`/`attendancePercent` และแสดง "—" เมื่อได้ null เหมือนเดิม |
| R-03 Excel % มาเรียน | ยืนยันแล้ว | `excel.ts:103` ใช้ `attendancePercent` ได้ "—" เมื่อไม่มีการเช็คเหมือนเดิม |
| R-04 รหัส issue `custom` | ยังเปิด (เสนอ) | ไม่ได้แก้ ยอมรับได้ |

### คำตอบ 4 ประเด็น

1. **สูตรปัดแบบคูณก่อนหาร**: PASS สำหรับ `percentOf` (ซึ่ง `rate`, `submitRate`, `scorePercent`, `classSubmitRate` และ `attendancePercent` ใช้ทั้งหมด)
   - brute force part = 0..whole ทีละ 0.5 กับ whole 1..400 (160,800 คู่): ต่างจากสูตรเดิม 32 คู่ และ**ทั้ง 32 คู่มีค่าจริงลงท้าย .5 พอดี** ไม่พบกรณีอื่น
   - นิยามอื่นไม่เปลี่ยน: ตัวหาร ตัวตั้ง และ null/0 เมื่อหารด้วยศูนย์คงเดิม
   - ข้อยกเว้นอยู่ที่ R-05
2. **`assignmentFraction`**: PASS ตัวหารเดียวกับ % ทุกจุด · ไม่มีเด็กยกเว้นได้รูปแบบเดิม `n/total` · `AssignmentReport.excused` มาจาก `prog.excused`
3. **Excel**: PASS
   - เปลี่ยนเฉพาะ 3 จุดที่ตั้งใจ: ช่องเด็กยกเว้นจาก "ลา" เป็น "ยกเว้น" (B-03), เศษส่วนส่งงาน, และ % มาเรียนที่เปลี่ยนไปเรียก helper
   - ทุกจุดยังเป็น 1 ค่าต่อ 1 ช่อง ไม่มีคอลัมน์เพิ่มหรือหาย ชีตอื่นจึงไม่เลื่อน
4. **B-05 (`studentSummary.awaiting`)**: PASS
   - case `awaiting` ยังทำ `submitted++` เหมือนเดิม เพิ่มแค่ `awaiting++` ดังนั้น `submitted`, `applicable` และ `submitRate` ไม่เปลี่ยน
   - grep แล้วไม่มีโค้ดที่ใช้ `StudentSummary.awaiting` คำนวณตัวเลขอื่น

### ควรแก้

- **R-05 ค่าเฉลี่ยคะแนนต่องานยังปัด .5 ผิด และบางกรณีถอยหลังจากเดิม** · `shared/metrics.ts:94` (`scoreSum += (sc * 100) / full`) และ `:102` (`roundPercent(scoreSum / scored)`)
  - ปัญหา: ค่าเฉลี่ยยังเป็นผลรวมของ % รายคนที่แต่ละตัวมีเศษทศนิยมคลาด การคูณก่อนหารรายตัวจึงไม่ได้ทำให้ผลรวมตรง
  - สถานการณ์ที่พัง: งานเต็ม 3 คะแนน 4 คนได้ 2.5, 2.5, 3, 2.5 → ค่าจริง 87.5% ควรได้ **88** · สูตรเดิมได้ 88 · **สูตรใหม่ได้ 87** (ผลรวมเป็น 87.49999999999999)
  - สุ่มเทียบ 2.4 ล้านชุด: สูตรเดิมผิด 2,851 ครั้ง สูตรใหม่ผิด 2,127 ครั้ง ทุกครั้งเป็นกรณีค่าจริงลงท้าย .5 พอดี
  - ผลที่ครูเห็น: คอลัมน์ "เฉลี่ย" ของงานใน Excel (`excel.ts:127`)
  - แนวทางแก้: เต็มของงานเดียวเท่ากันทุกคน จึงเก็บคะแนนดิบรวม `rawSum` แล้วใช้ `average: percentOf(rawSum, scored * asg.full_score) ?? 0` ซึ่งเป็นการหารครั้งเดียวและได้ค่าแม่นตรงตาม AC-10 · เพิ่ม test ด้วยชุดตัวอย่างข้างบน

### เสนอ

- **R-06 `averageAttendancePercent` ยังมีกรณี .5 ปัดลงได้** · `shared/metrics.ts:220-221` — เป็นค่าเฉลี่ยของสัดส่วนที่ตัวหารต่างกัน จึงแก้แบบหารครั้งเดียวไม่ได้ · สุ่ม 200,000 ชุดพบ 1 กรณีที่ค่าจริงเป็น .5 พอดีแต่ได้ผลปัดลง: (21/40, 15/18, 10/12, 4/4, 1/30) · ผลกระทบต่ำมาก และนิยามนี้ยังรอเจ้าของงานตัดสิน (PM §"มาเรียนเฉลี่ย") ถ้าคงไว้ ให้ใช้ทางเลือก (ข) ปัด `sum/n` ด้วย epsilon เล็ก ๆ หรือรอคำตัดสินนิยามก่อน

### หลักฐานรอบ 2

| คำสั่ง | ผล |
|---|---|
| `git diff main -- shared/metrics.ts src/lib/excel.ts src/components/StudentDrawer.tsx src/lib/report.ts src/pages/{Home,Reports,Gradebook}.tsx` | อ่านครบ |
| `npx vitest run test/unit/m1-05-verify1.test.tsx test/unit/metrics.test.ts` | PASS 2 ไฟล์ / 35 tests |
| node brute force `percentOf` เทียบสูตรเดิม (สคริปต์อยู่ใน %TEMP% ไม่ได้อยู่ในโปรเจกต์) | 160,800 คู่ · ต่าง 32 · ทุกคู่เป็น .5 พอดี |
| node สุ่ม `assignmentProgress.average` เทียบค่าแม่นตรง | ตัวอย่างพัง F=3 [2.5,2.5,3,2.5]: เดิม 88 / ใหม่ 87 / ค่าจริง 88 |
| grep `.awaiting` ใน src/shared/worker | ไม่มีโค้ดอื่นใช้ `StudentSummary.awaiting` |

## รอบ 3 (Verify 1/3) · 2026-10-30 — ตรวจเฉพาะการแก้ R-05

- **R-05: ยืนยันแล้ว** · `shared/metrics.ts:94` รวมคะแนนดิบ และ `:102` ใช้ `percentOf(scoreSum, scored * asg.full_score) ?? 0` ซึ่งหารครั้งเดียว ปัดด้วย `roundPercent` จุดเดียว
- ตัวอย่างใน R-05 (เต็ม 3, คะแนน 2.5 2.5 3 2.5) ได้ **88** ตรงกับค่าจริง 87.5 · เต็ม = 0 ได้ `percentOf(x, 0)` = null → 0 เท่าเดิม · ไม่มีคนได้คะแนน (scored = 0) ได้ 0 เท่าเดิม
- ค่าเดิมที่ถูกยังเท่าเดิม: สุ่ม 1.8 ล้านชุด (เต็ม 1–30, 1–40 คน, คะแนนทีละ 0.5) ไม่พบผลต่างจากสูตรเดิมนอกกรณีที่ค่าจริงลงท้าย .5 พอดี
- `studentSummary` และ `scorePercent` ไม่ถูกแตะ (diff เฉพาะใน `assignmentProgress`)
- `npx vitest run test/unit/m1-05-verify1.test.tsx test/unit/metrics.test.ts` → PASS 37 tests (มี describe "R-05" ครอบทั้ง metrics และคอลัมน์เฉลี่ยใน Excel)
- สรุปรอบ 3: **ผ่าน** · ต้องแก้ 0 · ยังเปิด: R-04, R-06 (เสนอ)

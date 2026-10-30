# Brief: server ตัดสินเองว่าเป็น "รับงาน" หรือ "ให้คะแนน" + ปุ่มทั้งห้องไม่แตะเด็กยกเว้น + มาเรียนเฉลี่ยแบบรวม

- งาน: `2026-10-30-m1-06-server-intent` · branch: `team/2026-10-30-m1-06-server-intent` (แตกจาก `main` @ `c69b9fd`) · เริ่ม: 2026-10-30
- สถานะ: ปิดแล้ว (2026-10-30 — quality-gate PASS, trace-check close PASS, 74 ไฟล์/873 tests)
- ขนาด: S · ธง: 💰 🔐
- เจ้าของงาน (Product Owner): ผู้ใช้ · โปรแกรม: 2026-10-program (M1-06 + M1-07 + ค้างจาก M1-02/M1-05, epic E-01)

## โจทย์ (คำของเจ้าของงาน)

> "merge แล้วทำ M1-06 ต่อ" (30 ต.ค.) · D24: "มาเรียนเฉลี่ย" = รวมทุกคนแล้วหาร

ปัญหาที่ยืนยันจากโค้ด:
1. **M1-06** `worker/routes/submissions.ts` `opIntent()` เชื่อค่า `intent` ที่ client ส่งมา → คำขอที่ประกอบเอง (method `hid` + intent `grade`) ข้ามการปิดรับงานได้ · client จริงส่ง intent ตรงกับ method อยู่แล้ว (`Scan.tsx:263` receive, `Gradebook.tsx:155` grade)
2. **R-06 (จาก M1-02)** `judge()` ตัดสิน "มีแถวเดิม (ไม่ใช่ void)" จากข้อมูลก่อนคำขอ (`w.existing`) ไม่ใช่สถานะหลัง op ก่อนหน้าในคำขอเดียวกัน → `[void, grade]` ของเด็กที่ย้ายออกในคำขอเดียวกันได้ ok ทั้งคู่ แถวกลับเป็น submitted
3. **M1-07** ปุ่มทั้งห้อง: "ทั้งห้องส่งแล้ว" เปลี่ยนแถว `excused` เป็น submitted · "ล้าง" เปลี่ยน `excused` เป็น void (`submissions.ts` bulk ~บรรทัด 500-515) · ตอนนี้ UI ยังสร้างแถว excused ไม่ได้ แต่ข้อมูลจากไฟล์สำรอง/อนาคตทำได้
4. **D24** `shared/metrics.ts:217` `averageAttendancePercent` เฉลี่ย % รายคน → เปลี่ยนเป็นรวมแล้วหาร (ปิด R-06 ของ M1-05 ไปด้วย)

## AC

| AC | สถานะเริ่มต้น (Given) | เมื่อ (When) | ผลที่ต้องได้ (Then) | BR | ระดับ |
|---|---|---|---|---|---|
| AC-01 | งานปิดรับแล้ว · เด็ก active ยังไม่ส่ง | op `submitted` method `hid` (หรือ camera/manual) พร้อม `intent: "grade"` | `assignment_closed` · ไม่มีแถว/audit | BR-06 | ต้องมี |
| AC-02 | งานปิดรับแล้ว | op จากสมุดคะแนน method `grid` (มีหรือไม่มี intent, หรือ intent `receive`) คะแนน 8 | `ok` (ให้คะแนนงานปิดได้ตามเดิม) | BR-06 | ต้องมี |
| AC-03 | งานเปิด | op เดิมของหน้าสแกน/สมุดคะแนน (intent ตรงกับ method) | ผลเหมือนเดิมทุกกรณี (regression) | BR-06 | ต้องมี |
| AC-04 | เด็ก moved (เทอมนี้ยังไม่จบ) มีแถว submitted | คำขอเดียว `[void (manual), grade 8 (grid)]` | void = ok · grade = `student_inactive` (เพราะหลัง void แล้วไม่มีแถวที่ไม่ใช่ void) · แถวสุดท้ายเป็น void | BR-02 | ต้องมี |
| AC-05 | ห้อง 5 คน: excused 1, submitted 2, ไม่มีแถว 2 | "ทั้งห้องส่งแล้ว" · "ให้เต็มคนที่ส่ง" · "ล้าง" | excused ไม่ถูกแตะทุกปุ่ม · changed นับเฉพาะแถวที่เปลี่ยนจริง · ย้อนกลับการล้างยังทำงาน | BR-07 | ต้องมี |
| AC-06 | เด็ก A มา 4 จาก 6, B มา 1 จาก 2 | หน้านักเรียน "มาเรียนเฉลี่ย" | 63% (รวมแล้วหาร) · ไม่มีการเช็ค = "—" | BR-05/D24 | ต้องมี |
| AC-07 | — | regression | ชุดเต็ม ≥ 71 ไฟล์ / 841 | — | ต้องมี |

BR-06: server **ไม่เชื่อ** `intent` จาก client — "รับงาน" ตัดสินจาก `method` เท่านั้น: camera/hid/manual = รับงาน · grid/bulk/import/restore = ให้คะแนน (ฟิลด์ `intent` ยังรับได้เพื่อไม่ให้ client เก่าพัง แต่ไม่ใช้)
BR-07: แถวที่ status `excused` ไม่ถูกเปลี่ยนโดยปุ่มทั้งห้องใด ๆ (ครูเปลี่ยนรายคนได้เท่านั้น)

## ทีมที่ใช้

| ตำแหน่ง | ทำอะไรในงานนี้ |
|---|---|
| Full-Stack (opus·medium เพราะ 💰🔐) | test ล้มก่อน → แก้ opIntent/judge(effective)/bulk excused/averageAttendancePercent |
| QA (opus·high เพราะ 💰) | ผลที่คาดก่อน + ผู้ไม่มีสิทธิ์/คำขอประกอบเอง (🔐 server-enforcement) |
| Code Reviewer (opus·high เพราะ 💰🔐) | ตรวจไม่มีช่องหลุด, client เดิมไม่พัง |

## Gate

| Gate | สถานะ | วันที่ | คำตอบเจ้าของงาน |
|---|---|---|---|
| 1 ขอบเขต | ไม่ใช้ (S) | | |
| 2 หน้าตา | ไม่ใช้ | | |
| 3 ปล่อยงาน | รอ (release train ของ M1) · merge ตามคำสั่งเจ้าของงาน (D25) | | |

## PM ตัดสินข้อ review (2026-10-30, Verify รอบ 1)

- QA: บั๊ก 0 · R-01 ของ QA (= Reviewer R-01) → แก้
- Reviewer R-01 (ควรแก้) → แก้: `/api/submissions/batch` รับ method เฉพาะ `camera | hid | manual | grid` (อื่น → 422 ตามรูปแบบ validation ของระบบ) — Reviewer ตรวจประวัติแล้วไม่มี client ส่งค่าอื่นผ่าน batch
- R-02 → แก้: กล่องยืนยัน "ล้าง" ใน `Gradebook.tsx:204` นับเฉพาะแถวที่จะถูกล้างจริง (ไม่รวม excused/void)
- R-03 → แก้: `batchSchema` ปฏิเสธ opId ซ้ำในคำขอเดียว (422)
- R-04 → แก้: `src/lib/report.ts:114-132` ใช้ `averageAttendancePercent`/ฟังก์ชันกลาง ไม่เขียนสูตรเอง

## N/A ที่รับ

| check | เหตุผล | วันที่ |
|---|---|---|

## ข้อจำกัด / สมมติฐาน / คำสั่งพิเศษจากเจ้าของงาน

- ไม่มี migration · ไม่แตะ production · ไม่เปลี่ยนนิยามอื่น · ไม่แตะ audit (M1-08)
- พอร์ต: Full-Stack 4103 · QA 4105 · ห้ามรัน mutation พร้อม agent อื่นที่รัน test

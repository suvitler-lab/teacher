# QA ผลที่คาดจาก BR (เขียนก่อนรันเทสต์) · M1-06 · Q-01

ที่มา: brief.md BR-06, BR-07, BR-02, D24 · ไม่ได้ใช้ผลรันเทสต์ในการคิดตารางนี้

## E-01 method x intent x งานเปิด/ปิด (op status `submitted`, คะแนน 8 สำหรับฝั่งให้คะแนน, เด็ก active, ช่องว่าง)

กติกา BR-06: รับงาน = method camera/hid/manual · ให้คะแนน = grid/bulk/import/restore · `intent` ไม่มีผล · งานปิด = ปฏิเสธเฉพาะ "รับงาน"

| method | intent ไม่ส่ง | intent receive | intent grade | งานเปิด | งานปิด |
|---|---|---|---|---|---|
| camera | รับงาน | รับงาน | รับงาน | ok | assignment_closed (ไม่มีแถว/audit) |
| hid | รับงาน | รับงาน | รับงาน | ok | assignment_closed |
| manual | รับงาน | รับงาน | รับงาน | ok | assignment_closed |
| grid | ให้คะแนน | ให้คะแนน | ให้คะแนน | ok | ok (แถว score 8 + audit) |
| bulk | ให้คะแนน | ให้คะแนน | ให้คะแนน | ok | ok |
| import | ให้คะแนน | ให้คะแนน | ให้คะแนน | ok | ok |
| restore | ให้คะแนน | ให้คะแนน | ให้คะแนน | ok | ok |

รวม 7 x 3 x 2 = 42 ช่อง: งานเปิด 21 ok · งานปิด 9 assignment_closed + 12 ok
- E-01b: งานปิด, hid + status `void`/`excused` → ok (ไม่ใช่การรับงาน — BR-06 ปิดเฉพาะรับงาน)
- E-01c: intent ค่าแปลก (`"admin"`) → ถูกปฏิเสธโดย schema ไม่มีแถว (ตอนเขียนคาดเลข 400 — แอปใช้ 422 สำหรับ validation ทั้งระบบ `worker/app.ts:115` จึงแก้ตัวเลขในเทสต์เป็น 422 หลังรันครั้งแรก ไม่ใช่บั๊ก) · ไม่มี cookie → 401 ทั้ง batch และ bulk ไม่มีแถว
- E-01d: ปุ่ม "ทั้งห้องส่งแล้ว" บนงานปิด → 409 assignment_closed (ของเดิม) · แต่คำขอ batch ประกอบเอง method `bulk` บนงานปิด → ok ตาม BR-06 (bulk = ให้คะแนน) — ประเมินความเสี่ยงใน qa-report
- E-01e: method `import`/`restore` ประกอบเอง ของเด็ก moved ที่ไม่อยู่ในรายชื่อเทอม ช่องว่าง → student_inactive (ข้ามกฎ BR-02 ไม่ได้)

## E-02 คำขอเดียวหลาย op (BR-02 ตัดสินจากสถานะหลัง op ก่อนหน้า)

- เด็ก moved (เทอมยังไม่จบ ไม่อยู่ในรายชื่อ) มีแถว submitted: `[void manual, grade 8 grid]` → ok, student_inactive · แถวสุดท้าย void score null (AC-04)
- เด็ก moved เดิม: `[grade 7 grid, void manual, grade 9 grid]` → ok, ok, student_inactive · แถวสุดท้าย void
- control เด็ก active: `[void, grade 8]` → ok, ok · แถวสุดท้าย submitted score 8

## E-03 ปุ่มทั้งห้อง x แถว excused (BR-07) — ห้อง 5 คน: st1 excused, st2/st3 submitted (score ว่าง), st4/st5 ไม่มีแถว · คะแนนเต็ม 10

กดแต่ละปุ่มจากสถานะเริ่มต้นเดียวกัน (แยกกัน):

| ปุ่ม | แถวที่เปลี่ยน | changed | st1 excused |
|---|---|---|---|
| ทั้งห้องส่งแล้ว | st4, st5 → submitted | 2 | ไม่เปลี่ยน |
| ให้เต็มคนที่ส่ง | st2, st3 → score 10 | 2 | ไม่เปลี่ยน |
| ล้าง | st2, st3 → void | 2 | ไม่เปลี่ยน |
| ย้อนกลับ "ทั้งห้องส่งแล้ว" | st4, st5 กลับเป็นไม่มีงาน | — | ไม่เปลี่ยน |
| ย้อนกลับ "ล้าง" | st2, st3 กลับ submitted | — | ไม่เปลี่ยน |

## E-04 มาเรียนเฉลี่ย (D24 รวมแล้วหาร)

- A มา 4 จาก 6, B มา 1 จาก 2 → (4+1) / (6+2) = 5/8 = 62.5% → ปัดครึ่งขึ้น = **63** (แบบเฉลี่ยรายคนเดิม = (66.67+50)/2 = 58.33 → 58 ≠ 63)
- "มา" = present + late: A present 3 late 1 leave 1 absent 1 → 4/6 · B present 1 sick 1 → 1/2 → ยัง 63
- เพิ่ม C ที่ไม่มีการเช็ค (0 วัน) → ยัง 63 (0 ไม่เปลี่ยนตัวหาร)
- ไม่มีใครถูกเช็ค / รายการว่าง → null ("—")

## Verify รอบ 1 (เขียนก่อนรัน · กติกาใหม่จาก PM ตัดสินข้อ review R-01/R-02)

batch route รับ method เฉพาะ camera|hid|manual|grid · method อื่นหรือ opId ซ้ำในคำขอเดียว → 422 ทั้งคำขอ ไม่มีแถว/audit
- E-01 (แทนตารางเดิม): 4 method × 3 intent × 2 = 24 ช่อง: งานเปิด 12 ok · งานปิด camera/hid/manual 9 assignment_closed · งานปิด grid 3 ok
- E-01d (แทนของเดิม): งานปิด batch method bulk/import/restore (มี/ไม่มี intent) → 422 ไม่มีแถว/audit · ปุ่ม "ทั้งห้องส่งแล้ว" ยัง 409
- E-01e: เด็ก moved ไม่อยู่ในรายชื่อ ช่องว่าง, grid → student_inactive
- E-05: `[op A, op B]` opId เดียวกัน (คนละนักเรียน, งานเปิด) → 422 ไม่มีแถวทั้งสองคน ไม่มี audit
- E-06: `[hid ถูกต้อง, method "restore"]` → 422 ทั้งคำขอ op ที่ถูกต้องก็ไม่ถูกเขียน

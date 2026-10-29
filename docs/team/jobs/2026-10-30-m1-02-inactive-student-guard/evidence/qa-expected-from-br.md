# ผลที่คาดจาก BR-02 (D15 + D23) — QA คำนวณก่อนรัน test ของ QA

เขียน 30 ต.ค. 2569 โดย team-qa-tester ก่อนรัน `test/api/qa-m1-02.test.ts` · แหล่ง: brief.md BR-02, decisions.md D15/D23,
`worker/lib/roster.ts` memberClause และ `shared/roster.ts` inRoster (นิยามรายชื่อห้อง) · opIntent เดิม: ไม่ส่ง intent → method
camera/hid/manual = receive, อื่น ๆ = grade

## กติกาที่ใช้ตัดสิน (เรียงลำดับ)

1. นักเรียนไม่อยู่ห้องของงาน (`class_id` ไม่อยู่ใน assignment_classes) → `not_in_class` (มาก่อน ไม่ว่า status ใด)
2. status = active → ไม่ถูกกฎนี้กระทบ (ok ตามกติกาเดิม)
3. op เป็น "รับงาน" (status `submitted` และ intent receive) และ status ≠ active → `student_inactive` (ไม่ดูแถวเดิม ไม่ดูเทอม)
4. op ไม่ใช่รับงาน (submitted+grade, void, excused) และ status ≠ active:
   - มีแถวของคู่ งาน+นักเรียน (สถานะใดก็ได้) → `ok`
   - ไม่มีแถว → `ok` เมื่อ inRoster(นักเรียน, เทอมของงาน) มิฉะนั้น `student_inactive`
5. inRoster: ไม่มีเทอม → active เท่านั้น · เทอมไม่มี end_date → active/finished · เทอมมี end_date → active/finished หรือ
   moved/inactive ที่ `left_at > end_date` (เทียบสตริง; `=` ไม่นับ; `left_at` NULL ไม่นับ)
6. ผล `student_inactive`/`not_in_class`: ไม่สร้าง/ไม่แก้แถว submission · ไม่มี audit_logs ของ opId นั้น

## ตาราง (st = นักเรียนในห้องของงาน · end = 2569-09-30 สำหรับเทอมที่มีวันจบ)

| # | status | op | แถวเดิม | เทอมของงาน | left_at | ผลที่คาด | เหตุ (ข้อ) |
|---|---|---|---|---|---|---|---|
| E-01 | active | submitted hid/camera/manual | ไม่มี | ทุกแบบ | – | ok | 2 |
| E-02 | moved / inactive / finished | submitted hid/camera/manual | ไม่มี | ทุกแบบ | ใดก็ได้ | student_inactive | 3 |
| E-03 | moved / inactive / finished | submitted hid | มี (submitted/void) | ทุกแบบ | ใดก็ได้ | student_inactive · แถวเดิมไม่เปลี่ยน | 3 |
| E-04 | moved | submitted grid intent receive (แตะผังหน้าสแกน) | ไม่มี | เทอมไม่มี end | – | student_inactive | 3 |
| E-05 | finished | submitted hid (สแกนงานปีก่อน) | ไม่มี | เทอมมี end | NULL | student_inactive | 3 (แม้อยู่ใน roster) |
| E-06 | moved | submitted hid | ไม่มี | เทอมมี end | > end | student_inactive | 3 (แม้อยู่ใน roster) |
| E-07 | moved / inactive / finished | submitted grid (grade) | มี (6) | ทุกแบบ | ใดก็ได้ | ok · คะแนนใหม่ · submitted_at/late เดิม | 4 แถวเดิม |
| E-08 | moved / inactive / finished | void manual | มี (submitted) | ทุกแบบ | ใดก็ได้ | ok · แถวเป็น void | 4 แถวเดิม |
| E-09 | moved / inactive | excused grid | มี | ทุกแบบ | ใดก็ได้ | ok | 4 แถวเดิม |
| E-10 | moved / inactive / finished | grid grade / excused / void | ไม่มี | ไม่มีเทอม | ใดก็ได้ | student_inactive | 4+5 ไม่มีเทอม = active เท่านั้น |
| E-11 | finished | grid grade / excused | ไม่มี | เทอมไม่มี end | NULL | ok | 4+5 |
| E-12 | moved / inactive | grid grade / excused | ไม่มี | เทอมไม่มี end | ใดก็ได้ (แม้ไกลในอนาคต) | student_inactive | 4+5 |
| E-13 | finished | grid grade / excused | ไม่มี | เทอมมี end | NULL | ok | 4+5 |
| E-14 | moved / inactive | grid grade / excused | ไม่มี | เทอมมี end | < end | student_inactive | 4+5 |
| E-15 | moved / inactive | grid grade / excused | ไม่มี | เทอมมี end | = end | **student_inactive** | 4+5 (`>` ไม่ใช่ `>=`) |
| E-16 | moved / inactive | grid grade / excused | ไม่มี | เทอมมี end | > end | ok | 4+5 |
| E-17 | moved / inactive | grid grade | ไม่มี | เทอมมี end | NULL | student_inactive | 4+5 |
| E-18 | moved (ห้องอื่น, left_at > end) | submitted hid และ grid grade | ไม่มี | เทอมมี end | > end | not_in_class | 1 มาก่อน |
| E-19 | moved (ห้องอื่น) | grid grade | มีแถว (สร้างตอนอยู่ห้องเดิมไม่ได้ → ใช้แถวที่ใส่ตรง) | ทุกแบบ | – | not_in_class | 1 มาก่อน |
| E-20 | moved | void manual | ไม่มี | ไม่มีเทอม | – | student_inactive | 4+5 |
| E-21 | moved | void manual | ไม่มี | เทอมมี end | > end | ok | 4+5 |

## ผลข้างเคียงที่คาด

- S-01 ทุกผล student_inactive: `SELECT COUNT(*) FROM submissions` และ `audit_logs` เท่าเดิม
- S-02 dashboard / report ของงานเดียวกันก่อนและหลังชุด op ที่ถูกปฏิเสธ: JSON เท่ากันทุกไบต์
- S-03 ชุด op ผสมใน batch เดียว (เด็ก moved + เด็ก active): เด็ก active ได้ ok, เด็ก moved ได้ student_inactive (ไม่ทำให้ทั้ง batch ล้ม)
- S-04 race สองเครื่อง: เครื่อง A ส่ง scan ของ st1, เครื่อง B เปลี่ยน st1 เป็น moved ระหว่าง judge กับ batch → ผล A = student_inactive ไม่มีแถว/audit · เครื่อง C ส่ง grade ช่องว่างพร้อมกัน → student_inactive · เครื่อง D ส่ง grade บนแถวเดิม → ok
- S-05 outbox (client): ผล student_inactive → op ไป failed ทันที (attempts ไม่เพิ่ม/ไม่ส่งซ้ำ), op ถัดไปของช่องเดียวกันไม่ถูกส่งในรอบนั้น, op ของเด็กคนอื่นใน flush เดียวกันส่งสำเร็จ (ok) และออกจากคิว

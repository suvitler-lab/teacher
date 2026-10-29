# QA report: 2026-10-30-m1-02-inactive-student-guard (T-02)

- ผู้ทดสอบ: team-qa-tester · 30 ต.ค. 2569 · รอบแรก tree `0183791112b9` · ตรวจซ้ำ tree `5bb621c6319a` (= `beba8b3f0c9d` ของ Full-Stack + test QA ที่ปรับ) · รอบแก้ (Verify) 1/3
- ธง: 💰 🔄 · evidence: Q-01 expected-from-br, Q-02 offline-replay, Q-03 multi-device, Q-04/Q-05 regression (PASS ทั้งหมด ที่ `tree:5bb621c6319a`)

## ผลตรวจซ้ำ Verify 1 (30 ต.ค.)

- B-01 (= R-01) **แก้แล้ว ตรวจซ้ำผ่าน**: bulk all-submitted งานปีก่อน (finished 2 คน) → changed 2 มีแถว + audit bulk 2 แถว ห้องปีนี้ไม่ถูกแตะ · เทอมจบแล้ว เด็ก moved/inactive ที่ออกหลังวันจบ → บันทึกครบ changed 4 = จำนวน audit ของ batch · เด็กที่ออกตรงวันจบไม่ถูกแตะ
- R-05(ข): แถว void ไม่นับเป็นแถวเดิม → เด็กนอกรายชื่อเทอม = student_inactive (แถว void คงเดิม ไม่มี audit) · เด็กในรายชื่อ = ok — ปรับ test QA ตาม BR ที่ PM ตัดสิน
- R-02: `test/unit/scan-controller.test.ts` เด็ก moved/inactive/finished → เสียง error, feedback ข้อความไทย, ไม่เข้าคิว, เด็ก active ยังผ่าน — ผ่านในชุดเต็ม
- `npx vitest run` test QA 2 ไฟล์ → 52/52 (evidence/qa-tests-v1.txt) · `npm run typecheck` exit 0 (qa-typecheck-v1.txt) · `npm test` 61 ไฟล์ / 693 ผ่าน exit 0 (qa-npm-test-v1.txt)

## สรุปผู้บริหาร

ระบบปฏิเสธการสแกน/ยิง/พิมพ์เลข/แตะผัง ของเด็กที่ย้าย/ไม่ใช้งาน/จบปีได้ถูกต้องทุกทาง ทั้งตอนตรวจและตอนเขียน
(สองเครื่องแข่งกันก็ไม่หลุด) การแก้คะแนนเดิมและสมุดคะแนนปีเก่ายังทำได้ ผลที่ปฏิเสธไม่เปลี่ยนตัวเลขหน้าหลัก/รายงาน
และไม่มีประวัติปลอม พบบั๊ก 1 ข้อ (กลาง): ปุ่ม "ทั้งห้องส่งแล้ว" ในสมุดคะแนนปีก่อนไม่บันทึกอะไรเลยโดยไม่แจ้ง (= R-01)

## เรื่องที่ควรแก้ก่อน

ไม่มี (B-01 ปิดแล้วใน Verify 1)

## ผลตาม AC

| AC | ผล | หลักฐาน |
|---|---|---|
| AC-01 | ผ่าน — moved/inactive/finished × hid/camera/manual/grid+receive = student_inactive, ไม่มีแถว/audit; มีแถวเดิมก็ปฏิเสธและแถวไม่เปลี่ยน (E-03) | Q-01 |
| AC-02 | ผ่าน — คะแนน 6→8, submitted_at/late เดิม × 3 status × 3 แบบเทอม (E-07) | Q-01 |
| AC-03 | ผ่าน — ช่องว่าง: ไม่มีเทอม/เทอมไม่มีวันจบ/ออกก่อนหรือ**ตรงวัน**จบเทอม = student_inactive (E-10,12,14,15,17) | Q-01 |
| AC-04 | ผ่าน — race ผ่าน API จริง 3 แบบ + สองเครื่องพร้อมกัน | Q-03 |
| AC-05 | ผ่าน — เด็ก moved/inactive ในเทอมที่ยังเรียนไม่ถูกแตะ · เด็กในรายชื่อเทอม (finished/ออกหลังวันจบ) ถูกบันทึกครบหลังแก้ B-01 | Q-01 |
| AC-06 | ผ่าน — failed ทันที ไม่ส่งซ้ำ, op ถัดไปของช่อง blocked, เด็กอื่นส่งได้, ข้อความไทยใน FailedPanel (render จริง) และ REJECTED ของ Scan (ตรวจจาก source) | Q-02, Q-04 |
| AC-07 | ผ่าน — typecheck exit 0 · npm test 61 ไฟล์ / 693 ผ่าน ≥ baseline 58/603 | Q-05 |
| AC-08 | ผ่าน — งานปีก่อน finished / moved หลังวันจบ = ok ทั้งทีละช่องและ bulk | Q-01 |
| AC-09 | ผ่าน — void manual และ void hid ของแถวเดิม = ok | Q-01 |

## สิ่งที่ถูกต้อง

- ขอบ `left_at = end_date` = student_inactive (ใช้ `>`) · วันที่แบบ ค.ศ. ตามที่แอปเก็บจริง
- not_in_class มาก่อน student_inactive แม้เด็กอยู่ในรายชื่อเทอมหรือมีแถวเดิม (E-18, E-19)
- batch ผสม: เด็ก active ได้ ok เด็ก moved ได้ student_inactive · dashboard/report/gradebook JSON เท่าเดิมหลังชุดที่ถูกปฏิเสธ
- op ที่เคยลงแล้วส่งซ้ำหลังเด็กย้าย = duplicate (client ลบออกจากคิว ไม่ค้างใน "ส่งไม่สำเร็จ")
- ส่งซ้ำ opId ที่ถูกปฏิเสธ = ปฏิเสธซ้ำ ไม่มีแถว/ audit

## บั๊ก

### B-01 · กลาง · ทำซ้ำได้ · AC-05/AC-08 · = R-01 · สถานะ: แก้แล้ว ตรวจซ้ำผ่าน (Verify 1)
- ทำซ้ำ: งานปีก่อน (เทอม 2/2568 มีวันจบ) ห้อง c0 มีเด็ก finished 2 คน ไม่มีแถว → POST `/api/assignments/a0/bulk` `{action:"all-submitted"}`
- ได้: `{ok:true, changed:0}` ไม่มีแถว ไม่มีข้อความ · ควรได้ (BR-02 ข้อ bulk + D23): changed 2 · เช่นเดียวกับเทอมที่จบแล้วและเด็กออกหลังวันจบ (changed 2 แทน 3)
- สาเหตุ: `worker/routes/submissions.ts` bulk เลือกรายชื่อด้วย memberClause แต่เขียนผ่าน stillValid ที่ `receive = 1` ต้อง active (main ไม่มีเงื่อนไขนี้ → regression ของงานปีเก่า)
- test: `test/api/qa-m1-02.test.ts` "B-01:" ×4 (รอบแรกเป็น it.fails ×2 + อาการปัจจุบัน ×2 → Verify 1 ปรับเป็นคาดว่าบันทึกครบ ผ่านทั้งหมด)

## ชุดเทสต์

- รอบแรก: `npx vitest run test/api/qa-m1-02.test.ts test/unit/qa-m1-02-outbox.test.ts` → 49 ผ่าน + 2 expected fail (evidence/qa-tests.txt)
- รอบแรก: `npm run typecheck` → exit 0 (evidence/qa-typecheck.txt) · `npm test` → 61/683 + 2 expected fail, exit 0 (evidence/qa-npm-test.txt; รันก่อนแก้ type ใน test QA ซึ่งไม่เปลี่ยนพฤติกรรม)
- ผลที่คาด: evidence/qa-expected-from-br.md (เขียนก่อนรัน) · ไม่ได้เปิด server (ทดสอบผ่าน Workers runtime)
- Verify 1: test QA 52/52 · typecheck exit 0 · npm test 61 ไฟล์ / 693 ผ่าน (ดูหัวข้อผลตรวจซ้ำ)

# QA report: M1-08 audit atomic (S · 🗑 👤)

## สรุปผู้บริหาร
ประวัติการแก้ไขถูกบันทึกพร้อมข้อมูลเสมอ: ถ้าประวัติล้ม ข้อมูลไม่เปลี่ยน (สร้าง/แก้นักเรียน, ลบงาน) และไม่พบ PIN รหัสผ่าน hash หรือโทเค็นใดในประวัติ ไม่พบบั๊ก

## เรื่องที่ควรแก้ก่อน
ไม่มี (บั๊ก 0). ข้อสังเกตจาก dev-notes ที่ไม่ใช่บั๊กของงานนี้: POST /api/submissions/batch ยังมี after.late เป็นค่าก่อนคิดใหม่ (known issue) · login/logout ไม่มี audit (ตั้งใจ)

## ผลตาม AC
| AC | ผล | หลักฐาน |
|---|---|---|
| AC-01 | ผ่าน | Q-01: จำลอง audit ล้มด้วย trigger -> สร้าง/แก้นักเรียน/ลบงานได้ 500 และข้อมูลเท่าเดิม ไม่มีแถว audit · สำเร็จ = ข้อมูล + 1 แถว · ลบซ้ำพร้อมกัน = 1 แถว |
| AC-02 | ผ่าน | Q-02: ค้นค่าที่รู้ (PIN, รหัสผ่านเก่า/ใหม่, hash, salt, session token 2 ใบ, qr_token เดิม/ใหม่) ในทุกแถว audit_logs และใน /api/audit = ไม่พบ · มี action pin_set/password_change/device_signout/rotate |
| AC-03 | ผ่านโดย dev test | test/api/audit-atomic.test.ts (QA ไม่ได้ทำซ้ำ) |
| AC-04 | ผ่านโดย dev test | audit-atomic.test.ts ชุด AC-04 (3 รายการ) |
| AC-05 | ผ่าน | ล้าง -> เลื่อนกำหนดส่ง -> ย้อนกลับ สำเร็จ ค่ากลับครบ (late=1) · ส่งครบ -> เลื่อน -> ย้อนกลับสำเร็จ · แก้คะแนนจริงคั่น = 409 คะแนนไม่ถูกทับ |
| AC-06 | ผ่านบางส่วน | ชุดเต็ม 76 ไฟล์ / 910 ผ่าน (baseline ≥ 74/873) · volume ดู dev evidence/volume-before-after.txt (ไม่ได้วัดซ้ำ) · หมายเหตุ README/OPERATIONS ไม่ได้ตรวจในรอบนี้ |

เพิ่มเติม: ประวัติที่ไม่ได้เข้าสู่ระบบ/คุกกี้ปลอม = 401

## สิ่งที่ถูกต้อง
สร้างนักเรียนไม่เก็บ qr_token ใน audit · QR rotate เก็บแค่ว่าเกิดขึ้น · ทุก action ผ่านโดยไม่มี secret

## บั๊ก
ไม่มี

## ชุดเทสต์
- `npx vitest run test/api/qa-m1-08.test.ts` -> 8/8 (ไฟล์ QA: test/api/qa-m1-08.test.ts)
- `npm test` -> 76 ไฟล์ / 910 ผ่าน 0 ล้ม (evidence/qa-full-suite.txt) เทียบ baseline 74/873 ไม่ถอย · ไม่ได้เปิด server (เทสต์ระดับ API; UI ไม่มีการแก้ จึงไม่มีภาพหน้าจอ)
- รอบแก้ (Verify) 0/3

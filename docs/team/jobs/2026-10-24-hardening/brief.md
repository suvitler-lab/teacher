# แก้ข้อค้นพบและแสดงความคืบหน้า — 24 ตุลาคม 2569

ผู้ใช้อนุมัติให้ดำเนินการตามรายงาน แก้ปัญหา และทำม็อกอัปเพื่อดูจำนวนข้อที่เสร็จ/รอดำเนินการ

- ฐานงาน: รายงาน 23 ต.ค. F01–F11 และ current working tree บน `main` รวมงานเดิมที่ยังไม่ commit
- เพิ่ม F12: หน้ารายงานอัปเดตตามข้อมูลจากเครื่องอื่น โดยคงระบบบันทึกทันทีและส่งคิวเมื่อเน็ตกลับมาที่มีอยู่แล้ว
- ขอบเขต: source, dependency patches, regression tests, คู่มือ, mockup และ local preview ด้วยข้อมูลสมมติ
- เป้าหมายเดิม: ครูหนึ่งคนหลายเครื่อง; iPad คอมพิวเตอร์ มือถือ; ทดลองหนึ่งห้องก่อนขยาย
- การเผยแพร่/ข้อมูลจริง: ไม่อยู่ในงานรอบนี้

## AC

| AC | เงื่อนไข |
|---|---|
| H01 | F01–F11 มีการแก้และหลักฐานตรงกับสถานะโค้ดที่ส่งมอบ |
| H02 | รายงาน refresh เมื่อเปิดค้าง/กลับหน้า/online พร้อมปุ่มและเวลาอัปเดต โดยกันคำตอบเก่าทับตัวกรองใหม่ |
| H03 | ชุดทดสอบเดิมและ regression ผ่าน, typecheck/build/preflight ผ่าน, dependency advisory ที่ตรวจพบถูกจัดการ |
| H04 | ผู้ใช้เห็นม็อกอัปและยอดแก้แล้ว/รอตรวจจริง โดยไม่เรียก local PASS ว่า deployed หรือผ่าน iPad จริง |
| H05 | รักษางานแก้ค้างเดิม ไม่ reset หรือ commit/push รวมโดยไม่ได้ตรวจ |

## เจ้าของงาน

PM รวม source/dependencies/docs/mockup; ผู้พัฒนาเดิม frontend_ux_audit และ qa_release_audit ส่งโค้ดก่อนหยุดเพราะโควตา จากนั้น PM รวมงาน; restore_hardening พัฒนา restore; frontend_verify ตรวจและเขียน frontend regressions อย่างอิสระ; backend_review ตรวจ backend/restore และเขียน regression โดยแก้เฉพาะ attendance-session epoch ที่ PM โอน ownership

ผลรวมและข้อจำกัด: [verification.md](verification.md) · สถานะแยกข้อ: [status.json](status.json)

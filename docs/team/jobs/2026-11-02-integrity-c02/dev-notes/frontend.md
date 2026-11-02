# Dev notes: Front-End (T-03) · integrity-c02

## ไฟล์ที่แก้
- `src/components/AssignmentModal.tsx` — กล่องถาม, ส่งซ้ำพร้อม `raise_choice`/`raise_from`, toast ย้อนกลับ, คืน focus
- `src/pages/Gradebook.tsx` — เฉพาะ `loadRef` + ส่ง `onReload` ให้ฟอร์มแก้ไขงาน (ขยายสิทธิ์โดย PM รอบแก้ R-01)
- `test/unit/assignment-modal-raise.test.tsx` — 11 เทสต์

## พฤติกรรม
- คำขอแรกไม่มี `raise_choice`; `409 raise_choice_required` (count>=1) เปิดกล่องถาม (Dialog เดิม, ใช้คลาสเดิม) ตัวเลขจาก server
- ปุ่ม: ยกเลิก (focus แรก) / คงไว้ from/to / ปรับเป็น to/to (primary) · ยกเลิก/Esc/แตะนอก = กลับฟอร์ม ไม่ส่งคำขอ และ focus คืนที่ปุ่มบันทึก
- กดซ้ำ: `inFlight` ref + ปุ่ม disabled → คำขอเดียว
- `full_score_changed` / error อื่น → ปิดกล่อง แสดง message ในฟอร์ม ค่าที่กรอกอยู่ครบ
- `adjust` count>=1 → toast ค้าง "บันทึกแล้ว · ปรับเป็นเต็มใหม่ N คน" + "ย้อนกลับ" (EP-04) · `modified_since` → ข้อความของเราตาม D-06
- R-01: ย้อนกลับเรียก `onReload` (Gradebook: `loadRef.current(true)` ใช้ห้อง/ตัวกรองปัจจุบันเสมอ) ไม่เรียก `onSaved` ของฟอร์มเก่า จึงไม่ปิดฟอร์มอื่น และไม่โหลดห้องเก่าทับ
- R-03: ถ้า `upsertAssignment` คืน false toast ย้อนกลับยังถูกสร้างก่อน แล้วฟอร์มแสดง error เดิม
- ไม่มี mock ที่ต้องถอด

## ผลทดสอบ
- ไฟล์นี้: 11/11 ผ่าน · ใส่โค้ดเก่า (undo เรียก onSaved) แล้วล้ม 2 เทสต์ ตามที่ต้องการ
- unit ทั้งชุด: 1126 ผ่าน / 1 ล้ม (`test/api/volume.test.ts` — งบ rows read ของ "undo the raise" 5220 > 0 เป็นงาน server T-02 ไม่ใช่ UI)
- `npm run typecheck` ผ่าน · `npm run build` ผ่าน · ยังไม่ได้รัน lint
- ภาพ before/after: ยังไม่ถ่าย (ขั้นถัดไปหลัง T-02)

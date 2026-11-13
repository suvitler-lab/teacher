# Dev notes — T-16 แผ่นตั้งเวลาคาบ S5 + กล่องยืนยัน S9-ข

- ไฟล์: `src/components/timetable/frame/{FrameSheet,FrameEditor,RemoveConfirm,frameDraft,index}` · `src/styles/timetable-frame.css` · `test/unit/tt-frame.test.tsx` (21 เทสต์)
- Export ตามสัญญา: `FrameSheet({open,onClose,returnFocus})`, `FrameEditor({onSaved})` (+ `onCancel` เสริม, ไม่ขัดสัญญา), `RemoveConfirm`
- ใช้ `ttFrame`/`saveFrame`/`removeSummary`/`describeRemoves` จาก store, `validateFrame` จาก shared · ไม่มี mock API ในโค้ดจริง · แผ่นยังไม่ถูก mount (T-19 mount `FrameSheet`, T-22 ใช้ `FrameEditor`/`FrameSheet`)
- ครบสถานะ S5: ค่าเริ่ม / ค่าจาก period_times (ป้าย) / ผิด (ต่อแถว + สรุป role=alert + โฟกัสช่องแรก) / S9-ข / กำลังบันทึก (กันกดซ้ำ) / ล้ม (ข้อมูลไม่หาย + ลองอีกครั้ง) / ออฟไลน์ (ปุ่มบันทึกปิด)
- การตัดสินเล็ก: ข้อความ S9-ข เมื่อลบหลายคาบในวันเดียว = "จะลบ N คาบของวันศุกร์: …"; ใช้ updater ใน setState กันแตะรัวแล้วค่าหาย
- ช่องเวลา native แสดง 12/24 ชม. ตามภาษาเครื่อง (Chromium ทดสอบเป็น AM/PM) — ค่าที่ส่งเป็น HH:MM เสมอ · Safari/iPad จริง = NOT RUN (D09)
- ภาพ: ใช้ harness ชั่วคราว (ลบแล้ว) เพราะยังไม่มีหน้า mount · อยู่ที่ `evidence/t16/evidence/shots/` (before = หน้าเปล่า) · ดูจริง 5 จาก 20 ภาพ
- ขอเปลี่ยนนอกขอบเขต: ไม่มี

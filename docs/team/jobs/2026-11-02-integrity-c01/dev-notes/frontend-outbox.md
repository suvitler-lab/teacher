# Dev notes: T-03 outbox already_submitted (Front-End)

- src/lib/outbox.ts: already_submitted -> outboxRemove + emit (เหมือน ok/duplicate); เพิ่มใน NON_BLOCKING; failedPairKeys ไม่รวม reason already_submitted (รายการเก่าไม่ติดเครื่องหมาย/ไม่กั้น)
- src/pages/Gradebook.tsx: onResult รับ already_submitted + submission เป็นค่าช่อง
- src/components/Overlays.tsx: REASON.already_submitted = "ส่งไปแล้ว — ไม่บันทึกซ้ำ" (รายการเก่าใน ส่งไม่สำเร็จ)
- ไม่เปลี่ยนหน้าตา ไม่มี mock

## หลักฐาน
- ก่อนแก้: c01-outbox-already-submitted.test.ts ล้ม 3/4
- หลังแก้: ผ่าน 4/4; `npm run typecheck` ผ่าน; `npx vitest run test/unit` 51 files / 522 tests ผ่าน
- ไม่ได้แก้ไฟล์เทสต์ ไม่ได้รัน lint/build/เทสต์ api (นอกขอบเขต)

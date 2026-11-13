
## T-13 EP-13 สำรอง/กู้คืน/ล้างข้อมูลรวมตารางสอน — 2026-11-13

- ทำอะไร: `timetable_slots` ท้าย BACKUP_TABLES/COLUMNS · validate ไม่บังคับให้มีใน counts · zod + กติกา SQL (missing_reference, kind_fields, wrong_school_year, duplicate_slot; rowId = term_id) · fingerprint · reset ลบก่อนตารางแม่ · TABLES ฝั่งแอป
- ไฟล์: worker/routes/backup.ts, worker/lib/restore-validation.ts, worker/routes/reset.ts, src/lib/backup.ts, src/components/RestoreModal.tsx, test/api/tt-backup.test.ts (ใหม่), restore.test.ts / restore-half-score.test.ts / backup-helpers.ts (v6→7), test/unit/backup.test.ts (13→14 ตาราง)
- คำสั่ง → ผล: `npx vitest run test/api/tt-backup test/api/restore test/api/backup test/api/reset test/unit/backup test/api/audit-restore` → 8 files / 101 tests PASS · `npx tsc --noEmit` → ผ่าน · batch commit = 37 คำสั่ง (≤ 50)
- AC: AC-44 (สำรอง→ล้าง→กู้ = 14 คาบ + frame 8 คาบ; ไฟล์ v6 → ตารางว่าง period_times จากไฟล์; แถวผิด → 422 ข้อมูลเดิมคง)
- 🗑: ใช้ฐานข้อมูลทดสอบในเครื่องเท่านั้น (evidence Q-1301 restore, Q-1302 dry-run) ไม่แตะ remote
- ข้อจำกัด: ยังไม่ได้รัน lint/เทสต์ทั้งชุด (T-12 แก้ helpers อยู่คู่ขนาน) · audit-restore-domain.test.ts อยู่นอกขอบเขต ยังใช้ v6 แต่ผ่าน
- ถึง QA: กู้ไฟล์จริงรุ่นเก่า (v6) ผ่านหน้า RestoreModal · ล้างข้อมูลแล้วตารางสอนหาย frame คงอยู่

## T-12 EP-11 / EP-12 + bootstrap + settings guard — 2026-11-13

- ทำอะไร: `GET/PUT /api/timetable` (ลำดับตรวจ 1–8 ตามสัญญา, `current` ใน 409, DELETE+INSERT json_each + rev+1 + audit 1 แถวใน batchAtEpoch เดียว พร้อม abortIf rev/ปีแก้ได้, frame, ของที่เก็บแล้ว) · `PUT /api/timetable/frame` (validateFrame, frame_removes_slots + confirmRemove, ลบคาบนอกโครงทุกภาคปีปัจจุบัน, bump rev เฉพาะภาคที่ถูกลบ, เขียน period_frame + period_times ใน batch เดียว, guard จำนวน) · `bootstrap.timetable` (ภาคเลือกใน SQL เดียวกับ Promise.all เดิม ไม่เพิ่ม round trip) · `getSettings.period_frame` · `PUT /api/settings` → `409 period_frame_owned` (abortIf เป็นคำสั่งแรกใน batch)
- ไฟล์: worker/routes/timetable.ts, worker/lib/timetable.ts (ใหม่), worker/app.ts, worker/routes/bootstrap.ts, worker/routes/catalog.ts, worker/lib/db.ts, test/api/tt-api.test.ts, test/api/tt-api-frame.test.ts (ใหม่), test/api/helpers.ts (schema 7, ลบ timetable_slots, ล้าง period_frame/period_times ระหว่างเทสต์), test/api/auth.test.ts, test/api/read-shape.golden.json (+period_frame, +timetable)
- คำสั่ง → ผล: `npx vitest run test/api` → 59 files / 857 tests PASS (รวมของ T-13) · `npx tsc --noEmit` → error เฉพาะ test/unit/tt-store.test.ts (T-14 ยังไม่เสร็จ) ไฟล์ของ T-12 ผ่าน
- AC: 02 03 04 05 06 07 08 09 10 13 14 15 16 17 40 41 42 45 (เทสต์ข้างต้น)
- ข้อจำกัด: ไม่ได้รัน lint แยก (โปรเจกต์ไม่มีสคริปต์ lint ที่ตรวจ worker; ใช้ tsc) · `frame_removes_slots` ที่เกิดจากการแข่งขันหลังตอบ (ล้มใน batch) ตอบ `removes: []` พร้อม `count` ใหม่ — แอปควร GET ใหม่ก่อนถามซ้ำ · ถ้า confirmRemove > 0 แต่ตอนนี้ไม่มีคาบนอกโครงแล้ว บันทึกต่อโดยไม่ลบ
- ถึง QA: สองเครื่องบันทึกพร้อมกัน · ลดคาบ/เอาวันออกข้ามภาค 1+2 ปีเดียวกัน (ภาคปีเก่าไม่ถูกแตะ) · แอปเก่าบันทึก settings หลังตั้งโครง (409 period_frame_owned) · กู้คืนระหว่างบันทึก

# Architecture: งานครบ

อัปเดตล่าสุด: 2026-11-13 โดย Tech Lead · งาน `2026-11-12-timetable`

> ภาพรวมทั้งระบบ (Preact + signals + hash router → Hono บน Workers → D1 · IndexedDB · service worker) และตารางส่วนประกอบเดิมอยู่ที่ `context.md` §สถาปัตยกรรม — ไฟล์นี้เริ่มในงานตารางสอน บันทึก **โมดูลที่งานหลังจากนี้เพิ่ม**

## ภาพรวมโมดูลตารางสอน

```
[ครู] → หน้า #/timetable (รูปแบบ ก/ข/ค · มือถือ = วันเดียว) ─┐
       หน้าหลัก: แถบใต้หัว (ทุกโครง) + แถวคาบ (โครง ก)  ──┤→ src/lib/timetable/ (store · logic · copy)
       ตั้งค่า › หน้าตา (รูปแบบ) · › เวลาเรียน (โครงเวลา) ─┘        │  ↕ shared/timetable.ts (โครง · ตรวจ · ข้อความ)
                                                                   ↓
            GET /api/bootstrap (timetable ภาคปัจจุบัน + settings.period_frame)
            GET|PUT /api/timetable (EP-11) · PUT /api/timetable/frame (EP-12)
                                                                   ↓
                                     D1: timetable_slots · terms.timetable_rev · settings.period_frame/period_times
```

## ส่วนประกอบ

| ส่วน | หน้าที่ | path | คุยกับ |
|---|---|---|---|
| ตัวกลางร่วม | ชนิดข้อมูล · `resolveFrame` (ค่าเริ่มต้นจาก `period_times`) · `validateFrame` / `slotIssues` ข้อความไทยชุดเดียว · `periodTimesOf` · `outsideFrame` | `shared/timetable.ts` | worker + แอป |
| API ตารางสอน | อ่าน/แทนทั้งตารางต่อภาค (รุ่น `rev`) · บันทึกโครง + ลบคาบนอกโครง + `period_times` ใน batch เดียว · audit | `worker/routes/timetable.ts`, `worker/lib/timetable.ts` | D1 (`batchAtEpoch` + `abortIf` เดิม) |
| bootstrap | ส่ง `timetable` ภาคปัจจุบัน | `worker/routes/bootstrap.ts` | แอป (แคช kv `bootstrap`) |
| สำรอง/กู้คืน/ล้าง | `timetable_slots` ใน BACKUP_TABLES · ตรวจแถว/FK/ปีห้อง · ไฟล์เก่ากู้ได้ | `worker/routes/{backup,reset}.ts`, `worker/lib/restore-validation.ts`, `src/lib/backup.ts`, `src/components/RestoreModal.tsx` | D1 |
| store ฝั่งแอป | สัญญาณตารางต่อภาค · บันทึก (ต่อคิวตามลำดับแตะ) · ย้อนค่า/409/ออฟไลน์/หมดเวลา · เลิกทำ · คัดลอก · นาฬิกา 60 วิ | `src/lib/timetable/*` | EP-11 EP-12 · `store.ts` (bootstrap) |
| ตรรกะแสดงผล | ตอนนี้/ต่อไป (BR-04) · ห้องทางลัด (BR-15) · แถบ/แถวคาบหน้าหลัก (BR-14) · สรุปคาบ/ชั่วโมง (BR-05) · วันที่แสดงบนมือถือ (BR-12) | `src/lib/timetable/logic.ts` (ฟังก์ชันบริสุทธิ์ รับ `now`) | หน้าตารางสอน · หน้าหลัก · พิมพ์ |
| หน้าตารางสอน | หัว/ตัวเลือกภาค/สถานะ · แผ่นคาบ S4 · ช่อง/เมนูของช่อง · มือถือวันเดียว · รูปแบบ ก ข ค | `src/pages/Timetable.tsx`, `src/components/timetable/{*,a,b,c}` | store |
| แผ่นตั้งเวลา S5 | ฟอร์มโครง + ยืนยันลบคาบ · ใช้ซ้ำใน ตั้งค่า › เวลาเรียน | `src/components/timetable/frame/` | store · EP-12 |
| พิมพ์ S8 | ผังแบบ ก A4 แนวนอน ขาวดำ ทุกรูปแบบ · `window.print()` | `src/components/timetable/print/`, `src/styles/timetable-print.css` | ข้อมูลที่โหลดแล้ว |
| หน้าหลัก | แถบ "ตารางสอนวันนี้" (การ์ด `timetable` ใน `home_cards` ต่อโครง) · แถวคาบในลำดับงานวันนี้ (โครง ก) | `src/components/home/TimetableStrip.tsx`, `src/components/home/a/*` | logic |
| หน้าตา | ช่อง `accent.timetable` | `src/lib/appearance.ts` | EP-07 |

## การไหลของข้อมูลหลัก

1. **เปิดแอป:** bootstrap → `timetable` (ภาคปัจจุบัน) + `settings.period_frame` → store → หน้าหลักคิดแถบ/แถวคาบทุก 60 วินาทีจากเวลาเครื่อง · ออฟไลน์ใช้ bootstrap ที่แคช
2. **แก้คาบ:** แตะช่อง → แผ่น S4 → store สร้างรายการทั้งภาคใหม่ → `PUT /api/timetable {baseRev}` → 200 แทนค่า + แคช · 409 แสดงฉบับล่าสุด · ล้ม/ออฟไลน์ย้อนค่า
3. **ตั้งโครง:** S5 → `PUT /api/timetable/frame` → ถ้ามีคาบหลุด 409 `frame_removes_slots` → ยืนยัน → ส่งซ้ำ `confirmRemove` → batch เดียว: ลบคาบ + `period_frame` + `period_times` (หน้าเช็คชื่อใช้เวลาเริ่มใหม่)

## Data model ระดับสูง

| Entity | คืออะไร | ความสัมพันธ์ |
|---|---|---|
| ตารางของภาค | ชุด `timetable_slots` + `terms.timetable_rev` | 1 ภาค : 0–56 ช่อง |
| ช่องคาบ | (วัน, คาบ) สอนห้อง หรือ กิจกรรม | → ห้อง (ปีเดียวกับภาค) · → วิชา (ไม่บังคับ) |
| โครงเวลา | setting `period_frame` ชุดเดียวของครู | ใช้ทุกภาค · เวลาเริ่มคาบ = `period_times` |

รายละเอียด schema อยู่ใน `database.md` · สัญญาใน `api-contract.part-5.md`

## ความปลอดภัย

- การยืนยันตัวตน: cookie session เดิม (`requireAuth` ทุกเส้นทาง `/api/timetable*`) · ตรวจ origin/epoch/maintenance/schema ที่ middleware เดิม
- การตรวจสิทธิ์: บัญชีครูเดียว · ภาคปีเก่าอ่านอย่างเดียวตรวจที่ server (409) · body ≤ 1MB เดิม
- ข้อมูล: ไม่มีชื่อนักเรียนในตาราง/ประวัติ/กระดาษพิมพ์ · `label` แสดงเป็นข้อความ (Preact escape) ห้าม `innerHTML`

## ข้อจำกัดและหนี้เทคนิคที่รู้

- ไม่มีปฏิทินวันหยุด/สัปดาห์สลับ · เวลาใช้นาฬิกาเครื่อง (A4) · ภาคอื่นที่ไม่ใช่ภาคปัจจุบันดูออฟไลน์ได้เฉพาะที่โหลดในรอบนั้น
- แอปรุ่นเก่าที่ค้างในเครื่องอื่นลบช่อง `accent.timetable`/การ์ด `timetable` ได้เมื่อบันทึกหน้าตา (กลับค่าเริ่มต้น ไม่เสียข้อมูล · D52 D53)

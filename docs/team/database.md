# Database: งานครบ

อัปเดตล่าสุด: 2026-11-13 โดย Tech Lead (ร่างเฟส 3 งาน `2026-11-12-timetable` — DB Specialist ยืนยัน/เติมใน T-11) · ระบบฐานข้อมูล: Cloudflare D1 (SQLite) · ฝั่งแอป: IndexedDB (`kv` · `outbox` · `failed` · `attDrafts`)

> เอกสารนี้เริ่มในงานตารางสอน บันทึก **เฉพาะส่วนที่งานนี้เพิ่ม** · ตารางเดิมทั้งหมดดู `migrations/0001`–`0007` และสรุปใน `context.md` §สถาปัตยกรรม · schema ปัจจุบัน 6 → **7** หลัง migration 0008

## ตาราง

### `timetable_slots` (ใหม่ · migration 0008)

| คอลัมน์ | ชนิด | null | default | หมายเหตุ |
|---|---|---|---|---|
| term_id | TEXT | ไม่ | | FK `terms(id)` · ตาราง 1 ชุดต่อภาค (BR-01) |
| weekday | INTEGER | ไม่ | | 1 = จันทร์ … 7 = อาทิตย์ · CHECK 1–7 |
| period | INTEGER | ไม่ | | CHECK 1–8 (BR-02 · Q5) |
| kind | TEXT | ไม่ | | `'class'` สอนห้อง · `'activity'` กิจกรรม |
| class_id | TEXT | ได้ | | FK `classes(id)` · บังคับเมื่อ `kind='class'` |
| subject_id | TEXT | ได้ | | FK `subjects(id)` · ไม่บังคับ · ต้อง null เมื่อ `kind='activity'` |
| label | TEXT | ได้ | | ชื่อกิจกรรม 1–40 ตัว (ตัดช่องว่างแล้ว) · ต้อง null เมื่อ `kind='class'` |
| updated_at | INTEGER | ไม่ | | ms · เวลาบันทึกครั้งล่าสุด (fingerprint สำรอง) |

- PK: `(term_id, weekday, period)` → ช่องหนึ่งมีได้ 1 รายการ (BR-03) · ตารางมี rowid (ไม่ใช้ WITHOUT ROWID) เพราะการสำรองแบ่งหน้าด้วย rowid
- CHECK: `(kind='class' AND class_id IS NOT NULL AND label IS NULL) OR (kind='activity' AND class_id IS NULL AND subject_id IS NULL AND label IS NOT NULL AND length(trim(label)) BETWEEN 1 AND 800)` (ขอบบนเป็นเพียงกันค่าเพี้ยน — ความยาวจริง 40 grapheme ตรวจที่ shared/validator; นับ code point ไม่ได้ เพราะอีโมจิ 1 ตัวหลาย code point)`
- Index: `idx_timetable_slots_class(class_id)` — ตรวจห้องที่ถูกอ้าง/ห้องปีอื่นตอนกู้คืน · PK ครอบคลุมการอ่านต่อภาค (`WHERE term_id = ?`) และ counts (`GROUP BY term_id`)
- กฎที่ไม่อยู่ใน schema (ตรวจที่ EP-11/EP-12): ห้องต้องเป็นปีของภาค · ของที่เก็บแล้วห้ามในคาบใหม่/เปลี่ยน · คาบต้องอยู่ในโครงเวลา · ภาคปีเก่าอ่านอย่างเดียว
- ลบแถว: เฉพาะ EP-11 (แทนทั้งภาค) · EP-12 (คาบนอกโครงของปีปัจจุบัน) · กู้คืน · ล้างข้อมูล — ไม่มีการลบห้อง/วิชา/ภาคถาวรในแอป (A2) จึงไม่ใช้ ON DELETE CASCADE

### `terms` (เพิ่มคอลัมน์)

| คอลัมน์ | ชนิด | null | default | หมายเหตุ |
|---|---|---|---|---|
| timetable_rev | INTEGER | ไม่ | 0 | รุ่นของตารางภาคนี้ · +1 ทุกการบันทึก EP-11 และเมื่อ EP-12 ลบคาบของภาคนี้ (D50) · ไม่อยู่ใน COLUMNS ของสำรอง → 0 หลังกู้คืน |

- `POST /api/terms` (upsert เดิม) ระบุคอลัมน์ชัด จึงไม่แตะ `timetable_rev`

### `settings` (คีย์ใหม่ ไม่ใช่ schema)

| key | ค่า | เขียนโดย |
|---|---|---|
| `period_frame` | JSON `{"v":1,"rev":n,"periods":[{"start","end"}],"breaks":[{"name","start","end"}],"days":[1..7]}` · `""`/ไม่มี = ยังไม่เคยตั้ง | EP-12 เท่านั้น (D49) |
| `period_times` (เดิม) | `{"1":"08:30",…}` = เวลาเริ่มคาบของโครง | EP-12 เขียนพร้อม `period_frame` · settings เขียนได้เฉพาะตอนยังไม่มีโครง |

## Migrations

| ไฟล์ | วันที่ | ทำอะไร | ย้อนกลับอย่างไร | รันแล้วที่ |
|---|---|---|---|---|
| `0008_timetable.sql` | 2026-11-13 (T-11) | `ALTER TABLE terms ADD COLUMN timetable_rev INTEGER NOT NULL DEFAULT 0` · `CREATE TABLE timetable_slots` + `idx_timetable_slots_class` · `UPDATE meta SET value='7' WHERE key='schema_version'` | ไม่มี down migration (แนวเดิมของโปรเจกต์) · **ทางหลัก:** กู้จากสำเนา/ไฟล์สำรองก่อน migrate + deploy รุ่นก่อน · **ทางมือ (ต้องอนุมัติ):** `DROP INDEX idx_timetable_slots_class; DROP TABLE timetable_slots; ALTER TABLE terms DROP COLUMN timetable_rev; UPDATE meta SET value='6' WHERE key='schema_version'; DELETE FROM d1_migrations WHERE name='0008_timetable.sql';` (บรรทัดสุดท้ายจำเป็น ไม่งั้น `migrations apply` ข้าม 0008) · ซ้อมแล้วผลนับแถวเท่าก่อน migrate | **local เท่านั้น** (wrangler `--local` บนสำเนา + เทสต์ `test/api/tt-migration.test.ts`) · remote/production: ยังไม่รัน — ต้องอนุมัติเจ้าของงานที่ Gate 3 |

## Seed / ข้อมูลทดสอบ

- `scripts/fixture-server.cjs` (T-11) · `node scripts/fixture-server.cjs --timetable --port 4102` (ชุด `timetable` · self-check นับคาบแล้วว่า 14/14/6): "ตารางจริง" 14 คาบของภาค 2/2569 (สอน 9 = คณิตศาสตร์ 8 + ดนตรี 1 · กิจกรรม 5 ตาม requirements) · ภาค 1/2569 14 คาบ (คัดลอก AC-37) · ภาค 2/2568 ปีเก่า + ห้องปีเก่า (AC-08) · โครงเวลาค่าเริ่มต้น · **ข้อมูลสมมติเท่านั้น ห้ามใช้ชื่อบุคคลจากรูปอ้างอิง**

## Backup และกู้คืน

- ไฟล์สำรองรวม `timetable_slots` (ต่อท้าย BACKUP_TABLES) + settings เดิม (โครงเวลา, `accent`) · ไฟล์รุ่นเก่าไม่มีตาราง = กู้ได้ ตารางว่าง (EP-13 · D54)
- ก่อน migration บน production: ครูกด "สำรองข้อมูล" ในแอปรุ่นปัจจุบัน + เก็บไฟล์ไว้ · ขั้นตอน migrate/deploy อยู่ใน `docs/OPERATIONS.md` (DevOps/เจ้าของงาน Gate 3)

## การซ้อม 🗑 (T-11 · local)

- dry-run → migrate 0008 → กู้จากสำเนา → migrate ซ้ำ: นับแถวทุกตารางหลักก่อน = หลัง (terms 1 · classes 3 · subjects 2 · students 40 · assignments 5 · attendance 160 · submissions 88 · settings 10) · รายละเอียด `jobs/2026-11-12-timetable/evidence/t11-migration-dry-run.txt`
- **ข้อควรระวัง:** D1 local เป็นโหมด WAL — คัดลอกไฟล์ `.sqlite` ตรง ๆ **ไม่ใช่สำรอง** (ได้ไฟล์ว่าง ~4 KB) ใช้ `VACUUM INTO` หรือ `wrangler d1 export` (บน Windows ล้ม: libuv assert) · production ใช้ปุ่ม "สำรองข้อมูล" ในแอป + D1 Time Travel
- ข้อกำหนดที่ตกค้างให้ PM: `test/api/helpers.ts` (`reset()` เขียน `schema_version='6'`) และ `test/api/auth.test.ts` (`schema: 6`) ไม่อยู่ในขอบเขตใคร — ต้องเปลี่ยนเป็น 7 พร้อม `SCHEMA_VERSION = 7` ไม่งั้นเทสต์ API ทุกตัวได้ 503 · `reset()` ต้องลบ `timetable_slots` ก่อน `subjects`/`classes`/`terms` (FK)

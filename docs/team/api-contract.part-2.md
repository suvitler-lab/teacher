# API Contract: งานครบ — ส่วนที่ 2

เวอร์ชัน: v10 (ร่าง) · 2026-11-12 · งาน `2026-11-11-home-redesign` เฟส 3 · ต่อจาก `api-contract.md` (v9.2 — ไฟล์นั้นเกินงบแล้ว เพิ่มที่นี่) · กติกาทั่วไป/รูปแบบ error ตามส่วนที่ 1 · แก้ได้เฉพาะ Tech Lead

สรุป: ช่วงหน้าเว็บของงานนี้ **ไม่เปลี่ยน server** — EP-07 (v10) เป็นรูปแบบค่าฝั่ง client ในคีย์เดิม · EP-09 ถึง EP-11 เป็น **ร่างสำหรับงานแยก A/B/C** ยังไม่สร้าง

## Endpoints

### EP-07 (v10) `PUT /api/settings` — รูปแบบค่าหน้าตาในคีย์เดิม `accent` + `home_cards` ต่อโครง (D41)

- server: **ไม่แก้** (`accent` และ `home_cards` อยู่ใน `ALLOWED_SETTINGS` และ `getSettings` แล้ว · server เก็บข้อความตามที่ส่ง) · ไม่มี migration · ปล่อยแอปอย่างเดียว
- `accent` (string) = JSON ของหน้าตา:

```json
{ "v": 1, "skin": "warm", "layout": "a" }
```

| ช่อง | ค่าที่รับ | ค่าเริ่มต้น (ว่าง/อ่านไม่ได้/ไม่รู้จัก) |
|---|---|---|
| `skin` | `"pro"` มืออาชีพ · `"warm"` อบอุ่น · `"playful"` สดใส | `"warm"` |
| `layout` | `"a"` วันนี้ของครู · `"b"` แผงรายห้อง · `"c"` โฟกัสงานถัดไป | `"a"` |

  - ค่าเดิมของทุกบัญชีคือ `"blue"` (ไม่ใช่ JSON) → อบอุ่น + ก (AC-06) · ช่องหนึ่งผิดไม่ทำให้อีกช่องตกค่าเริ่มต้น (`{"v":1,"skin":"luxe","layout":"b"}` → อบอุ่น + ข)
  - ตัวแปลอยู่ที่ client เท่านั้น: `src/lib/appearance.ts` → `parseAppearance(raw): { skin, layout }` · `serializeAppearance(a): string`
- โหมดสว่าง/มืด = คีย์ `theme` เดิม (`system|light|dark`) ไม่สร้างค่าซ้ำ (A2)
- `home_cards` (string) = รูปแบบ v1 เดิม **+ ช่องต่อโครง** (แอปรุ่นเก่าอ่าน `order`/`hidden` ได้เหมือนเดิม):

```json
{ "v": 1, "order": ["open","att","follow","due","absent","classes","queue","backup","term"], "hidden": ["classes","queue","backup","term"],
  "a": { "order": ["progress","follow","absent","due","classes"], "hidden": [] },
  "b": { "order": ["follow","absent"], "hidden": [] },
  "c": { "order": ["attendance","works","follow"], "hidden": [] } }
```

  - การ์ดที่ปรับได้ต่อโครงตาม BR-12 (ชื่อคีย์ภาษาอังกฤษ Front-End ตั้งใน `src/lib/homeLayout.ts` แล้วบันทึกในเทสต์) · ส่วนที่ล็อกไม่อยู่ในรายการ · ตัวแปลใช้ `parseLayout` เดิม (`cardLayout.ts`) ต่อโครง: คีย์ไม่รู้จักทิ้ง การ์ดใหม่ต่อท้าย · ไม่มีช่องโครง = ค่าเริ่มต้นของโครงนั้น
  - แอปรุ่นใหม่บันทึกต้องคง `order`/`hidden` เดิมที่อ่านมาไว้ทุกครั้ง
- การบันทึก (`src/lib/appearance.ts` `saveAppearance(next)`): เปลี่ยนหน้าจอทันที → `PUT /api/settings` ครั้งเดียวรวมคีย์ที่เปลี่ยน (`accent`, `theme`, `home_cards`) → สำเร็จ "บันทึกแล้ว · ใช้ทุกเครื่อง" · ล้ม = ย้อนทุกคีย์ของคำขอนั้น + "บันทึกหน้าตาไม่สำเร็จ" · `navigator.onLine === false` = ไม่ส่ง ย้อนทันที + "ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์" · ไม่เข้าคิว (D38) · คำขอต่อกันตามลำดับการแตะ (แบบ `saveHomeCards` เดิม)
- โหลด: ระบายสีจากค่าที่จำในเครื่องก่อน (`ngankrob-skin`, `ngankrob-layout`, `ngankrob-theme`) → ใช้ค่าจาก `GET /api/bootstrap` **ครั้งแรกของการเปิดแอปเท่านั้น** (AC-03 ไม่สลับกลางจอ) แล้วเขียนทับค่าที่จำ
- ผลต่อ "คืนค่าเริ่มต้น"/"ล้างข้อมูลทั้งหมด": ค่า setting กลับค่าเริ่มต้นตามกลไกเดิม → อบอุ่น + ก

### EP-07 (v10) การ์ดใหม่ใน `<page>_cards` เดิม

- การ์ดใหม่ของแต่ละหน้า = คีย์ใหม่ใน `order`/`hidden` ของคีย์เดิม (`scan_cards` `attendance_cards` `random_cards` `gradebook_cards` `reports_cards` `students_cards` `settings_cards`) · ประกาศใน `src/lib/pageCards.ts` · ค่าที่บันทึกก่อนอัปเดตได้การ์ดใหม่ต่อท้ายโดยอัตโนมัติ (`parseLayout`) ปิด/เปิดตาม `off` ของหน้า
- หน้ารายงาน: การ์ด "ขาดบ่อย" คีย์ `absent` **ไม่อยู่ใน `off`** (เปิดตั้งแต่แรก ทั้งผู้ใช้ใหม่และเดิม — คำตอบเจ้าของงาน 2026-11-12) · หน้าสแกน: "ยังไม่ส่ง" เปิดเริ่มต้น (A6) · ชื่อคีย์อื่นตั้งใน task ของหน้านั้น
- server ไม่ตรวจรายชื่อการ์ด (ยืนยันจาก `catalog.ts` PUT เก็บ `String(v)`) → ไม่ต้องปล่อย server ก่อน

### ค่าในเครื่อง (localStorage · ไม่ซิงก์ · ไม่ใช่ API) — ทะเบียน D44

| คีย์ | ค่า | เจ้าของ |
|---|---|---|
| `ngankrob-skin` · `ngankrob-layout` | สำเนาของ `accent` ไว้ระบายสีทันที | `appearance.ts` |
| `ngankrob-theme` (เดิม) | `system\|light\|dark` | `theme.ts` |
| `ngankrob-hide-names` (เดิม) | `"1"` หรือไม่มี | หน้าหลัก |
| `ngankrob-hide-names-{scan,attendance,random,gradebook,reports,students}` | `"1"`/`"0"` · ไม่มี = คัดจากหน้าหลักครั้งเดียว | `hideNames.ts` |
| `ngankrob-pj-hide-names` `ngankrob-pj-size` `ngankrob-pj-theme` (เดิม) | ค่าฉายจอ แยกจากปุ่มของหน้า | `projector.ts` |
| `ngankrob-random-tick` | `"1"` เปิด · ไม่มี = ปิด | หน้าสุ่มชื่อ |
| `ngankrob-font-size` `ngankrob-density` `ngankrob-students-sort` `ngankrob-att-class` (เดิม) | ตามเดิม | เดิม |

ปุ่ม "ล้างค่าที่จำไว้ในเครื่องนี้" (BR-60) ลบเฉพาะคีย์ในตารางนี้ผ่าน `src/lib/localPrefs.ts` — ไม่แตะ IndexedDB (คิวรอส่ง/แคช) และการเข้าสู่ระบบ

### EP-09 `GET /api/attendance/absent-streaks` — นักเรียนขาดติดกัน (ร่าง · วางแผน — ยังไม่สร้าง · งานแยก A)

- ใช้กับ: AC-41 ป้าย "ขาดติดกัน N วัน" ในการ์ดต้องติดตามของหน้าหลัก + ชิปใน "ใครไม่มา" หน้าเช็คชื่อ (P8)
- query: `date` (YYYY-MM-DD วันนี้ตามเวลาไทย ไม่ส่ง = วันนี้ของ server) · `min` (จำนวนเต็ม ≥ 2 ค่าเริ่มต้น 2)
- 200:

```json
{ "date": "2026-11-12", "streaks": [ { "classId": "c1", "studentId": "s5", "days": 3, "since": "2026-11-07" } ] }
```

- นิยาม (BR-11): ต่อเด็ก `active` ของห้องปีปัจจุบัน ไล่วันเช็คชื่อ **รายวัน** (`attendance_sessions.subject_id IS NULL AND period IS NULL`) ของห้องนั้นย้อนจาก `date` · `absent` = นับต่อ · สถานะอื่น (มา/สาย/ลา/ป่วย) = หยุด · วันที่ห้องไม่ได้เช็ค = ข้าม (ไม่ตัด) · ส่งเฉพาะ `days ≥ min` · ย้อนไม่เกิน 30 วันเช็คชื่อ
- error: 401 `unauthorized` · 422 `validation` (date/min ผิดรูป)
- ปล่อย: server ก่อนแอป · แอปที่ได้ 404 (server เก่า) = ไม่แสดงป้าย ส่วนอื่นทำงานปกติ · ไม่มี migration (ใช้ index เดิมของ `attendance_sessions(date, class_id, …)`)

### EP-10 `GET /api/stats/daily-submissions` — ส่งงาน 7 วันเรียนล่าสุด (ร่าง · วางแผน — ยังไม่สร้าง · งานแยก B)

- ใช้กับ: AC-42 การ์ดแนวโน้มโครง ข/ค (เพิ่มเข้ารายการ BR-12 เมื่องาน B ปล่อย)
- query: `days` (1–14 ค่าเริ่มต้น 7) · `term` (id ภาคเรียน ไม่ส่ง = ปัจจุบัน)
- 200:

```json
{ "days": [ { "date": "2026-11-06", "count": 41 }, { "date": "2026-11-07", "count": 12 } ] }
```

- นิยาม (BR-11): วันเรียน = วันที่มีการเช็คชื่อหรือมีการส่งงานอย่างน้อย 1 แถว ≤ วันนี้ · เอา `days` วันล่าสุด เรียงเก่า→ใหม่ · `count` = แถว `submissions.status = 'submitted'` ของงานในภาคเรียนนั้น ทุกห้อง ตามวันที่รับตามเวลาไทย (`event_at` ถ้ามี ไม่งั้น `submitted_at` — กติกาเดียวกับการตัดสินส่งช้า) · วันเรียนน้อยกว่า `days` = ส่งเท่าที่มี
- error: 401 · 422 · ปล่อย: server ก่อนแอป · 404 = ไม่มีการ์ด · ไม่มี migration

#### (ร่างเดิม EP-11 — ยกเลิก 2026-11-13) ตารางสอนรายคาบ

- ร่างนี้ (`class_id NOT NULL` · ไม่มีเวลาคาบ/พัก · ≤ 7 × 12 แถว · ล่าสุดชนะ) **ใช้ไม่ได้** กับ requirements ของงาน `2026-11-12-timetable` → สัญญาจริง **EP-11 / EP-12 / EP-13 อยู่ใน `api-contract.part-5.md` (v11)** · ID EP-11 ใช้ต่อในส่วนที่ 5 (ไม่นำไปใช้กับเรื่องอื่น)

## Changelog

| เวอร์ชัน | วันที่ | เปลี่ยน | เหตุ | กระทบ |
|---|---|---|---|---|
| v11 | 2026-11-13 | ร่าง EP-11 ยกเลิก → สัญญาจริงย้ายไป `api-contract.part-5.md` (EP-11 EP-12 EP-13 + EP-07 v11) | 2026-11-12-timetable เฟส 3 · D48 | ดู changelog ใน part-5 |
| v10 (ร่าง) | 2026-11-12 | EP-07: รูปแบบค่า `accent` (หน้าตา) + `home_cards` ต่อโครง + การ์ดใหม่ใน `*_cards` · ทะเบียนค่าในเครื่อง · ร่าง EP-09 EP-10 EP-11 | home-redesign เฟส 3 · D41 D44 D47 | server ไม่เปลี่ยนในงานนี้ · แอปเก่าอ่าน `home_cards` ได้ ไม่อ่าน `accent` · EP-09–11 สร้างในงานแยก A/B/C |

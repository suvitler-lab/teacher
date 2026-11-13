# API Contract: งานครบ — ส่วนที่ 5 (ตารางสอน · v11.1)

เวอร์ชัน: **v11.1 (สัญญาสำหรับสร้าง · แก้หลัง code review)** · 2026-11-13 · งาน `2026-11-12-timetable` เฟส 3 + Verify รอบแก้ 1 · โดย Tech Lead · กติกาทั่วไป/รูปแบบ error/epoch ตามส่วนที่ 1 (`api-contract.md`) · **แทนร่าง EP-11 เดิมใน part-2** · ID ของ EP เป็นของทั้งโปรเจกต์ · แก้ได้เฉพาะ Tech Lead · ข้อตัดสินใจ D48–D59

## สรุป

| EP | เส้นทาง | ทำอะไร | AC หลัก |
|---|---|---|---|
| EP-11 | `GET /api/timetable` · `PUT /api/timetable` (+ ฟิลด์ `timetable` ใน `GET /api/bootstrap`) | อ่าน/แทนทั้งตารางของ 1 ภาคเรียน · มีรุ่น (`rev`) กันทับกันข้ามเครื่อง | 01–10 18–43 45 49–55 57 60–64 |
| EP-12 | `PUT /api/timetable/frame` | บันทึกโครงเวลา (คาบ 1–8 เริ่ม/จบ · พัก 0–3 · วันเรียน) + ลบคาบนอกโครงในคำขอเดียว + เขียน `period_times` ให้ตรงกัน | 11–17 45 49 |
| EP-13 | `GET /api/backup` · `POST /api/restore/*` · `POST /api/admin/reset` (ส่วนที่เปลี่ยน) | ตารางสอนอยู่ในไฟล์สำรอง · ไฟล์รุ่นเก่ากู้ได้ · ล้างข้อมูลลบตารางด้วย | 44 |
| EP-07 (v11) | `PUT /api/settings` | คีย์อ่านอย่างเดียว `period_frame` · กัน `period_times` เขียนทับโครง · `accent.timetable` · การ์ด `timetable` ใน `home_cards` | 12 13 17 46–48 52 56 57 64 65 |

"ตอนนี้/ต่อไป" ห้องทางลัด แถบใต้หัว แถวคาบหน้าหลัก สรุปคาบ/ชั่วโมง คัดลอกจากภาคก่อน และพิมพ์ **คิดที่แอป** จากข้อมูลของ EP-11/EP-12 — ไม่มี endpoint แยก (D48)

## ชนิดข้อมูลร่วม — `shared/timetable.ts` (ใหม่ · ใช้ทั้ง worker และแอป)

```ts
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;          // ISO: 1 = จันทร์ … 6 = เสาร์ 7 = อาทิตย์
export type SlotKind = "class" | "activity";
export interface Slot {                                    // ช่อง (วัน, คาบ) ที่มีรายการ — ช่องว่าง = ไม่มีแถว
  weekday: Weekday; period: number;                        // period 1–8
  kind: SlotKind;
  classId: string | null; subjectId: string | null;        // class ⇒ classId บังคับ subjectId ไม่บังคับ · activity ⇒ ทั้งคู่ null
  label: string | null;                                    // activity ⇒ 1–40 ตัวหลังตัดช่องว่างหัวท้าย · class ⇒ null
}
export interface Period { start: string; end: string }     // "HH:MM" 24 ชม. ศูนย์นำหน้า
export interface Break { name: string; start: string; end: string } // name 1–20 ตัว
export interface FrameInput { periods: Period[]; breaks: Break[]; days: Weekday[] } // periods.length = จำนวนคาบ (1–8)
export interface Frame extends FrameInput { v: 1; rev: number; saved: boolean }     // saved=false = ยังไม่เคยตั้ง (ค่าเริ่มต้น)
export interface TimetablePayload { termId: string; rev: number; readOnly: boolean; slots: Slot[] }
export interface FrameIssue { code: string; field: string; period?: number; message: string }
export interface SlotIssue { code: string; weekday: number; period: number; message: string }
export const MAX_PERIODS = 8, MAX_BREAKS = 3, LABEL_MAX = 40, BREAK_NAME_MAX = 20, MAX_SLOTS = 56;

export function resolveFrame(periodFrame: string | undefined, periodTimes: string): Frame;
export function validateFrame(f: FrameInput): FrameIssue[];             // [] = ผ่าน · ข้อความตามตารางด้านล่าง
export function serializeFrame(f: FrameInput, rev: number): string;     // ค่าที่เก็บใน setting `period_frame`
export function periodTimesOf(f: FrameInput): string;                   // {"1":"08:30","2":"09:30",…} ตามจำนวนคาบ
export function outsideFrame(slots: Slot[], f: FrameInput): Slot[];     // วันไม่อยู่ใน days หรือ period > จำนวนคาบ
export function slotIssues(slots: Slot[], f: FrameInput): SlotIssue[];  // ตรวจรูปแบบ (ไม่แตะฐานข้อมูล)
export function normalizeSlots(slots: Slot[]): Slot[];                  // ตัดช่องว่าง label · เรียง weekday, period
```

**`resolveFrame` (BR-02 · AC-11 AC-12 · D55 D56):** `period_frame` เป็น JSON `v:1` ที่ `validateFrame` ผ่าน → ใช้ค่านั้น (`saved: true`, `rev` ตามที่เก็บ) · ว่าง/อ่านไม่ได้/ไม่ผ่าน → โครงจาก `period_times` ด้านล่าง `saved: false` · `rev` = rev ที่เก็บถ้า JSON อ่านได้และ `rev` เป็นจำนวนเต็ม ≥ 0 ไม่งั้น `0` (ไม่ย้อน rev · D56) · **ค่าเริ่มต้นล้วน:** 7 คาบ 08:30–09:30 … 15:30–16:30 · พัก `พักกลางวัน` 11:30–12:30 · `days: [1,2,3,4,5]`
- **จาก `period_times` (D55):** (1) นับเฉพาะคีย์ `"1"`–`"8"` ที่เป็น "HH:MM" ถูกต้อง (2) จำนวนคาบ N = max(7, คีย์ที่ถูกต้องสูงสุด) (3) เริ่มคาบ k = ค่าในคีย์ k ถ้ามี ไม่มี = เวลาเริ่มค่าเริ่มต้นของคาบนั้น (4) เวลาเริ่มไม่เพิ่มขึ้นทุกคาบ → ใช้ค่าเริ่มต้นล้วน (5) L = min(60, ระยะห่างน้อยสุดของเวลาเริ่มคาบติดกันที่ทั้งคู่มาจาก `period_times`; ไม่มีคู่ = 60) · จบคาบ k = min(เริ่ม k + L, เริ่ม k+1) · คาบสุดท้าย = เริ่ม + L (ไม่เกิน 23:59) (6) พักกลางวัน 11:30–12:30 ถ้าไม่ทับคาบ · ทับ → ช่องว่างระหว่างคาบที่ยาวสุดและ ≥ 20 นาที (เท่ากันเลือกช่องแรก) ชื่อ `พักกลางวัน` · ไม่มี = `breaks: []` (7) ผลไม่ผ่าน `validateFrame` → ค่าเริ่มต้นล้วน
- ตัวอย่าง `{"1":"08:00","2":"09:00"}` → คาบ 1 08:00–09:00 · คาบ 2 09:00–10:00 · คาบ 3 10:30–11:30 (7 คาบ · พัก 11:30–12:30)
- ตัวอย่างคาบละ 50 นาที `{"1":"08:30","2":"09:20","3":"10:10","4":"11:00","5":"13:00","6":"13:50","7":"14:40","8":"15:30"}` → 8 คาบ L = 50: 08:30–09:20 · 09:20–10:10 · 10:10–11:00 · 11:00–11:50 · 13:00–13:50 · 13:50–14:40 · 14:40–15:30 · 15:30–16:20 · พัก `พักกลางวัน` 11:50–13:00 · `validateFrame` = []
- แอปถือว่า **โครงเสีย** เมื่อ `settings.period_frame` ไม่ว่างแต่ผลมี `saved: false` (D56)

**`validateFrame` — รหัสและข้อความ (ข้อความตรงตัว ใช้ทั้ง 422 และหน้าจอ · AC-14 AC-17):** เวลาเปรียบเทียบแบบช่วงครึ่งเปิด `[start, end)` · ส่งคืนทุกจุดที่ผิด เรียง จำนวนคาบ → คาบ → พัก → วัน

| code | field | message |
|---|---|---|
| `period_count` | `periods` | ตั้งได้ 1–8 คาบ |
| `bad_time` | `periods.{i}.start` / `.end` / `breaks.{i}.start` / `.end` | ใส่เวลาแบบ 08:30 |
| `end_not_after_start` | `periods.{i}.end` / `breaks.{i}.end` | เวลาจบต้องหลังเวลาเริ่ม |
| `period_order` | `periods.{i}.start` | คาบ {n} ต้องเริ่มหลังคาบ {n-1} จบ ({end ของคาบ n-1}) |
| `break_count` | `breaks` | ตั้งช่วงพักได้ไม่เกิน 3 ช่วง |
| `break_name` | `breaks.{i}.name` | ชื่อช่วงพัก 1–20 ตัวอักษร |
| `break_overlaps_period` | `breaks.{i}` | {ชื่อพัก}ทับคาบ {n} ({start}–{end}) — เช่น "พักทับคาบ 3 (10:30–11:30)" |
| `break_overlaps_break` | `breaks.{i}` | ช่วงพักทับกัน ({ชื่อ} กับ {ชื่อ}) |
| `no_days` | `days` | เลือกวันเรียนอย่างน้อย 1 วัน |
| `bad_day` | `days` | วันเรียนไม่ถูกต้อง |

ช่วงพักวางที่เวลาใดก็ได้ที่ไม่ทับคาบ/พักอื่น · แสดงตามเวลา (เต็มแถวทุกวัน) · `days` ไม่ซ้ำ เรียงจากน้อยไปมาก (ฝั่ง server เรียงให้)

**`slotIssues` — รหัสและข้อความ (AC-04 AC-05):** `duplicate_slot` "มีคาบนี้ซ้ำในคำขอ" · `outside_frame` "คาบนี้อยู่นอกโครงเวลา" · `class_required` "เลือกห้อง" · `label_required` "ใส่ชื่อกิจกรรม" · `label_too_long` "ไม่เกิน 40 ตัวอักษร" · `kind_fields` "คาบกิจกรรมไม่มีห้องหรือวิชา" (activity ที่ส่ง classId/subjectId หรือ class ที่ส่ง label)

## Endpoints

### EP-11 `GET /api/timetable` · `PUT /api/timetable` — ตารางสอนของ 1 ภาคเรียน (แทนร่างเดิม · BR-01 BR-03 BR-06 BR-09 BR-10)

- server: `worker/routes/timetable.ts` (ใหม่) + `worker/lib/timetable.ts` (SQL) · ผู้เรียก: `src/lib/timetable/store.ts` · ต้องล็อกอิน (`requireAuth`) · ตาราง `timetable_slots` + คอลัมน์ `terms.timetable_rev` (migration 0008 · ดู `database.md`)
- **ภาคที่แก้ได้:** ภาคที่ `year` = ปีของภาคปัจจุบัน (`terms.is_current = 1`; ไม่มีภาคปัจจุบัน = ปีของภาคล่าสุดตามลำดับ `year DESC, term DESC` แบบเดียวกับ bootstrap) · ภาคปีอื่น `readOnly: true`

**GET** `?term=<termId>` (ไม่ส่ง = ภาคปัจจุบันตามกติกาเดียวกัน)

```json
{ "termId": "t2569-2", "rev": 7, "readOnly": false,
  "slots": [ { "weekday": 1, "period": 2, "kind": "class", "classId": "c2", "subjectId": "s1", "label": null },
             { "weekday": 1, "period": 7, "kind": "activity", "classId": null, "subjectId": null, "label": "PLC กลุ่มสาระ" } ],
  "frame": { "v": 1, "rev": 3, "saved": true, "periods": [ { "start": "08:30", "end": "09:30" } ],
             "breaks": [ { "name": "พักกลางวัน", "start": "11:30", "end": "12:30" } ], "days": [1,2,3,4,5] },
  "counts": [ { "termId": "t2569-1", "slots": 14 }, { "termId": "t2569-2", "slots": 14 } ] }
```

- `slots` เรียง weekday, period · ตารางว่าง = `[]` (AC-24 AC-33) · ส่ง **ทุกแถวที่เก็บ** รวมคาบนอกโครงของภาคปีเก่า (BR-08: แอปแสดง/พิมพ์เฉพาะคาบในโครง) · คาบที่อ้างห้อง/วิชาที่เก็บแล้วส่งตามปกติ (แอปดู `archived` จาก bootstrap)
- `frame` = `resolveFrame(settings.period_frame, settings.period_times)` (ค่าเดียวกับที่แอปคิดจาก bootstrap)
- `counts` = จำนวนคาบต่อภาค เฉพาะภาคที่มี ≥ 1 คาบ (ปุ่ม "คัดลอกจากภาค … (14 คาบ)" · BR-07)
- Errors: `401 unauthorized` · `404 no_term` "ยังไม่มีภาคเรียน — สร้างภาคเรียนก่อนกรอกตารางสอน" (ไม่มีภาคเลย · AC-10) · `404 term_not_found` "ไม่พบภาคเรียนนี้"
- อ่าน D1: ≤ 4 คำสั่ง (term · slots ของภาค · counts GROUP BY · settings 2 คีย์) · ≤ 56 + จำนวนภาค แถว

**PUT** body — แทนทั้งตารางของภาคนั้นทุกครั้ง (เพิ่ม/แก้/ลบ/เลิกทำ/ล้าง/คัดลอก):

```json
{ "termId": "t2569-2", "baseRev": 7, "reason": "edit", "slots": [ /* Slot ทั้งหมดของภาคหลังเปลี่ยน ≤ 56 */ ] }
```

- `reason`: `"edit" | "undo" | "clear" | "copy"` (ไม่ส่ง = `"edit"`) ใช้ในประวัติเท่านั้น · `baseRev` = `rev` ที่หน้าจอเห็นล่าสุด
- **ลำดับการตรวจ (ข้อแรกที่เข้า = คำตอบ · ไม่มีอะไรถูกเขียนในทุกกรณีที่ไม่ใช่ 200):**

| # | เงื่อนไข | ผล |
|---|---|---|
| 1 | body ผิดรูป (zod: termId 1–100 · baseRev int ≥ 0 · slots ≤ 56 · weekday 1–7 · period 1–8 · kind enum · label string ≤ 200 หรือ null) | `422 validation` + `issues` |
| 2 | ไม่พบภาค | `404 term_not_found` |
| 3 | ภาคปีอื่น (`readOnly`) | `409 term_read_only` "ภาคเรียนของปีการศึกษาที่ผ่านมา ดูได้อย่างเดียว" (AC-08) |
| 4 | `baseRev` ≠ `terms.timetable_rev` | `409 timetable_changed` "ตารางสอนถูกแก้จากเครื่องอื่น — โหลดฉบับล่าสุดแล้ว ลองแก้อีกครั้ง" + `current: TimetablePayload` (AC-41) |
| 5 | `slotIssues(slots, โครงปัจจุบัน)` ไม่ว่าง | `422 bad_timetable` + `issues: SlotIssue[]` (AC-04 AC-05) |
| 6 | อ้างฐานข้อมูล: ห้องไม่มี (`class_not_found` "ไม่พบห้องนี้") · ห้องไม่ใช่ปีของภาค (`class_wrong_year` "ห้องนี้ไม่ได้อยู่ในปีการศึกษา {ปี}" — ห้อง `year IS NULL` ถือเป็นปีปัจจุบันตาม `classInTermYear`) · วิชาไม่มี (`subject_not_found`) · **คาบใหม่หรือเปลี่ยน** ที่อ้างห้อง/วิชา `archived = 1` (`archived_ref` "ห้อง/วิชานี้เก็บแล้ว — เลือกห้อง/วิชาที่ใช้งาน") | `422 bad_timetable` + `issues` (AC-40 · BR-06) |
| 7 | รายการเหมือนที่เก็บทุกช่อง | `200` `changed: false` ไม่เพิ่มรุ่น ไม่มีประวัติ |
| 8 | กู้คืนข้อมูลแทรก (epoch) | `409 epoch_changed` (กติกาเดิม · AC-42) |

  - "คาบใหม่หรือเปลี่ยน" = ไม่มีแถวที่เก็บอยู่ที่ (weekday, period) เดียวกันซึ่ง `kind` `classId` `subjectId` `label` ตรงกันทุกค่า · คาบเดิมที่อ้างของที่เก็บแล้วและไม่เปลี่ยน → ผ่าน
- **การเขียน = `batchAtEpoch` ชุดเดียว:** (1) `abortIf` rev ของภาค ≠ `baseRev` (2) `abortIf` ค่า setting `period_frame` ≠ ค่าที่อ่านตอนตรวจ (โครงเปลี่ยนระหว่างทาง) (3) `abortIf` มีห้อง/วิชาของคาบใหม่หรือเปลี่ยนที่ `archived = 1` แล้ว (4) `DELETE FROM timetable_slots WHERE term_id = ?` (5) `INSERT … SELECT FROM json_each(?)` ทุกแถว `updated_at = now` (6) `UPDATE terms SET timetable_rev = timetable_rev + 1 WHERE id = ?` (7) audit 1 แถว — batch ล้มแล้วหาเหตุจากสถานะปัจจุบัน: epoch → `409 epoch_changed` · rev → `409 timetable_changed` + `current` · โครง → `409 frame_changed` "โครงเวลาถูกแก้จากเครื่องอื่น — โหลดใหม่แล้ว ลองอีกครั้ง" + `current` · ของที่เก็บ → `422 bad_timetable` · อื่น ๆ → 500 (ไม่มีอะไรลง)
- **audit (BR-10 · AC-45):** `entity "timetable"`, `entity_id` = termId, `action "update"`, `before {"slots": <จำนวนก่อน>, "rev": n}`, `after {"slots": <จำนวนหลัง>, "rev": n+1, "reason": "edit"}`, `method "manual"`, `device_id` · ไม่มีชื่อนักเรียน · 422/409/`changed:false`/สลับรูปแบบ/พิมพ์ = ไม่มีแถว
- 200:

```json
{ "ok": true, "changed": true, "timetable": { "termId": "t2569-2", "rev": 8, "readOnly": false, "slots": [ … ] } }
```

- เขียน D1: 7 คำสั่ง + guard epoch ใน 1 batch (ต่ำกว่าเพดาน 50 ของ Free plan) · ≤ 56 แถว insert

**ใน `GET /api/bootstrap` (เพิ่มฟิลด์):** `timetable: TimetablePayload | null` = ตารางของภาคปัจจุบัน (`null` เมื่อไม่มีภาค) · `settings.period_frame` (string) · แอปคิดโครงด้วย `resolveFrame` เดียวกัน → หน้าหลักมีแถบตั้งแต่เปิดแอป และออฟไลน์ใช้ bootstrap ที่แคชไว้ (AC-26) · ออกจากระบบ/ล้างข้อมูลลบไปพร้อม bootstrap (D51) · แอปรุ่นเก่าไม่อ่านฟิลด์นี้ · bootstrap เพิ่ม 1 คำสั่งอ่าน (≤ 56 แถว) · **`timetable.rev` `termId` และคาบมาจาก SELECT เดียวกัน** (`DEFAULT_TERM_SQL` LEFT JOIN `timetable_slots`) ห้ามเอา rev จากคำสั่ง `terms` อีกชุด (D59)

**กติกาฝั่งแอป (`src/lib/timetable/store.ts`):**
- ทุกการเปลี่ยน = PUT รายการทั้งภาค + `baseRev` = รุ่นบนจอ · หน้าจอเปลี่ยนทันทีแล้วรอคำตอบ · คำขอต่อกันตามลำดับการแตะ (คำขอถัดไปใช้ `rev` ใหม่)
- ออฟไลน์ (`online` เดิมของ `outbox.ts` เป็น false) → ไม่ส่ง ไม่เข้าคิว แก้ไม่ได้ + "ออฟไลน์ — แก้ตารางสอนได้เมื่อออนไลน์" (D38 · AC-43) · อ่าน/พิมพ์จากสำเนาในเครื่อง + "ออฟไลน์ · ข้อมูลเมื่อ HH:MM" · ภาคอื่นที่ไม่ใช่ภาคปัจจุบัน ออฟไลน์ดูได้เฉพาะที่โหลดไว้ในรอบเปิดแอปนี้
- 500/เครือข่ายล้ม → ย้อนค่า + "บันทึกตารางสอนไม่สำเร็จ" [ลองอีกครั้ง] · **หมดเวลา** → GET ใหม่ก่อนให้ลองอีกครั้ง (อาจบันทึกไปแล้ว · D08 · รุ่นกันบันทึกซ้ำ)
- **[ลองอีกครั้ง] (D59):** ส่งรายการเดิมด้วย `baseRev` **เดิมของคำขอที่ล้ม** · 200 = สำเร็จ · `409 timetable_changed` ที่ `normalizeSlots(current.slots)` เท่ากับรายการที่ต้องการ = คำขอแรกลงแล้ว → แทนด้วย `current` ถือว่าสำเร็จ · ไม่เท่า → แสดง 409 ตามปกติ · ข้อความล้มของ EP-12 ไม่มีปุ่มนี้
- `409 timetable_changed` → แสดง `current` + ข้อความของ server · `409 frame_changed` (EP-11) และ `422 bad_timetable` ที่มี `outside_frame` → แทนตารางด้วย `current` (ถ้ามี) แล้ว `loadBootstrap()` ให้ได้โครงล่าสุดก่อนแสดงข้อความ (ออฟไลน์/ล้ม = ข้าม · ไม่ส่งซ้ำเอง · D57) · โครงเสีย (D56) → ข้อความ "โครงเวลาที่บันทึกไว้อ่านไม่ได้ — ตั้งเวลาคาบใหม่" แทน "คาบนี้อยู่นอกโครงเวลา" · `409 epoch_changed` → โหลด bootstrap ใหม่ + "ข้อมูลถูกกู้คืนจากไฟล์สำรอง — โหลดตารางใหม่แล้ว" · `409 term_read_only` → สลับเป็นโหมดดูอย่างเดียว
- เลิกทำ (AC-06) = PUT รายการก่อนลบ `reason: "undo"` ด้วยรุ่นล่าสุด · ล้าง = PUT `[]` `reason: "clear"` · คัดลอก (BR-07) = แอปสร้างรายการจาก GET ของภาคต้นทาง (ปีเดียวกันใช้ id เดิม · ข้ามปีจับคู่ห้องด้วยชื่อที่ตัดช่องว่างกับห้องที่ใช้งานของปีปลายทาง · ข้ามห้อง/วิชาที่เก็บแล้วหรือจับคู่ไม่ได้ และคาบนอกโครง พร้อมรายการที่ไม่ได้คัดลอก) แล้ว PUT `reason: "copy"` ครั้งเดียว (D54)
- หลัง 200 หรือ GET ของภาคปัจจุบัน → แทน `timetable` ในสัญญาณของ store และใน bootstrap ที่แคช (`kvUpdate`) เฉพาะเมื่อ `dataEpoch` ยังเท่าเดิม
- ทางลัด: `#/attendance?class=<classId>` (เช็คชื่อรายวัน วันนี้) · `#/scan?class=<classId>` (ครูเลือกงานเอง) — ยืนยัน A1: ทั้งสองหน้าอ่าน `?class=` อยู่แล้ว · หน้าตารางสอน `#/timetable` (`?term=<id>` เลือกภาค)

### EP-12 `PUT /api/timetable/frame` — โครงเวลา (BR-02 BR-08 · ชุดเดียวของครูทุกภาค)

- server: `worker/routes/timetable.ts` · ผู้เรียก: แผ่นตั้งเวลาคาบ (`src/components/timetable/frame/*`) จากหน้าตารางสอน และ ตั้งค่า › เวลาเรียน (ทางเข้าสอง ค่าเดียวกัน · AC-17)
- ที่เก็บ: setting `period_frame` = `serializeFrame(frame, rev)` → `{"v":1,"rev":4,"periods":[…],"breaks":[…],"days":[…]}` · **เขียนได้ทางนี้ทางเดียว** (ไม่อยู่ใน `ALLOWED_SETTINGS`) · ทุกครั้งเขียน `period_times` = `periodTimesOf(frame)` ใน batch เดียวกัน (เกณฑ์สายรายคาบของหน้าเช็คชื่อเดิมเห็นเวลาใหม่ทันที · AC-13) (D49)
- body:

```json
{ "baseRev": 3, "frame": { "periods": [ { "start": "08:30", "end": "09:30" } ], "breaks": [], "days": [1,2,3,4,5] }, "confirmRemove": 2 }
```

| # | เงื่อนไข | ผล |
|---|---|---|
| 1 | body ผิดรูป (zod: periods ≤ 8 · breaks ≤ 3 · days ≤ 7 · ข้อความ ≤ 50 · confirmRemove int ≥ 0 ไม่บังคับ) | `422 validation` |
| 2 | `validateFrame` ไม่ผ่าน (ตรวจหลังตัดช่องว่างหัวท้ายชื่อพัก · ค่าที่เก็บเป็นชื่อที่ตัดแล้ว · D59) | `422 bad_frame` + `issues: FrameIssue[]` (AC-14) |
| 3 | `baseRev` ≠ rev ที่เก็บ (ยังไม่เคยตั้ง = 0) | `409 frame_changed` + `current: Frame` |
| 4 | คาบนอกโครงใหม่ใน **ทุกภาคของปีปัจจุบัน** = n > 0 และ `confirmRemove` ≠ n (n = 0 → ผ่านเสมอ ค่า `confirmRemove` ที่ส่งมาไม่มีผล ไม่มีอะไรถูกลบ) | `409 frame_removes_slots` + `count: n` + `removes: [{ termId, weekday, period, kind, classId, subjectId, label }]` (แอปแสดงกล่องยืนยัน S9-ข แล้วส่งซ้ำพร้อม `confirmRemove: n` · AC-15) |
| 5 | epoch | `409 epoch_changed` |

- **batch เดียว:** guard epoch · `abortIf` rev โครง ≠ `baseRev` · `abortIf` ปีที่แก้ได้เปลี่ยน หรือจำนวนคาบนอกโครงใหม่ (ปีปัจจุบัน) ตอนเขียน ≠ n ที่นับก่อน batch (n > 0 มาถึงตรงนี้ได้เมื่อ `confirmRemove === n` แล้วเท่านั้น) · `DELETE` คาบนอกโครงของภาคปีปัจจุบัน · `UPDATE terms SET timetable_rev = timetable_rev + 1` เฉพาะภาคที่มีคาบถูกลบ · เขียน `period_frame` (rev + 1) และ `period_times` · audit 1 แถว `entity "period_frame"`, `action "update"`, `before` = โครงเดิม (ไม่มี = `null`), `after` = โครงใหม่ + `"removed": n` · batch ล้ม → หาเหตุแบบ EP-11 (`frame_changed` / `frame_removes_slots` ใหม่ / `epoch_changed`)
- ภาคปีที่ผ่านมาไม่ถูกแตะ (BR-08) · เพิ่มวัน/คาบ = ไม่มีอะไรถูกลบ ไม่ถาม (AC-16)
- 200:

```json
{ "ok": true, "frame": { "v": 1, "rev": 4, "saved": true, "periods": [ … ], "breaks": [ … ], "days": [ … ] }, "removed": 2,
  "timetable": { "termId": "t2569-2", "rev": 9, "readOnly": false, "slots": [ … ] } }
```

  `timetable` = ตารางของภาคปัจจุบันหลังบันทึก (`null` ถ้าไม่มีภาค) · แอปแทน `settings.period_frame` `settings.period_times` ใน store + bootstrap ที่แคช
- แอปเมื่อได้ `409 frame_changed`: `current.saved` = true → แทนโครงด้วย `current` · false → `loadBootstrap()` (D57)
- ออฟไลน์/ล้ม/หมดเวลา: กติกาเดียวกับ EP-11 (ยกเว้นไม่มีปุ่ม [ลองอีกครั้ง] ของตาราง — ลองใหม่ที่ปุ่มของแผ่น) · ออฟไลน์เปิดแผ่นได้แต่ปุ่มบันทึกปิด + "ออฟไลน์ — แก้ตารางสอนได้เมื่อออนไลน์"

### EP-13 `GET /api/backup` · `POST /api/restore/validate|execute` · `POST /api/admin/reset` — ส่วนที่เปลี่ยนสำหรับตารางสอน (BR-10 · AC-44)

- `BACKUP_TABLES` (server `worker/routes/backup.ts`) และ `TABLES` ฝั่งแอป (`src/lib/backup.ts`, `src/components/RestoreModal.tsx`) เพิ่ม `"timetable_slots"` **ท้ายรายการ** (หลัง `attendance` · แม่ทุกตัวมาก่อน · ตอนลบเรียงย้อนจึงลบก่อน) · `COLUMNS.timetable_slots = ["term_id","weekday","period","kind","class_id","subject_id","label","updated_at"]`
- ไฟล์ใหม่ `schema_version: 7` · โครงเวลาไปกับตาราง `settings` เดิม (`period_frame` `period_times`) · รูปแบบหน้าตารางสอนไปกับ `accent` เดิม
- **validate:** `timetable_slots` ไม่อยู่ใน `counts` ได้ (ทุกรุ่นไฟล์) = 0 แถว → ไฟล์รุ่นเก่ากู้ได้ ตารางว่าง โครงเวลาค่าเริ่มต้นจาก `period_times` ในไฟล์ (AC-44) · ตารางอื่นยังต้องครบเหมือนเดิม (`incomplete_backup`) (D54)
- **ตรวจแถว (`restore-validation.ts`):** zod `term_id` key · `weekday` 1–7 · `period` 1–8 · `kind` enum · `class_id`/`subject_id` key หรือ null · `label` ≤ 40 หรือ null · `updated_at` stamp · กติกา SQL ในชุดเดียวกับ guard เดิม: `missing_reference` (term/class/subject) · `kind_fields` (class ไม่มีห้อง/มี label · activity มีห้อง/วิชา/ไม่มี label) · `wrong_school_year` (ห้องที่มี year ≠ ปีของภาค) · `duplicate_slot` (term, weekday, period ซ้ำ) · rowId ของ issue = `term_id`
- **ตรวจกับโครงในไฟล์ (D56):** ขั้น execute หลังตรวจจำนวนแถว ก่อนสร้าง batch (staging ครบแล้ว · validate มีแค่ manifest) คิด `resolveFrame` จากแถว `settings` ในไฟล์ (`period_frame` `period_times`) → `period_frame` ไม่ว่างแต่ไม่ผ่าน = issue `{table:"settings", rowId:"period_frame", field:"value", code:"bad_frame"}` · คาบที่ `weekday` ไม่อยู่ใน `days` หรือ `period` > จำนวนคาบ = issue `{table:"timetable_slots", rowId:<term_id>, field:"period", code:"outside_frame"}` → `422 invalid_backup` ข้อมูลเดิมไม่เปลี่ยน
- commit: ลบ/เติมแบบเดิม · `terms.timetable_rev` ไม่อยู่ใน COLUMNS → กลับเป็น 0 (epoch ใหม่ทำให้ทุกจอโหลดใหม่ก่อนเขียนอยู่แล้ว) · batch เพิ่ม 2 คำสั่ง (ยังต่ำกว่า 50)
- `dataFingerprint` เพิ่ม `stamped("timetable_slots","updated_at")`
- `POST /api/admin/reset` (ทั้ง `data` และ `all`) ลบ `timetable_slots` ก่อน `subjects` `classes` `terms` · `data` คง settings (โครงเวลาอยู่ต่อ) · `all` ลบ settings ตามเดิม
- เทสต์ต้องมี: สำรอง → ล้าง → กู้คืน = 14 คาบช่องเดิม + โครง 8 คาบเดิม · ไฟล์ v6 ไม่มีตาราง → กู้ได้ · แถวอ้างห้องปีอื่น/ไม่มีห้อง → `422 invalid_backup` ข้อมูลเดิมไม่เปลี่ยน

### EP-07 (v11) `PUT /api/settings` — ค่าที่เกี่ยวกับตารางสอน

- `getSettings` + `Settings` (`shared/types.ts`) เพิ่ม `period_frame?: string` (ค่าเริ่มต้น `""`) — **อ่านอย่างเดียว** ผ่าน settings (ไม่อยู่ใน `ALLOWED_SETTINGS` → ถูกทิ้งตามกติกาเดิมของคีย์ที่ไม่รู้จัก)
- **กัน `period_times` เขียนทับโครง (D49):** เมื่อ `period_frame` ที่เก็บไม่ว่าง และ body มี `period_times` ที่ต่างจากค่าที่เก็บ → `409 period_frame_owned` "เวลาคาบตั้งที่ ตารางสอน › ตั้งเวลาคาบ — โหลดแอปใหม่แล้วลองอีกครั้ง" ไม่เขียนคีย์ใดในคำขอนั้น (ตรวจซ้ำด้วย `abortIf` ใน batch) · ค่าเท่าเดิม = ผ่าน (แอปเก่าที่บันทึกชื่อโรงเรียนพร้อม `period_times` เดิมยังใช้ได้) · `period_frame` ว่าง = กติกาเดิม · แอปรุ่นใหม่ไม่ส่ง `period_times` ทาง settings อีก
- **`accent` เพิ่มช่อง `timetable`** (BR-13 · ไม่แก้ server · D52):

```json
{ "v": 1, "skin": "pro", "layout": "b", "timetable": "c" }
```

  | ช่อง | ค่า | ค่าเริ่มต้น (ไม่มี/ไม่รู้จัก/`accent` ไม่ใช่ JSON) |
  |---|---|---|
  | `timetable` | `"a"` ตารางกระดาษ · `"b"` ปฏิทินแกนเวลา · `"c"` วันนี้เป็นหลัก | `"a"` |

  ตัวแปลใน `src/lib/appearance.ts` (`parseAppearance` คืน `{ skin, layout, timetable }` ช่องละอิสระ) · `serializeAppearance` เขียนครบ 3 ช่องและ **คงช่องที่ไม่รู้จักจากค่าที่อ่านล่าสุด** · บันทึกด้วย `saveAppearance` เดิม (ทันที · PUT เดียว · ล้ม/ออฟไลน์ย้อน + ข้อความเดิม · ไม่เข้าคิว) · ใช้ค่าจาก server ตอนเปิดแอปครั้งแรกเหมือน `layout` · การสลับรูปแบบไม่บันทึกตาราง ไม่มีประวัติตารางสอน (AC-52)
- **`home_cards` การ์ดใหม่ `timetable`** = "ตารางสอนวันนี้" (แถบใต้หัว) ใน `LAYOUT_CARDS` ของ **ทุกโครง** `a` `b` `c` (D53): ค่าเริ่มต้นเปิด · บัญชีเดิมได้การ์ดต่อท้ายแบบเปิด (`parseLayoutCards`) · ตำแหน่งตายตัวใต้หัว (ลำดับใน `order` ไม่มีผลต่อที่วาง) · ปิด/เปิดได้ใน "ปรับหน้าหลัก" ของโครงนั้นเท่านั้น (ไม่มีปุ่มเลื่อน) · แถวคาบในลำดับงานวันนี้ (โครง ก) **ไม่ใช่การ์ด** ปิดแยกไม่ได้ · บันทึกด้วย `saveLayoutPrefs` เดิม
- พิมพ์ใช้ `teacher_name` `school_name` เดิม (AC-65) · **คีย์ localStorage ใหม่ 1 คีย์ `ngankrob-timetable`** = สำเนาของ `accent.timetable` (แบบ `ngankrob-skin`/`ngankrob-layout` ของ D41) ใช้วาดก่อนข้อมูลมา · อยู่ใน `LOCAL_PREF_KEEP` → ปุ่ม "ล้างค่าที่เครื่องจำ" ไม่ลบไม่นับ (ทะเบียน D44 เพิ่มคีย์นี้ · D58)

## ลำดับปล่อย / ความเข้ากันได้

- **migration 0008 → `npm run deploy` ทันที** (Worker เดียวส่งทั้ง API และหน้าเว็บ · server ตรวจ `schema_version` = 7 ช่วงระหว่าง migrate กับ deploy server เก่าตอบ 503 — ทำต่อกันทันที ตาม OPERATIONS เดิม) · ต้องมีอนุมัติเจ้าของงานที่ Gate 3
- แอปเก่าที่ค้างในเครื่องอื่น (ก่อนอัปเดต PWA): ไม่เห็นเมนู/แถบ (ไม่พัง) · บันทึกหน้าตาจะเขียน `accent` โดยไม่มี `timetable` → รูปแบบกลับเป็น ก (ไม่เสียตาราง) · บันทึก "ปรับหน้าหลัก" ทิ้งการ์ด `timetable` → แถบกลับเป็นเปิด · แก้เวลาคาบหลังตั้งโครงแล้ว → `409 period_frame_owned` · สำรองข้อมูลได้ไฟล์ไม่มีตารางสอน (กู้ได้ ตารางว่าง) — รับความเสี่ยง (D52 D53 D54)

## Changelog

| เวอร์ชัน | วันที่ | เปลี่ยนอะไร | งาน | กระทบ |
|---|---|---|---|---|
| v11 | 2026-11-13 | EP-11 `GET`/`PUT /api/timetable` เขียนใหม่ (คาบกิจกรรม `kind`/`label` · `class_id` null ได้ · ≤ 56 แถว · รุ่น `rev` + `409 timetable_changed` · ภาคปีเก่า `409 term_read_only` · ห้อง/วิชาเก็บแล้ว 422 เฉพาะคาบใหม่/เปลี่ยน · `counts`) + `bootstrap.timetable` · EP-12 `PUT /api/timetable/frame` (ใหม่) · EP-13 สำรอง/กู้คืน/ล้างรวม `timetable_slots` (ไฟล์เก่ากู้ได้) · EP-07: `period_frame` อ่านอย่างเดียว · `409 period_frame_owned` · `accent.timetable` · การ์ด `timetable` ใน `home_cards` · schema 7 (migration 0008) | 2026-11-12-timetable เฟส 3 | server `worker/routes/{timetable,bootstrap,catalog,backup,reset}.ts`, `worker/lib/{timetable,db,restore-validation}.ts`, `worker/app.ts`, `shared/{timetable,types}.ts` · client `src/lib/timetable/*`, `appearance.ts`, `homeLayout.ts`, `backup.ts`, `RestoreModal.tsx` · **migration → deploy ต่อกันทันที** · แอปเก่าไม่พัง (ดูหัวข้อความเข้ากันได้) · D48–D54 |
| v11.1 | 2026-11-13 | หลัง code review/security (Verify รอบแก้ 1): `resolveFrame` สูตรใหม่จาก `period_times` (คาบ 8 · ความยาวคาบจากระยะห่าง · พักหลบคาบ · ผลผ่าน `validateFrame` เสมอ) + `rev` ไม่ย้อนเมื่อโครงที่เก็บเสีย · แอป: ลองอีกครั้งด้วย `baseRev` เดิม · `frame_changed`/`outside_frame` → `loadBootstrap()` · ข้อความโครงเสีย · bootstrap rev+คาบ SELECT เดียว · EP-12 ตัดช่องว่างชื่อพัก · ถ้อยคำ `confirmRemove` ตรงโค้ด (n = 0 ผ่านเสมอ) · EP-13 ตรวจ `bad_frame`/`outside_frame` กับโครงในไฟล์ · EP-07 คีย์ในเครื่อง `ngankrob-timetable` (ใน `LOCAL_PREF_KEEP`) · ไม่เปลี่ยนรูปคำตอบ/รหัส error เดิม | 2026-11-12-timetable Verify | `shared/timetable.ts` · `worker/routes/{timetable,bootstrap}.ts` · `worker/lib/restore-validation.ts` · `src/lib/timetable/store.ts` · `src/lib/localPrefs.ts` · `src/pages/Timetable.tsx` · `RemoveConfirm.tsx` · D55–D59 |

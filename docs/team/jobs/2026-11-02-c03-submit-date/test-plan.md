# Test plan: วันที่รับงานจริง + แก้ช้า/ทันรายช่อง (c03-submit-date) — หลังบ้าน

โดย QA (T-01) · 2026-11-02 · เขียนจาก `requirements.md` (AC-01..24, BR-01..11), `api-contract.md` v3 (EP-01, EP-03, EP-04, EP-05), `decisions-local.md` D-c03-submit-date-01..07 — **ก่อนแก้โค้ด** (ไม่ได้อ่าน `worker/routes/submissions.ts` เพื่อคาดผล) · ผลคาดคำนวณด้วยมือด้านล่างก่อนรัน

## ขอบเขต

- ทดสอบ: AC-01..AC-24 ส่วนหลังบ้าน (EP-01 batch, EP-03 bulk, EP-04 bulk-undo, EP-05 สร้าง/แก้งาน, EP-02 อ่านช่อง) + ตัวช่วยกลาง `shared/received-date.ts` + outbox ส่งฟิลด์ใหม่ + ตัวเลขช้า (metrics/Excel)
- ไม่ทดสอบในงานนี้ (เลื่อนไปแพ็กเกจ ui-redesign — ดูตาราง "ส่วน UI ที่เลื่อน"): หน้าสแกน/สมุดคะแนน/กล่องยืนยัน/toast/คีย์บอร์ด/ขนาดปุ่ม · ไม่มีภาพหน้าจอ (งานนี้ไม่แตะหน้าจอ)

## สภาพแวดล้อม

- โหมด: Vitest — `workers` (Miniflare D1 ในเครื่อง) สำหรับ `test/api/c03-*.test.ts`, `dom` (jsdom) สำหรับ `test/unit/c03-*.test.ts` · ข้อมูลสมมติทั้งหมด ไม่มีข้อมูลจริง · ไม่เปิด server (พอร์ต 4101 ไม่ได้ใช้)
- นาฬิกา: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime` — ทดลองแล้วว่า `Date.now()` ของ worker เปลี่ยนตาม (probe 2 พ.ย.: `serverTime` = 1793584800000) · ทุกคำขอเลื่อนนาฬิกา +1 วินาทีก่อนส่ง (ให้ `clientTs` < now เสมอ ไม่ถูก clamp)
- Fixture (สมมติ): วันนี้ **2026-11-02 09:00 ไทย = 02:00Z = 1793584800000** · งาน a1 "ใบงาน 1" เต็ม 10 เปิดรับ ห้อง c1 · `assigned_date` 2026-10-26 · `due_date` 2026-10-30 · ก=st1 ข=st2 (จาก `seed()`) ค=st3 ง=st4 (เพิ่ม) · ห้องใหญ่ AC-09 (32 คน), AC-20 (30 คน), AC-23 (45 คน), AC-24 (50 op) สร้างด้วยลูปชื่อ "นักเรียน N"

### ค่าที่คำนวณด้วยมือ (💰 expected-from-br — ก่อนรัน)

| ชื่อ | วิธีคิด | ค่า (ms) |
|---|---|---|
| NOW (11-02 09:00 ไทย) | 09:00 − 7 ชม. = 02:00Z → `Date.UTC(2026,10,2,2)` | 1793584800000 |
| NOON 10-30 | 12:00 ไทย = 05:00Z → `Date.UTC(2026,9,30,5)` (ตรงกับตัวอย่างใน requirements) | 1793336400000 |
| NOON 10-29 | NOON 10-30 − 86 400 000 | 1793250000000 |
| NOON 10-31 | NOON 10-30 + 86 400 000 | 1793422800000 |
| NOON 10-20 | NOON 10-30 − 10 × 86 400 000 | 1792472400000 |
| NOON 2026-04-16 (200 วันก่อน 11-02) | `Date.UTC(2026,3,16,5)` | 1776315600000 |
| 10-29 08:15 ไทย | `Date.UTC(2026,9,29,1,15)` | 1793236500000 |
| AC-06(ก) now = 10-28 10:00 ไทย | `Date.UTC(2026,9,28,3)` = 1793156400000 · clientTs 10-20 10:00 = 1792465200000 (เก่ากว่า 7 วัน) → event_at = now − 7 วัน | event_at 1792551600000 · submitted_at = min(NOON 10-20, now) = 1792472400000 · late 0 (10-20 ≤ 10-30) |
| AC-06(ข) now = 11-06 10:00 ไทย | clientTs 11-02 08:55 = 1793584500000 (ภายใน 7 วัน ไม่ clamp) · `receivedDate` "2026-11-02" = วันไทยของ event → เวลาจริง | submitted_at 1793584500000 · late 1 (11-02 > 10-30) |
| ตัวเลข AC-20 | 30 คน × เต็ม 10 = 300 · คะแนนคนละ 8 = 240 → 240×100/300 = **80%** · ช้าเดิม 30 (ทุกคน 11-02) → แก้ 28 คนเป็น 10-30 → ช้า **2** · ร้อยละ/ค้างไม่เปลี่ยน (ช้าไม่หักคะแนน BR-10) | late 30 → 2 · 80% → 80% · missing 0 → 0 |
| AC-09 | 25 ไม่มีแถว + 2 void = **27** เปลี่ยน · 3 submitted + 2 excused ไม่แตะ | changed 27 · audit bulk 27 แถว batch เดียว |
| AC-23 | 45 คนไม่มีแถว → changed 45 → undo changed 45 | |
| AC-19 | due 10-30 · ข รับ 11-02 → วันต่างปฏิทินไทย 11-02 − 10-30 = **3 วัน** · ค งานไม่มีกำหนด → late false | |

## Test cases

ไฟล์: **RD** = `test/api/c03-received-date.test.ts` (EP-01) · **BK** = `test/api/c03-bulk-date.test.ts` (EP-03/04/05/02 + metrics + งบ) · **UH** = `test/unit/c03-received-date.test.ts` · **UO** = `test/unit/c03-outbox-carry.test.ts` · **UL** = `test/unit/c03-late-numbers.test.ts` · คอลัมน์ "ก่อนแก้" = ผลที่คาดบน 0312e8d (ยังไม่แก้)

| TC | AC | ขั้นตอน | ข้อมูล | ผลที่คาด (คำนวณมือไว้ก่อน) | วิธี | ก่อนแก้ |
|---|---|---|---|---|---|---|
| TC-01 | AC-01 | ก ไม่มีแถว · op hid score 10 `receivedDate "2026-10-30"` clientTs NOW | NOW | `ok` · submitted 10 · submitted_at 1793336400000 · late 0 · `submission.late` false · event_at 1793584800000 · audit 1 แถว `create` | auto RD | FAIL |
| TC-02 | AC-01 (Q3, D-06) | ช่องว่าง/void/excused · op `camera`/`manual`/`grid` (grid score 8) + `"2026-10-30"` | NOW | ทุกตัว `ok` · submitted_at 1793336400000 · late 0 | auto RD | FAIL |
| TC-03 | AC-02 (ก) | op hid ไม่มี `receivedDate` (แอปเก่า) | NOW | submitted_at 1793584800000 (09:00 จริง ไม่ใช่เที่ยง) · late 1 | auto RD | PASS |
| TC-04 | AC-02 (ข) | op hid `receivedDate "2026-11-02"` (วันนี้) clientTs NOW | NOW | เหมือน TC-03 ทุกฟิลด์ | auto RD | PASS |
| TC-05 | AC-03 | คำขอเดียว 4 op: ก `"2026-11-03"` · ข `"2026-10-25"` · ค `"2569-10-30"` · ง ไม่มีวันที่ | NOW | HTTP 200 · `invalid` `received_date_future` / `received_date_before_assigned` / `received_date_invalid` / `ok` · ก ข ค ไม่มีแถว ไม่มี audit | auto RD | FAIL |
| TC-06 | AC-03 | วันผิดรูปทีละค่า: `"2026-02-30"`, `"30/10/2026"`, `""`, `"2026-1-5"`, `"1899-12-31"`, `"2100-01-01"` | NOW | ทุกค่า `invalid` `received_date_invalid` ไม่มีแถว | auto RD | FAIL |
| TC-07 | AC-04 | ก = submitted 7 at NOON 10-29 late 0 · op hid `"2026-10-30"` · ซ้ำด้วยวันผิด `"2026-11-03"` (D-03) | NOW | ทั้งคู่ `already_submitted` · 9 ฟิลด์ไม่เปลี่ยน · ไม่มี audit | auto RD | PASS |
| TC-08 | AC-05 | ข ว่าง · คำขอเดียว [hid null `"2026-10-30"` รอบ R1, manual 8 รอบ R1 (มี/ไม่มีวันที่)] | NOW | `ok`,`ok` · ข = 8 · submitted_at 1793336400000 · late 0 | auto RD | FAIL |
| TC-09 | AC-06 (ก) | now 10-28 10:00 · a1 assigned 10-15 · op hid clientTs 10-20 10:00 `"2026-10-20"` | ดูตารางคำนวณ | event_at 1792551600000 · submitted_at 1792472400000 · late 0 | auto RD | FAIL |
| TC-10 | AC-06 (ข) | now 11-06 10:00 · op hid clientTs 11-02 08:55 `"2026-11-02"` | ดูตารางคำนวณ | submitted_at 1793584500000 · late 1 | auto RD | PASS |
| TC-11 | AC-07 (server) | ก ข ค ว่าง · 3 op hid `"2026-10-30"` | NOW | ทุกตัว `ok` · `submission.late` false · submitted_at เที่ยง 10-30 | auto RD | FAIL |
| TC-12 | AC-08 (server) | เหมือน TC-11 ด้วย `"2026-11-02"` | NOW | ทุกตัว `ok` · `submission.late` true | auto RD | PASS |
| TC-13 | AC-09 | ห้อง 32 (25 ว่าง, 2 void, 3 submitted, 2 excused) · bulk `all-submitted` `"2026-10-30"` | NOW | 200 changed 27 · 27 ช่อง submitted score null submitted_at 1793336400000 late 0 · 5 ช่องเดิมไม่เปลี่ยน · audit 27 แถว `bulk` batch_id เดียว = `batchId` · after.submitted_at 1793336400000 | auto BK | FAIL |
| TC-14 | AC-09 | เหมือน TC-13 ไม่ส่ง `receivedDate` | NOW+δ | changed 27 · submitted_at = เวลาของคำขอ (≥ NOW) · late 1 | auto BK | PASS |
| TC-15 | AC-10 | bulk `"2026-11-03"` / `"2026-10-25"` / `"30/10/2026"` / `full-score`+`"2026-10-30"` / `clear`+`"2026-10-30"` | NOW | 400 `received_date_future` / `_before_assigned` / `_invalid` / `_not_applicable` ×2 · ไม่มีช่องเปลี่ยน ไม่มี audit · message ภาษาไทย | auto BK | FAIL |
| TC-16 | AC-10 (ลำดับ v3) | (1) งานไม่มีจริง + `"2026-11-03"` (2) งานปิด + `"2026-10-25"` (3) ห้อง c2 ไม่ได้รับงาน + `"2026-10-25"` (4) `full-score` + `"30/10/2026"` (5) `clear` + `receivedDate: null` | NOW | (1) 400 `received_date_future` ไม่ใช่ 404 (2) 409 `assignment_closed` (3) 400 `class_not_assigned` (4) 400 `received_date_not_applicable` (5) 200 | auto BK | FAIL (1)(4) |
| TC-17 | AC-11 | หลัง TC-13 (B1) → bulk-undo B1 · undo ซ้ำ | NOW | changed 27 · ว่าง/void → void submitted_at null late 0 (void ที่มี submitted_at X เดิม → X ตรง ms) · audit `restore` 27 · ซ้ำ `alreadyUndone` | auto BK | FAIL |
| TC-18 | AC-11 | หลัง TC-13 · แก้วันที่ช่องหนึ่ง (dateOnly `"2026-10-29"`) → bulk-undo B1 | NOW | 409 `modified_since` · ทุกช่องเท่าก่อน undo · ไม่มี audit ใหม่ | auto BK | FAIL |
| TC-19 | AC-12 | ก = submitted 7, submitted_at NOW(09:00), late 1 · op grid `dateOnly` `"2026-10-30"` score 7 | NOW | `ok` (ไม่ใช่ already_submitted) · 7 · submitted_at 1793336400000 · late 0 · method grid · event_at = clientTs ใหม่ · scan_session_id = ของ op | auto RD | FAIL |
| TC-20 | AC-12 | ข = submitted 9 NOON 10-29 late 0 · dateOnly `"2026-10-31"` | NOW | `ok` · 9 · submitted_at 1793422800000 · late 1 | auto RD | FAIL |
| TC-21 | AC-13 | ก ระบบ 7 · op dateOnly ถือ score 9 · (ข) ระหว่างทางอีกเครื่องแก้เป็น 8 (เวลาก่อน op) | NOW | ยัง 7 / ยัง 8 · submitted_at เที่ยง 10-30 | auto RD | FAIL |
| TC-22 | AC-14 (1)(2)(3) | dateOnly บน ไม่มีแถว / void / excused | NOW | `invalid` `cell_not_submitted` · ไม่มีแถวใหม่ ช่องเดิมไม่เปลี่ยน ไม่มี audit | auto RD | FAIL |
| TC-23 | AC-14 (4) | งานปิดรับ ก submitted · dateOnly · และเด็ก moved/finished ที่ช่อง submitted | NOW | `ok` · submitted_at เที่ยง 10-30 | auto RD | FAIL |
| TC-24 | AC-14 (5) | dateOnly + method hid/camera/manual บนช่อง submitted · dateOnly + status void/excused method grid | NOW | `invalid` `redate_not_allowed` · ไม่เปลี่ยน | auto RD | FAIL |
| TC-25 | AC-15 | หลัง TC-19 อ่าน audit ของ op | NOW | 1 แถว `update` method grid · before.submitted_at 1793584800000 before.late true · after.submitted_at 1793336400000 `!!after.late` false · score 7→7 | auto RD | FAIL |
| TC-26 | AC-16 (server, BR-09) | หลัง TC-19 · op dateOnly ใหม่ `"2026-11-02"` (ย้อนกลับ) | NOW+ | `ok` · วันไทยของ submitted_at = 2026-11-02 · late 1 · score 7 | auto RD | FAIL |
| TC-27 | AC-16 (BR-05 วันเดิม) | ช่อง submitted 7 ที่ 10-29 08:15 (1793236500000) · dateOnly `"2026-10-29"` | NOW | `ok` · submitted_at 1793236500000 คง ms เดิม (ไม่กลายเป็นเที่ยง) | auto RD | PASS |
| TC-28 | AC-17 | ก = NOON 10-30 late 0 · EP-05 due 10-29 → ลบ due → due 10-30 | NOW | late 1 → 0 → 0 · submitted_at 1793336400000 ทุกขั้น | auto BK | PASS |
| TC-29 | AC-18 | ก submitted 7 · op dateOnly clientTs 10:00 ค้างไว้ · op grid 8 clientTs 10:05 ลงก่อน · ส่ง op dateOnly | วันนี้ 10:10 | `superseded` · ก = 8 วันที่เดิม | auto RD | PASS |
| TC-30 | AC-18 (BR-07) | ไม่มีอะไรคั่น · op dateOnly `"2026-10-30"` → ส่ง opId เดิมซ้ำ | NOW | `ok` แล้ว `duplicate` · submitted_at เที่ยง 10-30 · audit ของ opId = 1 | auto RD | FAIL |
| TC-31 | AC-19 (server) | ก NOON 10-30 · ข NOW (11-02) · งาน a2 ไม่มี due ค 11-02 · GET EP-02 | NOW | ก วันไทย 10-30 late false · ข 11-02 late true (ห่าง due 3 วัน) · ค late false | auto BK | PASS |
| TC-32 | AC-20 (ข้อมูล) | metrics/Excel: 30 คน ส่ง 8/10 late ทุกคน → late 2 คน | — | ช้า 30 → 2 · ร้อยละ 80 → 80 · ส่งแล้ว 30, ค้าง 0 คงเดิม · Excel ทาสีช้าเฉพาะ 2 ช่อง | auto UL | PASS |
| TC-33 | AC-20 (ทางจริง) | 30 คน hid 8 วันที่ 11-02 → dateOnly 28 คน `"2026-10-30"` → gradebook/reports/dashboard | NOW | late 30 → 2 (dashboard perClass.late 2) · Σscore 240 · 240/300 = 80% เท่าเดิม | auto BK | FAIL |
| TC-34 | AC-20 (backup) | ช่องเที่ยง 10-30 + ช่อง 09:00 11-02 → backup → แก้มั่ว → restore | NOW | submitted_at/late ทุกช่องเท่าก่อน backup | auto BK | PASS |
| TC-35 | AC-21 | คำขอแอปเก่า (ไม่มีฟิลด์ใหม่): ok / duplicate / already_submitted / superseded / grid แก้คะแนน | NOW | ผลเดิมทุกชนิด · `already_submitted` keys = opId,result,submission · submitted_at ตามกฎเดิม | auto RD | PASS |
| TC-36 | AC-21 | GET EP-02 รูปเดิม · ไม่มีไฟล์ใหม่ใน `migrations/` (T-03: `git status --short migrations`) | — | `submissions[]`, `serverTime` number | auto BK + T-03 | PASS |
| TC-37 | AC-22 | ช่อง NOON 10-30 late 0 · แอปเก่าแก้คะแนน (grid 9 ไม่มีฟิลด์ใหม่) | NOW | `ok` · 9 · submitted_at 1793336400000 คงเดิม · late 0 | auto RD | PASS |
| TC-38 | AC-23 (server) | ห้อง 45 คนว่าง · bulk all-submitted `"2026-10-30"` → undo | NOW | changed 45 · submitted_at เที่ยง late 0 → undo changed 45 ทุกช่อง void | auto BK | FAIL |
| TC-39 | AC-24 | `metered()`: bulk 32 คน (ไม่มี/มี `receivedDate`) · batch 50 op (ไม่มี/มี) | NOW | statements, rows read, rows written ของ "มี" ≤ "ไม่มี" · บันทึกตัวเลขในหัวข้อ "ผลวัด AC-24" | auto BK | PASS (ค่าฐาน) |
| TC-40 | AC-01..06 (helper) | `isCeDate`, `bkkNoonMs`, `checkReceivedDate`, `receivedAtMs` ตามตาราง BR-02 + ขอบ | — | ดูตาราง UH ด้านล่าง | auto UH | FAIL (โมดูลยังไม่มี) |
| TC-41 | AC-06, AC-18 (BR-07) | outbox: `enqueueSubmission` ส่ง `receivedDate`/`dateOnly` ใน body · `retryFailed` คง `receivedDate` เปลี่ยน opId/clientTs | — | body.ops[0] มีฟิลด์ครบ · retry: `receivedDate` เดิม clientTs ใหม่ | auto UO | PASS |

### ตาราง UH (`shared/received-date.ts` — today 2026-11-02, assigned 2026-10-26)

| ฟังก์ชัน | input | ผลที่คาด |
|---|---|---|
| isCeDate | "2026-10-30", "2028-02-29", "1900-01-01", "2099-12-31" | true |
| isCeDate | "2569-10-30", "2026-02-30", "2027-02-29", "30/10/2026", "2026-1-5", "", "1899-12-31", "2100-01-01", 20261030, null, undefined | false |
| bkkNoonMs | "2026-10-30" / "2026-04-16" | 1793336400000 / 1776315600000 |
| checkReceivedDate | "2026-10-30", "2026-11-02", "2026-10-26" | null |
| checkReceivedDate | "2026-11-03" | received_date_future |
| checkReceivedDate | "2026-10-25" | received_date_before_assigned |
| checkReceivedDate | "2569-10-30", "2026-02-30", "", 123, null | received_date_invalid |
| checkReceivedDate | "2569-11-03" (ผิดรูปและอนาคต) | received_date_invalid (รูปแบบก่อน) |
| checkReceivedDate | "2026-04-16" assigned null / assigned "2026-11-05" (อนาคต) / assigned "2569-10-26" (พ.ศ.) | null (ไม่มีพื้น ไม่มีเพดานย้อนหลัง) |
| checkReceivedDate | "2026-11-02" assigned "2026-11-05" | null (วันนี้ผ่านเสมอ D-04) |
| receivedAtMs | (undefined/null, e=NOW, now=NOW+5s) | NOW |
| receivedAtMs | ("2026-11-02", e=NOW, now) | NOW (เวลาจริง) |
| receivedAtMs | ("2026-10-30", e=NOW, now) | 1793336400000 |
| receivedAtMs | ("2026-11-02", e=11-01 23:00 ไทย, now=11-02 09:00) | min(เที่ยง 11-02, now) = NOW |
| receivedAtMs | ("2026-11-02", e=now=11-02 08:00 ไทย) | e (วันเดียวกัน) |
| receivedAtMs | ("2026-10-20", e=now−7d, now=10-28 10:00) | 1792472400000 |

## กรณีขอบและกรณีผิด

| TC | กรณี | ผลที่คาด | ไฟล์ · ก่อนแก้ |
|---|---|---|---|
| TC-42 | วันที่ผิดบน op void / excused (ไม่ใช้วันที่ — D-03) | `ok` · ไม่ตรวจ | RD · PASS |
| TC-43 | ไม่มีเพดานย้อนหลัง: a1 `assigned_date` null → hid `"2026-04-16"` (200 วัน) · `assigned_date` พ.ศ. `"2569-10-26"` (ข้อมูลเก่า) → `"2026-04-16"` · `assigned_date` อนาคต 11-05 → `"2026-11-02"` | `ok` เที่ยง 1776315600000 late 0 / `ok` เที่ยงเดียวกัน / `ok` เวลาจริง | RD · FAIL (2 แรก) PASS (ข้อ 3) |
| TC-44 | ชนิดผิด: `receivedDate: 123`, ยาว 33 ตัว, `dateOnly: "yes"` | 422 ทั้งคำขอ ไม่มีแถว | RD · FAIL |
| TC-45 | dateOnly ไม่มี `receivedDate` / `null` | `invalid` `received_date_invalid` ช่องไม่เปลี่ยน | RD · FAIL |
| TC-46 | dateOnly วันผิดบนช่อง submitted: `"2026-11-03"`, `"2026-10-25"`, `"2026-02-30"` | `invalid` future / before_assigned / invalid ช่องไม่เปลี่ยน | RD · FAIL |
| TC-47 | grid แก้คะแนนช่อง submitted (ไม่มี dateOnly) แต่ส่ง `receivedDate "2026-10-30"` (op C) | `ok` · คะแนนเปลี่ยน · submitted_at คงเดิม | RD · PASS |
| TC-48 | op ค้างข้ามเที่ยงคืน: clientTs 11-01 23:00 ไทย + `"2026-11-02"` (วันไม่ตรง event) | submitted_at = min(เที่ยง 11-02, now) = now (1793584800000+δ) · ไม่เกิน now | RD · FAIL |
| TC-49 | กดซ้ำเร็ว ๆ: bulk all-submitted `"2026-10-30"` สองคำขอพร้อมกัน | รวม changed = 27 (ครั้งที่สอง 0 หรือ 409) · audit bulk รวม 27 | BK · FAIL |
| TC-50 | ผู้ใช้ไม่ล็อกอิน: batch / bulk ที่มี `receivedDate` | 401 ไม่มีอะไรเปลี่ยน | RD/BK · PASS |
| TC-51 | `receivedDate` บน grid score ช่องว่างที่เป็นวันผิด `"2026-11-03"` (Q3 ต้องตรวจ) | `invalid` `received_date_future` | RD · FAIL |
| TC-52 | AC-03 ขอบล่าง: `receivedDate` = วันมอบหมาย `"2026-10-26"` (พื้นรวมวันนั้น) | `ok` · submitted_at `Date.UTC(2026,9,26,5)` = 1792990800000 | RD · FAIL |

## ส่วน UI ที่เลื่อนไป ui-redesign (ไม่ทดสอบในงานนี้ — สถานะ NOT RUN (เลื่อน))

| TC | AC | ส่วน UI ที่เลื่อนไป ui-redesign | ส่วนหลังบ้านที่ทดสอบแทนในงานนี้ |
|---|---|---|---|
| TC-U07 | AC-07 | เลื่อนไป ui-redesign: ตัวเลือกวันที่หน้าสแกน ช่วง 26 ต.ค.–วันนี้ · แถบเตือนย้อนหลัง · กลับเป็นวันนี้เมื่อเริ่ม/จบรอบ · `makeOp` ใส่ `receivedDate` | TC-11, TC-40 |
| TC-U08 | AC-08 | เลื่อนไป ui-redesign: ผังเลขที่ใช้ `submission.late` ทันที | TC-11, TC-12 |
| TC-U16 | AC-16 | เลื่อนไป ui-redesign: รายละเอียดช่อง + ตัวเลือกวันที่ + ทางลัด "ตามกำหนดส่ง" + toast ย้อนกลับ + คีย์บอร์ด | TC-26, TC-27 |
| TC-U19 | AC-19 | เลื่อนไป ui-redesign: ข้อความ "ส่งทัน/ส่งช้า N วัน · รับ วันที่" | TC-31 |
| TC-U20 | AC-20 | เลื่อนไป ui-redesign: ตัวเลขช้าบนหน้าจอ | TC-32, TC-33, TC-34 |
| TC-U22 | AC-22 | เลื่อนไป ui-redesign: แอปเก่าแสดงตาม `late` (ตรวจด้วยข้อมูล) | TC-37 |
| TC-U23 | AC-23 | เลื่อนไป ui-redesign: กล่องยืนยันทั้งห้อง + ช่องวันที่ + toast ย้อนกลับ + ≥ 44px + กันกดซ้ำ | TC-38, TC-49 |

## ผลวัด AC-24 (TC-39)

ค่าฐานบน 0312e8d (`metered()` นับทุก statement ใน batch · D1 รายงาน rows จริง `measured: true`) — หลังแก้ (T-03) ค่า "มีวันที่" ต้อง ≤ ค่า "ไม่มี" ในทุกช่อง

| path | statements | rows read | rows written |
|---|---|---|---|
| bulk all-submitted 32 คน (27 เปลี่ยน) ไม่มี `receivedDate` | 15 | 1138 | 267 |
| bulk เดียวกัน + `receivedDate "2026-10-30"` (ก่อนแก้ server ยังทิ้งฟิลด์) | 15 | 1138 | 267 |
| batch 50 op ช่องว่าง ไม่มี `receivedDate` | 12 | 2696 | 501 |
| batch 50 op + `receivedDate "2026-10-30"` (ก่อนแก้ทิ้งฟิลด์) | 12 | 2696 | 501 |

## Regression

- ชุดเทสต์เดิม: `npx vitest run` เทียบ baseline `context.md` (85 ไฟล์ / 1017 tests) — ไฟล์ c03 ใหม่ไม่นับใน baseline
- ส่วนเดิมที่อาจกระทบ: C-01 already_submitted (BR-04), late-flag (lateFix), bulk/undo (EP-03/04), outbox (src ไม่แก้), backup/restore
- `npm run typecheck`: คาด error เฉพาะ TS2307 `@shared/received-date` และฟิลด์ `receivedDate`/`dateOnly` บน `SubmissionOp` (CP-1)

## ผลก่อนแก้ (T-01, 0312e8d — ไม่แก้ worker/shared/src)

- `npx vitest run test/api/c03- test/unit/c03-` → 5 ไฟล์ · **49 FAIL / 26 PASS** (75) + `c03-received-date` (unit) ล้มตอน import (`@shared/received-date` ยังไม่มี — ตามคาด) · รายการเต็ม `evidence/qa/t01-c03-before-fix.txt`
- FAIL ทั้งหมดล้มด้วยเหตุ "server ยังไม่รู้จัก `receivedDate`/`dateOnly`" (ตรวจข้อความ assertion ทุกตัว: submitted_at = เวลาที่ทำแทนเที่ยง, `ok` แทน `invalid`, 200 แทน 400/422, score จาก op ถูกเขียน) — ไม่มีตัวที่ล้มเพราะ fixture
- ตรงรายการคาดของ plan.md: FAIL = AC-01, 03, 05, 06(ก), 07 (10-30), 09, 10, 11, 12, 13, 14, 15, 16 (TC-26), 18 (TC-30), 23, Q3, ขอบ dateOnly ทั้งหมด, unit helper · PASS = AC-02, 04, 06(ข), 08 (11-02), 17, 19, 20 (TC-32 ข้อมูล, TC-34 backup), 21, 22, 24, outbox carry
- ต่างจากรายการคาด (ไม่ปรับเทสต์ให้ตรงโค้ด — แจ้ง PM):
  1. **TC-33 AC-20 ทางจริง FAIL** — ใช้ dateOnly แก้ 28 ช่อง (ทาง AC-12) จึงล้มก่อนแก้ ส่วนข้อมูล AC-20 (TC-32, TC-34) PASS ตามคาด
  2. **TC-27 AC-16 (วันเดิมคง ms) PASS ก่อนแก้** — เป็นผลบังเอิญที่ถูก (server เก่าแก้คะแนนด้วยค่าเดิม ไม่แตะ submitted_at) ใช้เป็นตัวกันถอย
  3. **TC-29 AC-18 superseded PASS ก่อนแก้** (กลไก event_at เดิม) · TC-43 วันมอบหมายอนาคต PASS ก่อนแก้ (วันนี้ = เวลาจริง เหมือนเดิม)
  4. **outbox ไม่เก็บ `reason` ของผล invalid** — รายการ "ส่งไม่สำเร็จ" เก็บ `result` (`"invalid"`) เท่านั้น ข้อความไทยของ reason ใหม่ 5 ค่าแสดงไม่ได้จนกว่าจะแก้ `src/lib/outbox.ts` (เป็นงาน ui-redesign ตามตาราง Q3 ของ plan) — TC-41 ยืนยันพฤติกรรมปัจจุบัน
- `npx vitest run` (ชุดเต็ม) → 103 ไฟล์ · 1230 tests · ล้ม 49 = c03 เท่านั้น (+ 1 suite import) · ไฟล์เดิม 98 ไฟล์ / 1155 tests ผ่านหมด (baseline ใน context.md 85/1017 เป็นค่าเก่าก่อนงานอื่นเพิ่มไฟล์) — `evidence/qa/t01-full-suite.txt`
- `npm run typecheck` → error 1 ตัว: TS2307 `@shared/received-date` (ตามคาด CP-1) · ฟิลด์ `receivedDate`/`dateOnly` ไม่ทำให้ type error เพราะเทสต์ส่ง op เป็น object ธรรมดา — `evidence/qa/t01-typecheck.txt`

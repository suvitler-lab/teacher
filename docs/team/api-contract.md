# API Contract: งานครบ (ส่วนการส่งงาน/คะแนน)

เวอร์ชัน: v9 · อัปเดต 2026-11-04 (เช็คชื่อ: แตะซ้ำเพื่อยกเลิกการเช็ค — `POST /api/attendance/batch` รับ `status: "none"` ดู EP-08 และ changelog v9) · แก้ได้เฉพาะ Tech Lead (เปลี่ยนแล้วบันทึกใน changelog และ decisions)

> ไฟล์นี้เริ่มบันทึกในงาน `2026-11-02-integrity-c01` เฉพาะ endpoint ของ submissions (`worker/routes/submissions.ts`) — endpoint อื่นยังไม่ได้บันทึก ให้ Tech Lead งานถัดไปเพิ่มเป็น EP-05 ขึ้นไป · ID ของ EP เป็นของทั้งโปรเจกต์ ห้ามนำเลขกลับมาใช้ใหม่

## กติกาทั่วไป

- Base URL: `/api` · Worker เดียว (Hono) · ฐานข้อมูล D1
- Auth: cookie session ของครู (`requireAuth`) · คำขอที่ไม่ใช่ GET ต้องผ่านการตรวจ origin
- Data epoch: client ส่ง header `X-Data-Epoch` (ทุกคำขอที่ไม่ใช่ GET) และ/หรือ `dataEpoch` ต่อ op · กู้คืนข้อมูลแล้ว epoch เปลี่ยน → op เก่าได้ `epoch_changed`
- รูปแบบ error: `{ "error": "<code>", "message": "ข้อความไทย" }` · schema ไม่ผ่าน = `422 { "error": "validation", "issues": [...] }` · ไม่ล็อกอิน = `401 unauthorized`
- (v5) ทุก response `/api/*` มี `Cache-Control: no-store` + `X-Content-Type-Options: nosniff` · คำขอเขียนที่มี `Sec-Fetch-Site` ไม่ใช่ `same-origin`/`none` = `403 forbidden` (message `bad_origin`) · body ใหญ่เกิน (auth/setup 16KB, `/api/restore/*` 8MB, อื่น ๆ 1MB) = `413 { "error": "too_large" }`
- (v5) การตรวจรหัส (login, setup code, change-password, reset) จองครั้งลองก่อนตรวจแบบ atomic · เกินงบ = `429 rate_limited` · login: 5 ครั้ง/15 นาทีต่อ IP (IPv6 นับต่อ /64) + 30 ครั้ง/ชม. ต่ออีเมล (บัญชีไม่มีอีเมล = key เดียว) หรือ 10 ครั้ง/ชม. ต่อเครื่อง ถ้าเป็นเครื่องที่เคยล็อกอินและยังไม่ถูกสั่งออก/เปลี่ยนรหัส (`devices.revoked = 0`) · คำขอที่เกินงบไม่เขียน D1 · change-password: 5 ครั้ง/15 นาที ต่อ IP และต่อเครื่อง · `password`/`current`/`next`/`setupCode` ≤ 256 ตัว, `deviceId` ≤ 100 (เกิน = 422)
- (v9.1) `POST /api/auth/login` ตอบ `429` พร้อม header `Retry-After: <วินาทีเต็ม ≥ 1>` และ body `{error:"rate_limited", message, retryAfter}` (ค่าเดียวกัน) · คำนวณจากเวลาเริ่มหน้าต่างที่เก็บไว้ของงบที่ปิดอยู่ (ค่าที่มากที่สุดเมื่อปิดหลายงบ เพราะคำขอผ่านได้เมื่อเปิดครบ) · ไม่บอกว่างบไหนปิด · ไม่มี header/ฟิลด์นี้เมื่อ 200/401
- (v9.1) `429 rate_limited` ของ `POST /api/auth/login` มี header `Retry-After: <วินาทีเต็ม ≥ 1>` และ `retryAfter` (ตัวเลขเดียวกัน) ใน body = เวลาที่งบที่ปฏิเสธคำขอทั้งหมดเปิดใหม่ (ตัวที่นานสุด · ไม่เกิน 900 วินาทีถ้าเป็นงบ IP, ไม่เกิน 3600 ถ้าเป็นงบอีเมล/เครื่อง) · ไม่บอกว่างบไหนปฏิเสธ · ไม่มีใน 200/401 · ข้อความ `message` เดิมไม่เปลี่ยน
- (v5) `POST /api/auth/change-password` 200 = session ของเครื่องอื่นทั้งหมดถูกลบ (เครื่องนั้นได้ 401 ในคำขอถัดไป) เครื่องที่เปลี่ยนยังใช้ cookie เดิมได้ และเครื่องอื่นทั้งหมดถูกตั้ง `revoked = 1` (signout ก็เช่นกัน) · `POST /api/restore/execute` (commit) `409 restore_failed` ไม่มีฟิลด์ `detail` แล้ว · `PUT /api/settings` body ไม่ใช่ object = 422 · `POST /api/attendance/batch` `date` ต้อง `YYYY-MM-DD`, `period` 0–20, วิชาไม่มีอยู่ = `422 unknown_subject` · ฟิลด์ข้อความใน catalog/students มีความยาวสูงสุด (เกิน = 422)
- เวลา: epoch milliseconds (number) ตามนาฬิกาของ server · `clientTs` = เวลาที่ครูทำ (client ปรับ skew แล้ว) server บีบให้อยู่ในช่วง ≤ ตอนนี้ และ ≥ 7 วันก่อน
- คะแนน: number ขั้นละ 0.5 (`isHalfStep`) 0 ≤ score ≤ full_score หรือ `null` (= รอตรวจ)
- `Submission` (ช่องหนึ่งของงาน×นักเรียน):

```json
{ "assignment_id": "a1", "student_id": "st1", "status": "submitted | excused | void", "score": 7,
  "late": false, "submitted_at": 1762052400000, "method": "camera | hid | manual | grid | bulk | import | restore",
  "device_id": "dev_…", "scan_session_id": "scn_…", "updated_at": 1762052400000 }
```

- `submitted_at` (v3) = "วันที่รับงาน": เวลาจริงที่ครูรับงาน หรือ **12:00 เวลาไทย** (`05:00Z`) ของวันที่ครูเลือก (ดู EP-01 หัวข้อ "วันที่รับงาน") — วันที่ไทยของค่านี้คือวันที่ที่ใช้ตัดสิน `late` (กฎเดิม `worker/lib/late.ts`) · รูปแบบไม่เปลี่ยน ไม่มีคอลัมน์ใหม่

## Endpoints

### EP-01 `POST /api/submissions/batch` — ส่ง op การรับงาน/ให้คะแนนจากคิวในเครื่อง

- ผู้เรียก: `src/lib/outbox.ts` (คิวออฟไลน์ของทุกหน้า: สแกน, สมุดคะแนน) · ส่งครั้งละ ≤ 50 op
- Request (v3 เพิ่ม `receivedDate`, `dateOnly` — ไม่บังคับทั้งคู่ ไม่ส่ง = พฤติกรรมเดิมทุกฟิลด์):

```json
{ "ops": [ {
  "opId": "string ≥1 (ไม่ซ้ำในคำขอ — ซ้ำ = 422)",
  "scanSessionId": "string ≥1 (หน้าสแกน: scn_<ulid> ต่อรอบ · สมุดคะแนนมีค่าของตัวเอง)",
  "assignmentId": "string", "studentId": "string",
  "status": "submitted | excused | void",
  "score": "number ขั้น 0.5 | null",
  "fullScoreAtScan": "integer",
  "method": "camera | hid | manual | grid",
  "clientTs": "number (ms)",
  "intent": "receive | grade (optional — server ไม่เชื่อ ตัดสินจาก method)",
  "dataEpoch": "integer (optional)",
  "receivedDate": "string ≤ 32 ตัว | null (optional · ใหม่ v3) — วันที่รับงาน YYYY-MM-DD ค.ศ. วันปฏิทินไทย · null/ไม่ส่ง = ไม่มี",
  "dateOnly": "boolean (optional · ใหม่ v3) — true = แก้วันที่รับงานอย่างเดียว (ต้องคู่กับ method grid + status submitted + receivedDate)"
} ] }
```

- schema (422 ทั้งคำขอ) ตรวจเฉพาะ **ชนิด**: `receivedDate` ไม่ใช่ string/null หรือยาวเกิน 32 ตัว, `dateOnly` ไม่ใช่ boolean · **ค่า** ของวันที่ (รูปแบบ/อนาคต/ก่อนมอบหมาย) ตรวจรายผล op → `invalid` + reason (ไม่ล้มทั้งคำขอ ≤ 50 op)

- 200 Response: `{ "results": SubmissionOpResult[], "serverTime": number }` · `results` เรียงตาม `ops` และยาวเท่ากัน
- ความหมายของ op: **รับงาน** = `status: "submitted"` และ `method ∈ {camera, hid, manual}` · **ให้คะแนน** = `method: "grid"` · `void` = ยกเลิกการส่ง · `excused` = ยกเว้น

| result | ฟิลด์เพิ่ม | ความหมาย | client (ปัจจุบัน) |
|---|---|---|---|
| `ok` | `submission` (ค่าที่บันทึกจริง รวม late หลังแก้) | บันทึกแล้ว + audit 1 แถว · ยกเว้น v4: แก้วันที่เป็นวันเดิม (no-op) = ไม่เขียน ไม่มี audit `submission` = ค่าปัจจุบันของช่อง | เอาออกจากคิว |
| `duplicate` | `submission?` (ค่าปัจจุบัน) | opId นี้เคยบันทึกแล้ว (มีแถว audit) | เอาออกจากคิว |
| `epoch_changed` | — | op ทำก่อนกู้คืนข้อมูล | ไป "ส่งไม่สำเร็จ" (ไม่กั้น op ถัดไป) |
| `invalid` | `reason`: `assignment_missing` / `score_out_of_range` · v3 เพิ่ม `received_date_invalid` / `received_date_future` / `received_date_before_assigned` / `cell_not_submitted` / `redate_not_allowed` | ข้อมูลไม่ถูกต้อง (ไม่เขียน ไม่มี audit) | ไป "ส่งไม่สำเร็จ" |
| `full_score_changed` | `currentFullScore` | คะแนนเต็มถูกแก้หลังเริ่มรอบ | ไป "ส่งไม่สำเร็จ" |
| `assignment_closed` | — | งานปิดรับ (เฉพาะรับงาน) | ไป "ส่งไม่สำเร็จ" |
| `not_in_class` | — | เด็กไม่อยู่ห้องของงาน | ไป "ส่งไม่สำเร็จ" |
| `student_inactive` | — | เด็กย้าย/ไม่ใช้งาน/จบ (รับงานใหม่ไม่ได้) | ไป "ส่งไม่สำเร็จ" |
| `superseded` | `submission?` | ช่องมีสิ่งที่ครูทำ **ทีหลัง** กว่า op นี้ (event_at) | ไป "ส่งไม่สำเร็จ" (ไม่กั้น) |
| **`already_submitted`** (ใหม่ v1) | `submission` (บังคับ — ค่าปัจจุบันของช่อง) | ช่อง "ส่งแล้ว" อยู่แล้ว ไม่รับงานซ้ำ ไม่แตะอะไรเลย | ดูหัวข้อถัดไป |

- Errors ทั้งคำขอ: `401 unauthorized` · `422 validation` (schema, opId ซ้ำ, method อื่นที่ไม่ใช่ 4 ค่า) · `503 write_busy` (แข่งเขียนเกิน 3 รอบ — คิวคงอยู่แล้วลองใหม่) · error ของ middleware เดิม (origin, maintenance)

#### ผล `already_submitted` (เพิ่มใน v1 · งาน integrity-c01)

```json
{ "opId": "01J…", "result": "already_submitted",
  "submission": { "assignment_id": "a1", "student_id": "st1", "status": "submitted", "score": 7, "late": false,
                  "submitted_at": 1762052400000, "method": "grid", "device_id": "dev_pc", "scan_session_id": "(ของสมุดคะแนน)",
                  "updated_at": 1762052400000 } }
```

- เกิดเมื่อ: op เป็น **รับงาน** และช่องที่ใช้ตัดสิน (ค่าใน DB หรือสภาพที่ op ก่อนหน้าในคำขอเดียวกันทิ้งไว้) มี `status = "submitted"` และ **ไม่เข้า** ข้อยกเว้น "ใส่คะแนนครั้งแรกในรอบเดียวกัน"
- ข้อยกเว้น (ได้ `ok` ตามเดิม) — ต้องครบ 3 ข้อ: ช่องมี `method ∈ {camera, hid, manual}` และ `scan_session_id` = `op.scanSessionId` · ช่อง `score IS NULL` · `op.score != null`
- ลำดับการตัดสินต่อ op ของ v1 (v3 แทรกขั้นใหม่ — ลำดับเต็มดูหัวข้อ "วันที่รับงาน" ด้านล่าง): `duplicate` → `epoch_changed` → `invalid(assignment_missing)` → `full_score_changed` → `assignment_closed` → `not_in_class` → `student_inactive` → `invalid(score_out_of_range)` → `superseded` → **`already_submitted`** → `ok`
- ไม่เขียนอะไร: ไม่มี upsert ไม่มีแถว audit (จึงไม่นับเป็น opId ที่ "ลงแล้ว") → ส่ง opId เดิมซ้ำจะถูกตัดสินใหม่ ได้ `already_submitted` อีกตราบที่ช่องยัง submitted (ถ้าช่องเปลี่ยนเป็น void ภายหลัง op ที่เก่ากว่าจะได้ `superseded`)
- `submission` = `mapSubmission` ของช่องที่ใช้ตัดสิน (ไม่ใช่ค่าที่ op ส่งมา)
- การแข่งกันสองเครื่อง: การตัดสินผูกกับ snapshot ของช่องทั้ง 9 ฟิลด์ (`cellsGuard` เดิม — batch abort ถ้าช่องเปลี่ยนหลังอ่าน แล้วอ่าน/ตัดสินใหม่ ≤ 3 รอบ) → คำขอที่แพ้จะถูกตัดสินใหม่กับค่าจริงและได้ `already_submitted` · **ห้าม** ใส่เงื่อนไข "ช่อง submitted" ลงใน SQL ของ `stillValid` เพราะ `INSERT … SELECT` ประเมินกับสภาพก่อน statement ทำให้คู่ `[void, รับงาน]` ในคำขอเดียวพัง (บันทึกใน decisions-local ของงาน)
- เส้นทาง "lost" (op ผ่าน judge แต่ไม่ลงเพราะ stillValid): ตัดสินใหม่ด้วย `judge` → ถ้าช่อง submitted และไม่เข้าข้อยกเว้น และไม่ใช่ superseded ตามเวลา → `already_submitted` (ไม่ใช่ `superseded`)
- op อื่นที่ไม่ใช่รับงาน (`grid`, `void`, `excused`) ไม่ได้ผลนี้เลย · ช่องที่ไม่มีแถว / void / excused → รับงานได้ตามเดิม
- การจัดการฝั่ง client (แอปรุ่นใหม่): เอาออกจากคิวเหมือน `ok` · ไม่เข้า "ส่งไม่สำเร็จ" · ไม่กั้น op ถัดไปของช่องเดียวกัน · หน้าที่เปิดอยู่ (สแกน, สมุดคะแนน) รับ `submission` เป็นค่าของช่องทันที · หน้าสแกนที่เปิดอยู่แสดงการ์ด "ส่งไปแล้ว — ไม่บันทึกซ้ำ" แบบเดียวกับสแกนซ้ำในเครื่อง · รายการที่แอปรุ่นเก่าพักไว้ใน "ส่งไม่สำเร็จ" ด้วยเหตุผลนี้ ถือว่าไม่กั้นและไม่ติดเครื่องหมายช่อง
- แอปรุ่นเก่า (main @ 18759a2): ไม่รู้จักผลนี้ → outbox พักไว้ใน "ส่งไม่สำเร็จ" ด้วยเหตุผล `already_submitted` (ข้อมูล server ไม่เปลี่ยน ครูกดทิ้งได้) จนกว่าจะอัปเดตแอป

#### วันที่รับงาน `receivedDate` และแก้วันที่ `dateOnly` (เพิ่มใน v3 · งาน c03-submit-date)

ตัวตรวจ/ตัวคำนวณตัวเดียวใช้ร่วม server และหน้าจอ: `shared/received-date.ts` (ไม่คัดลอกกฎ · D-c03-submit-date-01)

```ts
export type ReceivedDateProblem = "received_date_invalid" | "received_date_future" | "received_date_before_assigned";
export function isCeDate(v: unknown): v is string;            // /^(19|20)\d{2}-\d{2}-\d{2}$/ และเป็นวันจริง (กฎเดียวกับ ceDate ของ EP-05)
export function bkkNoonMs(date: string): number;               // 12:00 ไทยของวันนั้น = Date.UTC(y, m-1, d, 5) · "2026-10-30" → 1793336400000
export function checkReceivedDate(v: unknown, o: { today: string; assignedDate: string | null; latest?: string }): ReceivedDateProblem | null;
export const RECEIVED_DATE_CLOCK_SKEW_MS = 300_000;                // v4: 5 นาที
export function receivedDateDays(now: number): { today: string; latest: string }; // v4: { bkkToday(now), bkkToday(now + 5 นาที) }
export function receivedAtMs(receivedDate: string | null | undefined, eventAt: number, now: number): number;
```

- `checkReceivedDate` ตรวจเรียง (ตัวแรกที่เข้าชนะ): ไม่ผ่าน `isCeDate` (รวม `""`, ปี พ.ศ. `"2569-10-30"`, `"2026-02-30"`, `"30/10/2026"`) → `received_date_invalid` · `v > (latest ?? today)` → `received_date_future` (v4: server ส่ง `latest = bkkToday(now + 5 นาที)` — ช่วง 23:55–23:59 ไทย วันพรุ่งนี้ยังรับได้ เพราะนาฬิกาเครื่องอาจนำ server เล็กน้อย; `receivedAtMs` บีบเป็น `now` จึงไม่มีค่าในอนาคต และวันไทยที่บันทึกคือวันนี้ของ server · หน้าจอไม่ส่ง `latest`) · `assignedDate` ผ่าน `isCeDate` **และ** `assignedDate ≤ today` (วันจริงของ server ไม่ใช่ `latest`) **และ** `v < assignedDate` → `received_date_before_assigned` · นอกนั้น `null` (ผ่าน) — ไม่มีเพดานจำนวนวันย้อนหลัง (Gate 1 Q2) · `today` = `bkkToday(now)` ของ server ณ ตอนเขียน · วันมอบหมายที่อยู่ในอนาคต/ว่าง/ไม่ใช่ ค.ศ. = ไม่ใช้เป็นพื้น (D-c03-submit-date-04) → "วันนี้" ผ่านเสมอ
- `receivedAtMs` (BR-02): ไม่มีวันที่ → `eventAt` · `receivedDate === bkkToday(eventAt)` → `eventAt` (เวลาจริง) · นอกนั้น → `min(bkkNoonMs(receivedDate), now)` · `eventAt` = `clampClientTs(clientTs, now)` เดิม (ยังใช้เป็น `event_at` ตัดสินใครชนะ — ไม่ใช่วันที่รับงาน)

**op ไหนใช้วันที่** (ตัวอื่นไม่ตรวจและไม่ใช้ `receivedDate` เลย แม้ค่าผิด):

| op | ช่องก่อนเขียน (ตามสภาพ `effective` ในคำขอ) | `submitted_at` ที่เขียน |
|---|---|---|
| A. ทำให้ช่องเป็น submitted ครั้งแรก: `status: submitted` และ **ทุก method** `camera/hid/manual/grid` (Gate 1 Q3) ไม่มี `dateOnly` | ไม่มีแถว / void / excused | `receivedAtMs(receivedDate, eventAt, now)` |
| B. แก้วันที่ `dateOnly: true` + `method: grid` + `status: submitted` + `receivedDate` | submitted | วันเดิม (`receivedDate === bkkToday(before.submitted_at)`) → คง `before.submitted_at` · นอกนั้น `receivedAtMs(...)` |
| C. อื่น ๆ: แก้คะแนนช่องที่ส่งแล้ว (รวมคะแนนแรกในรอบเดียวกัน C-01), void, excused | ใด ๆ | ตามเดิม (`receivedDate` ถูกเพิกเฉย) |

- op B ที่ช่อง **ในฐานข้อมูล** มีวันที่ไทยของ `submitted_at` = `receivedDate` อยู่แล้ว (v4 · no-op): ตอบ `ok` + `submission` = ค่าปัจจุบันของช่อง **ไม่เขียน ไม่มี audit** (ตัดสินหลัง `superseded`/`cell_not_submitted`/`received_date_*`) → ปุ่มย้อนกลับของ EP-03/EP-04 ที่คลุมช่องนี้ยังใช้ได้ · ส่ง opId เดิมซ้ำ = ถูกตัดสินใหม่ (ไม่ใช่ `duplicate` เพราะไม่มีแถว audit) ได้ `ok` แบบเดิมตราบที่ช่องยังเป็นวันนั้น · ถ้า `before` เป็นแถวของคำขอเดียวกัน เขียนตามเดิม
- op B (แก้วันที่): เขียน `status = before.status`, `score = before.score` (**ไม่ใช้** `score` ใน op — AC-13), `late` คำนวณใหม่ตามกฎเดิม (`lateFixForCells` ใน batch), `method: grid`, `device_id` ของคำขอ, `scan_session_id = op.scanSessionId`, `event_at = eventAt`, `updated_at = now` · audit 1 แถว `action: update`, `method: grid`, `before = mapSubmission(before)` · เป็นงานของครู (`receive = 0`, `hand_in = 0`): ทำได้แม้งานปิดรับ และกับเด็กที่ย้าย/จบแล้วถ้าช่องไม่ void (กฎ D15/D23 เดิมใน `judge`/`stillValid`) · ไม่ถูก `already_submitted` กั้น (เป็น `grid`)
- `submission` ในผล `ok` = ค่าที่บันทึกจริง (รวม `late` หลัง `lateFixForCells`) → หน้าจอใช้ `late` จากผลได้ทันที
- audit ของ EP-01 เก็บ `after` เป็นแถวที่เขียน (รูปเดิม: `late` เป็น 0/1, มีฟิลด์ guard ติดมา) — **ไม่เปลี่ยนใน v3** · เทสต์เทียบ `!!after.late` · v4: ท้าย batch มี `auditRowLateStmt` (แบบ 0/1) ตัดสิน `after.late` ของแต่ละแถว audit ใหม่จาก `after` ของแถวนั้นเอง (status, submitted_at) กับกำหนดส่ง ณ ตอนเขียน (กฎเดียวกับ `lib/late.ts`) — ชนกับการเลื่อนกำหนดส่งก็ถูก และหลาย op ในช่องเดียวกันแต่ละแถวยังบอก late ของแถวที่ตัวเองเขียน
- v4: op B ที่ `before` เป็นแถวของคำขอเดียวกัน (เช่น `[hid รับงาน, grid dateOnly]` ช่องว่างเดียวกัน) รับเงื่อนไข `receive`/`hand_in` ของแถวนั้น → ถ้าแถวรับงานถูก `stillValid` ตัด (งานถูกปิด/เด็กออกระหว่างอ่านกับเขียน) แถวแก้วันที่ก็ไม่ลงด้วย ไม่สร้างช่อง submitted จากการแก้วันที่

**ลำดับการตัดสินต่อ op (v3 — ตัวแรกที่เข้าชนะ)**: `duplicate` → `epoch_changed` → **`invalid(redate_not_allowed)`** (`dateOnly: true` แต่ `method ≠ grid` หรือ `status ≠ submitted`) → `invalid(assignment_missing)` → `full_score_changed` → `assignment_closed` (เฉพาะรับงาน) → `not_in_class` → `student_inactive` → `invalid(score_out_of_range)` (**ข้ามเมื่อ `dateOnly`**) → `superseded` → `already_submitted` → **`invalid(cell_not_submitted)`** (`dateOnly` และช่องไม่มีแถว/void/excused) → **`invalid(received_date_*)`** (เฉพาะ op A/B: `checkReceivedDate`; op B ไม่มี `receivedDate` → `received_date_invalid`) → `ok`

- `redate_not_allowed` อยู่ใน `judge()` (ใช้ทั้งทางปกติและทาง "lost") · `cell_not_submitted` และ `received_date_*` ตัดสินในลูปหลักหลัง `superseded`/`already_submitted` (ช่องที่มีสิ่งใหม่กว่า = `superseded` ไม่ใช่ `cell_not_submitted` · รับงานซ้ำ = `already_submitted` เสมอแม้วันที่ผิด — BR-04)
- op ที่ "lost" (ผ่านการตัดสินแต่ไม่ลงเพราะ `stillValid`) ตอบตาม `judgeUnwritten` เดิม (`superseded`/`already_submitted`/refusal) · v4: op B ที่ไม่ลงและช่องตอนนี้ไม่ใช่ submitted (และไม่มีสิ่งที่ใหม่กว่า) → `invalid cell_not_submitted`
- ตัวอย่าง (วันนี้ 2026-11-02 09:00 ไทย · a1 มอบหมาย 10-26 กำหนด 10-30): hid + `"2026-10-30"` ช่องว่าง → `ok` `submitted_at` 1793336400000 `late:false` · `"2026-11-02"` clientTs 09:00 → `submitted_at` = 09:00 `late:true` · `"2026-11-03"` → `invalid received_date_future` · `"2026-10-25"` → `invalid received_date_before_assigned` · `"2569-10-30"` → `invalid received_date_invalid` · grid score 8 + `"2026-10-30"` ช่องว่าง → `ok` เที่ยง 10-30 `late:false` · grid `dateOnly` `"2026-10-30"` บนช่อง submitted 7 (11-02 09:00) → `ok` score 7 เที่ยง 10-30 `late:false` · `dateOnly` บนช่อง void → `invalid cell_not_submitted` · hid + `dateOnly` → `invalid redate_not_allowed`
- การจัดการฝั่ง client (แอปรุ่นใหม่ — ทำในแพ็กเกจ ui-redesign ไม่ใช่งานนี้): ใส่ `receivedDate` ให้ **ทุก op รับงาน** และทุก op `grid` ที่พิมพ์คะแนนลงช่องว่าง (ค่าที่ครูเลือก หรือ `bkkToday(actionTime())`) · op แก้วันที่ส่ง `score` = คะแนนปัจจุบันของช่อง, `fullScoreAtScan` = เต็มปัจจุบัน · `outbox.ts` ส่ง payload ทั้งก้อนอยู่แล้ว (ฟิลด์ใหม่ติดไปเอง รวม "ลองใหม่" ซึ่งคง `receivedDate` เดิม) · reason ใหม่ทั้ง 5 แสดงใน "ส่งไม่สำเร็จ" เป็นภาษาไทย
- แอปรุ่นเก่า: ไม่ส่งฟิลด์ใหม่ → พฤติกรรมเดิมทุกฟิลด์ (AC-21) · **ลำดับปล่อย: server v3 ก่อนแอปที่ส่งฟิลด์ใหม่เสมอ** (server เก่าตัด `receivedDate` ทิ้งเงียบ ๆ แล้วลงเวลาตอนนี้ และ `dateOnly` จะกลายเป็นการแก้คะแนนด้วย `score` ใน op)

### EP-02 `GET /api/assignments/:id/submissions` — ช่องทั้งหมดของงาน (หน้าสแกนดึงทุก 60 วิ)

- ไม่เปลี่ยนในงาน integrity-c01 และ v3 (คืน `submitted_at` = วันที่รับงาน อยู่แล้ว)
- 200: `{ "submissions": Submission[], "snapshot": true, "assignment": { "status": "open|closed", "full_score": number, "deleted": boolean } | null, "serverTime": number }` (ส่ง snapshot เต็มเสมอ แม้ client ส่ง `since`)

### EP-03 `POST /api/assignments/:id/bulk` — ปุ่มทั้งห้อง (ทั้งห้องส่งแล้ว / ให้เต็มทั้งห้อง / ล้างทั้งห้อง)

- ไม่เปลี่ยนในงาน integrity-c01 (เป็นงานให้คะแนนของครู ไม่ถูกกันด้วย `already_submitted`)
- Request: `{ "action": "all-submitted | full-score | clear", "classId": "string", "receivedDate": "string ≤ 32 ตัว | null (optional · ใหม่ v3 · ใช้ได้กับ all-submitted เท่านั้น)" }`
- 200: `{ "ok": true, "changed": number, "batchId": "string" }` (ไม่แตะช่อง excused) — รูปเดิม
- v3 `all-submitted` + `receivedDate`: ทุกช่องที่ถูกเปลี่ยน (ไม่มีแถว/void — ข้าม submitted/excused เหมือนเดิม) ได้ `submitted_at = receivedAtMs(receivedDate, now, now)` (วันนี้ = `now` เดิม · วันอื่น = 12:00 ไทยของวันนั้น) · `late` จาก `submitted_at` นั้นตามกฎเดิม (`lateFixForCells` + `auditLateSyncStmt` เดิม) · `event_at`/`updated_at` = `now` (ครูทำตอนนี้) · audit `bulk` ช่องละ 1 แถว `after.submitted_at` = ค่าที่เขียน → EP-04 คืนได้ตรงทุก ms · ไม่ส่ง = `now` เหมือนเดิม · จำนวน statement/แถวที่อ่านเท่าเดิม (อ่าน `assigned_date` เพิ่มในคำสั่งเดิม)
- Errors (ลำดับ v3 — ตัวแรกที่เข้าชนะ): `422 validation` (schema: ชนิด `receivedDate` ผิด) → **`400 received_date_not_applicable`** (มี `receivedDate` ที่ไม่ใช่ null กับ action `full-score`/`clear`) → **`400 received_date_invalid`** → **`400 received_date_future`** (v4: เทียบกับ `latest` = วันไทยของ now + 5 นาที เหมือน EP-01) → `404 not_found` (งาน) → `409 assignment_closed` (เฉพาะ all-submitted) → `400 class_not_assigned` → **`400 received_date_before_assigned`** (`checkReceivedDate` กับ `assigned_date` ของงาน) → `400 no_students` → (ตอนเขียน) `409 full_score_changed` · `409 modified_since` · `409 epoch_changed` · error ใหม่ไม่มีช่องใดเปลี่ยนและไม่มี audit
- message ภาษาไทยของ error ใหม่: `received_date_not_applicable` "วันที่รับงานใช้ได้กับ \"ทั้งห้องส่งแล้ว\" เท่านั้น" · `received_date_invalid` "วันที่รับงานไม่ถูกต้อง (ใช้ ค.ศ. ปปปป-ดด-วว)" · `received_date_future` "วันที่รับงานเป็นวันในอนาคต" · `received_date_before_assigned` "วันที่รับงานอยู่ก่อนวันมอบหมายงาน"

### EP-04 `POST /api/assignments/:id/bulk-undo` — ย้อนกลับปุ่มทั้งห้อง

- ไม่เปลี่ยนในงาน integrity-c01 · v3 ไม่แก้โค้ด (เพิ่มเทสต์): คืน `submitted_at` จาก `before` ใน audit ตรงทุก ms, `late` ตัดสินใหม่จากกำหนดส่งปัจจุบัน · การแก้วันที่ (EP-01 `dateOnly`) ของช่องใน batch หลังกด = `409 modified_since` (เทียบทุกฟิลด์ยกเว้น `late` รวม `submitted_at`) ไม่มีช่องใดถูกกู้คืน
- Request: `{ "batchId": "string" }`
- 200: `{ "ok": true, "changed": number }` หรือ `{ "ok": true, "changed": 0, "alreadyUndone": true }`
- Errors: `404 not_found` (batch) · `409 modified_since` · `409 epoch_changed`

### EP-05 `POST /api/assignments` — สร้าง/แก้งาน (+ ถามปรับคนที่ได้เต็มเดิมเมื่อเพิ่มคะแนนเต็ม · v2 งาน integrity-c02)

- ผู้เรียก: `src/components/AssignmentModal.tsx` (สร้างงาน / แก้ไขงาน / คัดลอกงาน — เปิดจากสมุดคะแนน) · server: `worker/routes/assignments.ts`
- Request (ฟิลด์เดิมทั้งหมดไม่เปลี่ยน · เพิ่ม 2 ฟิลด์ optional · request แบบเดิมยังผ่าน schema):

```json
{ "id": "a1 (ไม่ส่ง = สร้างใหม่)", "term_id": "t1 | null", "subject_id": "s1", "type_id": "wt_worksheet",
  "title": "ใบงานที่ 5", "unit": "string | null", "full_score": "integer 1–100 (v4: ไม่ส่งได้เมื่องานมีอยู่แล้ว = คงค่าในฐานข้อมูล)",
  "assigned_date": "YYYY-MM-DD (ค.ศ.) | null | \"\"", "due_date": "YYYY-MM-DD | null | \"\"", "note": "string | null",
  "publish_scores": "boolean", "status": "open | closed", "class_ids": ["c1", "c2"],
  "raise_choice": "adjust | keep  (ใหม่ v2 · optional — คำตอบของครูในกล่องถาม)",
  "raise_from": "integer (ใหม่ v2 · บังคับเมื่อมี raise_choice — คะแนนเต็มเดิมที่ครูเห็นในกล่องถาม)" }
```

- schema: มี `raise_choice` แต่ไม่มี `raise_from` (หรือกลับกัน) = `422 validation` · ค่าอื่นของ `raise_choice` = `422 validation`
- v4 (`full_score` ไม่ส่ง): งานที่มีอยู่ → คง `full_score` ที่อยู่ในฐานข้อมูล **ณ ตอนเขียน** (SQL ใน upsert เดียวกัน — เครื่องอื่นแก้ระหว่างนั้นก็ไม่ถูกทับ) ไม่ใช่การเพิ่ม/ลดคะแนนเต็ม (ไม่ถาม ไม่มี guard ลด/เพิ่ม · `raise_choice`/`raise_from` ที่ส่งมาด้วยถูกเพิกเฉยทั้งหมด รวมข้อ 3) · `assignment.full_score` ใน 200 และ `after.full_score` ของ audit งาน = ค่าที่เก็บจริง · งานใหม่ (ไม่มี `id` หรือ `id` ที่ไม่มีอยู่) ไม่ส่ง = `422 validation` · ผู้เรียก: `Gradebook.tsx` `saveAsgPatch` (ปิด/เปิดรับงาน, ซ่อน/แสดงคะแนน) ไม่ส่ง `full_score` · AssignmentModal ส่งเหมือนเดิม
- นิยาม: **เพิ่มคะแนนเต็ม** = มีงานนี้อยู่แล้ว และ `full_score` ใหม่ > `full_score` ในฐานข้อมูล · **คนที่ได้เต็มเดิม** = แถว submissions ของงานนี้ (ทุกห้อง ทุกสถานะนักเรียน ทุก method) ที่ `status = 'submitted'` และ `score = full_score ในฐานข้อมูล ณ ตอนเขียน` (BR-01) · v4: **ยกเว้น** เด็กที่ห้อง (`students.class_id`) เป็นห้องที่งานผูกอยู่แต่ถูกเอาออกใน `class_ids` ของคำขอเดียวกัน — ไม่นับใน `count` ของ 409/200 และไม่ถูกปรับ (ทุกคำสั่งที่นับ/ปรับรันก่อนเขียนห้องใหม่ใน batch)

#### ผลตามกรณี (ตรวจตามลำดับนี้ ตัวแรกที่เข้าชนะ)

| # | กรณี | ผล | เขียนอะไร |
|---|---|---|---|
| 1 | ไม่ล็อกอิน | `401 unauthorized` | ไม่มี |
| 2 | schema / วันที่ไม่ใช่ ค.ศ. | `422 validation` (เดิม) | ไม่มี |
| 3 | มี `raise_choice` + งานมีอยู่ + `full_score` ในฐานข้อมูล ≠ `raise_from` | `409 full_score_changed` (ใหม่ใน EP นี้) | ไม่มี |
| 4 | ลดคะแนนเต็ม และมี score > เต็มใหม่ | `409 score_over_full` `{ over }` (เดิม) | ไม่มี |
| 5 | ห้องผิดปีการศึกษา | `422 class_year_mismatch` (เดิม) | ไม่มี |
| 6 | เพิ่มคะแนนเต็ม + ไม่มี `raise_choice` + คนที่ได้เต็มเดิม ≥ 1 | `409 raise_choice_required` (ใหม่) | ไม่มี |
| 7 | เพิ่มคะแนนเต็ม + `raise_choice: "adjust"` | `200` + `raise.choice = "adjust"` | งาน + ช่องที่ปรับ + audit (ด้านล่าง) |
| 8 | เพิ่มคะแนนเต็ม + `raise_choice: "keep"` | `200` + `raise.choice = "keep"` | งาน + audit งาน (ไม่แตะช่อง) |
| 9 | อื่น ๆ: สร้างใหม่, คัดลอก, เท่าเดิม, ลดได้, เพิ่มแต่ไม่มีใครได้เต็มเดิม (ไม่มี `raise_choice`) | `200` + `raise: null` (เหมือนเดิม) | เหมือนเดิม |

- `raise_choice` ที่ส่งมากับคำขอที่ไม่ใช่การเพิ่มคะแนนเต็ม (สร้างใหม่ / เท่าเดิม / ลด) → ไม่สนใจ (`raise: null`) แต่ข้อ 3 ยังตรวจถ้างานมีอยู่
- ข้อ 3, 4, 5, 6 ตรวจทั้งก่อนเขียนและซ้ำ **ใน batch เดียวกับการเขียน** (`abortIf`) — batch ล้มแล้วดูใหม่ตามลำดับเดิม ตอบ error ของข้อแรกที่เข้า ไม่เข้าข้อใดเลย = โยนต่อ (5xx) · data epoch เปลี่ยน = `409 epoch_changed` (เดิม) · ทุกกรณีที่ไม่ใช่ 200 = ไม่มีอะไรลงเลย (งาน, ช่อง, audit)

#### 200 Response

```json
{ "ok": true, "assignment": { "...Assignment เดิม": "" },
  "raise": null }
```

```json
{ "ok": true, "assignment": { "...": "" },
  "raise": { "choice": "adjust", "from": 10, "to": 20, "count": 3, "batchId": "01J…" } }
```

| ฟิลด์ `raise` (ใหม่ v2) | ความหมาย |
|---|---|
| `null` | ไม่มีการถาม (กรณี 9) — แอปเก่าไม่อ่านฟิลด์นี้ |
| `choice` | `adjust` / `keep` ตามคำขอ |
| `from` / `to` | คะแนนเต็มเดิม (= `raise_from`) / ใหม่ |
| `count` | `adjust`: จำนวนช่องที่ปรับจริงใน batch นี้ · `keep`: จำนวนคนที่ได้เต็มเดิม ณ ตอนเขียน (ไม่ได้แตะ) |
| `batchId` | `adjust` และ `count ≥ 1`: batch_id ของการปรับ (ใช้กับ EP-04 เพื่อย้อนกลับ) · อื่น ๆ: `null` |

#### Errors ใหม่

```json
{ "error": "raise_choice_required", "message": "มี 3 คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง",
  "count": 3, "from": 10, "to": 20 }
```

```json
{ "error": "full_score_changed", "message": "คะแนนเต็มของงานนี้เพิ่งถูกแก้จากเครื่องอื่น (ตอนนี้ 15) — ปิดแล้วเปิดแก้ไขงานใหม่",
  "currentFullScore": 15 }
```

- `409 raise_choice_required`: `count` = คนที่ได้เต็มเดิม ณ ตอนตัดสิน (ตัวเลขจาก server ไม่ใช่จากเครื่อง — AC-12) · `message` เขียนไว้สำหรับ **แอปรุ่นเก่า** ซึ่งแสดง `message` ในฟอร์มอยู่แล้ว (BR-10) · แอปรุ่นใหม่ไม่แสดง message นี้ แต่เปิดกล่องถามจาก `count`/`from`/`to`
- `409 full_score_changed`: ครูตอบกล่องถามจากตัวเลขเก่า (อีกเครื่องแก้คะแนนเต็มระหว่างถาม — AC-06) · ไม่ปรับอะไรจากตัวเลขเก่า

#### สิ่งที่ลงใน batch เดียว (`batchAtEpoch`) เมื่อ `raise_choice: "adjust"` (BR-02, BR-04, BR-05)

1. guard เดิม (epoch, ลดต่ำกว่าคะแนน, ห้องผิดปี) + guard ใหม่ `full_score ในฐานข้อมูล = raise_from`
2. audit ช่องละ 1 แถว — เลือกช่องด้วย SQL **ใน batch** (`status='submitted' AND score = raise_from`) ไม่ใช้รายชื่อจาก client หรือจากการอ่านก่อนเขียน: `entity: "submission"`, `entity_id: "<aid>:<student_id>"`, `assignment_id`, `student_id`, **`action: "bulk"`**, **`method: "bulk"`**, `batch_id` = batchId, `before` = ค่าช่องก่อนปรับ, `after` = ค่าช่องหลัง batch — ทั้งสองในรูป `Submission` (10 ฟิลด์ของ `mapSubmission`: `late` เป็น boolean) เพื่อให้ EP-04 ย้อนได้โดยไม่แก้โค้ด
3. ช่องเดียวกัน: `score = full_score ใหม่`, `method = 'bulk'`, `device_id` = เครื่องที่บันทึก, `updated_at = event_at = เวลาบันทึก` · `status`, `late`, `submitted_at`, `scan_session_id` ไม่เปลี่ยน (ยกเว้น `late` ที่ `lateFixForAssignment` ตัดสินใหม่ถ้าครูแก้กำหนดส่งในคำขอเดียวกัน — พฤติกรรมเดิม; `after` ต้องเป็นค่าหลังขั้นนี้)
4. upsert งาน + ห้อง + `lateFixForAssignment` (เดิม)
5. audit งาน 1 แถว (เดิม `action: "update"`) **batch_id เดียวกับข้อ 2** · `after` เพิ่ม `raise: { choice, from, to, count }` โดย `count` นับใน SQL ภายใน batch
- `keep`: ข้อ 1, 4, 5 (`batch_id` ของ audit งาน = batchId ใหม่, `count` = คนที่ได้เต็มเดิม ณ ตอนเขียน) ไม่มี audit ช่อง
- ไม่มีการถาม (กรณี 9): เหมือนเดิมทุกอย่าง (audit งานไม่มี `raise`, `batch_id` null) · เพิ่ม guard ใน batch: เพิ่มคะแนนเต็ม + ไม่มี `raise_choice` + มีคนได้เต็มเดิม ณ ตอนเขียน → batch ล้ม → `409 raise_choice_required` (กันคนที่สแกนเต็มเข้ามาระหว่างอ่านกับเขียน)

#### ย้อนกลับการปรับ (BR-09) — ใช้ EP-04 เดิม ไม่แก้โค้ด

- client เรียก `POST /api/assignments/:id/bulk-undo` `{ "batchId": raise.batchId }` → `200 { ok, changed }` (คืน score เดิม ช่องละ 1 แถว audit `restore`, คะแนนเต็มคงเป็นค่าใหม่) · ซ้ำ = `{ ok, changed: 0, alreadyUndone: true }` · ช่องถูกแก้หลังปรับ = `409 modified_since` (message ของ EP-04 พูดถึง "การล้าง" → client แสดงข้อความของตัวเอง ดูหัวข้อ client)
- EP-04 อ่านเฉพาะแถว `action = 'bulk'` ของ batch นั้น → audit งาน (action `update`) ที่ใช้ batch_id เดียวกันไม่ถูกย้อน (คะแนนเต็มคงไว้ ตาม BR-09)

#### การจัดการฝั่ง client (แอปรุ่นใหม่ — AssignmentModal)

- กดบันทึก → ส่งคำขอแบบเดิม (ไม่มี `raise_choice`) เสมอ → `200` จบ (ไม่ถาม) · `409 raise_choice_required` → เปิดกล่องถาม (Dialog เดิม) ด้วย `count`/`from`/`to` จาก server — ไม่นับจากข้อมูลในเครื่อง
- กล่องถาม: ยกเลิก / Esc / แตะนอกกล่อง → กลับฟอร์มพร้อมค่าที่กรอก ไม่ส่งคำขอ · "คงไว้" / "ปรับ" → ส่งคำขอเดิม + `raise_choice` + `raise_from = from` · ปุ่มทั้งหมด disabled จนได้ผล
- `200` + `raise.choice = "adjust"` + `count ≥ 1` → ปิดฟอร์ม, toast ค้าง "บันทึกแล้ว · ปรับเป็นเต็มใหม่ N คน" (N = `raise.count` จาก server) พร้อมปุ่ม "ย้อนกลับ" → EP-04 · `409 modified_since` จาก EP-04 → "มีคะแนนถูกแก้หลังปรับ — ย้อนกลับไม่ได้ แก้ในสมุดคะแนนแทน"
- `409 full_score_changed` → ปิดกล่องถาม แสดง `message` ในฟอร์ม (ค่าที่กรอกคงอยู่) · error อื่น → แสดงในฟอร์มแบบเดิม
- แอปรุ่นเก่า (ก่อน v2): ไม่ส่ง `raise_choice` → เพิ่มคะแนนเต็มที่มีคนได้เต็มเดิมได้ `409 raise_choice_required` → ฟอร์มแสดง `message` (บันทึกไม่ได้จนอัปเดตแอป — Gate 1 Q3) · กรณีอื่นบันทึกได้เหมือนเดิม

### EP-06 `GET /api/dashboard` — หน้าหลัก (เพิ่มใน v6 · งาน ui-redesign รอบ 1)

- ผู้เรียก: `src/lib/dashboard.ts` → `src/pages/Home.tsx` + `src/components/home/*` · server: `worker/routes/dashboard.ts` · ฟิลด์เดิมทั้งหมดไม่เปลี่ยน (`openAssignments`, `gradingAssignments`, `awaitingCount`, `missingCount`, `attendanceToday`, `followUp`, `serverTime`)
- เพิ่ม 2 ฟิลด์ใน `DashboardPayload` (`shared/types.ts`) — คิดจากแถวที่ endpoint อ่านอยู่แล้ว **ไม่อ่านแถวเพิ่ม** (งบ volume เดิมผ่าน):
  - `dueSoon: { assignmentId, classId, studentIds[] }[]` — งานที่ **เปิดรับ** และ `due_date` เป็นวันนี้หรือพรุ่งนี้ (`date` ของคำขอ) ต่อ (งาน, ห้อง): เด็กที่ `workState === "pending"` (ยังไม่ส่ง ไม่ยกเว้น ยังไม่เลยกำหนด) · แถวที่ไม่มีเด็กค้างไม่ถูกส่ง · งานที่ปิดแล้ว/เลยกำหนดไม่อยู่ (เลยกำหนด = `followUp`)
  - `absentToday: { classId, studentId, status: "late"|"leave"|"sick"|"absent" }[]` — เด็ก `active` ของห้องนั้นที่สถานะเช็คชื่อรายวันของวันนี้ไม่ใช่ `present` · คิวรีเช็คชื่อเปลี่ยนจาก `GROUP BY` เป็นระดับแถว (อ่านแถวเท่าเดิม) แล้วรวมยอดต่อห้องใน JS — ยอดใน `attendanceToday` เท่าเดิมทุกค่า
- แอปรุ่นเก่า: ไม่อ่านสองฟิลด์นี้ (ไม่กระทบ) · แอปรุ่นใหม่: ถ้าไม่มีสองฟิลด์ (server เก่า หรือสำเนาแคชในเครื่องที่บันทึกก่อนอัปเดต) ถือว่าว่าง การ์ดไม่พัง · ลำดับปล่อย: **server ก่อนแอป** เพื่อให้การ์ดมีข้อมูลตั้งแต่เปิดใช้ (ลำดับเดียวกับ v3/v4)

### EP-07 `PUT /api/settings` — ค่า `home_cards` (เพิ่มใน v6)

- คีย์ใหม่ `home_cards` (string) ใน `ALLOWED_SETTINGS` (`worker/routes/catalog.ts`) และ `getSettings` (`worker/lib/db.ts` ค่าเริ่มต้น `""`) · `Settings.home_cards` (`shared/types.ts`) · ไม่มี migration (ตาราง `settings` เป็น key/value)
- รูปแบบค่า: JSON `{"v":1,"order":["open","att",…],"hidden":["classes",…]}` — ตัวแปล/ค่าเริ่มต้น/คีย์ที่ไม่รู้จัก/เวอร์ชันอื่น อยู่ที่ฝั่ง client เท่านั้น (`src/lib/homeCards.ts`) server เก็บเป็นข้อความตามที่ส่งมา (ผ่านกติกา body ≤ 1MB และ settings ต้องเป็น object เดิม) · `""` = เลย์เอาต์เริ่มต้น
- ซิงก์: `GET /api/bootstrap` คืน `settings.home_cards` → ทุกเครื่องของครูเห็นหน้าหลักเดียวกัน · การเขียนผ่าน batch เดียวกับ audit (เดิม) · ไม่เข้าคิวออฟไลน์: ออฟไลน์แก้ไม่ได้ (หน้าจอย้อนกลับและแจ้ง "ออฟไลน์ — ปรับหน้าหลักได้เมื่อออนไลน์")

### EP-07 `PUT /api/settings` — ค่า `scan_cards` `attendance_cards` `random_cards` (เพิ่มใน v7)

- คีย์ใหม่ 3 ตัว (string) ใน `ALLOWED_SETTINGS` และ `getSettings` (ค่าเริ่มต้น `""`) · `Settings` ใน `shared/types.ts` เพิ่ม 3 ฟิลด์ — รูปแบบเดียวกับ `home_cards`: JSON `{"v":1,"order":[…],"hidden":[…]}` ของการ์ดหน้าสแกน/เช็คชื่อ/สุ่มชื่อ ตามลำดับ · ค่า `""` = ใช้การ์ดเริ่มต้นของหน้านั้น
- ไม่มี endpoint ใหม่ · แอปรุ่นเก่าไม่อ่านคีย์เหล่านี้ (ไม่กระทบ) · เทสต์ `test/api/page-cards-settings.test.ts`

### EP-07 `PUT /api/settings` — ค่า `gradebook_cards` `reports_cards` `students_cards` `settings_cards` (เพิ่มใน v8)

- คีย์ใหม่ 4 ตัว (string) ใน `ALLOWED_SETTINGS` และ `getSettings` (ค่าเริ่มต้น `""`) · `Settings` ใน `shared/types.ts` เพิ่ม 4 ฟิลด์ — รูปแบบเดียวกับ `home_cards`: JSON `{"v":1,"order":[…],"hidden":[…]}` ของการ์ดหน้าคะแนน/รายงาน/นักเรียน/ตั้งค่า (การ์ดของตั้งค่าอยู่บนหมวด "ทั่วไป") · ค่า `""` = การ์ดเริ่มต้นของหน้านั้น
- ไม่มี endpoint ใหม่ · ไม่มี migration · แอปรุ่นเก่าไม่อ่านคีย์เหล่านี้ · เทสต์ `test/api/page-cards-settings.test.ts` · **ปล่อย server ก่อนแอป** (แอปใหม่ PUT คีย์ที่ server เก่าไม่รู้จักจะถูกทิ้งเงียบ ๆ ทำให้การ์ดไม่ซิงก์)

### EP-08 `POST /api/attendance/batch` — ยกเลิกการเช็ค `status: "none"` (เพิ่มใน v9 · งาน attendance-clear)

- ผู้เรียก: `src/lib/attSync.ts` (`runFlush`) ← `src/pages/Attendance.tsx` (แตะซ้ำบนเด็กที่มีสถานะเท่ากับปุ่มที่เลือก) · server: `worker/routes/attendance.ts` · ไม่มี endpoint ใหม่ ไม่มี migration
- request: แต่ละแถวใน `rows[]` ส่ง `status` ได้เพิ่มอีกค่า `"none"` = **ยกเลิกการเช็ค** → server **ลบแถว** `(session_id, student_id)` ทำให้เด็กกลับเป็น "ยังไม่เช็ค" (ฟิลด์อื่นเหมือนเดิม: `opId`, `baseUpdatedAt`, `dataEpoch`, `method`; `time` ไม่ใช้) · ส่งปนกับแถวเช็คปกติใน batch เดียวกันได้
- กติกาที่ยกเลิกต้องผ่านเหมือนการเขียนอื่น: (1) `dataEpoch` ไม่ตรง/กู้คืนระหว่างทาง = `409 epoch_changed` ไม่ลบอะไร (2) เด็กทุกคนใน batch ต้อง `active` และอยู่ห้องที่ batch ระบุ ไม่งั้น `422 not_in_class` ทั้ง batch (ตรวจซ้ำใน transaction เดียวกับการลบ) (3) `date` ก่อนต้นปีการศึกษา = `422 before_school_year` (4) ชนกับอีกเครื่อง: ถ้าในระบบมีแถวนั้นอยู่ และ `baseUpdatedAt` เป็น null หรือเก่ากว่า `updated_at` ของแถว = `409 conflict` (`draft.status = "none"`, `server` = แถวในระบบ) เว้นแต่ `force: true` · การตรวจซ้ำอยู่ใน batch เดียวกับการลบ (เหมือนการเขียนปกติ) (5) แถวไม่มีอยู่แล้ว = สำเร็จ ไม่ใช่ conflict ไม่มี audit (idempotent) · ส่ง `opId` เดิมซ้ำหลังสำเร็จ = ไม่ทำซ้ำ
- audit: 1 แถวต่อการลบจริง ใน batch เดียวกัน: `entity "attendance"`, `action "void"`, `before {status}`, `after null`, `method` ตามที่ส่ง · ไม่เขียนถ้าไม่มีแถวให้ลบ
- เมื่อลบแถวสุดท้ายของคาบ/วัน server ลบ `attendance_sessions` ที่ว่างนั้นด้วย (ใน batch เดียวกัน) เพื่อให้รายงาน/Excel ไม่นับวันที่ไม่มีใครถูกเช็คเป็น "วันที่เช็คแล้ว" · เช็คใหม่วันนั้นสร้าง session ใหม่ตามเดิม
- response 200: ฟิลด์เดิมไม่เปลี่ยน (`ok`, `sessionId`, `updatedAt`, `changed`, `rows`, `state`) **เพิ่ม `absent: string[]`** = นักเรียนใน batch ที่ในระบบ **ไม่มี** แถวแล้ว (ยกเลิกสำเร็จ หรืออีกเครื่องยกเลิกไปแล้ว) — client ถือว่านี่คือการยืนยันของแถว `none` (แถว `none` ที่ server ไม่พูดถึงเลยจะค้างในคิวแล้วส่งใหม่) · `changed` นับเฉพาะแถวที่เปลี่ยนจริง (ยกเลิกแถวที่ไม่มี = 0)
- ผู้อ่านแถวเช็คชื่อ (`GET /api/attendance`, `/days`, `/api/dashboard`, `/api/reports/summary`, ส่งออก Excel, หน้าสุ่มชื่อ, ประวัตินักเรียน, backup/restore) **ไม่เปลี่ยน** — แถวที่ถูกลบคือ "ยังไม่เช็ค" ตามเดิม; backup/restore ตรวจแล้วรับไฟล์ที่ไม่มีแถว/ไม่มี session ได้
- แอปรุ่นเก่า: ไม่ส่ง `"none"` (ไม่กระทบ) · แอปรุ่นใหม่กับ server เก่า: `"none"` ถูกปฏิเสธด้วย `422 validation` — client เก็บแถวไว้ในเครื่องและแสดง "บันทึกไม่สำเร็จ · ลองอีกครั้ง" ไม่ทิ้ง → **ปล่อย server ก่อนแอป**
- เทสต์: `test/api/attendance-clear.test.ts`, `test/unit/attendance-round5.test.tsx`

### หมายเหตุ `scan_sessions.mode` (ตัดสินใจ 4 พ.ย. — D40)
`scan_sessions.mode` บนเซิร์ฟเวอร์คือ **โหมดตอนเริ่มรอบ** ไม่ใช่โหมดล่าสุด: การสลับโหมดสแกนกลางรอบเป็นการตั้งค่าฝั่ง client มีผลกับสแกนครั้งถัดไป (แต่ละ op ส่งวิธีรับ `method` ของตัวเอง) ไม่มี route แก้ mode ของ session และไม่เพิ่ม

## Changelog

| เวอร์ชัน | วันที่ | เปลี่ยนอะไร | งาน | กระทบ |
|---|---|---|---|---|
| v1 | 2026-11-02 | สร้างไฟล์: บันทึก EP-01..EP-04 ตามโค้ด main @ 18759a2 + เพิ่มผล `already_submitted` ใน EP-01 (request ไม่เปลี่ยน, ผลเดิมไม่เปลี่ยน) | 2026-11-02-integrity-c01 | server `worker/routes/submissions.ts`, type `shared/types.ts`, client `outbox.ts` / `Scan.tsx` / `Gradebook.tsx` / `Overlays.tsx` · แอปรุ่นเก่าเห็นใน "ส่งไม่สำเร็จ" (Gate 1 Q3) |
| v2 | 2026-11-02 | เพิ่ม EP-05 `POST /api/assignments` (บันทึกตามโค้ดเดิม + request `raise_choice`/`raise_from`, ผล `raise`, `409 raise_choice_required`, `409 full_score_changed`) · EP-04 มีผู้เรียกใหม่ (ย้อนกลับการปรับ) โดยไม่เปลี่ยน · EP-01..04 ไม่เปลี่ยน | 2026-11-02-integrity-c02 | server `worker/routes/assignments.ts` · client `AssignmentModal.tsx` · แอปรุ่นเก่าเพิ่มคะแนนเต็มที่มีคนได้เต็มเดิมไม่ได้จนอัปเดต (Gate 1 Q3) · D-integrity-c02-01..07 |
| v3 | 2026-11-02 | EP-01 request เพิ่ม `receivedDate?`, `dateOnly?` · `invalid` เพิ่ม reason `received_date_invalid` / `received_date_future` / `received_date_before_assigned` / `cell_not_submitted` / `redate_not_allowed` · ลำดับการตัดสินใหม่ · EP-03 request เพิ่ม `receivedDate?` (all-submitted) + 400 `received_date_*` / `received_date_not_applicable` · EP-04 ไม่แก้ (เพิ่มเทสต์) · EP-02/EP-05 ไม่เปลี่ยน · ตัวตรวจร่วม `shared/received-date.ts` · ไม่มี migration | 2026-11-02-c03-submit-date | server `worker/routes/submissions.ts` + `shared/received-date.ts` (ใหม่) + type `shared/types.ts` · client (Scan/Gradebook/ข้อความ "ส่งไม่สำเร็จ") ทำในแพ็กเกจ ui-redesign · **ปล่อย server ก่อนแอป** · แอปเก่าไม่กระทบ · D-c03-submit-date-01..07 |
| v5 | 2026-11-03 | กติกาทั่วไป (ทุก endpoint): header no-store/nosniff, Sec-Fetch-Site, 413 `too_large`, rate limit แบบ atomic + /64 + ต่ออีเมล, 429 บน change-password, เปลี่ยนรหัสแล้วเครื่องอื่นหลุด, `restore_failed` ไม่มี `detail`, ขีดความยาวรหัส/deviceId · EP-01..EP-05 ไม่เปลี่ยน · ไม่มี migration | 2026-11-03-server-security | server `worker/app.ts`, `lib/{auth,http}.ts`, `routes/{auth,reset,backup}.ts` · client: คำเตือนก่อนดาวน์โหลด backup (`RestoreModal.tsx` `BackupWarning`, `Settings.tsx`) · แอปเก่าไม่กระทบ (client ใช้แค่ code ของ `restore_failed`; 429 แสดง message เดิม) |
| v4 | 2026-11-03 | EP-01: re-date วันเดิม = `ok` ไม่เขียน/ไม่มี audit · `received_date_future` ยอมนาฬิกาเครื่องนำ ≤ 5 นาที (`latest`) · audit `after.late` ซิงก์กับค่าที่บันทึก · op B ที่พึ่งแถวรับงานในคำขอเดียวกันรับ guard ของแถวนั้น · lost op B บนช่องที่ไม่ submitted = `cell_not_submitted` · EP-03: `received_date_future` ใช้ `latest` เดียวกัน · EP-05: `full_score` ไม่บังคับเมื่องานมีอยู่ (คงค่าใน DB) · คนที่ได้เต็มเดิมไม่รวมห้องที่ถูกเอาออกในคำขอเดียวกัน · EP-02/EP-04 ไม่เปลี่ยน · ไม่มี migration | 2026-11-03-correctness-lows | server `submissions.ts`, `assignments.ts`, `shared/received-date.ts` · client `Gradebook.tsx` (`saveAsgPatch` ไม่ส่ง `full_score` → **ปล่อย server ก่อนแอป**: server v3 จะตอบ 422) · แอปเก่าไม่กระทบ (ส่ง `full_score` ครบเหมือนเดิม) |
| v6 | 2026-11-04 | EP-06 (ใหม่ในเอกสาร) `/api/dashboard` เพิ่ม `dueSoon`, `absentToday` · EP-07 `PUT /api/settings` เพิ่มคีย์ `home_cards` + `Settings.home_cards` · EP-01..EP-05 ไม่เปลี่ยน · ไม่มี migration | 2026-11-02-ui-redesign (รอบ 1: เมนู + หน้าหลัก) | server `worker/routes/dashboard.ts`, `catalog.ts`, `lib/db.ts`, `shared/types.ts` · client `src/pages/Home.tsx`, `src/components/home/*`, `src/lib/{homeCards,homePrefs,homeLogic}.ts` · **ปล่อย server ก่อนแอป** · แอปเก่าไม่กระทบ |
| v7 | 2026-11-04 | EP-07 `PUT /api/settings` เพิ่มคีย์ `scan_cards` `attendance_cards` `random_cards` + `Settings` | ui-redesign รอบ 2 | เพิ่มอย่างเดียว ไม่กระทบแอปเก่า |
| v8 | 2026-11-04 | EP-07 `PUT /api/settings` เพิ่มคีย์ `gradebook_cards` `reports_cards` `students_cards` `settings_cards` + `Settings` | ui-redesign รอบ 3 (หน้าตั้งค่า) | server `catalog.ts`, `lib/db.ts`, `shared/types.ts` · **ปล่อย server ก่อนแอป** · แอปเก่าไม่กระทบ |
| v9 | 2026-11-04 | EP-08 (ใหม่ในเอกสาร) `POST /api/attendance/batch` แถวรับ `status: "none"` = ยกเลิกการเช็ค (ลบแถว) + response เพิ่ม `absent[]` + ลบ session ว่าง · ฟิลด์/ผลเดิมไม่เปลี่ยน · ไม่มี migration | attendance-clear (เจ้าของงาน: "ทำเลย") | server `worker/routes/attendance.ts` · client `src/lib/attSync.ts`, `src/pages/Attendance.tsx` · **ปล่อย server ก่อนแอป** · แอปเก่าไม่กระทบ · D39 |
| v9.1 | 2026-11-04 | `429 rate_limited` ของ `POST /api/auth/login` เพิ่ม header `Retry-After` (วินาทีเต็ม ≥ 1) และ `retryAfter` (ตัวเลขเดียวกัน) ใน body · ฟิลด์/งบเดิมไม่เปลี่ยน · ไม่มี migration | login-retry-after | server `worker/app.ts`, `worker/lib/{auth,http}.ts`, `worker/routes/auth.ts` · client `src/lib/api.ts` อ่านอยู่แล้ว · แอปเก่าไม่กระทบ |

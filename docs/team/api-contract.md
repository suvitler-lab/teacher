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
- (v9.2) **เปลี่ยนชื่ออุปกรณ์** `POST /api/devices/:id/rename` body `{ name: string }` (ต้องล็อกอิน · เครื่องไหนก็ตั้งชื่อเครื่องไหนก็ได้) → `200 {ok:true, name}` (ชื่อที่ตัดช่องว่างหัวท้ายแล้ว) · ยาว 1–40 ตัว (หลังตัดช่องว่าง) ไม่งั้น `422 bad_device_name` พร้อม `message` ภาษาไทย · ไม่พบ id = `404 not_found` · ชื่อซ้ำได้ · เป็นการอัปเดตแถวเดียว ไม่ใช้ `batchAtEpoch` และไม่เขียน audit · **ชื่อที่เก็บในเซิร์ฟเวอร์ชนะ**: `POST /api/auth/login` / `/api/setup` เพิ่มแถวอุปกรณ์ใหม่ด้วยชื่อที่ส่งมา แต่กับอุปกรณ์ที่มีแถวอยู่แล้วจะไม่เขียนชื่อทับอีก (เดิมเขียนทับทุกครั้งที่ล็อกอิน)
- (v9.2) **ชื่อซ้ำ**: `POST /api/classes` (ในปีการศึกษาเดียวกัน) `POST /api/subjects` `POST /api/work-types` ปฏิเสธชื่อที่ตรงกับรายการที่ยังไม่ถูกเก็บ (archived = 0) ของอีกแถว — เทียบหลังตัดช่องว่างหัวท้าย ไม่สนตัวพิมพ์เล็ก/ใหญ่ — ด้วย `409 duplicate_name` + `message` ภาษาไทยที่บอกชื่อนั้น · ตรวจเฉพาะเมื่อการเขียนอาจสร้างชื่อซ้ำ (แถวใหม่ / เปลี่ยนชื่อ / นำแถวที่เก็บแล้วกลับมาใช้) — บันทึกแถวเดิมที่ชื่อไม่เปลี่ยน (จัดลำดับ เปลี่ยนสี) ไม่ถูกกั้น · `name` ของ 3 endpoint นี้ถูกตัดช่องว่างหัวท้ายก่อนเก็บ
- (v9.2) **`POST /api/assignments`**: `title` ยาวเกิน 200 ตัว = `422 title_too_long` (ภาษาไทย) · งานใหม่ หรืองานที่ย้ายไปประเภทอื่น ที่ใช้ประเภทงานที่ถูกเก็บแล้ว (`work_types.archived = 1`) = `422 work_type_archived` (ภาษาไทย) · งานที่มีประเภทนั้นอยู่แล้วแก้ไขต่อได้

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


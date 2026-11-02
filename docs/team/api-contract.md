# API Contract: งานครบ (ส่วนการส่งงาน/คะแนน)

เวอร์ชัน: v1 · อัปเดต 2026-11-02 · แก้ได้เฉพาะ Tech Lead (เปลี่ยนแล้วบันทึกใน changelog และ decisions)

> ไฟล์นี้เริ่มบันทึกในงาน `2026-11-02-integrity-c01` เฉพาะ endpoint ของ submissions (`worker/routes/submissions.ts`) — endpoint อื่นยังไม่ได้บันทึก ให้ Tech Lead งานถัดไปเพิ่มเป็น EP-05 ขึ้นไป · ID ของ EP เป็นของทั้งโปรเจกต์ ห้ามนำเลขกลับมาใช้ใหม่

## กติกาทั่วไป

- Base URL: `/api` · Worker เดียว (Hono) · ฐานข้อมูล D1
- Auth: cookie session ของครู (`requireAuth`) · คำขอที่ไม่ใช่ GET ต้องผ่านการตรวจ origin
- Data epoch: client ส่ง header `X-Data-Epoch` (ทุกคำขอที่ไม่ใช่ GET) และ/หรือ `dataEpoch` ต่อ op · กู้คืนข้อมูลแล้ว epoch เปลี่ยน → op เก่าได้ `epoch_changed`
- รูปแบบ error: `{ "error": "<code>", "message": "ข้อความไทย" }` · schema ไม่ผ่าน = `422 { "error": "validation", "issues": [...] }` · ไม่ล็อกอิน = `401 unauthorized`
- เวลา: epoch milliseconds (number) ตามนาฬิกาของ server · `clientTs` = เวลาที่ครูทำ (client ปรับ skew แล้ว) server บีบให้อยู่ในช่วง ≤ ตอนนี้ และ ≥ 7 วันก่อน
- คะแนน: number ขั้นละ 0.5 (`isHalfStep`) 0 ≤ score ≤ full_score หรือ `null` (= รอตรวจ)
- `Submission` (ช่องหนึ่งของงาน×นักเรียน):

```json
{ "assignment_id": "a1", "student_id": "st1", "status": "submitted | excused | void", "score": 7,
  "late": false, "submitted_at": 1762052400000, "method": "camera | hid | manual | grid | bulk | import | restore",
  "device_id": "dev_…", "scan_session_id": "scn_…", "updated_at": 1762052400000 }
```

## Endpoints

### EP-01 `POST /api/submissions/batch` — ส่ง op การรับงาน/ให้คะแนนจากคิวในเครื่อง

- ผู้เรียก: `src/lib/outbox.ts` (คิวออฟไลน์ของทุกหน้า: สแกน, สมุดคะแนน) · ส่งครั้งละ ≤ 50 op
- Request (ไม่เปลี่ยนในงาน integrity-c01 — ไม่มีฟิลด์ใหม่):

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
  "dataEpoch": "integer (optional)"
} ] }
```

- 200 Response: `{ "results": SubmissionOpResult[], "serverTime": number }` · `results` เรียงตาม `ops` และยาวเท่ากัน
- ความหมายของ op: **รับงาน** = `status: "submitted"` และ `method ∈ {camera, hid, manual}` · **ให้คะแนน** = `method: "grid"` · `void` = ยกเลิกการส่ง · `excused` = ยกเว้น

| result | ฟิลด์เพิ่ม | ความหมาย | client (ปัจจุบัน) |
|---|---|---|---|
| `ok` | `submission` (ค่าที่บันทึกจริง รวม late หลังแก้) | บันทึกแล้ว + audit 1 แถว | เอาออกจากคิว |
| `duplicate` | `submission?` (ค่าปัจจุบัน) | opId นี้เคยบันทึกแล้ว (มีแถว audit) | เอาออกจากคิว |
| `epoch_changed` | — | op ทำก่อนกู้คืนข้อมูล | ไป "ส่งไม่สำเร็จ" (ไม่กั้น op ถัดไป) |
| `invalid` | `reason`: `assignment_missing` / `score_out_of_range` | ข้อมูลไม่ถูกต้อง | ไป "ส่งไม่สำเร็จ" |
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
- ลำดับการตัดสินต่อ op (ตัวแรกที่เข้าเงื่อนไขชนะ): `duplicate` → `epoch_changed` → `invalid(assignment_missing)` → `full_score_changed` → `assignment_closed` → `not_in_class` → `student_inactive` → `invalid(score_out_of_range)` → `superseded` → **`already_submitted`** → `ok`
- ไม่เขียนอะไร: ไม่มี upsert ไม่มีแถว audit (จึงไม่นับเป็น opId ที่ "ลงแล้ว") → ส่ง opId เดิมซ้ำจะถูกตัดสินใหม่ ได้ `already_submitted` อีกตราบที่ช่องยัง submitted (ถ้าช่องเปลี่ยนเป็น void ภายหลัง op ที่เก่ากว่าจะได้ `superseded`)
- `submission` = `mapSubmission` ของช่องที่ใช้ตัดสิน (ไม่ใช่ค่าที่ op ส่งมา)
- การแข่งกันสองเครื่อง: การตัดสินผูกกับ snapshot ของช่องทั้ง 9 ฟิลด์ (`cellsGuard` เดิม — batch abort ถ้าช่องเปลี่ยนหลังอ่าน แล้วอ่าน/ตัดสินใหม่ ≤ 3 รอบ) → คำขอที่แพ้จะถูกตัดสินใหม่กับค่าจริงและได้ `already_submitted` · **ห้าม** ใส่เงื่อนไข "ช่อง submitted" ลงใน SQL ของ `stillValid` เพราะ `INSERT … SELECT` ประเมินกับสภาพก่อน statement ทำให้คู่ `[void, รับงาน]` ในคำขอเดียวพัง (บันทึกใน decisions-local ของงาน)
- เส้นทาง "lost" (op ผ่าน judge แต่ไม่ลงเพราะ stillValid): ตัดสินใหม่ด้วย `judge` → ถ้าช่อง submitted และไม่เข้าข้อยกเว้น และไม่ใช่ superseded ตามเวลา → `already_submitted` (ไม่ใช่ `superseded`)
- op อื่นที่ไม่ใช่รับงาน (`grid`, `void`, `excused`) ไม่ได้ผลนี้เลย · ช่องที่ไม่มีแถว / void / excused → รับงานได้ตามเดิม
- การจัดการฝั่ง client (แอปรุ่นใหม่): เอาออกจากคิวเหมือน `ok` · ไม่เข้า "ส่งไม่สำเร็จ" · ไม่กั้น op ถัดไปของช่องเดียวกัน · หน้าที่เปิดอยู่ (สแกน, สมุดคะแนน) รับ `submission` เป็นค่าของช่องทันที · หน้าสแกนที่เปิดอยู่แสดงการ์ด "ส่งไปแล้ว — ไม่บันทึกซ้ำ" แบบเดียวกับสแกนซ้ำในเครื่อง · รายการที่แอปรุ่นเก่าพักไว้ใน "ส่งไม่สำเร็จ" ด้วยเหตุผลนี้ ถือว่าไม่กั้นและไม่ติดเครื่องหมายช่อง
- แอปรุ่นเก่า (main @ 18759a2): ไม่รู้จักผลนี้ → outbox พักไว้ใน "ส่งไม่สำเร็จ" ด้วยเหตุผล `already_submitted` (ข้อมูล server ไม่เปลี่ยน ครูกดทิ้งได้) จนกว่าจะอัปเดตแอป

### EP-02 `GET /api/assignments/:id/submissions` — ช่องทั้งหมดของงาน (หน้าสแกนดึงทุก 60 วิ)

- ไม่เปลี่ยนในงาน integrity-c01
- 200: `{ "submissions": Submission[], "snapshot": true, "assignment": { "status": "open|closed", "full_score": number, "deleted": boolean } | null, "serverTime": number }` (ส่ง snapshot เต็มเสมอ แม้ client ส่ง `since`)

### EP-03 `POST /api/assignments/:id/bulk` — ปุ่มทั้งห้อง (ทั้งห้องส่งแล้ว / ให้เต็มทั้งห้อง / ล้างทั้งห้อง)

- ไม่เปลี่ยนในงาน integrity-c01 (เป็นงานให้คะแนนของครู ไม่ถูกกันด้วย `already_submitted`)
- Request: `{ "action": "all-submitted | full-score | clear", "classId": "string" }`
- 200: `{ "ok": true, "changed": number, "batchId": "string" }` (ไม่แตะช่อง excused)
- Errors: `404 not_found` (งาน) · `400 class_not_assigned` · `400 no_students` · `409 assignment_closed` (เฉพาะ all-submitted) · `409 full_score_changed` · `409 modified_since` · `409 epoch_changed`

### EP-04 `POST /api/assignments/:id/bulk-undo` — ย้อนกลับปุ่มทั้งห้อง

- ไม่เปลี่ยนในงาน integrity-c01
- Request: `{ "batchId": "string" }`
- 200: `{ "ok": true, "changed": number }` หรือ `{ "ok": true, "changed": 0, "alreadyUndone": true }`
- Errors: `404 not_found` (batch) · `409 modified_since` · `409 epoch_changed`

## Changelog

| เวอร์ชัน | วันที่ | เปลี่ยนอะไร | งาน | กระทบ |
|---|---|---|---|---|
| v1 | 2026-11-02 | สร้างไฟล์: บันทึก EP-01..EP-04 ตามโค้ด main @ 18759a2 + เพิ่มผล `already_submitted` ใน EP-01 (request ไม่เปลี่ยน, ผลเดิมไม่เปลี่ยน) | 2026-11-02-integrity-c01 | server `worker/routes/submissions.ts`, type `shared/types.ts`, client `outbox.ts` / `Scan.tsx` / `Gradebook.tsx` / `Overlays.tsx` · แอปรุ่นเก่าเห็นใน "ส่งไม่สำเร็จ" (Gate 1 Q3) |

# API Contract: งานครบ (ส่วนการส่งงาน/คะแนน)

เวอร์ชัน: v2 · อัปเดต 2026-11-02 (integrity-c02 เพิ่ม EP-05) · แก้ได้เฉพาะ Tech Lead (เปลี่ยนแล้วบันทึกใน changelog และ decisions)

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

### EP-05 `POST /api/assignments` — สร้าง/แก้งาน (+ ถามปรับคนที่ได้เต็มเดิมเมื่อเพิ่มคะแนนเต็ม · v2 งาน integrity-c02)

- ผู้เรียก: `src/components/AssignmentModal.tsx` (สร้างงาน / แก้ไขงาน / คัดลอกงาน — เปิดจากสมุดคะแนน) · server: `worker/routes/assignments.ts`
- Request (ฟิลด์เดิมทั้งหมดไม่เปลี่ยน · เพิ่ม 2 ฟิลด์ optional · request แบบเดิมยังผ่าน schema):

```json
{ "id": "a1 (ไม่ส่ง = สร้างใหม่)", "term_id": "t1 | null", "subject_id": "s1", "type_id": "wt_worksheet",
  "title": "ใบงานที่ 5", "unit": "string | null", "full_score": "integer 1–100",
  "assigned_date": "YYYY-MM-DD (ค.ศ.) | null | \"\"", "due_date": "YYYY-MM-DD | null | \"\"", "note": "string | null",
  "publish_scores": "boolean", "status": "open | closed", "class_ids": ["c1", "c2"],
  "raise_choice": "adjust | keep  (ใหม่ v2 · optional — คำตอบของครูในกล่องถาม)",
  "raise_from": "integer (ใหม่ v2 · บังคับเมื่อมี raise_choice — คะแนนเต็มเดิมที่ครูเห็นในกล่องถาม)" }
```

- schema: มี `raise_choice` แต่ไม่มี `raise_from` (หรือกลับกัน) = `422 validation` · ค่าอื่นของ `raise_choice` = `422 validation`
- นิยาม: **เพิ่มคะแนนเต็ม** = มีงานนี้อยู่แล้ว และ `full_score` ใหม่ > `full_score` ในฐานข้อมูล · **คนที่ได้เต็มเดิม** = แถว submissions ของงานนี้ (ทุกห้อง ทุกสถานะนักเรียน ทุก method) ที่ `status = 'submitted'` และ `score = full_score ในฐานข้อมูล ณ ตอนเขียน` (BR-01)

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

## Changelog

| เวอร์ชัน | วันที่ | เปลี่ยนอะไร | งาน | กระทบ |
|---|---|---|---|---|
| v1 | 2026-11-02 | สร้างไฟล์: บันทึก EP-01..EP-04 ตามโค้ด main @ 18759a2 + เพิ่มผล `already_submitted` ใน EP-01 (request ไม่เปลี่ยน, ผลเดิมไม่เปลี่ยน) | 2026-11-02-integrity-c01 | server `worker/routes/submissions.ts`, type `shared/types.ts`, client `outbox.ts` / `Scan.tsx` / `Gradebook.tsx` / `Overlays.tsx` · แอปรุ่นเก่าเห็นใน "ส่งไม่สำเร็จ" (Gate 1 Q3) |
| v2 | 2026-11-02 | เพิ่ม EP-05 `POST /api/assignments` (บันทึกตามโค้ดเดิม + request `raise_choice`/`raise_from`, ผล `raise`, `409 raise_choice_required`, `409 full_score_changed`) · EP-04 มีผู้เรียกใหม่ (ย้อนกลับการปรับ) โดยไม่เปลี่ยน · EP-01..04 ไม่เปลี่ยน | 2026-11-02-integrity-c02 | server `worker/routes/assignments.ts` · client `AssignmentModal.tsx` · แอปรุ่นเก่าเพิ่มคะแนนเต็มที่มีคนได้เต็มเดิมไม่ได้จนอัปเดต (Gate 1 Q3) · D-integrity-c02-01..07 |

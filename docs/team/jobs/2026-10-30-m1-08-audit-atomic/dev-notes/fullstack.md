# Dev notes: Full-Stack · งาน `2026-10-30-m1-08-audit-atomic`

## T-01 ตารางจุดที่ขาด + test ล้มก่อน + แก้ — 2026-10-30

### 1. ตารางจุดที่ขาด (ตรวจจากโค้ด main @ 11a4d2b ก่อนแก้)

ช่อง "audit" = มีแถวประวัติไหม · "batch เดียว" = แถวประวัติอยู่ใน `DB.batch` เดียวกับการเขียนข้อมูล (all-or-nothing)

| ไฟล์ · เส้นทาง | เขียนอะไร | audit | batch เดียว | สิ่งที่ต้องแก้ |
|---|---|---|---|---|
| students · POST /api/students (สร้าง/แก้) | students | มี (before อย่างเดียว, มี qr_token) | **ไม่** — `writeAudit` หลัง batch | ย้ายเข้า batch · เพิ่ม after · ตัด qr_token |
| students · POST /api/students/import | students | มี | ใช่ | — |
| students · POST /api/students/:id/qr/rotate, /api/classes/:id/qr/rotate | students, revoked_qr_tokens | มี (เก็บ qr_token ก่อน/หลัง) | ใช่ | ไม่แก้ — รายงานเป็นคำถาม (token ใน audit) |
| students · POST /api/students/:id/pin | students.pin | **ไม่มี** | — | เพิ่ม audit (ตั้ง/ล้าง PIN) ไม่เก็บค่า PIN |
| assignments · POST /api/assignments | assignments, links, late | มี | ใช่ | — |
| assignments · POST /api/assignments/:id/delete | assignments.deleted_at | มี | **ไม่** — `writeAudit` หลัง batch | ย้ายเข้า batch (เขียนเฉพาะเมื่อลบจริง) |
| assignments · POST /api/scan-sessions, /:id/end | scan_sessions | ไม่มี | — | ไม่แก้ (ข้อมูลรอบสแกน ไม่ใช่คะแนน — ตั้งใจ) |
| auth · POST /api/setup | teacher, devices | มี | **ไม่** — 3 คำสั่งแยกกัน | รวมเป็น batch เดียว |
| auth · POST /api/auth/login | devices, teacher.email (บัญชีเก่า), sessions | ไม่มี | — | ไม่แก้ (เข้าระบบ ไม่ใช่การแก้ข้อมูล) — รายงาน |
| auth · POST /api/auth/logout | sessions (ของตัวเอง) | ไม่มี | — | ไม่แก้ (อยู่ใน lib/auth.ts นอกขอบเขต) — รายงาน |
| auth · POST /api/devices/:id/signout | sessions | มี (action=update) | **ไม่** | ย้ายเข้า batch · action `device_signout` |
| auth · POST /api/auth/change-password | teacher hash | มี (action=update) | **ไม่** | ย้ายเข้า batch · action `password_change` ไม่เก็บ hash |
| catalog · PUT /api/settings | settings | มี (after = body) | ใช่ | — (ไม่อยู่ใน AC-03) |
| catalog · POST /api/terms (สร้าง/แก้) | terms | **ไม่มี** | — | เพิ่ม before/after ใน batch |
| catalog · POST /api/terms/start | terms, classes, students, assignments | มี | ใช่ | — |
| catalog · POST /api/classes | classes | **ไม่มี** | — | เพิ่ม before/after ใน batch |
| catalog · POST /api/subjects | subjects | **ไม่มี** | — | เพิ่ม before/after ใน batch |
| catalog · POST /api/work-types | work_types | **ไม่มี** | — | เพิ่ม before/after ใน batch |
| submissions · POST /api/submissions/batch | submissions | มี (guarded) | ใช่ | after.late ก่อน lateFix — ปัญหาแบบเดียวกับ bulk แต่นอกขอบเขต (รายงาน) |
| submissions · POST /api/assignments/:id/bulk | submissions | มี (guarded) | ใช่ | **after.late เป็นค่าก่อน lateFix** (AC-04) |
| submissions · POST /api/assignments/:id/bulk-undo | submissions | มี | ใช่ | after.late ก่อน lateFix (AC-04) · เทียบ late → modified_since ผิด (R-10, AC-05) |
| attendance / backup / reset (นอกไฟล์ที่ได้รับ) | — | attendance, restore มี audit ใน batch · reset ลบ audit_logs ทั้งหมด (ตั้งใจ) | ใช่ | — |

### 2. สิ่งที่แก้

- students: สร้าง/แก้ → audit อยู่ใน batch เดียวกัน มี before/after และตัด qr_token ออก · PIN → `pin_set`/`pin_clear` ไม่เก็บค่า PIN และเขียนเฉพาะเมื่อมีนักเรียนคนนั้น
- assignments: ลบงาน → audit อยู่ใน batch และเขียนเฉพาะเมื่อลบจริง
- auth: setup (บัญชีครู+audit), signout (`device_signout`), เปลี่ยนรหัสผ่าน (`password_change`) → อยู่ใน batch เดียวกัน ไม่เก็บ hash/salt/token
- catalog: terms/classes/subjects/work-types มี before/after (`catalogAudit`) อยู่ใน batch
- submissions: `auditLateSyncStmt` ต่อหลัง lateFixForCells ใน bulk และ bulk-undo (after.late = ค่าที่เก็บจริง) · undo เทียบทุกคีย์ยกเว้น `late`
- audit.ts: ลบ `writeAudit` (ไม่มีผู้ใช้แล้ว กันการเขียน audit แยกจาก transaction)
- เทสต์: `test/api/audit-atomic.test.ts` ใหม่ (27 รายการ) · ปรับ `audit-concurrency.test.ts` (gate ของ setup จับ batch ได้ด้วย, การนับ audit ของ term กรองด้วย action start%)

### 3. ผล

- ก่อนแก้: 22 ล้ม / 5 ผ่าน (`evidence/before-fix.txt`) · หลังแก้: 27/27
- typecheck PASS · npm test: 74/75 ไฟล์, 899/900 — ล้ม 1 รายการคือ timeout ของ `test/unit/m1-05-verify1.test.tsx` (Excel, 5 วินาที) ซึ่งผ่านเมื่อรันแยก และไม่อยู่ในไฟล์ที่แก้
- volume: `evidence/volume-before-after.txt` — จำนวนแถวที่เขียนใน bulk/undo เท่าเดิม · rows read +145..161 · statement +1 · ทุกค่ายังอยู่ในงบ
- ถึง QA: ทดสอบ undo หลังเลื่อนกำหนดส่ง · ตรวจว่าไม่มี PIN/hash/token ใน /api/audit · UI ยังไม่มีป้ายภาษาไทยของ entity ใหม่ (class/subject/work_type/term) และ action ใหม่

### 4. รอบ 2 (ตามที่ PM ตัดสิน)

- QR rotate: ประวัติเก็บแค่ `after: { reissued: true }` ไม่เก็บ qr_token ก่อน/หลัง · PUT /api/settings: ประวัติเก็บเฉพาะคีย์ที่อนุญาต (มีเทสต์ทั้งสองข้อ)
- Excel tests (m1-05-verify1, excel-attendance): timeout 30000ms ระดับ describe · ไม่ได้แตะ global testTimeout และไม่ได้แตะ qa-m1-05
- **Known issue (ไม่แก้ในงานนี้):** POST /api/submissions/batch — `after.late` ในประวัติเป็นค่าก่อน lateFixForCells (ผิดเฉพาะเมื่อมีคนเลื่อนกำหนดส่งพร้อมกันพอดี หรือ late ที่เก็บไว้เป็นค่าเก่า) แก้ได้ด้วย `auditLateSyncStmt` แต่ต้องวัด volume ของเส้นทางนี้ก่อน

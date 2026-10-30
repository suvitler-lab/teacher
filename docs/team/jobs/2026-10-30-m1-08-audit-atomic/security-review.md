# Security review: ประวัติการแก้ไข (audit) บันทึกพร้อมข้อมูลเสมอ และครอบคลุมขึ้น

โดย Security Reviewer · 2026-10-30 · ช่วง diff: `main(11a4d2b)..working tree` (worker, README.md, docs/OPERATIONS.md) · ธง: 🗑 👤 · รอบแก้ (Verify) 1/3 (ตัวนับเดียวกับ QA/Reviewer)

## สรุป: ผ่าน

ต้องแก้ 0 · ควรแก้ 1 · เสนอ 3 — ไม่มีข้อที่บล็อกงานนี้ · S-01 (PIN) ควรเป็น job แยก ก่อนฟีเจอร์ใดที่ตรวจ PIN

## 1. Threat model (ต่อ entry point ที่งานนี้แก้)

ระบบมีผู้ใช้คนเดียวคือครู (ทุกเครื่องที่มี session) ไม่มี role ย่อย · ผู้โจมตีที่ต้องคิดถึง: คนที่ไม่ได้ล็อกอิน, คนที่ได้ไฟล์สำรองไป, คนที่เห็นจอประวัติ

| Entry point | ผู้โจมตี/ผู้ใช้ผิดสิทธิ์ | สิ่งที่อาจเกิด | การป้องกันที่มีในโค้ด | ช่องว่าง → S-xx |
|---|---|---|---|---|
| `POST /api/students` (สร้าง/แก้) | ไม่ล็อกอิน · ผู้ดูประวัติ | แก้ข้อมูลนักเรียน · token บัตร/PIN รั่วผ่าน before/after | requireAuth `students.ts:14-15` · audit อยู่ใน batch เดียวกัน `students.ts:119-124` · `studentForAudit` ตัด qr_token `students.ts:40-43` และ `mapStudent` ไม่มี pin `lib/rows.ts:64-78` · after ประกอบจากฟิลด์ที่ระบุเอง ไม่มี pin/qr_token `students.ts:99-103` | — |
| `POST /api/students/:id/pin` | ไม่ล็อกอิน · ผู้ดูประวัติ | PIN รั่วในประวัติ · ประวัติลอยไม่มีนักเรียน | requireAuth `students.ts:15` · audit มีแค่ action `pin_set`/`pin_clear` ไม่มี before/after `students.ts:403-406` · เงื่อนไข EXISTS กันแถวลอย | PIN เก็บเป็นข้อความธรรมดา → S-01 |
| `POST /api/students/:id/qr/rotate`, `/api/classes/:id/qr/rotate` | ผู้ดูประวัติ | token บัตรรั่วในประวัติ | after = `{ reissued: true }` เท่านั้น `students.ts:360-366` | ประวัติเก่าก่อนงานนี้ยังมี token → S-03 |
| `POST /api/setup` | ไม่ล็อกอิน (ก่อนมีบัญชี) | สร้างบัญชีซ้อน · hash/อีเมล/SETUP_CODE ลงประวัติ | ตรวจ SETUP_CODE `auth.ts:60-61` · INSERT…WHERE NOT EXISTS + audit มีเงื่อนไขใน batch เดียว `auth.ts:79-86` · audit ไม่มีข้อมูลจาก body | — |
| `POST /api/devices/:id/signout` | ไม่ล็อกอิน | ไล่เครื่องอื่นออก · session token ลงประวัติ | requireAuth `auth.ts:165` · after = device id เท่านั้น (device id ไม่ใช่ credential — session ตรวจจาก token_hash `lib/auth.ts:58-74`) `auth.ts:168-173` | — |
| `POST /api/auth/change-password` | ไม่ล็อกอิน | เปลี่ยนรหัส · hash/salt ลงประวัติ | requireAuth + ตรวจรหัสเดิม · audit `password_change` ไม่มี before/after `auth.ts:191-198` | — |
| `PUT /api/settings` | ผู้ดูประวัติ | คีย์ที่ไม่อนุญาต/ค่าแปลกจาก client ลงประวัติ | requireAuth `catalog.ts:13` · ประวัติเก็บเฉพาะคีย์ใน ALLOWED_SETTINGS `catalog.ts:54-59` · คีย์ทั้งหมดไม่มีค่าลับ `catalog.ts:36-49` | — |
| `POST /api/terms`, `/classes`, `/subjects`, `/work-types` | ผู้ดูประวัติ | ค่าลับหลุดผ่าน `SELECT *` ใน before | requireAuth `catalog.ts:13-22` · ตารางเหล่านี้ไม่มีคอลัมน์ลับ (เทียบ COLUMNS `backup.ts:35-38`) · audit ใน batch `catalog.ts:112-115, 276-280, 303-306, 336` | — |
| `POST /api/assignments/:id/delete` | ไม่ล็อกอิน | มีประวัติลบทั้งที่ไม่ได้ลบจริง | audit มีเงื่อนไข `deleted_at IS NULL` ใน batch เดียว (assignments.ts ใน diff) | — |
| `GET /api/audit` | ไม่ล็อกอิน | อ่านประวัติทั้งหมด (ชื่อนักเรียน คะแนน) | requireAuth `routes/audit.ts:6` · ทุกตัวกรองใช้ bind (ไม่มี SQL injection) `audit.ts:20-40` | — |
| `GET /api/backup` (ไม่ได้แก้ แต่ถูกขอให้ประเมิน) | คนที่ได้ไฟล์สำรอง | PIN และ qr_token อยู่ในไฟล์ | requireAuth `backup.ts:13-15` · หลังดาวน์โหลด ไฟล์อยู่ในเครื่องครู | S-01, S-02 |

## 2. สิทธิ์ (role × action) ที่ตรวจฝั่ง server

| action | ไม่ล็อกอิน | ครู (มี session) | ตรวจที่ (file:line) |
|---|---|---|---|
| อ่านประวัติ `GET /api/audit` | 401 | ได้ | `worker/routes/audit.ts:6` → `lib/auth.ts:76-84` |
| เขียนนักเรียน/PIN/หมุนบัตร | 401 | ได้ | `students.ts:14-16` |
| เขียน catalog/settings | 401 | ได้ | `catalog.ts:13-22` |
| signout/เปลี่ยนรหัส | 401 | ได้ | requireAuth ต่อเส้นทาง `auth.ts:165` และเส้นทาง change-password |
| ดาวน์โหลด/กู้คืนไฟล์สำรอง | 401 | ได้ | `backup.ts:13-15` |
| setup | ได้เฉพาะตอนยังไม่มีบัญชีและรู้ SETUP_CODE | 403 already_setup | `auth.ts:60-86` |

UI ประวัติ (ประเด็นที่ 2): `AuditHistory.tsx:28-40` และ `StudentDrawer.tsx:123-127` แสดงแค่คำบรรยาย (คะแนน/สถานะ/"ออก QR ใหม่"/ชื่อ action) กับเวลาและวิธีบันทึก ไม่แสดง before/after ดิบ · ข้อมูลที่ API ส่งให้ครูเป็นข้อมูลที่ครูเห็นจากหน้าอื่นอยู่แล้ว · action ใหม่ (`pin_set`, `device_signout`, `password_change`) และ entity ใหม่ (class/subject/work_type/term) จะขึ้นเป็นคำอังกฤษดิบ ซึ่งเป็นเรื่อง UX ไม่ใช่การรั่ว (S-04)

## 3. Dependency audit

- N/A — ธงของงานนี้ไม่มี 🔐/🌐 และ diff ไม่แตะ `package.json`/`package-lock.json` (`git diff main --stat -- package.json package-lock.json` ว่าง) · ไม่ได้รัน `npm audit` เพราะคำสั่งห้าม probe นาน

## 4. ข้อมูลส่วนบุคคล (PDPA) — 👤

| ข้อมูล | เก็บที่ | ใช้ทำอะไร | ลงประวัติ (audit)? | ส่งออก (ไฟล์สำรอง)? | ลบได้? | consent |
|---|---|---|---|---|---|---|
| ชื่อ-สกุล ชื่อเล่น รหัส เลขที่ ห้อง สถานะนักเรียน | students | งานสอนของครู | ใช่ (before/after) อ่านได้เฉพาะครู | ใช่ | reset ลบทั้งหมด · ประวัติไม่อยู่ในไฟล์สำรอง | ใช้ภายในหน้าที่ครู |
| PIN นักเรียน 4 หลัก | students.pin (ข้อความธรรมดา) | **ยังไม่มีเส้นทางใดใช้ยืนยันตัวตน** (grep: มีแค่การเขียน `students.ts:396-410` กับสำรอง/กู้คืน `backup.ts:40`, `restore-validation.ts:32` · ฝั่ง src ไม่มีที่ใช้) | ไม่ (มีแค่ action) | **ใช่** | ล้างได้ (pin=null) · reset | → S-01 |
| qr_token (บัตรนักเรียน) | students, revoked_qr_tokens | สแกนส่งงาน/เช็คชื่อ (เฉพาะเครื่องที่ล็อกอิน) | ไม่ (ตั้งแต่งานนี้) · ประวัติเก่ายังมี | **ใช่** (ตั้งใจ เพื่อกู้บัตรเดิม) | หมุนบัตรใหม่ได้ | → S-02, S-03 |
| อีเมลครู, hash/salt รหัสผ่าน | teacher | ล็อกอิน | ไม่ | ไม่ (ไม่อยู่ใน BACKUP_TABLES `backup.ts:18-32`) | reset | — |
| session token | sessions (เก็บเป็น sha256) | ล็อกอิน | ไม่ | ไม่ | signout | — |
| device id/ชื่อเครื่อง | devices, audit.device_id | บอกว่าเครื่องไหนทำ | ใช่ | ไม่ | — | — |

## 5. Secrets และ log

- [x] ประวัติใหม่ทุกเส้นทางไม่เก็บ PIN, รหัสผ่าน, hash, salt, qr_token, session token หรือ SETUP_CODE (ตรวจทุก `auditInsertStmt` ใน `worker/routes/*` ตามตารางข้อ 1)
- [x] all-or-nothing: ลบ `writeAudit` ออกจาก `worker/lib/audit.ts:80-81` แล้ว · grep `writeAudit` ใน `worker/` ไม่เหลือ import หรือการเรียก · การเขียน audit_logs ทุกจุดผ่าน `auditInsertStmt` ที่อยู่ใน `DB.batch`/`batchAtEpoch` เดียวกับการเขียนข้อมูล (students, assignments, auth, catalog, submissions, attendance, backup) · ใน setup ยังมี `upsertDevice` อยู่นอก batch `auth.ts:88` ซึ่งไม่ใช่ประวัติและไม่กระทบความลับ
- [x] ไม่มี secret ใน diff, README หรือ OPERATIONS (อ่าน diff ครบ)
- [x] error ไม่เปิดเผยรายละเอียดภายใน (ไม่มีข้อความ error ใหม่)

## 6. AI — N/A (ไม่มีธง 🤖)

## ข้อที่พบ

### S-01 PIN นักเรียนเก็บเป็นข้อความธรรมดาและอยู่ในไฟล์สำรอง — ควรแก้ (ความเสี่ยงตอนนี้: ต่ำ) · `worker/routes/students.ts:407`, `worker/routes/backup.ts:40`

- ปัญหา: `UPDATE students SET pin = ?` เก็บ PIN 4 หลักตรง ๆ และ `COLUMNS.students` ใส่ `pin` ลงไฟล์ JSON
- ความเสี่ยงตอนนี้ **ต่ำ**: ใน worker และ src ไม่มีเส้นทางใดใช้ PIN ยืนยันตัวตน (มีแค่ตั้ง/ล้าง กับสำรอง/กู้คืน) และไม่มีหน้าจอตั้ง PIN · ดาวน์โหลดไฟล์สำรองได้เฉพาะเครื่องที่ล็อกอิน · คนที่ได้ไฟล์ไปได้ชื่อ คะแนน และการมาเรียนของเด็กทุกคนอยู่แล้ว PIN จึงไม่ได้เพิ่มความเสียหายในตอนนี้
- จะกลายเป็น **สูง** ทันทีที่เปิดฟีเจอร์ที่ตรวจ PIN (มีค่าตั้งค่า `parent_portal_enabled` รออยู่ที่ `worker/lib/db.ts:24`): ใครได้ไฟล์สำรองหรืออ่าน D1 ได้ก็เข้าเป็นนักเรียน/ผู้ปกครองได้ทันที และ PIN 4 หลักที่แฮชแบบไม่มี pepper ก็ไล่เดาครบ 10,000 ค่าได้ในเสี้ยววินาที
- แนวทาง (เป็น job แยก ต้องเสร็จ **ก่อน** ฟีเจอร์ใดที่ตรวจ PIN — ไม่บล็อกงานนี้):
  - แฮชด้วย HMAC/PBKDF2 + pepper ฝั่งเซิร์ฟเวอร์ (แบบเดียวกับรหัสครูที่ใช้ `pepperOf`) · pepper ไม่อยู่ในไฟล์สำรอง จึงไล่เดาย้อนจากไฟล์ไม่ได้ · เพิ่มการจำกัดจำนวนครั้งที่เดา PIN ต่อนักเรียน
  - ผลต่อการกู้คืน: กู้บนระบบเดิม (pepper เดิม) PIN ใช้ต่อได้ · กู้ข้ามระบบที่ pepper ต่างกัน PIN ทุกตัวจะใช้ไม่ได้และต้องตั้งใหม่ (ควรบอกไว้ในหน้ากู้คืน)
  - ทางที่ง่ายกว่า: ไม่ใส่ `pin` ในไฟล์สำรอง → กู้แล้ว PIN ว่างทั้งหมด ครูตั้งใหม่ (`restore-validation.ts:32` ต้องยังรับไฟล์เก่าที่มี pin ได้แต่ไม่นำเข้า)
  - ถ้ายังไม่มีแผนใช้ PIN: เลิกเก็บไปก่อน (ปิดเส้นทาง `/pin`) จนกว่าจะออกแบบฟีเจอร์
- สถานะ: เปิด (เสนอเป็น job แยก)

### S-02 ไฟล์สำรองมี qr_token และข้อมูลเด็กทั้งหมด แต่หน้าดาวน์โหลดไม่มีคำเตือน — เสนอ · `src/pages/Settings.tsx:255`

- ปัญหา: ไฟล์สำรองตั้งใจเก็บ `qr_token` และ `revoked_qr_tokens` (`backup.ts:40-41`) เพื่อกู้บัตรเดิม · token ไม่ใช่รหัสผ่าน เพราะไม่มีเส้นทางสาธารณะที่เปิดข้อมูลด้วย token (ใช้ได้แค่ให้เครื่องที่ล็อกอินสแกน) แต่คนที่ได้ไฟล์ไปพิมพ์บัตรปลอมของเด็กคนไหนก็ได้ แล้วเอามาสแกนในห้องเพื่อบันทึก "ส่งแล้ว"/"มาเรียน" แทนได้ ซึ่งกระทบความถูกต้องของข้อมูล
- สถานการณ์: ครูส่งไฟล์สำรองเข้ากลุ่มไลน์หรือไดรฟ์ที่แชร์ → ไฟล์มีชื่อ คะแนน และการมาเรียนของนักเรียนทุกคน (ข้อมูลผู้เยาว์ตาม PDPA) พร้อม token บัตร
- แนวทาง: ใต้ "ดาวน์โหลดไฟล์สำรอง (JSON)" เพิ่มข้อความสั้น ๆ เช่น "ไฟล์มีข้อมูลนักเรียนและรหัสบัตร QR — เก็บไว้กับตัวเท่านั้น อย่าแชร์ · ถ้าไฟล์หลุด ให้ออกบัตรใหม่ทั้งห้อง" · ใส่หมายเหตุเดียวกันใน README/OPERATIONS (ถ้า S-01 ยังไม่แก้ ข้อความนี้ครอบ PIN ไปด้วย)
- สถานะ: เปิด

### S-03 ประวัติที่บันทึกก่อนงานนี้ยังมี qr_token — เสนอ (ไม่แน่ใจขนาดของปัญหา เพราะไม่ได้ดูข้อมูลจริง) · rotateOne และ POST /api/students ใน `worker/routes/students.ts` เวอร์ชัน main

- ปัญหา: บน main ประวัติ `qr/rotate` เก็บ token ก่อน/หลัง และประวัติแก้นักเรียนเก็บ `mapStudent` ซึ่งมี qr_token · งานนี้หยุดเขียนแถวแบบนี้แล้ว แต่แถวเก่าใน D1 production ยังอยู่ (ไม่มี migration ตามข้อจำกัด) และ `GET /api/audit` ส่ง before/after ดิบไปให้ client
- ความเสี่ยงตอนนี้ต่ำ: อ่านได้เฉพาะครูที่ล็อกอิน ซึ่งเห็น qr_token จาก `/api/students` อยู่แล้ว · token "ก่อน" ของการหมุนบัตรถูก revoke แล้ว · ประวัติไม่อยู่ในไฟล์สำรอง · reset ลบทิ้ง
- แนวทาง: ถ้าจะมีฟีเจอร์ที่ให้คนอื่นนอกจากครูเห็นประวัติ หรือให้ token ใช้เปิดข้อมูลได้ ให้ทำ one-off scrub (`json_remove` คีย์ qr_token ใน before_json/after_json ของ entity student/qr) ใน job ที่ทำ dry-run ก่อน
- สถานะ: เปิด (บันทึกไว้)

### S-04 UI ประวัติแสดง action/entity ใหม่เป็นคำอังกฤษดิบ — เสนอ · `src/components/AuditHistory.tsx:20-23, 39`

- ไม่ใช่การรั่ว (แสดงแค่ชื่อ action ไม่มีค่าใด ๆ) · เพิ่มป้ายภาษาไทยให้ `pin_set`/`pin_clear`/`device_signout`/`password_change` และ entity class/subject/work_type/term · ในอนาคตห้ามแสดง before/after ดิบของ entity student/auth
- สถานะ: เปิด (เรื่อง UX — ส่งต่อผ่าน PM)

หลักฐานที่บันทึก: `evidence.mjs add --kind pii-handling` (Q-S1, PASS) · threat-model/dependency-audit ไม่บังคับสำหรับธง 🗑 👤 ขนาด S

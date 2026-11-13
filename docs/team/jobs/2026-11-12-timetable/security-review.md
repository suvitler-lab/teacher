# Security review: ตารางสอน (2026-11-12-timetable)

โดย Security Reviewer · 2026-11-13 · ช่วง diff: `87fe5b8..working tree` (`git diff HEAD` + ไฟล์ใหม่ที่ยังไม่ track) · ธง: 🔄 🗑 (ตรวจเพิ่มตามคำขอ PM: authz, validation, race, restore, XSS, dependency, PDPA, log) · รอบแก้ (Verify) 0/3 (รอบแรก)

## สรุป: ผ่าน

ต้องแก้ 0 · ควรแก้ 1 (P2, เป็นของเดิม ไม่ได้มาจากงานนี้) · เสนอ 2 (P3)

ระดับ: P1 = ต้องแก้ · P2 = ควรแก้ · P3 = เสนอ

บริบทสิทธิ์: แอปนี้มีครูคนเดียวต่อฐานข้อมูล (บัญชีเดียว หลายเครื่อง) — ไม่มีหลายโรงเรียน/หลายผู้ใช้ในฐานข้อมูลเดียวกัน จึงไม่มีความเสี่ยง IDOR ข้ามผู้เช่า สิ่งที่ต้องกันคือ (ก) คนที่ไม่ได้ล็อกอิน (ข) เว็บอื่นที่ส่งคำขอแทนเบราว์เซอร์ของครู (CSRF) (ค) ข้อมูลผิดรูปจากคำขอที่ปั้นเองหรือจากไฟล์สำรอง (ง) การเขียนชนกันระหว่างเครื่อง

## 1. Threat model (ต่อ entry point ที่งานนี้เพิ่ม/แก้)

| Entry point | ผู้โจมตี/ผู้ใช้ผิดสิทธิ์ | สิ่งที่อาจเกิด (STRIDE ย่อ) | การป้องกันที่มีในโค้ด | ช่องว่าง → S-xx |
|---|---|---|---|---|
| `GET /api/timetable?term=` | ไม่ล็อกอิน · เว็บอื่น | ข้อมูลรั่ว | `requireAuth` `worker/routes/timetable.ts:22-23` · คำตอบ `no-store`+`nosniff` `worker/app.ts:33-36` · term ไม่พบ → 404 `:36` · cookie `SameSite=Strict` `worker/lib/auth.ts:34` · เทสต์ 401 `test/api/tt-api.test.ts:33` | — |
| `PUT /api/timetable` | ไม่ล็อกอิน · CSRF · คำขอปั้นเอง · อีกเครื่องเขียนพร้อมกัน | แก้ข้อมูล, mass assignment, เขียนปีที่ปิดแล้ว, DoS, race | auth `:22` · same-origin ทุก write `worker/lib/http.ts:32-48` · body ≤1 MB `worker/app.ts:48-54` · zod: weekday 1–7, period 1–8, kind enum, id ≤100, label ≤200 ดิบ, slots ≤56 `timetable.ts:50-63` · map ฟิลด์ทีละตัว (ไม่ spread body) `:83-85` · trim+≤40, ซ้ำ, นอกโครง, kind fields `shared/timetable.ts:248-269` · ref มีจริง/ปีถูก/archived `worker/lib/timetable.ts:74-106` · ปีเก่า → 409 `:71` · baseRev + ปีที่แก้ได้ + โครงเวลา + archived ตรวจซ้ำ**ใน batch** `:107-115` · epoch guard `batchAtEpoch` `:131` · SQL bind ทั้งหมด (json_each) · CHECK/PK ใน DB `migrations/0008_timetable.sql:14-30` | — |
| `PUT /api/timetable/frame` | ไม่ล็อกอิน · CSRF · คำขอปั้นเอง · race กับ PUT ตาราง | แก้ข้อมูล, ลบคาบโดยไม่ยืนยัน, race | auth `:23` · zod ความยาว ≤50 ต่อข้อความ, periods ≤8, breaks ≤3, days int 1–7 `:152-161` · `validateFrame` (รูปแบบเวลา, ลำดับ, ทับกัน, ชื่อพัก 1–20 หลัง trim) `shared/timetable.ts:86-173` · ต้องส่ง `confirmRemove` = จำนวนที่จะลบ `:192` · batch ตรวจ raw frame เดิม + ปีที่แก้ได้ + จำนวนคาบนอกโครงยังเท่าเดิม `:202-203` | S-02 (P3) |
| `PUT /api/settings` (`period_times`) | เครื่องเก่าที่ยังไม่รู้จักโครงเวลา | เขียนทับเวลาคาบที่โครงเวลาเป็นเจ้าของ | `period_frame` ไม่อยู่ใน `ALLOWED_SETTINGS` `worker/routes/catalog.ts:36-48` · abortIf ใน batch เมื่อโครงเวลาถูกตั้งแล้ว `:67-69` · 409 `period_frame_owned` `:79` | — |
| `GET /api/bootstrap` (+timetable) | ไม่ล็อกอิน | ข้อมูลรั่ว | `requireAuth` `worker/routes/bootstrap.ts:11` · SQL คงที่ไม่มี input `:33-35` | — |
| `GET /api/backup` + `/api/restore/validate|execute` (ตาราง `timetable_slots`) | ไฟล์สำรองที่ถูกแก้/ปั้น (ครูได้มาจากที่อื่น) | ข้อมูลผิดรูปเข้าฐาน, XSS ฝัง, ข้อมูลเดิมหาย | auth `worker/routes/backup.ts:13-15` · ชื่อตารางต้องอยู่ใน `BACKUP_TABLES` `:62` · zod ต่อแถว weekday/period/kind/label ≤40 `worker/lib/restore-validation.ts:39` · กติกา SQL: missing_reference `:88`, kind_fields `:102`, wrong_school_year `:103`, duplicate_slot `:104` · guard ใน batch + FK check + CHECK ของตาราง → rollback ทั้งก้อน (`backup.ts` commitRestore) · counts ของตารางนี้หายได้ = 0 แถว และ commit ยังเทียบจำนวนที่ส่งจริง `:147`, `:205-211` · error ภายในไม่ส่งกลับ (`restore_failed`) | S-03 (P3) |
| `POST /api/admin/reset` | — | เหลือแถวลูกค้าง FK | ลบ `timetable_slots` ก่อน classes/subjects/terms `worker/routes/reset.ts:66` | — |
| การแสดงผล label/ชื่อพัก (ตาราง 3 แบบ, พิมพ์, หน้าแรก "ถึง…", ประวัติ) | ข้อความจากไฟล์สำรอง/คำขอปั้น | stored XSS | Preact escape ข้อความทั้งหมด · ไม่มี `dangerouslySetInnerHTML`/`innerHTML` ใน `src/lib/timetable/**`, `src/components/timetable/**`, `src/pages/Timetable.tsx`, `src/components/home/TimetableStrip.tsx`, `TtRows.tsx` (grep) · href สร้างด้วย `encodeURIComponent` `src/lib/timetable/logic.ts:136-137,277-278` · ประวัติเก็บ/แสดงเฉพาะจำนวน `src/components/AuditHistory.tsx` (entity timetable/period_frame) | — |
| `?now=` / `window.__ttSetNow` (client) | ลิงก์ที่หลอกให้เปิดบนเว็บจริง | เวลาเพี้ยน → ครูกดผิดคาบ | ใช้ได้เฉพาะ `import.meta.env.DEV` หรือ host `localhost`/`127.0.0.1`/`[::1]`/`*.localhost`/`*.test` `src/lib/timetable/clock.ts:91-96` · hook `__ttSetNow` ติดตั้งหลังผ่านเงื่อนไขนี้เท่านั้น `:112-114` · ผลกระทบเฉพาะการแสดงผล ลิงก์เช็กชื่อ/สแกนส่งแค่ `class=` ไม่ส่งวันที่ server ใช้ `Date.now()` ของตัวเอง | — |
| dependency | — | ช่องโหว่ที่รู้แล้ว | ไม่มี dependency ใหม่ · `npm audit` = moderate 1 (hono, ของเดิม) | S-01 (P2) |

### Race / baseRev (ตรวจละเอียด)

- PUT ตาราง: ตรวจ `timetable_rev`, ปีที่แก้ได้, raw `period_frame`, และ class/subject ที่เพิ่ง archive **ภายใน batch เดียวกับการเขียน** (`timetable.ts:107-115`) แล้ว DELETE+INSERT+rev+1+audit ทั้งก้อน — สองเครื่องส่ง baseRev เดียวกัน: เครื่องที่สองถูก abort → 409 `timetable_changed` พร้อมข้อมูลล่าสุด
- PUT โครงเวลา vs PUT ตาราง พร้อมกัน: PUT ตารางตรวจ raw frame เดิม · PUT โครงตรวจว่าจำนวนคาบนอกโครงยังเท่ากับที่ครูยืนยัน (`:203`) — ทั้งสองทางไม่มีช่องให้คาบนอกโครงเล็ดลอด
- ปีของห้องเปลี่ยนระหว่างตรวจกับเขียน: ห้องที่มีปีแล้วคงปีเดิม (`catalog.ts:303-306`) การขึ้นปีจะ archive ห้องเก่า (`:245`) ซึ่ง batch ตรวจ archived อยู่แล้ว
- กู้คืนรีเซ็ต `timetable_rev` เป็น 0 (ABA ได้ในทฤษฎี) แต่ restore เพิ่ม `data_epoch` ทุกครั้ง เครื่องที่ค้าง rev เก่าถูก epoch guard ปฏิเสธก่อน

### กรณีไฟล์สำรองที่ไม่ถูกต้อง

มีเทสต์ 9 กรณี `test/api/tt-backup.test.ts:92-101` (term/class/subject ไม่มี, kind_fields 4 แบบ, wrong_school_year, duplicate_slot) + ระดับ chunk 4 แบบ (`:122-129` weekday 8, period 9, kind แปลก, label 41) — ผ่านทั้งหมด (รันซ้ำ 67/67) · กรณีที่ยังไม่ครอบ ดู S-03 · label ที่มี `<script>`/HTML ผ่านเข้าได้ตามตั้งใจ (เป็นข้อความ) และถูก escape ตอนแสดง

## 2. สิทธิ์ (role × action) ที่ตรวจฝั่ง server

| action | ไม่ล็อกอิน | ครู (session ใดก็ได้) | เว็บอื่น (cross-site) | ตรวจที่ (file:line) |
|---|---|---|---|---|
| อ่านตารางภาคใดก็ได้ | 401 | ได้ | cookie ไม่ถูกส่ง (Strict) | `timetable.ts:22,31` |
| แก้ตารางภาคของปีปัจจุบัน | 401 | ได้ | 403 `bad_origin` | `timetable.ts:22,65` · `http.ts:32-48` |
| แก้ตารางภาคปีเก่า | 401 | 409 `term_read_only` | 403 | `timetable.ts:71,107` |
| แก้โครงเวลา | 401 | ได้ (ต้องยืนยันจำนวนที่ลบ) | 403 | `timetable.ts:23,192` |
| เขียน `period_frame` ผ่าน settings | 401 | ไม่ได้ (ไม่อยู่ใน allowlist) | 403 | `catalog.ts:36-48,63` |
| กู้คืน/ล้างข้อมูล | 401 | ได้ (เดิม) | 403 | `backup.ts:13-15` · `reset.ts:10` |

## 3. Dependency audit (อ่านอย่างเดียวจาก lockfile)

- คำสั่ง: `npm audit --json` → critical 0 · high 0 · moderate 1 · low 0 — artifact `evidence/sec-dependency-audit.txt`
- ตัวที่พบ: `hono` 4.13.13 (direct) — 5 advisory แก้ใน 4.13.16 → S-01
- dependency ใหม่ในงานนี้: ไม่มี (`package.json`/`package-lock.json` ไม่เปลี่ยน)

## 4. ข้อมูลส่วนบุคคล (PDPA)

ไม่มีธง 👤 ในงานนี้ ตรวจตามคำขอ — ตารางสอนไม่มีข้อมูลนักเรียน

| ข้อมูล | เก็บที่ | ใช้ทำอะไร | log? | ส่งออก? | ลบได้? | consent |
|---|---|---|---|---|---|---|
| คาบสอน (ห้อง/วิชา id, label กิจกรรม ≤40) | D1 `timetable_slots` | แสดงตาราง/หน้าแรก/พิมพ์ | ไม่ · audit เก็บแค่จำนวนคาบ+rev (`timetable.ts:126-127`) | ในไฟล์สำรองของครูเอง | ได้ (แก้/ล้าง/reset) | ข้อมูลงานของครูเอง ไม่ต้องขอ |
| โครงเวลา (เวลา, ชื่อช่วงพัก) | `settings.period_frame` | คำนวณคาบตอนนี้/ถัดไป | audit เก็บโครงก่อน/หลัง (ไม่มีข้อมูลบุคคล) | ในไฟล์สำรอง | ได้ (reset 'all') | — |
| ชื่อครู/ชื่อโรงเรียนบนหน้าพิมพ์ | `settings` (เดิม) | หัวกระดาษตอนพิมพ์ | ไม่ | เฉพาะเมื่อครูกดพิมพ์เอง | ได้ (ตั้งค่า) | ครูกรอกเองเพื่อใช้เอง |

## 5. Secrets และ log

- [x] ไม่มี secret ใน diff/log/เอกสาร — `secret-scan.mjs` บน `worker`, `shared`, `src/lib/timetable`, `src/components/timetable`, `migrations`, `scripts`, โฟลเดอร์งาน → PASS ทั้งหมด (ข้ามไฟล์ sheet.html >2 MB สองไฟล์ ซึ่งเป็นภาพหน้าจอ)
- [x] error ไม่เปิดเผยรายละเอียดภายใน — โค้ดใหม่ไม่มี `console.*` · error ที่ไม่รู้จัก → `{error:"internal"}` และ log ตัดที่ 200 ตัวอักษร `worker/app.ts:143-145` · 422 คืนเฉพาะ code/ตำแหน่งคาบ
- `scripts/fixture-server.cjs` ฟังเฉพาะ `127.0.0.1` (`:924`) ข้อมูลตัวอย่างไม่มีชื่อคนจริง

## 6. AI

ไม่มีธง 🤖 — ไม่เกี่ยว

## ข้อที่พบ

### S-01 hono 4.13.13 มี advisory ระดับ moderate 5 ข้อ — ควรแก้ (P2) · `package.json` (`"hono": "^4.13.13"`)

- ปัญหา: GHSA-h7mg-cq63-vhpq (RegExpRouter ข้าม wildcard middleware ในบางรูปแบบ route) เกี่ยวโดยตรงกับวิธีที่แอปบังคับ auth (`*.use("/api/x/*", requireAuth)` รวมถึง `timetable.ts:23`) · อีก 4 ข้อ (mount, css helper, csrf(), validator('form')) แอปไม่ได้ใช้
- สถานการณ์ที่พัง: **ตอนนี้ยังเจาะไม่ได้** — ไม่มี route ที่ลงท้าย `*` หรือ param แบบ regex (grep `worker/routes`) จึงไม่เข้ากรณี 1/2 · กรณี 3 (path มี `%0A`) จะตกไป notFound ไม่มี handler ทำงาน · แต่ถ้าวันหน้าเพิ่ม route รูปแบบนั้น auth จะถูกข้ามเงียบ ๆ
- แนวทางแก้: งานแยก (ไม่ใช่ในงานนี้) — อัปเกรด `hono` เป็น ≥4.13.16 แล้วรันเทสต์ทั้งชุด · ระหว่างนี้ห้ามเพิ่ม route ที่ลงท้าย `*` หรือ param regex · ไม่ใช่ปัญหาจาก diff นี้ จึงไม่บล็อก Gate
- สถานะ: เปิด (ต้องให้ PM ตัดสินว่าจะเปิดงานอัปเกรด)

### S-02 ชื่อช่วงพักเก็บแบบไม่ trim ยาวได้ถึง 50 ตัว — เสนอ (P3) · `worker/routes/timetable.ts:152,178-181` · `shared/timetable.ts:124-125,228`

- ปัญหา: zod รับ 50 ตัว `validateFrame` ตรวจ 1–20 **หลัง trim** แต่ `serializeFrame` เก็บค่าเดิมที่ยังไม่ trim
- สถานการณ์ที่พัง: ส่ง `"  พัก  " + ช่องว่าง 40 ตัว` → เก็บได้ แสดงผลเพี้ยน/ล้นช่อง (ไม่มีผลด้านสิทธิ์หรือ XSS)
- แนวทางแก้: trim ชื่อพักก่อน serialize (เหมือนที่ `normalizeSlots` ทำกับ label)
- สถานะ: เปิด

### S-03 กู้คืนไม่ตรวจคาบเทียบกับโครงเวลาในไฟล์ — เสนอ (P3) · `worker/lib/restore-validation.ts:102-104`

- ปัญหา: กติกาของ `timetable_slots` ตรวจ ref/kind/ปี/ซ้ำ แต่ไม่ตรวจว่าคาบอยู่ในวันเรียน/จำนวนคาบของ `period_frame` ในไฟล์เดียวกัน · ค่า `period_frame` ที่ผิดรูปจะตกกลับเป็นโครงเริ่มต้น (`resolveFrame` `shared/timetable.ts:179-220`) ซึ่งอาจไม่ตรงกับคาบที่กู้มา
- สถานการณ์ที่พัง: ไฟล์ที่ถูกแก้ให้มีคาบวันเสาร์/คาบ 8 แต่โครงมี 5 วัน 7 คาบ → กู้สำเร็จ · PUT ตารางครั้งถัดไปส่งคาบทั้งหมดรวมคาบนอกโครง → 422 `outside_frame` ทุกครั้ง จนครูไปบันทึกโครงเวลาใหม่ (ซึ่งเสนอลบคาบนอกโครงได้) — ความถูกต้องของข้อมูล/ใช้งานสะดุด ไม่ใช่การข้ามสิทธิ์
- แนวทางแก้: เพิ่ม rule ใน restore (หรือหลัง commit) ที่เทียบ weekday/period กับ `period_frame` ที่ resolve แล้ว · หรือให้หน้าตารางกรองคาบนอกโครงออกก่อนส่ง PUT และแจ้งครู
- สถานะ: เปิด

หลักฐานที่บันทึก: Q-2901 `threat-model` PASS · Q-2902 `dependency-audit` PASS · Q-2903 `pii-handling` PASS

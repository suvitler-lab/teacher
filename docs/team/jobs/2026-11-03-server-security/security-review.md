# Security review: ฝั่งเซิร์ฟเวอร์ทั้งหมด (worker/**)

โดย Security Reviewer · 2026-11-03 · ขอบเขต: snapshot ปัจจุบันของ branch `team/2026-11-03-correctness-lows` (อ่านอย่างเดียว · `submissions.ts`, `assignments.ts`, `shared/received-date.ts` กำลังถูกแก้โดยงานอื่น จึงดูเป็น snapshot เท่านั้น) · ธง: 🔐 👤 🌐 · รอบแก้ (Verify) 0/3

## สรุป: ผ่านแบบมีเงื่อนไข

High 2 · Medium 2 · Low 10

**ต้องแก้ก่อนใช้จริง:** S-01, S-02, S-03 (ทั้งสามข้อแก้ได้ไม่กี่บรรทัด ไม่ต้อง migration)
**ควรแก้/ทำเพิ่มได้ภายหลัง:** S-04 ถึง S-14

จุดที่ทำไว้ดีแล้ว: ทุก D1 query bind ค่าจริงทั้งหมด (ชื่อตาราง/คอลัมน์ที่ต่อเข้า SQL มาจาก whitelist คงที่) · cookie เป็น `HttpOnly; Secure; SameSite=Strict` และเก็บ token เป็น SHA-256 · ตรวจ Origin กับคำขอเขียน · reset ต้องใส่รหัสผ่านซ้ำและมี rate limit · audit ไม่เก็บรหัสผ่าน, PIN หรือ QR token · ไม่มี secret อยู่ใน repo (`.dev.vars` อยู่ใน gitignore และไม่เคยถูก commit) · runtime dependency (hono 4.13.13, zod 4.6.7) ไม่มี advisory

## วิธีตรวจ

- อ่านโค้ด `worker/app.ts`, `lib/{http,auth,crypto,config,audit,guard,db}.ts`, `routes/{auth,backup,reset,students,audit,bootstrap,catalog}.ts`, ส่วนหัวของ `submissions.ts`, SQL แบบ dynamic ทุกจุด (grep `${` ภายใน prepare), `public/_headers`, `public/sw.js`, `src/lib/backup.ts`, migrations (sessions/login_attempts)
- Probe บน miniflare local (ไฟล์ทดสอบอยู่ใน scratchpad ไม่ได้ใส่ไว้ใน repo · `npx vitest run --config <scratchpad>/probe/vitest.probe.config.mts`) ได้ผลดังนี้
  - P1 เปลี่ยนรหัสผ่านจากเครื่อง A แล้ว เครื่อง B ยังเรียก `/api/bootstrap` ได้ **200**
  - P2 ส่ง login รหัสผิด 30 ครั้งพร้อมกันจาก IP เดียว ได้ **401 ครบ 30 ครั้ง และไม่มี 429 เลย**
  - P3 เดารหัสเดิมผ่าน change-password 12 ครั้ง ได้ **403 ครบ 12 ครั้ง และไม่มี 429**
  - P4 ใช้ 4 address ใน IPv6 /64 เดียวกัน เดารหัสได้ **20 ครั้ง** (ได้งบใหม่ทุก address)
  - P5 คำขอเขียนที่ไม่มี Origin ได้ **200** และ Origin ต่างโดเมนได้ **403**
  - P6 response ของ `/api/backup` ไม่มี `Cache-Control` และไม่มี `nosniff`
  - P7 ไล่เรียกทุก route โดยไม่มี session: รันแล้วผ่าน แต่ไม่ได้เก็บผลที่ log ไว้ จึง**ไม่นับเป็นหลักฐาน** ส่วนการอ่านโค้ดยืนยันได้ว่าทุก route นอกจาก health/setup/login/me มี `requireAuth`
- ระหว่างตรวจ คำสั่ง `--dir` ทำให้ชุดทดสอบเดิมของโปรเจกต์รันครบทั้งชุดบน local โดยไม่ได้ตั้งใจ ผลคือ 45 ไฟล์ 699 tests ผ่านทั้งหมด และไม่มีไฟล์ใดใน repo ถูกแก้

## 1. Threat model

| Entry point | ผู้โจมตี | สิ่งที่อาจเกิด | การป้องกันที่มีในโค้ด | ช่องว่าง |
|---|---|---|---|---|
| `POST /api/auth/login` | คนบนอินเทอร์เน็ต | เดารหัสผ่าน → เข้าถึง PII เด็กทั้งหมด | rate limit 5 ครั้ง/15 นาที/IP (`lib/auth.ts:139-159`) · PBKDF2 100k | S-01, S-05 |
| `POST /api/setup` | คนที่รู้ URL ก่อนครูตั้งค่า | ยึดบัญชีบนเครื่องที่เพิ่งติดตั้ง | ต้องมี SETUP_CODE + rate limit + claim แบบ atomic (`routes/auth.ts:59-87`) | S-06 |
| `POST /api/auth/change-password` | คนที่ได้ session (เครื่องหาย/วางทิ้งไว้) | เดารหัสเดิม · session เก่ายังใช้ได้หลังเปลี่ยนรหัส | ตรวจรหัสเดิม | S-02, S-03 |
| `POST /api/admin/reset` | คนที่ได้ session | ลบข้อมูลทั้งหมด | ต้องใส่รหัสผ่าน + คำยืนยัน + rate limit (`reset.ts:48-58`) | — |
| `GET /api/backup` · restore/* | คนที่ได้ session · ไฟล์สำรองที่หลุดออกไป | PII รั่วออกนอกระบบ · restore จากไฟล์ปลอม | requireAuth · ตรวจไฟล์ด้วย zod + guard ภายใน batch | S-04, S-10, S-12 |
| คำขอเขียนทุกตัว (CSRF) | เว็บอื่น | สั่งเขียนแทนครู | SameSite=Strict + ตรวจ Origin (`http.ts:29-41`) | S-08 (hardening) |
| ทุก `/api/*` | ทุกคน | ใช้โควตา D1/Workers ฟรีจนหมด · body ขนาดใหญ่ | ไม่มี | S-09 |

## 2. สิทธิ์ (มีผู้ใช้คนเดียว แบ่งเป็นมี/ไม่มี session)

| action | ไม่มี session | มี session | ตรวจที่ |
|---|---|---|---|
| health, me, login, setup | ได้ | ได้ | `app.ts:70`, `routes/auth.ts:57,101,137` |
| อ่าน/เขียนข้อมูลทุกอย่าง, backup, restore | 401 | ได้ | `use(..., requireAuth)` ที่หัวไฟล์ route ทุกไฟล์ |
| reset | 401 | ต้องใส่รหัสผ่านซ้ำ | `reset.ts:52-57` |
| change-password | 401 | ต้องใส่รหัสเดิม (แต่ไม่มี rate limit) | `routes/auth.ts:185` |
| สั่งออกจากระบบอุปกรณ์อื่น | 401 | ได้ทันที (ไม่ต้องยืนยันรหัส) | `routes/auth.ts:165` |

## 3. Dependency audit (อ่านอย่างเดียว)

- `npm audit --json` พบ moderate 15 · high 0 · critical 0 · `--omit=dev` พบ moderate 9 (มาจาก `@tabler/icons-webfont` → svgtofont/glob/minimatch ซึ่งเป็นเครื่องมือตอน build font และไม่ถูก bundle เข้า Worker) ส่วน exceljs/archiver เป็น devDependency
- runtime ของ Worker มีแค่ hono 4.13.13 และ zod 4.6.7 ซึ่งไม่มี advisory
- ไม่ได้ติดตั้ง อัปเกรด หรือแก้ lockfile ใด ๆ

## 4. PDPA (นักเรียนเป็นผู้เยาว์)

| ข้อมูล | เก็บที่ | ใช้ทำอะไร | log? | ส่งออก? | ลบได้? | consent |
|---|---|---|---|---|---|---|
| ชื่อ/รหัส/เลขที่/ชั้น | `students` | ระบุตัวเด็ก | ชื่ออยู่ใน `audit_logs.before/after` | ไฟล์ backup JSON ไม่เข้ารหัส · Excel | ลบรายคนไม่ได้ (ตั้งได้แค่สถานะ) · ลบได้ทั้งระบบผ่าน reset | ยังไม่มีข้อความแจ้ง |
| QR token | `students`, `revoked_qr_tokens` | บัตรสแกน | ไม่ log | อยู่ใน backup | ตาม reset | — |
| PIN 4 หลัก | `students.pin` เก็บเป็นข้อความธรรมดา | **ไม่มีโค้ดใดใช้** | ไม่ log | อยู่ใน backup | ตาม reset | — |
| คะแนน/การเข้าเรียน | submissions/attendance | งานหลักของระบบ | อยู่ใน audit | backup · Excel | ตาม reset | — |
| อีเมลครู/hash/UA ของอุปกรณ์ | teacher/devices | ล็อกอิน | ไม่ log | ไม่อยู่ใน backup | reset all | — |

## 5. Secrets และ log

- [x] ไม่มี secret ใน worker/shared (`secret-scan` ผ่าน) · `.dev.vars` อยู่ใน gitignore และไม่เคยถูก commit · `/api/health` รายงานแค่ว่ามี secret หรือไม่ ไม่เปิดเผยค่า
- [ ] error: `restore_failed` ส่งข้อความ SQL ดิบกลับไป (S-10) · `console.error("unhandled")` ส่ง error object เข้า Workers observability

## ข้อที่พบ

### S-01 High · Login brute force: rate limit มี race และนับต่อ IP เท่านั้น — ต้องแก้ · `worker/lib/auth.ts:142-159`, `worker/routes/auth.ts:103-116`, `worker/lib/auth.ts:161-167`

- ปัญหา: `checkLoginRate` นับจำนวนครั้งก่อน แล้วค่อย `recordLoginFailure` หลัง PBKDF2 เสร็จ คำขอที่ยิงพร้อมกันจึงผ่านการนับได้ทั้งหมด (P2: 30/30 ผ่าน) · key คือ IP เต็ม ทำให้ IPv6 /64 เดียวกันได้งบใหม่ทุก address (P4) · ไม่มีเพดานรวม · รหัสผ่านขั้นต่ำแค่ 6 ตัว
- สถานการณ์ที่พัง: ผู้โจมตียิงคำขอพร้อมกันครั้งละหลายร้อยทุก 15 นาที หรือวน address ใน /64 ของตัวเอง จนเดารหัส 6 ตัวของครูได้ แล้วเข้าถึงชื่อ คะแนน และการเข้าเรียนของเด็กทั้งโรงเรียน
- แนวทางแก้ (ไม่ต้อง migration):
  1. บันทึกความพยายามก่อนตรวจรหัส โดยใช้ `batch([INSERT attempt, SELECT COUNT])` ถ้าเกิน 5 ให้ตอบ 429 และถ้าล็อกอินสำเร็จให้ลบ แบบนี้ D1 จะเรียงคำขอเขียนให้เอง จึงไม่เกิด race
  2. ใน `clientKey` ตัด IPv6 เหลือ prefix /64
  3. เพิ่ม key รวม `login:*` (เช่น 30 ครั้ง/ชั่วโมง) ถ้าเกินให้บังคับ Turnstile (ใช้ฟรี) หรือหน่วงเวลา แทนการล็อกบัญชี (เพื่อไม่ให้ใครใช้ล็อกครูออกจากระบบ)
  4. ถ้ามี custom domain ให้เพิ่ม Cloudflare rate-limiting rule ที่ `/api/auth/login` (แผนฟรีได้ 1 rule)
- สถานะ: เปิด

### S-02 High · เปลี่ยนรหัสผ่านแล้ว session บนเครื่องอื่นยังใช้ได้ — ต้องแก้ · `worker/routes/auth.ts:191-198`

- ปัญหา: ใน batch มีแค่ UPDATE teacher กับ audit ไม่มีคำสั่งลบ sessions (P1: เครื่อง B ยังได้ 200)
- สถานการณ์ที่พัง: มือถือครูหาย ครูเปลี่ยนรหัสจากโน้ตบุ๊กแล้วคิดว่าปลอดภัยแล้ว แต่คนที่เก็บมือถือได้ยังอ่านและแก้คะแนนได้อีกถึง 30 วัน
- แนวทางแก้: เพิ่ม `DELETE FROM sessions WHERE token_hash != ?` ใน batch เดียวกัน โดยใช้ hash ของ cookie ปัจจุบัน และควรออก token ใหม่ให้เครื่องที่กดเปลี่ยนด้วย เพิ่มเทสต์ว่าเครื่อง B ต้องได้ 401
- สถานะ: เปิด

### S-03 Medium · change-password ให้เดารหัสเดิมได้ไม่จำกัด — ต้องแก้ · `worker/routes/auth.ts:178-186`

- ปัญหา: ไม่มี `checkLoginRate` (P3: 12/12 ได้ 403) ขณะที่ reset มี
- สถานการณ์ที่พัง: คนที่ได้ session จากแท็บเล็ตที่วางทิ้งไว้ เดารหัสจริงได้เรื่อย ๆ แล้วนำไปใช้กับ reset หรือล็อกอินจากที่อื่นหลังถูกสั่งออกจากระบบ
- แนวทางแก้: ใส่ key `"chpw:"+clientKey` ตามแบบเดียวกับ `reset.ts:50-58`
- สถานะ: เปิด

### S-04 Medium · ไฟล์ backup เป็น JSON ไม่เข้ารหัส มี PII ของเด็ก + PIN + QR token — ควรแก้ · `worker/routes/backup.ts:40`, `src/lib/backup.ts:85-92`

- ปัญหา: ไฟล์ `ngankrob-backup-YYYY-MM-DD.json` ไปอยู่ในโฟลเดอร์ Downloads ของเครื่องใดก็ได้ และไม่มีคำเตือน
- สถานการณ์ที่พัง: ครูส่งไฟล์ทาง LINE/อีเมล หรือทำ USB หาย ข้อมูลนักเรียนทั้งหมดก็รั่วออกไป (ประเด็น PDPA ข้อมูลผู้เยาว์)
- แนวทางแก้: (ก) ระยะสั้น ใส่ข้อความเตือนบนหน้า backup และตัด `pin` ออกจาก backup เพราะไม่มีโค้ดใดใช้ (หรือเลิกใช้ฟีเจอร์ PIN) (ข) ทางเลือกภายหลัง ให้ตั้ง passphrase แล้วเข้ารหัสฝั่ง client ด้วย AES-GCM/PBKDF2 ของ Web Crypto ซึ่งทำได้ฟรีและไม่ต้องแก้ server
- สถานะ: เปิด

### S-05 Low · นโยบายรหัสผ่านอ่อน — `worker/routes/auth.ts:51,177`
ขั้นต่ำ 6 ตัวและไม่มีความยาวสูงสุด → ควรเพิ่มเป็นอย่างน้อย 8–10 ตัว และจำกัดไม่เกิน 256 ตัว (ใช้กับรหัสใหม่เท่านั้น)

### S-06 Low · เทียบ SETUP_CODE แบบไม่ constant-time — `worker/routes/auth.ts:65`
ควรใช้ `timingSafeEqual` จาก `lib/crypto.ts` และเขียนใน OPERATIONS ว่า SETUP_CODE ควรยาว ≥ 16 ตัวแบบสุ่ม

### S-07 Low · response ของ `/api/*` ไม่มี `Cache-Control: no-store` และ `nosniff` — `worker/app.ts:26-31`
(P6) `_headers` มีผลกับไฟล์ static เท่านั้น → ใน middleware ตัวแรกให้ set `Cache-Control: no-store` และ `X-Content-Type-Options: nosniff` กับทุก response

### S-08 Low · คำขอเขียนที่ไม่มี Origin ผ่านได้ — `worker/lib/http.ts:34`
(P5) ตอนนี้ SameSite=Strict ช่วยกันไว้อีกชั้น → hardening: ถ้า `Sec-Fetch-Site` มีค่าและไม่ใช่ `same-origin`/`none` ให้ตอบ 403 และถ้าไม่มีทั้ง Origin และ Sec-Fetch-Site ก็ตอบ 403 เช่นกัน (ยกเว้นตอนรันเทสต์)

### S-09 Low · ไม่จำกัดขนาด body และความยาวข้อความ — `worker/lib/http.ts:43-51`, schemas ใน `catalog.ts`/`students.ts`/`assignments.ts`
login/setup parse JSON ทั้งก้อนก่อนดู rate limit · `deviceId` และ `password` ไม่มี max · ฟิลด์ชื่อ/โน้ตไม่มี max → ใช้ `hono/body-limit` (auth 16KB, ทั่วไป 1MB, restore 5MB) และใส่ `.max()` ให้ฟิลด์ข้อความ · สำหรับ DoS โควตาฟรีจากคนไม่ล็อกอิน ให้ใช้ WAF rule ตาม S-01

### S-10 Low · error รั่วรายละเอียดภายใน — `worker/routes/backup.ts:294`, `worker/app.ts:115`
`restore_failed.detail` ส่งข้อความ SQL ดิบ (เห็นได้เฉพาะคนที่ล็อกอินแล้ว) → ส่งกลับแค่ code แล้วเขียนรายละเอียดลง log · `console.error("unhandled", err)` ควร log แค่ `err.message` ตัดให้สั้น

### S-11 Low · PDPA: retention และการลบรายบุคคล — `worker/lib/audit.ts:41-59`, `worker/routes/students.ts:407`
audit เก็บชื่อเด็กไว้ใน before/after ตลอดไป และลบเด็กรายคนไม่ได้ · PIN เก็บเป็นข้อความธรรมดาแต่ไม่มีใครใช้ → ควรกำหนดนโยบายเก็บข้อมูล (เช่น ล้าง audit ที่เก่ากว่า N ปี) และเขียนวิธีลบข้อมูลเด็กรายคนไว้ในคู่มือ

### S-12 Low · ค้นหาตารางด้วย key ของ prototype — `worker/routes/backup.ts:315`
`COLUMNS["constructor"]` เป็น truthy → `restoreRowIssues` เรียก `safeParse` ที่ไม่มีอยู่ → 500 (เกิดได้เฉพาะคนที่ล็อกอินแล้ว) → ใช้ `Object.hasOwn(COLUMNS, table)` หรือ `BACKUP_TABLES.includes`

### S-13 Low · `deviceId` ของ login ให้ client เป็นคนกำหนด และ signout ไม่ต้องยืนยันรหัส — `worker/routes/auth.ts:97,126,165-175`
คนที่ล็อกอินได้สามารถใช้ id ซ้ำกับเครื่องครูเพื่อซ่อนตัวในรายการอุปกรณ์ · ส่วน session ที่ถูกขโมยสั่งให้เครื่องอื่นออกจากระบบได้ → สร้าง device id ฝั่ง server (หรือผูกกับ session) · `devices.revoked` ไม่ได้ใช้ ควรใช้หรือเอาออก

### S-14 Low · session หมดอายุ 30 วันตายตัว ไม่มี idle timeout และไม่มีการล้าง session ที่หมดอายุแล้ว — `worker/lib/auth.ts:59,110-125`
ควรตั้ง idle timeout (เช่น 7 วันนับจาก last_seen) และลบ `sessions WHERE expires_at < now` ตอนล็อกอิน

## ยังไม่ได้ตรวจ

- logic ทางธุรกิจของ `attendance.ts`, `dashboard.ts`, `gradebook.ts`, `reports.ts`, `catalog.ts` (`terms/start`) ส่วนนี้ตรวจแค่ว่า SQL bind ถูกต้อง
- `submissions.ts` / `assignments.ts` ทั้งไฟล์ เพราะกำลังถูกแก้อยู่ จึงตรวจแค่ requireAuth, schema และ SQL interpolation
- XSS ฝั่ง client (เห็นแค่ว่า CSP ตั้งไว้เข้มงวด) · การตั้งค่า Cloudflare dashboard (WAF, custom domain) · ความแข็งแรงของ secret บน production
- ยังไม่ได้บันทึก evidence ผ่าน `evidence.mjs` เพราะหมดเวลา ผล probe P1–P6 อยู่ในส่วน "วิธีตรวจ" ด้านบน

## ตรวจซ้ำ (3 พ.ย.)

รอบแก้ (Verify) 1/3 · ขอบเขต: diff ที่ยังไม่ commit บน `team/2026-11-03-server-security` (`worker/app.ts`, `lib/auth.ts`, `lib/http.ts`, `routes/{auth,backup,reset}.ts`, `RestoreModal.tsx`, `Settings.tsx`) และส่วนที่รอบแรกยังไม่ได้ตรวจ (`attendance`, `dashboard`, `gradebook`, `reports`, `catalog`, `students`)

### สรุปรอบนี้: ไม่ผ่าน (ต้องแก้ 1 ข้อ)

- ข้อเดิม S-01, S-02, S-03, S-06, S-07, S-08, S-10 และ S-12 **แก้แล้ว** · S-09 และ S-14 แก้บางส่วน · S-04 ทำส่วนคำเตือนแล้ว · S-05, S-11 และ S-13 ยังรอเจ้าของงานตัดสิน (ดู Q1–Q6 ใน dev-notes)
- ข้อใหม่: Medium 1 ข้อ (**S-15 ต้องแก้**) · Low 7 ข้อ (S-16 ถึง S-22 ควรแก้)

### วิธีตรวจ

- อ่าน diff ทั้งหมด และอ่าน 6 route ข้างต้นครบทุกบรรทัด
- `npx vitest run test/api/sec-auth.test.ts test/api/sec-hardening.test.ts test/unit/sec-backup-warning.test.tsx` → 3 files / 21 tests ผ่าน
- Probe บน miniflare local โดยไม่แก้ repo (สำเนาโค้ดเก็บไว้ที่ `evidence/security-probe.ts.txt` และผลที่ `evidence/security-probe-out.txt`)
  - P8 ใช้ deviceId ที่เคยล็อกอินแล้ว (`dev_test`) เดารหัสจาก 10 IP ได้ **401 ครบ 50 ครั้ง ไม่มี 429** แปลว่าไม่ถูกนับงบบัญชีเลย
  - P9 สั่งให้มือถือออกจากระบบ (signout) และเปลี่ยนรหัสผ่านแล้ว แถวใน `devices` ยังอยู่ (`revoked=0`) จากนั้นใช้ id ของมือถือเครื่องนั้นเดารหัสจาก 8 IP ได้ **401 ครบ 40 ครั้ง ไม่มี 429**
  - P10 คนอื่นเดารหัสผิด 30 ครั้งจากอุปกรณ์ที่ไม่รู้จัก แล้วครูใส่รหัสถูกจาก**อุปกรณ์ใหม่** ได้ **429**
  - P11 มีคนใน NAT เดียวกันเดารหัสผิด 5 ครั้ง แล้วครูใส่รหัสถูกจาก**อุปกรณ์ที่เคยใช้**บน IP เดียวกัน ได้ **429**
  - P12 `PUT /api/settings` ส่ง body เป็น `null` ได้ **500** · ส่ง `Sec-Fetch-Site: same-site` ได้ 403 · คำตอบ 401 มี `no-store` และ `nosniff` ครบ
  - P13 attendance batch ส่ง `date:"zzzz-not-a-date"` ได้ **200** (ระบบบันทึกจริง) · ส่ง `subjectId` ที่ไม่มีอยู่ได้ **500**
- `npm audit --json` → moderate 15 · high 0 · critical 0 · `--omit=dev` → moderate 9 ตัวเลขเท่ารอบแรก · diff นี้ไม่ได้เพิ่ม dependency (`hono/body-limit` มากับ hono อยู่แล้ว) และไม่ได้แตะ lockfile

### ผลตรวจข้อเดิม

| ข้อ | ผล | หลักฐาน / หมายเหตุ |
|---|---|---|
| S-01 race | **แก้แล้ว** | `lib/auth.ts:131-154` ใช้ batch เดียว INSERT ก่อนแล้วค่อย COUNT ซึ่ง D1 รันเป็น transaction แบบเรียงทีละคำขอ คำขอที่เกินงบจะลบแถวของตัวเองทิ้ง จึงไม่ยืดเวลาล็อก · เทสต์ยิงพร้อมกัน 30 ครั้งได้ 401 ไม่เกิน 5 ครั้ง |
| S-01 IPv6 /64 | **แก้แล้ว** | `lib/auth.ts:156-178` รองรับ `::`, zone id และ `::ffff:a.b.c.d` · หมายเหตุ: คนที่ถือ /48 ยังได้งบ 65,536 ชุด ส่วนนี้ต้องพึ่งงบต่อบัญชีเป็นด่านสุดท้าย ซึ่งด่านนี้มีช่อง (S-15) |
| S-01 งบต่อบัญชี | **มีช่อง → S-15** | `routes/auth.ts:113,116` อุปกรณ์ที่ "รู้จัก" ไม่ใช้งบบัญชีเลย |
| S-02 | **แก้แล้ว** | `routes/auth.ts:203-215` ลบ session อื่นทั้งหมดใน batch เดียวกับการเปลี่ยนรหัส · ส่วนแถวใน `devices` ยังไม่ถูกเพิกถอน (เป็นที่มาของ S-15) |
| S-03 | **แก้แล้ว** | `routes/auth.ts:195-200` จองครั้งลองก่อนตรวจรหัส โดยนับต่อ IP และต่ออุปกรณ์ |
| S-04 | ทำส่วนคำเตือนแล้ว | `RestoreModal.tsx:39-60` และ `Settings.tsx:290,315` · ยังรอ Q5 (ตัด `pin` ออกจากไฟล์ / เข้ารหัสไฟล์) · คำแนะนำ "ออกบัตร QR ใหม่" ในคำเตือนอาศัย endpoint ที่อาจล้มกลางทาง (S-19) |
| S-06 | **แก้แล้ว** | `routes/auth.ts:67` ใช้ `timingSafeEqual` เทียบ sha256 ทั้งสองฝั่ง ความยาวจึงไม่รั่ว |
| S-07 | **แก้แล้ว** ไม่มีผลข้างเคียง | `app.ts:30-38` มีผลกับ `/api/*` เท่านั้น · ไฟล์ static ส่งผ่าน `env.ASSETS` (`index.ts`) ไม่ผ่าน middleware นี้ · `sw.js:85` ไม่แตะ `/api` · client ใช้ `cache:"no-store"` อยู่แล้ว (`src/lib/api.ts:30`) · ไม่มี route ไหนใช้ ETag · ไฟล์ backup สร้างเป็น Blob ฝั่ง client |
| S-08 | **แก้แล้ว** | `http.ts:32-35` ปฏิเสธ `same-site`/`cross-site` (P12 ได้ 403) · ค่า `none` เบราว์เซอร์ไม่ส่งมากับคำขอที่มาจากเว็บอื่น · คำขอที่ไม่มีทั้งสอง header ยังผ่าน ซึ่งรับได้เพราะ cookie เป็น SameSite=Strict |
| S-09 | แก้บางส่วน ไม่ทำให้ใช้งานจริงพัง | `app.ts:46-57` body ที่ถูกต้องตามปกติใหญ่สุดคือ restore chunk 500 แถว (ต่ำกว่า 8MB มาก) · import ≤200 แถว · submissions ≤50 ops · attendance ≤200 แถว ซึ่งต่ำกว่า 1MB ทั้งหมด · backup เป็น GET จึงไม่ถูกจำกัด · ฟิลด์ข้อความใน catalog/students ยังไม่มี `.max()` (ดู S-21) |
| S-10 | **แก้แล้ว** | `backup.ts:294-295`, `app.ts:138` |
| S-12 | **แก้แล้ว** | `backup.ts:317` ใช้ `Object.hasOwn` และทุกจุดที่ใช้ `COLUMNS[table]` ต่อจากนั้นผ่านการตรวจนี้แล้ว |
| S-14 | แก้บางส่วน | `lib/auth.ts:20-26` ลบ session ที่หมดอายุทุกครั้งที่ล็อกอิน · idle timeout ยังรอ Q2 |
| S-05, S-11, S-13 | ยังเปิด | รอเจ้าของงานตัดสิน (Q1, Q5, Q6) |

### ความเสี่ยงที่ครูจะถูกล็อกออก (lockout)

| กรณี | ผล | ระดับ |
|---|---|---|
| ครั้งลองที่จองไว้แต่ไม่ถูกคืนเมื่อสำเร็จ | **ไม่เกิด** · ล็อกอิน, setup, chpw และ reset เรียก `succeeded()` ทุกเส้นทางที่สำเร็จ (`routes/auth.ts:70,125,200`, `reset.ts:59`) ซึ่งลบแถวของตัวเองและล้างนับต่อ IP ให้ · `release()` (`lib/auth.ts:150`) ไม่มีใครเรียกใช้ (เป็นโค้ดที่ไม่ได้ใช้ แต่ไม่มีผลเสีย) | — |
| คนที่รู้อีเมลครูใช้งบบัญชีหมด | ครูบน**อุปกรณ์ที่เคยใช้**ยังเข้าได้ แต่บน**อุปกรณ์ใหม่**จะถูกล็อก (P10) และผู้โจมตีทำต่อไปเรื่อย ๆ ได้ในราคาถูก (เดา 30 ครั้งต่อชั่วโมงจาก 2 IP ขึ้นไป) | S-16 Low |
| NAT ร่วมของโรงเรียน หรือ CGNAT ของมือถือ | นักเรียนที่อยู่หลัง IP เดียวกันเดารหัสผิด 5 ครั้งทุก 15 นาที ก็ทำให้ครูล็อกอินจาก IP นั้นไม่ได้ แม้ใช้อุปกรณ์ที่เคยใช้ (P11) · พฤติกรรมนี้มีมาก่อนงานนี้แล้ว · ครูที่มี session 30 วันอยู่แล้วไม่ได้รับผลกระทบ | S-17 Low |
| ล็อกอินสำเร็จแล้วล้างนับต่อ IP ทั้ง bucket | ผู้โจมตีที่อยู่หลัง NAT เดียวกับครูได้งบใหม่ทุกครั้งที่ครูล็อกอินสำเร็จ | รวมอยู่ใน S-17 |

### ตรวจส่วนที่รอบแรกข้ามไป: authz / IDOR / input

- **ทุก route ต้องมี session:** ไล่ดูครบทั้ง 41 route ทุกตัวอยู่ใต้ `requireAuth` ยกเว้น `/api/health`, `/api/setup`, `/api/auth/login` และ `/api/auth/me` (ตัวนี้ไม่ส่งอีเมลกลับเมื่อไม่มี session · `routes/auth.ts:158`) · pattern ของ `use()` ครอบ route ย่อยทุกตัว เช่น `/api/classes/:id/qr/rotate` ถูกครอบทั้งโดย `catalog.ts:18` และ `students.ts:16`
- **IDOR / teacher_id:** ไม่เกี่ยวข้อง เพราะระบบมีผู้ใช้คนเดียว (ไม่มีคอลัมน์ `teacher_id` และใช้ `teacher LIMIT 1`) ทุก session มีสิทธิ์เต็มเท่ากัน จึงไม่มีบัญชีอื่นให้ข้ามไปเข้าถึง
- **SQL:** ทุก query ใน 6 ไฟล์นี้ bind ค่าจริง ส่วนที่ต่อเข้า SQL มีแค่ชิ้นคงที่ (`clauses`, `member.sql`, `attWhere`) ไม่พบ injection
- **XSS ฝั่ง client จากข้อมูล settings หรือ restore:** `dangerouslySetInnerHTML` มีจุดเดียว (`GradebookNav.tsx:82`) และดึงจาก map คงที่ จึงไม่พบช่อง
- **อ่านอย่างเดียว (dashboard, gradebook, reports, attendance GET):** ไม่พบปัญหาด้านความปลอดภัย (ช่วงวันที่ของ `/api/attendance/days` ถูกจำกัดไว้ที่ 62 วัน)

### ข้อที่พบใหม่

#### S-15 Medium · งบต่อบัญชีถูกข้ามได้ด้วย deviceId ที่ "รู้จัก" ซึ่งรวมถึงเครื่องที่ถูกสั่งออกแล้ว — **ต้องแก้** · `worker/routes/auth.ts:113,116`, `worker/routes/auth.ts:176-181`, `worker/routes/auth.ts:207-215` · เจ้าของไฟล์: Back-End

- ปัญหา: `known` ตรวจแค่ว่ามีแถวใน `devices` ถ้ามีก็ไม่ใช้งบบัญชีเลย ทำให้เหลือแค่งบต่อ IP 5 ครั้ง/15 นาที แต่การ signout และการเปลี่ยนรหัสไม่ได้ลบหรือเพิกถอนแถวใน `devices` (`revoked` ยังเป็น 0) นอกจากนี้ deviceId ยังอยู่ในไฟล์ backup ด้วย (`backup.ts:43,45,47` คอลัมน์ `device_id` ของ scan_sessions, submissions และ attendance)
- สถานการณ์ที่พัง: ครูทำมือถือหาย จึงสั่งเครื่องนั้นออกจากระบบและเปลี่ยนรหัสผ่าน (ซึ่งเป็นขั้นตอนที่ S-02 ตั้งใจให้ปลอดภัย) แต่คนที่เก็บมือถือได้มี deviceId อยู่ใน localStorage เขาแค่เปิด-ปิดโหมดเครื่องบินเพื่อเปลี่ยน IP หรือใช้ proxy ก็เดารหัสใหม่ได้ไม่จำกัด (P9: 40 ครั้งจาก 8 IP ไม่มี 429 เลย) · อีกทางหนึ่งคือคนที่ได้ไฟล์ backup ที่หลุดออกไปก็ทำแบบเดียวกันได้
- แนวทางแก้ (ไม่ต้อง migration):
  1. แทนที่จะให้อุปกรณ์ที่รู้จัก "ไม่มีงบ" ให้มีงบของตัวเองแทน เช่น `{ key: "login:dev:"+deviceId, max: 10, windowMs: 1h }`
  2. ตอน signout ให้ `UPDATE devices SET revoked = 1` ส่วนตอนเปลี่ยนรหัสให้ทำแบบเดียวกันกับทุกเครื่องยกเว้นเครื่องปัจจุบัน แล้วให้ `known` ตรวจเพิ่มว่า `AND revoked = 0` และเมื่อล็อกอินสำเร็จให้ตั้ง `revoked = 0` กลับ
  3. เพิ่มเทสต์จำลอง P8 และ P9 โดยคาดว่าต้องได้ 429

#### S-16 Low · คนที่รู้อีเมลครูล็อกครูบนอุปกรณ์ใหม่ได้ต่อเนื่อง — ควรแก้ · `worker/routes/auth.ts:104,116`
(P10) เป็นทางเลือก (ก) ของ Q3 ที่ตั้งใจเลือกไว้ แต่ยังไม่มีทางกู้คืนที่เขียนไว้ → ควรเพิ่มใน `docs/OPERATIONS.md` ว่าให้ล้างด้วย `DELETE FROM login_attempts WHERE key LIKE 'login:acct:%'` และให้ข้อความ 429 ของหน้าล็อกอินแนะนำว่า "ลองจากเครื่องที่เคยใช้" · ทางเลือกระยะยาวคือใช้ Turnstile เมื่อเกินงบบัญชี แทนการปฏิเสธทันที

#### S-17 Low · NAT ร่วมทำให้ครูล็อกอินไม่ได้แม้ใช้อุปกรณ์ที่เคยใช้ — ควรแก้ · `worker/routes/auth.ts:116`, `worker/lib/auth.ts:146-149`
(P11) ถ้าแก้ S-15 ตามข้อ 1 แล้ว อุปกรณ์ที่รู้จักควรใช้แค่ key ของอุปกรณ์ (หรือใช้ key ต่อ IP แต่ตั้งเพดานสูงขึ้น เช่น 20 ครั้ง) แทนการใช้ key ต่อ IP 5 ครั้ง · ส่วน `succeeded()` ไม่ควรล้างนับต่อ IP ทั้ง bucket ให้ลบแค่แถวของตัวเอง

#### S-18 Low · หน้าล็อกอินที่ถูกปฏิเสธยังเขียน D1 ทุกครั้ง ทำให้ผู้โจมตีเผาโควตาฟรีได้เร็วขึ้น — ควรแก้ · `worker/lib/auth.ts:133-142`
คำขอที่ได้ 429 แต่ละครั้งเขียน 2 แถว (INSERT) แล้วลบอีก 2 แถว และ index ก็นับเป็นแถวที่เขียนเพิ่ม ผู้โจมตีที่ไม่ได้ล็อกอินจึงใช้ประมาณ 1.5 หมื่นคำขอต่อวันก็ทำให้โควตา D1 ฟรี (เขียนได้ 100k แถว/วัน) หมดได้ ทั้งระบบจะเขียนไม่ได้จนถึงวันถัดไป (ก่อนแก้ คำขอที่ได้ 429 แทบไม่เขียนอะไรเลย) → ให้ใช้ `SELECT COUNT` (เป็นการอ่าน) ตรวจก่อน ถ้าเกินงบแล้วให้ตอบ 429 ทันที แล้วค่อยใช้ `reserveAttempt` เมื่อยังอยู่ในงบ ซึ่งความถูกต้องยังคงเดิมเพราะ reserve ยังตรวจซ้ำแบบ atomic · ระยะยาวให้ใช้ WAF rule ตาม S-01 ข้อ 4

#### S-19 Low · ออก QR ใหม่ทั้งห้องทำทีละคน อาจเกินเพดานจำนวน query ต่อคำขอของแผนฟรีแล้วล้มกลางทาง — ควรแก้ (ไม่แน่ใจ) · `worker/routes/students.ts:378-393`
แต่ละคนใช้ 1 SELECT และ 1 batch (4 statement) ห้องที่มี 30–40 คนจึงเกิน 50 query ต่อ invocation ที่ D1 ฟรีกำหนดไว้ (`backup.ts:115` ก็นับแบบนี้) ผลคือออกบัตรใหม่ได้แค่บางคนแล้วได้ 500 ซึ่งตรงกับขั้นตอนที่คำเตือน S-04 แนะนำให้ทำ "ถ้าไฟล์หลุดไป" · **ที่ไม่แน่ใจ:** miniflare ไม่บังคับ limit นี้ และเทสต์ที่มีอยู่ใช้ห้องที่มี 2 คน → ควรทำทั้งห้องใน batch เดียวด้วย `json_each` (สร้าง token ใน JS แล้วส่งเป็น JSON) และเพิ่มเทสต์ห้อง 45 คน

#### S-20 Low · ตรวจรูปแบบ input ไม่ครบ จึงได้ 500 หรือข้อมูลขยะ — ควรแก้ · `worker/routes/attendance.ts:110-113`, `worker/routes/catalog.ts:52-55`, `worker/routes/catalog.ts:67,71-72`
- attendance batch: `date` ไม่มี regex ทำให้วันที่ขยะถูกบันทึกจริง (P13: 200) · `subjectId` ที่ไม่มีอยู่ชน FK แล้วได้ 500 ซึ่ง outbox จะลองส่งซ้ำไปเรื่อย ๆ (onError ตั้งใจใช้ 422 เพื่อกันกรณีนี้) และ `period` ไม่มีขอบเขต
- `PUT /api/settings` ส่ง body เป็น `null` ได้ 500 (P12) เพราะ `Object.entries(null)` → ควรใช้ `z.record(z.string(), z.unknown())`
- termSchema: `year` ไม่มีขอบเขต และ `start_date`/`end_date` ไม่มี regex (ต่างจาก `startTermSchema:138-142`)
- แนวทางแก้: ใส่ `.regex(/^\d{4}-\d{2}-\d{2}$/)` และ `period: z.number().int().min(0).max(20)` · ถ้า subject หรือ class ไม่มีอยู่ ให้ตอบ 422
- ทุกข้อเกิดได้เฉพาะคนที่ล็อกอินแล้ว จึงเป็นเรื่องความถูกต้องของข้อมูลมากกว่าการข้ามสิทธิ์

#### S-21 Low · ฟิลด์ข้อความยังไม่มีความยาวสูงสุด (ส่วนที่เหลือของ S-09) · `worker/routes/students.ts:45-57,139-150`, `worker/routes/catalog.ts:65-73,254-320`
ชื่อหรือชื่อเล่นยาวได้ถึงราว 1MB (เพดาน body) และยังถูกคัดลอกลง `audit_logs.before/after` อีกรอบ → ใส่ `.max(100)` สำหรับชื่อ, `.max(30)` สำหรับรหัส และ `.max(500)` สำหรับโน้ต · `assignments.ts` ให้ทำในงานถัดไป

#### S-22 Low · นับต่อบัญชีด้วยอีเมลที่ผู้ส่งพิมพ์มา ทำให้บัญชีรุ่นเก่าที่ยังไม่มีอีเมลได้งบไม่จำกัด · `worker/routes/auth.ts:104,122`
กรณีที่ `teacher.email IS NULL` (บัญชีจากก่อนมีการล็อกอินด้วยอีเมล) อีเมลไหนก็ล็อกอินได้ ผู้โจมตีจึงเปลี่ยนอีเมลไปเรื่อย ๆ เพื่อให้ได้งบบัญชีชุดใหม่ทุกครั้ง → ถ้าบัญชีไม่มีอีเมล ให้ใช้ key คงที่ `login:acct:*` แทน · เกิดได้เฉพาะ instance ที่ยังไม่เคยล็อกอินหลัง migration 0007

### หลักฐานที่บันทึก
- `evidence.mjs add` · Q-31 threat-model (FAIL: S-15), Q-32 dependency-audit (PASS), Q-33 pii-handling (PASS)
- artifact: `evidence/security-probe-out.txt`, `evidence/security-probe.ts.txt`

## ตรวจซ้ำรอบ 2

รอบแก้ (Verify) 2/3 · ขอบเขต: ข้อ S-15, S-18, S-20, S-21 และ S-22 ใน diff เดิม (`routes/auth.ts`, `lib/auth.ts`, `routes/{attendance,catalog,students}.ts`) · `npx vitest run` ไฟล์ sec-* 3 ไฟล์ → **30/30 ผ่าน**

### สรุปรอบนี้: ผ่าน (ไม่มีข้อต้องแก้)

| ข้อ | ผล | หลักฐาน |
|---|---|---|
| S-15 | **แก้แล้ว** | `routes/auth.ts:117` นับเป็นเครื่องที่รู้จักเฉพาะ `revoked = 0` · `:108` ใช้งบ `login:dev:<id>` 10 ครั้ง/ชม. (shared) · `:183` signout ตั้ง `revoked=1` · `:218` เปลี่ยนรหัสผ่านแล้วเพิกถอนทุกเครื่องยกเว้นเครื่องปัจจุบันใน batch เดียวกัน · `:30` ล็อกอินสำเร็จตั้ง `revoked=0` คืน · อุปกรณ์ใหม่ทำแถวที่ "รู้จัก" ขึ้นมาเองไม่ได้ เพราะ upsert เกิดหลังรหัสถูกเท่านั้น · ตอนนี้งบรวมของผู้โจมตีมีเพดานแล้ว คือ 30/ชม. + 10/ชม. ต่อ device id ที่ยังไม่ถูกเพิกถอนที่เขารู้ |
| S-18 | **แก้แล้ว** ไม่มี race ใหม่ | `lib/auth.ts:136-137` อ่าน COUNT ก่อน ถ้าเกินงบตอบ null โดยไม่เขียนอะไร (เทสต์ spy ยืนยันแล้ว) · ส่วนที่ผ่านด่านอ่านยังต้องผ่าน batch แบบ atomic เดิม (`>` max ไม่ใช่ `>=` สอดคล้องกับด่านแรก) คำขอที่ชนกันจึงยังถูกตัดและลบแถวของตัวเอง ไม่เกิดการนับเกินหรือนับขาด · คำขอที่ยังอยู่ในงบยังเขียน 1 แถวต่อ key เหมือนเดิม (ดูข้อเสนอด้านล่าง) |
| S-22 | **แก้แล้ว** | `routes/auth.ts:107,120` บัญชีที่ไม่มีอีเมลใช้ key `login:acct:*` (เทสต์ 30×401 แล้ว 429) |
| S-20 | **แก้แล้ว** | attendance `date` มี regex, `period` อยู่ในช่วง 0–20, subject ที่ไม่มีอยู่ได้ 422 (`attendance.ts:110-113,194-196`) · settings ใช้ `z.record` · term มี `year` 2400–2700 และวันที่ต้องเป็นรูปแบบที่ถูก (`catalog.ts:53,68-73`) |
| S-21 | **แก้แล้ว** | ใส่ `.max()` ใน catalog (ชั้น วิชา ประเภทงาน ภาคเรียน) และ students (ทั้งการเพิ่มทีละคนและการนำเข้า) · assignments/submissions อยู่นอกขอบเขตตามแผน |

### ความเสี่ยงที่ครูจะถูกล็อกออก (ตามที่ PM ถาม)

- **เครื่องที่ถูกเพิกถอนเพราะเปลี่ยนรหัสจากอีกเครื่อง** ล็อกอินใหม่ด้วยรหัสใหม่ได้: เครื่องนี้จะถูกนับเป็นเครื่องแปลกหน้า จึงใช้งบบัญชี 30/ชม. ซึ่งนับเฉพาะครั้งที่ผิด และงบต่อ IP 5/15 นาที → รหัสถูก → `succeeded()` → upsert ตั้ง `revoked=0` → ได้ session ใหม่ (`routes/auth.ts:129-140`; เทสต์ `sec-auth.test.ts:157-166` ได้ 200 และ `revoked` เป็น 0) · ถ้าครูเผลอพิมพ์รหัสเดิมผิดซ้ำบน IP เดียวกัน 5 ครั้ง จะติด 15 นาที ซึ่งเป็นพฤติกรรมเดิมของ S-17
- **การใช้งานตามปกติไม่แตะงบล็อกอินเลย:** `reserveAttempt` ถูกเรียกแค่ใน login, setup, change-password และ reset (`routes/auth.ts:64,121,201`, `reset.ts:52`) · คำขอทั่วไปผ่าน `requireAuth` → `lookupSession` ซึ่งอ่านเฉพาะตาราง `sessions` · client เรียก `/api/auth/login` เฉพาะตอนครูกดเอง (`Overlays.tsx:151`, `Setup.tsx:57`) ไม่มีการล็อกอินซ้ำอัตโนมัติเมื่อได้ 401
- **ช่องใหม่ (Low, รวมไว้ใน S-16):** ก่อนแก้ เครื่องที่รู้จักไม่มีงบจึงล็อกไม่ได้ แต่ตอนนี้คนที่รู้ device id ของครู (เช่น จากไฟล์ backup ที่หลุด) และรู้อีเมล สามารถใช้งบ `login:dev:<id>` ให้หมด แล้วทำให้ครู**ล็อกอินใหม่**จากเครื่องนั้นไม่ได้ครั้งละ 1 ชม. และถ้าใช้งบบัญชีหมดด้วย ครูก็ล็อกอินจากเครื่องใหม่ไม่ได้เช่นกัน ส่วนเครื่องที่ยังมี session อยู่ใช้งานได้ตามปกติ · → คำสั่งกู้คืนใน OPERATIONS (dev-notes S-16) ควรเปลี่ยนเป็น `DELETE FROM login_attempts WHERE key LIKE 'login:%'` แทน `'login:acct:%'` อย่างเดียว · ระยะยาวให้ใช้ WAF/Turnstile ตาม S-01 ข้อ 4

### ข้อเสนอ (ไม่บล็อก)

- S-20 ที่เหลือ: `subjectId: ""` ผ่าน schema แต่ข้ามการตรวจ subject (`attendance.ts:194`) แล้วถูกบันทึกเป็น `subject_id = ''` ซึ่งชน FK แล้วได้ 500 · client ส่ง `null` เสมอ (`attSync.ts:31`) จึงเกิดได้แค่จากคำขอที่ปลอมขึ้นโดยคนที่ล็อกอินแล้ว → ใส่ `.min(1)` หรือแปลง `""` เป็น null
- S-18 ที่เหลือ (มีมาก่อนงานนี้): ถ้าผู้โจมตีเปลี่ยนอีเมลที่พิมพ์ไปเรื่อย ๆ จะได้ key บัญชีชุดใหม่ทุกครั้ง แต่จะไม่มีวันเดาถูก เพราะอีเมลต้องตรงด้วย ดังนั้นสิ่งที่เขาได้คือการเขียน D1 ได้ราว 5 ครั้งต่อ IP ต่อ 15 นาที ซึ่งยังถูกจำกัดด้วยโควตาคำขอของ Workers เป็นหลัก · ถ้าจะปิดช่องนี้ด้วยการใช้ key กลางสำหรับอีเมลผิด จะเกิดช่องให้เดาว่าอีเมลไหนถูก (oracle) → ให้ใช้ WAF rule แทน
- `/api/auth/logout` (ออกจากระบบด้วยเครื่องตัวเอง) ไม่ได้ตั้ง `revoked` · เครื่องนั้นจึงยังใช้งบ `login:dev` 10/ชม. ได้ ซึ่งเข้มกว่างบบัญชี จึงรับได้

### หลักฐาน
- `evidence.mjs add` Q-31 threat-model → **PASS** (แทนที่ FAIL ของรอบก่อน) · Q-32 และ Q-33 ยังใช้ผลเดิม (diff รอบนี้ไม่ได้แตะ dependency หรือ PII)

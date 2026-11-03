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

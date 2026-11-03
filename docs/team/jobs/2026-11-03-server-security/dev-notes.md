# Dev notes: server-security (Back-End)

ผู้เขียน: Back-End Developer · 2026-11-03 · branch `team/2026-11-03-server-security` · ยังไม่ commit · ไม่มี migration · ไม่แตะ `submissions.ts`/`assignments.ts`

## สิ่งที่ทำ (ตามลำดับที่สั่ง)

| ข้อ | แก้ที่ | สรุป |
|---|---|---|
| S-02 | `worker/routes/auth.ts` change-password · `worker/lib/auth.ts` `currentTokenHash` | ใน batch เดียวกับ UPDATE teacher + audit เพิ่ม `DELETE FROM sessions WHERE token_hash != <cookie ปัจจุบัน>` → เครื่องอื่นได้ 401 ทันที เครื่องที่เปลี่ยนยังอยู่ (ไม่ได้หมุน token เครื่องนี้ ดูคำถาม Q4) |
| S-03 | `worker/routes/auth.ts` change-password | จองครั้งลองก่อนตรวจรหัสเดิม 2 key: `chpw:ip:<ip/64>` และ `chpw:dev:<deviceId>` (5 ครั้ง/15 นาที) → เกินได้ 429 `rate_limited` แม้รหัสถูก · สำเร็จแล้วล้างนับ |
| S-01 | `worker/lib/auth.ts` `reserveAttempt`, `ipRate`, `guessRate`, `ipBucket`, `clientKey` · login ใน `routes/auth.ts` | (1) ไม่มี race: batch เดียว `DELETE เก่า → INSERT … RETURNING rowid → SELECT COUNT` D1 เรียงคำขอให้ ถ้าเกินงบ ลบแถวของตัวเองทิ้ง (retry ตอนโดนล็อกไม่ยืดเวลาล็อก) · (2) IPv6 ตัดเหลือ /64, `::ffff:a.b.c.d` → IPv4, XFF ใช้ตัวแรก · (3) งบต่อบัญชี `login:acct:<email>` 30 ครั้ง/ชั่วโมง ข้าม IP · เครื่องที่เคยล็อกอิน (มีแถวใน `devices`) ไม่ใช้งบบัญชี → คนอื่นเดารหัสแล้วไม่ล็อกครูออก (ยังติดงบต่อ IP) · ไม่มี pepper ตอบ 503 ก่อนนับ (คงพฤติกรรมเดิม) |
| S-01 (ต่อ) | setup + reset | ใช้ `reserveAttempt` แบบเดียวกัน (race เดียวกัน) · key `setup:`/`reset:` เหมือนเดิม |
| S-04 | `src/components/RestoreModal.tsx` `BackupWarning` · `src/pages/Settings.tsx` ปุ่มดาวน์โหลด | กดดาวน์โหลด → Dialog เดิม (`Dialog` + `imp-warn` + ปุ่มแบบ ResetModal) บอกว่าไฟล์มีชื่อ คะแนน PIN QR ไม่เข้ารหัส อย่าส่ง LINE/อีเมล → "เข้าใจแล้ว ดาวน์โหลด" ค่อยเรียก `runBackup` · ไม่เปลี่ยนรูปแบบไฟล์ |
| S-06 | setup | เทียบ `sha256(code)` ด้วย `timingSafeEqual` (ความยาวไม่รั่ว) |
| S-07 | `worker/app.ts` middleware แรก | ทุก response `/api/*` (รวม 401/404/500) มี `Cache-Control: no-store` + `X-Content-Type-Options: nosniff` |
| S-08 | `worker/lib/http.ts` `assertSameOrigin` | คำขอเขียนที่มี `Sec-Fetch-Site` ไม่ใช่ `same-origin`/`none` → 403 `bad_origin` · ไม่มีทั้งสอง header ยังผ่าน (ไม่ใช่ browser = ไม่มี cookie ให้ขโมยใช้; ถ้าบังคับต้องมีโหมดยกเว้นตอนเทสต์ซึ่งเป็นช่องโหว่เอง) |
| S-09 | `worker/app.ts` `hono/body-limit` (อยู่ใน hono เดิม ไม่ติดตั้งเพิ่ม) · zod `.max()` ใน auth | auth/setup 16KB, restore 8MB, อื่น ๆ 1MB → 413 `{error:"too_large"}` · password/current/next ≤256, setupCode ≤256, deviceId ≤100 (client ใช้ `dev_`+ULID = 30 ตัว) |
| S-10 | `worker/routes/backup.ts` · `worker/app.ts` onError | `restore_failed` ไม่ส่ง `detail` (SQL ดิบ) แล้ว — ยังเขียนลง log เหมือนเดิม · client ใช้แค่ code อยู่แล้ว · `console.error("unhandled")` log แค่ message ≤200 ตัว |
| S-12 | `worker/routes/backup.ts` chunk | `Object.hasOwn(COLUMNS, table)` → `constructor`/`__proto__`/`toString` ได้ 400 `bad_table` ไม่ใช่ 500 |
| S-14 (บางส่วน) | `createSession` | ลบ session ที่หมดอายุแล้วใน batch เดียวกับการสร้าง (ไม่เพิ่ม round trip) |

## เทสต์ (เขียนก่อนแก้ ล้มก่อนแก้ทุกข้อที่สังเกตได้)

- `test/api/sec-auth.test.ts` 12 tests · `test/api/sec-hardening.test.ts` 7 tests · `test/unit/sec-backup-warning.test.tsx` 2 tests
- ก่อนแก้: `npx vitest run test/api/sec-auth.test.ts test/api/sec-hardening.test.ts` → **16 failed | 3 passed (19)** (เช่น 30 พร้อมกัน → 401 ครบ 30, IPv6 /64 → 20, เครื่อง B หลังเปลี่ยนรหัส 200, chpw 12 ครั้ง 403 ครบ, constructor → 500, restore_failed มี `D1_ERROR`) · `sec-backup-warning` → 2 failed
  - 3 ข้อที่ผ่านตั้งแต่ก่อนแก้เป็นเทสต์กันถอยหลัง (รหัสเดิมผิดไม่ทำให้เครื่องอื่นหลุด / สำเร็จแล้วล้างนับ / setup code ความยาวต่างได้ 403) — S-06 constant-time สังเกตจากภายนอกไม่ได้ จึงพิสูจน์ด้วยการอ่านโค้ด
- หลังแก้: 19/19 + 2/2 ผ่าน · typecheck ผ่าน · ชุดเต็ม: ดูหัวข้อ "หลักฐาน"

## หลักฐาน

- `npm run typecheck` → PASS (ไม่มี error)
- `npx vitest run` (ชุดเต็ม หลังแก้ทุกข้อ) → PASS **111 files / 1336 tests** (baseline 108 / 1315 + ใหม่ 3 files / 21 tests) · ไม่มีเทสต์เดิมต้องแก้
- ไม่มี script lint ใน package.json → N/A · ไม่ได้เปิด server · ยังไม่ได้บันทึกผ่าน `evidence.mjs` (หมดงบ turn — PM/QA บันทึกได้จากตัวเลขนี้)

## รอบแก้ 1/3 (ตาม "ตรวจซ้ำ 3 พ.ย." ใน security-review.md)

| ข้อ | แก้ที่ | สรุป |
|---|---|---|
| S-15 | `routes/auth.ts` login/signout/change-password/`upsertDeviceStmt` | เครื่องที่รู้จัก = `devices.revoked = 0` (คอลัมน์มีอยู่แล้ว ไม่ต้อง migration) และใช้งบของตัวเอง `login:dev:<id>` 10 ครั้ง/ชม. แทนการไม่มีงบ · signout ตั้ง `revoked=1` · เปลี่ยนรหัสตั้ง `revoked=1` ทุกเครื่องยกเว้นเครื่องปัจจุบัน (batch เดียวกัน) · ล็อกอินสำเร็จ upsert ตั้ง `revoked=0` คืน · client ไม่ได้ใช้ `revoked` ที่ไหน |
| S-18 | `lib/auth.ts` `reserveAttempt` | อ่าน `COUNT` ก่อน (อ่านอย่างเดียว) เกินงบ → 429 โดยไม่เขียนอะไรเลย แล้วจึง reserve แบบ atomic เดิม (เพิ่ม 1 round trip เฉพาะการตรวจรหัส) |
| S-22 | login | บัญชีที่ `teacher.email IS NULL` ใช้ key คงที่ `login:acct:*` |
| S-20 | `catalog.ts` settings/term · `attendance.ts` | settings body ต้องเป็น object (`z.record`) → null/array = 422 · term `year` 2400–2700, `start/end_date` ต้องเป็น `YYYY-MM-DD` หรือว่าง (ว่าง = ไม่ตั้ง เหมือนเดิม) · attendance `date` regex, `period` 0–20, `subjectId` ที่ไม่มีอยู่ → 422 `unknown_subject` (ถามพร้อมคำถามอื่นใน `Promise.all` เดิม ไม่เพิ่ม round trip) |
| S-21 | `catalog.ts`, `students.ts`, `attendance.ts` | ชื่อ ≤100, รหัส/คำนำหน้า/สี ≤30, grade ≤50, icon ≤50, id ≤100 · ไม่แตะ assignments/submissions |

เทสต์ใหม่ (เขียนก่อน ล้มก่อนแก้ 9/9): `sec-auth.test.ts` +5 (P8, P9, revoke/un-revoke, S-18 spy ว่าไม่มี INSERT/DELETE/UPDATE, S-22) · `sec-hardening.test.ts` +4 (settings null/array, attendance date/period/subject, term, ความยาวชื่อ) → หลังแก้ 28/28 ผ่าน

หลักฐานรอบ 1: `npm run typecheck` → PASS (exit 0) · `npx vitest run` → PASS **111 files / 1345 tests** (เดิม 111/1336 + 9) · ระหว่างทางเจอ regex วันที่ที่เขียนผิดเอง (backslash หาย) จนเทสต์ attendance เดิมล้ม แก้แล้วผ่าน · ไม่มีเทสต์เดิมต้องแก้

ไม่เขียนโค้ด (บันทึกไว้ตามที่สั่ง):
- S-16: เพิ่มใน `docs/OPERATIONS.md` (คนที่ถือไฟล์นั้นทำ) — "ครูล็อกอินจากเครื่องใหม่ไม่ได้ (429) เพราะมีคนเดารหัส: ล็อกอินจากเครื่องที่เคยใช้ หรือรัน `npx wrangler d1 execute kru-db-apac --remote --command \"DELETE FROM login_attempts WHERE key LIKE 'login:acct:%'\"` แล้วเปลี่ยนรหัสผ่าน"
- S-17: NAT/CGNAT ร่วม — คนหลัง IP เดียวกันเดาผิด 5 ครั้ง ทำให้ครูบน IP นั้นติด 429 15 นาที (มีมาก่อนงานนี้) · ถ้าจะแก้: เครื่องที่รู้จักใช้แค่ `login:dev:` หรือเพิ่มเพดาน IP เป็น 20 และ `succeeded()` ลบเฉพาะแถวตัวเอง — แลกกับงบเดารหัสต่อ IP ที่มากขึ้น → ให้เจ้าของงานเลือก (แนะนำ: เครื่องที่รู้จักใช้เพดาน IP 20)
- S-19: ออก QR ใหม่ทั้งห้อง (`students.ts` class rotate) ทำทีละคน ≈ 2 query/คน → ห้อง > ~24 คนอาจเกินเพดาน 50 query/invocation ของ D1 ฟรี แล้วล้มกลางทาง (miniflare ไม่บังคับ จึงยังไม่ยืนยัน) · แนะนำงานถัดไป: ทำทั้งห้องใน batch เดียวด้วย `json_each` + เทสต์ห้อง 45 คน

## คำถามที่ต้องให้เจ้าของงานตัดสิน (เปลี่ยนกติกา → ไม่ได้ทำ)

- Q1 S-05 รหัสผ่านขั้นต่ำ 6 → 8 หรือ 10? (ใช้กับรหัสใหม่เท่านั้น ต้องแก้ข้อความหน้า setup/เปลี่ยนรหัสด้วย) · แนะนำ: 8
- Q2 S-14 idle timeout (เช่นไม่ได้ใช้ 7 วันต้องล็อกอินใหม่) — เปลี่ยนประสบการณ์ครูบนแท็บเล็ตห้องเรียน · แนะนำ: 14 วัน (ต้องเขียน `last_seen` ต่อ request = เพิ่มการเขียน D1 → กระทบ volume budget จึงยังไม่ทำ)
- Q3 S-01 งบบัญชี 30 ครั้ง/ชม. และ "เครื่องที่เคยเข้าไม่ใช้งบบัญชี" — ทางเลือก: (ก) ตามที่ทำ (ข) งบบัญชีใช้กับทุกเครื่อง (ปลอดภัยขึ้นแต่คนที่รู้อีเมลครูล็อกครูออกได้ 1 ชม.) · แนะนำ: (ก) + WAF rule ฟรี 1 ข้อที่ `/api/auth/login` เมื่อมี custom domain
- Q4 S-02 ควรหมุน token ของเครื่องที่กดเปลี่ยนรหัสด้วยไหม · แนะนำ: ยังไม่ต้อง (ไม่ได้ช่วยเมื่อเครื่องนี้คือเครื่องที่ปลอดภัย และเทสต์/หน้าจอเดิมใช้ cookie เดิมต่อ)
- Q5 S-11 นโยบายเก็บ audit (ชื่อเด็กใน before/after) และวิธีลบเด็กรายคน · S-04 (ข) เข้ารหัสไฟล์ backup ด้วย passphrase · ตัด `pin` ออกจาก backup (เปลี่ยนรูปแบบไฟล์ — Gate 0 บอกไม่เปลี่ยน)
- Q6 S-13 deviceId สร้างฝั่ง server / signout ต้องยืนยันรหัส — เปลี่ยน flow หน้าจอ · แนะนำ: ทำในงาน UI ถัดไป

## ข้อจำกัด / ยังไม่ได้ทำ

- S-08 ไม่บังคับ 403 เมื่อไม่มีทั้ง Origin และ Sec-Fetch-Site (เหตุผลด้านบน)
- S-09 `.max()` ของฟิลด์ชื่อ/โน้ตใน catalog/students/assignments ยังไม่ใส่ (assignments ห้ามแตะ; ที่เหลือ body-limit 1MB ครอบไว้แล้ว)
- คำเตือน S-04 ขึ้นเฉพาะปุ่มดาวน์โหลดในตั้งค่า — สำรองอัตโนมัติก่อนกู้คืน/ก่อนล้างข้อมูล ไม่ได้ถามซ้ำ (ครูอยู่ในขั้นตอนที่ตั้งใจแล้ว)
- ไม่ได้แก้ `docs/OPERATIONS.md` (นอกขอบเขต) — คำสั่ง `DELETE FROM login_attempts` ยังใช้ได้เหมือนเดิม; ควรเพิ่มว่า SETUP_CODE ยาว ≥16 ตัวสุ่ม (S-06)

## จุดที่ QA ควรทดสอบ

- login จากมือถือ (IPv6) ผิด 5 ครั้งแล้วสลับ wifi/4G: งบแยกตาม /64
- เปลี่ยนรหัสบนโน้ตบุ๊ก → มือถือที่เปิดค้างได้หน้าเข้าสู่ระบบในคำขอถัดไป, outbox ที่ค้างในมือถือส่งต่อได้หลังล็อกอินใหม่
- กดดาวน์โหลดสำรอง → เห็นคำเตือน → ยกเลิกแล้วไม่มีไฟล์, ยืนยันแล้วได้ไฟล์
- กู้คืนไฟล์ขนาดใหญ่ (audit หลายพันแถว) ไม่โดน 413

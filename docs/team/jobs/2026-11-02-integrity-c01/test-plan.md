# Test plan: คะแนนไม่ถูกเขียนทับเมื่อสแกนช่องที่ส่งแล้ว (integrity-c01)

โดย QA (team-qa-tester) · 2 พ.ย. 2569 · เฟส 3 (ก่อนมีโค้ดแก้) · ขนาด M · ธง 💰 🔄 🗑 🖥
แหล่ง: `brief.md` (Gate 0/1), `requirements.md` (BR-01..08, AC-01..14, ฉ1–ฉ6) · branch `team/2026-11-02-integrity-c01` @ main 18759a2 (ไม่มีโค้ดแก้)

## สรุป

- เขียนเทสต์ที่ **ล้มก่อนแก้จริง 28 ข้อ** (API 20 · outbox 3 · หน้าสแกน 5) + เทสต์กันถอย **[guard] 16 ข้อ** ที่ผ่านที่ main และต้องผ่านต่อหลังแก้ — รวม 44 ข้อใน 3 ไฟล์ใหม่
- ทุกข้อที่ล้ม ล้มเพราะพฤติกรรม C-01 จริง (server ตอบ `ok` แล้วทับช่อง / outbox ย้ายไป "ส่งไม่สำเร็จ" / หน้าสแกนแสดงค่าที่ผิด) — **ไม่มีข้อไหนล้มเพราะ syntax/import**
- ชุดเทสต์ทั้งหมดที่ branch นี้: 89 ไฟล์ / 1068 tests — ล้ม 28 = เฉพาะ 3 ไฟล์ใหม่ · ไฟล์เดิม 86 ไฟล์ผ่านทั้งหมด (baseline context.md: 85 ไฟล์/1017 PASS + ไฟล์ gb-header-a ที่ merge แล้ว)
- AC ที่ทดสอบอัตโนมัติไม่ได้ทั้งหมด: AC-12 ส่วนภาพ (4 อุปกรณ์/ชื่อยาว/รายการล่าสุด) และ AC-14 ส่วนแอปเก่าจริง → ทดสอบบนเบราว์เซอร์ในเฟส 4 (ดู §5, §6)

## 1. ผลที่คาดคำนวณจาก BR ก่อนดูโค้ด (expected-from-br, 💰)

คำนวณจาก requirements.md เท่านั้น ก่อนอ่าน `worker/` — ตัวเลขเหล่านี้ฝังอยู่ในเทสต์

| # | ข้อมูลตั้งต้น | เหตุการณ์ | ที่ main (บั๊ก) | หลังแก้ (คาด) | วิธีคิด |
|---|---|---|---|---|---|
| E1 (BR-04 ฉ1) | ก: งาน1 = 7/10, งาน2 = 8/10 | iPad ข้อมูลเก่าสแกน ก งาน1 โหมดเต็ม | (10+8)/(10+10) = 18/20 = **90%** | (7+8)/20 = 15/20 = **75%** | Σคะแนน ÷ Σเต็มของงานที่มีคะแนน |
| E2 (BR-04 ฉ2) | เหมือน E1 | สแกน ก งาน1 โหมดให้คะแนนทีหลัง | งาน1 = รอตรวจ ไม่นับ → 8/10 = **80%**, "ส่งแล้วมีคะแนน" ลด 1 | 15/20 = **75%** | งานรอตรวจไม่อยู่ในตัวหาร |
| E3 (BR-01) | ก = {submitted, 7, late 0, submitted_at T0, grid} | hid 10 เวลา T0+20s | ก = 10, method hid, scan_session R2, event_at T0+20s | ทั้ง 9 ฟิลด์เท่าเดิม · ผล `already_submitted` + submission.score 7 · audit ของ op = 0 แถว | BR-01 |
| E4 (BR-02) | ค ว่าง | R1: hid null → manual 8 | ค = 8 (ok, ok) | เหมือนเดิม: ค = 8, submitted_at = เวลา op รับงาน, audit create+update | ข้อยกเว้น BR-02 |
| E5 (BR-02 ข้อ 1) | R1 รับ ค (null) → สมุดให้ 5 | R1 พิมพ์ 8 มาถึง | ค = 8 | `already_submitted`, ค = 5 | ช่องถูกเขียนล่าสุดโดย grid ไม่ใช่ R1 |
| E6 (BR-03) | ก = {submitted 10, T0, late 0} | grid 7 เวลา T0+30s | ok, 7, T0 | เหมือนเดิม ok, 7, submitted_at T0, late 0 | การแก้ตั้งใจไม่ถูกบล็อก |
| E7 (BR-05) | ก = void | hid 10 เวลา T | ok, submitted 10, submitted_at = T | เหมือนเดิม | ช่องที่ยังไม่ส่ง |
| E8 (BR-07) | คิว 3 รายการ หนึ่งได้ `already_submitted` | ส่งครบ | รอส่ง 0, ส่งไม่สำเร็จ **1** | รอส่ง 3→0, ส่งไม่สำเร็จ **0** | ผลสุดท้าย ไม่ใช่ความล้มเหลว |
| E9 (AC-13) | ก = 7, ข/ค ว่าง | คำขอเดียว [ก,ข,ค] hid 10 | [ok, ok, ok], ก = 10 | [`already_submitted`, ok, ok], ก = 7, ข = ค = 10 + audit 1 แถว/คน | BR-06 ตัดสินต่อ op |

ผลจริงที่ main ตรงกับคอลัมน์ "ที่ main (บั๊ก)" ทุกแถวที่วัดได้ (E1 ได้ `{got: 18, full: 20}`, E2 ได้ `{got: 8, full: 10}`, E8 ได้ failedCount 1) — ยืนยันว่า C-01 ทำซ้ำได้จริง (brief บอก "อ่านโค้ดเท่านั้น ยังไม่ได้ทำซ้ำ" → ตอนนี้ **ทำซ้ำได้แล้ว** ระดับ API และ client)

## 2. สภาพแวดล้อมและคำสั่ง

| ระดับ | ที่รัน | คำสั่ง |
|---|---|---|
| API | Vitest project `workers` (Workers runtime + D1 ในหน่วยความจำ, `test/api/helpers.ts` seed: a1 เต็ม 10, c1, st1/st2 + st3 ที่เทสต์เพิ่ม) | `npx vitest run test/api/c01-no-overwrite.test.ts` |
| unit outbox | Vitest project `dom` (jsdom + fake-indexeddb, mock `api.post`) | `npx vitest run test/unit/c01-outbox-already-submitted.test.ts` |
| unit หน้าสแกน | Vitest `dom` (mock api/outbox/sound แบบ scan-controller.test.ts, render `ScanPage`) | `npx vitest run test/unit/c01-scan-already-submitted.test.ts` |
| ทั้งชุด | baseline เทียบ context.md | `npm test` (= `vitest run`) · `npm run typecheck` |
| เบราว์เซอร์ | `scripts/fixture-server.cjs` (worker จริง + D1 ในหน่วยความจำ + ข้อมูลสมมติ, layout:true) ผ่าน `scripts/shots.cjs` พอร์ต 4101 | `npm run build; node scripts/shots.cjs --label before|after --job docs/team/jobs/2026-11-02-integrity-c01 --pages docs/team/jobs/2026-11-02-integrity-c01/pages.json` |
| offline จริง | Playwright + fixture (`scripts/offline-e2e.cjs` เป็นแบบอย่าง พอร์ต 5195) | ดู §5 — ต้องมีสคริปต์/ขั้นตอนใหม่ (ไม่อยู่ในขอบเขตเขียนของ QA ตอนนี้) |

## 3. AC → เทสต์ (ล้มก่อนแก้อย่างไร)

ไฟล์: **A** = `test/api/c01-no-overwrite.test.ts` · **O** = `test/unit/c01-outbox-already-submitted.test.ts` · **S** = `test/unit/c01-scan-already-submitted.test.ts` · **B** = เบราว์เซอร์ (fixture, เฟส 4) · [guard] = ผ่านที่ main ต้องผ่านต่อ

| AC | ระดับ | ไฟล์ › ชื่อเทสต์ (ย่อ) | ที่ main 18759a2 (ผลจริง) | หลังแก้ต้องได้ |
|---|---|---|---|---|
| AC-01 | API | A › `AC-01 ฉ1 … R2 hid/camera/manual score 10` (3 ข้อ) | **ล้ม** `expected 'ok' to be 'already_submitted'` (ช่องถูกทับเป็น 10) | `already_submitted` + submission.score 7 · 9 ฟิลด์ `toEqual` เดิม · audit ของ op 0 · audit ของ ก ไม่เพิ่ม |
| AC-02 | API | A › `AC-02 ฉ2 … later-mode hid null` · `AC-02 ฉ6 … R1 received → gradebook 8 → R2 full/later` | **ล้ม** ok (7 → null / 8 → 10) | `already_submitted`, ยัง 7 / 8 |
| AC-02 / BR-04 | API | A › `BR-04 … full-mode (bug 18/20)` · `… later-mode (bug 8/10)` · `… full AND later` | **ล้ม** `{got:18,full:20}` / `{got:8,full:10}` | `{got:15, full:20}` = 75% |
| AC-03 | API | A › `AC-03 ฉ4: all-submitted … hid 10` · `AC-03 ฉ4 (full button too) … hid null` | **ล้ม** ok (null → 10 / 10 → null) | `already_submitted`; score/submitted_at/late ของ ข = ตอนกดปุ่มทั้งห้อง |
| AC-04 | API | A › `[guard] AC-04 … ONE request` · `[guard] AC-04 … TWO requests` | ผ่าน | ok, ok · ค = 8 · submitted_at = op รับงาน · audit `["create","update"]` |
| AC-04 / BR-02 | API | A › `BR-02 (1) gradebook 5 meanwhile` · `BR-02 (2) R1 rescans after 8` · `BR-02 (3) another receive without score` | **ล้ม** ok (5 → 8 / 8 → null / ทับ) | `already_submitted`, ช่องเดิม |
| AC-05 | API | A › `AC-05 ฉ3 … two requests` · `AC-05 ฉ3 … ONE request` | **ล้ม** ok / `['ok','ok']` (7 → null → 6) | ทั้งสอง `already_submitted`, ยัง 7 |
| AC-06 | API | A › `[guard] AC-06 grid 7 newer` · `[guard] … void` · `[guard] … full-score, clear, undo` + ชุดเดิม `server-intent.test.ts`, `submissions.test.ts`, `race-r1.test.ts`, `qa-m1-02.test.ts`, `inactive-student.test.ts` | ผ่าน | ผ่านเหมือนเดิม (ห้ามแก้เทสต์เดิมให้อ่อนลง) |
| AC-07 | API | A › `[guard] AC-07 (1) no row` · `(2) void → new submitted_at` · `(3) excused → submitted 10` | ผ่าน | ผ่านเหมือนเดิม — (3) คือกันไม่ให้งานนี้ไปทำ C-06 |
| AC-08 | API | A › `[guard] AC-08 (1) duplicate` · `(2) epoch_changed` · `(3) assignment_closed` · `(4) full_score_changed` · `(5) superseded` | ผ่าน | ผลเดิม ไม่ใช่ `already_submitted` · ช่องเดิม |
| AC-09 | API | A › `AC-09 ฉ5: queued 09:05 scan …; later gradebook op still ok` | **ล้ม** ok (7 → 10) | `already_submitted`, ยัง 7 · op grid ต่อมา ok |
| AC-09 | unit | O › `AC-09 ฉ5 … removed — pending 1 → 0, failed 0` · `BR-07 example: 3 queued` · `AC-09: a gradebook op … still goes through` | **ล้ม** failedAll มี 1 รายการ reason `already_submitted` / failedCount 1 / op grid ถูกกั้น (`post` ถูกเรียก 1 ครั้งแทน 2) | ออกจากคิวเงียบ ๆ · failed 0 · failedPairKeys 0 · op ต่อไปส่งได้ |
| AC-10 | API | A › `AC-10: the same opId sent twice` | **ล้ม** ครั้งแรกได้ ok | `already_submitted` ทั้งสองครั้ง · audit 0 |
| AC-11 | API | A › `AC-11: R1 checked first but writes last (gateBatch)` | **ล้ม** R1 ok ทับค่าของ R2 | R1 `already_submitted` · ช่อง = R2 · audit ของ ข `["create"]` |
| AC-11 | API | A › `[guard] AC-11: sent at once` | ผ่าน (`['ok','superseded']`) | หนึ่ง ok อีกหนึ่ง `already_submitted` หรือ `superseded` (ลำดับมาถึงไม่ควบคุม — BR-06 ให้ superseded มาก่อน) · audit 1 |
| AC-12 | unit | S › `AC-12 (full/later/type): card + sound = a local repeat scan` (3) · `AC-12 (type): the score pad … closes` · `AC-12 (later): … not รอตรวจ` | **ล้ม** effSub = 10 / null แทน 7 · แป้นคะแนนยังเปิด | ช่อง = 7 · การ์ด `ส่งไปแล้ว — ไม่บันทึกซ้ำ` เท่ากับการ์ดสแกนซ้ำในเครื่อง (`toEqual`) · เสียง dup ไม่ใช่ err · แป้นปิด · ไม่มี "ส่งไม่สำเร็จ" |
| AC-12 | unit | O › `[guard] AC-12 plumbing: listener gets the answer` | ผ่าน | ผ่าน |
| AC-12 | เบราว์เซอร์ | B › pages.json `scan-full-stale`, `scan-later-stale`, `scan-type-stale` × 4 อุปกรณ์ | ก่อนแก้: การ์ดสำเร็จ 10/10 หรือ "รับงานแล้ว" (บั๊ก) | การ์ด "ส่งไปแล้ว — ไม่บันทึกซ้ำ" 7/10 ชื่อยาวไม่ล้น · ผังเลขที่ 4 = 7 · รายการล่าสุดไม่มี 10/10 ของการสแกนนี้ · ไม่มี "ส่งไม่สำเร็จ" |
| AC-13 | API | A › `AC-13: one request [ก, ข, ค]` | **ล้ม** `['ok','ok','ok']` | `['already_submitted','ok','ok']` · opId ตรงลำดับ · ข/ค audit create |
| AC-14 | API | A › `AC-14: an old app's request (no dataEpoch, no intent)` | **ล้ม** ok | 200 · keys = `opId, result, submission` เท่านั้น · ช่องเดิม |
| AC-14 | API | A › `[guard] AC-14: GET submissions old shape` + ชุดเดิม `/bulk`, `/bulk-undo` | ผ่าน | ผ่าน |
| AC-14 | เบราว์เซอร์ | B › build ของ main 18759a2 (แอปเก่า) + worker ใหม่ บน fixture (ดู §6) | ทำไม่ได้ก่อนแก้ (ยังไม่มี worker ใหม่) | แอปเก่าไม่ค้าง/ไม่ error · "ส่งไม่สำเร็จ" 1 รายการเหตุผล `already_submitted` · server ยัง 7 |

### Test cases (TC-xx ตามแม่แบบ — แถวเดียวกับตารางบน แยกเป็น ID ให้ trace-check ตามได้)

| TC | AC | ขั้นตอน | ข้อมูล | ผลที่คาด (คำนวณจาก BR ก่อนดูโค้ด) | วิธี (ไฟล์ › เทสต์) |
|---|---|---|---|---|---|
| TC-01 | AC-01 | ก = 7 จากสมุด (grid T0) → รอบ R2 ส่งรับงาน hid/camera/manual score 10 เวลา T0+20s | a1 เต็ม 10, ก = st1 | `already_submitted` + submission.score 7 · 9 ฟิลด์เท่าเดิม · audit ของ op = 0 (E3) | auto · A › `AC-01 ฉ1 … R2 hid/camera/manual score 10` (3 ข้อ, ล้มก่อนแก้) |
| TC-02 | AC-02 | ก = 7 → R2 โหมดทีหลัง hid null · ฉ6: R1 รับ ก → สมุด 8 → R2 เต็ม/ทีหลัง | ก = st1 | `already_submitted` · ยัง 7 / 8 ไม่เป็น null | auto · A › `AC-02 ฉ2 …` · `AC-02 ฉ6 …` (ล้มก่อนแก้) |
| TC-03 | AC-02 | BR-04: ก งาน1 = 7, งาน2 = 8 → สแกนงาน1 ข้อมูลเก่า โหมดเต็ม / ทีหลัง / ทั้งสอง | a1, a2 เต็ม 10 | 15/20 = 75% (main: 18/20 = 90% และ 8/10 = 80%) (E1, E2) | auto · A › `BR-04 …` (3 ข้อ, ล้มก่อนแก้) |
| TC-04 | AC-03 | กด "ทั้งห้องส่งแล้ว" (ข null, bulk) → R2 เต็ม hid 10 · + "ให้เต็มทั้งห้อง" → R2 ทีหลัง hid null | ข = st2 | `already_submitted` · score/submitted_at/late = ตอนกดปุ่ม | auto · A › `AC-03 ฉ4 …` (2 ข้อ, ล้มก่อนแก้) |
| TC-05 | AC-04 | ค ว่าง → R1 [hid null, manual 8] คำขอเดียว และแยก 2 คำขอ | ค = st3 | ok, ok · ค = 8 · submitted_at = op รับงาน · audit create+update (E4) | auto · A › `[guard] AC-04 …` (2 ข้อ) |
| TC-06 | AC-04 | BR-02: R1 รับ ค → สมุด 5 → R1 พิมพ์ 8 · R1 สแกน ค ซ้ำหลังมี 8 · R1 รับซ้ำไม่มีคะแนน | ค = st3 | `already_submitted` ช่องเดิม (E5) | auto · A › `BR-02 (1)`, `BR-02 (2)`, `BR-02 (3)` (ล้มก่อนแก้) |
| TC-07 | AC-05 | ก = 7 → R2 ทีละคน hid null แล้ว manual 6 (แยกคำขอ และคำขอเดียว) | ก = st1 | ทั้งสอง `already_submitted` · ยัง 7 | auto · A › `AC-05 ฉ3 …` (2 ข้อ, ล้มก่อนแก้) |
| TC-08 | AC-06 | ก = 10 จาก R1 → grid 7 ใหม่กว่า · void จากผังเลขที่ · full-score/clear/undo | ก = st1 | grid ok 7 submitted_at/late เดิม audit update 1 · void/ปุ่มทั้งห้อง/ย้อนกลับเหมือนเดิม (E6) | auto · A › `[guard] AC-06 …` (3 ข้อ) + ชุดเดิม server-intent/submissions/race-r1 |
| TC-09 | AC-07 | ช่อง ไม่มีแถว / void / excused → hid 10 | ก = st1 | ok ทั้ง 3 · void: submitted_at = เวลาสแกนใหม่ · excused → submitted 10 (C-06 ไม่เปลี่ยน) (E7) | auto · A › `[guard] AC-07 (1)(2)(3)` |
| TC-10 | AC-08 | ก = 7 → opId เคยบันทึก / dataEpoch เก่า / ปิดรับ / fullScoreAtScan ไม่ตรง / เวลาเก่ากว่า | ก = st1 | `duplicate`, `epoch_changed`, `assignment_closed`, `full_score_changed`, `superseded` · ช่องเดิม | auto · A › `[guard] AC-08 (1)…(5)` |
| TC-11 | AC-09 | ฉ5 API: op คิว 09:05 มาถึงหลัง grid 09:00 → op grid ต่อมา | ก = st1 | `already_submitted` ยัง 7 · grid ต่อมา ok | auto · A › `AC-09 ฉ5 …` (ล้มก่อนแก้) |
| TC-12 | AC-09 | outbox: คำตอบ `already_submitted` → ออกจากคิว · 3 รายการ · op grid ช่องเดิมต่อมา | mock api.post | รอส่ง 1→0 · ส่งไม่สำเร็จ 0 · failedPairKeys 0 · op ต่อไปถูกส่ง (E8) | auto · O › `AC-09 ฉ5 …`, `BR-07 example …`, `AC-09: a gradebook op …` (ล้มก่อนแก้) |
| TC-13 | AC-09 | เบราว์เซอร์ออฟไลน์: ตัดเน็ต → สแกน → อีกเครื่องใส่ 7 → reload → ต่อเน็ต | fixture asg_gb_13 เลขที่ 4 | รอส่ง 1→0 · ส่งไม่สำเร็จ 0 · ผังเลขที่ 4 = 7 | browser · เฟส 4 (§5, ต้องมีสคริปต์ e2e) |
| TC-14 | AC-10 | op X ได้ `already_submitted` → ส่ง X ซ้ำ opId เดิม | ก = st1 | `already_submitted` ทั้งสองครั้ง · audit 0 | auto · A › `AC-10 …` (ล้มก่อนแก้) |
| TC-15 | AC-11 | R1 (เต็ม 10, เวลาใหม่กว่า) ค้างก่อนเขียน (gateBatch) → R2 (ทีหลัง null) เขียนก่อน → ปล่อย R1 | ข = st2 | R1 `already_submitted` · ช่อง = R2 · audit `["create"]` | auto · A › `AC-11: R1 … gateBatch` (ล้มก่อนแก้) |
| TC-16 | AC-11 | R1, R2 ส่งพร้อมกัน (Promise.all) | ข = st2 | หนึ่ง ok อีกหนึ่ง `already_submitted`/`superseded` · audit 1 · ช่อง = ผู้ชนะ | auto · A › `[guard] AC-11: sent at once` |
| TC-17 | AC-12 | หน้าสแกนข้อมูลเก่า (ก ยังไม่ส่ง) → สแกน ก โหมดเต็ม/ทีหลัง/ทีละคน → คำตอบ `already_submitted` (7) | ชื่อยาว 30+ ตัวอักษร (สมมติ) | ช่อง = 7 · การ์ด "ส่งไปแล้ว — ไม่บันทึกซ้ำ" = การ์ดสแกนซ้ำในเครื่อง · เสียง dup · แป้นปิด · ไม่มี "ส่งไม่สำเร็จ" | auto · S › `AC-12 (full/later/type) …`, `AC-12 (type) pad closes`, `AC-12 (later) not รอตรวจ` (ล้มก่อนแก้) + O › `[guard] AC-12 plumbing` |
| TC-18 | AC-12 | ภาพ 4 อุปกรณ์: scan-full-stale, scan-later-stale, scan-type-stale (+ scan-type, scan-later เดิม) | pages.json ของ job, fixture layout | การ์ด 7/10 ชื่อยาวไม่ล้น · ผัง 4 = 7 · รายการล่าสุดไม่มี 10/10 · หน้าตาเดิม D29 | browser · `node scripts/shots.cjs --label before|after --job … --pages …` (เฟส 4) |
| TC-19 | AC-13 | ก = 7, ข/ค ว่าง → คำขอเดียว [ก, ข, ค] hid 10 | st1, st2, st3 | `['already_submitted','ok','ok']` · ข/ค audit create · ก เดิม (E9) | auto · A › `AC-13 …` (ล้มก่อนแก้) |
| TC-20 | AC-14 | request แอปเก่า (ไม่มี dataEpoch/intent) บนช่องที่ส่งแล้ว · GET submissions หลังจากนั้น | ก = st1 | 200 · keys `opId, result, submission` เท่านั้น · ช่องเดิม · GET รูปแบบเดิม | auto · A › `AC-14: an old app's request …` (ล้มก่อนแก้) + `[guard] AC-14: GET submissions …` |
| TC-22 | AC-07 | (Reviewer R-02, D-c01-02) ก = 7 จากสมุด (grid T0) → คำขอเดียว [void ก manual T0+10s, รับงาน ก hid 10 T0+20s] รอบ R2 | ก = st1 | ok, ok (ไม่ใช่ `already_submitted` — BR-06 ตัดสินตามสภาพที่ op ก่อนหน้าทิ้งไว้ → BR-05) · ก = submitted 10, method hid, scan_session R2, submitted_at = T0+20s · audit 1 แถว/op | auto · A › `[guard] AC-07 (2b) R-02 …` (กันถอยหลัง) |
| TC-21 | AC-14 | build ของ main 18759a2 + worker ใหม่ บน fixture → สแกนข้อมูลเก่า | fixture, `--assets <build เก่า>` | แอปไม่ค้าง · "ส่งไม่สำเร็จ" 1 รายการเหตุผล already_submitted · server ยัง 7 | browser · เฟส 4 (§6) |

นับ: ล้มก่อนแก้ — AC-01 3 · AC-02 2 (+BR-04 3) · AC-03 2 · BR-02 3 · AC-05 2 · AC-09 1+3 · AC-10 1 · AC-11 1 · AC-12 5 · AC-13 1 · AC-14 1 = **28** · [guard] 16

## 4. หลายเครื่อง (🔄 multi-device) ฉ1–ฉ4, ฉ6

ระดับ API จำลอง "สองเครื่อง" ด้วย scanSessionId ต่างกัน (R1/R2/`gb`) บน cookie เดียว (ครูคนเดียว) — server ตัดสินจากค่าในฐานข้อมูล ไม่ใช่จากเครื่อง

| ฉาก | เทสต์อัตโนมัติ | เบราว์เซอร์ (เฟส 4, fixture, สอง browser context = สองเครื่อง) |
|---|---|---|
| ฉ1 เต็ม | AC-01 ×3, BR-04 full | เครื่อง A หน้าสแกนโหมดเต็ม (โหลดแล้ว) → เครื่อง B สมุดคะแนนใส่เลขที่ 4 = 7 → A สแกน 4 → การ์ดส่งไปแล้ว 7/10 · B รีเฟรชยัง 7 |
| ฉ2 ทีหลัง | AC-02 ฉ2, BR-04 later | เหมือน ฉ1 โหมดรับงานก่อน → สมุดคะแนนยังเป็น 7 ไม่ใช่ "รอตรวจ" |
| ฉ3 ทีละคน | AC-05 ×2, S type ×2 | A โหมดกรอกทีละคน สแกน 4 → แป้นเปิดชั่วครู่แล้วปิดเมื่อคำตอบมา · ถ้าครูพิมพ์ 6 ก่อนคำตอบมา → ยัง 7 |
| ฉ4 ทั้งห้อง | AC-03 ×2 | B กด "ทั้งห้องส่งแล้ว" + "ให้เต็มทั้งห้อง" → A (ข้อมูลเก่า) สแกน → ยัง 10 |
| ฉ6 สองเครื่อง | AC-02 ฉ6, AC-11 (gate + พร้อมกัน) | มือถือรอบทีหลังรับ 4 → สมุดให้ 8 → iPad รอบเต็มสแกน 4 → ยัง 8 |

## 5. Offline-replay + opId idempotency (🔄 ฉ5) · atomicity

- API: AC-09 (คิวมาถึงทีหลัง) · AC-10 (opId เดิมส่งซ้ำ → `already_submitted` ซ้ำ, ไม่มี audit) · AC-08(1) [guard] opId ที่บันทึกแล้ว → `duplicate`
- unit outbox: ออกจากคิว/ไม่เข้า failed/ไม่กั้น op ต่อไป (O 3 ข้อ)
- เบราว์เซอร์ (เฟส 4): ตามแบบ `offline-e2e.cjs` — เครื่อง A โหลดหน้าสแกน → ตัดเน็ต (context.setOffline) → สแกน 4 (เข้าคิว, รอส่ง 1) → เครื่อง B ใส่ 4 = 7 → A reload ระหว่างออฟไลน์ (คิวต้องอยู่) → ต่อเน็ต → รอส่ง 1 → 0, "ส่งไม่สำเร็จ" 0, ผังเลขที่ 4 = 7, สมุดคะแนน 7 · ปิด/เปิดแอปก่อนต่อเน็ตด้วย · ต้องมีสคริปต์ใหม่หรือขยาย `offline-e2e.cjs` → **ขอ PM มอบ path** (QA เขียนได้เฉพาะ 3 ไฟล์เทสต์ + เอกสาร job)
- Atomicity / ไม่มี audit ค้าง: ทุกเทสต์ `already_submitted` ตรวจ `audit_logs WHERE op_id = ?` = 0 และ audit ของนักเรียนไม่เพิ่ม · AC-11 แบบ gate ตรวจว่าการตัดสินอยู่ใน transaction (ไม่ใช่ตรวจก่อนแล้วเขียนทีหลัง) · AC-13 ตรวจว่า op ที่ถูกปฏิเสธไม่ทำให้ op อื่นในคำขอเดียวกันหาย

## 6. แอปรุ่นเก่า (AC-14, BR-08)

1. API: request เดิม (ไม่มี dataEpoch/intent) ผ่าน schema · response ของผลใหม่มีแค่ `opId, result, submission` · ผลเดิมทุกชนิด + GET/bulk/bulk-undo ผ่านชุดเทสต์เดิม (regression)
2. เบราว์เซอร์ (เฟส 4): สร้าง build ของ main 18759a2 ไว้นอก working tree (เช่น `git archive 18759a2` → โฟลเดอร์ใน scratchpad → `npm ci; npm run build`) แล้วรัน fixture ด้วย worker ใหม่ + `--assets <build เก่า>` → สแกนแบบข้อมูลเก่า → คาด: แอปไม่ค้าง, "ส่งไม่สำเร็จ" 1 รายการ เหตุผล already_submitted, ช่องที่ server ยัง 7, กดทิ้งได้ · ไม่ใช้ `git checkout` (ห้ามสลับ branch)

## 7. กรณี excused ต้องไม่เปลี่ยน (C-06 นอกขอบเขต)

A › `[guard] AC-07 (3)`: excused + hid 10 → ok, submitted 10 (พฤติกรรมเดิม) · ถ้า Dev ทำให้ excused ได้ `already_submitted` หรือถูกบล็อก = บั๊ก (ผิด D33/ขอบเขต) · ปุ่มทั้งห้องไม่แตะ excused: ชุดเดิม `server-intent.test.ts` BR-07

## 8. 🖥 ภาพหน้าจอ (pages.json ของ job)

`docs/team/jobs/2026-11-02-integrity-c01/pages.json` — 5 หน้า × 4 อุปกรณ์ (iPad ตั้ง 820×1180, iPad นอน 1180×820, คอม 1536×729, มือถือ 390×844) = 20 ภาพ

| หน้า | โหมด | สิ่งที่ภาพต้องแสดง (after) |
|---|---|---|
| `scan-full-stale` | ให้คะแนนเต็ม | การ์ดเตือน "ส่งไปแล้ว — ไม่บันทึกซ้ำ" ชื่อยาว (เลขที่ 4) + 7/10 · ช่อง 4 สีส่งแล้ว |
| `scan-later-stale` | รับงานก่อน | การ์ดเดียวกัน 7/10 · ช่อง 4 ไม่เป็น "รอตรวจ" |
| `scan-type-stale` | กรอกทีละคน | แป้นคะแนนปิด · การ์ดเดียวกัน |
| `scan-type`, `scan-later` | (คัดลอกจาก docs/team/pages.json) | หน้าตาเดิม D29 ไม่เปลี่ยน |

Fixture ที่ต้องมี (มีอยู่แล้วใน `fixture-server.cjs` layout:true ซึ่ง shots.cjs ใช้เป็นค่าเริ่มต้น): งาน `asg_gb_13` "ใบงาน 6 สมการ" เต็ม 10 ห้อง ป.6/1 (`cls_61`) 44 คน · เลขที่ 4 ชื่อยาว 40+ ตัวอักษร (`กมลวรรณชนกพรนภสรอร วงศสกลนครพนมบรรพตชยกรณ`) · ข้อมูลสมมติทั้งหมด ไม่มีข้อมูลจริง
setup ของแต่ละหน้าทำซ้ำได้ทุกครั้งที่โหลด: (1) API ยกเลิกการส่งของเลขที่ 4 (void) (2) เริ่มรอบ (หน้าจอเห็น 4 ยังไม่ส่ง) (3) API ใส่ 4 = 7 แบบสมุดคะแนน (เครื่องนี้ไม่รู้) (4) พิมพ์ 4 + Enter ในช่องรหัส → รอการ์ด "ส่งไปแล้ว" ≤ 6 วิ
ยังไม่ได้รัน shots (ต้อง `npm run build` + browser) — before ถ่ายได้ทันทีที่ PM สั่ง, after หลัง Dev แก้

## 9. หลักฐานที่จะบันทึก (หลังมีโค้ดแก้เท่านั้น — ตอนนี้ยังไม่เรียก evidence.mjs)

| check | kind | AC | จาก |
|---|---|---|---|
| Q-01 | regression (mandatory) | ทั้งหมด | `npm test` เทียบ 86 ไฟล์เดิมผ่าน + 3 ไฟล์ใหม่ผ่าน · `npm run typecheck` |
| Q-02 | expected-from-br (💰) | AC-01, AC-02, AC-03 | §1 E1–E9 = ผลจริงหลังแก้ |
| Q-03 | multi-device (🔄) | AC-01..03, AC-05, AC-11 | §4 API + เบราว์เซอร์สอง context |
| Q-04 | offline-replay (🔄) | AC-09, AC-10 | §5 API + outbox + เบราว์เซอร์ออฟไลน์ |
| Q-05 | reconciliation (🗑) | AC-01, AC-13 | จำนวนแถว submissions/audit ก่อน-หลัง (op ที่ปฏิเสธ = 0 แถวใหม่) — dry-run/restore ไม่เกี่ยว (ไม่มี migration/ลบข้อมูล) → PM พิจารณา N/A ใน brief |
| Q-06 | visual-before-after (🖥) | AC-12 | shots before/after + visual-check.json + sheet PASS |
| Q-07 | atomicity / concurrency / idempotency (เสริม) | AC-10, AC-11, AC-13 | gate test + opId ซ้ำ |

## 10. ช่องว่าง / ความเสี่ยง / คำถาม

1. **สัญญายังไม่ล็อก**: เทสต์ใช้ชื่อผล `already_submitted` และรูป `{opId, result, submission}` ตาม requirements (BR-08) — ถ้า Tech Lead ออก EP-xx ต่างไป (ชื่อ/ฟิลด์) QA จะปรับเทสต์ ไม่ให้ Dev แก้เทสต์เอง · AC-14 ตรวจ keys แบบตรงตัว
2. **BR-02 (3)** (รอบเดียวกันส่ง "รับงาน" ไม่มีคะแนนซ้ำ → `already_submitted`) อนุมานจาก BR-02 ข้อ (3) "op มีคะแนน" — ถ้า Tech Lead ตีความต่าง ต้องยืนยันกับ SA
3. **AC-12 ภาพ/ข้อความ**: เทสต์ S ใช้ `toEqual` กับการ์ดสแกนซ้ำในเครื่อง — ถ้า Designer เพิ่มข้อความใหม่ ต้องเปิด Gate V (requirements สมมติฐานข้อ 3)
4. **รายการล่าสุด (sc-recent) ไม่แสดง 10/10**: ยังไม่มีเทสต์อัตโนมัติ (สัญญาณ `recent` ไม่ export ใน `__scan`) → ตรวจในภาพ/เบราว์เซอร์
5. **e2e ออฟไลน์/สองเครื่อง/แอปเก่า**: ต้องมีสคริปต์ใหม่ (นอกขอบเขตเขียนของ QA ตอนนี้) — ขอ PM มอบ path เช่น `scripts/c01-e2e.cjs` หรือทำมือผ่าน Browser pane ในเฟส 4
6. เทสต์ใช้เวลาจริง (`Date.now()` − ค่าคงที่) ไม่ใช้ 09:00 ตรงตัว เพราะ server กันเวลาอนาคต — ลำดับเวลาเหมือนฉากทุกประการ
7. 28 เทสต์ที่ล้มอยู่ใน branch นี้ทำให้ `npm test` แดงจนกว่า Dev แก้เสร็จ — ตั้งใจ (TDD) ห้าม skip

## 11. ผลรันที่ main (ล้มก่อนแก้) — 2 พ.ย. 2569 13:4x

```
$ npx vitest run test/api/c01-no-overwrite.test.ts test/unit/c01-outbox-already-submitted.test.ts test/unit/c01-scan-already-submitted.test.ts
 × AC-01 ฉ1 … R2 hid|camera|manual score 10 …            expected 'ok' to be 'already_submitted'
 × AC-02 ฉ2 … later-mode hid score null …                expected 'ok' to be 'already_submitted'
 × AC-02 ฉ6 … R2 full-mode hid 10 …                      R2 full: expected 'ok' to be 'already_submitted'
 × AC-03 ฉ4 … (2 tests)                                  expected 'ok' to be 'already_submitted'
 × BR-04 … full-mode (bug on main: 18/20 = 90 %)         expected { got: 18, full: 20 } to deeply equal { got: 15, full: 20 }
 × BR-04 … later-mode (bug on main: 8/10 = 80 %)         expected { got: 8, full: 10 } to deeply equal { got: 15, full: 20 }
 × BR-04 … full AND later                                expected { got: 8, full: 10 } to deeply equal { got: 15, full: 20 }
 × AC-05 ฉ3 … two requests / ONE request                 expected 'ok' … / expected [ 'ok', 'ok' ] to deeply equal [ 'already_submitted', … ]
 × BR-02 (1) (2) (3)                                     expected 'ok' to be 'already_submitted'
 × AC-09 ฉ5 (API)                                        expected 'ok' to be 'already_submitted'
 × AC-10                                                 expected 'ok' to be 'already_submitted'
 × AC-11 (gateBatch)                                     expected 'ok' to be 'already_submitted'
 × AC-13                                                 expected [ 'ok', 'ok', 'ok' ] to deeply equal [ 'already_submitted', 'ok', 'ok' ]
 × AC-14 (API)                                           expected 'ok' to be 'already_submitted'
 × O AC-09 ฉ5 removed …                                  failedAll = [{ opId: 'c01op1', reason: 'already_submitted', … }] expected []
 × O BR-07 example 3 queued                              failedCount: expected 1 to be +0
 × O AC-09 gradebook op still goes through               post called 1 time, expected 2 (blocked_by_earlier_failure)
 × S AC-12 (full)                                        effSub score 10, expected 7
 × S AC-12 (later) / (type)                              effSub score null, expected 7
 × S AC-12 (type) pad closes                             <section class="card sc-pad"> still rendered
 × S AC-12 (later) not รอตรวจ                            expected null to be 7
 Tests  28 failed | 16 passed (44)

$ npx vitest run      (ทั้งชุด)
 Test Files  3 failed | 86 passed (89)
      Tests  28 failed | 1040 passed (1068)      ← ล้มเฉพาะ 3 ไฟล์ใหม่

$ npm run typecheck   → PASS (tsc --noEmit ไม่มี error รวม 3 ไฟล์ใหม่)
```

# Code review: ย้ายการตรวจ "ปีของห้อง" และ "เลขที่ซ้ำ" เข้าไปในธุรกรรมเดียวกับการเขียน (M1-03)

โดย Code Reviewer · 2026-10-30 · ช่วง diff: `main (92fc2c9)..HEAD` + ที่ยังไม่ commit (`worker/routes/assignments.ts`, `worker/routes/students.ts`, `test/api/guards-in-transaction.test.ts` ใหม่) · รอบแก้ (Verify) 1/3 (รอบ 2 ต่อท้ายไฟล์)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่าน

ต้องแก้ 0 ข้อ · แนะนำ 5 ข้อ (ควรแก้ 1 · เสนอ 4)

guard ทั้ง 3 จุดตรวจกติกาเดียวกับการตรวจก่อนเขียน วางก่อนคำสั่งเขียนใน batch เดียวกัน และ catch อ่านข้อมูลสดแล้วตอบรหัสเดิม ไม่พบ false positive ในกรณีที่ถูกต้อง ข้อ "ควรแก้" ข้อเดียว (R-01) เป็นช่องโหว่ของกติกาที่มีอยู่ก่อนงานนี้ ไม่ได้เกิดจาก diff นี้

## คำตอบประเด็นที่ PM ถาม

### 1. guard SQL ตรวจกติกาเดียวกับการตรวจก่อนเขียนไหม — ตรงกัน

| จุด | ตรวจก่อนเขียน (TS/SQL) | guard ใน batch | ผล |
|---|---|---|---|
| ปีของห้อง `assignments.ts:74-81` / `:83-84,121` | `toCheck` = ห้องที่เพิ่งผูก หรือทุกห้องเมื่อย้ายเทอม · ข้ามห้อง `year == null` · เทียบ `term.year` | `yearChecked` ชุดเดียวกัน (`:77`) · `year IS NOT NULL AND year != (SELECT year FROM terms WHERE id = ?2)` อ่านปีเทอมสด | ตรง · ไม่ใส่ guard เมื่อ `yearChecked` ว่าง (งานไม่มีเทอม / เทอมเดิมไม่เพิ่มห้อง) เหมือนเดิม |
| เลขที่ซ้ำ `students.ts:75-84` / `:95` | SQL `numberHeld` เดียวกันทั้งสองที่ | ใส่เฉพาะเมื่อ `checksNumber` (nextStatus = active และมี class_id + number) | ตรง (ใช้สตริง SQL ตัวเดียวกัน) |
| รหัสซ้ำ `students.ts:59-63` | `code = ? AND id != ?` | UNIQUE(code) ของตาราง (`ON CONFLICT(id)` ไม่ครอบ code จึงล้มทั้ง batch) | ตรง |
| นำเข้า `students.ts:158-170` / `:177-184` | `numberProblems`: held active ในห้อง, `importedCodes` = รหัสในรายการที่**มี**เลขที่ | `numberClashGuard`: `importedCodes` นิยามเดียวกัน, `status='active'`, `number IN nums` | ตรง |

กรณี CASE ใน upsert (`students.ts:283`) — แถวในรายการที่ไม่มีเลขที่และเด็กอยู่ห้องเดิมจะคงเลขเดิม: ทั้ง `numberProblems` และ guard นับเด็กคนนั้นเป็น "นอกรายการ" (ไม่อยู่ใน `importedCodes`) จึงครอบกรณีนี้ ยืนยันด้วยการรัน SQL ของ guard บน schema จริง (node:sqlite): "102 ไม่มีเลขที่คงเลข 2 + 101 ขอเลข 2" ทำให้ batch ถูกยกเลิก · "สลับเลขที่ในรายการ" และ "นำเข้าซ้ำเลขเดิม" ผ่าน · ถ้าอีกเครื่องเปลี่ยนเลขของเด็กไม่มีเลขในรายการให้ไปชนเลขในรายการระหว่างรอ guard จะจับได้ (อ่านแถวสด)

ข้อยกเว้น: เด็กที่**ไม่ active** (moved/inactive) ในห้องเดียวกันที่ถูกนำเข้าโดยไม่มีเลขที่จะกลับมา active พร้อมเลขเดิม ทั้งการตรวจก่อนเขียนและ guard มองไม่เห็นกรณีนี้ (ดู R-01 — มีอยู่ก่อนงานนี้)

### 2. ลำดับใน catch และการกลืน error — ถูกต้อง

- students (`:107-116`): ApiError (epoch_changed) โยนต่อทันที → code → history → number ตรงกับลำดับตรวจก่อนเขียน (`:63`, `:69-70`, `:81-84`) · ถ้าไม่เข้าเงื่อนไขใด ๆ จะ `throw e` (เป็น 500 ตามเดิม) ไม่ตอบ 409/422 แทน error ที่ไม่รู้จัก
- import (`:300-317`): ApiError → code_taken (รหัสของแถวใหม่ AC-07) → number_conflict → history → `throw e` · `dupNumbers` เปลี่ยนไม่ได้หลังตรวจ จึงว่างใน catch ตามคาด
- assignments (`:125-133`): ApiError → class_year_mismatch → score_over_full → `throw e` · ลำดับกลับด้านจากการตรวจก่อนเขียน (score ก่อน year ที่ `:59-62` แล้ว `:74-81`) ดู R-03 (ต่ำ — ทั้งสองรหัสเป็นการปฏิเสธที่ถูก ไม่มีอะไรถูกเขียน)
- การตอบรหัสจาก "สภาพสด" เมื่อ batch ล้มด้วยเหตุอื่น (เช่น qr_token ชน) จะตอบรหัสที่ถูกต้องตามความจริงเท่านั้น เพราะทุกเงื่อนไขใน catch ก็จะทำให้การเขียนนั้นผิดกติกาอยู่แล้ว

### 3. false positive — ไม่พบ

- แก้นักเรียนคนเดิมไม่เปลี่ยนเลขที่: `id != ?3` ตัดตัวเอง (`:75`) · test AC-05 `st1` ผ่าน
- นำเข้าซ้ำห้องเดิมที่เด็กคงเลขเดิม: ถ้าไม่มีเลขในรายการเลย `nums` ว่าง → ไม่ใส่ guard (`:179`) · ถ้ามีเลข เด็กในรายการที่มีเลขถูกตัดออกด้วย `importedCodes` · test import-preview `:73` และ AC-05 ผ่าน
- งานที่ไม่มีเทอม: `term` = null → `yearChecked` ว่าง → ไม่มี guard (dashboard/reports test ใช้ `term_id: null` ผ่าน)
- ห้อง year NULL: SQL `year IS NOT NULL` ผ่าน (ยืนยันด้วย node:sqlite: `[c0]`, `[c1,c0]` ไม่ abort)
- เทอมที่ id ไม่มีอยู่: subquery คืน NULL → ไม่ abort (เท่ากับการตรวจก่อนเขียนที่ข้ามเมื่อ `term` = null)
- status ≠ active / ไม่มี class_id หรือ number: `checksNumber` = false ไม่ใส่ guard

### 4. performance — อยู่ในงบ แต่ไม่ได้ใช้ idx_students_class อย่างที่ comment บอก (ดู R-02)

`EXPLAIN QUERY PLAN` บน schema จริง (SQLite 3.51, ไม่มี sqlite_stat1 เหมือนฐานทดสอบ):
- year guard: `SEARCH classes USING INDEX sqlite_autoindex_classes_1 (id=?)` + `SEARCH terms ... (id=?)` — ใช้ PK
- number guard / import guard: `SEARCH students USING INDEX idx_students_status (status=?)` — อ่านนักเรียน active ทั้งโรงเรียน ไม่ใช่ (class_id, number) · หลัง `ANALYZE` เปลี่ยนเป็น `idx_students_class (class_id=? AND number=?)`
- การตรวจก่อนเขียนเดิมใช้ SQL เดียวกันจึงมีแผนเดียวกันมาก่อนแล้ว — งานนี้เพิ่มการอ่านแบบนี้อีก 1 ครั้งต่อการบันทึก
- `volume.test.ts` 7/7 ผ่าน (import 40 คน งบอ่าน 1,500 แถว) — ที่ 200 คนต้นทุนเพิ่มประมาณ 200 แถวต่อคำขอ เล็กมากเมื่อเทียบงบ D1 Free 5 ล้านแถว/วัน

### 5. test และ mutation — สมเหตุสมผล

- แต่ละ test แยกเหตุล้มให้เหลือ guard เดียว: AC-03 ใช้เลขที่ต่างกัน (8/9) จึงล้มด้วย UNIQUE(code) อย่างเดียว · AC-07 เด็กอีกเครื่องอยู่ c2 เลข 5 จึงไม่ชน number guard · AC-02 (edit) ตั้ง st1 เป็น 7 ตรง ๆ · AC-04 ตรวจว่าเด็ก 101 ในรายการไม่ถูกแก้และไม่มี audit method=import (พิสูจน์ว่าไม่มีอะไรเขียนครึ่งเดียว)
- M1–M8 ตรงกับจุดที่เพิ่ม: ถอด guard ใน batch → 200 (ข้อมูลผิดลงฐาน) · ถอดการอ่านซ้ำใน catch → 500 · หลักฐานใน `evidence/mutation.txt` สอดคล้อง
- ช่องที่ test ยังไม่ครอบ ดู R-04

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

- **R-01 นำเข้าทำให้เด็กที่เคยออก (moved/inactive) กลับมา active พร้อมเลขที่เดิมที่คนอื่นใช้อยู่ได้ — data** · `worker/routes/students.ts:162`, `:181-182`, `:283`
  - ปัญหา: CASE ใน upsert (`:283`) คงเลขที่เดิมเมื่อแถวในรายการไม่มีเลขและเด็กอยู่ห้องเดิม **โดยไม่ดู status** แล้วตั้ง `status='active'` แต่ `numberProblems` (`:162`) และ `numberClashGuard` (`:182`) ดูเฉพาะแถวที่ `status = 'active'` อยู่แล้ว
  - สถานการณ์ที่พัง: ห้อง c1 · เด็ก 103 status moved เลขที่ 7 (ยังคงเลขเดิมไว้) · ครูให้เลขที่ 7 กับเด็กใหม่ 601 (active) · ต่อมา 103 กลับมา ครูนำเข้ารายชื่อจาก Excel ที่ไม่มีเลขที่ซึ่งมี 103 → 103 กลับเป็น active เลขที่ 7 ซ้ำกับ 601 ไม่มีการเตือน (ยืนยัน guard ด้วย node:sqlite: "reactivate moved 103 (keeps 7) + new kid 7" ผ่าน ไม่ abort)
  - ไม่ได้เกิดจาก diff นี้ (การตรวจก่อนเขียนเดิมมีช่องเดียวกัน และไม่เกี่ยวกับ race) จึงไม่บล็อกงานนี้ · ทางแก้ที่เสนอ (งานแยก): ใน CASE คงเลขเดิมเฉพาะเมื่อ `students.status = 'active'` (ถ้าเพิ่งกลับมาให้ NULL) หรือให้ `numberProblems`/guard ใช้ "เลขที่ที่จะเป็นหลังเขียน" ของเด็กในรายการ (รวมเลขที่คงไว้) แทนเลขที่ส่งมาเท่านั้น
  - สถานะ: เปิด (เสนอเป็นงานแยกใน program)

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- **R-02 guard เลขที่ใช้ idx_students_status ไม่ใช่ idx_students_class เมื่อฐานไม่มีสถิติ — performance** · `worker/routes/students.ts:75`, `:95`, `:181-182` (comment `:73`, `:175` อ้างว่าใช้ idx_students_class) — ไม่มี sqlite_stat1 (ฐานทดสอบไม่เคย ANALYZE; ไม่แน่ใจว่า D1 production มีสถิติหรือไม่ เพราะไม่ได้ตรวจฐานจริง) planner เลือก `status = 'active'` ที่เป็นค่าคงที่ → อ่าน active ทั้งโรงเรียนต่อการบันทึกหนึ่งครั้ง (ประมาณ 200–1,400 แถว) ยังอยู่ในงบ ทางแก้ถูก ๆ: เขียน `+status = 'active'` (ปิดการใช้ index ของ status) หรือ `INDEXED BY idx_students_class` ทั้งใน guard และการตรวจก่อนเขียน แล้วแก้ comment ให้ตรงความจริง
- **R-03 ลำดับใน catch ของ assignments กลับด้านจากการตรวจก่อนเขียน** · `worker/routes/assignments.ts:127-132` เทียบ `:59-62`, `:74-81` — ถ้าหลังแพ้ race มีทั้งคะแนนเกินคะแนนเต็มใหม่และห้องผิดปี: คำขอธรรมดาได้ `score_over_full` แต่คำขอที่แพ้ race ได้ `class_year_mismatch` · ไม่มีข้อมูลผิด เสนอสลับให้ score ก่อน year เพื่อให้หลัก "ลำดับเดียวกับการตรวจก่อนเขียน" เป็นจริงทุกเส้นทาง
- **R-04 test ยังไม่ครอบบางกรณีของ guard ใหม่** · `test/api/guards-in-transaction.test.ts` — (ก) race ที่เด็กในรายการ**ไม่มีเลขที่**ถูกอีกเครื่องเปลี่ยนเลขให้ชนเลขในรายการ (ทางเดียวที่ `importedCodes` ทำงานต่างจาก "รหัสทั้งหมดในรายการ"; ถ้ามีคนเปลี่ยน `importedCodes` เป็นรหัสทั้งหมด test ชุดนี้จะไม่ล้ม) (ข) ห้อง year NULL ผ่าน year guard (ไม่มี test ไหนในโปรเจกต์ใช้ห้อง year NULL กับ POST /api/assignments) (ค) นักเรียน status moved ไม่ถูก number guard · ผลจากการอ่านโค้ดและรัน SQL ถูกต้องทั้ง 3 กรณี แต่ไม่มี test กันถอยหลัง
- **R-05 `prevRows`/`existing` ของ assignments อ่านก่อน batch** · `worker/routes/assignments.ts:42-48`, `:75-77` — ชุดห้องที่ต้องตรวจคำนวณจากข้อมูลที่อ่านก่อน ถ้าอีกเครื่องผูกห้องหรือย้ายเทอมของงานเดียวกันระหว่างนั้น ชุดที่ตรวจอาจไม่ตรงกับชุดที่ควรตรวจ ณ เวลาเขียน (dev บันทึกไว้แล้ว) · ทุกคำขอเขียนคู่ (term, class_ids) ทั้งชุดแทนที่ของเดิม และคู่นั้นผ่านกติกาเมื่อเทียบกับสภาพที่อ่าน จึงเป็นช่องแคบมาก รับเป็น known issue ได้

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร (diff ไม่มีค่า key/token)
- [x] ตรวจ input ฝั่ง server ทุกจุด (zod schema เดิม · guard ใหม่รับค่าผ่าน bind/`json_each` เท่านั้น)
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล (`requireAuth` เดิมครอบ `/api/students*`, `/api/assignments*` · diff ไม่เพิ่ม endpoint)
- [x] ป้องกัน injection (SQL/NoSQL/command), XSS, CSRF — SQL ใหม่ทุกตัวใช้ placeholder (`?1..?3`) ไม่มีการต่อสตริงจากข้อมูลผู้ใช้ (`numberHeld`/`classesOffYear` เป็นค่าคงที่ที่ต่อเข้า `EXISTS (...)`)
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น — ข้อความ `number_taken`/`number_conflict` แสดงชื่อเด็กแบบเดิม · `code_taken` ของ import แสดงเฉพาะรหัสที่ผู้ใช้ส่งมาเอง
- [x] error ไม่เปิดเผยรายละเอียดภายใน — error ที่ไม่รู้จัก `throw e` ไปที่ handler กลางเหมือนเดิม
- [x] dependency ใหม่น่าเชื่อถือ — ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] เงิน: N/A (ไม่มีเงินในงานนี้)
- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำเมื่อกดซ้ำหรือ sync ซ้ำ — สองคำขอพร้อมกันได้ 1 แถว (AC-02/03/07) · D1 รัน batch ทีละก้อน guard จึงเห็นแถวของคำขอที่ชนะ
- [x] การเขียนหลายตารางอยู่ใน transaction — guard วางหน้า upsert/audit ใน batch เดียว · AC-01/04/07 ตรวจว่าไม่มี assignment/link/audit/นักเรียนครึ่งเดียว
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง — ไม่มีการลบใน diff
- [x] วันที่/timezone/พ.ศ. ถูกต้อง — year guard เทียบ พ.ศ. จาก `terms.year` สด · ห้อง year NULL ข้ามตามกติกาเดิม

Checklist data-integrity (🔄): atomicity ผ่าน (batch ล้มทั้งก้อน) · สองอุปกรณ์ผ่านตาม test gateBatch · idempotency/offline-replay ไม่อยู่ในขอบเขต diff นี้ (เส้นทาง sync ไม่ถูกแตะ)

## หลักฐานที่รัน (อ่านอย่างเดียว)

| คำสั่ง | ผล |
|---|---|
| `git diff main -- worker/routes/assignments.ts worker/routes/students.ts` + อ่าน `test/api/guards-in-transaction.test.ts` | อ่านครบทุกไฟล์ใน diff |
| `npx vitest run test/api/guards-in-transaction.test.ts test/api/volume.test.ts` | 2 ไฟล์ / 15 tests PASS |
| `EXPLAIN QUERY PLAN` ของ guard ทั้ง 3 บน migrations จริง (node:sqlite ในพื้นที่ชั่วคราว ไม่แตะฐานโปรเจกต์) | year guard ใช้ PK · number/import guard ใช้ idx_students_status เมื่อไม่มีสถิติ, ใช้ idx_students_class หลัง ANALYZE (R-02) |
| รัน SQL ของ guard กับข้อมูลจำลองบน schema จริง (node:sqlite) | year: NULL ผ่าน, ปีอื่น abort, เทอมไม่มี ผ่าน · import: นำเข้าซ้ำ/สลับเลข ผ่าน, เด็กไม่มีเลขคงเลขชน abort, เด็ก moved กลับมาเลขซ้ำ **ผ่าน** (R-01) |

---

## รอบ 2 — Verify รอบ 1 (2026-10-30)

ขอบเขต: diff ใหม่ใน `worker/routes/students.ts`, `worker/routes/assignments.ts`, `test/api/guards-in-transaction.test.ts` · dev-notes "T-01 (Verify รอบ 1)" · `evidence/explain-query-plan.txt` · การตัดสินของ PM (R-01 → AC-08, R-02 `+status`, R-03 ลำดับ catch, R-04 test) · รอบแก้ (Verify) 1/3

### สรุปรอบ 2: ผ่าน

ต้องแก้ 0 ข้อ · R-01..R-04 ยืนยันแล้ว · R-05 ค้างเป็น known issue ตามที่ PM รับ · ไม่พบข้อใหม่

### สถานะข้อเดิม

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| R-01 (AC-08) เลขที่หลังเขียน | ยืนยันแล้ว | `students.ts:164-179` (`numberProblems`), `:187-198` (`PASTE_NUMBERS_AFTER` + `numberClashGuard`) · ตัวอย่างเดิม "moved 103 คงเลข 7 + active 104 นอกรายการ" ตอนนี้ guard **ABORT** และ `numberProblems` ได้ clash=[7] (รอบ 1 guard ผ่าน) |
| R-02 `+status` | ยืนยันแล้ว | `students.ts:76`, `:167`, `:195` · แผน query ใช้ `idx_students_class` ทั้งมีและไม่มีสถิติ (ตารางด้านล่าง) · comment `:73-74`, `:162`, `:182-185` ตรงกับแผนจริงแล้ว |
| R-03 ลำดับ catch | ยืนยันแล้ว | `assignments.ts:126-133`: score_over_full → class_year_mismatch → `throw e` ตรงกับลำดับก่อนเขียน (`:59-62`, `:74-81`) |
| R-04 test | ยืนยันแล้ว | test ใหม่ `guards-in-transaction.test.ts:141-212`: AC-08 ×2, R-04 (ก) race ของเด็กไม่มีเลขที่ (ข) ห้อง year NULL (ค) นักเรียน moved · แต่ละตัวตรวจผลในฐานด้วย ไม่ได้ดูแค่ status |
| R-05 | known issue (PM รับ) | ไม่เปลี่ยน |

### (1) "เลขที่หลังเขียน" ตรงกับ CASE ใน upsert ทุกกรณี

CASE (`students.ts:297`): ถ้ามีเลขในรายการใช้เลขนั้น · ถ้าไม่มีและเด็กอยู่ห้องนี้อยู่แล้วใช้เลขเดิม (ไม่ดู status) · นอกนั้นเป็น NULL · แถวใหม่ใช้เลขในรายการหรือ NULL
- `numberProblems`/TS: `s.number ?? kept.get(code)` ซึ่ง `kept` มาจาก `class_id = ?1 AND number IS NOT NULL AND (active OR code ในรายการ)` จึงเป็นเลขเดิมในห้องนี้ของเด็กในรายการ status ใดก็ได้ — ตรงกัน
- guard: `COALESCE(เลขในรายการ, (SELECT number FROM students WHERE code = ? AND class_id = ?1))` — ตรงกัน และอ่านสดใน batch
- ชน = เลขหลังเขียนซ้ำกันในรายการ (GROUP BY/HAVING ↔ `dupNumbers`) หรือชนกับเด็ก **active** ที่ไม่อยู่ในรายการ (`code NOT IN` รายการทั้งหมด ↔ `!pasted.has`) — ตรงกัน · เด็กนอกรายการที่ไม่ active ไม่ถูกแตะโดยการนำเข้า จึงไม่นับ — ถูกต้อง

ยืนยันโดยรันจริงบน schema จาก migrations (node:sqlite ในพื้นที่ชั่วคราว): เทียบผล guard, `numberProblems` (พอร์ตจาก TS ตรงตามโค้ด) และ **ผลจริงหลังรัน upsert ที่มี CASE เดียวกัน** (นับ active เลขซ้ำในห้อง แล้ว rollback) — ตรงกันครบ 15/15 กรณี:

| กรณี (ห้อง c1) | guard | numberProblems | หลังเขียนจริง |
|---|---|---|---|
| R-01: moved 103 ไม่มีเลข (คง 7) · active 104 เลข 7 นอกรายการ | ABORT | clash 7 | ซ้ำ 7 |
| moved 103 + active 104 ทั้งคู่ไม่มีเลข | ABORT | dup 7 | ซ้ำ 7 |
| moved 103 ได้เลข 9 | ผ่าน | ok | ไม่ซ้ำ |
| นำเข้าซ้ำทั้งห้อง ไม่มีเลขที่ | ผ่าน | ok | ไม่ซ้ำ |
| นำเข้าซ้ำทั้งห้อง เลขเดิม | ผ่าน | ok | ไม่ซ้ำ |
| สลับเลข 1/2 ในรายการ | ผ่าน | ok | ไม่ซ้ำ |
| 102 ไม่มีเลข (คง 2) + 101 ขอ 2 | ABORT | dup 2 | ซ้ำ 2 |
| เด็กใหม่ขอ 2 (102 นอกรายการ) | ABORT | clash 2 | ซ้ำ 2 |
| 105 จากห้อง c2 ไม่มีเลข (→ NULL) | ผ่าน | ok | ไม่ซ้ำ |
| 105 จาก c2 ขอ 1 (101 นอกรายการ) | ABORT | clash 1 | ซ้ำ 1 |
| 105 จาก c2 ไม่มีเลข + เด็กใหม่ขอ 1 | ABORT | clash 1 | ซ้ำ 1 |
| inactive 106 ไม่มีเลข (คง 3) ไม่มีใครชน | ผ่าน | ok | ไม่ซ้ำ |
| inactive 106 ไม่มีเลข + เด็กใหม่ขอ 3 | ABORT | dup 3 | ซ้ำ 3 |
| inactive 106 ไม่อยู่ในรายการ + เด็กใหม่ขอ 3 | ผ่าน | ok | ไม่ซ้ำ |
| active 107 เลข NULL + เด็กใหม่ขอ 5 | ผ่าน | ok | ไม่ซ้ำ |

ไม่มี false positive ในการนำเข้าซ้ำปกติ (ไม่มีเลข / เลขเดิม / สลับเลข / ย้ายห้องแบบไม่มีเลข) · ทุกกรณีที่ ABORT คือกรณีที่ถ้าเขียนแล้วจะได้ active เลขซ้ำจริง

### (2) R-01 ปิดจริง

รันตัวอย่างเดิมของรอบ 1 ("reactivate moved 103 (keeps 7) + new kid 7") ซ้ำด้วย SQL ใหม่ → guard ABORT · `numberProblems` → dup 7 · ตรงกับ test `AC-08` สองตัวที่รันผ่าน

### (3) แผน query

| query | ไม่มีสถิติ | หลัง ANALYZE (40 ห้อง × 35 คน) |
|---|---|---|
| `numberHeld` (`:76`) | `idx_students_class (class_id=? AND number=?)` | เหมือนกัน |
| `numberProblems` (`:167`) | `idx_students_class (class_id=? AND number>?)` | เหมือนกัน |
| `numberClashGuard` (`:194-197`) | `s`: `idx_students_class (class_id=? AND number=?)` · `k`: `sqlite_autoindex_students_2 (code=?)` | เหมือนกัน |
| year guard (`assignments.ts:83-84`) | `sqlite_autoindex_classes_1 (id=?)` | `SCAN classes` |

ตรงกับ `evidence/explain-query-plan.txt`

### (4) ข้อสังเกตของ dev — เห็นด้วยทั้งสองข้อ

- แถวไม่มีเลขที่ที่ชนย้ายจาก `numberClashes` ไปเป็น `dupNumbers`: เห็นด้วย ข้อความใหม่ "เลขที่ซ้ำกันในรายการ" ตรงความจริงกว่า เพราะทั้งสองคนอยู่ในรายการ · รหัส/สถานะยังเป็น 422 `number_conflict` · หน้า preview รับ `dupNumbers` อยู่แล้ว
- year guard เป็น `SCAN classes` หลัง ANALYZE: เห็นด้วย ตารางห้องของครูหนึ่งคนมีหลักสิบแถว planner เลือก scan เพราะถูกกว่าตามสถิติ และไม่มีสถิติก็ใช้ PK · ไม่คุ้มที่จะบังคับ index

ข้อสังเกตเพิ่ม (ไม่ใช่ข้อแก้): ตอนนี้ guard ถูกใส่**ทุกครั้ง**แม้รายการไม่มีเลขที่เลย (เดิมข้ามเมื่อ `nums` ว่าง) — ถูกต้อง เพราะเลขเดิมที่คงไว้เปลี่ยนระหว่างตรวจกับเขียนได้ · ต้นทุนเป็นการค้นด้วย code/PK ต่อแถว volume ยังผ่าน

### หลักฐานรอบ 2

| คำสั่ง | ผล |
|---|---|
| `git diff -- worker/routes/students.ts worker/routes/assignments.ts` + อ่าน test ใหม่ `:141-212` | อ่านครบ |
| `npx vitest run test/api/guards-in-transaction.test.ts test/api/volume.test.ts test/api/import-preview.test.ts test/api/integrity-d.test.ts test/api/qa-m1-03.test.ts` | 5 ไฟล์ / 69 tests PASS |
| node:sqlite บน migrations จริง: guard × numberProblems × upsert จริง 15 กรณี | ตรงกัน 15/15 (ตารางข้อ 1) |
| node:sqlite `EXPLAIN QUERY PLAN` ไม่มีสถิติ / หลัง ANALYZE | ตารางข้อ 3 |

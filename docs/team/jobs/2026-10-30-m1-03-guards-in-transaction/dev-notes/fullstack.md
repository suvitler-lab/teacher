# Dev notes: Full-Stack · งาน `2026-10-30-m1-03-guards-in-transaction`

## T-01 ย้ายการตรวจปีของห้อง / เลขที่ซ้ำ / รหัสซ้ำ เข้าไปในธุรกรรมเดียวกับการเขียน — 2026-10-30

- ทำอะไร:
  - เขียน test race ก่อน (ใช้ `gateBatch` แบบ race-r1) → ล้ม 6/7 ก่อนแก้ (AC-01/02/04 ได้ 200 และข้อมูลผิดลงฐาน, AC-03 ได้ 500)
  - `POST /api/assignments`: เก็บรายการห้องที่ต้องตรวจปี (`yearChecked` = ห้องที่เพิ่งผูก หรือทุกห้องเมื่อย้ายเทอม — คำนวณใน TS เหมือนเดิม) แล้วใส่ `abortIf(EXISTS (classesOffYear))` ใน batch ต่อจาก guard คะแนนเต็ม · SQL ค้นห้องด้วย PK และอ่านปีของเทอมสด · ใน `catch` อ่านใหม่แล้วตอบ 422 `class_year_mismatch` ข้อความเดิม (ใช้ฟังก์ชัน `yearMismatch` ร่วมกับการตรวจก่อนเขียน)
  - `POST /api/students`: ใส่ `abortIf(EXISTS (numberHeld))` ใน batch เฉพาะเมื่อ status ถัดไปเป็น active และมี class_id+number (เงื่อนไขเดิม) · SQL ใช้ `class_id = ? AND number = ?` (index `idx_students_class`) · รหัสซ้ำ: ใน batch ใช้ UNIQUE(code) ของตารางเป็น guard (ไม่เพิ่ม SQL guard ซ้ำ) และใน `catch` ตรวจ `codeClash()` ใหม่ → 409 `code_taken` · ลำดับการตรวจใน catch เท่ากับก่อนเขียน: code → history → number
  - `POST /api/students/import`: เพิ่ม `numberClashGuard()` (กติกาเดียวกับ `numberProblems` ครึ่ง "ชนกับเด็ก active ที่ไม่อยู่ในรายการ" — ครึ่ง "ซ้ำในรายการ" เปลี่ยนไม่ได้หลังตรวจ) ใช้ `class_id = ? AND number IN (...)` · ใน `catch` เรียก `numberProblems` ใหม่ → 422 `number_conflict` รูปแบบเดิม (แยกการสร้างคำตอบเป็น `numberConflict()` ใช้ทั้งก่อนเขียนและใน catch)
  - ไม่แตะ audit (auditInsertStmt ยังอยู่ใน batch เดิม — batch ล้มทั้งก้อนจึงไม่มี audit), ไม่มี migration, ไม่เพิ่ม index, สัญญา API เดิม
- ไฟล์:
  - `worker/routes/assignments.ts` (เฉพาะ POST /api/assignments)
  - `worker/routes/students.ts` (POST /api/students, POST /api/students/import, helper ใหม่ `numberClashGuard`/`numberConflict` ถัดจาก `numberProblems`; import `abortIf`)
  - `test/api/guards-in-transaction.test.ts` (ใหม่ 7 tests)
- เทสต์ที่เพิ่ม: AC-01 ×2 (สร้างงานใหม่ / ย้ายเทอม), AC-02 ×2 (เพิ่มพร้อมกัน / แก้เลขที่), AC-03 ×1, AC-04 ×1 (ตรวจว่าเด็กในรายการที่มีอยู่แล้วไม่ถูกแก้ และไม่มี audit method=import), AC-05 ×1 (เส้นทางปกติไม่มี race รวมการสลับเลขที่ภายในรายการ)
- คำสั่งที่รัน → ผล:
  - ก่อนแก้ `npx vitest run test/api/guards-in-transaction.test.ts` → FAIL 6 / PASS 1 (evidence/before-fix.txt, Q-90)
  - หลังแก้ ไฟล์ใหม่ + integrity-d, race-r1, school-year, import-preview, manage, audit-history, volume → 8 ไฟล์ / 101 PASS (evidence/related-after-fix.txt, Q-91, Q-94)
  - `npm test` → 62 ไฟล์ / 700 PASS (baseline 61/693 + ไฟล์ใหม่ 7) (evidence/full-suite.txt, Q-92)
  - `npm run typecheck` → PASS (Q-93) · โปรเจกต์ไม่มีสคริปต์ lint
- Mutation (evidence/mutation.txt, Q-95) — ถอดทีละจุดแล้วรันไฟล์ใหม่ คืนโค้ดหลังแต่ละครั้ง (ยืนยันด้วย diff กับสำเนา):

  | # | ถอดอะไร | ผล |
  |---|---|---|
  | M1 | year guard ใน batch ของ assignments | AC-01 ×2 ล้ม (200) |
  | M2 | การอ่านซ้ำใน catch ของ assignments | AC-01 ×2 ล้ม (500) |
  | M3 | number guard ใน batch ของ students | AC-02 ×2 ล้ม (200) |
  | M4 | การตรวจเลขที่ซ้ำใน catch ของ students | AC-02 ×2 ล้ม (500) |
  | M5 | การตรวจรหัสซ้ำใน catch ของ students | AC-03 ล้ม (500) |
  | M6 | numberClashGuard ใน batch ของ import | AC-04 ล้ม (200) |
  | M7 | numberProblems ใน catch ของ import | AC-04 ล้ม (500) |

- AC ที่ครอบคลุม: AC-01..AC-06
- mock/ชั่วคราวที่ต้องถอดตอนเชื่อมระบบ: ไม่มี
- ข้อจำกัด/สิ่งที่ยังไม่ทำ (นอกขอบเขต ไม่ได้แก้):
  - import: ถ้าอีกเครื่องสร้างนักเรียนรหัสเดียวกับแถวใหม่ในรายการระหว่างอ่าน `exRes` กับ batch → ชน UNIQUE(code) แล้วได้ 500 (ไม่ใช่ข้อมูลผิด เพราะ batch ย้อนทั้งก้อน)
  - assignments: `prevRows` อ่านก่อน — ถ้าอีกเครื่องผูกห้องใหม่ให้งานเดียวกันพร้อมกัน ห้องนั้นจะถูกนับเป็น "ห้องเดิม" ไม่ถูกตรวจปี (กรณีแคบมาก)
  - `worker/routes/catalog.ts` POST /api/classes: `class_of_past_year` ตรวจปีปัจจุบันก่อนเขียนแบบเดียวกัน ไม่ได้ตรวจซ้ำใน batch
- ถึง QA:
  - ลำดับรหัสข้อผิดพลาดเมื่อผิดหลายข้อพร้อมกันหลังแพ้ race: students = code_taken → history_move_blocked → number_taken; import = number_conflict → history_move_blocked
  - กรณีนักเรียน status ≠ active หรือไม่มี number/class_id ต้องไม่ถูก guard เลขที่ (เงื่อนไข `checksNumber`)
  - งานที่แก้ใต้เทอมเดิมโดยไม่เพิ่มห้อง ไม่ใส่ year guard (ข้อมูลเก่าก่อนโมเดลปีต้องแก้ได้เหมือนเดิม)

## T-01 (เพิ่ม) AC-07 นำเข้า: รหัสใหม่ถูกเครื่องอื่นสร้างแทรก — 2026-10-30

- ทำอะไร: ใน `catch` ของ POST /api/students/import อ่านสดว่ารหัสของแถวใหม่ (`_isNew`) มีอยู่แล้วหรือยัง ถ้ามีให้ตอบ 409 `code_taken` ข้อความ `รหัสนักเรียนนี้มีอยู่แล้ว: <รหัส>` (รูปแบบเดียวกับ create แต่ระบุรหัส) · ตรวจเป็นอันดับแรกใน catch ก่อน number_conflict และ history · ใน batch ใช้ UNIQUE(code) เป็น guard (ไม่เพิ่ม SQL guard) · batch ย้อนทั้งก้อน จึงไม่มีแถว/audit ครึ่งเดียว
- เทสต์ที่เพิ่ม: `AC-07` ใน test/api/guards-in-transaction.test.ts (รายการมีเด็กเดิม 101 กับแถวใหม่ 10777 · อีกเครื่องเพิ่ม 10777 ระหว่างที่รอ → 409, เด็ก 101 ไม่ถูกแก้, ไม่มี audit method=import)
- คำสั่งที่รัน → ผล:
  - ก่อนแก้ `npx vitest run test/api/guards-in-transaction.test.ts -t AC-07` → FAIL (500 แทน 409) (evidence/before-fix-ac07.txt, Q-96)
  - หลังแก้ไฟล์ที่เกี่ยวข้อง 8 ไฟล์ → 102 ผ่าน (Q-91) · `npm test` → 62 ไฟล์ / 701 ผ่าน (Q-92) · typecheck ผ่าน (Q-93) · volume 7/7 (Q-94)
  - Mutation M8: ถอดการตรวจรหัสใน catch → AC-07 ล้ม (500) แล้วคืนโค้ด (Q-95 = M1–M8 ถูกจับครบ 8/8)
- หมายเหตุ: M1–M7 รันบนโค้ดก่อนเพิ่ม AC-07 · ส่วนที่เพิ่มไม่ได้แตะ guard ของ M1–M7
- AC ที่ครอบคลุม: AC-07

## T-01 (Verify รอบ 1) R-01..R-04 / AC-08 — 2026-10-30

- R-01 / AC-08 ตรวจ "เลขที่หลังเขียน":
  - `numberProblems` (ใช้ทั้ง preview, ตรวจก่อนเขียน และ catch): อ่านด้วย query เดียว `class_id = ?1 AND number IS NOT NULL AND (+status = 'active' OR code IN รายการ)` · ถ้าแถวในรายการไม่มีเลขที่ จะใช้เลขเดิมของเด็กรหัสนั้นในห้องเดียวกัน (status ใดก็ได้) ตรงกับ CASE ใน upsert · นับเลขนี้ทั้งใน `dupNumbers` และใน `numberClashes` (ชนกับเด็ก active ที่ไม่อยู่ในรายการ) · เด็กในรายการทุกคนถูกตัดออกจาก clash เพราะเลขของเขาอยู่ใน `nums` แล้ว
  - `numberClashGuard` (ในธุรกรรม): ใช้ `PASTE_NUMBERS_AFTER` = `COALESCE(เลขในรายการ, เลขเดิมในห้องนี้ ค้นด้วย code UNIQUE)` · abort เมื่อเลขหลังเขียนซ้ำกันในรายการ หรือชนกับเด็ก active นอกรายการ · ใส่ guard ทุกครั้ง (ไม่ข้ามเมื่อรายการไม่มีเลขที่) เพราะเลขเดิมเปลี่ยนได้ระหว่างตรวจกับเขียน
  - เปลี่ยนพฤติกรรมเมื่อชน: แถวไม่มีเลขที่ของเด็ก active ในห้องที่ชนกับเลขในรายการ เดิมรายงานเป็น `numberClashes` ตอนนี้รายงานเป็น `dupNumbers` (ยังเป็น 422 `number_conflict` เหมือนเดิม test เดิมยอมรับทั้งสองแบบ) · กรณีไม่ชนพฤติกรรมเดิม
  - ผลข้างเคียงที่ควรรู้: ถ้าข้อมูลเดิมมีเด็กในรายการสองคนที่ถือเลขซ้ำกันอยู่แล้ว (เช่น active 7 กับ moved 7) การนำเข้าแบบไม่มีเลขที่จะได้ 422 ซึ่งถูกต้องตามกติกา เพราะหลังเขียนจะเป็น active เลขเดียวกันสองคน (precheck production 30 ต.ค.: เลขที่ซ้ำ 0)
- R-02: เพิ่ม `+status = 'active'` ใน `numberHeld` (POST /api/students ใช้ทั้งตรวจก่อนเขียน, guard และ catch), `numberProblems` และ `numberClashGuard` · แก้ comment ให้ตรงความจริง
  - EXPLAIN QUERY PLAN บน migrations จริง (node:sqlite, ข้อมูลจำลอง 1,400 คน / 7 ห้อง) → evidence/explain-query-plan.txt
    - ไม่มี sqlite_stat1: numberHeld `SEARCH idx_students_class (class_id=? AND number=?)` · numberProblems `SEARCH idx_students_class (class_id=? AND number>?)` · guard นำเข้า `SEARCH s USING idx_students_class (class_id=? AND number=?)` + `SEARCH k USING sqlite_autoindex_students_2 (code=?)` · เทียบแบบเดิมที่ไม่มี `+` = `idx_students_status (status=?)`
    - หลัง ANALYZE: ทั้ง 3 query ยังเป็นแผนเดียวกัน
    - year guard ของ assignments: ไม่มีสถิติใช้ PK ของ classes · หลัง ANALYZE ที่มี 7 ห้อง planner เลือก `SCAN classes` (ตารางเล็กมาก ห้องทั้งหมดของโรงเรียนมีหลักสิบแถว) ไม่ได้บังคับ index เพราะอยู่นอก R-02 (R-02 ครอบเฉพาะ query เลขที่)
- R-03: catch ของ assignments ตรวจ `score_over_full` ก่อน แล้วค่อย `class_year_mismatch` ตรงกับลำดับก่อนเขียน
- R-04: เพิ่ม test 3 ตัว (race เด็กในรายการที่ไม่มีเลขถูกเปลี่ยนเลขให้ชน → 422 dupNumbers [7] · ห้อง year NULL ระหว่าง race → 200 · นักเรียน moved ไม่ถูก number guard ระหว่าง race → 200) และ AC-08 อีก 2 ตัว (preview+import กับเลขเดิมที่ชนเด็กนอกรายการ, เด็กไม่มีเลขสองคนเลขเดิมซ้ำกัน)
- ก่อนแก้: `-t "AC-08|R-04"` → 3 ล้ม / 2 ผ่าน (evidence/before-fix-ac08.txt, Q-97)
  - AC-08 ×2: ได้ clash/dup ว่าง
  - R-04(ก): ได้ 422 อยู่แล้วแต่เป็น clash ไม่ใช่ dup เพราะ guard เดิมจับได้คนละทาง
  - R-04(ข)(ค): ผ่านตั้งแต่ก่อนแก้ เพราะเป็น test กันถอยหลัง
- Mutation: M9 ถอดการนับเลขเดิมใน `numberProblems` → AC-08 ×2 และ R-04(ก) ล้ม · M10 แทน subquery เลขเดิมใน guard ด้วย NULL → R-04(ก) ล้ม (ได้ 200) · ความพยายามแรกของ M10 (แทรก NULL ใน COALESCE) ไม่เปลี่ยนความหมาย จึงลบผลนั้นออกแล้วรันใหม่ · คืนโค้ดหลังแต่ละครั้ง (diff ตรงกับสำเนา)
- คำสั่ง → ผล:
  - `npm run typecheck` → PASS (Q-93)
  - `npm test` → 63 ไฟล์ / 718 ผ่าน (baseline 63/713 รวม qa-m1-03 + test ใหม่ 5) (Q-92)
  - ไฟล์ที่เกี่ยวข้อง 9 ไฟล์ → 119 ผ่าน (Q-91)
  - volume 7/7 + EXPLAIN (Q-94)
  - mutation ถูกจับครบ 10/10 (Q-95)

# Code review: กู้คืนไฟล์สำรองที่มีคะแนนครึ่ง (.5) ได้ (`2026-10-30-m1-01-restore-half-score`)

โดย Code Reviewer · 2026-10-30 · ช่วง diff: `a44c89b..HEAD` (+ ที่ยังไม่ commit: `worker/lib/restore-validation.ts`, `test/api/audit-restore-domain.test.ts`, `README.md`, ไฟล์ใหม่ `test/api/restore-half-score.test.ts`) · รอบแก้ (Verify) 1/3 (ตัวนับเดียวกับ QA)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่าน

ต้องแก้ 0 ข้อ · ควรแก้ 0 ข้อ · เสนอ 3 ข้อ

restore ยังเข้มกว่าหรือเท่ากับ BR-01 ทุกกรณีที่ลอง ไม่พบช่องให้ค่าผิดเข้าฐานผ่าน restore · ข้อเสนอทั้ง 3 ข้อเป็นเรื่องความแม่นของเทสต์ และนิยามคะแนนฝั่งบันทึก (นอก diff) ที่หลวมกว่าฝั่ง restore เล็กน้อย

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

ไม่มี

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-01 นิยามขั้น 0.5 ฝั่งบันทึกหลวมกว่าฝั่ง restore (มีอยู่ก่อนแล้ว อยู่นอก diff) · `worker/routes/submissions.ts:61` (เทียบกับ `worker/lib/restore-validation.ts:9` และ `:103`)
  - zod 4.6.7 `multipleOf` ใช้ `floatSafeRemainder` ที่มีค่าเผื่อ `4*EPSILON*|ratio|` (`node_modules/zod/v4/core/util.js:58-66`) ผลที่ลองจริงคือ `7.500000000000001`, `1e-16`, `3e-16` **ผ่าน** `z.number().multipleOf(0.5)` ทั้งที่ ×2 ไม่ใช่จำนวนเต็ม
  - ฝั่ง restore ไม่มีช่องโหว่ เพราะ SQL rule `score*2!=CAST(score*2 AS INTEGER)` (`restore-validation.ts:103`) ปฏิเสธค่าเหล่านี้ตอน commit (ลองใน SQLite 3.51.3 แล้วได้ `bad_new=1` ทุกค่า) จึงไม่มีค่าผิดเข้าฐานผ่าน restore
  - ความเสี่ยงอยู่ที่ฝั่งบันทึก: ถ้ามีคำขอที่ประกอบขึ้นเอง หรือ client ในอนาคตส่ง `7.500000000000001` มาที่ `POST /api/submissions/batch` ค่านี้จะถูกบันทึก (เพราะ `submissions.ts:244` ตรวจแค่ 0..full) แล้วไฟล์สำรองทั้งไฟล์จะกู้คืนไม่ได้ (422 `invalid_score`) ซึ่งเป็นบั๊กชนิดเดียวกับงานนี้ ตอนนี้ UI ยังทำให้เกิดกรณีนี้ไม่ได้ เพราะ `shared/grade.ts:16` `isHalfStep` ตรวจแบบตรงตัว และ `src/pages/Scan.tsx:866` กับ `decideCellCommit` ก็ใช้ตัวนี้ ส่วน Excel ไม่มีการนำเข้าคะแนน
  - แนวทาง (งานถัดไป): ใช้นิยามเดียวกันทั้งระบบ เช่น `z.number().refine(isHalfStep)` จาก `shared/grade.ts` ทั้งใน `opSchema` และ `halfStep` ของ restore
- R-02 เทสต์ AC-02 ไม่ได้ยืนยัน code และจุดที่ปฏิเสธ · `test/api/restore-half-score.test.ts:52-56`, `:77`, `:99`
  - ใน tuple มีสมาชิกตัวที่ 3 (`"chunk"`/`"commit"`) แต่ไม่ได้นำไปใช้ และ assertion ตรวจแค่ `table`/`field` ไม่ได้ตรวจ `code` (AC-02 ระบุว่าต้องเป็น `invalid_score` หรือ `score_over_full`)
  - ในเทสต์ SQL guard (`:83-100`) ค่า string `"7.5"` ถูกจับด้วย `score_over_full` (`restore-validation.ts:91` ซึ่งอยู่ก่อนใน COALESCE เพราะใน SQLite TEXT > INTEGER เป็นจริงเสมอ) ไม่ได้ถูกจับด้วยกิ่ง `json_type` ของ `invalid_score` ส่วน 10.5 ก็ถูกจับด้วย `score_over_full` · rule ใหม่ถูกพิสูจน์จริงด้วย 7.25 (กิ่ง ×2) และ -0.5 (กิ่ง `<0`) ส่วนการยอมรับ 7.5 ตอน commit ถูกพิสูจน์ด้วย AC-01 · การป้องกันจึงครบ แต่ชื่อเทสต์ `"rejects 7.25 and strings"` สื่อเกินกว่าที่พิสูจน์ได้
  - แนวทาง: assert `code` และขั้นที่ปฏิเสธ (chunk หรือ commit) ต่อค่า หรือลบสมาชิกตัวที่ 3 ที่ไม่ได้ใช้ออก
- R-03 ยังไม่มีเทสต์ที่ยืนยันว่าค่าขอบที่ถูกต้องกู้คืนได้ (0.5, 0, = full_score 10) · `test/api/restore-half-score.test.ts:21`
  - AC-01 ใช้แค่ 7.5 · ค่าขอบเหล่านี้ลองแล้วผ่านทั้ง zod และ SQL (ดูหลักฐาน) และ dev-notes ส่งต่อให้ QA ตรวจแล้ว จึงเป็นเพียงข้อเสนอให้ล็อกไว้ใน regression

## คำตอบประเด็นที่ PM ถาม

1. **SQL rule ใหม่** (`restore-validation.ts:103`): ลองด้วย SQLite 3.51.3 (`node:sqlite`) ใช้นิพจน์เดียวกับใน rule
   - 7.5, 0.5, 99.5, 0, 10, -0, -0.0 → ไม่ติด rule (ใน SQLite การคูณ double ด้วย 2 ไม่มีความคลาดเคลื่อน จึงไม่มีปัญหาทศนิยมลอยกับค่าครึ่ง)
   - 7.25, 7.500000000000001, 1e-16, 3e-16 → ติด rule
   - -0.5 → ×2 ได้ -1 ซึ่งเป็นจำนวนเต็ม แต่ถูกกันด้วย `<0` (ยืนยันแล้ว: ถ้าไม่มี `<0` ค่านี้จะหลุด และ `<0` ยังอยู่)
   - NULL → `IS NOT NULL` ทำให้ไม่ติด rule และ `score_over_full` ได้ NULL ซึ่งนับเป็นเท็จ (ถูกต้อง)
   - `"7.5"` (text) และ `true` → ติดกิ่ง json_type
   - ค่าใหญ่: 1e21 → CAST ถูก clamp จนค่าไม่เท่ากัน จึงติด rule · 9223372036854775807 → ×2 overflow เป็น REAL จึงติด rule (กฎเดิมไม่ติดค่านี้ แต่ `score_over_full` จับได้อยู่แล้ว) · 4503599627370497.5 (ปัดเป็นจำนวนเต็มใน double) → ไม่ติด rule นี้ แต่ติด `score_over_full` · Infinity กับ NaN ไปไม่ถึง SQL เพราะ zod ปฏิเสธ และ `JSON.stringify` ก็แปลงเป็น null อยู่แล้ว
   - เก็บ 7.5 ผ่าน `INSERT … SELECT json_extract(...)` ลงคอลัมน์ INTEGER affinity ได้ `typeof='real'` ค่าเดิม (ไม่ถูกปัด)
2. **zod `multipleOf(0.5)` (v4.6.7)**: 0, 0.5, 7.5, 99.5, 100 ผ่าน · 7.25, 0.1, 0.30000000000000004, -0.5, "7.5", true, NaN, Infinity ไม่ผ่าน · ค่าที่หลุดเพราะค่าเผื่อของ zod คือ 7.500000000000001, 1e-16, 3e-16 ซึ่งผ่าน zod ตอนส่ง chunk แต่ SQL rule ปฏิเสธตอน commit จึงไม่เข้าฐาน (ดู R-01)
3. **สอดคล้องกับฝั่งบันทึก**: ช่วง 0..full_score และขั้น 0.5 ตรงกับ BR-01 · rule `score_over_full` (`:91`) เปรียบเทียบเชิงตัวเลขได้ถูกกับ .5 (10.5 > 10 → ปฏิเสธ, 9.5 ≤ 10 → ผ่าน) · ฝั่ง restore เข้มกว่าฝั่งบันทึกเล็กน้อย (ปลอดภัยต่อข้อมูล) · ไม่พบช่องให้ค่าผิดเข้าฐานผ่าน restore
4. **1.5 → 1.25** (`test/api/audit-restore-domain.test.ts:33`): สมเหตุสมผล เพราะ 1.5 ถูกต้องตาม BR-01 และเทสต์เดิมยึดพฤติกรรมบั๊กไว้ ส่วน 1.25 ยังคงเจตนาเดิมว่า "เศษที่ไม่ใช่ขั้น 0.5 ต้องถูกปฏิเสธโดยข้อมูลเดิมไม่เปลี่ยน" · coverage ไม่ลด: 999 (เกินเต็ม) และ -1 (ติดลบ) ยังอยู่ และกรณียอมรับ .5 ย้ายไปอยู่ใน AC-01 ของไฟล์ใหม่
5. **test ใหม่**: AC-01 ใช้ `restoreFrom` (`test/api/backup-helpers.ts:28-41`) ซึ่งเรียก validate → chunk → commit ผ่าน endpoint จริง บันทึก 7.5 ผ่าน `/api/submissions/batch` แก้ข้อมูลหลังสำรอง (score=3) เพื่อพิสูจน์ว่า restore เอา 7.5 กลับมาจริง แล้วตรวจ `typeof real`, epoch +1 และ counts/แถวตรงกัน · AC-02 ตรวจ 4 ค่า ข้อมูล/epoch/audit ไม่เปลี่ยน · มีกรณี SQL guard ที่แก้ `restore_staging.rows_json` ตรง ๆ เพื่อข้าม zod · AC-03 ครอบคลุมจำนวนเต็มและ null · ช่องว่างเล็กน้อยดู R-02/R-03 · dev-notes ระบุว่าเทสต์ล้มก่อนแก้ (`evidence/before-fix.txt`)
6. **performance**: ไม่เพิ่ม statement (เปลี่ยนแค่นิพจน์ใน statement เดิมของ `issueSql`) และไม่เพิ่มการอ่านแถว (สแกน CTE เดิมที่ MATERIALIZED แล้ว) เพิ่มแค่การคูณ 2 ครั้งต่อแถว submissions · `test/api/volume.test.ts` (งบ restore commit `:173-183`) ผ่านในการรันของผู้ตรวจ
7. **OWASP/ความปลอดภัย**: endpoint เดิมผ่าน auth เดิม ไม่มี endpoint ใหม่ · SQL ประกอบจากค่าคงที่ (ชื่อ field มาจาก schema) และ restoreId ใช้ bind ไม่มี injection · score เป็นตัวเลขที่แสดงผล ไม่มีทาง XSS · error ส่งคืนแค่ table/rowId/field/code เหมือนเดิม · ไม่มี dependency ใหม่ ไม่มี secrets · ไม่มีข้อมูลส่วนบุคคลใหม่ใน log

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร
- [x] ตรวจ input ฝั่ง server ทุกจุด (zod ตอนส่ง chunk + SQL guard ใน transaction ตอน commit)
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล (ไม่เปลี่ยนจากเดิม · ไม่มี endpoint ใหม่)
- [x] ป้องกัน injection (SQL/NoSQL/command), XSS, CSRF (SQL ประกอบจากค่าคงที่ ค่าจากผู้ใช้ใช้ bind)
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น
- [x] error ไม่เปิดเผยรายละเอียดภายใน (รูปแบบ issues เดิม)
- [x] dependency ใหม่น่าเชื่อถือ (ไม่มี dependency ใหม่)

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] เงิน: ไม่ใช่เงิน · คะแนนขั้น 0.5 แทนค่าใน double ได้ตรงตัว ไม่มีการปัดเศษในเส้นทาง restore · ผลที่คาดคำนวณจาก BR-01 ก่อน แล้วจึงเทียบกับผลจริงทีละค่า (ดูประเด็น 1-2)
- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำ: ไม่เปลี่ยน (ส่ง chunk ซ้ำด้วย `INSERT OR REPLACE` ตาม seq แบบเดิม)
- [x] การเขียนหลายตารางอยู่ใน transaction: guard ยังเป็น statement ต้น batch ของ swap (`worker/routes/backup.ts:241`) ถ้าล้มจะ rollback ทั้งหมด และ AC-02 ยืนยันว่าข้อมูล/epoch/audit ไม่เปลี่ยน
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง: ไม่เปลี่ยน (FK check เดิม)
- [x] วันที่/timezone/พ.ศ.: N/A งานนี้ไม่แตะ
- [x] reconciliation รันซ้ำได้: AC-01 เทียบ counts และแถว submissions ก่อน/หลังด้วยเทสต์

## หลักฐาน

- `npx vitest run test/api/restore-half-score.test.ts test/api/audit-restore-domain.test.ts test/api/volume.test.ts test/api/restore.test.ts test/api/backup-consistency.test.ts` → PASS 5 ไฟล์ / 70 tests
- probe zod 4.6.7 (`z.number().multipleOf(0.5).min(0).nullable()`) แบบอ่านอย่างเดียวด้วยสคริปต์ใน scratchpad → ผลตามประเด็นที่ 2
- probe SQLite 3.51.3 (`node:sqlite` in-memory) ด้วยนิพจน์ rule ใหม่และเดิมกับค่า 21 ค่า → ผลตามประเด็นที่ 1
- `git diff --stat a44c89b -- worker src shared migrations` → เปลี่ยนแค่ `worker/lib/restore-validation.ts` (+4/-2) ไม่มี migration

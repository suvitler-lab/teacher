# Code review: วันที่รับงานจริง + แก้ช้า/ทันรายช่อง (c03-submit-date) — หลังบ้าน T-02

โดย Code Reviewer · 2026-11-02 · ช่วง diff: `0312e8d..` + ที่ยังไม่ commit (`shared/types.ts`, `worker/routes/submissions.ts`, `shared/received-date.ts` ใหม่; เทียบ `api-contract.md` v3, `requirements.md`, `decisions-local.md`) · รอบแก้ (Verify) 0/3 (รอบแรก)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่านแบบมีเงื่อนไข

ต้องแก้ 1 ข้อ (ระดับกลาง-สูง แต่แก้จุดเดียว ไม่ต้องตรวจใหม่ทั้งชุด) · แนะนำ 5 ข้อ (เสนอทั้งหมด)

สิ่งที่ตามล่าแล้ว **ไม่พบปัญหา** (อ่านโค้ด + probe):
1. วันที่ถูกใช้กับช่องที่ส่งแล้ว / ถูกเพิกเฉยตอนส่งครั้งแรก: ไม่พบ — `already_submitted` ตัดสินก่อน (`submissions.ts:408`), op grid ที่ไม่ใช่ `dateOnly` บนช่อง submitted ไปทาง `else` เก็บ `before.submitted_at` (`:451-453`), ข้อยกเว้นคะแนนแรกรอบเดียวกันก็ไปทาง `else` (AC-05) · ส่งครั้งแรกทุก method (ไม่มีแถว/void/excused รวม pending row ในคำขอเดียวกัน) ใช้ `receivedAtMs` (`:448-450`)
2. แข่งกับการแก้คะแนน/รับงานพร้อมกัน: `before` อ่านจาก `loadWorld` และ snapshot ของ `cellsGuard` สร้างจาก `world.existing` ครบ 9 ฟิลด์ (`:496`, `:187`) → แก้คะแนน/วิธี/เครื่องที่ลงระหว่างอ่านกับเขียน ทำให้ batch abort แล้วอ่านใหม่ (`:510-513`) — ไม่มี lost update ของ score/method/device · ทิศกลับ (คำขออื่นที่อ่านก่อน re-date ลง) ก็ถูก `cellsGuard` ของคำขอนั้นกัน เพราะ `submitted_at` อยู่ใน snapshot · ค่าที่อ่านนอก guard มีแค่ `due_date` (แก้ด้วย `lateFixForCells` ใน transaction) และ `assigned_date` (ยอมรับใน plan)
3. เขตเวลา/ขอบวัน: เที่ยงไทย = 05:00Z ไม่มี DST, `bkkToday(bkkNoonMs(d)) === d` เสมอ · กฎ "วันเดียวกับ eventAt ใช้เวลาจริง" ไม่ทำให้วันข้าม (eventAt ถูก clamp ≤ now; ถ้า clamp ย้ายวัน → ไปทางเที่ยงของวันที่เลือก วันคงเดิม — AC-06) · `min(noon, now)` ไม่ข้ามวันเพราะ `v ≤ today` · leap: `2028-02-29` ผ่าน, `2026-02-29`/`1900-02-29` ไม่ผ่าน, `2000-02-29` ผ่าน · ช่องว่างหน้า/หลัง, `\n` ท้าย, `T00:00` ไม่ผ่าน (JS `$` ไม่จับก่อน newline) · non-string → zod 422 ทั้งคำขอ ตรงสัญญา · ดูข้อยกเว้นปี 1900–1969 ใน R-01
4. offline replay: `today` = วันไทยของ server ตอนเขียน (ตาม BR-07) · `duplicate` ตัดสินก่อนทุกอย่าง (`:377`) · `superseded` ก่อน `cell_not_submitted`/วันที่ (`:402`) ตรงลำดับสัญญา v3 · op ค้าง >7 วันได้ `submitted_at` = เที่ยงของวันที่เลือก ไม่หาย
5. audit: re-date = 1 แถว `update` ผ่าน `guardedAuditStmt` ใน batch เดียวกับ upsert (atomic) · bulk เขียน `after.submitted_at` = `receivedAt` และ `auditLateSyncStmt` ซิงก์ `late` · bulk-undo คืน `before.submitted_at` จาก audit ตรงทุก ms และ `modified` เทียบ `submitted_at`/`method`/`updated_at` (re-date หลัง bulk → 409) · `received_date_not_applicable` กับ full-score/clear (`:571`)
6. แอปเก่า (ไม่ส่งฟิลด์): `receivedAtMs(undefined, eventAt, now) === clampClientTs(...)` = ค่าเดิมทุก byte · bulk `receivedAtMs(undefined, now, now) === now` · statement ไม่เพิ่ม (แค่คอลัมน์ `assigned_date` ใน SELECT เดิม) · ผล meter ของ dev: เท่ากันทั้ง bulk 32 และ batch 50 (`evidence/t02-ac24-meter.txt`)
7. ตั้ง `late` ตรง: ไม่พบ — `opSchema`/`bulkSchema` ไม่รับ `late`; ทุกจุดคำนวณด้วย `isLateSubmission` แล้ว `lateFixForCells` ตัดสินซ้ำใน transaction (grep `late\s*[:=]` ใน `worker/` ไม่มีค่าจากผู้ใช้)

## ต้องแก้ก่อนปล่อย

### R-01 วันที่รับงานปี 1900–1969 ผ่านการตรวจ → `submitted_at` ติดลบ → ไฟล์สำรองกู้คืนไม่ได้ทั้งไฟล์ — data · `shared/received-date.ts:32-35` (และ `:21-23`)

- ปัญหา: `isCeDate` ยอมรับปี 1900–2099 (กฎของวันที่แบบสตริงใน EP-05) แต่ที่นี่วันที่ถูกแปลงเป็น ms (`bkkNoonMs`) — วันก่อน 1970-01-01 ได้ค่าติดลบ (probe: `"1969-12-31"` → `-68400000`, `"1926-10-30"` → `-1362423600000`) ขณะที่ `worker/lib/restore-validation.ts:11,14,37` บังคับ `submissions.submitted_at` เป็น `integer.min(0)` → `backup.ts:319-320` ตอบ `422 invalid_backup` ทั้ง chunk
- สถานการณ์ที่พัง: งานที่ไม่มีวันมอบหมาย หรือวันมอบหมายเป็น พ.ศ. (`"2569-10-26"`) หรือเป็นวันในอนาคต (D-04: ไม่ใช้เป็นพื้น) → ครูพิมพ์ปีผิด `"1926-10-30"` (หรือคำขอทำมือ) → `checkReceivedDate` คืน `null` (probe ยืนยัน) → ช่องบันทึก `submitted_at` ติดลบ `late 0` ("ทัน" เงียบ ๆ — ความเสี่ยงที่ requirements ระบุว่าต้องกันทั้ง UI และ server) และวันที่ต้องกู้คืน backup ที่ส่งออกหลังจากนั้นถูกปฏิเสธทั้งไฟล์ — ตาข่ายนิรภัยพังโดยไม่มีใครรู้จนถึงวันที่ต้องใช้ (ขัด AC-20 "ส่งออกแล้วนำเข้า backup กู้คืน → submitted_at ทุกช่องเท่าเดิม")
- แนวทางแก้: ใส่พื้นตายตัวของวันที่รับงานใน `checkReceivedDate` (เช่น `v < "1970-01-02"` หรือพื้นที่สมเหตุสมผลกว่าอย่าง `"2000-01-01"` → `received_date_invalid`) ให้หน้าจอใช้ตัวเดียวกัน · เพิ่มเทสต์หน่วย `"1969-12-31"`/`"1926-10-30"` + กรณีงาน `assigned_date` เป็น พ.ศ. · (Tech Lead ตัดสินค่าพื้น; ไม่ควรแก้ที่ restore-validation ให้รับค่าติดลบ)
- สถานะ: เปิด

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

- ไม่มี

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-02 re-date สร้างช่อง submitted ได้ ถ้ารับงานในคำขอเดียวกันหลุด `stillValid` · `worker/routes/submissions.ts:421`, `:470`, `:118` — คำขอ `[hid รับงาน, grid dateOnly]` ช่องว่างเดียวกัน (คิวออฟไลน์เครื่องเดียวที่ทั้งสแกนและแก้วันที่) ถ้างานถูกปิดรับจากเครื่องอื่นระหว่างอ่านกับเขียน: แถว hid (`receive 1`) ถูก `stillValid` ตัด แต่แถว re-date (`receive 0`, status จาก pending row = submitted) ผ่าน → INSERT ช่อง submitted method grid · ผล: op แรก `assignment_closed`, op สอง `ok` · ขัดหลัก BR-05 "re-date ไม่สร้างการรับงานโดยบังเอิญ" แต่หน้าต่างเวลาแคบมาก และคู่ `[hid, grid คะแนน]` แบบเดิมก็ให้ผลเดียวกันอยู่แล้ว · ทางแก้ถ้าต้องการ: ให้แถว re-date ที่ `before` เป็น pending row รับ `receive` ของแถวนั้น หรือใส่ `expect_submitted` ใน guard เฉพาะ re-date (ระวังข้อห้าม `[void, รับงาน]` ในสัญญา)
- R-03 ขอบเที่ยงคืน: "วันนี้ผ่านเสมอ" (D-04) ไม่จริงเมื่อเวลาแอปนำ server ไม่กี่วินาที · `submissions.ts:429`, `received-date.ts:34` — สแกน 00:00:02 ตามเวลาแอป (`receivedDate` = วันใหม่) ถึง server 23:59:59 → `received_date_future` → ไป "ส่งไม่สำเร็จ" (แอปเก่ารับได้) · กดลองใหม่หลังเที่ยงคืนผ่าน · ทางแก้ถ้าต้องการ: ยอมให้ `v ≤ bkkToday(now + ช่วงคลาดเคลื่อนเล็ก ๆ)` แล้ว `receivedAtMs` จะ `min(..., now)` ให้เอง หรือแจ้งทีม UI ให้แสดงเหตุผลชัด
- R-04 re-date เป็น last-write-wins ทั้งแถว · `submissions.ts:402` — แก้คะแนนออฟไลน์ที่ทำก่อน (clientTs เก่ากว่า) แต่ส่งถึงหลัง re-date จะได้ `superseded` และคะแนนนั้นหาย แม้สองการแก้แตะคนละฟิลด์ · สอดคล้องกลไกเดิมและ AC-18 แต่ทีม UI ควรแสดง `superseded` ของ op คะแนนให้ครูเห็น
- R-05 audit `after.late` ของ EP-01 ไม่ซิงก์กับ `lateFixForCells` · `submissions.ts:501` (เทียบ bulk `:681` ที่มี `auditLateSyncStmt`) — re-date ที่ชนกับการเลื่อนกำหนดส่งพร้อมกัน: ช่องถูก แต่ประวัติบอก late เดิม · เป็นพฤติกรรมเดิมของ EP-01 (สัญญา v3 ระบุไม่เปลี่ยน) แต่ตอนนี้ re-date มีไว้เพื่อเปลี่ยน late โดยตรง — เพิ่ม `auditLateSyncStmt(pending opIds)` ท้าย batch ได้โดยไม่เพิ่มรอบ
- R-06 re-date วันเดิม (no-op) ยังเขียนแถว + audit · `submissions.ts:442-446` — เปลี่ยน `method`/`device_id`/`event_at`/`updated_at` และทำให้ bulk-undo ของ batch ที่คลุมช่องนั้นได้ `409 modified_since` · AC-16 ให้หน้าจอไม่ส่ง op นี้อยู่แล้ว; ถ้าต้องการกันที่ server ให้ตอบ `ok` ด้วยค่าเดิมโดยไม่เขียน (ต้องคิดเรื่อง `duplicate` เพราะไม่มีแถว audit)

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร (diff 3 ไฟล์)
- [x] ตรวจ input ฝั่ง server ทุกจุด — ชนิด/ยาวใน zod, ค่าใน `checkReceivedDate` ตอนใช้ (D-03) · ยกเว้นช่วงปีต่ำ (R-01)
- [x] ตรวจสิทธิ์ — route เดิม `requireAuth` ครบ (`:19-22`) ไม่มี endpoint ใหม่ · `redate_not_allowed` กันทาง hid/camera/manual + `dateOnly` ข้าม C-01/ปิดรับ (`:308`)
- [x] injection — ค่าใหม่ผ่าน `bind`/JSON เท่านั้น ไม่ต่อสตริง SQL
- [x] ข้อมูลส่วนบุคคลไม่ถูก log
- [x] error ไม่เปิดเผยภายใน — 400 `received_date_*` ข้อความไทยตามสัญญา
- [x] dependency ใหม่ — ไม่มี

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] เงิน/คะแนน: re-date เขียน `before.score` ไม่ใช้ score ใน op (`:460`) · ข้าม `score_out_of_range` เฉพาะ `dateOnly`
- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำ — `duplicate` ก่อนทุกขั้น · bulk-undo ซ้ำ → `alreadyUndone`
- [x] การเขียนหลายตารางอยู่ใน transaction — guard + audit + upsert + lateFix ใน `DB.batch` เดียว (`:501`, `:679`)
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง — N/A (ไม่มีการลบใหม่)
- [ ] วันที่/timezone/พ.ศ. ถูกต้อง — ถูกยกเว้นปี 1900–1969 (R-01) · ขอบเที่ยงคืนเป็นข้อเสนอ (R-03)

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `npx vitest run test/api/c03- test/unit/c03-` | PASS 5 files / 117 tests |
| `npm run typecheck` | PASS (exit 0) |
| probe: esbuild `shared/received-date.ts` → scratchpad แล้วเรียกฟังก์ชัน | `checkReceivedDate("1969-12-31",{assignedDate:null})` = null, `receivedAtMs` = -68400000 · `checkReceivedDate("1926-10-30",{assignedDate:"2569-10-26"})` = null · leap/whitespace ตามที่ระบุข้างบน · `bkkNoonMs("2026-10-30")` = 1793336400000 |
| อ่าน `worker/lib/restore-validation.ts:11-14,37`, `worker/routes/backup.ts:319-320` | `submitted_at` ต้อง ≥ 0 มิฉะนั้น 422 `invalid_backup` |

หมายเหตุ: ไม่ได้บันทึกผ่าน `evidence.mjs` เพราะคำสั่ง PM จำกัดให้เขียนเฉพาะไฟล์นี้ — PM บันทึกต่อได้จากตารางข้างบน

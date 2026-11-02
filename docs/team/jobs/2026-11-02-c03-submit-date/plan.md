# Technical plan: วันที่รับงานจริง + แก้ช้า/ทันรายช่อง (c03-submit-date) — หลังบ้านเท่านั้น

โดย Tech Lead · 2026-11-02 · สัญญา `docs/team/api-contract.md` **v3** (EP-01, EP-03 · EP-04 ไม่แก้) · ข้อตัดสินใจ `decisions-local.md` D-c03-submit-date-01..07 · branch `team/2026-11-02-c03-submit-date` @ 0312e8d

## แนวทาง

- เก็บวันที่รับงานใน `submitted_at` เดิม (Q1 ก) — วันที่เลือก → 12:00 ไทย, วันเดียวกับเวลาที่ครูทำ → เวลาจริง · `late` คำนวณจากวันนั้นตามกฎเดิม (`late.ts` ไม่แตะ) · **ไม่มี migration** (D-c03-submit-date-02)
- กฎวันที่ไฟล์เดียว `shared/received-date.ts` ใช้ร่วม server/หน้าจอ (D-01) · ตรวจเฉพาะเมื่อวันที่จะถูกใช้ รายผล op (D-03) · พื้น = วันมอบหมายที่ ≤ วันนี้, ไม่มีเพดานย้อนหลัง (Q2, D-04)
- EP-01: `receivedDate` ใช้กับทุก op ที่ทำให้ช่องเป็น submitted ครั้งแรก **รวม grid/manual** (Q3, D-06) · แก้วันที่ = `grid` + `dateOnly` (D-05) · EP-03: `receivedDate` กับ all-submitted · EP-04 ไม่แก้
- ไม่แก้ `src/` (outbox ส่ง payload ทั้งก้อนอยู่แล้ว — D-07) · `Scan.tsx`/`Gradebook.tsx`/หน้าจอทั้งหมดพักไป ui-redesign · จำนวน statement ต่อคำขอเท่าเดิม (AC-24)
- เทสต์ที่ล้มก่อนแก้เป็นของ QA (T-01) ตามบทเรียน C-01/C-02 · dev ไม่เขียนไฟล์ `c03-*`

## การเปลี่ยนแปลงต่อส่วน

| ส่วน | เปลี่ยนอะไร |
|---|---|
| `shared/received-date.ts` (ใหม่ · BE) | `isCeDate`, `bkkNoonMs`, `checkReceivedDate(v, {today, assignedDate})`, `receivedAtMs(receivedDate, eventAt, now)` + type `ReceivedDateProblem` — signature ตรงตาม api-contract v3 (QA เขียนเทสต์ไว้ก่อน) |
| `shared/types.ts` (BE) | `SubmissionOp` + `receivedDate?: string \| null`, `dateOnly?: boolean` · export `SubmissionInvalidReason` (7 ค่า) · `reason` คง `string` |
| `worker/routes/submissions.ts` (BE) | `opSchema` + 2 ฟิลด์ (`z.string().max(32).nullish()`, `z.boolean().optional()`) · `AsgRow`/`loadWorld` อ่าน `a.assigned_date` เพิ่มในคำสั่งเดิม · `judge()` ขั้นแรก `redate_not_allowed`, ข้าม `score_out_of_range` เมื่อ `dateOnly` · ลูปหลัก: หลัง `already_submitted` → `cell_not_submitted` → `received_date_*` → คำนวณ `submitted_at` ด้วย `receivedAtMs` (op A) / คงเดิมหรือ `receivedAtMs` (op B, score/status จากแถว) · `bulkSchema` + `receivedDate` · ลำดับ error EP-03 ตาม v3 · `submitted_at`/`late` ของ all-submitted จาก `receivedAtMs(receivedDate, now, now)` · EP-04 ไม่แตะ |
| `test/api/c03-*.test.ts`, `test/unit/c03-*.test.ts` (ใหม่ · QA) | AC ทั้ง 24 ส่วนหลังบ้าน + helper + outbox carry + ตัวเลขช้า metrics/Excel + งบฐานข้อมูล |

## Tasks (PM ลง board)

| Task | งาน | ตำแหน่ง | เขียนได้เฉพาะ | หน้า pages.json | AC | รอ Task | ขนานกับ | พอร์ต |
|---|---|---|---|---|---|---|---|---|
| T-01 | test-plan (TC ทุก AC) + เทสต์ที่ล้มก่อนแก้ (API + unit helper/outbox/metrics) · รันแล้วบันทึก FAIL/PASS ก่อนแก้ตามรายการคาด | QA | test/api/c03-*.test.ts, test/unit/c03-*.test.ts, docs/team/jobs/2026-11-02-c03-submit-date/test-plan.md, docs/team/jobs/2026-11-02-c03-submit-date/qa-report.md, docs/team/jobs/2026-11-02-c03-submit-date/evidence/qa/** | — (ไม่แตะหน้าจอ) | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24 | — | — | 4101 |
| T-02 | server EP-01/EP-03 v3 + `shared/received-date.ts` + type · เทสต์ c03 ของ T-01 ผ่าน + ชุดเต็ม + typecheck | Back-End | worker/routes/submissions.ts, shared/received-date.ts, shared/types.ts, docs/team/jobs/2026-11-02-c03-submit-date/dev-notes/backend.md, docs/team/jobs/2026-11-02-c03-submit-date/evidence/t02-* | — | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-18, AC-21, AC-22, AC-23, AC-24 | T-01 | — | 4102 |
| T-03 | QA ตรวจรวม: c03 ทั้งหมด PASS + ชุดเต็ม ≥ baseline + typecheck + build + ไม่มี migration/ไม่แตะ src + qa-report (แยกส่วน UI ที่เลื่อนไป ui-redesign) | QA | test/api/c03-*.test.ts, test/unit/c03-*.test.ts, docs/team/jobs/2026-11-02-c03-submit-date/test-plan.md, docs/team/jobs/2026-11-02-c03-submit-date/qa-report.md, docs/team/jobs/2026-11-02-c03-submit-date/evidence/qa/** | — | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24 | T-02 | — | 4103 |

ตรวจแล้ว: ไม่มี task ขนานกัน (T-01 → T-02 → T-03 เรียง) · ไฟล์ `c03-*`, test-plan, qa-report, `evidence/qa/**` เป็นของ QA เท่านั้น (T-01, T-03 ไม่ขนาน) · ไฟล์ร่วม `shared/types.ts` มีเจ้าของคนเดียว (T-02) · ไม่มี `src/**`, `migrations/**`, `package.json` ในขอบเขตใด · ทุก AC-01..24 มี task · พอร์ต 4101–4103 ไม่ซ้ำ (vitest ไม่ใช้พอร์ต — สำรองไว้ถ้าต้องเปิด `wrangler dev` ด้วยมือ) · AC-17/19/20 ไม่มีโค้ดหลังบ้านต้องแก้ → T-01/T-03 ทำเทสต์กันถอย

### สิ่งที่แต่ละ task ต้องพิสูจน์

- **T-01 (QA)** fixture ตาม requirements (วันนี้ 2026-11-02 09:00 ไทย = 02:00Z ด้วย `vi.setSystemTime` · a1 มอบหมาย 10-26 กำหนด 10-30 เต็ม 10 · ก ข ค ง) ผ่าน `seed()`/`login()`/`call`/`gateBatch` ของ `test/api/helpers.ts` · คำนวณผลคาดจากสัญญา v3 ก่อนรัน · ไฟล์แนะนำ:
  - `test/api/c03-received-date.test.ts` (EP-01): AC-01 (hid + 10-30 → เที่ยง 1793336400000, late false, `event_at` = 02:00Z อ่านจาก DB, audit create 1) · AC-02 (ไม่มีฟิลด์ / วันนี้ → 09:00 late true) · AC-03 (3 reason + ง ok ในคำขอเดียว, ไม่มีแถว/audit, `"2026-02-30"`, `"30/10/2026"`, `""`) · AC-04 · AC-05 (คู่ hid+manual score ในคำขอเดียว) · AC-06 (ก clamp 7 วัน → เที่ยง 10-20 · ข วันเดียวกับ clientTs → เวลาจริง) · AC-07/08 ส่วน server (3 op ด้วย 10-30 → `ok` `submission.late` false · ด้วย 11-02 → true) · AC-12/13/15 (dateOnly: score เดิม, late สลับทั้งสองทาง, audit update before/after เทียบ `!!late`) · AC-14 (5 กรณี + ปิดรับ + เด็กย้าย/จบที่ช่อง submitted) · AC-16 ส่วน server (แก้กลับเป็นวันเดิมด้วย op ใหม่ → วันที่/late เดิม · วันเดียวกับ submitted_at เดิม → คง ms เดิม) · AC-18 (`superseded` ด้วย clientTs เก่ากว่า + `duplicate`) · AC-21/22 (คำขอไม่มีฟิลด์ใหม่ = ผลเดิมทุกชนิด · grid แก้คะแนนช่องที่ลงเที่ยง → submitted_at คงเดิม · `git ls-files migrations` ไม่มีไฟล์ใหม่ — บันทึกใน T-03) · Q3 (grid score 8 + 10-30 บนช่องว่าง/void/excused → เที่ยง 10-30) · ขอบ D-03/04/05: วันผิดบนช่องที่ส่งแล้ว → `already_submitted`/`ok` ไม่ใช่ invalid · วันผิดบน op void/excused → ไม่ตรวจ · dateOnly ไม่มีวันที่ → `received_date_invalid` · dateOnly + status void → `redate_not_allowed` · งานมีวันมอบหมายในอนาคต → วันนี้ `ok` · `receivedDate: 123` → 422
  - `test/api/c03-bulk-date.test.ts` (EP-03/04/05): AC-09 (32 คน 25+2+3+2 → changed 27, เที่ยง, audit 27 batch เดียว after.submitted_at) · AC-10 (4 กรณี + ลำดับ error ตาม v3 เช่น `full-score`+วันผิด → `not_applicable`) · AC-11 (undo คืน ms ตรง · แก้วันที่ ก ด้วย dateOnly ก่อน undo → 409 modified_since ไม่มีช่องคืน · undo ซ้ำ alreadyUndone) · AC-17 (EP-05 เลื่อน/ลบ/คืนกำหนด → late 1/0/0 submitted_at ไม่เปลี่ยน) · AC-23 ส่วน server (45 คน + วันที่ → batchId → undo) · AC-24 (`metered()` ของ `test/api/meter.ts`: bulk 32 คน และ batch 50 op มี/ไม่มี `receivedDate` → statements/rows read/written ไม่มากกว่ากรณีไม่มี — บันทึกตัวเลขใน test-plan)
  - `test/unit/c03-received-date.test.ts`: `@shared/received-date` ตามตารางตัวอย่าง BR-02 + ขอบ (assigned ว่าง/อนาคต/พ.ศ., now ก่อนเที่ยงวันนี้ → `min(noon, now)`)
  - `test/unit/c03-outbox-carry.test.ts`: `enqueueSubmission` ส่ง `receivedDate`/`dateOnly` ใน body (mock `api.post` แบบ `test/unit/outbox-order.test.ts`) · `retryFailed` คง `receivedDate` เปลี่ยน `clientTs`
  - `test/unit/c03-late-numbers.test.ts`: AC-19/20 ส่วนข้อมูล — `shared/metrics` และ Excel (`src/lib/excel.ts` แบบ `c08-excel-numeric.test.ts`) นับช้าจาก `late` เท่านั้น: 30 → 2 หลังแก้ 28 ช่อง, ร้อยละ 80% คงเดิม · backup/restore คง submitted_at/late (ใช้ `test/api/backup-helpers.ts` ได้ถ้าจำเป็น — ใส่ในไฟล์ api c03)
  - คาด **FAIL ก่อนแก้**: AC-01, 03, 05 (ส่วนวันที่), 06(ก), 07/08 (ส่วน 10-30), 09, 10, 11 (ส่วนแก้วันที่), 12, 13, 14, 15, 16, 18 (ส่วนแก้วันที่), 23 (ส่วนวันที่), Q3, ขอบ dateOnly ทั้งหมด, `c03-received-date` unit (โมดูลยังไม่มี) · **PASS ก่อนแก้** (กันถอย): AC-02, 04, 06(ข), 17, 19, 20, 21, 22, 24 (ค่าฐาน), outbox carry — ผลต่างจากนี้หยุดรายงาน PM (ไม่ปรับเทสต์ให้ตรงโค้ด)
  - `test-plan.md`: TC-xx อ้าง AC ครบ 24 (trace-check ready) + แถว "ส่วน UI เลื่อนไป ui-redesign" ตามตารางด้านล่าง
- **T-02 (BE)**: เทสต์ c03 ทั้งหมดผ่าน **ไม่แก้ไฟล์ `c03-*`** (ขัดสัญญา → ขอ QA ผ่าน PM) · `npm test` ชุดเต็ม — ไม่มีเทสต์เดิมในขอบเขต: ถ้าเทสต์เดิมล้ม หยุดรายงาน PM · `npm run typecheck` (รวม `src/` ที่ import `shared/types`) · ไม่เพิ่ม statement ใน `DB.batch` ของ EP-01/EP-03 · ไม่แตะ `stillValid`, `cellsGuard`, `late.ts`, EP-04 · dev-notes: ลำดับการตัดสินที่ implement จริง + ตัวเลข AC-24
- **T-03 (QA)**: `npx vitest run test/api/c03- test/unit/c03-` PASS · `npm test` ≥ baseline (1017 + c03) · `npm run typecheck` · `npm run build` · `git diff --stat main...HEAD -- migrations src` ว่าง (หลัง commit ของ PM) หรือ `git status --short migrations src` ว่าง · `ownership-check.mjs` สะอาด · qa-report แยก "หลังบ้าน PASS" กับ "UI = NOT RUN (เลื่อน)" ต่อ AC

### ส่วน UI ที่เลื่อนไปแพ็กเกจ ui-redesign (ไม่ใช่งานนี้ — PM ต้องบันทึกใน brief/ui-redesign)

| AC | ส่วนที่เลื่อน |
|---|---|
| AC-07 | ตัวเลือก "วันที่รับงาน" หน้าสแกน ช่วงจาก `checkReceivedDate` · แถบเตือนย้อนหลัง · กลับเป็นวันนี้เมื่อเริ่ม/จบรอบ · `makeOp` ใส่ `receivedDate` ทุก op รับงาน (BR-07) |
| AC-08 | ผังเลขที่ใช้ `submission.late` จากผล `ok` ทันที |
| AC-16 | รายละเอียดช่อง + ตัวเลือกวันที่ + ทางลัด "ตามกำหนดส่ง" + toast ย้อนกลับ + คีย์บอร์ด · `Sub` ใน Gradebook เก็บ `submitted_at` · op dateOnly ส่ง score ปัจจุบัน |
| AC-19 | ข้อความ "ส่งทัน/ส่งช้า N วัน · รับ วันที่" (นับวันจาก `bkkToday(submitted_at)` − due) |
| AC-20 | ตัวเลขช้าบนหน้าจอ (ข้อมูลตรวจในงานนี้แล้ว) |
| AC-22 | แอปเก่าแสดงตาม `late` (ไม่มีโค้ดใหม่ — ตรวจด้วยข้อมูลในงานนี้) |
| AC-23 | กล่องยืนยันทั้งห้อง + ช่องวันที่ + ข้อความทัน/ช้า + toast ย้อนกลับ |
| Q3 | ช่องวันที่ตอนพิมพ์คะแนนช่องว่างในสมุด · reason ใหม่ 5 ค่าเป็นภาษาไทยใน "ส่งไม่สำเร็จ" · นโยบาย outbox: `cell_not_submitted` ควรเป็น non-blocking หรือไม่ |

## ลำดับและ checkpoint

```
T-01 (QA: test-plan + เทสต์ล้มก่อนแก้) ──CP-1── T-02 (BE) ──CP-2── T-03 (QA ตรวจรวม) ── Gate 3 (ปล่อย server ก่อนแอป)
```

- **CP-1** (หลัง T-01): `npx vitest run test/api/c03- test/unit/c03-` → FAIL/PASS ตรงรายการคาด · `npm run typecheck` (`tsconfig` ครอบ `test/`) คาด FAIL **เฉพาะ** error ที่มาจากสิ่งที่ T-02 จะเพิ่ม: TS2307 `@shared/received-date` และฟิลด์ `receivedDate`/`dateOnly` บน `SubmissionOp` — QA บันทึกรายการ error ใน evidence; error อื่น = หยุดรายงาน PM · `trace-check --stage ready` PASS
- **CP-2** (หลัง T-02): c03 PASS · `npm test` · `npm run typecheck` · `ownership-check.mjs` สะอาด · `git status --short` ไม่มี `src/`, `migrations/`, `worker/lib/late.ts`
- **CP-3** (T-03): qa-report + evidence → PM รายงานเจ้าของงาน (รวมยืนยันการตีความ Q2 ตาม brief)

## Endpoint ใหม่ที่ออกแบบในเฟสนี้

| EP ใน api-contract | แทน "EP-ใหม่" ของ AC |
|---|---|
| — ไม่มี endpoint ใหม่ · ไม่มี AC ที่เป็น EP-ใหม่ (EP-01/EP-03 เพิ่มฟิลด์ใน v3, EP-02/04/05 เดิม) | — |

## Dependency ที่ติดตั้งแล้วสำหรับงานนี้

| package | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| — ไม่มี (zod, vitest, @cloudflare/vitest-pool-workers เดิม) | | |

## งานของ DB Specialist / DevOps

- ไม่มี migration (BR-11, Q1 ก) · ไม่มี CI/deploy ในงานนี้ — ปล่อยตามคำสั่งเจ้าของงานเท่านั้น

## จุดเสี่ยงและลำดับ

- 💰 ตัวเลขช้า: เปลี่ยนเฉพาะ `late` ผ่านกฎเดิม (`lateFixForCells`/`lateFixForAssignment`) · ร้อยละ/ค้าง/คะแนนไม่เปลี่ยน — กันด้วย AC-17/20 · พิมพ์ปีผิด (พ.ศ.) ถูกปฏิเสธ (`isCeDate` 1900–2099) · วันมอบหมายแบบ พ.ศ. ในข้อมูลเก่าไม่ถูกใช้เป็นพื้น (D-04)
- 🔄 ออฟไลน์/รีเพลย์: วันที่เป็นสตริงวัน → ส่งซ้ำ/ลองใหม่ได้ผลเดิม · clamp 7 วันไม่ทำวันหาย (AC-06) · ตรวจวันที่ตอนเขียน (op ค้างนานแล้ววันมอบหมายถูกเลื่อน → `invalid` ใน "ส่งไม่สำเร็จ") · `dateOnly` แพ้ `superseded` ตาม event_at · วันมอบหมายที่ถูกแก้พร้อมกันกับการเขียนไม่ได้ guard ใน SQL (ยอมรับ: พื้นวันที่ไม่ใช่ตัวเลขเงิน, `late` ยัง guard ด้วย lateFix)
- 🔄 แอปเก่า: ไม่ส่งฟิลด์ = เดิม (AC-21) · **server ก่อนแอปเสมอ**: server เก่า + แอปใหม่ = วันที่ถูกทิ้งเงียบ และ op `dateOnly` กลายเป็นแก้คะแนนด้วย score ใน op → ui-redesign ห้ามปล่อยก่อน server v3 (PM ใส่ใน Gate 3/release note)
- ผลข้างเคียงที่รับ (D-05): แก้วันที่ระหว่างรอบสแกนกับการใส่คะแนนรอบเดียวกัน → op คะแนนได้ `already_submitted`
- audit EP-01 `after.late` เป็น 0/1 (รูปเดิม) — เทสต์เทียบแบบ boolean

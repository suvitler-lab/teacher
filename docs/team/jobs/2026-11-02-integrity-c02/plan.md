# Technical plan: เพิ่มคะแนนเต็มแล้วถามปรับคนที่ได้เต็มเดิม (integrity-c02)

โดย Tech Lead · 2026-11-02 · สัญญา: `docs/team/api-contract.md` EP-05 (v2) + EP-04 เดิม · ข้อตัดสินใจ: `decisions-local.md` D-integrity-c02-01..07 · branch `team/2026-11-02-integrity-c02` (แตกจาก C-01 @ 2285c17)

## แนวทาง

- ถาม 2 จังหวะผ่าน EP-05 เดียว (D-integrity-c02-01): คำขอเดิม → `409 raise_choice_required {count, from, to}` → แอปใหม่เปิดกล่องถาม → ส่งซ้ำพร้อม `raise_choice: adjust|keep` + `raise_from` · แอปเก่าเห็น `message` "มี N คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง" ในฟอร์ม (Gate 1 Q3)
- server (`worker/routes/assignments.ts` เท่านั้น): ทุกอย่างใน `batchAtEpoch` เดียว — guard `full = raise_from` + guard เดิม → audit ช่อง (`INSERT … SELECT` ก่อนปรับ) → `UPDATE` ช่องที่ `status='submitted' AND score = raise_from` → upsert งาน/ห้อง/late เดิม → เติม `after` ของ audit ช่องจากค่าจริง → audit งาน (`raise` + count จาก SQL) batch_id เดียวกัน (D-integrity-c02-02)
- ย้อนกลับ = EP-04 `bulk-undo` เดิม ไม่แก้ `submissions.ts` (audit ช่อง action/method `bulk`, before/after รูป `Submission`) (D-integrity-c02-03)
- client (`AssignmentModal.tsx` เท่านั้น): กล่องถามด้วย `Dialog` เดิมแบบ BulkConfirm, toast ค้างพร้อม "ย้อนกลับ", เรียก `onSaved` ซ้ำหลังย้อนเพื่อโหลดใหม่ → ไม่แตะ `Gradebook.tsx` (D-integrity-c02-04) · ไม่แก้ `shared/types.ts` (D-integrity-c02-05)
- ไม่แตะ: `submissions.ts`, `outbox.ts`, `Scan.tsx`, `Gradebook.tsx`, `Overlays.tsx`, `shared/**` → AC-07 (op ค้างคิว) เป็นพฤติกรรมเดิม ตรวจด้วยเทสต์กันถอย
- เทสต์ที่ล้มก่อนแก้เป็นงานแรกของ QA (T-01) ซึ่งเป็นเจ้าของไฟล์เทสต์ใหม่ทั้งหมดของงาน (D-integrity-c02-07) · ไม่มี migration · ไม่มี dependency ใหม่

## การเปลี่ยนแปลงต่อส่วน

| ส่วน | เปลี่ยนอะไร |
|---|---|
| `worker/routes/assignments.ts` | schema `raise_choice`/`raise_from` (+refine คู่กัน) · ลำดับตรวจตาราง EP-05 (full_score_changed → score_over_full → class_year_mismatch → raise_choice_required) ทั้งก่อนเขียนและหลัง batch ล้ม · statement ใหม่ใน batch: guard `raise_from`, guard "เพิ่มโดยไม่ถาม", audit ช่อง, UPDATE ช่อง, เติม after, count ใน audit งาน · ผล `raise` |
| `src/components/AssignmentModal.tsx` | จับ `409 raise_choice_required` → กล่องถาม (nested `Dialog`, overlay z-index 150, 3 ปุ่ม, busy) → ส่งซ้ำ · `full_score_changed` แสดงในฟอร์ม · toast "บันทึกแล้ว · ปรับเป็นเต็มใหม่ N คน" + ย้อนกลับ (EP-04) + ข้อความ modified_since ของตัวเอง |
| `test/api/c02-*.test.ts`, `test/unit/c02-*.test.ts(x)` (ใหม่ · QA) | AC ฝั่ง server ทั้งหมด + กล่องถาม jsdom — เขียนก่อนแก้ ต้องเห็น FAIL ตามคาด |
| `test/api/volume.test.ts` + เทสต์เดิมที่ save งาน (BE) | วัดงบอ่าน/เขียนกรณีปรับ 200 ช่อง · เทสต์เดิมที่ล้มเพราะ BR-10 เท่านั้นจึงแก้ได้ (ดู T-02) |
| `docs/team/jobs/…/pages.json` (ใหม่ · QA) | หน้าฟอร์มแก้ไขงาน / กล่องถาม / toast — ดูตารางด้านล่าง |

## Tasks (PM ลง board)

| Task | งาน | ตำแหน่ง | เขียนได้เฉพาะ | หน้า pages.json | AC | รอ Task | ขนานกับ | พอร์ต |
|---|---|---|---|---|---|---|---|---|
| T-01 | เทสต์ที่ล้มก่อนแก้ (API + jsdom กล่องถาม) + test-plan + pages.json + ภาพ before · รันแล้วบันทึก FAIL/PASS ก่อนแก้ | QA | test/api/c02-*.test.ts, test/unit/c02-*.test.ts, test/unit/c02-*.test.tsx, docs/team/jobs/2026-11-02-integrity-c02/test-plan.md, docs/team/jobs/2026-11-02-integrity-c02/qa-report.md, docs/team/jobs/2026-11-02-integrity-c02/pages.json, docs/team/jobs/2026-11-02-integrity-c02/evidence/qa/**, docs/team/jobs/2026-11-02-integrity-c02/evidence/shots/before/** | asg-edit-form, asg-raise-ask, asg-raise-ask-one, asg-raise-done, asg-raise-stale (before) | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15 | — | — | 4101 |
| T-02 | server EP-05: ถาม/ปรับ/คงไว้ใน batch เดียว + audit batch_id เดียว + guard ใหม่ + ผล `raise` (ย้อนกลับผ่าน EP-04 ได้) · เทสต์ T-01 ฝั่ง API ผ่าน + ชุดเต็ม | Back-End | worker/routes/assignments.ts, test/api/volume.test.ts, test/api/final-audit.test.ts, test/api/race-r1.test.ts, test/api/manage.test.ts, test/api/guards-in-transaction.test.ts, test/api/late-flag.test.ts, test/api/audit-atomic.test.ts, test/api/school-year.test.ts, test/api/qa-m1-03.test.ts, docs/team/jobs/2026-11-02-integrity-c02/dev-notes/backend.md, docs/team/jobs/2026-11-02-integrity-c02/evidence/t02-* | — | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-12, AC-13, AC-14, AC-15 | T-01 | T-03 | 4102 |
| T-03 | AssignmentModal: กล่องถาม (Dialog เดิม) + ส่งซ้ำพร้อมคำตอบ + error ในฟอร์ม + toast ย้อนกลับ · unit ของตัวเอง + ภาพ after 4 อุปกรณ์ | Front-End | src/components/AssignmentModal.tsx, test/unit/assignment-modal-raise.test.tsx, docs/team/jobs/2026-11-02-integrity-c02/dev-notes/frontend.md, docs/team/jobs/2026-11-02-integrity-c02/evidence/t03-*, docs/team/jobs/2026-11-02-integrity-c02/evidence/shots/after/**, src/pages/Gradebook.tsx | asg-edit-form, asg-raise-ask, asg-raise-ask-one, asg-raise-done, asg-raise-stale (after) | AC-01, AC-02, AC-03, AC-05, AC-06, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15 | T-01 (โค้ด) · T-02 (ภาพ after) | T-02 | 4103 |
| T-04 | QA ตรวจรวม: เทสต์ c02 ทั้งหมด PASS + ชุดเต็ม + ภาพ after ตรวจ AC-11 ทุกอุปกรณ์ + กันถอย AC-07/08/09 + qa-report | QA | test/api/c02-*.test.ts, test/unit/c02-*.test.ts, test/unit/c02-*.test.tsx, docs/team/jobs/2026-11-02-integrity-c02/test-plan.md, docs/team/jobs/2026-11-02-integrity-c02/qa-report.md, docs/team/jobs/2026-11-02-integrity-c02/pages.json, docs/team/jobs/2026-11-02-integrity-c02/evidence/qa/** | ทุกหน้า (ตรวจภาพ after) | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15 | T-02, T-03 | — | 4104 |

ตรวจแล้ว: T-02 ∥ T-03 ไม่มีไฟล์ทับกัน (BE = worker + เทสต์ API เดิม · FE = AssignmentModal + `test/unit/assignment-modal-raise.test.tsx` ซึ่งไม่ใช่ `c02-*`) · ไฟล์ `c02-*`, test-plan, qa-report, pages.json, `evidence/qa/**` เป็นของ QA เท่านั้น (T-01 แล้ว T-04 เรียงกัน ไม่ขนาน) · `evidence/shots/before/**` = T-01, `evidence/shots/after/**` = T-03 · ไม่มีไฟล์ร่วม (ไม่แก้ shared/types.ts, package.json) · ทุก AC-01..15 มี task · พอร์ต 4101–4104 ไม่ซ้ำ · ตำแหน่งชื่อมาตรฐาน · หลักฐานบันทึกผ่าน `evidence.mjs add` เท่านั้น

### สิ่งที่แต่ละ task ต้องพิสูจน์

- **T-01 (QA)** ใช้ `seed()`/`login()`/`call`/`callIn`/`gateBatch` ของ `test/api/helpers.ts` · fixture F ตาม requirements (a1 เต็ม 10 ห้อง 1+2, ก ข ค ง จ ฉ ช ซ) สร้างใน test เอง · คำนวณผลคาดจากกฎก่อนรัน
  - API (`test/api/c02-raise-full.test.ts` แนะนำชื่อ): AC-01 (adjust → 200, `raise.count` 3, ก ข ซ = 20, status/late/submitted_at เดิม, ค ง จ ฉ ช 9 ฟิลด์เดิม) · AC-02 (keep → ช่องเดิม, ไม่มี audit submission, audit งาน `after.raise.choice = keep, count 3`) · AC-03 (3 แบบ: epoch เปลี่ยนด้วย `gateBatch` → 409 `epoch_changed`; ห้องผิดปี → 422; full/ช่อง/audit ไม่เปลี่ยน — กรณี "statement หนึ่งล้ม" จำลองตามที่ทำได้ ถ้าจำลองไม่ได้ให้บันทึก NOT RUN พร้อมเหตุ) · AC-04 (audit 4 แถว batch_id เดียว, entity_id `a1:<sid>`, before.score 10 → after.score 20, ตรงกับ `raise.batchId`) · AC-05 (`gateBatch` ค้างคำขอ adjust แล้วรับ ฌ เต็ม 10 ก่อนปล่อย หรือรับ ฌ ระหว่างคำขอแรกกับคำขอที่สอง → count 4, ฌ = 20) · AC-06 (raise_from 10 แต่ DB 15 → 409 `full_score_changed` `currentFullScore` 15 ไม่มีอะไรเปลี่ยน + แบบแข่งใน batch) · AC-07 (หลัง adjust: op `fullScoreAtScan` 10 → `full_score_changed` currentFullScore 20 ฌ ไม่มีแถว · op `fullScoreAtScan` 20 → ok) · AC-08 (a2 ไม่มีใครได้ 10 → 200 `raise: null` ไม่มี audit submission · สร้างใหม่ · แก้ชื่อ/วัน) · AC-09 (a3 → 409 score_over_full over 2 · a4 → 200 ค ยัง 8) · AC-12 (นับจาก DB รวม ซ ห้อง 2 moved → count 3 ใน 409) · AC-13 (หลัง adjust: `GET /api/assignments/a1/submissions` → full 20, ก 20 · ร้อยละตาม BR-03 ด้วย `shared/metrics`) · AC-14 (EP-04 ด้วย `raise.batchId` → ก ข ซ = 10, full 20, audit restore 3 แถว · แก้ ก เป็น 18 ก่อน → 409 modified_since ไม่มีอะไรเปลี่ยน · ย้อนซ้ำ → alreadyUndone) · AC-15 (ไม่ส่ง raise_choice → 409 `raise_choice_required` count 3 + message ตรงตัว ไม่มีอะไรเปลี่ยน · a2 → 200 · ไม่มี cookie → 401) · schema: raise_choice ไม่มี raise_from → 422
  - jsdom (`test/unit/c02-assignment-modal-raise.test.tsx` แนะนำชื่อ, mock `api.post` แบบ `test/unit/outbox-order.test.ts`): AC-10 (409 → กล่อง role=dialog aria-modal, ข้อความชื่องาน/3 คน/10/10 → 20/20/คงไว้ 10/20, ปุ่ม 3 ปุ่มลำดับ ยกเลิก-คงไว้-ปรับ, ปุ่มปรับ class primary, Esc/ยกเลิก/แตะนอก = ไม่ส่งคำขอ ฟอร์มค่าเดิม, กดสองครั้ง = post 2 ครั้งรวมคำขอแรก) · AC-01/02 (คำขอที่สองมี `raise_choice` + `raise_from: 10`) · AC-05 (toast ใช้ count 4 จาก server) · AC-06/AC-03 (error แสดงในฟอร์ม ฟอร์มยังเปิด ค่าคงอยู่) · AC-13/14 (toast "บันทึกแล้ว · ปรับเป็นเต็มใหม่ 3 คน" + ย้อนกลับ → post EP-04 `{batchId}` → onSaved ถูกเรียกอีกครั้ง · modified_since → ข้อความของ D-integrity-c02-06) · AC-11 ตัวเลข 1 และ 45
  - คาดว่า **FAIL ก่อนแก้**: AC-01, 02, 04, 05, 06, 10, 12, 13 (ส่วน count/ปรับ), 14, 15 และ jsdom ทั้งหมดของกล่องถาม · **PASS ก่อนแก้** (กันถอย): AC-03 (ไม่มี raise_choice — ส่วน guard เดิม), AC-07, AC-08, AC-09 — ผลต่างจากนี้ให้หยุดรายงาน PM (ไม่ปรับเทสต์ให้ตรงโค้ด)
  - test-plan.md: TC-xx ทุก AC (trace-check ready ต้องเห็น TC อ้าง AC ครบ 15) · ภาพ before: `node <skill-dir>/scripts/shots.mjs --job docs/team/jobs/2026-11-02-integrity-c02 --pages docs/team/jobs/2026-11-02-integrity-c02/pages.json --label before --url http://127.0.0.1:4101` (fixture-server พอร์ต 4101, ปิดเมื่อจบ) — before ของ asg-raise-ask จะเห็นบั๊ก (บันทึกทันที ไม่มีกล่อง) ใช้เป็นหลักฐาน
- **T-02 (BE)**: เทสต์ API ของ T-01 ผ่านทั้งหมด **ไม่แก้ไฟล์ `c02-*`** (ผิดสัญญา → ขอ QA ผ่าน PM) · `npm test` ชุดเต็ม — เทสต์เดิมใน "เขียนได้เฉพาะ" แก้ได้เฉพาะเมื่อล้มเพราะ BR-10 (เพิ่มเต็มโดยไม่ส่ง raise_choice ขณะมีคนได้เต็มเดิม) โดยเพิ่ม `raise_choice`/`raise_from` และบันทึกเหตุผลใน dev-notes · ล้มด้วยเหตุอื่นหรือไฟล์นอกรายการ → หยุดรายงาน PM · `volume.test.ts`: เพิ่มกรณี "เพิ่มเต็ม + ปรับ 200 ช่อง (5 ห้อง × 40)" งบแนะนำ read ≤ 2,000 / written ≤ 1,000 / statements ≤ `MAX_QUERIES` และกรณีแก้งานเดิม (เต็มเท่าเดิม) ยังอยู่ในงบเดิม · ตรวจด้วยมือว่า `after` ของ audit ช่องเท่ากับ `mapSubmission` ของแถวจริง (ไม่งั้น EP-04 ตอบ modified_since ผิด) · `npm run typecheck` · ห้ามแตะ `submissions.ts`
- **T-03 (FE)**: jsdom ของ T-01 ผ่าน **ไม่แก้ไฟล์ `c02-*`** · unit ของตัวเอง `test/unit/assignment-modal-raise.test.tsx` (focus วนในกล่องซ้อน, ปิดกล่องคืน focus ให้ปุ่มบันทึก, busy) · เทสต์เดิมที่ render AssignmentModal/Gradebook (`gradebook-*.test.tsx`) ผ่าน · ห้ามแตะ `Gradebook.tsx` — ถ้าการเรียก `onSaved` ซ้ำไม่ทำให้สมุดโหลดใหม่ หยุดรายงาน PM (D-integrity-c02-04) · ข้อความตาม BR-08 (Designer ปรับถ้อยคำได้ → ถ้าไม่มี Designer ใช้ข้อความ BR-08 ตรงตัว) · ภาพ after (ต้องรอ T-02 เพราะ fixture-server ใช้ worker จริง): `shots.mjs … --label after --url http://127.0.0.1:4103` 4 อุปกรณ์ใน context.md × 5 หน้า · ตรวจ AC-11 เอง: 3 ปุ่มเห็นครบไม่เลื่อนแนวนอน, ชื่องาน 80 ตัวไม่ล้น, ≥ 13px, ปุ่ม ≥ 44px บนจอสัมผัส · `npm run typecheck` · `npm run build`
- **T-04 (QA)**: `npx vitest run test/api/c02-* test/unit/c02-*` PASS ทั้งหมด · `npm test` ชุดเต็ม (≥ baseline หลัง C-01 + ใหม่) · `npm run typecheck` · ตรวจภาพ after ทุกหน้า × 4 อุปกรณ์ตาม AC-11 (ทำ `visual-check.json`/sheet ใน `evidence/qa/`) · ตรวจ AC-07 ไม่ถดถอย · qa-report.md · ส่ง Gate V (กล่องถามบน 4 อุปกรณ์)

### หน้าใน `pages.json` ของงาน (QA สร้างใน T-01 · fixture `scripts/fixture-server.cjs` ข้อมูลสมมติ · login ด้วยค่าทดสอบของ fixture แบบ pages.json ของ C-01)

| page | วิธีเข้า (setup ผ่าน API ของ fixture แล้วเปิดสมุดคะแนน → คลิกหัวคอลัมน์งาน → "แก้ไขงาน") | ใช้กับ AC |
|---|---|---|
| `asg-edit-form` | ฟอร์มแก้ไขงานเปิดอยู่ ยังไม่แก้อะไร (หน้าตาต้องเหมือน before) | AC-10 (บริบท) |
| `asg-raise-ask` | งานหนึ่งของห้อง ~45 คน: `/bulk all-submitted` + `/bulk full-score` → แก้คะแนนเต็ม 10 → 20 → บันทึก → กล่องถาม (45 คน) | AC-10, AC-11 |
| `asg-raise-ask-one` | งานชื่อ 80 ตัวอักษร (ตั้งผ่าน EP-05 ใน setup) มี 1 คนได้เต็ม → เพิ่มเต็ม → กล่องถาม (1 คน) | AC-11 |
| `asg-raise-done` | ต่อจาก ask → กด "ปรับเป็น 20/20" → toast "บันทึกแล้ว · ปรับเป็นเต็มใหม่ N คน" + ปุ่ม "ย้อนกลับ" | AC-13, AC-14 |
| `asg-raise-stale` | กล่องถามเปิด → setup แก้เต็มของงานเดียวกันผ่าน API เป็น 15 → กด "ปรับ" → ข้อความ full_score_changed ในฟอร์ม | AC-06 |

- setup ต้องทำซ้ำได้ (แต่ละรอบรีเซ็ตคะแนนเต็มกลับ 10 ก่อน) · ภาพ before ของ `asg-raise-*` จะไม่มีกล่องถาม (บันทึกทันที) — `ready` ของ before ให้ยอมรับสภาพนั้น หรือแยกเงื่อนไขตาม label ตามที่ QA เห็นสมควร
- มีข้อความ/กล่องใหม่ → **Gate V** เปิดตาม brief (กล่องถามใน "แก้ไขงาน" 4 อุปกรณ์)

## ลำดับและ checkpoint

```
T-01 (QA: เทสต์ล้ม + pages + before) ──CP-1──┬── T-02 (BE) ───────────────┬──CP-2── T-03 ภาพ after ──CP-3── T-04 (QA) ── Gate V
                                             └── T-03 (FE โค้ด + unit) ──┘
```

- **CP-1** (หลัง T-01): PM รัน `npx vitest run test/api/c02- test/unit/c02-` → FAIL/PASS ตรงรายการคาดใน T-01 · `npm run typecheck` PASS · `trace-check --stage ready` ผ่าน (test-plan ครบ) · ภาพ before ครบ 4 อุปกรณ์ · `ownership-check` สะอาด
- **CP-2** (หลัง T-02 + โค้ด T-03): `npx vitest run test/api/c02- test/unit/c02- test/unit/assignment-modal-raise` PASS · `npm test` ชุดเต็ม · `npm run typecheck` · diff เฉพาะไฟล์ในขอบเขต (`ownership-check.mjs`) · `git diff --stat` ไม่มี `submissions.ts`, `Gradebook.tsx`, `shared/`
- **CP-3** (หลังภาพ after ของ T-03): `npm run build` · ภาพ after 4 อุปกรณ์ × 5 หน้า → T-04

## Endpoint ใหม่ที่ออกแบบในเฟสนี้

| EP ใน api-contract | แทน "EP-ใหม่" ของ AC |
|---|---|
| EP-05 `POST /api/assignments` (v2: `raise_choice`/`raise_from`, ผล `raise`, `409 raise_choice_required`, `409 full_score_changed`) | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10, AC-12, AC-13, AC-14, AC-15 |
| EP-04 `POST /api/assignments/:id/bulk-undo` (เดิม ไม่เปลี่ยน — ผู้เรียกใหม่) | AC-14 |
| EP-02 `GET /api/assignments/:id/submissions` (เดิม ไม่เปลี่ยน) | AC-13 |
| — (AC-07 = EP-01 เดิม, AC-11 = หน้าจอ) | N/A ตาม requirements |

## Dependency ที่ติดตั้งแล้วสำหรับงานนี้

| package | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| — ไม่เพิ่ม | | ใช้ vitest / @cloudflare/vitest-pool-workers / jsdom ที่มีอยู่ |

## งานของ DB Specialist / DevOps

- ไม่มี (ไม่มี migration ตาม brief · ห้าม deploy/push/merge จนเจ้าของงานสั่ง) · ธง 🗑 dry-run/restore = N/A ที่ PM รับ (Gate 1) ตรวจ atomic + undo ด้วยเทสต์ API แทน

## จุดเสี่ยงและลำดับ

- 💰 ร้อยละ/สะสม: ถ้า audit `after` ไม่ตรง `mapSubmission` ทุกฟิลด์ (late boolean, score ตัวเลข, null) EP-04 จะตอบ `modified_since` ทั้งที่ไม่มีใครแก้ → ย้อนกลับใช้ไม่ได้ · มีเทสต์ AC-14 กัน
- `UPDATE` ช่องต้องอยู่หลัง audit `INSERT … SELECT` (เห็นค่าก่อนปรับ) และเงื่อนไขเลือกช่องต้องเหมือนกันทั้งสอง statement · guard `full = raise_from` ต้องอยู่ก่อนทั้งคู่ — ไม่งั้นนับ/ปรับจากเต็มที่เปลี่ยนแล้ว (AC-06)
- guard "เพิ่มโดยไม่ถาม" ใน batch อาจทำให้เทสต์เดิมที่เพิ่มคะแนนเต็มบนงานที่มีคนได้เต็มล้ม (คาด 0–2 ไฟล์ จาก grep: final-audit เพิ่มเป็น 15 หลังล้าง = ไม่มีคนได้เต็ม → น่าจะผ่าน) → อยู่ในขอบเขต T-02 ล่วงหน้าแล้ว แต่แก้ได้เฉพาะตามกฎ BR-10
- งบ volume: ปรับ 200 ช่อง = เขียน ~400 แถว (ช่อง + audit) + เติม after อีก 200 — อาจเกินงบ "แก้งาน" เดิม (written ≤ 200) → ใช้งบแยกแบบ R-06 (วัดและรายงาน)
- กล่องซ้อนใน AssignmentModal: `Dialog` stack รองรับ nested แล้ว (BulkConfirm ไม่ซ้อน) — focus/Escape ต้องปิดเฉพาะกล่องบน ไม่ปิดฟอร์ม · overlay ของกล่องบนต้องไม่ส่ง click ทะลุไปปิดฟอร์ม
- toast ย้อนกลับอยู่หลังฟอร์มปิด (component unmount) → ต้องใช้ notify กลางและค่าที่ capture ไว้ใน closure · ถ้าครูออกจากสมุดคะแนนแล้วกดย้อน การเรียก `onSaved` ซ้ำต้องไม่พัง (T-03 ทดสอบ)
- branch นี้ต่อจาก C-01 ที่ยังไม่ merge main → ถ้า C-01 ถูกแก้อีกก่อน merge ไฟล์ที่ชนได้คือ `api-contract.md` เท่านั้น (เพิ่มท้าย)


> PM 2 พ.ย. (รอบแก้ 1/3): ขยายขอบเขต T-03 เพิ่ม src/pages/Gradebook.tsx เฉพาะการแก้ R-01 (onSaved ของ toast ย้อนกลับต้องไม่ทำลายฟอร์ม/ห้องที่เปิดอยู่ใหม่) — C-01 commit แล้วจึงไม่ชน
> PM 2 พ.ย. (รอบแก้ 2/3, เจ้าของสั่ง "แก้ข้อสแกนด้วย"): แก้ AC-13 ส่วนหน้าเลือกงานของสแกน — เพิ่ม startSetupRefresh ใน src/pages/Scan.tsx (รีเฟรช bootstrap+dashboard ทุก 60 วิเมื่อมองเห็น / กลับมา / ออนไลน์) + test/unit/c02-scan-setup-refresh.test.ts · PM แก้เองเพราะเล็ก; QA ตรวจซ้ำบนเบราว์เซอร์

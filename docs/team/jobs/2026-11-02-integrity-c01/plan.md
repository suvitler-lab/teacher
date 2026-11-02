# Technical plan: คะแนนไม่ถูกเขียนทับเมื่อสแกนช่องที่ส่งแล้ว (integrity-c01)

โดย Tech Lead · 2026-11-02 · สัญญา: `docs/team/api-contract.md` EP-01 (v1) · ข้อตัดสินใจ: `decisions-local.md` D-integrity-c01-01..06

## แนวทาง

- กันที่ server (D-integrity-c01-01): ใน `apply()` ของ `POST /api/submissions/batch` หลังเช็ก `superseded` เพิ่ม `alreadySubmitted(op, before)` = op รับงาน (`isReceive`) + ช่องที่ใช้ตัดสิน (`effective`) เป็น `submitted` + ไม่เข้าข้อยกเว้นรอบเดียวกัน (ช่อง method camera/hid/manual และ scan_session_id = op.scanSessionId และ score null และ op.score != null) → ตอบ `{ result: "already_submitted", submission: mapSubmission(before) }` ไม่เข้า `pending` ไม่มี audit
- เส้นทาง "lost" (บรรทัด ~455): `judge(...) ?? (superseded ตามเวลา) ?? (alreadySubmitted → already_submitted) ?? superseded` · ถ้า op ที่ได้ `already_submitted` เพราะแถว pending ของคำขอเดียวกันและแถวนั้น lost ให้ตัดสิน op นั้นใหม่กับ `fresh.world`
- การแข่งกัน: ใช้ `cellsGuard` เดิม ไม่แตะ SQL ของ `stillValid` (D-integrity-c01-02 — เหตุผล `[void, รับงาน]` ในคำขอเดียว)
- type: เพิ่ม `| { opId: string; result: "already_submitted"; submission: Submission }` ใน `SubmissionOpResult` (`shared/types.ts`) — ทำใน T-01 เพื่อให้ T-02/T-03/T-04 ขนานกันได้
- client: outbox เอาออกจากคิวเหมือน `ok` (Gate 1 Q2) · รายการเก่าที่แอปรุ่นก่อนพักไว้ไม่กั้น/ไม่ติดเครื่องหมาย (Q3, D-integrity-c01-05) · หน้าที่เปิดอยู่รับ `submission` เป็นค่าช่อง · หน้าสแกนที่ mount อยู่แสดงการ์ดสแกนซ้ำเดิม (D29, D-integrity-c01-06)
- เทสต์ที่ล้มก่อนแก้เป็น task แรก (T-01) — ไม่มี migration ไม่มี dependency ใหม่ ไม่มีข้อความ/หน้าจอใหม่

## การเปลี่ยนแปลงต่อส่วน

| ส่วน | เปลี่ยนอะไร |
|---|---|
| `test/api/c01-no-overwrite.test.ts` (ใหม่) | ฉ1–ฉ6 + AC ฝั่ง server ทั้งหมด (รายละเอียดใต้ตาราง Tasks) — เขียนก่อนแก้ ต้องเห็น FAIL ตามคาด |
| `shared/types.ts` | เพิ่ม variant `already_submitted` (type เท่านั้น) |
| `worker/routes/submissions.ts` | helper `alreadySubmitted` + เรียกในลูป `apply` หลัง `superseded` + เส้นทาง lost · ไม่แตะ `stillValid`, `/bulk`, `/bulk-undo`, GET |
| `test/api/server-intent.test.ts` | เทสต์ "R-01: the screens' methods still go through": ใส่ `score: 8` ให้ op `manual` ของ st2 (D-integrity-c01-04 — รอ PM ยืนยัน) ผลคาด ok ×4 เหมือนเดิม |
| `src/lib/outbox.ts` | `already_submitted` → `outboxRemove` + `emit` (เหมือน ok/duplicate) · เพิ่มใน `NON_BLOCKING` · `failedPairKeys` ไม่นับ reason นี้ (เหมือน superseded) |
| `src/pages/Gradebook.tsx` | ตัวฟัง `onResult` (~บรรทัด 150) รับ `already_submitted` + `submission` เป็นค่าช่องด้วย (บรรทัดเดียว) |
| `src/components/Overlays.tsx` | `REASON.already_submitted = "ส่งไปแล้ว — ไม่บันทึกซ้ำ"` (ข้อความเดิมของหน้าสแกน) สำหรับรายการที่แอปรุ่นเก่าพักไว้ |
| `src/pages/Scan.tsx` | ตัวฟัง `onResult` (~410): `already_submitted` → อัปเดต `subsBox` จาก `submission` เสมอ · ถ้าหน้าสแกน mount และ `op.assignmentId` = รอบที่เปิด: การ์ด warning เดิม (ชื่อ, "ส่งไปแล้ว — ไม่บันทึกซ้ำ", คะแนนจากระบบ), `beep.dup()`, `vibrate(60)` · เอารายการล่าสุดของ op นี้ออก (เก็บ `opId` ใน recent) · `pending.value === op.studentId` → ปิดแป้น · ไม่เรียกข้อความ "ส่งไม่สำเร็จ" · หลายผลของเด็กคนเดียวในรอบส่งเดียว (รับงาน+คะแนนที่พิมพ์) แสดงการ์ด/เสียงครั้งเดียว |
| `docs/team/jobs/…/pages.json` (มีแล้ว) | หน้าจอสถานะ "ส่งแล้ว — ไม่บันทึกซ้ำ" จาก server 3 โหมด + 2 หน้าเดิม (ด้านล่าง) |

## Tasks (PM ลง board)

| Task | งาน | ตำแหน่ง | เขียนได้เฉพาะ | หน้า pages.json | AC | รอ Task | ขนานกับ | พอร์ต |
|---|---|---|---|---|---|---|---|---|
| T-01 | เทสต์ที่ล้มก่อนแก้ฝั่ง server (ฉ1–ฉ6 + AC server) + เพิ่ม type `already_submitted` · รันแล้วบันทึกผล FAIL/PASS ก่อนแก้ | Back-End | test/api/c01-no-overwrite.test.ts, shared/types.ts, docs/team/jobs/2026-11-02-integrity-c01/dev-notes/backend-tests.md, docs/team/jobs/2026-11-02-integrity-c01/evidence/t01-* | — | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-13, AC-14 | — | — | 4101 |
| T-02 | server judge `already_submitted` + ข้อยกเว้นรอบเดียวกัน + เส้นทาง lost ใน batch · แก้เทสต์ R-01 ตาม D-integrity-c01-04 · เทสต์ T-01 ผ่านทั้งหมด + ชุดเต็ม | Back-End | worker/routes/submissions.ts, test/api/server-intent.test.ts, test/api/volume.test.ts, docs/team/jobs/2026-11-02-integrity-c01/dev-notes/backend.md, docs/team/jobs/2026-11-02-integrity-c01/evidence/t02-* | — | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-13, AC-14 | T-01 | T-03, T-04 | 4102 |
| T-03 | outbox เอา `already_submitted` ออกจากคิวเงียบๆ + ไม่กั้น/ไม่ติดเครื่องหมายรายการเก่า + สมุดคะแนนรับค่าจากระบบ + ข้อความในรายการส่งไม่สำเร็จ | Front-End | src/lib/outbox.ts, src/pages/Gradebook.tsx, src/components/Overlays.tsx, test/unit/c01-outbox-already-submitted.test.ts, docs/team/jobs/2026-11-02-integrity-c01/dev-notes/frontend-outbox.md | — (ไม่เปลี่ยนหน้าตา) | AC-09, AC-14 | T-01 | T-02, T-04 | 4103 |
| T-04 | หน้าสแกนแสดง "ส่งไปแล้ว — ไม่บันทึกซ้ำ" + ค่าจากระบบเมื่อ server ตอบ `already_submitted` (เฉพาะตอนหน้าเปิด) + ปิดแป้นโหมดทีละคน + ภาพ before/after | Front-End | src/pages/Scan.tsx, test/unit/c01-scan-already-submitted.test.ts, docs/team/jobs/2026-11-02-integrity-c01/pages.json, test/unit/c01-scan-view-lifecycle.test.tsx, docs/team/jobs/2026-11-02-integrity-c01/dev-notes/frontend-scan.md | scan-full-stale, scan-later-stale, scan-type-stale, scan-type, scan-later (pages.json ของ job) | AC-05, AC-09, AC-12 | T-01 (โค้ด) · T-02 (ภาพ after) | T-02, T-03 | 4104 |
| T-05 | เทสต์กันถอยของ QA: [void, รับงาน] ช่องเดียวกันคำขอเดียวบนช่องที่ส่งแล้ว (R-02) + ปรับ test-plan | QA | test/api/c01-no-overwrite.test.ts, docs/team/jobs/2026-11-02-integrity-c01/test-plan.md, docs/team/jobs/2026-11-02-integrity-c01/qa-report.md, docs/team/jobs/2026-11-02-integrity-c01/evidence/qa/** | — | AC-07 | T-02 | T-04 | 4105 |

ตรวจแล้ว: T-02 ∥ T-03 ∥ T-04 ไม่มีไฟล์ทับกัน (`evidence/**` เป็นค่าเริ่มต้นของ Front-End ทั้งสอง task — ใช้ชื่อไฟล์ขึ้นต้น `t03-` / `t04-` และ `evidence/shots/` เป็นของ T-04 เท่านั้น · บันทึกหลักฐานผ่าน `evidence.mjs add`) · `shared/types.ts` มีเจ้าของเดียว (T-01) · ทุก AC-01..14 มี task รับ · พอร์ต 4101–4104 ไม่ซ้ำ · ตำแหน่งชื่อมาตรฐาน

### สิ่งที่แต่ละ task ต้องพิสูจน์

- **T-01** (`test/api/c01-no-overwrite.test.ts`, ใช้ `seed()`/`login()` ของ `test/api/helpers.ts`, คำนวณผลคาดจากกฎก่อนรัน): ฉ1 (AC-01 hid/camera/manual: ผล + ช่อง 9 ฟิลด์เท่าเดิม + ไม่มี audit ของ opId) · ฉ2/ฉ6 (AC-02 score ไม่เป็น null) · ฉ4 (AC-03 หลัง `/bulk all-submitted`) · AC-04 (คำขอเดียวและ 2 คำขอ: ok/ok, audit create+update, submitted_at = เวลารับงาน) · ฉ3 (AC-05 R2 ทั้งสอง op) · AC-06 (grid ok + bulk full-score/clear/undo + void ตอบเหมือนเดิม) · AC-07 (ไม่มีแถว/void/excused = ok + `[void, รับงาน]` คำขอเดียวบนช่อง submitted = ok, ok) · AC-08 (5 ผลเดิมตามลำดับ) · ฉ5 (AC-09 ฝั่ง server: op clientTs หลังเวลาช่อง → `already_submitted`; clientTs ก่อน → `superseded` เหมือนเดิม) · AC-10 (ส่ง opId เดิมซ้ำ) · AC-11 (2 คำขอพร้อมกัน `Promise.all`: ok 1 + already_submitted 1, audit 1 แถว) · AC-13 (results 3 ตัวเรียงถูก) · AC-14 (request แบบเดิมไม่มี `intent`/`dataEpoch` ผ่าน schema; รูปแบบผล GET/bulk/bulk-undo เท่าเดิม) · คาดว่า **FAIL ก่อนแก้**: AC-01, 02, 03, 05, 09, 10, 11, 13 · **PASS ก่อนแก้** (ตัวกันถอยหลัง): AC-04, 06, 07, 08, 14 — ถ้าผลต่างจากนี้ให้หยุดรายงาน PM (ไม่ปรับเทสต์ให้ตรงโค้ด)
- **T-02**: เทสต์ T-01 ผ่านทั้งหมดโดยไม่แก้ไฟล์เทสต์ T-01 · `npm test` ชุดเต็ม — เทสต์เดิมอื่นที่ล้มเพราะคาดว่าสแกนทับช่องที่ส่งแล้วได้: **ห้ามแก้เอง** ให้รายงาน PM เป็นคำขอเปลี่ยนนอกขอบเขต (ระบุชื่อเทสต์ + เหตุผลตามกฎ) · R-01 ของ `server-intent.test.ts` ยังผ่าน (หลังเพิ่ม score) · `npm run typecheck`
- **T-03** (jsdom + mock `api.post` แบบเดียวกับ `test/unit/outbox-order.test.ts`): คิว 3 รายการ 1 ได้ `already_submitted` → `pendingCount` 3→0, `failedCount` 0, `failedPairKeys` ว่าง, `emit` ถูกเรียกพร้อม `submission` · op grid ของช่องเดียวกันที่ตามมาส่งได้ไม่ถูกกั้น · รายการ failed reason `already_submitted` (จำลองแอปเก่า) ไม่กั้น op ถัดไปและไม่อยู่ใน `failedPairKeys` · `Overlays` แสดงข้อความเดิม · `Gradebook` รับค่าจาก `submission` · เทสต์เดิม `outbox-order`, `qa-m1-02-outbox`, `offline` ผ่าน
- **T-04** (jsdom แบบ `test/unit/m1-05-scan.test.tsx`/`scan-score-entry.test.tsx`, ใช้ `__scan` ที่ export อยู่): โหมดเต็ม/ทีหลัง/ทีละคน สแกน ก ที่ข้อมูลเก่าว่า "ยังไม่ส่ง" → ผล `already_submitted` (score 7) → การ์ด warning ชื่อ ก + "ส่งไปแล้ว — ไม่บันทึกซ้ำ" + 7/10, `beep.dup`, ผัง/วงแหวนใช้ 7, recent ไม่มี 10/10 ของ op นี้, แป้นปิด, ไม่มีข้อความ "ส่งไม่สำเร็จ" · ออกจากหน้าสแกนแล้วผลมาถึง → ไม่มีการ์ด/เสียง (Q2) แต่ค่าในแคชอัปเดต · ภาพ: `node scripts/shots.cjs --label before|after --job docs/team/jobs/2026-11-02-integrity-c01 --pages docs/team/jobs/2026-11-02-integrity-c01/pages.json --port 4104` ทุกอุปกรณ์ใน context.md · ชื่อยาว 30 ตัวอักษรไม่ล้นการ์ด · ภาพ after ต้องรอ T-02 (fixture ใช้ worker จริง)

### หน้าใน `pages.json` ของงาน (มีอยู่แล้ว 13:46 — T-04 รับดูแล: dry run, แก้ selector ถ้าไม่ตรง)

| page | วิธีเข้า (fixture-server layout ข้อมูลสมมติ · setup ทุกหน้า: void เลขที่ 4 → เริ่มรอบ → API grid 7 → สแกนเลขที่ 4) | ใช้กับ AC |
|---|---|---|
| `scan-full-stale` | รอบโหมดเต็ม · งาน asg_gb_13 · เลขที่ 4 ชื่อยาว | AC-12 |
| `scan-later-stale` | รอบโหมดให้คะแนนทีหลัง | AC-12 |
| `scan-type-stale` | รอบโหมดกรอกทีละคน → ต้องเห็นแป้นปิด | AC-05, AC-12 |
| `scan-type`, `scan-later` | หน้าเดิมจาก docs/team/pages.json — ต้องเหมือน before (D29) | AC-12 |

ภาพ before ของหน้า *-stale (ก่อน T-02) จะเห็นบั๊ก (การ์ด "ส่งแล้ว" 10/10 / ผังเป็น 10) — ใช้เป็นหลักฐานบั๊ก · scan-type / scan-later ต้องเหมือน before (หน้าตาคงเดิม D29) · ไม่มีข้อความใหม่ → ไม่ต้องเปิด Gate V (ถ้า T-04 ต้องเพิ่มข้อความ ให้หยุดรายงาน PM)

## ลำดับและ checkpoint

```
T-01 ──CP-1──┬── T-02 (BE) ────────────┬──CP-2──┐
             ├── T-03 (FE outbox) ─────┤        ├── T-04 ภาพ after ──CP-3── QA
             └── T-04 (FE scan, โค้ด+unit) ┘        ┘
```

- **CP-1** (หลัง T-01): PM รัน `npx vitest run test/api/c01-no-overwrite.test.ts` → FAIL/PASS ตรงตามรายการคาดใน T-01 · `npm run typecheck` PASS · เก็บ `evidence/t01-before-fix.txt`
- **CP-2** (หลัง T-02 + T-03): `npx vitest run test/api/c01-no-overwrite.test.ts` PASS ทั้งหมด · `npm test` (≥ 85 ไฟล์ / 1017 + ใหม่) · `npm run typecheck` · ตรวจ diff ว่าไม่มีใครแตะไฟล์นอกขอบเขต (`ownership-check.mjs`)
- **CP-3** (หลัง T-04): `npm run build` · ภาพ after 4 อุปกรณ์ × 5 หน้า · `npm test` ชุดเต็มอีกครั้ง → ส่ง QA

## Endpoint ใหม่ที่ออกแบบในเฟสนี้

| EP ใน api-contract | แทน "EP-ใหม่" ของ AC |
|---|---|
| EP-01 `POST /api/submissions/batch` (+ผล `already_submitted`, v1) | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14 |
| EP-02 `GET /api/assignments/:id/submissions` (ไม่เปลี่ยน) | AC-12, AC-14 |
| EP-03 `POST /api/assignments/:id/bulk` (ไม่เปลี่ยน) | AC-06, AC-14 |
| EP-04 `POST /api/assignments/:id/bulk-undo` (ไม่เปลี่ยน) | AC-06, AC-14 |

## Dependency ที่ติดตั้งแล้วสำหรับงานนี้

| package | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| — ไม่เพิ่ม | | ใช้ vitest / @cloudflare/vitest-pool-workers / miniflare ที่มีอยู่ |

## งานของ DB Specialist / DevOps

- ไม่มี (ไม่มี migration ตาม brief · ห้าม deploy/push/merge จนเจ้าของงานสั่ง)

## จุดเสี่ยงและลำดับ

- เทสต์เดิม R-01 ใน `server-intent.test.ts` ขัดกับกฎข้อยกเว้นรอบเดียวกัน (op manual score null) — ทางที่แนะนำ D-integrity-c01-04 รอ PM ยืนยันก่อนเริ่ม T-02
- อาจมีเทสต์เดิมอื่น (correctness, race-r1, audit-*, late-flag …) ที่สแกนช่องที่ส่งแล้วซ้ำ — รู้หลัง T-02 รันชุดเต็ม → ต้องผ่าน PM ทีละไฟล์ (ไม่ขยายขอบเขตเอง)
- ตัวฟัง `onResult` ของ Scan.tsx อยู่ระดับ module → ต้องมีตัวบอกว่าหน้า mount อยู่ ไม่งั้นการ์ด/เสียงโผล่ตอนอยู่หน้าอื่น (ขัด Q2)
- คู่ `[void, รับงาน]` ในคำขอเดียว: ห้ามกันใน SQL `stillValid` (D-integrity-c01-02) — มีเทสต์กันใน T-01 (AC-07)
- `Gradebook.tsx` / `Scan.tsx` อาจถูกแก้ในงานอื่นที่ยังไม่ merge (ui-redesign) → แก้ให้เล็กที่สุด เพื่อลด conflict ตอนรวม
- ภาพ after ของสถานะใหม่ต้องรอ T-02 เพราะ fixture-server ใช้ worker จริง


> PM 2 พ.ย.: เทสต์ที่ล้มก่อนแก้ QA เขียนไว้แล้ว (28 ล้น/16 กันถอย ใน test/api/c01-no-overwrite.test.ts, test/unit/c01-outbox-already-submitted.test.ts, test/unit/c01-scan-already-submitted.test.ts) — T-01 = เพิ่ม type + รันยืนยันผล FAIL เท่านั้น, ห้ามแก้ไฟล์เทสต์ของ QA (ขอ QA ปรับ) · เทสต์ R-01 ใน server-intent.test.ts: PM ยืนยัน ก) ใส่ score: 8 ให้ op manual

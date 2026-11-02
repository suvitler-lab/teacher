# Dev notes: Back-End · งาน `2026-11-02-integrity-c02`

## T-02 server EP-05 ถาม/ปรับ/คงไว้ใน batch เดียว — 2026-11-02

- สถานะ: **เสร็จ**
- ทำอะไร (`worker/routes/assignments.ts` ไฟล์เดียว):
  - schema เพิ่ม `raise_choice` (`adjust|keep`, optional) + `raise_from` (int, optional) · มีตัวเดียว หรือค่าอื่น → `422 validation` (refine) · request เดิมยังผ่าน
  - อ่านรอบเดียวเดิม (Promise.all) เพิ่ม 1 query: จำนวนคนที่ได้เต็มเดิม ณ full_score ในฐานข้อมูล (เฉพาะคำขอที่มี `id`) → ไม่เพิ่ม round trip
  - ลำดับกรณีตาม EP-05: 3 `409 full_score_changed {currentFullScore, message ไทย}` → 4 `score_over_full` (เดิม) → 5 `class_year_mismatch` (เดิม) → 6 `409 raise_choice_required {count, from, to, message "มี N คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง"}` → 7/8/9
  - batch เดียว (`batchAtEpoch`) ตามลำดับ: guard เดิม (ลดต่ำกว่าคะแนน, ห้องผิดปี) → guard ใหม่ (มีทางเลือก: `full_score ใน DB IS NOT raise_from` → ล้ม · ไม่มีทางเลือก: `ใหม่ > full ใน DB AND มีคนได้เต็มใน DB` → ล้ม) → `SELECT COUNT` คนได้เต็มเดิม (ค่า `count` ของผล) → [adjust] `INSERT … SELECT` audit ช่อง (before = ค่าก่อนปรับ) → [adjust] `UPDATE submissions` (score=ใหม่, method bulk, device_id, updated_at=event_at=now; status/late/submitted_at/scan_session_id ไม่แตะ) → upsert งาน + ห้อง + `lateFixForAssignment` (เดิม) → [adjust] เติม `after` ของ audit ช่องจากค่าจริงหลัง lateFix → audit งาน (batch_id เดียวกัน, `after.raise {choice, from, to, count}`) → เติม `raise.count` ด้วย SQL (adjust = จำนวน audit ช่องของ batch · keep = คนได้เต็มเดิม ณ ตอนเขียน)
  - ช่องที่ปรับเลือกด้วย SQL ใน batch (`status='submitted' AND score = raise_from`) ไม่ใช้รายชื่อจาก client/การอ่านก่อนเขียน (D-integrity-c02-02) · op_id ของ audit ช่อง = `<batchId>:<student_id>` (ไม่ซ้ำ)
  - audit ช่อง: `entity submission`, `entity_id a1:<sid>`, `action bulk`, `method bulk`, `batch_id`, `before/after` = 10 ฟิลด์แบบ `mapSubmission` (late เป็น boolean ผ่าน `json('true'|'false')`) → EP-04 bulk-undo ใช้ได้โดยไม่แก้โค้ด (TC-27/28/29 ผ่าน)
  - batch ล้ม → ดูใหม่ตามลำดับ 3 → 4 → 5 → 6 แล้วตอบ error ข้อแรกที่เข้า · ไม่เข้าเลย → โยนต่อ (500) · epoch → `409 epoch_changed` (เดิม)
  - ผล 200 เพิ่ม `raise: {choice, from, to, count, batchId} | null` · batchId เฉพาะ adjust และ count ≥ 1 · keep → `batchId: null` (แต่ audit งานมี batch_id ใหม่ตาม EP-05)
  - ไม่แตะ submissions.ts / outbox / Scan / Gradebook / shared types · ไม่ต้องเพิ่ม type ใน shared/
- ไฟล์: `worker/routes/assignments.ts`, `dev-notes/backend.md`, `evidence/t02-c02-before.txt`, `evidence/t02-c02-after.txt`, `evidence/t02-full-suite.txt`, `evidence/t02-typecheck.txt`
- เทสต์ที่เพิ่ม: ไม่มี (เทสต์ของงานเป็นของ QA `test/api/c02-raise-full-score.test.ts` — ไม่ได้แก้)
- คำสั่งที่รัน → ผล (ตัวเลขจริง):
  1. ก่อนแก้ `npx vitest run test/api/c02-raise-full-score.test.ts` → **26 failed | 13 passed (39)** (`evidence/t02-c02-before.txt`)
  2. หลังแก้ คำสั่งเดียวกัน → **39 passed (39)** (`evidence/t02-c02-after.txt`)
  3. `npm test` ชุดเต็ม → **Test Files 92 passed (92) · Tests 1123 passed (1123)** (`evidence/t02-full-suite.txt`) — ไม่มีเทสต์เดิมล้ม จึง **ไม่ได้แก้ setup ของเทสต์เดิมไฟล์ใดเลย**
  4. `npm run typecheck` (`tsc --noEmit`) → exit 0 ไม่มี error (`evidence/t02-typecheck.txt`)
  5. lint: โปรเจกต์ไม่มีสคริปต์ lint ใน package.json → N/A (ไม่ได้รัน)
- AC ที่ครอบคลุม (ผ่านเทสต์ QA): AC-01 (TC-01..05), AC-02 (TC-06), AC-03 (TC-07..09), AC-04 (TC-10), AC-05 (TC-11, 12), AC-06 (TC-13..15), AC-07 (TC-16 guard), AC-08 (TC-17..20), AC-09 (TC-21, 22), AC-12 (TC-23 ×3), AC-13 (TC-24..26 ฝั่ง API), AC-14 (TC-27..29 ผ่าน EP-04), AC-15 (TC-30..32, 35, 36), AC-10 ส่วน API (TC-33, 34)
- mock/ชั่วคราว: ไม่มี
- ข้อจำกัด/สิ่งที่ยังไม่ทำ:
  - evidence.mjs ไม่มี kind สำหรับ team-backend-dev → ไม่ได้บันทึกผ่านสคริปต์ เก็บเป็นไฟล์ `evidence/t02-*.txt` ให้ QA/PM อ้างอิง
  - `raise_choice` ที่ส่งมากับการสร้างงานใหม่ → ไม่สนใจ (ไม่มีข้อ 3 เพราะงานไม่มีอยู่) ตามสัญญา
  - ไม่มี index บน `audit_logs.batch_id` — แก้ในรอบแก้ 1 (ด้านล่าง)
- ถึง QA (จุดที่ควรทดสอบเพิ่ม):
  - ปรับ + แก้กำหนดส่งในคำขอเดียวกัน: `after.late` ของ audit ช่องต้องเป็นค่าหลัง lateFix และ EP-04 ย้อนได้ (EP-04 ไม่เทียบ late)
  - adjust ที่ ณ ตอนเขียนไม่มีใครได้เต็มเดิมเหลือ (count 0) → 200, `raise.batchId = null`, audit งานมี `raise.count = 0`
  - งานที่ถูกลบ (deleted_at) แล้วแก้พร้อม raise — นอกขอบเขต แต่ควรยืนยันว่าไม่ 500

## T-02 รอบแก้ 1/3 (Reviewer R-02) — 2026-11-02

- R-02: คำสั่ง 2 ตัวที่อ่าน audit ด้วย batch_id (เติม `after` ของ audit ช่อง, นับ `raise.count`) → เปลี่ยนเป็น `ownCellLines()`: ช่วง op_id `[<batchId>:, <batchId>;)` บน unique index ของ op_id + เงื่อนไขเดิมครบ (assignment_id, batch_id, action bulk, entity submission) ผลจึงเหมือนเดิม · เงื่อนไขอื่นใส่ unary `+` เพราะ `EXPLAIN QUERY PLAN` พบว่า SQLite เลือก `idx_audit_entity (entity=?)` (ไล่ audit ช่องของ**ทุกงาน**) หรือ `idx_audit_assignment` แทน op_id · ไม่เพิ่ม index/migration
- plan T-02 (งบ rows): เพิ่มเทสต์ใหม่ใน `test/api/volume.test.ts` "raising the full score with ปรับ over 200 full holders, and its undo" — seedVolume + a1 ทุกช่อง 10 (200 ช่อง, 5 ห้อง) + ประวัติ a1 600 แถว (3 แถว/ช่อง) · ใช้ `metered()` เดิม · ตรวจความถูกต้อง (raise.count 200, 200 ช่อง = 20, audit ของ batch 201 แถว, undo changed 200, ทุกช่องกลับ 10, เต็มคง 20) · ไม่แตะเทสต์เดิม
- ตัวเลขที่วัดจริง (fixture เดียวกัน ประวัติ 600 แถว):

| คำขอ | statements | rows read | rows written |
|---|---|---|---|
| ปรับ 200 ช่อง ก่อนแก้ query | 24 | 3,260 | 1,832 |
| ปรับ 200 ช่อง หลังแก้ query | 24 | **2,062** | 1,832 |
| ↳ เติม after (ก่อน → หลัง) | | 1,000 → 401 | 200 |
| ↳ นับ raise.count (ก่อน → หลัง) | | 801 → 202 | 1 |
| EP-04 ย้อนกลับ (ไม่ใช่โค้ดของ T-02) | 14 | 6,420 (5,220 เมื่อประวัติ 200 แถว) | 1,601 |

- งบที่ตั้ง (≈2.2–2.4× ค่าที่วัด ตามแนวของไฟล์): ปรับ read ≤ 5,000, written ≤ 4,000, statements ≤ 45 · ย้อนกลับ read ≤ 15,000, written ≤ 4,000
- คำสั่ง → ผล:
  - `npx vitest run test/api/c02-raise-full-score.test.ts test/api/volume.test.ts` → **Test Files 2 passed (2) · Tests 47 passed (47)** (`evidence/t02-c02-volume-r1.txt`)
  - `npm test` → **Test Files 92 passed (92) · Tests 1127 passed (1127)** (`evidence/t02-full-suite-r1.txt`; ตัวเลขเพิ่มจาก 1123 = เทสต์ใหม่ของผม 1 ตัว + เทสต์ของ T-03 ที่ทำขนานกัน)
  - `npm run typecheck` → exit 0 (`evidence/t02-typecheck-r1.txt`)
- ข้อสังเกตนอกขอบเขต: EP-04 bulk-undo (submissions.ts) rows read เพิ่มตามประวัติทั้งงาน (5,220 → 6,420 เมื่อประวัติเพิ่ม 200 → 600 แถว) — ไม่ได้แก้เพราะเป็นไฟล์ของ C-01 · ถ้าจะแก้ ทำเป็นงานแยก
- ระหว่างวัด plan สร้างไฟล์ชั่วคราว `test/api/zz-tmp-plan.test.ts` เพื่อรัน EXPLAIN QUERY PLAN แล้วลบทิ้งทันที (ไม่อยู่ใน git status)

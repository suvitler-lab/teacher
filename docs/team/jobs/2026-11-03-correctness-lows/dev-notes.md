# Dev notes: correctness-lows (Back-End)

สถานะ: เสร็จ · ไม่มี migration · volume budget ไม่เปลี่ยน (ผ่านทั้งหมด)

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `npx vitest run test/api/lows-*.test.ts test/unit/lows-gradebook-patch.test.tsx` ก่อนแก้ | FAIL 17 เทสต์ตามที่ตั้งใจ (submissions 9/18, assignments 7/12, unit 1/1) |
| `npm run typecheck` หลังแก้ | PASS |
| `npx vitest run` หลังแก้ | PASS 108 files / 1312 tests (baseline 105 / 1281 + 3 ไฟล์ใหม่ 31 เทสต์) |
| `test/api/volume.test.ts` | PASS (ไม่แก้ budget) — แก้ครั้งแรกเกิน 501/500 rows ที่ "edit an assignment" จึงทำให้เงื่อนไขห้องที่ถอดไม่อ่านแถวเลยเมื่อไม่มีห้องถูกถอด |

## ต่อ AC

| AC | สถานะ | สิ่งที่เปลี่ยน | เทสต์ |
|---|---|---|---|
| AC-01 (C-01 R-04) | เสร็จ | `submissions.ts` ลูปหลัก: `pending.find((p) => p.row === before)` แล้วตรวจ undefined แทน `before.op_id != null` + `!` | lows-submissions "AC-01" (เพิ่มคอลัมน์ `op_id` ชั่วคราวใน test แล้ว DROP) — ก่อนแก้ได้ 500 |
| AC-02 (C-01 R-07) | known limitation (ไม่แก้โค้ด) | ตาม BR-01 `already_submitted` ตัดสินกับช่องที่อ่านมา; void ออฟไลน์ที่เก่ากว่าแต่มาทีหลังยังลงได้ | characterization test (ผ่านทั้งก่อน/หลัง) |
| AC-03 (C-02 R-05) | เสร็จ | `assignments.ts` `holdsFull(full, keep)`: ไม่นับ/ไม่ปรับเด็กที่ห้องเป็นห้องที่งานผูกอยู่แต่ไม่อยู่ใน `class_ids` ใหม่ · ใช้ทุกจุด (นับรอบแรก, guard, holdersNow, audit/ปรับช่อง, count ของ keep, ดูใหม่หลังล้ม) · ย้าย audit งาน + `auditCount` ไปก่อนเขียนห้องใหม่ (ลำดับ id ของ audit คงเดิม: ช่องก่อน งานทีหลัง) | lows-assignments AC-03 ×6 |
| AC-04 (C-02 R-04) | เสร็จ | server: EP-05 `full_score` optional เมื่องานมีอยู่ → คงค่าใน DB ณ ตอนเขียน (`CASE WHEN ?15=1 THEN assignments.full_score`), ไม่ใช่ raise/lower, `RETURNING full_score` ไปตอบ, audit งาน `after.full_score` = ค่าจริง · งานใหม่ไม่ส่ง = 422 · client: `Gradebook.tsx` `saveAsgPatch` ไม่ส่ง `full_score` | lows-assignments AC-04 ×5 (รวม race ด้วย gateBatch) + unit `lows-gradebook-patch` |
| AC-05 (C-02 R-07) | เสร็จ (ช่องว่างของเทสต์) | ไม่แก้โค้ด — เทสต์ผ่านตั้งแต่แรก | lows-assignments AC-05 |
| AC-06 (C-03 R-03) | เสร็จ | `shared/received-date.ts`: `RECEIVED_DATE_CLOCK_SKEW_MS` (5 นาที), `receivedDateDays(now)`, `checkReceivedDate` รับ `latest?` (เฉพาะ future; พื้นวันมอบหมายยังใช้ today จริง) · EP-01 และ EP-03 ส่ง `latest` · `receivedAtMs` บีบเป็น now เหมือนเดิม | lows-submissions AC-06 ×7 · แก้ 2 เทสต์เดิมใน `c03-verify-edges.test.ts` ที่ตรึงพฤติกรรมเก่า (11-03 ตอน 23:59:59 = future) → เปลี่ยนเป็น ok และใช้ 11-04 ทดสอบ future แทน |
| AC-07 (C-03 R-06) | เสร็จ | `submissions.ts`: re-date ที่ช่อง **ใน DB** เป็นวันไทยเดียวกันอยู่แล้ว → `ok` + ค่าปัจจุบัน ไม่เขียน ไม่มี audit (ตัดสินหลัง superseded / cell_not_submitted / received_date_*) · ถ้า `before` เป็นแถวของคำขอเดียวกัน เขียนตามเดิม | lows-submissions AC-07 ×4 (รวม bulk-undo ไม่ 409) |
| AC-08 (C-03 R-05) | เสร็จ | `auditLateSyncStmt(..., "number")` ท้าย batch EP-01 (คงรูป late 0/1 ของ EP-01) | lows-submissions AC-08 ×2 (race เลื่อนกำหนดส่งด้วย gateBatch) |
| AC-09 (C-03 R-02) | เสร็จ | re-date ที่ `before` เป็นแถว pending รับ `receive`/`hand_in` ของแถวนั้น → stillValid ตัดพร้อมกัน · `judgeUnwritten`: re-date ที่ไม่ลงบนช่องที่ไม่ submitted → `invalid cell_not_submitted` (เดิม `superseded`) | lows-submissions AC-09 ×3 |
| AC-10 | เสร็จ | ทุก AC ที่แก้โค้ดมีเทสต์ที่ล้มก่อนแก้ · typecheck + vitest ผ่าน · budget ไม่ลด | — |

เอกสาร: `docs/team/api-contract.md` → v4 (EP-01/EP-03/EP-05 + changelog)

## คำถาม / สิ่งที่เจ้าของงานหรือ PM ควรรู้

1. **ลำดับปล่อย (AC-04)**: แอปใหม่ไม่ส่ง `full_score` ใน `saveAsgPatch` → server v3 จะตอบ 422 · ต้องปล่อย server ก่อนแอปเสมอ (แอปเก่าไม่กระทบ)
2. **AC-04 ขอบเขต**: ทำเฉพาะ `full_score` ตาม AC · ฟิลด์อื่นใน `saveAsgPatch` (title, due_date, class_ids …) ยังส่งจากรายการในเครื่อง ถ้าเก่าจะทับค่าที่อีกเครื่องแก้ (พฤติกรรมเดิม) — ตัวเลือก: (ก) คงไว้ (ค่าแนะนำสำหรับงานนี้) (ข) เปิดงานใหม่ทำ EP-05 แบบ patch ทุกฟิลด์ (ต้องออกแบบการตรวจปีของห้องใหม่)
3. **AC-03 นิยาม**: เลือกแบบแคบที่สุด = ยกเว้นเฉพาะ "ห้องที่ถอดในคำขอเดียวกัน" · เด็กที่ `class_id` เป็นห้องอื่นที่งานไม่เคยผูก ยังนับเหมือนเดิม (BR-01 "ทุกห้อง")
4. **AC-07 no-op**: ตัดสินกับช่องที่อ่านมา ไม่อยู่ใน `cellsGuard` (แบบเดียวกับ `already_submitted` / R-07) · ถ้าอีกเครื่องแก้วันที่ระหว่างอ่านกับตอบ ผลคือค่าของอีกเครื่องคงอยู่ — ยอมรับเป็นข้อจำกัดเดียวกับ AC-02
5. **AC-02**: ใส่เป็น known limitation ใน report (ไม่แก้โค้ด)

## รอบแก้ตาม code-review (2026-11-03)

| ข้อ | สถานะ | สิ่งที่ทำ | หลักฐาน |
|---|---|---|---|
| R-01 | แก้แล้ว (ทางเลือก ก) | EP-01 เลิกใช้ `auditLateSyncStmt` (ค่าจากช่อง) → `auditRowLateStmt` ตัดสิน `after.late` ของแต่ละแถว audit จาก `after` ของแถวนั้น + กำหนดส่งใน transaction ด้วย `lateSqlOf` ตัวใหม่ใน `worker/lib/late.ts` (กฎเดียวกับ `lateSql`) · `auditLateSyncStmt` ของ bulk/undo กลับเป็นแบบเดิม (หนึ่งแถวต่อช่อง) | เทสต์ใหม่ 2 ตัว `[hid, grid dateOnly 10-29]` และ `[grid ส่ง, grid ล้าง]` — FAIL ก่อนแก้ → PASS · เทสต์ race เลื่อนกำหนดส่งของ AC-08 ยังผ่าน |
| R-05 | แก้แล้ว (เล็ก ปลอดภัย) | `assignments.ts`: ไม่ส่ง `full_score` → `choice = null` (ไม่สนใจ `raise_choice`/`raise_from` รวม guard ข้อ 3 เหมือน case 9) · สัญญา v4 ระบุแล้ว | เทสต์ใหม่ 1 ตัว — FAIL (409) ก่อนแก้ → PASS |
| R-02 | known limitation | re-date วันเดิม (no-op) ไม่ขยับ `event_at` → op เก่าจากคิวออฟไลน์อีกเครื่องที่ทำหลัง `event_at` เดิมยังชนะได้ (ต้องให้เจ้าของงานเลือกกติกาก่อนแก้ เพราะเขียน `event_at` จะทำให้ bulk-undo 409 อีก) |  |
| R-03 | known limitation | ช่วง 23:55–23:59 re-date เป็น "พรุ่งนี้" ของช่องที่ลงวันนี้อยู่แล้ว ไม่เป็น no-op แต่ย้ายเวลาเป็น now ในวันเดียวกัน (late ไม่เปลี่ยน, มี audit, bulk-undo ที่คลุมได้ 409) · ทางแก้ถ้าต้องการ: ปรับ `receivedDate > today` เป็น `today` ก่อนเทียบ |  |
| R-04 | known limitation | rollback server ข้าม v4 ขณะที่เครื่องครู cache แอปใหม่ → ปิดรับงาน/ซ่อนคะแนนได้ 422 (มองเห็นได้ ไม่ใช่ข้อมูลผิด) · ใส่ในแผน rollback: ต้องบังคับอัปเดตแอปด้วย |  |

หลักฐานรอบนี้: `npm run typecheck` PASS · `npx vitest run` PASS 108 ไฟล์ / 1315 เทสต์ (+3 จากรอบก่อน)

## จุดที่ QA ควรทดสอบ

- ปิด/เปิดรับงาน และซ่อน/แสดงคะแนนจากสมุดคะแนน หลังอีกเครื่องลดคะแนนเต็ม → ไม่มี 409 และคะแนนเต็มบนจอเป็นค่าของ server
- แก้งานเพิ่มเต็ม + ถอดห้องพร้อมกัน → ตัวเลขในกล่องถาม = คนที่เห็นในสมุด
- สแกน/ทั้งห้องส่งแล้ว ช่วง 23:55–23:59 ด้วยวันที่ของวันพรุ่งนี้

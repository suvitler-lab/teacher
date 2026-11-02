# QA report: c03-submit-date (หลังบ้าน)

โดย QA · 2026-11-02 · สถานะ: **T-03 ตรวจรวมเสร็จ — พบบั๊ก 1 (B-01 สูง)** · รอบแก้ (Verify) 0/3

## สรุปผู้บริหาร

ระบบหลังบ้าน "วันที่รับงานจริง" และ "แก้วันที่ช้า/ทันรายช่อง" ทำงานตามสัญญา v3: ทดสอบจริงผ่าน HTTP บนเซิร์ฟเวอร์จำลองในเครื่อง 68 ข้อ ผ่าน 67 (ข้อที่ไม่ผ่านเป็นความผิดของสคริปต์ทดสอบเอง รันใหม่ผ่าน) · เทสต์อัตโนมัติ c03 117 ข้อผ่านทั้งหมด · ชุดเต็ม 103 ไฟล์ 1272 ข้อผ่าน · typecheck สะอาด · ตัวเลข "ส่งช้า" เปลี่ยนตามวันที่ที่แก้ ส่วนคะแนนรวม/จำนวนส่ง/ค้าง ไม่เปลี่ยน (AC-20)

พบบั๊ก 1 ข้อ: เลือกวันที่รับงานก่อนปี 1970 ได้ (งานที่ไม่มีวันมอบหมาย ไม่มีเพดานย้อนหลัง) → ไฟล์สำรองข้อมูลที่มีช่องนั้น **กู้คืนไม่ได้ทั้งไฟล์** ("ไฟล์สำรองมีข้อมูลไม่ถูกต้อง") — โอกาสเกิดต่ำ (ต้องพิมพ์ปีผิดมาก) แต่ผลคือสำรองข้อมูลใช้ไม่ได้ จึงจัดระดับสูง

## เรื่องที่ควรแก้ก่อน

1. **B-01 (สูง)** — กันวันที่รับงานก่อน 1970-01-01 (หรือพื้นที่สมเหตุผลกว่า) ใน `checkReceivedDate` — ต้องให้เจ้าของงานเลือกพื้น เพราะขัดกับ Q2 "ไม่มีเพดานย้อนหลัง" (ตัวเลือกด้านล่าง)

## ผลตาม AC (T-03 หลังแก้)

| AC | หลังบ้าน | หลักฐาน | UI |
|---|---|---|---|
| AC-01 | PASS | Q-05 (Q05-1, Q05-3), Q-20/Q-21 | — |
| AC-02 | PASS | Q05-2 (op แอปเก่า = เวลาจริง late true) | — |
| AC-03 | PASS | Q05-9.0–9.8 (อนาคต/ก่อนมอบหมาย/ผิดรูป 7 แบบ ไม่มีแถว) | — |
| AC-04 | PASS | Q05-10 (รับซ้ำด้วยวันผิด → already_submitted) | — |
| AC-05, AC-15 | PASS | Q05-6 (audit update/grid before/after) + c03 suite | — |
| AC-06 | PASS | Q06-3 (ค้าง 9 วัน clamp แต่วันที่คง 10-27) | — |
| AC-07, AC-08 | PASS (server) | Q05-1 `submission.late` ในผล ok | NOT RUN (เลื่อน ui-redesign) |
| AC-09, AC-10, AC-11, AC-23 | PASS | BK-1..BK-7 + c03 suite (32/45 คน) | AC-23: NOT RUN (เลื่อน) |
| AC-12, AC-13 | PASS | Q05-5 (op ส่ง 9 คะแนนคง 7), DO-6 (op 999 ไม่ถูกตรวจ/ไม่ถูกเขียน) | — |
| AC-14 | PASS | DO-0..DO-5, CLOSED | — |
| AC-16 | PASS (server) | Q05-7, Q05-8 (วันเดิมคง ms) | NOT RUN (เลื่อน) |
| AC-17, AC-19 | PASS | c03 suite (TC-28, TC-31) | AC-19: NOT RUN (เลื่อน) |
| AC-18 | PASS | Q06-1, Q06-2, Q07-1..Q07-4 | — |
| AC-20 | PASS (ข้อมูล) | AC20-1/2 + dashboard: ช้า 20→5, ส่ง 20/ค้าง 24/คะแนนรวม 160 คงเดิม | NOT RUN (เลื่อน) |
| AC-21, AC-22 | PASS | Q05-2, Q05-4, c03 suite TC-35/37 | AC-22: NOT RUN (เลื่อน) |
| AC-24 | PASS | c03 suite TC-39 (`metered()` มีวันที่ ≤ ไม่มี) | — |
| (ไม่ใช่ AC — กันข้อมูลหาย BR-11) | **FAIL** | B-01 · `test/api/c03-verify-edges.test.ts` | — |

## ทดสอบจริงผ่าน HTTP (fixture-server พอร์ต 4101, ข้อมูลสมมติ, ปิดแล้ว)

วันจริงของเครื่อง 2026-11-02 23:29 ไทย · งานที่สร้างเอง: มอบหมาย 2026-10-26 กำหนดส่ง **2026-11-01 (เมื่อวาน)** เต็ม 10 ห้อง ป.6/1 (44 คน) · ผลเต็ม `evidence/qa/t03-http-results.json` (สคริปต์ `t03-http-run*.mjs`)

| กลุ่ม | ผลที่คาด (คิดก่อนรัน) | ผล |
|---|---|---|
| Q-05 รับงานครั้งแรก `receivedDate` เมื่อวาน | เที่ยง 11-01 = 1793509200000 late false (ไม่มีวันที่ = เวลาจริง late true) | PASS |
| Q-05 แก้วันที่ dateOnly | score คงเดิม (op ส่ง 9 → ยัง 7) · method grid · audit before 7/late true → after 7/late false · กลับเป็นวันนี้ = เวลาของ op · วันเดิม = ms เดิม | PASS |
| Q-05 ค่าผิด 9 แบบ | future / before_assigned / invalid (รวมช่องว่างหน้า-หลัง, `T00:00:00`, พ.ศ.) ไม่มีแถว | PASS |
| Q-06 ส่ง opId เดิม 3 ครั้ง (2 เครื่อง) | ok → duplicate → duplicate · audit 1 แถว · วันที่เดิม · dateOnly ซ้ำก็ duplicate · ค้าง 9 วันวันที่ไม่หาย · ลองใหม่ (opId ใหม่) → already_submitted | PASS |
| Q-07 สองเครื่อง | แก้วันที่เก่ากว่ามาทีหลัง → superseded · ใหม่กว่าชนะเสมอ · แข่งพร้อมกัน 10 รอบ ผลสอดคล้องทุกรอบ · แก้วันที่พร้อมกัน 2 เครื่อง → อันใหม่ (10-29) ชนะ | PASS |
| bulk + undo | ทั้งห้องส่งแล้ว + เมื่อวาน → เที่ยง late false, excused/submitted ไม่แตะ, audit after ตรง · undo คืนตรง ms · แก้วันที่หลัง bulk → undo 409 modified_since · clear/full-score + วันที่ → 400 not_applicable · ชนิดผิด → 422 | PASS (BK-4 รอบแรก FAIL เพราะสคริปต์ใส่ clientTs เก่ากว่าเวลาของ bulk → op ถูก superseded อย่างถูกต้อง · รันใหม่ด้วย clientTs ปัจจุบัน PASS `t03-http-bk4-negative.json`) |
| เที่ยงคืนไทย (clientTs 23:59:59 / 00:00:01) | 6 กรณี ตรงตามสูตร BR-02 | PASS |
| ย้อน 30 000 วัน (1944-09-13) | งานไม่มีวันมอบหมาย → ok เที่ยงวันนั้น · มีวันมอบหมาย → before_assigned · 1900-01-01 ok / 1899-12-31 invalid | PASS ตามสัญญา → แต่ทำให้เกิด **B-01** |
| ชนิดผิด | number/array/object/bool/33 ตัว/dateOnly "true"/1 → 422 ทั้งคำขอ ไม่มีแถว · 32 ตัว → invalid · null = ไม่มีวันที่ | PASS |
| batch 50 op วันที่ปนดี/ผิด | ทุก op ตัดสินแยกกัน · op ผิดไม่ทำให้ตัวอื่นล้ม | PASS |
| dateOnly บน void/excused/ว่าง | cell_not_submitted · hid+dateOnly / void+dateOnly → redate_not_allowed · ไม่มีวันที่ → received_date_invalid | PASS |
| AC-20 ผ่าน endpoint | gradebook + reports/summary + dashboard: ช้า 20 → 5 · ส่ง 20, ค้าง 24, คะแนนรวม 160 ไม่เปลี่ยน | PASS |

ข้อสังเกต (ไม่ใช่บั๊ก — ตามสัญญา): แก้คะแนนบนเครื่องหนึ่ง แล้วอีกเครื่องแก้วันที่ **ทีหลัง** แต่ไปถึง server ก่อน → การแก้คะแนนได้ `superseded` ไปอยู่ "ส่งไม่สำเร็จ" ของเครื่องนั้น (กฎ event_at เดิม, D-05) — ครูต้องกดส่งใหม่

## บั๊ก

### B-01 · สูง · ทำซ้ำได้ — วันที่รับงานก่อนปี 1970 ทำให้กู้คืนไฟล์สำรองไม่ได้

- AC/BR: Q2 (ไม่มีเพดานย้อนหลัง) ชนกับ BR-11 / backup-restore เดิม
- ขั้นตอน: งานที่ **ไม่มีวันมอบหมาย** (หรือวันมอบหมายเป็น พ.ศ./อนาคต — D-04) → EP-01 op รับงาน `receivedDate: "1944-09-13"` (หรือปีใดก็ได้ 1900–1969) → ได้ `ok` `submitted_at = -798404400000` (ติดลบ) → สำรองข้อมูล → กู้คืนไฟล์นั้น
- ผลที่ได้: `/api/restore/execute` chunk ตอบ `422 invalid_backup` "ไฟล์สำรองมีข้อมูลไม่ถูกต้อง" issue `submissions.submitted_at too_small` → **กู้คืนทั้งไฟล์ไม่ได้** (ข้อมูลเดิมไม่ถูกแตะ แต่ไฟล์สำรองใช้ไม่ได้)
- ผลที่ควรได้: ไฟล์สำรองที่แอปสร้างต้องกู้คืนได้เสมอ — ไม่ควรมีวันที่ที่ระบบรับเก็บแล้วสำรอง/กู้คืนไม่ได้
- หลักฐาน: `test/api/c03-verify-edges.test.ts` เทสต์สุดท้าย FAIL (422 ที่ chunk) · `evidence/qa/t03-http-restore-pre1970.txt` (fixture 2 แถว: 1944-09-13 และ 1900-01-01) · `t03-http-results.json` FAR-1/FAR-3
- ไฟล์ที่น่าจะเกี่ยว: `shared/received-date.ts` (`isCeDate` รับ 1900–2099 / `checkReceivedDate` ไม่มีพื้นเมื่อไม่มีวันมอบหมาย) · `worker/lib/restore-validation.ts:11` (`stamp = integer.min(0)`)
- ตัวเลือก (เจ้าของงานตัดสิน — ขัด Q2 เล็กน้อย):
  - ก. **(แนะนำ)** `checkReceivedDate` ปฏิเสธวันก่อน `1970-01-01` เป็น `received_date_invalid` (ไม่ต้องแก้ restore, ไม่มี migration, ครูไม่มีทางมีงานจริงก่อน 1970) — เพิ่มเทสต์ helper + EP-01/EP-03
  - ข. ให้ restore รับ `submitted_at` ติดลบ — แก้ไฟล์ validation ของ backup (นอกขอบเขตงานนี้, กระทบความเสี่ยงของ restore)
  - ค. ไม่แก้ (ยอมรับความเสี่ยง) — ไม่แนะนำ

## ชุดเทสต์ (T-03)

| คำสั่ง | ผล | ไฟล์ |
|---|---|---|
| `npm run typecheck` | ผ่าน (exit 0) | `evidence/qa/t03-typecheck.txt` |
| `npx vitest run test/api/c03- test/unit/c03-` (ไฟล์ T-01) | 5 ไฟล์ 117/117 ผ่าน | `evidence/qa/t03-c03.txt` |
| `npx vitest run` (ชุดเต็ม ก่อนเพิ่มไฟล์ verify) | 103 ไฟล์ 1272/1272 ผ่าน (≥ baseline: ไฟล์เดิม 98/1155 + c03 117) | `evidence/qa/t03-full-suite.txt` |
| `npx vitest run test/api/c03-verify-edges.test.ts` (ใหม่ T-03) | 4 ผ่าน / 1 FAIL = B-01 | `evidence/qa/t03-c03-with-verify.txt` |
| `npm run build` | ผ่าน (exit 0, มีแค่คำเตือนขนาด chunk เดิม) | `evidence/qa/t03-build.txt` |

Evidence (`evidence.mjs list`): Q-05 expected-from-br PASS · Q-06 offline-replay PASS · Q-07 multi-device PASS (บันทึกใหม่ทับผล FAIL ก่อนแก้ของ T-01) · Q-09 regression PASS (typecheck + c03 + ชุดเต็ม + build) · Q-10 regression **FAIL** (B-01)

หมายเหตุ: หลังเพิ่ม `c03-verify-edges.test.ts` ชุดเต็มจะมี 1 FAIL (B-01) จนกว่าจะแก้ — เป็นเทสต์ที่ล้มก่อนแก้โดยตั้งใจ ไม่ใช่การถอย
| `git status --short migrations src worker/lib/late.ts` | ว่าง (ไม่มี migration ไม่แตะ src) | — |
| `ownership-check.mjs` | PASS (warn เฉพาะไฟล์ร่วม T-01/T-03 ที่เป็น QA คนเดียวกัน) | — |

## ไม่ได้ตรวจ

- browser pane: ไม่ได้ใช้ (งานนี้ไม่มีหน้าจอ) — ส่งคำขอ HTTP จริงด้วยสคริปต์ node ไปยัง fixture-server แทน

- ส่วน UI ทั้งหมด (AC-07/08/16/19/20/22/23 ส่วนหน้าจอ) — เลื่อนไป ui-redesign ตาม plan
- เที่ยงคืนจริงบนเครื่อง (ตรวจด้วยนาฬิกาจำลองใน vitest + clientTs แทน)
- `wrangler dev` / D1 จริง — ใช้ Miniflare D1 ในเครื่องเท่านั้น

# Test plan: เพิ่มคะแนนเต็มแล้วถามปรับคนที่ได้เต็มเดิม (integrity-c02)

โดย QA (team-qa-tester) · 2 พ.ย. 2569 · เฟส 3 (ก่อนมีโค้ดแก้) · ขนาด M · ธง 💰 🗑 🖥
แหล่ง: `brief.md` (Gate 0/1), `requirements.md` (BR-01..10, AC-01..15) · สัญญา `docs/team/api-contract.md` v2 EP-05 (Tech Lead ออกระหว่างเขียน — เทสต์ปรับชื่อตามแล้ว) · branch `team/2026-11-02-integrity-c02` @ 2285c17 (ไม่มีโค้ดแก้)

## สรุป

- เขียนเทสต์ API ที่ **ล้มก่อนแก้จริง 26 ข้อ** + **[guard] 13 ข้อ** ที่ผ่านที่ 2285c17 และต้องผ่านต่อหลังแก้ — รวม 39 ข้อใน `test/api/c02-raise-full-score.test.ts`
- ทุกข้อที่ล้ม ล้มด้วย `AssertionError` เพราะพฤติกรรม C-02 จริง (server บันทึกเต็ม 20 ทันที ไม่ถาม ไม่ปรับ ไม่มี `raise`/batchId) — **ไม่มีข้อไหนล้มเพราะ syntax/import** · `npm run typecheck` ผ่าน
- ยืนยันบั๊กทำซ้ำได้ระดับ API: เพิ่ม a1 10 → 20 ได้ `200` และ ก ข ซ ค้าง 10/20 → ร้อยละงาน ห้อง 1 = 45% (ควร 78% ถ้าปรับ) · สะสม ก = 60% (ควร 93%)
- AC ที่ทดสอบอัตโนมัติระดับ API ไม่ได้: AC-10 (ส่วนกล่อง/ปุ่ม/Esc), AC-11 (ภาพ 4 อุปกรณ์), AC-13 (หน้าจอ), AC-03/09/14/15 (ส่วนข้อความในฟอร์ม) → เบราว์เซอร์เฟส 4 (TC-37..47) + `pages.json`

## ขอบเขต

- ทดสอบ: AC-01..AC-15 (ทุกข้อ "ต้องมี" + AC-14 ตาม Q1 = ข)
- ไม่ทดสอบ: ปรับตามสัดส่วน, เลือกรายคน/รายห้อง, ถามกลับด้านเมื่อลด, แปลง op ค้างคิวเป็นเต็มใหม่, ลองใหม่ด้วยเต็มปัจจุบัน (requirements §ไม่ทำในรอบนี้) · dry-run/restore ของธง 🗑 = N/A ที่รับใน brief (ไม่มี migration) — ตรวจ atomic + undo ด้วยเทสต์ API แทน

## 1. ผลที่คาดคำนวณจาก BR ก่อนดูโค้ด (expected-from-br, 💰)

คำนวณจาก requirements.md เท่านั้น ก่อนมีโค้ดแก้ — ตัวเลขฝังอยู่ในเทสต์ · Fixture F: a1 เต็ม 10 ห้อง 1+2 · ก 10 (hid, late 0) · ข 10 (bulk, late 1) · ค 7 · ง รอตรวจ · จ excused · ฉ void · ช ไม่มีแถว · ซ 10 ห้อง 2 moved · ฌ ไม่มีแถว (สแกนทีหลัง)

| # | ข้อมูล | เหตุการณ์ | ที่ 2285c17 (บั๊ก) | หลังแก้ (คาด) | วิธีคิด |
|---|---|---|---|---|---|
| E1 (BR-01) | F | นับคนที่ได้เต็มเดิม | — (ไม่นับ) | **3** = ก ✓ ข ✓(late) ซ ✓(ห้อง 2 moved) · ค 7 ✗ ง ว่าง ✗ จ ✗ ฉ ✗ ช ✗ | status=submitted และ score = 10 ตรงตัว |
| E2 (BR-02 ปรับ) | F | 10 → 20 + ปรับ | 200, ก ข ซ = 10 | ก ข ซ = 20 · status/late/submitted_at เดิม · method bulk · updated_at/event_at = เวลาบันทึก · อื่นทั้ง 9 ฟิลด์เดิม · `raise.count` 3 | BR-02 |
| E3 (BR-02 คงไว้) | F | 10 → 20 + คงไว้ | 200 (เหมือนกันโดยบังเอิญ) | ทุกช่องเดิม · audit งาน `raise {keep, count 3}` · ไม่มี audit ช่อง | BR-02 |
| E4 (BR-03 งาน) | a1 ห้อง 1: ก 10, ข 10, ค 7 มีคะแนน | ร้อยละงาน | 27/60 = **45%** | ปรับ: (20+20+7)/(3×20) = 47/60 = 78.33 → **78%** · คงไว้: 27/60 = **45%** · ก่อนแก้เต็ม: 27/30 = **90%** | Σคะแนน ÷ (จำนวนที่มีคะแนน × เต็ม), Math.round |
| E5 (BR-03 สะสม) | ก: a1 + งาน b 8/10 | สะสมของ ก | 18/30 = **60%** | ปรับ: (20+8)/(20+10) = 28/30 = 93.33 → **93%** · คงไว้: **60%** · ก่อนเพิ่มเต็ม: 18/20 = **90%** | Σคะแนน ÷ Σเต็มของงานที่มีคะแนน |
| E6 (BR-04) | F | ปรับสำเร็จ | audit ใหม่ 1 แถว (งาน) batch_id null | audit ใหม่ **4** แถว = งาน 1 + ช่อง 3 (entity_id `a1:st1/st2/st9`, before 10 → after 20) batch_id เดียวกัน = `raise.batchId` | BR-04 |
| E7 (BR-04 ล้ม) | F | epoch เปลี่ยน / ห้องผิดปี / statement ล้มกลาง batch | 200 ลงเต็ม 20 (กรณี statement ล้มในช่อง: ไม่มี statement ช่องเลย) | 409 / 422 / 5xx · full 10 · ก ข ซ 10 · audit ใหม่ **0** | BR-04 |
| E8 (BR-05) | ถาม 3 คน → ฌ สแกน 10 | ปรับ | 200 ไม่ปรับใคร | ปรับ **4** (ก ข ซ ฌ = 20) | นับตอนเขียน |
| E9 (BR-05) | อีกเครื่องแก้เต็ม 15 | ปรับ (กล่องเห็น 10 → 20) | 200 เต็ม 20 (กล่องเก่าชนะ) | 409 `full_score_changed` currentFullScore 15 · full **15** · ไม่มีอะไรลง | raise_from ≠ เต็มในฐานข้อมูล |
| E10 (BR-06) | ปรับเป็น 20 แล้ว | op ฌ 10 `fullScoreAtScan` 10 | `full_score_changed` 20 | เหมือนเดิม · ฌ ไม่มีแถว · op 20/20 = ok | EP-01 ไม่เปลี่ยน |
| E11 (BR-07) | a3 เต็ม 20: ก 20, ค 15 · a4: ค 8 | ลดเป็น 10 | 409 over 2 · a4 200 | เหมือนเดิม (ไม่ถาม) | over = จำนวน score > 10 = 2 |
| E12 (BR-09) | ปรับแล้ว | ย้อนกลับ | — (ไม่มี batchId) | ก ข ซ = 10 · full **20** · audit +3 · ย้อนซ้ำ changed 0 · ก แก้เป็น 18 ก่อน → 409 `modified_since` · หลังย้อน ลดเป็น 10 ได้ (200) | BR-09 |
| E13 (BR-10) | F | แอปเก่า (ไม่มี raise_choice) เพิ่มเป็น 20 | 200 ค้าง 10/20 เงียบ | 409 "มี 3 คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง" ไม่มีอะไรลง · ไม่มีคนได้เต็มเดิม → 200 | BR-10 |

ผลจริงที่ 2285c17 ตรงกับคอลัมน์ "ที่ 2285c17 (บั๊ก)" ทุกแถวที่วัด (E2 ได้ ก score 10, E4 ได้ ก 10 ใน EP-02, E9 ได้ 200, E13 ได้ 200) → บั๊ก C-02 **ทำซ้ำได้แล้ว** ระดับ API

## 2. สภาพแวดล้อมและคำสั่ง

- โหมด: local + D1 ในหน่วยความจำ (Vitest workers) และ fixture server (ข้อมูลสมมติ) · ห้ามใช้ข้อมูลจริง
- อุปกรณ์ (context.md §อุปกรณ์เป้าหมาย): iPad ตั้ง 820×1180 · iPad นอน 1180×820 · คอม 1536×729 · มือถือ 390×844

| ระดับ | ที่รัน | คำสั่ง |
|---|---|---|
| API | Vitest project `workers` (`test/api/helpers.ts` seed + fixture F ในไฟล์เทสต์: st3..st8 ใหม่, ซ = st9 ห้อง c2 moved, a1 มอบ c1+c2, กำหนดส่ง 3 วันก่อน) | `npx vitest run test/api/c02-raise-full-score.test.ts` |
| ทั้งชุด | baseline | `npm test` (= `vitest run`) · `npm run typecheck` |
| เบราว์เซอร์ | `scripts/fixture-server.cjs` layout:true ผ่าน `scripts/shots.cjs` พอร์ตตาม PM (pages.json ใช้ 4101 แบบ c01) | `npm run build; node scripts/shots.cjs --label before|after --job docs/team/jobs/2026-11-02-integrity-c02 --pages docs/team/jobs/2026-11-02-integrity-c02/pages.json` |

## 3. AC → เทสต์ (ล้มก่อนแก้อย่างไร)

ไฟล์ **A** = `test/api/c02-raise-full-score.test.ts` · **B** = เบราว์เซอร์ (fixture, เฟส 4) · [guard] = ผ่านที่ 2285c17 ต้องผ่านต่อ

| AC | ระดับ | เทสต์ | ที่ 2285c17 (ผลจริง) | หลังแก้ต้องได้ |
|---|---|---|---|---|
| AC-01 | API | A › TC-01, TC-02, TC-03, TC-04, TC-05 | **ล้ม 5** — `expected 200 to be 409` / `{sid:'st1',score:10}` ≠ 20 | 409 `raise_choice_required` count 3 from 10 to 20 · ปรับ: ก ข ซ 20, อื่นเดิม, `raise` {adjust,10,20,3,batchId} |
| AC-02 | API | A › TC-06 (+ TC-26 [guard]) | **ล้ม 1** — audit งานไม่มี `raise` (`{choice: undefined, count: undefined}`) | ช่องเดิมทั้งหมด · audit งาน `raise {keep,3}` batch_id ไม่ว่าง · `raise.batchId` null |
| AC-03 | API | A › TC-07 [guard], TC-08 [guard], TC-09 ×2 | **ล้ม 2** (TC-09 `expected 200 to be ≥ 500`) · ผ่าน 2 | ทุกกรณีไม่มีอะไรลง · 409 epoch / 422 ปีการศึกษา / 5xx |
| AC-03 | B | TC-42 | — | ฟอร์มยังเปิดพร้อมค่าที่กรอก |
| AC-04 | API | A › TC-10 | **ล้ม** — audit ช่อง `[]` ≠ `['st1','st2','st9']` | 4 แถว batch_id เดียว = `raise.batchId` · action bulk · before/after score |
| AC-05 | API | A › TC-11, TC-12 (gate) | **ล้ม 2** — 200 ไม่ถาม / `raise.count` undefined ≠ 4 | ฌ = 20 · count 4 |
| AC-06 | API | A › TC-13, TC-14 (gate), TC-15 (คงไว้) | **ล้ม 3** — `expected 200 to be 409` | 409 `full_score_changed` currentFullScore 15 ข้อความไทย · full 15 · audit 0 |
| AC-07 | API | A › TC-16 [guard] | ผ่าน | ผ่านเหมือนเดิม (EP-01 ไม่เปลี่ยน) |
| AC-07 | B | TC-46 | — | "ส่งไม่สำเร็จ" เหตุผล "คะแนนเต็มถูกแก้ไข" · การ์ดหน้าสแกนเดิม |
| AC-08 | API | A › TC-17, TC-18, TC-19, TC-20 [guard] · TC-36 | guard ผ่าน 4 · **TC-36 ล้ม** `200 ≠ 409` | ไม่ถาม `raise: null` · TC-36: ฌ เข้ามาระหว่างอ่านกับเขียน → 409 count 1 |
| AC-08 | B | TC-47 | — | ไม่มีกล่องถาม |
| AC-09 | API | A › TC-21, TC-22 [guard] | ผ่าน | เหมือนเดิม |
| AC-09 | B | TC-41 | — | ข้อความ "ลดคะแนนเต็มไม่ได้ มี 2 รายการที่คะแนนเกิน" (client สร้างจาก `over`) |
| AC-10 | API | A › TC-33, TC-34 | **ล้ม 2** — `raise.count` undefined / `[200,200]` ≠ `[200,409]` | กดซ้ำ = 409 ไม่ลงซ้ำ · พร้อมกัน = ลง 1 ครั้ง audit ช่อง 3 |
| AC-10 | B | TC-37, TC-38, TC-39 | — | Dialog เดิม, Tab วน, ยกเลิก/Esc/นอกกล่อง = ไม่ส่งคำขอ, กดสองครั้ง = คำขอเดียว |
| AC-11 | B | TC-40 (pages.json 4 หน้า × 4 อุปกรณ์) | — | ปุ่ม 3 ปุ่มครบ ไม่เลื่อนแนวนอน ชื่อ 80 ตัวอักษรตัดบรรทัด ≥13px ปุ่ม ≥44px |
| AC-12 | API | A › TC-23 ×3 (moved/finished/inactive) | **ล้ม 3** — `expected 200 to be 409` | count 3 รวม ซ ห้อง 2 |
| AC-13 | API | A › TC-24 [guard], TC-25, TC-26 [guard] | **TC-25 ล้ม** — EP-02 ก score 10 ≠ 20 | 47/60 = 78% · ก 28/30 = 93% · คงไว้ 45% / 60% |
| AC-13 | B | TC-43 | — | สมุด 20/20 · ข้อความ "ปรับเป็นเต็มใหม่ 3 คน" · หน้าสแกนเต็ม 20 ≤ 60 วิ |
| AC-14 | API | A › TC-27, TC-28, TC-29 | **ล้ม 3** — `raise.batchId` undefined | ย้อน 3 ช่อง full 20 · `modified_since` · ซ้ำ changed 0 |
| AC-14 | B | TC-44 | — | ปุ่มย้อนกลับในข้อความหลังบันทึก · ข้อความ modified_since ของ client |
| AC-15 | API | A › TC-30, TC-35 · TC-31, TC-32 [guard] | **ล้ม 2** — `200 ≠ 409` / `200 ≠ 422` | 409 ข้อความไทยตรงตัว · schema 422 · 200 เมื่อไม่มีคนได้เต็มเดิม · 401 |
| AC-15 | B | TC-45 | — | แอปเก่าแสดงข้อความในฟอร์มเดิม |

## Test cases

| TC | AC | ขั้นตอน | ข้อมูล | ผลที่คาด (ตัวเลขคำนวณมือไว้ก่อน) | วิธี |
|---|---|---|---|---|---|
| TC-01 | AC-01 | บันทึก a1 เต็ม 20 ไม่ส่ง raise_choice | F | 409 `raise_choice_required` count 3, from 10, to 20 · ไม่มีอะไรลง (E1) | auto · A (ล้มก่อนแก้) |
| TC-02 | AC-01 | บันทึก 20 + `raise_choice: adjust`, `raise_from: 10` | F | 200 · full 20 · ก ข ซ 20 status/late/submitted_at เดิม method bulk updated_at/event_at ≥ เวลาส่ง · ค ง จ ฉ ช 9 ฟิลด์เดิม · raise {adjust,10,20,3,batchId} (E2) | auto · A (ล้มก่อนแก้) |
| TC-03 | AC-01 | ตัวอย่าง BR-02 | ก on-time, ข late | ก {submitted,20,late 0,เวลาเดิม} · ข late 1 คงไว้ | auto · A (ล้มก่อนแก้) |
| TC-04 | AC-01 | งานปิดรับ + เพิ่มเต็ม | F status closed | ถาม (409 count 3) · ปรับได้ (BR-01 ปิดรับก็ถาม) | auto · A (ล้มก่อนแก้) |
| TC-05 | AC-01 | ค = 9.5 (ขั้น 0.5) | F | ไม่ใช่คนได้เต็ม count 3 · ค ยัง 9.5 | auto · A (ล้มก่อนแก้) |
| TC-06 | AC-02 | บันทึก 20 + keep | F | ช่องเดิมทั้งหมด · audit ช่อง 0 · audit งาน before 10 after 20 `raise {keep,3}` batch_id ไม่ว่าง · `raise.batchId` null (E3) | auto · A (ล้มก่อนแก้) |
| TC-07 | AC-03 | ถือคำขอปรับไว้ก่อนเขียน (gateBatch) → epoch = 2 → ปล่อย | F | 409 `epoch_changed` · full 10 · ช่องเดิม · audit 0 (E7) | auto · A [guard] |
| TC-08 | AC-03 | คำขอปรับ + เพิ่มห้อง c3 · ระหว่างถือ c3 ย้ายปี 2570 | F + c3 ว่าง | 422 `class_year_mismatch` · ไม่มีอะไรลง | auto · A [guard] |
| TC-09 | AC-03 | trigger SQLite ทำให้ statement ล้ม (1) ตอนอัปเดตช่อง (2) ตอนเขียน audit ช่อง | F | 5xx · full 10 · ก ข ซ 10 · audit 0 (พิสูจน์ว่าอยู่ batch เดียว) | auto · A ×2 (ล้มก่อนแก้: 200) |
| TC-10 | AC-04 | ปรับสำเร็จ แล้วอ่าน audit ใหม่ | F | 4 แถว batch_id เดียว = raise.batchId · ช่อง: entity submission, entity_id a1:<sid>, action bulk, before 10 → after 20 · งาน: full 10 → 20, raise {adjust,3} (E6) | auto · A (ล้มก่อนแก้) |
| TC-11 | AC-05 | ถาม (409 count 3) → อีกเครื่องสแกน ฌ 10 → ปรับ | F + ฌ | raise.count **4** · ฌ 20 (E8) | auto · A (ล้มก่อนแก้) |
| TC-12 | AC-05 | ถือคำขอปรับ → ฌ สแกน 10 → ปล่อย | F + ฌ | 200 count 4 · ฌ 20 | auto · A (ล้มก่อนแก้) |
| TC-13 | AC-06 | อีกเครื่องตั้งเต็ม 15 → ปรับ raise_from 10 | F | 409 `full_score_changed` currentFullScore 15 ข้อความไทยมี 15 · full 15 · audit 0 (E9) | auto · A (ล้มก่อนแก้) |
| TC-14 | AC-06 | ถือคำขอปรับ → เต็มเป็น 15 → ปล่อย | F | 409 `full_score_changed` · ไม่มีอะไรลง | auto · A (ล้มก่อนแก้) |
| TC-15 | AC-06 | กล่องเก่า + เลือกคงไว้ | F เต็ม 15 | 409 ไม่มีอะไรลง | auto · A (ล้มก่อนแก้) |
| TC-16 | AC-07 | ปรับเป็น 20 → op ฌ 10 fullScoreAtScan 10 → op ฌ 20/20 | F | `full_score_changed` currentFullScore 20 ฌ ไม่มีแถว · op ใหม่ ok (E10) | auto · A [guard] |
| TC-17 | AC-08 | a2 (ค 7, ง รอตรวจ, จ excused) 10 → 20 ไม่ส่ง choice | a2 | 200 · raise null · ช่องเดิม · audit ช่อง 0 | auto · A [guard] |
| TC-18 | AC-08 | สร้างงานใหม่ a9 เต็ม 20 | — | 200 ไม่ถาม | auto · A [guard] |
| TC-19 | AC-08 | แก้เฉพาะชื่อ/กำหนดส่ง a1 (มี 3 คนได้เต็ม) | F | 200 · score ไม่เปลี่ยน · audit ช่อง 0 | auto · A [guard] |
| TC-20 | AC-08 | เต็มเท่าเดิม 10 → 10 พร้อม choice adjust | F | 200 · raise null · ช่องเดิม | auto · A [guard] |
| TC-21 | AC-09 | a3 (ก 20, ค 15) ลด 20 → 10 | a3 | 409 `score_over_full` over 2 ไม่ใช่ raise_choice_required · ไม่มีอะไรลง (E11) | auto · A [guard] |
| TC-22 | AC-09 | a4 (ค 8) ลด 20 → 10 | a4 | 200 · ค 8 | auto · A [guard] |
| TC-23 | AC-12 | ซ ห้อง c2 สถานะ moved / finished / inactive → เพิ่มเต็ม | F | count 3 · ปรับ count 3 ซ 20 | auto · A ×3 (ล้มก่อนแก้) |
| TC-24 | AC-13 | อ่าน EP-02 ก่อนเพิ่มเต็ม | F + b (ก 8/10) | ห้อง 1 27/30 = 90% · ก 18/20 = 90% | auto · A [guard] |
| TC-25 | AC-13 | ปรับ → อ่าน EP-02 คำนวณตาม BR-03 | F + b | EP-02 full 20, ก 20 · ห้อง 1 47/60 = **78%** · ก 28/30 = **93%** (E4, E5) | auto · A (ล้มก่อนแก้: 45% / 60%) |
| TC-26 | AC-13 | คงไว้ → อ่าน EP-02 | F + b | 27/60 = **45%** · ก 18/30 = **60%** | auto · A [guard] |
| TC-27 | AC-14 | ปรับ → EP-04 bulk-undo `raise.batchId` → ลดเป็น 10 | F | 200 changed 3 · ก ข ซ 10 · full 20 · audit ช่อง +3 ไม่มี audit งาน · ลดเป็น 10 ได้ 200 (E12) | auto · A (ล้มก่อนแก้) |
| TC-28 | AC-14 | ปรับ → สมุดแก้ ก 18 → ย้อน | F | 409 `modified_since` · ก 18 ข ซ 20 · audit 0 | auto · A (ล้มก่อนแก้) |
| TC-29 | AC-14 | ย้อนสองครั้ง | F | ครั้งที่สอง 200 changed 0 · ไม่มีอะไรลง | auto · A (ล้มก่อนแก้) |
| TC-30 | AC-15 | request แอปเก่า (ไม่มี raise_choice) เพิ่ม a1 เป็น 20 | F | 409 message ตรงตัว "มี 3 คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง" · ไม่มีอะไรลง (E13) | auto · A (ล้มก่อนแก้) |
| TC-31 | AC-15 | แอปเก่าเพิ่มเต็มเมื่อไม่มีคนได้เต็มเดิม | F ทุกคน 9 | 200 full 20 | auto · A [guard] |
| TC-32 | AC-15 | ไม่มี cookie ทั้งแบบมี/ไม่มี choice | F | 401 · ไม่มีอะไรลง | auto · A [guard] |
| TC-33 | AC-10 | ส่งคำขอปรับเดิมซ้ำ (กดซ้ำหลังสำเร็จ) | F | ครั้งแรก 200 count 3 · ครั้งสอง 409 (`full_score_changed` เพราะเต็มเป็น 20 แล้ว) ไม่มี audit ซ้ำ | auto · A (ล้มก่อนแก้) |
| TC-34 | AC-10 | สองคำขอปรับพร้อมกัน (Promise.all) | F | [200, 409] · ก ข ซ 20 · audit ช่องรวม 3 | auto · A (ล้มก่อนแก้) |
| TC-35 | AC-15 | raise_choice ไม่มี raise_from / raise_from ไม่มี choice / choice "maybe" | F | 422 ทั้ง 3 · ไม่มีอะไรลง (EP-05 schema) | auto · A (ล้มก่อนแก้: 200) |
| TC-36 | AC-08 | แอปเก่า เพิ่มเต็มเมื่ออ่านแล้วไม่มีใครได้เต็ม · ระหว่างถือคำขอ ฌ สแกน 10 | F ทุกคน 9 | 409 `raise_choice_required` count 1 · ไม่มีอะไรลง (guard ใน batch EP-05 case 9) | auto · A (ล้มก่อนแก้: 200) |
| TC-37 | AC-10 | สมุดคะแนน → จัดการงาน → แก้ไข → เต็ม 20 → บันทึกงาน | fixture asg_gb_14 44 คน | กล่องเป็น Dialog เดิม (role=dialog, aria-modal, Tab วนในกล่อง) · มีชื่องาน, จำนวน, 10/10 → 20/20, คงไว้ 10/20 · ปุ่ม ยกเลิก / คงไว้ 10/20 / ปรับเป็น 20/20 (หลัก สีน้ำเงิน) | browser · เฟส 4 (read_page + ภาพ) |
| TC-38 | AC-10 | เปิดกล่อง → ยกเลิก / Esc / แตะนอกกล่อง | เหมือน TC-37 | กลับฟอร์มค่า 20 ยังอยู่ · network ไม่มี POST เพิ่ม | browser · read_network_requests |
| TC-39 | AC-10 | ดับเบิลคลิก "ปรับ" | เหมือน TC-37 | POST /api/assignments พร้อม raise_choice = 1 ครั้ง · ปุ่ม disabled จนได้ผล | browser · read_network_requests |
| TC-40 | AC-11 | pages.json `c02-form`, `c02-ask-all` (44 คน), `c02-ask-one` (1 คน), `c02-saved-undo` × 4 อุปกรณ์ | ชื่องาน 80 ตัวอักษร (สมมติ) | ปุ่ม 3 ปุ่มเห็นครบ ไม่เลื่อนแนวนอน · ชื่อตัดบรรทัดไม่ล้น · ตัวอักษร ≥13px · ปุ่ม ≥44px บนจอสัมผัส · ตัวเลข 1 / 44 ถูก | browser · shots.cjs + visual-check.json |
| TC-41 | AC-09 | ลดเต็มงานที่มีคะแนนเกิน 2 รายการผ่านฟอร์ม | fixture | ข้อความ "ลดคะแนนเต็มไม่ได้ มี 2 รายการที่คะแนนเกิน" ในฟอร์ม · ไม่มีกล่องถาม | browser |
| TC-42 | AC-03 / AC-06 | ระหว่างกล่องเปิด อีกแท็บแก้เต็มเป็น 15 → กดปรับ | fixture สองแท็บ | กล่องปิด ฟอร์มยังเปิดค่าที่กรอกอยู่ ข้อความไทยให้เปิดใหม่ · ไม่มีอะไรลง | browser |
| TC-43 | AC-13 | ปรับสำเร็จ → ดูสมุด (โหลดใหม่) + หน้าสแกนอีกแท็บรอ ≤ 60 วิ | fixture | สมุด 20/20 · ข้อความ "บันทึกแล้ว · ปรับเป็นเต็มใหม่ N คน" · หน้าสแกนเต็ม 20 | browser |
| TC-44 | AC-14 | กด "ย้อนกลับ" ในข้อความหลังบันทึก · แยก: แก้ 1 ช่องก่อนกด | fixture | กลับ 10/20 · ข้อความ modified_since ของ client "มีคะแนนถูกแก้หลังปรับ — ย้อนกลับไม่ได้ แก้ในสมุดคะแนนแทน" | browser |
| TC-45 | AC-15 | build 2285c17 (แอปเก่า, `git archive` ใน scratchpad) + worker ใหม่ → แก้เต็ม 10 → 20 | fixture | ฟอร์มเดิมแสดงข้อความ "มี N คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง" · ไม่มีอะไรลง | browser · ไม่ checkout |
| TC-46 | AC-07 | iPad ออฟไลน์สแกน ฌ (เต็ม 10) → คอมเพิ่มเป็น 20 + ปรับ → iPad ต่อเน็ต | fixture สอง context | "ส่งไม่สำเร็จ" 1 รายการ เหตุผล "คะแนนเต็มถูกแก้ไข" · การ์ดหน้าสแกนเดิม · ฌ ไม่มีแถว | browser (ต้องมีสคริปต์ offline แบบ offline-e2e.cjs) |
| TC-47 | AC-08 | แก้งานที่ไม่มีคนได้เต็ม 10 → 20, สร้างงานใหม่, คัดลอกงาน, แก้ชื่อ | fixture | ไม่มีกล่องถาม บันทึกทันที | browser |

นับ: ล้มก่อนแก้ — AC-01 5 · AC-02 1 · AC-03 2 · AC-04 1 · AC-05 2 · AC-06 3 · AC-08 1 · AC-10 2 · AC-12 3 · AC-13 1 · AC-14 3 · AC-15 2 = **26** · [guard] 13 (AC-03 2 · AC-07 1 · AC-08 4 · AC-09 2 · AC-13 2 · AC-15 2) · AC-11 = เบราว์เซอร์เท่านั้น

## กรณีขอบและกรณีผิด

| TC | กรณี | ผลที่คาด |
|---|---|---|
| TC-40 | ยาวสุด: ชื่องาน 80 ตัวอักษรไทย (100 code units) · จำนวน 1 และ 44 | ตัดบรรทัด ไม่ล้น ปุ่มครบ |
| TC-33, TC-34, TC-39 | กดซ้ำเร็ว ๆ / ส่งซ้ำ / สองเครื่องพร้อมกัน | ลงครั้งเดียว ที่เหลือ 409 ไม่มี audit ซ้ำ |
| TC-05 | ทศนิยม 9.5 ใต้เต็ม 10 | ไม่นับเป็นคนได้เต็ม |
| TC-20, TC-22 | เต็มเท่าเดิม / ลด | ไม่ถาม |
| TC-25, TC-26 | ปัดเศษ 78.33 → 78, 93.33 → 93 (Math.round) | ตาม BR-03 |
| TC-03, TC-19 | late/กำหนดส่ง: ข late 1 คงเดิมหลังปรับ · แก้กำหนดส่งพร้อมกัน | late ตาม lateFix เดิม (EP-05 ข้อ 3) |
| TC-11, TC-12, TC-36 | สองเครื่อง: มีคนได้เต็มเข้ามาระหว่างถาม/ระหว่างอ่านกับเขียน | นับตอนเขียน |
| TC-13..15, TC-42 | สองเครื่อง: เต็มถูกแก้ระหว่างกล่องเปิด | 409 ไม่ลง |
| TC-46 | เน็ตหลุด: op ค้างคิวใช้เต็มเก่า | full_score_changed เหมือนเดิม |
| TC-32 | ผู้ใช้ไม่มีสิทธิ์ (ไม่ล็อกอิน) | 401 ไม่มีอะไรลง |
| TC-07..09 | ล้มกลางทาง (epoch, ปีการศึกษา, statement) | ไม่มีอะไรลงเลย |
| TC-23 | นักเรียน moved / finished / inactive ห้องอื่น | นับและปรับ |

## Regression

- ชุดเทสต์เดิม: `npm test` เทียบ baseline — ดู §11 (ไฟล์เดิมต้องผ่านทั้งหมด; ล้มเฉพาะไฟล์ใหม่ `c02-raise-full-score.test.ts` 26 ข้อ)
- ส่วนเดิมที่อาจกระทบ: เทสต์เดิมที่ POST /api/assignments แบบเพิ่มเต็มทั้งที่มีคนได้เต็มเดิม (เช่น `final-audit.test.ts` "full(15)" หลัง clear, `race-r1.test.ts` B05) — ถ้า Dev ทำแล้วเทสต์เดิมล้มเพราะได้ 409 `raise_choice_required` ต้อง**รายงาน PM** ไม่แก้เทสต์เดิมให้อ่อนลง (อาจต้องเพิ่ม raise_choice ในเทสต์เดิมโดยมีเหตุผลใน decisions) · EP-04 bulk-undo, EP-03 bulk, EP-01 `full_score_changed` ใช้ชุดเดิม `qa-m1-02`, `server-intent`, `final-audit`, `race-r1`, `late-flag`, `guards-in-transaction`, `manage`

## 8. 🖥 ภาพหน้าจอ (pages.json ของ job)

`docs/team/jobs/2026-11-02-integrity-c02/pages.json` — 4 หน้า × 4 อุปกรณ์ = 16 ภาพ · fixture `layout:true`: งาน `asg_gb_14` (คณิตศาสตร์ ป.6/1, 44 คนสมมติ) ถูกตั้งชื่อยาว 80 ตัวอักษร (สมมติ) ทุกครั้งที่โหลด

| หน้า | สิ่งที่ภาพต้องแสดง (after) | before |
|---|---|---|
| `c02-form` | ฟอร์มแก้ไขงาน ชื่อยาว คะแนนเต็ม 20 (ยังไม่กดบันทึก) | ถ่ายได้ (ฟอร์มเดิม) |
| `c02-ask-all` | กล่องถาม 44 คน · 10/10 → 20/20 · ปุ่ม 3 ปุ่ม | ไม่มี (บันทึกเงียบ — setup คืน 'no ask') |
| `c02-ask-one` | กล่องถาม 1 คน | ไม่มี |
| `c02-saved-undo` | ข้อความหลังบันทึก "ปรับเป็นเต็มใหม่ 44 คน" + ปุ่มย้อนกลับ · สมุดแสดง 20/20 | ไม่มี |

setup ทำซ้ำได้ทุกครั้งที่โหลด: ล้างงาน (bulk clear) → บันทึกเต็ม 10 + ชื่อยาว → ทั้งห้องส่ง + ให้เต็ม (44) หรือให้ 10 เฉพาะเลขที่ 4 (1) → เปิดสมุด → จัดการงาน → แก้ไข → เต็ม 20 → [บันทึกงาน → กล่องถาม] → [ปรับ → ข้อความ] · ยังไม่ได้รัน shots (ต้อง build + พอร์ตจาก PM)

## 9. หลักฐานที่จะบันทึก (หลังมีโค้ดแก้เท่านั้น — ตอนนี้ยังไม่เรียก evidence.mjs)

| check | kind | AC | จาก |
|---|---|---|---|
| Q-01 | regression (mandatory) | ทั้งหมด | `npm test` ไฟล์เดิมผ่านทั้งหมด + ไฟล์ใหม่ผ่าน · `npm run typecheck` |
| Q-02 | expected-from-br (💰) | AC-01, AC-02, AC-05, AC-13 | §1 E1–E13 = ผลจริงหลังแก้ |
| Q-03 | reconciliation (🗑) | AC-03, AC-04, AC-14 | จำนวนแถว audit/ช่อง ก่อน-หลัง (ปรับ +4, ย้อน +3, ล้ม 0) · dry-run/restore = N/A ที่รับใน brief |
| Q-04 | visual-before-after (🖥) | AC-10, AC-11 | shots before/after + visual-check.json + sheet PASS |
| Q-05 | atomicity / concurrency / idempotency (เสริม) | AC-03, AC-06, AC-10 | TC-07..09, TC-12, TC-14, TC-33, TC-34, TC-36 |

## 10. ช่องว่าง / ความเสี่ยง / คำถาม

1. **สัญญา**: ร่างแรกของเทสต์ใช้ชื่อชั่วคราว (`raise_full`, `expected_full_score`, `full_score_raise_unconfirmed`, `adjusted`/`batchId` ระดับบนสุด) — EP-05 v2 ออกระหว่างเขียน QA เปลี่ยนเป็น `raise_choice`, `raise_from`, `raise_choice_required`, `raise {choice,from,to,count,batchId}`, audit งาน `after.raise` แล้ว (บล็อก `C` บนสุดของไฟล์) · ถ้า EP-05 เปลี่ยนอีก QA ปรับ ไม่ให้ Dev แก้เทสต์เอง
2. **ข้อความ AC-06**: AC เขียน "ข้อความไทยให้โหลดใหม่" แต่ EP-05 ใช้ "…(ตอนนี้ 15) — ปิดแล้วเปิดแก้ไขงานใหม่" → เทสต์ตรวจแค่ภาษาไทย + มี 15 (ความหมายเดียวกัน) · ถ้า SA ต้องการคำว่า "โหลดใหม่" ตรงตัว ต้องแก้ที่สัญญา
3. **ข้อความ AC-09** "ลดคะแนนเต็มไม่ได้ มี 2 รายการที่คะแนนเกิน" สร้างฝั่ง client (`AssignmentModal` จาก `over`) server ตอบแค่ `{error, over}` → API ตรวจแค่ error/over, ข้อความตรวจในเบราว์เซอร์ TC-41
4. **ห้องผิดปีการศึกษา (AC-03)**: guard เดิมทำงานเฉพาะห้องที่ "เพิ่ม" หรือย้ายภาคเรียน — การเปลี่ยนปีของห้องที่มอบอยู่แล้ว (c2) ระหว่างบันทึกโดยไม่เปลี่ยนรายการห้อง ได้ 200 ที่ 2285c17 ด้วย (พฤติกรรมเดิม ไม่ใช่ C-02) → TC-08 ใช้การเพิ่มห้อง c3 · ถ้า SA ต้องการให้ครอบคลุมห้องเดิมด้วย = งานใหม่
5. **AC-11 "45 คน"**: ห้องใน fixture มีสูงสุด 44 คน → pages.json ใช้ 44 (เลขสองหลักเหมือนกัน) · ถ้าต้องการ 45 ตรงตัวต้องเพิ่มข้อมูลใน fixture-server.cjs (นอกขอบเขตเขียนของ QA)
6. **ชื่อยาว 80 ตัวอักษร** = 80 grapheme / 100 code unit — ถ้า schema จำกัดชื่อ < 100 ตัว setup จะคืน 'reset 422' (เห็นได้ตอนถ่าย) ต้องลดความยาว
7. **AC-10 กล่อง/ปุ่ม/Esc/กดสองครั้ง** ยังไม่มี unit test (ห้ามอ่านโค้ด UI ของงานนี้ก่อนมี) → เบราว์เซอร์ TC-37..39 · ถ้า PM ต้องการ unit test (`test/unit/c02-*.test.tsx`) QA เขียนแบบ black-box จากข้อความปุ่มได้หลัง Dev ทำ UI
8. **e2e ออฟไลน์ / แอปเก่า (TC-45, TC-46)**: ต้องมีสคริปต์หรือทำมือผ่าน Browser pane ในเฟส 4 · ขอ PM มอบพอร์ตและ path ถ้าต้องเขียนสคริปต์
9. **เทสต์เดิมที่อาจล้มหลังแก้** (Regression ข้างบน): เทสต์เดิมใดที่เพิ่มเต็มขณะมีคนได้เต็มเดิมโดยไม่มี raise_choice จะได้ 409 — ตรวจแล้วตอนนี้ไม่พบในชุดที่อ่าน (final-audit เพิ่มเต็มหลัง clear = ไม่มีคนได้เต็ม) แต่ต้องดูผลรันจริงหลังแก้
10. 26 เทสต์ที่ล้มทำให้ `npm test` แดงจนกว่า Dev แก้เสร็จ — ตั้งใจ (TDD) ห้าม skip

## 11. ผลรันที่ 2285c17 (ล้มก่อนแก้) — 2 พ.ย. 2569

```
$ npx vitest run test/api/c02-raise-full-score.test.ts
 × TC-01 AC-01                       expected 200 to be 409
 × TC-02 AC-01                       expected { sid: 'st1', score: 10 } to deeply equal { sid: 'st1', score: 20 }
 × TC-03 AC-01 / BR-02               expected { status, score: 10, … } to match object { …, score: 20, … }
 × TC-04 BR-01 closed                expected 200 to be 409
 × TC-05 BR-01 9.5                   expected 200 to be 409
 × TC-06 AC-02 keep                  expected { choice: undefined, count: undefined } to deeply equal { choice: 'keep', count: 3 }
 ✓ TC-07 AC-03 [guard] epoch
 ✓ TC-08 AC-03 [guard] class year
 × TC-09 AC-03 ×2 (trigger)          expected 200 to be greater than or equal to 500
 × TC-10 AC-04                       expected [] to deeply equal [ 'st1', 'st2', 'st9' ]
 × TC-11 AC-05                       expected 200 to be 409
 × TC-12 AC-05 (gate)                expected undefined to be 4
 × TC-13 / TC-14 / TC-15 AC-06       expected 200 to be 409
 ✓ TC-16 AC-07 [guard]
 ✓ TC-17 / 18 / 19 / 20 AC-08 [guard]
 ✓ TC-21 / 22 AC-09 [guard]
 × TC-23 AC-12 ×3                    expected 200 to be 409
 ✓ TC-24 AC-13 [guard]
 × TC-25 AC-13                       EP-02 ก { score: 10 } to match object { score: 20 }
 ✓ TC-26 AC-13 [guard]
 × TC-27 / 28 / 29 AC-14             expected 'undefined' to be 'string' (raise.batchId)
 × TC-30 AC-15                       expected 200 to be 409
 ✓ TC-31 / 32 AC-15 [guard]
 × TC-33 AC-10                       expected undefined to be 3
 × TC-34 AC-10                       expected [ 200, 200 ] to deeply equal [ 200, 409 ]
 × TC-35 AC-15 schema                expected { extra, status: 200 } to deeply equal { extra, status: 422 }
 × TC-36 AC-08 (gate)                expected 200 to be 409
 Tests  26 failed | 13 passed (39)   — ทุกข้อที่ล้ม = AssertionError (ไม่มี syntax/import error)

$ npm run typecheck   → PASS (tsc --noEmit ไม่มี error รวมไฟล์ใหม่)
```

```
$ npx vitest run      (ทั้งชุด ที่ 2285c17 + ไฟล์ใหม่)
 Test Files  1 failed | 90 passed (91)
      Tests  26 failed | 1089 passed (1115)      ← ล้มเฉพาะ test/api/c02-raise-full-score.test.ts (26) · ไฟล์เดิม 90 ไฟล์ผ่านทั้งหมด
```

baseline: c01 test-plan บันทึก 89 ไฟล์/1068 ที่ main + C-01 merge เข้า branch นี้ (2285c17) แล้ว → 90 ไฟล์เดิม 1089 ผ่าน (ไม่มีเทสต์เดิมล้ม)

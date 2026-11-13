# Verify QA-G (T-80) — re-record หลักฐานบน snapshot สุดท้าย
สถานะ: กำลังทำ · snapshot = tree:4ee1867055d6 (ตรงกับที่ PM ระบุ) · build = สำเนาแช่แข็ง scratchpad/dist-g (จาก dist/client/client)
quality-gate เริ่มต้น: FAIL 91 (ทั้งหมดคือ "หลักฐานมาจากโค้ดเวอร์ชันอื่น" ของรายการ PASS เก่า; รายการ FAIL/NOT RUN/BLOCKED เดิมไม่ถูกนับ)

## จัดกลุ่ม stale 91 รายการ
- A. ผู้รีวิวโค้ด (team-code-reviewer) 66 รายการ: ส่วนใหญ่ = `npx vitest run <ชุดย่อย>` / `tsc | grep` / grep / อ่านโค้ด → ชุดเทสต์ที่รันซ้ำได้ครอบด้วย npm test + typecheck ทั้งชุด; ส่วนที่เป็นอ่านโค้ด/mutation probe/เทียบ BR = รันซ้ำไม่ได้ (ดู (3))
- B. Security (Q-7201..7203) 3 รายการ: รีวิวอ่านอย่างเดียว + npm audit (audit รันซ้ำได้; threat-model/pii อ่านโค้ด = (3))
- C. QA เดิม (team-qa-tester) 22 รายการ: Q-7001,7007-7010,7101,7102,7106,7107,7301,7302,7304,7305,7307,7308,74,7601-7605 → รันซ้ำ: offline-e2e, qa-sweep, qa-flows, shots, สคริปต์ CDP measure/a11y

## ผลการรันซ้ำ (snapshot tree:4ee1867055d6, build = scratchpad/dist-g) — สถานะ: เสร็จ
| ชุด | คำสั่ง | ผล | evidence |
|---|---|---|---|
| typecheck | npm run typecheck | exit 0 | Q-8002 |
| unit/API | npm test | 206 ไฟล์ 2458 tests: ผ่าน 2455, ล้ม 3 = timeout 5000ms ใต้โหลด (sec-auth, fixture-datasets, hr-st2-t52) → รัน 3 ไฟล์เดี่ยว 70/70 PASS (ไม่ใช่ regression; ควรให้ Dev พิจารณา timeout ให้ทนโหลด = P3) | Q-8003 |
| audit | npm audit | 0 vulnerabilities | Q-8004 |
| build | vite build --outDir scratchpad (ไม่แตะ dist) | ok | Q-8009 |
| offline-e2e | QA_PORT=4210 | 32/32 | Q-8005 (+ Q-7301 แทนเดิม) |
| qa-sweep | QA_PORT=4211 | P1/P2/P3 = 0 | Q-8006 (+ Q-7302, Q-7307) |
| qa-flows | preload lateAfter=00:00, 4212 | 49/49 | Q-8007 |
| shots | 12 หน้า x 4 อุปกรณ์ บน fixture --home/--scan/--gb14/layout b/c; เปิดดูครบ 48/48 (thumb); visual-check.json; shots-sheet --diff PASS | PASS (ไม่พบภาพผิดเกณฑ์) iPad จริง = NOT RUN (D09) | Q-8008 + Q-74 |
| multi-device/H02/lock a11y | Q-7801..7804 ของ QA-F อยู่บน snapshot นี้แล้ว (ไม่ต้องรันซ้ำ) | PASS | — |

หมายเหตุวิธีบันทึก: evidence.mjs แทนที่เฉพาะ check id เดียวกัน → รายการเก่าที่คำสั่งเดิมเป็นชุดย่อยของ npm test/typecheck (vitest subset, tsc|grep) ผมบันทึกซ้ำ "ด้วย id เดิม" (คง AC/kind เดิม, command ระบุว่าครอบด้วยการรันทั้งชุด) 41 รายการ + Q-7101/7202/7301/7302/7307/74 ; Q-8002..8009 เป็น id ใหม่ของแต่ละชุด
(หมายเหตุ: Q-3702 เดิมมีหมายเหตุ Gradebook 2 ล้มของ T-46 — ตอนนี้ทั้งชุดผ่าน)

## quality-gate หลังรันซ้ำ: เหลือ FAIL 44 (จาก 91) — ทั้งหมดคือ "หลักฐานมาจากโค้ดเวอร์ชันอื่น" ของรายการที่รันซ้ำเป็นสคริปต์ไม่ได้ → ให้ PM ตัดสิน (ห้ามบันทึก PASS ลอย)
ก) อ่านโค้ด/เทียบ BR/ผลรีวิว (ผู้รีวิวโค้ด) 26: Q-3102(mutation probe), 3202(grep), 3703, 3803(อ่านโค้ด a11y), 3303, 3304(grep hex ใน css), 3402, 3503, 3504, 3603, 3903(diff ฟังก์ชันเทียบ HEAD), 4002(diff), 4005(pii grep), 4304(git diff), 4402, 4403, 4502, 4602, 4802(pii อ่านโค้ด), 4903, 4904, 5003, 5203, 5206(grep ไอคอน), 5404(probe ใน scratchpad), 6502(grep fixture ไม่ติด prod bundle)
   → ทางเลือก: (1) PM รับเป็น "รีวิวโค้ดรอบก่อน + อ่านซ้ำบน diff ที่เปลี่ยนหลังจากนั้น" หรือ (2) ให้ team-code-reviewer ตรวจซ้ำ grep/diff เหล่านี้บน snapshot (ส่วนใหญ่ทำได้ด้วยคำสั่ง ≤ 30 นาที) — ผมแนะนำ (2) เฉพาะ 3304/3202/5206/6502/4002/4005/4304 (เป็นคำสั่ง grep/diff แน่นอน) ส่วนที่เหลือเป็นการอ่านโค้ด ให้ PM รับตามเหตุผลของรอบก่อน
ข) Security 2: Q-7201 (threat-model อ่านโค้ด), Q-7203 (pii grep) → ต้อง Security ตรวจซ้ำ หรือ PM รับ (Q-7202 npm audit ทำซ้ำแล้ว)
ค) QA เดิม 16: สคริปต์ CDP scratch ของรอบ A/C/D/E ไม่อยู่ในรีโป (m*.cjs, c1.cjs, measure2.mjs, tc*.cjs): Q-7001,7007,7008,7009,7010 (วัดขนาดสัมผัส/contrast ที่หน้าสมุดคะแนน-สแกน), 7601,7602,7603,7604,7605 (เด็ก 45 คน x 20 งาน/ชื่อ 200 ตัว), 7102 (xlsx ออฟไลน์), 7106 (prefs/IndexedDB), 7107 (pii ซ่อนชื่อ 7 หน้า), 7304 (print media), 7305 (StartTermModal + projector), 7308 (tc-700/800)
   → รันซ้ำไม่ได้โดยไม่เขียนสคริปต์ใหม่ (ห้ามแก้ scripts/); บางส่วนมีสคริปต์ที่ QA-F เก็บไว้ (verify-f/md.cjs, gb.cjs) แต่คนละการวัด · ทางเลือก: สั่ง QA เขียนสคริปต์วัดซ้ำใน evidence/verify-h หรือ PM รับว่าค่าที่วัดแล้วไม่เปลี่ยน (โค้ดที่เปลี่ยนหลังรอบนั้นคือ StudentsHero/students.css/ปุ่มปิดรับงาน ซึ่ง Q-7801..7804 + shots ครอบแล้ว)

พอร์ต 4210–4214 ใช้แล้ว server ปิดแล้ว · ไม่มีบั๊กใหม่

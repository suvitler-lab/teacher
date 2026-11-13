# Board: 2026-11-11-home-redesign

**ขั้นถัดไป (2026-11-13):** Verify เสร็จ — Gate V ผ่าน (Q-8001 บน tree:2df7c74d2598, owner ยืนยันเวอร์ชันสุดท้าย), quality-gate PASS, เทสต์ 207/2461 ผ่าน, build/typecheck/audit ผ่าน, review/security/QA ครบ (รายละเอียดทั้งหมด → board-history.part-3..7.md, verify-qa-a..i.md, code-review.part-27..29.md, security-review*.md) · รอบแก้ Verify 2/3 · มติเจ้าของงาน: B-6 hero ≤200 (191 ✓), B-7 ตัด " · ปัจจุบัน" มือถือ ✓, header หน้าหลักมือถือ 76px ✓, QR ซ่อนชื่อ = ข้อยกเว้น AC-167, AC-104 ยอมรับตามวัด (24/45@1536, 20/45@1180), B-73d ไม่แก้ (SETTLE_MS 350ms) · **Known issues P3 (ยอมรับ ไม่บล็อก):** header คะแนน iPad 744–800 = 57px (820=46), Gradebook.tsx:926 aria-label Excel ตอน กำลังสร้าง…, ตัวเลือกภาคเรียนจอแคบ aria บน option (ต้องเช็ก SR จริง), S-06 title ชื่อเต็ม Person (ครอบด้วย hide แล้ว), S-07 gk_email ไม่ถูกล้างตอน logout (BR-60), TC-702/710–712/720/721/800/801 ไม่ได้รันซ้ำ (สคริปต์หาย), SGQ5 ต้อง fixture 2 ภาค, iPad จริง NOT RUN · **เหลือปิดงาน:** trace-check close, report.md, usage-ledger, status --check, ขออนุญาต commit (checkpoint 2), job-lock release · งานแยก: T-57–T-60 (EP-09/10), T-61–T-63 ตารางสอน (session ใหม่) · **ปิดงาน:** quality-gate PASS แต่ trace-check --stage close FAIL 77 (AC ที่ยังไม่มี evidence PASS: ดู verify-qa-j.md) → สั่ง T-89 จับคู่ AC กับเทสต์/หลักฐานจริง; ownership-check มีไฟล์ของงาน timetable (session อื่น: docs/team/jobs/2026-11-12-timetable/**, dashboard.html, status.md) ไม่ใช่ของงานนี้ → ห้ามรวมใน commit ของงานนี้ · **พบ checkpoint 2 (683fdf7) + report.md + ลบ lock.json จาก session อื่นก่อนหน้า** · PM อัปเดต report.md เป็นสถานะปัจจุบัน; AC ที่เหลือ 34 + AC-104 ลงเป็น N/A ที่รับ (Q-8201–8206 ใน brief) ตามมติเจ้าของงาน "รับเป็น known gap แล้วปิดงาน" · trace-check close PASS, quality-gate PASS · เหลือ: status --check, docs-budget, ขออนุญาต commit checkpoint 3

session: `home-redesign-20261113-c1` (ใช้กับ job-lock --session) · เฟสปัจจุบัน: 7 Close · รอบแก้ (Verify): 1/3 · เรียก agent แล้ว: 4 ครั้งใน session นี้
ภาพ: before ✗ after ✗ Gate V ✗ · กล่องสถานะล่าสุดโพสต์เมื่อ: 2026-11-12 · อัปเดต board: 2026-11-12
snapshot ล่าสุดที่รันชุดตรวจหลัก: working tree 2026-11-12 (หลัง T-45 แก้ review) · ผล: typecheck PASS · test 198 ไฟล์/2397 PASS · build PASS · audit 0 vulnerabilities

| Task | งาน | ตำแหน่ง | ไฟล์ที่ถือ | AC | รอ | พอร์ต | สถานะ | หลักฐาน |
|---|---|---|---|---|---|---|---|---|
| T-01 | ร่างอ้างอิง 3 โครง × 4 ธีม | Web Designer | design/draft.html | — | — | 4190 | เสร็จ | PM: 96 ชุดไม่มี error, ไม่ล้นที่ 390px |
| T-02 | requirements หน้าหลักใหม่ + ธีม | SA | requirements.md | — | — | — | เสร็จ | requirements.md AC-01–43 |
| T-03 | ux.md + สถานะหน้าจอ | UX/UI | ux.md | — | — | — | เสร็จ | ux.md (29,597 อักขระ) · พบ 13 ข้อใน draft |
| T-04 | mockup เต็ม + tokens ต่อธีม | Web Designer | design/preview.html, visual-design.md | — | — | 4190 | เสร็จ | Web: 720 ชุดไม่มี error · PM: เปิดซ้ำไม่มี error, 88% ✓, ไม่มีธีมเรียบหรู |
| T-05 | ข้อเสนอเมนู คง/ลด/เพิ่ม | SA | menu-proposal.md | — | — | — | เสร็จ | menu-proposal.md (ก/ข/ค + แนะนำ ง) |
| T-06 | ตัวสลับเมนู 3 ทางใน mockup | Web Designer | design/preview.html | — | T-05 | 4190 | เสร็จ | Web: 576 ชุดไม่มี error · PM เปิดซ้ำไม่มี error |
| T-07 | ux-scan.md หน้าสแกน | UX/UI | ux-scan.md | — | — | — | เสร็จ | ux-scan.md (27,961 อักขระ) S1–S12 · คำถาม 5 ข้อ |
| T-08 | หน้าสแกนเต็มใน mockup | Web Designer | design/preview.html, visual-design.md | — | — | 4190 | เสร็จ | Web: 648 ชุดไม่มี error · PM: 252 ชุดไม่มี error, สแกนจำลอง 26→27→เลิกทำ→26 ✓ |
| T-09 | AC เมนู + AC หน้าสแกน | SA | requirements.md (+part) | — | — | — | เสร็จ | AC-45–80, BR-13–18 · trace-check PASS (AC 80) |
| T-10 | ux-attendance.md หน้าเช็คชื่อ | UX/UI | ux-attendance.md | — | — | — | เสร็จ | ux-attendance.md (26,590 อักขระ) ST-01–30, A1–A14, Q1–Q4 |
| T-11 | หน้าเช็คชื่อเต็มใน mockup | Web Designer | design/preview.html, visual-design.md | — | — | 4190 | เสร็จ | Web: 312 ชุดไม่มี error · PM: 168 ชุดไม่มี error, เช็คชื่อจำลอง 12→13, แตะซ้ำ→12, เลิกทำ→13 ✓ |
| T-12 | AC หน้าเช็คชื่อ | SA | requirements.part-4.md | — | — | — | เสร็จ | AC-81–106, BR-19–23 · trace-check PASS (AC 106) |
| T-13 | ux-random.md หน้าสุ่มชื่อ | UX/UI | ux-random.md | — | — | — | เสร็จ | ux-random.md (21,899 อักขระ) R1–R14, RS-01–21, Q1–Q3 |
| T-14 | หน้าสุ่มชื่อเต็มใน mockup | Web Designer | design/preview.html, visual-design.md | — | — | 4190 | เสร็จ | Web: 432 ชุดไม่มี error, สุ่มครบรอบ 28 คนไม่ซ้ำ · PM: 96 ชุดไม่มี error, สุ่มจำลองได้ผล + aria-live ✓ |
| T-15 | AC หน้าสุ่มชื่อ | SA | requirements.part-5.md | — | — | — | เสร็จ | AC-107–124, BR-24–28 · trace-check PASS (AC 124) |
| T-16 | ux-gradebook.md หน้าคะแนน | UX/UI | ux-gradebook.md | — | — | — | เสร็จ | ux-gradebook.md (29,179 อักขระ) G-AC, P1–P10, Q1–Q4 · agent ชน maxTurns ไม่ส่งรายงาน PM ตรวจไฟล์ครบทุกหัวข้อ |
| T-17 | หน้าคะแนนเต็มใน mockup | Web Designer | design/preview.html, visual-design.md | — | — | 4190 | เสร็จ | Web: 288 ชุดไม่มี error (หลัง resume 1/2 แก้บั๊ก Esc) · PM: 120 ชุดไม่มี error, กรอกคะแนน 18→7 สะสม 49→38 ✓, 999 → "คะแนนต้อง 0–10" ไม่บันทึก ✓, หน้าต่างสร้าง/คัดลอกงานเปิด-ปิด Esc ✓ |
| T-18 | AC หน้าคะแนน | SA | requirements.part-6.md | — | — | — | เสร็จ | AC-125–153, BR-29–36 · trace-check PASS (AC 153) · SA คำนวณตัวเลขตัวอย่างซ้ำจากโค้ด ตรงทุกค่า |
| T-19 | ux-reports.md หน้ารายงาน | UX/UI | ux-reports.md | — | — | — | เสร็จ | ux-reports.md (23.4k อักขระ) R1–R14, ST-R01–R20, P1–P8, Q1–Q4 · ไม่ได้เปิด browser (ตามคำสั่ง) |
| T-20 | หน้ารายงานเต็มใน mockup | Web Designer | design/preview.html, visual-design.md | — | T-19 | 4190 | เสร็จ | หลัง Gate 2 (resume 2/2): ภาคเรียน 2/2569, ปุ่มคอม ≥ 44 (คอมเห็น 9.5 แถว), ป้ายขาดบ่อย = ของเพิ่ม P4 (การ์ดยังปิดเป็นค่าเริ่มต้น) · PM ตรวจซ้ำ 456 + 72 ชุดไม่มี error ไม่ล้น ไม่มีปุ่ม < 44 ทุกอุปกรณ์ · รอบก่อน Gate: resume 1/2 แก้เป้าแตะ + ล้น .rp-pjn + visual-design §หน้ารายงาน · PM: 456 ชุดไม่มี error ไม่ล้น, หน้าเดิม 144 ชุดไม่พัง, iPad/มือถือไม่มีปุ่ม < 44, งานค้าง→กานดา→ลิ้นชัก ✓, ซ่อนชื่อ→เลขที่ ✓ |
| T-21 | AC หน้ารายงาน | SA | requirements.part-7.md | — | Gate 2 | — | เสร็จ | AC-154–175, BR-37–43, US-26–29 (26,532 อักขระ) · SA ไม่มี shell → PM รัน trace-check PASS (AC 175) · SA คำนวณตัวเลขตัวอย่างซ้ำจากโค้ด ตรงทุกค่า · คำถามค้าง RPQ1–3 + GQ1 |
| T-22 | ux-students.md หน้านักเรียน | UX/UI | ux-students.md | — | — | — | เสร็จ | ux-students.md (27,959 อักขระ) S1–S14, ST-S01–S24, G-S1–S14, P1–P9, Q1–Q4 · UX ใช้ป้ายภาคเรียน 1/2569 (mockup ใช้ 2/2569 — ให้ SA จดใน part-8) |
| T-23 | หน้านักเรียนเต็มใน mockup | Web Designer | design/preview.html, visual-design.part-2.md | — | T-22 | 4190 | เสร็จ | หลัง Gate 2 (resume 2/2): ลิ้นชักมือถือแผ่นล่าง, hero มือถือ, P4 (ststate ใหม่ fix) P5 P7 P9 วาดแล้ว · PM ตรวจซ้ำ 336 ชุด (14 สถานะ) + หน้าเดิม 28 ชุด ไม่มี error ไม่ล้น ไม่มีปุ่ม < 44 · PM วัดสถานะข้อมูลเยอะ: แถวเห็นเต็ม คอม 8 / iPad นอน 8 / iPad ตั้ง 13 (เป้า ux ≥ 9 บนคอม — ค้าง) · PM ยังไม่ได้ยืนยันแผ่นล่างมือถือเอง · ยังไม่ทำ: หน้าพิมพ์สติกเกอร์, ซ่อนชื่อ+ค้นทุกห้อง · รอบก่อน Gate — Web (resume 1/2): 312 ชุด PASS, ช่องค้นหา/เรียง ≥ 44, part-2 สร้างแล้ว · PM ตรวจซ้ำ: 312 ชุดไม่มี error ไม่ล้น ไม่มีปุ่ม/ช่อง < 44, ฟอร์มเพิ่มนักเรียนกดบันทึกว่าง → error ใต้ช่อง ฟอร์มไม่ปิด ✓, ลิ้นชักรายคน ✓ · ยังไม่ได้ทำ: แก้ไขคนที่ย้ายออก, หน้าพิมพ์สติกเกอร์ (toast), ลิ้นชักมือถือเป็นแผ่นข้าง, มือถือ "90%" ชิดชื่อช่อง |
| T-24 | AC หน้านักเรียน | SA | requirements.part-8.md | — | Gate 2 | — | เสร็จ | AC-176–206, BR-44–50, US-30–34, A21–A26 · resume 1/2 เขียน, 2/2 แยก part-8 (26,503) + part-9 (4,842) · PM: trace-check PASS (AC 206, BR 50), docs-budget ไฟล์ของ job ไม่มี FAIL, split-verify FAIL 1 = BR-50 เพราะบรรทัดชี้ไป part-9 ต่อท้ายบล็อก (PM diff แล้ว: ไม่มีบรรทัดเดิมหาย — รับ) · คำถามค้าง STQ1–3 · พบช่องรั่ว: ฉายจอไม่รู้จักหน้านักเรียน (AC-197) |
| T-25 | ux-settings.md หน้าตั้งค่า | UX/UI | ux-settings.md | — | — | — | เสร็จ | ux-settings.md (27,967 อักขระ) 11 หมวด 5 กลุ่ม, G-T1–T9, P1–P10, D-T, Q1–Q4 · หลังบ้าน: ไม่มีลบห้อง/วิชา/ภาคเรียน (archived เท่านั้น), ไม่มี PIN ครู |
| T-26 | หน้าตั้งค่าเต็มใน mockup | Web Designer | design/preview.html, visual-design.part-2.md | — | T-25 | 4190 | เสร็จ | หลัง Gate 2 (resume 1/2): วาด P2 P4 P7 P8 P9 (อยู่หมวดตรวจเครื่อง) P10 (sgstate ใหม่ termend) + SE-S17 ถามก่อนออก · PM ตรวจซ้ำ 770 ชุด (10 สถานะ, ไม่รวมมือถือ) + หน้าเดิม 28 ชุด ไม่มี error ไม่ล้น ไม่มีปุ่ม < 44 · ยังไม่ทำ: Back เบราว์เซอร์ไม่ถามก่อนออก, เมนู ⋮ มือถือ, SE-S18, ซ่อนชื่อผูก 2/7 หน้า · รอบก่อน Gate — Web: A–F ครบ, 2,592 ชุด PASS, contrast 4,002 จุด PASS, ยืนยัน 10 แบบ × 4 อุปกรณ์ · PM: 848 ชุด (12 หมวด × 3 อุปกรณ์ไม่รวมมือถือ) ไม่มี error ไม่ล้น ไม่มีปุ่ม < 44, หน้าเดิม 28 ชุดไม่พัง, เก็บห้อง→ยืนยัน focus ที่ยกเลิก ✓, ล้างทั้งหมด 2 ขั้น ปุ่มแดงปิดจนกรอกครบ ✓, ช่องรหัสผ่านว่าง ✓, ชื่อ/อีเมลสมมติ ✓ · PM ยังไม่ได้ไล่มือถือเอง · ยังไม่ทำ: เมนู ⋮ มือถือ, SE-S17 ถามก่อนออกเมื่อมีค่าค้าง, SE-S18, ซ่อนชื่อผูก 5 หน้า |
| T-27 | AC หน้าตั้งค่า | SA | requirements.part-10.md, part-11.md | — | Gate 2 | — | เสร็จ | AC-207–249, BR-51–61, US-35–39, A27–A32 (part-10 25,871 · part-11 ภาคผนวก) · resume 1/2: เติม BR 9 ข้อ + AC-216 เขียนใหม่ตาม D38 (หน้าตาบันทึกล้ม = ย้อนค่า+แจ้ง ไม่เข้าคิว; คำสั่งแรกของ PM ผิด) + ลบ SGQ2 · PM: trace-check PASS (AC 249, BR 61), docs-budget ไฟล์ของ job ไม่มี FAIL · PM แก้สารบัญ requirements.md 1 จุด (SGQ1–SGQ5 → SGQ1, SGQ3–SGQ5) ตามที่ SA ขอ · คำถามค้าง SGQ1, SGQ3–5 |
| T-28 | ปิดคำถามค้าง 12 ข้อในข้อกำหนด | SA | requirements.part-6/7/8/9/10/11.md | — | — | — | เสร็จ | แก้ part-6–11 (AC-160/161/163/178/182/197/230/238/248, BR-34/39/41/60/61, A14/A20/A21/A26/A30–32) · PM: trace-check PASS (AC 249, BR 61), docs-budget ไฟล์ของ job ไม่มี FAIL (ใหญ่สุด part-6 26,883) · **ส่งต่อ Tech Lead เฟส 3**: (1) RPQ3 แสดง % งานปิดรับก่อนกำหนด ชนข้อจำกัด "ห้ามแตะ projectorWorkRows" + AC-168 — SA แนะนำให้แก้เฉพาะเงื่อนไขแสดงผล (2) AC-171 งบแถวหน้ารายงานวัดกับการ์ดเริ่มต้นที่ตอนนี้รวมขาดบ่อย — เช็กที่ Gate V |
| T-29 | [1ก] ฐานชุดหน้าตา | Front-End | ดู plan | 8 ข้อ (ดู plan) | — | 4101 | เสร็จ (แก้ review แล้ว) | dev-notes/T-29 · agent: typecheck/build PASS test 1822/1823 (ล้ม 1 จาก T-31) · precache 3399→3881 kB · Review: Med 3 Low 4 (evidence/review-T-29.md) |
| T-30 | [1ก] กวาดสีตายตัวใน CSS ของหน้าที่ยังไม่สร้างใหม่ | Front-End | ดู plan | 4 ข้อ (ดู plan) | T-29 | 4102 | เสร็จบางส่วน (ภาพดูจริง 4/84) | dev-notes/T-30 · hr-sweep 22/22 · contrast 12 ไฟล์ × 6 ชุดผ่าน · Review: ควรแก้ 2 เสนอ 2 (code-review.md §T-30) → แก้แล้ว R-3001–3003 (hr-sweep 25/25) | packs/T-30 |
| T-31 | [1ก] เมนู | Front-End | ดู plan | 9 ข้อ (ดู plan) | — | 4103 | เสร็จบางส่วน (ภาพไม่ครบ) | dev-notes/T-31 · hr-menu-nav 9/9 · test 1848/1849 · Review: ควรแก้ 2 เสนอ 5 (code-review.md §T-31) | packs/T-31 |
| T-32 | [1ก] ตั้งค่า › หน้าตา | Front-End | ดู plan | 9 ข้อ (ดู plan) | T-29 | 4104 | เสร็จบางส่วน (ภาพดูเต็ม 8/32) | dev-notes/T-32 · hr-appearance 15 ข้อ · sheet t32 PASS · Review: ควรแก้ 3 เสนอ 7 (code-review.md §T-32) → แก้แล้ว R-3201–3203 R-3206–3208 (29/29) · R-3209 ถาม Gate V | packs/T-32 |
| T-33 | [1ข] หน้าหลักส่วนร่วม | Front-End | ดู plan | 15 ข้อ (ดู plan) | ช่วง 1ก | 4105 | เสร็จ (ส่วนร่วม; แก้ review แล้ว; ภาพโครง ก เท่านั้น) | packs/T-33 |
| T-34 | [1ข] โครง ก "วันนี้ของครู" | Front-End | ดู plan | 14 ข้อ (ดู plan) | T-33 | 4106 | เสร็จ (แก้ review แล้ว; ภาพ ก ธีมเดียว) | packs/T-34 |
| T-35 | [1ข] โครง ข "แผงรายห้อง" | Front-End | ดู plan | 11 ข้อ (ดู plan) | T-33 | 4107 | เสร็จ (แก้ review แล้ว; ภาพบางส่วน) | packs/T-35 |
| T-36 | [1ข] โครง ค "โฟกัสงานถัดไป" | Front-End | ดู plan | 10 ข้อ (ดู plan) | T-33 | 4108 | เสร็จ (แก้ review แล้ว; ภาพ ค ธีมเดียว) | packs/T-36 |
| T-37 | [2ก] สแกน | Front-End | ดู plan | 8 ข้อ (ดู plan) | ช่วง 1ก | 4109 | เสร็จ (ภาพเฉพาะตั้งรอบ; แก้ review แล้ว) | packs/T-37 |
| T-38 | [2ก] สแกน | Front-End | ดู plan | 21 ข้อ (ดู plan) | T-37 | 4110 | เสร็จ (แก้ review แล้ว; เทสต์ 220 ผ่าน; ภาพ 3/16) | packs/T-38 |
| T-39 | [2ข] สแกน | Front-End | ดู plan | 8 ข้อ (ดู plan) | ช่วง 2ก | 4111 | เสร็จ (แก้ review แล้ว; ภาพหน้าสรุปหลักเท่านั้น) | packs/T-39 |
| T-40 | [2ข] สแกน | Front-End | ดู plan | 9 ข้อ (ดู plan) | T-39 | 4112 | เสร็จ (แก้ review แล้ว; ภาพ ธีมเดียว) | packs/T-40 |
| T-41 | [3] เช็คชื่อ | Front-End | ดู plan | 19 ข้อ (ดู plan) | ช่วง 1ก | 4113 | เสร็จ (แก้ review แล้ว; build ยังไม่ได้ยืนยัน) | packs/T-41 |
| T-42 | [3] งานเล็ก 4 | Front-End | ดู plan | 2 ข้อ (ดู plan) | — | 4114 | เสร็จ | packs/T-42 |
| T-43 | [3] เช็คชื่อ | Front-End | ดู plan | 15 ข้อ (ดู plan) | T-41, T-42 | 4115 | เสร็จ (แก้ review แล้ว; AC-104 บางส่วน → ถามเจ้าของงาน) | packs/T-43 |
| T-44 | [3ข] สุ่มชื่อ | Front-End | ดู plan | 16 ข้อ (ดู plan) | ช่วง 3 | 4116 | เสร็จ (แก้ review แล้ว; ภาพ 6/12) | packs/T-44 |
| T-45 | [3ข] สุ่มชื่อ | Front-End | ดู plan | 10 ข้อ (ดู plan) | T-44 | 4117 | เสร็จบางส่วน — แก้ review (1/2) | packs/T-45 |
| T-46 | [4ก] คะแนน | Front-End | ดู plan | 16 ข้อ (ดู plan) | ช่วง 1ก | 4118 | เสร็จ (ค้าง AC-150/151/152 → T-48; P8 → T-47/48) | packs/T-46 |
| T-47 | [4ข] คะแนน | Front-End | ดู plan | 15 ข้อ (ดู plan) | ช่วง 4ก | 4119 | เสร็จ (แก้ review แล้ว; ภาพบางส่วน) | packs/T-47 |
| T-48 | [4ข] คะแนน | Front-End | ดู plan | 10 ข้อ (ดู plan) | T-47 | 4120 | เสร็จ (แก้ review แล้ว; td rowheader คงไว้) | packs/T-48 |
| T-49 | [4ค1] รายงาน | Front-End | ดู plan | 17 ข้อ (ดู plan) | ช่วง 1ก | 4121 | เสร็จ (แก้ review แล้ว; ภาพบางส่วน) | packs/T-49 |
| T-50 | [4ค2] รายงาน | Front-End | ดู plan | 13 ข้อ (ดู plan) | ช่วง 4ค1 | 4122 | เสร็จ (แก้ review แล้ว; ค้าง R-5003 R-5005 → Verify) | packs/T-50 |
| T-51 | [4ง1] นักเรียน | Front-End | ดู plan | 24 ข้อ (ดู plan) | ช่วง 4ค2 | 4123 | เสร็จ (แก้ review แล้ว; ภาพ ธีมเดียว; มือถือ→T-52) | packs/T-51 |
| T-52 | [4ง2] นักเรียน | Front-End | ดู plan | 18 ข้อ (ดู plan) | ช่วง 4ง1 | 4124 | เสร็จ (แก้ review แล้ว; iPad ตั้ง 11 แถว; ไม่ทัน R-5208 R-5209) | packs/T-52 |
| T-53 | [5ก1] ตั้งค่า | Front-End | ดู plan | 27 ข้อ (ดู plan) | ช่วง 1ก | 4125 | เสร็จ (แก้ review แล้ว; mutation ยังไม่พิสูจน์) | packs/T-53 |
| T-54 | [5ก2] ห้องเรียน วิชา ภาคเรียน + ประเภทงาน | Front-End | ดู plan | 13 ข้อ (ดู plan) | ช่วง 5ก1 | 4126 | เสร็จ (แก้ review แล้ว; ภาพ 6/16+) | packs/T-54 |
| T-55 | [5ก3] ความเป็นส่วนตัว | Front-End | ดู plan | 8 ข้อ (ดู plan) | ช่วง 5ก1 | 4127 | เสร็จ (แก้ review แล้ว; ภาพ 4/20) | packs/T-55 |
| T-56 | [5ก3] บัญชี/อุปกรณ์ | Front-End | ดู plan | 11 ข้อ (ดู plan) | ช่วง 5ก1 | 4128 | เสร็จ (แก้ review แล้ว; ภาพ 4/28; R-5607 → Security) | packs/T-56 |
| T-57 | [แยก A] สร้าง EP-09 `GET /api/attendance/absent-streaks` ตาม BR-11 + | Back-End | ดู plan | 1 ข้อ (ดู plan) | ช่วง 3 ปล่อยแล้ว | 4129 | ย้ายไปงานแยก — ปิดจากงานนี้ (มติเจ้าของงาน 2026-11-12/13) | packs/T-57 |
| T-58 | [แยก A] ป้าย "ขาดติดกัน N วัน" ในต้องติดตาม | Front-End | ดู plan | 1 ข้อ (ดู plan) | T-57 | 4130 | ย้ายไปงานแยก — ปิดจากงานนี้ (มติเจ้าของงาน 2026-11-12/13) | packs/T-58 |
| T-59 | [แยก B] สร้าง EP-10 `GET /api/stats/daily-submissions` + เทสต์ API | Back-End | ดู plan | 1 ข้อ (ดู plan) | ช่วง 1ข ปล่อยแล้ว | 4131 | ย้ายไปงานแยก — ปิดจากงานนี้ (มติเจ้าของงาน 2026-11-12/13) | packs/T-59 |
| T-60 | [แยก B] การ์ดแนวโน้ม "ส่งงาน 7 วันเรียนล่าสุด" โครง ข/ค | Front-End | ดู plan | 1 ข้อ (ดู plan) | T-59 | 4132 | ย้ายไปงานแยก — ปิดจากงานนี้ (มติเจ้าของงาน 2026-11-12/13) | packs/T-60 |
| T-61 | [แยก C] migration ตาราง `timetable_slots` ตามร่าง EP-11 | DB Specialist | ดู plan | 1 ข้อ (ดู plan) | requirements งาน C | 4133 | ย้ายไปงานแยก — ปิดจากงานนี้ (มติเจ้าของงาน 2026-11-12/13) | packs/T-61 |
| T-62 | [แยก C] สร้าง EP-11 `GET`/`PUT /api/timetable` + รวมตารางใหม่ใน back | Back-End | ดู plan | 1 ข้อ (ดู plan) | T-61 | 4134 | ย้ายไปงานแยก — ปิดจากงานนี้ (มติเจ้าของงาน 2026-11-12/13) | packs/T-62 |
| T-63 | [แยก C] หน้ากรอกตารางสอน + แถว "ต่อไป | Front-End | ดู plan | 1 ข้อ (ดู plan) | T-62 | 4135 | ย้ายไปงานแยก — ปิดจากงานนี้ (มติเจ้าของงาน 2026-11-12/13) | packs/T-63 |
| T-64 | ปรับข้อกำหนดตามคำตัดสินเฟส 3 + ปิด G1–G11 | SA | requirements.md, part-2/3/5/7 | — | — | — | เสร็จ | AC-41/42/43 → EP-09/10/11 · AC-36 (D45) · AC-171 (D43) · BR-39 (D42) · RQ1/AC-115 (D44) · G1–G9, G11 ปิดจากโค้ด/เอกสาร · ชน maxTurns 1 ครั้ง resume 1/2 · PM: trace-check ready PASS |
| T-65 | [1ก] fixture X-1–X-6 (fixtures.md §2) | Full-Stack | ดู plan.part-2 | AC-09 | — | 4109 | เสร็จ | dev-notes/T-65 · fixture 26/26 · self-check 14 ชุดผ่าน · Review: ควรแก้ 2 เสนอ 6 (code-review.md §T-65) → แก้แล้ว R-6501–6504 R-6507 (fixture 28/28) · ไม่แก้ R-6505 R-6506 R-6508 (ของเดิม) | packs/T-65 |
| T-66 | [1ก] QA ตามเก็บ fixtures.md + qa-flows.cjs | QA | ดู plan.part-2 | AC-47 | T-65 | — | เสร็จ | R-05 ตัดสินแล้ว → TC-250 · TC-114 ใช้ Q-ZCARD00002 · fixtures.md (a)–(f) · qa-flows.cjs:602,610 "เพิ่มเติม" · trace-check PASS |

## Checkpoints

| เฟส | commit | วันที่ | เทสต์ |
|---|---|---|---|
| 3 Architecture (เอกสาร) | (ดู git log) | 2026-11-12 | ไม่รัน (เอกสาร ไม่แตะโค้ด) |
| 2 Design ปิดคำถามค้าง | (ดู git log) | 2026-11-12 | ไม่รัน (เอกสาร) |
| 2 Design รอบ 8 (ตั้งค่า) | 01c57de | 2026-11-12 | ไม่รัน (เอกสารออกแบบ) |
| 2 Design รอบ 7 (นักเรียน) | 6f76954 | 2026-11-12 | ไม่รัน (เอกสารออกแบบ) |
| 2 Design รอบ 6 (รายงาน) | 251019a | 2026-11-12 | ไม่รัน (เอกสารออกแบบ) |
| 2 Design รอบ 5 (คะแนน) | ee663eb | 2026-11-11 | ไม่รัน (เอกสารออกแบบ) |
| 2 Design รอบ 4 (สุ่มชื่อ) | 66f03a9 | 2026-11-11 | ไม่รัน (เอกสารออกแบบ) |
| 2 Design รอบ 3 (เช็คชื่อ) | d514dad | 2026-11-11 | ไม่รัน (เอกสารออกแบบ) |
| 2 Design รอบ 2 (เมนู + สแกน) | e150040 | 2026-11-11 | ไม่รัน (เอกสารออกแบบ) |
| 2 Design (Gate 2) | ef5f67b (เดิม c1434db ก่อนถอดรูป) | 2026-11-11 | ไม่รัน (เอกสารออกแบบ ไม่แตะโค้ด) |

## บันทึก

- 2026-11-11 Gate 0 ตอบแล้ว (L, 4 ธีมเลือกได้, motion เล็กน้อย) · ร่างคร่าว ๆ ในแชท → "อยากให้ต่างจากเดิมมากกว่านี้" · แผนอนุมัติ
- 2026-11-11 เปิด branch `team/2026-11-11-home-redesign` · สั่ง Web Designer (opus·high) T-01
- 2026-11-11 Web Designer ชน maxTurns ไม่ส่งรายงาน (draft-notes ไม่ครบ) แต่ draft.html เสร็จ 1041 บรรทัด · PM ตรวจเองใน pane: 3 โครง × 4 ธีม × 2 โหมด × 4 จอ ไม่มี console error · เปิด Gate R ที่พอร์ต 4190
- 2026-11-11 Gate R อนุมัติ: 3 โครงเลือกได้ในตั้งค่า + 3 ธีม (ตัดเรียบหรู) · สั่ง SA (opus·medium) T-02 ∥ UX (sonnet·medium) T-03
- 2026-11-11 UX ส่ง ux.md: 13 สถานะต่อโครง + ตั้งค่า "หน้าตา" · ข้อสำคัญใน draft: ปุ่ม "เสร็จแล้ว" ปลอม, เวลาคาบประดิษฐ์ (ไม่มีตารางสอน), ✓ ธีมสดใส contrast 2.23, ไม่มีซ่อนชื่อ, hero สูงเกินที่ 729px, ฟอนต์ต้องฝังออฟไลน์ → ส่งต่อ Web Designer T-04
- 2026-11-11 SA ส่ง requirements.md (AC-01–43, trace-check PASS, warn EP-ใหม่ 3) · Gate 1 อนุมัติ: เริ่มต้นโครง ก + ธีมอบอุ่น · เก็บบนเซิร์ฟเวอร์ · สูตร % เดิม · ข้อเสนอ API 3 ข้อ = งานแยกหลังหน้าใหม่ · สั่ง Web Designer (opus·medium) T-04
- 2026-11-11 SA ปรับ requirements ตาม Gate 1 (AC-44 หน้าตา, เอา "เสร็จแล้ว" ออก) · trace-check PASS · ค้างถามเจ้าของงานพร้อม Gate 2: (1) บันทึกหน้าตาล้มเหลว/ออฟไลน์ ย้อนค่า (D38) หรือเข้าคิว (2) "ปรับหน้าหลัก" เลือกโครงอย่างเดียว หรือซ่อน/แสดงการ์ดต่อโครง (3) ย้ายสว่าง/มืด+ขนาดตัวอักษรมาไว้ "หน้าตา"
- 2026-11-11 Web Designer ส่ง preview.html + visual-design.md (Phosphor icons MIT, @fontsource OFL, data-skin) · ยังไม่ได้ตรวจ: contrast สถานะข้อมูลเยอะ/แผ่น, iPad/Safari จริง, VoiceOver · ไม่มีตัวสลับก่อน-หลัง · เปิด Gate 2
- 2026-11-11 Gate 2 อนุมัติ: "ผ่าน เริ่มทำจริงได้" · ย้อนค่าเดิมแล้วแจ้ง · ปรับหน้าหลัก = เลือกโครง + ซ่อน/แสดงการ์ด · ย้ายขนาดตัวอักษรมารวม "หน้าตา" · ส่ง SA แก้ AC (resume ครั้งที่ 2/2)
- 2026-11-11 SA แก้ AC-05/07/44 + BR-12 · trace-check PASS · checkpoint c1434db (เจ้าของงานอนุมัติผ่านหน้าต่างอนุญาต) · ปิด server 4190
- 2026-11-11 รูปอ้างอิง 1.png ถอดออก commit แก้เป็น ef5f67b · เจ้าของงานสั่งรอบออกแบบที่ 2 (เมนู + หน้าสแกน, ต้องมีตัวอย่างให้ดูก่อน) · แผนอนุมัติ · สั่ง SA (opus·medium) T-05 ∥ UX (sonnet·medium) T-07
- 2026-11-11 SA ส่ง menu-proposal.md: ก คง 8 · ข ลด 7 · ค เพิ่ม 11 · แนะนำ ง (ก + ตารางสอนเมื่องาน C พร้อม; ของซ่อนลึกแก้ในหน้า) · สั่ง Web Designer (opus·medium) T-06 · เปิด server 4190
- 2026-11-11 UX ส่ง ux-scan.md: 3 ช่วง, ตารางผลสแกน 26 แถวผูกหลังบ้าน, ข้อเสนอ P1–P5 ใช้ข้อมูลเดิม, P6 ประวัติรอบต้องเพิ่ม API (เลื่อน) · คำถาม Q1–Q5 ถามพร้อม Gate 2 หน้าสแกน
- 2026-11-11 Web Designer ส่งตัวสลับเมนู 4 ทาง · Gate เมนูอนุมัติ: ทาง ง (8 รายการ + ตารางสอนเมื่องาน C พร้อม), ป้ายกลุ่มเป็นตัวหนังสือ, ของซ่อนลึกแก้ในหน้าเป็นงานเล็กแยก + เปลี่ยนชื่อ "ข้อมูลพื้นฐาน" · สั่ง Web Designer (opus·medium) T-08
- 2026-11-11 Web Designer ส่งหน้าสแกนเต็ม (3 ช่วง, 14 สถานะ, จำลองสแกน, เมนู ง พอดีจอ 729) · ยังไม่ได้ทำ: แถบคะแนนเต็มถูกแก้ (Q5), บัตรถูกยกเลิก, งานถูกลบ, ไม่มีห้อง/นักเรียน, กำลังโหลด · ข้อความแนะนำปัญหากล้องเป็นข้อความที่ designer แต่ง (แอปจริงใช้ข้อความเดิม) · เปิด Gate 2 หน้าสแกน
- 2026-11-11 Gate 2 หน้าสแกนอนุมัติ: "ผ่าน" · แผงยังไม่ส่ง = สรุปอ่านอย่างเดียว · ซ่อนชื่อแยกต่อหน้า · เอา P1/P3 + "รอส่งขึ้นระบบ" + "เริ่มรอบใหม่" · สั่ง SA (opus·medium) T-09
- 2026-11-11 SA ส่ง requirements part-2/part-3 (เมนู AC-45–50, สแกน AC-51–80) · trace-check PASS · docs-budget ไฟล์ของ job ผ่าน · ข้อสังเกต SA: วงแหวนหน้าสแกนใช้สูตรเดิมของหน้าสแกน, hide-names เดิมใช้เฉพาะหน้าหลัก, คีย์ scan_cards ใหม่อาจต้องปล่อย server ก่อน (Tech Lead) · เปลี่ยนชื่อสมมติ 1 ชื่อใน preview.html ที่บังเอิญตรงกับชื่อในรูปจอจริง
- 2026-11-11 checkpoint e150040 · เจ้าของงาน: "ออกแบบหน้าถัดไป" → รอบ 3 หน้าเช็คชื่อ · สั่ง UX (sonnet·medium) T-10
- 2026-11-11 แผนรอบ 3 อนุมัติ · UX ส่ง ux-attendance.md (ระบบไม่มีข้อมูลวันหยุด; สุ่มชื่อไม่อ่าน ?class; ไม่มี aria-live เดิม) · สั่ง Web Designer (opus·medium) T-11 · เปิด server 4190
- 2026-11-11 Web Designer ส่งหน้าเช็คชื่อ · hero สูงกว่าเป้า UX (คอม 121/110, iPad ตั้ง 202/150) รอตัดสิน · ยังไม่ได้ดูภาพ iPad ตั้ง · ยังไม่ได้วาด: โหมดสแกน/รายคาบ/ชนกับอีกเครื่อง · console ของ pane ค้างข้อความ error เก่าจากช่วงที่ไฟล์ถูกแก้ — ตัวจับ error ของ PM ในหน้าปัจจุบัน = 0
- 2026-11-11 Gate 2 หน้าเช็คชื่ออนุมัติ: "ผ่าน" · ย้าย legend ลงใต้ hero · เอาของเพิ่ม UX ทั้ง 4 ข้อ · ฉายจอตามสวิตช์ของโหมดฉายจอ · ส่ง Web Designer แก้ (resume 1/2) ∥ SA T-12 (resume 1/2)
- 2026-11-11 Web Designer ย้าย legend ใต้ hero (iPad ตั้ง 202→133, คอม 121→109) + สวิตช์ซ่อนชื่อของโหมดฉายจอ · PM ตรวจ 96 ชุดไม่มี error · SA ส่ง part-4 (AC-81–106) + แก้ BR-18/AC-76–77 ตาม SQ1 · trace-check PASS · ค้นชื่อจริง: ไม่พบ · checkpoint รอบ 3 · ปิด server
- 2026-11-11 checkpoint d514dad · เจ้าของงาน: "ออกแบบหน้าถัดไป" → รอบ 4 หน้าสุ่มชื่อ · สั่ง UX (sonnet·medium) T-13
- 2026-11-11 UX ส่ง ux-random.md · ช่องโหว่หน้าจริง: ไม่อ่าน ?class, ไม่มีสวิตช์ซ่อนชื่อ, ฉายจอไม่ทำตาม pjHideNames, ข้อความห้องว่างผิด, reduced-motion ยังกะพริบ, "เรียกแล้ว" อาจเกินฐาน · สั่ง Web Designer (opus·medium) T-14 · เปิด server 4190
- 2026-11-11 Web Designer ส่งหน้าสุ่มชื่อ (hero คอม 104, iPad ตั้ง 136) · ยังไม่ได้ทำ: แผ่น "ปรับการ์ด" ของหน้านี้ (ขึ้น toast) · คำถาม: ซ่อนปุ่มสุ่มชื่อในหน้าเช็คชื่อเมื่อดูวันย้อนหลัง · เปิด Gate 2 หน้าสุ่มชื่อ
- 2026-11-11 Gate 2 หน้าสุ่มชื่ออนุมัติ: "ผ่าน" · เอาปุ่มซ่อนชื่อ + เสียงติ๊ง (เริ่มต้นปิด) + แผ่นปรับการ์ด · ห้องแรกตามเดิม · ซ่อนปุ่มสุ่มชื่อเมื่อดูวันย้อนหลัง · ส่ง Web Designer แก้ (resume 1/2) ∥ SA T-15 (resume 2/2)
- 2026-11-11 Web Designer แก้ 3 จุดหลัง Gate (ซ่อนปุ่มวันย้อนหลัง, สวิตช์เสียง, แผ่นปรับการ์ด) · PM ตรวจ 120 ชุดไม่มี error · SA ส่ง part-5 (AC-107–124) + แก้ AC-102 · trace-check PASS · docs-budget ไฟล์ของ job ไม่มี FAIL · ค้นชื่อจริง: ไม่พบ · checkpoint รอบ 4 · ปิด server
- 2026-11-11 checkpoint 66f03a9 · เจ้าของงาน: "ออกแบบหน้าถัดไป" → รอบ 5 หน้าคะแนน · สั่ง UX (sonnet·medium) T-16
- 2026-11-11 UX ชน maxTurns (ไม่ resume — ไฟล์ครบ 21 หัวข้อ) · สั่ง Web Designer (opus·medium) T-17 · เปิด server 4190
- 2026-11-11 Web Designer ชน maxTurns ไม่ส่งรายงาน → PM ตรวจเองพบ SyntaxError ตอนปิดหน้าต่างสร้างงาน → resume แก้แล้ว + เขียน visual-design §หน้าคะแนน · ยังไม่ได้ตรวจ: ภาพต่ออุปกรณ์ด้วยตา, กดค้างบนสัมผัส, ไล่ Tab ในหน้าต่างงาน (ยังไม่มี focus trap) · เปิด Gate 2 หน้าคะแนน
- 2026-11-11 Gate 2 หน้าคะแนนอนุมัติ: "ผ่าน" · เอาของเพิ่มทั้ง 4 (ซ่อนชื่อ, ร้อยละสะสม, คัดลอกรายชื่อค้างส่ง, เหตุผลบันทึกไม่สำเร็จ) · Excel คงไฟล์ + เตือน · เปิดมาที่งานล่าสุดที่เปิดรับ · สั่ง SA ใหม่ (opus·medium) T-18
- 2026-11-11 SA ส่ง part-6 (26,695 อักขระ) + AQ1 ใน part-4 + ช่วง 4ก/4ข/4ค + RQ1 ใน part-3 · ข้อระวัง dev (BR-30): ร้อยละสะสมใช้ scorePercent() ใน shared/metrics.ts:200 ไม่ใช่ StudentSummary.scorePercent · trace-check PASS · ค้นชื่อจริง: ไม่พบ · checkpoint รอบ 5 · ปิด server
- 2026-11-12 เจ้าของงานสั่ง "เริ่มทำหน้าเว็บจริง" → เฟส 3 · session ใหม่ `home-redesign-20261112-p3` acquire lock · `status.mjs --check` FAIL 15 ทั้งโปรเจกต์: **ของงานนี้ 0 จุด** (13 = งานปิดแล้ว 12 งานที่ board มี task ไม่ใช่ "เสร็จ"/lock ค้าง, 2 = 2026-11-02-ui-redesign brief ค้าง + ไม่มี visual-owner-approved) · ค้นชื่อจริง (เทียบกับไฟล์สำรองในเครื่องเจ้าของงาน 44 คน, ทุกไฟล์ html/md/json ของงาน): ไม่พบชื่อ-สกุลจริง พบชื่อต้นตรงโดยบังเอิญ 1 ชื่อ (นามสกุลสมมติ) ใน preview.html + draft.html → PM เปลี่ยนเป็นชื่อสมมติอื่นแล้ว · docs-budget: api-contract.md 41,654 > 30,000 (ค้างเดิมก่อนงานนี้ — สัญญาใหม่ให้ลง api-contract.part-2.md) · สั่ง Tech Lead ∥ QA ×3
- 2026-11-12 QA ×3 ส่ง test-plan (377 TC: A 126 · B 111 · C 140 ครอบคลุม AC 249/249 — PM นับเอง) + fixtures.md + pages.json (10 หน้า) · Tech Lead ส่ง plan.md + plan.part-2.md (15 ช่วง, T-29–T-63, พอร์ต 4101–4135) + api-contract.part-2.md (EP-07 v10 รูปแบบค่า client, ร่าง EP-09/10/11) + D41–D47 · ไม่มี architecture.md ในโปรเจกต์ (แนวทางอยู่ใน plan) · ไม่มีไฟล์นอก docs/team ถูกแก้
- 2026-11-12 SA T-64 (ชน maxTurns → resume 1/2) · SA ตอบเบื้องต้นจากโค้ดสำหรับหน้าอื่น (ยังไม่ได้เขียนลงข้อกำหนด): "มา n" = มา+สาย (Attendance.tsx:520) · ปิดแท็บภายใน 4.5 วิ ร่างยังอยู่และถูกส่งต่อ (outbox.ts:271) · BR-34 รีโหลดทั้งหน้าได้ W2 โหลดใหม่ในหน้าได้ W3 · AC-144 นับเฉพาะคนที่ส่งแล้วและยังไม่เต็ม (Gradebook.tsx:70)
- 2026-11-12 PM: `ownership.mjs build` PASS 35 task (shared 0 — package.json เป็นของ T-29) · `context-pack` 35 task สร้างครบ (62 ไฟล์) · `trace-check --stage ready` PASS (AC 249, BR 61) · docs-budget ไฟล์ของงานนี้ไม่มี FAIL

## ประวัติขั้นถัดไป

ย้ายไป `board-history.md` (2026-11-12 งบเอกสาร)
- 2026-11-13 PM (session home-redesign-20261113-c1) takeover lock จาก b2 (session เดิมหยุด ไม่มี isRunning; เจ้าของงานสั่ง "ทำในนี้เลย") · PM รัน typecheck PASS, build PASS, npm test 206/2458 PASS บน tree:4ee1867055d6 · quality-gate FAIL 91 = stale เท่านั้น → สั่ง QA (T-80 re-record) ∥ Reviewer (re-record) ∥ Tech Lead (แยก api-contract.md)
- 2026-11-13 QA (15 evidence: 14 PASS · 1 NOT RUN Q-7102) + Reviewer (26 PASS) re-record บน tree:4ee1867055d6 · Tech Lead แยก api-contract.md เป็น part-3/4 (split-verify PASS) · PM: quality-gate PASS (evidence 161) · trace-check --stage close FAIL 77/255 AC ไม่มี PASS (52 ไม่มีหลักฐานเลย รวม AC-41–43 ของงานแยก A/B/C · 25 มีแต่ FAIL/NOT RUN เก่า) → รอมติเจ้าของงานว่าปิดแบบมี known gap หรือให้ทีมเก็บหลักฐานเพิ่ม · fixture server 5194/5900 ยังค้าง (PM ปิดไม่ได้: auto mode ปฏิเสธ Stop-Process)
- 2026-11-13 commit checkpoint 2 = 683fdf7 (เจ้าของงานเลือก: commit แล้วปลด lock แบบมี known gap) · report.md เขียนแล้ว · brief สถานะ "รอเจ้าของงาน" · ปลด lock

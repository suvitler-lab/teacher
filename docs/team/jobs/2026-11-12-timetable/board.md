# Board: 2026-11-12-timetable

**ขั้นถัดไป:** โค้ดนิ่ง (tree 8bf9b841) · PM: tsc/build ผ่าน, vitest 224 ไฟล์/2867 ผ่านหมด · แก้ครบ V-01..V-62, R-01..R-21(ส่วนใหญ่), B-01/02 · **รอ Gate V** (เจ้าของงานลองกด http://localhost:5720 · ล็อกอิน fixture) · quality-gate FAIL 72 = หลักฐานเก่ากว่าโค้ดสุดท้าย ~70 รายการ + ยังไม่มี visual-owner-approved → ต้องเลือก: (ก) บันทึกหลักฐานใหม่อีกรอบ หรือ (ข) ปิดแบบมี known gap · ช่องว่าง: ภาพส่วนใหญ่ QA เปิดดูไม่ครบ, Q-5407/5410/5411 NOT RUN, WebKit/iPad/VoiceOver/เครื่องพิมพ์จริง ตรวจไม่ได้ · ค้างตัดสิน: hono S-01 (งานแยก) · ยังไม่ commit

session: `timetable-20261112-a1` (ใช้กับ job-lock --session) · เฟสปัจจุบัน: 2 Design จบ (Gate 2 อนุมัติ) — รอคำสั่งเฟส 3 · รอบแก้ (Verify): 0/3 · เรียก agent แล้ว: 6 ครั้ง (คาดอีก ~0–1)
ภาพ: before ✗ after ✗ Gate V ✗ · กล่องสถานะล่าสุดโพสต์เมื่อ: 2026-11-12 · อัปเดต board: 2026-11-12
snapshot ล่าสุดที่รันชุดตรวจหลัก: — (รอบนี้ไม่มีโค้ด) · ผล: —

| Task | งาน | ตำแหน่ง | ไฟล์ที่ถือ | AC | รอ | พอร์ต | สถานะ | หลักฐาน |
|---|---|---|---|---|---|---|---|---|
| T-01 | requirements งาน C (ตารางสอน + คาบถัดไป + เมนู) | SA | requirements.md, requirements.part-2.md | AC-01–45 | — | — | เสร็จ | trace-check requirements PASS (warn EP-ใหม่ ×n) · docs-budget: ไฟล์งานนี้ผ่าน (FAIL 4 เป็นของงานเก่า) |
| T-02 | ร่างอ้างอิง 3 แบบ (Gate R) | Web Designer | design/draft.html, draft-notes.md | — | — | 4191 | เสร็จ | agent: 3 แบบ×3 จอ×4 ขนาด ไม่ล้น, console 0 error · PM: เปิด file:// ใน pane console 0 error · ตาจริงบางชุด |
| T-03 | flow + สถานะ + microcopy + ♿ ของแบบที่เลือก | UX/UI | ux.md | — | T-02, Gate R | — | เสร็จ | ux.md: 10 จอ 46 สถานะ · ตรวจ browser NOT RUN (ยังไม่มี mockup) |
| T-04 | mockup คลิกได้เต็ม (Gate 2) | Web Designer | design/preview.html | — | T-03, Gate 1 | 4191 | เสร็จบางส่วน | agent: 33 ชุด × 3 ขนาด PASS; 1536 contrast 1 จุดแก้แล้วยังไม่รันซ้ำ · PM: 4 ขนาดไม่ล้น console 0 (จอแรกเท่านั้น) · ยังไม่ทำ: โหมดมืด, 4 สถานะปลีก, เครื่องจริง |

## Checkpoints

| เฟส | commit | วันที่ | เทสต์ |
|---|---|---|---|
| | | | |

## บันทึก

- 2026-11-12 เปิดงาน · Gate 0 ตอบแล้ว (L · ทางลัดเช็คชื่อเท่านั้น · 4 อุปกรณ์ · คาบกิจกรรมใส่ได้ · เข้าชุดแอป + Google Calendar · ไม่มี motion) · home-redesign ยังอยู่ Verify → job นี้เขียนเฉพาะ docs ของตัวเอง
- 2026-11-13 สั่ง SA (opus·medium) T-01 ∥ Web Designer (opus·high) T-02 แบบ background
- 2026-11-13 SA ส่ง US 8 · AC 45 · BR 12 · Q1–Q6 — hook ownership-guard บล็อก (ยึด lock+ownership ของ home-redesign เป็นงานแรก) → เจ้าของงานเลือก "PM คัดลอกให้ (Recommended)" → PM คัดลอกจาก scratchpad · แก้ reference นับได้ 14 คาบ (ไม่ใช่ 15) · ข้อบกพร่อง hook: ควรตรวจเฉพาะงานที่ไฟล์อยู่ — เสนอแก้แยก
- 2026-11-13 Web Designer ส่ง draft.html (ชนเพดาน 40 รอบ → resume 1\/2) · แนะนำ ก บนคอม/iPad + การ์ด ตอนนี้/ต่อไป ของ ค บนมือถือ/หน้าหลัก · PM คัดลอกเข้า design/ · โพสต์ Gate R
- 2026-11-13 🔒 Gate R อนุมัติ: ทำทุกรูปแบบ ก ข ค × 3 ธีม เลือกในตั้งค่า · หน้าหลัก: แทรกในลำดับงานวันนี้ + แถบใต้หัวเปิด/ปิดได้ · ทางลัด: ห้องที่กำลังสอนก่อน → ขอบเขตโตขึ้น (3 รูปแบบ) SA ต้องเพิ่ม AC
- 2026-11-13 🔒 Gate 1 อนุมัติ + Q1–Q6 ตอบแล้ว (พิมพ์ตาราง = ต้องการ; ที่เหลือตามแนะนำ) → สั่ง SA เพิ่ม AC (3 รูปแบบในตั้งค่า, แถบใต้หัวเปิด/ปิด, พิมพ์, ทางลัดห้องที่กำลังสอนก่อน) ∥ UX T-03
- 2026-11-13 UX ส่ง ux.md (PM คัดลอก) · คำถาม 2 ข้อ → PM ใช้ค่าแนะนำเป็นสมมติฐานใน mockup (แถบ/คาบแทรกทุกโครง สวิตช์ในตั้งค่า › หน้าตา · คาบแทรก ≤ 5 แถว) ยืนยันที่ Gate 2 · สั่ง Web Designer T-04 (opus·medium)
- 2026-11-13 SA T-01b ส่งฉบับปรับ (AC-46–63, BR-13–16, Q1–Q6 ปิด) PM คัดลอก 3 ไฟล์ · คำถามใหม่ N1 (โครงหน้าหลักไหน) N2 (ชื่อครู/โรงเรียนบนกระดาษพิมพ์) → ถามที่ Gate 2
- 2026-11-13 Web Designer ส่ง preview.html (PM คัดลอก) · เพิ่ม launch config timetable-design:4191 · โพสต์ Gate 2
- 2026-11-13 🔒 Gate 2 "ผ่าน" + N1–N3 ตอบแล้ว · จบรอบออกแบบ หยุดรอคำสั่ง
- 2026-11-13 เฟส 3: Tech Lead (EP-11/12/13, D48–D54, plan T-10–T-22) · QA test plan 65 AC (TC-001–065, 101–122) · เจ้าของงานเลือกสวิตช์แถบแยกต่อโครง + ลิงก์ในตั้งค่า
- 2026-11-13 Build เริ่ม: T-10/T-15/T-11/T-12/T-13/T-14 เสร็จ (รายงาน agent) · PM รัน tsc ผ่าน · vitest 2693/2694 → แก้ test/unit/preflight.test.ts (0008_forgot→0009_forgot เพราะ 0008 ถูกใช้แล้ว; ไฟล์ไม่มี owner) · ownership-check FAIL 2 = fixtures.md/pages.json ของ QA (เก็บไว้) · ค้าง: lock ownership ของ QA docs
- 2026-11-13 T-16/T-17/T-18 เสร็จ (รายงาน agent) · PM: tsc ผ่าน, vitest 218/2760, build ผ่าน, tree:8cdd82b5 · ownership-check FAIL 4 = QA docs ×2, dev-notes/frontend-t16.md, preflight.test.ts (รับไว้) · ค้าง: AppearanceSection link → #/?customize=1; ความสูงแถบบนคอม >56px ให้ UX ตัดสิน; T-18 ถ่ายภาพเฉพาะธีมอบอุ่นสว่าง
- 2026-11-13 Build จบ: T-19/T-20/T-21 เสร็จ · Code review R-01–R-12 (P2×4) + Security S-01–S-03 → Tech Lead D55–D59 → แก้ VF-B1–B5/VF-F1–F5 · ownership-check FAIL 4 รับไว้ (QA docs ×2, dev-notes/frontend-t16.md, preflight.test.ts)

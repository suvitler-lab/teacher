# Code review part 29 — T-86 รีวิว delta T-84 + ตรวจซ้ำหลักฐาน stale 26 รายการ

## delta T-84 (7 ไฟล์ + grade.css)
- Gradebook.tsx:926 ปุ่ม Excel ไอคอนล้วนที่ iPad นอน: มี aria-label="ส่งออก Excel" + title -> ชื่อเข้าถึงได้ (P3 ด้านล่าง)
- Gradebook.tsx:954/968/970 ปุ่มแถบงาน (.gb-bl ซ่อน ≤900px): ทุกปุ่มมี aria-label + title -> ผ่าน
- GradebookNav.tsx:126 slider มี aria-label="เลื่อนดูตารางคะแนน" + aria-valuetext -> ป้าย "เลื่อนดู" ซ่อนแล้วยังมีชื่อ -> ผ่าน
- students.css:178-182 .stu-tile:disabled opacity 1, ขอบประ, พื้น surface-1; สถานะปิดบอกด้วยขอบประ + disabled attr ไม่พึ่งสี/opacity -> ผ่าน (สี .tv.ok/.bad ถูกบังคับเป็น text-primary เมื่อ disabled — ตั้งใจเพื่อ contrast)
- home-a.css (.hma-body h3) / ui.css:149: clamp 2 บรรทัดด้วย CSS เท่านั้น DOM ไม่ถูกตัด + title= เต็ม (Timeline.tsx:55, SessionSetup.tsx:197) -> ผ่าน
- grade.css:581-601: media query เฉพาะ hover/pointer/ความกว้าง; ไม่แตะ logic

## finding ใหม่
- P3 Gradebook.tsx:926 — ขณะ exporting ข้อความที่เห็น "กำลังสร้าง…" แต่ aria-label คงที่ "ส่งออก Excel" (label-in-name); มี aria-busy ชดเชย, ไม่บล็อก
- P1/P2 ไม่มี

## ผลตรวจซ้ำ (tree ปัจจุบัน)
- vitest test/unit ทั้งชุด: 152 ไฟล์ / 1671 เทสต์ ผ่าน (รวม hr-vfix-t84, hr-menu-nav, hr-homecore*, hr-layout-b-ui, hr-rp-t49, hr-sg*, students-round3, scan*, random-model)
- grep ข้อมูลพื้นฐาน src = 0; home.css ไม่มี hex/rgb/@import/transition/animation; home/b ไม่มี Legacy; home-b.css มีแค่ #000 ใน mask-image
- git diff main -w: shared/worker/reportExport ว่าง; random.ts ว่าง; sound.ts +22 เท่านั้น; report.ts +11/-0
- grep __fixture|fixture-server ใน src worker shared public dist = 0
- ph-download/ph-funnel พบใน phosphor bold css (2 บรรทัด)
- ไม่ได้รัน: mutation probe Q-3102 และ probe Q-5404 เดิม (ไม่มีสิทธิ์แก้ src) — ใช้เทสต์ที่มีแทน เหมือนรอบก่อน

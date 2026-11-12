# Technical plan ส่วนที่ 2: ออกแบบหน้าหลักใหม่ + ชุดหน้าตาทั้งแอป

ต่อจาก `plan.md` · Tech Lead · 2026-11-12

## Tasks (PM ลง board) — ส่วนที่ 2 (ช่วง 4ก–5ก3 และงานแยก A/B/C)

| Task | ช่วง | งาน | ตำแหน่ง | เขียนได้เฉพาะ | AC | หน้าที่แตะ | รอ Task | ขนานกับ | พอร์ต |
|---|---|---|---|---|---|---|---|---|---|
| T-46 | 4ก | คะแนน: โครงหน้า ตาราง สะสม + ร้อยละ (BR-30) · ช่อง/กรอก/ตัวแก้ไขช่อง · บันทึก/คิว/ออฟไลน์ + เหตุไม่สำเร็จในช่อง (BR-35) · สูตร BR-29–BR-33 เดิม · เทสต์ perf เดิมต้องผ่าน | Front-End | src/pages/Gradebook.tsx, src/components/gradebook/**, src/components/CellEditor.tsx, src/styles/grade.css, test/unit/gradebook-*.test.ts*, test/unit/qa-gb-*.test.ts, test/unit/lows-gradebook-patch.test.tsx, test/unit/perf-*.test.ts*, test/unit/hr-gb-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-125, AC-126, AC-127, AC-128, AC-129, AC-130, AC-131, AC-132, AC-133, AC-134, AC-135, AC-136 | gradebook | ช่วง 1ก | — | 4118 |
| T-47 | 4ข | คะแนน: แถบงานที่เลือก (ปิดรับ · ซ่อนคะแนน · คัดลอกงานเห็นตรง ๆ) · หน้าต่างสร้าง/แก้/คัดลอก/ลบงาน · ทำทั้งห้อง · Excel เดิม + ข้อความเตือน · สถานะหน้า · งานแรกที่เห็น BR-34 (GQ1) | Front-End | src/pages/Gradebook.tsx, src/components/gradebook/**, src/components/GradebookNav.tsx, src/components/AssignmentModal.tsx, src/styles/grade.css, test/unit/gradebook-*.test.ts*, test/unit/assignment-modal-*.test.tsx, test/unit/hr-gb2-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-137, AC-138, AC-139, AC-140, AC-141, AC-142, AC-143, AC-144, AC-145, AC-146, AC-147 | gradebook | ช่วง 4ก | — | 4119 |
| T-48 | 4ข | คะแนน: ซ่อนชื่อ (`hideSignal("gradebook")`) · ลิ้นชักข้าง + คัดลอกรายชื่อค้าง BR-36 · 4 อุปกรณ์ · งบพื้นที่ · ♿ | Front-End | src/pages/Gradebook.tsx, src/components/gradebook/**, src/styles/grade.css, src/lib/pageCards.ts, test/unit/hr-gb3-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-148, AC-149, AC-150, AC-151, AC-152, AC-153 | gradebook | T-47 | — | 4120 |
| T-49 | 4ค1 | รายงาน: โครงหน้า + hero + ตัวเลือก · ตารางรายบุคคล · การ์ด 6 ใบ (ขาดบ่อย `absent` เปิดเริ่มต้น BR-41) · "—" แทน 0% · รอตรวจ · เฉลี่ยต่องาน · `showsRate` (D42) · สถานะหน้า · `report.ts` เพิ่มตัวนับเท่านั้น | Front-End | src/pages/Reports.tsx, src/components/reports/**, src/lib/reportView.ts, src/lib/report.ts, src/lib/pageCards.ts, src/styles/report.css, test/unit/reports-*.test.tsx, test/unit/card-layout-reports-students.test.tsx, test/unit/hr-rp-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-154, AC-155, AC-156, AC-157, AC-158, AC-159, AC-160, AC-161, AC-162, AC-163, AC-164, AC-169, AC-170 | reports | ช่วง 1ก | — | 4121 |
| T-50 | 4ค2 | รายงาน: ซ่อนชื่อ (`hideSignal("reports")`) · Excel คงชื่อ · พิมพ์ตามสวิตช์ · ฉายจอ (`projectorWorkRows` เดิม) · งบแถว AC-171 ตามวิธีวัด D43 · 4 อุปกรณ์ · ♿ · ตัวเลข | Front-End | src/pages/Reports.tsx, src/components/reports/**, src/styles/report.css, src/styles/print.css, test/unit/reports-*.test.tsx, test/unit/hr-rp2-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-165, AC-166, AC-167, AC-168, AC-171, AC-172, AC-173, AC-174, AC-175, AC-250, AC-251 | reports | ช่วง 4ค1 | — | 4122 |
| T-51 | 4ง1 | นักเรียน: โครงหน้า hero ค้นหา (ห้องนี้/ทุกห้อง BR-46) รายการ · เรียง 5 แบบเดิมมี "ค้างมากก่อน" (STQ3 ไม่ใช่ "รหัส" ตาม mockup) · ลิ้นชักรายคน `StudentDrawer` (ใช้ร่วม — รันเทสต์รายงานซ้ำ) · ซ่อนชื่อ (`hideSignal("students")`) · ฉายจอกรอบ 4 ตัวเลข · สถานะ/ปีเก่า/การ์ด | Front-End | src/pages/Students.tsx, src/components/students/**, src/components/StudentDrawer.tsx, src/lib/pageCards.ts, src/styles/students.css, test/unit/students-*.test.tsx, test/unit/hr-st-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-159, AC-162, AC-165, AC-176, AC-177, AC-178, AC-179, AC-180, AC-181, AC-182, AC-183, AC-184, AC-185, AC-196, AC-197, AC-198, AC-199, AC-200, AC-201, AC-202 | students, reports | ช่วง 4ค2 | — | 4123 |
| T-52 | 4ง2 | นักเรียน: ฟอร์มเพิ่ม/แก้ (คำนำหน้าเริ่ม "ไม่ระบุ") · ย้ายห้อง/ออก/กลับ · บัตร QR ("ออกล่าสุด {วันที่}") · นำเข้า + ไฟล์ตัวอย่าง .xlsx (exceljs เดิม) + สรุปผล · 4 อุปกรณ์ · ♿ · ตัวเลข | Front-End | src/pages/Students.tsx, src/components/students/**, src/lib/importTemplate.ts, src/styles/students.css, test/unit/students-*.test.tsx, test/unit/audit-student-import.test.tsx, test/unit/import-parse.test.ts, test/unit/hr-st2-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-186, AC-187, AC-188, AC-189, AC-190, AC-191, AC-192, AC-193, AC-194, AC-195, AC-203, AC-204, AC-205, AC-206, AC-254 | students | ช่วง 4ง1 | — | 4124 |
| T-53 | 5ก1 | ตั้งค่า: แยกหมวดเป็น `components/settings/sections/*` (D46 · ย้ายของเดิมไม่เปลี่ยนพฤติกรรม) · แผนผังหมวด ลิงก์ลึก ป้ายขอบเขต · แถบบันทึก/สถานะ · ภาพรวม เวลาเรียน การสแกน · P3 P6 P10 · 4 อุปกรณ์ · ♿ · ฉายจอ = อ่านอย่างเดียว ซ่อนอีเมล/ชื่อ (SGQ3) | Front-End | src/pages/Settings.tsx, src/components/settings/**, src/styles/settings.css, src/styles/settings-cards.css, test/unit/settings-*.test.tsx, test/unit/hr-sg-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-207, AC-208, AC-209, AC-210, AC-211, AC-212, AC-213, AC-214, AC-215, AC-216, AC-217, AC-218, AC-219, AC-220, AC-221, AC-222, AC-223, AC-224, AC-225, AC-246, AC-247, AC-248, AC-249 | settings, settings-appearance, settings-catalog | ช่วง 1ก | — | 4125 |
| T-54 | 5ก2 | ห้องเรียน วิชา ภาคเรียน + ประเภทงาน (2 หมวด) · ↑↓ · ชื่อซ้ำ 409 · ยืนยันเก็บ · จำนวนในแถวเฉพาะภาคเรียนปัจจุบัน (SGQ5) | Front-End | src/components/settings/sections/catalog*.tsx, src/components/settings/sections/worktypes*.tsx, src/components/CatalogEditor.tsx, src/components/StartTermModal.tsx, src/styles/settings-catalog.css, test/unit/catalog-editor.test.tsx, test/unit/hr-sg2-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-226, AC-227, AC-228, AC-229, AC-230, AC-231, AC-232, AC-233, AC-234 | settings-catalog | ช่วง 5ก1 | — | 4126 |
| T-55 | 5ก3 | ความเป็นส่วนตัว: ซ่อนชื่อ 7 หน้า + "เปิดทั้งหมด" ผ่าน `hideNames.ts` (ฉายจอไม่เปลี่ยน) · ตรวจเครื่อง + ล้างค่าในเครื่อง `localPrefs.ts` (SGQ4 · D44) · ต้องรันเทสต์ซ่อนชื่อของทุกหน้า | Front-End | src/components/settings/sections/privacy*.tsx, src/components/settings/sections/device*.tsx, src/lib/hideNames.ts, src/lib/localPrefs.ts, src/lib/deviceCheck.ts, test/unit/device-check.test.ts, test/unit/hr-sg3-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-235, AC-236, AC-237, AC-238 | settings, home, scan, attendance, random, gradebook, reports, students | ช่วง 5ก1 | T-56 | 4127 |
| T-56 | 5ก3 | บัญชี/อุปกรณ์ (P5) · สำรอง/กู้คืน (P7) · ประวัติ (P2) · โซนอันตราย 🔐 🗑 (ระดับยืนยัน BR-59) — ใช้ endpoint เดิมทั้งหมด | Front-End | src/components/settings/sections/account*.tsx, src/components/settings/sections/backup*.tsx, src/components/settings/sections/history*.tsx, src/components/settings/sections/danger*.tsx, src/components/RestoreModal.tsx, src/components/ResetModal.tsx, src/components/AuditHistory.tsx, test/unit/audit-dialog.test.tsx, test/unit/sec-backup-warning.test.tsx, test/unit/hr-sg4-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-239, AC-240, AC-241, AC-242, AC-243, AC-244, AC-245 | settings | ช่วง 5ก1 | T-55 | 4128 |
| T-57 | แยก A | สร้าง EP-09 `GET /api/attendance/absent-streaks` ตาม BR-11 + เทสต์ API (job แยก · server ก่อนแอป) | Back-End | worker/routes/attendance.ts, shared/types.ts, test/api/hr-streaks-*.test.ts | AC-41 | — (API) | ช่วง 3 ปล่อยแล้ว | — | 4129 |
| T-58 | แยก A | ป้าย "ขาดติดกัน N วัน" ในต้องติดตาม (3 โครง) + ชิปใน "ใครไม่มา" หน้าเช็คชื่อ · server เก่า (404) = ไม่แสดง | Front-End | src/lib/streaks.ts, src/components/home/**, src/components/attendance/**, test/unit/hr-streaks-*.test.tsx | AC-41 | home, attendance | T-57 | — | 4130 |
| T-59 | แยก B | สร้าง EP-10 `GET /api/stats/daily-submissions` + เทสต์ API (job แยก · server ก่อนแอป) | Back-End | worker/routes/stats.ts, worker/app.ts, shared/types.ts, test/api/hr-daily-*.test.ts | AC-42 | — (API) | ช่วง 1ข ปล่อยแล้ว | — | 4131 |
| T-60 | แยก B | การ์ดแนวโน้ม "ส่งงาน 7 วันเรียนล่าสุด" โครง ข/ค (ข้อความแทนกราฟ) + เพิ่มในรายการปรับได้ BR-12 | Front-End | src/lib/dailySubmissions.ts, src/lib/homeLayout.ts, src/components/home/**, test/unit/hr-trend-*.test.tsx | AC-42 | home | T-59 | — | 4132 |
| T-61 | แยก C | migration ตาราง `timetable_slots` ตามร่าง EP-11 (หลัง requirements ของงาน C ยืนยัน) | DB Specialist | migrations/0008_*.sql, test/api/hr-tt-migration-*.test.ts | AC-43 | — (DB) | requirements งาน C | — | 4133 |
| T-62 | แยก C | สร้าง EP-11 `GET`/`PUT /api/timetable` + รวมตารางใหม่ใน backup/restore | Back-End | worker/routes/timetable.ts, worker/app.ts, worker/routes/backup.ts, shared/types.ts, test/api/hr-timetable-*.test.ts | AC-43 | — (API) | T-61 | — | 4134 |
| T-63 | แยก C | หน้ากรอกตารางสอน + แถว "ต่อไป: คาบ …" โครง ก + รายการเมนู "ตารางสอน" (BR-17 · ตรวจพอดี 1536×729 อีกครั้ง) | Front-End | src/pages/Timetable.tsx, src/lib/timetable.ts, src/components/home/a/**, src/components/Shell.tsx, src/lib/menuKeys.ts, src/app.tsx, src/styles/timetable.css, test/unit/hr-timetable-*.test.tsx | AC-43 | home (+ หน้าใหม่ timetable — เพิ่มใน pages.json ในงาน C) | T-62 | — | 4135 |
| T-65 | 1ก | fixture X-1–X-6 (fixtures.md §2): วันที่สัมพันธ์วันนี้เวลาไทย · แฟล็ก CLI ต่อชุดข้อมูล F-H*/F-S* · endpoint `/__fixture/*` · ค่าตั้งตอน start · self-check ตัวเลข §3 · บัตรยกเลิก (X-7 ไปกับ T-39) | Full-Stack | scripts/fixture-server.cjs, scripts/seed-*.sql, test/unit/fixture-*.test.ts* | AC-09 | — | — | T-29, T-31 | 4109 |
| T-66 | 1ก | QA ตามเก็บ: fixtures.md ให้ตรง fixture-server จริง + scripts/qa-flows.cjs ปุ่ม "เพิ่มเติม" | QA | docs/team/jobs/2026-11-11-home-redesign/fixtures.md, docs/team/jobs/2026-11-11-home-redesign/test-plan*.md, scripts/qa-flows.cjs | AC-47 | — | T-65 | — | — |

ตรวจแล้ว: task ที่ขนานกันไม่มีไฟล์ทับกัน (คู่ขนาน: T-29∥T-31 · T-30∥T-32 · T-34∥T-35∥T-36 · T-41∥T-42 · T-55∥T-56 — ตรวจ glob ทีละคู่แล้ว) · task ที่ไม่ได้ขนานกันแต่แตะไฟล์เดียวกันเป็นลำดับต่อกันในช่วงเดียวหรือคนละช่วง · ทุก AC-01–AC-249 มี task รับ (นับด้วยสคริปต์ = 249) · พอร์ต 4101–4135 ไม่ซ้ำ และไม่ชน 4190 (ตัวอย่าง design) · 5173 (dev) · 5194/5900 (fixture เดิม) · ตำแหน่งชื่อมาตรฐาน

ลำดับใน session: 1ก = T-29 ∥ T-31 → T-30 ∥ T-32 · 1ข = T-33 → T-34 ∥ T-35 ∥ T-36 · 2ก = T-37 → T-38 · 2ข = T-39 → T-40 · 3 = T-41 ∥ T-42 → T-43 · 3ข = T-44 → T-45 · 4ข = T-47 → T-48 · 5ก3 = T-55 ∥ T-56 · ช่วงอื่น task เดียว

ภาพหน้าจอ: ทุก task ที่มี "หน้าที่แตะ" ถ่าย `shots --label after` 4 อุปกรณ์ × หน้าที่แตะ (ธีมเริ่มต้น อบอุ่น) · task ช่วง 1ก/1ข และ Gate V ของแต่ละหน้าเพิ่มอีก 5 ชุด (มืออาชีพ/สดใส × สว่าง/มืด + อบอุ่นมืด) ผ่านการตั้ง `ngankrob-skin`/`ngankrob-theme` ใน `setup` ของ pages.json · ตัวอย่าง: fixture เดิม (ชื่อสมมติ)

## Endpoint ใหม่ที่ออกแบบในเฟสนี้

| EP ใน api-contract | แทน "EP-ใหม่" ของ AC |
|---|---|
| EP-09 `GET /api/attendance/absent-streaks` (api-contract.part-2 · ร่าง วางแผน — ยังไม่สร้าง · งานแยก A) | AC-41 |
| EP-10 `GET /api/stats/daily-submissions` (ร่าง · งานแยก B) | AC-42 |
| EP-11 `GET`/`PUT /api/timetable` + ตาราง `timetable_slots` (ร่าง · งานแยก C · requirements ของงาน C ยืนยันก่อนสร้าง) | AC-43 |
| EP-07 (v10) รูปแบบค่า `accent` + `home_cards` ต่อโครง + การ์ดใหม่ (server ไม่เปลี่ยน) | — (AC-01–07, AC-44 ใช้ EP-07 อยู่แล้ว) |

**SA ต้องแก้คอลัมน์ EP ของ AC-41 AC-42 AC-43 ใน requirements.md จาก "EP-ใหม่" เป็น EP-09 / EP-10 / EP-11** — `trace-check --stage ready` อ่านช่องนี้จาก requirements (Tech Lead แก้เองไม่ได้)

## Dependency ที่ติดตั้งแล้วสำหรับงานนี้

ยังไม่ติดตั้งในเฟสนี้ (คำสั่ง PM: ไม่แตะ `package.json`) → **ติดตั้งใน T-29 คนเดียว** (เจ้าของ `package.json`/lockfile ตลอดงาน · task อื่นห้ามติดตั้ง)

| package | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| `@fontsource/sarabun` | ล่าสุด 5.x ตอนติดตั้ง (บันทึกเลขจริงใน dev-notes) | ฟอนต์เนื้อหา ธีมอบอุ่น (OFL) |
| `@fontsource/mitr` | 5.x | หัวข้อ/ตัวเลข ธีมอบอุ่น |
| `@fontsource/anuphan` | 5.x | เนื้อหา ธีมสดใส |
| `@fontsource/mali` | 5.x | หัวข้อ/ตัวเลข ธีมสดใส |
| `@phosphor-icons/web` | 2.x | ไอคอน bold/duotone/fill (MIT) |
| ถอด `@tabler/icons-webfont` | — | หลังเทสต์ยืนยันว่าทุกชื่อไอคอนแปลงครบ |
| `@fontsource/ibm-plex-sans-thai` | มีแล้ว | ธีมมืออาชีพ (ย้ายไปไฟล์ธีม) |

T-29 ต้องบันทึก: ขนาดรวม woff2 ใน `dist` ต่อธีม และจำนวนไฟล์ precache ก่อน/หลัง (งบ: ฟอนต์+ไอคอนรวม ≤ 1.5 MB) · `npm audit` หลังติดตั้ง

## งานของ DB Specialist / DevOps

- ช่วงหน้าเว็บ (1ก–5ก3): **ไม่มี** — ไม่มี schema/migration/คีย์ server ใหม่ (D41 D46) · ถ้า task ใดพบว่าต้องมี ให้หยุดและรายงาน PM
- DB Specialist: T-61 (งานแยก C เท่านั้น)
- DevOps/การปล่อย: ทุกช่วงหน้าเว็บ = ปล่อยแอปอย่างเดียว (`npm run deploy` เดิม หลัง Gate 3 และเจ้าของงานอนุมัติ) · งานแยก A/B = deploy server ก่อนแอป · C = migration remote → server → แอป · ไม่ต้องเปลี่ยน CI

## จุดเสี่ยงและลำดับ

- **ช่วง 1ก ใหญ่และกระทบทุกหน้า** (token + `Icon` ทั้งแอป) → T-29 เขียนเทสต์ "ทุกชื่อไอคอนที่ใช้ใน `src/` มีคู่ใน `iconMap`" + สคริปต์ contrast 8 หน้า × 6 ชุด · หน้าเก่าไม่ผ่าน contrast → แก้ที่ token หรือ T-30 ไม่แก้โครงหน้า
- **กะพริบตอนเปิด** (AC-04): `applyStoredAppearance()` ต้องตั้ง `data-skin`/`data-theme` ก่อน `render` · ฟอนต์ใช้ `font-display: swap` จึงเห็นฟอนต์สำรองชั่วครู่ได้ (ไม่ใช่สีผิด) — บันทึกเป็นข้อสังเกตที่ Gate V
- **เครื่องที่ค้างแอปรุ่นเก่า** เขียน `home_cards` ทับส่วนต่อโครง (D41) → การ์ดต่อโครงกลับค่าเริ่มต้น ไม่พัง · โครง/ธีมไม่หาย
- **`Scan.tsx` 1,739 บรรทัด / `Gradebook.tsx` 1,172 บรรทัด**: แยกไฟล์ก่อนเปลี่ยนหน้าตา (T-37) และเทสต์เดิมต้องผ่านหลังแยกทันที · ห้ามแตะการตัดสินผลสแกน/คิว/สูตร (BR-13 BR-29) · เทสต์ perf สมุดคะแนนต้องผ่าน (T-46)
- **ส่วนใช้ร่วม** (`Projector.tsx` T-40, `StudentDrawer` T-51, `pageCards.ts` หลาย task, `ui.tsx` T-30): เพิ่ม prop ไม่บังคับ · รัน `npm test` ทั้งชุด · T-51 ตรวจ AC-159 AC-162 AC-165 ซ้ำ
- **AC-171** (D43): วัดด้วยสคริปต์ fixture 45 × 20 ทั้ง before/after · ไม่ผ่าน = FAIL ไม่ปิดการ์ดขาดบ่อยเพื่อให้ผ่าน
- **AC-36** (D45): Network ของหน้าเว็บต้องขอเฉพาะไฟล์ธีมที่เลือก · การเก็บล่วงหน้าของ service worker แยกตรวจ (ตัดคำขอที่ initiator = sw.js)
- **maxTurns ของ agent**: task ≤ ~8 ไฟล์ที่เปลี่ยนจริง · ถ้า T-29 หรือ T-38 ใหญ่เกิน PM แตกต่อได้โดยแบ่ง glob ไม่ให้ทับ (เช่น T-29 แยกไอคอนออกเป็น task ต่อจากเดิม)
- **15 session หน้าเว็บ**: ช่วงย่อยของหน้าเดียวกันปล่อยรวมกันได้ (Gate V ครั้งเดียวต่อหน้า) ลดรอบ Gate · 5ก2 กับ 5ก3 ทำ session เดียวกันได้ถ้า PM เห็นว่าพอ (ไฟล์ไม่ทับกันหลัง 5ก1)
- **เอกสาร**: `decisions.md` 18,376 อักขระหลังเพิ่ม D41–D47 (ในงบ) · `api-contract.md` เกินงบอยู่ก่อนแล้ว (41,654) — งานนี้ไม่เพิ่ม เขียนใน `api-contract.part-2.md` · ไม่มี `docs/team/architecture.md` ในโปรเจกต์ (สถาปัตยกรรมอยู่ใน context.md §สถาปัตยกรรม) → หัวข้อ "แนวทาง" + "การเปลี่ยนแปลงต่อส่วน" ใน `plan.md` คือ architecture ของงานนี้ · โครงระบบไม่เปลี่ยน จึงไม่ต้องแก้ context.md

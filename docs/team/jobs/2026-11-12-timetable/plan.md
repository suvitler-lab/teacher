# Technical plan: ตารางสอน (งาน C)

โดย Tech Lead · 2026-11-13 · เฟส 3 · สัญญา `docs/team/api-contract.part-5.md` (v11) · ข้อตัดสินใจ D48–D54 · schema `docs/team/database.md` · โมดูล `docs/team/architecture.md`

## แนวทาง

- stack เดิม (Preact + signals · Hono/Workers · D1) ไม่เพิ่ม package (พิมพ์ผ่าน `window.print()` + CSS `@page`) · ใช้กลไกเดิมทั้งหมด: `batchAtEpoch` + `abortIf` (guard ใน transaction) · audit ใน batch เดียว · bootstrap แคชใน kv · `saveAppearance` / `saveLayoutPrefs` (ย้อนเมื่อออฟไลน์ ไม่เข้าคิว D38)
- ตาราง 1 ชุดต่อภาค แทนทั้งชุดทุกการเปลี่ยนพร้อมรุ่น `rev` (EP-11 · D48 D50) · โครงเวลาชุดเดียวใน `period_frame` เขียนทาง EP-12 ทางเดียว ซิงก์ `period_times` (D49) · ภาคปัจจุบันมากับ bootstrap (D51)
- รูปแบบหน้าตารางสอนใน `accent.timetable` (D52) · เปิด/ปิดแถบใต้หัวต่อโครงใน `home_cards` (D53 — **ใช้แบบ requirements AC-56; ux S7/preview ต้องแก้** · รอ PM ยืนยันกับเจ้าของงาน ถ้าเลือกสวิตช์ใน ตั้งค่า › หน้าตา ด้วย = เพิ่มงานใน T-15 เท่านั้น)
- ตรรกะ ตอนนี้/ต่อไป/ทางลัด/สรุป/แถวคาบ/คัดลอก เป็นฟังก์ชันบริสุทธิ์ที่รับ `now` ใน `src/lib/timetable/logic.ts` ใช้ร่วมทุกหน้า → AC-49 "ผลเหมือนกันทุกรูปแบบ" มาจากโครง ไม่ใช่จากการเขียนซ้ำ 3 ครั้ง
- 3 รูปแบบใช้ส่วนกลางร่วม (หัว · แผ่น S4 · S5 · กล่องยืนยัน · toast · มือถือวันเดียว · พิมพ์) ต่างแค่การจัดวาง (ux §โครงที่ใช้ร่วม)
- ปล่อย: migration 0008 → deploy ทันที (Worker เดียว) · ทุก task จบด้วย `npm run typecheck` + `npm test` + `npm run build` ผ่านทั้งชุด

## การเปลี่ยนแปลงต่อส่วน

| ส่วน | เปลี่ยนอะไร | Task |
|---|---|---|
| `shared/timetable.ts` (ใหม่) | ชนิดข้อมูล · `resolveFrame` `validateFrame` `slotIssues` `serializeFrame` `periodTimesOf` `outsideFrame` `normalizeSlots` + ข้อความไทยตรงตัว | T-10 |
| `migrations/0008_timetable.sql` · `shared/types.ts` | ตาราง `timetable_slots` · `terms.timetable_rev` · schema 7 · `SCHEMA_VERSION = 7` · `Settings.period_frame?` · `Bootstrap.timetable?` | T-11 |
| `worker/routes/timetable.ts` + `worker/lib/timetable.ts` (ใหม่) · `app.ts` · `bootstrap.ts` · `catalog.ts` · `lib/db.ts` | EP-11 EP-12 · bootstrap `timetable` · `getSettings.period_frame` · guard `409 period_frame_owned` | T-12 |
| สำรอง/กู้คืน/ล้าง | `timetable_slots` ใน BACKUP_TABLES/COLUMNS/ตรวจแถว/กติกา SQL/fingerprint · counts ไม่มีตารางนี้ได้ · reset ลบตาราง · TABLES ฝั่งแอป 2 ที่ | T-13 |
| `src/lib/timetable/*` (ใหม่) · `src/store.ts` | store + logic + copy + ข้อความ · bootstrap → สัญญาณ `timetable` · แคช kv | T-14 |
| ตั้งค่า › หน้าตา | ช่อง `timetable` ใน `appearance.ts` · การ์ด radio 3 ใบ + ลิงก์ปรับหน้าหลัก | T-15 |
| แผ่นตั้งเวลา S5 | `src/components/timetable/frame/*` | T-16 |
| พิมพ์ S8 | `src/components/timetable/print/*` + `timetable-print.css` | T-17 |
| หน้าหลัก | แถบใต้หัวทุกโครง · แถวคาบโครง ก · การ์ด `timetable` ใน `homeLayout.ts` + แถวสลับใน `CardSettings.tsx` | T-18 |
| หน้าตารางสอน + เมนู | `Timetable.tsx` · ส่วนกลาง · รูปแบบ ก · มือถือ · เมนู rail/เพิ่มเติม · route | T-19 |
| รูปแบบ ข · ค | `src/components/timetable/b/**` · `c/**` | T-20 · T-21 |
| ตั้งค่า › เวลาเรียน · ประวัติ | `TimeSection.tsx` เปิดแผ่น S5 (ไม่แก้ `period_times` ตรงอีก) · `Settings.tsx` เอา `period_times` ออกจาก `FORM_KEYS` · ป้ายประวัติ "ตารางสอน"/"โครงเวลา" | T-22 |

## Tasks (PM ลง board)

| Task | งาน | ตำแหน่ง | เขียนได้เฉพาะ | AC | หน้าใน pages.json | รอ Task | ขนานกับ | พอร์ต |
|---|---|---|---|---|---|---|---|---|
| T-10 | ตัวกลางร่วม `shared/timetable.ts`: ชนิดข้อมูลตามสัญญา · `resolveFrame` (ค่าเริ่มต้น + `period_times`) · `validateFrame` / `slotIssues` รหัส+ข้อความตรงตัวตามตารางในสัญญา · `serializeFrame` `periodTimesOf` `outsideFrame` `normalizeSlots` · เทสต์ทุกตัวอย่างของ BR-02 BR-03 AC-04 AC-11 AC-12 AC-14 | Back-End | shared/timetable.ts, test/unit/tt-shared*.test.ts | AC-04, AC-05, AC-11, AC-12, AC-14, AC-16, AC-17 | — | — | T-15 | 4101 |
| T-11 | migration 0008 (`timetable_slots` + CHECK + index · `terms.timetable_rev` · schema 7) · `SCHEMA_VERSION = 7` · `Settings.period_frame?: string` · `Bootstrap.timetable?` = `TimetablePayload` หรือ null (import จาก `./timetable`) · seed fixture "ตารางจริง" 14 คาบ ภาค 2/2569 + 1/2569 + ภาค 2/2568 ปีเก่า (ข้อมูลสมมติ) · เทสต์ migration (CHECK ปฏิเสธ class ไม่มีห้อง/activity มีห้อง · PK ซ้ำ · ค่าเริ่ม rev 0) · ยืนยัน `scripts/preflight.cjs` ผ่าน (schema ล่าสุด = SCHEMA_VERSION) · เติม `database.md` | DB Specialist | migrations/0008_timetable.sql, shared/types.ts, scripts/fixture-server.cjs, test/api/tt-migration*.test.ts, docs/team/database.md | AC-01, AC-07, AC-08, AC-37, AC-44 | — | T-10 | T-15 | 4102 |
| T-12 | EP-11 GET/PUT + EP-12 + bootstrap `timetable` + `getSettings.period_frame` + `409 period_frame_owned` ใน `PUT /api/settings` (guard ใน batch) · ลำดับการตรวจตามตารางในสัญญา · audit · ตอบ `current` ใน 409 · เทสต์: ทุกแถวของตารางลำดับตรวจ · ภาคปีเก่า 409 · ห้อง/วิชาเก็บแล้วคงคาบเดิมผ่าน/คาบใหม่ 422 · ชนกันสองเครื่อง · epoch · ลดคาบ 409 → confirm → ลบทุกภาคปีปัจจุบันไม่แตะปีเก่า + `period_times` ตรง · ล้างภาคไม่แตะภาคอื่น/เช็คชื่อ/คะแนน (นับแถวก่อน=หลัง) · audit 1 แถว/ไม่มีเมื่อปฏิเสธ · 401 · golden bootstrap | Back-End | worker/routes/timetable.ts, worker/lib/timetable.ts, worker/app.ts, worker/routes/bootstrap.ts, worker/routes/catalog.ts, worker/lib/db.ts, test/api/tt-api*.test.ts, test/api/read-shape.golden.json, test/api/read-shape.test.ts, test/api/helpers.ts, test/api/auth.test.ts | AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-13, AC-14, AC-15, AC-16, AC-17, AC-40, AC-41, AC-42, AC-45 | — | T-11 | T-13, T-14, T-15 | 4103 |
| T-13 | EP-13: `timetable_slots` ใน BACKUP_TABLES/COLUMNS (ท้าย) · `counts` ไม่มีตารางนี้ได้ · zod + กติกา SQL (missing_reference · kind_fields · wrong_school_year · duplicate_slot) · fingerprint · reset ลบก่อน subjects/classes/terms · TABLES ฝั่งแอป (`backup.ts`, `RestoreModal.tsx`) · เทสต์: สำรอง→ล้าง→กู้ = 14 คาบ + โครง 8 คาบเดิม · ไฟล์ v6 ไม่มีตาราง → สำเร็จ ตารางว่าง โครงค่าเริ่มต้นจาก `period_times` ในไฟล์ · แถวผิด → 422 ข้อมูลเดิมไม่เปลี่ยน · งบคำสั่ง batch ≤ 50 | Back-End | worker/routes/backup.ts, worker/lib/restore-validation.ts, worker/routes/reset.ts, src/lib/backup.ts, src/components/RestoreModal.tsx, test/api/tt-backup*.test.ts, test/api/backup-*.ts, test/api/restore*.test.ts, test/api/reset.test.ts, test/unit/backup.test.ts | AC-44 | — | T-11 | T-12, T-14, T-15 | 4104 |
| T-14 | store + ตรรกะฝั่งแอป `src/lib/timetable/`: `logic.ts` (BR-04 ตอนนี้/ต่อไป · BR-05 สรุป · BR-12 วันที่แสดงมือถือ · BR-14 ช่องแถบ+แถวคาบ · BR-15 ห้องทางลัด+ป้าย · ข้ามของที่เก็บแล้ว · คาบในโครงเท่านั้น · รับ `now`) · `copy.ts` (BR-07) · `store.ts` (โหลด GET · สัญญาณต่อภาค · PUT ต่อคิวตามลำดับแตะ · ย้อนค่า · 409/epoch/term_read_only · ออฟไลน์ไม่ส่ง · หมดเวลาโหลดใหม่ · เลิกทำ 5 วิ · ล้าง · คัดลอก · บันทึกโครง + `frame_removes_slots` · แคช bootstrap `kvUpdate` · นาฬิกา 60 วิ) · `messages.ts` ข้อความชุดเดียว · `store.ts` ของแอปรับ `bootstrap.timetable` · เทสต์ตัวอย่างทุกข้อของ BR-04 BR-05 BR-07 BR-14 BR-15 + AC-58 ตาราง (ก)–(ฌ) | Front-End | src/lib/timetable/**, src/store.ts, test/unit/tt-logic*.test.ts, test/unit/tt-store*.test.ts | AC-01, AC-06, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-37, AC-38, AC-39, AC-41, AC-42, AC-43, AC-54, AC-55, AC-58, AC-59 | — | T-10, T-11 | T-12, T-13, T-15 | 4105 |
| T-15 | ตั้งค่า › หน้าตา "รูปแบบตารางสอน": `appearance.ts` เพิ่มช่อง `timetable` (parse ช่องละอิสระ · serialize ครบ + คงช่องที่ไม่รู้จัก · บันทึก/ย้อน/ออฟไลน์ตาม saveAppearance เดิม) · การ์ด radio 3 ใบ + ภาพย่อ + คำอธิบาย 1 บรรทัด (ux S7) · ลิงก์ "เปิด/ปิดแถบ ตอนนี้/ต่อไป ได้ที่ หน้าหลัก › ปรับหน้าหลัก" (D53) · ปรับเทสต์หน้าตาเดิมให้รู้จักช่องใหม่ | Front-End | src/lib/appearance.ts, src/lib/localPrefs.ts, src/components/settings/AppearanceSection.tsx, src/styles/settings.css, test/unit/tt-appearance*.test.tsx, test/unit/hr-appearance-*.test.tsx, test/unit/hr-theme-appearance.test.ts | AC-36, AC-46, AC-47, AC-48, AC-52 | settings-appearance | — | T-10, T-11, T-12, T-13, T-14 | 4106 |
| T-16 | แผ่นตั้งเวลาคาบ S5 + กล่องยืนยันลบคาบ S9-ข: `FrameSheet` (dialog/เต็มจอมือถือ) + `FrameEditor` (เนื้อฟอร์มใช้ซ้ำใน T-22) · จำนวนคาบ −/+ 1–8 · `input type=time` · พัก ≤ 3 · วันเรียน `aria-pressed` · ข้อผิดต่อแถวจาก `validateFrame` + สรุป role=alert + โฟกัสช่องแรกที่ผิด · ออฟไลน์ปุ่มบันทึกปิด · export ตามสัญญาข้างล่าง | Front-End | src/components/timetable/frame/**, src/styles/timetable-frame.css, test/unit/tt-frame*.test.tsx | AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-35 | timetable-frame | T-14 | T-17, T-18 | 4107 |
| T-17 | พิมพ์ S8: `PrintSheet` ผังแบบ ก (วันเรียน × คาบในโครง + เวลา + แถบพัก) ซ่อนบนจอ แสดงเมื่อ `@media print` · `@page A4 landscape` ขอบ 12mm · 1 หน้าแม้ 7×8 · ≥ 10pt · ขาวดำ คำ "กิจกรรม:" แยกชนิด · "(เก็บแล้ว)" · หัว + บรรทัดชื่อครู/โรงเรียนตาม AC-65 (ตัดช่องว่าง) · สรุป BR-05 · ออฟไลน์ "ข้อมูลเมื่อ HH:MM" · ภาคปีเก่า · ไม่พิมพ์เมนู/ปุ่ม/toast · CSS จำกัดขอบเขต `.tt-print` ไม่กระทบ `print.css` ของรายงาน · export ตามสัญญาข้างล่าง | Front-End | src/components/timetable/print/**, src/styles/timetable-print.css, test/unit/tt-print*.test.tsx | AC-60, AC-61, AC-62, AC-63, AC-65 | timetable-print | T-14 | T-16, T-18 | 4108 |
| T-18 | หน้าหลัก: `TimetableStrip` ใต้หัว **ทุกโครง** (ช่องคาบ+พัก · คำ ตอนนี้/ผ่านแล้ว · บรรทัด ตอนนี้/ต่อไป · ปุ่ม [เช็คชื่อ <ห้อง>] + [สแกนงาน] ตาม BR-15 ไม่มีปุ่มเมื่อไม่มีคาบสอนเหลือวันนี้ · "ดูทั้งสัปดาห์" · ≤ 56px คอม/iPad · aria-live สุภาพ) · แถวคาบใน "ลำดับงานวันนี้" **โครง ก เท่านั้น** (กำลังสอน → งานเดิม → ที่เหลือ · ≤ 5 แถว + "ดูอีก N คาบ" · พับคาบที่ผ่านแล้ว · ป้าย "จากตารางสอน" · ไม่นับในตัวเลข) · การ์ด `timetable` ใน `LAYOUT_CARDS` ทุกโครง (เปิดเริ่มต้น · ตำแหน่งตายตัว) + แถวสลับอย่างเดียวใน "ปรับหน้าหลัก" · ทางลัด `#/attendance?class=` `#/scan?class=` · วัดพอดี 1536×729 | Front-End | src/components/home/TimetableStrip.tsx, src/components/home/a/**, src/components/home/b/index.tsx, src/components/home/c/index.tsx, src/pages/Home.tsx, src/lib/homeLayout.ts, src/components/home/CardSettings.tsx, src/styles/home-tt.css, test/unit/tt-home*.test.tsx, test/unit/hr-layout-a-ui.test.tsx, test/unit/hr-layout-b-ui.test.tsx, test/unit/hr-layout-c-ui.test.tsx, test/unit/hr-homecore-*.test.ts*, test/unit/home-ui.test.tsx, test/unit/home-states.test.tsx | AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-34, AC-36, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-59, AC-64 | home, home-b, home-c | T-14 | T-16, T-17, T-19, T-22 | 4109 |
| T-19 | หน้าตารางสอน (ส่วนกลาง + รูปแบบ ก + มือถือ): route `#/timetable?term=` · เมนู rail 9 รายการ/4 กลุ่ม ต่อจาก "หน้าหลัก" + แผง "เพิ่มเติม" มือถือ + ปุ่มลัดแป้น · หัว (ตัวเลือกภาค · ป้ายปีเก่า/ออฟไลน์ · ปุ่ม ตั้งเวลาคาบ/พิมพ์/⋯) · สถานะ ว่าง/ไม่มีภาค/ไม่มีห้อง/กำลังโหลด/409/ล้ม · `PeriodChip` · แผ่นกรอก/แก้ S4 · เมนูของช่อง (เช็คชื่อ/สแกน/แก้/ลบ) · toast เลิกทำ · กล่องยืนยันล้าง/แทนที่ตอนคัดลอก · สรุป · มือถือวันเดียว + ชิปวัน (ทุกรูปแบบ) · รูปแบบ ก ตาราง วัน×คาบ (หัว/คาบติด · เลื่อนในกรอบบน iPad ตั้ง) · แป้นลูกศร/Tab/Enter/Esc · เลือกรูปแบบจาก `appearance.timetable` · สร้างโครงเปล่า `b/index.tsx` `c/index.tsx` ตาม props ข้างล่างให้ T-20 T-21 · mount `FrameSheet` (T-16) `PrintSheet` (T-17) | Front-End | src/pages/Timetable.tsx, src/components/timetable/*.tsx, src/components/timetable/a/**, src/components/timetable/b/index.tsx, src/components/timetable/c/index.tsx, src/styles/timetable.css, src/styles/timetable-a.css, src/components/Shell.tsx, src/app.tsx, src/lib/menuKeys.ts, test/unit/tt-page*.test.tsx, test/unit/tt-layout-a*.test.tsx, test/unit/hr-menu-nav.test.tsx | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-43, AC-49, AC-52, AC-63 | timetable, timetable-mobile | T-14, T-15, T-16, T-17 | T-18, T-22 | 4110 |
| T-20 | รูปแบบ ข ปฏิทินแกนเวลา: แกนเวลาตามโครง · บล็อกตามเวลาเริ่ม–จบ (60 นาทีสูงเท่ากัน) · พักเป็นแถบแคบ · เส้น "ตอนนี้ HH:MM" เป็นข้อความ · วัน/สัปดาห์ · ปุ่ม "เพิ่มคาบ" เลือกช่องว่างก่อน · แตะที่ว่าง = เพิ่ม · เปิดเห็นเวลาปัจจุบันไม่ต้องเลื่อน · ใช้ส่วนกลางของ T-19 | Front-End | src/components/timetable/b/**, src/styles/timetable-b.css, test/unit/tt-layout-b*.test.tsx | AC-01, AC-28, AC-31, AC-33, AC-34, AC-35, AC-36, AC-49, AC-50 | timetable-b | T-19 | T-21, T-22 | 4111 |
| T-21 | รูปแบบ ค วันนี้เป็นหลัก: ส่วนบน "กำลังสอน/ต่อไป" + ปุ่มเช็คชื่อ (BR-15) · รายการคาบวันนี้ · มุมมอง "ทั้งสัปดาห์" ครบทุกช่อง กรอก/แก้/ลบได้ (คอม/iPad นอน 2 คอลัมน์) · ใช้ส่วนกลางของ T-19 | Front-End | src/components/timetable/c/**, src/styles/timetable-c.css, test/unit/tt-layout-c*.test.tsx | AC-01, AC-28, AC-31, AC-33, AC-34, AC-35, AC-36, AC-49, AC-51, AC-58, AC-59 | timetable-c | T-19 | T-20, T-22 | 4112 |
| T-22 | ตั้งค่า › เวลาเรียน: แทนตัวแก้ `period_times` เดิมด้วยสรุปโครง + ปุ่มเปิด `FrameSheet` (ค่าเดียวกัน ข้อผิดเดียวกัน AC-17) · `Settings.tsx` เอา `period_times` ออกจาก `FORM_KEYS` (ไม่ส่งทาง settings อีก) · `AuditHistory.tsx` ป้าย `timetable` "ตารางสอน" / `period_frame` "โครงเวลา" + บรรทัด "2/2569 · 14 → 15" | Front-End | src/components/settings/sections/TimeSection.tsx, src/pages/Settings.tsx, src/components/AuditHistory.tsx, test/unit/tt-settings*.test.tsx, test/unit/settings-page.test.tsx, test/unit/hr-sg-settings-shell.test.tsx, test/unit/audit-dialog.test.tsx | AC-13, AC-17, AC-45 | settings-time | T-16 | T-18, T-19, T-20, T-21 | 4113 |

ตรวจแล้ว: task ที่ขนานกันไม่มีไฟล์ทับกัน (คู่ส่งต่อแบบเรียงลำดับ 1 คู่: `src/components/timetable/b/index.tsx` `c/index.tsx` T-19 สร้างโครงเปล่า → T-20/T-21 ถือหลัง T-19 จบ — แบบเดียวกับ home-redesign T-33→T-34) · ทุก AC-01–AC-65 มี task รับ · พอร์ต 4101–4113 ไม่ซ้ำ · ตำแหน่งใช้ชื่อมาตรฐาน · task BE ไม่ต้องเปิด server (พอร์ตไว้สำหรับ fixture-server ตอนตรวจ)

**ลำดับ (wave):** (1) T-10 ∥ T-15 → (2) T-11 → (3) T-12 ∥ T-13 ∥ T-14 → (4) T-16 ∥ T-17 ∥ T-18 → (5) T-19 ∥ T-22 → (6) T-20 ∥ T-21 · ตรวจในเบราว์เซอร์กับ fixture-server ได้เมื่อ T-12 จบ (FE ก่อนหน้านั้นใช้เทสต์ unit ที่ mock API ตามสัญญา)

**pages.json (QA เขียน):** ชื่อหน้าในคอลัมน์ "หน้าใน pages.json" เป็นชื่อที่เสนอ: `timetable` (`#/timetable` รูปแบบ ก) · `timetable-b` · `timetable-c` (ตั้ง `accent` ใน setup) · `timetable-mobile` (ถ่ายที่มือถือ) · `timetable-frame` (เปิดแผ่น S5) · `timetable-print` (emulate print) · `home` `home-b` `home-c` (แถบ + แถวคาบ) · `settings-appearance` · `settings-time` · เวลาอ้างอิงต้องตรึงด้วย init script ทับ `Date` (เช่น พุธ 11 พ.ย. 2569 09:45 · Asia/Bangkok) เพราะตรรกะใช้เวลาเครื่อง

### สัญญาภายในแอประหว่าง task (ตั้งชื่อตามนี้ — เปลี่ยนต้องแจ้ง Tech Lead)

```ts
// src/lib/timetable/store.ts (T-14)
export const ttCurrent: ReadonlySignal<TimetablePayload | null>;       // ภาคปัจจุบัน (จาก bootstrap แล้วอัปเดตตาม GET/PUT)
export const ttFrame: ReadonlySignal<Frame>;                            // resolveFrame(settings.period_frame, settings.period_times)
export const ttNow: ReadonlySignal<number>;                             // เวลาเครื่อง ms อัปเดตทุก 60 วิ
export function loadTimetable(termId: string): Promise<TimetablePayload | null>;
export function ttOf(termId: string): ReadonlySignal<TimetablePayload | null>;
export function saveSlots(termId: string, next: Slot[], reason?: "edit" | "undo" | "clear" | "copy"): Promise<SaveResult>;
export function setSlot(termId: string, slot: Slot): Promise<SaveResult>;           // เพิ่ม/แก้ 1 ช่อง
export function removeSlot(termId: string, weekday: number, period: number): Promise<SaveResult>; // + toast เลิกทำ 5 วิ
export function saveFrame(input: FrameInput, confirmRemove?: number): Promise<FrameSaveResult>;   // {ok} | {needConfirm: removes[]} | {error}
export function copyFromTerm(sourceTermId: string, targetTermId: string): Promise<CopyResult>;     // {copied, skipped[]}
// src/lib/timetable/logic.ts (T-14) — บริสุทธิ์
export function nowNext(ctx: DayCtx, now: number): { now?: NowItem; next?: NextItem };
export function shortcutRoom(ctx: DayCtx, now: number): { classId: string; label: string } | null;
export function stripCells(ctx: DayCtx, now: number): StripCell[];
export function homeRows(ctx: DayCtx, now: number): HomeRow[];            // ใช้เฉพาะโครง ก
export function summary(slots: Slot[], frame: Frame): { teach: number; activity: number; total: number; hours: string };
export function mobileDay(frame: Frame, now: number): Weekday;
// src/components/timetable/frame (T-16) · print (T-17) · b/c (T-19 โครงเปล่า → T-20/T-21)
export function FrameSheet(p: { open: boolean; onClose: () => void; returnFocus?: HTMLElement | null }): JSX.Element | null;
export function FrameEditor(p: { onSaved?: () => void }): JSX.Element;
export function PrintSheet(p: { termId: string }): JSX.Element | null;      // ซ่อนบนจอ · window.print() เรียกจากหัว
export function LayoutB(p: LayoutProps): JSX.Element;  export function LayoutC(p: LayoutProps): JSX.Element;
// LayoutProps = { termId; slots; frame; readOnly; offline; onCell(weekday, period, anchor) } — ส่วนกลาง (แผ่น/เมนู/toast) อยู่ใน Timetable.tsx
```

## Endpoint ใหม่ที่ออกแบบในเฟสนี้

| EP ใน api-contract | แทน "EP-ใหม่" ของ AC |
|---|---|
| EP-11 `GET`/`PUT /api/timetable` (+ `bootstrap.timetable`) | AC-01–10, AC-18–26, AC-31–35, AC-37–43, AC-45, AC-49–51, AC-53–55, AC-57, AC-60, AC-62–64 |
| EP-12 `PUT /api/timetable/frame` | AC-09, AC-11–17, AC-45, AC-49 |
| EP-13 สำรอง/กู้คืน/ล้าง (ส่วนที่เปลี่ยน) | AC-44 |
| EP-07 (v11) — ไม่ใช่ endpoint ใหม่ | AC-12 AC-13 AC-17 AC-24 AC-46–49 AC-52 AC-56 AC-57 AC-64 AC-65 (คงเดิม) |

ช่อง EP ใน requirements.md / part-2 แก้จาก "EP-ใหม่" เป็น EP จริงตามตารางนี้แล้ว (แก้เฉพาะคอลัมน์ EP · Tech Lead 2026-11-13)

## Dependency ที่ติดตั้งแล้วสำหรับงานนี้

| package | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| — | — | ไม่มี package ใหม่ (พิมพ์ผ่านเบราว์เซอร์ · ใช้ `idb` `zod` `hono` `@preact/signals` เดิม) |

## งานของ DB Specialist / DevOps

- DB Specialist: T-11 (migration 0008 + types schema + seed fixture + `database.md`) · ไม่รัน migration remote
- DevOps/เจ้าของงาน (Gate 3 เท่านั้น ต้องอนุมัติ): สำรองข้อมูลจริงก่อน → `npm run db:migrate:remote` → `npm run deploy` ต่อกันทันที → `/api/health` schema 7 · ไม่มีในเฟส Build

## จุดเสี่ยงและลำดับ

- **schema gate:** migration กับ `SCHEMA_VERSION = 7` ต้องลงใน task เดียว (T-11) ไม่งั้นเทสต์ API ทุกตัวได้ 503 · `read-shape.golden.json` เปลี่ยนเพราะ bootstrap มี `timetable` + `period_frame` (T-12 ถือ)
- **ทับไฟล์ของงานอื่น:** งานนี้แตะไฟล์ที่ home-redesign เพิ่งปล่อย (`appearance.ts` `homeLayout.ts` `CardSettings.tsx` `home/a/**` `Shell.tsx` `Settings.tsx` `TimeSection.tsx`) — branch แตกจาก checkpoint 87fe5b8 แล้ว ห้ามแก้พฤติกรรมเดิมนอก AC ของงานนี้ · ต้องรัน `npm test` ทั้งชุด (baseline ล่าสุด 1017+ tests ของ home-redesign)
- **guard ใน transaction:** ทุกเงื่อนไขที่ตัดสินจากการอ่าน (rev · โครง · ของที่เก็บ · จำนวนคาบที่จะลบ · `period_times`) ต้องซ้ำเป็น `abortIf` ใน batch เดียวกับการเขียน (แนว M1-03) · Reviewer ตรวจข้อนี้
- **เวลา:** ตรรกะทั้งหมดรับ `now` · หน้าจอใช้ `ttNow` ตัวเดียว · ตัดสินวัน/เวลาแบบ Asia/Bangkok (UTC+7 คงที่ แบบ `shared/time.ts`) ไม่ใช้ timezone ของเครื่องที่ตั้งผิด
- **พิมพ์:** Safari iPad อาจไม่ทำตาม `@page landscape` (A7) → NOT RUN จนเจ้าของงานยืนยันบนเครื่องจริง (D09) · CSS พิมพ์ต้องไม่ทำให้หน้ารายงานพิมพ์ผิด
- **ขนาดหน้าหลัก 1536×729:** แถบ ≤ 56px + แถวคาบ ≤ 5 → วัดใน Gate V · ถ้าล้นลดเหลือ 3 แถว (ux S6)
- **ข้อขัด D53** (สวิตช์แถบ): ถ้าเจ้าของงานเลือกให้มีสวิตช์ใน ตั้งค่า › หน้าตา ด้วย → T-15 เพิ่มสวิตช์ที่สลับค่าของโครงที่ใช้อยู่ (ไม่เปลี่ยนสัญญา ไม่เปลี่ยนตาราง Tasks)
- ค้างจาก mockup (Gate 2): โหมดมืด · 4 สถานะปลีก · contrast ซ้ำที่ 1536 · เส้นกรอบธีมมืออาชีพ ≈3.0:1 → FE T-19–T-21 ทำตาม token เดิม + QA ตรวจใน Verify

## รอบแก้ Verify 1 (Tech Lead · 2026-11-13 · D55–D59 · สัญญา part-5 v11.1)

ที่มา: `code-review.md` R-01–R-12 · `security-review.md` S-02 S-03 · มอบให้เจ้าของ task เดิม (ขอบเขตไฟล์เดิมใน `ownership.json`) · ยกเว้น VF-F5 ที่ต้องเพิ่มขอบเขต · บรรทัดอ้างอิงตามโค้ด ณ 2026-11-13

| แก้ | ข้อ | ตำแหน่ง (task เดิม) | ไฟล์:บรรทัด → ทำอะไร | เทสต์ที่ต้องเพิ่ม |
|---|---|---|---|---|
| VF-B1 | R-01 · R-12 (D55 D56) | Back-End (T-10) | `shared/timetable.ts:208-219` เขียนส่วน legacy ใหม่ตาม D55 ข้อ 1–7 (N = max(7, คีย์สูงสุด ≤ 8) · L · จบ = min(เริ่ม+L, เริ่มคาบถัดไป) · พักหลบคาบ/ช่องว่าง ≥ 20 นาที · ผลไม่ผ่าน `validateFrame` = ค่าเริ่มต้นล้วน) · `:73-80` ค่าเริ่มต้นใช้ซ้ำ · `:181-196` โครงที่เก็บแต่ไม่ผ่าน → คืน rev ที่เก็บ (int ≥ 0) ไม่ใช่ 0 | `test/unit/tt-shared.test.ts`: ตัวอย่าง 50 นาที 8 คาบ (ผลตรงตัวอย่างในสัญญา + `validateFrame` = []) · คีย์ "8" อย่างเดียว · คีย์กลางว่าง · เวลาไม่เพิ่ม → ค่าเริ่มต้น · ไม่มีช่องว่าง ≥ 20 → `breaks: []` · โครงเสียคง rev · เทสต์ AC-11/AC-12/23:59 เดิมต้องผ่านไม่แก้ |
| VF-B2 | S-02 (R-07) | Back-End (T-12) | `worker/routes/timetable.ts:167` ตัดช่องว่างหัวท้าย `name` ของพักก่อน `validateFrame` และ `serializeFrame` (`:178-182` ใช้ค่าที่ตัดแล้ว) | `test/api/tt-api-frame.test.ts`: `"  พัก  "` เก็บเป็น `"พัก"` · ช่องว่างล้วน → 422 `break_name` |
| VF-B3 | R-03 (D59 ข) | Back-End (T-12) | `worker/routes/bootstrap.ts:33-35` แทนด้วย SELECT เดียว `SELECT t.id AS term_id, t.timetable_rev AS rev, s.weekday, … FROM (${DEFAULT_TERM_SQL}) t LEFT JOIN timetable_slots s ON s.term_id = t.id ORDER BY s.weekday, s.period` · `:56` เลิกอ่าน rev จาก `terms` · `:72` `termId`/`rev` จากผลนี้ (แถว `weekday` null = ตารางว่าง) | `test/api/tt-api.test.ts`: bootstrap rev = GET rev หลัง PUT · ตารางว่างได้ `slots: []` rev ถูก · `read-shape.golden.json` ต้องไม่เปลี่ยน |
| VF-B4 | S-03 (D56) | Back-End (T-13) | `worker/routes/backup.ts:209-216` (หลังตรวจจำนวนแถว ก่อนสร้าง batch) อ่าน staging ของ `settings` (`period_frame` `period_times`) + `timetable_slots` → `resolveFrame` → issue `bad_frame` / `outside_frame` ตามสัญญา EP-13 → `422 invalid_backup` · ฟังก์ชันตรวจไว้ใน `worker/lib/restore-validation.ts` (ต่อจาก `:104`) | `test/api/tt-backup.test.ts`: คาบวันเสาร์กับโครง 5 วัน → 422 ข้อมูลเดิมไม่เปลี่ยน · คาบ 8 กับโครง 7 คาบ → 422 · `period_frame` เสีย → 422 `bad_frame` · ไฟล์ v6 / ไฟล์ปกติยังกู้ได้ |
| VF-B5 | R-06 R-08 (P3 · ทำถ้าไม่เกินรอบ) | Back-End (T-12) | `worker/routes/timetable.ts:54-55` `z.string().min(1)` (หรือ `""` → null) · `:224-227` SELECT รายการซ้ำแล้วคืน `removes` จริง (m = 0 → `frame_changed`) | `tt-api*.test.ts` id ว่าง → 422 ไม่ใช่ 500 |
| VF-F1 | R-02 R-11 (D59 ก) | Front-End (T-14) | `src/lib/timetable/store.ts:103` `lastFailed` เก็บ `baseRev` · `:185` เก็บ rev ของคำขอที่ล้ม · `:197` `send` รับ `baseRev` ที่ส่งมา · `:328-334` `retryLast` ส่ง `baseRev` เดิม · `:150-158` ในการลองใหม่ 409 `timetable_changed` ที่ `current.slots` เท่ารายการ = สำเร็จ · `:435` `retry: false` สำหรับโครงเวลา | `test/unit/tt-store*.test.ts`: หมดเวลา → เครื่องอื่นแก้ → ลองใหม่ไม่ลบการแก้นั้น (ได้ 409) · คำขอแรกลงแล้ว → ลองใหม่ = สำเร็จ · ล้มของโครงไม่มี retry |
| VF-F2 | R-10 (D57) | Front-End (T-14) | `store.ts:154-158` EP-11 `frame_changed` → `adopt(current)` + `await loadBootstrap()` · `:169-174` 422 ที่มี `outside_frame` → `loadBootstrap()` · `:420-425` EP-12 `frame_changed` ที่ `current.saved = false` → `loadBootstrap()` | `tt-store*.test.ts`: หลัง `frame_changed` `ttFrame` เป็นโครงใหม่ (คาบ 8 ที่ถูกตัดหายจากตัวเลือก) |
| VF-F3 | R-12 (D56) | Front-End (T-14 + T-19) | `store.ts:29` เพิ่ม `ttFrameBroken` (`period_frame` ไม่ว่าง และ `!saved`) · `src/lib/timetable/messages.ts` เพิ่ม `frameBroken: "โครงเวลาที่บันทึกไว้อ่านไม่ได้ — ตั้งเวลาคาบใหม่"` · `store.ts:169-174` ใช้ข้อความนี้แทน `outside_frame` เมื่อโครงเสีย · `src/pages/Timetable.tsx` (T-19 · ใกล้ `:218`) แถบแจ้ง + ปุ่มเปิด `FrameSheet` | `tt-store*.test.ts` โครงเสีย → ข้อความ · `tt-page*` แถบแจ้งแสดง/ไม่แสดง |
| VF-F4 | R-04 (ข้อความแนะนำ · UX ยืนยันได้) | Front-End (T-14 + T-16) | `store.ts:384-397` `describeRemoves` คง `termId` · `removeSummary` จัดกลุ่มตามภาค (ภาคปัจจุบันก่อน แล้ว ปี/ภาคใหม่→เก่า) ชื่อภาคแบบเดียวกับ `MSG.copyButton` → "จะลบ 4 คาบในคาบ 7 — ภาค 2/2569: PLC กลุ่มสาระ (จันทร์), PLC สายชั้น (ศุกร์) · ภาค 1/2569: PLC กลุ่มสาระ (จันทร์), PLC สายชั้น (ศุกร์)" · `src/components/timetable/frame/RemoveConfirm.tsx:7-15` ทางวันเดียวหลายคาบใช้การจัดกลุ่มเดียวกัน · `:20-22` หัวกล่องคงจำนวนรวม | `test/unit/tt-frame*.test.tsx` กรณี 2 ภาค (fixture `--timetable`) ไม่มีรายการดูซ้ำ |
| VF-F5 | R-05 (D58) | Front-End (T-15 · **ขอเพิ่มขอบเขต** `src/lib/localPrefs.ts`) | `src/lib/localPrefs.ts:14` เพิ่ม `"ngankrob-timetable"` ใน `LOCAL_PREF_KEEP` | `test/unit/tt-appearance.test.tsx`: `LOCAL_PREF_KEEP` มีคีย์นี้ · `clearLocalPrefs` ไม่ลบ (`hr-sg3-t55` วนตาม `LOCAL_PREF_KEEP` อยู่แล้ว) |

ขนานกันได้: VF-B1 · VF-B2+B3+B5 (T-12 คนเดียว) · VF-B4 · VF-F1+F2+F3(store)+F4(store) (T-14 คนเดียว) · VF-F3 หน้า (T-19) · VF-F4 กล่อง (T-16) · VF-F5 — ไฟล์ไม่ทับกัน · VF-F2/F3 พึ่งค่าจาก VF-B1 (rev ไม่ย้อน) ผ่าน `resolveFrame` ตัวเดียว: รอ VF-B1 ก่อนรันเทสต์ store

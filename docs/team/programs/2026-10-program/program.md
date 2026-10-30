# Program: งานครบ รอบพัฒนา ต.ค.–ธ.ค. 2569 (ข้อมูลถูก → สแกนง่าย → ทดลองห้องจริง)

- slug: `2026-10-program` · เริ่ม: 2026-10-29 · สถานะ: กำลังทำ
- เจ้าของงาน: ผู้ใช้ (ครู) · PM session: `2026-10-program-20261029-1200` (job-lock ของโปรแกรม)
- branch หลักของโปรแกรม: `main` · job แตก branch `team/<job-slug>` จาก trunk นี้ทุกครั้ง
- แผนฉบับเต็มที่อนุมัติ (Gate P 29 ต.ค.): `C:\Users\User\.claude\plans\qr-concurrent-leaf.md` (สำเนาสาระสำคัญอยู่ในไฟล์นี้)

## เป้าหมาย

ระบบ deploy จริงแล้ว 25 ต.ค. แต่ทีมพบบั๊กความถูกต้องของคะแนน 3 ข้อที่ยืนยันจากโค้ด (สำคัญสุด: ไฟล์สำรองที่มีคะแนนครึ่ง เช่น 7.5 กู้คืนไม่ได้) และจุดเสียดทานใน flow สแกน 43 จุด
โปรแกรมนี้ทำให้ (1) ทุกคะแนนที่บันทึกสำรอง/กู้คืนได้ครบและไม่รับคะแนนของเด็กที่ไม่ได้อยู่ในห้อง (2) ครูสแกนรับงานได้ภายใน ≤ 2 แตะ ไม่มีคะแนนหายเงียบ (3) ผ่านการทดลองห้องจริงเทียบกระดาษก่อนขยายใช้
คง design system เดิม · free tier · ครูคนเดียว · ไม่มี parent portal / multi-teacher / AI

คำตัดสินเจ้าของงาน 29 ต.ค.: คง design เดิม + ปรับ flow สแกน · ลำดับ M1→M2→M3→M4 · commit checkpoint ก่อนเริ่ม · เพิ่มอัปโหลด .xlsx จริง

## Epic

| Epic | ชื่อ | ผลที่ต้องได้ (หยาบ) | ธง |
|---|---|---|---|
| E-01 | ความถูกต้องของข้อมูลคะแนน | คะแนน .5 กู้คืนได้ · เด็ก status≠active ไม่รับคะแนน · intent ตัดสินฝั่ง server · late/% นิยามเดียว · guard+audit ใน transaction | 💰🔄🗑🔐 |
| E-02 | ขั้นตอนสแกนใช้ง่าย | จำค่าล่าสุด · สแกนต่อจาก Home · สลับโหมดกลางรอบ · ScorePad แบบคิว · นโยบายยกเลิก/ยืนยัน bulk · HID readiness | 🔄💰♿ |
| E-03 | Gradebook/ใช้งานประจำวัน/ความปลอดภัย | คีย์บอร์ด Gradebook · รีเฟรชขณะเปิด · นำเข้า .xlsx/.csv · สร้างงานออฟไลน์ · revoke session · เอกสารตรงโค้ด | ♿🔄👤🔐 |
| E-05 | ความสวยงามของ UI และไอคอน (เพิ่ม 30 ต.ค. ตามคำสั่งเจ้าของงาน) | visual audit 8 หน้า → ข้อเสนอต่อยอด design system เดิม (ไอคอน, app icon, สี/dark mode, spacing, typography, สถานะ) → mockup → job ทำจริง ≤ M หลัง Gate 2 | ♿ |
| E-04 | อุปกรณ์จริงและทดลองห้องเรียน | Playwright devDep + scan-e2e · release train จาก tag · ทดลอง iPad/กล้อง/เครื่องยิง · ทดลอง 1 ห้อง 2 สัปดาห์ + reconcile | ☁️🗑💰👤 |

## Milestone

| M | ชื่อ | Epic ที่ต้องเสร็จ | Gate M (demo) | Release |
|---|---|---|---|---|
| M-00 | Gate 0: checkpoint + baseline + precheck | — | รอ | — |
| M-01 | ข้อมูลคะแนนถูกต้อง (สัปดาห์ 1–2) | E-01 | รอ | tag `m1` |
| M-02 | สแกนง่าย (สัปดาห์ 2–4, mockup ก่อน) | E-02 | รอ | tag `m2` |
| M-03 | Gradebook/ประจำวัน/ความปลอดภัย (สัปดาห์ 4–5) | E-03 | รอ | tag `m3` |
| M-04 | อุปกรณ์จริง + ทดลองห้องเรียน (สัปดาห์ 5–7) | E-04 | รอ | — |

## Job (ขนาด ≤ M · 1 job active ต่อ working tree)

| job-slug | ขนาด | Epic | Milestone | รอ job | worktree | สถานะ |
|---|---|---|---|---|---|---|
| `2026-10-29-program-intake` (Gate 0: commit/tag, baseline, precheck) | S | — | M-00 | — | (หลัก) | ปิดแล้ว |
| `2026-10-30-m1-01-restore-half-score` | S | E-01 | M-01 | intake | merge เข้า main `0020a93` (D19) | ปิดแล้ว |
| `2026-10-30-m1-02-inactive-student-guard` | S | E-01 | M-01 | m1-01 | merge เข้า main `a1ef3fa` | ปิดแล้ว |
| `2026-10-30-m1-03-guards-in-transaction` | S | E-01 | M-01 | m1-02 | merge เข้า main (ผู้ใช้สั่ง "merge แล้วทำต่อ") | ปิดแล้ว |
| `2026-10-30-m1-04-late-flag` | S | E-01 | M-01 | m1-03 | merge เข้า main (ผู้ใช้สั่ง "merge แล้วทำต่อ") | ปิดแล้ว |
| `2026-10-30-m1-05-metrics-single-source` | S | E-01 | M-01 | m1-04 | merge เข้า main (ผู้ใช้สั่ง "merge แล้วทำ M1-06 ต่อ") | ปิดแล้ว |
| `2026-10-30-m1-06-server-intent` (รวม M1-07 + R-06 ของ M1-02 + D24) | S | E-01 | M-01 | m1-05 | merge เข้า main (ผู้ใช้สั่ง "merge แล้วทำ M1-08 ต่อ") | ปิดแล้ว |
| `2026-10-30-m1-08-audit-atomic` | S | E-01 | M-01 | m1-06 | merge เข้า main `b9115d7` | ปิดแล้ว |
| `2026-10-30-visual-polish-review` (ประชุมออกแบบ: audit + ข้อเสนอ + mockup) | M | E-05 | M-02 | — (ขนานกับ M1, เฉพาะ docs) | (หลัก, เฉพาะ docs) | ปิดแล้ว (Gate 2 อนุมัติ) |
| `2026-10-30-projector-mode-design` (โหมดฉายจอ D26: ux + mockup) | M | E-05 | M-02 | — (ขนานกับ M1-06, เฉพาะ docs) | (หลัก, เฉพาะ docs) | ปิดแล้ว (Gate 2 อนุมัติ D27) |
| `2026-10-30-fs-1-font-size-density` | M | E-02,E-05 | M-02 | m1-08 | merge เข้า main `f032c8d` | ปิดแล้ว |
| `2026-10-30-scan-1-big-name-keypad` | S | E-02 | M-02 | fs-1 | รอผู้ใช้สั่ง merge | ปิดแล้ว |
| `pj-1-projector-shell-random` → `pj-2-projector-scan-attendance` → `pj-3-projector-reports` | M/M/S | E-05 | M-02 | Gate M1 | (หลัก) | รอ |
| `vp-1-tokens-a11y` → `vp-2-icons` → `vp-3-app-icon` | M/M/S | E-05 | M-02 | Gate M1 | (หลัก) | รอ |
| `2026-10-30-m2-00-scan-mockups` (mockup สแกน/ตั้งค่า/สมุดคะแนน) | M | E-02 | M-02 | — | (หลัก, เฉพาะ docs) | ปิดแล้ว (Gate 2 อนุมัติ D30) |
| **ลำดับสร้างจริงหลัง M1 (D30):** `fs-1-font-size-density` (ตัวปรับตัวอักษร+ความหนาแน่นทั้งแอป px→rem, เสี่ยงสุด) → `scan-1-big-name-keypad` (ชื่อ+แป้นคะแนนใหญ่, คงหน้าตาเดิม) → `gb-1-many-columns` (สมุดคะแนน 10–15 คอลัมน์ ล็อก/จัดกลุ่ม/เมนูทำทั้งห้อง, M–L) → `pj-1..3` (โหมดฉายจอทีวี) | M/M/L/M·M·S | E-02,E-05 | M-02 | Gate M1 | (หลัก) | รอ |
| `m2-01-resume-scan` → `m2-02-mode-switch` → `m2-03-scorepad-queue` ∥ `m2-04-undo-policy` → `m2-05-hid-ready` ∥ `m2-06-tap-targets` | M… | E-02 | M-02 | Gate 2 | (หลัก) | รอ |
| `m3-01`…`m3-07` (ดูแผน) | S/M | E-03 | M-03 | Gate M2 | (หลัก) | รอ |
| `m4-01-playwright-e2e` (ทำได้ตั้งแต่ M2) · `m4-02-release-train` · `m4-03-device-trial` · `m4-04-classroom-trial` | M/S/S/M | E-04 | M-04 | — | (หลัก) | รอ |

job-slug จริงจะเติมวันที่ `YYYY-MM-DD-` ตอนเปิดงาน

## เจ้าของ section ในเอกสารถาวร

| เอกสาร | section | job ที่แก้ได้ |
|---|---|---|
| `context.md` | `## คำสั่งและผลล่าสุด` (baseline) | intake, ทุก release |
| `decisions.md` | ต่อท้าย D-xxx | PM ทุก job |
| `README.md` / `docs/OPERATIONS.md` | ตามหัวข้อที่กระทบ | m1-01 (restore), m3-03 (นำเข้า), m3-07 (Writer) |

## Gate

| Gate | สถานะ | วันที่ | คำตอบเจ้าของงาน |
|---|---|---|---|
| P แผนงาน | อนุมัติ | 2026-10-29 | อนุมัติแผน 4 milestone; ตัดสิน: คง design เดิม, ลำดับ M1→M4, commit ก่อน, เพิ่ม .xlsx |
| Gate 0 | ผ่าน | 2026-10-30 | commit `2c3bbde` + tag · baseline 570/570 · precheck production สะอาด (อนุมัติ D18) · คำถามค้างตอบแล้ว D15–D17 |
| M-01 demo | รอ | | |
| 2 ความสวยงาม/ไอคอน (E-05) | อนุมัติ | 2026-10-30 | อนุมัติทั้งแผน VP-1..7 · app icon ใหม่ · รองรับ iPad/คอม/มือถือ (D20–D22) |
| 2 mockup สแกน | รอ | | |
| M-02 demo | รอ | | |
| M-03 demo | รอ | | |
| M-04 ลงนามรับ | รอ | | |
| 3 release train | ต่อ milestone | | |

## คำถามค้าง — ตอบแล้ว 30 ต.ค. (ดู decisions.md D15–D17)

1. M1-02 เด็ก moved/inactive/finished: ห้ามรับงานใหม่ แต่แก้แถวเดิมใน Gradebook ได้ (D15)
2. M2-04 ยกเลิกในผังเลขที่: action sheet + toast เลิกทำ 5 วิ; bulk มี dialog ยืนยัน (D16)
3. M3-05 ปุ่มผู้ปกครองเห็นคะแนน: ซ่อนจนกว่าจะมีหน้าผู้ปกครอง (D17)

## E-05 ความสวยงาม/ไอคอน — แผนรวมจากประชุมออกแบบ 30 ต.ค. (Gate 2 อนุมัติ 30 ต.ค.: D20 ทั้งแผน · D21 app icon ใหม่ · D22 รองรับมือถือ/iPad/คอม, 44px บนจอสัมผัส, ไอคอนเมนูใหม่ 3 ตัว)

**โหมดฉายจอ (D26, D27):** iPad แนวนอน AirPlay ขึ้น**สมาร์ททีวีในห้องเรียน** (สื่อการสอน) · ฉาย สุ่มชื่อ/สแกน/เช็คชื่อ/รายงาน · ปุ่ม "โหมดฉายจอ" ตัวใหญ่ ธีมเข้ม ปรับขนาดตัวอักษร 3 ระดับ ซ่อนคะแนน · ค้างส่ง = จำนวนอย่างเดียว · ปิดด้วยกดค้าง 1 วิ → Gate 2 อนุมัติ 30 ต.ค. · สร้างจริง PJ-1..3 หลังจบ M1

**กติกาทุกงานหน้าจอ (D22):** ตรวจภาพที่ 375 · 768 · 1024 (สัมผัส) · 1280+ (เมาส์) ทั้ง light/dark · hit target ≥ 44px ใต้ `@media (pointer: coarse)` · คอมใช้คีย์บอร์ดได้

ที่มา: `jobs/2026-10-30-visual-polish-review/visual-design.md` (V1–V7) + `ux.md` (UX-1..7) · mockup: `design/mockups/overview.html` · ภาพปัจจุบัน 25 ไฟล์ใน `design/current/`

| job | รวมจาก | ขอบเขต | ขนาด | ความเสี่ยง | ทำเมื่อ |
|---|---|---|---|---|---|
| VP-1 tokens + contrast + focus + heading + microcopy | V1, UX-5, UX-4, UX-6 | ปรับค่า `--text-muted`/`fill-success`/`fill-danger`/`border-accent` ให้ ≥ AA · เพิ่ม `--ring-focus` + `:focus-visible` ทั่วระบบ · ชื่อหน้าเป็น `h1`/การ์ดเป็น `h2` (reset ให้หน้าตาเดิม) · microcopy 15 ข้อ + ข้อความ error เป็นไทย | M | ต่ำ–กลาง | ทันทีหลัง M1 (ไม่ชนไฟล์ scan flow) |
| VP-2 พจนานุกรมไอคอน + ขนาดมาตรฐาน + สถานะส่งงาน/เช็คชื่อ | V2, UX-1, UX-7, UX-2 | map ไอคอนตามพจนานุกรม (check/circle-check/checks, edit→pencil, cloud-off→cloud-x/alert, bulb→flashlight, เมนู table→notebook, id-badge-2→users, arrows-shuffle→dice-3) · `Icon` ขนาด 16/20/24 เท่านั้น ลบ prop `stroke` · WorkCell aria-label ทุกสถานะ | M | กลาง | หลัง VP-1 |
| VP-3 app icon ใหม่ | V3 | favicon/maskable SVG ใหม่ (กระดาษ + ติ๊กเดียว) + PNG 192/512/180 + apple-touch-icon + manifest | S | กลาง (cache SW, ต้องติดตั้งใหม่บน iPad) | หลัง VP-1 (รอเจ้าของงานเลือกแบบ) |
| VP-4 hit target 44px + ปุ่ม 40/32 + เงาการ์ด/radius/line-height 1.6 | V4, UX-3 | `button` min-height 44 บน touch · select ภาคเรียน · `sc-cell` 48×44 · `--shadow-card` · radius scale · lh 1.6 | M | **สูง** (ตารางยาวขึ้น ~10%, layout 375) | **หลัง M2 สแกนเสร็จ** (scan.css ชน) |
| VP-5 Home + สแกนระหว่างรอบ | V5 | จัดปุ่ม Home เท่ากัน, แบนเนอร์ภาคเรียนย่อ, slot ฟีดแบ็กคงที่, header หน้าสรุป | M | กลาง | **รวมเข้า job M2 ของ scan flow** |
| VP-6 สมุดคะแนน + ตั้งค่า | V6 | header ตาราง, เมนูย่อยตั้งค่า, ซ่อน scrollbar แท็บ + เฟดขอบ, pill แทน select | M | กลาง | รวมกับ M3-01 |
| VP-7 empty/loading/error + micro-interaction ≤ 5 | V7 | `EmptyState` เดียว, skeleton, แฟลชช่องสแกน, ring transition, แถบใต้แท็บ (reduced-motion) | M | ต่ำ–กลาง | ท้าย M3 |

ลำดับ: VP-1 → VP-2 → VP-3 → (M2) → VP-4 → VP-6/VP-7 · ทุก job ติดธง ♿ · ตรวจด้วยภาพก่อน/หลัง 8 หน้า × 375/1024 × light/dark + ชุดทดสอบเดิม

## บันทึก

- 2026-10-29 Gate P อนุมัติ · เปิด job intake · secret-scan docs PASS
- 2026-10-30 M1-04 → M1-05: legend หน้าสแกน "ส่งแล้ว" รวมเด็กที่ส่งช้าแต่ยังไม่มีคะแนน (ตามนิยาม workState: late ต้องมีคะแนน) — ตัดสินในงานนิยามกลาง · → M1-08: undo ของ ส่งครบ/คะแนนเต็ม หลังเลื่อนกำหนดส่งได้ modified_since เพราะเทียบ after.late (ข้ามคีย์ late) · → M2: legend หน้าสแกนไม่มีแถว "ยกเว้น"
- 2026-10-30 M1-04 ปิด known issue "การส่งครั้งแรกอ่าน due_date ก่อนเขียน" แล้ว (late คำนวณใหม่ท้ายทุก batch ที่เขียน submissions) — **ตัดออกจาก scope M1-06** · ส่งต่อ M1-08: audit after.late ของ bulk/bulk-undo เป็นค่าก่อน UPDATE ต่อท้าย · งบ volume ใหม่: แก้กำหนดส่งพลิกทุกแถว 1,000 read / 300 written
- 2026-10-30 M1-04 (PM จากภาพ QA `jobs/2026-10-30-m1-04-late-flag/evidence/qa-scan-late-375.jpg`) → M2/VP-5: ที่ 375 แถบหัวรอบสแกนแบบ sticky ซ้อนทับช่องสแกนเมื่อเลื่อนหน้าจอ — ต้องตรวจใน mockup/งาน M2 ตาม D22
- 2026-10-30 M1-04 (QA) → M1-06: server ไม่ตรวจรูปแบบ `due_date` (`assignments.ts` ใช้ `z.string()`) ถ้าได้ปี พ.ศ./รูปแบบอื่น การเทียบวันที่จะไม่มีวันนับว่าช้า → เพิ่ม regex YYYY-MM-DD (ค.ศ.) แบบเดียวกับ `left_at`
- 2026-10-30 M1-04 → M1-06: การส่งครั้งแรก (`submissions.ts`) อ่าน due_date ก่อนเขียน late — ถ้าครูแก้กำหนดส่งแทรก แถวใหม่ได้ late ตามกำหนดเดิม → เพิ่ม due_date ใน stillValid หรือคำนวณ late ใน SQL
- 2026-10-30 M1-03 → VP-1: ข้อความ `number_conflict` ตอนนำเข้า เมื่อแถวไม่มีเลขที่ชนเด็กนอกรายการ ให้ระบุชื่อเด็กที่ถือเลขนั้น (`students.ts` numberConflict)
- 2026-10-30 M1-03 backlog (จาก dev): (ก) assignments `prevRows` อ่านก่อน — สองเครื่องผูกห้องเดียวกันให้งานเดียวกันพร้อมกันจะข้ามการตรวจปี (แคบมาก) (ข) catalog POST /api/classes `class_of_past_year` ตรวจก่อนเขียน ไม่ซ้ำใน batch → รวมเป็น job เล็กท้าย M1 ถ้ามีเวลา
- 2026-10-30 M1-02 review: R-06 (judge ใช้ `w.existing` แทน `effective` ในกรณี [void, grade] คำขอเดียว) + intent จาก client → **เพิ่มเข้า scope M1-06**
- 2026-10-30 M1-01 review: R-01 จาก Code Reviewer — ฝั่งบันทึก `submissions.ts:61` zod `multipleOf(0.5)` มีค่าเผื่อทศนิยมลอย (7.500000000000001 ผ่าน) แม้ UI ยังสร้างค่านั้นไม่ได้ → **เพิ่มเข้า scope M1-05**: ใช้ `isHalfStep` จาก `shared/grade.ts` เป็นนิยามเดียวทั้งฝั่งบันทึกและ restore
- 2026-10-30 Gate 0 ผ่าน: commit `2c3bbde` + tag `deploy-2026-10-25` · baseline 56 ไฟล์/570 tests PASS · precheck production: คะแนนครึ่ง 0, เทอมซ้ำ 0, เลขที่ซ้ำ 0 (ไม่ต้อง hotfix) · ปิด job intake · เปิด `2026-10-30-m1-01-restore-half-score`
- 2026-10-30 M1-08 ปิดแล้ว (รอผู้ใช้สั่ง merge): audit เข้า transaction เดียวกับข้อมูลทุกเส้นทาง · backlog: S-01 PIN เก็บข้อความธรรมดา (ต้องแก้ก่อนมีฟีเจอร์ใช้ PIN/หน้าผู้ปกครอง), S-02 เตือนตอนดาวน์โหลด backup, S-03 ล้าง qr_token ในประวัติเก่า, R-01/S-04 ป้ายไทยใน AuditHistory (รวมกับงานขนาดตัวอักษร), R-02..R-07
- 2026-10-30 fs-1 ปิดแล้ว (รอ merge): ส่งต่อ scan-1 = ช่อง .sc-cell กว้าง ~28px + หัวขั้นสแกน 390@24 · gb-1 = ปุ่มตา hs-eye <44px · ยังไม่ได้ลอง iPad จริง · AC-01 ไม่กะพริบตรวจจากโค้ดเท่านั้น
- 2026-10-30 scan-1 ปิดแล้ว (รอ merge): ยังไม่ได้ลอง iPad จริง · 1180 นอนโหมดกรอกทีละคนเลื่อนเล็กน้อย · ปุ่มลัด 'ล่าสุด' → M2-01 · R-06 (ชื่อปุ่มบันทึกมีค่า) ข้ามเพราะ test เดิม · ProgressRing ทับกรอบ (ของเดิม ไม่พบในรอบวัดสุดท้าย)

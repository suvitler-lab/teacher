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
| `2026-10-29-program-intake` (Gate 0: commit/tag, baseline, precheck) | S | — | M-00 | — | (หลัก) | กำลังทำ |
| `m1-01-restore-half-score` | S | E-01 | M-01 | intake | (หลัก) | รอ |
| `m1-02-inactive-student-guard` | S | E-01 | M-01 | m1-01 | (หลัก) | รอ |
| `m1-03-guards-in-transaction` | M | E-01 | M-01 | m1-02 | (หลัก) | รอ |
| `m1-04-late-flag` | M | E-01 | M-01 | m1-03 | (หลัก) | รอ |
| `m1-05-metrics-single-source` | M | E-01 | M-01 | m1-03 | (หลัก) | รอ |
| `m1-06-server-intent` · `m1-07-bulk-excused` · `m1-08-audit-atomic` | S/S/M | E-01 | M-01 | m1-04/05 | (หลัก) | รอ |
| `m2-00-scan-mockups` | M | E-02 | M-02 | — (ขนานกับ M1) | (หลัก, เฉพาะ docs) | รอ |
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
| 2 mockup สแกน | รอ | | |
| M-02 demo | รอ | | |
| M-03 demo | รอ | | |
| M-04 ลงนามรับ | รอ | | |
| 3 release train | ต่อ milestone | | |

## คำถามค้าง — ตอบแล้ว 30 ต.ค. (ดู decisions.md D15–D17)

1. M1-02 เด็ก moved/inactive/finished: ห้ามรับงานใหม่ แต่แก้แถวเดิมใน Gradebook ได้ (D15)
2. M2-04 ยกเลิกในผังเลขที่: action sheet + toast เลิกทำ 5 วิ; bulk มี dialog ยืนยัน (D16)
3. M3-05 ปุ่มผู้ปกครองเห็นคะแนน: ซ่อนจนกว่าจะมีหน้าผู้ปกครอง (D17)

## บันทึก

- 2026-10-29 Gate P อนุมัติ · เปิด job intake · secret-scan docs PASS
- 2026-10-30 Gate 0 ผ่าน: commit `2c3bbde` + tag `deploy-2026-10-25` · baseline 56 ไฟล์/570 tests PASS · precheck production: คะแนนครึ่ง 0, เทอมซ้ำ 0, เลขที่ซ้ำ 0 (ไม่ต้อง hotfix) · ปิด job intake · เปิด `2026-10-30-m1-01-restore-half-score`

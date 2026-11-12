# Security Review (Verify) — 2026-11-11-home-redesign

> หมายเหตุถึง PM: คำสั่งให้เขียน `verify-security.md` แต่ hook ปฏิเสธ ("อยู่นอกขอบเขตเขียนของ team-security-reviewer") → เขียนที่ `security-review.md` (ไฟล์ตามบทบาท) แทน

ผู้ตรวจ: Security Reviewer · commit e1bd05e (diff เทียบ e1bd05e~1) · ธง 🔐 🗑 👤 · รอบแก้ (Verify) 1/3 · ตรวจด้วยการอ่านโค้ด + grep (ไม่ได้รันบนเบราว์เซอร์ ไม่ได้เรียก endpoint ใด)

## สรุปผล
**ผ่านแบบมีเงื่อนไข** — ต้องแก้ 0 · ควรแก้ 2 · เสนอ 6
- ไม่มีทางข้ามสิทธิ์ใหม่: worker/ shared/ migrations/ ไม่เปลี่ยน (`git diff --stat e1bd05e~1 -- worker shared migrations` ว่าง ทั้ง commit และ working tree) · reset ยังตรวจรหัสผ่าน+วลีที่เซิร์ฟเวอร์ (worker/routes/reset.ts:10 requireAuth, :48 วลี, :54-57 verifyPassword → 403)
- `npm audit --json` (อ่านอย่างเดียว): critical 0 · high 0 · moderate 0 · low 0
- dependency ใหม่: `@phosphor-icons/web` (แทน `@tabler/icons-webfont`) + devDeps `@fontsource/{anuphan,mali,mitr,sarabun}` — ฟอนต์/ไอคอน static ไม่แตะข้อมูล

## ข้อค้นพบ

### ต้องแก้
(ไม่มี)

### ควรแก้
- **S-01 · Low · PDPA/ระดับยืนยัน · R-5607** — `src/components/RestoreModal.tsx:161` `runBackup()` ดาวน์โหลดไฟล์สำรองข้อมูลทั้งหมด (ชื่อ-นามสกุลผู้เยาว์ PIN รหัส QR) โดยไม่ผ่าน `BackupWarning` (RestoreModal.tsx:41-62) ต่างจาก ResetModal (ResetModal.tsx:78,129) และปุ่มดาวน์โหลดปกติ (Settings.tsx:243) · ข้อความที่มี (RestoreModal.tsx:213) บอกแค่ "ดาวน์โหลดสำรองข้อมูลปัจจุบันให้อัตโนมัติ" ไม่มีเรื่องผู้เยาว์/ไม่เข้ารหัส/อย่าส่ง LINE/ไฟล์หลุด→ออก QR ใหม่ · สถานการณ์: ครูกู้คืนบนคอมห้องพักครูที่ใช้ร่วม → ไฟล์ JSON ไม่เข้ารหัสค้างใน Downloads โดยไม่เคยเห็นคำเตือน · ชั้นป้องกันอื่น: ติ๊กยอมรับ (RestoreModal.tsx:219-226), ปุ่มปิดตอนฉายจอ/ออฟไลน์ (:226), ป้าย PDPA ถาวรใน BackupSection.tsx:43-47 → "ควรแก้" ไม่ใช่ต้องแก้
  - แนวทาง: ใส่ข้อความเตือนชุดเดียวกับ BackupWarning ในขั้น validated (ข้าง :213) และให้ข้อความติ๊กยอมรับ (:221) ครอบคลุม "จะดาวน์โหลดไฟล์สำรองที่มีข้อมูลส่วนบุคคลลงเครื่องนี้" · ทางเลือก: เปิด BackupWarning ก่อน execute() แบบ ResetModal.press() · **ไม่แนะนำ** ตัดสำเนาอัตโนมัติ (ตาข่ายกันข้อมูลหายเมื่อกู้คืนผิดไฟล์)
- **S-02 · Low · ระดับยืนยัน/ฉายจอ/ออฟไลน์ (BR-59 แถว 2)** — `src/components/StartTermModal.tsx:56` `canStart` ไม่ดู `online`/`projectorOn` · ทางเข้าจากหน้าหลักไม่ปิด: `src/components/home/cards.tsx:375`, `src/components/home/Todo.tsx:15`, `src/components/home/model.tsx:59` → ฉายจออยู่ก็เริ่มภาคเรียนใหม่ได้ (ย้อนไม่ได้ บนจอที่นักเรียนเห็น) · ออฟไลน์กดได้แต่ API ล้ม ไม่มีข้อมูลเสีย · มีติ๊ก "ตรวจแล้ว" (:151-157) กันกดพลาด · แนวทาง: `canStart` รวม `online.value && !projectorOn.value` + ข้อความ "ต้องออนไลน์/ปิดอยู่ตอนฉายจอ" แบบ RestoreModal.tsx:224

### เสนอ
- **S-03 · Low · ฉายจอ** — ปุ่มดาวน์โหลด/กู้คืนในการ์ดภาพรวม `src/components/settings/SettingsCards.tsx:84` และเริ่มภาคเรียน `:99,:101` เช็คแค่ `offline` · ตอนนี้ถูกปิดด้วย MutationObserver (`src/pages/Settings.tsx:107-119` ใส่ disabled ทุก button ใน body) — ป้องกันชั้นเดียว · เสนอเช็ค `useReadOnly()` ในคอมโพเนนต์เอง และให้ `backup()` (Settings.tsx:162) / `BackupWarning.onConfirm` ไม่ทำงานเมื่อ `projectorOn`
- **S-04 · Low · R-5608** — `RestoreModal.tsx:200` ช่องเลือกไฟล์ทำงานตอนฉายจอ/ออฟไลน์ → `POST /api/restore/validate` สร้างงานกู้คืนค้าง (ไม่แตะข้อมูลจริง) · เสนอ `disabled={offline || projecting}`
- **S-05 · Low · รหัสผ่านบนจอฉาย** — `src/components/settings/sections/AccountSection.tsx:52` ถ้ากด "แสดง" รหัส (type=text) ไว้ก่อนเริ่มฉาย ค่ายังเห็นบนจอ (MutationObserver ปิดปุ่ม แต่ไม่ซ่อนค่า) · เสนอ: เมื่อ `ro` เป็น true ให้ `reset(); setOpen(false)` ใน ChangePassword
- **S-06 · Low · ชื่อใน title** — `title={fullName(st)}` ใน `src/components/home/a/Cards.tsx:24`, `home/b/Detail.tsx:23`, `home/c/Tiles.tsx:92` — Person วาดเฉพาะ `!hide` (a/Cards.tsx:66-68,99 · b/Detail.tsx:105-107,143 · c/Tiles.tsx:107-109) → ไม่รั่ว แต่พึ่งผู้เรียก · เสนอให้ Person รับ hide เอง
- **S-07 · Low** — `gk_email` (อีเมลครู) คงอยู่หลังล้างค่าในเครื่อง (src/lib/device.ts:52-60) — ถูกต้องตาม BR-60 แต่บนเครื่องร่วม เสนอให้ logout ล้าง (นอกขอบเขต job นี้)
- **S-08 · Low** — นำเข้าไม่จำกัดขนาดไฟล์ก่อน parse (src/pages/Students.tsx:681 pickFile → src/lib/importParse.ts:134) จำกัดแค่ 200 คน (Students.tsx:650) · กระทบเฉพาะเบราว์เซอร์ของครูเอง · เสนอเพดาน ~5 MB

## คำตอบข้อ 1 — R-5607
- **AC-242 "ทุกครั้ง"**: ความเห็นผู้ตรวจ — **ครอบคลุม** สำเนาอัตโนมัติของการกู้คืนด้วย เพราะเป็นไฟล์ชนิดเดียวกัน (ทั้งฐาน ไม่เข้ารหัส) ลงเครื่องเดียวกัน และ BR-59 ตัวอย่าง + ResetModal.tsx:45 ("(AC-242)") ตีความแบบนี้แล้วสำหรับสำเนาก่อนล้าง — ให้ PM ยืนยันกับเจ้าของในฐานะการตีความ AC
- **ความเสี่ยง**: Low — เฉพาะผู้ล็อกอินแล้ว ผ่านติ๊กยอมรับ ออนไลน์ ไม่ฉายจอ; ผลเสียคือไฟล์ PII อยู่บนเครื่อง (อาจเครื่องร่วม) โดยครูไม่ได้รับคำแนะนำการเก็บ · ไม่ใช่ช่องโจมตีจากภายนอก
- **ข้อเสนอที่ปลอดภัยที่สุด**: คงสำเนาอัตโนมัติ + แสดงคำเตือน PDPA ชุดเดียวกับ BackupWarning ในขั้น validated และให้ติ๊กยอมรับครอบคลุม (S-01) — ไม่เพิ่มขั้น ไม่ตัดตาข่ายกันข้อมูลหาย

## คำตอบข้อ 2 — ระดับยืนยันโซนอันตราย
| การกระทำ | call site (grep) | การยืนยันที่มีจริง | ฉายจอ/ออฟไลน์ |
|---|---|---|---|
| ล้างข้อมูล/ล้างทั้งหมด | `POST /api/admin/reset` ที่เดียว ResetModal.tsx:67 · เปิดจาก DangerSection.tsx:18,22 → Settings.tsx:242 | 2 ขั้น: ขั้น 1 รายการ+ติ๊กสำรอง (:93-101) → ขั้น 2 รหัสผ่าน+วลี `ready` (:52), `go()` ตรวจ `ready` ซ้ำ (:59) · สำรองผ่าน BackupWarning (:78,:129) · สำรองล้ม = ไม่ลบ (:65) | `ready` รวม offline/projecting (:52) · ปุ่มเปิด disabled `offline||ro` (DangerSection.tsx:12) |
| เซิร์ฟเวอร์ reset | worker/routes/reset.ts:10,48,54-57 | requireAuth + วลีตรง + รหัสผ่านซ้ำ (403) — ไม่เปลี่ยน → เรียกจากคอนโซลโดยไม่มีรหัส = 403 · ไม่ถดถอย | — |
| กู้คืน | `/api/restore/*` เฉพาะ RestoreModal.tsx:82,98,115,129,173,183 + ยกเลิกงานค้าง Settings.tsx:171 | ติ๊กยอมรับ SE-S13 (:219-226) ตรง BR-59 แถว 2 · ระหว่างทำปิดไม่ได้ (:80,:191) | ปุ่มแดง disabled (:226) · ช่องเลือกไฟล์ไม่ปิด (S-04) |
| เริ่มภาคเรียนใหม่ | `/api/terms/start` StartTermModal.tsx:66 (+ Onboarding.tsx:97 ครั้งแรก) | ติ๊ก "ตรวจแล้ว" เมื่อมีภาคปัจจุบัน (:56,:151) handler ตรวจซ้ำ (:63) | **ไม่เช็ค** (S-02) |
| ดาวน์โหลดสำรอง | runBackup: Settings.tsx:164 (ผ่าน BackupWarning :243) · ResetModal.tsx:65 (ผ่าน) · RestoreModal.tsx:161 (**ไม่ผ่าน** S-01) | | ปุ่มใน BackupSection.tsx:12,33,40,49 `offline||ro` · การ์ดภาพรวม S-03 |
| ล้างค่าในเครื่อง P9 | DevicesSection.tsx:154 clearLocalPrefs | ข้อ 5 | ทำได้ออฟไลน์ตาม BR-59 |
| ออกเครื่องอื่น | AccountSection.tsx:139-146 | useConfirm หัวมีชื่อเครื่อง (:141) | `offline||ro` (:140,:205) |

## คำตอบข้อ 3 — บัญชี (ผ่าน)
- 3 ช่อง `type=password` + autocomplete current/new-password (AccountSection.tsx:50,109-111) · ตรวจ BR-58 ก่อนส่ง (:17-23,:79-82) · ส่งใน body POST ไม่อยู่ใน URL (:85) · ไม่มี console.log/storage ของรหัส (grep) · สำเร็จ → `reset()` ล้าง 3 ช่อง + ปิดฟอร์ม (:74,:86) · ยกเลิกล้าง (:114) · aria-label ปุ่มแสดง/ซ่อนมีแค่ชื่อช่อง (:52) · preact ตั้ง `value` เป็น property ไม่ค้างใน attribute
- เครื่อง: เครื่องนี้ไม่มีปุ่มออกในรายการ (`!d.current` :205) · ฉายจอ "เครื่อง N" (shared.tsx:13, AccountSection.tsx:181, SettingsCards.tsx:116,133) · aria-label ช่องแก้ชื่อมี `d.name` แต่วาดเฉพาะ `!ro` (:186-189) · อีเมล "ซ่อนอยู่" ตอน ro (:36) · ออกเครื่องนี้ (P5) ยืนยันก่อน (:217-233)
- ประวัติ: HistorySection ซ่อนทั้งหมดตอนฉายจอ (HistorySection.tsx:21-23) · AuditHistory ชื่อ → "เลขที่ N" ตาม hide หน้าหลัก (AuditHistory.tsx:58,90) · การ์ดแก้ไขล่าสุดไม่มีชื่อเด็ก (SettingsCards.tsx:126-138)

## คำตอบข้อ 4 — ซ่อนชื่อ (ผ่าน ส่วนที่ตรวจ)
- คัดลอกทุกจุด (grep clipboard): RoundSummary.tsx:90 · Attendance.tsx:666 · Random.tsx:316 (peek สด) · Reports.tsx:174 · GradebookCards.tsx:131 disabled เมื่อ hide · home a/b/c copyDueToLine วาดเฉพาะ `!hide` (a/Timeline.tsx:65, b/Strip.tsx:35, c/index.tsx:73) และทีละห้อง (today.tsx:8-15 — AC-19 ✓) · home/cards.tsx:229 · StudentDrawer.tsx:160-162 · DevicesSection.tsx:77 (ไม่มีชื่อ)
- ข้อความครั้งเดียว: Attendance live ล้างเมื่อ hide เปลี่ยน (Attendance.tsx:145-147) · Scan toast/HID log → maskNames (scan/state.ts:668-677; ข้อความ undo ใช้ fullName ที่ :497 จึงจับได้) · feedback สแกนซ่อนตอนวาด (ScanParts.tsx:264) · Students toast ใช้ `whoLabel(st, hide)`/เลขที่ (Students.tsx:169,192,429,433) · Gradebook announce ใช้เลขที่ (Gradebook.tsx:342) · Excel toast เตือน "ไฟล์ Excel มีชื่อนักเรียน" (Reports.tsx:168, AC-166 ✓)
- title/aria: ReportParts.tsx:148-154 ใช้ nameOf(…, hide) · Gradebook.tsx:189 nameOf ตาม hide (title :1103,:1310 / aria :1315) · Attendance.tsx:654 · home/cards.tsx:170 สาขาซ่อนแสดงจำนวน · S-06 (ไม่รั่ว)

## คำตอบข้อ 5 — localPrefs (ผ่าน)
- ลบ: คีย์ localStorage ขึ้นต้น `ngankrob` ยกเว้น theme/skin/layout (localPrefs.ts:14,19-28) = font-size, density (display.ts:17-18) · hide-names(-page) (hideNames.ts:9) · pj-theme/size/hide-names (projector.ts:12-13,26) · random-tick (sound.ts:57) · students-sort (StudentParts.tsx:30) · att-class (Attendance.tsx:60) · `ngankrob.gb.columns` / `ngankrob.gb.groupMode.v2` (gbColumns.ts:5, gbGroups.ts:9) — ค่าตั้งทั้งหมด ไม่มีข้อมูลนักเรียน
- ไม่แตะ: outbox/ร่างเช็คชื่อ/แคชอยู่ IndexedDB · session = cookie · `gk_device_id`, `gk_device_name`, `gk_email` (device.ts:3,4,52) ไม่ขึ้นต้น ngankrob · `ngankrob-projector` อยู่ sessionStorage (projector.ts:35)
- ไม่มีข้อมูลนักเรียนใน localStorage ที่ควรลบแต่ไม่ถูกลบ · อีเมลครูดู S-07

## คำตอบข้อ 6 — Excel/นำเข้า (ผ่าน)
- ไฟล์ตัวอย่าง (importTemplate.ts:6-9,18-28) ค่าคงที่ชื่อสมมติ ไม่มีอินพุตผู้ใช้ · ไม่เรียก URL (Blob objectURL :33-38) · isHeaderLine (:12-15) แค่ regex ข้ามหัวตาราง
- ส่งออกรายงาน (src/lib/excel.ts ไม่เปลี่ยนใน job นี้) ใส่ค่า string ผ่าน `addRow` → exceljs เขียนเป็นเซลล์ข้อความ ไม่ใช่ formula → ชื่อขึ้นต้น = + - @ ไม่ถูกประเมิน (ต่างจาก CSV) · แอปไม่มีการส่งออก CSV
- นำเข้า (importParse.ts ไม่เปลี่ยน): exceljs อ่านในเบราว์เซอร์ ใช้ result/richText (:142) ไม่ eval ไม่อัปโหลดไฟล์ · จำกัด 200 คน · ขนาดไฟล์ S-08
- XSS: ไม่มี dangerouslySetInnerHTML/innerHTML/eval/window.open ใหม่ใน diff · ที่มีอยู่ GradebookNav.tsx:85 = SVG คงที่ · ลิงก์ใหม่ใช้ encodeURIComponent

## คำตอบข้อ 7 — ลิงก์ลึก (ผ่าน)
- `deepLinkOf` (app.tsx, ใหม่) รับเฉพาะหน้าที่อยู่ใน PAGES · `navigate` (router.ts:40-50) ตั้งได้แค่ `location.hash` → ไม่มี open redirect · เก็บแค่ path+query ของ hash ใน ref ไม่มีค่าอ่อนไหว · Settings ใช้ resolveSection (Settings.tsx:54-61) ค่าแปลกถอยค่าเริ่ม · ไม่ได้ไล่ทุกหน้าว่า ?student= ที่ไม่รู้จักถอยอย่างไร (ไม่ใช่ความเสี่ยงความปลอดภัย — preact escape)

## คำตอบข้อ 8 — สิทธิ์อุปกรณ์/dependency (ผ่าน)
- deviceCheck.ts:226 แค่ตรวจว่ามี `getUserMedia` ไม่เรียก → ไม่ขอสิทธิ์กล้อง/ไมค์ · npm audit 0 · dependency ใหม่ static

## คำตอบข้อ 9 — PDPA ส่งออกนอกแอป
| ช่องทาง | มีชื่อ? | คำเตือน/ซ่อนชื่อ |
|---|---|---|
| ดาวน์โหลดสำรอง (Settings) | ทั้งฐาน | BackupWarning ✓ (Settings.tsx:243) |
| สำรองก่อนล้าง | ทั้งฐาน | BackupWarning ✓ (ResetModal.tsx:129) |
| สำรองก่อนกู้คืน | ทั้งฐาน | **ไม่มี** (S-01) |
| Excel รายงาน | มีโดยตั้งใจ AC-166 | toast เตือนเมื่อซ่อนชื่อ (Reports.tsx:168) |
| คัดลอก LINE | มี | ปิดเมื่อซ่อนชื่อทุกจุด · ทีละห้อง (ข้อ 4) |
| พิมพ์ | — | ยังไม่ได้ตรวจ |

## ยังไม่ได้ตรวจ
- พิมพ์ (print CSS / พิมพ์บัตร QR) ว่าตามสวิตช์ซ่อนชื่อ · Projector ของหน้านักเรียน (StudentsProjector.tsx ใหม่) และ ScanSummary.tsx:33 (ใช้ pj nameOn) ไม่ได้ไล่ละเอียด
- ความยาว/ค่าทุกช่องของฟอร์มนักเรียน (พึ่ง zod เดิมฝั่งเซิร์ฟเวอร์) · ย้าย/ออกนักเรียน ใช้ API เดิม ไม่ได้ไล่ UI
- ไม่ได้ทดสอบบนเบราว์เซอร์ (อ่านโค้ดอย่างเดียวตามคำสั่ง)

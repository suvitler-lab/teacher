## T-56 (ตั้งค่า 5ก3 ส่วน 2 · บัญชีและอุปกรณ์ · สำรอง/กู้คืน · ประวัติ · โซนอันตราย "เริ่มใหม่")

ช่วงที่ตรวจ: `git diff HEAD` (f3875d5, ยังไม่ commit) เฉพาะ `src/components/settings/sections/{AccountSection,DangerSection,BackupSection,HistorySection,registry}.ts(x)`, `src/components/{RestoreModal,ResetModal,AuditHistory}.tsx`, `src/styles/settings.css` (ส่วน T-56 บรรทัด 163–), `src/pages/Settings.tsx` (import/render + ถอด onReset), `test/unit/hr-sg4-t56.test.tsx`, assertion ใน `hr-sg-settings-shell` / `settings-page.test.tsx` · อ่านประกอบ: `Dialog.tsx`, `ConfirmDialog.tsx`, `Shell.tsx` (doLogout), `lib/backup.ts`, `lib/api.ts`, `worker/routes/reset.ts` (อ่านอย่างเดียว), `SettingsCards.tsx` (HistoryCard) · รอบแก้ (Verify) 0/3

### สรุป: ผ่าน — ต้องแก้ 0 · ควรแก้ 3 · เสนอ 6

ไม่พบทางลัดไปยัง reset/restore · ระดับยืนยันทุกจุดตรง BR-59 · ไม่มี endpoint/สัญญาใหม่ · ไม่มีสีตายตัวใหม่ · tsc สะอาด · เทสต์ผ่านทั้งหมด

### ประเด็นหลักที่ PM ถาม — คำตัดสิน

1. **RestoreModal เปลี่ยนจากพิมพ์ "ยืนยัน" เป็นติ๊กยอมรับ — ไม่ใช่การลดระดับผิดสเปก (PASS)**
   - BR-59 แถว 2: "เริ่มภาคเรียนใหม่ · กู้คืน = SE-S13: ติ๊ก 'ตรวจแล้ว/ยอมรับ' ก่อนปุ่มแดง" · AC-243 "ปุ่มแดง disabled จนติ๊ก (SE-S13)" → โค้ด `RestoreModal.tsx:219-226` ทำตามนี้ตรงตัว
   - การพิมพ์วลี + รหัสผ่าน BR-59 กำหนดให้แค่ "ล้างข้อมูล/ล้างทั้งหมด" เท่านั้น · กู้คืนมีตัวกันเพิ่ม: สำรองข้อมูลปัจจุบันอัตโนมัติก่อน (`:161`) + เปลี่ยนแบบ atomic (`:173`) → ระดับนี้เป็นการตัดสินใจในสเปกที่อนุมัติแล้ว ไม่ใช่ dev ลดเอง
   - ค่าติ๊กถูกล้างเมื่อกลับไป stage pick (`:183`) · ปิดกล่อง = unmount (`Settings.tsx:244`) เปิดใหม่เริ่ม `accepted=false` · ปุ่มแดงไม่แสดงตอน running → กดซ้ำไม่ได้ · โฟกัส ยกเลิก หลังตรวจไฟล์ (`:76`)
2. **ResetModal 2 ขั้น (PASS)** — ขั้น 1: รายการ ลบ/เก็บ/หลังจากนั้น + ติ๊กสำรอง (ติ๊กไว้แล้ว) + `data-autofocus` ที่ ยกเลิก (`ResetModal.tsx:100`) · ขั้น 2: โฟกัสช่องรหัสผ่าน (`:53`) `autocomplete=current-password` · `ready` = รหัส + วลีตรง (trim) + ออนไลน์ + ไม่ฉายจอ (`:52`) · `go()` ตรวจ `ready` ซ้ำและมี `sending` ref กันส่งซ้ำ (`:56-57`) · ติ๊กสำรอง → BackupWarning ก่อน → `runBackup` ก่อน POST · สำรองล้ม = ไม่ส่ง reset (`:62`) · busy = Esc/คลิกพื้นหลัง/ปุ่ม X ปิดไม่ได้ (`:79-83`) · ไม่มี `<form>` → Enter ไม่ส่ง · ข้ามขั้นด้วย state ไม่ได้ (รหัสผ่านพิมพ์ได้เฉพาะขั้น 2 และเซิร์ฟเวอร์ตรวจรหัส+วลีซ้ำ `worker/routes/reset.ts:57` ตอบ 403 ไม่เด้ง relogin)
   - ข้อความ "ย้อนกลับไม่ได้…" มีทั้งสองขั้น (`:86`) + ไอคอน ไม่พึ่งสีแดงอย่างเดียว
3. **ไล่ call site ทั้งหมด (grep `/api/admin/reset` `/api/restore/execute` `ResetModal` `RestoreModal`)** — reset: ที่เดียว `ResetModal.tsx:64` ← เปิดได้ทางเดียว `DangerSection` → `setResetMode` (`Settings.tsx:197,242`) · restore execute: `RestoreModal.tsx:115,173` เท่านั้น ← เปิดจาก BackupSection และการ์ดภาพรวม (`Settings.tsx:185,195`) ทั้งคู่ผ่านกล่องเดียวกัน → **ไม่มีทางลัด (PASS)**
4. **ออฟไลน์/ฉายจอ** — DangerSection `off = offline || ro` (`DangerSection.tsx:12`) ✔ บทเรียน R-5405 ใช้แล้วในไฟล์นี้ · ResetModal/RestoreModal กันเองทั้งออฟไลน์และฉายจอ + บอกเหตุ ("ต้องออนไลน์"/"ปิดอยู่ตอนฉายจอ") · ฉายจอปิดเฉพาะปุ่มเขียน ตัวกรองประวัติ (`.chips-row`) ยังกดได้ ✔ ไม่ปิดเกิน · ส่วนที่ยังพึ่ง effect ของหน้า ดู R-5601
5. **👤** — AuditHistory ชื่อเด็กตามสวิตช์ซ่อนชื่อหน้าหลัก `เลขที่ N` (`AuditHistory.tsx:89`) ✔ · ฉายจอซ่อนประวัติทั้งหมด (`HistorySection.tsx:79-81`) ✔ · อีเมล "ซ่อนอยู่" ตอนฉายจอ (`AccountSection.tsx:36`) ค่าอยู่ใน state ไม่อยู่ใน DOM ✔ · ชื่อเครื่อง "เครื่อง N" ทั้งข้อความ, aria-label ปุ่ม, หัวกล่องยืนยัน (`:180,203,204,140`) · ช่องแก้ชื่อที่มี `d.name` ใน aria-label ไม่แสดงตอนฉายจอ (`:185`) ✔
   - **การ์ด "แก้ไขล่าสุด" (AC-244 ส่วนการ์ด): ไม่ใช่ข้อบกพร่อง** — `SettingsCards.tsx:125-136` ดึง `AuditLite` ที่ไม่มี `student_id` และแสดงแค่ ประเภท · การกระทำ · เครื่อง → ไม่มีชื่อเด็กให้ซ่อน AC ผ่านโดยปริยาย (ถ้าวันหน้าเพิ่มชื่อเข้าไปค่อยตามสวิตช์) · ข้อสังเกตเล็กใน T-55 ดู R-5609
6. **สำรอง** — ไม่มีปุ่มล้างข้อมูลใน BackupSection ✔ · ลิงก์ "ส่งออกรายงานที่ รายงาน ›" ✔ · ดาวน์โหลดทุกทางผ่าน BackupWarning (`Settings.tsx:185,195,243`) ✔ · ลิงก์เก่า: `?section=danger` → reset ✔ · `?section=reset` เปิดหมวดแดงตรง (ไม่ใช่ backup แบบ T-53) — ไม่พัง และไม่อันตรายเพราะปุ่มเปิดกล่อง 2 ขั้นเท่านั้น · grep ไม่พบลิงก์ในแอปที่ชี้ `section=reset`
7. **DevicesSection ซ้ำ** — ตอนตรวจ `DevicesSection.tsx` เหลือ `StorageRow/OfflineRow/DeviceCheck/AboutApp/ClearPrefs/DeviceSection` ไม่มี `EmailRow/ChangePassword/DeviceList/DevicesSection` แล้ว (T-55 ล้างไปแล้ว) · `DeviceSection` (ตัวเดี่ยว) ยังใช้ที่ `Settings.tsx:192` → ไม่มีโค้ดตายและไม่มีสองที่ทำงานซ้อน · dev-notes ข้อนี้ล้าสมัย
8. **เมนู 12 หมวด** — `registry.ts:13-26` มี 12 รายการ ตรงกับ `settings-page.test.tsx` (`toHaveLength(12)`) ✔ · หมวดแดงอยู่ท้ายสุด กลุ่ม "โซนอันตราย" ✔
9. **เทสต์ที่แก้ไม่ลดความเข้ม** — `settings-page`: assertion ปุ่มแดงใน backup เปลี่ยนเป็น "ต้องไม่มี" + เทสต์ใหม่ "หมวดแดงอยู่ท้ายและมีปุ่มทั้งสอง" · label รหัสเปลี่ยนจาก regex `/รหัสใหม่/` เป็นข้อความตรง 3 ช่อง (เข้มขึ้น) · `hr-sg-settings-shell` เพิ่ม key reset + alias danger → ไม่ลดความเข้ม
10. **สี/ไอคอน** — CSS ส่วน T-56 ใช้ token ทั้งหมด (`var(--border-danger)` ฯลฯ) · `hr-sweep-colors` และ `hr-theme-icons` ผ่าน (รอบนี้ผ่านทั้งไฟล์) · เป้าแตะ `min-height: var(--tap)` ปุ่ม/ช่อง/ติ๊ก/ลิงก์ ✔ · ไม่มี animation ใหม่ (spin เดิม)

### ควรแก้

**R-5601 · 🔐 ปุ่มเขียนใน BackupSection / AccountSection ไม่รวม `ro` ในเงื่อนไข disabled (บทเรียน R-5405 ใช้ไม่ครบ) · `BackupSection.tsx:25,32,39,48` · `AccountSection.tsx:103,112,204`**
- ปุ่มเหล่านี้ `disabled={offline …}` อย่างเดียว ที่ปิดตอนฉายจอได้เพราะ MutationObserver ของหน้า (`Settings.tsx:108-120`) ซึ่งฟังแค่ `childList` · เมื่อออฟไลน์→ออนไลน์ระหว่างฉายจอ Preact ตั้ง `disabled=false` คืน ที่ยังปิดได้เพราะ `<NeedOnline />` ถูกถอดพร้อมกันจึงกระตุ้น observer — **พึ่งโชคแบบเดียวกับ R-5405** · ถ้าใครเอา `NeedOnline` ออก ปุ่ม "ยกเลิกงานนี้/ปลดล็อก" (`:25` ยิง `/api/restore/cancel` ทันทีไม่ถาม), ออกจากระบบเครื่องอื่น, เปลี่ยนรหัส จะกดได้ตอนฉายจอ
- แก้: ใช้ `useReadOnly()` แล้ว `disabled={… || offline || ro}` ในทุกจุด (แบบ `DangerSection.tsx:12`) + เทสต์ฉายจอ: ปุ่มยัง disabled หลังสลับออฟไลน์→ออนไลน์

**R-5602 · ♿ กด "ย้อนกลับ" ในขั้น 2 ของ ResetModal แล้วโฟกัสหาย · `ResetModal.tsx:53,116`**
- ปุ่มย้อนกลับถูกถอดเมื่อ `step=1` → โฟกัสตก `body` (Dialog ฟัง `focusin` เท่านั้น การหลุดไป body ไม่กระตุ้น) · ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านจอไม่รู้ว่าอยู่ตรงไหน Tab ต่อออกนอกกล่องได้หนึ่งครั้ง
- แก้: effect ตอน `step===1` (ที่ไม่ใช่ตอนเปิดครั้งแรก) โฟกัสปุ่ม "ถัดไป" หรือ ยกเลิก + เทสต์ `document.activeElement`

**R-5603 · เทสต์ยังไม่จับบางจุดของการยืนยันอันตราย · `test/unit/hr-sg4-t56.test.tsx`**
- RestoreModal ฉายจอ: เทสต์มีแค่ออฟไลน์ (`:207`) — ถอด `|| projecting` จาก `RestoreModal.tsx:226` เทสต์ไม่ล้ม
- ResetModal ระหว่างทำ (busy): Esc/ปุ่ม X ปิดไม่ได้ ไม่มีเทสต์ (`:326` ตรวจแค่ตอนว่าง)
- สำรองล้ม → ไม่ส่ง `/api/admin/reset` ไม่มีเทสต์ (ข้อที่สำคัญที่สุดของ "สำรองก่อนลบ")
- Esc ในกล่องเตือนสำรองปิดเฉพาะกล่องเตือน ไม่ปิด ResetModal (ใช้ stack ของ Dialog — อ่านโค้ดแล้วถูก แต่ไม่มีเทสต์)
- แก้: เพิ่ม 4 เทสต์ข้างบน

### เสนอ

- **R-5604 · รหัสผิดแล้วกดใหม่ = ดาวน์โหลดไฟล์สำรองซ้ำทุกครั้ง · `ResetModal.tsx:61-64`** — runBackup สำเร็จแล้วแต่ POST ได้ 403 · กดอีกครั้งจะเตือน+ดาวน์โหลดอีกไฟล์ (ไฟล์ข้อมูลเด็กซ้ำในเครื่อง) · เสนอจำว่าสำรองสำเร็จแล้วในกล่องนี้ (ไม่สำรองซ้ำ หรือถามก่อน)
- **R-5605 · กล่องอันตรายใช้ `role=dialog` · `ResetModal.tsx:80`, `RestoreModal.tsx:191`, `RestoreModal.tsx:44`** — `Dialog` รองรับ `role="alertdialog"` แล้ว (`Dialog.tsx:11`) ux ไม่บังคับ แต่ควรใช้กับคำถามที่ต้องตอบ
- **R-5606 · BackupWarning ไม่ระบุโฟกัสเริ่ม · `RestoreModal.tsx:47,56`** — โฟกัสแรกตกปุ่ม X (ปลอดภัย) · เสนอ `data-autofocus` ที่ ยกเลิก ให้ตรงแบบ SE-S12
- **R-5607 · กู้คืนสำรองอัตโนมัติโดยไม่ผ่าน BackupWarning · `RestoreModal.tsx:161`** — เดิมก่อน T-56 (ไม่ใช่ diff นี้) · กล่องบอกแล้วว่าจะดาวน์โหลดสำรองอัตโนมัติ แต่ไม่ได้บอกเรื่องข้อมูลส่วนบุคคล/ไม่เข้ารหัสแบบ AC-242 "ทุกครั้ง" — ให้ Security/PM ตัดสินว่า AC-242 ครอบคลุมสำเนาอัตโนมัตินี้ไหม
- **R-5608 · stage pick ของ RestoreModal ยังเลือกไฟล์และยิง `/api/restore/validate` ได้ตอนฉายจอ/ออฟไลน์ · `RestoreModal.tsx:200`** — เข้าถึงได้เฉพาะถ้าเปิดฉายจอหลังเปิดกล่อง · validate สร้างงานกู้คืนค้าง (แถบเหลือง) แต่ไม่แตะข้อมูลจริง · เสนอ disabled ช่องไฟล์เมื่อ `offline || projecting`
- **R-5609 · (นอกขอบเขต — T-55) HistoryCard ตอนฉายจอเลข "เครื่อง N" ตามลำดับแถวประวัติ ไม่ใช่ตามเครื่อง · `SettingsCards.tsx:133`** — เครื่องเดียวกันขึ้นเป็น "เครื่อง 1", "เครื่อง 2" ในแถวต่างกัน และไม่ตรงกับเลขในการ์ดอุปกรณ์ · ไม่รั่วชื่อ แค่สับสน

### เช็กลิสต์ความปลอดภัย (🔐 👤)

| เรื่อง | สถานะ | หลักฐาน |
|---|---|---|
| สิทธิ์ reset/restore บังคับฝั่ง server | PASS | `worker/routes/reset.ts:57` ตรวจรหัส + วลี · UI ไม่ใช่ด่านเดียว |
| รหัสผ่านไม่ log / ไม่อยู่ใน URL / ไม่เก็บในเครื่อง | PASS | ส่งใน body `api.post` (`AccountSection.tsx:84`, `ResetModal.tsx:64`) · ไม่มี console · ไม่เข้า outbox · ล้าง 3 ช่องหลังสำเร็จ (`:85`) ยกเลิกล้าง (`:113`) unmount ล้าง |
| autocomplete / label / aria | PASS | current-password ×1 new-password ×2 · `label for` · `aria-invalid` + `aria-describedby` + `role=alert` ใต้ช่อง · โฟกัสช่องแรกที่ผิด |
| BR-58 รหัส | PASS | `checkPasswords` ≥ 6 และเท่ากับช่องยืนยัน · รหัสเดิมว่าง = ผิด |
| ยืนยันก่อนออกเครื่องอื่น/เครื่องนี้ (SE-S12) | PASS | `useConfirm` focus ยกเลิก (`ConfirmDialog.tsx:47`) · เครื่องนี้ไม่มีปุ่มออกในรายการ · ออกเครื่องนี้ถามทุกครั้งและบอกคิวรอส่ง (ข้อความเดียวกับ `Shell.tsx:46-62`) ไม่ทิ้งคิว (`logout()` เดิม) |
| ข้อมูลส่วนบุคคลในประวัติ/ฉายจอ | PASS | ดูข้อ 5 |
| secrets ในโค้ด | PASS | ไม่พบ |
| XSS | PASS | ไม่มี `dangerouslySetInnerHTML` ในไฟล์ที่ตรวจ |

### เช็กลิสต์ข้อมูล (🗑 🔄)

| เรื่อง | สถานะ | หลักฐาน |
|---|---|---|
| ลบได้เฉพาะหลังยืนยันครบ BR-59 | PASS | ข้อ 2–3 |
| สำรองก่อนลบ ล้มแล้วไม่ลบ | PASS (อ่านโค้ด) / ไม่มีเทสต์ | `ResetModal.tsx:61-62` · R-5603 |
| ส่งซ้ำ | PASS | `sending` ref (`ResetModal.tsx:49,56`) · password `sending` (`AccountSection.tsx:76`) · restore ปุ่มหายตอน running |
| กู้คืน atomic / ล้มไม่เปลี่ยนข้อมูล | PASS (เดิม ไม่เปลี่ยน) | `RestoreModal.tsx:170-183` |
| คิวรอส่งตอนออกจากระบบ | PASS | เก็บไว้ ส่งเมื่อเข้าใหม่ (logic เดิม) |

### หลักฐาน

- Q-5601 `npx vitest run test/unit/hr-sg test/unit/settings- test/unit/audit-dialog test/unit/sec-backup-warning test/unit/hr-sweep-colors test/unit/hr-theme-icons` → 12 ไฟล์ 174 ผ่าน (มี log jsdom "navigation not implemented" จาก `location.reload` ในเทสต์ reset — ไม่ใช่ความล้ม)
- Q-5602 `npx tsc --noEmit` → 0 error (ทั้งโปรเจกต์)
- ไม่ได้เปิดเบราว์เซอร์/ไม่ได้ถ่ายภาพ · ไม่ได้เรียก endpoint ใด ๆ

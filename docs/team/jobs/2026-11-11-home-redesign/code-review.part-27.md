# Code Review — T-77 (delta Verify, `git diff e1bd05e -- src test`)

สรุป: **ผ่าน** — ไม่มีข้อต้องแก้ (P1 = 0) · แนะนำ 3 ข้อ (P3)

## BR-13
ยืนยันด้วย git diff: ไม่แตะ makeOp / op payload / resolveScan / commitStudent / outbox / sound — ไฟล์ใน lib/ ไม่เปลี่ยนเลย; `scan/SessionSetup.tsx` เปลี่ยนแค่ `title=` บน `.ttl`. `outbox` ถูก import เพิ่มเฉพาะ `online` (อ่านอย่างเดียว)

## ที่ตรวจแล้วไม่พบบั๊ก
- StartTermModal / startTermOrExplain / TermCard home: guard `online || projectorOn` ครบทุกทางเข้า (Todo, runTodayGo, TermCard, ปุ่มในโมดัล). `useReadOnly`/`useOffline` เป็นแค่การอ่าน signal ไม่ใช่ hook จริง → `useOffline() || useReadOnly()` และ `shown && !useReadOnly()` ไม่ทำให้ลำดับ hook เพี้ยน
- RestoreModal: input file disabled + aria-label; BackupWarningText ใช้ซ้ำ ถูกต้อง. Settings.backup() มี `ro` guard (ro ประกาศ line 52)
- Attendance: `modeSegs` ใช้ตัวเดียวกัน render ที่ hero (จอใหญ่) หรือ `.att-modes` (มือถือ) — state/handler เดียวกัน ทำงานครบ; Segmented ยังมี label (aria)
- AttHero `.att-hleg` ถูกซ่อนบนมือถือ แต่เป็น aria-hidden อยู่แล้ว → ไม่เสีย a11y
- line-clamp: ใช้ CSS (DOM/SR ยังเห็นชื่อเต็ม) + title
- Gradebook: setMenuOpen(false) ก่อน guard ถูกต้อง; media query fit มี resize + ResizeObserver
- ชิป "ปัจจุบัน": ชื่อเต็มคงอยู่ใน title ของ select

## แนะนำ (P3)
- B-27a ui.tsx:~393 — บนจอ ≤720px option แสดง " ●" แทน "ปัจจุบัน"; `aria-label` บน `<option>` ไม่ถูกอ่านสม่ำเสมอใน SR/native picker (iOS) และบนสัมผัสไม่มี hover ให้เห็น title → ผู้ใช้อาจไม่รู้ว่า ● = ปัจจุบัน และ SR อาจอ่านว่า "black circle". ไม่แน่ใจเพราะไม่ได้ทดสอบกับ VoiceOver/TalkBack. ทางแก้: คง "(ปัจจุบัน)" ย่อ เช่น " ✓ปัจจุบัน" หรือใส่ตัวอักษร "•ป." ที่อ่านได้
- B-27b StudentsHero.tsx:51 — `aria-label="โหลดใหม่"` ทับข้อความ " · โหลดใหม่ได้เมื่อมีเน็ต" ตอน offline (disabled) → SR ไม่ได้ยินเหตุผล (title ไม่น่าเชื่อถือ). ทางแก้: aria-label ตามสถานะ online
- B-27c students.css `.stu-rl` ซ่อนแบบ position:absolute; ถ้าปุ่ม `.stu-reload` ไม่ใช่ position:relative จะอ้างอิง containing block อื่น — ไม่เป็นปัญหาการมองเห็น (clip) แต่ควรใส่ `position:relative` ให้ปุ่มกันเกิดแถบ scroll ตอนเลื่อน

## ไม่ได้ตรวจ
- Shell.tsx setSheet(false), homePrefs/pageCards toast, Reports icon: ไม่อยู่ใน diff เทียบ e1bd05e (น่าจะอยู่ใน checkpoint แล้ว) — ไม่ได้ตรวจ
- ไม่ได้ render จริง (iPad/phone layout, คอนทราสต์) และไม่ได้รันเทสต์ — ตรวจโดยอ่านโค้ด; ไฟล์ test ที่เพิ่มอ่านเฉพาะ gradebook-visibility

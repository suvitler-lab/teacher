# QA มืด+สว่าง บน iPad แนวตั้ง 820x1180 และมือถือ 375x812 (อ่านอย่างเดียว)

วิธี: fixture-server พอร์ต 5970, ล็อกอินข้อมูลทดสอบ, คำนวณ contrast ด้วย JS ทุก text node (รอ 1.8 วินาทีหลังสลับธีม/หน้าเพื่อกัน transition), วัด touch target, ellipsis, overflow ทางขวา, fixed/sticky

## 820x1180 — ผลรอบแรก (ก่อนไฟดับ)
- Contrast ข้อความ: มืด ทั้ง 8 หน้า = ไม่พบ <4.5:1 | สว่าง: พบ 1 จุด
  - B2-1 (ต่ำ) สว่าง `#/` `div.s` ในปุ่ม action "สแกนส่งงาน" ข้อความ "ใช้เครื่องอ่าน QR หรือกล้อง" = 3.88:1 (13.6px) น่าจะเป็นข้อความสีขาวโปร่งบนปุ่มสีฟ้า (.hm-action primary .s opacity) เดาไฟล์: src/styles ของหน้า home (hm-action)
- (ผลวัดช่วงแรกที่เห็น 1.0-2.3:1 จำนวนมากเป็น false positive จาก transition ตอนสลับธีม — ไม่นับ)
- Overflow แนวนอน: ไม่มีทั้ง 8 หน้า (scrollWidth ≤ 820)
- ป้ายชื่อถูกตัด (ellipsis):
  - B2-2 (กลาง) `#/gradebook` `td.name-col` ชื่อยาว "ด.ญ.กมลวรรณชนกพรนภสรอร ว…" และอีกหลายแถวถูกตัด (clip 42 รายการ) — ชื่อซ้ำที่ต่างกันท้ายคำแยกไม่ออก; ควรมี title/ขยายความกว้างคอลัมน์ชื่อ เดาไฟล์: gradebook css `.name-col`
  - `#/reports` `button.rp-namebtn` ชื่อยาวตัด, `span.lbl`/`span.what` ชื่องานยาวตัด (3 จุด) ; `#/students` `span.nm` ชื่อยาวตัด 1 จุด — ยอมรับได้ถ้ามี title / เปิดลิ้นชักดูชื่อเต็มได้
- Touch target < 44px (ชุดหลัก; เกณฑ์ที่ผู้ถือรอบก่อนใช้ 44):
  - ปุ่ม 40px สูงเกือบทั้งแอป (ghost/primary/lk/icon 40x40), pill ห้อง 32px, segmented ปุ่ม 30px (reports/settings), `button.hm-chip` 32px, `select` สลับปีการศึกษา 190x26 (ทุกหน้า), `select.rp-sel` 36, `button.gb-n` 23px สูง (gradebook), `button.hs-eye` 24x24, `button.rp-work` 39, `rp-sortbtn` 36, `rp-namebtn` 36, `stu-hbtn` 36, `stu-more` 40x40 (33 ปุ่ม)
  - สรุป: ต่ำสุดที่ควรแก้ = select ปีการศึกษา 26px, gb-n 23px, hs-eye 24px
- Fixed/sticky: `nav.rail` sticky ซ้าย (820 ยังเป็น rail ข้าง), `div.att-savebar` sticky bottom 1124-1180 (ชิดล่างพอดี), `div.sc-startbar` sticky ในหน้า scan, `nav.set-nav` sticky ในตั้งค่า — ไม่พบการทับกันในวิวพอร์ต 820

(ต่อด้านล่าง: เมนู/ลิ้นชัก/modal และ 375x812)

## 375x812 (มือถือ) — ผลรอบ 2 (หลังไฟดับ, fixture รีสตาร์ท)
Contrast ข้อความ 8 หน้า: มืด = ไม่พบ <4.5; สว่าง = พบเฉพาะ B2-1 (3.88:1 ที่ `#/` "ใช้เครื่องอ่าน QR…") เหมือน 820

- **B2-3 (สูง, ทำซ้ำได้) `#/settings` ที่ 375 หน้ากว้างเกิน (scrollWidth 727 > 375) และแถบแท็บล่างหาย** — `span.sr-only` ใน `button.pill` (ชิป set-nav-chips, `overflow:auto`) เป็น position:absolute แต่ทั้ง pill และ chips เป็น position:static → sr-only หลุดไปอยู่ x=725 ทำให้ layout viewport ขยายเป็น 727; `nav.bottom-tabs` (fixed) กว้าง 727 และอยู่ top 1494 (นอกจอ), elementFromPoint(187,800) ไม่ใช่แท็บ → ผู้ใช้มือถือหน้าตั้งค่าไม่มีแถบเมนูล่าง + หน้าซูมออก/เลื่อนข้างได้. แก้: `.set-nav-chips .pill{position:relative}` หรือ `.set-nav-chips{position:relative}`. ไฟล์: css ของ settings (.set-nav-chips / .pill / .sr-only), ที่ warndot "ควรสำรองข้อมูล"
- **B2-4 (กลาง, ทำซ้ำได้) `#/students` 375: `div.stu-tiles` (overflow-x:auto, scrollWidth 544 > 347) tile สุดท้าย "ส่งครบ/ส่ง…" ถูกตัดขอบขวา (tile 382..558)** — เป็น scroller แนวนอนโดยตั้งใจ แต่ไม่มีเงาบอกว่าเลื่อนได้; ถ้าไม่ตั้งใจ ให้ wrap. ไฟล์: students css `.stu-tiles/.stu-tile`
- **B2-5 (กลาง, ทำซ้ำได้) `#/scan` 375: `div.sc-startbar` (sticky bottom:56px, สูง 120, bottom=756) ซ้อนกับ `nav.bottom-tabs` (top 733, z 50)** — ปุ่ม "เริ่มสแกน ป.…" (704–748) ถูกทับ 15px และจุดกึ่งกลาง (y=726) ถูก `.tab-scan-btn` (วงกลมปุ่มสแกนกลางแท็บ ยื่นขึ้น) บัง → กดตรงกลางปุ่มได้ปุ่มสแกนของแท็บแทน (ผลคล้ายกันเพราะไปที่ scan เหมือนกัน แต่ไม่ใช่ปุ่ม "เริ่มสแกน"). เหตุ: offset 56px < ความสูง tabs 79px. แก้: bottom: calc(79px + env(safe-area-inset-bottom)) หรือใช้ตัวแปร --tabs-h. ไฟล์: scan css `.sc-startbar`
- **B2-6 (ต่ำ-กลาง, ทำซ้ำได้) `#/attendance` 375: `div.att-savebar` sticky bottom:58px สูง 56 → bottom 754 ทับกับแท็บล่าง (top 733) 21px** — ตอนสถานะ "บันทึกแล้ว" ไม่เสียหาย แต่ตอนมีปุ่ม "บันทึก" ควรตรวจว่าปุ่มไม่ถูกบัง (ชุดเดียวกับ B2-5)
- ชื่อถูกตัดบนมือถือ: `div.hm-ell` ชื่อนักเรียนใน home, `span.grow` (gradebook), `span.nm`/`div.stu-sub` (students), `span.lbl/.what` (reports) — ตัดเฉพาะชื่อยาวสุดใน fixture; ยอมรับได้ถ้ามี title/เปิดดูรายละเอียดได้ (ปุ่มทุกอันไม่ถูกตัด)
- Touch target 375: ปุ่มส่วนใหญ่ ≥40x36 (ไม่มีอันที่ <36 ในกลุ่มที่นับ ยกเว้นที่ระบุไว้ใน 820 เช่น select ปี 26px? — ตรวจซ้ำที่ 375 ไม่พบ <36 ใน 8 หน้า)

## เมนู/ลิ้นชัก/modal ที่ 375 (ตรวจสว่าง; มืดใช้ token เดียวกัน)
- ปรับหน้าหลัก (home): drawer เต็มจอ 0..812, เลื่อนได้ (941/812) ผ่าน
- ลิ้นชักนักเรียน: เต็มจอ ไม่ล้น (เนื้อหาสูงสุด 515 < 812) ผ่าน
- เมนู ⋮ นักเรียน (`.stu-rowmenu`) L160..R352 พอดีจอ ผ่าน
- เมนูโหมดฉายจอ (`.gb-menu.pjpre`, random) L12..R363, bottom 736 → ทับแท็บล่าง (top 733) 3px — ต่ำ
- toast-stack bottom 736 ทับแท็บ 3px — ต่ำ
- **ยังไม่ได้ทดสอบ**: modal แก้คะแนนช่อง (gradebook cell editor), modal สร้างงาน/นำเข้า, เมนู ⋮ ของงาน, แถบ failed-fab (เปิดไม่ได้ด้วยสคริปต์โดยไม่พบ selector ที่ถูกต้อง/ทรัพยากรหมด); 820 ก็ยังไม่ได้เปิดเมนูเหล่านี้

# Code Review: fs-1 ขนาดตัวอักษร/ความหนาแน่น

- ช่วงที่ตรวจ: `git diff main` (ยังไม่ commit) + ไฟล์ใหม่ `src/lib/display.ts`, `test/unit/display.test.ts`, `test/unit/no-fixed-font-size.test.ts`
- ผู้ตรวจ: Code Reviewer · รอบแก้ (Verify) 0/3
- ข้อจำกัด: ไม่ได้รัน `npm test`/browser ตามคำสั่ง PM (QA ใช้ fixture อยู่) — ตรวจจากการอ่านโค้ดเท่านั้น

## สรุป: ผ่านแบบมีเงื่อนไข — ต้องแก้ 2 ข้อ (ระดับกลาง), ควรแก้ 2 ข้อ, เสนอ 6 ข้อ

ไม่มีปัญหาความปลอดภัย/ข้อมูล (งานนี้ไม่แตะ server/DB) · ปัญหาหลักคือกฎ `!important` บนจอสัมผัสทำให้ความหนาแน่นไม่มีผลกับแถวจริง และมีกฎหน้าจอซ่อนอยู่ใน `print.css` ที่ test ยกเว้นไว้

## ต้องแก้

### R-01 · ความถูกต้อง (AC-03) · `src/styles/base.css:171`
กฎ `button:not(.hs-eye), select, input… { min-height: var(--tap) !important; }` ใน `@media (pointer: coarse)` ไปทับ `min-height: var(--row-h)` (ไม่มี !important) ของแถวที่เป็น `<button>` ทั้งหมด:
`.hm-follow` (home.css:37), `.rp-follow` (report.css:23), `.att-week > button` (attend.css:9), `.stu-lrow` (students.css:17)
- สถานการณ์: iPad, ขนาด 18, เลือก "โปร่ง" → คาดว่า `--row-h` = max(44, 18×3.9) = 70px แต่ min-height จริง = 44px; "ปกติ" ควร 57.6px ได้ 44px; ทั้ง 3 ระดับได้ความสูงเท่ากัน (ตามเนื้อหา ~41px → พื้น 44) → ตัวเลือกความหนาแน่นไม่มีผลบนจอสัมผัสเลย ยกเว้นการ์ดตัวอย่าง `.fs-trow` ซึ่งเป็น `<div>` จึงแสดงผลถูก (ตัวอย่างสดหลอกผู้ใช้)
- บนคอม (pointer: fine) ไม่เกิด เพราะไม่มีกฎนี้ — dev ตรวจ 390 แบบ touch แต่วัดเฉพาะ "ปุ่ม < 44" จึงไม่เห็น
- แนวทางแก้: ให้กฎพื้นใช้ `min-height: max(var(--tap), …)` ไม่ได้เพราะเป็นตัวเลือกเดียวกัน → ทางที่ง่ายที่สุดคือเพิ่ม `:not(.hm-follow):not(.rp-follow):not(.stu-lrow)` + `.att-week > button` หรือใส่ `!important` ให้ `min-height: var(--row-h)` ของ 4 แถวนี้ (`--row-h` บน touch มีพื้น 44 อยู่แล้วใน tokens.css:64) · เพิ่ม test/QA วัดความสูงแถวจริงที่ 3 ระดับบน touch

### R-02 · ความถูกต้อง (AC-02/AC-04) · `src/styles/print.css:3,7,8` (+ ข้อยกเว้นใน `test/unit/no-fixed-font-size.test.ts:11`)
`print.css` ไม่ได้มีแต่หน่วยพิมพ์ — บรรทัด 2–8 เป็นกฎ**หน้าจอ** (`.stu-tab` height 32px / font-size 13px, `.stu-row .no/.code` 13px) ใช้จริงที่ `src/components/CatalogEditor.tsx:25` (ตั้งค่า → รายการ) และหน้านักเรียน (`Students.tsx:4` import ไฟล์นี้)
- สถานการณ์: ตั้งขนาด 24 → แท็บใน CatalogEditor ยังเป็นตัว 13px (ไม่ขยายตาม "ทั้งแอป") · test AC-04 ผ่านเพราะยกเว้นทั้งไฟล์ด้วยเหตุผล "print units" ซึ่งไม่จริงสำหรับบรรทัดเหล่านี้ · QA วัด "ข้อความ < 13px" จะไม่จับ เพราะ 13 ไม่น้อยกว่า 13
- แนวทางแก้: ย้าย `.stu-tabs/.stu-tab/.stu-row` (บรรทัด 2–8) ไป `students.css` แล้วแปลงเป็น rem/var — ไม่ได้แตะหน่วยพิมพ์ (`.qr-card`, `@media print`) · **ต้องให้ PM ยืนยัน** เพราะ brief เขียน "ไม่แตะ print.css" · หรืออย่างน้อยเปลี่ยน EXEMPT ให้ยกเว้นเฉพาะ selector `.qr-card`/`@media print` แทนทั้งไฟล์

## ควรแก้

### R-03 · เลย์เอาต์ · `src/pages/Scan.tsx:928`
ช่องคะแนน `style="width:90px;height:3.47rem;font-size:1.47rem"` — ความกว้าง px คงที่แต่ตัวอักษรเป็น rem; padding ซ้าย-ขวา 12px (base.css) + border-box → พื้นที่ตัวเลข ~66px · ที่ขนาด 24 ตัวอักษร ≈ 35px ตัวเลข "10.5" กว้างราว 65–75px → ถูกตัด/เลื่อนในช่อง (ไม่แน่ใจ 100% เพราะขึ้นกับความกว้าง glyph ของ IBM Plex Sans Thai — ขอ QA ดูภาพหน้าจอ scorepad ที่ 24) · แก้: `width:6rem` หรือ `min-width:90px;width:5.5em`

### R-04 · การออกแบบ/AC-03 · `src/styles/base.css:24-40`, AC-03
AC-03 เขียน "ความสูงแถว/**ปุ่ม** = 2.6/3.2/3.9 × ขนาด" แต่ความหนาแน่นใช้กับ 4 แถวหลักเท่านั้น (dev-notes ระบุไว้) ปุ่มทั่วไปสูงคงที่ 2.53rem · ไม่ใช่บั๊กโค้ด แต่ต้องให้ PM/เจ้าของงานยืนยันว่ายอมรับการตีความนี้ ไม่งั้น QA จะ FAIL AC-03 ส่วน "ปุ่ม"

## เสนอ

1. `.lk` (ลิงก์ในบรรทัดข้อความ) เดิมยกเว้นพื้น 36px (base.css:166, ui.css:99) แต่กฎใหม่ base.css:171 ไม่ยกเว้น → บน touch ปุ่ม "ลองอีกครั้ง"/"สมุดคะแนน ›" สูง 44px กลางประโยค ทำให้บรรทัด/หัวการ์ดสูงขึ้น (`AuditHistory.tsx:63`, `StartTermModal.tsx:158`, `Onboarding.tsx:270`, `Students.tsx:148`, `Home.tsx:148,189,193`) — ดีต่อการกด แต่ให้ QA ดูภาพว่าไม่ดูแตก ถ้าตั้งใจให้ใส่ comment
2. ตัวหารไม่ตรงกัน: แปลง CSS/inline ส่วนใหญ่ใช้ /15 (38px→2.53rem) แต่ `Icon.tsx:20` ใช้ /16 และ `ui.tsx` Avatar ใช้ /15 → ที่ค่าเริ่มต้นคอม 16px ทุกอย่างใหญ่ขึ้น ~6.7% จากเดิม ยกเว้นไอคอน · ไม่พัง แต่ควรบันทึกไว้ใน dev-notes ว่าตั้งใจ
3. `no-fixed-font-size.test.ts:18` สแกนเฉพาะ `.css|.tsx` (ไม่รวม `.ts`) และ regex ไม่จับ shorthand `font: 12px/1.5 …` หรือ `fontSize: someNumberVar` · ตอนนี้ไม่มีกรณีดังกล่าวใน src (grep แล้ว) — ปิดช่องไว้กันอนาคต
4. `display.ts:21` `clampFont(NaN)` คืน 16 เสมอแม้บน touch — ไม่มีทางเรียกถึงจาก UI ตอนนี้ แต่ควรใช้ `defaultFont(isCoarse())` ให้สอดคล้อง · `rowHeightPx` (display.ts:41) ไม่ถูกใช้ในโค้ดจริง test ของมันจึงไม่ยืนยันพฤติกรรม CSS (ซึ่งเป็นที่มาของ R-01)
5. `Settings.tsx:102` `aria-label="ตัวอย่างสด"` บน `<div>` ไม่มี role → screen reader ไม่อ่าน (ใช้ `role="group"` หรือ `<section>`) · `Settings.tsx:94` `role="status"` + `aria-label` ที่เปลี่ยนตามค่า: บางโปรแกรมอ่านจะอ่านเฉพาะเนื้อหา "19" ไม่มีบริบท — พิจารณาใส่ข้อความซ่อน "ขนาดตัวอักษร" ในเนื้อหาแทน aria-label
6. `grade.css` `.ht { max-width: 84px }` และ `.gb-mrow .no { width: 22px }` px คู่กับตัวอักษร rem → หัวคอลัมน์ถูกตัดมากขึ้นที่ 24 (อยู่ในขอบเขต gb-1 — แจ้งไว้)

## สิ่งที่ตรวจแล้วไม่พบปัญหา

| เรื่อง | ผล |
|---|---|
| storage เสีย/ถูกบล็อก | `read/write` ห่อ try/catch (display.ts:50-55) · ค่า "abc", "13", "25", "18.5", "1e1" → ค่าเริ่มต้น (parseFont regex `^\d{1,3}$` + ช่วง) · density ค่าแปลก → normal · PASS |
| ไม่มี window/matchMedia | `isCoarse` เช็ก typeof + try/catch → false · ไม่มี SSR ในโปรเจกต์ · PASS |
| ค่าเริ่มต้น touch 18 / คอม 16 | `(pointer: coarse)` · ไม่บันทึกค่าเริ่มต้นลง storage → ถ้าเครื่องเปลี่ยนชนิด pointer ค่าเริ่มต้นตามเครื่อง · PASS |
| ไม่กะพริบ | `index.html` มีแค่ `#app` ว่าง · `applyStoredDisplay()` รันซิงก์ก่อน `render` (main.tsx:9) → ไม่มีเนื้อหาให้เห็นในขนาดผิด · PASS |
| ผลกับ theme | theme ใช้ `data-theme` attribute, display ใช้ inline style + `data-density` → ไม่ชนกัน · dark mode block ใน tokens.css ไม่ได้นิยาม `--fs-*`/`--row-*` ใหม่ จึงสืบทอดถูก · PASS |
| ตัวแปร `--fs-*` | `--fs-xs`, `--fs-sm`, `--row-k`, `--row-h` นิยามใน tokens.css · inline `--row-k` บน html ชนะ `:root` · `--fs` ถูกตั้งแต่ไม่มีใครใช้ (ไม่เสียหาย) · PASS |
| JS อ่านค่า px | grep `offsetHeight/getBoundingClientRect/clientHeight/canvas/rowHeight` ใน src → ไม่มี (ไม่มี virtual list) · กล้องสแกนใช้ % inset · PASS |
| media query px | media query px อ้างอิงความกว้าง viewport ไม่ใช่ html font-size จึงไม่เปลี่ยนความหมาย แต่เลย์เอาต์ที่ 720/860 อาจแน่นขึ้นที่ 24 → dev แก้ home.css แล้ว, ส่วนที่เหลือ QA วัดตาม AC-05 · NOT RUN (ฝั่งผู้ตรวจ) |
| Settings ไม่ยิง API | `DisplayRows` เรียกแค่ `setFontSize/resetFontSize/setDensity` (localStorage) ไม่แตะ `draft` → ไม่เปิด navGuard, ไม่เรียก `/api/settings` · ปุ่ม −/+ disabled ที่ขอบ · ปุ่ม 56px (`height:56px` ชนะพื้น 44 !important) · PASS |
| print | `print.css` ไม่ถูกแก้ · `@media print` ไม่มีกฎ html font-size → ส่วนที่พิมพ์จากหน้าจอปกติ (ไม่ใช่ QR) จะพิมพ์ตามขนาดที่ผู้ใช้ตั้ง (เช่น 24) — ยอมรับได้ แต่แจ้งไว้ · QR card ใช้ px คงเดิม · PASS |
| test regex | ตรวจกรณีจับ/ไม่จับครบ: `12px`, inline style, `fontSize: 14`, template `${n}px`, อนุญาตเฉพาะ `max(13px,` · `max(13px, 12px)` ยังถูกจับ · ช่องโหว่ดู เสนอ-3 และ R-02 |
| ความปลอดภัย/ข้อมูล | ไม่มี server/DB/secret/dependency ใหม่ · N/A ตามขอบเขต (ไม่ได้อยู่ในตาราง N/A ของ brief — บันทึกเป็นข้อสังเกต) |

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `git diff main --stat` | 34 ไฟล์ +357/−294 · อ่านครบทุกไฟล์ CSS/TSX หลัก (base, tokens, settings, scan, grade, home, ui, shell, Settings.tsx, Scan.tsx, Icon.tsx, ui.tsx, main.tsx) + ไฟล์ใหม่ 3 ไฟล์ |
| `grep min-height: var(--row-h)` | 5 จุด, 4 จุดเป็น `<button>` → ยืนยัน R-01 |
| `grep stu-tab` + อ่าน print.css 1–34 | กฎหน้าจอนอก `@media print` ใช้ใน CatalogEditor → ยืนยัน R-02 |
| `npm test` / browser | NOT RUN (คำสั่ง PM) — อ้าง dev-notes: 78 ไฟล์ / 922 PASS |
| `evidence.mjs add` | NOT RUN — คำสั่ง PM ไม่ได้ระบุ skill-dir |

## AC ที่กระทบ

- AC-03: R-01 (touch ไม่ทำงาน), R-04 (ขอบเขต "ปุ่ม")
- AC-02 / AC-04: R-02
- AC-05: R-03 (ข้อความถูกตัดที่ 24 ในช่องคะแนน), เสนอ-1

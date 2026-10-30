# Code Review: scan-1 (หน้าสแกน ชื่อ/แป้นคะแนนใหญ่)

- ช่วงที่ตรวจ: `git diff main -- src` (ยังไม่ commit) — `src/pages/Scan.tsx`, `src/styles/scan.css` · อ่าน brief.md, dev-notes/frontend.md
- ผู้ตรวจ: Code Reviewer (ไม่ได้เขียนส่วนนี้) · รอบแก้ (Verify) 0/3
- ข้อจำกัด: ไม่ได้รัน test/server/browser ตามคำสั่ง PM — ข้อ CSS ยืนยันจากการอ่านกฎและคำนวณ ไม่ใช่การวัดจริง
- สรุป: **ผ่านแบบมีเงื่อนไข** — ต้องแก้ 1 · ควรแก้ 3 · ข้อเสนอ 3

## ต้องแก้

### R-01 · ปุ่มแป้น/ลัด/บันทึกไม่ถึง 64px บนจอสัมผัสจริง (AC-02)
- `src/styles/scan.css:142,144` (`.sc-quick button`, `.scorepad button` ใช้ `height:auto; min-height: var(--key-h)`) ชนกับ `src/styles/base.css:171` ใน `@media (pointer: coarse)`: `button:not(.hs-eye) { min-height: var(--tap) !important; }`
- สถานการณ์: iPad จริง (pointer coarse) ขนาด 18 → `!important` ชนะ `min-height: var(--key-h)` → ปุ่มสูงตามเนื้อหา: ปุ่มเลข 1.67rem x line-height 1.6 ≈ 48px, ปุ่มลัด/บันทึก ≈ 44px → AC-02 (≥ 64) ไม่ผ่าน. dev-notes วัดได้ 65px น่าจะเพราะ browser จำลองเป็น pointer fine
- แนวทาง: ใช้ `height: var(--key-h)` (height ไม่ถูก !important ทับ เพราะ base บังคับแค่ min-height) หรือ `min-height: var(--key-h) !important` · ให้ QA วัดซ้ำโดยเปิด touch/pointer coarse (`matchMedia('(pointer: coarse)').matches === true`)

## ควรแก้

### R-02 · การ์ด "ยกเลิกการส่งแล้ว" ถูกซ่อนด้วย ขณะ ScorePad เปิด
- `src/pages/Scan.tsx:751` เงื่อนไขซ่อน `s.mode === "type" && pending.value && feedback.value.kind === "accent"` · แต่ `undo()` (`Scan.tsx:396`) ก็ใช้ `kind: "accent"`
- สถานการณ์: โหมดกรอกทีละคน สแกนเด็ก A (แป้นเปิด) → ครูกดยกเลิกเด็ก B ในรายการ "สแกนล่าสุด" (`:791`) หรือแตะช่องผังที่ส่งแล้ว (`:817`) → void ถูกส่งเข้า outbox แต่ไม่มีการ์ดแจ้งผลเลย (เดิมมี) · กรณีแตะช่องของเด็ก A เอง แป้นยังเปิดค้างสำหรับเด็กที่เพิ่งถูกยกเลิก (ของเดิม) แต่ตอนนี้ไม่มีข้อความเตือนด้วย
- ตรวจเงื่อนไขอื่นแล้ว: "ซ้ำ" (warning), "ปิดรับ/ไม่พบ/ยกเลิกบัตร/ไม่อยู่ในห้อง/server ปฏิเสธ" (danger), "เลขที่ซ้ำ" (warning) **ไม่ถูกซ่อน** — ข้อกังวล (5) ปลอดภัยยกเว้นกรณี undo นี้
- แนวทาง: ซ่อนเฉพาะการ์ด "รอคะแนน" ของเด็กที่แป้นเปิดอยู่ เช่น เพิ่ม field ใน Feedback (`awaitScore: studentId`) แล้วซ่อนเมื่อ `feedback.value.awaitScore === pending.value` หรือเปลี่ยน undo เป็น kind อื่น (ไม่แนะนำ — เปลี่ยนสีเดิม)

### R-03 ♿ · ผู้ใช้โปรแกรมอ่านหน้าจอไม่ได้ยินชื่อเด็ก และอาจไม่ได้ยิน "บันทึกคะแนนแล้ว"
- `src/pages/Scan.tsx:751` ซ่อนโดย **unmount** `<FeedbackCard role="status">` (`:882`)
- สถานการณ์: (ก) เดิมสแกนแล้ว live region ประกาศ "ชื่อ · เลขที่ · รับงานแล้ว ใส่คะแนน…" ตอนนี้การ์ดไม่ถูก render, focus ไปที่ input `aria-label="คะแนน"` → ได้ยินแค่ "คะแนน" ไม่รู้ว่าเป็นเด็กคนไหน (ชื่อบนหัวแป้นเป็น span ธรรมดา ไม่ผูกกับ input) (ข) หลังบันทึก การ์ด role=status ถูก mount ใหม่พร้อมข้อความทันที — live region ที่ถูกแทรกพร้อมเนื้อหามักไม่ถูกประกาศ (VoiceOver/NVDA ไม่สม่ำเสมอ) เดิมการ์ดค้างอยู่ใน DOM ตลอดจึงประกาศได้
- แนวทาง: ไม่ unmount — คง `FeedbackCard` ไว้แต่ซ่อนด้วยสายตา (class visually-hidden) ขณะแป้นเปิด หรือมี live region ถาวรแยก · และผูกชื่อกับ input: `aria-describedby` ชี้ id ของหัวแป้น (รวมกับ id ข้อความ error เมื่อมี)

### R-04 · `.sc-page button { min-width: 44px }` ทำให้ช่องผังเลขที่ทับกันเมื่อคอลัมน์แคบ (ไม่แน่ใจ 100% — คำนวณ ไม่ได้วัด)
- `src/styles/scan.css:117` ใช้กับ `.sc-cell` (เป็น `<button>`, `Scan.tsx:816`) ด้วย ขณะที่ `.sc-grid` เป็น `repeat(8, minmax(0,1fr))` (`scan.css:30`)
- สถานการณ์: 820 @18 (721–999 = 2 คอลัมน์ "recent grid"): main ≈ 820 − rail 81 − padding 48 = 691 → คอลัมน์ขวา ≈ 295 → ในการ์ด ≈ 263px / 8 ช่อง ≈ 28px ต่อช่อง แต่ปุ่มถูกบังคับกว้าง 44 → ล้นทับช่องข้าง (AC-05 "ไม่ทับกัน") · บน touch จริง base.css:175 บังคับ min-width อยู่แล้ว (ปัญหาเดิม) แต่ diff นี้ทำให้เกิดบน desktop ด้วย (เช่น 1000px @24 ช่องละ ~42px) และ brief ระบุ "กว้างเดิม"
- แนวทาง: `.sc-page button:not(.sc-cell)` + `.sc-page .sc-cell { min-width: 0 !important; }` (ต้อง !important เพื่อชนะ base coarse) · ให้ QA วัด `getBoundingClientRect().width` ของ `.sc-cell` เทียบระยะห่างช่อง ที่ 820 แนวตั้ง โหมดใดก็ได้

## ข้อเสนอเล็ก

- R-05 · `src/styles/scan.css:131` `.sc-pad-name { line-height: 1.3 }` — ชื่อไทยที่ตัดเป็น 2 บรรทัด (มีสระบน+วรรณยุกต์ซ้อน / สระล่าง ุ ู) อาจชนกันระหว่างบรรทัด (ไม่ตัดหัวเพราะไม่มี overflow hidden) แนะนำ 1.45–1.5 · ข้อมูล: body ใช้ 1.6
- R-06 · `src/pages/Scan.tsx:948` `aria-label="บันทึก"` ทับข้อความที่เห็น "บันทึก 7.5/10" — ชื่อขึ้นต้นตรงกับป้ายที่เห็นจึงพอรับได้ (WCAG 2.5.3) แต่ผู้ใช้ SR ไม่ได้ยินค่าที่จะบันทึก · ทางเลือก: เอา aria-label ออก แล้วให้ test ใช้ชื่อแบบ regex `/^บันทึก/` (ต้องแก้ test — อยู่นอกข้อจำกัด AC-03 จึงเป็นข้อเสนอ)
- R-07 · `src/styles/scan.css:52` ลบ `position: sticky` ของ `.ctxbar` ทุกขนาดจอ — ที่ ≥1000px ตอนนี้ไม่มีอะไร sticky เลย (ทั้งหัวรอบและช่องสแกน) ต่างจากเดิม; brief ข้อ 4 พูดถึงจอคอลัมน์เดียว — ยืนยันกับแบบว่าตั้งใจหรือไม่ (ช่องสแกนรับ HID ได้แม้มองไม่เห็น จึงไม่กระทบการบันทึก)

## ตรวจแล้วไม่พบปัญหา

| หัวข้อ | ผล |
|---|---|
| พฤติกรรมบันทึกคะแนน: `validate`, `commitVal`, `submitTypedScore`, `makeOp` (method "manual", intent "receive"), `enqueueRevertible`/outbox | ไม่เปลี่ยน — diff แตะเฉพาะ JSX/CSS ของ ScorePad · ปุ่มลัด `commitVal(String(n))` เดิม · `.5` / `0` / ลบ / ล้าง (setVal("") ใน effect) เดิม · "ให้คะแนนทีหลัง" `pending.value = null` เดิม · `quick` list เดิม |
| focus order ใน ScorePad | ให้คะแนนทีหลัง → input (โฟกัสอัตโนมัติ) → ลัด → แป้น → บันทึก — สมเหตุผล ไม่มี tabindex บวก |
| sticky/z-index ช่องสแกน | sticky เดียวที่ ≤999px, z 20 ต่ำกว่า bottom nav (50), toast (300), sheet (160); พื้น `--surface-0` มีทั้ง light/dark (tokens.css:7,68,95) · ไม่ซ้อนกับ ctxbar แล้ว |
| breakpoint | ≤720 1 คอลัมน์, 721–999 กลางเต็ม + recent/grid 2 คอลัมน์, ≥1000 ซ้าย/ขวา · `.sc-mid:empty` ไม่มี node คอมเมนต์ JSX จึง :empty ทำงาน |
| หน่วย fs-1 | ตัวอักษรทั้งหมดเป็น rem (html font-size = ค่าที่ตั้ง, display.ts:61) ค่าแปลงจากฐาน 18 ตรงตาม AC · ที่ 14: ชื่อ 26.6px, เลขที่ 17px, ตัวเลขคะแนน 40.6px — ไม่เล็กเกินสำหรับหน้าใหญ่ · ไม่มี px ตายตัวสำหรับตัวอักษรใหม่ (ไอคอน size 28 เป็น px — ไม่ใช่ตัวอักษร) |
| `.sc-page button` min-height 44 กับ ปุ่ม 64 | บน pointer fine: `.scorepad button` อยู่ทีหลัง specificity เท่ากัน → 64 ชนะ ถูกต้อง · บน coarse ดู R-01 |
| ช่องผัง | สูง `var(--tap)` = 44px, สี/คลาสเดิม · ความกว้างดู R-04 |
| ข้อมูลเด็กจริง | ไม่พบชื่อ/รหัสจริงใน diff และ dev-notes |
| ความปลอดภัย (XSS ฯลฯ) | ชื่อแสดงผ่าน JSX (escape) ไม่มี innerHTML · ไม่มี dependency ใหม่ · ไม่แตะ worker/shared/schema |

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `git diff main --stat -- src` | 2 ไฟล์ (Scan.tsx, scan.css) |
| `git diff main -- src` + อ่าน Scan.tsx:255-445, 875-955 | PASS (ตรรกะบันทึกไม่เปลี่ยน) |
| grep `min-height\|--tap` ใน src/styles | พบ base.css:171 `!important` → R-01 |
| test / browser | NOT RUN (PM ห้าม — QA ใช้ browser) |

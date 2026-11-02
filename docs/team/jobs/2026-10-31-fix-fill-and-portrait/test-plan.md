# Test plan: ตารางเต็มจอเมื่องานน้อย + หน้าสแกนแนวตั้งเห็นชื่อเต็ม (fix-fill-and-portrait)

โดย QA (team-qa-tester) · 2026-11-02 · เขียนในเฟส 3 จาก `brief.md`, `requirements.md` (AC-01..12), `design/reference/reference.md` — **ไม่ได้อ่าน CSS/โค้ดที่แก้ของงานนี้** (ดูเฉพาะ `scripts/shots.cjs`, `scripts/fixture-server.cjs`, `scripts/seed-demo.sql` และชื่อปุ่ม/selector ที่จำเป็นต่อการเข้าหน้า) · ธง 🖥 ♿

## ขอบเขต

- ทดสอบ: AC-01..AC-12 · ตาม `checklists/visual.md` (🖥) และ `checklists/accessibility.md` (♿)
- ไม่ทดสอบ: สูตรคะแนน/worker/schema (นอกขอบเขต — ตรวจทางอ้อมด้วย AC-10 เท่านั้น) · หน้าอื่นนอกสมุดคะแนน/หน้าสแกน · motion (Gate 0 "ไม่ต้อง") · โหมดฉายจอ · iPad/Safari จริง = **NOT RUN** จนเจ้าของงานยืนยันจากภาพ (Gate 2)

## สภาพแวดล้อม

- โหมด: local · `scripts/fixture-server.cjs` (in-memory D1, ข้อมูลสมมติ, login ด้วยค่าทดสอบของ fixture) · ห้ามข้อมูลจริง · ภาพไม่เข้า repo
- อุปกรณ์ (brief Gate 0): iPad ตั้ง 820×1180 (DPR 2, สัมผัส, ฟอนต์ 18) · iPad นอน 1180×820 (DPR 2, สัมผัส, 18) · คอม 1536×729 (16) · มือถือ 390×844 (DPR 3, สัมผัส, 18)
  - **หมายเหตุ:** `docs/team/context.md` ยังไม่มี `## อุปกรณ์เป้าหมาย` → `shots.mjs` จะใช้ค่ามาตรฐาน คอม 1536×**864** DPR 1 ซึ่งไม่ตรง brief (1536×729) — ดู "ข้อสงสัย" ข้อ 1
- ฟอนต์: ค่าเริ่มต้นของแอปตาม pointer (coarse → 18, ไม่ใช่ → 16) · ขนาด 14/24 ตั้งผ่าน `localStorage['ngankrob-font-size']` ก่อนโหลดหน้า
- before = build จาก `main` @ `01d5486` + fixture ชุดเดียวกัน · after = build ของ branch นี้ (ต้องมีทั้งสองชุดสำหรับ AC-02/05/07/10 "เท่า main / ไม่แย่ลง")
- เครื่องมือ: `shots.mjs` (`pages.json` ของงานนี้) สำหรับภาพ · `mcp__Claude_Browser__resize_window` + `javascript_tool` สำหรับการวัด DOM (สคริปต์วัดในภาคผนวก ก) · `scripts/shots.cjs` สำหรับ AC-11
- หมายเหตุเครื่องมือ: `shots.mjs` เปิดเบราว์เซอร์ด้วย `--hide-scrollbars` → ภาพ**ไม่แสดง**แถบเลื่อน การมี/ไม่มีแถบเลื่อนต้องตัดสินจากการวัด DOM (`frameScrollX`, `pageScrollsX`) ไม่ใช่จากภาพ

### ข้อมูลทดสอบ (fixture — ต้องเพิ่ม ดูภาคผนวก ข)

ทุกหน้าอยู่ใน fixture server ตัวเดียว (เพราะ `pages.json` มี `base` เดียว) · ห้อง ป.6/1 (`cls_61`) 44 คน

| ชุด | วิชา (ข้อเสนอ id) | งาน | ใช้กับ |
|---|---|---|---|
| G1 | ศิลปะ `sub_art` (ใหม่) | 1 งาน | Gate 1 ข้อ 1, TC-03 |
| G2 | วิทยาศาสตร์ `sub_sci` (ตัดเหลือ `asg_ex3` แบบฝึกหัด + `asg_ws4` ใบงาน → 2 ประเภท) | 2 งาน, `asg_ws4` ชื่อยาว 40 ตัว | AC-01, AC-09 |
| G6 | อังกฤษ `sub_eng` (ใหม่) | 6 งาน (≥2 ประเภท) | AC-03 |
| G14 | คณิตศาสตร์ `sub_math` (gradebook14 เดิม) | 14 งาน 4 ประเภท, `asg_gb_12` ชื่อยาว 40 ตัว | AC-02, AC-09, หน้าสแกน |
| ชื่อ | เลขที่ 2–5 (แถวแรกของผัง) | เลขที่ 2 `นวพล` (4) · 3 `กมลชนก` (6) · 4 `กมลวรรณชนกพร` (12) + ชื่อ-สกุล 40 ตัว · 5 `ข้าวหอม🌾` (ไทย+อีโมจิ, 7 grapheme) | AC-04, AC-09 |
| สแกน | งาน "ใบงาน 6 สมการ" (`asg_gb_13`) | มีครบ: ส่งมีคะแนน / ส่งสาย / ส่งยังไม่มีคะแนน / ลา (excused) / ไม่ส่ง · เลขที่ 1 และ 2 ยังไม่ส่ง | AC-04, AC-06 |

"ตัวอักษร" ในแผนนี้ = grapheme cluster (`Intl.Segmenter('th')`) — สระ/วรรณยุกต์ที่ซ้อนไม่นับแยก (ข้อสงสัย ข้อ 4)

## ผลที่คาด — คำนวณจากกติกาก่อนดูโค้ด

### สมุดคะแนน (AC-01/02/03)

ตัวแปรที่วัดตอนทดสอบ: `F` = ความกว้างภายในกรอบ (`.gb-scroll` clientWidth) · `N` = คอลัมน์ชื่อ · `S` = คอลัมน์สะสม · `X` = คอลัมน์คงที่อื่น (เลขที่ ถ้าแยก, รวมกลุ่มที่ไม่ยืด) · `m` = ความกว้างต่ำสุดของคอลัมน์งาน = **ความกว้างคอลัมน์งานของ main ในสมุด 14 งาน ที่ขนาด/ฟอนต์เดียวกัน** (วัดจาก before) · `k` = จำนวนคอลัมน์ที่ยืดได้

กติกา (requirements §กฎธุรกิจ + AC-01..03):

1. ถ้า `N + S + X + k·m ≤ F` → **ยืด**: ทุกคอลัมน์งาน = `(F − N − S − X) / k` (±1px) · ช่องว่างขวา `gapRight = F − tableRight ≤ 2px` · `frame.scrollWidth ≤ clientWidth` (ไม่มีเลื่อนในกรอบ)
2. ถ้า `> F` → **เลื่อน**: คอลัมน์งาน = `m` (±1px, เท่า main) · กรอบเลื่อนแนวนอนได้ · `gapRight` ที่ปลายเลื่อน = 0 (±1)
3. ทุกกรณี: ทั้งหน้าไม่เลื่อนแนวนอน (`scrollWidth ≤ innerWidth`) · `N ≤ 18rem` (= 324px ที่ฟอนต์ 18, 288px ที่ 16, 252px ที่ 14, 432px ที่ 24) · **ห้าม** ทั้ง `gapRight > 2` และ `frameScrollX = true` พร้อมกัน (AC-03)
4. 14 งานต้องเลื่อนเสมอทุกอุปกรณ์ เมื่อ `14·m > 1536` คือ `m > 109.7px` — ถ้า main วัดได้ `m ≤ 109.7` ที่คอม ให้ตีความด้วยกติกาข้อ 1/2 แทน (บันทึกค่า)

ตัวอย่างคำนวณ (ค่าใน requirements เพื่อแสดงวิธี — ค่าจริงใช้ค่าที่วัดได้): `F = 707, N = 200, S = 80, m = 88`

| กรณี | `N+S+k·m` | ยืด/เลื่อน | คอลัมน์งานที่คาด |
|---|---|---|---|
| 1 งาน | 200+80+88 = 368 ≤ 707 | ยืด | 707−280 = **427px** |
| 2 งาน | 200+80+176 = 456 ≤ 707 | ยืด | (707−280)/2 = **213.5px** แต่ละคอลัมน์ ต่างกัน ≤1px |
| 6 งาน | 200+80+528 = 808 > 707 | เลื่อน | **88px** (= m) เลื่อนในกรอบ |
| 14 งาน | 200+80+1232 = 1512 > 707 | เลื่อน | **88px** |

ตัวอย่างเชิงตัวเลขต่ออุปกรณ์ (ประมาณการ ถ้ากรอบ = viewport − ระยะขอบ 2rem และ `m ≈ 7.6rem`; ใช้คาดการณ์ทิศทางเท่านั้น):
- 820 ฟอนต์ 18: `F ≈ 820−36 = 784`, `m ≈ 137` → 2 งาน ยืด แต่ละ ≈ (784−N−S)/2 · 6 งาน: `6·137 = 822 > 784` → เลื่อนแน่นอน
- 820 ฟอนต์ 14: `m ≈ 106`, `F ≈ 792` → 6 งาน `636 + N + S` อาจ ≤ F → ยืด (กรณีขอบของ AC-03: ตรวจว่าเลือกถูกฝั่งตามค่าวัดจริง)
- 1536 ฟอนต์ 16, 1 งาน: คอลัมน์งาน ≈ `F − N − S` (~1000px ตาม requirements ข้อถาม 1 — เจ้าของงานยอม "ยืดเต็มเสมอ")

โหมดจัดกลุ่มตามประเภท (2 งาน = 2 กลุ่ม กลุ่มละ 1 งาน): ผ่านเมื่อ `gapRight ≤ 2` และคอลัมน์งาน 2 คอลัมน์ต่างกัน ≤1px · บันทึกความกว้างคอลัมน์ "รวมกลุ่ม" ด้วย (ไม่ตัดสินว่ายืดหรือไม่ — ข้อสงสัย ข้อ 3)

### หน้าสแกน (AC-04)

ตัวแปร: `W` = ความกว้างผัง (container ของ `.sc-cell`) · `C` = ความกว้างเนื้อหาของหน้า (เช่นแถวช่องสแกน `.scan-input-row` ขยายเต็ม) · `g` = ระยะห่างช่อง · คอลัมน์ = 8 (มือถือ 6)

- ผังเต็มกว้าง: `|W − C| ≤ 2px` และไม่มีการ์ดอื่นซ้อนแนวนอนกับผัง (ทุกการ์ดอยู่บน/ล่างผังทั้งก้อน)
- ความกว้างช่อง `c = (W − 7g) / 8` · ประมาณการที่ 820 ฟอนต์ 18: `W ≈ 784`, `g ≈ 6` → `c ≈ 92.8px` (ก่อนแก้ ผังครึ่งขวา `W ≈ 390` → `c ≈ 43px` เห็น 1–2 ตัว ตรงรูป 2)
- ชื่อ (ฟอนต์ชื่อ ~0.8rem ≈ 14.4px, ตัวไทยเฉลี่ย ~0.6em ≈ 8.6px): `นวพล` ≈ 35px → **เห็นครบ 4/4** · `กมลชนก` ≈ 52px → ครบหรืออย่างน้อย **≥4 + …** · `กมลวรรณชนกพร` → ตัดด้วย … เห็น ≥4
- ที่ฟอนต์ 24 (ชื่อ ~19px, ตัว ~11.5px, `c ≈ 89`): เกณฑ์ **≥2 ตัว** (Gate 1 ข้อ 3) · ฟอนต์ 14–18: **≥4 ตัว**
- ลำดับบนลงล่าง (Gate 1 ข้อ 2): ช่องสแกน → แป้นคะแนน → ผัง (+สถิติ) → สแกนล่าสุด — ตรวจด้วย `top` ของแต่ละกล่องเรียงเพิ่มขึ้น
- จุดเปลี่ยน: `< 1000px` (ไม่ใช่มือถือ) = คอลัมน์เดียว · `≥ 1000px` = 2 คอลัมน์เหมือน main (±2px)

## Test cases

วิธี: **M** = วัด DOM ในเบราว์เซอร์ (ภาคผนวก ก) · **V** = ภาพ `shots.mjs` + เปิดดูจริง + visual-check.json · **I** = กดใช้งานจริงในเบราว์เซอร์ · **A** = คำสั่ง/สคริปต์อัตโนมัติ

| TC | AC | ขั้นตอน | ข้อมูล | ผลที่คาด | วิธี |
|---|---|---|---|---|---|
| TC-01 | AC-01 | เปิดสมุด G2 ไม่จัดกลุ่ม ที่ 820×1180, 1180×820, 1536×729 → `measure.gb()` | G2 | กติกาข้อ 1: `gapRight ≤ 2` · คอลัมน์งาน 2 อันต่างกัน ≤1px และ = `(F−N−S−X)/2` ±1 · `frameScrollX=false` · `pageScrollX=false` · `N ≤ 18rem` | M+V |
| TC-02 | AC-01 | เหมือน TC-01 แต่กด "ตามประเภท" ในกลุ่ม "จัดกลุ่มคอลัมน์" | G2 | `gapRight ≤ 2` · งาน 2 คอลัมน์ต่างกัน ≤1px · ไม่มีเลื่อนในกรอบ · บันทึกความกว้าง "รวม" ของแต่ละกลุ่ม | M+V |
| TC-03 | AC-01 (Gate 1 ข้อ 1) | เปิดสมุด G1 ทั้ง 4 อุปกรณ์ | G1 | คอลัมน์งานเดียว = `F−N−S−X` ±1 (คอม ≈ 1000px) · `gapRight ≤ 2` · หัวคอลัมน์งานไม่แตก/ไม่ล้น | M+V |
| TC-04 | AC-02 | เปิดสมุด G14 ที่ 820, 1180, 1536 ทั้ง before/after → `measure.gb()` | G14 | คอลัมน์งาน after = before ±1px ทุกคอลัมน์ · `frameScrollX=true` · `pageScrollX=false` · หัวตารางค้างบนเมื่อเลื่อนแนวตั้ง | M+V |
| TC-05 | AC-02 | ใน G14 ตั้ง `frame.scrollLeft` = 0, กลาง, สุด แล้ววัด `left` ของคอลัมน์ชื่อ และ `right` ของคอลัมน์สะสม | G14 | ชื่อ `left` คงที่ (±1) ทั้ง 3 ตำแหน่ง · สะสม `right` = ขอบขวากรอบ ±1 ทั้ง 3 ตำแหน่ง · ที่ปลายสุด `gapRight` = 0 ±1 | M+V |
| TC-06 | AC-02 | กดใช้: แถบย่อ (กระโดดไปคอลัมน์), ปุ่มกระโดด, เมนู "คอลัมน์", พับ/กางกลุ่ม (โหมดตามประเภท), แตะ "รวม" ของกลุ่มที่พับ → กางแล้วแก้คะแนน 1 ช่อง แล้วยกเลิก/คืนค่า | G14 | ทำงานเหมือน main ทุกปุ่ม (ทำ before ก่อนเป็นตัวอ้างอิง) · กลุ่มพับแล้วคอลัมน์ "รวม" ไม่ทำให้เกิดที่ว่างขวา | I |
| TC-07 | AC-03 | สมุด G6 ที่ 820 ฟอนต์ 18 → `measure.gb()` คำนวณ `N+S+X+6m` เทียบ `F` | G6 | ตรงกติกาข้อ 1 หรือ 2 ตามค่าที่วัดได้ (ประมาณการ: เลื่อน) · ห้าม `gapRight > 2` พร้อม `frameScrollX=true` | M+V |
| TC-08 | AC-03 | G6 ที่ 820 ฟอนต์ 14 และ 24, และ G6 ที่ 1180/1536 | G6 | แต่ละกรณีอยู่ฝั่งที่สูตรทำนาย · invariant ข้อ 3 จริงทุกกรณี | M+V |
| TC-09 | AC-01..03 | เปิด G2/G6/G14 ที่ 820×1180 แล้ว `resize_window` เป็น 1180×820 **โดยไม่ reload** (จำลองหมุน iPad) แล้วกลับ | G2, G6, G14 | หลังหมุนแต่ละครั้ง วัดใหม่แล้วผ่านกติกาเดิม · ไม่ค้างความกว้างเก่า | M |
| TC-10 | AC-04 | หน้าสแกน 820×1180: เริ่มรอบ "ใบงาน 6 สมการ" โหมด "กรอกทีละคน" สแกนเลขที่ 1 → `measure.scan()` | สแกน | `|W−C| ≤ 2` · คอลัมน์ต่อแถว = 8 · ไม่มีการ์ดวางข้างผัง · ลำดับ `top`: ช่องสแกน < แป้นคะแนน < ผัง < สแกนล่าสุด · `pageScrollX=false` | M+V |
| TC-11 | AC-04 | ใน TC-10 วัดชื่อที่มองเห็นของเลขที่ 2, 3, 4, 5 | ชื่อ | `นวพล` 4/4 ไม่มี … · `กมลชนก` ≥4 (ถ้าตัดต้องมี …) · `กมลวรรณชนกพร` ≥4 + … · `ข้าวหอม🌾` ≥4 · ไม่มีช่องใดเหลือ 1 ตัว | M+V |
| TC-12 | AC-04, AC-08 | ทำ TC-10/11 ที่ฟอนต์ 14 และ 24 (820×1180) | สแกน, ชื่อ | ฟอนต์ 14: ≥4 ตัว · ฟอนต์ 24: ≥2 ตัว (Gate 1 ข้อ 3) · ยัง 8 คอลัมน์ · ไม่เลื่อนแนวนอนทั้งหน้า | M+V |
| TC-13 | AC-04 | ความกว้างขอบ: 999×1180, 768×1024, 700×1000 (และ 1000×800 เป็นฝั่งนอน) | สแกน | <1000: คอลัมน์เดียว ผังเต็มกว้าง 8 คอลัมน์ · 1000: 2 คอลัมน์เหมือน main · ไม่มีช่วงที่เลื่อนแนวนอนทั้งหน้า | M |
| TC-14 | AC-05 | หน้าสแกน 1180×820 และ 1536×729 ทั้ง before/after → `measure.scan()` | สแกน | 2 คอลัมน์ (ซ้าย: ช่องสแกน+แป้นคะแนน+สแกนล่าสุด, ขวา: ผัง) · `rect` ของ ช่องสแกน/แป้น/สแกนล่าสุด/ผัง ต่างจาก main ≤ 2px ทุกค่า (x, y, w, h) · ภาพ diff ใกล้ 0% | M+V |
| TC-15 | AC-06 | หน้าสแกนทุกขนาด: ตรวจสถานะช่องของ "ใบงาน 6 สมการ" | สแกน | มีครบ: เขียว (ส่งแล้ว), ฟ้า (รอคะแนน), เหลือง (สาย), ขอบประแดง (ไม่ส่ง) + ติ๊ก/ขีดเหมือน main · `innerText` ไม่มี "รอคะแนน (" (คิว) · มีช่องสแกน `[aria-label="รหัสนักเรียน"]`, การ์ดสแกนล่าสุด, แป้นคะแนน (`.sc-pad`), ปุ่ม `[aria-label="สแกนด้วยกล้อง"]` | M+V |
| TC-16 | AC-06 | โหมด "รับงานก่อน": เริ่มรอบใหม่ สแกนเลขที่ 2 ที่ 820 และ 1180 | สแกน | ช่องเลขที่ 2 เป็นฟ้า (รอคะแนน) · ไม่มีแป้นคะแนน · ผังเต็มกว้างที่ 820 · ไม่มีคิว "รอคะแนน (n)" | M+V |
| TC-17 | AC-07 | 390×844: สมุด G2, G14 และหน้าสแกน (กรอกทีละคน) before/after | G2, G14, สแกน | `pageScrollX=false` · ผัง 6 คอลัมน์ คอลัมน์เดียว · ไม่มีข้อความทับ · ไม่แย่กว่า before | M+V |
| TC-18 | AC-08 | ทุกหน้า×อุปกรณ์ใน `pages.json` + ฟอนต์ 14/24 ที่ 820 → `measure.a11y()` | ทั้งหมด | ข้อความ `< 13px` = 0 | M |
| TC-19 | AC-08 | เหมือน TC-18 บนอุปกรณ์สัมผัส (820, 1180, 390) | ทั้งหมด | ปุ่ม/ลิงก์/ช่องกรอก/`[role=button]` ที่มองเห็นและด้านใดด้านหนึ่ง `< 44px` = 0 (ยกเว้น `.sc-cell` ตามหมายเหตุ fs-1 AC-05 — นับแยกและบันทึกขนาด) | M |
| TC-20 | AC-08 | เหมือน TC-18: ตรวจการทับกัน | ทั้งหมด | element โต้ตอบได้ที่ไม่ซ้อนกันเชิงโครงสร้าง ทับกัน > 1px = 0 · ภาพ: ไม่มีข้อความทับ | M+V |
| TC-21 | AC-09 | สมุด G2 และ G14 ที่ 820 และ 1180 | ชื่อยาว | ชื่อ-สกุล 40 ตัว / ชื่องาน 40 ตัว ตัดด้วย … หรือขึ้นบรรทัดในช่องตัวเอง ไม่ล้นทับช่องข้าง (`scrollWidth > clientWidth` ⇒ ต้อง `overflow:hidden` + ellipsis หรือ wrap) · ความสูงแถว tbody มีค่าเดียว (`rowH` ยาว 1) | M+V |
| TC-22 | AC-09 | หน้าสแกนที่ 820 และ 1180 | ชื่อยาว | ชื่อเล่น 12 ตัว / อีโมจิ ตัดด้วย … ในช่องตัวเอง ไม่ดันความกว้างคอลัมน์ผัง (ทุกช่องกว้างเท่ากัน ±1) · การ์ดสแกนล่าสุดแสดงชื่อ-สกุล 40 ตัวไม่ล้น (สแกนเลขที่ 4) | M+V |
| TC-23 | AC-10 | fixture ใหม่ (ยังไม่สแกน) เปิด G1/G2/G6/G14 ทั้งไม่จัดกลุ่มและตามประเภท ที่ 1536 → `measure.numbers()` บน before และ after | G1–G14 | JSON ของตัวเลขทุกช่อง (คะแนน, รวมกลุ่ม, สะสม) ของ before = after ทุกตัว (diff = 0 บรรทัด) | M |
| TC-24 | AC-11 | `npm run build` แล้ว `node scripts/shots.cjs <โฟลเดอร์ใน scratchpad>` | fixture | exit 0 · PNG ครบ 3 หน้า × 4 ขนาด = **12 ไฟล์** (820×1180, 1180×820, 1536×729, 390×844) · ขนาดพิกเซลภาพ = 2w×2h (DPR 2) · ไม่มีไฟล์ใหม่ใน repo (`git status` เทียบก่อน/หลัง) · `package.json`/lockfile ไม่เปลี่ยน · ไม่มี chrome/msedge headless หรือพอร์ตค้าง และ temp profile `shots-profile-*` ถูกลบ | A |
| TC-25 | AC-11 | รันเมื่อไม่มีเบราว์เซอร์ (ผ่านช่องทาง override path — ขอ FE เพิ่ม ดูภาคผนวก ข F-8) | — | ข้อความบอกสาเหตุ + exit ≠ 0 · ไม่มีไฟล์ครึ่ง ๆ | A |
| TC-26 | AC-12 | `npm run typecheck` · `npm test` · `npm run build` | — | ผ่านทั้งหมด · ≥ 85 ไฟล์ / ≥ 1017 tests (baseline brief AC-06) · ไม่มีเทสต์ถูกข้าม/ปิดเพิ่ม | A |
| TC-27 | ♿ (AC-04) | หน้าสแกน 820: เริ่มที่ช่องสแกน กด Tab ไปเรื่อย ๆ | สแกน | ลำดับ focus ไล่ตามลำดับที่เห็น (บน→ล่าง) ไม่กระโดดกลับขึ้น · focus มองเห็นได้ · ยิงเลขที่ 2 ครั้งติดกันด้วยคีย์บอร์ด (Enter) ได้ผลทั้งสองครั้ง (focus กลับช่องสแกนเหมือน main) | I |
| TC-28 | ♿ (AC-06) | ทุกสถานะช่องผังที่ 820/1180: คำนวณ contrast ข้อความชื่อ/เลขที่กับพื้นช่อง | สแกน | ≥ 4.5:1 (หรือ ≥3:1 ถ้าตัวใหญ่) และไม่ต่ำกว่า main · สถานะไม่สื่อด้วยสีอย่างเดียว (ติ๊ก/ขีด/ขอบประ) · ผลสแกนยังประกาศผ่าน aria-live เหมือน main | M |
| TC-29 | 🖥 ทุก AC | `shots.mjs --label before` (main) และ `--label after` ทุกหน้าใน `pages.json` × 4 อุปกรณ์ → เปิดดูทุกภาพ → `visual-check.json` → `shots-sheet.mjs --diff` | ทั้งหมด | ครบ 12 หน้า × 4 = 48 ภาพต่อ label · ทุกภาพผ่าน 8 ข้อของ checklist (เต็มกรอบ/ไม่ตัดคำ/ไม่ทับ/ไม่มี scroll ซ้อน/≥เกณฑ์/ตรงรูปอ้างอิง/ไม่แย่กว่า before/ตั้ง-นอน) · `pageScrollsX=false` ทุกภาพใน index.json · sheet PASS | V |

## กรณีขอบและกรณีผิด

| TC | กรณี | ผลที่คาด |
|---|---|---|
| TC-11, 21, 22 | ยาวสุด / ภาษาไทย+อีโมจิ (ชื่อเล่น 12, ชื่อ-สกุล 40, ชื่องาน 40, `ข้าวหอม🌾`) | ตัดด้วย … ในช่องตัวเอง ไม่ล้น ไม่ดันคอลัมน์ ไม่ตัดกลาง grapheme (สระ/วรรณยุกต์ไม่ลอย) |
| TC-03 | น้อยสุด (1 งาน) | ยืดเต็ม ไม่มีหัวคอลัมน์ยืดจนข้อความกระจาย/จัดผิด |
| TC-08, TC-12 | ฟอนต์ 14 / 24 (ค่าต่ำ/สูงที่ครูเลือก) | เกณฑ์ยืด/เลื่อนยังถูกฝั่ง · ผังชื่อ ≥4 (14) / ≥2 (24) |
| TC-13 | ความกว้างพอดีเส้น 999/1000 | สลับ 1↔2 คอลัมน์ที่ 1000 พอดี ไม่มีช่วงที่ผังถูกบีบ |
| TC-09 | หมุน iPad ระหว่างเปิดหน้า (resize โดยไม่ reload) | จัดใหม่ทันที ไม่ต้องรีเฟรช |
| TC-06 | กดพับ/กางกลุ่มซ้ำเร็ว ๆ 5 ครั้ง | สุดท้ายสถานะตรงปุ่ม ไม่มีที่ว่างขวาค้าง |
| TC-27 | ยิงเลขที่ติดกันเร็ว ๆ (เครื่องยิง HID) ในแนวตั้ง | ไม่หลุด focus เพราะการจัดหน้าใหม่ · ทุกการยิงถูกนับ |
| — | ค่าว่าง (ห้องไม่มีงาน) | ไม่อยู่ใน AC — smoke เท่านั้น: เปิดสมุดวิชาที่ไม่มีงานต้องไม่เกิด error/ตารางแตก (ใช้ `cls_63` คณิตศาสตร์ ซึ่งไม่มีงาน) |
| — | เน็ตหลุด / สองเครื่อง / สิทธิ์ / เงิน / วันที่ | ไม่เกี่ยว — งานนี้แก้การจัดหน้าเท่านั้น (ไม่แตะ worker/outbox) |

## Regression

- ชุดเทสต์เดิม: `npm run typecheck` · `npm test` · `npm run build` เทียบ baseline ของงาน (brief AC-06 / requirements AC-12: 85 ไฟล์ / 1017 tests) — `context.md` ยังบันทึก baseline เก่า 56/570
- ส่วนเดิมที่อาจกระทบ: gb-1a/1b/2 (ล็อกชื่อ/สะสม, หัวค้าง, แถบย่อ, ปุ่มกระโดด, เมนูคอลัมน์, ค่าเริ่มต้นไม่จัดกลุ่ม/กางทุกกลุ่ม, แตะ "รวม" เพื่อแก้) · หน้าสแกนแนวนอน (รูป 1 ที่เจ้าของงานพอใจ) · มือถือ (D22) · ผังสแกน D29/D30 (8/6 คอลัมน์, สี, ติ๊ก/ขีด, ไม่มีคิว) · โหมดตัวอักษร 14–24
- smoke ตอนตรวจซ้ำ: TC-01, TC-04, TC-10, TC-14, TC-17 + TC-26

## ภาคผนวก ก — สคริปต์วัด (วางใน `javascript_tool`; อ่านอย่างเดียว ไม่แก้ DOM ยกเว้น `scrollLeft`)

```js
window.measure = {
  gb() {
    const f = document.querySelector('.gb-scroll'), t = f?.querySelector('table');
    if (!t) return { error: 'no gradebook' };
    const fr = f.getBoundingClientRect(), tr = t.getBoundingClientRect();
    const frameRight = fr.left + f.clientLeft + f.clientWidth;
    const head = t.querySelector('thead tr:last-child') || t.querySelector('tr');
    return {
      vw: innerWidth, rootFont: getComputedStyle(document.documentElement).fontSize,
      F: f.clientWidth, tableW: +tr.width.toFixed(1), gapRight: +(frameRight - tr.right).toFixed(1),
      frameScrollX: f.scrollWidth > f.clientWidth + 1, pageScrollX: document.documentElement.scrollWidth > innerWidth,
      cols: [...head.children].map((c) => ({ cls: c.className, w: +c.getBoundingClientRect().width.toFixed(1), x: +c.getBoundingClientRect().left.toFixed(1), t: c.innerText.trim().slice(0, 24) })),
      rowH: [...new Set([...t.querySelectorAll('tbody tr')].map((r) => Math.round(r.getBoundingClientRect().height)))],
    };
  },
  scan(nicks = ['นวพล', 'กมลชนก', 'กมลวรรณชนกพร', 'ข้าวหอม🌾']) {
    const cells = [...document.querySelectorAll('.sc-cell')]; if (!cells.length) return { error: 'no grid' };
    const grid = cells[0].parentElement, top0 = Math.min(...cells.map((c) => Math.round(c.getBoundingClientRect().top)));
    const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
    const visible = (el) => {
      const tn = [...el.childNodes].find((n) => n.nodeType === 3); if (!tn) return null;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const right = r.left + el.clientLeft + el.clientWidth - parseFloat(cs.paddingRight);
      const cut = el.scrollWidth > el.clientWidth + 1;
      const ctx = document.createElement('canvas').getContext('2d'); ctx.font = cs.font;
      const limit = right - (cut ? ctx.measureText('…').width : 0);
      const ends = [...seg.segment(tn.data)].map((s) => s.index + s.segment.length);
      const rg = document.createRange(); let n = 0;
      for (const e of ends) { rg.setStart(tn, 0); rg.setEnd(tn, e); if (rg.getBoundingClientRect().right <= limit + 0.5) n++; else break; }
      return { total: ends.length, visible: n, cut, fontPx: cs.fontSize };
    };
    const names = Object.fromEntries(nicks.map((k) => { const el = [...document.querySelectorAll('.sc-cell *')].find((e) => e.textContent.trim() === k && [...e.childNodes].some((n) => n.nodeType === 3)); return [k, el ? visible(el) : 'not found']; }));
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      vw: innerWidth, rootFont: getComputedStyle(document.documentElement).fontSize,
      perRow: cells.filter((c) => Math.round(c.getBoundingClientRect().top) === top0).length, cellW: [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().width)))],
      grid: box('.sc-cell') && (() => { const b = grid.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width) }; })(),
      input: box('.scan-input-row'), pad: box('.sc-pad'), camera: box('[aria-label="สแกนด้วยกล้อง"]'),
      queueText: /รอคะแนน\s*\(/.test(document.body.innerText), pageScrollX: document.documentElement.scrollWidth > innerWidth, names,
    };
  },
  a11y() {
    const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const small = [...document.querySelectorAll('body *')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.data.trim()) && parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => e.tagName + '.' + e.className + ':' + e.textContent.trim().slice(0, 15));
    const hits = [...document.querySelectorAll('button,a[href],input,select,textarea,[role=button]')].filter(vis);
    const tiny = hits.filter((e) => !e.closest('.sc-cell')).filter((e) => { const b = e.getBoundingClientRect(); return b.width < 44 || b.height < 44; }).map((e) => (e.getAttribute('aria-label') || e.textContent.trim().slice(0, 15)) + ` ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const over = []; for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) { const a = hits[i], b = hits[j]; if (a.contains(b) || b.contains(a)) continue; const p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top); if (w > 1 && h > 1) over.push([a.textContent.trim().slice(0, 10), b.textContent.trim().slice(0, 10)]); }
    return { coarse: matchMedia('(pointer: coarse)').matches, smallText: small, tinyTargets: tiny, overlaps: over };
  },
  numbers() { return [...document.querySelectorAll('.gb-scroll tbody tr')].map((r) => [...r.children].map((c) => c.innerText.trim()).join('|')); },
};
```

หมายเหตุ: `measure.gb()` คืนความกว้างทุกหัวคอลัมน์ — QA จัดกลุ่มเองว่าอันไหนคือ ชื่อ/งาน/รวม/สะสม จากข้อความหัว (ไม่ผูกกับชื่อ class ของโค้ด) · TC-19 บนอุปกรณ์สัมผัสเท่านั้น (บนคอม `tinyTargets` เป็นข้อมูลประกอบ) · TC-23 ถ้าตารางใช้ virtual rows ต้องเลื่อนให้ครบก่อนเก็บ

## ภาคผนวก ข — สิ่งที่ต้องเพิ่มใน fixture/เครื่องมือ (ให้ Tech Lead/FE ทำ; QA ไม่แก้)

| # | สิ่งที่ต้องมี | เหตุผล |
|---|---|---|
| F-1 | `fixture-server.cjs` ตัวเลือก opt-in `layout: true` / CLI `--layout` (เปิด gradebook14 ด้วย) — ทุกชุดข้อมูลด้านล่างอยู่ใน server **ตัวเดียว** · ค่าเริ่มต้น (ไม่ใส่ flag) ต้องเหมือนเดิมทุกตัว | `pages.json` มี `base` เดียว · เช็กอื่นต้องได้ตัวเลขเดิม |
| F-2 | ภายใต้ `layout`: วิทยาศาสตร์ `cls_61` เหลือ 2 งาน (`asg_ex3`, `asg_ws4`) และเปลี่ยนชื่อ `asg_ws4` เป็น `ใบงานที่ 7 การวิเคราะห์ระบบนิเวศในท้องถิ่นของเรา` (40 grapheme) | AC-01, AC-09 (2 งาน 2 ประเภทใช้ทดสอบจัดกลุ่มได้) |
| F-3 | วิชาใหม่ `sub_eng` "ภาษาอังกฤษ" 6 งาน (≥2 ประเภท, คะแนนแบบ deterministic สำหรับ 44 คน) ผูก `cls_61` | AC-03 |
| F-4 | วิชาใหม่ `sub_art` "ศิลปะ" 1 งาน ผูก `cls_61` (มีคะแนนบางคน) | Gate 1 ข้อ 1 |
| F-5 | ชื่อ: เลขที่ 2 ชื่อเล่น `นวพล` · 3 `กมลชนก` · 4 `กมลวรรณชนกพร` + ชื่อ `กมลวรรณชนกพรนภสรอร` สกุล `วงศสกลนครพนมบรรพตชยกรณ` (18+22 = 40) · 5 `ข้าวหอม🌾` · `asg_gb_12` ชื่องานเป็นชื่อยาว 40 grapheme เดียวกับ F-2 | AC-04, AC-09 (ข้อมูลสมมติทั้งหมด) |
| F-6 | งาน `asg_gb_13` "ใบงาน 6 สมการ": รับประกันมีอย่างน้อย 1 คนต่อสถานะ ส่งมีคะแนน / ส่งสาย (`late=1`) / ส่งยังไม่มีคะแนน (`score NULL`) / ลา / ไม่ส่ง · เลขที่ 1 และ 2 ยัง**ไม่ส่ง** | AC-06 (ตอนนี้ j=12 ไม่มีคนสายเลยตามสูตรสุ่ม), TC-10/16 |
| F-7 | CLI `--port <n>` และ `--assets <dir>` (เสิร์ฟ build ของ main @ `01d5486` ที่ build ไว้นอก repo ด้วย worker/fixture ปัจจุบัน) | ภาพ/ตัวเลข before เทียบ after บนข้อมูลเดียวกัน (AC-02/05/07/10) |
| F-8 | `scripts/shots.cjs`: เพิ่มขนาด 390×844 (AC-11 "+390×844") และตัวแปร env สำหรับ path เบราว์เซอร์ (เช่น `SHOTS_BROWSER`) เพื่อทดสอบกรณีไม่มีเบราว์เซอร์ | TC-24, TC-25 |
| F-9 | รัน `pages.json` ของงานนี้กับ `shots.mjs` 1 รอบ (dry run) แล้วแก้ selector/ขั้นตอนถ้าไม่ตรง — QA เขียนจาก black-box ยังไม่ได้รัน | TC-29 |
| F-10 | PM: เพิ่ม `## อุปกรณ์เป้าหมาย` ใน `context.md` (ตารางด้านล่าง) และสร้าง build ของ main @ `01d5486` นอก repo สำหรับ before | shots.mjs อ่านอุปกรณ์จาก context.md |

```
## อุปกรณ์เป้าหมาย

| ชื่อ | ขนาด | DPR | สัมผัส | หมายเหตุ |
|---|---|---|---|---|
| iPad ตั้ง | 820×1180 | 2 | ใช่ | Safari iPadOS ฟอนต์ 18 |
| iPad นอน | 1180×820 | 2 | ใช่ | Safari iPadOS ฟอนต์ 18 |
| คอม | 1536×729 | 2 | ไม่ | Chrome/Edge ฟอนต์ 16 |
| มือถือ | 390×844 | 3 | ใช่ | ฟอนต์ 18 |
```

## ภาคผนวก ค — pages.json

`docs/team/jobs/2026-10-31-fix-fill-and-portrait/pages.json` · 12 หน้า × 4 อุปกรณ์ · ทุกหน้าใช้ query `?pg=<ชื่อ>` เพื่อบังคับโหลดเต็ม (ฟอนต์ถูกอ่านตอนบูต) · ฟอนต์ 14/24 ตั้งใน `setup` ของหน้า**ก่อนหน้า** (มีผลเมื่อหน้าถัดไปโหลด) และ `ready` ตรวจ root font ทุกหน้า — ถ้าฟอนต์ไม่ตรงจะล้มแทนที่จะถ่ายผิด · หน้าสุดท้ายลบค่าฟอนต์ให้อุปกรณ์ถัดไป · หน้าสแกนจบรอบเก่าก่อนเริ่มใหม่ทุกครั้ง (การสแกนเปลี่ยนข้อมูล G14 → TC-23 ใช้ fixture ใหม่ที่ยังไม่สแกน)

รัน: `node scripts/fixture-server.cjs --layout --port <พอร์ตที่ได้รับ>` แล้ว `node <skill-dir>/scripts/shots.mjs --job docs/team/jobs/2026-10-31-fix-fill-and-portrait --pages docs/team/jobs/2026-10-31-fix-fill-and-portrait/pages.json --label after --url http://127.0.0.1:<พอร์ต>`

## ข้อสงสัย (ให้ PM/เจ้าของงานตัดสิน)

1. `context.md` ไม่มี `## อุปกรณ์เป้าหมาย` → shots.mjs ใช้คอม 1536×864 DPR 1 ไม่ตรง brief 1536×729 · แนะนำ: PM เพิ่มตาราง F-10
2. before ต้องมาจาก `main` @ `01d5486` แต่ working tree มี CSS ร่างของ PM แล้ว (grade.css, scan.css) → ต้อง build main แยกนอก repo (QA ทำ git checkout/worktree ไม่ได้) · แนะนำ: PM/Tech Lead ทำ + F-7
3. โหมดจัดกลุ่ม: คอลัมน์ "รวมกลุ่ม" (กลุ่มกางอยู่) ควรยืดเท่าคอลัมน์งานหรือคงความกว้างต่ำสุด — requirements สมมติ "ยืดเฉพาะคอลัมน์งาน (และ 'รวม' เมื่อพับ)" · แผนนี้ผ่านทั้งสองแบบถ้า `gapRight ≤ 2` และงานเท่ากัน · แนะนำ: ยึดตามสมมติฐาน (รวมกลุ่มที่กางอยู่ไม่ยืด) และให้เจ้าของงานดูภาพ
4. "ชื่อ 4 ตัวอักษร" นับอย่างไร — แผนนี้นับ grapheme (`ก้อง` = 3) · แนะนำ: grapheme
5. AC-11 ระบุ "(+390×844)" แต่ dev-notes T-01 ได้ 9 ภาพ (ไม่มี 390) · แผนนี้คาด 12 ภาพ
6. "โหมดรับอย่างเดียว" ในคำสั่ง PM = ปุ่ม "รับงานก่อน" ในหน้าสแกน (สมมติ)
7. `requirements.md` คำถามค้างข้อ 2–3 ยังว่าง แต่ `brief.md` Gate 1 มีคำตอบแล้ว (ลำดับ ช่องสแกน → แป้นคะแนน → ผัง → สแกนล่าสุด; ฟอนต์ 24 ≥2 ตัว) — แผนนี้ใช้คำตอบใน brief

# Code Review: gb-1b (แถบย่อ ปุ่มกระโดด เลือกคอลัมน์ เลื่อนทีละคอลัมน์)

- ช่วงที่ตรวจ: `git diff main -- src` (ยังไม่ commit) — `src/pages/Gradebook.tsx`, `src/styles/grade.css` + ไฟล์ใหม่ `src/lib/gbColumns.ts`, `src/components/GradebookNav.tsx`, `test/unit/gradebook-minimap.test.ts`, `test/unit/gradebook-columns-ui.test.tsx` · อ่าน brief.md, dev-notes/frontend.md
- ผู้ตรวจ: Code Reviewer (ไม่ได้เขียนส่วนนี้) · รอบแก้ (Verify) 0/3
- ข้อจำกัด: ไม่ได้รัน test/server/browser ตามคำสั่ง PM — ทุกข้อยืนยันจากการอ่านโค้ด
- สรุป: **ไม่ผ่าน (ตามเกณฑ์ข้อมูล)** — ต้องแก้ 1 (แก้บรรทัดเดียว ตรวจซ้ำเฉพาะข้อนี้ได้) · ควรแก้ 2 · ข้อเสนอ 5

## ต้องแก้

### R-01 💰 · `finally { refocusBulkTrigger() }` แย่งโฟกัสจากช่องกรอกคะแนน → บันทึกคะแนนที่พิมพ์ยังไม่ครบ
- `src/pages/Gradebook.tsx:270` (runBulk) + `refocusBulkTrigger` `:62-64` (focus แบบไม่มีเงื่อนไข) + `CellInput` `:707` (`onBlur={() => finish(false)}` = commit ค่าที่พิมพ์อยู่)
- สถานการณ์: ครูยืนยัน "ทำทั้งห้อง" ของงาน A → ระหว่างรอ API + `load(true)` (เน็ตโรงเรียนช้าได้หลายวินาที ตารางไม่ถูกล็อก) ครูแตะช่องคะแนนงาน B แล้วพิมพ์ "8" (ตั้งใจ 85) → bulk เสร็จ → `finally` ย้ายโฟกัสไปปุ่ม "ทำทั้งห้อง" → input blur → `finish(false)` → `onCommit` บันทึก **8** เข้า outbox/ระบบ = คะแนนผิดโดยครูไม่ได้กด Enter
- เหตุที่ไม่จำเป็น: ตอนนี้ปุ่มใช้ `aria-disabled` (ยังโฟกัสได้ระหว่างทำงาน) ดังนั้น `refocusBulkTrigger()` ใน `onConfirm` (`:640`) ที่เรียกก่อน `runBulk` ก็โฟกัสติดอยู่แล้ว — AC-06 ไม่ต้องพึ่ง `finally`
- แนวทาง: ลบ `finally { refocusBulkTrigger(); }` (กลับเป็น `await act.run(...)`) หรือถ้าจะเก็บไว้ ให้โฟกัสเฉพาะเมื่อโฟกัสหลุด: ใน setTimeout เช็ก `const ae = document.activeElement; if (!ae || ae === document.body) …focus()` · เทสต์ AC-06 (`gradebook-columns-ui.test.tsx:201-210`) ควรยังผ่านเพราะ onConfirm โฟกัสให้แล้ว — ให้ QA/FE ยืนยัน และเพิ่มเทสต์ "โฟกัสอยู่ที่ input อื่นตอน bulk จบ → ไม่ถูกย้าย"

## ควรแก้

### R-02 ♿ · ปุ่ม "คอลัมน์" ประกาศ `aria-haspopup="true"` (= menu) แต่แผงเป็น group ของ checkbox
- `src/components/GradebookNav.tsx:134` (`aria-haspopup="true"`) กับแผง `:140` `role="group"`
- สถานการณ์: SR ประกาศ "ปุ่ม เมนูย่อย" → ผู้ใช้คาดลูกศรขึ้น/ลงเลื่อนรายการแบบ menu แต่ไม่มี (ใช้ Tab) = ประกาศบทบาทที่ใช้ไม่ได้ ตรงข้อห้ามใน brief
- แนวทาง: เอา `aria-haspopup` ออก เหลือ `aria-expanded` + `aria-controls={id ของแผง}` (รูปแบบ disclosure) หรือใช้ `aria-haspopup="dialog"` คู่ `role="dialog"` ที่แผง

### R-03 · ลากบน minimap แล้วถูก unmount/ไม่ได้ pointerup → `scroll-snap-type: none` ค้างบนตาราง
- `src/components/GradebookNav.tsx:84-91` ตั้ง `scrollRef.current.style.scrollSnapType = "none"` ตอน pointerdown และคืนค่าเฉพาะใน `release` (pointerup/pointercancel) · `GradebookNav` คืน `null` เมื่อ `fitsAll(info)` (`:103`)
- สถานการณ์: ลากแถบย่อบน iPad แล้วหมุนจอ/ซ่อนคอลัมน์จนทุกคอลัมน์พอดีจอ (หรือ `lostpointercapture` โดยไม่มี pointerup) → MiniMap หายระหว่างลาก → inline style ค้าง → ตารางเลื่อนแล้วค้างครึ่งคอลัมน์จนรีโหลด (AC-05)
- แนวทาง: เพิ่ม `onLostPointerCapture={release}` และ `useEffect(() => () => { if (drag.current && scrollRef.current) scrollRef.current.style.scrollSnapType = ""; }, [])` · (ไม่มี listener รั่ว: listener ทั้งหมดเป็น JSX props; `useScrollInfo` ถอด scroll/resize/ResizeObserver ครบใน cleanup `:31`)

## ข้อเสนอเล็ก

- R-04 · `src/styles/grade.css:94` `.gb-frame` ประกาศ `--gb-name-w/--gb-col-w/--gb-tot-w/--gb-gh` ซ้ำกับ `.gb-scroll` (`:18-21`) ค่าเท่ากันตอนนี้ แต่ถ้าแก้ที่เดียวในอนาคต เงาขอบ/scroll-padding จะไม่ตรงคอลัมน์ล็อก · แนะนำย้ายตัวแปรขึ้นไป `.gb-frame` ที่เดียว (`.gb-scroll` อยู่ภายในจึงได้รับค่าเอง)
- R-05 · `src/styles/grade.css:97` เงาขวา `right: var(--gb-tot-w)` ไม่หักความกว้าง scrollbar แนวตั้งของ `.gb-scroll` (คอมที่ scrollbar ไม่ซ้อน ~15px) → เงาเลื่อนเข้าไปทับคอลัมน์สะสมเล็กน้อย เป็นเรื่องหน้าตาเท่านั้น ให้ QA ดูที่ 1440 บน Windows
- R-06 · `src/components/GradebookNav.tsx:139` คลิกฉากหลังปิดเมนูด้วย `setOpen(false)` ไม่คืนโฟกัสปุ่ม (โฟกัสตกไป body) · และ Tab ออกจากแผงไม่ปิดเมนู (ไม่ใช่ modal จึงรับได้) — แนะนำใช้ `close` แทนที่ฉากหลัง
- R-07 · `src/pages/Gradebook.tsx:527` หัวกลุ่ม (โหมด "ตามเดือน") แสดง `g.items.length งาน` แม้ซ่อนบางประเภทจนเห็นน้อยกว่า (colSpan ใช้ `cols.length` ถูกแล้ว) — ตัวเลขนี้คือจำนวนงานทั้งหมด ไม่ผิด แต่อาจงงว่าทำไมเห็นแค่ 3 คอลัมน์ · พิจารณา "3/5 งาน" เมื่อซ่อนบางส่วน
- R-08 · เมื่อคอลัมน์ที่เลือก (`selCol`) ถูกซ่อน แถบเครื่องมือของงานนั้น (รวม "ทำทั้งห้อง") ยังทำงานกับคอลัมน์ที่มองไม่เห็น — มีชื่องานแสดงอยู่จึงไม่ผิด แต่พิจารณาล้าง `selCol` เมื่อประเภทของมันถูกซ่อน

## ตรวจแล้วไม่พบปัญหา

1. 💰 ค่าสะสม/รวมกลุ่ม: `studentSummary(visibleWork, …)` (`Gradebook.tsx:569`) ใช้ `visibleWork = assignments.filter(publish_scores)` (`:334`) — ไม่ขึ้นกับ `isShown`; รวมกลุ่มที่พับ `groupScoreTotal(g.items.filter(publish_scores) …)` (`:578-580`) ใช้ `g.items` เต็ม; ตัวเลขแถบเครื่องมือ `countWorkStates(… assignments …)` (`:340`) เต็ม · `git diff main -- src | grep '^[+-]' | grep -c 'studentSummary|groupScoreTotal|visibleWork|countWorkStates(students.flatMap'` = 0 → ไม่มีการเปลี่ยนสูตร/อินพุตของการคำนวณ · `gbColumns.ts` ไม่มีการคำนวณคะแนน (ฟังก์ชันนับคอลัมน์/ตำแหน่งเท่านั้น) · โหมด "ตามเดือน" ที่พับ: รวมกลุ่มยังนับงานประเภทที่ซ่อน ตรง brief ข้อ 3 · เทสต์ `gradebook-columns-ui.test.tsx:77-89` ยืนยันสะสม 17/30 คงเดิมหลังซ่อน
2. ♿ เมนูคอลัมน์: Esc ปิดและคืนโฟกัสปุ่ม (`GradebookNav.tsx:129,133`), เปิดแล้วโฟกัส checkbox แรก (`:130`), checkbox มี `aria-checked`, ประเภทสุดท้ายใช้ `aria-disabled` + กันคลิก (`:145`) · minimap เป็น `role="slider"` โฟกัสได้ มี label/valuenow/valuetext และลูกศร/Home/End (`:66-83`) · ปุ่มกระโดดมี `aria-label="ไปที่…"` (`:109`) · `touch-action: none` เฉพาะ `.gb-mini` (`grade.css:107`) ไม่ขวางการเลื่อนหน้าส่วนอื่น
3. gbColumns: `scrollWidth = clientWidth` → `fitsAll` ซ่อนแถบ, `minimapWindow` ได้ width 1 left 0; `slidingSpan` ใช้ `Math.max(1, …)` ไม่มีหารศูนย์; `pct` ใช้ `Math.max(0.0001, …)` + `|| 0`; `minimapScrollFor` กัน NaN/ช่วง 0..1 และ clamp ที่ max · ตารางว่าง → `hasTable=false` ไม่วัด/ไม่แสดงเมนู (`assignments.length > 0`) · `effectiveHidden` กันซ่อนทุกประเภท/คีย์เก่า · localStorage: try/catch ทั้งอ่านและเขียน, ตรวจรูปข้อมูลทุก field, คีย์ `ngankrob.gb.columns` ไม่ชนกับ `ngankrob.gb.groupMode` ของ gb-1a (`gbGroups.ts:7`) · หน้าไม่มี RTL
4. scroll-snap: `x mandatory` เฉพาะแกน x, snap-align เฉพาะ `th.col-w` (รวม `sumcol` ของกลุ่มที่พับ), `scroll-padding-left = --gb-name-w` / ขวา `--gb-tot-w` (0 เมื่อซ่อนสะสม) → คอลัมน์งานหยุดถัดจากคอลัมน์ล็อก · ลำดับ z-index เดิม (th 2, name/tot 3, gh 4, หัวมุม 6) ไม่เปลี่ยน; เงา `::before/::after` z 7 แต่ `pointer-events: none` · เมนู z 40/ฉากหลัง 39 อยู่เหนือตาราง
5. BulkConfirm: `aria-disabled` + guard ใน onClick (`Gradebook.tsx:454`) กันเปิดเมนูซ้ำระหว่างทำงาน; `useAction.run` ยังกันกดซ้ำซ้อนด้วย inFlight (`useAction.ts`) — พฤติกรรมกันซ้ำเดิมคงอยู่ (ปัญหาเดียวคือ R-01)
6. ตัวอักษร: สไตล์ใหม่ใช้ `var(--fs-sm/--fs-xs)` ทั้งหมด ไม่มี font-size เป็น px · ปุ่มใหม่ใช้ `max(var(--tap), …)`; ปุ่ม "ตกลง" สูง 2.27rem แต่บน coarse ถูก `base.css:171` บังคับ `min-height: var(--tap) !important`
7. ข้อมูลเด็กในเทสต์: ชื่อสมมติ `"เด็ก"+n / "สมมติ"`, ห้อง ป.6/1, ไม่มีชื่อจริง/รหัสจริง
8. ไม่แตะ worker/schema/outbox · ไม่เพิ่ม dependency · `button[aria-disabled="true"]` ใน `grade.css:120` เป็น selector ทั้งเว็บ แต่ตอนนี้ใช้เฉพาะ gradebook (grep แล้ว) — ไม่กระทบหน้าอื่น

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `git diff main --stat -- src` + อ่านไฟล์ใหม่ทั้ง 4 | ตรวจครบ |
| grep สูตรคะแนนใน diff | 0 บรรทัดที่เปลี่ยน → PASS (💰) |
| `grep -rn "ngankrob.gb\." src` | 2 คีย์ต่างกัน → PASS |
| `grep -rn aria-disabled src` | ใช้เฉพาะ Gradebook/GradebookNav |
| npm test / browser | NOT RUN (คำสั่ง PM: QA ใช้ browser อยู่) |

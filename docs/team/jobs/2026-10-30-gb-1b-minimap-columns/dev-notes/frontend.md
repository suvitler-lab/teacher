# dev-notes: Front-End gb-1b (T-01)

## ทำอะไร
- `src/lib/gbColumns.ts` (ฟังก์ชันล้วน): จำค่า "คอลัมน์" (localStorage `ngankrob.gb.columns`, try/catch, ค่าเสีย/รูปผิด = แสดงทั้งหมด), effectiveHidden (คีย์ประเภทที่ไม่มีแล้วถูกข้าม; ซ่อนครบทุกประเภท = ไม่ซ่อน), toggleType (ซ่อนประเภทสุดท้ายไม่ได้), displayGroups (เก็บกลุ่มเต็มไว้คำนวณ + ส่วนที่วาด), jumpTargets, jumpScrollLeft, minimapWindow / minimapScrollFor / edgeState / fitsAll / minimapSegments
- `src/components/GradebookNav.tsx`: useScrollInfo, MiniMap (pointer events, จับ pointer, ปิด snap ชั่วคราวระหว่างลาก, role=slider + ลูกศร/Home/End), GradebookNav (แถบ + ปุ่มกระโดด), ColumnsMenu ("คอลัมน์ (n/N)", checkbox เป็นปุ่ม role=checkbox สูง >=44px, ข้อความ "สะสมคิดรวมทุกงาน แม้ซ่อนบางคอลัมน์", Esc ปิด + คืนโฟกัสปุ่ม)
- `Gradebook.tsx`: ซ่อนเป็นการวาดเท่านั้น (สะสม/รวมกลุ่ม/ตัวเลขสรุปยังใช้ `assignments`/`g.items` เต็มเหมือนเดิม); ปุ่มกระโดดกางกลุ่มที่พับก่อน แล้วเลื่อน; ซ่อนสะสม/แถบความคืบหน้าได้
- `grade.css`: scroll-snap x mandatory เฉพาะ th.col-w + scroll-padding ซ้าย/ขวา (ไม่ทับคอลัมน์ล็อก), เงาขอบซ้ายขวา (`can-l`/`can-r`), สไตล์ minimap/ปุ่มกระโดด/เมนู (rem/ตัวแปร, สูง max(var(--tap), …)); เมนูห้อยจาก toolbar ไม่ล้นขอบจอ
- BulkConfirm (AC-06): ปุ่ม "ทำทั้งห้อง" ใช้ aria-disabled (ไม่ใช่ disabled) ระหว่างทำงาน และ runBulk คืนโฟกัสใน finally ด้วย (เดิมโฟกัสไม่ติดเพราะปุ่ม disabled ตอนยืนยัน)

## การตัดสินใจ
- ซ่อนแถบนำทางทั้งแถว (รวมปุ่มกระโดด) เมื่อทุกคอลัมน์พอดีจอ; มือถือ (<=720px) ใช้รายการเดิม ไม่มีแถบ/เมนู
- ปุ่มกระโดดไม่มีสำหรับประเภทที่ไม่มีงานหรือถูกซ่อน
- n/N นับงาน (ไม่นับสะสม); กลุ่มที่พับนับตามงานที่ถูกเลือกแสดง

## หลักฐาน
- `npx tsc --noEmit` PASS · `npm test` PASS 84 ไฟล์ / 1001 (ใหม่: gradebook-minimap.test.ts, gradebook-columns-ui.test.tsx) · `npm run build` PASS
- Browser (fixture gb14 พอร์ต 5194, คณิตศาสตร์ 14 งาน, SW unregister, **ปุ่มสัมผัสจำลอง coarse** ด้วยสำเนา CSS ไม่ใช่อุปกรณ์จริง): 820 × 14/18/24, 1180 × 14/18/24, 1440 × 14/18/24 (ทั้งเมนูปิด/เปิด): หน้าไม่เลื่อนแนวนอน, ปุ่ม/ช่องเมนู <44 = 0, ข้อความ <13 = 0, เมนูอยู่ในจอ; 390 × 14/18/24 ใช้รายการมือถือ ผ่านเช่นกัน
- 1180@18: ซ่อน "ใบงาน" ผ่านเมนู → n/N 8/14, ปุ่มกระโดดเหลือ 3, สะสม 5 แถวแรกเท่าเดิมทุกค่า (85/130, 100/160, …), ค่าที่จำใน localStorage, Esc ปิดแล้วโฟกัสกลับปุ่ม; ลากบน minimap จริง (mouse) ตารางเลื่อนไปหยุดที่ขอบคอลัมน์ (offset 0); กรอบเลื่อนตาม; เงา can-l/can-r ขึ้นตามตำแหน่ง
- ดูภาพ 5 ภาพ (1180@18 เริ่มต้น, เลื่อนแล้ว, หลังกดกระโดด, ลาก, 820@24 เมนูเปิด) — ไม่ได้บันทึกไฟล์ลง evidence/ (เครื่องมือไม่เขียนลง repo)
- ปิด server แล้ว ล้าง viewport แล้ว

## ไม่ได้ทำ / ข้อควรทราบ
- ไม่ได้ทดสอบนิ้วจริงบน iPad (scroll-snap, ลากด้วยสัมผัส) — ต้อง QA/เจ้าของงานลองเอง
- ภาพหน้าจอไม่ได้บันทึกเป็นไฟล์
- fixture server ต้องรีสตาร์ท (login ใหม่) ทุกครั้งที่ build ใหม่ เพราะแคชไฟล์ตอนเริ่ม
- ทดสอบ jsdom: preact ใน jsdom ฟัง pointer event ชื่อ camel-case ("PointerDown") ในเทสต์จึงยิงทั้งสองชื่อ
- แก้ gb-1a เล็กน้อย: มี test ใหม่ของโฟกัส bulk แต่ไม่ได้พิสูจน์ว่าล้มก่อนแก้

## รอบแก้ 1/3 (ตาม code-review)
- R-01: ลบ `finally { refocusBulkTrigger() }` ใน runBulk (ตอนนี้ปุ่มเป็น aria-disabled โฟกัสได้อยู่แล้ว และ onConfirm คืนโฟกัสให้ก่อน runBulk) → ช่องคะแนนที่กำลังพิมพ์ไม่เสียโฟกัสและไม่ถูกบันทึกเอง; test: bulk รอ API ช้า ครูพิมพ์ในช่องอื่น → จบ bulk แล้วโฟกัสยังอยู่ที่ input และไม่มี post เพิ่ม
- R-02: ปุ่ม "คอลัมน์" เอา aria-haspopup ออก ใช้ aria-expanded + aria-controls ชี้แผง (id `gb-colmenu-panel`); test แล้ว
- R-03: minimap คืน scroll-snap เมื่อ lostpointercapture และเมื่อ minimap ถูกถอดกลางการลาก (ref callback คงที่รับ null ตอน unmount; ใช้ useEffect cleanup ไม่ได้ผลใน jsdom จึงใช้ ref); test ทั้งสองกรณี
- R-04..08 ข้ามตามคำสั่ง PM
- หลักฐาน: `npx tsc --noEmit` PASS · `npm test` PASS 85 ไฟล์ / 1016 · `npm run build` PASS · ไม่ได้ตรวจ browser ซ้ำรอบนี้ (แก้เฉพาะโฟกัส/aria/พฤติกรรม drag)

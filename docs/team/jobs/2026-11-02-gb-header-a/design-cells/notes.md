# เซลล์คะแนน + legend (ดีไซน์)
ดู `preview.html` (ปัจจุบัน vs ใหม่, 1536/1180/820/390, 6/14 งาน). ไม่แตะ src/.

## สถานะจริงจากโค้ด (shared/metrics.ts WorkState + ui.tsx WorkCell)
scored (เลขเรียบ) · late (เลข+ช้า) · awaiting (ส่งแล้วไม่มีคะแนน) · missing (–) · pending (·) · excused (ยกเว้น)
ซ่อนคะแนน = "•••" (hidden, เฉพาะ scored/late) · mark การบันทึก: pend / fail / unsaved (ซ้อนได้กับทุกสถานะ)

## ดีไซน์ใหม่ (พื้นขาว ไม่มีชิป ใช้ tokens เดิมทั้งหมด)
- scored: --text-primary เรียบ  · late: เลข + "ช้า" --text-warning + เส้นซ้าย 2px --fill-warning
- awaiting: "✓ รอตรวจ" --text-accent 500 · missing: "–" --text-danger 600 · pending "·" --text-muted
- excused: "ยกเว้น" --text-secondary · hidden "•••" --text-secondary
- pend = วงแหวนกลวง --text-warning · fail = จุดทึบ --text-danger · unsaved = ขีดเส้นประใต้เลข --text-danger (รูปทรงต่างกัน ไม่พึ่งสี)
- legend: 2 กลุ่มคั่นเส้นบาง "สถานะงาน" / "การบันทึก", เส้นบนบาง, 13px, ใช้ .wcell ตัวเดียวกับในตาราง

## Contrast (วัดจริง, บนขาว / บน --surface-1 hover)
primary 16.5/14.6 · secondary 6.25/5.52 · warning 5.92/5.23 · danger 7.34/6.48 · accent 7.00/6.18
muted "·" 3.14/2.77 (เป็นสัญลักษณ์ ไม่ใช่ข้อความ; ผ่าน 3:1 บนขาว, tooltip + legend อธิบาย)
เดิมที่ไม่ผ่าน non-text 3:1: --fill-warning บนขาว 2.32 (จุด pend) → เปลี่ยนเป็น --text-warning

## CSS ที่ต้องเปลี่ยน (src/styles/ui.css บรรทัด 63-74 — ไม่ใช่ grade.css)
- `.wcell.late/.awaiting/.missing/.excused`: ลบ background ทั้งหมด
- เพิ่ม `.wcell.late::after{content:"ช้า"…}`, `.wcell.awaiting::before{content:"✓ รอตรวจ"}` (หรือคง Icon check + ข้อความใน WorkCell)
- `.wcell.pend/.fail::after` → `::before` ตามพรีวิว; `.unsaved` outline → dotted underline
- WorkCell (ui.tsx): awaiting ต้องใส่ข้อความ "รอตรวจ" ข้างไอคอน; ไม่เปลี่ยน props/ตรรกะ
- `.gb-legend`: เพิ่ม border-top บาง, หัวกลุ่ม + `.sep`; แก้ markup ใน Gradebook.tsx (แถวหัวกลุ่ม/ตัวคั่น)
- มือถือ GradebookMobile ใช้ WorkCell ตัวเดียวกัน → ได้ผลเอง; พื้นที่แตะคือ td (≥44px บน touch เดิม)

## ผลต่อความสูงแถว
ไม่มี: เซลล์ยัง 1.6rem ใน td 2.4rem (วัด 38px ทั้ง 390/820/1536, 14 งาน) → 8+ แถวที่ 1536×729 เหมือนเดิม
ตรวจข้อความล้น: 0 จุดที่ scrollWidth>clientWidth ทุกความกว้าง. ฟอนต์ IBM Plex Sans Thai (OFL).

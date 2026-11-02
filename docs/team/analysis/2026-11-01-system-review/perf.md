# วิเคราะห์ความหน่วง "เปลี่ยนหน้าหรือเมนูหน่วงๆ" บน iPad

2 พ.ย. 2569 · Code Reviewer (opus·high) · อ่านโค้ดและคำนวณจากไฟล์จริง ไม่ได้วัดบน iPad จริง · PM บันทึกฉบับย่อ (ฉบับเต็มอยู่ใน scratchpad ของ session: perf-review-2026-11-02.md)
ป้ายตัวเลข: "อ่านจาก dist/จำลอง" = ได้จริง · "ประมาณ" = ยังไม่ได้วัด

## สาเหตุหลัก 3 อย่าง (ไม่ใช่ขนาดไฟล์)
หลังติดตั้ง service worker แล้ว JS/CSS/ฟอนต์อ่านจากแคชทั้งหมด (public/sw.js:95-106 cache-first, public/_headers immutable) ขนาดไฟล์จึงไม่ใช่สาเหตุของการเปลี่ยนหน้าช้า
1. **เข้าหน้าไหนก็ล้างข้อมูลแล้วโหลดใหม่จากศูนย์ ไม่มีแคช** (Gradebook.tsx:94,119,542 · Reports.tsx:46 · Students.tsx:60) และห้อง/วิชาที่เลือกไว้ไม่ถูกจำข้ามหน้า กลับเข้าหน้าคะแนนเริ่มที่ห้องแรกเสมอ โหลด 2 รอบ สปินเนอร์ 2 ครั้ง (api.ts:30 ใช้ no-store, SW ไม่แตะ /api โดยตั้งใจ)
2. **Gradebook วาดตาราง 616 ช่องใหม่ทั้งตาราง** ทุก scroll event (GradebookNav.tsx:17-27 + Gradebook.tsx:369), ทุกครั้งที่เปิดเมนู (Gradebook.tsx:85-86,496,517 → ตรงกับอาการ "เมนูหน่วง"), ทุก 15 วินาทีขณะนิ่ง (outbox.ts:49,51,89,254 สร้าง Map/Set ใหม่ทุกครั้ง), และกรอกคะแนน 1 ช่องวาด 4-5 รอบ
3. **แต่ละคำขอรอ D1 3 รอบต่อกัน** (worker/app.ts:47-75 preamble + 2 รอบ) และ payload มีฟิลด์ที่ไคลเอนต์ไม่ใช้ราวครึ่งหนึ่ง (gradebook 188→87 KB ดิบ, attendance ใน summary 946→~430 KB ที่ 100 วันเรียน ซึ่งโตตามจำนวนวัน)

ไม่พบ N+1 · ไม่มี backdrop-filter · เมนูข้าง/แถบล่างไม่มี transition

## จุดอื่นที่มีผล
- cold start เป็น waterfall: /api/auth/me → /api/bootstrap → คำขอของหน้า ระหว่างนั้นสปินเนอร์เต็มจอ ทั้งที่มี bootstrap ใน IDB (app.tsx:50,59-64,90-96)
- ไอคอน tabler ทั้งชุด: กฎ .ti-* 5,229 กฎ = 74% ของ CSS (268 KB) ฟอนต์ woff2 504 KB แต่ใช้จริงราว 140 ตัว (2.7%) · @font-face ไม่มี font-display · มีผลที่ cold start/ตอนติดตั้ง ไม่ใช่ตอนเปลี่ยนหน้า
- Gradebook บน iPad: ~90 เซลล์ sticky ที่มี box-shadow รายเซลล์ + scroll-snap mandatory (grade.css:30,32,45,48,56,104) ต้อง composite ทุกเฟรมตอนเลื่อน (ประมาณ ต้องยืนยันด้วย Web Inspector)
- dashboard อ่านราว 25k rows ต่อการเข้า Home/Scan หนึ่งครั้ง (routes/dashboard.ts:28-73) มากสุดในระบบ · จบรอบสแกนสแกนทั้งตาราง submissions (assignments.ts:202-210) · ควรเพิ่ม index attendance_sessions(class_id,date)

## ข้อเสนอ P1–P12 (เรียงตามผลต่อครู)
| # | ข้อเสนอ | ผล | ขนาด | ความเสี่ยง |
|---|---|---|---|---|
| P4 | outbox ข้ามการ assign ถ้าเนื้อหาเหมือนเดิม | ตอนนิ่งไม่วาดใหม่ทุก 15 วินาที | XS | ต่ำ |
| P2 | จำห้อง/วิชาล่าสุดข้ามหน้า (แบบเดียวกับ termId) | 2 โหลด → 1 | XS–S | ต่ำ |
| P3 | ย้าย useScrollInfo เข้า GradebookNav ใช้ rAF/classList | scroll ไม่วาดทั้งตาราง | S | ต่ำ ต้องเทสต์ minimap/jump |
| P1 | แคช SWR ในหน่วยความจำต่อ URL ของ gradebook/summary (แสดงทันที แล้วโหลดเบื้องหลัง) | สปินเนอร์ทุกครั้ง → เห็นข้อมูลทันที | S–M | 🔄 ต้องล้างเมื่อ logout/เปลี่ยนบริบท/หลังเขียน · 🔐 เก็บในหน่วยความจำเท่านั้น |
| P5 | แยกตารางเป็น component memo (ต่อแถว) | เปิดเมนูไม่วาด 616 ช่อง · กรอก 1 ช่องวาด 1 แถว | M | กลาง เทสต์ Enter→ช่องถัดไป/unsaved/fold |
| P6 | ตัดฟิลด์ payload (gradebook 5 ฟิลด์, attendance 3 ฟิลด์) | −54% / −55% ขนาดดิบ | XS–S | ต่ำ–กลาง |
| P7 | ลดรอบ D1 3 → 2 ด้วย subquery | −1 round trip | S–M | กลาง กฎ roster ต้องเหมือนเดิม |
| P8 | cold start แสดงจาก bootstrap ใน IDB ก่อน ยิง me+bootstrap พร้อมกัน | เห็นข้อมูลทันทีตอนเปิดแอป | M | 🔐 ต้องให้ Security ตรวจ |
| P9 | subset ไอคอนเหลือ ~140 ตัว/inline SVG + font-display | CSS 258→~70 KB, ฟอนต์ 504→~15–30 KB | S–M | กลาง ไอคอนจาก DB ต้องอยู่ allowlist |
| P10 | เอา box-shadow รายเซลล์ออก ใช้เงาขอบเฟรมที่มีอยู่ + snap แบบ proximity | ลดงาน composite | XS | ต่ำ ต้องให้เจ้าของงานดูดีไซน์ |
| P11 | index attendance_sessions(class_id,date) + จบรอบสแกนใช้ PK prefix + ทบทวน dashboard | ลด rows read (โควตาฟรี 5M/วัน) | XS–S | ต่ำ ต้องทำ migration |
| P12 | แยก chunk หน้าที่ใช้ไม่บ่อย | ลด parse ตอน cold start | S | ต่ำ |

ลำดับที่แนะนำ: P4 + P2 + P3 → P1 → P5 → P6/P7 → P8 → P9–P12

## ต้องวัดบน iPad จริง (ยังไม่มีตัวเลขจริง)
1. Safari Web Inspector → Timelines: render Gradebook ครั้งแรก, เปิดเมนู ⋮, ปัดตาราง
2. production /api/gradebook: Content-Encoding, ขนาดบนสาย, Server-Timing (worker/app.ts:27-31 มีอยู่แล้ว) และเวลารวม

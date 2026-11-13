# Security review part 5 (T-88) — สอบสวน "ชื่อเหลือ 1 ครั้ง"

สรุป: **ไม่ใช่การรั่ว (false positive ของสคริปต์ QA)** · ไม่มีข้อต้องแก้ · tree:2df7c74d2598, ใช้ fixture-server พอร์ต 4251 + build แช่แข็ง (QA_ASSETS), ปิด server แล้ว

## ที่มาของ "1 ครั้ง"
- fixture (scripts/seed-demo.sql:22,54) มีนักเรียนชื่อเล่น **"พิมพ์"** (stu_6, stu_63_1 ฯลฯ)
- `countNames` ใน m-misc.cjs:7-9 นับ substring ของ first_name/nickname (>=3 ตัว) ใน innerText + aria-label/title/placeholder
- "พิมพ์" = คำไทยที่เป็นปุ่ม/ข้อความ UI ปกติ ไม่ใช่ชื่อนักเรียน เช่น
  - scan: `DIV.page-sub` "ยิงแล้วพิมพ์คะแนน"
  - gradebook: `CAPTION.sr-only` "...พิมพ์ตัวเลขเพื่อกรอกคะแนน..."
  - reports: ปุ่ม "พิมพ์" (aria-label + span)
  - students: ปุ่ม "พิมพ์ทั้งห้อง"
- probe ใหม่ (scratchpad probe-s.cjs): ซ่อนชื่อของแต่ละหน้าด้วยปุ่มของหน้านั้น แล้วไล่ทุก element (ข้อความ+aria-label/title/alt/placeholder/value): ผลหลังซ่อน เหลือเฉพาะชื่อเล่น "พิมพ์" ที่ชนกับคำ UI ทั้งหมด — **ไม่มีชื่อ/นามสกุลจริงเหลือเลย** · attendance 0, home 0, random 0
- หมายเหตุ: ตัวเลข after-hide ของ QA (attendance 78, gradebook 59, reports 59) เกิดจากสคริปต์กดซ่อนที่หน้า students เท่านั้น ขณะที่สวิตช์ซ่อนเป็นรายหน้า (hideSignal("scan"/"students"/... ) ใน lib/hideNames, BR-18/BR-50) ไม่ได้แปลว่ารั่ว · แต่ก็ทำให้ Q-7107/7304 ของ QA ไม่ได้พิสูจน์ gradebook/reports/attendance — การตรวจของฉัน (ซ่อนทีละหน้า) ปิดช่องนี้แล้ว
- print media: ไม่ได้รันซ้ำ (สคริปต์ QA ใช้สวิตช์ผิดหน้าเช่นกัน) แต่ซ่อนเป็น state ใน DOM ไม่ใช่ CSS จึงเหมือนกันทั้ง screen/print

## ระดับ
ไม่มี P1/P2/P3 — AR-1 (สติกเกอร์ QR/ใบพิมพ์ชื่อเต็ม) ไม่นับตามที่ตกลง
เสนอ (ไม่ใช่ข้อบกพร่องโค้ด): ให้ QA แก้ countNames ใช้ชื่อ-นามสกุลเต็ม/ตัดคำสามัญ และกดซ่อนต่อหน้า

## หลักฐานซ้ำ
- npm audit (--omit=dev ผ่าน npm audit --json): critical 0 high 0 moderate 0 low 0 · diff ตั้งแต่ part-2 เป็น src/ (GradebookNav, Timeline, SessionSetup, css) ไม่แตะ worker/shared/migrations, ไม่มี dependency ใหม่
- threat model: 6 entry points เดิมไม่เปลี่ยน; diff ใหม่เป็น UI/CSS ไม่เพิ่ม input/endpoint

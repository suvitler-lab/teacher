# Verify QA-H (T-83) — วัดซ้ำ 16 หลักฐาน QA เดิมบน snapshot สุดท้าย
สถานะ: กำลังทำ · snapshot = tree:4ee1867055d6 (ตรงกับ quality-gate --print-snapshot) · build = สำเนาแช่แข็ง scratchpad/dist-h (จาก dist/client/client; ไม่มี src ใหม่กว่า dist)
วิธี: playwright chromium + CDP `Emulation.setDeviceMetricsOverride mobile:true` + `setTouchEmulationEnabled` (อุปกรณ์สัมผัส) · ไม่ฉีด CSS/JS บังคับขนาด · fixture-server ข้อมูลสมมติ พอร์ต 4220–4226 · สคริปต์อยู่ evidence/verify-h/

## ความคืบหน้า (อัปเดตทุก ~5 รอบ)
- (รอบ ~25) สคริปต์: lib.cjs (server+CDP mobile/touch+login), m-gb.cjs (AC-150), m-rs.cjs (รายงาน/นักเรียน), m-long.cjs (ชื่อ 200 ตัว), m-ui.cjs (สุ่มชื่อ/สแกน/ขนาดปุ่มกด), m-con.cjs (contrast) — ผลดิบเป็น *-result.json ในโฟลเดอร์เดียวกัน
- **Q-7601/7001 (AC-150) — เจอข้อต่าง:** fixture ชุดเดียวกับรอบเก่า (45 คน × 20 งาน ชนิดเดียว) ได้ 18/10/11 แถว ตรงรอบเก่า; แต่ fixture `--layout` (คณิตศาสตร์ 14 งาน 4 ชนิดงาน = ค่าเริ่มต้นจริงของแอป) toolbar ห่อ 2 บรรทัดที่ iPad นอน (112px) และแถบงานสูง 117 ที่ iPad ตั้ง → แถว 8 / 17 (ต่ำกว่าเกณฑ์ 10 / 18) และ toolbar คอม 46 > 44 → ดู B-H1
- Q-7602 (AC-171): ตาราง 58.5% @1536 / 57.7% @1180, แถว 10/10, ความจุ iPad ตั้ง 19 = ตรงรอบเก่า ผ่าน (denominator = ความกว้าง content ของ main)
- Q-7603 (AC-185): นักเรียน 12 (820) / 8 (1180) / 9 (1536) / 8 (390 มือถือ) ผ่าน
- Q-7604: .ttl ถูก clamp 2 บรรทัด (58px@375) ไม่ล้นแนวนอน แต่ `.hma-txt h3` ในไทม์ไลน์ layout A ไม่ clamp (403px สูงที่ 375) → B-H2 (ต่ำ)

## สรุปสุดท้าย (หมดรอบ ~45)
บันทึกด้วย id เดิมแล้ว: PASS 7007, 7008, 7009, 7102, 7106, 7107, 7304, 7602, 7603 · FAIL 7001, 7601 (B-H1), 7604 (B-H2), 7605 (B-H3) · BLOCKED 7010 (home-b วัดไม่สรุป), 7305 (ยังไม่ยืนยันว่า projector เปิดจริงในรอบ), 7308 (สคริปต์ tc เดิมหาย รันซ้ำได้แค่ TC-700/701)
- B-H1 (กลาง, ทำซ้ำได้): สมุดคะแนน fixture --layout (4 ชนิดงาน) iPad นอน toolbar 112px → 8 แถว (<10), iPad ตั้ง แถบงาน 117px → 17 แถว (<18), คอม toolbar 46>44; fixture ชนิดเดียวผ่าน 18/10/11 · ไฟล์: grade.css (.gb-toolbar/.gb-nav/.gb-work) · m-gb.cjs
- B-H2 (ต่ำ, ทำซ้ำได้): ชื่องาน 200 ตัวใน Timeline layout A ไม่ clamp (`.hma-txt h3`, Timeline.tsx:55 / home-a.css:53) สูง 403px ที่ 375 · แก้: line-clamp 2
- B-H3 (กลาง-ต่ำ): `.stu-tile:disabled` opacity .72 (students.css:178) ทำให้คอนทราสต์จริง 4.09 (pro light) / 4.13 (warm light) <4.5 (ค่าที่ T-75 วัดไม่รวม opacity)
- สังเกต: ปุ่มเฟือง desk 34x42 (P3 เดิม); ผลดิบ evidence/verify-h/*.json
พอร์ต 4220–4226 ใช้แล้ว server ปิดทุกตัว

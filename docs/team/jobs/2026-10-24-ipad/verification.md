# ผลตรวจรับหน้าจอ iPad — 24 ตุลาคม 2569

อัปเดต25ต.ค.2569: [deployระบบจริงและตรวจหลังปล่อยผ่านแล้ว](../2026-10-25-release/verification.md) ข้อความยังไม่deployในรายงานด้านล่างเป็นสถานะเมื่อจบรอบตรวจiPadวันที่24ต.ค.; อุปกรณ์iPad/กล้องจริงและทดลองหนึ่งห้องยังรอทดสอบ

**ผ่านการจำลองหน้าจอ 10/10 กลุ่มกรณี พบเพิ่ม 2 บั๊กและแก้พร้อมทดสอบซ้ำแล้ว รวมรายการแก้เดิม F01–F12 และรอบนี้ F13–F14 เป็น 14/14 ข้อใน local ไม่มีบั๊กที่ทราบและยังค้างในขอบเขตรอบนี้**

นี่คือ Chromium ที่ปรับ viewport เป็น 768×1024 และ 1024×768 บน Windows ไม่ใช่ iPadOS/Safari emulator จึงยังไม่ถือว่าผ่านอุปกรณ์จริง ข้อมูลทั้งหมดเป็นข้อมูลสมมติใน fixture แยก ไม่ได้ขึ้นปีใหม่หรือแก้คะแนนในระบบจริง

## ผลตรวจรับ

| กรณี | ผล | หลักฐานที่สังเกตได้ |
|---|---|---|
| IP01 เข้าใช้และหน้าแรก | PASS | ลงชื่อเข้าใช้ fixture และเปิดหน้าแรกแนวตั้ง; page scrollWidth ไม่เกิน viewport |
| IP02 สร้างงาน | PASS | สร้าง “ทดสอบ iPad คะแนน” เต็ม 10 ห้อง ป.6/1; DB มีงานในปี 2569/เทอม 1 |
| IP03 กรอกคะแนนต่อเนื่อง | PASS หลังแก้ F13 | Enter จากคน 1 ไปคน 2 แล้วไปคน 3; Escape ยกเลิกค่าคน 3; หลัง reload/DB คน 1=6 คน 2=9 คน 3 ยัง=10; ยืนยันอีกครั้งแนวนอนด้วยชุด build สุดท้าย |
| IP04 เช็คชื่อ | PASS | เลขที่ 1 มา เลขที่ 2 สาย; DB วันที่ 24 ต.ค. 2569 ตรง UI; แนวตั้งและแนวนอนไม่ล้นหน้า |
| IP05 รายงานและ Excel | PASS | โหลดใหม่เห็นงานทดสอบ 2/32 ณ เวลาส่งออก; ดาวน์โหลด XLSX จริง 4 sheets และตรวจรหัส 10501=7,10502=8 ตรง DB ณ เวลานั้น; ภายหลังกรอกทดสอบใหม่เป็น 6/9 และเพิ่มงานออฟไลน์ รายงานเก่าแสดง 4/32 ตามข้อมูลล่าสุด |
| IP06 ขาดการเชื่อมต่อและส่งกลับ | PASS หลังแก้ F14 | งานเพิ่งสร้างยังมีชื่อ/metadata หลัง reload ขณะ socket ถูกตัด; คิวเดิมยังอยู่; ทดสอบรับ→ยกเลิก→รับ, กรอกเลขที่ซ้ำแจ้งไม่บันทึกซ้ำ; ต่อกลับส่งคิวหมด DB20701 มีหนึ่ง submission คะแนน10; รอบแรก10503/10504 ส่งกลับ10/10ทั้งคู่ |
| IP07 ค้นหาและรายละเอียดนักเรียน | PASS | ค้นหารหัส10501 เปิดรายละเอียดด้วย Enter ปิดด้วย Escape คืน focus ปุ่มนักเรียนเดิม |
| IP08 รุ่น ป.6 และเปลี่ยนปี | PASS | เริ่ม1/2570 ได้ห้องว่าง3ห้อง; รุ่นเดิม39คนจบปี รายงานป.6/1เก่า32คนยังอยู่; เพิ่มรุ่นใหม่20701แยกจากปี2569; DBคะแนน/เช็คชื่อเก่าไม่เปลี่ยน |
| IP09 กรองและรายงานเมื่อโหลดไม่ได้ | PASS | เปลี่ยนห้อง32→4คนไม่แสดงชุดเดิม; โหลดใหม่ตอนเชื่อมต่อไม่ได้เก็บข้อมูลครั้งก่อนพร้อมคำเตือน; ต่อกลับโหลดสำเร็จ |
| IP10 สุ่มชื่อ | PASS | เมื่อยังไม่เช็คชื่อมีทางเลือกใช้ทั้งห้อง; สุ่มได้เฉพาะนักเรียนใหม่20701 เรียกแล้ว1 เหลือ0 ไม่ดึงรุ่นเก่า |
| Safari / Home Screen PWA / sleep-wake จริง | NOT RUN | ไม่มีเครื่อง iPad หรือ WebKit runtime ในสภาพแวดล้อมนี้ |
| กล้องและบัตร QR จริง | NOT RUN | ตรวจ logic ด้วย automated tests แต่ไม่ได้ให้สิทธิ์หรือเปิดกล้องจริง |
| Touch / แป้นพิมพ์จอ / การใช้งานสอนจริง | NOT RUN | viewport และคีย์บอร์ดจำลองไม่พิสูจน์พฤติกรรมเหล่านี้ |

การตัดการเชื่อมต่อรอบนี้เป็น server unreachable ขณะที่ navigator ยังเห็นเครือข่าย ปรับป้ายหน้าสแกนให้ตรวจการเข้าถึงเซิร์ฟเวอร์ด้วยเหมือนเมนูหลักแล้ว และ browser ยืนยันทั้งสองป้ายเป็นออฟไลน์พร้อมกัน ก่อนกลับเป็นออนไลน์เมื่อต่อกลับ ดู scan-connectivity-final-offline/online.txt การแตะเลขที่ที่รับแล้วเป็นคำสั่งยกเลิกตาม flow เดิม ส่วนพิมพ์เลขที่ซ้ำไม่บันทึกซ้ำ

เช็คชื่อวันที่24ต.ค.อยู่นอกเทอมสมมติที่สิ้นสุด10ต.ค. จึงไม่รวมในรายงานทั้งเทอม1/2569ซึ่งแสดง5วันตามข้อมูลเดิม ไม่ใช่การ sync หาย การเทียบ Excel ใช้ snapshot ก่อนทดสอบเปลี่ยนคะแนนรอบถัดไป ดู [ผลตรวจไฟล์](evidence/excel-verification.json)

## บั๊กที่พบและแก้เพิ่ม

| ข้อ | อาการก่อนแก้ | การแก้และผลซ้ำ |
|---|---|---|
| F13 | Enter ในช่องคะแนนกลับไปเปิดเซลล์เดิม ทำให้คะแนนคนถัดไปทับคนแรกได้ | ให้ตัวช่องคะแนนรับ Enter/Escape และหยุด event; เซลล์รับปุ่มเฉพาะเมื่อ focus อยู่ที่เซลล์เอง Browser หลัง build ไปแถวถัดไปจริงและ Escape ไม่บันทึก; component tests4กรณีผ่าน แต่ทั้ง4ผ่านก่อนแก้ด้วย จึงใช้ browser reproduction/retest เป็นหลักฐานปิดบั๊ก |
| F14 | งานที่สร้างใหม่อัปเดตเฉพาะหน่วยความจำ cache เก่าทำให้ reload ออฟไลน์ขึ้นว่างานถูกลบผิด; ป้ายหน้าสแกนยังบอกออนไลน์เมื่อเซิร์ฟเวอร์ติดต่อไม่ได้ | บันทึกการเปลี่ยน assignment ลง bootstrap cache แบบ atomic รอก่อนปิด modal; ไม่ตีความ metadata ที่ยังไม่ทราบว่าลบ; ตรวจ request context กัน response เก่าหลัง logout/restore ทั้ง memory/cache; server-confirmed closed/deleted ยังบล็อกตามเดิม; ป้ายเชื่อมต่อใช้สถานะเข้าถึงเซิร์ฟเวอร์ด้วย |

ผู้ตรวจที่ไม่ได้เขียน offline patch ตรวจอิสระและรันเองผ่าน34/34: [review](evidence/offline-independent-review.md), [log](evidence/offline-independent-tests.txt) ส่วน F13 ได้ PM ตรวจ browser อิสระจากผู้แก้โค้ด

## การตรวจรวมหลังรวมแพตช์

| การตรวจ | ผล |
|---|---|
| Full suite | **PASS 570/570 tests, 56 files**, exit0, Vitest18.08s — [log](evidence/full-tests-approved.txt) |
| Typecheck | PASS exit0 — [log](evidence/typecheck.txt) |
| Build | PASS exit0 — [log](evidence/build.txt); browser ใช้ `/assets/index-BF_Q-mYw.js` |
| Preflight | PASS config + migrations/schema — [log](evidence/preflight.txt) |
| Diff whitespace | PASS; มีเฉพาะคำเตือนLF/CRLFของWindows |
| Supplemental baseline | PASS115/115,7files ก่อนแพตช์รอบนี้; รวมอยู่ใน full suite สุดท้าย ไม่บวกซ้ำเป็นจำนวนใหม่ |

Full suite รอบแรกใน sandbox เริ่ม Workers runtime ไม่สำเร็จ (cloudflare:test-internal) ยังไม่รัน tests; รันซ้ำนอก sandbox หลังผ่าน automatic approval แล้วได้ exit0 ทั้ง570 tests จึงไม่รายงานรอบแรกเป็น product regression บันทึกไว้ใน full-tests.txt คำเตือน build เดิมเรื่อง Excel chunk, mixed imports และ Zod annotations ไม่ทำให้ build ล้ม

## หลักฐาน

- [ผล10กลุ่มกรณี](evidence/browser-checks.json)
- [รายงานแนวตั้ง](evidence/reports-final-portrait.png), [แนวนอน](evidence/reports-final-landscape.png)
- [คะแนนหลังแก้](evidence/gradebook-fixed-portrait.png), [คะแนนแนวนอน](evidence/gradebook-fixed-landscape.png)
- [งานใหม่หลังรีโหลดออฟไลน์](evidence/scan-offline-fixed-portrait.png), [ต่อกลับแล้ว](evidence/scan-reconnected-portrait.png)
- [ห้องว่างปีใหม่](evidence/new-year-empty-cohort.png), [รายงานปีก่อน](evidence/previous-year-report.png)
- [ฐานข้อมูลสุดท้าย](evidence/database-final-terminal.txt), [หลังเปลี่ยนปี](evidence/database-rollover-terminal.txt) เก็บ raw PTY output รวม terminal wrapping ตามจริง
- [ไฟล์ExcelจากUI](evidence/report-before-rollover.xlsx), [scriptตรวจค่า](evidence/check-export.cjs)

พร้อมส่งมอบโค้ดและหลักฐาน local ขั้นถัดไปคือทดลองบน Safari/iPad จริง กล้องและบัตรจริง แล้วทดลองหนึ่งห้องเทียบข้อมูล ไม่ได้ deploy หรือรับรองว่าผ่านอุปกรณ์จริงจากการจำลองนี้

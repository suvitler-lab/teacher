# Board: 2026-10-30-visual-polish-review

**ขั้นถัดไป:** งานปิดแล้ว — Gate 2 อนุมัติ (D20–D22) · งานทำจริงคือ VP-1..VP-7 ใน `programs/2026-10-program/program.md` (เริ่ม VP-1 หลัง M1)

- session: `2026-10-program-20261029-1200`
- รอบแก้ (Verify): 0/3
- snapshot ล่าสุดที่รันชุดตรวจหลัก: ไม่เกี่ยว (งานออกแบบ ไม่แก้โค้ด)

| Task | ตำแหน่ง | สถานะ | หลักฐาน |
|---|---|---|---|
| T-01 visual audit + visual-design.md + mockup | Web Designer | รอตรวจ (รอบ 3: ฝัง SVG ไอคอนใน overview.html — PM เปิดแล้วพบไอคอนไม่ขึ้นเพราะ path node_modules) | `visual-design.md` 152 บรรทัด: contrast 5 คู่ต่ำกว่า AA, ไอคอนซ้อนความหมาย 7 ข้อ, app icon ใหม่, tokens ที่เสนอพร้อมค่า, job V1–V7 · `design/current/*.jpg` 25 ภาพ · `design/mockups/overview.html` (PM ตรวจ toggle ก่อน/หลัง, สว่าง/มืด, 375/1024/desktop ใช้ได้) · server 4107 ปิดแล้ว |
| T-02 icon/microcopy/accessibility audit → ux.md | UX/UI | เสร็จ | `ux.md`: ไอคอน 79 ชื่อ + ข้อเสนอ Tabler จริง · a11y วัดจริง 375/1024: hit target FAIL (40px มือถือ, 28–38px iPad แนวนอน, select 24px — base.css:166), focus-visible ไม่มี, `--text-muted` 2.90:1, ไม่มี h1–h4 · microcopy 15 ข้อ · กติกาไอคอน 9 ข้อ · job UX-1..7 ลำดับ 5→4→1→6→2→3→7 · server 4109 ปิดแล้ว |
| T-03 รวมข้อเสนอ นำเสนอ Gate 2 | PM | เสร็จ | PM เปิด overview.html ตรวจเอง (toggle ก่อน/หลัง/มืด/ขนาด ใช้ได้, ไอคอน inline SVG ขึ้นครบ) · ส่งให้เจ้าของงาน · Gate 2 อนุมัติ 30 ต.ค. |

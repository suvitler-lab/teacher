# Board: 2026-11-11-home-redesign

**ขั้นถัดไป:** Gate 2 ผ่านแล้ว → รอ SA แก้ AC-07/AC-44/AC-21,30–32 → trace-check → ขอ checkpoint เอกสารออกแบบ → เฟส 3 ช่วงที่ 1 (ระบบธีม + ตั้งค่า›หน้าตา + เมนู + หน้าหลัก 3 โครง): Tech Lead (opus·high) plan/ownership ∥ QA test plan + pages.json — แนะนำ session ใหม่ `/dev-team continue`

session: `home-redesign-20261111-0900` (ใช้กับ job-lock --session) · เฟสปัจจุบัน: 2 Design · รอบแก้ (Verify): 0/3 · เรียก agent แล้ว: 4 ครั้ง (คาดอีก ~1)
ภาพ: before ✗ after ✗ Gate V ✗ · กล่องสถานะล่าสุดโพสต์เมื่อ: 2026-11-11 · อัปเดต board: 2026-11-11
snapshot ล่าสุดที่รันชุดตรวจหลัก: `—` · ผล: ยังไม่รัน (รอบออกแบบ ไม่แตะโค้ด)

| Task | งาน | ตำแหน่ง | ไฟล์ที่ถือ | AC | รอ | พอร์ต | สถานะ | หลักฐาน |
|---|---|---|---|---|---|---|---|---|
| T-01 | ร่างอ้างอิง 3 โครง × 4 ธีม | Web Designer | design/draft.html | — | — | 4190 | เสร็จ | PM: 96 ชุดไม่มี error, ไม่ล้นที่ 390px |
| T-02 | requirements หน้าหลักใหม่ + ธีม | SA | requirements.md | — | — | — | เสร็จ | requirements.md AC-01–43 |
| T-03 | ux.md + สถานะหน้าจอ | UX/UI | ux.md | — | — | — | เสร็จ | ux.md (29,597 อักขระ) · พบ 13 ข้อใน draft |
| T-04 | mockup เต็ม + tokens ต่อธีม | Web Designer | design/preview.html, visual-design.md | — | — | 4190 | เสร็จ | Web: 720 ชุดไม่มี error · PM: เปิดซ้ำไม่มี error, 88% ✓, ไม่มีธีมเรียบหรู |

## Checkpoints

| เฟส | commit | วันที่ | เทสต์ |
|---|---|---|---|

## บันทึก

- 2026-11-11 Gate 0 ตอบแล้ว (L, 4 ธีมเลือกได้, motion เล็กน้อย) · ร่างคร่าว ๆ ในแชท → "อยากให้ต่างจากเดิมมากกว่านี้" · แผนอนุมัติ
- 2026-11-11 เปิด branch `team/2026-11-11-home-redesign` · สั่ง Web Designer (opus·high) T-01
- 2026-11-11 Web Designer ชน maxTurns ไม่ส่งรายงาน (draft-notes ไม่ครบ) แต่ draft.html เสร็จ 1041 บรรทัด · PM ตรวจเองใน pane: 3 โครง × 4 ธีม × 2 โหมด × 4 จอ ไม่มี console error · เปิด Gate R ที่พอร์ต 4190
- 2026-11-11 Gate R อนุมัติ: 3 โครงเลือกได้ในตั้งค่า + 3 ธีม (ตัดเรียบหรู) · สั่ง SA (opus·medium) T-02 ∥ UX (sonnet·medium) T-03
- 2026-11-11 UX ส่ง ux.md: 13 สถานะต่อโครง + ตั้งค่า "หน้าตา" · ข้อสำคัญใน draft: ปุ่ม "เสร็จแล้ว" ปลอม, เวลาคาบประดิษฐ์ (ไม่มีตารางสอน), ✓ ธีมสดใส contrast 2.23, ไม่มีซ่อนชื่อ, hero สูงเกินที่ 729px, ฟอนต์ต้องฝังออฟไลน์ → ส่งต่อ Web Designer T-04
- 2026-11-11 SA ส่ง requirements.md (AC-01–43, trace-check PASS, warn EP-ใหม่ 3) · Gate 1 อนุมัติ: เริ่มต้นโครง ก + ธีมอบอุ่น · เก็บบนเซิร์ฟเวอร์ · สูตร % เดิม · ข้อเสนอ API 3 ข้อ = งานแยกหลังหน้าใหม่ · สั่ง Web Designer (opus·medium) T-04
- 2026-11-11 SA ปรับ requirements ตาม Gate 1 (AC-44 หน้าตา, เอา "เสร็จแล้ว" ออก) · trace-check PASS · ค้างถามเจ้าของงานพร้อม Gate 2: (1) บันทึกหน้าตาล้มเหลว/ออฟไลน์ ย้อนค่า (D38) หรือเข้าคิว (2) "ปรับหน้าหลัก" เลือกโครงอย่างเดียว หรือซ่อน/แสดงการ์ดต่อโครง (3) ย้ายสว่าง/มืด+ขนาดตัวอักษรมาไว้ "หน้าตา"
- 2026-11-11 Web Designer ส่ง preview.html + visual-design.md (Phosphor icons MIT, @fontsource OFL, data-skin) · ยังไม่ได้ตรวจ: contrast สถานะข้อมูลเยอะ/แผ่น, iPad/Safari จริง, VoiceOver · ไม่มีตัวสลับก่อน-หลัง · เปิด Gate 2
- 2026-11-11 Gate 2 อนุมัติ: "ผ่าน เริ่มทำจริงได้" · ย้อนค่าเดิมแล้วแจ้ง · ปรับหน้าหลัก = เลือกโครง + ซ่อน/แสดงการ์ด · ย้ายขนาดตัวอักษรมารวม "หน้าตา" · ส่ง SA แก้ AC (resume ครั้งที่ 2/2)

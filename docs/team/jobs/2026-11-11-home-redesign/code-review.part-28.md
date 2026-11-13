# Code review part 28 — T-81 ตรวจซ้ำหลักฐาน stale 26 รายการ (snapshot tree:4ee1867055d6, 2026-11-13)

ฐานเทียบ "ต้นฉบับ" = f3875d5 (ก่อน build) · ความต่างตั้งแต่ checkpoint = `git diff e1bd05e` (ไม่มี logic ของ home/scan/report/random/shared/worker เปลี่ยน; มีแค่ title attr, ไอคอน, guard ออนไลน์/ฉายจอ ของ StartTerm/Restore, CSS แท็บเล็ต)

| id | ผล | วิธีรันซ้ำ / หมายเหตุ |
|---|---|---|
| Q-3102 | PASS | vitest hr-menu-nav 11/11; R-01 แก้แล้วในเทสต์ (settle 60ms + เช็ก hash/route) · mutation probe ไม่ได้รันซ้ำ (แก้ src ไม่ได้) |
| Q-6502 | PASS | grep ไม่พบ ref; fixture-server 2 flag → exit 2 |
| Q-3202 | PASS | grep "ข้อมูลพื้นฐาน" src = 0 |
| Q-3703 | PASS | อ่าน diff scan/*, scan.css: ไม่เปลี่ยน a11y · ไม่มี screen reader จริง |
| Q-4602 | PASS | percentOf 89/74/27/null · Gradebook.tsx:1139 → shared/metrics.ts:200 |
| Q-3803 | PASS | ไฟล์ scan ไม่เปลี่ยนสาระ; scan tests 20 ไฟล์ 205 ผ่าน |
| Q-3303 | PASS | homecore-logic/page/layout 83 ผ่าน; src/lib ไม่เปลี่ยน |
| Q-3304 | PASS | home.css ไม่มี hex/rgb/transition |
| Q-3903 | PASS | diff -w ต่อฟังก์ชัน: ต่างแค่ export, opId, UI state (roundHow/staleFull), undoToast (R-3803) — payload/enqueue ไม่เปลี่ยน |
| Q-4903 | PASS* | shared/worker/reportExport/excel ว่าง; report.ts +11 ไม่ลบ · *cards/meta.ts ต่างจากฐานแล้ว (ชื่อ/คำอธิบายการ์ด + การ์ด absent จากงานหลัง) เป็น metadata แสดงผล ไม่ใช่ logic ส่งออก |
| Q-4904 | PASS | hr-rp-t49 ผ่าน |
| Q-3402 | PASS | อ่านโค้ด + เทสต์ค่า; ไม่ได้ถ่ายภาพใหม่ |
| Q-3503 | PASS | hr-layout-b-ui ผ่าน; b/* ไม่เปลี่ยน |
| Q-3504 | PASS | ไม่มี Legacy; มีแค่ #000 ใน mask-image |
| Q-3603 | PASS | Home.tsx deferred in-memory รีเซ็ตเมื่อเปลี่ยนเทอม |
| Q-5003 | PASS | report.ts +11/-0; report.css ไม่มีสีใหม่ |
| Q-4002 | PASS | ดู Q-3903 |
| Q-4005 | PASS | ทุกจุดที่แสดงชื่อใน scan ผูก scanHiding(); คัดลอกถูกปิดเมื่อซ่อน |
| Q-4802 | PASS | nameOf/whoOf/fullName ตาม hide; ปุ่มคัดลอก disabled เมื่อซ่อน |
| Q-5203 | PASS | diff เทสต์ = เปลี่ยนชื่อปุ่ม + ST sum เป็น hero ล็อก (ตั้งใจ) |
| Q-5206 | PASS | ph-download 2 / ph-funnel 4 ใน bold css |
| Q-4304 | PASS | นิยาม applyEdits/statusOf/counts ไม่อยู่ใน diff |
| Q-5404 | PASS* | probe เดิมหาย → รัน hr-sg* 6 ไฟล์ 133 ผ่าน (projector/offline ปิดปุ่มเขียน) |
| Q-4402 | PASS | random.ts ไม่ต่าง; sound.ts เพิ่มอย่างเดียว; tsc ไม่มี error random/sound |
| Q-4403 | PASS | roundCounts 41/24/17/41 |
| Q-4502 | PASS | random.ts ว่าง |

## finding ใหม่
ไม่มี P1/P2/P3 ใหม่
- หมายเหตุ: Q-3102 mutation และ Q-5404 probe เดิมไม่ได้รันซ้ำตรงตัว (ไม่มีสิทธิ์แก้ src / สคริปต์หาย) — ใช้เทสต์ที่มีอยู่แทน

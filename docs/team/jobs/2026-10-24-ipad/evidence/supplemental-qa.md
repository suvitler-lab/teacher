# Supplemental QA สำหรับการจำลองขนาดจอ iPad

วันที่ตามบริบทผู้ใช้: 24 ตุลาคม 2569 · environment: local, isolated Vitest D1 + jsdom

## Code state

เปรียบเทียบ SHA-256 ของ 196 ไฟล์กับ `../../2026-10-24-hardening/evidence/code-state.json`: **drift 0** ก่อนรันทดสอบ ไม่มีการแก้ application source โดย QA รอบนี้

## คำสั่งและผล

```text
npx vitest run test/api/school-year.test.ts test/api/backup-consistency.test.ts test/unit/offline.test.ts test/unit/attSync.test.ts test/unit/camera.test.ts test/unit/scan-controller.test.ts test/unit/excel-attendance.test.ts --reporter=dot
```

**PASS 7 files / 115 tests, exit 0, Vitest duration 27.67s**

หลักฐาน stdout/stderr: `supplemental-tests.txt`

- school-year: เทอมเดิม/ปีใหม่, ห้องรุ่นใหม่, รายงานรุ่นเก่าไม่เปลี่ยน, นำเข้ารุ่นใหม่, แก้คะแนนย้อนหลัง และการแข่งขันเริ่มเทอม
- backup consistency: fingerprint/paging และ backup → damage → restore เปรียบเทียบทุกแถวที่ขนาดข้อมูลจำลองของเทอมโรงเรียน
- offline: service-worker shell/assets และ lifecycle ของ cache ตาม mocked environment
- attendance drafts: แยกบริบทห้อง, ACK/retry/opId, conflict, epoch และออฟไลน์
- camera: logic อ่านกล้อง/fallback/error/diagnostics ด้วย mocks; ไม่ใช่การสแกนกระดาษหรือกล้องจริง
- scan controller: snapshot reconciliation และคำตอบเก่าที่มาทีหลัง
- Excel attendance: การสร้างข้อมูลคอลัมน์เช็คชื่อให้ตรง sessions

stderr WASM ใน camera negative test เป็นกรณีที่ตั้งใจจำลอง reader โหลดล้มเหลว ชุดทดสอบยังผ่านครบ ไม่ใช่หลักฐานว่า Safari/iPad ใช้งานกล้องได้แล้ว

## Engine availability ที่ตรวจแบบอ่านอย่างเดียว

- repo ไม่มี Playwright โดยตรง และ global npm modules ไม่พบแพ็กเกจนี้
- bundled runtime มี Playwright/Playwright Core 1.62.1 และ browsers metadata ระบุ WebKit revision 2336
- `executablePath()` ของ Chromium/WebKit ชี้ไป sandbox cache แต่ตรวจ `existsSync()` ได้ false ทั้งสอง paths; standard user cache ที่ตรวจไม่พบเช่นกัน
- ไม่ติดตั้ง browser engines ไม่เปิด WebKit/Chromium ผ่าน Playwright และไม่แตะเบราว์เซอร์หรือพอร์ตที่ PM เป็นเจ้าของ
- ผลนี้บอกเพียงว่าไม่พบ executable ใน paths/session ที่ตรวจ ไม่รับรองว่าเครื่องผู้ใช้ไม่มี WebKit ที่อื่น

## เกณฑ์แปลผล simulation

การทดสอบใน Chromium ที่ตั้ง viewport ขนาด iPad ยืนยันได้เฉพาะ layout/overflow, keyboard-capable web interactions, การส่งข้อมูลของ browser engine นั้น และ behavior ที่ทดสอบจริงเท่านั้น ไม่ควรเรียกเป็นผลผ่านบน Safari/iPad hardware

PM ควรเชื่อม UI scenario กับหลักฐานการเขียน/โหลดกลับจาก fixture (คะแนน/เช็คชื่อ), การส่งคิวหลังเครือข่ายกลับ, การ reload และรายงานที่ตรงกับข้อมูลก่อนปิด technical verification

ยังต้องทำ hardware smoke ครั้งสั้นบน iPad ก่อนรับรองอุปกรณ์: Safari กับ Home Screen PWA, permission กล้อง, QR ที่พิมพ์จริง, touch/soft keyboard, background/sleep/close-reopen, offline persistence และดาวน์โหลดไฟล์ ภารกิจเหล่านี้ให้สถานะ NOT RUN จนมีหลักฐานจริง

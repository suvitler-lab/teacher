# แก้กรณีงานใหม่หายจากข้อมูลออฟไลน์

พบระหว่าง PM ทดสอบหน้าสแกนที่ขนาดจอ iPad: สร้างงานหลัง bootstrap ครั้งล่าสุด → รับงานระหว่างติดต่อเซิร์ฟเวอร์ไม่ได้ → reload ทำให้ metadata ของงานใหม่ไม่อยู่ใน bootstrap cache และหน้าสแกนเดิมตีความว่า “งานนี้ถูกลบแล้ว” ทั้งที่ไม่มีคำตอบยืนยันจากเซิร์ฟเวอร์

## เปลี่ยนแปลง

- `src/store.ts`: การเพิ่ม/แก้ไข/ลบงานที่เซิร์ฟเวอร์ยืนยันแล้วอัปเดต bootstrap cache ด้วย; การลบที่ยืนยันแล้วมี tombstone ในหน่วยความจำ
- `src/lib/idb.ts`: read–modify–write ใน transaction เดียวเพื่อไม่ให้ concurrent assignment changes ทับกัน และไม่สร้าง bootstrap ที่ถูกล้างตอนออกระบบขึ้นใหม่
- `src/pages/Scan.tsx`: absence ใน cache ที่อาจไม่ครบไม่ใช่หลักฐานว่าลบแล้ว; ยังเข้าคิวและให้เซิร์ฟเวอร์ตรวจตามเดิม การปิด/ลบที่ยืนยันจากเซิร์ฟเวอร์ยังปฏิเสธการรับงาน
- `src/components/AssignmentModal.tsx`: รอเขียน metadata cache ก่อนปิดหน้าสร้างงาน
- คำขอเกี่ยวกับ metadata จับ `{epoch, revision}` ก่อนส่งใน AssignmentModal, Gradebook และ Scan; revision เปลี่ยนเมื่อ bootstrap ถูกแทนที่หรือเริ่มออกระบบ จึงไม่ให้ response เก่าผสมข้อมูลหลัง restore หรือการเข้าสู่ระบบรอบใหม่แม้ epoch เท่ากัน

## Verification ที่รันจริง

```text
npx vitest run --project dom test/unit/assignment-offline-cache.test.ts test/unit/scan-controller.test.ts test/unit/scan-score-entry.test.tsx test/unit/gradebook-enter.test.tsx test/unit/gradebook-visibility.test.tsx --maxWorkers=1 --reporter=dot
Test Files 5 passed (5), Tests 50 passed (50), exit 0, Vitest duration 5.02s

npm run typecheck
tsc --noEmit, exit 0
```

สองครั้งแรก Vitest import ไม่เริ่มเพราะ Windows sandbox ปฏิเสธ rename temporary transform cache (`EPERM`); คำสั่ง local test ที่ผ่านใช้ approved escalation เพื่อรันนอก sandbox ไม่มีการติดตั้ง dependency หรือเผยแพร่ระบบ

Regression ใหม่ตรวจ: สร้างงานแล้วโหลด bootstrap แบบ offline กลับมา, concurrent changes, ลบงาน, logout ขณะ cache กำลังเขียน, late response หลัง logout, restore epoch ใหม่ และ logout → sign-in ที่ epoch เดิม รวมถึง scanner unknown/confirmed-deleted/confirmed-closed และ snapshot ที่มาหลัง logout

Tombstone ไม่ถูกอ้างเป็นประวัติถาวร: เมื่อเริ่ม offline ใหม่แล้วไม่มี metadata หรือคำตอบยืนยัน จะถือเป็น unknown และเก็บรายการเข้าคิวให้เซิร์ฟเวอร์ตรวจ ไม่อ้างว่ารับงานสำเร็จบนเซิร์ฟเวอร์แล้ว การยืนยัน layout/IndexedDB/service worker ใน browser และฐานข้อมูลจริงของ fixture เป็นหลักฐานส่วนที่ PM ทดสอบแยกจาก unit tests นี้

## F14 เพิ่มเติม: สถานะเชื่อมต่อในหน้าสแกน

PM พบว่าป้ายของหน้าสแกนยังอาศัย browser online อย่างเดียว แม้ป้ายหลักตรวจพบว่าติดต่อเซิร์ฟเวอร์ไม่ได้แล้ว แก้ให้สี icon และข้อความใช้ `online && serverReachable` สอดคล้องกับป้ายหลัก เพิ่ม rendered UI regression ใน `scan-controller.test.ts`: browser มีเครือข่ายแต่ server unreachable → “ออฟไลน์”, server กลับมา → “ออนไลน์”, browser offline → “ออฟไลน์”

```text
npx vitest run --project dom test/unit/scan-controller.test.ts test/unit/scan-score-entry.test.tsx --maxWorkers=1 --reporter=dot
Test Files 2 passed (2), Tests 35 passed (35), exit 0, Vitest duration 2.20s
```

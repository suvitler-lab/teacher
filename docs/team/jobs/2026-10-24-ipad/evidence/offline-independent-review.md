# ตรวจอิสระ: offline assignment cache และ scan metadata

ผล: **PASS** สำหรับขอบเขตแพตช์ปัจจุบัน ไม่มีข้อค้นพบที่ขัดเงื่อนไขรับงานค้างอยู่ ผู้ตรวจไม่ได้เขียนแพตช์ offline นี้ และไม่ได้ควบคุม browser/server/production ในรอบตรวจ

ตรวจ `store.ts`, `lib/idb.ts`, `pages/Scan.tsx`, `components/AssignmentModal.tsx`, ส่วน request context ใน `pages/Gradebook.tsx` และ tests ที่เกี่ยวข้อง สถานะไฟล์ผูกไว้กับ SHA256 ใน `offline-independent-code-state.json`

- IDB read/modify/write อยู่ใน readwrite transaction เดียว จึงไม่ทำให้ concurrent assignment changes ทับกัน
- bootstrap ที่หายไปหรือเป็น null หลัง logout ไม่ถูกสร้างกลับด้วย assignment mutation
- context จับ epoch และ revision ก่อนส่ง API; revision เปลี่ยนเมื่อ bootstrap ถูกแทนที่หรือเริ่ม logout จึงกันทั้ง restore และการเข้าสู่ระบบครั้งถัดไปที่ใช้ epoch เดิม
- ตรวจ context ก่อนแก้ข้อมูลในหน่วยความจำและภายใน cache transaction; การสร้าง/แก้ไขงานตรวจอีกครั้งหลังรอ cache ก่อนยืนยันผลใน UI
- metadata ที่ยังไม่ทราบไม่ถูกใช้เป็นหลักฐานว่างานถูกลบ ส่วน server-confirmed deletion และ closed status ยังบล็อกการรับงาน

ข้อค้นพบก่อนแก้: helper รุ่นแรกจับ epoch เมื่อ response กลับ ทำให้ response ของข้อมูลก่อน restore อาจเข้า cache ใหม่ได้ ผู้พัฒนาเพิ่ม request context guard และ regression tests แล้ว จึงปิดข้อค้นพบนี้

ผลรันโดยผู้ตรวจเอง: `npx vitest run --project dom test/unit/assignment-offline-cache.test.ts test/unit/scan-controller.test.ts test/unit/gradebook-enter.test.tsx --reporter=dot` ผ่าน **34/34 tests จาก 3 ไฟล์**, exit 0; ดู `offline-independent-tests.txt` ครั้งแรกภายใต้ sandbox ยังไม่เริ่ม tests เพราะ EPERM ขณะ rename Vitest temporary cache; รันซ้ำนอก sandbox หลังผ่านการอนุมัติแล้วสำเร็จ

ขอบเขตที่ยอมรับ: รายการยืนยันว่าลบเก็บเฉพาะใน session ปัจจุบัน หาก reload ขณะ offline แล้วไม่มี metadata จะถือว่ายังไม่ทราบและเก็บรายการเข้าคิวเพื่อให้ server ตรวจเมื่อกลับ online ไม่อ้างว่าได้ทดสอบ Safari, กล้องจริง หรือวงจรพัก/ตื่นของ iPadOS จากการตรวจชุดนี้

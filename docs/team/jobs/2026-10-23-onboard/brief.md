# Brief — สำรวจระบบก่อนส่งมอบคุณครู

วันที่ 23 ตุลาคม 2569 · Workspace `C:/Users/User/Desktop/teacher`

## เป้าหมาย

ทำความเข้าใจระบบ ตรวจบั๊ก ความปลอดภัย ความถูกต้องของข้อมูล UI/UX และความพร้อมปฏิบัติการ แล้วให้แผนที่ทีมรับไปพัฒนาต่อได้ โดยยึดครูหนึ่งคนหลายเครื่องและทดลองหนึ่งห้อง

## ขอบเขตและการอนุญาต

- อ่าน source/config/tests/docs/current diff และ advisory สาธารณะ
- รัน typecheck, tests, build, preflight, dependency audit และการทำซ้ำในฐานข้อมูลสมมติแยกจากระบบใช้งาน
- ตรวจหน้าจอ local build และจัดทำเอกสาร/หลักฐานใน `docs/team/`
- ไม่แก้ implementation, migration หรือ lockfile; ไม่เปิดบัญชีจริง ไม่ส่งข้อความ ไม่ deploy ไม่แตะ production

## เงื่อนไขยอมรับงานสำรวจ

| AC | ผลงานที่ต้องได้ |
|---|---|
| AC-01 | แผนที่ระบบ เส้นทางข้อมูล และสถานะ working tree ที่ใช้ตรวจ |
| AC-02 | Baseline typecheck/test/build/preflight พร้อมแยกปัญหาสภาพแวดล้อม |
| AC-03 | Findings มีระดับความสำคัญ trigger/impact/ตำแหน่ง และแยก REPRODUCED กับ CODE FINDING |
| AC-04 | UI/UX ครอบคลุม flow หลักและสถานะผิดปกติ พร้อมเปิดเผยขอบเขตอุปกรณ์ที่ยังไม่ตรวจ |
| AC-05 | Security/dependency triage แยกโอกาสกระทบ production จาก dev tooling |
| AC-06 | แผนพัฒนาแบ่งเจ้าของ dependencies, contract, tests และเกณฑ์ส่งมอบหนึ่งห้อง |

## ทีมและความเป็นอิสระ

PM `/root` ประสานและรวมหลักฐาน; ผู้ตรวจย่อย `/root/security_data_audit`, `/root/frontend_ux_audit`, `/root/qa_release_audit` ทำงานอ่านอย่างเดียว ผู้ตรวจทั้งสามส่ง findings/baseline เบื้องต้นแล้วหยุดเพราะโควตา PM ตรวจหลักฐานและทำซ้ำต่อเอง การ review รอบสมบูรณ์ของรายงานนี้จึงเป็น self-review ไม่อ้างว่าผู้ตรวจอิสระรับรอง release แล้ว

## จุดสิ้นสุดของงานนี้

เอกสารและ evidence พร้อมส่งต่อเพื่อเริ่มแก้; ความพร้อมเปิดใช้จริงยังต้องผ่าน gates ในแผน ทั้งการแก้บั๊ก อุปกรณ์จริง กู้คืน และทดลองกับครู

# Brief: แก้ความปลอดภัยฝั่ง server (server-security)

- งาน: `2026-11-03-server-security` · เริ่ม: 2026-11-03 · สถานะ: กำลังทำ
- ขนาด: M
- ธง: 🔐 👤
- เจ้าของงาน: ผู้ใช้ · branch `team/2026-11-03-server-security` (ต่อจาก correctness-lows 24fbf2e)

## โจทย์
แก้ข้อค้นพบใน `security-review.md` (ในโฟลเดอร์นี้) โดยไม่เปลี่ยนกติกาธุรกิจ ไม่มี migration ถ้าเลี่ยงได้ ฟรีเทียร์

## Gate 0 (3 พ.ย.)
- ขนาด: M · S-04: "เตือนก่อนดาวน์โหลด" (แสดงคำเตือน PDPA ตอนกดสำรอง ไม่เปลี่ยนรูปแบบไฟล์) · หน้าตา: ใช้ Dialog/ข้อความเดิม ไม่ออกแบบใหม่ · motion/อุปกรณ์: ไม่เกี่ยว

## AC
- AC-01 S-01 login rate limit ไม่มี race (ยิงพร้อมกัน 30 ครั้งต้องโดน 429 ภายในงบ) และนับต่อ IPv6 /64 + ต่ออีเมล/บัญชี
- AC-02 S-02 เปลี่ยนรหัสผ่านแล้วเซสชันอื่นใช้ไม่ได้ (เครื่องที่เปลี่ยนยังอยู่)
- AC-03 S-03 change-password มี rate limit
- AC-04 S-04 คำเตือนก่อนดาวน์โหลด backup (PII เด็ก/PIN/QR)
- AC-05 Low S-05..S-14 ที่ไม่เปลี่ยนกติกา: no-store/nosniff บน /api, เทียบ setup code แบบ constant-time, Origin/Sec-Fetch-Site สำหรับ write, จำกัดขนาด body, restore ไม่ส่ง SQL error ดิบ, prototype key ใน restore ไม่ 500, ฯลฯ ข้อที่ต้องตัดสินกติกา → dev-notes เป็นคำถาม
- AC-06 ทุกข้อมีเทสต์ที่ล้มก่อนแก้; typecheck + vitest ทั้งชุดผ่าน; volume budget ไม่เปลี่ยน

## N/A ที่รับ
| check | เหตุผล | วันที่ |
|---|---|---|
| Q-13 | ไม่มี migration (ถ้ามีต้องหยุดถามเจ้าของงาน) | 2026-11-03 |
| Q-14 | ไม่มี migration | 2026-11-03 |

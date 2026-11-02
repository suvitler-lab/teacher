# Decisions (local): fix-fill-and-portrait

| ID | ที่มา | การตัดสินใจ |
|---|---|---|
| D-fix-fill-and-portrait-01 | Tech Lead · 2026-11-02 (คำสั่ง PM: ใช้ของสกิลเป็นหลัก) | ถ่ายภาพด้วย `shots.mjs` ของสกิล + `docs/team/pages.json` · `scripts/shots.cjs` เหลือแค่ตัวเรียก (เปิด fixture server ข้อมูลสมมติ → shots.mjs → ปิด) ไม่มีโค้ด CDP ซ้ำ · ทางที่ไม่เลือก: (ก) คง shots.cjs เต็ม 180 บรรทัด — โค้ดเบราว์เซอร์ซ้ำสองชุด อุปกรณ์ไม่ตาม context.md ไม่มี index/thumb (ข) ลบ shots.cjs ทิ้ง — ขัด AC-11 ที่ระบุ `node scripts/shots.cjs` และต้องมีที่เปิด fixture อยู่ดี · ข้อแลก: repo พึ่งโฟลเดอร์สกิลนอก repo (ไม่มี → ข้อความชัด exit ≠ 0) |
| D-fix-fill-and-portrait-02 | Tech Lead · 2026-11-02 | T-01 → T-02 → T-03 ทำเรียงกัน ไม่ขนาน เพราะทุก task build ลง `dist/client/client` เดียวกันแล้วถ่ายจาก dist นั้น · ทางที่ไม่เลือก: build แยก outDir ต่อ task — ต้องแก้ config vite/cloudflare นอกขอบเขต |

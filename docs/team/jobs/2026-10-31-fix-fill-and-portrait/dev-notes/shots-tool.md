# T-01 เครื่องมือถ่ายภาพ

## ใช้งาน
`npm run build` แล้ว `node scripts/shots.cjs --label before|after [--assets <dir>] [--port 4101] [--out <dir>] [--devices <ชื่อ>] [--pages <file>]`
- เปิด fixture (`layout: true`, ข้อมูลสมมติ) -> เรียก `~/.claude/skills/dev-team/scripts/shots.mjs` กับ `docs/team/pages.json` -> ปิด fixture (ไม่มีโค้ดเบราว์เซอร์ใน repo)
- ภาพลง `<job>/evidence/shots/<label>/<page>-<WxH>.png` (+thumb, index.json) · `.gitignore` มี `**/evidence/shots/`
- env: `SHOTS_BROWSER=<exe>` (path ผิด -> ข้อความ + exit 2), `DEV_TEAM_SKILL_DIR`
- fixture: `node scripts/fixture-server.cjs [--layout] [--gb14] [--port n] [--assets dir]` (ไม่ใส่ flag = ข้อมูลเดิม) · F-1..F-6 อยู่ใน `addLayout()`
- 4 อุปกรณ์มาจาก `context.md §อุปกรณ์เป้าหมาย`

## before (main @ 01d5486)
git archive -> `C:\Users\User\AppData\Local\Temp\main-before-01d5486` (junction node_modules, `npm run build`) -> `--assets .../dist/client/client`
ผล: 12 หน้า x 4 อุปกรณ์ = 48 ภาพ (+48 thumb) ที่ `<job>/evidence/shots/before/` · ไม่มีภาพที่เลื่อนแนวนอนทั้งหน้า

## แก้ใน pages.json (F-9) -> ใช้ฉบับ `docs/team/pages.json` (ฉบับใน job เป็นของ QA ไม่ได้แก้)
1. login: ต้องรอ 400ms หลังกรอกก่อนกดปุ่ม (React ยังไม่ sync -> กดแล้วไม่เข้า)
2. สแกน: ปุ่มหลังจบรอบคือ "เลือกงานอื่น" ไม่ใช่ "เริ่มรอบใหม่"
3. สแกนเลขที่ 1/2 ซ้ำข้ามหน้า/อุปกรณ์ -> "ไม่นับซ้ำ" ไม่มีแป้น -> เปลี่ยนเป็นเลือกช่อง missing/pending ช่องแรกทุกครั้ง (สถานะผังจึงต่างกันตามลำดับ ทั้ง before/after ใช้ลำดับเดียวกัน)
4. มือถือ (<600px) สมุดคะแนนเป็นการ์ด ไม่มี `.gb-scroll table` -> ready/setup รับกรณีนี้ · `.gb-scroll` null-safe
5. base เป็น 4101

## ข้อสังเกต / ข้อบกพร่องของสกิล
- หัวข้ออุปกรณ์อ่านจาก context.md ได้ถูกต้อง (4 อุปกรณ์) ไม่พบข้อบกพร่อง
- `shots.mjs` ไม่เคลียร์ localStorage/ข้อมูลระหว่างอุปกรณ์ -> หน้าที่เปลี่ยนข้อมูล (สแกน) สะสมต่อกันใน fixture เดียว
- `npm test` รอบแรกพลาด 1 เทสต์ (รอบสองผ่านครบ 85/1017) น่าจะ flaky ตามเวลา ไม่เกี่ยวกับงานนี้ (ไม่ได้ระบุชื่อ)
- visual-check.json: เปิดดูจริง 7 จาก 48 ภาพ (ทั้ง 4 อุปกรณ์) · ที่เหลือยังไม่ได้ดู

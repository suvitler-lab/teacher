# ย้ายฐานข้อมูล (D1) มาเอเชีย — ขั้นตอนที่ตรวจสอบได้ย้อนกลับได้

**ทำไม:** ฐานข้อมูล `kru-db` อยู่ที่ **ENAM (อเมริกาฝั่งตะวันออก)** ครูอยู่ไทย ทุกคำขอไป-กลับข้ามทวีป ~200 ms ต่อรอบ
หลังลดจำนวนรอบในโค้ดแล้ว (ดู REPORT.md) หน้าหนึ่งยังใช้ราว 3 รอบ ≈ 0.6–0.8 วินาที ถ้าฐานข้อมูลอยู่ APAC แต่ละรอบเหลือราว 10–30 ms

**ข้อมูลตอนนี้เป็นข้อมูลทดสอบ** ย้ายได้ปลอดภัย แต่ขั้นตอนนี้ออกแบบให้ใช้ได้กับข้อมูลจริงด้วย (ล็อกการเขียน → คัดลอก → เทียบจำนวนแถว → สลับ → เก็บของเดิมไว้ย้อนกลับ)

ทำจากเครื่องที่มี `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` และอยู่ในโฟลเดอร์โปรเจกต์ ใช้เวลาราว 5 นาที
ระหว่างนั้นหน้าเว็บ **อ่านได้ แต่บันทึกไม่ได้** (ขึ้น “ระบบกำลังกู้คืนข้อมูล”; ล็อกอินใหม่ไม่ได้ช่วงนั้นด้วย เพราะเป็นคำขอเขียน แต่คนที่ล็อกอินอยู่แล้วไม่หลุด) ไม่มีข้อมูลหาย — แนะนำทำตอนไม่มีใครสแกน/เช็คชื่อ

## 0. ตัวแปรที่ใช้ตลอด
```bash
OLD_NAME=kru-db
OLD_ID=20bdc9f8-7eed-4f44-bc45-d59a8e2de144     # ตรงกับ wrangler.jsonc ตอนนี้
NEW_NAME=kru-db-apac
```

## 1. ล็อกการเขียนใน DB เดิม
ระบบมีกลไกล็อกอยู่แล้ว (`meta.maintenance`) — คำขอเขียนจะได้ 423 ส่วนการอ่านทำงานต่อ
```bash
npx wrangler d1 execute $OLD_NAME --remote --command "INSERT INTO meta (key,value) VALUES ('maintenance','1') ON CONFLICT(key) DO UPDATE SET value='1'"
```

## 2. สำรองไฟล์เก็บไว้ก่อน (ปลอดภัยสองชั้น)
```bash
npx wrangler d1 export $OLD_NAME --remote --output ./kru-db-before-move.sql
```

## 3. สร้าง DB ใหม่ใน APAC แล้วนำเข้า
```bash
npx wrangler d1 create $NEW_NAME --location apac          # จด database_id ที่ได้ (NEW_ID)
npx wrangler d1 execute $NEW_NAME --remote --file ./kru-db-before-move.sql
```
ไฟล์ export รวมตาราง `d1_migrations` ด้วย จึงไม่ต้องรัน migrate ซ้ำ และ `sessions` ย้ายไปด้วย — ครูไม่ต้องล็อกอินใหม่

## 4. เทียบจำนวนแถวทุกตาราง (ต้องตรงกันทุกตาราง)
```bash
for t in meta settings teacher devices sessions terms classes subjects work_types students revoked_qr_tokens \
         assignments assignment_classes scan_sessions submissions attendance_sessions attendance audit_logs; do
  a=$(npx wrangler d1 execute $OLD_NAME --remote --json --command "SELECT COUNT(*) n FROM $t" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['results'][0]['n'])")
  b=$(npx wrangler d1 execute $NEW_NAME --remote --json --command "SELECT COUNT(*) n FROM $t" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['results'][0]['n'])")
  [ "$a" = "$b" ] && echo "ok   $t $a" || echo "DIFF $t old=$a new=$b"
done
npx wrangler d1 execute $NEW_NAME --remote --command "SELECT value FROM meta WHERE key='schema_version'"   # ต้องเท่ากับ SCHEMA_VERSION ใน shared/types.ts (ตอนนี้ 6)
```
**ถ้ามี DIFF แม้แต่ตารางเดียว ให้หยุด** ปลดล็อก DB เดิมตามข้อ 7 แล้วตรวจสาเหตุก่อน

## 5. ปลดล็อกใน DB ใหม่ (ไฟล์ที่นำเข้ามาเป็นสถานะล็อกอยู่)
```bash
npx wrangler d1 execute $NEW_NAME --remote --command "UPDATE meta SET value='0' WHERE key='maintenance'"
```

## 6. สลับ Worker ไปใช้ DB ใหม่ แล้ว deploy
แก้ `wrangler.jsonc` ช่อง `d1_databases[0]`: `"database_name": "kru-db-apac"`, `"database_id": "<NEW_ID>"` แล้ว
```bash
npm run deploy
curl -s https://ngankrob.suvit-ler.workers.dev/api/health     # ต้องได้ "ok":true และ "schemaOk":true
```
เปิดเว็บ → ต้องยังล็อกอินอยู่, ข้อมูลครบ, ลองกดตาซ่อนคะแนน / เช็คชื่อหนึ่งคน ต้องบันทึกได้
ดูความเร็ว: DevTools → Network → คลิกคำขอ `/api/...` → Timing → `Server-Timing: app;dur=…` (ควรเหลือหลักสิบถึงร้อยมิลลิวินาที)

## 7. ย้อนกลับ (ถ้าผิดพลาดตอนไหนก็ได้)
DB เดิมยังอยู่ครบ (แค่ถูกล็อก) — ปลดล็อกแล้วชี้กลับ:
```bash
npx wrangler d1 execute $OLD_NAME --remote --command "UPDATE meta SET value='0' WHERE key='maintenance'"
# แล้วแก้ wrangler.jsonc กลับเป็น OLD_NAME / OLD_ID และ npm run deploy
```

## 8. เก็บกวาด (หลังใช้งานใหม่ปกติสัก 1–2 วัน)
ลบ DB เดิมได้เมื่อแน่ใจแล้วเท่านั้น: `npx wrangler d1 delete $OLD_NAME` (ย้อนกลับไม่ได้ — เก็บไฟล์ `kru-db-before-move.sql` ไว้)

---

## บันทึกการย้ายจริง (1 ต.ค. 2569)
- ย้ายแล้ว: `kru-db` (`20bdc9f8-7eed-4f44-bc45-d59a8e2de144`, ENAM) → **`kru-db-apac` (`86cbb410-14a8-4d46-9b5f-89982e957815`, APAC)** ทำตามข้อ 1–6 ข้างบนทุกข้อ
- เทียบแล้ว **ตรงกันทุกตาราง ทั้งจำนวนแถว (22 ตาราง) และเนื้อหา (md5 ของทุกแถวใน 16 ตารางข้อมูล)**: นักเรียน 44, คะแนน 4, เช็คชื่อ 44, ประวัติ 185, เซสชัน 2, `schema_version` 6, `data_epoch` 2
- Worker ชี้ไป DB ใหม่แล้ว (version `0baa5139`) `/api/health` ปกติ; DB ใหม่รับเขียนได้ (ทดสอบเขียน/ลบแถวทดลองใน `meta`)
- **DB เดิมยังอยู่ครบและถูกล็อก (`maintenance=1`)** เก็บไว้ย้อนกลับ ห้ามลบจนกว่าจะใช้งานใหม่ปกติสัก 1–2 วัน ไฟล์สำรองก่อนย้ายอยู่ในเครื่องที่ทำงาน (ไม่ได้เก็บใน repo เพราะมีข้อมูลนักเรียน): ถ้าต้องการ ส่งออกใหม่ได้จาก DB เดิมด้วย `npx wrangler d1 export kru-db --remote --output <ไฟล์>`
- ผลข้างเคียงที่ปรับตาม: `package.json` สคริปต์ `db:migrate:*` / `db:seed:local` ชี้ `kru-db-apac` (preflight บังคับให้ตรงกับ `wrangler.jsonc`)
- ย้อนกลับ (ถ้าจำเป็น): ปลดล็อก DB เดิม `UPDATE meta SET value='0' WHERE key='maintenance'` (ใน DB `20bdc9f8…`) แล้วแก้ `wrangler.jsonc` กลับเป็น `kru-db` / `20bdc9f8…` + `package.json` ตาม แล้ว `npm run deploy` — ข้อมูลที่บันทึกใน DB ใหม่หลังย้ายจะไม่ตามกลับไปเอง
- หมายเหตุการวัด: จาก sandbox ที่ใช้ทำงาน (ออกอินเทอร์เน็ตทางอเมริกา) `Server-Timing` ของ `/api/auth/me` เปลี่ยนจาก ~36 ms เป็น ~370 ms เพราะ Worker อยู่ฝั่งอเมริกาแต่ DB อยู่เอเชีย ซึ่งตรงกันข้ามกับครูที่อยู่ไทย (Worker อยู่ใกล้ไทย → DB ใน APAC ใกล้กัน) ผลจริงต้องดูจากเครื่องของครู: DevTools → Network → คำขอ `/api/...` → Timing → `Server-Timing: app;dur=…` ควรลดลงมาก

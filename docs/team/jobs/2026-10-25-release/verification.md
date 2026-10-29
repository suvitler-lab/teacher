# Deploy ระบบจริง — 25 ตุลาคม 2569

**DEPLOYED และตรวจหลังปล่อยผ่าน** ผู้ใช้อนุญาตให้ทำตามลำดับตรวจปลายทาง → สำรองข้อมูล → deploy → ตรวจเว็บจริง

เว็บ: https://ngankrob.suvit-ler.workers.dev

| รายการ | ผล |
|---|---|
| Worker | `ngankrob` บัญชีCloudflareที่เชื่อมต่ออยู่ |
| D1 | `kru-db-apac`, `86cbb410-14a8-4d46-9b5f-89982e957815`, APAC |
| เวอร์ชันก่อนปล่อย | `cd3c1453-1c71-43ab-9966-ec99b83c164f` |
| เวอร์ชันใหม่ | `3ecf363b-af00-4542-8072-25a3e3e86905` |
| ทราฟฟิกปัจจุบัน | 100% เวอร์ชันใหม่ ยืนยันจากdeployments status; สร้างdeployment25ต.ค.2569 เวลา00:05:41น.(Asia/Bangkok) — [หลักฐาน](evidence/deployment-status.json) |
| Schema / migrations | schema6; migration7ไฟล์ใช้แล้วทั้งหมด ไม่มีรายการค้าง จึงไม่ได้รัน migration เพิ่ม |
| โค้ดก่อนปล่อย | เทียบ191ไฟล์กับmanifestรอบ570tests: drift0; buildและpreflightก่อน/หลังbuildผ่าน |
| Dry run | PASS; bindingsเฉพาะDBเดิมและASSETS; assetsจากdist/client/clientจำนวน36ไฟล์ |
| Deploy | exit0; อัปโหลดassets8ไฟล์ใหม่ ใช้24ไฟล์เดิม; Worker startup29ms; ใช้`--keep-vars` ไม่เปลี่ยนsecrets |

## สำรองข้อมูลก่อนปล่อย

ส่งออก D1 จริงทั้ง schema และข้อมูลด้วย Wrangler เก็บเฉพาะในไฟล์ local ที่ Git ignore:

`artifacts/releases/2026-10-25/private/kru-db-apac-before-deploy.sql`

ไฟล์269,663bytes; SHA256 `4448344d528c5dc0165c085677637542570f374c8a48424b85ff80a5038eb902` ลองโหลดSQLเข้าฐานSQLiteในหน่วยความจำได้: integrity_check=ok, foreign_key_check=0, schema6

ไฟล์นี้มีข้อมูลนักเรียนและข้อมูลระบบยืนยันตัวตน จึงไม่ใส่ไว้ในเอกสารหรือ static assets และไม่แสดงเนื้อหาใน log หลักฐานสาธารณะของrepoมีเฉพาะ hash/ขนาด/จำนวนแถว ดู [backup-verification.json](evidence/backup-verification.json) และ [scriptตรวจไฟล์](evidence/verify-backup.cjs) เป็นSQLexportสำหรับผู้ดูแล ไม่ใช่JSONbackupที่เลือกกู้คืนผ่านหน้าแอป

## ตรวจหลัง deploy

| การตรวจ | ผล / หลักฐาน |
|---|---|
| Healthจริง | PASS HTTP200, ok=true, DBreachable=true,schema6,schemaOk=true, secretsที่จำเป็นตั้งอยู่ — [production-http.json](evidence/production-http.json) |
| ไฟล์แอปและSW | SHA256จากHTTPSตรงกับbuildทั้งmainJSและsw.js; asset `/assets/index-BF_Q-mYw.js` |
| ผู้ไม่เข้าสู่ระบบ | GETbootstrap/reportsummary/gradebook/attendance ตอบ401ครบ4routes — [auth-guards.json](evidence/auth-guards.json) |
| Chromeที่เข้าสู่ระบบอยู่ | อัปเดตผ่านแถบ“อัปเดตเลย” แล้วตรวจด้วยบัญชีจริง ไม่ต้องสร้างบัญชีหรือเปลี่ยนรหัสผ่าน |
| รายงาน | โหลดและกดโหลดใหม่สำเร็จ:44คน,2งาน,ส่ง21/88,ค้าง67,เช็คชื่อ46รายการ3วัน; แสดงเวลาอัปเดตล่าสุด |
| สมุดคะแนน | โหลด44แถวนักเรียน+แถวสรุปได้ ไม่เปิดแก้ไขคะแนน |
| เช็คชื่อ | โหลด44คน วันที่25ต.ค.ยังไม่เช็ค44คน; controlsพร้อม ไม่มีการแตะเช็คชื่อ |
| Offline app | ตั้งค่า→ทั่วไป แสดง“พร้อม”หลังSWใหม่ควบคุมหน้า |
| Browser console | ไม่พบerrorจากการตรวจนี้ |
| จำนวนข้อมูลก่อน/หลัง | นักเรียน44,งาน2,submissions24,attendance46,attendance_sessions3ตรงกัน; SQLตรวจเป็นread-only,rows_written0 — [post-deploy-counts.json](evidence/post-deploy-counts.json) |

หลักฐาน browser: [browser-smoke.json](evidence/browser-smoke.json), [ข้อมูลรวมรายงาน](evidence/production-report-summary.json), [ภาพรายงานจริง](evidence/production-report.png)

ตรวจอิสระโดยQAที่ไม่ได้ดำเนินการdeploy: **PASS** ตรวจhash191ไฟล์เองdrift0, version/backupsummary/corecounts/assets/authguards/browseraggregateตรงกัน ไม่พบข้อขัดแย้งที่ขัดการส่งมอบ; ผู้ตรวจไม่เรียกproductionหรืออ่านprivatebackupเพิ่มเติม ดู [source-verification.json](evidence/source-verification.json)

ผล570/570 tests และ viewport10/10 กลุ่มกรณีเป็นการตรวจข้อมูลสมมติก่อนปล่อย ดู [รายงานรอบก่อน](../2026-10-24-ipad/verification.md) รอบproductionนี้ตรวจแบบอ่านข้อมูล ไม่สร้างคะแนนหรือเช็คชื่อทดสอบปะปนข้อมูลจริง จึงไม่อ้างว่าทดลองเขียนคะแนน/เช็คชื่อจริงหลังdeployแล้ว

คำสั่งnode healthรอบก่อนปล่อยรายงานผ่านแต่processปิดผิดปกติบนWindows จึงตรวจซ้ำด้วยHTTPSโดยตรงได้HTTP200และschemaถูกต้อง รอบหลังdeployใช้ผลHTTPและbrowserเป็นหลักฐาน

## ย้อนรุ่นเมื่อจำเป็น

ไม่มีmigrationใหม่ในรอบนี้ จึงย้อนเฉพาะWorkerไปเวอร์ชันก่อนหน้าได้ โดยไม่สั่งrestore/แก้ฐานข้อมูล:

```powershell
npx wrangler rollback cd3c1453-1c71-43ab-9966-ec99b83c164f --name ngankrob
```

เก็บไว้เป็นแผนเท่านั้น **ไม่ได้รัน rollback** การกู้ฐานข้อมูลไม่ใช่ขั้นตอนปกติของrollbackและจะพิจารณาเฉพาะเมื่อมีข้อมูลเสียหายจริง

## ขั้นที่เหลือบนอุปกรณ์จริง

1. เปิดเว็บบนiPadที่ใช้สอน ขณะต่อเน็ต ถ้ามีแถบเวอร์ชันใหม่ให้กดเมื่อคิวส่งงานหมด แล้วตรวจตั้งค่า→ทั่วไป→ใช้ออฟไลน์=พร้อม
2. ทดลองกล้องกับบัตรQRจริง แสง/ระยะ/โฟกัส การแตะและแป้นพิมพ์จอ; เครื่องจำลองWindowsไม่ยืนยันขั้นนี้
3. ทดลองสอนหนึ่งห้องและเทียบกับกระดาษ ตาม [TRIAL.md](../../../TRIAL.md) เริ่มจากข้อมูลที่จะบันทึกจริง ไม่ใส่คะแนนสมมติในทะเบียนจริง
4. สำรองหลังวันทดลอง และสรุปผลก่อนขยายใช้งาน

Safari/iPadจริง กล้องจริง และวันทดลองหนึ่งห้องยังNOT RUN ไม่มีการสร้างautomationหรืออ้างว่าได้ตรวจต่อโดยไม่มีผู้ใช้

เอกสารคำสั่งที่ตรวจใช้รอบนี้: [Cloudflare D1 Wrangler](https://developers.cloudflare.com/d1/wrangler-commands/), [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)

# Board — PM เป็นผู้ปรับสถานะ

**สถานะสำรวจเดิมก่อนแก้** — งานแก้24ต.ค.ดู [boardล่าสุด](../2026-10-24-hardening/board.md) และ [ผล554tests](../2026-10-24-hardening/verification.md)

วันที่ 23 ตุลาคม 2569; สถานะนี้แยก “ตรวจเสร็จ” จาก “แก้เสร็จ/เปิดใช้แล้ว”

| งาน | สถานะ | ผู้รับผิดชอบ | หลักฐาน/ขั้นถัดไป |
|---|---|---|---|
| A01 สำรวจ repo/diff/system map | DONE | PM | context.md, code-state.json |
| A02 Baseline type/test/build/preflight | DONE | QA → PM | verification.md; 496 tests ผ่าน |
| A03 ตรวจ backend/data/security | DONE | Security reviewer เบื้องต้น → PM | บั๊ก API 5 สถานการณ์ทำซ้ำได้ |
| A04 Frontend/UX review | DONE | Frontend reviewer เบื้องต้น → PM | coverage matrix + code findings; live UI จำกัดตามรายงาน |
| A05 Dependency triage | DONE | PM | npm-audit.json + advisory links |
| A06 สรุปรายงาน/แผน/AC | DONE | PM | verification.md, plan.md |
| V01 Independent final review | BLOCKED | Reviewer ที่ไม่ได้แก้โค้ด | ผู้ตรวจย่อยติดโควตา; ต้องตรวจอีกครั้งหลัง implementation ก่อน release |
| I01 ป้องกัน history move/restore invalid | READY | Backend/DB | ยังไม่เริ่มแก้; ทำตาม P0 ใน plan.md |
| I02 Epoch / setup / term hardening | READY | Backend | ยังไม่เริ่มแก้; รวม transactional checks และ regression |
| I03 Network deadlines / empty states / accessibility | READY | Frontend | รอ contract timeout+errors จาก Tech Lead |
| I04 Dependency upgrade และ runbook | READY | Tech Lead + DevOps/Writer | วิเคราะห์ compatibility ก่อนแก้ lockfile |
| V02 Device matrix และ restore drill | BLOCKED | QA + ครู | ต้องมี candidate ที่แก้แล้วและ iPad/มือถือจริง |
| V03 ทดลองหนึ่งห้อง | BLOCKED | ครู + QA | ต้องผ่าน gates A/B ใน plan.md |

รอบสำรวจเพิ่มเฉพาะเอกสารและ diagnostic harness ไม่ได้แก้บั๊กตาม I01–I04; ไม่มี production release

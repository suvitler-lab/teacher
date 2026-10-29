# สถานะตรวจรับ iPad

ผลต่อเนื่อง25ต.ค.2569: [DEPLOYED VERIFIED](../2026-10-25-release/verification.md) สำรองจริงแล้วและตรวจหน้าเว็บจริงผ่าน; Safari/iPadและกล้องจริงยังNOT RUN

| งาน | เจ้าของ | สถานะ | หลักฐาน |
|---|---|---|---|
| Viewport acceptance แนวตั้ง/แนวนอน | PM | PASS 10/10 กลุ่มกรณี | browser-checks.json + screenshots ใน evidence/ |
| F13 Enter เปิดช่องเดิมแทนไปคนถัดไป | QA developer + PM browser verification | PASS LOCAL | gradebook-keyboard-qa.md, database-keyboard-fixed-terminal.txt |
| F14 งานใหม่และสถานะเชื่อมต่อหลังรีโหลดออฟไลน์ | Frontend developer + Independent QA + PM | PASS LOCAL หลังแก้และตรวจ browser ซ้ำ | assignment cache / Scan controller regressions, DB20701=10หนึ่งsubmission |
| ปีใหม่ห้องว่าง รุ่นเดิมดูย้อนหลังได้ | PM | PASS LOCAL | new-year-empty-cohort.png, previous-year-report.png, database-rollover-terminal.txt |
| Excel ดาวน์โหลดจริงและตรวจค่า | PM | PASS LOCAL | report-before-rollover.xlsx, excel-verification.json |
| ชุดทดสอบเสริมเดิม | QA | PASS 115/115, 7 files | supplemental-qa.md |
| ตรวจรวมหลังแพตช์สุดท้าย | PM | PASS 570/570,56files; typecheck/build/preflight | full-tests-approved.txt, build.txt, typecheck.txt |
| Safari/กล้อง/สัมผัสบน iPad จริง | ครู + QA | NOT RUN | เครื่องจำลองหน้าจอไม่ครอบคลุม |

ดูผลสรุปสุดท้ายใน verification.md รวมรายการเดิมและรอบนี้14/14ข้อในlocal ไม่มี production deployment ในงานนี้

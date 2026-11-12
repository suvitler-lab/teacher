# Security Review (Verify รอบ 2) — 2026-11-11-home-redesign · T-79

ผู้ตรวจ: Security Reviewer · ฐาน e1bd05e → working tree (หลัง T-70/T-72/T-75) · ธง 🔐 👤 · รอบแก้ (Verify) 2/3 · ตรวจด้วยการอ่านโค้ด + grep + รันเทสต์ 3 ไฟล์ (jsdom, ไม่เรียก endpoint จริง)

## สรุป: ผ่าน — ต้องแก้ 0 · ควรแก้ 0 · เสนอ 2 (S-06, S-07 ยังเปิด)
- `git diff e1bd05e -- worker shared migrations` = ว่าง (ยืนยัน: ไม่มีการเปลี่ยนฝั่งเซิร์ฟเวอร์/สิทธิ์/สกีมา)
- `npm audit --omit=dev --json` (อ่านอย่างเดียว): critical 0 · high 0 · moderate 0 · low 0 · total 0 (prod deps 4)
- เทสต์: hr-vfix-t70 + sec-backup-warning + hr-sg2-startterm-t54 → 3 ไฟล์ / 15 เทสต์ ผ่าน

## 1) สถานะข้อพบเดิม
| ข้อ | สถานะ | หลักฐานในโค้ดปัจจุบัน |
|---|---|---|
| S-01 คำเตือน PDPA ตอนกู้คืน | **ปิดแล้ว** | RestoreModal.tsx:41 `BackupWarningText` แยกใช้ร่วม · :224 แสดงในขั้น validated · ปุ่มกู้คืน disabled เมื่อไม่ติ๊ก/offline/projecting (:236) |
| S-02 เริ่มภาคเรียนตอนฉายจอ/ออฟไลน์ | **ปิดแล้ว** | StartTermModal.tsx:59-62 `canStart` รวม `!blocked` อ่านสดจาก signal · :69 handler ตรวจซ้ำ · model.tsx:66-70 `startTermOrExplain()` ใช้โดย runTodayGo (:61) และ Todo.tsx:16 |
| S-03 การ์ดภาพรวม + backup() | **ปิดแล้ว** | SettingsCards.tsx:78,94 `useReadOnly()` รวมใน offline · Settings.tsx:163 `if (ro) return` ใน backup() |
| S-04 ช่องเลือกไฟล์กู้คืน | **ปิดแล้ว** | RestoreModal.tsx:208 `disabled={offline \|\| projecting}` + เหตุผล :209 |
| S-05 รหัสผ่านค้างบนจอฉาย | **ปิดแล้ว** | AccountSection.tsx:46 `show = shown && !useReadOnly()` |
| S-08 ขนาดไฟล์นำเข้า | **ปิดแล้ว** | Students.tsx:651 `MAX_IMPORT_FILE`=5 MB, :681 ตรวจก่อน parse |
| S-06 title ชื่อเต็มใน Person | **ยังเปิด — เสนอ (Low)** | a/Cards.tsx:24, b/Detail.tsx:23, c/Tiles.tsx:92 ยังตั้ง `title={fullName(st)}` ภายใน Person · ทุกผู้เรียกครอบด้วย hide แล้ว (a/Cards.tsx:66-68 ternary `hide`, :99 `!hide`) → ไม่รั่วจริงตอนนี้ · เสี่ยงเมื่อมีผู้เรียกใหม่ลืมเช็ค |
| S-07 gk_email ค้างหลังล้างค่าในเครื่อง | **ยังเปิด — เสนอ (Low)** | device.ts:52 `EMAIL_KEY="gk_email"` ไม่ขึ้นต้น `ngankrob` จึงไม่ถูก `clearLocalPrefs` (localPrefs.ts:36) · ถูกต้องตาม BR-60 |

### คำแนะนำ S-06 / S-07
- **S-06 → P3 / เสนอ ไม่บล็อกปล่อย** — แก้ภายหลัง: ให้ Person รับ `hide` แล้วไม่ตั้ง title/ไม่วาดเมื่อ hide (หรือเพิ่มเทสต์ที่ render การ์ดตอน hide แล้วยืนยันว่าไม่มีชื่อเต็มใน DOM/attr) · cards.tsx:182 (`hm-follow` title ชื่อเต็ม) อยู่ในสาขาที่ `hideNames.value` เป็น false เท่านั้น (:171) → ปลอดภัย
- **S-07 → P3 / เสนอ ไม่บล็อกปล่อย** — ความเสี่ยงเฉพาะเครื่องร่วม: อีเมลครู (ข้อมูลส่วนบุคคลของครู ไม่ใช่เด็ก) ค้างใน localStorage หลัง logout · แนะนำให้ logout (ไม่ใช่ "ล้างค่าในเครื่อง") ลบ `gk_email` โดยให้เจ้าของ BR-60 ตัดสิน (คงไว้เพื่อเติมอีเมลอัตโนมัติ = ความสะดวก) · แก้ใน src/lib/device.ts ซึ่ง T-70 ห้ามแตะ จึงควรเป็นงานแยก

## 2) Delta ใหม่หลัง T-70
| จุด | ผล |
|---|---|
| endpoint อันตรายตอนฉายจอ (ro) | ไม่พบ · StartTermModal (:59-62,:172), RestoreModal (:208,:236), Settings backup() (:163), BackupCard/TermCard (useReadOnly), AccountSection (ออกเครื่อง/รหัส `offline\|\|ro`) ปิดทุกทางก่อนเรียก API · MutationObserver (Settings.tsx:110-119) เป็นชั้นเสริม |
| ข้อมูลส่วนบุคคลใน URL/log | ไม่พบเพิ่ม · grep บรรทัดเพิ่มของ diff: ไม่มี console.*, localStorage, fetch ใหม่ที่ส่งชื่อ · ลิงก์ลึกใช้ student id (ไม่ใช่ชื่อ) |
| title ใหม่ใน diff (T-75 ฯลฯ) | title ที่เพิ่มเป็น assignment.title (home/a/Cards, Timeline), ชื่อภาคเรียน, ข้อความปุ่มโหลดใหม่ — **ไม่มีชื่อนักเรียนเพิ่ม** · title ชื่อเต็มเดิมทั้ง 4 ที่ (S-06 + cards.tsx:182) ถูกกันด้วย hide ตามข้างบน → hideNames path ไม่รั่ว |
| error/toast ใหม่ (startTermOrExplain) | ข้อความคงที่ ไม่มีค่าภายใน/ชื่อ |
| worker/shared/migrations | ไม่เปลี่ยน |
| dependency ใหม่ | ไม่มีเพิ่มหลัง e1bd05e (package.json ไม่อยู่ใน diff src) |

## 3) Accepted risk (ไม่ใช่ finding)
- **AR-1 · สติกเกอร์ QR ตอนซ่อนชื่อยังพิมพ์ชื่อเต็ม** — เจ้าของงานรับเป็นข้อยกเว้น AC-167 แล้ว (มติ 2026-11-12) · เหตุผล: สติกเกอร์ติดบนของนักเรียนต้องระบุตัวเด็ก · ความเสี่ยงคงเหลือ: ชื่อบนกระดาษอยู่นอกการควบคุมของแอป · ไม่ติดตามเป็น finding

## 4) Threat model ย่อ (entry point ที่แก้)
| Entry point | ภัย | ป้องกันที่มีจริง | ช่องว่าง |
|---|---|---|---|
| StartTermModal → POST /api/terms/start | กดพลาดบนจอฉาย / ออฟไลน์ | canStart + handler ตรวจซ้ำ + ติ๊กยืนยัน (StartTermModal.tsx:59-69) | ฝั่ง server ไม่รู้สถานะฉายจอ (ธรรมชาติของ UI-only; สิทธิ์ยังต้อง login) |
| RestoreModal → /api/restore/* | ไฟล์ PII ค้างเครื่อง, กู้คืนผิดไฟล์ | คำเตือน+ติ๊ก, สำเนาก่อนกู้ | — |
| Settings/Backup ดาวน์โหลด | ไฟล์ไม่เข้ารหัสบนเครื่องร่วม | BackupWarning, ro guard | — |
| AccountSection เปลี่ยนรหัส/ออกเครื่อง | รหัสบนจอ | type=password ตอน ro, POST body | — |
| Students import (client-only) | ไฟล์ใหญ่ | 5 MB + 200 คน | — |
| home Person/title | ชื่อรั่วตอนซ่อนชื่อ | ผู้เรียกเช็ค hide | S-06 (เสนอ) |

## 5) PDPA (ย่อ ต่อจากรอบแรก)
| ข้อมูล | เก็บที่ | ส่งออก | ซ่อน/เตือน | ลบ |
|---|---|---|---|---|
| ชื่อนักเรียน | D1 (เดิม) | สำรอง/Excel/LINE/สติกเกอร์ QR | BackupWarning/ซ่อนชื่อ · QR = AR-1 | ล้างข้อมูลที่ Settings (เดิม) |
| อีเมลครู | gk_email localStorage | ไม่ | ไม่มี | S-07 |
ไม่มี consent ใหม่/ข้อมูลประเภทใหม่ใน delta

## 6) ไม่ได้ตรวจ
- พิมพ์ (print CSS/บัตร QR ตามสวิตช์ซ่อนชื่อ) ยกเว้น AR-1 · ไม่ได้ทดสอบบนเบราว์เซอร์จริง · hr-sg3/4/5 ไม่ได้รันซ้ำ (รันเฉพาะ t70, sec-backup-warning, sg2-startterm) · CSS ที่เปลี่ยนไม่ได้ตรวจ (ไม่เกี่ยวความปลอดภัย)

## T-55 (ตั้งค่า 5ก3 ส่วนที่ 1 · ความเป็นส่วนตัวและเสียง + ตรวจเครื่องและออฟไลน์ + ล้างค่าที่จำไว้ในเครื่องนี้)

ช่วงที่ตรวจ: working tree บน f3875d5 (ยังไม่ commit) · `src/components/settings/sections/PrivacySection.tsx` (ใหม่), `DevicesSection.tsx` (`DeviceSection`, `DeviceCheck`, `AboutApp`, `ClearPrefs`), `registry.ts`, `GeneralSection.tsx`, `src/pages/Settings.tsx` (import + render 2 บรรทัด), `src/lib/localPrefs.ts` (ใหม่), `src/lib/deviceCheck.ts` (ไม่มี diff — ไม่ได้แก้), `src/styles/settings.css` (บรรทัด 199-204), `test/unit/hr-sg3-t55.test.tsx`, `test/unit/settings-page.test.tsx` (3 assertion ของ T-55) · อ่านประกอบ: `lib/hideNames.ts`, `lib/projector.ts`, `lib/sound.ts`, `lib/display.ts`, `lib/device.ts`, `ConfirmDialog.tsx`, `sections/shared.tsx`, 7 หน้าที่อ่าน `hideSignal`

### สรุป: ผ่านแบบมีเงื่อนไข — ต้องแก้ 0 · ควรแก้ 3 · เสนอ 5

ไม่พบทางที่ "ล้างค่าในเครื่อง" ทำให้งานรอส่ง (เช็คชื่อ/คะแนน) หาย: คิวและฉบับร่างอยู่ใน IndexedDB (`idb.ts` DB `ngankrob`) ไม่ใช่ localStorage และ `clearLocalPrefs` แตะเฉพาะ `localStorage` · ซ่อนชื่อ 7 แถวใช้ `hideSignal/setHide` ตัวเดียวกับสวิตช์บนหน้า · "เปิด/ปิดทั้งหมด" ไม่แตะ `pjHideNames` · เสียงไม่ถูกเล่นตอนเปิดหน้า/สลับสวิตช์ · ข้อที่ต้องตามคือลิงก์จากหน้าหลักยังพาไป "ภาพรวม" ที่ไม่มีการ์ดที่เก็บข้อมูลแล้ว

### ต้องแก้ก่อนปล่อย

ไม่มี

### ควรแก้

**R-5501 · ลิงก์ "ที่เก็บข้อมูลในเครื่อง ›" จากหน้าหลักพาไปหมวดที่ไม่มีการ์ดนั้นแล้ว · `src/components/home/cards.tsx:332`**
- T-55 ย้าย `StorageRow`/`OfflineRow` จากภาพรวม (general) ไปหมวด `device` แต่การ์ดรอส่งบนหน้าหลักยังเรียก `navigate("/settings", { section: "general" })` (บรรทัดนี้ไม่อยู่ใน diff — ลิงก์เดิม)
- สถานการณ์: ครูเห็น "รอส่ง 3" บนหน้าหลัก → แตะ "ที่เก็บข้อมูลในเครื่อง ›" → ไปหน้าภาพรวมที่ไม่มีเรื่องที่เก็บข้อมูล/ขอเก็บถาวรแล้ว (เทสต์ settings-page ยืนยันเองว่าหัว "การแสดงผลบนเครื่องนี้" ไม่อยู่ในภาพรวม) → หาปุ่ม "ขอเก็บถาวร" ไม่เจอ ทั้งที่ลิงก์มีไว้กันงานค้างหายช่วงปิดเทอม
- แก้: เปลี่ยนเป็น `{ section: "device" }` (ไฟล์ของหน้าหลัก — PM ส่งให้เจ้าของไฟล์ หรือเพิ่มเข้า T-55) · ทางเลือก/เพิ่ม: แถว `set-moved` "ย้ายไป ตรวจเครื่องและออฟไลน์ ›" ในภาพรวม แบบเดียวกับแถวหน้าตาที่ `GeneralSection.tsx:42-45`

**R-5502 · 🔄 เทสต์ล้างค่ายังไม่จับ 2 ทางพังที่สำคัญที่สุด · `test/unit/hr-sg3-t55.test.tsx:237-255`**
- (ก) "คิวยังเป็น 3" ตรวจจาก signal `pendingCount` อย่างเดียว — mutation ที่ล้าง IndexedDB (เช่นเรียก `kvDel`/`clear` ของ store คิว) จะไม่เปลี่ยน signal เทสต์ยังผ่าน; mutation ที่ dev ลอง ("ล้างไปรีเซ็ตคิว") จับได้เฉพาะการเขียน signal ตรง ๆ
- (ข) ไม่มี assertion ว่าค่าในหน่วยความจำของจอฉายกลับค่าเริ่มต้น: ถอดบรรทัด `pjTheme.value = "dark"` / `pjSize.value = 2` / `pjHideNames.value = false` ที่ `localPrefs.ts:46-48` เทสต์ยังผ่าน (ผลจริง: จอฉายยังสว่าง/ซ่อนชื่อจนรีโหลด ทั้งที่ข้อความแจ้งว่าล้างแล้ว)
- แก้: seed รายการคิว/ร่างจริงใน IDB (fake-indexeddb ที่ชุดเทสต์อื่นใช้) แล้วอ่านกลับหลังล้าง · เพิ่ม `expect(pjTheme.value).toBe("dark"); expect(pjSize.value).toBe(2); expect(pjHideNames.value).toBe(false)` หลังยืนยัน · และเทสต์ว่า `sessionStorage["ngankrob-projector"]` ไม่ถูกแตะ

**R-5503 · ♿ ปุ่ม "เปิดทั้งหมด/ปิดทั้งหมด" ชื่อที่อ่านออกเสียงไม่มีคำที่ตาเห็น (WCAG 2.5.3 Label in Name) · `PrivacySection.tsx:35-36`**
- `aria-label="เปิดซ่อนชื่อทั้ง 7 หน้า"` แทนที่ข้อความที่เห็น "เปิดทั้งหมด" ทั้งหมด → ผู้ใช้สั่งด้วยเสียง (Voice Control บน iPad) พูด "แตะ เปิดทั้งหมด" ไม่เจอปุ่ม
- แก้: ให้ชื่อขึ้นต้นด้วยคำที่เห็น เช่น `aria-label="เปิดทั้งหมด — ซ่อนชื่อทั้ง 7 หน้า"` / `"ปิดทั้งหมด — แสดงชื่อทั้ง 7 หน้า"` หรือถอด aria-label แล้วใช้ `aria-describedby` ชี้ตัวนับ

### เสนอ

- **R-5504 · ล้างแบบ "ขึ้นต้น ngankrob ยกเว้นรายชื่อ" เสี่ยงในอนาคต · `localPrefs.ts:14-29`** — ตรงตาม BR-60 และวันนี้ไม่มีคีย์ localStorage ที่ขึ้นต้น `ngankrob` เก็บงานจริง แต่ถ้างานหลังเก็บร่าง/คิวใน localStorage ด้วยคำนำหน้านี้ ปุ่มนี้จะลบทิ้งเงียบ ๆ · เสนอเทสต์เฝ้าที่ grep `src/**` หาคีย์ `ngankrob*` ที่ถูก `setItem` แล้วต้องอยู่ในรายการที่จัดหมวดไว้ (ล้างได้/ห้ามล้าง) เพื่อให้คีย์ใหม่ต้องถูกตัดสินก่อน
- **R-5505 · ค่าเริ่มของจอฉายเขียนซ้ำ 2 ที่ · `localPrefs.ts:46-47` vs `projector.ts:23-24`** — ถ้าเปลี่ยนค่าเริ่มที่ projector.ts ปุ่มล้างจะคืนค่าเก่า · เสนอ export `reloadProjectorFromStorage()` จาก projector.ts แบบเดียวกับ `reloadHideFromStorage`
- **R-5506 · ระหว่างฉายจอ ปุ่ม "ตรวจเครื่องนี้"/"คัดลอกผลตรวจ" ถูกปิดด้วย · `Settings.tsx:107-118` (R-5305) + `DevicesSection.tsx:93-94`** — AC-248 ให้ปิด "ทุกปุ่มเขียน" ปุ่มตรวจไม่ได้เขียนค่า (เขียนเพียง kv `deviceCheck` ใน IDB เพื่อทดสอบ) · ผลไม่มีข้อมูลส่วนบุคคล · เสนอใส่ `data-nav` หรือเพิ่มใน `keep` ถ้าเจ้าของต้องการตรวจเครื่องขณะต่อทีวี (ไม่บังคับ)
- **R-5507 · ข้อความยืนยันนับเฉพาะ รอส่ง + ร่างเช็คชื่อ ไม่นับ "ส่งไม่สำเร็จ" · `DevicesSection.tsx:139`** — รายการที่ล้มก็อยู่ในคิวและไม่ถูกแตะเช่นกัน · ถ้ามี failed > 0 ควรบอกด้วย เพื่อครูมั่นใจว่ารายการเหล่านั้นไม่หาย
- **R-5508 · ข้อความ AC-237 "6 เรื่อง" vs ผลจริง 7 ข้อ (รวมกล้อง)** — `deviceCheck.ts` ไม่มี diff ข้อกล้องมีอยู่เดิม ตรวจแค่ `!!navigator.mediaDevices?.getUserMedia` (ไม่เรียก getUserMedia ไม่ขอสิทธิ์) · ข้อความนำที่ `DevicesSection.tsx:91` บอกตรงตามจริง → ไม่ถือว่าเกิน AC · เสนอ PM/BA แก้ AC เป็น 7 หรือ "6 เรื่อง + กล้อง"

### ข้อที่ตัดสินแล้ว (ไม่ใช่ข้อบกพร่องของ T-55)

| เรื่อง | ผล | หลักฐาน |
|---|---|---|
| หน้าสุ่มชื่อ `const hide = false` | งาน T-45 จริง — plan.part-2 แถว T-45 "สุ่มชื่อ: ซ่อนชื่อ (`hideSignal("random")`)" · แถว "สุ่มชื่อ" ใน privacy เขียน `ngankrob-hide-names-random` ถูกคีย์แล้ว | `Random.tsx:94-95`, plan.part-2.md:103 |
| "ยังไม่มีหน้าไหนอ่าน getRandomTick" | **ข้อมูลใน dev-notes ล้าสมัย** — Random.tsx (T-44) อ่านแล้วที่ `:92` (`useState(getRandomTick)`) · ค่าที่ privacy ตั้งจึงมีผลเมื่อเปิดหน้าสุ่มชื่อใหม่ | `Random.tsx:19,92` |
| ฉายจอ: สวิตช์ซ่อนชื่อ/จอฉายถูกปิดใน Settings | เหมาะ — ตรงคำตัดสินเจ้าของ SGQ3 → AC-248 "ทุกปุ่มเขียน disabled" (A31) · ครูยังซ่อนชื่อได้จากปุ่มบนหน้าที่ฉายเอง · มีป้าย "กำลังฉายจอ — หน้านี้อ่านอย่างเดียว" role=status | `Settings.tsx:107-118,215`, requirements.part-10.md:94 |
| hr-sweep-colors ล้ม 2 ข้อ | ทุกบรรทัดที่ล้มเป็น `random .rnd-*` (T-44) · CSS ของ T-55 (`settings.css:199-204`) ไม่มีสีเลย · สีใน DevicesSection ใช้ตัวแปร `var(--bg-*)/var(--text-*)` ทั้งหมด | vitest output |
| ไอคอน | 15 ชื่อที่ใช้ มีใน `iconMap.ts` หรือเป็นชื่อ Phosphor ตรง (pass-through) · hr-theme-icons ผ่าน | `iconMap.ts:108` |
| settings-page.test.tsx 3 assertion | ไม่ลดความเข้ม: 2→1 การ์ด (การ์ดที่ย้ายถูกตรวจใน hr-sg3-t55 :148,:161) · ถอดหัวจาก list → แทนด้วย `queryByRole(...)).toBeNull()` · 9→12 เพิ่มการตรวจชื่อเมนูใหม่ทีละปุ่ม · (การถอด assertion notify ของธีมเป็นงานก่อนหน้า ไม่ใช่ T-55) | git diff test/unit/settings-page.test.tsx |
| ลิงก์เก่า `?section=privacy/device` | ใช้ได้ — เป็นหมวดจริงใน `SECTIONS` แล้ว (`registry.ts:20-21`), ALIAS เหลือ `danger` · มีเทสต์ :55 | registry.ts:29,36-44 |

### เช็กลิสต์ข้อมูล (🔄) — รายการคีย์ทั้งแอป

| คีย์ (ที่เก็บ) | เขียนที่ | ล้าง? | ถูกต้อง |
|---|---|---|---|
| `ngankrob-font-size`, `ngankrob-density` (local) | display.ts:17-18 | ล้าง + `applyStoredDisplay()` ทันที | PASS |
| `ngankrob-hide-names`, `ngankrob-hide-names-*` (local) | hideNames.ts:9 | ล้าง แล้ว `reloadHideFromStorage` เขียน `-*` กลับเป็น "0" (คัดลอกจากหน้าหลักที่ว่าง) — ผลสุดท้าย = ปิดทุกหน้า · signal ที่สร้างแล้วถูกตั้งใหม่ ไม่ค้าง | PASS |
| `ngankrob-pj-theme/-size/-hide-names` (local) | projector.ts:12-13,26 | ล้าง + ตั้ง signal ใหม่ (ดู R-5502/R-5505) | PASS |
| `ngankrob-projector` (session) | projector.ts:11 | ไม่แตะ (sessionStorage) | PASS |
| `ngankrob-random-tick` (local) | sound.ts:57 | ล้าง → ค่าเริ่ม ปิด (D44) · state ใน Privacy/Random อ่านใหม่เมื่อ mount | PASS |
| `ngankrob-att-class`, `ngankrob-students-sort`, `ngankrob.gb.columns`, `ngankrob.gb.groupMode.v2` (local) | Attendance.tsx:60, StudentParts.tsx:30, gbColumns.ts:5, gbGroups.ts:9 | ล้าง · ทุกหน้าอ่านตอน mount (useState initializer) ไม่มี signal ระดับโมดูลค้าง | PASS |
| `ngankrob-theme`, `ngankrob-skin`, `ngankrob-layout` (local) | theme.ts:4, appearance.ts:24-25 | ไม่ล้าง (LOCAL_PREF_KEEP — สำเนาค่าซิงก์) | PASS |
| `gk_device_id`, `gk_device_name`, `gk_email` (local) | device.ts:3-4,52 | ไม่ล้าง (ไม่ขึ้นต้น ngankrob) | PASS |
| คิวรอส่ง / ร่างเช็คชื่อ / kv (IndexedDB `ngankrob`) | idb.ts:72 | ไม่แตะ (ไม่ใช่ localStorage) | PASS (เทสต์ยังไม่ยืนยัน — R-5502) |
| Cache Storage / cookie session | sw / server | ไม่แตะ | PASS |

- ล้างทำได้ออฟไลน์ (ไม่มี API, เทสต์ :252-253 `put/post` ไม่ถูกเรียก) · ConfirmDialog `danger` → โฟกัสเริ่มที่ "ยกเลิก" (`ConfirmDialog.tsx:47` `data-autofocus`) · ปิดกล่องแล้วโฟกัสกลับปุ่ม (`DevicesSection.tsx:150`) · ระหว่างฉายจอปุ่มถูกปิด
- เสียง: ไม่มีปุ่มทดสอบเสียงใน T-55 · สลับสวิตช์ติ๊งไม่เล่นเสียง ไม่สร้าง AudioContext · `sound.ts` เพิ่มเฉพาะฟังก์ชันติ๊ง (T-44) ไม่แก้เสียงเดิม · เสียงสแกน: `fieldset disabled={offline}` + "ต้องออนไลน์" · บันทึกล้มย้อนค่า (`Settings.tsx:136-147`)
- ตรวจเครื่อง: ไม่เรียก getUserMedia/permission ใด ๆ · `navigator.storage.estimate/persisted` ไม่ขอสิทธิ์ · `requestPersist` เรียกเฉพาะเมื่อกด "ขอเก็บถาวร" · ปฏิเสธ → แจ้ง err ไม่ค้าง · เกี่ยวกับแอปไม่มีเลขเวอร์ชัน (เลข worker อยู่เฉพาะในข้อความคัดลอก — มีมาก่อน)

### เช็กลิสต์ความปลอดภัย / 👤

| ข้อ | ผล |
|---|---|
| ไม่มี API ใหม่ / endpoint ใหม่ | PASS |
| ข้อมูลส่วนบุคคลในผลตรวจ/คัดลอก | PASS — UA, ขนาดจอ, host, จำนวนคิว ไม่มีชื่อเด็ก |
| ซ่อนชื่อ 7 หน้าใช้คีย์เดียวกับหน้า | PASS — home/scan/attendance/gradebook/reports/students อ่าน `hideSignal(page)` (homePrefs.ts:85, scan/hide.tsx:10, Attendance.tsx:137, Gradebook.tsx:138, Reports.tsx:91, Students.tsx:79) · random = T-45 |
| "เปิดทั้งหมด" ไม่แตะจอฉาย | PASS — `setHideAll` วนเฉพาะ HIDE_PAGES (hideNames.ts:44-46) + เทสต์ :92 |
| XSS / innerHTML | PASS — ไม่มี |

### ♿

- สวิตช์ `role=switch` + `aria-checked` + `aria-label` (ui.tsx:124-125) PASS · ตัวนับ "n จาก 7 หน้า" role=status PASS · ปุ่มเปิดทั้งหมด → R-5503
- เป้าแตะ ≥ 44 / มือถือสวิตช์ตกบรรทัด / reduced-motion: NOT RUN (ไม่ได้เปิดภาพ — dev เปิดดู 4/20) · CSS ใหม่ไม่มี animation · `.spin` ใช้คลาสเดิม

### หลักฐาน

- Q-5501 `npx vitest run test/unit/hr-sg3 test/unit/hr-sg-settings test/unit/settings- test/unit/device-check test/unit/hr-theme-hide test/unit/hr-theme-icons test/unit/hr-sweep-colors` → 138/140 ผ่าน · ล้ม 2 = hr-sweep-colors `.rnd-*` (T-44) · hr-sg3-t55 ผ่านครบ
- Q-5502 `npx tsc --noEmit` → 0 error
- grep `setItem|ngankrob|gk_` ทั่ว `src/` → ตารางคีย์ข้างบน

รอบแก้ (Verify) 0/3

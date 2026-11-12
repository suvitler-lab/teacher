# Technical plan: ออกแบบหน้าหลักใหม่ + ชุดหน้าตาทั้งแอป (สร้างหน้าเว็บจริง)

โดย Tech Lead · 2026-11-12 · เฟส 3 · อ่านต่อ: `plan.part-2.md` (Tasks ช่วง 4ก ขึ้นไป · Endpoint ใหม่ · dependency · จุดเสี่ยง)

## แนวทาง

- ใช้ stack เดิม (Preact + signals + Vite + PWA เดิม) ไม่เปลี่ยน router/store/การบันทึก · **ทุกช่วงหน้าเว็บปล่อยแอปอย่างเดียว ไม่แก้ worker/shared/migration** (D41 D46)
- ค่าหน้าตาอยู่ในคีย์ setting เดิม: ธีม+โครงใน `accent` (JSON) · โหมดใน `theme` · การ์ดต่อโครงใน `home_cards` แบบขยาย → ไม่ต้องปล่อย server ก่อน · บันทึกล้ม/ออฟไลน์ย้อนค่า+แจ้ง (D38 D41)
- ธีม = `:root[data-skin="pro|warm|playful"]` × `[data-theme]` เดิม ใช้ชื่อตัวแปร token เดิม → ช่วง 1ก ทำให้ทุกหน้าเปลี่ยนสี/ฟอนต์/ไอคอนทันที แต่โครงหน้าเดิมจนถึงช่วงของหน้านั้น (BR-10 · D46)
- ฟอนต์/ไอคอนฝังในแอป (@fontsource + Phosphor) โหลดเฉพาะธีมที่เลือก service worker เก็บล่วงหน้าครบ (D45)
- ซ่อนชื่อแยกต่อหน้าในทะเบียนเดียว `hideNames.ts` คัดค่าหน้าหลักครั้งแรก · เสียง "ติ๊ง" ต่อเครื่อง (D44)
- คำตัดสินที่ SA ฝาก: RPQ3 → แก้เงื่อนไขแสดงผล `showsRate` ไม่แตะ `projectorWorkRows` (D42) · AC-171 → วิธีวัด + รับประกันด้วยโครง (D43)
- AC-41–43 → ร่างสัญญา EP-09/10/11 ทำในงานแยก A/B/C (D47) · ตัวเลข/สูตรเดิมไม่เปลี่ยนทุกช่วง (BR-09 BR-13 BR-19 BR-29 BR-37 BR-44)

## ช่วงการปล่อย (ช่วง = 1 session Build · ปล่อยจริงต่อหน้า)

| ช่วง | ขอบเขต | AC หลัก | Task | ปล่อย | server ก่อน |
|---|---|---|---|---|---|
| 1ก | ฐานชุดหน้าตา (token/ฟอนต์/ไอคอน/ค่าหน้าตา/ทะเบียนซ่อนชื่อ) + ตั้งค่า › หน้าตา + เมนู + เข้าสู่ระบบ | 01–08, 34–40, 44–50 | T-29–T-32 | **ปล่อยพร้อม 1ข** (ถ้าปล่อยเดี่ยวต้องซ่อนตัวเลือกโครง — ไม่แนะนำ) | ไม่ต้อง (D41) |
| 1ข | หน้าหลัก 3 โครง + ปรับหน้าหลัก | 07, 09–33, 38–39 | T-33–T-36 | ปล่อย "ช่วง 1" · Gate V | ไม่ต้อง |
| 2ก | สแกน: แยกไฟล์ + ตั้งรอบ + กำลังสแกน | 51–71 | T-37 T-38 | ปล่อยได้ (สรุป/ฉายจอยังเป็นโครงเดิมที่ใช้ธีมใหม่) | ไม่ต้อง (A6) |
| 2ข | สแกน: สรุปรอบ + ฉายจอ + ซ่อนชื่อ + อุปกรณ์ | 72–80 | T-39 T-40 | ปล่อยหน้าสแกน · Gate V | ไม่ต้อง |
| 3 | เช็คชื่อ + งานเล็ก 4 (สุ่มชื่ออ่าน `?class=`) | 81–106 | T-41–T-43 | Gate V | ไม่ต้อง |
| 3ข | สุ่มชื่อ | 107–124 | T-44 T-45 | Gate V | ไม่ต้อง (RQ1 = ต่อเครื่อง) |
| 4ก | คะแนน: ตาราง ช่อง การบันทึก | 125–136 | T-46 | ปล่อยพร้อม 4ข (แนะนำ) | ไม่ต้อง |
| 4ข | คะแนน: แถบงาน หน้าต่างงาน Excel ซ่อนชื่อ ลิ้นชัก อุปกรณ์ | 137–153 | T-47 T-48 | Gate V | ไม่ต้อง |
| 4ค1 | รายงาน: โครง hero ตาราง การ์ด สถานะ | 154–164, 169–170 | T-49 | ปล่อยพร้อม 4ค2 (แนะนำ) | ไม่ต้อง |
| 4ค2 | รายงาน: ซ่อนชื่อ Excel พิมพ์ ฉายจอ งบแถว ♿ | 165–168, 171–175 | T-50 | Gate V | ไม่ต้อง |
| 4ง1 | นักเรียน: โครง รายการ ลิ้นชักร่วม ซ่อนชื่อ ฉายจอ สถานะ | 176–185, 196–202 | T-51 | ปล่อยพร้อม 4ง2 (แนะนำ) | ไม่ต้อง |
| 4ง2 | นักเรียน: ฟอร์ม ย้าย/ออก QR นำเข้า อุปกรณ์ | 186–195, 203–206 | T-52 | Gate V | ไม่ต้อง |
| 5ก1 | ตั้งค่า: แยกหมวดเป็นไฟล์ + แผนผัง บันทึก/สถานะ ใช้บ่อย | 207–225, 246–249 | T-53 | ปล่อยได้ | ไม่ต้อง |
| 5ก2 | ห้องเรียน วิชา ภาคเรียน + ประเภทงาน | 226–234 | T-54 | ปล่อยได้ | ไม่ต้อง |
| 5ก3 | ความเป็นส่วนตัว ตรวจเครื่อง บัญชี สำรอง ประวัติ โซนอันตราย | 235–245 | T-55 T-56 | Gate V หน้าตั้งค่า | ไม่ต้อง |
| แยก A | ขาดติดกัน (EP-09) | 41 | T-57 T-58 | job แยก | **server ก่อนแอป** |
| แยก B | กราฟส่งงาน 7 วันเรียน (EP-10) | 42 | T-59 T-60 | job แยก | **server ก่อนแอป** |
| แยก C | ตารางสอน + คาบถัดไป + เมนู (EP-11) | 43 | T-61–T-63 | job แยก + requirements ของตัวเอง | **migration → server → แอป** |

**ลำดับที่แนะนำ:** 1ก → 1ข → 2ก → 2ข → 3 → 3ข → 4ก → 4ข → 4ค1 → 4ค2 → 4ง1 → 4ง2 → 5ก1 → 5ก2 → 5ก3 (ตามลำดับเจ้าของงาน) · เหตุผล: (1) 1ก เป็นฐานที่ทุกช่วงใช้ (token, `Icon`, `appearance.ts`, `hideNames.ts`) ต้องก่อนเสมอ (2) 1ข ทำให้ "ช่วง 1" ครบตามที่อนุมัติใน Gate 1 และเป็นหน้าที่เจ้าของงานให้ความสำคัญที่สุด (3) รายงาน (4ค) ก่อนนักเรียน (4ง) เพราะลิ้นชักนักเรียนใช้ร่วม — ออกแบบลิ้นชักใหม่ครั้งเดียวใน 4ง1 แล้วรันเทสต์รายงานซ้ำ (4) ตั้งค่าท้ายสุดเพราะหมวดความเป็นส่วนตัวแก้ค่าซ่อนชื่อของทุกหน้า ต้องมีครบ 7 หน้าก่อน · งานแยก A เริ่มได้หลังช่วง 3 (แตะ `components/home` และ `components/attendance`) · B หลังช่วง 1 · C หลัง 5ก (แตะเมนูและตั้งค่า)

**หน้าที่ยังไม่ทำอยู่ร่วมกับธีมใหม่อย่างไร:** ช่วง 1ก เปลี่ยนค่า token ใต้ชื่อเดิม + `Icon` ทั้งแอป → หน้าเก่าได้สี/ฟอนต์/ไอคอนของธีมทันที โครงเดิม ปุ่มเดิม (BR-10) · T-30 กวาดสีตายตัวใน CSS ของหน้าเก่าให้ผ่าน contrast 6 ชุด · แต่ละช่วงแก้เฉพาะไฟล์ของหน้าตัวเอง + ส่วนใช้ร่วมแบบเพิ่ม prop ไม่บังคับ · ทุก task จบด้วย `npm test` + `npm run typecheck` + `npm run build` ผ่านทั้งชุด → ปล่อยช่วงใดก็ได้โดยหน้าอื่นไม่พัง (D46)

## การเปลี่ยนแปลงต่อส่วน

| ส่วน | เปลี่ยนอะไร | ช่วง |
|---|---|---|
| `src/styles/tokens.css` + `src/styles/skins/*.css` | ค่า 3 ธีม × 2 โหมด ใต้ชื่อตัวแปรเดิม + token ใหม่ตาม visual-design §ตัวแปรใหม่ · ไฟล์ต่อธีมรวมฟอนต์ + ไอคอนน้ำหนักของธีม (dynamic import) | 1ก |
| `src/lib/appearance.ts` (ใหม่) · `theme.ts` · `main.tsx` | อ่าน/เขียน `accent` · จำในเครื่อง · ตั้ง `data-skin` ก่อน paint · ใช้ค่า server ตอนโหลดครั้งแรกเท่านั้น · บันทึก+ย้อนค่า | 1ก |
| `src/components/Icon.tsx` + `src/lib/iconMap.ts` | Phosphor ต่อน้ำหนักธีม · prop เดิม · `data-icon` | 1ก |
| `src/lib/hideNames.ts` (ใหม่) | ทะเบียนซ่อนชื่อ 7 หน้า (หน้าหลักย้ายจาก `homePrefs.ts` คง export เดิม) | 1ก ใช้ทุกช่วง |
| เมนู `Shell.tsx` `shell.css` `menuKeys.ts` | rail + ป้ายกลุ่มตัวหนังสือ · แถบล่างมือถือ | 1ก |
| ตั้งค่า › หน้าตา | หมวดใหม่ (ไฟล์ `components/settings/Appearance*.tsx`) · ย้ายขนาดตัวอักษร · ชื่อหมวด catalog ใหม่ | 1ก |
| หน้าหลัก | `Home.tsx` เลือกโครง · `homeLayout.ts` (ใหม่) การ์ดต่อโครง · โครง ก/ข/ค แยกโฟลเดอร์ `components/home/a`, `b`, `c` | 1ข |
| สแกน | แยก `Scan.tsx` (1,739 บรรทัด) เป็น `components/scan/*` พฤติกรรมเดิม แล้วทำหน้าใหม่ทีละส่วน · ไม่แตะ `resolveScan`/`commitStudent`/outbox | 2ก 2ข |
| เช็คชื่อ · สุ่มชื่อ · คะแนน | โครงหน้าใหม่ในไฟล์ของหน้า + `components/<page>/*` · การบันทึก/สูตรเดิม · เสียงติ๊งเพิ่มฟังก์ชันใหม่ใน `sound.ts` | 3 3ข 4ก 4ข |
| รายงาน | โครงใหม่ · การ์ดขาดบ่อย `absent` เปิดเริ่มต้น · `src/lib/reportView.ts` (`showsRate` D42) · `report.ts` เพิ่มตัวนับรอตรวจเท่านั้น | 4ค |
| `StudentDrawer.tsx` (ใช้ร่วม) | ลิ้นชัก 8 ค่าตาม mockup · ปุ่มต่างตาม `from` | 4ง1 |
| ตั้งค่า | `Settings.tsx` แยกหมวดเป็น `components/settings/sections/*` · `localPrefs.ts` (ใหม่) ล้างค่าในเครื่อง | 5ก |
| `scripts/sw-precache.ts` | ตัดไฟล์ฟอนต์ไอคอนที่ไม่ใช่ woff2 ออกจาก precache ถ้ามี | 1ก |
| `package.json` | +`@fontsource/sarabun` `mitr` `anuphan` `mali` `@phosphor-icons/web` · −`@tabler/icons-webfont` | 1ก (T-29 คนเดียว) |
| worker · shared · migrations | **ไม่เปลี่ยนในช่วงหน้าเว็บ** · EP-09–11 ในงานแยก A/B/C | แยก |

### สัญญาภายในที่ task ขนานกันใช้ (T-29 สร้าง · T-31 T-32 และช่วงถัดไปเรียกใช้)

```ts
// src/lib/appearance.ts
export type Skin = "pro" | "warm" | "playful"; export type Layout = "a" | "b" | "c";
export interface Appearance { skin: Skin; layout: Layout }
export const appearance: ReadonlySignal<Appearance>;            // ค่าที่ใช้อยู่บนจอ
export function parseAppearance(raw: string | null | undefined): Appearance;
export function saveAppearance(next: Partial<Appearance> & { theme?: ThemeChoice }): Promise<boolean>; // ย้อนค่าเองเมื่อล้ม
export function applyStoredAppearance(): void;                  // เรียกใน main.tsx ก่อน render
// src/lib/hideNames.ts
export type HidePage = "home" | "scan" | "attendance" | "random" | "gradebook" | "reports" | "students";
export function hideSignal(page: HidePage): ReadonlySignal<boolean>;
export function setHide(page: HidePage, on: boolean): void;
export function setHideAll(on: boolean): void;                   // หมวดความเป็นส่วนตัว · ไม่แตะฉายจอ
```

ชื่อ token ใหม่ใช้ตาม visual-design §ตัวแปรใหม่ที่ต้องเพิ่ม (เช่น `--rail-bg` `--hero-bg` `--font-display`) — T-31 ใช้ชื่อเหล่านี้ได้ก่อน T-29 เสร็จ

## Tasks (PM ลง board) — ส่วนที่ 1 (ช่วง 1ก–3ข)

ทุก task: ตำแหน่งชื่อมาตรฐาน · `เขียนได้เฉพาะ` คั่นด้วย `,` · จบด้วย `npm test` + `npm run typecheck` + `npm run build` ผ่าน (AC-35) และภาพ 4 อุปกรณ์ของหน้าที่แตะ · ข้อความที่เทสต์ล็อกคงเดิม (แก้ได้เฉพาะ selector/ชื่อไอคอน) · ไม่แตะ `worker/` `shared/` `migrations/` ในช่วงหน้าเว็บ

| Task | ช่วง | งาน | ตำแหน่ง | เขียนได้เฉพาะ | AC | หน้าที่แตะ | รอ Task | ขนานกับ | พอร์ต |
|---|---|---|---|---|---|---|---|---|---|
| T-29 | 1ก | ฐานชุดหน้าตา: token 3 ธีม × 2 โหมด (`data-skin`) · `appearance.ts` (D41) · ฟอนต์/ไอคอนต่อธีม + Phosphor + `Icon.tsx` `data-icon` (D45) · `hideNames.ts` (D44) · ติดตั้ง/ถอด package · วัดขนาด precache | Front-End | package.json, package-lock.json, index.html, src/main.tsx, src/styles/tokens.css, src/styles/base.css, src/styles/skins/**, src/lib/theme.ts, src/lib/appearance.ts, src/lib/fonts.ts, src/lib/iconMap.ts, src/lib/hideNames.ts, src/lib/homePrefs.ts, src/components/Icon.tsx, scripts/sw-precache.ts, test/unit/hr-theme-*.test.ts*, test/unit/gradebook-header-a.test.tsx, test/unit/random-page.test.tsx, test/unit/home-states.test.tsx, test/unit/home-ui.test.tsx | AC-03, AC-04, AC-06, AC-34, AC-35, AC-36, AC-37, AC-40 | home, scan, attendance, random, gradebook, reports, students, settings | — | T-31 | 4101 |
| T-30 | 1ก | กวาดสีตายตัวใน CSS ของหน้าที่ยังไม่สร้างใหม่ (hex → token ไม่แตะโครง) ให้ผ่าน contrast 6 ชุด + หน้าเข้าสู่ระบบใช้ธีมที่จำ | Front-End | src/styles/attend.css, src/styles/grade.css, src/styles/random.css, src/styles/report.css, src/styles/scan.css, src/styles/students.css, src/styles/settings-cards.css, src/styles/stickers.css, src/styles/print.css, src/styles/projector.css, src/styles/onboarding.css, src/styles/ui.css, src/pages/Setup.tsx, test/unit/hr-sweep-*.test.ts* | AC-08, AC-34, AC-35, AC-37 | scan, attendance, random, gradebook, reports, students (+ หน้าเข้าสู่ระบบ) | T-29 | T-32 | 4102 |
| T-31 | 1ก | เมนู: rail 8 รายการ + ป้ายกลุ่มตัวหนังสือ 4 ป้าย พอดี 1536×729 · แถบล่างมือถือ 5 ช่อง + แผ่น "เพิ่มเติม" · เปิดลิงก์ลึกก่อนเข้าสู่ระบบ · โฟกัส/VoiceOver | Front-End | src/components/Shell.tsx, src/styles/shell.css, src/lib/menuKeys.ts, src/app.tsx, test/unit/hr-menu-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-45, AC-46, AC-47, AC-49, AC-50 | home, scan, settings (เมนูทุกหน้า) | — | T-29 | 4103 |
| T-32 | 1ก | ตั้งค่า › หน้าตา: โครง 3 การ์ด radio + ธีม 3 การ์ด + ตามเครื่อง/สว่าง/มืด + ขนาดตัวอักษร (ย้ายมา) · บันทึก/ย้อนค่า (D41) · `?section=appearance` · ชื่อหมวด "ห้องเรียน วิชา ภาคเรียน" | Front-End | src/pages/Settings.tsx, src/components/settings/Appearance*.tsx, src/styles/settings.css, test/unit/hr-appearance-*.test.tsx, test/unit/settings-page.test.tsx | AC-01, AC-02, AC-05, AC-34, AC-35, AC-37, AC-40, AC-44, AC-48 | settings-appearance, settings-catalog, settings | T-29 | T-30 | 4104 |
| T-33 | 1ข | หน้าหลักส่วนร่วม: เลือกโครงตาม `appearance` · แถบบน + ชิป "ปรับหน้าหลัก" (โครง + การ์ดต่อโครง BR-12 ใน `homeLayout.ts`) · ต้องทำวันนี้ BR-01/02 · ตัวเลข BR-09 · ปุ่มลัด · skeleton/ออฟไลน์/ว่าง/ซ่อนชื่อ/เทอมอื่น · โครงเปล่า a/b/c ให้ T-34–T-36 | Front-End | src/pages/Home.tsx, src/lib/homeLayout.ts, src/lib/homeCards.ts, src/lib/homeLogic.ts, src/components/home/*.tsx, src/components/home/meta.ts, src/components/home/a/index.tsx, src/components/home/b/index.tsx, src/components/home/c/index.tsx, src/styles/home.css, test/unit/home-*.test.ts*, test/unit/hr-homecore-*.test.ts* | AC-07, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-34, AC-35, AC-37, AC-38, AC-39, AC-40, AC-252 | home | ช่วง 1ก | — | 4105 |
| T-34 | 1ข | โครง ก "วันนี้ของครู" (hero ตัวเลขใหญ่ · ลำดับงานวันนี้ · การ์ดย่อย 5 ใบ) | Front-End | src/components/home/a/**, src/styles/home-a.css, test/unit/hr-layout-a-*.test.tsx | AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-34, AC-35, AC-37, AC-38, AC-39, AC-40 | home | T-33 | T-35, T-36 | 4106 |
| T-35 | 1ข | โครง ข "แผงรายห้อง" (วงแหวน % ต่อห้อง · รายละเอียดห้อง) | Front-End | src/components/home/b/**, src/styles/home-b.css, test/unit/hr-layout-b-*.test.tsx | AC-25, AC-26, AC-27, AC-28, AC-29, AC-34, AC-35, AC-37, AC-38, AC-39, AC-40 | home | T-33 | T-34, T-36 | 4107 |
| T-36 | 1ข | โครง ค "โฟกัสงานถัดไป" (กล่องโฟกัส · ต่อจากนี้) | Front-End | src/components/home/c/**, src/styles/home-c.css, test/unit/hr-layout-c-*.test.tsx | AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-37, AC-38, AC-39, AC-40 | home | T-33 | T-34, T-35 | 4108 |
| T-37 | 2ก | สแกน: แยก `Scan.tsx` เป็น `components/scan/*` (พฤติกรรมเดิม เทสต์เดิมผ่านก่อนเปลี่ยนหน้าตา) + ตั้งรอบ S1 + ป้ายครบกำหนด BR-15 | Front-End | src/pages/Scan.tsx, src/components/scan/**, src/styles/scan.css, test/unit/scan-*.test.ts*, test/unit/m1-05-*.test.ts*, test/unit/c0*-scan-*.test.ts*, test/unit/hr-scan-setup-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-51, AC-52, AC-53, AC-54 | scan | ช่วง 1ก | — | 4109 |
| T-38 | 2ก | สแกน: กำลังสแกน S2–S8 (hero · การ์ดผลคำต่อคำ ux-scan · สแกนล่าสุด + ไอคอนวิธีรับ · แผงข้าง + การ์ด "ยังไม่ส่ง" ใน `scan_cards` · "รอส่งขึ้นระบบ" · "เริ่มรอบใหม่") · ไม่แตะ `resolveScan`/`commitStudent`/outbox/เสียงเดิม (BR-13) | Front-End | src/pages/Scan.tsx, src/components/scan/**, src/styles/scan.css, src/lib/pageCards.ts, test/unit/scan-*.test.ts*, test/unit/m1-05-*.test.ts*, test/unit/hr-scan-live-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-55, AC-56, AC-57, AC-58, AC-59, AC-60, AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70, AC-71 | scan | T-37 | — | 4110 |
| T-39 | 2ข | สแกน: สรุปรอบ S9 + วิธีรับรอบนี้ BR-14 + สแกนห้องถัดไป BR-16 | Front-End | src/pages/Scan.tsx, src/components/scan/**, src/styles/scan.css, test/unit/hr-scan-summary-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-72, AC-73, AC-74, AC-75 | scan | ช่วง 2ก | — | 4111 |
| T-40 | 2ข | สแกน: ฉายจอ + ซ่อนชื่อแยก (`hideSignal("scan")` · จอฉายตามสวิตช์ของตัวเอง SQ1) + 4 อุปกรณ์ + ♿ · `Projector.tsx` แก้แบบไม่กระทบหน้าอื่น | Front-End | src/pages/Scan.tsx, src/components/scan/**, src/components/Projector.tsx, src/lib/projector.ts, src/styles/scan.css, src/styles/projector.css, test/unit/projector.test.tsx, test/unit/hr-scan-pj-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-76, AC-77, AC-78, AC-79, AC-80 | scan, attendance, random, reports (จอฉายร่วม) | T-39 | — | 4112 |
| T-41 | 3 | เช็คชื่อ: โครงหน้า เลือกห้อง/วัน แถบสรุป + คำอธิบายสีใต้แถบ · แตะเช็ค/มาทั้งห้อง · แผงข้าง · บันทึก/ออฟไลน์/ชนกัน + "เปลี่ยนจาก … เป็น …" (BR-19 BR-20 BR-23 ตัวเลขเดิม) | Front-End | src/pages/Attendance.tsx, src/components/attendance/**, src/styles/attend.css, test/unit/attendance-*.test.tsx, test/unit/hr-att-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-81, AC-82, AC-83, AC-84, AC-85, AC-86, AC-87, AC-88, AC-89, AC-90, AC-91, AC-92, AC-93, AC-94, AC-95 | attendance | ช่วง 1ก | T-42 | 4113 |
| T-42 | 3 | งานเล็ก 4: หน้าสุ่มชื่ออ่าน `?class=` (เลือกห้องนั้นและจำไว้) — ต้องเสร็จก่อนปุ่มใน AC-102 | Front-End | src/pages/Random.tsx, test/unit/hr-rndclass-*.test.tsx | AC-35, AC-102 | random | — | T-41 | 4114 |
| T-43 | 3 | เช็คชื่อ: สแกน QR/รายคาบ · หน้าว่าง · ฉายจอ · ซ่อนชื่อ (`hideSignal("attendance")`) · "สุ่มชื่อเฉพาะคนที่มา" · การ์ด "เดือนนี้" BR-21 · วันย้อนหลังซ่อนปุ่ม · 4 อุปกรณ์ + ♿ | Front-End | src/pages/Attendance.tsx, src/components/attendance/**, src/styles/attend.css, src/lib/pageCards.ts, test/unit/attendance-*.test.tsx, test/unit/hr-attx-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-96, AC-97, AC-98, AC-99, AC-100, AC-101, AC-102, AC-103, AC-104, AC-105, AC-106, AC-253 | attendance, random | T-41, T-42 | — | 4115 |
| T-44 | 3ข | สุ่มชื่อ: โครงหน้า ห้อง ฐานการสุ่ม · สุ่ม/ข้าม/เลิกทำ/จับเวลา (`pickNext` เดิม) · เสียง "ติ๊ง" ต่อเครื่องเริ่มปิด (D44 · เพิ่มฟังก์ชันใหม่ใน `sound.ts` ไม่แก้เสียงเดิม) · จับกลุ่ม · สถานะสุ่มไม่ได้ | Front-End | src/pages/Random.tsx, src/components/random/**, src/styles/random.css, src/lib/sound.ts, test/unit/random-*.test.ts*, test/unit/hr-random-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-107, AC-108, AC-109, AC-110, AC-111, AC-112, AC-113, AC-114, AC-115, AC-116, AC-117, AC-118, AC-255 | random | ช่วง 3 | — | 4116 |
| T-45 | 3ข | สุ่มชื่อ: ซ่อนชื่อ (`hideSignal("random")`) · ฉายจอ · แผ่นปรับการ์ด `random_cards` · 4 อุปกรณ์ + ♿ | Front-End | src/pages/Random.tsx, src/components/random/**, src/styles/random.css, src/lib/pageCards.ts, test/unit/hr-random2-*.test.tsx | AC-34, AC-35, AC-37, AC-40, AC-119, AC-120, AC-121, AC-122, AC-123, AC-124 | random | T-44 | — | 4117 |

ต่อใน `plan.part-2.md`

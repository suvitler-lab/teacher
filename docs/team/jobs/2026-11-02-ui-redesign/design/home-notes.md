# สเปกภาพ รอบ 1: เมนูหลัก + หน้าหลัก (ui-redesign)

โดย Web Designer · 2026-11-03 · กรอบ: "ออกแบบใหม่ในกรอบของเดิม" + motion = ไม่ต้อง · ข้อมูลใน mockup สมมติทั้งหมด (ครูสมหญิง, โรงเรียนบ้านสมมติ, ป.4/1–ป.6/2) · ค่าทั้งหมดอ้าง `src/styles/tokens.css` + token ที่อนุมัติใน D20 (`--text-muted #646c79`, `--shadow-card`, `--radius-xs 6`, `--ring-focus`, lh 1.6, `--space-1..6`) · ห้ามแตะ `src/` — คนทำ mockup คัดลอก token ลง `<style>` ได้ทันที

## 1) แนวทาง
- 3 คำ: **โล่ง · อ่านปราด · กดถนัด** (สิ่งที่ต้องทำอยู่บนสุดก้อนเดียว ที่เหลือเป็นการ์ดเรียบเท่ากัน)
- รักษาจากของเดิม: IBM Plex Sans Thai 400/500 (+600 เฉพาะตัวเลข stat — Front-End เพิ่ม `600.css`), น้ำเงิน `#2f6fde` และชุด bg/text/fill/border ทั้ง light/dark, Tabler outline, rail ซ้าย + แท็บล่าง 5 ช่องปุ่มสแกนลอยกลาง, ปุ่มหลัก "สแกนส่งงาน" พื้นน้ำเงินเต็ม, `.switch` เดิม, Drawer เดิม (`ui.css`), เมนู 8 หน้าชื่อเดิม, `--row-h`/ความหนาแน่น

## 2) Rail (iPad ตั้ง/นอน + คอม ≥ 721px)
| สิ่ง | ค่า |
|---|---|
| ความกว้าง | `--rail-w: max(92px, 5.75rem)` → 92 / 103.5 / 138 px ที่ฟอนต์ 16 / 18 / 24 (เดิม 64px ตัดคำ "ออกจากระบบ") · padding `10px 6px` · พื้น `--surface-2` + `border-right .5px --border` (เหมือน mockup สแกนที่อนุมัติ; **ไม่ใช่** surface-1 เพราะ `--bg-accent` บน surface-1 = 1.02:1 สถานะ on จะหายไป) · `position:sticky; top:0; height:100vh; overflow-y:auto` |
| โลโก้ | `2.5rem` สี่เหลี่ยม radius 12 พื้น `--accent` ไอคอน `checks` 24 สี `--on-accent` · margin-bottom 8 · เป็นโลโก้เท่านั้น (ux.md ข้อ 1.1) |
| หัวกลุ่ม `.rail-head` | ข้อความ `--fs-xs` (≥13px) lh 1.3 สี `--text-muted` (ใหม่ #646c79 = 5.30:1 บนขาว) · `padding: 8px 6px 2px` · `border-top .5px --border` + `margin-top 4px` (กลุ่มแรก "วันนี้" ไม่มีเส้น) · ไม่ตัดคำ (`white-space:nowrap`) · 4 กลุ่ม: วันนี้ / ในห้องเรียน / ตรวจงาน / จัดการ |
| item `.rail-item` | คอลัมน์: ไอคอน 24 → gap 2 → ป้าย `--fs-xs` 500? **ไม่** คง 400 (on = 500) lh 1.3 `white-space:nowrap` · `padding 4px 2px` · `min-height: max(44px, calc(34px + 1.3 * var(--fs-xs)))` ≈ 52 / 54 / 60.5 px ที่ 16/18/24; บน `(pointer:fine)` padding 2px → 48px · radius `--radius-sm` 8 · สี `--text-secondary` (5.52:1 บน surface-1, 6.25:1 บนขาว) |
| on | พื้น `--bg-accent` + ตัว/ไอคอน `--text-accent` (6.07:1) + weight 500 + **แถบซ้าย 3px** `box-shadow: inset 3px 0 0 var(--accent)` (accent บนขาว 4.72:1 ≥ 3:1) — ใช่ ต้องมีแถบ เพราะ bg-accent บนขาวต่างกันแค่ 1.15:1 สายตาครูมองรวดเร็ว/จอ iPad กลางแดดต้องมีรูปทรงช่วย |
| hover / focus | hover `--surface-1` · `:focus-visible { box-shadow: var(--ring-focus); outline: none }` (on+focus = ring ซ้อนแถบได้) |
| ล่าง | `.rail-spacer flex:1` → ป้ายซิงก์ `.sync` (chip เดิม `cloud-check` 16 + คำ; กว้างเกินให้ขึ้น 2 บรรทัด เฉพาะชิปนี้) padding `6px 0` → item "ออกจากระบบ" (`logout`, ป้ายเดียวกับ sheet ตาม ux.md) |

ความสูงรวม (โลโก้+pad 10 / หัวกลุ่ม 4 / item 8 + gap 2×7 / ซิงก์ / ออกจากระบบ / pad 10):
| ฟอนต์ | หัวกลุ่ม | item | รวม | จอ | ผล |
|---|---|---|---|---|---|
| 16 คอม (pointer fine) | 32 | 48 | 10+48+128+384+14+32+48+10 = **674** | 729 | พอดี เหลือ 55 |
| 18 iPad นอน | 34 | 54 | 10+53+136+432+14+35+54+10 = **744** | 820 | พอดี เหลือ 76 |
| 20 iPad นอน | 36 | 56 | **777** | 820 | พอดี |
| 22 / 24 iPad นอน | 38 / 41 | 58 / 60.5 | **814 / 854** | 820 | 22 เฉียด, 24 ล้น → ซ่อนข้อความหัวกลุ่ม (คงเส้นคั่น 8px) เหลือ **726** |

กติกากันล้น: `.rail { container-type:size; container-name:rail }` + `@container rail (max-height: calc(18rem + 426px)) { .rail-head { font-size:0; padding:4px 0 0; } }` (ที่ 16→714 <729 คงหัว; 22→822 >820 ซ่อน; 24 ซ่อน) · ถ้าเบราว์เซอร์ไม่รับ calc ใน container query ให้ `overflow-y:auto` รับไว้ (มีอยู่แล้ว) ห้าม `overflow:hidden`
ทางเลือก B (คอม ≥1280: rail 13rem ป้ายอยู่ข้างไอคอน, หัวกลุ่มชิดซ้าย, item 44px): ข้อดี — อ่านเร็ว ไม่มีปัญหาตัดคำ สูงรวม ≈ 630 · ข้อเสีย — iPad นอน (1180) กับคอมได้เมนูคนละหน้าตา ครูที่สลับเครื่องต้องจำสองแบบ, ต้องถ่าย/ตรวจ 2 layout, กินพื้นที่สมุดคะแนน 10–15 คอลัมน์ไป ~116px · **คำแนะนำ: ทำ A อย่างเดียวในรอบ 1** (rail เดียวทุกจอ ≥721) และเก็บ B เป็น "ขยายเมนู" ในตั้งค่าถ้าผู้ใช้ขอหลังใช้จริง

## 3) แท็บล่างมือถือ (≤ 720px) + sheet
- แถบ: `position:fixed; bottom:0` สูง `3.5rem` (56) + `env(safe-area-inset-bottom)` พื้น `--surface-2` `border-top .5px` · 5 ช่องเท่ากัน `.tab-item` `justify-content:flex-start; padding-top 6px; gap 2px` (ป้าย "เมนู" จะไม่ถูกตัดอีก) · ไอคอน 24 · ป้าย `--fs-xs` lh 1.2 nowrap · สี `--text-secondary` · on = `--text-accent` + เม็ดพื้น `--bg-accent` หลังไอคอน 44×28 radius 14 (รูปทรง ไม่พึ่งสี) · focus ring เดียวกัน
- ปุ่มสแกนกลาง `.tab-scan-btn`: วงกลม `3.5rem` (56; ที่ฟอนต์ 18 = 63 ยอมรับได้ ไม่เกิน 64) `margin-top:-18px` พื้น `--accent` ไอคอน `scan` 24 สี `--on-accent` ขอบ 3px `--surface-2` เงา `--shadow-pop` · ป้าย "สแกน" ใต้ปุ่มเหมือนช่องอื่น · ช่องทั้ง 5: หน้าหลัก · เช็คชื่อ · **สแกน** · คะแนน · เมนู (`menu-2`)
- Sheet "เมนู": overlay `rgba(10,14,22,.45)` · แผ่น `--surface-2` radius `16px 16px 0 0` padding `8px 16px calc(16px + safe-area)` · ที่จับ 44×4 · แถวหัว: TermPicker + `.sync` (เดิม) `border-bottom .5px` · **กริด 2 คอลัมน์ gap 8**: ปุ่ม `min-height 3.5rem` (56) แนวนอน ไอคอน 24 ชิดซ้าย + คำ 1rem/500 · พื้น `--surface-1` radius 12 · on = `--bg-accent` + `--text-accent` + `border .5px --border-accent` + แถบซ้าย 3px เดียวกับ rail · 4 ปุ่ม: สุ่มชื่อ `dice-3` · รายงาน `chart-bar` · นักเรียน `users` · ตั้งค่า `settings` · ใต้กริด: ปุ่ม `ghost` เต็มแถว 48px "ออกจากระบบ" `logout` 20 สี `--text-danger`

## 4) หน้าหลัก
**โครงต่ออุปกรณ์** (`.main` padding: คอม/iPad นอน `20px 24px 40px` · iPad ตั้ง `16px 20px 32px` · มือถือ `12px 16px calc(72px + safe-area)` · `max-width 1240px` บนคอม)
| จอ | หัว/ต้องทำ | ปุ่มลัด | ตัวเลข | การ์ด |
|---|---|---|---|---|
| iPad ตั้ง 820 (เนื้อหา ≈ 676) | เต็มแถว | **2×2** (4 ช่อง 1 แถวที่ ~160px บรรทัดรองจะขึ้น 3 บรรทัด — วัดใน mockup) | 4 ช่อง 1 แถว | **1 คอลัมน์** ตามลำดับในแผง |
| iPad นอน 1180 / คอม 1536 | เต็มแถว | 4 ช่อง | 4 ช่อง | **2 คอลัมน์ `minmax(0,1.4fr) minmax(0,1fr)` gap 12** · ซ้าย = การ์ด "กว้าง" (งานที่กำลังเก็บ, ห้องของฉัน) · ขวา = ที่เหลือ · แต่ละคอลัมน์เรียงตามลำดับในแผง |
| มือถือ 390 | เต็มแถว | **2×2** | **2×2** | 1 คอลัมน์ |

- ระยะ: `--space-1..6` = 4/8/12/16/20/24 · ช่องว่างระหว่างบล็อก (ต้องทำ→ลัด→ตัวเลข→การ์ด) 16 · ระหว่างการ์ด 12 · ในการ์ด 8 · gutter ข้างมือถือ 16 ไม่เลื่อนแนวนอน
- การ์ดทั่วไป `.card`: พื้น `--surface-2` ขอบ `.5px --border` radius **12** (การ์ด "ต้องทำตอนนี้" 16) เงา `--shadow-card` · padding **16** คอม/iPad นอน · **14** iPad ตั้ง · **12** มือถือ
- หัวการ์ด `.hm-cardhead`: ไอคอน 20 สี `--text-secondary` + `h2` 1rem/500 lh 1.35 · ขวา `button.lk` "ดูทั้งหมด ›" (ข้อความเฉพาะหน้า เช่น "สมุดคะแนน ›") `--fs-sm` `--text-accent` padding `0 8px` radius 8 `min-height 44px` บน touch / 32 บนคอม hover `--surface-1`
- หัวหน้า: ไทล์ `home` 2.5rem `--bg-accent`/`--text-accent` + "สวัสดี ครูสมหญิง" 1.33rem/500 lh 1.35 + บรรทัดรอง `--fs-sm` (โรงเรียน · วันที่ · chip `cloud-off` "ข้อมูล ณ 07:40" เมื่อ stale) · ขวา: TermPicker + `button.icon.ghost` `layout-grid` 44×44 aria-label "ปรับหน้าหลัก"
- **การ์ด "ต้องทำตอนนี้"** (รวมแบนเนอร์ปีการศึกษา/ภาคเรียน/ค้างส่ง/สำรอง): **พื้นขาว `--surface-2` + แถบซ้าย 4px** (`border-left: 4px solid var(--fill-warning)`, radius 16) — เลือกแบบนี้แทนพื้น `--bg-warning` ทั้งใบเพราะ (1) แถวในใบมีหลายระดับ (ส่งไม่สำเร็จ = danger, ค้างส่ง = warning, ภาคเรียนจบ = info) พื้นเหลืองทั้งใบจะบอกผิด (2) ปุ่มขาวบนพื้นเหลืองใน dark mode ลอย (3) ใบเดียวที่มีสีเต็มจะแข่งกับปุ่ม "สแกนส่งงาน" สีน้ำเงิน · แถบ `--fill-warning` บนขาว 2.32:1 เป็นแค่ตัวช่วย ความหมายอยู่ที่ไอคอน+หัวข้อ (dark 6.35:1) · หัว: ไทล์ 2rem `--bg-warning` ไอคอน `alert-triangle` 20 `--text-warning` + h2 "ต้องทำตอนนี้" + chip จำนวน · แถว `min-height: var(--row-h)` (≥44 touch) grid `20px 1fr auto` gap 12 `border-top .5px`: ไอคอน 20 สีตามระดับ (`--text-danger`/`--text-warning`/`--text-accent`) · ข้อความ 1rem `--text-primary` + บรรทัดรอง `--fs-xs` `--text-secondary` · ปุ่มขวา secondary 40 (44 touch) คำสั้น ("ดูเช็คชื่อ", "สำรองตอนนี้", "เริ่มภาคเรียนใหม่") · เรียง danger → warning → info · ตัวอย่างข้อมูลสมมติ: `cloud-x` ส่งไม่สำเร็จ 1 รายการ · `cloud-upload` เช็คชื่อยังไม่ส่ง 2 ห้อง · `database-export` สำรองล่าสุด 9 วันก่อน · `calendar-event` ภาคเรียน 1/2569 สิ้นสุดแล้ว · **ว่าง** = แถบซ้าย `--fill-success` + `circle-check` `--text-success` "ไม่มีเรื่องค้าง · วันนี้พร้อมสอน"
- ปุ่มลัด `.hm-action` 4 เท่ากัน gap 8: `min-height 3.5rem` padding `10px 12px` radius 12 ขอบ .5px เงา `--shadow-card` `justify-content:flex-start` · ไอคอน 24 ในกล่อง 24 ชิดซ้าย (ทุกปุ่มตำแหน่งเดียวกัน) สี `--text-accent` · ชื่อ 1rem/500 · บรรทัดรอง `--fs-xs` `--text-secondary` · primary (สแกนส่งงาน) พื้น `--accent` ทุกตัวอักษร/ไอคอน `--on-accent` บรรทัดรอง opacity .85 (4.72:1 ผ่าน) · ลำดับ (ตาม ux.md §2): สแกนส่งงาน `scan` · เช็คชื่อ `user-check` · สุ่มชื่อ `dice-3` · สร้างงาน `plus`
- ตัวเลข `.uc-stat` 4 ช่อง gap 10: radius 12 padding `12px 14px` เงา card · แถวบน: ป้าย `--fs-xs` `--text-secondary` + ไทล์ **2rem radius 8** ไอคอน 20 · ค่า **1.6rem/600 `tabular-nums` lh 1.2** หน่วย `--fs-xs` 400 · hint `--fs-xs` · กดได้ทั้งใบ (hover surface-1, focus ring) · โทน: งานที่เปิดรับ `clipboard-list` ไทล์ `--surface-1`/`--text-secondary` (ข้อมูลกลาง) · รอตรวจ `hourglass-empty` `--bg-accent`/`--text-accent` (ตรงกับ `.wcell.awaiting`) · ค้างส่ง `alert-circle` `--bg-danger`/`--text-danger` + ค่าสี `--text-danger` · มาเรียนวันนี้ `user-check` `--bg-success`/`--text-success`
- แถวในการ์ด: ชื่องาน 1rem/500 ellipsis · `.hm-prog` grid `3.2rem minmax(0,1fr) 3.5rem auto` gap 8 · **progress bar 8px radius 4** ราง `--border` เติม `--fill-success` (ครบ) / `--fill-warning` (มีค้าง) · stack bar เช็คชื่อ 8px radius 4 · avatar `2rem` (ต้องติดตาม) · แถวกดได้ `min-height var(--row-h)`
- chip สถานะ `--fs-xs` padding `2px 8px` radius pill **ไอคอน 16 + คำเสมอ**: รอตรวจ `hourglass-empty` bg/text-accent · ค้าง `alert-circle` bg/text-danger · ส่งช้า `clock` bg/text-warning · ครบ `circle-check` bg/text-success · ยังไม่เช็ค `clock` warning · เลยกำหนด `calendar-event` danger · ปุ่มชิป "สแกน" `scan` พื้น `--surface-1` ขอบ .5px สูง 32 (44 touch)
- การ์ดอื่น (หัว+ไอคอน · ชุดสุดท้าย 7 ใบตาม ux.md §3 — "ใกล้กำหนดส่ง" ถูกรวมเป็นการเรียงในการ์ดงาน): งานที่กำลังเก็บ `clipboard-list` · เช็คชื่อวันนี้ `user-check` · ต้องติดตาม `flag` · ห้องของฉัน `school` (pill ต่อห้อง "ป.4/1 · 32 คน" กดไปหน้านักเรียน) · ค้างในเครื่องนี้ `device-mobile` (แถวต่อชนิด `cloud-upload`/`cloud-x`) · สำรองข้อมูล `database-export` (วันที่ล่าสุด + ปุ่ม) · ภาคเรียน `calendar-stats` (ชื่อ, ช่วงวัน, bar สัปดาห์ที่ผ่าน)

## 5) แผง "ปรับหน้าหลัก" (Drawer เดิม)
- `.drawer` `width:min(420px,100%)` พื้น `--surface-2` padding `14px 16px` · หัว: "ปรับหน้าหลัก" 1.07rem/500 + `button.icon.ghost` `x` 44 · บรรทัดรอง `--fs-xs` "เปิด/ปิดและเรียงการ์ด · บันทึกทันที ใช้กับทุกเครื่องที่เข้าสู่ระบบ" (เจ้าของงานเลือกซิงก์ผ่าน settings)
- แถวการ์ด `min-height 56px` grid `20px minmax(0,1fr) auto auto` gap 8 `border-top .5px`: ไอคอนการ์ด 20 `--text-secondary` · ชื่อ 1rem + คำอธิบาย `--fs-xs` `--text-secondary` (เช่น "งานที่เปิดรับ แยกรายห้อง") · ปุ่ม ▲▼ = `button.icon.ghost` 44×44 `chevron-up`/`chevron-down` 20 (ตัวแรก/ท้าย disabled opacity .4) · `.switch` 4rem×2.4rem ของ `base.css` (on = `--accent`)
- แถวที่ปิด: `opacity:.6` + ไอคอนการ์ดเปลี่ยนเป็น `eye-off` · ปุ่ม ▲▼ ยังกดได้
- ล่าง: `button.ghost` เต็มแถว 44 `history` 20 "คืนค่าเริ่มต้น" margin-top 12 · การ์ด "ต้องทำตอนนี้" ปิดไม่ได้ (ไม่อยู่ในรายการ)

## 6) ไอคอน (Tabler v3.48 ตรวจแล้วมีทุกชื่อ) — ขนาด 16 chip · 20 ปุ่ม/แถว/หัวการ์ด/ไทล์ stat · 24 เมนู/ปุ่มลัด/โลโก้
| ที่ | ไอคอน |
|---|---|
| เมนู 8 | `home` `scan` `user-check` `dice-3` `notebook` `chart-bar` `users` `settings` |
| เปลือก | โลโก้ `checks` · ออกจากระบบ `logout` · เมนูมือถือ `menu-2` · ปรับหน้าหลัก `layout-grid` · ปิด `x` · เรียง `chevron-up` `chevron-down` · คืนค่า `history` · การ์ดปิด `eye-off` |
| stat 4 | `clipboard-list` `hourglass-empty` `alert-circle` `user-check` |
| ปุ่มลัด 4 | `scan` `user-check` `plus` `dice-3` |
| การ์ด | `clipboard-list` `user-check` `flag` `school` `cloud-upload` (ค้างในเครื่องนี้ — mockup ใช้แทน `device-mobile` ให้ตรงกับชิปสถานะ) `database-export` `calendar-event` (ภาคเรียน — mockup ใช้แทน `calendar-stats`) · ต้องทำตอนนี้ `alert-triangle` |
| สถานะ | ออนไลน์ `cloud-check` · ข้อมูลเก่า/ออฟไลน์ `cloud-off` · รอส่ง `cloud-upload` · ส่งไม่สำเร็จ `cloud-x` · กำหนดส่ง/ภาคเรียนจบ `calendar-event` · สำรอง `database-export` · ยังไม่เช็ค/ส่งช้า `clock` · ครบ/สำเร็จ `circle-check` · เช็คบางส่วน `circle-half-2` |

## 7) สี / contrast (สูตร WCAG 2.1 คำนวณจากค่า hex ใน tokens.css; ข้อความต้อง ≥ 4.5, UI/ไอคอน ≥ 3)
| ใช้ที่ | light | dark | ผล |
|---|---|---|---|
| rail/sheet on: `--text-accent` บน `--bg-accent` | #1a56b0/#e6f0fc **6.07** | #9cc2f2/#1d2b44 **7.70** | ผ่าน |
| แถบ on / ไอคอน accent บนขาว | #2f6fde/#fff **4.72** (บน surface-1 4.17) | #5a92ee/#1b1f27 **5.33** | ผ่าน UI |
| ปุ่มลัดหลัก: `--on-accent` บน `--accent` | #fff/#2f6fde **4.72** | #0b1220/#5a92ee **6.05** | ผ่าน |
| ป้าย rail `--text-secondary` บน surface-2/1 | #59616e **6.25** / 5.52 | #a7afbd/#232833 ≈ 7.5 | ผ่าน |
| หัวกลุ่ม/hint `--text-muted` ใหม่ บน surface-0 / surface-2 | #646c79 **4.90** / **5.30** | #8d96a6 **6.02** / **4.95** | ผ่าน (เดิม 2.90 ไม่ผ่าน) |
| chip/ไทล์ warning: `--text-warning` บน `--bg-warning` | #8a5a08/#fbefd6 **5.19** | #f0c674/#3a2a08 **8.61** | ผ่าน |
| chip/ไทล์ danger · success | **6.14** · **5.46** | **7.45** · **8.37** | ผ่าน |
| ลิงก์ "ดูทั้งหมด ›" `--text-accent` บนขาว | **7.00** | #9cc2f2/#232833 **8.02** | ผ่าน |
| แถบซ้าย `--fill-warning` บนขาว | **2.32** (ตกแต่ง มีไอคอน+คำกำกับ) | **6.35** | ยอมรับ |
| `--bg-accent` vs พื้น rail | surface-1 **1.02** / surface-2 **1.15** | – | → ต้องมีแถบ 3px + สีตัวอักษร |

## 8) สิ่งที่ไม่ทำ
ไม่มี motion/transition ใหม่ (คง `transition` สี 120ms ของปุ่มเดิมได้ ไม่เพิ่ม) · ไม่ไล่สี/เงาหนัก (เงาเฉพาะ `--shadow-card`) · ไม่เปลี่ยนฟอนต์/น้ำเงินหลัก · ไอคอนสีเดียว (currentColor) ไม่ใช้ไอคอนหลายสี/filled · ไม่เพิ่มเมนู/หน้าใหม่ · ไม่ใช้สีอย่างเดียวบอกสถานะ · ไม่ใช้ตัวอักษร < 13px

## 9) ตารางตรวจรับ (ถ่ายผ่าน `node scripts/shots.cjs` ทุกแถวใน context.md "อุปกรณ์เป้าหมาย" · light + dark)
| ตรวจ | iPad ตั้ง 820×1180 ฟอนต์ 18 | iPad นอน 1180×820 ฟอนต์ 18 (+ลอง 24) | คอม 1536×729 ฟอนต์ 16 | มือถือ 390×844 |
|---|---|---|---|---|
| ไม่เลื่อนแนวนอน (`scrollWidth ≤ clientWidth`) | ✓ | ✓ | ✓ | ✓ |
| rail: 8 ป้าย + "ออกจากระบบ" ไม่ตัดคำ/ไม่ล้น, รวมสูง ≤ จอ | ✓ (สูงเหลือเฟือ) | ✓ 744 ≤ 820 · ที่ 24 หัวกลุ่มซ่อน ≤ 820 | ✓ 674 ≤ 729 | – (ซ่อน) |
| แท็บล่าง: 5 ป้าย ≥13px ไม่ถูกตัด, ปุ่มสแกน 56 ยก 18 | – | – | – | ✓ |
| ทุกปุ่ม/แถวกดได้ ≥ 44px (touch) · คอม 40/32 | ✓ | ✓ | 40/32 | ✓ |
| ตัวอักษรทุกจุด ≥ 13px (`--fs-xs`) | ✓ | ✓ | ✓ | ✓ |
| ปุ่มลัด ชื่อ+บรรทัดรองไม่ตัด | 2×2 | ✓ 1 แถว | ✓ 1 แถว | 2×2 |
| การ์ด 2 คอลัมน์ 1.4fr/1fr พอดี ไม่มีคอลัมน์ว่าง | 1 คอลัมน์ | ✓ 2 คอลัมน์ | ✓ 2 คอลัมน์ | 1 คอลัมน์ |
| สถานะ on ของเมนูเห็นชัด (แถบ 3px + สี) ทั้ง light/dark | ✓ | ✓ | ✓ | ✓ (เม็ดพื้น) |
| focus ring เห็นชัดเมื่อกด Tab ครบทุก control | – | – | ✓ | – |
| Drawer "ปรับหน้าหลัก": สวิตช์/▲▼ 44, แถวปิดจาง, คืนค่า | ✓ | ✓ | ✓ | ✓ เต็มจอ |

### ผลวัดจริงของ mockup (Playwright/Chromium · 3 พ.ย. · ไฟล์ `preview.html` รุ่นหลังแก้ตามรีวิว)
- ชุดที่วัด: 4 อุปกรณ์ × สว่าง/มืด × ตัวอักษร ค่าเครื่อง/16/24 × สถานการณ์ 7 แบบ × หน้า (หน้าหลัก / แผงปรับ / รายการ / sheet มือถือ) = **276 ชุด** · ผ่านเกณฑ์ทั้งหมด (ไม่เลื่อนแนวนอน · ปุ่ม/ลิงก์ ≥ 44px บนจอสัมผัส · ตัวอักษร ≥ 13px · ป้าย rail/แท็บไม่ตัดคำ · h1 เดียว) **254 ชุด**
- ไม่ผ่าน 22 ชุด = **คอม 1536×729 ที่ตั้งตัวอักษร 24 เท่านั้น**: rail สูง 735–762 > 729 แม้ซ่อนหัวกลุ่มแล้ว → rail เลื่อนได้ตามสเปก (overflow-y:auto) ปุ่ม "ออกจากระบบ" ยังถึงได้ด้วยการเลื่อน · iPad นอน 820 ที่ 24px พอดี (ซ่อนหัวกลุ่ม)
- เทสต์กดจริง: ตัวเลข 4 ช่อง (3 ช่องเปิดรายการ, "มาเรียนวันนี้" ไปหน้าเช็คชื่อ) · สวิตช์/▲▼/คืนค่า (ยืนยัน 2 ขั้น) · ตัวกรอง 3 แบบ · ดูรายชื่อในการ์ดครบกำหนด · ซ่อนชื่อ · แท็บเมนู/sheet · Esc/scrim — ไม่มี JS error
- ไฟล์ผลละเอียด (ไม่เก็บเข้า repo): scratchpad `audit.md` · ยังไม่ได้ลอง Safari/iPad จริง (D09)

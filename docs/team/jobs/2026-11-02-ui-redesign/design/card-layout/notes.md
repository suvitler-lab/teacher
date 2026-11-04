# เลย์เอาต์การ์ดบนจอกว้าง — ข้อเสนอเดียวใช้ทุกหน้า

สถานะ: ข้อเสนอออกแบบ รอเจ้าของงานตัดสิน (ยังไม่แตะโค้ดแอป) · ดู mockup กดได้: `design/card-layout/preview.html`
(สลับหน้า รายงาน/นักเรียน/หน้าหลัก/ตั้งค่า · ความกว้าง 820/1180/1536/1920 · สว่าง/มืด · ก่อน/หลัง · แผง "ปรับการ์ด" จำลองให้ซ่อน/เลื่อนการ์ดเองได้)

## 1. สรุปสำหรับเจ้าของงาน (ภาษาไทย)

**ปัญหา:** บนจอคอม/iPad นอน การ์ดทุกใบเรียงเป็นแถวเดียวยืดเต็มจอ แถบ "อัตราการส่ง" ยาวเกือบ 1,600px แล้วรายการต่อ ๆ ไปก็ไหลลงยาว ๆ — อ่านยาก ต้องเลื่อนเยอะ

**แนวทางเดียวที่ใช้ทุกหน้า (ง่าย ๆ 3 ข้อ):**
1. **จำกัดความกว้างเนื้อหา** ไม่เกิน 96rem (ประมาณ 1,536px บนคอม) แล้ววางกึ่งกลาง ไม่ยืดตามจอ 1920
2. **หน้าที่มี "ตาราง/รายชื่อหลัก" (รายงาน, นักเรียน)** → ตาราง/รายชื่ออยู่ซ้าย การ์ดเรียงเป็นแถบด้านขวา เห็นตัวเลขสรุปพร้อมตารางตั้งแต่จอแรก
3. **หน้าที่การ์ดคือเนื้อหา (หน้าหลัก, การ์ดในตั้งค่า)** → แบ่งเป็น 2–3 คอลัมน์ ใบถัดไปลงคอลัมน์ที่ยังสั้นกว่า (ไม่เว้นที่ว่างเป็นช่อง ๆ)
- แถบความคืบหน้าของแต่ละงานยาวไม่เกิน 26rem (ประมาณ 416px) ตัวเลข x/y และ % อยู่ชิดแถบ
- ลำดับที่ครูตั้งใน "ปรับการ์ด" ยังใช้ได้ทุกแบบ: ใบแรกอยู่บนซ้าย ใบต่อไปลงคอลัมน์ที่สั้นกว่า · ซ่อนใบไหนก็คำนวณใหม่ · เหลือใบเดียวก็ไม่ยืดเต็มจอ (กว้างสุด 48rem ชิดซ้าย)
- แอปวัดความกว้าง "ของพื้นที่เนื้อหา" ไม่ใช่ความกว้างจอ → ถ้าครูตั้งตัวอักษรใหญ่ขึ้น แอปลดจำนวนคอลัมน์เองโดยอัตโนมัติ

**ผลที่วัดใน mockup** (ข้อมูลสมมติ นักเรียน 36 คน งาน 12 ชิ้น · "หน้าจอ" = ความสูงจอจริงของอุปกรณ์นั้น)

| หน้า | จอ | ก่อน | หลัง | หมายเหตุ |
|---|---|---|---|---|
| รายงาน | 1536 | 3.7 | **1.9** | แถบส่งงาน ≤ 26rem · ตารางซ้าย การ์ดขวา |
| รายงาน | 1920 | 3.2 | **1.7** | |
| รายงาน | 1180 (iPad นอน) | 4.3 | **2.6** | ตารางซ่อนคอลัมน์ "มา" ตามกติกาเดิม |
| นักเรียน | 1536 | 3.1 | **2.4** | แถบข้างตรึงตามการเลื่อน · แถวบนคอมเตี้ยลง (48px) |
| นักเรียน | 1920 | 2.7 | **2.1** | รายชื่อ 36 แถวยาวตามธรรมชาติของข้อมูล |
| หน้าหลัก | 1536 | 1.8 | **1.2** | 3 คอลัมน์ |
| หน้าหลัก | 1920 | 1.5 | **1.1** | |
| ตั้งค่า | 1536 | 1.0 | 0.8 | ที่ได้จริงคือ "อ่านง่าย": ฟอร์มกว้างไม่เกิน 52rem ไม่ยืดทั้งแถว |
| ทุกหน้า | 820 (iPad ตั้ง) | — | เท่าเดิม | 1 คอลัมน์ ไม่เปลี่ยน |

**ตัดสินรายหน้า**
- **รายงาน:** ≥ 56rem (iPad นอน/คอม) = ตาราง "รายบุคคล" ซ้าย (สัดส่วน 1.2) | การ์ดขวา 1 คอลัมน์ (สัดส่วน 1). ต่ำกว่านั้น = การ์ด 1–2 คอลัมน์ แล้วตารางอยู่ล่าง (เหมือนเดิม). ไม่มีการ์ดเลย → ตารางกว้างไม่เกิน 64rem.
- **นักเรียน:** ≥ 54rem = รายชื่อซ้าย | แถบข้างกว้าง 20rem ตรึง (sticky) ทุกการ์ดอยู่แถบนี้ (รวม "สรุปห้อง" ที่กดกรองได้). ต่ำกว่านั้น = "สรุปห้อง" อยู่บนรายชื่อ ที่เหลืออยู่ใต้รายชื่อ.
- **หน้าหลัก:** แถบเตือน/ปุ่มลัด/ตัวเลข 4 ช่องยังเต็มแถวเหมือนเดิม; การ์ดใต้ลงไปแบ่ง 1–3 คอลัมน์ตามน้ำหนัก (เลิกใช้ "คอลัมน์ซ้ายสำหรับงาน/ห้อง" แบบตายตัว).
- **ตั้งค่า:** การ์ดข้อมูลแบ่ง ≤ 2 คอลัมน์; การ์ดฟอร์มวางคู่กันเมื่อกว้างพอ การ์ดเดี่ยว (เช่น เวลาเรียน) กว้างไม่เกิน 52rem.
- **สมุดคะแนน (การ์ดใต้ตาราง):** ตารางยังเต็มกว้าง (ต้องเลื่อนข้าง); การ์ดด้านล่างใช้ระบบเดียวกัน ≤ 3 คอลัมน์.
- **สแกน / เช็คชื่อ / สุ่มชื่อ:** มีโครง "งานหลักซ้าย + การ์ดขวา" อยู่แล้ว ไม่แก้เลย์เอาต์; แค่ให้การ์ดฝั่งขวาใช้กติกาลำดับ/สมดุลเดียวกัน.

**ข้อควรรู้ (ข้อแลกเปลี่ยน):** ใบที่ 2 ไม่จำเป็นต้องอยู่ "ขวาของใบที่ 1" แต่จะลงคอลัมน์ที่ยังสั้นกว่า (ใบแรก ๆ จะกระจายไปแต่ละคอลัมน์ซ้าย→ขวาก่อนเสมอ) · คอลัมน์อาจสูงไม่เท่ากันเล็กน้อย เพราะใช้น้ำหนักประมาณ (ไม่ใช้ความสูงจริง — ไม่ให้การ์ดกระโดดเมื่อกด "ดูทั้งหมด"/โหลดเสร็จ).

**ทางที่ไม่เลือก:** CSS columns (การ์ดกระโดดข้ามคอลัมน์เมื่อความสูงเปลี่ยน), grid-auto-flow:dense (สลับลำดับจริงกับที่เห็น), CSS masonry (Safari/iPad ยังไม่รองรับ), 12-col แบบกำหนดช่วงกว้างรายการ์ด (เกิดช่องว่างเมื่อสลับลำดับ).

**ความขัดกันกับ round3-notes §3.3:** `.rp-cols` (1.25fr/1fr สองคอลัมน์การ์ด) ที่เขียนไว้ไม่ได้ถูกสร้าง และโครงใหม่นี้ **แทนที่** ข้อนั้น (ตารางซ้าย การ์ดขวา) — ให้ถือ notes นี้เป็นฉบับล่าสุดสำหรับเลย์เอาต์.

---

# Developer spec (English)

Scope: layout only. Cards keep their own markup/content. No new dependency. Files likely touched: `src/styles/{base,report,students,home,grade,settings,settings-cards}.css`, new `src/lib/pageColumns.ts` (+ unit test), new `src/components/PageCols.tsx`, `src/pages/{Reports,Students,Home,Settings,Gradebook}.tsx`, `src/components/reports/ReportParts.tsx`, `src/components/home/meta.ts`, `src/components/cards/meta.ts`.

## 1. Tokens and breakpoints (all in rem of the user's font size; no viewport px)

| Name | Value | Notes |
|---|---|---|
| `--pg-max` | `96rem` | page body max width, centered (`margin-inline:auto`) |
| `--col-gap` | `0.75rem` (12px at 16px) | between columns and between cards |
| `MIN_COL` | `26rem` | default minimum column width. Settings info cards use `20rem` |
| `ONE_COL_MAX` | `48rem` | when a region ends with 1 column, cap it and keep left |
| Reports split | `>= 56rem` of the page body | table (1.2fr) + cards (1fr) |
| Students split | `>= 54rem` | list (1fr) + aside `20rem` (list row needs >= 34rem) |
| max columns | Home 3, Gradebook cards 3, Settings cards 2, Reports/Students stacked cards 2 | |

Content width reference (rail 96px, padding 24px, rem 16 desktop / 18 iPad): 820 iPad = 37.6rem -> 1 col · 1180 iPad landscape = 57.1rem -> 2 cols / split · 1536 = 87rem -> 3 cols / split · 1920 = 96rem (capped) -> 3 cols / split. Because widths are measured per container, a bigger text size (rem 20-24) falls back automatically.

## 2. Pure functions (new `src/lib/pageColumns.ts`, unit-testable)

```ts
export const MIN_COL = 26, GAP = 0.75;
/** columns that fit in a region of `widthRem`, never more than max or the card count */
export function colsFor(widthRem: number, max: number, count: number, minCol = MIN_COL): number {
  const fit = Math.floor((widthRem + GAP) / (minCol + GAP));
  return Math.max(1, Math.min(max, count, fit));
}
/** keys in the teacher's order -> n columns; next card goes to the column with the least weight so far (tie = leftmost) */
export function splitColumns<K extends string>(keys: K[], n: number, weightOf: (k: K) => number): K[][] {
  const cols = Array.from({ length: n }, () => ({ h: 0, keys: [] as K[] }));
  for (const k of keys) {
    let t = cols[0];
    for (const c of cols) if (c.h < t.h) t = c;
    t.keys.push(k); t.h += weightOf(k);
  }
  return cols.map((c) => c.keys);
}
```
Properties to test: first `n` cards land in columns 0..n-1; later cards never change earlier placement; hidden cards are simply absent from `keys`; `count = 0` renders nothing; reorder of two cards changes only those cards' columns.
Weights (static, in `cards/meta.ts` and `home/meta.ts`; ~ height / 8rem): S = 1, M = 2, L = 4. Do not measure heights (cards would jump on "show more"/loading).
- reports: stats S, works L, att S, follow L, hist M
- students: sum M (pinned top in stacked mode), qr S, moved M, recent M
- home: open L, att M, follow M, due M, absent S, classes L, queue S, backup S, term S
- settings: status S, backup S, term M, devices M, history M
- gradebook: summary M, awaiting M, close M, legend S, shortcuts S, follow L, dist M, recent M
Optional later: a `full` size = banner-like card that splits the list into bands (no current card needs it).

## 3. Component

`<PageCols page keys max minCol render />` (Preact): measures its own box with `ResizeObserver` (width / `parseFloat(getComputedStyle(document.documentElement).fontSize)`), computes `n = colsFor(...)`, renders `n` `.pg-col` divs from `splitColumns`. Initial render before measure = 1 column (no layout shift on phones). Same hook (`useRegionRem(ref)`) returns the page-body width for the split decision (`rem >= 56` etc.). Keyboard/screen-reader order = DOM order (column 1 top to bottom, then column 2); in Reports stacked mode the cards come before the table, in split mode DOM is table first then cards.

```css
.pg { width:100%; max-width:var(--pg-max,96rem); margin-inline:auto; }
.pg-cols { display:grid; grid-template-columns:repeat(var(--n,1), minmax(0,1fr)); gap:.75rem; align-items:start; min-width:0; }
.pg-cols[data-n="1"] { max-width:48rem; }           /* one column never stretches */
.pg-col  { display:flex; flex-direction:column; gap:.75rem; min-width:0; }
.pg-split { display:grid; gap:.75rem; align-items:start; grid-template-columns:minmax(0,1fr); }
.pg-split.lg { grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); }   /* reports */
.pg-split.sm { grid-template-columns:minmax(0,1fr) 20rem; }             /* students */
.pg-aside.sticky { position:sticky; top:.75rem; align-self:start; max-height:calc(100dvh - 1.5rem); overflow-y:auto; }
.pg-solo { max-width:64rem; }                       /* locked main block with no cards */
```
`.pg-split.lg/.sm` are applied by JS (class on) only when the measured width passes the threshold, so CSS and JS never disagree. Sticky only for pages whose aside is shorter than a screen (Students; not Reports).
Remove: `.hm { max-width:78rem }` (use `.pg`), `.hm-cols/.hm-col/WIDE_CARDS`, `.stu-grid.two`, `.rp-cards` single column, `.gb-cards` auto-fit grid, `.set-cards` auto-fit grid.

## 4. Submit-rate bars (do not stretch)

```css
.rp-work { grid-template-columns: clamp(7rem,32%,11rem) minmax(0,26rem) minmax(4rem,auto) 3.2rem; justify-content:start; }
@container rp (max-width:25rem) { /* keep existing two-line rule, threshold was 40rem */ }
```
Same cap for `.hm-prog` (`minmax(0,26rem)`) and any other `track` rows. Card interior rules stay container-based (`container: rp / inline-size`).

## 5. Reports stats tiles

```css
.rp-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
@container rp (min-width:30rem) { .rp-stats { grid-template-columns:repeat(4,minmax(0,1fr)); } }
```
Mouse screens: `@media (pointer:fine) { table.rp-table td { height:2.2rem } .stu-lrow { min-height:3rem } }` and on those screens put the nickname on the same line as the name (touch screens keep `max(44px, ...)` rows as today).

## 6. Per-page task list

1. **Reports (`Reports.tsx`, `ReportParts.tsx`, `report.css`)** — wrap body in `.pg`; if `rem>=56 && visible>0`: `.pg-split.lg` = `[people table][aside: <PageCols max=1>]`; else if visible>0: `<PageCols max=2>` then the table; else table in `.pg-solo`. `ReportCards` renders one card per key (stats included as a normal card, no special pinned strip). Apply §4, §5. Print/projector unchanged: make sure `@media print` forces `.pg-split`/`.pg-cols` to one block column (round3-notes §3.4 expects a single column on A4).
2. **Students (`Students.tsx`, `students.css`)** — `rem>=54`: `.pg-split.sm` list | sticky aside with all visible cards (`sum` tiles stack in one column via container rule `@container (max-width:26rem){.stu-tiles{grid-template-columns:1fr}}`). Else: `sum` above list, other cards below in `<PageCols max=2>`. `sum` is pinned first on this page: disable its up/down arrows in `PageCardSettings` or document that its order is ignored.
3. **Home (`Home.tsx`, `home.css`, `home/meta.ts`)** — keep todo/actions/stats rows full width inside `.pg`; replace `hm-cols` with `<PageCols max=3>`; delete `WIDE_CARDS`; add weights.
4. **Settings (`Settings.tsx`, `SettingsCards.tsx`, `settings.css`)** — info cards `<PageCols max=2 minCol=20>`; `.set-forms { display:grid; gap:.75rem; align-items:start; grid-template-columns:repeat(auto-fit,minmax(min(100%,30rem),1fr)); }` and `.set-forms > .card { max-width:52rem; width:100%; justify-self:start; }`. (Note: `minmax(.., 52rem)` as the max does NOT work with auto-fit — it counts the max, giving 1 column.) Banners and the sticky save bar stay full width.
5. **Gradebook (`Gradebook.tsx`, `grade.css`)** — table frame unchanged; `.gb-cards` -> `<PageCols max=3 minCol=22>`.
6. **Scan / Attendance / Random** — keep current main+side grids (`@media 1000px` -> optional later switch to the measured split); aside cards flow in order in one column. No change required for this task.
7. **`PageCardSettings` copy** — add one line under the list: "ใบแรกอยู่บนซ้าย · ใบถัดไปลงคอลัมน์ที่ยังสั้นกว่า" (the current drawer implies a single vertical list).
8. **Tests** — unit: `colsFor`, `splitColumns` (cases above); component: 1 visible card => `data-n=1`; 0 cards => table only; existing tests that look for `.hm-cols` / `.stu-grid` / `.gb-cards` / `.set-cards` need the new selectors.

## 7. Targets and acceptance

- Reports <= 2 screens at 1536x864 and 1920x1080 with 36 students / 12 works (mockup: 1.9 / 1.7); Students <= 2.5 screens at 1536 with 36 students (2.4); Home <= 1.3 (1.2).
- No submit-rate bar longer than 26rem at any width; no card wider than 48rem when alone in its region.
- Works with any order and any subset of visible cards (mockup panel proves: hide all but one, reorder, show all).
- Touch targets unchanged (>= 44px on coarse pointer); light + dark verified in mockup; no new px font sizes.

## 8. Known limits of the mockup

Fake data/icons; widths simulated with fixed-width frames + `transform: scale` (layout uses the frame's own width, so it matches a real window of that width); "จอจริง (เลื่อนได้)" view shows the sticky aside; no screenshots saved to `design/screens/` (the coordinator opens preview.html in the pane).

# สเปก layout หน้ารายงาน (R4) — การ์ดต้องมีเพดานความสูง

ที่มา: เจ้าของงานส่งภาพหน้าจริง (23 งาน / ค้าง 43 คน) แล้วบอกว่า "layout ไม่เหมือนที่ออกแบบ การ์ดมันยาวไป"
mockup ที่แก้แล้ว: `design/round2-wip/r3-js-rp.js` + `r3-css.css` (ส่วน `rp-`) → ประกอบด้วย `node build.cjs`
หมายเหตุ: โค้ดจริงรอบ 3 ของหน้ารายงานอยู่เฉพาะในเครื่องเจ้าของงาน (ยังไม่อยู่ใน git) — เซสชันในเครื่องต้อง `git pull origin team/2026-11-04-ui-redesign` แล้วนำสเปกนี้ไปใช้กับ `src/pages/Reports.tsx` และ `src/styles/report.css`

## ผลวัด (mockup, ข้อมูล 23 งาน / ค้าง 43 คน)
| จอ | ตารางรายบุคคลเริ่มที่ (px) | การ์ดงาน | การ์ดขวา (การมาเรียน + ต้องติดตาม) |
|---|---|---|---|
| คอม 1536×729 | 819 | 460 | 122 + 12 + 326 = 460 (สูงเท่ากัน) |
| iPad นอน 1180×820 | 861 | 470 | 124 + 333 |
| iPad ตั้ง / มือถือ | 1 คอลัมน์ | 418–450 | 124–157 + 333 |
ทุกแถวงานสูง 44px เท่ากัน ไม่ตัดบรรทัด · ไม่มีเลื่อนแนวนอน · JS error 0 (80 สถานะ) · เช็ค 19 ข้อผ่าน

## โครงหน้า (ลำดับ)
1. หัวหน้า + ตัวกรอง (เดิม)
2. `.rp-stats` ตัวเลข 4 ช่อง (คอม/iPad นอน 4 คอลัมน์, iPad ตั้ง/มือถือ 2×2) สูง ~84px — บรรทัดเล็กตัดด้วย … บรรทัดเดียว
3. `.rp-bento` กริด 2 คอลัมน์ `1.4fr / 1fr` `align-items:stretch`
   - ซ้าย: การ์ด `works` (อัตราส่งแต่ละงาน)
   - ขวา (คอลัมน์ซ้อน): `att` (เตี้ย) → `follow` → `hist`/`audit` ถ้าเปิด
   - iPad ตั้ง/มือถือ: คอลัมน์เดียว
   - ถ้า `works` ถูกปิดหรืออีกฝั่งว่าง ให้ใช้ `.one` (คอลัมน์เดียว)
4. ตารางรายบุคคล (`.rp-t`) — ต้องเริ่มภายในประมาณ 1 จอ (เป้า ≤ ~900px บนคอม)

## กติกาการ์ดรายการ (ใช้กับทุกหน้า)
1. **ตัดที่ N แถว + "ดูทั้งหมด (X)"** — works 6 แถว (เรียงตามที่ต้องสนใจก่อน: ถึงกำหนดและ <85% ก่อน ต่ำสุดขึ้นก่อน → ปกติ → "เก็บอยู่" ท้ายสุด) · follow 4 แถว
2. **ขยายภายในการ์ด** (works: `max-height:22rem` เลื่อนในการ์ด) หรือ **เปิดลิ้นชัก** (follow: รายชื่อเต็ม ไม่ขยายการ์ด)
3. **แถวเดียวบรรทัดเดียว** — ชื่อ (ตัด …) + เศษส่วน "27/44 · ยกเว้น 1" เป็นบรรทัดรองเล็กใต้ชื่อ ไม่ใช่คอลัมน์ที่ตัดบรรทัด
4. **แถว bento สูงเท่ากัน** ด้วยกริด ไม่ใช่ 3 คอลัมน์สูงต่างกัน
5. **สีไม่ใช่ตัวบอกอย่างเดียว** — มีเลข % เสมอ แถบหนา 10px ปลายมน เกณฑ์ 85/60
6. ปุ่มทั้งหมด ≥44px บนสัมผัส (แถวงาน 44, แถวติดตาม 52)
7. ระยะห่างการ์ด 12px · หัวการ์ด = ไอคอน + ชื่อ ชิดซ้าย, ตัวเลขรอง/ปุ่ม ชิดขวา

## CSS พร้อมคัดลอก (แปลงเป็น `src/styles/report.css`, ใช้ token เดิมของแอป)
ต้นฉบับอยู่ใน `design/round2-wip/r3-css.css` บรรทัดที่ขึ้นต้นด้วย `.rp-stats`, `.rp-bento`, `.rp-col`, `.rp-card`, `.rp-ch`, `.rp-list`, `.rp-more`, `.rp-wrow`, `.rp-frow` — สรุปค่าหลัก:
```css
.rp-page{display:flex;flex-direction:column;gap:12px;min-width:0}
.rp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.rp-bento{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:12px;align-items:stretch}
.rp-bento.one{grid-template-columns:minmax(0,1fr)}
.rp-col{display:flex;flex-direction:column;gap:12px;min-width:0}
.rp-col>.rp-card:only-child{flex:1}
.rp-list.scroll{max-height:22rem;overflow-y:auto;overscroll-behavior:contain}
.rp-wrow{display:grid;grid-template-columns:minmax(0,1fr) 34% 3.4rem;gap:12px;align-items:center;height:var(--tap)}
.rp-wrow .t{display:flex;flex-direction:column;min-width:0}
.rp-wrow .t b,.rp-wrow .t small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:1024px) and (pointer:coarse){ .rp-bento{grid-template-columns:minmax(0,1fr)} .rp-stats{grid-template-columns:repeat(2,minmax(0,1fr))} }
```

## TSX ที่ต้องเปลี่ยนใน `Reports.tsx`
- แยกการ์ดตาม zone: `works` → `.rp-col` ซ้าย; `att/follow/hist/audit` → `.rp-col` ขวา; `stats` อยู่ก่อน bento; ยังเคารพลำดับและเปิด/ปิดจาก `reports_cards`
- `works`: คำนวณ `sorted` ตามกลุ่ม (ถึงกำหนด<85% → ปกติ → เก็บอยู่) · state `worksAll` · แถว = `<button>` ชื่อ + เศษส่วนรอง + แถบ + %
- `follow`: slice 4 + ปุ่ม "ดูทั้งหมด (N)" เปิด drawer รายชื่อเต็ม (`rpfollowfull`) + ปุ่ม LINE 44px ที่หัวการ์ด
- `att`: การ์ดเตี้ย แถบเดียว + legend บรรทัดเดียว (≤ ~125px)

## หลักการเดียวกันสำหรับหน้าอื่น
คะแนน (แถบการ์ดรอตรวจ/ควรปิดรับ จำกัดแถว + popover) · นักเรียน (การ์ดย้ายออก/ล่าสุด ตัดที่ 3–4 แถว) · ตั้งค่า (อุปกรณ์/ประวัติ ตัดที่ 5 แถว + ดูทั้งหมด) · ทดสอบกับข้อมูลยาว (23 งาน/43 คน) เสมอ ไม่ใช่ข้อมูลตัวอย่างสั้น

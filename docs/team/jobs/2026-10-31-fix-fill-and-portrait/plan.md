# Technical plan: ตารางเต็มจอเมื่องานน้อย + หน้าสแกนแนวตั้งเห็นชื่อเต็ม (fix-fill-and-portrait)

โดย Tech Lead · 2026-11-02

## แนวทาง

- แก้ด้วย CSS เท่านั้นใน `src/styles/grade.css` และ `src/styles/scan.css` ไม่แตะ TSX/สูตร/worker/schema (D29, D30, D22 คงเดิม) · ร่างแรกของ PM ใน working tree ถือเป็นจุดเริ่มของ T-02/T-03 ต้องทบทวนและพิสูจน์ด้วยภาพ ไม่ใช่รับไปเลย
- สมุดคะแนน: `table.gb` กว้าง `max-content` + `min-width:100%` → งานน้อยยืดเต็มกรอบ งานเยอะหดถึง `--gb-col-w` แล้วเลื่อนในกรอบ · คอลัมน์งาน/รวมกลุ่มไม่มี max-width (Gate 1 ข้อ 1 "ยืดเต็มเสมอ" แม้งาน 1 ชิ้น) · ชื่อ (clamp ≤ ~18rem) และสะสม (`--gb-tot-w`) ล็อกความกว้าง ไม่ยืด
- หน้าสแกน < 1000px: คอลัมน์เดียว ลำดับ ช่องสแกน → แป้นคะแนน (`sc-mid`) → สถิติ+ผัง → สแกนล่าสุด (Gate 1 ข้อ 2) · ≥ 1000px ไม่แตะ · มือถือคงผัง 6 คอลัมน์
- เครื่องมือภาพ (D-fix-fill-and-portrait-01 ใน `decisions-local.md`): ใช้ `shots.mjs` ของสกิลเป็นตัวถ่ายหลัก (อ่านอุปกรณ์จาก `context.md §อุปกรณ์เป้าหมาย`, เขียน `evidence/shots/<label>/` + index.json + thumb) · โค้ด CDP/เบราว์เซอร์ใน `scripts/shots.cjs` ซ้ำกับ shots.mjs จึง **ยุบ** เหลือตัวเรียกบาง ๆ: เปิด fixture server (ข้อมูลสมมติ) → เรียก shots.mjs ด้วย `docs/team/pages.json` → ปิด server · คงชื่อ `node scripts/shots.cjs` ตาม AC-11
- ทำตามลำดับ T-01 → T-02 → T-03 (ไม่ขนาน เพราะทุก task ต้อง `npm run build` ลง `dist/` เดียวกันแล้วถ่ายภาพจาก dist นั้น — build พร้อมกันจะทับกัน)

## การเปลี่ยนแปลงต่อส่วน

| ส่วน | เปลี่ยนอะไร |
|---|---|
| `scripts/shots.cjs` | เขียนใหม่เป็นตัวเรียก: `node scripts/shots.cjs --label before\|after [--out <dir>] [--devices k1,k2] [--pages <file>] [--port 41xx]` · หา shots.mjs จาก `DEV_TEAM_SKILL` หรือ `~/.claude/skills/dev-team/scripts/shots.mjs` ไม่พบ → ข้อความชัด exit ≠ 0 · ไม่มี dist → บอกให้ build · ปิด server ทุกกรณี |
| `scripts/fixture-server.cjs` | เพิ่ม option แบบ opt-in (ค่าเริ่มต้นเหมือนเดิม ไม่กระทบ e2e อื่น) เช่น `shots: true`: ป.6/1 วิทยาศาสตร์ 2 งาน, คณิต 14 งาน (gradebook14), วิชาที่สาม 6 งาน, ห้อง/วิชาข้อมูลยาว (ชื่อเล่น 12 ตัว, ชื่อ-สกุล 40 ตัว, ชื่องาน 40 ตัว) — ข้อมูลสมมติทั้งหมด |
| `docs/team/pages.json` | หน้าที่ถ่ายของโปรเจกต์ (ตารางด้านล่าง) · beforeAll: login ด้วยค่าทดสอบของ fixture + ตั้ง `ngankrob-font-size` 18 (สัมผัส) / 16 (คอม) · ภาพต้องถ่ายหลังฟอนต์มีผล (ระวังหน้าแรกก่อน reload) |
| `src/styles/grade.css` | ทบทวนร่าง: ตามแนวทาง + แก้คอมเมนต์ที่ขัดกับโค้ด ("no min-width:100%") |
| `src/styles/scan.css` | ทบทวนร่าง: ลบ breakpoint 721–999px, ลำดับ grid-areas ใหม่, ≥ 1000px เหมือน main |

### หน้าใน `docs/team/pages.json` (ชื่อที่ task อ้าง)

| page | วิธีเข้า (fixture `shots`) | ใช้กับ AC |
|---|---|---|
| `gradebook-2` | `#/gradebook?class=cls_61&subject=sub_sci` ไม่จัดกลุ่ม | AC-01, 07, 08, 10 |
| `gradebook-2-grouped` | เหมือนบน + เลือก "จัดกลุ่มตามประเภท" ใน setup | AC-01 |
| `gradebook-6` | วิชา 6 งาน | AC-03 |
| `gradebook-14` | `#/gradebook?class=cls_61&subject=sub_math` | AC-02, 07, 08, 10 |
| `gradebook-long` | ห้อง/วิชาข้อมูลยาว 2 และ 14 งาน | AC-09 |
| `scan-round` | `#/scan` → ใบงาน 6 สมการ → กรอกทีละคน → เริ่ม → สแกน 1 คน (setup ต้องรับกรณีรอบค้างจาก reload) | AC-04, 05, 06, 07, 08 |
| `scan-long` | หน้าสแกนของห้องข้อมูลยาว | AC-09 |

ฟอนต์ 14/24 ที่ 820 (AC-08): ไฟล์เสริม `docs/team/jobs/2026-10-31-fix-fill-and-portrait/pages-font.json` เรียกด้วย `--pages` + `--devices 820x1180` (key ของอุปกรณ์ = ขนาด เพราะชื่อเป็นภาษาไทย)
ภาพ "before" (main @ `01d5486`): build จาก `git archive 01d5486` ลงโฟลเดอร์ชั่วคราวนอก repo (ห้าม checkout/stash) แล้วชี้ `--label before` ไปที่ dist นั้น — ถ้าทำไม่ได้ ใช้ภาพ before ที่ PM ถ่ายไว้ใน scratchpad และบันทึกที่มาใน dev-notes

## Tasks (PM ลง board)

| Task | งาน | ตำแหน่ง | เขียนได้เฉพาะ | หน้า pages.json | AC | รอ Task | ขนานกับ | พอร์ต |
|---|---|---|---|---|---|---|---|---|
| T-01 | เครื่องมือภาพ: ยุบ shots.cjs เป็นตัวเรียก shots.mjs + fixture `shots` + pages.json + ถ่าย before/after ชุดแรกจากร่าง | Front-End | scripts/shots.cjs, scripts/fixture-server.cjs, docs/team/pages.json, .gitignore, docs/team/jobs/2026-10-31-fix-fill-and-portrait/pages-font.json, docs/team/jobs/2026-10-31-fix-fill-and-portrait/dev-notes/shots-tool.md | ทุกหน้า | AC-11 | — | — | 4101 |
| T-02 | ทบทวนร่างสมุดคะแนน: ยืดเต็มเสมอเมื่องานน้อย, หดถึงต่ำสุดแล้วเลื่อนเมื่องานเยอะ, ชื่อ/สะสมล็อก, ข้อความยาว, ตัวเลขเท่า main | Front-End | src/styles/grade.css, docs/team/jobs/2026-10-31-fix-fill-and-portrait/dev-notes/frontend-gradebook.md | gradebook-2, gradebook-2-grouped, gradebook-6, gradebook-14, gradebook-long | AC-01, AC-02, AC-03, AC-07, AC-08, AC-09, AC-10, AC-12 | T-01 | — | 4102 |
| T-03 | ทบทวนร่างหน้าสแกนแนวตั้ง: คอลัมน์เดียว < 1000px ลำดับ สแกน → แป้นคะแนน → ผัง → สแกนล่าสุด, แนวนอน/คอมเท่า main | Front-End | src/styles/scan.css, docs/team/jobs/2026-10-31-fix-fill-and-portrait/dev-notes/frontend-scan.md | scan-round, scan-long | AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-12 | T-02 | — | 4103 |

ตรวจแล้ว: ไม่มี task ขนานกัน (เรียงเพราะใช้ `dist/` ร่วม) และไฟล์ไม่ทับกัน · ทุก AC-01..12 มี task รับ · พอร์ตไม่ซ้ำ · ตำแหน่งชื่อมาตรฐาน · `dev-notes/frontend.md` เดิมของ PM เป็นประวัติร่าง ไม่มีเจ้าของ (ไม่แก้)

## Test case ที่ตกลงกับ QA (ร่าง — QA เขียนฉบับจริงใน test-plan.md)

| TC | AC | วิธี |
|---|---|---|
| TC-01 | AC-01 | วัดใน DOM: ขอบขวา tot-col vs ขอบขวา .gb-scroll ≤ 2px, ความกว้างคอลัมน์งานต่าง ≤ 1px, scrollWidth == clientWidth · 3 ขนาด × ไม่จัดกลุ่ม/จัดกลุ่ม |
| TC-02 | AC-02 | 14 งาน: คอลัมน์ = `--gb-col-w`, เลื่อนในกรอบ, ชื่อ/สะสม sticky, แถบย่อ/กระโดด/เมนูคอลัมน์/พับ-กาง/แตะรวม เทียบ main |
| TC-03 | AC-03 | 6 งานที่ 820: ไม่เกิด "ที่ว่างขวา + แถบเลื่อน" พร้อมกัน |
| TC-04 | AC-04 | สแกน 820×1180: ผังกว้าง = กว้างเนื้อหา, 8 คอลัมน์, ชื่อ 4 ตัวครบ, 6 ตัวเห็น ≥ 4 + … , หน้าไม่เลื่อนแนวนอน |
| TC-05 | AC-05 | สแกน 1180/1536: ตำแหน่ง/ขนาดกล่องหลักต่างจาก before ≤ 2px |
| TC-06 | AC-06 | สีช่อง/ติ๊ก/ขีด/ไม่มีคิวรอคะแนน/องค์ประกอบครบ ทุกขนาด |
| TC-07 | AC-07 | มือถือ 390×844 เทียบ before |
| TC-08 | AC-08 | สแกนข้อความ < 13px และเป้ากด < 44px ทุกภาพ + ฟอนต์ 14/24 ที่ 820 |
| TC-09 | AC-09 | ฟิกซ์เจอร์ข้อมูลยาว: ไม่ล้นทับ, ความสูงแถวเท่ากัน |
| TC-10 | AC-10 | อ่านตัวเลขทุกช่อง before/after ต้องเท่ากัน |
| TC-11 | AC-11 | รัน `node scripts/shots.cjs` ครบภาพ DPR 2, ไม่มี process ค้าง, ไม่มีเบราว์เซอร์ → exit ≠ 0 |
| TC-12 | AC-12 | `npm run typecheck` · `npm test` (≥ 85 ไฟล์ / 1017) · `npm run build` |

## Endpoint ใหม่ที่ออกแบบในเฟสนี้

| EP ใน api-contract | แทน "EP-ใหม่" ของ AC |
|---|---|
| — ไม่มี (ทุก AC เป็น N/A — แก้การแสดงผล) | — |

## Dependency ที่ติดตั้งแล้วสำหรับงานนี้

| package | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| — ไม่เพิ่ม (ข้อห้ามใน brief) · ใช้ Node ≥ 22 WebSocket + Chrome/Edge ที่ติดตั้งอยู่ | | |

## งานของ DB Specialist / DevOps

- ไม่มี (ไม่แตะ schema/deploy; ห้าม deploy จนผ่าน Gate 2)

## จุดเสี่ยงและลำดับ

- `th.col-w > * { width:0; min-width:100% }` กันหัวคอลัมน์ยาวดันความกว้าง — T-02 ต้องพิสูจน์กับชื่องาน 40 ตัว และโหมดจัดกลุ่ม (แถวหัวกลุ่ม colspan) ว่าคอลัมน์ยังเท่ากัน
- `min-width:100%` + sticky right ของสะสม: ตรวจว่าสะสมยังชิดขวาและไม่ลอยกลางเมื่อยืด, และ `.gb-scroll` ไม่มีแถบเลื่อนซ้อน (gb-2 AC-03)
- หน้าสแกน: `sc-mid:empty` ที่ < 1000px, ช่องสแกน sticky ไม่บังผัง, ฟอนต์ 24 ที่ 820 (Gate 1 ข้อ 3: ชื่อ ≥ 2 ตัวพอ)
- ภาพเป็น Chromium emulation เท่านั้น ผลบน iPad Safari จริง = NOT RUN จนเจ้าของงานยืนยัน (D09) · PNG ไม่เข้า repo: ตอนนี้ `evidence/shots/` ยังไม่ถูก ignore → T-01 เพิ่ม `docs/team/jobs/*/evidence/shots/` ใน .gitignore (T-01 เป็นเจ้าของ .gitignore รอบนี้)
- shots.cjs พึ่งไฟล์ในโฟลเดอร์สกิลนอก repo: ถ้าเจ้าของงานอยากให้ repo ถ่ายภาพเองได้โดยไม่มีสกิล ต้องย้อนเป็นสคริปต์เต็ม (ดู decisions-local)

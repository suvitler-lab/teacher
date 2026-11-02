# Code review: ตารางเต็มจอเมื่องานน้อย + หน้าสแกนแนวตั้ง (2026-10-31-fix-fill-and-portrait)

โดย Code Reviewer · 2026-11-02 · ช่วง diff: `main@01d5486..` (ยังไม่ commit: `src/pages/Gradebook.tsx`, `src/styles/grade.css`, `src/styles/scan.css`, `scripts/fixture-server.cjs`, `.gitignore` + ไฟล์ใหม่ `scripts/shots.cjs`, `docs/team/pages.json`) · รอบแก้ (Verify) 0/3

ความรุนแรง: **ต้องแก้** = สูง · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

## สรุป: ผ่าน

ต้องแก้ 0 ข้อ · แนะนำ 5 ข้อ (ควรแก้ 1 · เสนอ 4)

ไม่ได้รัน npm test/build/server ตามคำสั่ง PM — ข้อสรุปทั้งหมดมาจากการอ่านโค้ด (`git diff main`, grep) ผลด้านภาพเป็นหน้าที่ QA (AC-01..09)

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้ (กลาง)

- **R-01 ลำดับ DOM ของหน้าสแกนไม่ตรงลำดับที่เห็น เมื่อกว้าง < 1000px (♿ WCAG 1.3.2 / 2.4.3)** · `src/styles/scan.css:97` เทียบกับ `src/pages/Scan.tsx:772` (`.sc-recent`) และ `:799` (`.sc-gridcard`)
  - DOM: scan → mid → **recent → grid** แต่ `grid-template-areas: "scan" "mid" "grid" "recent"` แสดง scan → mid → **grid → recent**
  - สถานการณ์: ครูใช้ iPad ตั้ง + คีย์บอร์ด (หรือ VoiceOver) กด Tab ต่อจากแป้นคะแนน โฟกัสกระโดดลงไปการ์ด "สแกนล่าสุด" ใต้ผัง (ข้ามผัง 44 ช่อง) แล้วย้อนขึ้นมาผัง — ลำดับโฟกัสกระโดดขึ้นลง/ผู้อ่านหน้าจออ่านลำดับต่างจากที่ตาเห็น
  - แนวทางแก้: สลับลำดับ DOM ใน `Scan.tsx` ให้ `.sc-gridcard` มาก่อน `.sc-recent` (ที่ ≥ 1000px ใช้ grid-area ชื่ออยู่แล้ว ภาพแนวนอนไม่เปลี่ยน; ลำดับโฟกัสแนวนอนจะเป็น scan → mid → grid(ขวา) → recent ซึ่งพอรับได้) — แต่ plan จำกัด T-03 ให้แก้ `scan.css` เท่านั้น จึงเป็นการตัดสินขอบเขตของ PM: แก้รอบนี้ หรือบันทึกเป็น known issue
  - สถานะ: เปิด

## เสนอ (ต่ำ)

- **R-02 มือถือ (≤ 720px) ลำดับการ์ดเปลี่ยนจาก main** · `src/styles/scan.css:97` — กฎ grid-areas เดียวใช้กับทุกจอ < 1000px ทำให้มือถือ 390×844 เปลี่ยนจาก "สแกนล่าสุด → ผัง" เป็น "ผัง → สแกนล่าสุด" (ผัง 6 คอลัมน์ × 8 แถว ดันการ์ดล่าสุดลงไปไกล) · requirements "สมมติฐาน: มือถือ (< ~600px) คงเดิม" แต่ AC-07 ตรวจแค่ 6 คอลัมน์/ไม่เลื่อนแนวนอน/ไม่ทับ — ไม่ผิด AC แต่ควรให้เจ้าของงานเห็นภาพ 390×844 before/after เรื่องลำดับนี้ หรือเพิ่ม `@media (max-width: 720px)` คืนลำดับเดิมถ้าต้องการคงมือถือ
- **R-03 `overflow: hidden` ใหม่บนหัวคอลัมน์งาน/ช่องคะแนน อาจตัดวงโฟกัสของปุ่มลูกตา/ช่องกรอกคะแนน** · `src/styles/grade.css:37` — `.hs-eye` ชิดมุมขวาบนของ `th.col-w` (top:0 right:0) ถ้า focus ring ใช้ outline-offset ออกนอกกล่อง จะถูกตัด · ให้ QA ดูโฟกัสคีย์บอร์ดที่ปุ่มลูกตาและช่อง `cell-input` ระหว่างแก้คะแนน; ถ้าถูกตัดใช้ `outline-offset` ติดลบเฉพาะจุด
- **R-04 path ส่วนตัวในเอกสารที่จะ commit** · `docs/team/jobs/2026-10-31-fix-fill-and-portrait/brief.md:54` (โฟลเดอร์ uploads ใต้โปรไฟล์ผู้ใช้ ที่เก็บภาพจริงซึ่ง "มีชื่อนักเรียนจริง"), `dev-notes/shots-tool.md:12` (path Temp ใต้โปรไฟล์), `lock.json:4` (workspace) — ไม่มีชื่อนักเรียน/อีเมลจริงในข้อความ แต่เปิดเผยชื่อผู้ใช้เครื่องและที่อยู่ไฟล์ภาพที่มีข้อมูลจริง · เสนอเขียนเป็น "โฟลเดอร์ uploads ของ session (นอก repo)" แทน path เต็ม (`lock.json` เป็นของ PM/ระบบ)
- **R-05 AC-11 เขียนว่า PNG ลง "โฟลเดอร์นอก repo" แต่ค่าเริ่มต้นของสคริปต์อยู่ใน repo** · `scripts/shots.cjs:7` — ปลายทางคือ `<job>/evidence/shots/` ซึ่ง git-ignore แล้ว (`.gitignore:17`, ยืนยันด้วย `git check-ignore`) จึงปลอดภัยในทางปฏิบัติ · แต่ `--out` (`shots.cjs:37`) รับ path ใดก็ได้ ถ้าชี้ไปที่อื่นใน repo PNG จะไม่ถูก ignore — เสนอแก้ข้อความ AC/dev-notes ให้ตรง หรือเตือนเมื่อ `--out` อยู่ใน repo แต่ไม่อยู่ใต้ `evidence/shots`

## ผลตรวจตามโฟกัสที่ PM ระบุ

### 1. grade.css / Gradebook.tsx

| จุด | ผล |
|---|---|
| `--gb-n` = จำนวนคอลัมน์ที่วาดจริง (`Gradebook.tsx:557`) | ตรงกับ `<th>` ที่ render: กลุ่มพับ = 1 (`sumcol`), กาง = `shown.length` (`:582-605`) · ตรง colSpan ของแถวกลุ่ม (`:569`) · PASS |
| n = 0 | เกิดไม่ได้: `displayGroups` ตัดกลุ่มที่ไม่มีคอลัมน์ (`src/lib/gbColumns.ts:69`) และ `effectiveHidden` ไม่ยอมซ่อนทุกประเภท (`gbColumns.ts:42-45`) + `toggleType` กันประเภทสุดท้าย · ถ้าไม่มีงานเลย ตารางไม่ render (`Gradebook.tsx:541`) · fallback `var(--gb-n, 1)` มีอยู่แล้ว · PASS |
| โหมดจัดกลุ่ม + `table-layout: fixed` | fixed layout ใช้แถวแรก = `tr.gh`: `gh-corner` มีคลาส `name-col` (กว้างคงที่), `gh-cell` colSpan ไม่มี width → แบ่งเท่ากัน, `gh-tot` rowSpan=2 มีคลาส `tot-col` (กว้างคงที่) → คอลัมน์ได้ความกว้างถูกต้องเหมือนโหมดไม่จัดกลุ่ม · PASS (อ่านโค้ด) |
| ซ่อนคอลัมน์สะสม | `.gb-frame.no-tot .gb-scroll { --gb-tot-w: 0px }` (`grade.css:32`) ทำให้ calc ความกว้างไม่รวมสะสม · เงา `::after` ยังใช้ค่าของ frame แต่มี `.no-tot::after { right: 0 }` เดิม (`:104`) · PASS |
| ความกว้างต่ำสุดเท่า main (AC-02) | `* { box-sizing: border-box }` (`base.css:7`) → main กว้าง 7.6rem รวม padding; ใหม่ = (กว้างตาราง − ชื่อ − สะสม)/n = 7.6rem พอดีเมื่อเลื่อน · เท่าเดิม |
| sticky ซ้าย/ขวา + z-index | ค่าไม่เปลี่ยน (body 3, thead 2, แถวกลุ่ม 4, มุม 6, เงา 7) · `tot-col` เพิ่ม `box-sizing`/`max-width` เท่านั้น ทำให้ขอบสะสมตรงกับ `right: var(--gb-tot-w)` ของเงามากขึ้น · PASS |
| สูตรคะแนน | diff ใน `.tsx` มีเฉพาะ attribute `style` บรรทัด 557 · ไม่มีไฟล์ใน `src/lib`, `worker`, `shared` ถูกแตะ (`git diff main --stat`) · AC-10 PASS ระดับโค้ด |
| iPad + เมาส์ (pointer:fine, < 1100px) | diff ไม่แตะ media query ใด (`grade.css:94, 136, 159` เหมือน main) และความกว้างคอลัมน์ไม่ขึ้นกับ media อีกต่อไป → ไม่แย่ลงเทียบ main · PASS |
| ข้อสังเกต | `max()` ใน `width` ต้อง Safari ≥ 13.1 — iPad เป้าหมายรองรับ · inline style ใช้แบบเดียวกับ `style=` อื่นในไฟล์ ไม่กระทบ CSP |

### 2. scan.css

- ลบกฎ 721–999px: ช่วงนั้นเป็นคอลัมน์เดียว ผัง 8 คอลัมน์เต็มกว้าง (แท็บเล็ตเล็ก/มือถือนอน เช่น 844×390 ก็คอลัมน์เดียว ตามที่ AC-04 ต้องการ "ทุกความกว้าง < 1000px") · ช่องสแกน sticky ยังอยู่ที่ ≤ 999px (`scan.css:105-107` ไม่เปลี่ยน) · ≥ 1000px ไม่เปลี่ยน (`:108-111`) · ผัง 6 คอลัมน์ ≤ 720px ไม่เปลี่ยน (`:31`) · PASS
- ลำดับ DOM/ภาพ: ดู R-01, R-02

### 3. scripts/shots.cjs + fixture-server.cjs

- ฟัง `127.0.0.1` เท่านั้น (`fixture-server.cjs` `server.listen(port, "127.0.0.1")`) · D1 ในหน่วยความจำ ไม่อ่าน `.dev.vars` ไม่ต่อเน็ต · รหัสผ่าน/อีเมลเป็นค่าสมมติเดิม (`FixturePassword2026`, `fixture@example.com`) — ใน `pages.json` ก็เป็นค่าเดียวกัน · PASS
- ปิดครบ: `shots.cjs:43` `srv.close()` ใน `finally` (ปิด connection + `mf.dispose()`) แล้ว `process.exit` · การปิดเบราว์เซอร์อยู่ใน `shots.mjs` ของ skill (นอก repo, ไม่ได้ตรวจ) · ไม่มีเบราว์เซอร์ → exit 2 พร้อมข้อความ (`shots.cjs:29`) · PASS
- `--layout` เป็น opt-in (`layout = false`), เงื่อนไข `gradebook14` เดิมคงอยู่ · ผู้เรียกอื่น (offline-e2e, qa-sweep, qa-flows, camera, onboarding, trial-rehearsal) ไม่ส่ง `layout` → พฤติกรรมเดิม · PASS
- ชื่อข้อมูล: ชื่อเล่น/ชื่อ-สกุลยาวเป็นคำผสมสมมติ (เช่นนามสกุล 22 ตัวที่ต่อชื่อจังหวัด) ชื่องานเป็นชื่อทั่วไป ไม่พบอีเมล/ชื่อจริง · PASS
- ไม่เข้า build: `tsconfig` include = src/worker/shared/test เท่านั้น · `vite.config.ts` import แค่ `scripts/sw-precache` · ไม่เพิ่ม dependency (`package.json` ไม่เปลี่ยน) · PASS

### 4. .gitignore

- `**/evidence/shots/` จับเฉพาะโฟลเดอร์ชื่อ `shots` ใต้ `evidence` — `git check-ignore` ยืนยันว่า `evidence/shots/a.png` ถูก ignore ส่วน `evidence/evidence.json`, `evidence/shots.md` ไม่ถูก ignore · PASS

### 5. เอกสาร

- ไม่พบชื่อนักเรียนจริงหรืออีเมลจริง · พบ path ส่วนตัว → R-04

### 6. test

- ไม่มีไฟล์ test เปลี่ยน (`git diff main --stat -- test` ว่าง, ไม่มีไฟล์ test ใหม่ใน `git status`) · N/A

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร (มีแต่รหัสผ่าน fixture สมมติเดิม)
- [x] ตรวจ input ฝั่ง server ทุกจุด — N/A ไม่แตะ worker
- [x] ตรวจสิทธิ์ทุก endpoint — N/A ไม่แตะ worker
- [x] ป้องกัน injection/XSS/CSRF — SQL ใน fixture ใช้ `bind` ทุกค่าที่มาจากตัวแปร; inline style `--gb-n` เป็นตัวเลขที่คำนวณเอง
- [x] ข้อมูลส่วนบุคคลไม่ถูก log/ส่งออก — PNG เป็นข้อมูลสมมติและ git-ignore (ดู R-05)
- [x] error ไม่เปิดเผยรายละเอียดภายใน — N/A
- [x] dependency ใหม่ — ไม่มี

## ความถูกต้องของข้อมูล

- [x] เงิน — N/A
- [x] ไม่นับซ้ำ/บันทึกซ้ำ — N/A (แก้เฉพาะการแสดงผล)
- [x] transaction — N/A
- [x] ลบแล้วข้อมูลค้าง — N/A (การลบใน `addLayout` อยู่ใน D1 ในหน่วยความจำเท่านั้น)
- [x] วันที่/พ.ศ. — N/A

## หลักฐาน

- `git diff main --stat -- src scripts .gitignore test` → 5 ไฟล์ (ไม่มี test, ไม่มี src/lib/worker/shared)
- `git check-ignore -v` 3 path → ignore เฉพาะ `evidence/shots/*`
- grep `C:\Users|suvit|@gmail` ในเอกสารงาน → 3 จุด path (R-04), ไม่มีอีเมล
- ไม่ได้รัน test/build/server (ตามคำสั่ง PM) → NOT RUN

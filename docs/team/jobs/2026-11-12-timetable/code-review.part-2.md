# Code review ส่วนที่ 2: ตารางสอน (2026-11-12-timetable) · T-19 T-20 T-21 + เมนู/route + หน้าหลักพอดีจอ + รอบแก้ VF

โดย Code Reviewer · 2026-11-13 · ช่วง diff: `HEAD` (87fe5b8) + ไฟล์ที่ยังไม่ commit (tree ปัจจุบัน) · ต่อจาก `code-review.md` (R-01–R-12) · รอบแก้ (Verify) 1/3
ขอบเขตรอบนี้: `src/pages/Timetable.tsx` · `src/components/timetable/**` (SlotSheet, CellMenu, DayList, TtHeader, ConfirmBox, Notices, ttCells, layoutTypes, `a/` `b/` `c/`, `frame/FrameSheet`) · `Shell.tsx` · `app.tsx` · `shell.css` · หน้าหลักพอดีจอ (`home/a/ScrollArea.tsx`, `Timeline.tsx`, `a/index.tsx`, `TtRows.tsx`, `home-a.css`, `TimetableStrip.tsx`, `home-tt.css`, `pages/Home.tsx`) · รอบแก้ VF-B1–B5 / VF-F1–F5 · B-02 (`graphemeCount` + ขอบ 800) · `timetable.css` (`--border-control`) · `scripts/fixture-server.cjs`
ไม่ตรวจซ้ำ: ไฟล์ของ T-10–T-18/T-22 ที่ไม่เปลี่ยนนอกเหนือจากรอบแก้

ความรุนแรง: **P1 ต้องแก้** = สูง · **P2 ควรแก้** = กลาง · **P3 เสนอ** = ต่ำ

## สรุป: ผ่านแบบมีเงื่อนไข

P1 0 ข้อ · P2 1 ข้อ (R-13) · P3 8 ข้อ (R-14–R-21)

ภาพรวม: รอบแก้ VF ปิด R-01–R-12 ได้ตรงตาม D55–D59 (รายละเอียดในหัวข้อ "สถานะข้อเดิม") · ไม่พบ XSS (ไม่มี `innerHTML`/`dangerouslySetInnerHTML`/`document.write`/`eval` ในไฟล์ใหม่ทั้งหมด ข้อความอิสระเป็น text/attribute ของ Preact) · timer/listener ทุกตัวมี cleanup (`startTimetableClock` คืน stop ให้ `useEffect` ทั้ง Home และหน้าตารางสอน · `CellMenu`/`TtHeader` pointerdown · `ScrollArea` scroll+ResizeObserver · `useQuery`/`useBigText`) · `?now=` ถูกกันที่ `nowOverrideAllowed` (DEV/localhost/.test เท่านั้น) · fixture-server ผูก `127.0.0.1` อยู่ใน `scripts/` ไม่ถูก import โดย worker/แอป และไม่อยู่ใน `dist/client`
ข้อที่เหลือ: (1) ลิงก์ `#/timetable?term=<id ที่ไม่มี>` แสดง "ยังไม่มีภาคเรียน" แทน "ไม่พบภาคเรียนนี้" (โค้ดสถานะ term-not-found ไปไม่ถึง) (2) จุด a11y/โฟกัสเล็ก ๆ และ restore รับชื่อกิจกรรมเกิน 40 ตัว

## ควรแก้ (P2 — กลาง)

### R-13 `?term=` ที่ไม่มีอยู่ → "ยังไม่มีภาคเรียน — สร้างภาคเรียนก่อน…" และสถานะ term-not-found เป็นโค้ดตาย — bug · `src/pages/Timetable.tsx:47`, `:74-85`, `:86-93`

- ปัญหา: บรรทัด 47 `const term = wanted ? list.find((t) => t.id === wanted) ?? null : …` → เมื่อ `wanted` ไม่ตรงภาคใด `term` = `null` จึงเข้า `if (!term)` (บรรทัด 74) ก่อนเสมอ · เงื่อนไข `wanted && !list.some(…)` ที่บรรทัด 86 ไม่มีทางเป็นจริงตอนที่ `term` ไม่ null → หน้า "ไม่พบภาคเรียนนี้" + ลิงก์ "ไปตารางสอนภาคปัจจุบัน" ไม่เคยแสดง
- สถานการณ์ที่พัง: ครูมีภาค 1/2569 และ 2/2569 · บุ๊กมาร์ก/ลิงก์เก่า `#/timetable?term=<ภาคที่ถูกลบหรือมาจากอีกบัญชี/ไฟล์ที่กู้คืนทับ>` (หรือ id ผิดจากการพิมพ์) → หน้าแสดง `MSG.noTerm` "ยังไม่มีภาคเรียน — สร้างภาคเรียนก่อนกรอกตารางสอน" + ปุ่ม "ไปตั้งค่า › ภาคเรียน" (`data-tt-state="no-term"`) ทั้งที่มีภาคอยู่ → ข้อความเท็จ และพาครูไปสร้างภาคซ้ำได้ · ไม่มีทางกลับภาคปัจจุบันจากหน้านี้ (ไม่มีหัว/ตัวเลือกภาค)
- ไม่มีเทสต์ครอบ: `test/unit/tt-page.test.tsx` มีแค่ "no term at all" (`:200`) ไม่มีกรณี `?term=` ไม่พบ (grep `term-not-found` ใน `test/` = 0)
- แนวทางแก้: ตรวจ `wanted && !list.some(…)` **ก่อน** `if (!term)` (หรือ `if (!term) return wanted && list.length ? <term-not-found/> : <no-term/>`) · เพิ่มเทสต์ tt-page: มีภาค + `?term=nope` → `data-tt-state="term-not-found"` และข้อความ `MSG.termNotFound`
- สถานะ: เปิด · เจ้าของ: Front-End (T-19)

## เสนอ (P3 — ต่ำ)

- **R-14 restore รับชื่อกิจกรรม 41–800 ตัว ทั้งที่ API/แอปจำกัด 40 ตัว (grapheme)** · `worker/lib/restore-validation.ts:40, :103`, `stagedFrameIssues` (`:~106-125`) · `shared/timetable.ts:318` — ตรวจการขยายขอบเป็น 800 แล้ว **ไม่ทำให้ข้อมูลเกินหลุดเข้า DB และไม่ทำให้ restore พัง**: zod `.max(800)` นับ UTF-16 (≥ จำนวน code point) จึงเข้มกว่า CHECK `length(trim(label)) BETWEEN 1 AND 800` ของ SQLite ที่นับ code point → ทุกค่าที่ zod รับ DB รับ ไม่มี batch ล้มกลางทาง · ขนาดคำขอ PUT ยังถูกจำกัด (≤ 56 × 800 UTF-16) · `migrations/0008_timetable.sql` ยังไม่เคย commit/deploy จึงแก้ CHECK ได้โดยไม่ต้อง migration ใหม่ · **แต่** restore ไม่มีการตรวจ `graphemeCount(label) ≤ 40` (มีแค่ 800) ขณะที่ EP-11 ตรวจ `slotIssues` กับ **ทุกคาบของภาค** ในทุก PUT → ไฟล์ที่แก้มือให้กิจกรรมยาว 100 ตัว กู้ผ่าน แล้วการแก้คาบ **ใดก็ได้** ของภาคนั้นได้ 422 `label_too_long` (แอปก็บล็อกก่อนส่งที่ `store.ts:237` ด้วยข้อความ "ไม่เกิน 40 ตัวอักษร" ที่ไม่บอกว่าคาบไหน) และการคัดลอกไปภาคถัดไปติด 422 ซ้ำ · แก้ได้ (ครูเปิดคาบนั้นแล้วตัดชื่อ) จึงเป็น P3 · ขัดหลัก D56 "restore ไม่สร้างสถานะที่แอปซ่อมไม่ได้ง่าย" · แก้: ใน `stagedFrameIssues` เพิ่ม issue `label_too_long` เมื่อ `kind = 'activity'` และ `graphemeCount(label.trim()) > LABEL_MAX` (ใช้ฟังก์ชันเดียวกับ API) + เทสต์ใน `tt-backup.test.ts`
- **R-15 โฟกัสกลับผิดที่ในโครง ค: `data-tt-cell` ซ้ำสองชุด** · `src/components/timetable/layoutTypes.tsx:21-24` + `c/index.tsx:144` (TodayList) กับ `DayList.tsx:57` / `a/index.tsx:106` (ส่วน "ทั้งสัปดาห์") · `src/pages/Timetable.tsx:111, 116, 121` — `focusCell` ใช้ `document.querySelector` ได้ตัวแรกใน DOM · โครง ค จอกว้าง (≥ 641px) วาดคาบของวันนี้ทั้งใน "วันนี้" (คอลัมน์ซ้าย) และใน "ทั้งสัปดาห์" (ขวา) ด้วย attribute เดียวกัน · สถานการณ์: ผู้ใช้คีย์บอร์ดเปิดช่อง พ คาบ 3 จากตารางสัปดาห์ (ขวา) → บันทึก/ยกเลิก/ลบ → `Dialog` คืนโฟกัสให้ช่องเดิมก่อน แล้ว `setTimeout(focusCell)` ของหน้าย้ายโฟกัสไปปุ่มในรายการ "วันนี้" ด้านซ้าย → หลงตำแหน่ง (WCAG 2.4.3) และ roving tabindex ของกริด ก ใน ค ไม่ตามมา · แก้: หน้าจำ element ที่เปิด (เหมือน `menu.anchor`) แล้วโฟกัสถ้ายัง `isConnected` ค่อย fallback `querySelector` · หรือจำกัดการค้นใน `.ttc-week`/`[data-tt-layout]` ตามที่มา
- **R-16 `FrameSheet` ทับการคืนโฟกัสของ `Dialog`** · `src/components/timetable/frame/FrameSheet.tsx:10-13` + `src/pages/Timetable.tsx:168, 199, 226` — `Dialog` คืนโฟกัสให้ปุ่มที่เปิดอยู่แล้ว (`Dialog.tsx:54`) แต่ `FrameSheet` สั่ง `returnFocus.focus()` เสมอ (= ปุ่มหัวหน้า `frameBtn`) → เปิดจากปุ่ม "ตั้งเวลาคาบ" ในแถบ "โครงเวลาที่บันทึกไว้อ่านไม่ได้" หรือในกล่องตารางว่าง แล้วกด Esc/ยกเลิก → โฟกัสกระโดดไปหัวหน้า ไม่กลับปุ่มที่กด · `returnFocus={frameBtn.current}` อ่าน ref ตอน render (บนมือถือเป็น `null` ตลอด — ปลอดภัยเพราะ Dialog คืนให้เอง) · แก้: ใช้ `returnFocus` เฉพาะเมื่อ element ที่เปิดหายไปแล้ว (เช่นบันทึกสำเร็จแล้วแถบโครงเสียหาย) หรือเอาออกให้ Dialog จัดการ
- **R-17 ชื่อช่องว่างบอก "ปุ่มเพิ่มคาบ" ทั้งที่กดไม่ได้** · `src/components/timetable/ttCells.tsx:26` — `cellSpoken` คืน "… ว่าง ปุ่มเพิ่มคาบ" ทุกกรณี · ภาคปีเก่า (`readOnly`) `DayList.tsx:66`/`c/index.tsx:150` เป็น `div role=group` และกริด ก/ข เป็น gridcell ที่ไม่ทำอะไร → screen reader อ่านว่าเป็นปุ่มเพิ่ม · ออฟไลน์มี `aria-disabled` แล้วแต่ชื่อยังชวนกด · แก้: ส่ง `readOnly`/`offline` เข้า `cellSpoken` → "ว่าง" (ปีเก่า) / "ว่าง เพิ่มคาบไม่ได้ขณะออฟไลน์"
- **R-18 `ScrollArea` ไม่รู้ตัวเมื่อการ์ดถูกเพิ่ม/ลบหลัง mount** · `src/components/home/a/ScrollArea.tsx:33-35` — ResizeObserver สังเกตกล่องเอง (ขนาดคงที่ในโหมดพอดีจอ เพราะ `flex: 1 1 auto; min-height: 0`) + ลูก **ที่มีตอน mount** เท่านั้น · ฝั่งการ์ดข้าง (`SideCards` คืน fragment ของ `<section>` หลายใบ) เมื่อครูเปิดการ์ดเพิ่มใน "ปรับหน้าหลัก" ขณะอยู่หน้าหลัก → เนื้อหาสูงเกินกล่องแต่ `scrolls` ยัง false จนกว่าจะเลื่อนหรือย่อขยายจอ → ไม่มีปุ่ม "เลื่อนดูต่อ" และกล่องไม่รับโฟกัส (tabIndex) · กลับกัน ปิดการ์ดจนไม่ล้น ปุ่มยังค้าง · ฝั่ง Timeline ไม่เป็น (ลูกคือ `<ol>` ตัวเดียวที่ถูกสังเกต) · แก้: เพิ่ม `MutationObserver({ childList: true })` ที่ observe ลูกใหม่ หรือเรียก `check()` ใน `useEffect` ที่ไม่มี deps (ทุก render)
- **R-19 เปิดภาคที่ยังไม่โหลด → GET ซ้ำสองครั้งพร้อมกัน** · `src/pages/Timetable.tsx:61-62` — mount/เปลี่ยน `termId` ครั้งแรก effect ที่ 61 `loadTerm(termId)` (ยังไม่มีตาราง → GET) และ effect ที่ 62 `online && !tableOf(termId)` ยังจริง (GET แรกยังไม่กลับ) → `loadTerm(force)` GET อีกครั้ง · `loadTerm` (`store.ts:252`) ไม่กันคำขอที่กำลังวิ่ง · ไม่เสียข้อมูล (ทั้งคู่ `adopt` ผลเดียวกัน) แต่เปลือง D1 read และเกิดทุกครั้งที่เลือกภาคเก่า · แก้: effect 62 ให้ทำงานเฉพาะเมื่อ `offline` เปลี่ยนจาก true → false (เก็บค่าเดิมใน ref) หรือให้ `loadTerm` คืน promise เดิมเมื่อ `ttLoad[termId].state === "loading"`
- **R-20 กฎ CSS ไม่ได้จำกัดขอบเขตใน `timetable.css`** · `src/styles/timetable.css:16` `button[aria-disabled="true"] { opacity: 0.55 }` — ไฟล์นี้ถูก import แบบ static (`app.tsx` → `pages/Timetable.tsx`) จึงอยู่ใน CSS รวมทุกหน้า · ชนกับ `grade.css:143` (0.5) ผลขึ้นกับลำดับ bundle → ปุ่ม aria-disabled ในสมุดคะแนน/`CardSettings` เปลี่ยนความจางโดยไม่ตั้งใจ (ไม่พัง แต่เป็น regression ข้ามหน้าที่ไม่ได้ตั้งใจ) · ส่วนที่ทำถูกแล้ว: `--border-control` override บรรทัด 167 จำกัดใน `:is(.tt-page, .tts-ov, .tf-ov, .ttm)` ครบทั้งแผ่น/เมนู/กล่องยืนยัน (`tts-ov-confirm`) · แก้: `.tt-page button[aria-disabled="true"], .tts-ov …, .ttm …`
- **R-21 เทสต์ที่ไม่ได้ทดสอบโค้ด** · `test/api/tt-backup.test.ts:175-178` "the commit batch stays within 50 statements" คำนวณ `1 + 3 + BACKUP_TABLES.length * 2 + 1 + 4` เอง แล้วเทียบ ≤ 50 — ถ้า `backup.ts` เพิ่มคำสั่งใน batch (เช่น guard ใหม่) เทสต์ยังผ่าน · แก้: นับจากของจริง (spy `env.DB.batch` แล้ว `expect(stmts.length).toBeLessThanOrEqual(50)`) หรือ export ตัวสร้าง batch มานับ · ไล่ทุก `it(` ใน `tt-*.test.*` และ `fixture-datasets.test.ts` แล้ว เคสอื่นมี expect (VF-B4 สามเคสยืนยันผ่าน helper `refused` ที่มี expect 6 ข้อ)

## สถานะข้อเดิม (R-01–R-12) หลังรอบแก้ VF

| ข้อ | สถานะ | หลักฐาน (อ่านโค้ด tree ปัจจุบัน) |
|---|---|---|
| R-01 | ปิด | `legacyFrameInput` (`shared/timetable.ts:~86-133`) ตาม D55: N = max(7, คีย์สูงสุด) · เริ่มต้องเพิ่มขึ้นไม่งั้นค่าเริ่มต้น · L = min(60, ระยะห่างคู่ที่มาจาก `period_times`) · จบ = min(เริ่ม+L, เริ่มถัดไป) · พักหลบคาบ/ช่องว่าง ≥ 20 นาที · ผลไม่ผ่าน `validateFrame` → ค่าเริ่มต้นล้วน |
| R-02 | ปิด | `lastFailed.baseRev` (`store.ts:105, 206`) · `retryLast` ส่ง rev เดิม (`:357`) · 409 + `sameSlots(current, desired)` ในการลองใหม่ = สำเร็จ (`:165-169`) ไม่ใช่การลองใหม่ = แสดง 409 |
| R-03 | ปิด | `bootstrap.ts:33-36` SELECT เดียว `(${DEFAULT_TERM_SQL}) t LEFT JOIN timetable_slots` · ตารางว่าง = แถว weekday null ถูกกรอง · ไม่มีภาค = 0 แถว → `null` · ลำดับ `ORDER BY is_current DESC, year DESC, term DESC` ตรงกับ `currentTerm` ของ bootstrap |
| R-05 | ปิด (D58) | `localPrefs.ts` `LOCAL_PREF_KEEP` มี `ngankrob-timetable` |
| R-06 | ปิด | `slotSchema` `.min(1)` ทั้ง classId/subjectId (`worker/routes/timetable.ts:54-55`) |
| R-08 | ปิดบางส่วน (P3) | catch EP-12 SELECT รายการจริงแล้ว (`timetable.ts:228-236`) · **แต่** กรณี m = 0 (อีกเครื่องลบคาบนอกโครงไปหมดระหว่างนั้น) ยังตอบ `409 frame_removes_slots` "จะลบ 0 คาบ…" `removes: []` เพราะเงื่อนไขคือ `m !== n` — VF-B5 ระบุ m = 0 → `frame_changed` · ไม่เสียข้อมูล (กดบันทึกอีกครั้งผ่าน) · แก้: `if (m === 0) return frameChanged(again.frame)` ก่อนเช็ก `m !== n` |
| R-07 | ปิด | route ตัดช่องว่างชื่อพักก่อนตรวจ/เก็บ (`timetable.ts:169`) |
| R-10 | ปิด | `frame_changed` → `refreshFrame()` (`store.ts:172`) · 422 ที่มี `outside_frame` → `refreshFrame()` + ข้อความโครงเสีย (`:188-192`) |
| R-11 | ปิด | `saveFrame` ตั้ง `retry: false` (`store.ts:478`) |
| R-12 | ปิด (D56) | `resolveFrame` คืน `rev` ที่เก็บ (`storedRev`) · `ttFrameBroken` + แถบ `Timetable.tsx:195-201` · restore ปฏิเสธโครงเสีย/คาบนอกโครง (`stagedFrameIssues`) ก่อนสร้าง batch |
| R-04 R-09 | ดู part 1 / ไม่ได้ตรวจซ้ำในรอบนี้ (ไม่อยู่ในคำสั่ง) | — |

## จุดที่ตรวจแล้วไม่พบปัญหา

- **route/deep link:** `PAGES` เพิ่ม `timetable` · `deepLinkOf` ใช้รายการเดียวกัน (ผู้ที่ยังไม่เข้าระบบกลับมาที่ `#/timetable?term=` ได้) · `Page()` มี case ครบ
- **เมนู:** rail 9 รายการ 4 กลุ่ม ("ตารางสอน" ต่อจาก "หน้าหลัก") · แผง "เพิ่มเติม" มือถือมีกลุ่ม "วันนี้ → ตารางสอน" และปุ่ม "เพิ่มเติม" ติด `on` เมื่ออยู่หน้าตารางสอน (`SHEET.includes(active)`) · `aria-current="page"` · `shell.css` `.rail > * { flex-shrink: 0 }` + spacer `flex: 1 0 0` → จอเตี้ยเมนูเลื่อนได้ ไม่บีบรายการ (กระทบทุกหน้าในทางที่ตั้งใจเท่านั้น)
- **hooks:** หน้าตารางสอนเรียก hook ทั้งหมดก่อน early return · `TtLater` เรียก `useState` ก่อน `return null` · ไม่มี hook ใน loop
- **ConfirmBox/SlotSheet:** กันกดซ้ำด้วย ref (`going`/`submitting`) · ปุ่มปิดระหว่างทำงาน · ล้มแล้วกล่องค้างพร้อมข้อความ · `alertdialog` โฟกัสเริ่ม "ไม่" · การลองใหม่ในแผ่นคิดจากตารางล่าสุด (ไม่ทับงานเครื่องอื่นแบบ R-02)
- **CellMenu/TtHeader:** `focusFirstItem` โฟกัสเฉพาะเมื่อโฟกัสยังไม่อยู่ในเมนู (re-render ทุกนาทีไม่ดึงโฟกัสกลับ) · `menuKeys` Esc/ลูกศร · ปิดเมื่อแตะนอก (listener ถอดตอน unmount) · ⋯ คืนโฟกัสก่อนเปิดกล่อง · ทางลัดเป็นลิงก์/`navigate` เท่านั้น ไม่เขียนข้อมูล
- **โครง ก/ข:** roving tabindex จุดเดียว · ลูกศรเดินตามแกนที่ถูก (ก: แถว=วัน · ข: แถว=เวลา) · Delete ลบเฉพาะช่องที่มีคาบ ไม่ทำเมื่อปีเก่า/ออฟไลน์ · ข เลื่อนไปเวลาปัจจุบันครั้งเดียว (`scrolled` ref) ไม่กระตุกทุกนาที · เส้น "ตอนนี้" แสดงเฉพาะภาคปัจจุบันในวันเรียน
- **โครง ค:** การ์ดตอนนี้/ต่อไปมาจาก `snapshot()` ตัวเดียวกับหน้าหลัก · ไม่มีการ์ดเมื่อดูภาคที่ไม่ใช่ปัจจุบัน · ปุ่มทางลัดเปิดหน้าเท่านั้น
- **หน้าหลัก:** แถบ `TimetableStrip` ซ่อนเมื่อดูปีเก่าหรือปิดการ์ด `timetable` · แถวคาบในลำดับงาน (โครง ก) ยังแสดงเมื่อปิดแถบ ตรง AC-24 (ง) · `TT_MAX_ROWS` 5 + "ดูอีก N คาบ" · ScrollArea เป็น region ที่มีชื่อ รับโฟกัสเฉพาะเมื่อเลื่อนได้ ปุ่มสูง ≥ `--tap` · CSS พอดีจอจำกัดใน `@media (min-width:1000px) and (min-height:600px)` และ `.hm[data-hm-layout="a"]:has(> .hma-grid)` ไม่กระทบโครง ข/ค · `customize=1` ถูกถอดออกจาก URL ด้วย `replaceState`
- **เวลา:** clock tick 60 วินาที + `visibilitychange` · หยุดเมื่อออกจากหน้า · `ttNowMs` เป็น signal เดียว · คำนวณ Asia/Bangkok เอง (ตรวจใน part 1)
- **bootstrap/store:** `ttSeedBootstrap` ล้างทุกตารางเมื่อ data epoch เปลี่ยน · ไม่ทับตารางที่มีการแก้ค้าง (`pending > 0`) · `ttCountsKnown` บังคับ GET ครั้งแรกต่อ epoch เพื่อได้ `counts` (ปุ่มคัดลอก) · ออกจากระบบล้างทั้งหมด
- **fixture-server.cjs:** dev-only — `server.listen(port, "127.0.0.1")` · ไม่มีไฟล์ใน `worker/`/`src/` import (grep `fixture` ใน src เจอเฉพาะคอมเมนต์ + `testdata.ts` ที่ไม่มีใคร import) · ไม่อยู่ใน `assets.directory` (`./dist/client`) · `?now=` ฝั่งแอปผ่าน `nowOverrideAllowed` (`import.meta.env.DEV` หรือ localhost/127.0.0.1/::1/*.localhost/*.test) → build จริงบนโดเมนจริงไม่รับ · `window.__ttSetNow` ติดตั้งเฉพาะเมื่อผ่านเงื่อนไขเดียวกัน
- **graphemeCount:** ใช้ `Intl.Segmenter` (มีใน workerd/เบราว์เซอร์ที่รองรับ) fallback `Array.from` (code point — เข้มกว่าหรือเท่า grapheme) · ใช้ตัวเดียวกันทั้ง SlotSheet, `slotIssues`, ชื่อพักใน `validateFrame`

## เช็กลิสต์ความปลอดภัย (ส่วนที่ตรวจรอบนี้)

- [x] ไม่มี secrets ในไฟล์ที่ตรวจ (fixture ใช้ชื่อสมมติ · cookie ของ fixture อยู่ในหน่วยความจำ dev server)
- [x] validation ฝั่ง server: ขอบ 800 สอดคล้องกันทุกชั้น (zod UTF-16 ⊂ CHECK code point) — ยกเว้น restore ไม่ตรวจ 40 grapheme (R-14)
- [x] สิทธิ์: หน้าใหม่ไม่เรียก API เอง ใช้ store → route เดิมที่ `requireAuth` · ปีเก่าบังคับที่ server
- [x] XSS: ไม่มี HTML ดิบ · `href` ของ CellMenu มาจาก `slotActions` (hash route + id) ไม่ใช่ข้อความผู้ใช้ · `style` ที่ประกอบสตริงใช้ตัวเลข/เวลาที่ผ่าน `validateFrame` เท่านั้น
- [x] `?now=`/`__ttSetNow` ไม่เปิดบน production
- [x] ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 🔄 🗑)

- [x] ลองใหม่/409 ไม่ทับงานเครื่องอื่น (R-02 ปิด) · bootstrap rev+คาบสแนปช็อตเดียว (R-03 ปิด)
- [x] ลบคาบ: เลิกทำได้ · ล้างภาค/แทนที่ตอนคัดลอกถามก่อน (ConfirmBox) · ปิดปุ่มระหว่างทำงาน
- [ ] restore ไม่สร้างสถานะที่แก้ยาก — R-14 (ชื่อกิจกรรม > 40)
- [x] timezone: ไม่มีการใช้ zone ของเครื่องในไฟล์ใหม่ (ทุกจุดผ่าน `bangkok()`/`ttNowMs`)

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| อ่านโค้ด `git diff HEAD` + ไฟล์ใหม่ทุกไฟล์ในขอบเขต | ตามรายการด้านบน |
| grep `innerHTML\|dangerouslySetInnerHTML\|document.write\|eval(` ใน `src/components/timetable` `src/pages/Timetable.tsx` `src/components/home` `src/lib/timetable` | 0 |
| ไล่ `it(` ที่ไม่มี expect ใน `test/unit/tt-*`, `test/api/tt-*`, `fixture-datasets.test.ts` | 3 เคส VF-B4 (ใช้ helper ที่มี expect — ไม่ใช่ปัญหา) · R-21 เป็นเคสที่มี expect แต่ไม่ทดสอบโค้ด |
| Q-9101 · `vitest run` tt-* (unit+api) + hr-menu-nav, home-ui, hr-homecore-page, fixture-datasets, restore, auth | 22 ไฟล์ · 495 เทสต์ผ่าน (snapshot tree:1eb814ff5981) |
| Q-9102 · `tsc --noEmit -p .` | 0 error (Q-9002 เดิมที่ `tt-layout-b.test.tsx:84` หายแล้ว) |

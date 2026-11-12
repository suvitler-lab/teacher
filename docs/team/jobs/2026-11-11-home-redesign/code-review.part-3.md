## T-37 (สแกน: แยก `Scan.tsx` เป็น `components/scan/*` · ตั้งรอบ S1 · ป้ายครบกำหนด BR-15 · แถบต่อรอบเดิม)

ช่วงที่ตรวจ: `git diff HEAD` (ยังไม่ commit) เฉพาะ `src/pages/Scan.tsx`, `src/components/scan/**` (ใหม่ 7 ไฟล์), `src/styles/scan.css`, `test/unit/scan-setup-t37.test.tsx` (ใหม่) · ไม่ตรวจไฟล์ Home/Attendance/Gradebook ที่ FE อื่นกำลังแก้ · การเปลี่ยน `rgba(...)`/`#fff` → token ใน scan.css (`.sc-startbar`, `.scan-input-row`, `.fb .ic`) เป็นของ T-30 (dev-notes T-30) อ่านเพื่อยืนยันว่าไม่ชนเท่านั้น · รอบแก้ (Verify) 0/3

### สรุป: ผ่านแบบมีเงื่อนไข — ต้องแก้ 0 · ควรแก้ 2 · เสนอ 7

การแยกไฟล์เป็นการย้ายตรงจริง: เทียบทุกบรรทัดของ `Scan.tsx` เดิม (1,739 บรรทัด) กับไฟล์ใหม่แล้ว (ตัดย่อหน้า) บรรทัดที่หายไปมีแค่ import, การเติม `export` และจุดที่ตั้งใจแก้ตาม AC (รายการด้านล่าง) · ไม่แตะ `resolveScan`/`commitStudent`/`handleScan`/`undo`/คิว outbox/`loadSubs`/`pollSubs`/`startSession` (BR-13) ยกเว้นบรรทัดเดียว `resumedRound.value = false` ใน `startSession` · ไม่พบปัญหาความปลอดภัย และไม่พบทางที่ข้อมูลเช็คชื่อหรือส่งงานจะหายหรือบันทึกซ้ำ · ข้อควรแก้ทั้งสองเป็นเรื่องตัวเลขหรือป้ายที่บอกผู้ใช้ผิด

### ต้องแก้ก่อนปล่อย

ไม่มี

### ควรแก้

**R-3701 · ความถูกต้องของตัวเลข (AC-54/BR-13) · `src/components/scan/ResumeBar.tsx:11-20`**
แถบ "ต่อรอบเดิม" นับ x/y จาก `effSub` ทันที ไม่ดูว่าโหลดสถานะการส่งของงานนี้เสร็จหรือยัง (`subsBox.status`) ระหว่างโหลด หรือตอนที่โหลดไม่ได้ (`status: "unknown"`) `getSubs()` จะคืน `NO_SUBS` (state.ts:59-62) แถบจึงขึ้น "ส่งแล้ว 0 จาก <ทั้งห้อง>"
- สถานการณ์: ครูปิดแอปกลางรอบ ป.6/1 (33 คน ยกเว้น 2 ส่งแล้ว 26) แล้วเปิดใหม่ตอนเน็ตหลุด ซึ่งเป็นกรณีหลักของ AC-54 → `loadSubs` ล้ม → แถบขึ้น "ต่อรอบเดิม · งาน · ป.6/1 — ส่งแล้ว 0 จาก 33" ทั้งที่ต้องเป็น "26 จาก 31" · ตอนออนไลน์ก็เห็น "0 จาก 33" ช่วงสั้น ๆ ก่อนกระโดดเป็น 26/31 · ส่วน `imp-warn` ของ ScanView (ScanView.tsx:168) บอกว่ายังไม่รู้ข้อมูล แต่แถบนี้ยังขึ้นตัวเลขอยู่ ซึ่งขัดกับ AC-53 ที่ให้ขึ้น "…" ระหว่างนับ
- แก้: ใน ResumeBar ให้ตรวจ `subsBox.value.aid === s.assignmentId && subsBox.value.status === "ready"` (เงื่อนไขเดียวกับ `known` ใน ScanView.tsx:149) ถ้ายังไม่ ready ให้แสดง "ส่งแล้ว … " หรือ "กำลังนับ…" และถ้าเป็น unknown ให้แสดง "ยังไม่รู้ยอด (ออฟไลน์)" · เพิ่มเทสต์ 2 ข้อ: (ก) ข้อมูลโหลดสำเร็จแล้วต้องขึ้น "ส่งแล้ว 1 จาก 3" ตาม mock ที่มีอยู่แล้วในบรรทัด 78 (ตอนนี้ยังไม่ได้ assert) (ข) `get` ล้มแล้วต้องไม่ขึ้น "0 จาก 3"

**R-3702 · ป้าย "ข้อมูลเก่า" ขึ้นผิดงาน (AC-53) · `src/components/scan/SessionSetup.tsx:68-69`**
`.then` ตรวจ `aid === assignmentIdRef.current` ก่อนจะใช้ผล แต่ `setLiveFailed(false/true)` ไม่ได้ตรวจ จึงรับผลของคำขอที่ล้าสมัยแล้วมาด้วย
- สถานการณ์: แตะงาน A (เน็ตช้า) แล้วรีบแตะงาน B → B ตอบสำเร็จ ตัวเลข B เป็นค่าสด → คำขอของ A หมดเวลาตามมา → `setLiveFailed(true)` → ขึ้น "ข้อมูลเก่า" ค้างไว้บนตัวเลขสดของ B จนถึงรอบดึงถัดไป (สูงสุด 60 วินาที) · กลับกันก็เกิดได้: A สำเร็จช้ากว่า B ที่ล้ม → ป้ายหายไปทั้งที่ตัวเลข B เป็นค่าที่จำไว้
- แก้: ใส่ `if (aid !== assignmentIdRef.current) return;` ก่อน `setLiveFailed` ทั้งใน then และ catch · เพิ่มเทสต์: A ล้ม (resolve ช้า) แล้ว B สำเร็จ ต้องไม่ขึ้น "ข้อมูลเก่า"

### เสนอ

- **R-3703 · AC-54 "หายเองเมื่อสแกนคนแรก" · `ResumeBar.tsx:10`** — แถบไม่ได้ปิดถาวร แค่ซ่อนตอนที่ `recent` หรือ `feedback` มีค่า (`resumedRound` ยังเป็น true) → ยิงคนแรกแล้วกด "เลิกทำ" (undo ลบออกจาก `recent`, state.ts:428) หรือสแกนคนที่ยกเว้นแล้วกด "ไม่รับ" (ScanView.tsx:294 ตั้ง `feedback = null`) → แถบกลับมาอีก · เสนอให้ตั้ง `resumedRound.value = false` ใน effect ของ ResumeBar เมื่อ `recent.value.length > 0` ครั้งแรก (ไม่ต้องแตะ `handleScan` ตาม BR-13)
- **R-3704 · ♿ live region · `ResumeBar.tsx:23`** — `role="status"` ครอบปุ่ม [สแกนต่อ][จบรอบ] ไว้ด้วย ตัวอ่านหน้าจอจะอ่านชื่อปุ่มรวมไปกับข้อความ และ live region ที่ใส่ลง DOM พร้อมเนื้อหาในทีเดียว (แถบนี้, `.sc-noroom` SessionSetup.tsx:158, ชิป "ข้อมูลเก่า" :117) บาง SR อาจไม่อ่านเลย · เสนอให้ใส่ `role=status` เฉพาะ `<span class="sc-resume-t">` และให้ QA ลองกับ VoiceOver/NVDA
- **R-3705 · ♿ ประกาศถี่ · `SessionSetup.tsx:194`** — `role="status"` บนแถบสรุป "รอบนี้: …" ทำให้ทุกครั้งที่เปลี่ยนงาน ห้อง หรือวิธีให้คะแนน SR จะอ่านทั้งบรรทัดซ้ำ ซ้อนกับการอ่าน `aria-pressed` ของปุ่มที่กด · AC-52 ให้ `role=status` แค่กับเหตุผลที่ปุ่มปิดใช้ (บรรทัด 199 ซึ่งมีอยู่แล้ว) · เสนอให้เอาออก หรือขอ UX ยืนยันว่าตั้งใจ
- **R-3706 · ขอบกรณีลิงก์มี `?class=` · `SessionSetup.tsx:51-54`** (ไม่แน่ใจ) — ถ้าตอนเปิด `assignments` มาแล้วแต่ `activeClasses` ยังว่าง effect จะล้าง classId เป็น "" แล้วพอห้องโหลดมาก็เลือกห้องแรกแทนห้องใน URL · ไม่แน่ใจเพราะดูเหมือน `loadBootstrap` ตั้งสองค่านี้พร้อมกัน จึงอาจเกิดไม่ได้จริง · ส่วนการแก้บั๊กห้องที่เก็บถาวรนั้นถูกต้อง (ดู "ตรวจแล้วไม่พบปัญหา")
- **R-3707 · เทสต์จับการกลายพันธุ์ได้ไม่ครบ · `test/unit/scan-setup-t37.test.tsx`** — (1) AC-54 ไม่ได้ assert x/y และไม่ได้ทดสอบ [จบรอบ] → ไปหน้าสรุป (2) AC-51 ทดสอบ `dueWord` แค่ระดับฟังก์ชัน ถ้าการ์ดกลับไปใช้ข้อความเดิม "ส่งภายใน … · อีก 2 วัน" เทสต์ก็ยังผ่าน — ควร render การ์ดที่มี due_date (วันนี้/พรุ่งนี้/เลย) แล้ว assert ข้อความ (3) AC-52 ไม่ได้ assert เนื้อหาบรรทัดสรุป ("· ป.6/1 · เต็ม 20 · ให้คะแนนเต็ม") และยังไม่มีกรณี "เลือกงานก่อน" (4) บั๊กห้องที่เก็บถาวรทดสอบด้วย `class_ids:["gone"]` (ห้องที่ไม่มีอยู่) แต่ยังไม่มีกรณีที่ตรงบั๊กจริง คือ `class_ids:["c2-archived","c1"]` + `?class=c2-archived` แล้วต้องได้ c1 · ถ้าย้อน deps กลับเป็น `[assignmentId]` เทสต์ก็ยังผ่าน (5) ไม่มีเทสต์ว่าป้าย "ข้อมูลเก่า" หายเมื่อโหลดได้อีกครั้ง
- **R-3708 · ดูแลรักษา · `state.ts:553`** — doc comment ของ `startSetupRefresh` (ทำอะไร, ดึงทุก POLL_MS, คืนฟังก์ชันหยุด) หายไปตอนย้าย ควรใส่กลับ · และ `export let loadSeq/startSeq/lastFetchAt/scanViewLeft` ตอนนี้เปิดให้ทุกไฟล์อ่านได้ ควรเขียนคอมเมนต์ว่า "อ่านอย่างเดียวนอกไฟล์นี้" (TS กันการเขียนข้ามโมดูลอยู่แล้ว)
- **R-3709 · import ชนิดเป็นค่า · `ScanSummary.tsx:15`** — `import { …, startSession, Session } from "./state"` นำเข้า interface แบบค่า ตอนนี้ tsc/esbuild ยังผ่าน แต่จะพังถ้าวันหน้าเปิด `verbatimModuleSyntax` · ไฟล์อื่นใช้ `import type` เสนอให้ใช้แบบเดียวกัน

### ตรวจแล้วไม่พบปัญหา

- **การย้ายตรง (ประเด็น 1)**: เทียบบรรทัดสองทาง (old→new, new→old หลังตัดย่อหน้า) แล้ว ที่ต่างกันมีแค่ (ก) import/`export` (ข) `scanViewLeft = false/true` เปลี่ยนเป็น `setScanViewLeft()` ซึ่งได้ผลเหมือนเดิม (ค) SessionSetup 5 จุดที่ตั้งใจแก้ (ง) `kvGet("scanSession")` เพิ่ม `resumedRound = true` (จ) `startSession` เพิ่ม `resumedRound = false` · ลำดับ effect ใน ScanView/SessionSetup เหมือนเดิม · โค้ดที่รันตอนโหลดโมดูล (`kvGet` คืนรอบ, `onResult`) ย้ายไปอยู่ `state.ts` ซึ่ง `pages/Scan.tsx` import ตั้งแต่บรรทัดแรก จึงรันตอนเดิม · ไม่มี import วน (state ← widgets ← ScanParts ← ScanSummary ← ScanView, state ไม่ import component ไหนเลย) · signal ทุกตัวยังเป็นตัวเดียวทั้งแอป (อยู่โมดูลเดียว) · `__scan` และ `startSetupRefresh` มีชื่อ export ครบเหมือนเดิม
- **คิวออฟไลน์/ข้อมูล (🔄)**: `enqueueSubmission`, `enqueueRevertible`, `makeOp`, `undo`/`undoToast` (D16), `reconcileSubs`, `loadSeq`/`startSeq` ที่กันคำตอบเก่า ไม่ถูกแก้ · แถบต่อรอบเดิมแค่อ่าน ไม่เขียนข้อมูล · [จบรอบ] ในแถบเรียก `endSession` ตัวเดิม (POST end + ล้าง kv) เหมือนปุ่มจบรอบเดิม
- **บั๊กห้องที่เก็บถาวร (ประเด็น 3)**: เดิม `!asg.class_ids.includes(classId)` → `setClassId(asg.class_ids[0])` ทำให้เลือกห้องที่เก็บถาวรแล้วกดเริ่มได้ · ตอนนี้ใช้ `classesForAsg` (กรองด้วย `activeClasses`) และเพิ่ม `activeClasses.value.length` ใน deps ทำให้ลิงก์ที่เปิดก่อนห้องโหลดเสร็จถูกแก้ด้วย · ไล่กรณีอื่นแล้วไม่กระทบ: ห้องที่ยังใช้อยู่ = ไม่เปลี่ยน · `?class=` เป็นห้องที่ใช้อยู่ = คงไว้ · ไม่มีห้องที่ใช้อยู่เลย = classId "" → ปุ่มปิดใช้ + "เลือกห้องก่อน" + ข้อความห้องว่าง · effect `open.length` (บรรทัด 40) ที่อาจตั้งห้องที่เก็บถาวร จะถูก effect นี้แก้ใน render ถัดไป เพราะ assignmentId เปลี่ยน
- **AC-51/BR-15**: `dueWord` ให้ผลตรงตัวอย่างใน BR-15 ทั้ง 0/1/≥2/<0/null · `daysTo` เดิม (วันปฏิทินไทยจาก `bkkToday`) · ไม่มีกำหนดส่งก็ไม่แสดงป้าย (`a.due_date &&`) · `dueTone` เดิม · เรียงตามกำหนดส่งใกล้ก่อน, 5 ใบ + "ดูทั้งหมด (n)", ชิปกรองวิชาเมื่อมีมากกว่า 1 วิชา, เลือกงานแรกไว้ให้, `aria-pressed` + ✓ ยังเหมือนเดิม
- **AC-52**: ปุ่มปิดใช้เมื่อ `!classId || !asg` · เหตุผล `role=status` · บรรทัดสรุปตรงรูปแบบ "รอบนี้: <งาน> · <ห้อง> · เต็ม N · <วิธี>" · ปุ่มสูง `max(56px, 3.5rem)` · `startSession` ตัวเดิม (รหัสรอบใหม่, โหมดตอนเริ่ม)
- **AC-53**: ข้อความห้องว่างและปุ่มตรงคำต่อคำ · `navigate("/settings", { section: "catalog" })` · ข้อความไม่มีงาน/ปีเก่า เหมือนเดิม · "…"/"กำลังนับ…" เหมือนเดิม
- **♿ (ประเด็น 4)**: ไอคอน `history`, `wifi-off`, `users` มีใน iconMap · ปุ่มใหม่เป็น `<button>` มีชื่อเป็นตัวหนังสือ · `.sc-resume` สูงอย่างน้อย `var(--tap)` · [สแกนต่อ] คืนโฟกัสให้ช่องสแกน (`focusScan`) · reduced-motion ปิด transition ของ `.sc-asg/.sc-mode/.pring` (base.css มีกฎรวมอยู่แล้ว)
- **สีตายตัว (ประเด็น 5)**: กฎที่ T-37 เพิ่ม (scan.css:298-313) ใช้ token ทั้งหมด · `.cam-*` ไม่ถูกแตะ (มีแค่คอมเมนต์ที่ T-30 เพิ่ม) · inline style ใหม่ใน TSX มีแค่ margin/font-weight ไม่มีสี
- **ความปลอดภัย**: ไม่มี input ใหม่ที่ส่งไป server, ไม่มี `dangerouslySetInnerHTML`, ไม่มี secret, ไม่มี dependency ใหม่ · ชื่องาน/ห้องแสดงผ่าน JSX (escape แล้ว)
- **performance**: ResumeBar วนนับห้องเดียว (≤ ~40 คน) ต่อ render และหายไปหลังสแกนแรก ไม่มี query ใหม่

### ความถูกต้องของข้อมูล

| หัวข้อ | ผล |
|---|---|
| บันทึกซ้ำ/หาย (คิว outbox, undo, startSession) | PASS — โค้ดไม่เปลี่ยน (เทียบบรรทัด) |
| ลำดับคำตอบ (loadSeq/startSeq/assignmentContext) | PASS — ไม่เปลี่ยน |
| ตัวเลข x/y ตั้งรอบ (BR-13 ไม่นับยกเว้น) | PASS — `progressFor` เดิม |
| ตัวเลข x/y แถบต่อรอบเดิม | ควรแก้ R-3701 (ขึ้น 0/ทั้งห้อง ตอนยังไม่รู้ยอด) |
| วันที่/timezone (BR-15) | PASS — `bkkToday` + `daysTo` เดิม |
| ห้องที่เก็บถาวรรับงาน (D15) | PASS — เลือกไม่ได้แล้ว |
| เงิน/ปัดเศษ | N/A — ไม่มีการคำนวณใหม่ |

### หลักฐาน

- `npx vitest run test/unit/scan- test/unit/m1-05 test/unit/c0` → 20/21 ไฟล์ 186/188 เทสต์ผ่าน · ที่ล้มคือ 2 เทสต์ Gradebook ใน `m1-05-screens.test.tsx` ("Gradebook: the column header progress bar and the toolbar rate", "Gradebook toolbar") = งาน T-46 ที่กำลังทำขนาน ไม่เกี่ยวกับสแกน
- `npx vitest run test/unit/scan- test/unit/c0` → 18 ไฟล์ 159/159 ผ่าน (Q-3701)
- `npx vitest run test/unit/m1-05 -t "Scan|scan"` → 3/3 ผ่าน (Q-3702)
- `npm run typecheck` (tsc --noEmit) → ผ่าน ไม่มี error
- เทียบบรรทัดแบบ normalize: `git show HEAD:src/pages/Scan.tsx` กับ `src/components/scan/*` + `src/pages/Scan.tsx` ด้วย `grep -vxF -f` ทั้งสองทาง
- a11y ตรวจจากการอ่านโค้ด (Q-3703) ยังไม่ได้ทดสอบกับตัวอ่านหน้าจอจริง → ให้ QA ตรวจ R-3704/R-3705

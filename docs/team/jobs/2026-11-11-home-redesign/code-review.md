# Code review: home-redesign

> หมายเหตุ: PM สั่งให้เขียนที่ `evidence/review-T-31.md` แต่ hook ไม่ยอม (นอกขอบเขตของ team-code-reviewer) จึงเขียนไว้ที่นี่ในหัวข้อ T-31 · reviewer ของ T-29 ถ้าจะใช้ไฟล์นี้ ให้เพิ่มหัวข้อของตัวเองต่อท้าย อย่าเขียนทับ

---

## T-31 (เมนู rail / แถบล่าง / แผ่น "เพิ่มเติม" / ลิงก์ลึกก่อนเข้าสู่ระบบ)

โดย Code Reviewer · 2026-11-12 · ช่วง diff: `f3875d5..` (ยังไม่ commit) เฉพาะ `src/components/Shell.tsx`, `src/styles/shell.css`, `src/app.tsx`, `test/unit/hr-menu-nav.test.tsx` · รอบแก้ (Verify) 0/3

ความรุนแรง: **ต้องแก้** = สูง · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

### สรุป: ผ่านแบบมีเงื่อนไข

ต้องแก้ 0 ข้อ · ควรแก้ 2 ข้อ · เสนอ 5 ข้อ

ไม่พบปัญหาความปลอดภัยหรือข้อมูลระดับสูง ลิงก์ลึกทำงานถูกต้อง (ยืนยันด้วยเทสต์ที่เข้มกว่าเดิม ซึ่งรันใน scratchpad) แต่เทสต์ของ dev เองจับการถอยกลับไม่ได้ และชุดเทสต์รวมยังแดง 1 ข้อเพราะเปลี่ยนชื่อปุ่ม

### ต้องแก้ก่อนปล่อย

(ไม่มี)

### ควรแก้

#### R-01 เทสต์ลิงก์ลึกยังผ่านแม้ลบโค้ดแก้ออก — test · `test/unit/hr-menu-nav.test.tsx:111-115`

- ปัญหา: เทสต์ตั้ง `route.value = "/scan"` ไว้ก่อน แล้ว `waitFor(route.value === "/scan")` ก็ผ่านทันทีในรอบแรก (ก่อน hashchange ไป `/home` และก่อน effect ของ App จะรัน) พอจบเทสต์ `cleanup()` ก็ถอด App ออกก่อนที่ effect จะทำงาน เทสต์นี้จึงไม่ได้พิสูจน์ว่าโค้ดแก้ใน `app.tsx:58-66` ทำงาน
- หลักฐาน: คัดลอกเทสต์ไปรันใน scratchpad โดย mock `navigate` ให้ไม่ทำอะไร (= ลบตัวแก้ออก) → เทสต์เดิม **ผ่าน** · เพิ่มการรอ 100ms ภายในเทสต์เดียวกัน แล้วเช็ก `route.value`/`location.hash`/`[data-page=Scan]` → โค้ดจริง PASS ส่วนตัวที่ลบตัวแก้ FAIL (`expected '/home' to be '/scan'`)
- แนวทางแก้: ก่อนจบ `it` ให้รอ hashchange กับ effect ทำงานจริง เช่น `await new Promise(r => setTimeout(r, 50))` แล้ว `expect(location.hash).toBe("#/scan")` + `expect(route.value).toBe("/scan")` + หน้า Scan ยังแสดงอยู่
- สถานะ: เปิด (ไฟล์ของ T-31)

#### R-02 เปลี่ยนชื่อปุ่ม "เมนู" → "เพิ่มเติม" ทำให้เทสต์และสคริปต์ QA ที่อื่นพัง — regression · `test/unit/home-ui.test.tsx:277`, `scripts/qa-flows.cjs:602,610`

- ปัญหา: `home-ui.test.tsx:277` ยังหา `getByRole("button", { name: "เมนู" })` → FAIL (รันแล้ว 1 failed) · `scripts/qa-flows.cjs:602,610` ใช้ `locator(".bottom-tabs .tab-item", { hasText: "เมนู" })` → flow มือถือของ QA จะหาปุ่มไม่เจอ
- สถานการณ์ที่พัง: `npm test` แดง 1 ข้อ · รัน qa-flows บนมือถือแล้ว timeout ตอนเปิดแผ่น
- แนวทางแก้: เปลี่ยนคำค้นเป็น "เพิ่มเติม" ทั้งสองไฟล์ (home-ui = ไฟล์ของ T-29 · qa-flows.cjs = สคริปต์ QA ไม่ใช่ของ T-31) · บรรทัด 280 ของ home-ui `getByRole("dialog", { name: "เมนู" })` ยังผ่านอยู่ เพราะชื่อแผ่นยังเป็น "เมนู" (ถ้าทำตาม R-03 ต้องแก้บรรทัดนี้ด้วย)
- ค้นทั้ง `src/` `test/` `scripts/` แล้ว: ที่อ้าง "เมนู" ในฐานะชื่อปุ่มมีแค่ 2 จุดข้างบน · `nav aria-label="เมนู"` (Shell.tsx:108) ไม่ได้เปลี่ยน ยังใช้ได้ใน hr-menu-nav:50 และ home-ui:275 · `menuKeys.ts`/Projector ไม่เกี่ยว
- สถานะ: เปิด

### เสนอ

- R-03 ชื่อแผ่นยังเป็น "เมนู" แต่ปุ่มเป็น "เพิ่มเติม" · `src/components/Shell.tsx:141` — VoiceOver: กด "เพิ่มเติม" แล้วได้ยิน "เมนู, กล่องโต้ตอบ" ไม่ตรงกัน แนะนำ `label="เพิ่มเติม"` (แล้วแก้ home-ui.test.tsx:280 ตาม) — ไม่ได้ขัด AC-47 ตรง ๆ จึงจัดเป็นข้อเสนอ
- R-04 ลิงก์ลึกถูกจำไว้ตอน App mount ครั้งเดียว · `src/app.tsx:56` — ถ้า PWA เปิดค้างอยู่ที่หน้าเข้าสู่ระบบ แล้วครูแตะลิงก์ `#/scan` (เกิดแค่ hashchange ไม่ได้ mount ใหม่) `wanted` จะยังเป็นค่าเดิม/null → login แล้วไปหน้าหลัก · AC-50 พูดถึง "เปิดตรง ๆ" ซึ่งปกติคือโหลดใหม่ จึงไม่นับว่าผิด AC · ถ้าจะครอบกรณีนี้: อัปเดต `wanted` จาก `route.value` ทุกครั้งที่ state ยังไม่เป็น ready
- R-05 หลัง login หน้าแวบ Scan → Home → Scan · `src/app.tsx:58-66` ร่วมกับ `src/pages/Setup.tsx:67-68` — Setup ตั้ง `authState="ready"` แล้วตามด้วย `location.hash="/home"` · render แรกยังเห็น route `/scan` จากนั้น hashchange ทำให้ Home mount (effect โหลดข้อมูลของ Home ทำงาน 1 รอบ) แล้ว effect ของ App ค่อย navigate กลับ `/scan` (Scan mount ซ้ำ) · ไม่วนลูป (ล้าง wanted ก่อน navigate) ไม่มีผลต่อข้อมูล · ระยะยาว: ให้ Setup ไม่บังคับ `#/home` เมื่อมีลิงก์ลึก (Setup.tsx อยู่นอกขอบเขต T-31)
- R-06 เกณฑ์ container query เป็นค่าประมาณ ยังไม่ได้วัดที่ความสูงจออื่น · `src/styles/shell.css:66` — `calc(26rem + 240px)` = 656px ที่ตัวอักษร 16px · ผมประมาณความสูงเนื้อหา rail จากกฎ CSS ได้ราว 19rem + ~366px (≈ 670px ที่ 16px, pointer:fine) ซึ่ง**สูงกว่า**เกณฑ์ → อาจมีช่วงความสูงจอราว 656–670px (เช่น โน้ตบุ๊ก 1366×768 ที่ไม่เปิดแถบบุ๊กมาร์ก) ที่ป้ายกลุ่มแสดงแต่ rail ต้องเลื่อนเล็กน้อยที่ขนาดตัวอักษรเริ่มต้น · **ไม่แน่ใจ** เพราะไม่ได้วัดในเบราว์เซอร์ (โปรเจกต์ไม่มี playwright และไม่มีเซิร์ฟเวอร์รันอยู่ตอนตรวจ) และไม่รู้ความสูงจริงของ SyncBadge · 1536×729 (dev วัดได้ scrollHeight=clientHeight) และ 1180×820 ไม่กระทบ · เป็นการเลื่อน ไม่ใช่ถูกตัด จึงไม่ผิด AC-46 · แนะนำให้ QA วัด rail ที่ 1366×657 และ 1280×720 เพิ่ม
- R-07 ออกจากระบบจากแผ่น แล้วเลือก "อยู่ต่อ" บน Safari โฟกัสหลุด · `src/components/Shell.tsx:162` — `refocus=false` ทำให้ไม่คืนโฟกัสไปที่ "เพิ่มเติม" · บน Safari (แตะแล้วไม่โฟกัสปุ่ม) `previous` ของ ConfirmDialog คือ body → ปิดคำถามแล้วโฟกัสค้างที่ body · ถ้าใช้แป้นพิมพ์ Dialog คืนโฟกัสให้ปุ่มเองอยู่แล้ว ผลกระทบต่ำ

### สิ่งที่ตรวจแล้วไม่พบปัญหา

- ลิงก์ลึก `deepLinkOf` (`app.tsx:44-50`): รับเฉพาะชื่อหน้าใน whitelist 8 หน้า และไม่ใช่ home · ส่งต่อด้วย `navigate()` ซึ่งเปลี่ยนแค่ `location.hash` → **ไม่มี open redirect** (ออกนอก origin ไม่ได้) · `//evil`, `/`, `/nope` → null · query string ถูกส่งต่อเหมือนผู้ใช้ที่ login แล้วเปิดลิงก์เดียวกัน (ตรวจ Scan/Settings/Students/Gradebook แล้ว: param ใช้แค่เลือกค่าเริ่มต้น ไม่มีการเขียนข้อมูลอัตโนมัติ)
- ไม่เปิดหน้าก่อนยืนยันตัวตน: navigate เกิดเฉพาะเมื่อ state เปลี่ยนจาก `login`/`setup` → `ready` · ก่อนหน้านั้น App คืน `<Setup>` ไม่มี Shell/rail/แถบล่าง · กรณีเข้าเองจาก session หรือแคชออฟไลน์ (`loading` → `ready`) ไม่ navigate แต่ hash เดิมยังอยู่ หน้าจึงเปิดตามปกติ · ล้าง `wanted` ทุกครั้งที่ ready → logout แล้ว login ใหม่ไม่เด้งไปลิงก์เก่า · ไม่วนลูปกับ Setup (navigate ครั้งเดียว)
- เซสชันหมดกลางการใช้ (AC-50): ยังใช้ `authRequired` + `ReloginOverlay` เดิม authState ไม่เปลี่ยน → ตัวแก้ลิงก์ลึกไม่ไปยุ่งกับคิว
- แผ่น "เพิ่มเติม": `Dialog` เดิมดัก Tab/Esc/focusin และถอด listener ใน cleanup ครบ (ไม่รั่ว) · effect คืนโฟกัสใน Shell ไม่ได้ผูก listener · ปิดด้วย Esc / แตะนอกแผ่น (`e.target === e.currentTarget`) / เลือกรายการ → คืนโฟกัสที่ "เพิ่มเติม" (เทสต์ยืนยัน) · `role="group"` + `aria-label` + ป้ายตัวหนังสือที่ `aria-hidden` ถูกต้อง ไม่อ่านซ้ำ · `aria-expanded`/`aria-controls="menu-sheet"` ตรงกับ id
- rail: `scrollIntoView({block:"nearest"})` บน rail ที่ sticky ไม่ดึงหน้าหลักให้เลื่อน · บนมือถือ rail เป็น `display:none` จึงไม่มีผล · ลำดับ DOM ตรงกับลำดับที่เห็น ไม่มี tabindex
- CSS: ลดระยะเฉพาะใน `.rail*` · กฎ `@media (max-width:720px)` และ `.bottom-tabs` ไม่เปลี่ยน → มือถือไม่กระทบ · iPad (pointer:coarse) ยังใช้ `min-height: var(--tap)` เหมือนเดิม
- เส้นทาง/หน้าเดิม: switch ใน `Page()` ไม่เปลี่ยน · ปลายทางใน NAV/TABS/SHEET_GROUPS เป็นค่าเดิม

### เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร (diff 4 ไฟล์)
- [x] ตรวจ input ฝั่ง server ทุกจุด — N/A ไม่แตะ server/API
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล — ไม่มี endpoint ใหม่ · ข้อมูลยังมาจาก API ที่ต้อง login · หน้า/เมนูไม่ render ก่อน ready
- [x] ป้องกัน injection, XSS, CSRF — hash ไปที่ `location.hash` เท่านั้น ไม่ได้ใส่เป็น HTML · ไม่มี open redirect
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น — ไม่มี log ใหม่
- [x] error ไม่เปิดเผยรายละเอียดภายใน — ไม่มี error path ใหม่
- [x] dependency ใหม่น่าเชื่อถือ — ไฟล์ที่ตรวจไม่มี dependency ใหม่

### ความถูกต้องของข้อมูล (ธง 🔄)

- [x] เงิน — N/A
- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำ — ไม่แตะคิว/outbox · logout จากแผ่นยังผ่าน `doLogout` ที่ถามก่อนเมื่อมีงานค้าง
- [x] transaction — N/A
- [x] ลบแล้วข้อมูลค้าง — N/A
- [x] วันที่/timezone/พ.ศ. — N/A

### หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `npx vitest run --project dom test/unit/hr-menu-nav.test.tsx test/unit/home-ui.test.tsx` | 25 passed · 1 failed (`home-ui.test.tsx:277` หาปุ่ม "เมนู") |
| `npx tsc --noEmit` | exit 0 |
| เทสต์กลายพันธุ์ใน scratchpad (mock `navigate` ให้ไม่ทำอะไร) | เทสต์ลิงก์ลึกเดิม PASS (= จับไม่ได้) · เทสต์ที่รอ 100ms: ตัวกลายพันธุ์ FAIL `/home`≠`/scan`, โค้ดจริง PASS |
| `grep "เมนู"` ใน src/ test/ scripts/ | ยังอ้างชื่อปุ่มเก่าที่ home-ui.test.tsx:277, qa-flows.cjs:602,610 |
| วัด rail ในเบราว์เซอร์ | NOT RUN — โปรเจกต์ไม่มี playwright / ไม่มีเซิร์ฟเวอร์รันอยู่ |

## T-65 (fixture X-1–X-6: ชุดข้อมูล F-H*/F-S*, `/__fixture/*`, self-check)

ผู้ตรวจ: Code Reviewer · 2026-11-12 · diff: `git diff f3875d5 -- scripts/fixture-server.cjs` (+649/−20) + `test/unit/fixture-datasets.test.ts` (ไฟล์ใหม่ 336 บรรทัด) · ธง 🔄 · รอบแก้ (Verify) 0/3

### สรุป: ผ่าน — ต้องแก้ 0 · ควรแก้ 2 · เสนอ 6

ไม่มีทางที่ `/__fixture/*` จะไปอยู่ใน build/worker จริง · ผูก 127.0.0.1 · ตัวเลข self-check ตรง §3 ทุกตัว (คิดมือแล้ว) · ของเดิมยังใช้ได้ · มีกับดักสองข้อเรื่อง "วันนี้" ที่ self-check ผ่านแต่หน้าจอเห็นตัวเลขอื่น (R-6501, R-6502)

### ต้องแก้ก่อนปล่อย

ไม่มี

### ควรแก้

**R-6501 · ความถูกต้องของข้อมูลทดสอบ · scripts/fixture-server.cjs:670, :730, :618, :908**
- `--today` เปิดให้ใช้จาก CLI แต่ self-check ส่ง `&date=T` เอง (`selfCheckPlan(..., today !== undefined)`) ส่วนแอปจริงเรียก `/api/dashboard?term=…` **ไม่ส่ง date** (`src/lib/dashboard.ts:30`) → worker ใช้ `bkkToday()` ของนาฬิกาจริง (`worker/routes/dashboard.ts:22`)
- พังจริง (รันแล้ว Q-6503): `startFixtureServer({ dataset: "home", today: "2026-11-20" })` → `selfCheck: "ok"` แต่คำขอแบบที่แอปส่งได้ `date 2026-11-12 · missingCount 0 · marked [0,0,0]` (คาด 22 และ 32/30) → QA ที่เปิด `--home --today …` จะเห็นข้อความ "self-check ok" แล้วทดสอบบนตัวเลขผิด ซึ่งขัดเป้าหมาย X-5
- แนวทาง: เอา `--today` ออกจาก CLI (เหลือเฉพาะ option ของเทสต์หน่วย) หรือถ้า `today !== bkkToday()` ให้ self-check รันแบบไม่ส่ง date ด้วย/พิมพ์คำเตือนชัด ๆ ว่า "หน้าเว็บจะไม่ตรงชุดข้อมูล" และไม่พิมพ์ "self-check ok"

**R-6502 · วันที่ข้ามเที่ยงคืน · scripts/fixture-server.cjs:670, :799, :914**
- T คิดครั้งเดียวตอน start · ถ้าเซิร์ฟเวอร์เปิดค้างข้ามเที่ยงคืนเวลาไทย (17:00 UTC) worker เปลี่ยนวันเอง → A1 กลายเป็น "เลยกำหนด 1 วัน", เช็คชื่อวันนี้หายทั้งหมด, `dueSoon` เปลี่ยน — โดยไม่มีอะไรบอก (self-check ไม่รันซ้ำ, `GET /__fixture/state` ตอบ `today` เดิม)
- กรณี start คร่อมเที่ยงคืนพอดีปลอดภัย: self-check เทียบ `d.date` กับ T (บรรทัด 505) → exit 1 ดังพอ
- แนวทาง: ให้ `/__fixture/state` ตอบ `stale: bkkToday() !== T` และ/หรือ log เตือนเมื่อ API ถูกเรียกหลังวันเปลี่ยน · หรือเขียนใน fixtures.md/test-plan ว่าต้อง start ใหม่ทุกวัน

### เสนอ

- R-6503 · scripts/fixture-server.cjs:531, :600 — สองบรรทัดนี้ assert ค่าคงที่ (`percentOf(30 + 27, 32 + 30)`, `percentOf(30, 40 - 2)`) ไม่ได้อ่านจาก EP-06 จึงผ่านเสมอ · ไม่อันตรายเพราะตัวตั้งถูกตรวจแยกแล้ว (บรรทัด 527–528, 599) แต่ควรคิดจาก `att()`/`per()` จริง เพื่อไม่ให้ดูเหมือนตรวจแล้ว
- R-6504 · scripts/fixture-server.cjs:911 — `--backup-days abc` → `Number` = NaN → เก็บ `"NaN"` → หน้าแอปถือว่า "มีสำรอง" แต่ไม่ขึ้นแถวสำรอง (เงียบ) · ควร fail exit 2 เหมือน `--set` ผิด · ทำนองเดียวกัน `--port` ไม่มีค่า → NaN, และแฟล็กพิมพ์ผิด (`--hom`) ถูกเมินแล้วได้ seed เดิมโดยไม่เตือน
- R-6505 · scripts/fixture-server.cjs:861 — `server.listen` ไม่มี handler `error` (ของเดิมตั้งแต่ก่อน f3875d5) · พอร์ตชน (EADDRINUSE) ในการใช้แบบ in-process → promise ไม่ settle + Miniflare ไม่ถูก dispose · ไม่ใช่ปัญหาใหม่ของ T-65
- R-6506 · scripts/fixture-server.cjs:812 — ไม่ตรวจ Host header · การป้องกัน CSRF (415 เมื่อไม่ใช่ JSON/X-Fixture, บรรทัด 762) ใช้ได้กับหน้าเว็บอื่นทั่วไป แต่ไม่กัน DNS rebinding · ข้อมูลสมมติล้วน เครื่องเดียว ความเสี่ยงต่ำ — ถ้าจะปิดให้รับเฉพาะ Host `127.0.0.1:<port>`/`localhost:<port>`
- R-6507 · test/unit/fixture-datasets.test.ts:98–100 — เทียบ `s.today` กับ `bkkToday()` ที่เรียกทีหลัง → ล้มได้ถ้ารันคร่อมเที่ยงคืนไทย (flaky เล็กน้อย) · ใช้ `s.today` อย่างเดียวพอ
- R-6508 · scripts/fixture-server.cjs:914 — CLI พิมพ์รหัสผ่านทดสอบตอน start (ของเดิม) · ถ้า QA เก็บ log นี้ลง evidence รหัสจะเข้าเอกสาร · ข้อสังเกตนอกขอบเขต: รหัสผ่านทดสอบมีอยู่แล้วใน `evidence/shots/t32/pages-*.json` (ของ T-32) และ pages.json ของงานก่อน ๆ — ไม่ได้ตรวจในรอบนี้

### สิ่งที่ตรวจแล้วไม่พบปัญหา

- **แยกจาก build/worker จริง**: `grep "__fixture\|fixture-server"` ใน src/ worker/ shared/ public/ dist/ package.json = ไม่พบ · endpoint อยู่ใน `http.createServer` ของสคริปต์ (บรรทัด 757–815) เท่านั้น ไม่ได้แตะ `worker/app.ts`
- **ผูก 127.0.0.1**: บรรทัด 861 · port 0 คืนพอร์ตจริงผ่าน `server.address()` (862) · หลังรันเทสต์ไม่มีพอร์ต 4109 ค้าง
- **วันที่ Asia/Bangkok**: `bkkToday` = UTC+7 คงที่ (shared/time.ts) · `dayAdd` คิดบน UTC midnight → ข้ามเดือน/ปี/ก.พ. ถูก (เทสต์ 2031-02-28 → 03-01, 2026-12-31 → 2027-01-01) · `noonOf` = 12:00+07:00 ไม่เลื่อนวัน · เช็คชื่อ 08:00 ไทยของวัน T · `--today` ตรวจวันที่จริง (2031-02-30 ถูกปฏิเสธ)
- **self-check ตรง §3 (คิดมือ)**: ป.6/1 ส่ง 27+28+29 = 84, ค้าง 4+3 = 7 → 8400/91 = 92 · ป.6/2 71/81 = 88 · ป.5/1 16+23 = 39, ค้าง 5 → 39/44 = 89 · รอตรวจ 20+0+10 = 30 · ค้างรวม 22 · followUp 8 (worker ตัดที่ 8: 5 คนค้าง 2 + 3 คนค้าง 1) · dueSoon A1 [5, 9] / A2 [12] · มา 30/32 = 94, 27/30 = 90, ป.5/1 null · "ยังเหลือ 1 ห้อง" · F-H8 รอตรวจ 3 ค้าง 4 · สแกน S1 ป.6/1 [33,26,4,3,0,2], S4 [40,30,5,5,8,2] = 79% · ค่าคาดเป็นค่าคงที่จาก fixtures.md ไม่ได้คิดจากข้อมูลที่สร้างเอง และมีเทสต์ที่ลบ submissions แล้วต้องได้ FIXTURE_SELF_CHECK (`expected 30 got 24`) → ตรวจจริง ไม่ใช่ assert ตัวเอง (ยกเว้น 2 บรรทัดใน R-6503)
- **self-check ล้ม → exit 1 ก่อนเปิดพอร์ต**: throw ใน try → `mf.dispose()` (744) → CLI `process.exit(1)` (916) · ซ้อนแฟล็ก → exit 2 (รันแล้ว)
- **ของเดิม**: `seed:false` → `empty` · ไม่ใส่แฟล็ก = seed-demo + `--gb14`/`--layout` ทำงานเหมือนเดิม (เงื่อนไข `&& seed` → `&& demo` เทียบเท่า) · `setDown`, `setDbLatency`, `setAssetsDir`, `--assets`, `email`/`password`, `close()` คงเดิม · `--gb14` กับชุด opt-in ถูกปฏิเสธชัด · ชุดใหม่ทั้งหมด opt-in (fixtures.md §5)
- **ชื่อ/ความลับ**: ชื่อทั้งหมดเป็นรูป "สมมติN ทดลองXX"/ชื่อที่ fixtures.md กำหนด · โรงเรียน "โรงเรียนสมมติ" · ไม่มี key/secret ใหม่ (pepper/setup code เป็นของเดิม ไม่ใช่ความลับ) · dev-notes/fixtures.md ของ T-65 ไม่มีรหัสผ่าน
- **การควบคุม**: POST ต้อง JSON/X-Fixture → หน้าเว็บอื่นส่งแบบ no-cors ไม่ได้ (415) · DELETE ต้อง preflight · ตรวจ input fault/latency (422) · `kill-sessions` ลบเฉพาะ D1 ในหน่วยความจำ · `down` ไม่ตัด `/__fixture/*` (กู้คืนได้)

### เช็กลิสต์ความปลอดภัย

| ข้อ | ผล |
|---|---|
| สิทธิ์ฝั่ง server | N/A — `/__fixture/*` ไม่มี auth โดยตั้งใจ, อยู่เฉพาะสคริปต์ทดสอบบน loopback |
| validation ฝั่ง server | PASS (fault/latency/today) · เสนอ R-6504 สำหรับ CLI |
| injection | PASS — SQL ใช้ bind ทุกจุด (`put`, settings) · path traversal ของไฟล์ static ของเดิม (841) |
| CSRF | PASS (415 + preflight) · DNS rebinding = เสนอ R-6506 |
| secrets ในโค้ด/log | ไม่มีใหม่ · รหัสทดสอบใน log = ของเดิม (R-6508) |
| ข้อมูลส่วนบุคคล | PASS — ชื่อสมมติทั้งหมด |
| dependency ใหม่ | ไม่มี (ใช้ miniflare/typescript เดิม) |

### ความถูกต้องของข้อมูล (ธง 🔄)

| ข้อ | ผล |
|---|---|
| timezone / ข้ามเที่ยงคืน | ตอน start PASS · เปิดค้างข้ามคืน = R-6502 · `--today` = R-6501 |
| ข้ามเดือน/ปี | PASS (`dayAdd` บน UTC) |
| นับซ้ำ | PASS — `INSERT OR REPLACE` + id กำหนดตายตัว, `decide` throw ถ้าเลขที่ไม่มีจริงหรือ awaiting+late เกินคนส่ง |
| transaction | batch ละ 80 ไม่ atomic แต่ล้ม = throw + dispose ทั้ง DB ในหน่วยความจำ — ไม่เหลือข้อมูลครึ่งเดียวให้ใช้ |
| ออฟไลน์ (down) | PASS — ตัดทั้งหน้าและ SW, control ยังตอบ |

### หลักฐาน

| คำสั่ง | ผล |
|---|---|
| Q-6501 `npx vitest run test/unit/fixture-datasets.test.ts --project dom` | 26/26 passed (59.7s) |
| Q-6502 grep `__fixture`/`fixture-server` ใน src worker shared public dist package.json · `node scripts/fixture-server.cjs --home --scan` | ไม่พบ · exit 2 |
| Q-6503 สคริปต์ใน scratchpad: `today: "2026-11-20"` แล้วเรียก EP-06 แบบแอป | selfCheck ok แต่ missing 0, marked [0,0,0] → FAIL (R-6501, ไม่ mandatory) |
| `node --check scripts/fixture-server.cjs` | OK |
| `netstat` หลังรัน | ไม่มีพอร์ต 4109 ค้าง |


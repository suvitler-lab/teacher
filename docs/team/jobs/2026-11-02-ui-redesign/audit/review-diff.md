# Code review: diff ที่ยังไม่ commit (branch team/2026-11-04-ui-redesign)

วันที่ตรวจ 2026-11-04 · ตรวจโดยอ่านโค้ดอย่างเดียว ไม่แก้โค้ด ไม่เปิดเบราว์เซอร์ · ช่วงที่ตรวจ: `git diff` (68 ไฟล์) + ไฟล์ใหม่ที่ยังไม่ track
ธงที่ใช้ตรวจ: 💰 🔄 🗑 🔐 · ตรวจละเอียด: worker/routes/attendance.ts, src/lib/attSync.ts, src/pages/Attendance.tsx, catalog.ts/db.ts/types.ts/pageCards.ts, Scan.tsx (undo / วันที่รับ / เปลี่ยนโหมด / sheet ที่นั่ง / รายการล่าสุด), router.ts, Dialog/ConfirmDialog, pageColumns/PageCols, notify/Overlays · หน้าอื่น (Gradebook/Reports/Students/Settings UI, CSS) ตรวจแค่หาของค้างจาก debug และขนาดฟอนต์ ไม่ได้ตรวจตรรกะทีละบรรทัด

## หลักฐานที่รัน

| คำสั่ง | ผล |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx vitest run` | PASS — 140 ไฟล์ 1609 เทสต์ |
| grep `console.log/debug`, `TODO/FIXME`, `debugger`, `font-size: Npx` ในบรรทัดที่เพิ่ม + ไฟล์ใหม่ใน src | ไม่พบ (มี `font-size: max(13px, 0.95rem)` attend.css ซึ่งเป็นค่าต่ำสุด ไม่ใช่ px ตายตัว รับได้) |
| grep ข้อมูลตัวอย่างฝังในโค้ด | ไม่พบ (มีแค่ placeholder ตัวอย่างในช่องวาง Excel และใน comment) |

## สรุป

**ผ่านแบบมีเงื่อนไข** — ไม่มี P1 · P2 3 ข้อ (ทั้งหมดเป็นเรื่องความถูกต้องของข้อมูลหรือของสถานะบนจอ) · P3 9 ข้อ
ฝั่ง server ของการยกเลิกการเช็ค (`status:"none"`) ทำได้ดี: guard ของ epoch, สมาชิกห้อง, conflict ใน batch, idempotency ด้วย opId, audit `void` ผูกกับ EXISTS ก่อนลบ และลบ session ที่ว่างใน batch เดียวกัน — มีเทสต์ API ครอบคลุม (attendance-clear.test.ts 15 เคส รวม race ระหว่าง check กับ write)

---

## P2 (ควรแก้ก่อนปล่อย)

### R-01 · 🔄 เน็ตช้า: GET ที่มาถึงช้ากว่า เขียนทับสถานะที่เพิ่งบันทึกบนจอ
- `src/pages/Attendance.tsx:178` (ปลด `loaded` หลังผ่าน `SLOW_MS` 2.5 วิ) + `:182` (`setServer(new Map(res.rows…))` แทนที่ทั้ง map)
- สถานการณ์ที่พัง: เน็ตช้า → ผ่านไป 2.5 วิ หน้าให้แตะได้ (`slow`) → ครูแตะ X = สาย → ส่งออก 600ms → ได้ event `saved` → `server` มี X=late → จากนั้น GET ที่ยิงไปก่อนหน้า (ซึ่งอ่าน DB ก่อนที่จะเขียน) ตอบกลับมา → map ถูกแทนด้วยข้อมูลเก่า → บนจอ X กลับเป็น "ยังไม่เช็ค" ทั้งที่ระบบเก็บ "สาย" แล้ว (draft ว่างเพราะส่งสำเร็จไปแล้ว) · ตัวนับ/การ์ด "ใครยังไม่เช็ค" ผิด · ถ้าครูแตะ X หรือกด "มาทั้งห้อง" ต่อ แถวจะส่งไปด้วย `baseUpdatedAt=null` → server ตอบ 409 conflict "ข้อมูลชนกับอีกเครื่อง" ทั้งที่เป็นข้อมูลของเครื่องนี้เอง
- ก่อน diff นี้ race นี้เกิดไม่ได้ เพราะแตะไม่ได้จนกว่า GET จะตอบ (`if (!loaded) return`)
- แนวทางแก้: ตอน GET ตอบ ให้ merge แทนการแทนที่ — เก็บแถวใน map ปัจจุบันที่ `updatedAt` ใหม่กว่าของ GET และไม่คืนแถวที่ถูก ack ว่า CLEARED หลังเริ่ม load (เช่น จด `ackedSince` ตั้งแต่ `seq` นี้เริ่ม) หรือถ้ามี `saved` ระหว่าง load ให้ GET ใหม่อีกรอบ
- เทสต์: **ไม่มี** (attendance-round3/4/5 ทดสอบ slow mode เฉพาะว่าแตะได้)

### R-02 · 🔄 "มาทั้งห้อง" ใช้สถานะจาก closure ตอนเปิดกล่องยืนยัน → ทับคะแนนสแกน "สาย" ที่เข้ามาระหว่างที่กล่องเปิด
- `src/pages/Attendance.tsx:314-319` (`await ask(...)` แล้ว `markAllPresent()` ของ render เดิม) → `:289-297` คำนวณ `todo` จาก `statusOf`/`draft` ของ render ตอนที่กด
- สถานการณ์ที่พัง: โหมดสแกน (ปุ่ม "มาทั้งห้อง" แสดงในโหมดนี้ด้วยแล้ว) ครูกด "มาทั้งห้อง" → กล่องยืนยันเปิด → เด็ก A ยิง QR หลังเวลาสาย (HID listener ที่ `document` แบบ capture ยังทำงานตอนกล่องเปิด) → draft A = late → ครูกด "มาทั้งห้อง n คน" → closure เดิมยังเห็น A เป็น "ยังไม่เช็ค" → `draftEdit` เขียนทับ A เป็น present (base เดียวกัน server ไม่เห็นว่าชน) → **ข้อมูลสายหายไปเงียบ ๆ** · เกิดได้เช่นกันกับ tap/ack ที่เข้ามาระหว่างนั้น
- แนวทางแก้: ให้ `markAllPresent` อ่านสถานะสดผ่าน ref (`draftRef`/`serverRef`) หลังได้คำตอบ หรือดีกว่านั้นคือให้ `draftEdit` มีโหมด "ใส่เฉพาะเมื่อยังไม่มีแถวใน draft (หรือแถวเป็น CLEARED) และ server ไม่มีค่า" ซึ่งตัดสินใน `draftUpdate` แบบ atomic · และ/หรือปิด HID ขณะกล่องยืนยันเปิด
- เทสต์: **ไม่มี** (ไม่มีเทสต์ที่มีการแก้ระหว่างกล่องยืนยันเปิด)

### R-03 · 💰 เลิกทำ "ยกเลิกการส่ง" ในหน้าสแกนส่งงานกลับด้วยวันรับ = วันนี้ → สถานะ `late` และ `submitted_at` เปลี่ยน
- `src/pages/Scan.tsx:454` `makeOp(studentId, "submitted", prev.score, "manual")` → `:287` ใส่ `receivedDate: recvDate ?? bkkToday(actionTime())` · server `worker/routes/submissions.ts:464-476`: op `void` ตั้ง `submitted_at=null, late=0`; op ที่ส่งเข้าใหม่เป็น `firstSubmit` → `submittedAt = receivedAtMs(receivedDate)` และ `late` คิดใหม่จากวันนั้น
- สถานการณ์ที่พัง: เด็กส่งตรงเวลาเมื่อ 3 วันก่อน (กำหนดส่งเมื่อวาน) → รอบนี้ครูแตะช่องของเด็ก → sheet ใหม่ "ยกเลิกการส่ง" (`:1332`) → รู้ว่าแตะผิด → กด "เลิกทำ (5)" → ส่งเข้าใหม่ด้วยวันที่วันนี้ → server ตั้ง `late=1` และ submitted_at = วันนี้ → รายงาน/สมุดคะแนนแสดง "ส่งช้า" ผิด (BR-04) · ถ้าครูตั้งวันรับย้อนหลังของรอบไว้ ก็จะใช้วันนั้นแทนวันจริงของเด็ก
- ตัวโค้ดเดิมมีมาก่อน diff แต่ diff นี้เปิดทางใหม่ (sheet ของทุกช่องที่ส่งแล้ว รวมถึงงานที่ส่งในรอบก่อน) และ toast นับถอยหลังทำให้ผู้ใช้เชื่อว่า "เลิกทำ" คืนค่าเดิมทุกอย่าง
- แนวทางแก้: เก็บ `submitted_at` (หรือวันรับ) ไว้ใน `SubState` ตอน `loadSubs`/ack แล้วตอนเลิกทำให้ส่ง `receivedDate = bkkToday(prev.submittedAt)` (server ใช้ instant เดิมเมื่อวันตรงกันได้ถ้าเพิ่ม rule) หรือเพิ่ม op "restore" ฝั่ง server ที่คืน submitted_at/late จาก audit `before`
- เทสต์: **ไม่มี** (ไม่มีเทสต์ว่าเลิกทำแล้ว `late`/`submitted_at` คงเดิม)

---

## P3 (เสนอ)

| # | ธง | ไฟล์:บรรทัด | สถานการณ์ | แนวทางแก้ | มีเทสต์? |
|---|---|---|---|---|---|
| R-04 | 🗑🔄 | `worker/routes/attendance.ts:317-319,332` + `:221` | เครื่อง A ยกเลิกเด็กคนสุดท้ายของวัน → ลบ `attendance_sessions` ขณะที่เครื่อง B ได้ `sessionId` เดิมไปแล้วจาก `findOrCreateSession` → batch ของ B ชน FK (D1 เปิด foreign_keys) → catch ไม่เจอ conflict → วนซ้ำด้วย `sessionId` เดิม 3 ครั้ง → 500 · client จะ retry แล้วสร้าง session ใหม่ได้ (ไม่หาย แต่ช้าและได้ 500) | ในลูปให้หา session ใหม่เมื่อ batch ล้ม หรือใส่ `INSERT OR IGNORE INTO attendance_sessions (id,…)` ด้วย id เดิมเป็น statement แรกของ batch เมื่อมี `writes` | ไม่มี |
| R-05 | 🔄 | `src/lib/attSync.ts:141` | `withdrawRows` ดู `running` ก่อน `await draftUpdate` — ถ้า flush เริ่มในช่วงนั้นพอดี จะส่ง "มา" ทั้งห้องไปแล้ว แต่ toast บอก "เลิกทำแล้ว · n คน" (บนจอจะกลับเป็น "มา" เมื่อ ack มาถึง) · และการแตะเด็กคนอื่นภายใน 4.5 วิ จะเปลี่ยน debounce เป็น 600ms ทำให้ช่วงเลิกทำหายไป (มีข้อความบอก) | ตั้ง flag "withdrawing" ที่ flush ต้องรอ หรือให้ runFlush ข้ามแถวที่มี opId อยู่ในรายการ hold | บางส่วน |
| R-06 | 🔄 | `src/pages/Attendance.tsx:271` + conflict card | ขณะเด็กมี conflict ค้าง ถ้าแตะซ้ำ (เป็นการยกเลิก) draft เปลี่ยนเป็น `none` แต่การ์ด conflict ยังแสดง "เครื่องนี้: มา" จากคำตอบ 409 เดิม → กด "ใช้ของเครื่องนี้" จะส่ง "ยกเลิก" ไม่ใช่ "มา" | ในการ์ดแสดง `draft.rows[sid].status` ปัจจุบันแทน `c.draft.status` หรือห้ามแตะเด็กที่มี conflict | ไม่มี |
| R-07 | 💰 | `src/pages/Scan.tsx:315,433,1691` | `lastScore` ไม่ถูกล้างตอน `startSession` → ปุ่ม "ล่าสุด 8" ของงาน/ห้องก่อนหน้ายังแสดงในงานใหม่ (กรองแค่ ≤ เต็ม) แตะแล้วได้คะแนนที่ไม่ได้มาจากงานนี้ | ล้าง `lastScore.value = null` ใน `startSession` | ไม่มี |
| R-08 | – | `src/pages/Scan.tsx:1237,1241` | โหมด "กรอกทีละคน" เด็ก 1 คนถูก `pushRecent` 2 ครั้ง (สแกน + ใส่คะแนน) → ป้ายใหม่ "รอบนี้ n คน" นับเป็น 2 คนและรายการซ้ำ | นับ distinct `studentId` / แทนแถวเดิมใน `pushRecent` | ไม่มี |
| R-09 | – | `src/pages/Scan.tsx:997-1003` | เปลี่ยนโหมดกลางรอบบันทึกแค่ `kvSet` ไม่อัปเดต `scan_sessions.mode` ฝั่ง server (ข้อมูลรอบที่สำรอง/รายงานไม่ตรง) · คะแนนที่กำลังพิมพ์ถูกทิ้ง (`pending=null`) โดยไม่บอก | ส่งการอัปเดต mode หรือระบุใน contract ว่า mode บน server คือ "โหมดตอนเริ่ม" · บอกใน toast ว่าคะแนนที่ค้างไปใส่ในสมุดคะแนน | ไม่มี |
| R-10 | – | `src/router.ts:29-30` | การคืนที่อยู่ใช้ `location.hash =` ซึ่งเพิ่ม history ทุกครั้ง → กดย้อนกลับ → ตอบ "อยู่ต่อ"/"ออก" แล้ว ปุ่ม back ถัดไปพากลับไปหน้าเดิมซ้ำ (ไม่ทำให้ติดหน้า และไม่ทำให้การแก้หายเงียบ ๆ — ตรวจแล้ว `skipGuard` รีเซ็ตใน hashchange ถัดไปเสมอ, กดนำทางซ้ำระหว่างกล่องเปิด = คำถามใหม่แทนคำถามเดิม (resolve false)) | ใช้ `history.replaceState`/`location.replace` ตอนคืนที่อยู่ | มี (router-async-guard) ยกเว้นเรื่อง history |
| R-11 | – | `src/components/PageCols.tsx:10-21` | `useRegionRem` ผูก ResizeObserver ครั้งเดียวตอน mount (`[]`) — ถ้า mount ตอน `keys` ว่าง (return null ไม่มี element) แล้วต่อมาเปิดการ์ด observer ไม่ถูกผูก → ค้าง 1 คอลัมน์ · comment บอกว่าวัดใหม่เมื่อเปลี่ยนขนาดตัวอักษร แต่ RO ไม่ยิงเมื่อ root font-size เปลี่ยนโดยความกว้าง px เท่าเดิม → จำนวนคอลัมน์ผิดจนกว่าจะ resize · ไม่พบ leak (disconnect ตอน unmount) และไม่พบ loop (กล่องนอกที่วัดกว้างเต็มเสมอ) | ใช้ callback ref แทน `useEffect([])` และฟัง `matchMedia`/event เปลี่ยนขนาดตัวอักษร | มี (page-cols) ไม่ครอบกรณีนี้ |
| R-12 | 🔐 | `worker/routes/catalog.ts:57-63` | คีย์ `*_cards` ใหม่รับ string ไม่จำกัดความยาว/รูปแบบ (เหมือน `home_cards` เดิม) — ต้องล็อกอินก่อน และ `parseLayout` (`src/lib/cardLayout.ts:25-39`) กันค่าเสีย/ไม่ใช่ JSON/version อื่นคืนค่าเริ่มต้นได้ หน้าไม่พัง · backup/restore รวมตาราง settings ทั้งหมดอยู่แล้ว ค่าเสียจากไฟล์ก็ถูก parse ทิ้ง · ข้อเสนอ: จำกัดความยาว ≤ 2 KB และตรวจรูปแบบ `{v:1,order,hidden}` ฝั่ง server | – | มี (page-cards-settings) |

## เรื่องที่ตรวจแล้วไม่พบปัญหา

- การยกเลิกฝั่ง server: นักเรียนซ้ำใน batch เดียวไม่เกิดจาก client (draft เก็บต่อ studentId) · guard ใน batch ครอบแถว `none` (`a.status != 'none'`) · retry หลังสำเร็จถูกข้ามด้วย opId · ยกเลิกแถวที่ไม่มี = 200 ไม่มี audit · `changed` นับเฉพาะแถวที่มีจริง · fingerprint ของ backup จับการลบได้ (COUNT + audit) · `attendance/days` และ dashboard ไม่นับเด็กที่ถูกยกเลิก
- attSync: ถือแถว `none` ว่ายืนยันแล้วเฉพาะเมื่ออยู่ใน `absent[]` (server เก่า → ค้างในคิว ไม่ทิ้ง) · `ack` คืน base = `updatedAt` เมื่อไม่มี version ของแถวที่ถูกลบ — ใช้ได้
- เลิกทำการยกเลิกเช็คชื่อ (`clearMark`) ตรวจว่ายังอยู่หน้าเดิม และส่งเวลาเดิมกลับ (`clampClientTs` ไม่เกิน 7 วัน)
- ConfirmDialog: ใช้ `role="alertdialog"` · Esc/แตะพื้นหลัง = ไม่ · คำถามใหม่ resolve คำถามเดิมเป็น false · โฟกัสแรกตกที่ปุ่ม X (ปิด = ไม่) ไม่ใช่ "ยกเลิก" ตามที่ comment บอก แต่ยังปลอดภัย (Enter ไม่ยืนยัน)
- Settings/Gradebook nav guard: Settings ให้ผ่านเมื่อไปหมวดอื่นใน /settings · มี beforeunload
- Scan: `late` ยังตัดสินที่ server (การ์ดแค่บอกใบ้) · `already_submitted` ใช้ค่าจาก server · `recent` และ `recvDate` ถูกล้างใน `startSession` (เปลี่ยนห้องกลางรอบ)

## ความไม่ตรงกันระหว่าง api-contract กับโค้ด

- EP-08 / D39 เขียนว่า toast "เลิกทำ" อยู่ **5 วินาที** — ตรงกับ `notify` (5000ms เมื่อมีปุ่ม) ✅ · แต่ "มาทั้งห้อง" ถือการส่งไว้ `UNDO_HOLD_MS = 4500` ขณะที่ toast อยู่ 5 วิ และเริ่มนับหลังเขียน IDB เสร็จ → ช่วงท้ายประมาณ 0.5–1 วินาที กดเลิกทำแล้วได้ "เลิกทำไม่ได้แล้ว" (ข้อความตรงความจริง แต่ไม่ตรงกับที่สัญญาไว้ใน UI) — ควรทำให้เท่ากัน
- EP-08 บอกว่า `time` ไม่ใช้กับแถว `none` — ตรงกับโค้ด ✅ · `absent[]` ตรง ✅ · ลบ session ว่างใน batch เดียวกัน ✅ (แต่ดู R-04)
- EP-07 v8 คีย์ 4 ตัว ตรงกับ `ALLOWED_SETTINGS`/`getSettings`/`Settings` ✅

## พฤติกรรมที่ไม่มีเทสต์

1. GET ตอบช้ากว่า ack ใน slow mode (R-01)
2. มีการแก้ระหว่างกล่องยืนยัน "มาทั้งห้อง" เปิด (R-02)
3. เลิกทำการยกเลิกการส่งแล้ว `late`/`submitted_at` คงเดิม (R-03)
4. ลบ session ว่างพร้อมกับอีกเครื่องเขียนลง session นั้น (R-04)
5. `withdrawRows` ชนกับ flush ที่เพิ่งเริ่ม (R-05) · แตะยกเลิกเด็กที่มี conflict ค้าง (R-06)
6. `lastScore` ข้ามงาน (R-07) · จำนวนใน "รอบนี้ n คน" โหมดกรอกทีละคน (R-08)
7. history ของ router หลังตอบกล่องถาม (R-10) · PageCols mount ตอนไม่มีการ์ด / เปลี่ยนขนาดตัวอักษร (R-11)

## เช็กลิสต์

- [x] ตรวจครบทุกไฟล์ใน diff ตามขอบเขตที่ระบุ (หน้าที่อยู่นอกโฟกัสตรวจแค่ของค้างจาก debug/ขนาดฟอนต์)
- [x] ทุกข้อ P2 มี file:line + สถานการณ์ที่พัง + แนวทางแก้
- [x] เช็กลิสต์ความปลอดภัยและข้อมูล: สิทธิ์ (requireAuth ทุก route ที่แตะ) ✅ · validation ฝั่ง server (zod, enum `none`) ✅ · injection (ใช้ bind/json_each) ✅ · secrets ไม่พบ · ไม่มี dependency ใหม่ · transaction/race ดู R-01,R-02,R-04,R-05 · timezone: `timeOf` ใน Scan.tsx ใช้ `toLocaleTimeString("th-TH")` ไม่ใส่ `timeZone: "Asia/Bangkok"` (แสดงตามเวลาของเครื่อง ซึ่งปกติก็เป็นเวลาไทย) · ปี พ.ศ. `thaiShort` +543 ✅
- [x] ไม่ได้แก้ไฟล์อื่นนอกจากรายงานนี้

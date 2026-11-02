# Code review: perf P4 / P2 / P3 (outbox ไม่ publish ซ้ำ · จำห้อง/วิชา · scroll flags)

โดย Code Reviewer · 2026-11-02 · ช่วง diff: `HEAD` (5119bf2) + ที่ยังไม่ commit (6 ไฟล์ใน src + เทสต์ใหม่ 2 ไฟล์) · รอบแก้ (Verify) 0/3 (รอบแรก)

ความรุนแรง: **ต้องแก้** = สูง (เทียบบั๊กสูงของ QA) · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

ไฟล์ที่ตรวจ: `src/lib/outbox.ts`, `src/store.ts`, `src/pages/Gradebook.tsx`, `src/pages/Students.tsx`, `src/pages/Reports.tsx`, `src/components/GradebookNav.tsx`, `test/unit/perf-p4-p2-p3.test.ts`, `test/unit/perf-p3-scroll-flags.test.tsx` · โค้ดรอบข้างที่อ่านเพิ่ม: `src/lib/idb.ts` (การเขียน payload), `src/pages/Scan.tsx` (effSub/markOf/makeOp), `src/router.ts` (navigate/routeParams), `src/pages/Home.tsx` (deep link), `src/lib/gbColumns.ts` (edgeState/fitsAll)

## สรุป: ผ่าน

ต้องแก้ 0 ข้อ · แนะนำ 5 ข้อ (ควรแก้ 1 · เสนอ 4) — ไม่พบปัญหาที่ทำให้คะแนนผิดหรือสถานะช่องผิด

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้ (กลาง — ค้างหลังรอบ 3 ได้เมื่อเจ้าของงานรับเป็น known issue)

- R-01 เลือก "ทุกวิชา" แล้วระบบไม่จำ · `src/store.ts:148` (+ ผู้เรียก `src/pages/Gradebook.tsx:113`) — `rememberSubject` ข้ามค่า `''` (`if (id)`) แต่ในสมุดคะแนน `''` คือตัวเลือก "ทุกวิชา" ที่ครูเลือกเองได้ (`Gradebook.tsx:457`)
  - สถานการณ์: ครูเลือก "คณิต" → `pickedSubject='s1'` → เปลี่ยนเป็น "ทุกวิชา" (ไม่ถูกจำ) → ไปหน้าแรก กด "สมุดคะแนน ›" (`Home.tsx:148` ไม่ส่ง subject) → `startSubject(undefined)` คืน `'s1'` → หน้าเปิดที่ "คณิต" ไม่ใช่ "ทุกวิชา" ที่เพิ่งเลือก งานวิชาอื่นหายจากตาราง ครูอาจคิดว่างานหาย (ข้อมูลไม่เสียหาย เป็นแค่ตัวกรองแสดงผล และไม่ได้แย่กว่าเดิมที่เปิดวิชาแรกเสมอ แต่ขัดกับเป้าของ P2 ที่ว่า "กลับมาแล้วอยู่ที่เดิม")
  - แนวทาง: แยก "ยังไม่เคยเลือก" ออกจาก "เลือกทุกวิชา" เช่น `let pickedSubject: string | null = null`; `rememberSubject(id)` เก็บทุกค่ารวม `''`; ใน `startSubject` ถ้า `pickedSubject === ''` คืน `''` ถ้าเป็น id ให้ตรวจว่ายังอยู่ใน `offered`; `logout` ตั้งกลับเป็น `null` · เพิ่มเทสต์ "เลือก s2 → เลือก '' → startSubject(undefined) = ''"

## เสนอ (ต่ำ — เจ้าของงานเลือกได้)

- R-02 เปลี่ยนเทอมแล้วกลับมา หน้าเปิดที่ห้องแรกแทนห้องที่จำไว้ · `src/pages/Gradebook.tsx:116`, `src/pages/Students.tsx:52`, `src/pages/Reports.tsx:77` — effect เปลี่ยนเทอมยังแก้ห้องเป็น `viewClasses[0]` และ effect `rememberClass` จำห้องของปีเก่าแทนห้องเดิม สถานการณ์: อยู่ที่ ม.2/3 → TermPicker ไปปีก่อน (ห้องไม่อยู่ → ห้องแรกของปีเก่า และถูกจำ) → กลับมาปีนี้ → ห้องแรกของปีนี้ ไม่ใช่ ม.2/3 · พฤติกรรมเดียวกับก่อนแก้ จึงไม่ใช่ regression · ถ้าต้องการให้ดีขึ้น ให้จำห้องแยกตามปีหรือเทอม แล้วใช้ `startClass(null, viewClasses.value)` ใน effect นี้
- R-03 เทสต์ P4 ยังไม่ได้ทดสอบ `refreshCounts` จริง · `test/unit/perf-p4-p2-p3.test.ts:22-26` — เทสต์ "signals keep their identity" แค่เทียบ `sameOps(x, new Map(x))` ซึ่งจริงเสมอ ไม่ได้พิสูจน์ว่าการ flush ที่ไม่มีอะไรเปลี่ยนจะไม่ publish ค่าใหม่ หรือว่าการแทน op ของช่องเดิม / retry จะ publish · แนะนำเพิ่มเทสต์แบบ `outbox-order.test.ts` (มี fake IDB อยู่แล้ว) ให้ครอบ 4 กรณี: (ก) flush ซ้ำตอน backoff → `pendingOps.value` เป็น object เดิม (ข) enqueue op ใหม่ช่องเดิม → object ใหม่ และ `.get(k).score` เป็นค่าใหม่ (ค) ส่งไม่ผ่าน → `failedPairKeys` มี k (ง) `retryFailed` → `failedPairKeys` ไม่มี k และ `pendingOps` มี op id ใหม่ · ตอนนี้กรณี (ข)(ค)(ง) มีเทสต์เดิมครอบอยู่บางส่วนแล้ว (`outbox-order.test.ts:75,229,248`, `qa-m1-02-outbox.test.ts:94`) และยังผ่านทั้งหมด
- R-04 โค้ดที่ไม่มีใครใช้แล้ว · `src/components/GradebookNav.tsx:159-163` — `edgeClass(info)` ไม่มีคนเรียกแล้ว (grep ทั้ง src/test) ถ้าเก็บไว้จะมีสองฟังก์ชันที่คำนวณเงาขอบ (`edgeClass` กับ `edgeClassOf`) ที่อาจแก้ไม่ตรงกันในอนาคต · และคอมเมนต์ "the term changed…" ใน `Students.tsx:49` / `Reports.tsx:74` ตอนนี้อยู่เหนือ effect `rememberClass` แทน effect ที่มันอธิบาย
- R-05 (มีอยู่ก่อน diff นี้) ลิงก์จากหน้าแรกไปงานที่ไม่มีวิชา เปิดแล้วไม่เจองานนั้น · `src/router.ts:34` + `src/pages/Home.tsx:228` + `src/store.ts:156` — `navigate` ตัดพารามิเตอร์ที่เป็น `''`/null ออก งานที่ `subject_id = null` จึงไปถึงหน้าโดยไม่มี `subject` → `startSubject` เลือกวิชาที่จำไว้ (เดิมคือวิชาแรก) → งานเป้าหมายถูกกรองออก → `load()` เลือกคอลัมน์งานแรกแทน (`Gradebook.tsx:138`) · ไม่ได้เกิดจาก diff นี้ แต่ diff นี้ทำให้ผลลัพธ์ขึ้นกับวิชาที่ครูเคยเลือก · ทางแก้: หน้าแรกส่ง `subject: subject_id ?? "all"` หรือ Gradebook ใช้ `params.asg` เป็นตัวบอกว่าเป็น deep link แล้วเริ่มที่ `''` (ทุกวิชา) · ข้อสังเกต: ข้อที่บอกว่า "ลิงก์ที่ส่ง `subject=''` = ทุกวิชา" เกิดได้เฉพาะ URL ที่พิมพ์เอง เพราะ `navigate` ไม่เคยส่ง `''`

## สิ่งที่ตรวจแล้วไม่พบปัญหา

### P4 outbox (`src/lib/outbox.ts:43-67`)
- **การเทียบด้วย opId ปลอดภัย**: ทุกจุดที่สร้าง op ได้ opId ใหม่ (`Gradebook.tsx:201` ulid, `Scan.tsx:264` ulid, `retryFailed` `outbox.ts:236` UUID ใหม่) · การเขียน outbox ที่ใช้ opId เดิม (`outbox.ts:136` backOff, `:254` expedite) แก้แค่ `tries/nextAt` ไม่แตะ `payload` · `idb.ts:110` ย้ายไป failed โดยคง payload · จึงไม่มีกรณีที่ opId เดิมแต่คะแนนหรือสถานะใน payload เปลี่ยน → ไม่มีกรณีที่ช่องค้างค่าเก่า
- **op ใหม่แทน op เดิมของช่องเดียวกัน**: key เดิมแต่ opId ต่าง → `sameOps` เป็น false → publish (ยืนยันด้วย `outbox-order.test.ts:75` ที่คาดว่าได้ 9 ซึ่งยังผ่าน)
- **retry ที่ไม่มีอะไรเปลี่ยน** (backoff, ไม่มีผลตัดสินจากเซิร์ฟเวอร์, ออฟไลน์): มีแค่ tries/nextAt ที่เปลี่ยน → ไม่ publish ค่าใหม่ ถูกต้องตามเป้า
- **failed → retry**: key หายจาก failed set (ขนาดหรือสมาชิกเปลี่ยน → publish) และ outbox ได้ op ที่ opId ใหม่ (→ publish) · ส่งไม่ผ่านแล้วย้ายไป failed: ขนาด latest ลด → publish · กรณี pair อยู่ใน failed อยู่แล้วแล้วมี op ตามไปอีก (blocked_by_earlier_failure) set ไม่เปลี่ยนจึงไม่ publish ซึ่งถูก เพราะผลที่แสดงเหมือนเดิม
- **`sameOps`/`sameKeys` ถูกต้อง**: ขนาดเท่ากันและทุก key ของ a อยู่ใน b ด้วย opId เดียวกัน = ชุดเดียวกันแน่นอน
- **ทุกที่ที่อ่านค่ายังได้ค่าใหม่**: Gradebook `subOf/markOf` (`Gradebook.tsx:167-183`), ปุ่มทำทั้งห้อง `:261` (อ่าน `.value` หลัง `await flush()`), Scan `effSub/markOf` (`Scan.tsx:236,248`) อ่าน `.value` ตอน render ไม่มี `computed`/effect ที่ต้องพึ่ง identity ที่เปลี่ยนทุกครั้ง · ป้ายต่าง ๆ (Home, Shell, ui.tsx, Overlays, StartTermModal, deviceCheck) ใช้ `pendingCount/failedCount` ซึ่งยัง set ทุกรอบเหมือนเดิม (ค่า primitive ที่ signal ข้ามการแจ้งเองเมื่อค่าเท่าเดิม)
- refreshCounts ที่ทำงานซ้อนกันอาจเขียนค่าเก่าทับค่าใหม่ได้ (เป็นแบบนี้มาก่อนแล้ว) · การเทียบแบบใหม่เทียบกับค่าปัจจุบัน รอบถัดไปจึงยังแก้ค่าให้ถูกได้เหมือนเดิม ไม่ได้แย่ลง

### P2 จำห้อง/วิชา (`src/store.ts:143-159,194`)
- ห้องที่ไม่อยู่ในเทอมแล้ว: `startClass` ตรวจกับ `offered` (= `viewClasses` ของเทอมที่เลือก) ก่อนใช้ จึงไม่เปิดห้องที่ไม่มีอยู่จริง หรือห้องของครูคนอื่นที่ค้างจาก session ก่อน
- ลำดับความสำคัญ: `params.class` (ถ้าไม่ว่าง) มาก่อนเสมอ เหมือน `params.class || …` เดิม · `params.subject` ใช้ `!= null` เหมือน `??` เดิม · deep link จากหน้าแรก (`Home.tsx:200,227`) ส่ง class (+subject, asg) ตรงไป จึงไม่ถอยกลับ (ดู R-05 สำหรับกรณีวิชาเป็น null ที่มีอยู่ก่อนแล้ว)
- effect เปลี่ยนเทอมยังทำงานตอน mount และตอนเปลี่ยนเทอม (`[selectedTermId.value]`) ไม่ได้ถูกแตะ
- logout ล้างค่าที่จำไว้ (`store.ts:194`) · ค่าเป็น id ภายในที่ไม่ลับ และเก็บในหน่วยความจำของ module เท่านั้น ไม่ได้ลง storage

### P3 scroll flags (`src/components/GradebookNav.tsx:41-60,141-157`, `Gradebook.tsx:376,404,541,562`)
- ลำดับ hook: `useScrollInfo` อยู่ก่อน `return null` (`:146-147`) · `useScrollFlags` ใน Gradebook ถูกเรียกทุกครั้ง ไม่มี early return ก่อนหน้า
- เงื่อนไขการ mount: `hasTable` (`:374`) ตรงกับเงื่อนไขที่วาด `.gb-scroll` (`:546-563`: classId, ไม่ error, มีงาน, ไม่ใช่มือถือ) ทุกข้อ ตอน effect ของ GradebookNav ทำงาน `scrollRef.current` จึงมีค่าแล้ว (useEffect ทำงานหลัง commit/paint)
- ค่าเริ่มต้น: เดิม `EMPTY` → ไม่มีเงา, minimap เป็น null · ใหม่ `"000"` → ไม่มีเงา, GradebookNav ใช้ `EMPTY` ของตัวเอง → null เหมือนเดิม · ค่า deps ของ effect ปรับความสูง (`:404`) เริ่มที่ false แทน true แต่ effect ทำงานตอน mount อยู่แล้ว และทำงานใหม่ทุกครั้งที่ค่าเปลี่ยน ผลจึงเหมือนเดิม
- `edgeState` ไม่ใช้ `nameW/totW` (`gbColumns.ts:120-123`) การส่ง 0 จึงไม่เปลี่ยนผล
- minimap/ปุ่มกระโดด: GradebookNav render ใหม่ทุกครั้งที่ scroll (มี state ของตัวเอง) ทำให้ `infoRef` ของ MiniMap สดเสมอ · `onJump` เป็น closure ใหม่จาก parent ทุกครั้งที่ parent render · ResizeObserver และ listener ถูกถอดครบใน cleanup ของทั้งสอง hook
- setState ที่ได้สตริงเดิม Preact ข้ามการ render (ยืนยันด้วยเทสต์: scroll 50 ครั้ง render แค่ 1 ครั้ง)
- ไม่มีที่อื่นใช้ prop `info` ของ GradebookNav หรือ `useScrollInfo`/`fitsAll` ที่ import ไว้ใน Gradebook อีก (grep ทั้ง src และ test) · `tsc --noEmit` ผ่าน

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `git diff` / `git diff --stat` | 6 ไฟล์ +83/−16 อ่านครบ |
| `npx tsc --noEmit` | PASS (exit 0, ไม่มี error) |
| `npx vitest run test/unit/perf-p4-p2-p3.test.ts test/unit/perf-p3-scroll-flags.test.tsx` | PASS 8/8 |
| `npx vitest run` (ทั้งชุด) | PASS 98 ไฟล์ / 1154 เทสต์ (รวม `gradebook-columns-ui.test.tsx` ที่ตรวจ minimap/ปุ่มกระโดดผ่านทั้งหน้า และ `outbox-order`/`qa-m1-02-outbox` ที่ตรวจ pendingOps/failedPairKeys) |
| grep `useScrollInfo\|edgeClass\|info=` ใน src/test | ใช้เฉพาะใน GradebookNav · `edgeClass` ไม่มีคนเรียก (R-04) |
| grep ทุกจุดที่เขียน outbox/payload (`outboxAdd/outboxUpdate/moveFailedToOutbox`, `idb.ts`) | ไม่มีจุดไหนเขียน payload ใหม่โดยใช้ opId เดิม |

หมายเหตุ: PM สั่งให้เขียนได้แค่ไฟล์นี้ จึงบันทึกหลักฐานไว้ในตารางนี้ ไม่ได้รัน `evidence.mjs add` (ซึ่งต้องเขียน evidence.json ในโฟลเดอร์งาน) · โฟลเดอร์งานยังไม่มี brief.md

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ในโค้ด, commit, log หรือเอกสาร
- [x] ตรวจ input ฝั่ง server ทุกจุด — N/A: diff นี้แก้แค่ฝั่ง client ไม่แตะ worker
- [x] ตรวจสิทธิ์ทุก endpoint/การเข้าถึงข้อมูล — N/A ฝั่ง server · ฝั่ง client ห้องที่จำไว้ถูกตรวจกับ `viewClasses` ก่อนใช้ จึงไม่มีทางไปใช้ห้องของครูคนอื่น
- [x] ป้องกัน injection, XSS, CSRF — ไม่มี input ใหม่ที่ถูก render เป็น HTML
- [x] ข้อมูลส่วนบุคคลไม่ถูก log หรือส่งออกเกินจำเป็น — เก็บแค่ id ห้อง/วิชาในหน่วยความจำ ล้างตอน logout
- [x] error ไม่เปิดเผยรายละเอียดภายใน — ไม่เกี่ยว
- [x] dependency ใหม่น่าเชื่อถือ — ไม่มี dependency ใหม่

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] คะแนน: diff ไม่แตะการคำนวณหรือค่าคะแนน · ค่าที่แสดงในช่อง (`subOf`) ยังได้ค่าจาก op ล่าสุดเพราะ opId ไม่ซ้ำและ payload ไม่เปลี่ยน
- [x] ไม่นับซ้ำ / ไม่บันทึกซ้ำ — ลำดับการส่ง, held/failedPairs ใน `flushPass` ไม่ถูกแตะ · การตรวจ `waiting` ของปุ่มทำทั้งห้องยังอ่าน `pendingOps.value` สด
- [x] การเขียนหลายตารางอยู่ใน transaction — ไม่เปลี่ยน (`moveFailedToOutbox` เดิม)
- [x] ลบแล้วข้อมูลที่ผูกกันไม่ค้าง — ห้องที่ถูกลบ/ไม่อยู่ในเทอมถูกกรองด้วย `offered`
- [x] วันที่/timezone/พ.ศ. — ไม่เกี่ยว

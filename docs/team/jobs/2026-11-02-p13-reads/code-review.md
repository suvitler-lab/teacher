# Code review: P13 ลดแถวที่อ่านของหน้าแรก (dashboard) + หน้าเลือกงานของสแกนไม่รีเฟรช dashboard

โดย Code Reviewer · 2026-11-02 · ช่วง diff: ยังไม่ commit บน `team/2026-11-02-p13-reads` เทียบกับ HEAD `ca4f280` (`worker/routes/dashboard.ts`, `src/pages/Scan.tsx`, `test/api/volume.test.ts`) · รอบแก้ (Verify) 0/3 (รอบแรก)

ความรุนแรง: **ต้องแก้** = สูง · **ควรแก้** = กลาง · **เสนอ** = ต่ำ

โค้ดรอบข้างที่อ่านเพิ่ม: `worker/lib/roster.ts` (`loadTerm`, `memberClause`), `shared/metrics.ts` (`workState`, `assignmentProgress`), `src/lib/dashboard.ts`, `src/pages/Home.tsx` (ผู้ใช้ dashboard อีกที่), `migrations/0001_init.sql` (PK ของ submissions/students), `migrations/0006_school_year.sql`, `docs/team/jobs/2026-11-02-integrity-c02/{requirements,plan,qa-report}.md` (ที่มาของ `startSetupRefresh`, AC-13)

## สรุป: ผ่าน

ต้องแก้ 0 · ควรแก้ 0 · เสนอ 2 — ตัวเลขของหน้าแรกเหมือนเดิมทุกกรณี (พิสูจน์จากโครงสร้างโค้ด และยืนยันด้วยเทสต์เทียบกับคำสั่ง SQL ของ HEAD)

## ต้องแก้ก่อนปล่อย

ไม่มี

## ควรแก้

ไม่มี

## เสนอ (ต่ำ)

- **R-01 ตัวเลข "ส่งแล้ว x/y" บนหน้าเลือกงานของสแกนไม่อัปเดตเองแล้ว** · `src/pages/Scan.tsx:549` (ตัวเลขแสดงที่ `:592-594` และ `:605-606` ผ่าน `progressFor` `:555-557`)
  - สิ่งที่เปลี่ยน: ตอน C-02 เพิ่ม `loadDashboard` ไว้ในตัวรีเฟรชทุก 60 วิ (`integrity-c02/plan.md:101` "รีเฟรช bootstrap+dashboard") ตอนนี้เอาออก dashboard จึงโหลดแค่ตอน mount หรือตอนเปลี่ยนเทอม (`:548`)
  - สถานการณ์: เครื่อง A เปิดหน้าเลือกงานค้างไว้ ("ป.6/1 2/44") แล้วเครื่อง B สแกนอีก 15 คน → เครื่อง A ยังแสดง 2/44 จนกว่าจะออกแล้วกลับเข้าหน้านี้ใหม่ (สลับแท็บหรือกลับมาออนไลน์ก็ไม่อัปเดตแล้ว) · ถ้าสแกนในเครื่องตัวเองจะไม่เจอปัญหานี้ เพราะจบรอบแล้ว `ScanPage` mount `SessionSetup` ใหม่ (`:503-504`) จึงโหลด dashboard อีกครั้ง · กรณีย่อย: ถ้ามีงานใหม่จากเครื่องอื่นเข้ามาผ่าน bootstrap การ์ดงานนั้นจะไม่มีตัวเลข (`progressFor` คืน null → แสดง "") เพราะไม่ได้โหลด dashboard ใหม่
  - ทำไมเป็นแค่ "เสนอ": ข้อมูลไม่เสียหาย และไม่ใช้ตัวเลขนี้ตัดสินอะไร · AC-13 ของ C-02 ยังผ่าน เพราะ AC-13 ต้องการให้หน้าสแกนแสดง "เต็ม 20" ซึ่งมาจาก bootstrap ที่ยังรีเฟรชอยู่ (หน้าเลือกงานไม่แสดงคะแนนรายคน) · ก่อนมี C-02 ตัวเลขนี้ก็ไม่เคยรีเฟรชเอง · ไม่มีที่อื่นใช้การรีเฟรชนี้: `loadDashboard` ถูกเรียกแค่ที่ `Home.tsx:58,133` และ `Scan.tsx:548` · เทสต์ `c02-scan-setup-refresh.test.ts` ทดสอบ `startSetupRefresh` ด้วย reload ปลอม จึงไม่ได้พึ่ง dashboard
  - ถ้าอยากได้ตัวเลขสดในราคาถูก: รีเฟรช dashboard เฉพาะตอนกลับมาที่หน้า (`visibilitychange`/`online` ที่เว้นห่างตาม `RESUME_GAP_MS`) ไม่ต้องทุก 60 วิ หรือทำ endpoint นับเฉพาะงานที่เปิดอยู่แยกต่างหาก · ถ้าเจ้าของงานยอมรับได้ ให้จดเป็น known behaviour
- **R-02 คอมเมนต์ตัวเลขเก่า** · `src/pages/Scan.tsx:549` — คอมเมนต์บอกว่า dashboard "reads ~18,000 rows per call" แต่ diff นี้ทำให้เหลือ ~9,949 (งบใน `volume.test.ts:62` คือ 12,000) · แนะนำเขียนว่า "~10,000 rows at school size" หรืออ้างงบใน volume.test.ts แทนตัวเลขตายตัว

## ความเท่ากันของผลลัพธ์ (ข้อ 1) — พิสูจน์

**ข้อโต้แย้งหลักจากโครงสร้างโค้ด**: ใน route นี้มีที่อ่าน `subByAsg`/`subs` อยู่ 2 ที่ และทั้งสองที่ใช้ key เป็น `st.id` ของ `st` ใน `classStudents.get(classId)` เท่านั้น ได้แก่ `assignmentProgress(a, students, subs, date)` (`dashboard.ts:108` → `metrics.ts:83-84,94` วนตาม `students` ไม่ได้วนตาม map) และ `workState(subs.get(st.id), …)` (`:112-113`) · `classStudents` สร้างจาก `stuRes` (`:74-78`) ดังนั้นทุก key ที่ถูกอ่านเป็น id ที่อยู่ใน `stuRes`
- เดิม: query submissions ใช้ `JOIN students s … ${yearJoin} WHERE ${member.sql}` ซึ่งเป็นเงื่อนไขชุดเดียวกับ query `stuRes` บนแถว students เดียวกัน (alias `s` เหมือนกัน, `yearJoin` และ bind เหมือนกัน, `memberClause` อ้างแค่คอลัมน์ของ `s`) และ `students.id` เป็น PK ส่วน `classes.id` ก็เป็น PK → สำหรับนักเรียน st ที่อยู่ใน `stuRes` แถว submission (a, st) จะผ่าน JOIN ได้ก็ต่อเมื่อมีอยู่ใน submissions และได้แค่ 1 แถว
- ใหม่: อ่านทุกแถวของ a แล้วกรองด้วย `inTerm` (`:87-89`) → สำหรับ st ใน `stuRes` ได้แถวเดียวกัน · แถวที่ถูกตัดออกหรือถูกเก็บไว้เกินมาเป็นของ id ที่ไม่มีวันถูกอ่าน
- ข้อสังเกต: เมื่อดูแค่ผลลัพธ์ บรรทัดกรอง `:89` จึง**ไม่จำเป็น** (ไม่มีก็ได้ตัวเลขเท่าเดิม) ช่วยแค่ลดขนาด Map — มีไว้ก็ไม่เสียหาย

| กรณี | เดิม (HEAD) | ใหม่ | เท่ากันไหม |
|---|---|---|---|
| moved/inactive ที่ `left_at` < วันจบเทอม, = วันจบเทอม (`>` แบบเคร่ง), `left_at` NULL | JOIN ตัดออก และไม่อยู่ใน `stuRes` | ไม่อยู่ใน `inTerm` และไม่มีใครอ่าน | เท่ากัน |
| moved/inactive ที่ `left_at` > วันจบเทอม · finished | อยู่ในทั้งสองชุด | อยู่ใน `stuRes` → ได้แถวเดียวกัน | เท่ากัน |
| เทอมไม่มี `end_date` / ไม่ระบุเทอม / `unassigned` (`term` = null → `status='active'` ไม่มี yearJoin) | เงื่อนไขเดียวกันทั้งสอง query | เหมือนกัน | เท่ากัน |
| ห้องแบบเก่าที่ `year` NULL | `cl.year IS NULL OR cl.year = ?` ทั้งสอง query | เหมือนกัน | เท่ากัน |
| ห้องของเทอมปีก่อน / ห้องของปีอื่นที่ผูกกับงาน | yearJoin ตัดนักเรียนปีอื่นออกทั้งสอง query | เหมือนกัน | เท่ากัน |
| นักเรียนที่ไม่มีห้อง (`class_id` NULL) | มีเทอม: JOIN classes ไม่ผ่าน (ตัดออกทั้งคู่) · ไม่มีเทอม: อยู่ใน `stuRes` แต่ถูกข้ามที่ `:76` | เหมือนกัน · ไม่อยู่ใน `classStudents` จึงไม่มีใครอ่าน | เท่ากัน |
| submission ที่แถว student ถูกลบหรือไม่มี | inner JOIN ตัดออก | id ไม่อยู่ใน `inTerm` → ตัดออก (และไม่มีใครอ่านอยู่แล้ว) · FK `submissions.student_id → students(id)` บังคับอยู่ในเทสต์ จึงสร้างกรณีนี้ใน DB จริงไม่ได้ | เท่ากัน |
| แถว submission ซ้ำ (a, st) | ไม่เกิด: PK `(assignment_id, student_id)` (`0001_init.sql:176`) → ลำดับแถวที่ต่างกันระหว่าง plan เดิมกับใหม่จึงไม่มีผลต่อ "แถวสุดท้ายชนะ" ใน `Map.set` | — | เท่ากัน |
| นักเรียนซ้ำ | `students.id` PK · `classes.id` PK → JOIN ได้ไม่เกิน 1 แถว | — | เท่ากัน |
| `s.class_id` ที่ query เดิม select มาด้วย | ไม่ถูกใช้ที่ไหนเลยใน HEAD (`git show HEAD:worker/routes/dashboard.ts \| grep class_id`: ลูป submissions ใช้แค่ `assignment_id, student_id, status, score, late`) · ห้องของนักเรียนมาจาก `stuRes.class_id` เสมอ | ไม่ select แล้ว | ไม่มีผล |
| อ่านพร้อมกันกับการแก้ข้อมูล | เดิมเงื่อนไขสมาชิกถูกประเมิน 2 ครั้งใน 2 statement แยกกัน (ไม่ได้อยู่ใน snapshot เดียว) | ใหม่ประเมินครั้งเดียว | ใหม่สม่ำเสมอกว่า ไม่แย่ลง |

ผลที่ตามมา: `perClass` (total/submitted/scored/awaiting/late/missing/excused), `awaitingCount`, `missingCount`, `followUp` (ลำดับการใส่ใน `followMiss` วนตาม assignments → links → students เหมือนเดิมทุกตัว การ sort จึงได้ผลเหมือนเดิม), การเลือกเข้า `gradingAssignments` (`:126`) — เท่ากันทั้งหมด

**ยืนยันด้วยเทสต์ใหม่** `test/api/p13-dashboard-equivalence.test.ts` (1 เทสต์): ใส่ข้อมูลครบทุกขอบในตารางด้านบน (moved ก่อน/ตรง/หลังวันจบเทอม, inactive ไม่มีวันที่, finished, ห้อง year NULL, ห้องปี 2568 ที่ archive แล้ว, นักเรียนไม่มีห้อง, submission แบบ scored/awaiting/excused/late/void/ไม่มีแถว, งาน open-overdue / closed / งานของเทอมปีก่อน) แล้วเทียบผลของ route ใหม่กับผลที่คำนวณจาก **คำสั่ง SQL ของ HEAD ทั้งคำสั่ง** + ลูปเดิม ใน 5 มุมมอง: `t1` (มี end_date), `t1` (ไม่มี end_date), `t0` (เทอมปีก่อน), ไม่ระบุเทอม, `unassigned` → `toEqual` ทั้งหมด และมีการตรวจว่าเทสต์ไม่ได้ผ่านเพราะข้อมูลว่าง (c1 ใน t1 = 4 คน, มี missing และ awaiting มากกว่า 0)

ประสิทธิภาพ: แถว submissions ของนักเรียนนอกเทอมยังถูกส่งมาที่ worker (เดิมก็ต้องอ่านแถวเหล่านี้ก่อน JOIN อยู่แล้ว) → แถวที่อ่านไม่เพิ่ม ส่วนที่ลดลงคือการ lookup ไปที่ students/classes ทีละแถว · ตัวเลข 18,272 → 9,949 มาจากคำบอกของ PM ส่วนผมยืนยันแค่ว่าผ่านงบใหม่ 12,000 (เหลือเผื่อประมาณ 17%)

## ข้อ 2 — Scan.tsx

- `startSetupRefresh(() => loadBootstrap())` — `loadBootstrap` คืน Promise จึงเข้ากับ signature `() => Promise<unknown>` ได้ · ตัวกัน `busy`/`last`/`.catch` เหมือนเดิม
- วงแหวนหรือตัวเลขความคืบหน้าบนหน้าเลือกงานอ่าน `dashboard.value` → อาจค้างได้ตาม R-01 (ระดับต่ำ) · ส่วนชื่องาน/เต็ม/สถานะ open/ห้อง มาจาก bootstrap ซึ่งยังรีเฟรชอยู่ → AC-13 ยังผ่าน
- ระหว่างสแกน (`ScanView`) ใช้ `loadSubs` และ POLL ของรอบสแกนเอง ไม่ได้พึ่ง dashboard · หน้าแรก (`Home.tsx:58`) โหลดเองตอน mount และตอนเปลี่ยนเทอม

## หลักฐาน

| คำสั่ง | ผล |
|---|---|
| `git diff worker/routes/dashboard.ts src/pages/Scan.tsx test/api/volume.test.ts` | 3 ไฟล์ อ่านครบ |
| `git show HEAD:worker/routes/dashboard.ts` (+ grep `class_id`) | `s.class_id` ของ query เดิมไม่ถูกใช้ |
| `npx vitest run` dashboard.test, school-year.test, volume.test, c03-bulk-date, late-flag, m1-05-metrics, qa-m1-02, qa-m1-04, qa-m1-05 (ทุกไฟล์ใน test/api ที่เรียก `/api/dashboard`) + unit term-and-dashboard, c02-scan-setup-refresh | PASS 11 ไฟล์ / 171 เทสต์ (รวม volume ที่งบอ่าน ≤ 12,000) |
| `npx vitest run test/api/p13-dashboard-equivalence.test.ts` (ไฟล์ใหม่ที่ PM อนุญาต) | PASS 1/1 |
| `npx tsc --noEmit` | PASS (exit 0) |
| grep `loadDashboard\|dashboard.value\|startSetupRefresh` ใน src/test | ผู้ใช้มีแค่ Home.tsx, Scan.tsx และเทสต์ 2 ไฟล์ |

หมายเหตุ: ไม่ได้รัน `evidence.mjs add` เพราะ PM สั่งให้เขียนได้แค่ไฟล์นี้ (กับไฟล์เทสต์ใหม่ 1 ไฟล์)

## เช็กลิสต์ความปลอดภัย

- [x] ไม่มี secrets ใน diff
- [x] ตรวจสิทธิ์ — route ยังอยู่หลัง `requireAuth` (`dashboard.ts:11`) ไม่เปลี่ยน
- [x] injection — SQL ใหม่ใช้ bind `?1` กับ `json_each` ไม่มีการต่อสตริงจาก input · `member.sql`/`yearJoin` ถูกเอาออกจาก query นี้
- [x] ข้อมูลข้ามเทอม/ปีไม่รั่ว — แถวของนักเรียนนอกเทอมถูกกรองก่อนเข้า Map และไม่มีใน payload (payload มีแค่ตัวเลขรวมกับ `followUp` ที่มาจาก `classStudents`)
- [x] error ไม่เปิดเผยรายละเอียดภายใน — ไม่เปลี่ยน
- [x] dependency ใหม่ — ไม่มี

## ความถูกต้องของข้อมูล (ธง 💰 🗑 🔄)

- [x] นับซ้ำ — ไม่เกิด (PK ของ submissions และ students)
- [x] ข้อมูลที่ผูกกันค้างหลังลบ — submission ที่ไม่มีนักเรียนแล้วไม่ถูกนับ (เหมือนเดิม)
- [x] timezone/พ.ศ. — การเทียบ `left_at > end_date` ยังทำใน SQL ของ `stuRes` ด้วยค่าเดียวกัน ไม่ได้ย้ายมาทำใน JS
- [x] transaction/race — เป็นการอ่านอย่างเดียว และสม่ำเสมอกว่าเดิม (ประเมินเงื่อนไขสมาชิกครั้งเดียว)
- [x] เงิน/ปัดเศษ — ไม่เกี่ยว (การปัดเศษยังอยู่ใน `shared/metrics` ที่เดิม)

# วิเคราะห์ความช้าในการเปลี่ยนหน้า (nav-speed)

ขอบเขต: อ่านโค้ด + ขนาด build เท่านั้น ไม่แก้ src/worker/shared/test ไม่เปิดเบราว์เซอร์ ไม่รันเซิร์ฟเวอร์
**ข้อจำกัด:** ไม่มีตัวเลขเวลา (ms) ที่วัดจริง ตัวเลขที่ได้คือขนาดไฟล์และจำนวน query/round trip จากโค้ด สัดส่วน "client render vs รอ network" ใน ~1 วินาทีของ PM ยังต้องยืนยันด้วย profile (ดูหัวข้อสุดท้าย)

## สรุปหนึ่งย่อหน้า
Router guard ใหม่ **ไม่ใช่สาเหตุ** (ทำงานเฉพาะตอนมีของค้าง) และ bundle แบบโหลดครั้งเดียวทุกหน้า (ไม่ code-split) ก็ **ไม่ทำให้สลับหน้าช้า** (กลับช่วยให้เร็ว) สาเหตุหลักคือ (1) ทุกหน้า fetch ข้อมูลใหม่ทุกครั้งที่เข้า ไม่มี cache ข้ามหน้า และ 3 หน้า (Gradebook/Reports/Attendance) แสดงเนื้อหาไม่ได้จนกว่า fetch เสร็จ แต่ละ fetch = 3 round trip D1 ต่อกัน (2) Gradebook วาดตาราง 44x23 เซลล์ซ้ำ 2-3 รอบตอน mount โดยไม่มี memo (3) PageCols วาดการ์ดสองรอบตอน mount (4) หน้าเดียวกันขอ endpoint หนักซ้ำกัน (Students กับ Reports ขอ /api/reports/summary เดียวกัน, Scan ขอ /api/dashboard ซ้ำกับ Home)

## ตัวเลขที่วัดได้ (ไม่ใช้เบราว์เซอร์)
dist/client/client/assets (ถูก rebuild โดยกระบวนการอื่นระหว่างที่ผมทำงาน แฮชเปลี่ยน ผมไม่ได้รัน build เอง ขนาดข้างล่างอ่านจาก dist ปัจจุบัน):

| ไฟล์ | raw | gzip |
|---|---|---|
| index-*.js (ทั้งแอป 8 หน้า eager) | 555,119 B | 156,970 B |
| index-*.css | 337,718 B | 61,638 B |
| exceljs.min (lazy, เฉพาะ export) | 940,065 B | 268,935 B |
| pure-*.js | 43,154 B | 15,188 B |
| StartTermModal / camera / excel (lazy) | 8.4k / 8.7k / 5.1k | ~3k แต่ละไฟล์ |
| tabler-icons.woff2 | 504,296 B | - |
| zxing_reader.wasm | 939,194 B | - |

- CSS 337 kB เป็น tabler-icons.min.css ถึง 212,469 B (5,229 กฎ `.ti-*`) ส่วน CSS ของแอปเอง 170 kB (src/styles) font tabler 504 kB สำหรับไอคอนที่ใช้ไม่กี่สิบตัว เป็นต้นทุนโหลดครั้งแรก/ติดตั้ง ไม่ใช่ต้นทุนต่อการสลับหน้า
- Service worker precache 24 ไฟล์ ~3.4 MB (public/sw.js) ทำตอนติดตั้งเท่านั้น การเปลี่ยน hash ในแอปไม่ผ่าน SW fetch เลย ไม่กระทบ `/api/*` (SW ปล่อยผ่าน แต่ถ้า SW หลับ การ fetch API ครั้งแรกอาจรอ SW ตื่น ผลเล็ก)
- จำนวน D1 round trip ต่อ request (นับจากโค้ด; preamble worker/app.ts:67-95 = 1 RTT ทุก request):
  - /api/dashboard 3 RTT (10 query) dashboard.ts:33, :60
  - /api/reports/summary 3 RTT (~9 query) reports.ts:38, :78
  - /api/gradebook 3 RTT (~6 query) gradebook.ts:33, :51
  - /api/attendance 3 RTT เรียง query ต่อกัน attendance.ts:53 แล้ว :59
  - /api/attendance/days 3 RTT เรียง query ต่อกัน attendance.ts:80 แล้ว :96
  - /api/bootstrap 2 RTT (10 query ขนาน)
  - ไม่พบ N+1 ฝั่ง worker; index ครอบคลุมพอ (submissions PK(assignment_id,student_id), idx_attendance_sessions_uniq(date,...)) ฝั่ง Worker รวบเหลือ 2 รอบแล้ว
  - ถ้า RTT ของ D1 = r ms เวลารอ fetch ≈ 3r + payload (fixture-server มี `setDbLatency` ใช้จำลอง ~200 ms)

## สาเหตุเรียงตามผลกระทบโดยประมาณ

### 1. ไม่มี cache ข้ามหน้า + ต้องรอ fetch ก่อนแสดงเนื้อหา (ผลสูงสุด)
- `src/lib/api.ts:25-31` ทุก GET เป็น `cache: "no-store"` และทุกหน้าเรียก fetch ใหม่ตอน mount
- Gradebook: `Gradebook.tsx:165-168` ตั้ง loading แล้วล้าง assignments/subs/roster ทุกครั้ง; `:797` แสดง "กำลังโหลด…" จนกว่า `/api/gradebook` มา ทั้งที่ assignments และ students ทั้งหมดอยู่ใน store จาก bootstrap แล้ว (`store.ts:36`, `:33`) มีแต่ submissions ที่ต้อง fetch
- Reports: `Reports.tsx:63` ล้าง payload/model ทุกครั้ง, `:199` spinner จน `/api/reports/summary` มา; ยังมี interval 60 วินาที `:85-91`
- Attendance: `Attendance.tsx:170-188` ตั้ง `loaded=false` (แตะไม่ได้) จน `/api/attendance` ตอบ (รอสูงสุด SLOW_MS=2500) + `loadWeek` `:223-231` อีกหนึ่ง request
- Random: `Random.tsx:71-93` `loadPresent` ทุกครั้งที่เข้า
- Students: `Students.tsx:87-104` เรียก `/api/reports/summary` (endpoint เดียวกับ Reports, ส่ง submissions+attendance ทั้งเทอมของห้อง) ทุกครั้ง ไม่แชร์กับ Reports; รายชื่อวาดจาก store ได้ทันที (ดี) แต่สถิติโหลดตาม
- Home: `lib/dashboard.ts:19-52` เก็บ `dashboard` ใน signal จึงเข้าซ้ำแล้วเห็นของเดิมทันที (ดี) แต่ยัง refetch ทุกครั้ง; เข้าครั้งแรกเห็น skeleton (`Home.tsx:132`)
- Scan: `Scan.tsx:749` โหลด `/api/dashboard` ทั้งก้อนอีกครั้ง (comment ที่ :750 เองบอกว่าอ่าน ~10,000 แถวต่อครั้งในโรงเรียนจริง) + `:771` `/api/assignments/:id/submissions` + ตั้ง poll bootstrap ทุก 60 วินาที `:587,:750` (applyBootstrap เขียนทับ signal ทุกตัว ทำให้ทุกหน้าที่เปิดอยู่ re-render)

### 2. Gradebook mount วาดตารางทั้งตารางซ้ำ 2-3 รอบ และคำนวณซ้ำเยอะ
- ไม่มี memo: ทุก render เรียก `stateOf/subOf` ราว 10-12k ครั้งสำหรับ 44x23 (`:468` tot, `:846` หัวคอลัมน์, `:883-884` ผลรวมต่อแถว, `:914` และ `:926` ต่อเซลล์ (2 ครั้ง/เซลล์), `:940-941` แถวเฉลี่ย (2 รอบ), `:234` missingByStudent, ยังมี GradebookBottom) แต่ละครั้งสร้างสตริงคีย์ (`pairKey`, template)
- เซลล์ละ ~12 prop + handler + aria-label ยาว (`:917-920`) ~1,012 td
- ซ้ำหลายรอบตอน mount: (ก) หลัง fetch เสร็จ (ข) `useScrollFlags` ตั้ง state "000" -> ค่าจริง (`GradebookNav.tsx:41-58`, เรียกที่ `Gradebook.tsx:497`) -> render ใหม่ทั้งหน้า (ค) effect `fit` (`:500-526`, dep `flagsFit(scrollFlags)`) อ่าน layout บังคับ reflow แล้วตั้ง `maxHeight` -> ResizeObserver -> วัดอีก ทุกการโฟกัสเซลล์ก็ render ทั้งตาราง (`:587-594` setFocusIn) ซึ่งกระทบความรู้สึกช้าตอนใช้งาน
- ประมาณการ: เครื่องเดสก์ท็อปหลักสิบถึงร้อยกว่า ms ต่อรอบ แท็บเล็ตคูณ 3-4 (ยังไม่ได้วัด)
- CSS `td.cell:has(.cell-more)` (grade.css:186) ทำให้ style invalidation กว้างเมื่อโฟกัสเซลล์ (เล็ก)

### 3. PageCols วาดการ์ดสองรอบ
- `PageCols.tsx:35-39` รอบแรก `rem=0` -> 1 คอลัมน์ แล้ว effect วัดความกว้าง (`:11-21`) -> `setRem` -> แบ่งเป็นหลายคอลัมน์; การ์ดย้ายพาเรนต์ = unmount/mount ใหม่ทั้งหมด ใช้ใน Home (สูงสุด 9 การ์ด), Reports, Students และอื่น ๆ

### 4. endpoint หนักซ้ำกันข้ามหน้า
- Students และ Reports ใช้ `/api/reports/summary` เดียวกัน (3 RTT, submissions + attendance ทั้งเทอม) เข้าสลับ Students/Reports = ดึงซ้ำ
- Home และ Scan ใช้ `/api/dashboard` เดียวกัน

### 5. ต่ำ / ไม่ใช่สาเหตุ
- Router guard (`router.ts:23-37`): ไม่ await อะไร ตั้งเฉพาะเมื่อ Gradebook มีคะแนนที่บันทึกลงเครื่องไม่ได้ (`Gradebook.tsx:334`) หรือ Settings มีค่าที่แก้ยังไม่บันทึก (`Settings.tsx:171`) ไม่ใช่ต้นเหตุ
- Bundle ไม่ code-split (`app.tsx:11-21` import ทุกหน้า eager): เป็นต้นทุนโหลดแรก (parse 555 kB) ไม่ใช่ต่อการสลับหน้า การแตกเป็น lazy chunk จะ **เพิ่ม** ความหน่วงตอนสลับหน้า และ sw.js เองระบุว่าอัปเดตขณะเปิดหน้าอยู่จะทำ lazy chunk พัง ไม่แนะนำ
- Font/CSS tabler (ข้างบน): โหลดครั้งแรกเท่านั้น
- Service worker: ไม่แตะ `/api`, hash route ไม่ผ่าน SW
- IndexedDB: เปิดการเชื่อมต่อเดียว (idb.ts:70-84) แต่ `kvSet("bootstrap")` เขียนก้อนใหญ่ทุกครั้งที่ loadBootstrap และ `kvUpdate` ทุกครั้งที่แก้งาน (clone ทั้งก้อน) เล็กน้อย
- `computeReport` (report.ts:50) เป็น O(นักเรียน x งาน) ไม่หนัก
- ไม่มี animation/ view-transition ตอนเปลี่ยนหน้า

## ข้อเสนอแก้ (เรียงตามคุ้มค่า/แรงงาน)

| # | แก้อะไร | คาดว่าได้ | ความเสี่ยง | ทำก่อนส่งลูกค้า? |
|---|---|---|---|---|
| A | ฝั่ง Worker: `/api/attendance/days` ใช้ `Promise.all` สอง query (attendance.ts:80,96) และ `/api/attendance` รวมเป็น query เดียว/ batch (:53,:59) | ลด 1 RTT (3 -> 2) ต่อ request ของ Attendance 2 ตัว | ต่ำ (ผลลัพธ์เท่าเดิม มีเทสต์ api) | ใช่ |
| B | PageCols: เริ่ม `rem` จากค่าที่วัดไว้ครั้งก่อน (ตัวแปรโมดูล) หรือ `window.innerWidth` แทน 0 เพื่อไม่ mount สองรอบ | ลดงาน mount ของ Home/Reports/Students ราวครึ่ง | ต่ำ (เสี่ยง layout กระโดดบนมือถือ ต้องดูภาพ) | ใช่ หลังตรวจภาพทุกอุปกรณ์ |
| C | Gradebook: คำนวณเมทริกซ์ state/sub ครั้งเดียวต่อ render (useMemo ตาม subs/pend/failed/unsaved/assignments/students) แล้วให้ cell/header/avg/summary อ่านจากเมทริกซ์; เริ่ม `scrollFlags` ให้ไม่ trigger render ที่สอง (เปรียบเทียบก่อน set) | ลดงานคำนวณ ~10k เหลือ ~1k ต่อ render; ลดจำนวนรอบ render ตอน mount | กลาง (ไฟล์ใหญ่ มีเทสต์ gradebook-* หลายตัว ต้องรันชุดเต็ม) | ทำได้ถ้ามีเวลาทดสอบ; ถ้าไม่ ทำเฉพาะส่วน flags |
| D | Stale-while-revalidate cache ระดับโมดูลสำหรับข้อมูลอ่านอย่างเดียว: คีย์ (endpoint+class+term+filters) เก็บ payload ล่าสุด แสดงทันทีแล้ว revalidate เงียบ ๆ เริ่มที่ `/api/reports/summary` (แชร์ Students+Reports), `/api/attendance/days`, `/api/dashboard` (ข้าม refetch ถ้าใหม่กว่า ~30 วินาที โดยเฉพาะ Scan) | เข้าหน้าซ้ำเห็นเนื้อหาทันที (ตัด 3 RTT + payload ออกจากเส้นทางที่ผู้ใช้เห็น) น่าจะเป็นตัวเดียวที่ลด "ความรู้สึกช้า" ได้มากที่สุด | กลาง: ข้อมูลเก่าชั่วครู่ ต้อง invalidate เมื่อ outbox ส่งสำเร็จ/เปลี่ยน term/ตัวเลข epoch (`dataEpoch`) และห้ามใช้ข้ามผู้ใช้/ล็อกเอาต์ | Reports/Students-stats/dashboard: ทำได้ (อ่านอย่างเดียว) หลังมีเทสต์; Gradebook/Attendance (เขียนได้) ควรรอหลังส่งมอบ |
| E | Gradebook เริ่มวางคอลัมน์จาก store (assignments ของห้อง/เทอม/วิชา) ทันที โดยช่อง submissions ว่างพร้อม skeleton จนข้อมูลมา แทนที่จะแสดง "กำลังโหลด…" ทั้งหน้า | เห็นโครงตารางตั้งแต่ ms แรก | กลาง (ต้องกรองให้ตรงกับ query ฝั่ง server: term/subject/type/month) | หลังส่งมอบ |
| F | Scan: ไม่เรียก `/api/dashboard` ซ้ำถ้า Home เพิ่งโหลด (< ~60 วินาที) และเลื่อน poll bootstrap ไม่ให้ยิงทันทีตอน resume | ลด 1 request หนักต่อการเข้า Scan | ต่ำ | ใช่ |
| G | ลดไอคอน tabler (subset font + CSS เฉพาะ icon ที่ใช้) และแยก exceljs/zxing ออกจาก precache บังคับ | ลดโหลดครั้งแรก/ติดตั้ง (CSS 337 -> ~130 kB, font 504 kB -> ไม่กี่สิบ kB) | กลาง (ต้องสแกนชื่อ icon แบบ dynamic `ti-${name}`) | ไม่ใช่เรื่องสลับหน้า รอหลังส่งมอบ |

ลำดับที่แนะนำ: A + F + B (ปลอดภัย ทำก่อนส่ง) -> D เฉพาะ read-only -> C -> E -> G
สิ่งที่ **ไม่ควรทำ**: แตก chunk ต่อหน้า, เพิ่ม lazy load, แก้ router guard

## ข้อควรยืนยันก่อนลงมือ (วัดจริง ใช้เวลาไม่นาน)
1. เปิด Performance trace เทียบ 2 กรณีบน fixture: (ก) latency 0 ดูว่า ~1 วินาทีเป็น scripting/layout ของ Gradebook หรือรอ fetch (ข) `setDbLatency(100-200)` ดูว่าเวลาเพิ่มตาม 3 x r ตามที่คาดหรือไม่
2. อ่าน `apiLog` ของ fixture-server (ms และ db round trip ต่อ call) หรือ header `Server-Timing: app;dur=` ของแต่ละ endpoint เพื่อแยก server กับ client
3. วัดแยกรายหน้า: คาดว่า Gradebook และ Reports ช้าสุด; Students/Settings/Random/Home(เข้าซ้ำ) ควรเร็วเพราะวาดจาก store ถ้ายังช้าแปลว่ามีสาเหตุอื่นที่ผมยังไม่เจอ (ยังไม่ได้ไล่อ่าน ReportParts.tsx, StudentDrawer, components/home/States ฯลฯ ลึก)

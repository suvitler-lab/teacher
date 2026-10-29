# แผนพัฒนาและส่งมอบงานครบให้คุณครู

23 ตุลาคม 2569 · แผนจาก current working tree `1141caf` + local edits · **ยังไม่ได้ลงมือแก้ application**

## เป้าหมายและหลักการ

ให้ครูหนึ่งคนใช้ iPad คอมพิวเตอร์ และมือถือทดลองหนึ่งห้องได้ โดยคะแนน/เช็คชื่อไม่หาย ไม่ซ้ำ รายงานตรงกับต้นฉบับ และครูทราบวิธีรับมือเน็ตหลุดและกู้คืน ใช้ Preact/Hono/Workers/D1 และ design tokens เดิม

ลำดับ: **ป้องกันข้อมูลผิด → ทำ flow ให้จบได้ → ตรวจอุปกรณ์จริง → ทดลองหนึ่งห้อง → ขยาย** ไม่เพิ่ม multi-teacher/parent portal หรือเปลี่ยน stack ในรอบนี้ ไม่กำหนดวันส่งมอบจากการคาดเดา; ประเมินกำลังคนหลังปิด reproductions และจัดการ dependency compatibility

## 1. เตรียมฐานงานและ contract

**เจ้าของ: Tech Lead/PM**

1. อ่าน brief/context/verification, เทียบ SHA-256 กับ code-state.json และตรวจ git diff ใหม่ แยกงานเดิมที่ยังไม่ commit ก่อนสร้าง change set; ห้าม reset หรือใช้ git add ทั้งหมดโดยไม่ตรวจ
2. แปลง experiment ใน evidence/reproduce.cjs เป็น regression tests ใน Vitest เดิม แยก case ตาม domain ไม่เพิ่ม test runner ใหม่; tests ต้องล้มด้วยผลผิดที่พบก่อนเริ่มแก้ และผ่านหลังแก้
3. ตรวจข้อมูลซ้ำแบบ read-only ในฐานที่จะนำไปทดสอบ: teacher >1, duplicate year/term, scores เกินเต็ม, roster links ผิด ถ้าพบให้หยุดขั้น release และทำรายการ ID สำหรับแก้เฉพาะกรณี ไม่รวม/ลบ records อัตโนมัติ
4. ให้ Tech Lead ถือ `package.json`, lockfile, API error contract และ shared types เพียงคนเดียว; Backend ถือ routes/guards, DB review ถือ integrity rules, Frontend ถือ UI/API client; QA ถือ tests ที่รับมอบหมาย PM ถือ board/report

### Contract ที่เปลี่ยนในรอบ hardening

| Interface | พฤติกรรมที่กำหนด |
|---|---|
| Student import preview | เพิ่ม `blockedMoves` รายการ `{studentId, code, fromClassId, toClassId, reason}` สำหรับ cross-year หรือเด็กที่มีประวัติ; reason เป็น `cross_year` หรือ `has_history` |
| Import/แก้รายคน | ส่ง `409 history_move_blocked` ก่อนเขียนเมื่อเข้าข่ายเดียวกับ preview; reimport/แก้ข้อมูลในห้องเดิมยังทำงานได้ |
| Restore execute | ส่ง `422 invalid_backup` และ issues `{table, rowId, field, code}` ที่ตรวจพบ; ไม่ส่งชื่อเด็ก/ค่าอ่อนไหวลง error log; ห้ามตอบ success บางตาราง |
| Settings | stale request คืน `409 epoch_changed` แบบ routes อื่น รวม audit ไว้ใน transaction เดียวกัน |
| Term create/update | คู่ year/term ชนคืน `409 term_exists`; ผู้แพ้ setup race คืน `403 already_setup` ตาม contract เดิม |
| Client API helper | เพิ่ม optional `{timeoutMs, signal}` โดยคงรูปแบบการเรียกเดิมได้; network timeout เป็น ApiError status 0/code timeout; AbortController ยกเลิก fetch และ caller guard กันคำตอบเก่าทับ state |

ไม่เพิ่ม migration สำหรับรอบแรก: ใช้ atomic SQL/transaction guards กับ schema เดิม หากในอนาคตเพิ่ม enrollment จะเป็นงาน schema/backup compatibility แยก พร้อมแผนย้ายข้อมูลและ review ก่อนเริ่ม

## 2. แก้ก่อนทดลองจริง

| Task | Owner / Files | วิธีทำและ AC เฉพาะงาน | Dependencies |
|---|---|---|---|
| T01 รักษาประวัติ (F01) | Backend + DB review; students routes, Students UI, import tests | ตรวจชั้น/ปีและประวัติ submissions/attendance ก่อน preview และตรวจซ้ำใน write transaction ทั้ง import และ edit รายคน; block move ตาม contract ไม่เปลี่ยน code ไม่ clone history; รายงานเก่าและ Excel ต้องคงเดิม | contract |
| T02 Validate restore (F02) | Backend/DB; backup route, backup parsing, RestoreModal | ตรวจ types/enums/finite score/date/counts ต่อ row ก่อน stage; commit ตรวจ 0≤score≤full_score, uniqueness ปี/เทอมและเลขที่ใช้งาน, valid references ตาม business rules บน staging ภายใน transaction ก่อน swap; normalize เฉพาะ legacy fields ที่รองรับอยู่ ไม่แก้คะแนนเงียบ ๆ | rules จาก T01 |
| T03 Epoch consistency (F03) | Backend; catalog/guard และ scan-session paths ที่เกี่ยวข้อง | settings ใช้ batchAtEpoch รวม audit; inventory writes ที่อาจวิ่งข้าม restore และเพิ่ม guard ให้ข้อมูลซึ่งอยู่ใน snapshot; replay request หลัง restore ต้องปฏิเสธ | regression harness |
| T04 Setup/term concurrency (F07,F08) | Backend; auth/catalog tests | setup ใช้ atomic guarded insert สำเร็จได้หนึ่งครั้ง ตรวจ changes/returning ก่อนสร้าง session; term guard คู่ปี/เทอมใน transaction ทั้ง create/update/start; existing duplicates ต้องรายงานก่อน ไม่ autodelete | integrity precheck |
| T05 Deadlines/offline (F04) | Frontend; api/app/store/outbox/attSync/RestoreModal | GET/boot 8s, write ปกติ 15s, restore chunk 30s, restore commit 60s; clear timer และผูก signal ทุก path; GET fallback cache+retry; outbox/attendance retry opId เดิม; mutation ที่ไม่มี idempotency ไม่ retry อัตโนมัติ ให้ reload ตรวจผลก่อนทำซ้ำ; restore timeout ใช้ status?id เดิมจนรู้ผล | error contract |
| T06 First use/empty states (F05,F06) | Frontend; StartTermModal, page load states | require sure เฉพาะ rollover ที่มี current term; ไม่มีห้อง/เทอมแสดง empty state + CTA ไป onboarding/catalog; ไม่ยิง request ที่ไม่มี class; สลับปี/ห้องไม่ทิ้งข้อมูลเก่าค้างหน้าจอ | T04 errors |
| T07 Keyboard/dialog/UI language (F09) | Frontend + UX/QA | ใช้ modal primitive ร่วมที่ focus เข้า/วนอยู่ใน modal/คืน focus และ Escape; destructive/กำลัง commit ปิดตาม state ที่ปลอดภัย; แถวนักเรียนมี button ที่เข้าถึงได้; labels ของ search/filter/score มีชื่อจริง; tooltip ไม่ใช่ทางเดียวในการอ่านชื่อเต็ม | T06 |
| T08 Dependencies/runbook (F10,F11) | Tech Lead + DevOps/Writer | patch Hono≥4.13.11, Vite6≥6.4.4, Vitest4≥4.1.12 ภายในช่วงที่เข้ากันได้; ตรวจ Cloudflare plugin/pool/Wrangler เป็นชุดจาก peer constraints ก่อนเลือก exact lock versions; ไม่ force/downgrade ตาม audit โดยอัตโนมัติ; อัปเดตชื่อ DB/schema/restore commands ทุกเอกสารและเพิ่ม deployment manifest | baseline + triage |

T01–T04 ทำตาม owner ของ Backend เป็นลำดับหรือแบ่งไฟล์ชัดเจน; T05–T07 ทำขนานกับ Backend ได้หลัง lock contract. T08 มีผู้แก้ manifest/lockfile คนเดียวและต้องรวมก่อน QA รอบ candidate เพื่อไม่ทดสอบคนละ dependency state

### รายละเอียดที่ต้องรักษาในการแก้

- Timeout ยกเลิกการรอของ browser ไม่รับประกันว่าเซิร์ฟเวอร์ไม่ได้ commit; ห้ามล้าง local queue/draft หรือแสดง “ข้อมูลไม่เปลี่ยน” เมื่อยังไม่รู้ผล
- บั๊กที่ history หายจาก payload ห้ามแก้ด้วยการนำทุก students ของระบบมาปนในรายงาน ต้องรักษาขอบเขตปี/ห้องเดิม
- Restore ที่ถูกปฏิเสธต้องเก็บข้อมูลปัจจุบันครบ ไม่ increment epoch และไม่เขียน audit ว่าสำเร็จ; ใช้ valid legacy backups ใน tests ป้องกัน hardening ทำให้ไฟล์เก่าที่ถูกต้องกู้ไม่ได้
- UI ใช้คำสี่สถานะเดียวกัน: “บันทึกในเครื่อง”, “รอส่ง”, “บันทึกแล้ว”, “ต้องตรวจสอบ”; ไม่ให้สี/เสียงเป็นหลักฐานเดียว
- เป้าหมายภายในของปุ่มแตะสำคัญ ≥44×44 CSS px; รายการข้อมูลยาวเลื่อนได้ภายในส่วนตาราง แต่ CTA หลักและเนื้อหาทั่วไปต้องไม่ล้นจอ
- แยกอัปเดต package ที่อยู่ใน browser bundle จาก dev-only แม้ package.json ใส่ไว้ devDependencies; เก็บ reachability/exceptions พร้อมเจ้าของและเหตุผลถ้ายังไม่มี compatible fix

## 3. ตรวจรับ candidate

**เจ้าของ: QA และ Reviewer ที่ไม่ได้เขียนส่วนที่ตรวจ**

| AC | สถานการณ์ | เกณฑ์ผ่าน |
|---|---|---|
| R-01 ประวัติ | import เด็กเดิมข้ามปี, ย้ายคนมีคะแนน/เช็คชื่อ, reimport ห้องเดิม, request แข่งกับการบันทึก | blocked operation ไม่เปลี่ยนข้อมูล; reimport ห้องเดิมสำเร็จ; รายงาน/Excel เก่าเหมือนเดิมทุกแถว |
| R-02 Restore domain | backup valid/legacy, scoreเกินเต็ม/ติดลบ/non-finite, illegal status, references/term/numberซ้ำ, uploadขาด/commitซ้ำ/ตัดเน็ต | valid คืนครบ; invalid ปฏิเสธก่อน swap; ข้อมูลเดิมไม่เปลี่ยน; ไม่กล่าวว่าสำเร็จเมื่อไม่ทราบผล |
| R-03 Multi-device restore | settings/catalog/score/attendance ที่ค้างจาก epoch เก่า, restoreระหว่าง DB read/write | ไม่มี stale write เข้าข้อมูลใหม่; queue/draftไปตรวจสอบ; ไม่มี audit สำเร็จลวง |
| R-04 Concurrency | setup 2 คำขอ, terms create/update/start ชนกัน | teacher=1; คู่ year/term ไม่ซ้ำ; คำขอผู้แพ้ได้ error ที่ UI เข้าใจ |
| R-05 Network | offline, connected-but-stalled, authตอบแต่bootstrapค้าง, commitสำเร็จแต่ACKหาย, 401/409/423/429/5xx | ภายใน deadline เข้าสถานะที่จัดการได้; retryไม่ซ้ำ/ไม่ทิ้งข้อมูล; spinnerไม่รอไม่มีกำหนด |
| R-06 First use | setupครบ, ข้าม onboarding, ไม่มีเทอม/ห้อง/นักเรียน/งาน, เริ่มเทอมแรก, ปิดทุกห้อง | ทุกหน้ามี empty CTA และสร้างข้อมูลต่อได้ ไม่มี dead end |
| R-07 Classroom | 3 โหมดสแกน, QRซ้ำ/ผิดห้อง/ยกเลิก/ไม่รู้จัก, Enterคะแนน, ซ่อนคะแนน, bulk/undo/full-score change, attendanceรายวัน/คาบ | ข้อมูล/เสียง/สถานะตรงกัน, ไม่มีคะแนนเกินเต็ม, ไม่มีการนับซ้ำหรือACKเก่าลบรายการใหม่ |
| R-08 Reports | รายเดือน/เทอม/ปีเก่า, moved/inactive, daily/period, Excel 4 sheets, พิมพ์/ชื่อไทยยาว | totals/counts/rowsตรงกับข้อมูลต้นฉบับและหน้าจอ |
| R-09 Accessibility | keyboard-only, focus dialog, VoiceOverบน iPad, ชื่อ control, light/dark, zoom200% | ทำ flow หลักจบได้; ไม่มี focusหลุด modal หรือ controlที่ไม่มีชื่อ |
| R-10 Build/security | typecheck/test/build/preflight/audit, unauth/CSRF/invalid inputs, dependency paths | suiteเดิม+ใหม่ผ่าน; ไม่มี reachable high/critical ที่ยังไม่แก้; unresolved tooling advisory มี mitigation ที่ตรวจได้ |

ใช้ Vitest configuration เดิม; รันครบชุดหลังรวม code/dependencies และรันเฉพาะ suite ที่ได้รับผลหากแก้หลังรอบนั้น. Browser scripts เดิมตรวจ offline/onboarding/camera/rehearsal บน fixture ของ **candidate เดียวกัน** และเก็บผลไว้ job ใหม่ ไม่เขียนทับผล audit เก่า

### Matrix อุปกรณ์ที่ต้องมีหลักฐาน

| อุปกรณ์ | ขอบเขต |
|---|---|
| iPad ของครู: Safari + เพิ่มลง Home Screen | portrait/landscape, camera, soft keyboard/external keyboardที่ใช้จริง, sleep/background/close-reopen, offline queue, update SW, file download/restore |
| คอมพิวเตอร์ของครู: Chrome/Edge ที่ใช้จริง | 1366×768ขึ้นไป, keyboard, Excel/print, เครื่องยิง QR ถ้าใช้งานจริง |
| มือถือหลักของครู | camera permission denied/allowed, orientation, QRจริง, offline-reopen; ถ้าใช้ทั้ง iOS/Android ให้ตรวจทั้งสอง |
| Browser responsive regression | 390×844, 768×1024, 1024×768 และ 1366×768; light/dark; ไม่ถือ emulation เป็นผลแทนอุปกรณ์จริง |

เก็บรุ่นเครื่อง OS/browser, build hash, วันที่, ผู้ตรวจ และผลต่อ scenario. ไม่ใส่ข้อมูลนักเรียนจริงลง screenshot หรือ logs ที่แจกภายนอก

## 4. ทดลองหนึ่งห้องและส่งมอบ

### Gate A — พร้อมให้ครูเริ่มทดลอง

- T01–T08 และ R-01–R-10 ผ่านตามขอบเขต; ไม่มี High เรื่องข้อมูลค้าง; independent review ของ auth/restore/data guards เสร็จ
- ครู/ผู้ดูแลยืนยันห้องทดลอง บัญชีครู อุปกรณ์ และวิธีสำรอง; เก็บ recovery secrets แยกจาก backup ในที่ที่ผู้ดูแลรับผิดชอบ
- ซ้อมคืน snapshot บน environment แยกและเทียบทุกตาราง/คะแนน/เช็คชื่อ; ใช้ DB และ build เดียวกับ manifest ที่จะนำไปทดลอง
- Candidate ผ่าน dry-run deployment checks และมี rollback/roll-forward instructions; การ deploy จริงเป็นขั้นถัดไปที่ต้องมี target และ authorization ชัดเจน ไม่รวมในงาน audit นี้

### Gate B — วันทดลองหนึ่งห้อง

ใช้ `docs/TRIAL.md` และ `docs/trial/TRIAL-LOG.md` เดิมเป็นฐาน: งาน A ให้เต็ม, งาน B กรอกคะแนน, เช็คชื่อ และทำกระดาษคู่หนึ่งวัน

ทดสอบเน็ตหลุด 5 นาที, ปิด/เปิดแอปขณะออฟไลน์, ใช้สองเครื่องบันทึกคั่นกัน, บัตรผิด/ซ้ำ และแก้/undo โดยใช้ข้อมูลทดสอบที่แยกจากคะแนนจริงเมื่อทดสอบ destructive action

ก่อนกลับต้อง reconcile คะแนนและเช็คชื่อ **100%**; ไม่มีรายการแอปบอกสำเร็จแต่หาย, ไม่มีคิว/failed ที่ไม่ทราบผลบนเครื่องใด; ครูทำ flow สร้างงาน→รับงาน→เช็คชื่อ→ดูรายงาน→สำรองได้เอง

ถ้าพบข้อมูลหาย/ซ้ำ/ไม่ตรง ให้หยุดขยาย เก็บ backup+steps ที่ลดข้อมูลส่วนบุคคล แก้และทดสอบซ้ำ; ห้ามแก้ expected ในกระดาษเพื่อทำให้ผลแอปผ่าน

### Gate C — ส่งมอบและดูแล

- คู่มือครูฉบับสั้น: เริ่มวันสอน, 3 โหมดสแกน, เช็คชื่อ, ดูคิว, จบวัน/สำรอง, เมื่อเน็ตหลุดหรือเปลี่ยนเครื่อง, ติดต่อผู้ดูแล
- คู่มือผู้ดูแล: config/schema/version manifest, install/update, backup/restore drill, resetบัญชี, rollback/roll-forward, diagnosis 401/409/423/503 และตรวจ quota โดยไม่แสดง secrets
- ชุดหลักฐาน: test report, UAT matrix, known limitations, reconciliation, เวอร์ชันที่ส่งมอบ, owner ของบัญชีและสถานที่เก็บ backup
- สำรองหลังจบวันทดลองและก่อนอัปเดต; ทบทวนรอบสำรองปกติตามปริมาณงานของครู ไม่พึ่งเพียงสำเนาในเครื่องเดียว
- หลังผ่านหนึ่งห้อง จึงขยายสองห้องโดยทำกระดาษคู่หนึ่งสัปดาห์ตาม TRIAL.md แล้วพิจารณาทุกห้องจากหลักฐาน
- วันทดลองผู้ดูแลตรวจ health, ข้อผิดพลาด auth/sync/restore, failed queue และ Cloudflare quota; ไม่ log payload นักเรียน ไม่ตั้งระบบแจ้งเตือนอัตโนมัติหรือส่งข้อความโดยไม่มีขอบเขตเพิ่ม

## 5. งานหลัง pilot ที่แยกไว้

1. **วงจร ป.6 รายปี:** ตามที่ผู้ใช้ยืนยัน24ต.ค. ครูส่วนใหญ่ไม่สอนเด็กรุ่นเดิมต่อหลังเลื่อนชั้น ให้เน้นตรวจจบปี→เก็บข้อมูลรุ่นเก่า→เปิดห้องว่างปีใหม่→นำเข้าเด็กรุ่นใหม่→ดูรายงานเก่าได้ครบ ไม่ต้องพัฒนา enrollment history หรือเลื่อนชั้นเป็นเงื่อนไขส่งมอบ เก็บ enrollment เป็นงานทางเลือกเมื่อมีความต้องการเด็กซ้ำชั้น/สอนต่อ/ย้ายห้องพร้อมประวัติจริง โดย guard จาก T01 ยังคงอยู่
2. **Performance:** วัดจริงบน iPad/มือถือก่อนปรับ chunk/Excel/precache; รักษา offline-first และไม่ลด correctness เพื่อให้ benchmark ดี
3. **UX จากครู:** ใช้ข้อความ/จุดที่ลังเลใน trial log จัดลำดับก่อนเพิ่มฟีเจอร์ใหม่

แผนนี้ยังไม่อนุมัติ rollout หรือการแก้ข้อมูลจริง งานถัดไปที่เริ่มได้เมื่อสั่งพัฒนาคือ regression tests และ T01–T04 บนทรัพยากรทดสอบแยก

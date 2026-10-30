# Dev notes: Full-Stack · งาน `2026-10-30-m1-05-metrics-single-source`

## T-01 ตัวเลขชุดเดียวทุกหน้า + คะแนนครึ่งนิยามเดียว — 2026-10-30

- ทำอะไร:
  - `shared/metrics.ts` เพิ่ม `roundPercent` (ปัดที่เดียว), `percentOf` (null เมื่อหารด้วย 0), `assignmentRate`, `countWorkStates`, `scorePercent`, `classSubmitRate` (รวมทุกคน), `attendancePercent` (null เมื่อไม่มีการเช็ค), `averageAttendancePercent` (คงพฤติกรรมเดิมของหน้านักเรียน) · ฟังก์ชันเดิมให้ผลเหมือนเดิม (เปลี่ยนแค่ให้เรียก helper)
  - `shared/time.ts` ใหม่: `bkkToday`/`bkkParts` ย้ายมาจาก `worker/lib/time.ts` (ฝั่ง worker re-export โค้ดเดียวกัน)
  - pages: Home (อัตราส่งต่องานหักยกเว้น + % มาเรียน), Gradebook (หัวคอลัมน์ + แถบเครื่องมือ), Reports, Students, Attendance, Random, Onboarding, Scan ใช้ helper กลางและ `bkkToday` กลาง · `src/lib/report.ts` ใช้ `classSubmitRate`/`scorePercent`/`attendancePercent`
  - หน้าสแกน: legend = ส่งแล้ว·ส่งช้า·รอตรวจ·ยังไม่ส่ง·ยกเว้น (แสดงเฉพาะ > 0) สีเดียวกับช่อง (token เดิมจาก scan.css; ช่อง "ยกเว้น" ไม่มีสีเฉพาะ จึงใช้สีช่องพื้นฐาน `--surface-1`/`--border`) · วงแหวน = ส่ง ÷ (ทั้งห้อง − ยกเว้น) ทั้งระหว่างสแกนและหน้าจบรอบ · หน้าจบรอบไม่นับเด็กยกเว้นใน "ยังไม่ส่ง"
  - `opSchema.score` และ restore `halfStep` = `z.number().refine(isHalfStep)` · SQL guard ใน restore คงเดิม
  - README หัวข้อ "ตัวเลขในระบบคิดอย่างไร"
- เทสต์ที่เพิ่ม: `test/unit/metrics.test.ts` (ส่วน M1-05), `test/unit/m1-05-fixture.ts`, `test/unit/m1-05-screens.test.tsx`, `test/unit/m1-05-scan.test.tsx`, `test/api/m1-05-metrics.test.ts`
- คำสั่งที่รัน → ผล:
  - ก่อนแก้: 4 ไฟล์ใหม่ล้ม 8 tests + metrics.test import ไม่ได้ → `evidence/before-fix.txt` (Q-90)
  - `npm run typecheck` exit 0 · `npm test` 68 ไฟล์ / 804 ผ่าน (baseline 65/772) → `evidence/regression.txt` (Q-91)
  - mutation 4 จุด ล้มทุกจุด คืนไฟล์ cmp ตรง → `evidence/mutation.txt` (Q-92)
  - grep AC-07 → `evidence/grep-ac07.txt` (Q-93) ไม่เหลือสูตร % อัตราส่ง/มาเรียน/คะแนนใน src/pages; ที่เหลือคือ จำนวนวัน, ความสูงกราฟ, ค่าเฉลี่ยคะแนนดิบของคอลัมน์ (Gradebook:451 ทศนิยม 1 ตำแหน่ง ไม่ใช่ %), ปุ่มคะแนนลัด, `suggestedTerm` ใน Onboarding (เดือน ไม่ใช่ "วันนี้")
- AC ที่ครอบคลุม: AC-01..AC-08
- mock/ชั่วคราวที่ต้องถอดตอนเชื่อมระบบ: ไม่มี
- ข้อจำกัด/สิ่งที่ยังไม่ทำ: สูตร "วันนี้" ซ้ำนอกขอบเขตที่เขียนได้: `src/components/AssignmentModal.tsx:10`, `StartTermModal.tsx:13`, `src/lib/dates.ts`, `src/lib/backup.ts`, `deviceCheck.ts`
- ถึง QA: หน้าแรกและหัวคอลัมน์สมุดคะแนนเมื่อมีเด็กยกเว้น (ตัวเลขเปลี่ยน 60% → 75% ในชุด AC-01) · legend หน้าสแกนก่อน/หลังกำหนดส่ง · ถังคะแนนหน้ารายงานที่ขอบ 59.5–59.99%

## T-01 Verify รอบ 1 (R-01..R-03, B-01, B-03..B-05) — 2026-10-30

- ทำอะไร: `percentOf` คูณก่อนหาร `(part*100)/whole` (AC-10) — ใช้กับ assignmentProgress/studentSummary/attendanceRate และค่าเฉลี่ยทั้งหมด · เพิ่ม `assignmentFraction` = "ส่ง/(ทั้งห้อง − ยกเว้น) · ยกเว้น n" ใช้ที่ Home, Reports, Gradebook (แถวเฉลี่ย + การ์ดมือถือ), Excel ชีตภาพรวมห้อง (AC-09) · `AssignmentReport.excused` ใหม่ใน report.ts · StudentDrawer และ Excel % มา ใช้ `scorePercent`/`attendancePercent` · Excel ชีตคะแนน ยกเว้น = "ยกเว้น" (AC-11) · การ์ดรายงาน hint "คะแนนสะสม · ค้างส่งนับ 0" · `studentSummary().awaiting` นับจริง (B-05)
- เทสต์ที่เพิ่ม: `test/unit/m1-05-verify1.test.tsx` (AC-09/10/11 + Excel + Home/Reports)
- ผล: typecheck 0 · npm test 71 ไฟล์ / 834: ผ่าน 832 + 2 ข้อของ QA `it.fails` (B-01, B-05) ล้มเพราะผ่านแล้ว → Q-94 · mutation 2/2 → Q-95 · grep ขยาย → Q-96

## T-01 Verify รอบ 2 (R-05) — 2026-10-30

- `assignmentProgress.average` = `percentOf(Σscore ดิบ, scored × full)` หารครั้งเดียว (เต็ม 3: 2.5, 2.5, 3, 2.5 → 88 เดิม 87) · ไม่แตะ averageAttendancePercent (R-06)
- เทสต์: R-05 ใน `test/unit/m1-05-verify1.test.tsx` (unit + Excel ชีตภาพรวมห้อง) · ล้มก่อนแก้ → Q-97 · ชุดเต็ม 71/839 ผ่าน → Q-94 · mutation M-6 → Q-95

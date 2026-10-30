# Usage — 2026-10-30-m1-08-audit-atomic

สร้างโดย usage-ledger.mjs · 2026-10-30T10:28:53.773Z · ตั้งแต่ 2026-10-30T09:00:00Z · ราคา ณ 2026-10-28 · ค่าตั้งต้นที่ผู้เขียนประมาณเอง ยังไม่ได้ตรวจกับตารางราคาจริง — แก้ตัวเลขใน PRICES ให้ตรงราคาปัจจุบันก่อนใช้ตัดสินใจ

ชุด A–D มาจาก transcript (ตัดซ้ำตาม message id) · **E (โควตา) จดด้วยมือ** · ห้ามรวมหรือเทียบข้ามชุด

## A · session หลัก (PM)

| บทบาท | โมเดล | effort | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| PM | — | ตาม session | 0 | 0 | 0 | 0 | 0 | 0 | n/a |

## B · subagent

| บทบาท | โมเดล | effort | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| team-code-reviewer | claude-opus-5-5 | medium | 20 | 40 | 19,126 | 1,040,651 | 82,335 | 0 | 92.7% |
| team-fullstack-dev | claude-opus-5-5 | medium | 68 | 138 | 60,805 | 9,776,025 | 206,483 | 0 | 97.9% |
| team-qa-tester | claude-sonnet-5-5 | medium | 8 | 16 | 11,819 | 318,987 | 57,998 | 0 | 84.6% |
| team-security-reviewer | claude-opus-5-5 | medium | 19 | 38 | 25,446 | 901,505 | 75,258 | 0 | 92.3% |
| team-ux-ui-designer | claude-sonnet-5-5 | medium | 28 | 58 | 53,122 | 6,249,385 | 256,392 | 0 | 96.1% |

## C · ประเภท token ต่อโมเดล

| โมเดล | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---:|---:|---:|---:|---:|---:|---:|
| claude-opus-5-5 | 107 | 216 | 105,377 | 11,718,181 | 364,076 | 0 | 97.0% |
| claude-sonnet-5-5 | 36 | 74 | 64,941 | 6,568,372 | 314,390 | 0 | 95.4% |

## D · ค่าประมาณตามราคา API (ประมาณการ ไม่ใช่บิลจริง)

| โมเดล | USD |
|---|---:|
| claude-opus-5-5 | 10.77 |
| claude-sonnet-5-5 | 4.12 |

<!-- manual:start -->
## โควตา subscription (จดด้วยมือ — คงไว้เมื่อรันซ้ำ)

| | ก่อนงาน | หลังงาน |
|---|---|---|
| รอบ 5 ชั่วโมง (%) | | |
| รายสัปดาห์ (%) | | |
<!-- manual:end -->

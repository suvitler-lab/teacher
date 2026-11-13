# Usage — 2026-11-12-timetable

สร้างโดย usage-ledger.mjs · 2026-11-13T13:26:08.714Z · ตั้งแต่ 2026-11-12T00:00:00Z · ราคา ณ 2026-10-28 · ค่าตั้งต้นที่ผู้เขียนประมาณเอง ยังไม่ได้ตรวจกับตารางราคาจริง — แก้ตัวเลขใน PRICES ให้ตรงราคาปัจจุบันก่อนใช้ตัดสินใจ

ชุด A–D มาจาก transcript (ตัดซ้ำตาม message id) · **E (โควตา) จดด้วยมือ** · ห้ามรวมหรือเทียบข้ามชุด

## A · session หลัก (PM)

| บทบาท | โมเดล | effort | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| PM | claude-opus-5-5, claude-fable-5-2, claude-sonnet-5-5 | ตาม session | 406 | 1,064 | 340,092 | 139,086,844 | 0 | 1,424,472 | 99.0% |

## B · subagent

| บทบาท | โมเดล | effort | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| team-backend-dev | claude-sonnet-5-5 | medium | 112 | 226 | 119,937 | 7,517,436 | 517,816 | 0 | 93.6% |
| team-code-reviewer | claude-opus-5-5 | high | 108 | 220 | 93,779 | 14,337,643 | 420,430 | 0 | 97.1% |
| team-code-reviewer | claude-sonnet-5-5 | medium | 20 | 42 | 11,913 | 730,311 | 122,760 | 0 | 85.6% |
| team-database-specialist | claude-sonnet-5-5 | medium | 86 | 172 | 106,641 | 9,501,985 | 595,158 | 0 | 94.1% |
| team-frontend-dev | claude-opus-5-5 | medium | 284 | 600 | 230,785 | 29,217,443 | 936,723 | 0 | 96.9% |
| team-frontend-dev | claude-sonnet-5-5 | medium | 742 | 1,554 | 633,403 | 93,660,350 | 2,399,677 | 0 | 97.5% |
| team-fullstack-dev | claude-sonnet-5-5 | medium | 10 | 20 | 5,854 | 458,624 | 60,742 | 0 | 88.3% |
| team-qa-tester | claude-sonnet-5-5 | medium | 1097 | 2,248 | 641,159 | 77,632,701 | 2,535,522 | 0 | 96.8% |
| team-security-reviewer | claude-opus-5-5 | medium | 41 | 82 | 25,558 | 2,574,298 | 102,485 | 0 | 96.2% |
| team-system-analyst | claude-opus-5-5 | medium | 70 | 140 | 173,411 | 5,880,243 | 428,968 | 0 | 93.2% |
| team-tech-lead | claude-opus-5-5 | high | 63 | 126 | 105,499 | 10,644,905 | 300,594 | 0 | 97.3% |
| team-tech-lead | claude-opus-5-5 | medium | 39 | 78 | 40,685 | 3,391,606 | 135,979 | 0 | 96.1% |
| team-tech-lead | claude-sonnet-5-5 | low | 8 | 16 | 3,193 | 169,841 | 27,091 | 0 | 86.2% |
| team-ux-ui-designer | claude-sonnet-5-5 | medium | 10 | 22 | 37,413 | 347,865 | 118,447 | 0 | 74.6% |
| team-web-designer | claude-opus-5-5 | high | 45 | 90 | 174,002 | 6,900,534 | 715,654 | 0 | 90.6% |
| team-web-designer | claude-opus-5-5 | medium | 66 | 132 | 163,537 | 6,985,221 | 494,940 | 0 | 93.4% |

## C · ประเภท token ต่อโมเดล

| โมเดล | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---:|---:|---:|---:|---:|---:|---:|
| claude-opus-5-5 | 753 | 1,550 | 1,047,330 | 85,556,292 | 3,535,773 | 138,914 | 95.9% |
| claude-sonnet-5-5 | 2423 | 5,210 | 1,822,208 | 316,597,521 | 6,377,213 | 1,085,051 | 97.7% |
| claude-fable-5-2 | 31 | 72 | 37,323 | 6,884,037 | 0 | 200,507 | 97.2% |

## D · ค่าประมาณตามราคา API (ประมาณการ ไม่ใช่บิลจริง)

| โมเดล | USD |
|---|---:|
| claude-opus-5-5 | 92.46 |
| claude-sonnet-5-5 | 152.75 |
| claude-fable-5-2 | ประเมินไม่ได้ |

## F · context ของ PM

| ล่าสุด (token) | สูงสุด | Agent | SendMessage | Read |
|---:|---:|---:|---:|---:|
| 650,586 | 650,586 | 39 | 18 | 0 |

context ≥ 120k — ควรปิดงานแล้วเปิด session ใหม่

<!-- manual:start -->
## โควตา subscription (จดด้วยมือ — คงไว้เมื่อรันซ้ำ)

| | ก่อนงาน | หลังงาน |
|---|---|---|
| รอบ 5 ชั่วโมง (%) | | |
| รายสัปดาห์ (%) | | |
<!-- manual:end -->

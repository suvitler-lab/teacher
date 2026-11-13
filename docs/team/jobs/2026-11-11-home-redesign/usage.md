# Usage — 2026-11-11-home-redesign

สร้างโดย usage-ledger.mjs · 2026-11-13T01:49:49.323Z · ราคา ณ 2026-10-28 · ค่าตั้งต้นที่ผู้เขียนประมาณเอง ยังไม่ได้ตรวจกับตารางราคาจริง — แก้ตัวเลขใน PRICES ให้ตรงราคาปัจจุบันก่อนใช้ตัดสินใจ

ชุด A–D มาจาก transcript (ตัดซ้ำตาม message id) · **E (โควตา) จดด้วยมือ** · ห้ามรวมหรือเทียบข้ามชุด

## A · session หลัก (PM)

| บทบาท | โมเดล | effort | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| PM | claude-opus-5-5, claude-sonnet-5-5, claude-fable-5-2 | ตาม session | 465 | 1,178 | 597,862 | 192,683,146 | 0 | 2,772,299 | 98.6% |

## B · subagent

| บทบาท | โมเดล | effort | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| team-code-reviewer | claude-opus-5-5 | medium | 932 | 1,872 | 828,666 | 85,833,024 | 3,293,184 | 0 | 96.3% |
| team-code-reviewer | claude-sonnet-5-5 | medium | 64 | 128 | 35,625 | 3,141,449 | 184,653 | 0 | 94.4% |
| team-frontend-dev | claude-sonnet-5-5 | medium | 2217 | 4,680 | 2,171,180 | 396,123,667 | 12,510,058 | 0 | 96.9% |
| team-qa-tester | claude-sonnet-5-5 | medium | 747 | 1,530 | 589,125 | 89,725,960 | 2,228,536 | 0 | 97.6% |
| team-security-reviewer | claude-opus-5-5 | medium | 60 | 122 | 38,221 | 5,629,921 | 153,369 | 0 | 97.3% |
| team-security-reviewer | claude-sonnet-5-5 | low | 14 | 28 | 4,630 | 266,197 | 55,571 | 0 | 82.7% |
| team-security-reviewer | claude-sonnet-5-5 | medium | 27 | 56 | 16,286 | 825,185 | 138,399 | 0 | 85.6% |
| team-system-analyst | claude-sonnet-5-5 | medium | 38 | 76 | 65,559 | 1,840,327 | 299,575 | 0 | 86.0% |

## C · ประเภท token ต่อโมเดล

| โมเดล | ข้อความ | uncached in | out | cache read | write 5m | write 1h | hit |
|---|---:|---:|---:|---:|---:|---:|---:|
| claude-opus-5-5 | 1025 | 2,068 | 893,555 | 95,882,513 | 3,446,553 | 107,248 | 96.4% |
| claude-sonnet-5-5 | 3538 | 7,600 | 3,452,627 | 680,138,252 | 15,416,792 | 2,511,128 | 97.4% |
| claude-fable-5-2 | 1 | 2 | 972 | 48,111 | 0 | 153,923 | 23.8% |

## D · ค่าประมาณตามราคา API (ประมาณการ ไม่ใช่บิลจริง)

| โมเดล | USD |
|---|---:|
| claude-opus-5-5 | 92.90 |
| claude-sonnet-5-5 | 328.73 |
| claude-fable-5-2 | ประเมินไม่ได้ |

## F · context ของ PM

| ล่าสุด (token) | สูงสุด | Agent | SendMessage | Read |
|---:|---:|---:|---:|---:|
| 318,343 | 963,302 | 18 | 11 | 3 |

context ≥ 120k — ควรปิดงานแล้วเปิด session ใหม่

<!-- manual:start -->
## โควตา subscription (จดด้วยมือ — คงไว้เมื่อรันซ้ำ)

| | ก่อนงาน | หลังงาน |
|---|---|---|
| รอบ 5 ชั่วโมง (%) | | |
| รายสัปดาห์ (%) | | |
<!-- manual:end -->

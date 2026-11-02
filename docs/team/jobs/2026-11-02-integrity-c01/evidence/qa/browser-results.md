# Browser results (QA, 2026-11-02) — fixture only, 127.0.0.1, iPad portrait 820x1180 emulation

Tools: `c01-control.cjs --port 4120` (current dist + current worker) and `--port 4130 --assets <main 18759a2 build>` (old app + current worker).
"Other device" = in-process API call with its own login (device `qa-other-pc`, method grid / bulk). Cell = asg_gb_13 (ใบงาน 6 สมการ, full 10), ป.6/1.

| # | Scenario | Screen (scan tab, stale) | DB after (9 fields / audit) | Result |
|---|---|---|---|---|
| M1 | ฉ1 full mode: void 4 → start round → other sets 4=7 → scan 4 | card "ส่งไปแล้ว — ไม่บันทึกซ้ำ 7/10", cell late, recent 0, no ส่งไม่สำเร็จ | 7 grid qa-other-pc, unchanged; audit unchanged | PASS |
| M2 | ฉ2 later mode, other sets 8 | card 8/10, cell late (not รอตรวจ) | 8 unchanged; audit unchanged | PASS |
| M3 | ฉ3 type mode, other sets 7 | pad open ~100 ms then closed, card 7/10 | 7 unchanged | PASS |
| M4 | ฉ4 all-submitted (4 = submitted null bulk) → scan 4 full mode | card "ส่งไปแล้ว — ไม่บันทึกซ้ำ" (no score), cell awaiting | null bulk, submitted_at/late of bulk unchanged | PASS |
| M5 | all-submitted + full-score (1 = 10 bulk) → scan 1 full mode (stale: missing) | card 10/10 ส่งไปแล้ว | 10 bulk unchanged, audit 3 | PASS |
| M6 | void 2 → later round → all-submitted + full-score → scan 2 later mode | card 10/10 ส่งไปแล้ว | 10 bulk (not null) | PASS |
| O1 | type mode: other sets 7 → network cut → scan 4 (queued) → type 6 + save (queued, 2 ops) → reload offline → network back, reopen | after reopen: queue 0, card 7/10 ส่งไปแล้ว, no ส่งไม่สำเร็จ | 7 grid unchanged, audit unchanged | PASS (reload offline gave chrome-error: the Browser pane registers no service worker — env limit, offline reload itself is covered by scripts/offline-e2e.cjs) |
| O2 | full mode: network cut → other sets 7 → scan 4 (local card 10/10, ค้าง 1) → go to หน้าหลัก → network back | home: ค้าง 1 → ออนไลน์ (0), no ส่งไม่สำเร็จ, no card/sound on home | 7 grid unchanged | PASS (data, queue) |
| O2b | …then return to สแกน | card still "เลขที่ 4 · ส่งแล้ว 10/10", recent "เลขที่ 4 10/10", cell 4 late (correct) | 7 | FAIL (display) → B-01 |
| R1 | full mode scan 9 (void before) | "ส่งแล้ว 10/10" | submitted 10 manual, audit update | PASS |
| R2 | type mode scan 10 → pad → 8 → save | "บันทึกคะแนนแล้ว 8/10" | submitted 8, audit update,update (BR-02) | PASS |
| R3 | tap submitted cell 9 (cancel) | "ยกเลิกการส่งแล้ว", cell missing | void, audit void | PASS |
| R4 | bulk all-submitted / full-score (API, as the gradebook button) | — | ok, changed 28 / 43 | PASS (API; gradebook UI buttons NOT RUN in browser) |
| T1 | OLD app (main 18759a2) stale full mode: other sets 7 → scan 4 | red card "already_submitted — ยังไม่ได้บันทึกบนระบบ (ดูที่ ส่งไม่สำเร็จ)", ส่งไม่สำเร็จ 1 (reason raw `already_submitted · คะแนน 10`), recent 10/10, no page error | 7 unchanged | as accepted Q3 (data correct) |
| T2 | old app: ลองใหม่ → still 1 failed; ทิ้ง → list empty | — | 7 unchanged, audit unchanged | PASS |

## Round 2 (after B-01 fix, fresh `npm run build`, same scripts) — 2026-11-02

"Other device" ops in this round were sent from the page itself with scanSessionId `gb-qa-other`, method grid / bulk (same API and server judgement as the gradebook); DB read via GET /api/assignments/asg_gb_13/submissions.

| # | Result screen | DB | Result |
|---|---|---|---|
| B-01 retest (O2 + return to scan) | home: ค้าง 1 → ออนไลน์, no card, no ส่งไม่สำเร็จ · back on scan: no card, recent "รอบนี้ 0 คน ยังไม่มีการสแกน", cell 4 late | 7 grid | PASS (fixed) |
| M1 full | ส่งไปแล้ว — ไม่บันทึกซ้ำ 7/10, recent 0, no failed | submitted 7 grid | PASS |
| M2 later | 8/10, cell late | submitted 8 grid | PASS |
| M3 type | 7/10, pad closed | submitted 7 grid | PASS |
| M4 all-submitted | ส่งไปแล้ว (no score), cell awaiting | submitted null bulk | PASS |
| M6 all-submitted + full-score, later mode | 10/10 ส่งไปแล้ว | submitted 10 bulk | PASS |
| R1 full scan 9 | ส่งแล้ว 10/10 | submitted 10 manual | PASS |
| R2 type scan 10 + 8 | บันทึกคะแนนแล้ว 8/10 | submitted 8 manual | PASS |
| R3 tap 9 (cancel) | ยกเลิกการส่งแล้ว | void | PASS |
| O1 type mode offline: other 7 → cut → scan 4 + type 6 → restore while ON scan page | card ส่งไปแล้ว 7/10, both recent rows removed (รอบนี้ 0 คน), ค้าง 2 → 0, no failed | submitted 7 grid | PASS |
| T1/T2 old app (main 18759a2 rebuilt) | red card raw already_submitted, ส่งไม่สำเร็จ 1, recent 10/10, no page error · ลองใหม่ → still 1 · ทิ้ง → cleared | 7 grid unchanged | as Q3 |
| Shots recheck 820x1180 (5 pages, `shots.cjs --devices 820x1180 --out evidence/qa/shots-recheck`) | identical to evidence/shots/after; mobile run timed out on ready (same as FE note: run per device) | — | PASS (iPad portrait) |

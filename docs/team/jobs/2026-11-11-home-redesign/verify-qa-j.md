# Verify QA-J (T-89) - close AC trace gaps
status: done (partial: 34 AC left) · snapshot tree:2df7c74d2598 · frozen build = scratchpad dist-i (same as QA-I) · scripts + results in evidence/verify-j/ · ports 4260-4265 closed

Start: trace-check --stage close = 77 AC without PASS evidence. Now: 34 (33 without evidence + AC-104 which is a recorded FAIL, owner-accepted).

## recorded (Q-8101..Q-8118)
| evidence | status | AC | basis |
|---|---|---|---|
| Q-8101 | PASS | 03 04 06 | unit: hr-theme-appearance 26, hr-sweep-login 2, hr-appearance-save 11, hr-appearance-section 7 |
| Q-8102 | PASS | 07 15 252 | unit: hr-homecore-page/logic, hr-layout-a/b/c, hr-theme-home-prefs, home-ui |
| Q-8103 | PASS | 45 47 49 | unit: hr-menu-nav 11, home-ui, hr-theme-tokens 28 |
| Q-8104 | PASS | 46 | CDP measure: rail no scroll, 49px desk / 57px iPad, max font ok (rail-result.json) |
| Q-8105 | PASS | 85 86 87 89 90 | unit: hr-att-redesign, hr-attx-t43, attendance-*  |
| Q-8106 | PASS | 98 | unit + real DOM (m-dom) |
| Q-8107 | PASS | 108 111 114 116 | unit: hr-rndclass-link, random-page, hr-random-*, random-model |
| Q-8108 | PASS | 132 138 140 143 144 | unit: gradebook-round3/3b, hr-gb2/3/4 |
| Q-8109 | PASS | 158 165 172 | unit: hr-rp-t49/t50, reports-round3, hr-theme-hide |
| Q-8110 | PASS | 208 209 | unit hr-sg-settings-shell + T-85 hOverflow/tap data |
| Q-8111 | PASS | 216 217 219 | unit: hr-appearance-save, hr-sg*, hr-theme-appearance |
| Q-8112 | PASS | 225 232 236 237 246 | unit: hr-sg3, hr-sg2-*, hr-vfix-t70 |
| Q-8113 | PASS | 250 | T-85 m-rs measure (58.5% / 57.7%, rows 44/45, 10 / 11 visible) |
| Q-8114 | PASS | 254 | T-85 real-build xlsx offline + unit |
| Q-8115 | PASS (caveat) | 36 | CDP: no external host, fonts shown offline; default-skin first-paint fonts also requested on a brand-new device |
| Q-8116 | FAIL | 104 | CDP: 24/44 desk, 20/44 iPad landscape visible w/o scroll; iPad portrait cell 57px < 64. OWNER ACCEPTED (report.md) |
| Q-8117 | PASS | 10 | real DOM + home-logic (สร้างงาน destination not read from DOM) |
| Q-8118 | PASS | 253 | unit + real DOM (legacy-hidden todo/away not tested) |

Test runs (same snapshot): batch1 59 files / 784 pass; batch2 21 files / 276 pass (logs evidence/verify-j/vitest-batch1.log, -batch2.log). Full suite last = 207 files / 2461 pass (Q-8003).

## left without evidence (34) and why
| AC | why not recorded | suggestion |
|---|---|---|
| 41 42 43 | "proposed - API" cards (EP-09/10/11, separate jobs A/B/C); behaviour "if not built: nothing shown" - nothing to test. 43 depends on timetable job 2026-11-12 | PM: accept N/A in brief (deferred to jobs A/B/C) |
| 16 | no test or measure of `?term=` numbers vs today's attendance on home | write test or accept N/A |
| 83 | chips text verified in DOM, history bar unit-tested; `?class=` / remembered room not tested | small test |
| 97 100 | only unknown-code / no-number messages are tested; cancelled card / other class / duplicate number and cast "hold 1 s", "31 of 45" not tested | tests |
| 79 | scan a11y focus order / role=status once not tested as a whole (only summary focus) | tests |
| 106 124 153 174 205 247 | composite visual/a11y ACs: contrast part covered by hr-sweep-colors 23/23 + hr-theme-tokens + T-85 con-result (home/settings/scan 60 combos); motion <=250 ms, reduced-motion, flash, 200% zoom, tap 44 not measured on these pages. AC-247: T-85 shows desk settings has 3 controls at 40px (<44; D22 allows 40 on desktop - AC-247 text says 44 incl. desktop: conflict for PM) | PM decide: accept contrast-only + N/A rest, or order a measure |
| 109 | no test of the "นับจากเช็คชื่อรายวัน..." note / chip-state rules | test |
| 134 151 | no test of Thai failure reasons per cell (BR-35) / mobile gradebook | tests |
| 173 | focus order partly (DOM order tested); caption/aria-sort/zoom 200% not | tests |
| 180 181 182 192 193 198 199 201 202 | students page: only partial unit coverage (duplicate/missing numbers logic, QR menu items, past-year read-only note, hidden-name leak test); the alert text, moved tab, all-rooms search result, ST-S16/17 words, sticker banner, ST-S01-05 states, cards keys not asserted | tests or N/A |
| 212 218 220 221 224 | settings: scope chips only checked for scan section + device section; SE-S06 load-failed card, 401/term_changed banners, 24-room long text, period-time grid not tested | tests |
| 255 | (b) undo within 5 s tested; (a) skip after new round only removes the new draw - not tested | test |

Servers: all closed. Nothing in src/test/scripts modified.
